import { afterEach, describe, expect, it } from "vitest";
import type { AudioDevicePreferences } from "../../../shared/audio-device-preferences";
import { SYSTEM_AUDIO_DEVICE } from "../../../shared/audio-device-preferences";
import type { ListedDevice, MicrophoneAudioConstraints } from "../../../shared/audio-devices";
import type { AudioDeviceActions } from "./audio-device-actions";
import { AudioDeviceModel, type AudioDevicePorts, type OpenInput } from "./audio-device-model";
import { audioRouteReady, captureDevice, playbackAllowed, playbackSink, resetAudioRoute } from "./audio-route";
import type { SinkResult } from "./playback";

function mic(deviceId: string, label = deviceId): ListedDevice {
  return { deviceId, kind: "audioinput", label };
}

function speaker(deviceId: string, label = deviceId): ListedDevice {
  return { deviceId, kind: "audiooutput", label };
}

function harness(options: {
  devices?: ListedDevice[];
  preferences?: AudioDevicePreferences;
  read?: () => Promise<AudioDevicePreferences>;
  open?: (constraints: MicrophoneAudioConstraints) => Promise<OpenInput>;
} = {}) {
  const saved: AudioDevicePreferences[] = [];
  const discards: string[] = [];
  const stops: string[] = [];
  const sinks: string[] = [];
  let devices = options.devices ?? [];
  let captureBusy = false;
  let speaking = false;
  const pendingSinks: Array<{ id: string; resolve: (result: SinkResult) => void }> = [];
  const actions: AudioDeviceActions = {
    captureBusy: () => captureBusy,
    speaking: () => speaking,
    discardRecording: (notice) => {
      discards.push(notice);
    },
    stopPlayback: (notice) => {
      stops.push(notice);
    },
    applySink: (sinkId) => {
      sinks.push(sinkId);
      return new Promise((resolve) => {
        pendingSinks.push({ id: sinkId, resolve });
      });
    },
  };
  const opened: MicrophoneAudioConstraints[] = [];
  const closed: OpenInput[] = [];
  const ports: AudioDevicePorts = {
    enumerate: async () => devices,
    openInput: options.open ?? (async (constraints) => {
      opened.push(constraints);
      const handle: OpenInput = {
        level: () => 0.42,
        stop: () => {
          closed.push(handle);
        },
        onEnded: () => {},
      };
      return handle;
    }),
    readPreferences: options.read ?? (async () => options.preferences ?? {
      inputDeviceId: SYSTEM_AUDIO_DEVICE,
      outputDeviceId: SYSTEM_AUDIO_DEVICE,
    }),
    writePreferences: async (preferences) => {
      saved.push(preferences);
      return preferences;
    },
  };
  const model = new AudioDeviceModel(ports, actions);
  return {
    model,
    saved,
    discards,
    stops,
    sinks,
    opened,
    closed,
    pendingSinks,
    setDevices(next: ListedDevice[]) {
      devices = next;
    },
    setBusy(next: boolean) {
      captureBusy = next;
    },
    setSpeaking(next: boolean) {
      speaking = next;
    },
  };
}

afterEach(() => {
  resetAudioRoute();
});

