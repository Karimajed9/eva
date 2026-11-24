import { isRecord } from "./contract";
import { parseSpeechWav } from "./speech-wav";

export const speechLanguages = ["auto", "en", "fr", "ar"] as const;
export type SpeechLanguage = (typeof speechLanguages)[number];

export const MAX_VOCABULARY_TERMS = 20;
export const MAX_VOCABULARY_TERM = 40;
export const MAX_SPEECH_PROMPT = 240;
export const MAX_RECORDING_MS = 60_000;
export const MAX_TRANSCRIPTION_MS = 180_000;

const TERM = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .'-]{0,39}$/u;
const PROMPT = /^[\p{L}\p{M}\p{N} ,.'-]+$/u;

export interface SpeechPreferences {
  language: SpeechLanguage;
  vocabulary: string[];
}

export interface SpeechAudioRequest {
  audio: Uint8Array;
  language: SpeechLanguage;
  prompt: string;
  recordingMs: number;
}

export const emptySpeechPreferences: SpeechPreferences = {
  language: "auto",
  vocabulary: [],
};

export function isSpeechLanguage(value: unknown): value is SpeechLanguage {
  return typeof value === "string" && (speechLanguages as readonly string[]).includes(value);
}

export function normalizeVocabulary(terms: readonly unknown[]): string[] | null {
  if (terms.length > MAX_VOCABULARY_TERMS) {
    return null;
  }
  const vocabulary: string[] = [];
  for (const term of terms) {
    if (typeof term !== "string" || term.length > MAX_VOCABULARY_TERM + 8) {
      return null;
    }
    if (/[^\S ]/u.test(term) || /[\u0000-\u001F\u007F]/u.test(term)) {
      return null;
    }
    const normalized = term.trim().replace(/ {2,}/g, " ");
    if (!TERM.test(normalized) || normalized.length > MAX_VOCABULARY_TERM) {
      return null;
    }
    vocabulary.push(normalized);
  }
  if (speechPrompt(vocabulary).length > MAX_SPEECH_PROMPT) {
    return null;
  }
  return vocabulary;
}

export function speechPrompt(vocabulary: readonly string[]): string {
  return vocabulary.join(", ");
}

export function parseSpeechPrompt(value: unknown): string | null {
  if (typeof value !== "string" || value.length > MAX_SPEECH_PROMPT) {
    return null;
  }
  if (value.length === 0) {
    return "";
  }
  if (!PROMPT.test(value)) {
    return null;
  }
  return value;
}

export function parseSpeechPreferences(value: unknown): SpeechPreferences | null {
  if (!isRecord(value)) {
    return null;
  }
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes("language") || !keys.includes("vocabulary")) {
    return null;
  }
  if (!isSpeechLanguage(value.language) || !Array.isArray(value.vocabulary)) {
    return null;
  }
  const vocabulary = normalizeVocabulary(value.vocabulary);
  if (!vocabulary) {
    return null;
  }
  return { language: value.language, vocabulary };
}

export function parseSpeechAudioRequest(value: unknown): SpeechAudioRequest | null {
  if (!isRecord(value)) {
    return null;
  }
  const keys = Object.keys(value);
  if (keys.length !== 4 || !["audio", "language", "prompt", "recordingMs"].every((key) => keys.includes(key))) {
    return null;
  }
  const audio = parseSpeechWav(value.audio);
  const prompt = parseSpeechPrompt(value.prompt);
  if (!audio || !isSpeechLanguage(value.language) || prompt === null) {
    return null;
  }
  if (typeof value.recordingMs !== "number" || !Number.isInteger(value.recordingMs) || value.recordingMs < 0 || value.recordingMs > MAX_RECORDING_MS) {
    return null;
  }
  return {
    audio,
    language: value.language,
    prompt,
    recordingMs: value.recordingMs,
  };
}
