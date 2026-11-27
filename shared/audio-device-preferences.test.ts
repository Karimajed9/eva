import { describe, expect, it } from "vitest";
import {
  defaultAudioDevicePreferences,
  parseAudioDevicePreferences,
  SYSTEM_AUDIO_DEVICE,
} from "./audio-device-preferences";

describe("audio device preferences", () => {
  it("defaults both sides to the system device", () => {
    expect(defaultAudioDevicePreferences).toEqual({
      inputDeviceId: SYSTEM_AUDIO_DEVICE,
      outputDeviceId: SYSTEM_AUDIO_DEVICE,
    });
  });

  it("accepts a saved pair and rejects anything else", () => {
    const saved = { inputDeviceId: "abc123", outputDeviceId: SYSTEM_AUDIO_DEVICE };
    expect(parseAudioDevicePreferences(saved)).toEqual(saved);
    expect(parseAudioDevicePreferences({ inputDeviceId: SYSTEM_AUDIO_DEVICE })).toBeNull();
    expect(parseAudioDevicePreferences({ ...saved, volume: 1 })).toBeNull();
    expect(parseAudioDevicePreferences({ inputDeviceId: "communications", outputDeviceId: SYSTEM_AUDIO_DEVICE })).toBeNull();
    expect(parseAudioDevicePreferences({ inputDeviceId: "has space", outputDeviceId: SYSTEM_AUDIO_DEVICE })).toBeNull();
    expect(parseAudioDevicePreferences({ inputDeviceId: "", outputDeviceId: SYSTEM_AUDIO_DEVICE })).toBeNull();
    expect(parseAudioDevicePreferences(null)).toBeNull();
  });
});
