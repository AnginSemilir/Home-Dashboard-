// Inline SVG icons (24×24, drawn with currentColor in a light 1.75 stroke). Weather icons get
// their own soft colours.

const S = (body, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

const sun = '<circle cx="12" cy="12" r="4.2" fill="#f3c24f" stroke="#f3c24f"/><g stroke="#f3c24f"><path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></g>';
const cloud = (dx = 0, dy = 0, c = '#c9d3df') => `<path transform="translate(${dx} ${dy})" d="M7 18.5h9.5a4 4 0 0 0 .4-8A5.5 5.5 0 0 0 6.3 11 3.8 3.8 0 0 0 7 18.5z" fill="${c}" stroke="${c}"/>`;
const drops = (c = '#6aaef0') => `<g stroke="${c}"><path d="M9 20.5l-1 2M13 20.5l-1 2M17 20.5l-1 2"/></g>`;

export const WEATHER = {
  sun: S(sun),
  moon: S('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="#c9d4ff" stroke="#c9d4ff"/>'),
  partly: S(`<g transform="translate(-3 -3) scale(.8)">${sun}</g>${cloud(1, 1)}`),
  'partly-night': S(`<path transform="translate(-4 -4) scale(.75)" d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="#c9d4ff" stroke="#c9d4ff"/>${cloud(1, 1)}`),
  cloud: S(cloud(0, -1)),
  fog: S(`${cloud(0, -3)}<g stroke="#9aa6b2"><path d="M4 20h16M6 22.5h12"/></g>`),
  drizzle: S(`${cloud(0, -3)}${drops('#7fbfff')}`),
  rain: S(`${cloud(0, -3, '#aab7c6')}${drops()}`),
  snow: S(`${cloud(0, -3)}<g stroke="#ffffff"><path d="M8 21h.01M12 22h.01M16 21h.01"/></g>`),
  storm: S(`${cloud(0, -3, '#8e9aab')}<path d="M12.5 15.5l-2 3.5h3l-2 3.5" stroke="#f3c24f"/>`),
};

export const UI = {
  camera: S('<path d="M3 7.5h3l1.8-2.5h8.4L18 7.5h3v11H3z"/><circle cx="12" cy="13" r="3.6"/>'),
  play: S('<path d="M8 5.5v13l11-6.5z" fill="currentColor"/>'),
  close: S('<path d="M6 6l12 12M18 6L6 18"/>'),
  bolt: S('<path d="M13 2.5L4.5 13.5H11l-1 8 8.5-11H12z" fill="currentColor"/>'),
  pound: S('<path d="M16.5 6.5A4 4 0 0 0 9 8.5v9.5M6 12.5h7M6 18.5h12"/>'),
  thermo: S('<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/>'),
  flame: S('<path d="M12 22a6 6 0 0 0 6-6c0-3.5-3-6-3.5-9.5C12 8 10.5 10 10 11.5 9.2 10.6 9 9.5 9 8.5 7 10.4 6 12.8 6 16a6 6 0 0 0 6 6z" fill="currentColor"/>'),
  car: S('<path d="M5 16.5V12l2-5h10l2 5v4.5M5 16.5h14M5 16.5v2M19 16.5v2"/><circle cx="8" cy="13.8" r=".8" fill="currentColor"/><circle cx="16" cy="13.8" r=".8" fill="currentColor"/>'),
  cart: S('<path d="M3 4h2.5l2.2 11h10.6l2-8H7"/><circle cx="9.5" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/>'),
  music: S('<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>'),
  spark: S('<path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/>'),
  mic: S('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>'),
  home: S('<path d="M3.5 11L12 4l8.5 7M6 9.5V20h12V9.5"/>'),
  gear: S('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  pin: S('<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.2"/>'),
};
