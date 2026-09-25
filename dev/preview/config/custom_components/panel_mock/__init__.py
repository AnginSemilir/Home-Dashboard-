"""Mock entities that impersonate the real integrations' entity ids for dashboard testing."""

from homeassistant.helpers import discovery

DOMAIN = "panel_mock"
PLATFORMS = ["sensor", "binary_sensor", "event", "camera", "weather", "calendar", "climate", "button", "switch", "number"]


async def async_setup(hass, config):
    conf = config.get(DOMAIN, {}) or {}
    hass.data[DOMAIN] = conf
    for platform in PLATFORMS:
        if conf.get(platform):
            hass.async_create_task(
                discovery.async_load_platform(hass, platform, DOMAIN, conf[platform], config)
            )
    return True
