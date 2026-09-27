# Dashboard layout (Home Assistant cards)

> Research for the earlier Home Assistant plan (superseded by the web app on 25 Sep 2026). Kept for reference; many facts still apply.

**Area:** dashboard-design

## Recommendation

Keep kiosk-mode. It is actively maintained (v14.2.1, released 2026-09-13; last commit 2026-09-21; nightly HA-beta CI). It is also still required: HA's own frontend kioskMode flag can only be switched on by a Companion app over the external-app bus, so it cannot be set from Fully Kiosk. For the layout, your plan (a layout-card `custom:grid-layout` view with grid-template-areas and kiosk:true) still works on 2026.9.x in display mode. It is the only way to get exact CSS-grid areas and fixed pixel/fr tracks for a no-scroll 1280x800 panel. However, layout-card should now be treated as frozen and unmaintained: v2.4.7 (2025-10-28) is its last commit, and at least 9 issues opened in 2026 have no reply from the maintainer (spacing regressions since 2026.4, a card_margin bug, a lit-element deprecation warning, log errors in edit mode). So: pin v2.4.7 and write the view in YAML (Raw configuration editor). Use only the options its grid code reads: grid-* keys (write `grid-gap`, not `gap`), place-items/place-content, margin/padding/height, and view_layout.grid-area. Use minmax(0,1fr) tracks and avoid nesting vertical-stack/layout-card inside it. Keep a core fallback ready: a Sections view with max_columns: 3, a camera section with column_span: 2, and a right section with column_span: 1 (sized via grid_options rows). The launch buttons go in the view `footer` (sticky, max_width in px), and a small theme shrinks the gaps; this fits 1280x800 with no scrolling if each column adds up to 10 rows or fewer. The core `grid` card does not replace layout-card: it only makes equal columns, is square by default, and has no spans or areas. Use as few custom cards as possible. Required: kiosk-mode, layout-card, apexcharts-card (the only practical way to plot future Agile rates held in the event attribute `rates`; core history-graph and statistics-graph only show recorded past data). Optional: calendar-card-pro for a compact 'today' agenda with a fixed height. Use core cards for everything else: picture-entity with camera_view: live; tile cards with the trend-graph, bar-gauge, target-temperature and temperature-forecast features; the clock card; the new core `shortcut` card for the big launch buttons. Skip mushroom and browser_mod. Use button-card only if you want its `javascript` action to call Fully's JS interface. Avoid card-mod if you can. If you need it, upstream v4.2.1 per-card `card_mod: style:` still works, but its `-yaml` theme keys have been broken since HA 2026.8 and its more-info/dialog theming since 2026.3. Its successor UIX has an open report of the Android WebView hanging in Fully Kiosk on 2026.9.0.

## Facts

