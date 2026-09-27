# Google Calendar and weather

> Research for the earlier Home Assistant plan (superseded by the web app on 25 Sep 2026). Kept for reference; many facts still apply.

**Area:** Google Calendar (today's events) and outside weather on the HA wall dashboard

## Recommendation

Calendar: use the core Google Calendar integration (domain `google`), set up with your own Google Cloud OAuth "Web application" client. Show the events with the HACS card Calendar Card Pro (`custom:calendar-card-pro`, v4.2.0, released September 2026). Of the three candidate cards it is the most active, it is in the HACS default list, it has a visual editor and caching, and it can show today plus tomorrow as a compact list with weather icons in the day headers. The built-in `calendar` card has no today-only list: `listWeek` is a rolling 7-day list and `dayGridDay` is a single-day grid, so use it only if you want to avoid HACS. Weather: Met.no is created automatically during onboarding as `weather.forecast_home`, needs no key and works on day one, so point the cards at it first. For UK-native forecasts, add the core Met Office integration afterwards. Met Office retired DataPoint on 1 Dec 2025 (the old API had been due to stop in March 2025), and the HA integration now uses Met Office Weather DataHub. It needs a free DataHub API key with a "Site Specific Global Spot" subscription (360 calls/day, enough for one location) and updates every 15 minutes, against 55–65 minutes for Met.no. For the panel's top-left, use `custom:clock-weather-card` (HACS default, v2.9.5 released 2026-09-23), or the built-in `clock` + `weather-forecast` cards if you want no HACS. Any template sensors built on forecasts must call `weather.get_forecasts` in a trigger-based template, because the `forecast` attribute was removed in 2024.

## Facts

- Google Calendar integration domain is `google` (title 'Google Calendar'). It is config-flow only; YAML `google:` config has been removed (CONFIG_SCHEMA = cv.removed). It depends on `application_credentials`, iot_class cloud_polling, requirements gcal-sync==9.2.0. _(source: https://raw.githubusercontent.com/home-assistant/core/dev/homeassistant/components/google/manifest.json and __init__.py)_
- Credentials: the recommended type is a Google Cloud 'Web application' OAuth client with Authorized redirect URI exactly `https://my.home-assistant.io/redirect/oauth`. Enable the 'Google Calendar API' (calendar-json.googleapis.com). In the Google Auth Platform set Audience=External, add App domain https://home-assistant.io and Authorized domain home-assistant.io, then set Publishing status to 'Publish app', otherwise credentials expire every 7 days. The client secret cannot be retrieved after the dialog is closed. _(source: https://raw.githubusercontent.com/home-assistant/home-assistant.io/current/source/_includes/integrations/google_client_secret.md)_
- Each calendar in the Google account's calendar list becomes an entity `calendar.<slug of calendar summary>` (e.g. a calendar named Personal -> `calendar.personal`). The primary calendar's summary is the account email, so it becomes e.g. `calendar.yourname_gmail_com`. Shared or subscribed calendars in your list (e.g. a Family calendar, 'Holidays in United Kingdom') also become entities. _(source: core google/__init__.py get_calendar_info() generate_entity_id('{}', calendar['summary']); docs source _integrations/google.markdown; email-slug pattern from community search results)_
- The primary calendar also gets a separate 'Birthdays' calendar entity (translation_key birthdays) and a 'Working location' entity that is disabled by default. _(source: https://raw.githubusercontent.com/home-assistant/core/dev/homeassistant/components/google/calendar.py (_get_entity_descriptions))_
- The Google Calendar integration polls every 15 minutes (MIN_TIME_BETWEEN_UPDATES = 15 min). Events you have declined are filtered out. For auto-discovered calendars ignore_availability defaults to True, so events marked 'Free' (e.g. all-day events) are still shown. _(source: core google/coordinator.py, calendar.py _event_filter, __init__.py _SINGLE_CALSEARCH_CONFIG default=True)_
- Google Calendar options flow offers calendar_access 'read_write' (default, scope https://www.googleapis.com/auth/calendar) or 'read_only' (calendar.readonly). With read_write, calendar.create_event is available for writable calendars. _(source: core google/const.py and config_flow.py)_
- Calendar entity attributes (next event only): all_day, message, description, location, start_time, end_time, plus offset_reached. Use calendar.get_events for lists of events. _(source: _integrations/google.markdown and core google/calendar.py)_
- The calendar.get_events action takes start_date_time, end_date_time or duration, and returns {"<entity_id>": {"events": [{start, end, summary, description, location, ...}]}}. All-day events have a date-only start string. _(source: core calendar/services.yaml and calendar/__init__.py async_get_events_service)_
- Built-in calendar card: type `calendar`, options title, initial_view (dayGridMonth [default] | dayGridDay | listWeek; listWeek = next 7 days, not a calendar week), entities (required), theme. HA 2026.10 (currently in next-branch docs) adds show_add_event, add_event_style (header|below|on_top) and add_event_size (small|medium|large). Current release is 2026.9.3 (released 2026-09-18). _(source: home-assistant.io current & next source/_dashboards/calendar.markdown; frontend src/panels/lovelace/cards/types.ts; home-assistant.io _config.yml)_
- The calendar card switches to narrow mode below 870px width and always shows the month/day/list view-toggle header. Setting grid_options.rows: auto gives auto height in sections view. _(source: frontend src/panels/lovelace/cards/hui-calendar-card.ts)_
- Calendar Card Pro (alexpfau/calendar-card-pro) is v4.2.0 (package.json), released about early September 2026, and is in the HACS default plugin list. Key options: entities (string or object with entity/label/color/accent_color/...), view list|column, start_date (default today), days_to_show (default 3), show_empty_days, empty_day_text, show_past_events (default false), show_location, show_month, today_indicator, allday_badge off|title|time, time_24h, filter_duplicates, max_height/height, refresh_interval (minutes, default 30), weather {entity, position none|date|event|both, date{show_conditions, show_high_temp, show_low_temp}}, tap_action (supports action: expand), compact_events_to_show. _(source: https://raw.githubusercontent.com/alexpfau/calendar-card-pro/main/docs/reference/configuration.md, docs/features/weather.md, README.md; hacs/default plugin list)_
- Alternatives are alive but less feature-rich for this use. week-planner-card (FamousWolf) is v1.14.1 with options days, startingDay, hidePastEvents, compact, hideDaysWithoutEvents, weather. atomic-calendar-revive is v10.3.1 (10.3.0 released 2026-05-25). All three are in HACS default. _(source: raw package.json of each repo; hacs/default plugin list; newreleases.io search snippet)_
- Met Office DataPoint was retired, fully decommissioned on 1 Dec 2025. The HA `metoffice` integration was migrated to the Met Office Weather DataHub API (core PR #131425, around HA 2025.4). Old DataPoint keys no longer work. _(source: metoffice.gov.uk DataPoint retirement FAQ (search), github.com/home-assistant/core/pull/131425 (search), community thread 'After recent 2025.4.1 upgrade Met Office integration no longer working')_ **[unverified]**
- Met Office integration (domain `metoffice`, library datapoint==0.12.1, quality bronze) needs an API key from a datahub.metoffice.gov.uk account subscribed to 'Site Specific Global Spot'. The free tier gives 360 calls/day, which limits you to one location. Config fields: API key, latitude, longitude. It updates every 15 minutes and provides hourly (3 days), twice-daily and daily (7 days) forecasts. _(source: https://raw.githubusercontent.com/home-assistant/home-assistant.io/current/source/_integrations/metoffice.markdown; core metoffice/const.py DEFAULT_SCAN_INTERVAL)_
- Met Office entity naming: the device is named 'Met Office <site_name>', where site_name is the nearest site returned by the API (not typed by the user). The weather entity has no name of its own, so its id is `weather.met_office_<site_slug>`. Sensors are `sensor.met_office_<site_slug>_temperature`, `_weather`, `_wind_speed`, `_probability_of_precipitation`, `_uv_index`, etc. Feels-like, humidity, pressure, wind direction, gust and visibility sensors are disabled by default. _(source: core metoffice/__init__.py get_device_info, weather.py (_attr_name=None), sensor.py, config_flow.py)_
- Met.no (domain `met`) is created automatically during HA onboarding (along with shopping_list, radio_browser and google_translate), tracking the home location. The entity is `weather.forecast_home` (device 'Forecast' + name 'Home'). No API key. It polls every 55–65 minutes and provides daily and hourly forecasts. _(source: core onboarding/views.py, met/weather.py, met/config_flow.py; docs _integrations/met.markdown)_
- Open-Meteo (domain `open_meteo`) needs no key and is configured per zone. The entity is named after the zone, e.g. `weather.home`. It polls every 30 minutes and provides daily and hourly forecasts. It is free for non-commercial use. _(source: _integrations/open_meteo.markdown; core open_meteo/weather.py)_
- Forecasts are no longer weather-entity attributes. Use the `weather.get_forecasts` action (type daily|hourly|twice_daily) with response_variable, in a trigger-based template. The response is keyed by entity_id: `resp['weather.x'].forecast[0].temperature`. _(source: _integrations/weather.markdown; core weather/services.yaml)_
- Built-in weather-forecast card: type `weather-forecast`, entity (required), forecast_type daily|hourly|twice_daily, show_current, show_forecast, secondary_info_attribute (extrema or one of dew_point, air_pressure, humidity, temperature, visibility, wind_speed, wind_gust_speed, precipitation), round_temperature, theme, and tap/hold/double_tap actions. The frontend source also accepts an undocumented `forecast_slots` (default 5). _(source: _dashboards/weather-forecast.markdown; frontend hui-weather-forecast-card.ts and types.ts; frontend en.json)_
- Built-in clock card: type `clock`, clock_style digital|analog, clock_size small|medium|large, show_seconds, no_background, time_format, time_zone. _(source: _dashboards/clock.markdown)_
- clock-weather-card (pkissling), v2.9.5 released 2026-09-23. Options: entity (required), title, sun_entity, temperature_sensor, humidity_sensor, weather_icon_type line|fill, animated_icon (default true), forecast_rows (default 5), locale, time_format 24|12, time_pattern, date_pattern, show_humidity, hide_today_section, hide_forecast_section, hide_clock, hide_date, hourly_forecast, use_browser_time, time_zone, show_decimal, apparent_sensor, aqi_sensor. HACS resource url /hacsfiles/clock-weather-card/clock-weather-card.js. _(source: https://raw.githubusercontent.com/pkissling/clock-weather-card/master/README.md and CHANGELOG.md)_

## Config snippets

```
# Calendar Card Pro: today + tomorrow, compact list for a wall panel (HACS: 'Calendar Card Pro')
type: custom:calendar-card-pro
entities:
  - entity: calendar.yourname_gmail_com   # primary calendar = email slug; rename in UI if you like
    accent_color: '#03a9f4'
  - entity: calendar.family               # any shared calendar in your Google list
    accent_color: '#ff6c92'
  - entity: calendar.holidays_in_united_kingdom   # only if subscribed in Google Calendar (UNVERIFIED name)
    accent_color: '#9e9e9e'
days_to_show: 2          # today + tomorrow; use 1 for today only
show_empty_days: true
empty_day_text: Nothing planned
show_past_events: false
show_location: false
show_month: false
today_indicator: true
allday_badge: title
time_24h: true
filter_duplicates: true
max_height: 420px
refresh_interval: 15     # matches the integration's 15-min poll
weather:
  entity: weather.forecast_home
  position: date
  date:
    show_conditions: true
    show_high_temp: true
    show_low_temp: true
```

```
# Built-in (no HACS) calendar card, today-only grid
type: calendar
initial_view: dayGridDay     # or listWeek = rolling 7-day list
entities:
  - calendar.yourname_gmail_com
  - calendar.family
grid_options:
  columns: 12
  rows: 6                    # or 'auto'
```

```
# No-HACS fallback: today's events from several calendars as a sensor + markdown card
# configuration.yaml
template:
  - triggers:
      - trigger: time_pattern
        minutes: /15
      - trigger: homeassistant
        event: start
    actions:
      - action: calendar.get_events
        target:
          entity_id:
            - calendar.yourname_gmail_com
            - calendar.family
        data:
          start_date_time: "{{ today_at('00:00') }}"
          end_date_time: "{{ today_at('00:00') + timedelta(days=1) }}"
        response_variable: cal
    sensor:
      - name: Todays events
        unique_id: todays_events
        state: "{{ cal.values() | map(attribute='events') | sum(start=[]) | count }}"
        attributes:
          events: "{{ cal.values() | map(attribute='events') | sum(start=[]) | sort(attribute='start') | list }}"
# Dashboard card
type: markdown
content: >
  {% set evs = state_attr('sensor.todays_events','events') or [] %}
  {% if not evs %}Nothing today{% endif %}
  {% for e in evs %}
  **{{ 'All day' if 'T' not in e.start else as_datetime(e.start).strftime('%H:%M') }}** {{ e.summary }}
  {% endfor %}
# (UNVERIFIED as a whole: Jinja list concatenation via sum(start=[]) is a common community pattern; test in Developer Tools > Template)
```

```
# Built-in weather card, hourly (swap to daily for the 7-day view)
type: weather-forecast
entity: weather.forecast_home      # or weather.met_office_<site> / weather.home (Open-Meteo)
forecast_type: hourly               # daily | hourly | twice_daily
show_current: true
show_forecast: true
round_temperature: true
secondary_info_attribute: precipitation
forecast_slots: 8                   # undocumented, in frontend source; default 5
```

```
# clock-weather-card (HACS) for the panel's top-left
type: custom:clock-weather-card
entity: weather.forecast_home
sun_entity: sun.sun
locale: en-GB
time_format: 24
date_pattern: cccc d LLLL
forecast_rows: 5
hourly_forecast: false
weather_icon_type: fill
animated_icon: false     # can lighten the load on a low-end tablet WebView
show_decimal: false
```

```
# Built-in alternative clock
type: clock
clock_style: digital
clock_size: large
no_background: true
time_format: '24'
```

```
# Trigger-based template sensors from forecasts (forecast attribute no longer exists)
template:
  - triggers:
      - trigger: time_pattern
        minutes: /30
      - trigger: homeassistant
        event: start
    actions:
      - action: weather.get_forecasts
        data:
          type: daily
        target:
          entity_id: weather.forecast_home
        response_variable: daily
      - action: weather.get_forecasts
        data:
          type: hourly
        target:
          entity_id: weather.forecast_home
        response_variable: hourly
    sensor:
      - name: Outside high today
        unique_id: outside_high_today
        device_class: temperature
        unit_of_measurement: '°C'
        state: "{{ daily['weather.forecast_home'].forecast[0].temperature }}"
      - name: Outside low today
        unique_id: outside_low_today
        device_class: temperature
        unit_of_measurement: '°C'
        state: "{{ daily['weather.forecast_home'].forecast[0].templow }}"
      - name: Rain chance next 3h
        unique_id: rain_chance_next_3h
        unit_of_measurement: '%'
        state: "{{ hourly['weather.forecast_home'].forecast[:3] | map(attribute='precipitation_probability') | map('int', 0) | max }}"
```

## Gotchas

- If the Google OAuth app stays in 'Testing', the refresh token expires every 7 days and the calendar silently stops. Click 'Publish app' under Audience. The 'Google hasn't verified this app' screen during linking is expected: choose Advanced, then continue.
- The redirect URI must be exactly https://my.home-assistant.io/redirect/oauth, on a *Web application* client, not Desktop or Device. New credentials can take minutes (Google says up to 5 hours) to become active.
- The primary calendar's entity id is the slugified email (e.g. calendar.yourname_gmail_com), not 'calendar.personal'. Rename it in Settings > Entities for tidier YAML. Birthdays arrive as a separate calendar entity.
- Only calendars in your own Google calendar list appear. To show a partner's calendar, have them share it with your Google account (it then appears after reloading the integration), or add a second Google Calendar config entry for their account.
- Events appear up to 15 minutes late, because the integration polls every 15 minutes. Declined events are hidden.
- The built-in calendar card has no today-only list: listWeek is 7 rolling days and dayGridDay is a single-day grid with a view-switcher header you cannot hide without card-mod. That is why Calendar Card Pro is recommended.
- The Calendar Card Pro README still says to add it as a HACS custom repository, but it is in the HACS default list, so just search 'Calendar Card Pro' in HACS. v4 ships two JS files (calendar-card-pro.js + editor.js), which matters only for manual installs.
- After installing or updating any HACS card, clear the cache in Fully Kiosk / Android WebView. Otherwise the tablet keeps the old JS and shows 'Custom element doesn't exist'.
- Weather entities no longer have a `forecast` attribute (removed in 2024). Old templates using state_attr('weather.x','forecast') return None. Use weather.get_forecasts in a trigger-based template sensor, and make sure custom cards are recent versions that subscribe to forecasts.
- Met Office: DataPoint keys are dead. You need a Weather DataHub key subscribed to 'Site Specific Global Spot'. The free tier (360 calls/day) supports one location only, so do not add the integration twice. The entity id comes from the nearest Met Office site name (weather.met_office_<site>), so you cannot predict it before setup.
- Met.no's weather.forecast_home follows the HA home location. Check Settings > System > General has your real coordinates, not the Amsterdam default (52.37, 4.89).
- Entity names differ between providers: Met.no is weather.forecast_home, Open-Meteo is weather.home (zone name), Met Office is weather.met_office_<site>. Switching provider means updating every card that references the entity.
- clock-weather-card's animated icons and a ticking clock redraw constantly. On a budget Lenovo M10 WebView, set animated_icon: false if the dashboard feels sluggish (advice, not measured).
- HA 2026.10 will add show_add_event to the built-in calendar card. It is not in 2026.9.x, so don't use it yet.

## Setup steps

- In Google Cloud Console, create a project (e.g. 'Home Assistant') and enable the 'Google Calendar API'.
- In Google Auth Platform > Branding > Get started, set the app name to Home Assistant, choose your email, Audience = External, and give contact details. Set App domain links to https://home-assistant.io and add Authorized domain home-assistant.io.
- Under Audience, click 'Publish app' so tokens don't expire every 7 days.
- Under Clients > Create client, choose type 'Web application' with Authorized redirect URI https://my.home-assistant.io/redirect/oauth. Copy the Client ID and Client Secret now, because you cannot see the secret again.
- In HA, go to Settings > Devices & services > Add integration > Google Calendar, paste the Client ID and Secret (saved as Application Credentials), sign in, accept the unverified-app warning, then choose 'Link account'. Do this from a browser on your home network. Optionally set Options > calendar access to Read-only.
- In Settings > Entities, filter by 'calendar.'. Rename the email-named primary calendar (e.g. calendar.sam), disable unwanted calendars (Birthdays, holidays), and set each calendar's colour and icon, which Calendar Card Pro can follow with accent_color: home-assistant.
- Install HACS if you don't have it. In HACS, search for and download 'Calendar Card Pro' and 'clock-weather-card', then clear the Fully Kiosk cache and reload the tablet.
- Weather, zero setup: confirm weather.forecast_home exists (Met.no, created at onboarding) and that your home location is correct under Settings > System > General.
- Weather, optional UK Met Office: register at datahub.metoffice.gov.uk, subscribe to the free 'Site Specific' Global Spot plan, and copy the API key. In HA, go to Add integration > Met Office and enter the key plus your latitude/longitude. Note the created entity id weather.met_office_<site> and swap it into the cards.
- Add the cards to the dashboard: clock-weather-card (or clock + weather-forecast) plus Calendar Card Pro with days_to_show: 1 or 2.

## Open questions

- Which Google calendars should the panel show: only the user's primary, a shared Family calendar, a partner's calendar (needs sharing or a second config entry), UK bank holidays?
- Will the user sign up for a free Met Office DataHub account, or is zero-setup Met.no good enough? It is UNVERIFIED whether DataHub free signup asks for payment details.
- It is UNVERIFIED whether the Met Office 'Site Specific Global Spot' data uses the high-res UKV model for UK points, and which model Open-Meteo's best_match picks for UK locations. This matters only if forecast accuracy is the deciding factor.
- Exact Lenovo M10 variant and orientation (HD 1280x800 vs Plus/Gen3 1920x1200, landscape or portrait). This decides whether Calendar Card Pro should use list or column view and how many forecast rows fit.
- Is the 'forecast_slots' option of the built-in weather-forecast card in the current released frontend (2026.9)? It was seen in dev-branch frontend source and is undocumented. Test before relying on it.
- Should today's agenda also be spoken on request (e.g. 'what's on today')? That is a voice/LLM-area decision. HA Assist with an LLM agent or Gemini on the tablet can read calendar entities, but it is outside this card-level research.
