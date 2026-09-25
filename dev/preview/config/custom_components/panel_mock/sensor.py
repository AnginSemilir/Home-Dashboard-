"""Mock sensors with explicit entity ids."""

from homeassistant.components.sensor import SensorEntity

from .common import current_slot, day_rates


async def async_setup_platform(hass, config, async_add_entities, discovery_info=None):
    async_add_entities([MockSensor(spec) for spec in discovery_info])


class MockSensor(SensorEntity):
    _attr_should_poll = False

    def __init__(self, spec):
        self.entity_id = spec["entity_id"]
        self._attr_name = spec.get("name")
        self._attr_native_unit_of_measurement = spec.get("unit")
        self._attr_device_class = spec.get("device_class")
        self._attr_state_class = spec.get("state_class")
        self._attr_icon = spec.get("icon")
        self._attr_suggested_display_precision = spec.get("precision")
        self._attrs = dict(spec.get("attributes", {}))
        state = spec.get("state")
        if state == "__agile_current__":
            slot = current_slot(day_rates(0))
            state = slot["value_inc_vat"]
            self._attrs.update(start=slot["start"], end=slot["end"])
        self._attr_native_value = state

    @property
    def extra_state_attributes(self):
        return self._attrs
