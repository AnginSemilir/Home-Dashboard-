"""Mock camera serving a still image."""

from pathlib import Path

from homeassistant.components.camera import Camera


async def async_setup_platform(hass, config, async_add_entities, discovery_info=None):
    async_add_entities([MockCamera(spec) for spec in discovery_info])


class MockCamera(Camera):
    def __init__(self, spec):
        super().__init__()
        self.entity_id = spec["entity_id"]
        self._attr_name = spec.get("name")
        self._image = spec["image"]  # relative to the HA config dir
        # No STREAM feature: the frontend falls back to MJPEG for camera_view: live.
        self._attr_is_streaming = True
        self._attr_frame_interval = 1

    async def async_camera_image(self, width=None, height=None):
        path = Path(self.hass.config.path(self._image))
        return await self.hass.async_add_executor_job(path.read_bytes)
