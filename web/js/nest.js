// Google Nest via the Smart Device Management API: thermostat readings and the camera's
// WebRTC live stream (the same calls Google's device-access sample web app makes).

export const SDM = 'https://smartdevicemanagement.googleapis.com/v1';
const T = 'sdm.devices.traits.';

export function deviceName(d) {
  return d?.traits?.[`${T}Info`]?.customName
    || d?.parentRelations?.[0]?.displayName
    || String(d?.type || 'Device').split('.').pop().toLowerCase();
}

export const isThermostat = (d) => /THERMOSTAT$/.test(d?.type || '');
export const isCamera = (d) => /(CAMERA|DOORBELL|DISPLAY)$/.test(d?.type || '') && !!d?.traits?.[`${T}CameraLiveStream`];

export function parseThermostat(d) {
  const t = d?.traits || {};
  const sp = t[`${T}ThermostatTemperatureSetpoint`] || {};
  const eco = t[`${T}ThermostatEco`]?.mode;
  return {
    name: deviceName(d),
    tempC: t[`${T}Temperature`]?.ambientTemperatureCelsius ?? null,
    humidity: t[`${T}Humidity`]?.ambientHumidityPercent ?? null,
    setpointC: eco && eco !== 'OFF' ? t[`${T}ThermostatEco`]?.heatCelsius ?? null : sp.heatCelsius ?? sp.coolCelsius ?? null,
    hvac: t[`${T}ThermostatHvac`]?.status || 'OFF', // HEATING | COOLING | OFF
    mode: t[`${T}ThermostatMode`]?.mode || null,     // HEAT | COOL | HEATCOOL | OFF
    eco: eco && eco !== 'OFF',
  };
}

export function parseCamera(d) {
  const ls = d?.traits?.[`${T}CameraLiveStream`] || {};
  return {
    name: deviceName(d),
    webrtc: (ls.supportedProtocols || []).includes('WEB_RTC'),
    rtsp: (ls.supportedProtocols || []).includes('RTSP'),
    doorbell: /DOORBELL$/.test(d?.type || ''),
  };
}

export class Nest {
  constructor(google, settings) {
    this.g = google;
    this.s = settings;
  }

  async devices() {
    const body = await this.g.api(`${SDM}/enterprises/${encodeURIComponent(this.s.google.projectId)}/devices`);
    return body?.devices || [];
  }

  async device(id) {
    return this.g.api(`${SDM}/${id}`);
  }

  async command(id, command, params = {}) {
    const body = await this.g.api(`${SDM}/${id}:executeCommand`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, params }),
    });
    return body?.results || {};
  }
}

/**
 * A WebRTC live view. Battery cameras: Google ends the session after 5 minutes and won't
 * extend it, so we stop at 5 minutes. Wired cameras: extend every 4 minutes.
 */
export class LiveStream {
  constructor(nest, deviceId, { battery = true, onState = () => {}, RTC = globalThis.RTCPeerConnection, connectTimeoutMs = 30e3 } = {}) {
    this.nest = nest;
    this.id = deviceId;
    this.battery = battery;
    this.onState = onState;
    this.RTC = RTC;
    this.pc = null;
    this.session = null;
    this.timers = [];
    this.endsAt = 0;
    this.connectTimeoutMs = connectTimeoutMs;
    this.live = false;
  }

  async start(video) {
    if (!this.RTC) throw new Error('This browser has no WebRTC support');
    this.onState('connecting');
    const pc = new this.RTC({ iceServers: [] });
    this.pc = pc;
    // Nest expects audio, video, then a data channel in the offer.
    pc.addTransceiver('audio', { direction: 'recvonly' });
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.createDataChannel('dataSendChannel');
    const stream = new MediaStream();
    pc.addEventListener('track', (ev) => {
      stream.addTrack(ev.track);
      video.srcObject = stream;
      video.play?.().catch(() => {});
      this.live = true;
      this.onState('live');
    });
    pc.addEventListener('connectionstatechange', () => {
      if (['failed', 'closed'].includes(pc.connectionState)) this.onState('ended');
    });
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const res = await this.nest.command(this.id, 'sdm.devices.commands.CameraLiveStream.GenerateWebRtcStream', { offerSdp: offer.sdp });
    this.session = res.mediaSessionId;
    let answer = res.answerSdp || '';
    if (!answer.endsWith('\n')) answer += '\n';
    await pc.setRemoteDescription({ type: 'answer', sdp: answer });
    // A sleeping battery camera can take a few seconds to wake; give up if no video comes.
    this.timers.push(setTimeout(() => { if (!this.live) { this.onState('timeout'); this.stop(); } }, this.connectTimeoutMs));
    const expires = res.expiresAt ? Date.parse(res.expiresAt) : Date.now() + 5 * 60e3;
    if (this.battery) {
      this.endsAt = Math.min(expires, Date.now() + 5 * 60e3);
      this.timers.push(setTimeout(() => this.stop(), Math.max(0, this.endsAt - Date.now())));
    } else {
      this.endsAt = 0;
      this.timers.push(setInterval(() => this.#extend(), 4 * 60e3));
    }
    return res;
  }

  async #extend() {
    try {
      const res = await this.nest.command(this.id, 'sdm.devices.commands.CameraLiveStream.ExtendWebRtcStream', { mediaSessionId: this.session });
      if (res.mediaSessionId) this.session = res.mediaSessionId;
    } catch {
      this.stop();
    }
  }

  async stop() {
    for (const t of this.timers) { clearTimeout(t); clearInterval(t); }
    this.timers = [];
    const { session, pc } = this;
    this.session = null;
    this.pc = null;
    try { pc?.close(); } catch { /* already closed */ }
    this.onState('ended');
    if (session) {
      try {
        await this.nest.command(this.id, 'sdm.devices.commands.CameraLiveStream.StopWebRtcStream', { mediaSessionId: session });
      } catch { /* the session expires on its own anyway */ }
    }
  }
}
