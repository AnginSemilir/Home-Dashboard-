// Settings screen: a setup checklist plus one section per data source. Everything typed
// here is saved in this browser only.

import { h, describeError } from './util.js';
import { exportSettings, importSettings } from './config.js';
import { Google, redirectUri } from './google.js';
import { Nest, isCamera, isThermostat, deviceName } from './nest.js';
import { listCalendars } from './calendar.js';
import { lookupPlace } from './weather.js';
import { newKey } from './kia.js';
import { detectEnv } from './launcher.js';
import { Octopus, regionFromTariff } from './octopus.js';

const ENV_LABEL = {
  webview: 'Kiosk app (all buttons work)',
  fully: 'Fully Kiosk (all buttons work)',
  chrome: 'Chrome (Home button not possible; Claude/Gemini open their apps)',
  desktop: 'Desktop browser (buttons only work on the tablet)',
};

export function checklist(s, st) {
  // 'pending' = set up but not tried yet (it's tried after Save & close).
  const res = (name) => (!st.status[name] ? 'pending' : st.status[name].error ? 'bad' : 'ok');
  // A ✗ shows its reason; otherwise the detail says what's set up.
  const item = (state, text, detail = '', source = '') => ({
    state, text,
    detail: state === 'bad' ? st.status[source]?.error || detail : state === 'pending' ? [detail, 'checked after Save & close'].filter(Boolean).join(' · ') : detail,
  });
  const signed = !!s.google.refreshToken;
  return [
    item(s.weather.lat != null ? res('weather') : 'todo', 'Weather location', s.weather.place, 'weather'),
    item(s.octopus.tariff || s.octopus.discovered ? res('rates') : 'todo', 'Octopus Agile prices', s.octopus.discovered?.tariff || s.octopus.tariff, 'rates'),
    item(s.octopus.apiKey ? res('homemini') : 'todo', 'Octopus Home Mini (live usage)', '', 'homemini'),
    item(signed ? 'ok' : 'todo', 'Google sign-in', signed ? '' : 'needed for Nest and Calendar'),
    item(s.google.thermostatId ? res('thermostat') : s.google.projectId ? 'todo' : 'off', 'Nest thermostat', '', 'thermostat'),
    item(s.google.cameraId ? 'ok' : s.google.projectId ? 'todo' : 'off', 'Nest camera (tap for live view)', st.status.camera?.error || ''),
    item(s.google.calendars.length ? res('calendar') : signed ? 'todo' : 'off', 'Google Calendar', s.google.calendars.map((c) => c.name).join(', '), 'calendar'),
    item(s.kia.url ? res('kia') : 'off', 'Kia battery (optional)', '', 'kia'),
  ];
}

