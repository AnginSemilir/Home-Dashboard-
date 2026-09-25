// Render the panel with fake data and save screenshots.
// Usage: node web/test/preview.js [outDir] [WxH@scale ...]   (env: NOW=ISO time, CHROMIUM=path)
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { startServer } from './support/serve.js';
import { installMocks, fullSettings } from './support/mocks.js';

const [outDir = 'shots', ...sizes] = process.argv.slice(2);
const viewports = (sizes.length ? sizes : ['1280x800@1.5', '1333x800@1.5', '960x600@2']).map((s) => {
  const [wh, sc] = s.split('@');
  const [w, hh] = wh.split('x').map(Number);
  return { w, h: hh, scale: Number(sc || 1) };
});
const NOW = Date.parse(process.env.NOW || '2026-09-25T09:41:00+01:00');
const dayStart = Date.parse(new Date(NOW).toISOString().slice(0, 10) + 'T00:00:00+01:00');

await mkdir(outDir, { recursive: true });
const { server, url } = await startServer();
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
for (const vp of viewports) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.scale, timezoneId: 'Europe/London', locale: 'en-GB', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push(e.message));
  await page.clock.setFixedTime(NOW);
  await installMocks(page, { now: NOW, dayStart });
  await page.addInitScript((s) => localStorage.setItem('wallpanel.settings.v1', JSON.stringify(s)), fullSettings(NOW));
  await page.goto(url);
  await page.waitForTimeout(1500);
  const file = `${outDir}/panel-${vp.w}x${vp.h}.png`;
  await page.screenshot({ path: file });
  const overflow = await page.evaluate(() => ({ scrollH: document.documentElement.scrollHeight, innerH: innerHeight, panelH: document.querySelector('.panel')?.getBoundingClientRect().height }));
  console.log(JSON.stringify({ file, ...overflow, problems }));
  await ctx.close();
}
await browser.close();
server.close();
