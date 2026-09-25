"""Mock buttons (count their presses in an attribute)."""

from homeassistant.components.button import ButtonEntity


async def async_setup_platform(hass, config, async_add_entities, discovery_info=None):
    async_add_entities([MockButton(spec) for spec in discovery_info])


class MockButton(ButtonEntity):
    _attr_should_poll = False

    def __init__(self, spec):
        self.entity_id = spec["entity_id"]
        self._attr_name = spec.get("name")
        self._presses = 0

    @property
    def extra_state_attributes(self):
        return {"presses": self._presses}

    async def async_press(self):
        self._presses += 1
        self.async_write_ha_state()
