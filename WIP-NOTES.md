# Redesign in progress (not live)

This branch merges two dashboard designs so the owner can switch between them. It is **not
finished**: `web/index.html` and `web/privacy.html` still point at the old `css/panel.css`, which
this branch replaces with `css/bold.css` and `css/ambient.css`.

## Asked for
- Both designs, **Bold** (default) and **Ambient**, chosen in ⚙ → Panel → Style.
- A **Theme** setting: *Auto* (light from sunrise to sunset, dark otherwise), *Always dark*,
  *Always light*. Sunrise/sunset from Open-Meteo (`daily=sunrise,sunset` for the saved
  location), with a built-in calculation as a fallback. Night dimming stays as it is.

## Done here
- One markup for both styles (`web/js/ui.js`): `.col-main`/`.col-side` wrappers (Ambient uses
  `display: contents` on them), price chip + legend, dock icon wrappers, calendar fit.
- `web/js/chart.js`: thin rounded bars, labels that avoid bars, "not published yet" box.
- Inter font (`web/fonts`), lighter icons; the two style sheets as the designers left them.

## Still to do
1. Load `css/<style>.css` from main.js (default bold) before first render; settings for Style
   and Theme; set `data-theme` on `<html>`; update index.html/privacy.html links.
2. Sun times + auto theme switching; tests (unit for the sun calculation, e2e for both styles ×
   both themes fitting 1280×800 / 1333×800 / 960×600 with nothing truncated).
3. Light versions of both style sheets (band colours checked for contrast on light surfaces).
4. Judges' fixes. Bold: give the calendar more room (compact idle camera), keep the gear inside
   the clock card, no text under ~11px at 960×600, show the chart's status dot, heating cue
   (flame icon), grey dash and hidden legend when there are no prices, clock smaller than the
   price (~80px), battery bar not violet, price sub-text next to the chip. Ambient: calendar dot
   overlapping the date, band chip alignment, brighter amber, lighter past bars.
5. Docs (customising.md), screenshots, merge into the main branch.
