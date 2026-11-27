import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SYSTEM_AUDIO_DEVICE } from "../../../shared/audio-device-preferences";
import { MIN_SPEECH_SAMPLES } from "../../../shared/speech-wav";
import { markAudioRouteSettled, resetAudioRoute, setCaptureDevice } from "./audio-route";
import { beginSession, openMicrophone, recordingActive, releaseStream } from "./microphone";
import { describeMicrophoneFailure, formatDuration } from "./speech-state";

function tone(length: number): Float32Array {
  const samples = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    samples[index] = Math.sin((index / 16_000) * Math.PI * 2 * 440) * 0.2;
  }
  return samples;
}

function resources(options: {
  samples?: Float32Array;
  onStop?: () => void;
  capture?: () => Promise<{ samples: Float32Array; sampleRate: number }>;
} = {}) {
  return {
    level: () => 0.42,
    capture: options.capture ?? (async () => ({
      samples: options.samples ?? tone(MIN_SPEECH_SAMPLES),
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

  it("keeps a spoken word and does not send silence", async () => {
    const spoken = beginSession(resources({ samples: tone(MIN_SPEECH_SAMPLES) }));
    const wav = await spoken.finish();
    expect(wav[0]).toBe("R".charCodeAt(0));
    const silent = beginSession(resources({ samples: new Float32Array(MIN_SPEECH_SAMPLES) }));
    await expect(silent.finish()).rejects.toThrow(/no speech was heard/i);
    const clipped = beginSession(resources({ samples: tone(100) }));
    await expect(clipped.finish()).rejects.toThrow(/too short/i);
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
    expect(describeMicrophoneFailure(new Error("No speech was heard."))).toBe("No speech was heard.");
    expect(formatDuration(12_400)).toBe("0:12");
    expect(formatDuration(60_000)).toBe("1:00");
  });
});

const originalDevices = navigator.mediaDevices;
const originalContext = window.AudioContext;

class QuietContext {
  state = "running";
  sampleRate = 16_000;
  destination = {};
  resume(): Promise<void> {
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.state = "closed";
    return Promise.resolve();
  }
  createMediaStreamSource(): { connect(): void; disconnect(): void } {
    return { connect() {}, disconnect() {} };
  }
  createAnalyser(): { fftSize: number; getFloatTimeDomainData(): void } {
    return { fftSize: 0, getFloatTimeDomainData() {} };
  }
  createGain(): { gain: { value: number }; connect(): void; disconnect(): void } {
    return { gain: { value: 0 }, connect() {}, disconnect() {} };
  }
  createScriptProcessor(): {
    onaudioprocess: ((event: { inputBuffer: { numberOfChannels: number; length: number; getChannelData(): Float32Array } }) => void) | null;
    connect(): void;
    disconnect(): void;
  } {
    return { onaudioprocess: null, connect() {}, disconnect() {} };
  }
}

afterEach(() => {
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: originalDevices });
  window.AudioContext = originalContext;
  resetAudioRoute();
});

beforeEach(() => {
  window.AudioContext = QuietContext as unknown as typeof AudioContext;
});

describe("openMicrophone", () => {
  it("waits to open a microphone until the saved device list is ready", async () => {
    resetAudioRoute();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          throw new Error("opened too early");
        },
      },
    });
    await expect(openMicrophone()).rejects.toThrow(/still starting/i);
  });

  it("asks for the system default without a pinned device id", async () => {
    const seen: unknown[] = [];
    setCaptureDevice(SYSTEM_AUDIO_DEVICE);
    markAudioRouteSettled();
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
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    }]);
  });

  it("pins an explicit microphone id", async () => {
    const seen: Array<{ audio?: { deviceId?: { exact: string } } }> = [];
    setCaptureDevice("mic-a");
    markAudioRouteSettled();
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

  it("keeps the first samples and arms the audio graph before the microphone opens", async () => {
    let armed = false;
    class LiveContext extends QuietContext {
      override state = "suspended";
      override resume(): Promise<void> {
        armed = true;
        this.state = "running";
        return Promise.resolve();
      }
      override createScriptProcessor(): {
        onaudioprocess: ((event: { inputBuffer: { numberOfChannels: number; length: number; getChannelData(): Float32Array } }) => void) | null;
        connect(): void;
        disconnect(): void;
      } {
        const node = {
          onaudioprocess: null as ((event: { inputBuffer: { numberOfChannels: number; length: number; getChannelData(): Float32Array } }) => void) | null,
          connect() {
            const samples = tone(MIN_SPEECH_SAMPLES);
            samples[0] = 0.5;
            node.onaudioprocess?.({
              inputBuffer: {
                numberOfChannels: 1,
                length: samples.length,
                getChannelData: () => samples,
              },
            });
          },
          disconnect() {},
        };
        return node;
      }
    }
    window.AudioContext = LiveContext as unknown as typeof AudioContext;
    setCaptureDevice(SYSTEM_AUDIO_DEVICE);
    markAudioRouteSettled();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          expect(armed).toBe(true);
          return {
            getAudioTracks: () => [{ addEventListener() {}, stop() {} }],
            getTracks: () => [{ stop() {} }],
          };
        },
      },
    });
    const session = await openMicrophone();
    const wav = await session.finish();
    const first = new DataView(wav.buffer, wav.byteOffset, wav.byteLength).getInt16(44, true);
    expect(first).toBe(Math.trunc(0.5 * 0x7fff));
  });
});
