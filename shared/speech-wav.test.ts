import { describe, expect, it } from "vitest";
import {
  MAX_SPEECH_SAMPLES,
  MIN_SPEECH_SAMPLES,
  SPEECH_RATE,
  audibleSpeech,
  encodePcm16Wav,
  parseSpeechWav,
  samplesToSpeechWav,
  speechWavError,
} from "./speech-wav";

function tone(length: number, rate = SPEECH_RATE): Float32Array {
  const samples = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    samples[index] = Math.sin((index / rate) * Math.PI * 2 * 440) * 0.2;
  }
  return samples;
}

describe("speech wav", () => {
  it("encodes 16 kHz mono PCM that the core can accept", () => {
    const wav = encodePcm16Wav(tone(MIN_SPEECH_SAMPLES));
    expect(speechWavError(wav)).toBeNull();
    expect(parseSpeechWav(wav)).toEqual(wav);
    expect(wav.byteLength).toBe(44 + MIN_SPEECH_SAMPLES * 2);
  });

  it("downsamples to 16 kHz before encoding", () => {
    const wav = samplesToSpeechWav(tone(SPEECH_RATE, 48_000), 48_000);
    expect(speechWavError(wav)).toBeNull();
    expect(new DataView(wav.buffer).getUint32(24, true)).toBe(SPEECH_RATE);
  });

  it("rejects short, altered, and non-wav audio", () => {
    expect(() => encodePcm16Wav(tone(MIN_SPEECH_SAMPLES - 1))).toThrow(/too short/i);
    expect(() => encodePcm16Wav(tone(MAX_SPEECH_SAMPLES + 1))).toThrow(/60 seconds/i);
    const wav = encodePcm16Wav(tone(MIN_SPEECH_SAMPLES));
    const stereo = new Uint8Array(wav);
    stereo[22] = 2;
    expect(speechWavError(stereo)).toMatch(/could not use/i);
    const wrongRate = new Uint8Array(wav);
    wrongRate[24] = 0x80;
    wrongRate[25] = 0xbb;
    expect(speechWavError(wrongRate)).toMatch(/could not use/i);
    expect(parseSpeechWav(new TextEncoder().encode("not audio"))).toBeNull();
    expect(parseSpeechWav({ path: "C:\\evil.exe" })).toBeNull();
    expect(parseSpeechWav(wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength))).not.toBeNull();
  });

  it("treats room noise as silence and keeps a word that starts late", () => {
    const quiet = new Float32Array(SPEECH_RATE).fill(0.2);
    expect(audibleSpeech(quiet, SPEECH_RATE)).toBe(false);
    const late = new Float32Array(SPEECH_RATE);
    late.set(tone(Math.round(SPEECH_RATE * 0.05), SPEECH_RATE), SPEECH_RATE - Math.round(SPEECH_RATE * 0.05));
    expect(audibleSpeech(late, SPEECH_RATE)).toBe(true);
    expect(audibleSpeech(new Float32Array(0), SPEECH_RATE)).toBe(false);
  });
});
