# Installing the dashboard

The whole panel is one file: [`homeassistant/dashboard/wall-panel.yaml`](../homeassistant/dashboard/wall-panel.yaml).

## 1. Install the six cards from HACS

HACS → search each name → **Download** (all are in the default HACS list and free):

| Card | Used for |
|---|---|
| **Kiosk Mode** (NemesisRE) | Hides Home Assistant's header and sidebar on the panel |
| **layout-card** (thomasloven) | Fixed full-screen grid layout |
| **button-card** (custom-cards) | Price display and the app-launcher buttons |
| **ApexCharts Card** (RomRider) | Agile price chart |
| **Clock Weather Card** (pkissling) | Clock, date, weather and forecast |
| **Calendar Card Pro** (alexpfau) | Today's and tomorrow's events |

When HACS asks, reload the browser. HACS registers each card as a dashboard resource
automatically.

## 2. Fill in your settings

Open `wall-panel.yaml` in a text editor. The settings block at the top lists every entity
the panel uses. Replace the example IDs with yours. To find them, go to
**Settings → Entities** and search for the part in brackets:

| Setting | Example | Find it by searching |
|---|---|---|
| `camera` | `camera.front_door` | `camera.` |
| `thermostat` | `climate.hallway` | `climate.` |
| `weather` | `weather.forecast_home` | usually correct as is |
| `calendar` | `calendar.family` | `calendar.` (to show more than one calendar, see "Optional tweaks") |
| `car_battery` | `sensor.e_niro_ev_battery_level` | `ev_battery_level` |
| `octopus_*` | `…_22l4132637_1900026354329_…` | `current_demand`. Copy the serial_MPAN part and replace `22l4132637_1900026354329` everywhere |

## 3. Add the dashboard to Home Assistant

**Option A: paste it (simplest)**

1. Settings → Dashboards → **Add dashboard** → **New dashboard from scratch** → title
   "Wall panel", icon `mdi:tablet-dashboard` → **Create**.
2. Open it → pencil (**Edit dashboard**) → ⋮ → **Raw configuration editor**.
3. Select all, paste the edited file, **Save**, and close the editor.

Home Assistant expands the settings block when it saves, so afterwards each card holds its
own entity ID. To change a setting later, edit your copy of the file and paste the whole
thing again.

**Option B: keep it as a file (better if you'll tweak it)**

Copy the file to `/config/dashboards/wall_panel.yaml` (File editor app), then add this to
`configuration.yaml` and restart:

```yaml
lovelace:
  dashboards:
    wall-panel:
      mode: yaml
      filename: dashboards/wall_panel.yaml
      title: Wall panel
      icon: mdi:tablet-dashboard
      show_in_sidebar: true
```

After editing the file, open the dashboard → ⋮ → **Refresh**.

## 4. Open it on the tablet

The URL is `http://homeassistant.local:8123/wall-panel/home` (or use the Home Assistant
box's IP address). See [the tablet guide](tablet.md).

Kiosk mode hides Home Assistant's own menus. To get them back on the tablet (for example to
edit), add `?disable_km` to the URL.

## Optional tweaks

- **Battery-powered Nest camera:** replace the camera card with the "tap for live" tile shown
  in the comment next to it. Google cuts battery camera streams after 5 minutes.
- **Price colours:** the chart and the big price use blue for ≤0p (you're paid to use
  power), green below 15p, amber below 25p and red above that. The thresholds appear
  twice: in the chart's `ranges` and in the price card's `color` function.
- **No car integration:** delete the `e-Niro` tile, or change it to a button that opens the
  Kia app.
- **A second calendar:** add another entry under `entities:` in the calendar card.