export function openSettings(root, ctx) {
  const { settings: s, save, state, google } = ctx;
  const draft = JSON.parse(JSON.stringify(s));
  // Test buttons use clients bound to the unsaved draft, so Cancel really discards it.
  const draftGoogle = () => new Google(draft, () => {});
  const msg = h('div', { class: 'help' });
  const say = (t) => { msg.textContent = t; };

  const input = (obj, key, { type = 'text', placeholder = '', step } = {}) => {
    const el = h('input', { type, placeholder, step, value: obj[key] ?? '', autocomplete: 'off', spellcheck: 'false' });
    el.addEventListener('input', () => { obj[key] = type === 'number' ? Number(el.value) : el.value.trim(); });
    return el;
  };
  const field = (label, el, help) => h('div', {}, h('label', {}, label, el), help ? h('div', { class: 'help' }, help) : null);
  const btn = (text, fn, secondary = false) => {
    const b = h('button', { class: `btn${secondary ? ' secondary' : ''}` }, text);
    b.addEventListener('click', async () => {
      b.disabled = true;
      try { await fn(); } catch (e) { say(describeError(e)); } finally { b.disabled = false; }
    });
    return b;
  };

  // Checklist
  const list = h('ul', { class: 'checklist' });
  const renderList = () => list.replaceChildren(...checklist(draft, state).map((i) => h('li', {},
    h('span', { class: i.state === 'ok' ? 'ok' : i.state === 'bad' ? 'bad' : 'off' }, i.state === 'ok' ? '✓' : i.state === 'bad' ? '✗' : i.state === 'pending' ? '…' : '○'),
    h('span', {}, i.text, i.detail ? h('span', { class: 'muted' }, ` · ${i.detail}`) : ''))));
  renderList();

  // Weather
  const place = h('input', { type: 'text', placeholder: 'Postcode or town, e.g. SW1A 1AA', value: '' });
  const placeNow = h('div', { class: 'help' }, draft.weather.place ? `Currently: ${draft.weather.place} (${draft.weather.lat?.toFixed?.(3)}, ${draft.weather.lon?.toFixed?.(3)})` : 'Not set');
  const weather = h('section', {}, h('h2', {}, 'Weather'), field('Where is the panel?', place), placeNow,
    btn('Find', async () => {
      const p = await lookupPlace(place.value);
      Object.assign(draft.weather, p);
      placeNow.textContent = `Currently: ${p.place} (${p.lat.toFixed(3)}, ${p.lon.toFixed(3)})`;
      say(`Found ${p.place}`);
    }));

  // Octopus
  const octoInfo = h('div', { class: 'help' });
  const showOcto = () => {
    const d = draft.octopus.discovered;
    octoInfo.textContent = d
      ? `Found: tariff ${d.tariff} (region ${regionFromTariff(d.tariff)}), meter ${d.serial}, Home Mini ${d.deviceId ? 'yes' : 'not found'}`
      : 'Not connected yet';
  };
  showOcto();
  const octo = h('section', {}, h('h2', {}, 'Octopus Energy'),
    field('Account number', input(draft.octopus, 'account', { placeholder: 'A-1234ABCD' })),
    field('API key', input(draft.octopus, 'apiKey', { type: 'password', placeholder: 'sk_live_…' }),
      'From octopus.energy → Account → Personal details → API access. Stays on this tablet.'),
    octoInfo,
    btn('Connect', async () => {
      draft.octopus.discovered = await new Octopus(draft).discover();
      showOcto();
      say('Octopus connected');
    }),
    field('Tariff code (optional)', input(draft.octopus, 'tariff', { placeholder: 'E-1R-AGILE-24-10-01-C' }),
      "Only needed if you don't add an API key: prices still work, live usage doesn't. The last letter is your region."),
    field('Home Mini refresh (seconds)', input(draft.octopus, 'pollSeconds', { type: 'number', step: 10 }),
      'Octopus allows about 100 requests an hour. 60 is safe.'),
    field('Proxy URL (only if needed)', input(draft.octopus, 'proxy', { placeholder: 'https://octopus-proxy.<you>.workers.dev' }),
      'Leave empty. Only if the checklist says Octopus is blocked in this browser: see docs/octopus.md (the address also has to be added to web/index.html).'));

  // Google
  const redirect = redirectUri();
  const googleState = h('div', { class: 'help' });
  const devicePick = h('div', { class: 'pick' });
  const calPick = h('div', { class: 'pick' });
  const showGoogle = () => { googleState.textContent = draft.google.refreshToken ? 'Signed in.' : 'Not signed in.'; };
  showGoogle();
  const google_ = h('section', {}, h('h2', {}, 'Google (Nest camera, thermostat and Calendar)'),
    h('div', { class: 'help' }, 'Redirect URI to add to your Google OAuth client: ', h('span', { class: 'mono' }, redirect)),
    field('OAuth client ID', input(draft.google, 'clientId', { placeholder: '…apps.googleusercontent.com' })),
    field('OAuth client secret', input(draft.google, 'clientSecret', { type: 'password' })),
    field('Device Access project ID (Nest)', input(draft.google, 'projectId', { placeholder: 'leave empty for Calendar only' })),
    googleState,
    btn('Sign in with Google', async () => {
      if (!draft.google.clientId || !draft.google.clientSecret) throw new Error('Enter the client ID and secret first');
      // Any Android WebView (WebView Kiosk, Fully Kiosk…) gets Google's disallowed_useragent page.
      if (/; wv\)/.test(navigator.userAgent) || ['webview', 'fully'].includes(detectEnv())) throw new Error('Google blocks sign-in inside kiosk apps. Sign in using Chrome on this tablet, then use "Copy settings" below and paste them here.');
      Object.assign(s, draft); save();
      google.signIn();
    }),
    btn('Choose camera & thermostat', async () => {
      const devs = await new Nest(draftGoogle(), draft).devices();
      const radios = (kind, test, key) => {
        const opts = devs.filter(test);
        if (!opts.length) return h('div', { class: 'muted' }, `No ${kind} found`);
        return h('div', {}, h('div', { class: 'muted' }, kind), ...opts.map((d) => {
          const r = h('input', { type: 'radio', name: key, checked: draft.google[key] === d.name });
          r.addEventListener('change', () => { draft.google[key] = d.name; if (key === 'cameraId') draft.panel.cameraName = deviceName(d); renderList(); });
          return h('label', {}, r, deviceName(d));
        }));
      };
      devicePick.replaceChildren(radios('Camera', isCamera, 'cameraId'), radios('Thermostat', isThermostat, 'thermostatId'));
    }, true),
    devicePick,
    btn('Choose calendars', async () => {
      const cals = await listCalendars(draftGoogle());
      calPick.replaceChildren(...cals.map((c) => {
        const cb = h('input', { type: 'checkbox', checked: draft.google.calendars.some((x) => x.id === c.id) });
        cb.addEventListener('change', () => {
          draft.google.calendars = draft.google.calendars.filter((x) => x.id !== c.id);
          if (cb.checked) draft.google.calendars.push({ id: c.id, name: c.name, color: c.color });
          renderList();
        });
        return h('label', {}, cb, c.name);
      }));
    }, true),
    calPick,
    btn('Sign out of Google', async () => {
      // Revoke the token at Google too (a form post: no CORS preflight), then forget the choices.
      const token = draft.google.refreshToken;
      if (token) {
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }),
        }).catch(() => {});
      }
      Object.assign(draft.google, { refreshToken: '', scopes: '', calendars: [], cameraId: '', thermostatId: '' });
      devicePick.replaceChildren();
      calPick.replaceChildren();
      showGoogle();
      renderList();
      say('Signed out of Google. Save & close to clear the calendar, thermostat and camera from the panel.');
    }, true));

  // Kia
  const keyOut = h('div', { class: 'help' });
  const kia = h('section', {}, h('h2', {}, 'Kia battery (optional)'),
    h('div', { class: 'help' }, 'Needs the GitHub Action described in docs/kia.md.'),
    field('Data URL', input(draft.kia, 'url', { placeholder: 'https://raw.githubusercontent.com/<you>/<repo>/kia-data/kia.json' })),
    field('Key', input(draft.kia, 'key', { type: 'password' })),
    btn('Generate a new key', async () => {
      draft.kia.key = newKey();
      keyOut.replaceChildren('New key (copy it into the GitHub secret KIA_PANEL_KEY): ', h('span', { class: 'mono' }, draft.kia.key));
    }, true), keyOut);

  // Panel
  const bool = (obj, key, label) => {
    const cb = h('input', { type: 'checkbox', checked: !!obj[key] });
    cb.addEventListener('change', () => { obj[key] = cb.checked; });
    return h('label', { class: 'row' }, cb, label);
  };
  const launcherSel = h('select', {}, ...['auto', 'webview', 'chrome', 'fully'].map((v) => h('option', { value: v, selected: draft.panel.launcher === v }, v)));
  launcherSel.addEventListener('change', () => { draft.panel.launcher = launcherSel.value; });
  const panel = h('section', {}, h('h2', {}, 'Panel'),
    field('Camera name', input(draft.panel, 'cameraName')),
    bool(draft.panel, 'cameraBattery', 'Battery-powered camera (tap for live view; stops after 5 minutes)'),
    field('Green below (p/kWh)', input(draft.panel, 'cheap', { type: 'number', step: 0.5 })),
    field('Red from (p/kWh)', input(draft.panel, 'pricey', { type: 'number', step: 0.5 })),
    field('Night mode from', input(draft.panel, 'nightFrom', { type: 'time' })),
    field('Night mode until', input(draft.panel, 'nightTo', { type: 'time' })),
    field('Reload the page daily at', input(draft.panel, 'reloadAt', { type: 'time' })),
    field('Car name', input(draft.panel, 'carName')),
    field('Car app (Android app ID)', input(draft.panel, 'carApp', { placeholder: 'com.kia.oneapp.eu' }),
      'What the car tile opens when there is no battery data. The ID is the id=… part of the app\'s Play Store link.'),
    field('App buttons mode', launcherSel, `Detected: ${ENV_LABEL[detectEnv()]}`));

  // Move settings
  const box = h('textarea', { placeholder: 'Paste settings here' });
  const move = h('section', {}, h('h2', {}, 'Copy settings to another browser'),
    h('div', { class: 'help' }, 'Use this to sign in to Google in Chrome, then move everything into the kiosk app. The text contains your keys, so paste it straight into the other app and nowhere else.'),
    btn('Copy settings', async () => {
      const text = exportSettings(draft);
      try { await navigator.clipboard.writeText(text); say('Copied. Now open the panel in the other app → Settings → Paste.'); } catch { box.value = text; say('Copy the text in the box below.'); }
    }, true),
    btn('Paste settings', async () => {
      const text = box.value.trim() || (await navigator.clipboard.readText());
      const imported = importSettings(text);
      Object.assign(s, imported); save();
      say('Imported. Reloading…');
      setTimeout(() => location.reload(), 600);
    }, true), box);

  const close = btn('Save & close', async () => {
    Object.assign(s, draft);
    save();
    location.reload();
  });
  const cancel = btn('Cancel', async () => { overlay.remove(); ctx.onClose?.(); }, true);

  const overlay = h('div', { class: 'settings', id: 'settings' }, h('div', { class: 'wrap' },
    h('h1', {}, 'Panel settings', h('span', {}, cancel, close)),
    h('section', {}, h('h2', {}, 'Setup checklist'), list, msg),
    weather, octo, google_, kia, panel, move,
    h('div', { class: 'help' }, 'Everything here is stored only in this browser on this tablet.')));
  root.append(overlay);
  return overlay;
}
