"""Mock numbers."""

from homeassistant.components.number import NumberEntity


async def async_setup_platform(hass, config, async_add_entities, discovery_info=None):
    async_add_entities([MockNumber(spec) for spec in discovery_info])


class MockNumber(NumberEntity):
    _attr_should_poll = False

    def __init__(self, spec):
        self.entity_id = spec["entity_id"]
        self._attr_name = spec.get("name")
        self._attr_native_min_value = spec.get("min", 0)
        self._attr_native_max_value = spec.get("max", 255)
        self._attr_native_value = spec.get("state", 0)

    async def async_set_native_value(self, value):
        self._attr_native_value = value
        self.async_write_ha_state()
