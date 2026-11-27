import { isAudioDeviceId, SYSTEM_AUDIO_DEVICE } from "./audio-device-preferences";

export interface ListedDevice {
  deviceId: string;
  kind: string;
  label: string;
}

const HIDDEN_IDS = new Set(["", "default", "communications"]);

export interface InputRoute {
  captureDeviceId: string;
  missing: boolean;
}

export interface OutputRoute {
  sinkId: string;
  missing: boolean;
  /** Preferred speaker is gone. Do not play, and do not move sound to another device. */
  hold: boolean;
}

export interface MicrophoneAudioConstraints {
  channelCount: number;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  deviceId?: { exact: string };
}

export function listedDevices(devices: readonly ListedDevice[], kind: "audioinput" | "audiooutput"): ListedDevice[] {
  const seen = new Set<string>();
  const result: ListedDevice[] = [];
  for (const device of devices) {
    if (device.kind !== kind || HIDDEN_IDS.has(device.deviceId) || seen.has(device.deviceId)) {
      continue;
    }
    if (!isAudioDeviceId(device.deviceId) || device.deviceId === SYSTEM_AUDIO_DEVICE) {
      continue;
    }
    seen.add(device.deviceId);
    result.push({ deviceId: device.deviceId, kind, label: device.label });
  }
  return result;
}

export function labelsAvailable(devices: readonly ListedDevice[]): boolean {
  return devices.some((device) => device.label.trim().length > 0);
}

export function routeInput(preference: string, inputs: readonly ListedDevice[]): InputRoute {
  if (preference === SYSTEM_AUDIO_DEVICE) {
    return { captureDeviceId: SYSTEM_AUDIO_DEVICE, missing: false };
  }
  if (inputs.some((device) => device.deviceId === preference)) {
    return { captureDeviceId: preference, missing: false };
  }
  return { captureDeviceId: SYSTEM_AUDIO_DEVICE, missing: true };
}

export function routeOutput(preference: string, outputs: readonly ListedDevice[]): OutputRoute {
  if (preference === SYSTEM_AUDIO_DEVICE) {
    return { sinkId: "", missing: false, hold: false };
  }
  if (outputs.some((device) => device.deviceId === preference)) {
    return { sinkId: preference, missing: false, hold: false };
  }
  return { sinkId: "", missing: true, hold: true };
}

/** System default omits a device id so the OS default is read again on the next recording. */
export function microphoneConstraints(deviceId: string): MicrophoneAudioConstraints {
  const audio: MicrophoneAudioConstraints = {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
  };
  if (deviceId !== SYSTEM_AUDIO_DEVICE) {
    audio.deviceId = { exact: deviceId };
  }
  return audio;
}

/** Empty string is the Web Audio default sink. */
export function sinkIdFor(deviceId: string): string {
  return deviceId === SYSTEM_AUDIO_DEVICE ? "" : deviceId;
}

export function isLatestTicket(ticket: number, latest: number): boolean {
  return ticket === latest;
}
