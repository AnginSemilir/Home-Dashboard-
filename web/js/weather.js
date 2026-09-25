// Weather from Open-Meteo (free, no key, allows browser requests) and UK place lookup.

import { fetchJSON } from './util.js';

export async function fetchWeather({ lat, lon }, tz = 'Europe/London') {
  const p = new URLSearchParams({
    latitude: lat, longitude: lon, timezone: tz,
    current: 'temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,relative_humidity_2m,precipitation',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    forecast_days: '5', wind_speed_unit: 'mph',
  });
  const b = await fetchJSON(`https://api.open-meteo.com/v1/forecast?${p}`);
  return {
    now: {
      temp: b.current?.temperature_2m,
      feels: b.current?.apparent_temperature,
      code: b.current?.weather_code,
      day: b.current?.is_day !== 0,
      wind: b.current?.wind_speed_10m,
      humidity: b.current?.relative_humidity_2m,
    },
    days: (b.daily?.time || []).map((date, i) => ({
      date,
      code: b.daily.weather_code?.[i],
      max: b.daily.temperature_2m_max?.[i],
      min: b.daily.temperature_2m_min?.[i],
      rain: b.daily.precipitation_probability_max?.[i],
    })),
  };
}

/** WMO weather code → short label + icon name (see icons.js). */
export function describe(code, day = true) {
  const c = Number(code);
  if (c === 0) return { label: day ? 'Clear' : 'Clear night', icon: day ? 'sun' : 'moon' };
  if (c === 1 || c === 2) return { label: c === 1 ? 'Mostly clear' : 'Partly cloudy', icon: day ? 'partly' : 'partly-night' };
  if (c === 3) return { label: 'Cloudy', icon: 'cloud' };
  if (c === 45 || c === 48) return { label: 'Fog', icon: 'fog' };
  if (c >= 51 && c <= 57) return { label: 'Drizzle', icon: 'drizzle' };
  if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return { label: c >= 80 ? 'Showers' : c >= 65 ? 'Heavy rain' : 'Rain', icon: 'rain' };
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return { label: 'Snow', icon: 'snow' };
  if (c >= 95) return { label: 'Thunderstorm', icon: 'storm' };
  return { label: '—', icon: 'cloud' };
}

/** Postcode (via postcodes.io) or town name (via Open-Meteo geocoding) → { lat, lon, place }. */
export async function lookupPlace(text) {
  const t = String(text || '').trim();
  if (!t) throw new Error('Enter a postcode or town');
  if (/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(t)) {
    const b = await fetchJSON(`https://api.postcodes.io/postcodes/${encodeURIComponent(t)}`);
    return { lat: b.result.latitude, lon: b.result.longitude, place: b.result.admin_district || b.result.postcode };
  }
  const b = await fetchJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(t)}&count=1&language=en&countryCode=GB`);
  const r = b?.results?.[0];
  if (!r) throw new Error(`Couldn't find "${t}"`);
  return { lat: r.latitude, lon: r.longitude, place: r.name };
}
