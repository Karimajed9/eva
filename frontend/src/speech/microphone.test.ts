import { afterEach, describe, expect, it } from "vitest";
import { SYSTEM_AUDIO_DEVICE } from "../../../shared/audio-device-preferences";
import { MIN_SPEECH_SAMPLES } from "../../../shared/speech-wav";
import { setCaptureDevice } from "./audio-route";
import { beginSession, openMicrophone, recordingActive, releaseStream } from "./microphone";
import { describeMicrophoneFailure, formatDuration } from "./speech-state";

function resources(options: {
  samples?: Float32Array;
  onStop?: () => void;
  capture?: () => Promise<{ samples: Float32Array; sampleRate: number }>;
} = {}) {
  return {
    level: () => 0.42,
    capture: options.capture ?? (async () => ({
      samples: options.samples ?? new Float32Array(MIN_SPEECH_SAMPLES).fill(0.2),
      sampleRate: 16_000,
    })),
    stopTracks: () => options.onStop?.(),
    close: async () => {},
  };
}

describe("microphone session", () => {
  it("refuses a second recording until the first is released", () => {
    const first = beginSession(resources());
    expect(recordingActive()).toBe(true);
    expect(() => beginSession(resources())).toThrow(/already in progress/i);
    first.cancel();
    expect(recordingActive()).toBe(false);
    const second = beginSession(resources());
    second.cancel();
    expect(recordingActive()).toBe(false);
  });

  it("stops tracks on cancel and after transcription audio is built", async () => {
    const stops: string[] = [];
    const session = beginSession(resources({ onStop: () => stops.push("stop") }));
    expect(session.level()).toBeCloseTo(0.42);
    const wav = await session.finish();
    expect(wav[0]).toBe("R".charCodeAt(0));
    expect(stops).toEqual(["stop"]);
    expect(session.level()).toBe(0);
    expect(recordingActive()).toBe(false);
    session.cancel();
    expect(stops).toEqual(["stop"]);
  });

  it("releases a denied or missing microphone without keeping a stream", () => {
    const stopped: string[] = [];
    releaseStream({
      getTracks: () => [{ stop: () => stopped.push("mic") }],
    });
    expect(stopped).toEqual(["mic"]);
    expect(describeMicrophoneFailure(new DOMException("no", "NotAllowedError"))).toMatch(/permission was denied/i);
    expect(describeMicrophoneFailure(new DOMException("missing", "NotFoundError"))).toMatch(/no microphone/i);
    expect(describeMicrophoneFailure(new DOMException("gone", "OverconstrainedError"))).toMatch(/selected microphone/i);
    expect(describeMicrophoneFailure(new DOMException("busy", "NotReadableError"))).toMatch(/unavailable/i);
    expect(formatDuration(12_400)).toBe("0:12");
    expect(formatDuration(60_000)).toBe("1:00");
  });
});

const originalDevices = navigator.mediaDevices;

afterEach(() => {
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: originalDevices });
  setCaptureDevice(SYSTEM_AUDIO_DEVICE);
});

describe("openMicrophone", () => {
  it("asks for the system default without a pinned device id", async () => {
    const seen: unknown[] = [];
    setCaptureDevice(SYSTEM_AUDIO_DEVICE);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async (constraints: unknown) => {
          seen.push(constraints);
          throw new DOMException("stop", "NotFoundError");
        },
      },
    });
    await expect(openMicrophone()).rejects.toThrow();
    expect(seen).toEqual([{
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      video: false,
    }]);
  });

  it("pins an explicit microphone id", async () => {
    const seen: Array<{ audio?: { deviceId?: { exact: string } } }> = [];
    setCaptureDevice("mic-a");
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async (constraints: { audio?: { deviceId?: { exact: string } } }) => {
          seen.push(constraints);
          throw new DOMException("stop", "NotFoundError");
        },
      },
    });
    await expect(openMicrophone()).rejects.toThrow();
    expect(seen[0]?.audio?.deviceId).toEqual({ exact: "mic-a" });
  });
});
