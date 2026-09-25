"""Mock thermostat."""

from homeassistant.components.climate import ClimateEntity, ClimateEntityFeature, HVACAction, HVACMode


async def async_setup_platform(hass, config, async_add_entities, discovery_info=None):
    async_add_entities([MockClimate(spec) for spec in discovery_info])


class MockClimate(ClimateEntity):
    _attr_should_poll = False
    _attr_temperature_unit = "°C"
    _attr_hvac_modes = [HVACMode.OFF, HVACMode.HEAT]
    _attr_supported_features = ClimateEntityFeature.TARGET_TEMPERATURE | ClimateEntityFeature.TURN_ON | ClimateEntityFeature.TURN_OFF
    _attr_target_temperature_step = 0.5

    def __init__(self, spec):
        self.entity_id = spec["entity_id"]
        self._attr_name = spec.get("name")
        self._attr_current_temperature = spec.get("current_temperature", 20.5)
        self._attr_target_temperature = spec.get("target_temperature", 21.0)
        self._attr_current_humidity = spec.get("current_humidity", 48)
        self._attr_hvac_mode = HVACMode.HEAT
        self._attr_hvac_action = HVACAction.HEATING if spec.get("heating") else HVACAction.IDLE

    async def async_set_temperature(self, **kwargs):
        self._attr_target_temperature = kwargs["temperature"]
        self.async_write_ha_state()

    async def async_set_hvac_mode(self, hvac_mode):
        self._attr_hvac_mode = hvac_mode
        self.async_write_ha_state()
