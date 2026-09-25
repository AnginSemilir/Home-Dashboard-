# Weather

**Default: Met.no (Norwegian Meteorological Institute).** Home Assistant sets this up
automatically when you first install it, as `weather.forecast_home`. It needs no account or
key, so the panel's weather works on day one.

Check **Settings → System → General**: your home location must be correct. The default is
Amsterdam.

## Optional: Met Office forecasts

To use UK Met Office data instead:

1. Register at <https://datahub.metoffice.gov.uk>. Subscribe to the free **Site Specific**
   ("Global Spot") plan and copy the API key. The free tier allows 360 calls a day, which
   covers one location. The old DataPoint keys stopped working in December 2025.
2. Home Assistant → Add integration → **Met Office** → enter the key and your
   latitude/longitude.
3. The weather entity is named after the nearest Met Office site, e.g.
   `weather.met_office_<site>`. Put that in the `weather` setting at the top of the
   dashboard.

Met Office updates every 15 minutes. Met.no updates about once an hour.

**Card:** [clock-weather-card](https://github.com/pkissling/clock-weather-card) (HACS). It shows
a big clock, the date, current conditions and a 4-day forecast in one card. Animated icons
are turned off to keep the tablet's browser light.
