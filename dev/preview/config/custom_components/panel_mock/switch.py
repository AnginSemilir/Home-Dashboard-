"""Mock switches."""

from homeassistant.components.switch import SwitchEntity


async def async_setup_platform(hass, config, async_add_entities, discovery_info=None):
    async_add_entities([MockSwitch(spec) for spec in discovery_info])


class MockSwitch(SwitchEntity):
    _attr_should_poll = False

    def __init__(self, spec):
        self.entity_id = spec["entity_id"]
        self._attr_name = spec.get("name")
        self._attr_is_on = bool(spec.get("state"))

    async def async_turn_on(self, **kwargs):
        self._attr_is_on = True
        self.async_write_ha_state()

    async def async_turn_off(self, **kwargs):
        self._attr_is_on = False
        self.async_write_ha_state()
