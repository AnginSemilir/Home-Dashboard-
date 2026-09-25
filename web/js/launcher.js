// Opening Android apps from the panel's buttons.
//
// - WebView Kiosk (or any Android WebView app that passes intent: links to Android) and
//   Fully Kiosk can open anything: the Android home screen, Claude's assistant/voice screen,
//   Gemini listening.
// - Chrome only lets web pages open "browsable" app links, so there the buttons open the
//   apps' normal screens, and Home can't be done from a web page.

export const APPS = {
  shopping: { pkg: 'com.google.android.keep', web: 'https://keep.google.com/' },
  spotify: { pkg: 'com.spotify.music', web: 'https://open.spotify.com/' },
  claude: {
    pkg: 'com.anthropic.claude',
    web: 'https://claude.ai/new',
    // Claude's assistant screen (from the app's manifest; not documented by Anthropic).
    special: 'intent:#Intent;action=android.intent.action.VOICE_ASSIST;component=com.anthropic.claude/.mainactivity.AssistantOverlayActivity;launchFlags=0x10000000;end',
  },
  gemini: {
    pkg: 'com.google.android.apps.bard',
    web: 'https://gemini.google.com/app',
    special: 'intent:#Intent;action=android.intent.action.VOICE_ASSIST;package=com.google.android.googlequicksearchbox;launchFlags=0x10000000;end',
  },
  home: {
    special: 'intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.HOME;launchFlags=0x10000000;end',
  },
};

export function detectEnv(win = globalThis) {
  if (win.fully && typeof win.fully.startApplication === 'function') return 'fully';
  const ua = win.navigator?.userAgent || '';
  if (/Android/.test(ua) && /; wv\)/.test(ua)) return 'webview';
  if (/Android/.test(ua)) return 'chrome';
  return 'desktop';
}

export const launchIntent = (pkg) =>
  `intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${pkg};launchFlags=0x10000000;end`;

/** An https app link that Chrome hands to the app when it's installed. */
export function appLink(web, pkg) {
  const u = new URL(web);
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=${pkg};end`;
}

/**
 * What a tap (or press-and-hold) should do.
 * Returns { kind: 'fully-app'|'fully-intent'|'navigate'|'message', value }.
 */
export function actionFor(name, env, { hold = false, pkg } = {}) {
  const app = APPS[name] || { pkg };
  const p = pkg || app.pkg;
  const wantSpecial = app.special && !hold;
  if (env === 'fully') {
    if (wantSpecial) return { kind: 'fully-intent', value: app.special };
    return p ? { kind: 'fully-app', value: p } : { kind: 'message', value: 'Nothing to open' };
  }
  if (env === 'webview') {
    if (wantSpecial) return { kind: 'navigate', value: app.special };
    return p ? { kind: 'navigate', value: launchIntent(p) } : { kind: 'message', value: 'Nothing to open' };
  }
  if (env === 'chrome') {
    if (name === 'home') return { kind: 'message', value: 'Swipe up from the bottom edge to go to the home screen' };
    if (app.web && p) return { kind: 'navigate', value: appLink(app.web, p) };
    if (p) return { kind: 'navigate', value: `https://play.google.com/store/apps/details?id=${p}` };
    return { kind: 'message', value: 'Nothing to open' };
  }
  // Desktop browser (setting up or testing): just say what the tablet would do.
  return { kind: 'message', value: `On the tablet this opens ${name}` };
}

export function perform(action, win = globalThis, toast = () => {}) {
  switch (action.kind) {
    case 'fully-app': return win.fully.startApplication(action.value);
    case 'fully-intent': return win.fully.startIntent(action.value);
    case 'navigate': win.location.href = action.value; return undefined;
    default: return toast(action.value);
  }
}
