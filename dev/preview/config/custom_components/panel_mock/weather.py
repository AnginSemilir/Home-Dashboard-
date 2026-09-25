"""Mock weather entity with daily + hourly forecasts."""

from datetime import timedelta

from homeassistant.components.weather import Forecast, WeatherEntity, WeatherEntityFeature
from homeassistant.util import dt as dt_util


async def async_setup_platform(hass, config, async_add_entities, discovery_info=None):
    async_add_entities([MockWeather(spec) for spec in discovery_info])


DAILY = [
    ("partlycloudy", 17, 9, 10),
    ("rainy", 15, 10, 70),
    ("cloudy", 16, 8, 20),
    ("sunny", 19, 9, 0),
    ("partlycloudy", 18, 11, 10),
    ("pouring", 14, 10, 90),
    ("sunny", 20, 12, 0),
]


class MockWeather(WeatherEntity):
    _attr_should_poll = False
    _attr_native_temperature_unit = "°C"
    _attr_native_wind_speed_unit = "mph"
    _attr_native_pressure_unit = "hPa"
    _attr_supported_features = WeatherEntityFeature.FORECAST_DAILY | WeatherEntityFeature.FORECAST_HOURLY

    def __init__(self, spec):
        self.entity_id = spec["entity_id"]
        self._attr_name = spec.get("name")
        self._attr_condition = spec.get("condition", "partlycloudy")
        self._attr_native_temperature = spec.get("temperature", 14.2)
        self._attr_humidity = spec.get("humidity", 72)
        self._attr_native_wind_speed = spec.get("wind_speed", 9)
        self._attr_wind_bearing = 225
        self._attr_native_pressure = 1012
        self._attr_native_apparent_temperature = spec.get("apparent_temperature", 12.8)

    async def async_forecast_daily(self):
        start = dt_util.start_of_local_day()
        return [
            Forecast(datetime=(start + timedelta(days=i, hours=12)).isoformat(), condition=c,
                     native_temperature=hi, native_templow=lo, precipitation_probability=p)
            for i, (c, hi, lo, p) in enumerate(DAILY)
        ]

    async def async_forecast_hourly(self):
        now = dt_util.now().replace(minute=0, second=0, microsecond=0)
        out = []
        for i in range(24):
            t = now + timedelta(hours=i)
            out.append(Forecast(datetime=t.isoformat(), condition="partlycloudy" if i % 5 else "rainy",
                                native_temperature=12 + 5 * (1 - abs(t.hour - 15) / 12),
                                precipitation_probability=(i * 7) % 60))
        return out
