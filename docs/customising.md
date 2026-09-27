# Customising

## Without touching code (⚙ → Panel)

- **Style:** *Bold* (big and clear, readable across the room; the default) or *Ambient* (softer cards, a background tint that follows the time of day).
- **Theme:** *Auto* switches to light at sunrise and back to dark at sunset (times for your weather location; today's times are shown under the setting). Or *Always dark* / *Always light*. Night dimming (below) works the same in every theme.
- **Green below / Red from (p/kWh):** the price colours. Blue is always at or below 0p.
- **Night mode from/until:** when the panel dims itself (it only dims after 90 seconds without a touch, and never while the camera is live).
- **Reload the page daily at:** a nightly refresh (03:30), so updates you push reach the tablet.
- **Camera name**, **Battery-powered camera**, **Car name**, **Car app**, **App buttons mode**.
- **Home Mini refresh:** under Octopus.

## Changing the page

Everything is plain HTML/CSS/JavaScript in `web/`, with no build step. Push a change to GitHub and the tablet picks it up at its next reload (every night at 03:30, or now with ⚙ → Save & close).

| To change… | Edit |
|---|---|
| Colours, sizes, the grid layout | `web/css/bold.css` or `web/css/ambient.css`, one file per style. Colours are variables at the top (`--cheap`, `--mid`, `--high`, `--plunge`, `--card`, …); the light theme overrides them under `:root[data-theme="light"]`. |
| Sunrise/sunset and the light/dark switch | `web/js/sun.js` and `applyTheme()` in `web/js/main.js` |
| What each card shows | `web/js/ui.js` (`renderPrice`, `renderTiles`, `renderCalendar`, `renderWeather`, `renderCamera`) |
| The price chart | `web/js/chart.js` |
| The buttons: which apps, which intents | `web/js/launcher.js` (`APPS`) and the `DOCK` list at the top of `web/js/ui.js` |
| How often things refresh | the `source(…)` lines near the end of `web/js/main.js` |
| Adding a new service | a new `web/js/<service>.js`, a `source(…)` line in `main.js`, a render function in `ui.js`, and its address in the `connect-src` list in `web/index.html` (the page may only call the addresses listed there) |

Two rules keep the panel safe:
- Put text from outside services on the page with `h(...)` or `textContent`, never `innerHTML`.
- Don't put keys in the code; add a field in `web/js/settings-ui.js` instead. (A test checks that calendar titles can't inject HTML.)

## Using Claude to change it

The code is written to be edited by an AI assistant. Open this repository in Claude Code (or paste the relevant file into Claude) and describe what you want, e.g.

- "Add a tile showing the outdoor humidity from Open-Meteo, next to Indoor."
- "Make the price chart show 12 hours instead of 24."
- "Add a sixth button that opens the BBC Sounds app."

Then check it: `npm test && npm run test:e2e` runs all the tests, and `npm run preview` saves screenshots of the panel at three tablet sizes into `shots/`. (Once per computer, first run `npm install` and `npx playwright install chromium` for the browser the tests use.)
