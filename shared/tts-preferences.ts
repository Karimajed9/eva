import { isRecord } from "./contract";

export const ttsVoices = [
  { id: "af_heart", label: "Heart", lang: "en-us" },
  { id: "af_bella", label: "Bella", lang: "en-us" },
  { id: "af_nova", label: "Nova", lang: "en-us" },
  { id: "af_sarah", label: "Sarah", lang: "en-us" },
  { id: "bf_emma", label: "Emma", lang: "en-gb" },
  { id: "ff_siwis", label: "Siwis", lang: "fr-fr" },
] as const;

export type TtsVoiceId = (typeof ttsVoices)[number]["id"];
export type TtsLanguage = (typeof ttsVoices)[number]["lang"];

export const DEFAULT_TTS_VOICE: TtsVoiceId = "af_heart";
export const TTS_PREVIEW = "Hello. I'm EVA, your personal assistant. How can I help you today?";
export const MIN_TTS_SPEED = 0.5;
export const MAX_TTS_SPEED = 1.5;

export interface TtsPreferences {
  voice: TtsVoiceId;
  speed: number;
  volume: number;
  autoPlay: boolean;
}

export const defaultTtsPreferences: TtsPreferences = {
  voice: DEFAULT_TTS_VOICE,
  speed: 1,
  volume: 1,
  autoPlay: false,
};

export function ttsVoice(id: string): (typeof ttsVoices)[number] | null {
  return ttsVoices.find((voice) => voice.id === id) ?? null;
}

export function parseTtsPreferences(value: unknown): TtsPreferences | null {
  if (!isRecord(value)) {
    return null;
  }
  const keys = Object.keys(value);
  if (keys.length !== 4 || !["voice", "speed", "volume", "autoPlay"].every((key) => keys.includes(key))) {
    return null;
  }
  const voice = typeof value.voice === "string" ? ttsVoice(value.voice) : null;
  const speed = parseScaled(value.speed, MIN_TTS_SPEED, MAX_TTS_SPEED);
  const volume = parseScaled(value.volume, 0, 1);
  if (!voice || speed === null || volume === null || typeof value.autoPlay !== "boolean") {
    return null;
  }
  return { voice: voice.id, speed, volume, autoPlay: value.autoPlay };
}

function parseScaled(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    return null;
  }
  const scaled = Math.round(value * 100) / 100;
  if (Math.abs(scaled - value) > 0.001) {
    return null;
  }
  return scaled;
}
