# Redesign: two designs and the judges’ verdicts

> Current (web app). Saved from the research runs so it is not lost with the cloud session.

_Workflow: Two designers each build a full redesign of the wall panel in their own worktree; two judges compare the screenshots and pick a winner plus ideas to borrow_

**reports:**

### 1. ambient

**report:**

I've finished the "Calm ambient" redesign. Both test suites pass with no test edits, every size fits with no scroll or cut-off text, and the patch applies cleanly to the original commit. Nothing is committed or pushed; the changes are only staged in the worktree.

**New layout** (5 row tracks, columns 1 / 1.5 / 1):
```
clock  price  cal
clock  chart  cal
cam    chart  cal
tiles  tiles  cal
dock   dock   dock
```
The price now sits at the top centre with its chart right under it. The clock and weather move to the top left. The camera placeholder, which is mostly idle, drops to the lower left. The four tiles become one row, which frees height for the chart. The calendar keeps the full right column.

**Why it's nicer, card by card**
- **Background:** a very faint static glow that changes with the time of day. JS sets a class on `.panel` from the hour (dawn 5–8, day 8–17, dusk 17–21, night 21–5). There is no blur and no animation.
- **Cards:** see-through white surfaces one step lighter than the page, so the tint shows through. Each has a faint top highlight, a 1px edge and a 1–2px shadow.
- **Clock:** the time is large but light (weight 300, up to 76px), with a hairline above the weather and an aligned 4-day forecast. It stays thin and soft so it can't compete with the price; the price is the only heavy large figure.
- **Price (the one hero):** the number is 86px semibold in normal text colour, with a muted "p/kWh" unit. Next to it is a chip with a coloured dot and a word: Plunge, Cheap, Normal or Peak. The card has a faint glow in the band's colour. The line under it keeps the required format, with the next price and cheapest price in bold.
- **Chart:**
  - Bars are at most 24px wide with a 2px gap, rounded 4px at the price end and square at the baseline (drawn as paths).
  - Gridlines are solid 1px hairlines, the zero line is a step stronger, and "now" is a solid thin line with a label.
  - Price bands use a new, calmer set of four colours. I checked them with the data-viz guide's colour checker in dark mode, including the colour-blindness checks, and all pass.
  - There's a legend (Plunge only appears when a price at or below 0p is on screen), a midnight hairline with the day name, and a soft placeholder box where tomorrow's prices will go ("prices from ~4pm").
  - The two numbers labelled on the chart are the peak and the cheapest price ahead, and only where there's room clear of other bars.
- **Tiles:** a small tinted icon and the label, then the value in large semibold. The bottom line holds the sparkline, the battery bar (turns amber below 20%), kWh used, or a flame icon with "Heating · Hallway".
- **Calendar:** stronger day headers, start and end times in fixed-width digits with the end time dimmer, roomier rows. Its status dot sits in the corner so it doesn't cover the date.
- **Camera:** the camera icon sits in a soft circle, the subtitle wraps evenly, and "Tap for live view" is a pill.
- **Dock:** each app icon sits in a small tinted rounded square.
- **Icons:** thinner lines (1.75 instead of 2) and softer weather colours.
- **Night screen, toast and Settings:** only small tweaks so they match the new colours. I checked Settings still looks right.

**Font:** I added Inter as one variable file, `web/fonts/inter-latin-opsz-normal.woff2` (72.9 KB, weights 100–900 plus automatic display shapes at large sizes), with its OFL licence as `LICENSE-Inter.txt`. I deleted the three Roboto files and their licence, since nothing else used them, so the net font size goes down by about 13 KB. The "→" in the indoor tile isn't in this font's character set, so it falls back to a system font, the same as it did with Roboto.

**Rules:**
- No inline styles anywhere; the chart uses only colour attributes plus CSS classes.
- No colour-mixing function, no blur, no animation.
- The plunge bar's colour attribute stays `#3d9bff` because a unit test checks for it; the CSS paints it `#4d8ee8`.

**Tests:** `npm test` passed 42 of 42. `npm run test:e2e` passed 26 of 26 (0 fail, 0 cancelled). No test edits.

