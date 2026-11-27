import { isRecord } from "./contract";

/** Sentinel stored instead of a physical device id. Capture and playback then follow the OS default. */
export const SYSTEM_AUDIO_DEVICE = "default";

const DEVICE_ID = /^[A-Za-z0-9+/_.:-]{1,256}$/;

export interface AudioDevicePreferences {
  inputDeviceId: string;
  outputDeviceId: string;
}

export const defaultAudioDevicePreferences: AudioDevicePreferences = {
  inputDeviceId: SYSTEM_AUDIO_DEVICE,
  outputDeviceId: SYSTEM_AUDIO_DEVICE,
};

export function isAudioDeviceId(value: unknown): value is string {
  if (value === SYSTEM_AUDIO_DEVICE) {
    return true;
  }
  return typeof value === "string"
    && value !== "communications"
    && DEVICE_ID.test(value);
}

export function parseAudioDevicePreferences(value: unknown): AudioDevicePreferences | null {
  if (!isRecord(value)) {
    return null;
  }
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes("inputDeviceId") || !keys.includes("outputDeviceId")) {
    return null;
  }
  if (!isAudioDeviceId(value.inputDeviceId) || !isAudioDeviceId(value.outputDeviceId)) {
    return null;
  }
  return {
    inputDeviceId: value.inputDeviceId,
    outputDeviceId: value.outputDeviceId,
  };
}
