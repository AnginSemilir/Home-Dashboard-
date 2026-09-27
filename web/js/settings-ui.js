// Settings screen: a setup checklist plus one section per data source. Everything typed
// here is saved in this browser only.

import { h, describeError } from './util.js';
import { exportSettings, importSettings } from './config.js';
import { Google, redirectUri } from './google.js';
import { Nest, isCamera, isThermostat, deviceName } from './nest.js';
import { listCalendars } from './calendar.js';
import { listTaskLists, createTaskList } from './tasks.js';
import { lookupPlace } from './weather.js';
import { newKey } from './kia.js';
import { detectEnv, MUSIC_APPS, ASSISTANTS } from './launcher.js';
import { hhmm } from './time.js';
import { exportSpotify, importSpotify } from './spotify.js';
import { LOCATION_WHY } from './sun.js';
import { checkSubName } from './doorbell.js';
import { Chime } from './chime.js';
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
    item(s.google.shoppingList?.id ? (s.google.scopes.includes('/auth/tasks') ? res('shopping') : 'bad') : signed ? 'todo' : 'off',
      'Shopping list (Google Tasks)', signed && !s.google.scopes.includes('/auth/tasks') ? 'sign in to Google again to allow it' : s.google.shoppingList?.name || '', 'shopping'),
    item(!s.google.doorbellSub ? 'off' : checkSubName(s.google.doorbellSub, s.google.projectId) || !s.google.projectId ? 'bad' : !signed || !s.google.scopes.includes('/auth/pubsub') ? 'bad' : res('doorbell'),
      'Doorbell alerts (pop-up and chime)',
      !s.google.doorbellSub ? 'optional: docs/doorbell.md'
        : checkSubName(s.google.doorbellSub, s.google.projectId) || (!s.google.projectId ? 'needs the Nest (Device Access) project ID'
          : !signed || !s.google.scopes.includes('/auth/pubsub') ? 'sign in to Google again to allow it' : ''), 'doorbell'),
    item(exportSpotify() && s.spotify.clientId ? (s.panel.music === 'amazonmusic' ? 'off' : res('spotify')) : s.spotify.clientId ? 'todo' : 'off',
      'Spotify controls (optional, needs Premium)', s.panel.music === 'amazonmusic' ? 'the music button is set to Amazon Music' : s.spotify.clientId && !exportSpotify() ? 'tap Connect Spotify' : '', 'spotify'),
    item(s.kia.url ? res('kia') : 'off', 'Kia battery (optional)', '', 'kia'),
  ];
}

