import { describe, expect, it } from "vitest";
import { SYSTEM_AUDIO_DEVICE } from "./audio-device-preferences";
import {
  isLatestTicket,
  labelsAvailable,
  listedDevices,
  microphoneConstraints,
  routeInput,
  routeOutput,
  sinkIdFor,
  type ListedDevice,
} from "./audio-devices";

const mic = (deviceId: string, label: string): ListedDevice => ({ deviceId, kind: "audioinput", label });
const speaker = (deviceId: string, label: string): ListedDevice => ({ deviceId, kind: "audiooutput", label });

describe("audio device catalog", () => {
  it("keeps physical inputs and outputs and drops browser default aliases", () => {
    const devices = [
      mic("default", "Default - Built-in"),
      mic("communications", "Communications"),
      mic("mic-a", "Headset"),
      mic("mic-a", "Headset"),
      speaker("default", "Default - Speakers"),
      speaker("spk-a", "Headphones"),
      { deviceId: "cam", kind: "videoinput", label: "Camera" },
      mic("", ""),
    ];
    expect(listedDevices(devices, "audioinput")).toEqual([mic("mic-a", "Headset")]);
    expect(listedDevices(devices, "audiooutput")).toEqual([speaker("spk-a", "Headphones")]);
    expect(labelsAvailable(listedDevices(devices, "audioinput"))).toBe(true);
    expect(labelsAvailable([mic("mic-a", "  ")])).toBe(false);
  });

  it("follows the system default without pinning a physical id", () => {
    expect(routeInput(SYSTEM_AUDIO_DEVICE, [mic("mic-a", "Headset")])).toEqual({
      captureDeviceId: SYSTEM_AUDIO_DEVICE,
      missing: false,
    });
    expect(microphoneConstraints(SYSTEM_AUDIO_DEVICE)).toEqual({
      channelCount: 1,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    });
    expect(sinkIdFor(SYSTEM_AUDIO_DEVICE)).toBe("");
  });

  it("selects an explicit device by id only", () => {
    const inputs = [mic("mic-a", "Headset"), mic("mic-b", "Headset")];
    expect(routeInput("mic-b", inputs)).toEqual({ captureDeviceId: "mic-b", missing: false });
    expect(microphoneConstraints("mic-b").deviceId).toEqual({ exact: "mic-b" });
    expect(routeOutput("spk-a", [speaker("spk-a", "HDMI")])).toEqual({ sinkId: "spk-a", missing: false, hold: false });
    expect(routeInput("mic-a", [mic("mic-b", "Headset")]).captureDeviceId).toBe(SYSTEM_AUDIO_DEVICE);
    expect(routeOutput("spk-old", [speaker("spk-new", "Headset")])).toEqual({ sinkId: "", missing: true, hold: true });
  });

  it("ignores a stale device list", () => {
    expect(isLatestTicket(2, 2)).toBe(true);
    expect(isLatestTicket(1, 2)).toBe(false);
  });
});
