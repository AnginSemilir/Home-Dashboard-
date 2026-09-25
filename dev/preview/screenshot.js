// Screenshot the preview dashboard at Lenovo M10 viewport sizes.
// Usage: node screenshot.js [out-prefix] [WxH@scale ...]   (needs Playwright + Chromium)
// Env: CHROMIUM=/path/to/chrome, SCHEME=dark|light, WAIT=ms, DASH=wall-panel/home
const { execSync } = require('child_process');
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }

const [, , prefix = 'preview', ...sizes] = process.argv;
const viewports = (sizes.length ? sizes : ['1280x800@1.5', '960x600@2']).map((s) => {
  const [wh, sc] = s.split('@'); const [w, h] = wh.split('x').map(Number);
  return { w, h, scale: Number(sc || 1) };
});

(async () => {
  const browser = await pw.chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  for (const vp of viewports) {
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.scale,
      colorScheme: process.env.SCHEME || 'dark', timezoneId: 'Europe/London', locale: 'en-GB',
    });
    const tokens = execSync(__dirname + '/gettoken.sh').toString().trim();
    await ctx.addInitScript((t) => { try { localStorage.setItem('hassTokens', t); } catch (e) {} }, tokens);
    const page = await ctx.newPage();
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    await page.goto(`http://127.0.0.1:8123/${process.env.DASH || 'wall-panel/home'}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(Number(process.env.WAIT || 10000));
    const file = `${prefix}-${vp.w}x${vp.h}.png`;
    await page.screenshot({ path: file });
    const report = await page.evaluate(() => {
      const deep = (root, sel, acc = []) => { root.querySelectorAll('*').forEach((el) => { if (el.matches(sel)) acc.push(el); if (el.shadowRoot) deep(el.shadowRoot, sel, acc); }); return acc; };
      const errorCards = deep(document, 'hui-error-card').map((e) => (e.shadowRoot?.textContent || '').trim().slice(0, 200));
      const layout = deep(document, 'grid-layout')[0];
      const root = layout?.shadowRoot?.querySelector('#root');
      return { errorCards, layoutHeight: root ? Math.round(root.getBoundingClientRect().height) : null, overflowing: root ? root.scrollHeight > root.clientHeight + 1 : null, viewport: innerHeight };
    });
    console.log(JSON.stringify({ file, ...report, consoleErrors: problems.slice(0, 10) }));
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