export function openSettings(root, ctx) {
  const { settings: s, save, state, google } = ctx;
  const draft = JSON.parse(JSON.stringify(s));
  // Test buttons use clients bound to the unsaved draft, so Cancel really discards it.
  const draftGoogle = () => new Google(draft, () => {});
  const msg = h('div', { class: 'help' });
  // Results and errors appear right next to the button that was pressed.
  let active = null;
  const say = (t, bad = false, link = null) => {
    const el = active || msg;
    el.textContent = t;
    if (link) el.append(' ', h('a', { href: link.href, target: '_blank', rel: 'noopener noreferrer' }, link.text));
    el.classList.toggle('bad', bad);
  };

  const input = (obj, key, { type = 'text', placeholder = '', step } = {}) => {
    const el = h('input', { type, placeholder, step, value: obj[key] ?? '', autocomplete: 'off', spellcheck: 'false' });
    el.addEventListener('input', () => { obj[key] = type === 'number' ? Number(el.value) : el.value.trim(); });
    return el;
  };
  const field = (label, el, help) => h('div', {}, h('label', {}, label, el), help ? h('div', { class: 'help' }, help) : null);
  const btn = (text, fn, secondary = false) => {
    const b = h('button', { class: `btn${secondary ? ' secondary' : ''}` }, text);
    const status = h('span', { class: 'btn-status', role: 'status' });
    b.addEventListener('click', async () => {
      b.disabled = true;
      active = status;
      say('Working…');
      try {
        await fn();
        if (status.textContent === 'Working…') say('');
      } catch (e) {
        say(describeError(e), true, e?.link);
      } finally {
        b.disabled = false;
        active = null;
      }
    });
    return h('span', { class: 'btn-wrap' }, b, status);
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
      try {
        draft.octopus.discovered = await new Octopus(draft).discover();
      } catch (e) {
        if (e instanceof TypeError) throw new Error("Octopus didn't answer this browser. If the weather works, Octopus is blocking browser requests: see \"If Octopus is blocked\" in docs/octopus.md.");
        throw e;
      }
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
  const shopPick = h('div', { class: 'pick' });
  const showGoogle = () => {
    googleState.textContent = !draft.google.refreshToken ? 'Not signed in.'
      : draft.google.doorbellSub && !draft.google.scopes.includes('/auth/pubsub') ? 'Signed in, but not for doorbell alerts yet: sign in with Google again to allow them.' : 'Signed in.';
  };
  showGoogle();
  // Doorbell alerts: the Pub/Sub subscription (docs/doorbell.md), checked as it's typed.
  const subInput = input(draft.google, 'doorbellSub', { placeholder: 'projects/your-cloud-project-id/subscriptions/panel-doorbell' });
  const subWhy = h('div', { class: 'help' });
  const checkSub = () => {
    const why = checkSubName(draft.google.doorbellSub, draft.google.projectId);
    subWhy.textContent = why || 'Optional: a doorbell press opens its live view full screen with a chime. Set up in docs/doorbell.md, then sign in with Google again.';
    subWhy.classList.toggle('bad', !!why);
    showGoogle(); renderList();
  };
  subInput.addEventListener('input', checkSub);
  checkSub();
  const doorbellField = h('div', {}, h('label', {}, 'Doorbell subscription (optional)', subInput), subWhy,
    btn('Test chime', async () => {
      const ok = await (ctx.chime || new Chime()).test();
      if (!ok) throw new Error('Sound is blocked. Tap the screen once, and in WebView Kiosk → Settings → Web Engine turn Media Playback Requires User Gesture off. Turn the media volume up.');
      say('Ding-dong! (Turn the media volume up if that was quiet.)');
    }, true),
    btn('Test doorbell', async () => {
      if (!draft.google.cameraId) throw new Error('Choose the doorbell (camera & thermostat) first');
      ctx.testRing?.();
      say('Showing the doorbell as if it had been pressed.');
    }, true));

  const google_ = h('section', {}, h('h2', {}, 'Google (Nest camera, thermostat and Calendar)'),
    h('div', { class: 'help' }, 'Redirect URI to add to your Google OAuth client: ', h('span', { class: 'mono' }, redirect)),
    field('OAuth client ID', input(draft.google, 'clientId', { placeholder: '…apps.googleusercontent.com' })),
    field('OAuth client secret', input(draft.google, 'clientSecret', { type: 'password' })),
    field('Device Access project ID (Nest)', input(draft.google, 'projectId', { placeholder: 'leave empty for Calendar only' })),
    doorbellField,
    googleState,
    btn('Sign in with Google', async () => {
      if (!draft.google.clientId || !draft.google.clientSecret) throw new Error('Enter the client ID and secret first');
      // Any Android WebView (WebView Kiosk, Fully Kiosk…) gets Google's disallowed_useragent page.
      if (/; wv\)/.test(navigator.userAgent) || ['webview', 'fully'].includes(detectEnv())) throw new Error('Google blocks sign-in inside kiosk apps. Sign in using Chrome on this tablet, then use "Copy settings" below and paste them here.');
      Object.assign(s, draft); save();
      say('Opening Google…');
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
    btn('Choose shopping list', async () => {
      const g = draftGoogle();
      if (!g.signedIn) throw new Error('Sign in with Google first');
      // A sign-in from before the shopping list (or with Tasks unticked) can't read it: say so
      // rather than letting Google answer "403".
      if (!g.hasTasks) throw new Error("Your Google sign-in doesn't allow Google Tasks yet. In Chrome, tap Sign in with Google again and make sure the Tasks box is ticked on Google's screen (or tick Select all), then choose the list.");
      let lists = await listTaskLists(g);
      const pick = () => shopPick.replaceChildren(
        h('div', { class: 'help' }, 'A Google Tasks list. Add to it by voice ("Hey Google, add milk to my shopping list in Google Tasks") or with + on the panel.'),
        ...lists.map((l) => {
          const r = h('input', { type: 'radio', name: 'shopList', checked: draft.google.shoppingList?.id === l.id });
          r.addEventListener('change', () => { draft.google.shoppingList = { id: l.id, name: l.name }; renderList(); });
          return h('label', {}, r, l.name);
        }),
        lists.some((l) => /shopping/i.test(l.name)) ? null : btn('Create a "Shopping" list', async () => {
          const made = await createTaskList(g, 'Shopping');
          lists = [...lists, made];
          draft.google.shoppingList = made;
          pick();
          renderList();
        }, true));
      pick();
    }, true),
    shopPick,
    btn('Sign out of Google', async () => {
      // Revoke the token at Google too (a form post: no CORS preflight), then forget the choices.
      const token = draft.google.refreshToken;
      if (token) {
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }),
        }).catch(() => {});
      }
      // Revoking can't be undone, so this is saved straight away (Cancel won't bring it back).
      const cleared = { refreshToken: '', scopes: '', calendars: [], shoppingList: null, cameraId: '', thermostatId: '' };
      Object.assign(draft.google, cleared);
      Object.assign(s.google, JSON.parse(JSON.stringify(cleared)));
      save();
      devicePick.replaceChildren();
      calPick.replaceChildren();
      showGoogle();
      renderList();
      say('Signed out of Google. Save & close to clear the calendar, thermostat and camera from the panel.');
    }, true));

  // Kia
  const keyOut = h('div', { class: 'help' });
  // Spotify
  const spState = h('div', { class: 'help' });
  const showSpotify = () => { spState.textContent = exportSpotify() ? 'Connected.' : 'Not connected.'; };
  showSpotify();
  const spotify_ = h('section', {}, h('h2', {}, 'Spotify (music controls, optional)'),
    h('div', { class: 'help' }, "With Spotify Premium, the music button shows what's playing, and a tap opens controls: play/pause, skip, volume and which speaker. One-off setup in docs/spotify.md. Redirect URI for your Spotify app: ", h('span', { class: 'mono' }, redirect)),
    field('Spotify Client ID', input(draft.spotify, 'clientId', { placeholder: 'from developer.spotify.com/dashboard' })),
    spState,
    btn('Connect Spotify', async () => {
      if (!draft.spotify.clientId) throw new Error('Enter the Client ID first');
      Object.assign(s, draft); save();
      say('Opening Spotify…');
      location.assign(await ctx.spotify.authUrl(redirect));
    }),
    btn('Disconnect Spotify', async () => {
      ctx.spotify?.disconnect();
      showSpotify(); renderList();
      say('Disconnected. Save & close to hide the controls.');
    }, true));

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
  const select = (obj, key, options) => {
    const el = h('select', {}, ...options.map(([v, label]) => h('option', { value: v, selected: obj[key] === v }, label)));
    el.addEventListener('change', () => { obj[key] = el.value; });
    return el;
  };
  const sunLine = h('div', { class: 'help' });
  const showSun = () => {
    const today = ctx.sun?.();
    const why = LOCATION_WHY[ctx.locateStatus?.()?.outcome];
    sunLine.textContent = `${today ? `Today: light from ${hhmm(today.rise)} (sunrise) to ${hhmm(today.set)} (sunset)` : 'Sunrise and sunset'} ${ctx.place?.() ? 'where the tablet is.' : `at the weather location${why ? ` (${why}: see docs/tablet.md)` : ''}.`}`;
  };
  showSun();
  const look = [
    field('Style', select(draft.panel, 'style', [['bold', 'Bold: big and clear, readable across the room'], ['ambient', 'Ambient: softer cards, tint follows the time of day']])),
    field('Theme', select(draft.panel, 'theme', [['auto', 'Auto: light from sunrise to sunset'], ['light', 'Always light'], ['dark', 'Always dark']])),
    sunLine,
    ctx.locateNow && !ctx.place?.() ? btn('Use this tablet\'s location', async () => {
      say('Asking the tablet…');
      const r = await ctx.locateNow();
      showSun();
      if (r !== 'ok') throw new Error(`No location: ${LOCATION_WHY[r] || r}. See docs/tablet.md.`);
      say('Done: sunrise and sunset are now for where the tablet is.');
    }, true) : null,
  ];
  const launcherSel = h('select', {}, ...['auto', 'webview', 'chrome', 'fully'].map((v) => h('option', { value: v, selected: draft.panel.launcher === v }, v)));
  launcherSel.addEventListener('change', () => { draft.panel.launcher = launcherSel.value; });
  const panel = h('section', {}, h('h2', {}, 'Panel'), ...look,
    field('Camera name', input(draft.panel, 'cameraName')),
    bool(draft.panel, 'cameraBattery', 'Battery-powered camera (tap for live view; stops after 5 minutes)'),
    field('Green below (p/kWh)', input(draft.panel, 'cheap', { type: 'number', step: 0.5 })),
    field('Red from (p/kWh)', input(draft.panel, 'pricey', { type: 'number', step: 0.5 })),
    field('Night mode from', input(draft.panel, 'nightFrom', { type: 'time' })),
    field('Night mode until', input(draft.panel, 'nightTo', { type: 'time' })),
    field('Reload the page daily at', input(draft.panel, 'reloadAt', { type: 'time' })),
    field('Music button', select(draft.panel, 'music', Object.entries(MUSIC_APPS)), 'Which app the music button opens.'),
    field('AI button', select(draft.panel, 'assistant', Object.entries(ASSISTANTS)), 'Claude or Gemini. The Assistant button (the tablet\'s own voice assistant) is always there as well.'),
    field('Car name', input(draft.panel, 'carName')),
    field('Car app (Android app ID)', input(draft.panel, 'carApp', { placeholder: 'com.kia.oneapp.eu' }),
      'What the car tile opens when there is no battery data. The ID is the id=… part of the app\'s Play Store link.'),
    field('App buttons mode', launcherSel, `Detected: ${ENV_LABEL[detectEnv()]}`));

  // Move settings
  const box = h('textarea', { placeholder: 'Paste settings here' });
  const move = h('section', {}, h('h2', {}, 'Copy settings to another browser'),
    h('div', { class: 'help' }, 'Use this to sign in to Google in Chrome, then move everything into the kiosk app. The text contains your keys, so paste it straight into the other app and nowhere else.'),
    btn('Copy settings', async () => {
      // Spotify's sign-in changes each time it's used, so only one browser can keep it: it
      // moves with the copy, and this browser lets go of it.
      const sp = exportSpotify();
      const text = sp ? JSON.stringify({ ...JSON.parse(exportSettings(draft)), spotifyToken: sp }) : exportSettings(draft);
      const moved = sp ? ' Spotify moves with the settings, so this browser is now disconnected from it (Connect Spotify again here if you only wanted a copy).' : '';
      try { await navigator.clipboard.writeText(text); say(`Copied. Now open the panel in the other app → Settings → Paste.${moved}`); } catch { box.value = text; say(`Copy the text in the box below.${moved}`); }
      if (sp) { ctx.spotify?.disconnect(); showSpotify(); renderList(); }
    }, true),
    btn('Paste settings', async () => {
      const text = box.value.trim() || (await navigator.clipboard.readText());
      const imported = importSettings(text);
      try { importSpotify(JSON.parse(text).spotifyToken); } catch { /* no Spotify sign-in in it */ }
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

  // Which published version this is (written by the publish workflow), to check an update arrived.
  const version = h('div', { class: 'help' });
  fetch('version.txt', { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')).then((v) => {
    version.textContent = `Panel version: ${v.trim() || 'unknown'}`;
  }).catch(() => {});
  const overlay = h('div', { class: 'settings', id: 'settings' }, h('div', { class: 'wrap' },
    h('h1', {}, 'Panel settings', h('span', {}, cancel, close)),
    h('section', {}, h('h2', {}, 'Setup checklist'), list, msg),
    weather, octo, google_, spotify_, kia, panel, move,
    h('div', { class: 'help' }, 'Everything here is stored only in this browser on this tablet.'), version));
  root.append(overlay);
  return overlay;
}
