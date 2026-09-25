"""Mock calendar with events today and tomorrow."""

from datetime import date, timedelta

from homeassistant.components.calendar import CalendarEntity, CalendarEvent
from homeassistant.util import dt as dt_util


async def async_setup_platform(hass, config, async_add_entities, discovery_info=None):
    async_add_entities([MockCalendar(spec) for spec in discovery_info])


class MockCalendar(CalendarEntity):
    _attr_should_poll = False

    def __init__(self, spec):
        self.entity_id = spec["entity_id"]
        self._attr_name = spec.get("name")
        self._spec_events = spec.get("events", [])

    def _events(self):
        base = dt_util.start_of_local_day()
        out = []
        for e in self._spec_events:
            d = e.get("day", 0)
            if e.get("all_day"):
                day = (base + timedelta(days=d)).date()
                out.append(CalendarEvent(start=day, end=day + timedelta(days=1), summary=e["summary"]))
            else:
                s = base + timedelta(days=d, hours=e["start"])
                out.append(CalendarEvent(start=s, end=s + timedelta(hours=e.get("hours", 1)),
                                         summary=e["summary"], location=e.get("location")))
        return out

    @property
    def event(self):
        now = dt_util.now()
        upcoming = [e for e in self._events() if e.end_datetime_local > now]
        return min(upcoming, key=lambda e: e.start_datetime_local) if upcoming else None

    async def async_get_events(self, hass, start_date, end_date):
        return [e for e in self._events() if e.end_datetime_local > start_date and e.start_datetime_local < end_date]