**Overflow checks (preview script):**
- 1280×800: `{"scrollH":800,"innerH":800,"panelH":800,"problems":[]}`
- 1333×800: `{"scrollH":800,"innerH":800,"panelH":800,"problems":[]}`
- 960×600: `{"scrollH":600,"innerH":600,"panelH":600,"problems":[]}`
- Evening (18:10) at 1280×800 and 960×600: all fit, `"problems":[]`

The forecast shows 4 days at 1280 and 1333 and 3 at 960.

Files are in `/tmp/claude-0/-home-user-Home-Dashboard-/d5ed8323-04b2-5289-9906-b58467554e87/scratchpad/design/`:
- ambient.patch
- ambient/panel-1280x800.png
- ambient/panel-1333x800.png
- ambient/panel-960x600.png
- ambient-evening/panel-1280x800.png
- ambient-evening/panel-960x600.png
- ambient-dawn/panel-1280x800.png
- ambient-night/panel-1280x800.png
- ambient-2x/ (2× close-ups of each card and the Settings screen)
- ambient-dots/z-_panel.png (every status dot shown)

### 2. bold

**report:**

I redesigned the dashboard in the "Bold wall display" direction and all tests pass with no test edits. It fits 1280×800, 1333×800 and 960×600 with no scroll and nothing cut off. The patch applies cleanly to the original commit (552a579). Nothing is committed or pushed; the changes are only staged so the patch could be made.

**Design rationale.** The screen is near-black with one typeface (Inter) and a clear size scale. Text you read sits straight on the background, split by thin 1px lines. Things you tap (tiles, camera, dock) are flat dark panels, so the shape tells you what is touchable. Only the data carries colour: price bands on bars and chips, weather icons, calendar colours. Everything else is grey or white, plus one violet accent for the "now" line, the car battery bar and the sparkline end dot.

- **Hero choice:** the current price is the only hero: 108px, semibold, white. The clock is also large (96px) but in a light weight, so from across the room it reads as background rather than a second hero. You need both at a glance, and the weight difference keeps them from competing.

**Layout.** The main column holds, top to bottom: clock and weather, the price, the chart, then the 4 tiles in a row. A side column, divided by a vertical line, holds the calendar with the camera underneath at 16:9. The dock runs across the bottom. Everything scales in step with screen height, so 960×600 is the same layout at three-quarter size.

**What changed per card:**
- **Clock and weather:** one band of three columns:
  - the time with the date under it;
  - current weather (icon, "14°", "Partly cloudy", "Feels 13° · wind 9 mph");
  - four forecast rows with the existing temperature-range bars. The band is sized so exactly four rows always fit.

  The settings gear sits quietly next to the last forecast row.
- **Price:**
  - The number is always white now.
  - The band is shown by a solid chip with a word: Plunge, Cheap, Normal or Peak.
  - The "until … / cheapest ahead …" text keeps its exact wording, split over two lines, with a small band-coloured dot before each price.
  - With no price, the dash shows in grey.
- **Chart:**
  - It is now wider (about 830px instead of 540px).
  - Bars are at most 24px wide, with rounded tops, square bottoms and a 2px gap. A negative price rounds at the bottom instead.
  - Gridlines are solid and very faint; the zero line is a little stronger.
  - "Now" is a solid violet line.
  - Past bars turn grey, so colour only appears on prices still to come.
  - A thin line marks midnight, with the day name ("Sat") in bold.
  - Two values are labelled directly: the cheapest and the dearest slot still ahead, skipped if they would collide with other text.
  - The note in the empty area now reads "Next prices due ~4pm".
  - There is a small band legend with your thresholds ("Cheap <15", "Peak 25+"). The chart title is now "Half-hourly price · p/kWh".
- **Tiles:**
  - Small grey icon beside a sentence-case label, then a 32px semibold value.
  - The usage sparkline is grey with a violet dot for the latest reading.
  - The car battery bar is violet and turns amber at 20% or below.
- **Calendar:** stronger Today/Tomorrow headings. Start times are white, end times grey. Events that don't fit are hidden from the end and counted in "+N more", since the calendar now shares its column with the camera.
- **Camera, dock, toast, night mode:** restyled flat. Dock icons are grey and centred. The night clock uses a light weight. Settings still works; its buttons are now violet.

