# Kia e-Niro battery level (optional)

**Verdict: free and fairly simple, as of September 2026, with one caveat.** Kia changes its
login every so often, and the unofficial integration then breaks for a few days until an
update is released. If that's more hassle than you want, delete the car tile from the
dashboard, or change it to a button that opens the Kia app. The rest of the panel doesn't
depend on it.

**Integration:** [Kia Uvo / Hyundai Bluelink](https://github.com/Hyundai-Kia-Connect/kia_uvo) (HACS, free).
Kia Connect itself is free for 7 years from activation, so until about 2028 for a 2021 car.

## Setup

1. Log in to the official **Kia** app on your phone at least once, accept any new terms, and
   check the car appears. Note the car's **nickname**.
2. HACS → search **Kia Uvo** → Download → restart Home Assistant.
3. Settings → Devices & services → Add integration → **Kia Uvo** → Region **Europe**, Brand **Kia**.
   Enter your normal Kia account email and password. The PIN is only needed for remote
   commands, so leave it blank.
   > Ignore 2025 guides that tell you to generate a "refresh token" with a script.
   > Since mid-2026 a normal password works, and those scripts use a login URL that
   > Kia now blocks.
4. Integration → **Configure**:
   - **Scan interval:** 30 min (the default) or 60. This reads cached data from Kia's cloud
     and does **not** wake the car.
   - **Force refresh interval:** 1440 (the default), or 9999 to almost never wake the car.
     Each forced refresh wakes the car and drains its 12 V battery.
   - Leave the quiet hours at 22 → 7.
5. Open the car's device page. The battery entity is `sensor.<nickname>_ev_battery_level`,
   e.g. `sensor.e_niro_ev_battery_level`. Put it in the `car_battery` setting at the top of
   the dashboard.

## Notes

- The percentage is whatever the car last uploaded, which it does when switched off and at
  some charging events. It can be a few hours old, especially mid-charge. Tap the tile to
  see the "Last updated" time.
- Kia's EU API allows about **200 calls a day**, shared with the Kia app on your phone.
  30-minute polling uses about 144. If the app starts complaining about "maximum number of
  daily vehicle checks", raise the scan interval to 60.
- Don't put lock/unlock or climate controls on a wall panel.
