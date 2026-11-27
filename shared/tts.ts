import { isRecord } from "./contract";
import { MAX_SEGMENT_CHARS } from "./spoken-text";
import { ttsVoice, type TtsLanguage, type TtsVoiceId } from "./tts-preferences";

export const ttsCodes = [
  "missing-engine",
  "missing-model",
  "missing-runtime",
  "invalid-speech",
  "cancelled",
  "busy",
  "engine-error",
  "unavailable",
] as const;
export type TtsCode = (typeof ttsCodes)[number];

export interface TtsStatus {
  engine: "kokoro";
  available: boolean;
  detail: string;
  loadMs: number | null;
}

export interface TtsSuccess {
  ok: true;
  audio: Uint8Array;
  elapsedMs: number;
  loadMs: number | null;
  audioMs: number;
  sampleRate: number;
}

export interface TtsFailure {
  ok: false;
  code: TtsCode;
  detail: string;
}

export type TtsResult = TtsSuccess | TtsFailure;

export interface TtsRequest {
  voice: TtsVoiceId;
  speed: number;
  lang: TtsLanguage;
  text: string;
}

export const TTS_SAMPLE_RATE = 24_000;
export const MAX_TTS_AUDIO_MS = 180_000;
const HEADER = 44;
const MAX_SAMPLES = TTS_SAMPLE_RATE * (MAX_TTS_AUDIO_MS / 1_000);
export const MAX_TTS_WAV_BYTES = HEADER + MAX_SAMPLES * 2;

export function parseTtsRequest(value: unknown): TtsRequest | null {
  if (!isRecord(value)) {
    return null;
  }
  const keys = Object.keys(value);
  const voiceSpeedText = ["voice", "speed", "text"].every((key) => keys.includes(key));
  const langOnly = keys.length === 4 && keys.includes("lang");
  if (!voiceSpeedText || (keys.length !== 3 && !langOnly)) {
    return null;
  }
  const voice = typeof value.voice === "string" ? ttsVoice(value.voice) : null;
  if (!voice || typeof value.text !== "string" || value.text.trim().length === 0 || value.text.length > MAX_SEGMENT_CHARS) {
    return null;
  }
  if (langOnly && value.lang !== voice.lang) {
    return null;
  }
  if (typeof value.speed !== "number" || !Number.isFinite(value.speed)) {
    return null;
  }
  const speed = Math.round(value.speed * 100) / 100;
  if (Math.abs(speed - value.speed) > 0.001 || speed < 0.5 || speed > 1.5) {
    return null;
  }
  return { voice: voice.id, speed, lang: voice.lang, text: value.text.trim() };
}

export function parseTtsStatus(value: unknown): TtsStatus | null {
  if (!isRecord(value) || !hasKeys(value, ["engine", "available", "detail", "loadMs"])) {
    return null;
  }
  if (value.engine !== "kokoro" || typeof value.available !== "boolean" || typeof value.detail !== "string") {
    return null;
  }
  if (value.detail.length === 0 || value.detail.length > 400) {
    return null;
  }
  const loadMs = value.loadMs === null ? null : bounded(value.loadMs, 600_000);
  if (loadMs === undefined) {
    return null;
  }
  return { engine: "kokoro", available: value.available, detail: value.detail, loadMs };
}

export function parseTtsWav(value: Uint8Array): { audio: Uint8Array; sampleRate: number; audioMs: number } | null {
  if (!(value instanceof Uint8Array) || value.length < HEADER + 2 || value.length > MAX_TTS_WAV_BYTES) {
    return null;
  }
  const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
  if (text(value, 0, "RIFF") === false || text(value, 8, "WAVE") === false || text(value, 12, "fmt ") === false) {
    return null;
  }
  if (view.getUint32(4, true) !== value.length - 8 || view.getUint32(16, true) !== 16) {
    return null;
  }
  if (view.getUint16(20, true) !== 1 || view.getUint16(22, true) !== 1 || view.getUint16(34, true) !== 16) {
    return null;
  }
  const sampleRate = view.getUint32(24, true);
  const dataBytes = view.getUint32(40, true);
  if (sampleRate !== TTS_SAMPLE_RATE || view.getUint32(28, true) !== sampleRate * 2 || view.getUint16(32, true) !== 2) {
    return null;
  }
  if (text(value, 36, "data") === false || dataBytes !== value.length - HEADER || dataBytes % 2 !== 0) {
    return null;
  }
  const samples = dataBytes / 2;
  if (samples < TTS_SAMPLE_RATE / 20 || samples > MAX_SAMPLES) {
    return null;
  }
  return { audio: value, sampleRate, audioMs: Math.round((samples / sampleRate) * 1000) };
}

export function ttsFailure(code: TtsCode, detail: string): TtsFailure {
  return { ok: false, code, detail };
}

export function parseTtsFailure(value: unknown): TtsFailure | null {
  if (!isRecord(value) || value.ok !== false) {
    return null;
  }
  const keys = Object.keys(value);
  if (keys.length !== 3 || !keys.includes("ok") || !keys.includes("code") || !keys.includes("detail")) {
    return null;
  }
  if (typeof value.code !== "string" || !(ttsCodes as readonly string[]).includes(value.code)) {
    return null;
  }
  if (typeof value.detail !== "string" || value.detail.length === 0 || value.detail.length > 400) {
    return null;
  }
  return { ok: false, code: value.code as TtsCode, detail: value.detail };
}

function hasKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function bounded(value: unknown, max: number): number | null | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > max) {
    return undefined;
  }
  return value;
}

function text(bytes: Uint8Array, offset: number, expected: string): boolean {
  for (let index = 0; index < expected.length; index += 1) {
    if (bytes[offset + index] !== expected.charCodeAt(index)) {
      return false;
    }
  }
  return true;
}
