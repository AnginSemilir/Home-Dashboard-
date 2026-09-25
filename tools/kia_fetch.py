"""Read a Kia's last-reported battery level and write it, encrypted, for the wall panel.

Used by .github/workflows/kia.yml. It only reads what the car last sent to Kia; it never wakes
the car. Output is {"v": 1, "iv": ..., "data": ...}: AES-256-GCM with the base64 key in
KIA_PANEL_KEY, the same format web/js/kia.js decrypts.

Environment: KIA_USERNAME, KIA_PASSWORD (or a Kia refresh token), KIA_PANEL_KEY,
optional KIA_PIN, KIA_VIN, KIA_REGION (1 = Europe), KIA_BRAND (1 = Kia).

Usage: python tools/kia_fetch.py out/kia.json

The workflow's logs are public, so this prints nothing about the car or the account.
"""

import base64
import json
import logging
import os
import sys
import time
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

KM_PER_MILE = 1.609344


def encrypt_reading(reading: dict, key_b64: str) -> dict:
    key = base64.b64decode(key_b64)
    if len(key) != 32:
        raise ValueError("KIA_PANEL_KEY must be 32 bytes, base64 encoded (use the panel's 'Generate a new key')")
    iv = os.urandom(12)
    data = AESGCM(key).encrypt(iv, json.dumps(reading).encode(), None)  # ciphertext + tag, as WebCrypto expects
    return {"v": 1, "iv": base64.b64encode(iv).decode(), "data": base64.b64encode(data).decode()}


def reading_from_vehicle(v) -> dict:
    range_mi = None
    if v.ev_driving_range is not None:
        unit = str(getattr(v, "ev_driving_range_unit", "") or "").lower()
        range_mi = v.ev_driving_range / KM_PER_MILE if "km" in unit else v.ev_driving_range
    updated = getattr(v, "last_updated_at", None)
    return {
        "battery": v.ev_battery_percentage,
        "range": round(range_mi) if range_mi is not None else None,
        "charging": bool(v.ev_battery_is_charging),
        "plugged": bool(v.ev_battery_is_plugged_in),
        "updated": int(updated.timestamp() * 1000) if updated else None,
        "fetched": int(time.time() * 1000),
    }


def fetch() -> dict:
    from hyundai_kia_connect_api import VehicleManager

    vm = VehicleManager(
        region=int(os.environ.get("KIA_REGION") or 1),
        brand=int(os.environ.get("KIA_BRAND") or 1),
        username=os.environ["KIA_USERNAME"],
        password=os.environ["KIA_PASSWORD"],
        pin=os.environ.get("KIA_PIN") or "",
    )
    vm.check_and_refresh_token()
    vm.update_all_vehicles_with_cached_state()  # cached = what the car last reported; no wake-up
    vehicles = list(vm.vehicles.values())
    if not vehicles:
        raise RuntimeError("No cars found on this Kia account")
    vin = (os.environ.get("KIA_VIN") or "").strip().upper()
    car = next((v for v in vehicles if (getattr(v, "VIN", "") or "").upper() == vin), None) if vin else vehicles[0]
    if car is None:
        raise RuntimeError("No car with the VIN in KIA_VIN")
    if car.ev_battery_percentage is None:
        raise RuntimeError("Kia didn't return a battery level")
    return reading_from_vehicle(car)


def main() -> int:
    logging.basicConfig(level=logging.CRITICAL)  # the library can log account details at lower levels
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "kia.json")
    key = os.environ.get("KIA_PANEL_KEY", "")
    secrets = [s for s in (os.environ.get("KIA_USERNAME"), os.environ.get("KIA_PASSWORD"), os.environ.get("KIA_PIN")) if s]
    try:
        payload = encrypt_reading(fetch(), key)
    except Exception as e:  # noqa: BLE001 - report every failure the same careful way
        msg = str(e)
        for s in secrets:
            msg = msg.replace(s, "***")
        print(f"Kia fetch failed: {type(e).__name__}: {msg[:300]}", file=sys.stderr)
        if "OTP" in type(e).__name__ or "OTP" in msg:
            print("Kia wants a one-time code. Put a Kia refresh token in KIA_PASSWORD instead (see docs/kia.md).", file=sys.stderr)
        return 1
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload))
    print("Wrote an encrypted Kia reading.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
