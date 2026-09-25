// Taps every launcher button (and long-presses Claude/Gemini) twice: once with a fake
// Fully Kiosk JS interface, once without (Companion app / Chrome path), and prints what
// each tap would ask Android to open. Usage: node test_buttons.js
const { chromium } = (() => { try { return require('playwright'); } catch { return require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); } })();
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  for (const mode of ['fully', 'companion']) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const tokens = require('child_process').execSync(__dirname + '/gettoken.sh').toString().trim();
    await ctx.addInitScript(([t, mode]) => {
      localStorage.setItem('hassTokens', t);
      window.__calls = [];
      window.open = (u) => { window.__calls.push(['window.open', u]); return null; };
      if (mode === 'fully') window.fully = {
        startApplication: (p) => window.__calls.push(['fully.startApplication', p]),
        startIntent: (u) => window.__calls.push(['fully.startIntent', u]) };
    }, [tokens, mode]);
    const p = await ctx.newPage();
    p.on('pageerror', e => console.log('pageerror', e.message));
    await p.goto('http://127.0.0.1:8123/wall-panel/home');
    await p.waitForTimeout(9000);
    for (const name of ['Shopping', 'Spotify', 'Claude', 'Gemini', 'Home']) {
      const card = p.locator('button-card').filter({ hasText: name }).first();
      await card.locator('#card, ha-card').first().click();
      await p.waitForTimeout(400);
    }
    // long-press Claude and Gemini
    for (const name of ['Claude', 'Gemini']) {
      const el = p.locator('button-card').filter({ hasText: name }).first().locator('ha-card').first();
      const box = await el.boundingBox();
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.waitForTimeout(900); await p.mouse.up();
      await p.waitForTimeout(400);
    }
    console.log('==', mode); for (const c of await p.evaluate(() => window.__calls)) console.log('  ', c.join(' -> '));
    await ctx.close();
  }
  await b.close();
})();
