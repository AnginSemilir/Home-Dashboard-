"""Shared helpers for panel_mock."""

import math
from datetime import timedelta

from homeassistant.util import dt as dt_util


def agile_curve(slot_start):
    """Plausible Agile-like price (GBP/kWh inc VAT) for a half-hour slot."""
    h = slot_start.hour + slot_start.minute / 60
    base = 0.17 + 0.05 * math.sin((h - 9) / 24 * 2 * math.pi)
    if 2 <= h < 5.5:
        base -= 0.10
    if 12 <= h < 14.5:
        base -= 0.08  # solar dip
    if 16 <= h < 19:
        base += 0.14  # peak
    return round(max(-0.02, base), 4)


def day_rates(day_offset=0, slot_minutes=30):
    start = dt_util.start_of_local_day() + timedelta(days=day_offset)
    rates = []
    t = start
    while t < start + timedelta(days=1):
        end = t + timedelta(minutes=slot_minutes)
        v = agile_curve(t)
        rates.append(
            {
                "start": t.isoformat(),
                "end": end.isoformat(),
                "value_inc_vat": v,
                "is_capped": False,
                "is_intelligent_adjusted": False,
            }
        )
        t = end
    return rates


def current_slot(rates):
    now = dt_util.now()
    for r in rates:
        if dt_util.parse_datetime(r["start"]) <= now < dt_util.parse_datetime(r["end"]):
            return r
    return rates[0]
