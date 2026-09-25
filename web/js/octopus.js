// Octopus Energy: Agile rates (public REST, no key needed once the tariff is known),
// account discovery and Home Mini telemetry (GraphQL, needs the API key).
// Query shapes follow BottlecapDave/HomeAssistant-OctopusEnergy (api_client/__init__.py).

import { fetchJSON, HttpError } from './util.js';
import { ratesFromOctopus } from './agile.js';
import { startOfDay } from './time.js';

export const API = 'https://api.octopus.energy';

const q = (s) => JSON.stringify(String(s)); // GraphQL string literal

/** Product code from a tariff code: E-1R-AGILE-24-10-01-C → AGILE-24-10-01. */
export function productFromTariff(tariff) {
  const parts = String(tariff).split('-');
  if (parts.length < 4) throw new Error(`Unrecognised tariff code "${tariff}"`);
  return parts.slice(2, -1).join('-');
}

export const regionFromTariff = (tariff) => String(tariff).split('-').pop();

function jwtExpiry(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Pick the active import meter point, tariff and Home Mini device from the account query result. */
export function parseAccount(data, now = Date.now()) {
  const agreements = data?.account?.electricityAgreements || [];
  for (const ag of agreements) {
    const mp = ag?.meterPoint;
    if (!mp || (mp.direction && mp.direction !== 'IMPORT')) continue;
    const active = (mp.agreements || []).find((a) => {
      const from = a.validFrom ? Date.parse(a.validFrom) : -Infinity;
      const to = a.validTo ? Date.parse(a.validTo) : Infinity;
      return from <= now && now < to && a.tariff?.tariffCode;
    });
    const meter = (mp.meters || []).find((m) => m.smartImportElectricityMeter?.deviceId) || (mp.meters || [])[0];
    if (!active) continue;
    return {
      tariff: active.tariff.tariffCode,
      product: active.tariff.productCode || productFromTariff(active.tariff.tariffCode),
      mpan: mp.mpan,
      serial: meter?.serialNumber || '',
      deviceId: meter?.smartImportElectricityMeter?.deviceId || '',
      at: now,
    };
  }
  throw new Error('No active electricity import tariff found on this account');
}

/**
 * Turn Home Mini telemetry (HALF_HOURLY grouping, local midnight → +1 day) into
 * { demandW, demandAt, todayKWh, slots: [{ start, kwh }] }.
 */
export function parseTelemetry(items) {
  const rows = (items || [])
    .map((r) => ({
      start: Date.parse(r.readAt),
      kwh: r.consumptionDelta != null ? Number(r.consumptionDelta) / 1000 : 0,
      demand: r.demand != null ? Number(r.demand) : null,
    }))
    .filter((r) => Number.isFinite(r.start))
    .sort((a, b) => a.start - b.start);
  const last = rows[rows.length - 1];
  return {
    demandW: last && Number.isFinite(last.demand) ? last.demand : null,
    demandAt: last ? last.start : null,
    todayKWh: rows.reduce((s, r) => s + (Number.isFinite(r.kwh) ? r.kwh : 0), 0),
    slots: rows.map(({ start, kwh }) => ({ start, kwh })),
  };
}

/** Cost so far today in pence: Σ kWh × price of the slot it was used in, + standing charge. */
export function costToday(slots, rates, standingChargeP = 0) {
  let p = standingChargeP || 0;
  for (const s of slots) {
    const r = rates.find((x) => x.start <= s.start && s.start < x.end);
    if (r) p += s.kwh * r.p;
  }
  return p;
}

export class Octopus {
  constructor(settings) {
    this.s = settings;
    this.token = null;
    this.tokenExp = 0;
    this.refreshToken = null;
  }

  get hasKey() { return !!(this.s.octopus.apiKey && this.s.octopus.account); }

  /** Octopus, or the optional proxy in front of it (docs/octopus.md). */
  get base() {
    const p = (this.s.octopus.proxy || '').trim().replace(/\/+$/, '');
    return /^https:\/\/[^/]+$/.test(p) ? p : API;
  }

  #url(pathOrUrl) {
    return pathOrUrl.startsWith(API) ? this.base + pathOrUrl.slice(API.length) : this.base + pathOrUrl;
  }

  tariff() {
    return this.s.octopus.tariff || this.s.octopus.discovered?.tariff || '';
  }

  async #obtainToken() {
    const input = this.refreshToken ? `refreshToken: ${q(this.refreshToken)}` : `APIKey: ${q(this.s.octopus.apiKey)}`;
    const body = await fetchJSON(this.#url('/v1/graphql/'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `mutation { obtainKrakenToken(input: { ${input} }) { token refreshToken refreshExpiresIn } }` }),
    });
    const t = body?.data?.obtainKrakenToken;
    if (!t?.token) {
      if (this.refreshToken) { this.refreshToken = null; return this.#obtainToken(); }
      throw new Error(body?.errors?.[0]?.message || 'Octopus rejected the API key');
    }
    this.token = t.token;
    this.refreshToken = t.refreshToken || null;
    this.tokenExp = jwtExpiry(t.token) || Date.now() + 50 * 60e3;
  }

  async graphql(query, { jwtPrefix = false } = {}) {
    if (!this.hasKey) throw new Error('Octopus account number and API key not set');
    if (!this.token || Date.now() > this.tokenExp - 2 * 60e3) await this.#obtainToken();
    const body = await fetchJSON(this.#url('/v1/graphql/'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: jwtPrefix ? `JWT ${this.token}` : this.token },
      body: JSON.stringify({ query }),
    });
    if (body?.errors?.length) {
      const err = body.errors[0];
      const code = err.extensions?.errorCode || '';
      if (/KT-CT-1124|KT-CT-1139|expired|signature/i.test(`${code} ${err.message}`)) this.token = null;
      if (/KT-CT-1199|too many requests/i.test(`${code} ${err.message}`)) throw new HttpError(429, 'Octopus rate limit reached');
      throw new Error(err.message || 'Octopus GraphQL error');
    }
    return body.data;
  }

  /** Find tariff, meter and Home Mini from the account. */
  async discover(now = Date.now()) {
    const data = await this.graphql(`query { account(accountNumber: ${q(this.s.octopus.account)}) {
      electricityAgreements(active: true) { meterPoint { mpan direction
        meters(includeInactive: false) { serialNumber smartImportElectricityMeter { deviceId } }
        agreements(includeInactive: true) { validFrom validTo tariff { ... on TariffType { productCode tariffCode } } } } } } }`);
    return parseAccount(data, now);
  }

  /** Unit rates from yesterday 00:00 to the day after tomorrow 00:00 (public endpoint, no key). */
  async rates(now = Date.now(), tz = this.s.tz) {
    const tariff = this.tariff();
    if (!tariff) throw new Error('Tariff not known yet (add your Octopus details in Settings)');
    const product = productFromTariff(tariff);
    const from = new Date(startOfDay(now, tz, -1)).toISOString();
    const to = new Date(startOfDay(now, tz, 2)).toISOString();
    let url = this.#url(`/v1/products/${encodeURIComponent(product)}/electricity-tariffs/${encodeURIComponent(tariff)}/standard-unit-rates/?period_from=${from}&period_to=${to}&page_size=250`);
    const results = [];
    for (let page = 0; url && page < 5; page++) {
      const body = await fetchJSON(url);
      results.push(...(body?.results || []));
      url = body?.next ? this.#url(body.next) : null;
    }
    return ratesFromOctopus(results);
  }

  /** Today's standing charge in pence (public endpoint). */
  async standingCharge(now = Date.now()) {
    const tariff = this.tariff();
    const product = productFromTariff(tariff);
    const body = await fetchJSON(this.#url(`/v1/products/${encodeURIComponent(product)}/electricity-tariffs/${encodeURIComponent(tariff)}/standing-charges/?page_size=10`));
    const active = (body?.results || []).find((r) => Date.parse(r.valid_from) <= now && (!r.valid_to || now < Date.parse(r.valid_to)));
    return active ? Number(active.value_inc_vat) : 0;
  }

  /** Home Mini: half-hourly telemetry for today; the last row carries the live demand. */
  async telemetryToday(now = Date.now(), tz = this.s.tz) {
    const deviceId = this.s.octopus.discovered?.deviceId;
    if (!deviceId) throw new Error('No Home Mini found on this account');
    const start = new Date(startOfDay(now, tz)).toISOString();
    const end = new Date(startOfDay(now, tz, 1)).toISOString();
    const data = await this.graphql(`query { smartMeterTelemetry(deviceId: ${q(deviceId)} grouping: HALF_HOURLY start: ${q(start)} end: ${q(end)}) {
      readAt consumption consumptionDelta demand export } }`, { jwtPrefix: true });
    return parseTelemetry(data?.smartMeterTelemetry);
  }
}
