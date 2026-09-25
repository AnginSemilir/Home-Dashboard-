"""Mock event entities (Octopus Energy style rate events)."""

from homeassistant.components.event import EventEntity

from .common import day_rates


async def async_setup_platform(hass, config, async_add_entities, discovery_info=None):
    entities = [MockEvent(spec) for spec in discovery_info]
    async_add_entities(entities)
    by_id = {e.entity_id: e for e in entities}

    async def fire(call):
        """panel_mock.fire_event: make an event entity fire (e.g. a doorbell ring)."""
        ent = by_id[call.data["entity_id"]]
        ent._trigger_event(call.data["event_type"], call.data.get("attributes"))
        ent.async_write_ha_state()

    hass.services.async_register("panel_mock", "fire_event", fire)


class MockEvent(EventEntity):
    _attr_should_poll = False

    def __init__(self, spec):
        self.entity_id = spec["entity_id"]
        self._attr_name = spec.get("name")
        self._event_type = spec.get("event_type")
        self._attr_event_types = spec.get("event_types") or [self._event_type]
        self._spec = spec

    async def async_added_to_hass(self):
        if not self._event_type:  # e.g. a doorbell that hasn't rung yet
            return
        attrs = dict(self._spec.get("attributes", {}))
        if "rates_day_offset" in self._spec:
            attrs["rates"] = day_rates(self._spec["rates_day_offset"], self._spec.get("slot_minutes", 30))
        self._trigger_event(self._event_type, attrs)
        self.async_write_ha_state()