describe("audio device model", () => {
  it("keeps the system default and an explicit microphone separate", async () => {
    const rig = harness({ devices: [mic("mic-a", "Headset"), speaker("spk-a", "HDMI")] });
    await rig.model.load();
    expect(rig.model.captureId()).toBe(SYSTEM_AUDIO_DEVICE);
    expect(rig.model.snapshot().labelsReady).toBe(true);
    await rig.model.selectInput("mic-a");
    expect(rig.saved.at(-1)?.inputDeviceId).toBe("mic-a");
    expect(captureDevice()).toBe("mic-a");
    expect(rig.model.snapshot().inputs.map((device) => device.label)).toEqual(["Headset"]);
  });

  it("falls back when the preferred microphone disappears and restores that same id", async () => {
    const rig = harness({
      devices: [mic("mic-a", "Headset"), mic("mic-b", "Headset")],
      preferences: { inputDeviceId: "mic-a", outputDeviceId: SYSTEM_AUDIO_DEVICE },
    });
    await rig.model.load();
    rig.setBusy(true);
    rig.setDevices([mic("mic-b", "Headset")]);
    await rig.model.refresh("devicechange");
    expect(rig.discards).toEqual(["The microphone was disconnected. This recording was discarded."]);
    expect(rig.model.captureId()).toBe(SYSTEM_AUDIO_DEVICE);
    expect(rig.model.snapshot().inputDeviceId).toBe("mic-a");
    expect(rig.model.snapshot().inputMissing).toBe(true);
    rig.setBusy(false);
    rig.setDevices([mic("mic-a", "Headset"), mic("mic-b", "Headset")]);
    await rig.model.refresh("devicechange");
    expect(rig.discards).toHaveLength(1);
    expect(rig.model.captureId()).toBe("mic-a");
    expect(rig.model.snapshot().notice).toMatch(/available again/i);
  });

  it("stops playback when the speaker disappears and does not resume it", async () => {
    const rig = harness({
      devices: [speaker("spk-a", "HDMI")],
      preferences: { inputDeviceId: SYSTEM_AUDIO_DEVICE, outputDeviceId: "spk-a" },
    });
    await rig.model.load();
    rig.setSpeaking(true);
    rig.setDevices([]);
    await rig.model.refresh("devicechange");
    expect(rig.stops[0]).toMatch(/will not continue/i);
    expect(rig.model.playbackAllowed()).toBe(false);
    expect(playbackAllowed()).toBe(false);
    expect(rig.sinks).toEqual([]);
    rig.setSpeaking(false);
    rig.setDevices([speaker("spk-a", "HDMI")]);
    await rig.model.refresh("devicechange");
    expect(rig.stops).toHaveLength(1);
    expect(rig.sinks).toEqual(["spk-a"]);
    expect(rig.model.playbackAllowed()).toBe(true);
    expect(rig.model.snapshot().notice).toMatch(/available again/i);
  });

  it("ignores a device list that arrives after a newer refresh", async () => {
    let releaseFirst: (devices: ListedDevice[]) => void = () => {};
    let calls = 0;
    const pending = new AudioDeviceModel({
      enumerate: () => {
        calls += 1;
        if (calls === 1) {
          return new Promise<ListedDevice[]>((resolve) => {
            releaseFirst = resolve;
          });
        }
        return Promise.resolve([mic("mic-new", "New")]);
      },
      openInput: async () => ({ level: () => 0, stop() {}, onEnded() {} }),
      readPreferences: async () => ({ inputDeviceId: SYSTEM_AUDIO_DEVICE, outputDeviceId: SYSTEM_AUDIO_DEVICE }),
      writePreferences: async (preferences) => preferences,
    });
    const loading = pending.load();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const newer = pending.refresh("devicechange");
    releaseFirst([mic("mic-old", "Old")]);
    await loading;
    await newer;
    expect(pending.snapshot().inputs.map((device) => device.deviceId)).toEqual(["mic-new"]);
  });

  it("applies only the latest speaker when changes overlap", async () => {
    const rig = harness({ devices: [speaker("spk-a", "A"), speaker("spk-b", "B")] });
    await rig.model.load();
    const first = rig.model.selectOutput("spk-a");
    const second = rig.model.selectOutput("spk-b");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(rig.pendingSinks.map((item) => item.id)).toEqual(["spk-a", "spk-b"]);
    rig.pendingSinks[0]?.resolve("failed");
    rig.pendingSinks[1]?.resolve("applied");
    await first;
    await second;
    expect(rig.model.snapshot().outputDeviceId).toBe("spk-b");
    expect(rig.model.snapshot().notice).toBe("");
  });

  it("opens and closes a microphone test without keeping the stream", async () => {
    const rig = harness({ devices: [mic("mic-a", "Headset")] });
    await rig.model.load();
    await rig.model.selectInput("mic-a");
    rig.pendingSinks.splice(0).forEach((item) => item.resolve("applied"));
    await rig.model.startProbe();
    expect(rig.opened.at(-1)?.deviceId).toEqual({ exact: "mic-a" });
    expect(rig.model.snapshot().probing).toBe(true);
    expect(rig.model.snapshot().notice).toMatch(/nothing is saved/i);
    rig.model.stopProbe();
    expect(rig.closed).toHaveLength(1);
    expect(rig.model.snapshot().probing).toBe(false);
    rig.model.dispose();
  });

  it("drops a microphone test that loses the race and refuses one during recording", async () => {
    const waiters: Array<(handle: OpenInput) => void> = [];
    const stopped: string[] = [];
    const rig = harness({
      open: (constraints) => {
        expect(constraints.channelCount).toBe(1);
        return new Promise((resolve) => {
          waiters.push((handle) => resolve(handle));
        });
      },
    });
    await rig.model.load();
    const first = rig.model.startProbe();
    const second = rig.model.startProbe();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const late: OpenInput = { level: () => 0, stop: () => stopped.push("late"), onEnded() {} };
    const current: OpenInput = { level: () => 0, stop: () => stopped.push("current"), onEnded() {} };
    waiters[0]?.(late);
    waiters[1]?.(current);
    await first;
    await second;
    expect(stopped).toEqual(["late"]);
    expect(rig.model.snapshot().probing).toBe(true);
    rig.setBusy(true);
    await rig.model.startProbe();
    expect(rig.model.snapshot().notice).toMatch(/stop the conversation recording/i);
    rig.model.dispose();
    expect(stopped).toContain("current");
  });

  it("stops speech before a microphone test and releases access immediately", async () => {
    const rig = harness();
    await rig.model.load();
    rig.setSpeaking(true);
    await rig.model.startProbe();
    expect(rig.stops[0]).toMatch(/microphone test/i);
    rig.model.stopProbe();
    await rig.model.allowAccess();
    expect(rig.opened.at(-1)?.deviceId).toBeUndefined();
    expect(rig.closed.length).toBeGreaterThan(0);
  });

  it("does not fall back to the system devices while preferences are still loading", async () => {
    const gate: { release: (devices: ListedDevice[]) => void } = { release: () => {} };
    const opened: string[] = [];
    const model = new AudioDeviceModel({
      enumerate: () => new Promise<ListedDevice[]>((resolve) => {
        gate.release = resolve;
      }),
      openInput: async (constraints) => {
        opened.push(constraints.deviceId?.exact ?? "default");
        return { level: () => 0, stop() {}, onEnded() {} };
      },
      readPreferences: async () => ({ inputDeviceId: "mic-a", outputDeviceId: "spk-a" }),
      writePreferences: async (preferences) => preferences,
    });
    const loading = model.load();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(audioRouteReady()).toBe(false);
    expect(playbackAllowed()).toBe(false);
    expect(model.snapshot().ready).toBe(false);
    await model.startProbe();
    expect(opened).toEqual([]);
    expect(model.snapshot().notice).toMatch(/checking audio devices/i);
    gate.release([mic("mic-a", "Headset"), speaker("spk-a", "HDMI")]);
    await loading;
    expect(audioRouteReady()).toBe(true);
    expect(captureDevice()).toBe("mic-a");
    expect(playbackSink()).toBe("spk-a");
    expect(playbackAllowed()).toBe(true);
    expect(model.playbackAllowed()).toBe(true);
  });

  it("uses the system microphone only after the saved one is confirmed missing", async () => {
    const gate: { release: (devices: ListedDevice[]) => void } = { release: () => {} };
    const model = new AudioDeviceModel({
      enumerate: () => new Promise<ListedDevice[]>((resolve) => {
        gate.release = resolve;
      }),
      openInput: async () => ({ level: () => 0, stop() {}, onEnded() {} }),
      readPreferences: async () => ({ inputDeviceId: "mic-a", outputDeviceId: "spk-a" }),
      writePreferences: async (preferences) => preferences,
    });
    const loading = model.load();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(audioRouteReady()).toBe(false);
    expect(playbackAllowed()).toBe(false);
    gate.release([mic("mic-b", "Other"), speaker("spk-b", "Other speaker")]);
    await loading;
    expect(model.snapshot().inputMissing).toBe(true);
    expect(captureDevice()).toBe(SYSTEM_AUDIO_DEVICE);
    expect(playbackAllowed()).toBe(false);
    expect(playbackSink()).toBe("");
  });

  it("does not switch to the system default when the device list cannot be read", async () => {
    const model = new AudioDeviceModel({
      enumerate: async () => {
        throw new Error("unavailable");
      },
      openInput: async () => ({ level: () => 0, stop() {}, onEnded() {} }),
      readPreferences: async () => ({ inputDeviceId: "mic-a", outputDeviceId: "spk-a" }),
      writePreferences: async (preferences) => preferences,
    });
    await model.load();
    expect(audioRouteReady()).toBe(false);
    expect(playbackAllowed()).toBe(false);
    expect(model.snapshot().ready).toBe(false);
    expect(model.snapshot().notice).toMatch(/could not be listed/i);
    expect(model.snapshot().inputMissing).toBe(false);
  });

  it("recovers when saved settings cannot be read", async () => {
    const rig = harness({
      read: async () => {
        throw new Error("bad file");
      },
    });
    await rig.model.load();
    expect(rig.model.snapshot().inputDeviceId).toBe(SYSTEM_AUDIO_DEVICE);
    expect(rig.model.snapshot().notice).toMatch(/could not be read/i);
  });
});