- kiosk-mode (HACS repo NemesisRE/kiosk-mode): latest tag v14.2.1 dated 2026-09-13 (v14.2.0 2026-09-08, v14.1.0 2026-08-23, v14.0.0 2026-06-04); last commit on master 2026-09-21 (PR #612 fix camera dialog actions). Repo has .github/workflows/ha-beta-tests.yaml ('Home Assistant Nightly Beta Tests'). Actively maintained. _(source: git clone --depth 1 + tag dates of github.com/NemesisRE/kiosk-mode; README badges)_
- kiosk-mode compatibility matrix (README): HA >=2026.6.0 requires kiosk-mode >=v14.0.0; HA >=2026.3.0 requires >=v11.0.0; HA >=2026.2.0 requires >=v10.0.0; HA >=2025.10.0 requires >=v8.0.0. kiosk-mode has to be updated alongside HA upgrades. _(source: NemesisRE/kiosk-mode README.md 'Installation' IMPORTANT block)_
- kiosk-mode config goes at the ROOT of the dashboard config (`kiosk_mode:` not indented, same level as `views:`), per dashboard. It does NOT work on the auto-generated default dashboard. You must create a 'New dashboard from scratch'. Refresh the page after config changes. _(source: NemesisRE/kiosk-mode README 'Important Info' / 'Simple config example')_
- kiosk-mode options: `kiosk` (hide header+sidebar), `hide_header`, `hide_sidebar`, `hide_menubutton`, `hide_overflow`, `block_overflow`, `hide_edit_dashboard`, `hide_search`, `hide_assistant`, `hide_notifications`, `hide_account`, `hide_settings`, `block_context_menu`, `block_mouse`, plus many `hide_dialog_*` keys (e.g. `hide_dialog_camera_actions`, `hide_dialog_climate_actions`). All default false. Any option can be a boolean, a JS template '[[[ ]]]' or a Jinja template '{{ }}'. Conditional blocks: `admin_settings`, `non_admin_settings`, `user_settings` (list of {users: [display names], ...}), `mobile_settings` (default breakpoint 812px, `custom_width`). _(source: NemesisRE/kiosk-mode README 'Config Options' + 'Conditional Lovelace Config')_
- kiosk-mode URL query strings: `?kiosk` (hide header + sidebar), `?hide_header`, `?hide_sidebar`, `?hide_menubutton`, etc. Join several with `&`. Add `&cache` to remember the settings on that device for all dashboards (do not combine cache with Jinja templates). `?clear_km_cache` clears the cache. `?disable_km` temporarily disables kiosk-mode (unless `ignore_disable_km` is set). _(source: NemesisRE/kiosk-mode README 'Query Strings' / 'Query String Caching')_
- kiosk-mode resource URL: /hacsfiles/kiosk-mode/kiosk-mode.js (HACS adds it as a dashboard resource in storage mode; in YAML mode add it via `frontend: extra_module_url:`). _(source: NemesisRE/kiosk-mode README install section; hacs.json filename kiosk-mode.js)_
- HA frontend has a native `hass.kioskMode` flag that hides the sidebar and some toolbar buttons. It is only set by the `kiosk_mode/set` external-app message, i.e. from a Companion app (the iOS Companion 'Kiosk mode' is documented; Android Companion is unclear). A plain browser or Fully Kiosk cannot turn it on, so the NemesisRE kiosk-mode plugin is still needed with Fully Kiosk. _(source: home-assistant/frontend src/external_app/external_app_entrypoint.ts (command kiosk_mode/set -> hass-kiosk-mode event), src/state/sidebar-mixin.ts, src/panels/lovelace/hui-root.ts; companion docs docs/integrations/ios-kiosk-mode.md)_
- layout-card (HACS repo thomasloven/lovelace-layout-card): latest tag v2.4.7 dated 2025-10-28 ('Update hass minimum version to 2025.10.0b0'). That is also the last commit on master: zero commits in 2026 (only dependabot branches). hacs.json: homeassistant 2025.10.0.b0. Resource file layout-card.js in the repo root -> /hacsfiles/lovelace-layout-card/layout-card.js. _(source: git clone + tags of github.com/thomasloven/lovelace-layout-card; hacs.json)_
- layout-card open issues filed in 2026 with no visible maintainer response: #334 (log ERROR when editing custom:grid-layout, HA 2026.1.1), #335, #336 (console warning that the 'lit-element' entrypoint is deprecated; functional for now), #341, #343 (extra vertical space in narrow views with vertical-stack since 2026.4 beta), #345 (excess spacing between grid cards in custom:vertical-layout after 2026.4.0), #346, #349, #350 (card_margin ignored, HA 2026.7.3). None reports the grid-layout VIEW failing to render. _(source: github.com/thomasloven/lovelace-layout-card/issues (WebFetch of issue list and #336/#343/#345/#350))_
- layout-card grid-layout implementation: the view applies only layout keys that start with 'grid' plus 'place-items'/'place-content' to the #root CSS grid, so plain `gap:` is ignored and `grid-gap:` must be used. `margin` (default '0px 4px 0px 4px'), `padding` (default '4px 0px 4px 0px') and `height` (default auto) become CSS vars. When `height` is set, #root gets overflow-y:auto (it scrolls internally, not the page). #root is content-box, so height + padding must add up to the viewport. Card-level `view_layout` accepts only grid-* keys and place-self. `mediaquery:` swaps grid options (first matching rule wins). The `card_margin` option is NOT read by grid layout: each card's margin is `var(--masonry-view-card-margin, 4px 4px 8px)`, so set that CSS variable (e.g. in a theme) to control spacing. _(source: thomasloven/lovelace-layout-card src/layouts/grid.ts (v2.4.7))_
- card-mod (HACS repo thomasloven/lovelace-card-mod): latest release v4.2.1 dated 2026-02-09; hacs.json homeassistant 2026.2.0. The README compatibility table lists min HA 2026.2.0 for 4.2.x and 2025.11.0 for 4.1.0. An unreleased branch '2026.4.0-fixes' (tag v4.2.1-202604, 2026-03-30) patches ha-dialog for 2026.4. _(source: git clone + ls-remote of github.com/thomasloven/lovelace-card-mod; README 'Home Assistant version compatability')_
- card-mod v4 syntax: `card_mod:` then `style: |` followed by a CSS string, e.g. `ha-card { ... }`. For cards wrapped in hui-card (almost all core cards), styles are injected into the card's shadowRoot and the bottom-most element is `:host` (usually ha-card is the first element). For older custom cards the styles are injected into ha-card. The `prepend: true` option (same level as style) is auto-detected since 4.2.0. Jinja templates are allowed in styles, with variables config/user/browser/hash/panel. Entity rows and badges use `:host`. The `--card-mod-icon`, `--card-mod-icon-color` and `--card-mod-icon-dim` vars change icons. Resource URL: /hacsfiles/lovelace-card-mod/card-mod.js (optionally also as `frontend: extra_module_url`, keeping the HACS dashboard resource). _(source: thomasloven/lovelace-card-mod README.md (Quick start, Usage, Prepend option, Templates, Performance improvements))_
- card-mod upstream issue #606 (opened 2026-07-06): HA 2026.8 renamed developer-tools to 'tools', which breaks card-mod's loader for YAML theme keys (`card-mod-*-yaml`). UIX's comparison table also says card-mod mishandles `-more-info(-yaml)` and adaptive `-dialog(-yaml)` theme keys since 2026.3. Per-card `card_mod: style:` blocks are not reported broken (the user's 2026.9.3 harness renders them). _(source: github.com/thomasloven/lovelace-card-mod/issues/606 (WebFetch); card-mod src/helpers/yaml2json.ts references 'developer-tools-router'; Lint-Free-Technology/uix docs/source/faq.md)_
- UIX (Lint-Free-Technology/uix) is the successor to card-mod, from card-mod's last maintainer. v8.3.1 released 2026-09-22 (8.4.0-beta.1 exists). It is an INTEGRATION (custom_components/uix) that must be added under Devices & services, and it needs HA 2026.8.0+. It is a drop-in replacement for card-mod <=4.2.1 and accepts `card_mod:` keys, with `uix:` as the new key. Its open issue #589 reports the Android WebView render process becoming unresponsive on a Samsung Tab in Fully Kiosk on HA 2026.9.0, which argues against using it on the wall tablet for now. A community fork, trooperthorn/ha_card-mod (CalVer, HA 2026.8+, resource /hacsfiles/ha_card-mod/card-mod.js), fixes the -yaml theme loader. _(source: git clone of Lint-Free-Technology/uix (hacs.json, docs/source/quick-start.md, faq.md); github.com/Lint-Free-Technology/uix/issues/589 (WebFetch); trooperthorn/ha_card-mod README)_
- apexcharts-card (HACS repo RomRider/apexcharts-card): latest release v2.2.3 dated 2025-08-21. The last non-bot commit on dev is 2025-10-05 and there have been no releases since. There are 25 open issues. #1107 (2026-09-23, open) reports that charts are never destroyed on disconnect, so each dashboard/view round trip or edit/save leaks chart instances and window resize listeners (measured heap 22.6MB -> 61.2MB after 10 round trips with 10 cards). hacs.json homeassistant 2023.7.0. `section_mode: true` (since v2.2.0) sets the card height to 100% for sections views. Resource: /hacsfiles/apexcharts-card/apexcharts-card.js. _(source: git clone/tags of github.com/RomRider/apexcharts-card; README; github.com/RomRider/apexcharts-card/issues and /issues/1107 (WebFetch))_
- button-card (HACS repo custom-cards/button-card): stable v7.0.1 dated 2025-11-13. Prereleases v7.1.0-dev.1/dev.2 on 2026-04-20/21 (custom_fields as JS template, config templates from URLs); dev branch dependabot activity until 2026-06-22. Moderately maintained. hacs.json homeassistant 2025.10.0; resource /hacsfiles/button-card/button-card.js. v7 breaking changes: `spin` renamed to `rotate`; `triggers_update` deprecated (entities are auto-detected); `variables` are evaluated lazily unless `force_eval: true`. JS templates use the syntax '[[[ return ...; ]]]'. It has `custom_fields` (grid-template-areas, nested cards) and `section_mode: true` for sections views. Actions include the extra types `javascript`, `multi-actions` and `toast`, plus `helpers.runAction()`. _(source: button-card CHANGELOG.md, docs/source/config/actions.md, docs/source/advanced/section-views.md, custom-fields.md, hacs.json, tags)_
- Mushroom (piitaya/lovelace-mushroom): v5.2.3 dated 2026-09-01 (v5.2.2 2026-07-31, v5.2.0 2026-05-11). Actively maintained; hacs.json homeassistant 2025.10.0; resource /hacsfiles/lovelace-mushroom/mushroom.js. Not needed for this panel because the core tile/shortcut cards cover it. _(source: git tags + hacs.json of github.com/piitaya/lovelace-mushroom)_
- browser_mod (thomasloven/hass-browser_mod): v3.2.3 dated 2026-09-07, v3.3.0-beta.1 dated 2026-09-18; 395 commits in 2026; hacs.json homeassistant 2026.7.0. Actively maintained, but it is an integration plus frontend and not needed if Fully Kiosk (plus its core integration) handles screen, reload and app control. _(source: git clone/tags of github.com/thomasloven/hass-browser_mod)_
- Other card repos, last activity: clock-weather-card (pkissling) v2.9.5 2026-09-23; calendar-card-pro (alexpfau) v4.2.0 2026-09-12; advanced-camera-card (dermotduffy) v8.1.0 2026-09-07; week-planner-card (FamousWolf) v1.14.1 2026-01-25; octopus-energy-rates-card (lozzd) v0.9.0 2026-01-16. All maintained or recently active. _(source: git tag dates from shallow clones)_
- HACS resource URLs, /hacsfiles/<repo-name>/<file>: /hacsfiles/kiosk-mode/kiosk-mode.js, /hacsfiles/lovelace-layout-card/layout-card.js, /hacsfiles/apexcharts-card/apexcharts-card.js, /hacsfiles/lovelace-card-mod/card-mod.js, /hacsfiles/button-card/button-card.js, /hacsfiles/lovelace-mushroom/mushroom.js, /hacsfiles/calendar-card-pro/calendar-card-pro.js, /hacsfiles/clock-weather-card/clock-weather-card.js, /hacsfiles/advanced-camera-card/advanced-camera-card.js, /hacsfiles/week-planner-card/week-planner-card.js, /hacsfiles/octopus-energy-rates-card/octopus-energy-rates-card.js. HACS appends ?hacstag=<n> when it registers the resource itself. _(source: READMEs state kiosk-mode, card-mod, clock-weather-card and advanced-camera-card paths explicitly. The rest are derived from hacs.json `filename` or the root .js name plus the HACS /hacsfiles/<repo>/ convention.)_ **[partial: explicit in README for 4 of 11; rest derived from hacs.json + HACS convention]**
- Sections view (the default view type) YAML keys: view `type: sections`, `max_columns` (default 4), `dense_section_placement`, `top_margin`, `header` {card, layout: start|center|responsive, badges_position, badges_wrap}, `footer` {card, max_width (px, default 600)}. Sections: `type: grid`, `column_span`, `row_span`, `background` (bool or {color, opacity}), `theme`, `visibility`. Cards: `grid_options` {columns: number|'full', rows: number|'auto', min/max_columns, min/max_rows}. _(source: home-assistant/frontend src/data/lovelace/config/view.ts, section.ts, src/panels/lovelace/types.ts (LovelaceGridOptions); home-assistant.io source/_dashboards/sections.markdown (footer, background, theme))_
- Sections view geometry (frontend CSS defaults, each overridable by a theme variable): column min width 320px (--ha-view-sections-column-min-width), max width 500px (--ha-view-sections-column-max-width), column gap 32px (--ha-view-sections-column-gap), row gap 24px (--ha-view-sections-row-gap). Inside a section: 12 base columns multiplied by column_span, row height 56px (--ha-section-grid-row-height), 8px row/column gaps (--ha-section-grid-row-gap / --ha-section-grid-column-gap). Columns shown = floor((width - 2*gap + gap)/(min + gap)) clamped to max_columns, so a 1280px-wide viewport with the sidebar hidden gives 3 columns (2 below ~1088px). A card with rows N is 64N-8 px tall. _(source: home-assistant/frontend src/panels/lovelace/views/hui-sections-view.ts (styles + _columnsController), src/panels/lovelace/sections/hui-grid-section.ts)_
- The sections view footer holds one card that is sticky at the bottom (bottom: var(--row-gap)). It is set in YAML as `footer: {card: ..., max_width: <px>}`, which makes it a natural place for the row of launch buttons. _(source: frontend src/panels/lovelace/views/hui-view-footer.ts; home-assistant.io sections.markdown 'Editing the footer' / 'Footer YAML configuration')_
- Panel view: exactly one card, rendered full width, no badges. The core `grid` card only has `columns` (default 3), `square` (default true) and `cards`, with no column/row spans or areas, so core cards alone cannot produce an unequal 2/3 + 1/3 fixed layout without sections or layout-card. horizontal-stack also splits into equal widths. _(source: home-assistant.io source/_dashboards/panel.markdown, grid.markdown)_
- New or current core cards useful for a wall panel. `clock` (clock_style digital|analog, clock_size small|medium|large, time_format, show_seconds, no_background, time_zone). `shortcut` (renders as a tile; label, description, icon, color, vertical, tap/hold/double_tap_action; action types navigate, url, perform-action, assist, etc.). Tile features `trend-graph` (hours_to_show), `bar-gauge` (min/max), `target-temperature`, `temperature-forecast` (weather entity; forecast_type daily|twice_daily|hourly, days_to_show/hours_to_show) and `precipitation-forecast`. picture-entity `camera_view: live` with `fit_mode: cover|contain|fill` and `aspect_ratio`. Action `assist` has `pipeline_id` and `start_listening`. _(source: home-assistant.io (current branch, 2026-09-25) source/_dashboards/clock.markdown, shortcut.markdown, picture-entity.markdown; source/dashboards/features.markdown, actions.markdown)_
- Core history-graph (hours_to_show back from now) and statistics-graph (days_to_show, period, stat_types) only plot recorded history or long-term statistics. Neither can plot future values, so they cannot show 'rest of today' or tomorrow's Agile prices, which live in the `rates` attribute of event.octopus_energy_electricity_<serial>_<mpan>_current_day_rates / _next_day_rates. The core energy cards (energy-usage-graph, power-sources-graph, power-total badge, etc.) show consumption and power, not tariff forecasts. _(source: home-assistant.io source/_dashboards/history-graph.markdown, statistics-graph.markdown, energy.markdown; BottlecapDave/HomeAssistant-OctopusEnergy _docs/entities/electricity.md)_
- Octopus Energy (BottlecapDave) entity patterns used in the snippets: sensor.octopus_energy_electricity_{{METER_SERIAL_NUMBER}}_{{MPAN_NUMBER}}_current_rate; event.octopus_energy_electricity_{{METER_SERIAL_NUMBER}}_{{MPAN_NUMBER}}_current_day_rates / _next_day_rates / _previous_day_rates (attribute `rates`: list of {start, end, value_inc_vat in GBP}); Home Mini: sensor.octopus_energy_electricity_{{METER_SERIAL_NUMBER}}_{{MPAN_NUMBER}}_current_demand. The day-rates event entities are disabled by default and must be enabled. _(source: raw.githubusercontent.com/BottlecapDave/HomeAssistant-OctopusEnergy/develop/_docs/entities/electricity.md and _docs/community.md)_
- octopus-energy-rates-card (lozzd) is the integration docs' recommended no-chart alternative: a coloured table of rates. Keys: currentEntity, futureEntity, pastEntity, cols, showpast, showday, hour12, lowlimit/mediumlimit/highlimit (pence), limitEntity, rateListLimit, multiplier (default 100), unitstr, cardRefreshIntervalSeconds. _(source: lozzd/octopus-energy-rates-card README; BottlecapDave _docs/community.md 'Agile Price Table')_
- calendar-card-pro keys useful for a fixed layout: entities, days_to_show (default 3), show_past_events (default false), show_location, compact_events_to_show, height (fixed exact height) and max_height. Type string: custom:calendar-card-pro. The core calendar card only offers initial_view dayGridMonth | dayGridDay | listWeek, with a navigation toolbar, and has no today-agenda mode. _(source: alexpfau/calendar-card-pro docs/reference/configuration.md, README; home-assistant.io source/_dashboards/calendar.markdown)_
- HA caches view elements within a dashboard (hui-root _viewCache), so navigating to a subview and back detaches and reattaches cards. Together with apexcharts-card #1107 this can leak memory on an always-on tablet. Prefer dialogs or popups over view hopping, and schedule a periodic reload. _(source: home-assistant/frontend src/panels/lovelace/hui-root.ts (_viewCache); RomRider/apexcharts-card issue #1107)_ **[partial: cache verified in code; leak on reattach inferred from #1107 description]**
- Core Fully Kiosk integration (requires Fully Plus licence and Remote Admin). It provides actions fully_kiosk.start_application (application, device_id), fully_kiosk.load_url (url, device_id) and fully_kiosk.set_config (key, value, device_id), and buttons named 'Send to background', 'Bring to foreground', 'Load start URL', 'Restart browser' and 'Clear browser cache'. Entity ids are likely button.<device>_send_to_background and button.<device>_load_start_url. _(source: raw.githubusercontent.com/home-assistant/core/dev/homeassistant/components/fully_kiosk/services.yaml, button.py, strings.json; home-assistant.io fully_kiosk.markdown)_ **[partial: actions/keys verified; exact entity_id slugs UNVERIFIED]**
- The Android Companion app can be set as the device's Home app (launcher): Settings > Companion app > Device home screen > 'Use as Home app (launcher)'. It also has a 'Keep screen on' option. _(source: home-assistant/companion.home-assistant docs/integrations/android-home-app-launcher.md)_

## Config snippets

```
# 1) Dashboard root (Raw configuration editor of a NEW dashboard, not the auto-generated default) - kiosk-mode v14
kiosk_mode:
  non_admin_settings:        # tablet signs in as a dedicated non-admin HA user
    kiosk: true              # = hide_header + hide_sidebar
    hide_dialog_camera_actions: true
    block_context_menu: true
  # admins see the normal UI; alternatively use top-level `kiosk: true` and open with ?disable_km to edit
views: []

# Or, with no YAML: Fully Kiosk start URL
# http://homeassistant.local:8123/wall-panel/wall?kiosk
# (append &cache once to remember on that device; ?disable_km to escape; ?clear_km_cache to reset)
```

```
# 2) Theme (configuration.yaml: frontend: themes: !include_dir_merge_named themes) -> themes/wallpanel.yaml
wallpanel:
  # used by layout-card grid-layout (its card_margin option is ignored in grid layout)
  masonry-view-card-margin: "0px"
  # used by the Sections-view fallback
  ha-view-sections-column-gap: 16px
  ha-view-sections-row-gap: 12px
  # optional look
  ha-card-border-radius: 16px
```

```
# 3) PRIMARY: layout-card grid-layout view, fixed 1280x800 CSS px, no page scroll
#    left col 3fr ~754px -> 16:9 camera = 424px = 3*136 + 2*8 ; bottom row 96px ; row4 = 784-424-96-16 = 248px
- title: Wall
  path: wall
  theme: wallpanel
  type: custom:grid-layout
  layout:
    margin: 0
    padding: 8px
    height: calc(100vh - 16px)      # #root is content-box: height + 2*padding = viewport
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr)
    grid-template-rows: 136px 136px 136px minmax(0, 1fr) 96px
    grid-template-areas: |
      "camera  weather"
      "camera  energy"
      "camera  climate"
      "agile   calendar"
      "buttons buttons"
    grid-gap: 8px                    # must start with 'grid' - plain gap: is ignored by layout-card
  cards:
    - type: picture-entity
      entity: camera.REPLACE_nest_camera
      camera_view: live
      show_name: false
      show_state: false
      aspect_ratio: "16:9"
      tap_action: {action: none}
      view_layout: {grid-area: camera}
    - type: grid
      columns: 2
      square: false
      view_layout: {grid-area: weather}
      cards:
        - type: clock
          clock_size: medium
          time_format: "24"
        - type: tile
          entity: weather.REPLACE_home
          features:
            - type: temperature-forecast
              forecast_type: hourly
              hours_to_show: 12
    - type: grid
      columns: 2
      square: false
      view_layout: {grid-area: energy}
      cards:
        - type: tile
          entity: sensor.octopus_energy_electricity_REPLACE_SERIAL_REPLACE_MPAN_current_demand
          name: Using now
          features:
            - type: trend-graph
              hours_to_show: 6
        - type: tile
          entity: sensor.octopus_energy_electricity_REPLACE_SERIAL_REPLACE_MPAN_current_rate
          name: Agile now
    - type: grid
      columns: 2
      square: false
      view_layout: {grid-area: climate}
      cards:
        - type: tile
          entity: climate.REPLACE_nest_thermostat
          features:
            - type: target-temperature
        - type: tile                      # optional EV
          entity: sensor.REPLACE_ev_battery_level
          features:
            - type: bar-gauge
              min: 0
              max: 100
    - type: custom:apexcharts-card        # see snippet 4
      view_layout: {grid-area: agile}
      # ...
    - type: custom:calendar-card-pro
      entities:
        - calendar.REPLACE_google
      days_to_show: 1
      show_past_events: false
      height: 248px
      view_layout: {grid-area: calendar}
    - type: grid
      columns: 5
      square: false
      view_layout: {grid-area: buttons}
      cards:                               # actions come from the app-launch research area
        - {type: shortcut, vertical: true, label: Shopping, icon: mdi:cart, tap_action: {action: navigate, navigation_path: /wall-panel/shopping}}
        - {type: shortcut, vertical: true, label: Spotify, icon: mdi:spotify, tap_action: {action: perform-action, perform_action: script.REPLACE_tablet_open_spotify}}
        - {type: shortcut, vertical: true, label: Claude, icon: mdi:microphone-message, tap_action: {action: perform-action, perform_action: script.REPLACE_tablet_open_claude_voice}}
        - {type: shortcut, vertical: true, label: Assistant, icon: mdi:google-assistant, tap_action: {action: perform-action, perform_action: script.REPLACE_tablet_open_assistant}}
        - {type: shortcut, vertical: true, label: Home, icon: mdi:home-export-outline, tap_action: {action: perform-action, perform_action: button.press, target: {entity_id: button.REPLACE_tablet_send_to_background}}}
```

```
# 4) Agile price chart (apexcharts-card v2.2.3) - past 2h + rest of today + tomorrow once published (~4pm)
type: custom:apexcharts-card
section_mode: true            # height:100% (use in sections view; harmless in grid-layout)
graph_span: 24h
span:
  start: hour
  offset: -2h
now:
  show: true
  label: Now
header:
  show: true
  title: Agile p/kWh
  show_states: false
yaxis:
  - min: ~0
    decimals: 0
apex_config:
  chart: {height: 200}         # tune on device so card fits its 248px row
  legend: {show: false}
  plotOptions: {bar: {columnWidth: 90%}}
all_series_config:
  type: column
  unit: p
  stroke_width: 0
  offset: -15min
  show: {legend_value: false, in_header: false}
  data_generator: |
    return entity.attributes.rates.map((r) => [new Date(r.start).getTime(), r.value_inc_vat * 100]);
series:
  - entity: event.octopus_energy_electricity_REPLACE_SERIAL_REPLACE_MPAN_current_day_rates
    name: Today
  - entity: event.octopus_energy_electricity_REPLACE_SERIAL_REPLACE_MPAN_next_day_rates
    name: Tomorrow
```

```
# 5) CORE FALLBACK: Sections view that fits 1280x800 with theme 'wallpanel' (gap 16/12): 3 columns of ~405px
#    each column <= 10 rows (64N-8 px); footer holds launch buttons
- title: Wall
  path: wall
  theme: wallpanel
  type: sections
  max_columns: 3
  sections:
    - type: grid
      column_span: 2               # 24-column grid inside, ~827px wide
      cards:
        - type: picture-entity
          entity: camera.REPLACE_nest_camera
          camera_view: live
          show_name: false
          show_state: false
          fit_mode: cover
          grid_options: {columns: full, rows: 7}
        - {type: clock, clock_size: medium, grid_options: {columns: 6, rows: 3}}
        - {type: tile, entity: sensor.octopus_energy_electricity_REPLACE_SERIAL_REPLACE_MPAN_current_demand, name: Using now, features: [{type: trend-graph, hours_to_show: 6}], grid_options: {columns: 6, rows: 3}}
        - {type: tile, entity: sensor.octopus_energy_electricity_REPLACE_SERIAL_REPLACE_MPAN_current_rate, name: Agile now, grid_options: {columns: 6, rows: 3}}
        - {type: tile, entity: climate.REPLACE_nest_thermostat, features: [{type: target-temperature}], grid_options: {columns: 6, rows: 3}}
    - type: grid
      column_span: 1
      cards:
        - {type: tile, entity: weather.REPLACE_home, features: [{type: temperature-forecast, forecast_type: hourly, hours_to_show: 12}], grid_options: {columns: full, rows: 2}}
        - {type: 'custom:apexcharts-card', section_mode: true, grid_options: {columns: full, rows: 4}}   # + snippet 4 body
        - {type: 'custom:calendar-card-pro', entities: [calendar.REPLACE_google], days_to_show: 1, grid_options: {columns: full, rows: 4}}
  footer:
    max_width: 1248
    card:
      type: grid
      columns: 5
      square: false
      cards: []                    # same shortcut cards as snippet 3
```

```
# 6) card-mod v4 per-card style (works on HA 2026.9 with upstream 4.2.1; avoid card-mod-*-yaml theme keys on HA >= 2026.8)
type: tile
entity: sensor.REPLACE
card_mod:
  style: |
    ha-card {
      height: 100%;
      overflow: hidden;
      --ha-card-background: rgba(0,0,0,0.35);
    }
```

```
# 7) Temporary probe to read the tablet's real CSS viewport (needs button-card; delete afterwards)
type: custom:button-card
show_icon: false
update_timer: 5s
name: "[[[ return `${window.innerWidth} x ${window.innerHeight} CSS px @ DPR ${window.devicePixelRatio}`; ]]]"
```

```
# 8) Shopping-list subview (core) reachable from the Shopping shortcut
- title: Shopping
  path: shopping
  subview: true
  back_path: /wall-panel/wall
  type: panel
  cards:
    - type: todo-list
      entity: todo.shopping_list
```

## Gotchas

- layout-card is unmaintained: no commits since 2025-10-28 and no maintainer responses to 2026 issues. Pin v2.4.7, keep the config to grid-* keys, edit in YAML (the visual editor on custom:grid-layout logs errors, #334), and keep the Sections-view fallback ready in case a future HA frontend release breaks it.
- layout-card grid layout ignores keys that do not start with 'grid' (so `gap:` does nothing; use `grid-gap:`) and ignores `card_margin` (every card gets `var(--masonry-view-card-margin, 4px 4px 8px)`; set that variable in the view theme).
- Use `minmax(0, 1fr)`, not bare `1fr`, for grid tracks. A bare 1fr has an auto minimum, so a tall card (calendar, chart) grows its row and pushes the panel into internal scroll. Setting `height` turns on overflow-y:auto inside #root.
- layout-card #root is content-box: `height: 100vh` plus `padding: 8px` overflows by 16px. Use `height: calc(100vh - 16px)`. `100dvh` also works if the Android System WebView is recent (Chrome 108+).
- Cards inside grid-layout are not told they are in a grid, so many keep their natural height (e.g. picture-entity follows aspect_ratio). Size the camera track to 16:9 of its column width, or force `ha-card {height:100%}` via card-mod. apexcharts `section_mode: true` sets height:100%, but the chart's own height may still need `apex_config.chart.height`.
- Sections view reflows by viewport width: below ~1088 CSS px (default gaps) it drops to 2 columns and the fixed layout breaks. Confirm the tablet's real CSS viewport (snippet 7). A Tab M10 FHD at DPR 1.5 gives 1280x800 and a Tab M10 Plus Gen 3 (2000x1200) gives about 1333x800, minus any Android status/nav bars that Fully Kiosk does not hide.
- In a column_span: 2 section the inner grid is 24 columns (12 x span), so `columns: 6` is a quarter of the width, not half.
- The sections view is designed to scroll. It is only scroll-free if each column's rows add up to 10 or fewer at 800px height (with the wallpanel theme gaps and a footer about 100px tall), and cards with `rows: auto` can exceed that.
- kiosk-mode with header and sidebar hidden leaves no native way back to settings on the tablet. Use a dedicated non-admin tablet user with `non_admin_settings`, or `?disable_km`. kiosk-mode does nothing on the auto-generated default dashboard.
- kiosk-mode follows HA frontend internals (major versions 10, 11 and 14 were each needed for HA 2026.2, 2026.3 and 2026.6). Update kiosk-mode before or with each HA upgrade, and read its release notes before upgrading HA.
- card-mod upstream 4.2.1: `card-mod-*-yaml` theme keys have been broken since HA 2026.8 (issue #606), and more-info/adaptive-dialog theme styling since 2026.3. Per-card `card_mod: style:` works. If a -yaml theme is ever needed, the options are UIX (integration, `uix:` key; open Android WebView hang report #589 in Fully Kiosk) or the trooperthorn/ha_card-mod fork. Do not load two card-mod copies (card-mod 4.2+ warns about duplicate patching).
- apexcharts-card has had no release since 2025-08-21 and has an open memory leak (#1107): chart instances are not destroyed when a card disconnects (view/dashboard switches, edit/save). On an always-on tablet, keep the chart on the single main view, avoid frequent view hopping, and reload the page nightly (Fully Kiosk 'Load start URL' button via an automation, or Fully's own scheduled reload).
- Agile `rates` values are GBP incl. VAT, so multiply by 100 for p/kWh. The *_day_rates event entities are disabled by default, and next_day_rates only fills in after Octopus publishes (around 4pm).
- Core history-graph and statistics-graph cannot show future prices, so do not plan on replacing apexcharts with them for 'rest of today'. The no-chart alternative is octopus-energy-rates-card (a table).
- The HA Companion kiosk mode (native hass.kioskMode) is documented for iOS only. In Fully Kiosk the NemesisRE kiosk-mode plugin is the only way to hide the header and sidebar.
- Fully Kiosk integration actions (start_application, load_url, the buttons) need Fully Plus with Remote Admin enabled. The exact button entity ids depend on the Fully device name (UNVERIFIED slugs).

## Setup steps

- In HACS > Dashboard, download: Kiosk Mode (NemesisRE/kiosk-mode), layout-card (thomasloven/lovelace-layout-card), ApexCharts Card (RomRider/apexcharts-card) and optionally Calendar Card Pro (alexpfau/calendar-card-pro). Only add card-mod (thomasloven/lovelace-card-mod) if a style tweak really needs it. Check Settings > Dashboards > ... > Resources for /hacsfiles/<repo>/<file>.js entries, then reload the browser.
- Create a dedicated HA user for the tablet (non-admin, e.g. 'Wall Panel') and sign in as that user in Fully Kiosk.
- Settings > Dashboards > Add dashboard > 'New dashboard from scratch' (e.g. URL wall-panel). Open it > Edit > ... > Raw configuration editor and paste the kiosk_mode block plus the views (snippets 1, 3, 4, 8, or 5 for the core fallback).
- Add the 'wallpanel' theme (snippet 2) under frontend: themes: in configuration.yaml and reload themes (Developer/Settings tools > YAML > Themes, or restart).
- Octopus Energy integration: enable the event.*_current_day_rates and *_next_day_rates entities (disabled by default) and replace REPLACE_SERIAL / REPLACE_MPAN in the snippets.
- On the tablet, temporarily add the viewport probe (snippet 7) to read the real CSS width, height and DPR. Adjust grid-template-rows/columns (or Sections rows) to match, then remove the probe.
- Set Fully Kiosk's start URL to http://<ha-host>:8123/wall-panel/wall (add ?kiosk if you prefer URL-driven kiosk mode) and enable its fullscreen / hide-system-bars options so the viewport is the full 800px tall (exact Fully setting names are UNVERIFIED here).
- Add an automation that presses the Fully 'Load start URL' button nightly (e.g. 03:30) to clear apexcharts memory growth. Keep HA and kiosk-mode updates in step and check the release notes of layout-card, kiosk-mode and card-mod before each monthly HA upgrade.

## Open questions

- Exact tablet model and real CSS viewport in Fully Kiosk (Tab M10 HD 1280x800 @DPR1 vs Tab M10 FHD 1920x1200 @1.5 vs Tab M10 Plus Gen3 2000x1200 -> ~1333x800), and whether the Android status/nav bars are hidden. This determines the pixel values in grid-template-rows.
- Does the user have or want Fully Plus? It is needed for the core fully_kiosk integration (start_application, send to background, load start URL) used by the launch buttons and the nightly reload.
- Is a chart required for Agile, or would the coloured table (octopus-energy-rates-card) do? The table avoids depending on apexcharts, which has had no release since 2025-08 and has an open memory leak.
- Should the chart be under the camera (wide, suits 48 half-hour bars) as suggested, or on the right column as in the original brief (narrower, about 500px)?
- Does picture-entity fill a fixed-height grid-layout cell on the user's 2026.9.3 harness without card-mod? This is unverified; the snippet assumes aspect_ratio 16:9 with tracks sized to match.
- Does the Android Companion app (if used instead of Fully) expose the native kiosk_mode/set, which would make the NemesisRE plugin unnecessary there? This is unverified; only iOS kiosk mode is documented.
