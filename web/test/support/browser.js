// Shared setup for the Playwright tests: one browser and one static server per test file,
// a fresh context per test with every outside service faked.
import { chromium } from 'playwright';
import { startServer } from './serve.js';
import { installMocks, fullSettings } from './mocks.js';

export const NOW = Date.parse('2026-09-25T09:41:00+01:00');
export const dayStartOf = (ms) => Date.parse(new Date(ms + 3600e3).toISOString().slice(0, 10) + 'T00:00:00+01:00'); // BST test dates only

export const UA = {
  webview: 'Mozilla/5.0 (Linux; Android 12; TB328FU Build/SP1A.210812.016; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/139.0.7258.143 Safari/537.36',
  chrome: 'Mozilla/5.0 (Linux; Android 12; TB328FU) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.143 Safari/537.36',
};

export async function startBrowser() {
  const { server, url } = await startServer();
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  return { browser, url, close: async () => { await browser.close(); server.close(); } };
}

/**
 * Open the panel. `clock`: 'fixed' (Date frozen, timers real) or 'install' (fake timers the
 * test drives with page.clock.runFor). `settings`: null for a first run.
 */
export async function openPanel(env, {
  now = NOW, settings, viewport = { width: 1280, height: 800 }, userAgent, clock = 'fixed', fail, xss, kiaReading, initScript, homeMiniStopsAt,
} = {}) {
  const ctx = await env.browser.newContext({ viewport, userAgent, timezoneId: 'Europe/London', locale: 'en-GB', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push(e.message));
  if (clock === 'install') await page.clock.install({ time: now });
  else await page.clock.setFixedTime(now);
  const calls = await installMocks(page, { now, dayStart: dayStartOf(now), fail, xss, kiaReading, homeMiniStopsAt });
  const s = settings === undefined ? fullSettings(now) : settings;
  if (s) {
    // Only on the first load, so tests can reload and keep what the page saved.
    await page.addInitScript((json) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('wallpanel.settings.v1', json); sessionStorage.setItem('seeded', '1'); } }, JSON.stringify(s));
  }
  if (initScript) await page.addInitScript(initScript);
  await page.goto(env.url);
  return { ctx, page, calls, problems };
}

/** Record every navigation the page asks for, including intent: links Chromium can't open. */
export async function recordNavigations(page) {
  const urls = [];
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Page.enable');
  cdp.on('Page.frameRequestedNavigation', (e) => urls.push(e.url));
  return urls;
}

export const text = (page, sel) => page.locator(sel).first().innerText();
