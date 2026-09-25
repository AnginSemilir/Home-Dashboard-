// Kia battery: read the encrypted reading published by the optional GitHub Action
// (.github/workflows/kia.yml). Only this browser holds the key, so the public file is useless
// to anyone else.

import { b64ToBytes, bytesToB64, fetchJSON } from './util.js';

/** Decrypt { v: 1, iv, data } (AES-256-GCM, base64) with a base64 32-byte key. */
export async function decryptReading(payload, keyB64, subtle = globalThis.crypto.subtle) {
  if (!payload || payload.v !== 1) throw new Error('Unexpected Kia data format');
  const key = await subtle.importKey('raw', b64ToBytes(keyB64), 'AES-GCM', false, ['decrypt']);
  let plain;
  try {
    plain = await subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(payload.iv) }, key, b64ToBytes(payload.data));
  } catch {
    throw new Error('Kia key does not match (check the key in Settings and the GitHub secret)');
  }
  return JSON.parse(new TextDecoder().decode(plain));
}

/** Used by tests and the Settings "generate key" button. */
export async function encryptReading(obj, keyB64, subtle = globalThis.crypto.subtle) {
  const key = await subtle.importKey('raw', b64ToBytes(keyB64), 'AES-GCM', false, ['encrypt']);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj))));
  return { v: 1, iv: bytesToB64(iv), data: bytesToB64(data) };
}

export const newKey = () => bytesToB64(globalThis.crypto.getRandomValues(new Uint8Array(32)));

export async function fetchKia({ url, key }) {
  if (!url || !key) throw new Error('Kia not set up');
  const payload = await fetchJSON(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, { cache: 'no-store' });
  return decryptReading(payload, key);
}