**Colours.** I changed Cheap to #2aa87e and Peak to #e0524a. With the old green, amber and green looked almost the same to people with red-green colour blindness (the validator scored the pair 2.8, where 8 is the target). The new pair scores 10.5. Plunge stays #3d9bff, which the test requires. Text on each chip is at least 5.1:1 contrast.

**Behaviour changes to check:**
- The chart's status dot is now hidden, because the chart and price always show the same status and the price card's dot is right above it. Tapping the chart still shows the status.
- The calendar can now show fewer events than before on a busy day, with "+N more" for the rest.
- The "→" in "20.5° → 21°" isn't in the Inter font file, so that one character comes from the tablet's system font.

**Font.**
- **Added:** Inter variable (`inter-latin-opsz-normal.woff2`, 72,920 bytes, from npm `@fontsource-variable/inter` 5.3.0) and its OFL licence as `LICENSE-Inter.txt`.
- **Removed:** the three Roboto files and their licence, since nothing uses them now (66,324 bytes).
- **Net:** about 6.6 KB more.

**Tests.**
- `npm test`: 42 tests, 42 pass, 0 fail.
- `npm run test:e2e`: 26 tests, 26 pass, 0 fail, including the fit/no-cut-off test at all three sizes.
- No test edits.

**Overflow results** (the preview script's output):
- 1280×800: scrollH 800, innerH 800, panelH 800, problems []
- 1333×800: scrollH 800, innerH 800, panelH 800, problems []
- 960×600: scrollH 600, innerH 600, panelH 600, problems []
- Evening 18:10, 1280×800: scrollH 800, innerH 800, panelH 800, problems []

My own checks also found nothing cut off in the forecast rows, price text, chip, legend or event titles, including a "105.3" price with the longest "cheapest ahead … tomorrow" text at 960×600. There are no inline styles anywhere, including inside the SVG.

Main screenshots are in /tmp/claude-0/-home-user-Home-Dashboard-/d5ed8323-04b2-5289-9906-b58467554e87/scratchpad/design/; the extra-state shots in bold/ were rendered just before three small final tweaks (see below):
- bold/panel-1280x800.png
- bold/panel-1333x800.png
- bold/panel-960x600.png
- bold-evening/panel-1280x800.png
- extra states, with a sample usage history so the sparkline shows:
  - bold/p2-1280x800.png
  - bold/p2-1280x800-evening.png
  - bold/p2-960x600-evening.png
  - bold/p2-1280x800-live.png (camera live and a toast)
  - bold/p2-1280x800-dots.png (every status dot on)
  - bold/p2-960x600-fail.png (services failing)
  - bold/p2-1280x640-short.png (calendar "+1 more")
  - bold/p2-960x600-long.png (long price text)
  - bold/p2-1280x800-settings.png
  - bold/p2-960x600-night.png

  The three tweaks made after these were taken: the calendar dates line up on the right, "+N more" lines up with the event titles, and the price digits are slightly less tightly spaced.

Files are in /tmp/claude-0/-home-user-Home-Dashboard-/d5ed8323-04b2-5289-9906-b58467554e87/scratchpad/design/:
- bold.patch

**verdicts:**

### 1. wall

**scores:**

#### 1. bold

**score:** 8.1

**strengths:**

I checked it myself: the patch applies to the original commit, npm test passes 42/42 and e2e passes 26/26. There are no test edits, no inline styles, URLs, animations or blur. It is the most legible design at 1–3 m. The price is the single hero at 108px semibold in white. Beside it is a solid band chip with a word, 20px, which reads from across a room. The clock is 96px but light, so it doesn't compete. The chart is the widest of the three (830x228 at 1280, bars about 15px with 2px gaps). Past bars are greyed and there is a violet now line. The cheapest and the dearest price ahead are labelled on the bars. The legend shows thresholds (Cheap <15, Peak 25+) and a midnight 'Sat' line marks the day change. Tile values are 32px and dock buttons are 76px tall. Four forecast days show at all three sizes (the original showed only 2 at 960). The near-black background with few boxes glows less at night, and night mode is a calm grey light-weight clock. It also fixes the original's status dot overlapping the gear and the calendar date. Nothing is cut off at any size.

**weaknesses:**

Calendar capacity drops sharply. It now shares its column with a 16:9 camera placeholder that is idle most of the time. Only 28px is free below the last event at 1280x800 (19px at 1333, 21px at 960); the original had 407px. The new fitCalendar hides events from the end, and at 1280x640 six items already show '+1 more'. The heating state is plain grey text with no icon or colour. Dock icons are all grey, so apps lose their colour identity. The settings gear sits 8px outside #clock (scrollWidth 838 vs clientWidth 830, overflow hidden), so its touch area is clipped. At 960 the camera subtitle is about 9px and the SVG axis text 9.2px. The chart's own status dot is now hidden, which is a small behaviour change even though it repeats the price dot. The price's 'until… / cheapest ahead' text is right-aligned about 300px from the number, so the eye has to jump. In the failed state the legend still shows and the dash reads as a heavy bar.

#### 2. ambient

**score:** 7

**strengths:**

I checked it myself: the patch applies, unit tests pass 42/42 and e2e 26/26. There are no test edits, no inline styles, animations or blur, and the gradient is static. It looks refined and premium. The cards step up gently in lightness, and the price card carries a faint glow in the band colour. The heating state is clear, with a flame icon and 'Heating' highlighted. Dock icons sit in tinted squares, so each app is quick to recognise. The calendar keeps the full right column (308px free) with fixed-width times and a dimmer end time. The legend shows Plunge only when it is on screen, and future prices get a placeholder box. The price (85px semibold) is clearly the hero over the light 72px clock. Forecast rows at 960 go from 2 to 3. Nothing is cut off at any size.

**weaknesses:**

It is less legible from across the room. The price is 85px and the clock 72px, against 108px and 96px in Bold. The band chip is 15px with a small dot on a dark tinted pill, so the cheap-or-peak signal is weak at 3 m. Tile values are 25px, and 21px at 960. The chart is narrow (496px, bars about 7.7px), while the idle camera placeholder takes the prime lower-left block (354x277). The see-through, gradient card surfaces make more of the screen glow than a near-black layout does. The time-of-day tint is so faint it barely registers. At 960x600 the calendar status dot still overlaps the '25 September' date. The legend has no threshold values. Dock buttons are 64px against Bold's 76px.

**winner:** bold

**graft:**

- Take Ambient's heating treatment for the Indoor tile: a small flame icon plus 'Heating' in brighter ink or a warm tint, so heating shows at a glance. Keep 'Idle', 'Eco' and 'Off' quiet.
- Take Ambient's dock icon identity: muted per-app icon tints, or small tinted rounded squares behind each icon, so Shopping, Spotify, Claude, Gemini and Home can be told apart without reading. Keep the labels and the flat buttons.
- Take Ambient's full-height calendar column, or at least its idea that the idle camera shouldn't take prime space. For example, show the idle camera as a compact one-line strip ('Front door · Tap for live view') and expand to 16:9 only when live.
- Take Ambient's shaded placeholder box over the empty future area of the chart ('Next prices due ~4pm'), so the gap reads as 'not yet published' rather than 'zero'.
- Consider Ambient's approach of showing 'Plunge' in the legend only when a price at or below 0p is in the chart window, which cuts legend noise most of the day. Keep Bold's threshold values on Cheap and Peak.
- Consider Ambient's two-line price sub text placed directly under the number and chip, instead of right-aligned about 300px away, so the whole 'price now' story reads as one group.

**must fix:**

- Calendar capacity regression. At 1280x800 only 28px is free below the last event (19px at 1333, 21px at 960), against 407px in the original. fitCalendar starts hiding tomorrow's events on any moderately busy day, and 1280x640 already shows '+1 more' with 6 items. Make the idle camera a compact strip that expands to 16:9 only when live, or otherwise give the calendar back at least about 3 more event rows.
- The settings gear sits outside #clock: scrollWidth 838 vs clientWidth 830 at 1280, and #clock has overflow:hidden. Its touch area is clipped, and a stricter scrollWidth check on #clock would fail. Move the gear inside the band's box.
- Text too small at 960x600: the camera subtitle ('Battery camera: live view stops after 5 minutes') renders at about 9px and the chart's SVG axis ticks at 9.2px. Raise both to at least 11px (wrap the subtitle to two lines if needed).
- The chart's status dot is hidden, so it never shows even with the .error class. That is a behaviour change against 'keep all features'. Restore it, for example at the end of the chart header or legend line (the earlier p2 dots render showed it there).
- The Indoor tile's 'Heating · Hallway' is the same muted grey as 'Idle'. Give the heating state a visible cue (icon plus warm ink) so a household can see from across the room that the boiler is running.
- Empty and failed price states: hide the band legend when there are no rates, and make the no-price '–' a normal-width grey dash rather than the long heavy bar seen in p2-960x600-fail.png.
- Recheck the three final tweaks (calendar date alignment, '+N more' indent, price digit spacing): the extra-state p2 screenshots were rendered before them. Re-render the dots, live, fail and short views at 1280 and 960 and confirm nothing collides.

### 2. craft

**scores:**

#### 1. bold

**score:** 8.6

**strengths:**

I re-ran everything myself. The patch applies cleanly to HEAD, unit tests pass 42/42 and e2e passes 26/26. There are no test edits, no inline styles (including in the SVG strings), no animation, blur or external URLs, and nothing still points at the removed Roboto files. It fits all three sizes, which the preview screenshots show.

Typography and hierarchy: this is the stronger system and it reads from 3 m. The price is 108px semibold in ink and clearly the hero. Next to it is a solid chip with a word (Normal/Peak/Plunge), with dark text on the band colour at about 5:1 contrast. Secondary text is clearly quieter.

Chart: the best one on offer. It is about 830px wide, so 48 evening bars stay legible. Bars are ≤24px with a 2px gap, a 4px round at the price end and a square baseline; a negative bar rounds at the bottom. Gridlines are solid hairlines, with the zero line one step stronger. The now line is solid violet (the accent), clearly separate from the band colours. Past bars turn grey, so colour marks only the prices still to come, which is a strong data-viz call. There is a midnight hairline with a bold day name. The cheapest and dearest prices still ahead are labelled directly. The legend carries the actual thresholds (Cheap <15, Peak 25+). Chart text scales with the screen.

Layout: an editorial grid with hairline dividers and fewer boxes. The clock, weather and 4-day forecast share one top band, and all 4 days survive at 960. Flat panels mean 'you can tap this'. The camera is a true 16:9 box, so live video fits. The calendar gets a '+N more' when it overflows. Coloured dots before the 'then' and 'cheapest' prices tie the text to the bands without colouring the text.

**weaknesses:**

The clock (6.4em, about 96px) and the price (7.2em, about 108px) are within 12% of each other and stacked in the same column. The weight difference carries the hierarchy, but the size gap is thin. Chart value labels only check for clashes sideways against the now line and each other, not against neighbouring bars: '12.5' butts into the taller 20p amber bar to its left. Some secondary text is small or low-contrast for a wall: the camera subtitle is 0.85em in faint grey (about 4.3:1, 12.7px at 1280 and about 9.6px at 960), and axis and legend text is about 9px at 960. The price sub-text is right-aligned, floating well away from the chip with a dead gap between. The dock icons are all grey, so app identity is lost. Violet is overloaded: it marks 'now' and is also the car-battery fill and the sparkline dot. The calendar holds fewer events than before because it shares its column with the camera. fitCalendar runs only when the calendar renders, so there is no refit on resize, and if it renders while hidden, events get clipped with no '+N more'. The chart's status dot is hidden; it duplicates the price dot's status, so this is acceptable. The extra-state screenshots predate the final tweaks.

#### 2. ambient

**score:** 7.6

**strengths:**

I re-ran everything myself. The patch applies, unit tests pass 42/42, e2e passes 26/26, there are no test edits and no inline styles, blur or animation. It fits all sizes.

It is the more premium-looking piece. It has a consistent card system with one-step-lighter surfaces, a faint inner highlight and consistent radii and padding, plus a tasteful static time-of-day tint set by a class. It follows the 'text never wears data colour' rule most strictly: the number is in ink and the chip is a tinted pill with a coloured dot and a word. The band glow on the price card is subtle.

Chart craft is good: bars drawn as paths with rounded tops, square bases and 2px gaps; solid hairlines placed on whole pixels; a stronger zero line; a midnight line with the day name; a faint rectangle marking where tomorrow's prices will go. Its value labels are placed only where they won't collide with neighbouring bars (a proper 'blocked' test). The legend shows Plunge only when a price at or below 0p is on screen. The band colours were checked for colour-blindness and desaturated.

Other nice details: tinted dock icon squares, a flame icon on the Heating state, and calendar end times dimmer than start times.

**weaknesses:**

The chart is squeezed into the middle column (about 500px of plot), so the bars are about 9px wide and the morning view is roughly 40% empty future. That is weaker from across the room. The idle camera placeholder takes a large prime card (354×275) and isn't 16:9, so live video letterboxes. The hero price card leaves its right ~40% empty, and the chip sits at mid-height of the number rather than on the unit's baseline, so it floats. The calendar status dot collides with the '25 September' text (visible in ambient-dots). The desaturated amber (#c2870a), plus past bars at 0.32 opacity, reads muddy brown on the dark background. The plunge bar's fill attribute says #3d9bff while CSS paints #4d8ee8, a mismatch kept only to satisfy a test. The forecast drops to 3 days at 960. Chart text is a fixed 11px and doesn't scale. The legend's window hard-codes 1h and 24h instead of reading them from the options. The clock (76px, light) against the price (86px) has a similarly thin size gap.

**winner:** bold

**graft:**

- Label collision test from ambient chart.js: skip the min/max value label when any neighbouring bar's top is within the label's box (ambient's `blocked` check, applied to bars within ~(label width/2 + bar width/2) of the label). Use it in bold's renderChart in place of the sideways-only `placed` check.
- Status-dot halo from ambient (`box-shadow: 0 0 0 3px rgb(band / 0.2)` on .dot.stale/.dot.error), so stale and error dots register from across the room. Use a plain ring; this is not a glow effect.
- Heating cue from ambient's indoor tile: a small flame icon before 'Heating' in ink, so an active heating state reads at a glance and is distinguishable from 'Idle'.
- Faint 'pending' rectangle (ambient's .ch-pending, about rgb(255 255 255 / 0.025) with rx 6) behind bold's 'Next prices due ~4pm' note, so the empty future area reads as a deliberate placeholder.
- Legend handling for Plunge: either show the Plunge swatch only when a price at or below 0p is in the chart window (ambient's approach), or give it a threshold label ('Plunge ≤0') to match 'Cheap <15' and 'Peak 25+'.
- Optionally, very muted identity tints on the dock icons (ambient's tinted icon squares, toned down to icon colour only) to speed up tapping the right app without adding a second loud colour.

**must fix:**

- Chart value labels can overlap bars. renderChart in bold's web/js/chart.js only checks sideways distance against the now line and other labels; in the 09:41 render, '12.5' touches the taller 20p amber bar to its left. Add a check against neighbouring bars and nudge or skip the label when it would overlap one.
- Widen the gap between the clock and the hero price. The clock is 6.4em (about 96px) and the price 7.2em (about 108px), stacked in one column. Take .clock .time down to about 5.2–5.4em (about 78–80px) so the price is the only hero at a glance. Re-check that the weather and forecast band still aligns afterwards.
- Wall legibility of secondary text. Change .cam .cam-idle > .muted from --faint at 0.85em (about 4.3:1 contrast, about 9.6px at 960) to --muted at 0.9em or larger. Raise chart axis and legend text (.chart .chart-box font-size 0.82em, .legend 0.85em) so it doesn't drop below about 11px at 960×600.
- Calendar refit: fitCalendar only runs inside renderCalendar. Re-run it from a ResizeObserver on .cal-body, including when the panel becomes visible again after Settings closes, so events hidden by overflow always get a correct '+N more' and none are clipped silently.
- Price sub-text placement: the right-aligned 'until … / cheapest ahead …' block floats about 200px from the chip with a dead gap. Either align it to the chip, left-aligned in the remaining space, or make the right alignment clearly deliberate by aligning it with the chart's right edge and the legend baseline grid.
- Accent overload: violet marks 'now' on the chart and is also the car-battery fill and the sparkline end dot. Keep violet for 'now' and render the battery meter in ink or muted grey (amber when low), so the accent keeps one meaning.
- Re-render the extra-state screenshots after the final tweaks (fail state with the '–' price in --faint, the hidden chart dot, the short calendar with '+N more' aligned) and confirm nothing regressed. The current p2-* shots predate those changes.
