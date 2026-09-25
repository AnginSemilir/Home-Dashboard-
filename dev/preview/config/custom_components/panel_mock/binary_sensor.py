"""Mock binary sensors."""

from homeassistant.components.binary_sensor import BinarySensorEntity


async def async_setup_platform(hass, config, async_add_entities, discovery_info=None):
    async_add_entities([MockBinary(spec) for spec in discovery_info])


class MockBinary(BinarySensorEntity):
    _attr_should_poll = False

    def __init__(self, spec):
        self.entity_id = spec["entity_id"]
        self._attr_name = spec.get("name")
        self._attr_device_class = spec.get("device_class")
        self._attr_is_on = bool(spec.get("state"))
