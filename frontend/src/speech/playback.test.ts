import { afterEach, describe, expect, it } from "vitest";
import { createSpeechPlayer, playbackGain } from "./playback";

afterEach(() => {
  delete (window as Window & { AudioContext?: unknown }).AudioContext;
});

describe("playbackGain", () => {
  it("is silent at zero, unity at full scale, and quieter than a straight line in between", () => {
    expect(playbackGain(0)).toBe(0);
    expect(playbackGain(-1)).toBe(0);
    expect(playbackGain(Number.NaN)).toBe(0);
    expect(playbackGain(1)).toBe(1);
    expect(playbackGain(1.4)).toBe(1);
    expect(playbackGain(0.5)).toBeCloseTo(0.1778, 3);
    expect(playbackGain(0.25)).toBeCloseTo(0.075, 3);
    expect(playbackGain(0.1)).toBeGreaterThan(0.04);
    expect(playbackGain(0.25)).toBeLessThan(playbackGain(0.5));
    expect(playbackGain(0.5)).toBeLessThan(0.5);
    expect(playbackGain(0.75)).toBeLessThan(playbackGain(1));
  });
});

describe("createSpeechPlayer", () => {
  it("routes every buffer through one gain node and ramps later changes", async () => {
    const links: string[] = [];
    const ramps: number[] = [];
    const gain = {
      value: 1,
      cancelScheduledValues() {},
      setValueAtTime(value: number) {
        this.value = value;
      },
      linearRampToValueAtTime(value: number) {
        ramps.push(value);
        this.value = value;
      },
    };
    let ended: (() => void) | null = null;
    class FakeContext {
      state = "running";
      currentTime = 0;
      destination = {
        label: "speakers",
        connect() {},
        disconnect() {},
      };

      resume() {
        return Promise.resolve();
      }

      decodeAudioData() {
        return Promise.resolve({});
      }

      createGain() {
        return {
          label: "gain",
          gain,
          connect(target: { label: string }) {
            links.push(`gain>${target.label}`);
          },
          disconnect() {
            links.push("gain!");
          },
        };
      }

      createAnalyser() {
        return {
          label: "meter",
          fftSize: 0,
          connect(target: { label: string }) {
            links.push(`meter>${target.label}`);
          },
          disconnect() {},
          getByteTimeDomainData(samples: Uint8Array) {
            samples.fill(128);
          },
        };
      }

      createBufferSource() {
        return {
          label: "source",
          buffer: null,
          connect(target: { label: string }) {
            links.push(`source>${target.label}`);
          },
          disconnect() {},
          start() {},
          stop() {
            ended?.();
          },
          set onended(callback: () => void) {
            ended = callback;
          },
        };
      }
    }
    window.AudioContext = FakeContext as unknown as typeof AudioContext;
    const player = createSpeechPlayer();
    const playing = player.play(new Uint8Array(8), 0.5, () => {}, () => {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(gain.value).toBeCloseTo(0.1778, 3);
    expect(links).toEqual(["source>gain", "gain>meter", "meter>speakers"]);
    player.setVolume(0);
    player.setVolume(1);
    expect(ramps).toEqual([0, 1]);
    player.stop();
    await playing;
    expect(links).toContain("gain!");
  });
});
