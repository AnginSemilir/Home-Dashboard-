# Octopus Energy: Home Mini live usage + Agile prices

**Integration:** [BottlecapDave/HomeAssistant-OctopusEnergy](https://github.com/BottlecapDave/HomeAssistant-OctopusEnergy)
(HACS default store, free). Tested against v19.x, which needs Home Assistant 2025.11 or newer.

## What the panel uses

| Panel item | Entity (your IDs will differ) | Notes |
|---|---|---|
| "Using now" (live watts) | `sensor.octopus_energy_electricity_<serial>_<mpan>_current_demand` | From the Home Mini, refreshed every minute |
| Today's kWh / £ | `sensor.octopus_energy_electricity_<serial>_<mpan>_current_accumulative_consumption` / `..._current_accumulative_cost` | Cost includes standing charge |
| Price now | `sensor.octopus_energy_electricity_<serial>_<mpan>_current_rate` | **£/kWh**; the panel converts to p/kWh |
| Rest of today / tomorrow chart | `event.octopus_energy_electricity_<serial>_<mpan>_current_day_rates` / `..._next_day_rates` | `rates` attribute: list of `{start, end, value_inc_vat, …}` |

`<serial>` is your meter serial in **lower case** and `<mpan>` is the 13-digit MPAN,
e.g. `sensor.octopus_energy_electricity_22l4132637_1900026354329_current_demand`.
The panel package (`homeassistant/packages/wall_panel.yaml`) finds these entities
automatically, so you normally don't have to type them anywhere.

> **About "15-minute" prices:** Agile Octopus is still priced in **30-minute slots**
> (48 a day). Tomorrow's prices are published between about 4pm and 8pm. The chart
> draws whatever slot length the data contains, so it will cope if Octopus ever
> moves to 15-minute slots.

## Setup

1. Check that live usage from the Home Mini shows in the Octopus app. The integration
   reads the same cloud data; it does **not** talk to the Home Mini on your network.
2. Find your **account number** (`A-XXXXXXXX`, top of the Octopus dashboard) and create
   or copy an **API key** at
   <https://octopus.energy/dashboard/new/accounts/personal-details/api-access>.
3. Home Assistant → **HACS** → search **Octopus Energy** (BottlecapDave) → **Download** → restart Home Assistant.
4. **Settings → Devices & services → Add integration → Octopus Energy → Account**
   - Account ID and API key from step 2.
   - Expand **Home Mini settings**, tick **I have a Home Mini** and leave the
     electricity refresh at **1 minute** (gas: 2–5 minutes if you have gas).
   - Leave the price-cap and intelligent settings empty.
5. Wait up to about 15 minutes for rates to load, then search **Settings → Entities** for
   `current_demand` to confirm the entity exists.

## Gotchas

- **Rate limit:** Octopus allows about **100 API calls per hour per account**, shared with the
  Octopus app. Electricity every 1 minute plus gas every 2 minutes uses about 90 of them.
  If you see `Too many requests … smartMeterTelemetry` in the logs, increase the gas
  interval (Integration → Reconfigure).
- `next_rate` is the next price that is **different** from the current one, not always the
  next slot. The panel therefore reads the `rates` list directly.
- `next_day_rates` is empty until tomorrow's prices are published. The chart copes with this.
- The Home Mini sometimes freezes (the integration's FAQ mentions hot weather).
  Unplugging it and plugging it back in fixes it.
- The integration's old *target rate* sensors were removed in v18. For "run the
  dishwasher in the cheapest 2 hours" automations use BottlecapDave's separate
  **Target Timeframes** integration. The panel only needs the display-only
  "cheapest slot" sensor in the package.
