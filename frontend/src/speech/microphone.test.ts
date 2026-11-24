import { MIN_SPEECH_SAMPLES } from "../../../shared/speech-wav";
import { describe, expect, it } from "vitest";
import { beginSession, recordingActive, releaseStream } from "./microphone";
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
    expect(describeMicrophoneFailure(new DOMException("busy", "NotReadableError"))).toMatch(/unavailable/i);
    expect(formatDuration(12_400)).toBe("0:12");
    expect(formatDuration(60_000)).toBe("1:00");
  });
});
