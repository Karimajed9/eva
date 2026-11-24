import { describe, expect, it } from "vitest";
import { encodePcm16Wav, MIN_SPEECH_SAMPLES } from "./speech-wav";
import {
  emptySpeechPreferences,
  normalizeVocabulary,
  parseSpeechAudioRequest,
  parseSpeechPreferences,
  speechPrompt,
} from "./speech-preferences";

describe("speech preferences", () => {
  it("starts empty and accepts a short multilingual vocabulary", () => {
    expect(emptySpeechPreferences).toEqual({ language: "auto", vocabulary: [] });
    expect(speechPrompt([])).toBe("");
    const saved = parseSpeechPreferences({
      language: "fr",
      vocabulary: ["Muay Thai", "مرحبا"],
    });
    expect(saved).toEqual({ language: "fr", vocabulary: ["Muay Thai", "مرحبا"] });
    expect(speechPrompt(saved?.vocabulary ?? [])).toBe("Muay Thai, مرحبا");
  });

  it("rejects shell characters, extra fields, and oversized lists", () => {
    expect(normalizeVocabulary(["ok & calc.exe"])).toBeNull();
    expect(normalizeVocabulary(["line\nbreak"])).toBeNull();
    expect(normalizeVocabulary(["a".repeat(41)])).toBeNull();
    expect(parseSpeechPreferences({ language: "de", vocabulary: [] })).toBeNull();
    expect(parseSpeechPreferences({ language: "en", vocabulary: [], prompt: "hidden" })).toBeNull();
    expect(normalizeVocabulary(Array.from({ length: 21 }, () => "term"))).toBeNull();
  });

  it("accepts only a validated recording with its language and prompt", () => {
    const audio = encodePcm16Wav(new Float32Array(MIN_SPEECH_SAMPLES));
    expect(parseSpeechAudioRequest({
      audio,
      language: "ar",
      prompt: "Muay Thai",
      recordingMs: 8_000,
    })).toMatchObject({ language: "ar", prompt: "Muay Thai", recordingMs: 8_000 });
    expect(parseSpeechAudioRequest({
      audio,
      language: "en",
      prompt: "Muay Thai",
      recordingMs: 8_000,
      executable: "C:\\Windows\\System32\\cmd.exe",
    })).toBeNull();
    expect(parseSpeechAudioRequest({
      audio,
      language: "en",
      prompt: "ok; calc",
      recordingMs: 1,
    })).toBeNull();
  });
});
