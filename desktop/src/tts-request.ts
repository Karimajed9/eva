import { isRecord, loopbackUrl } from "../../shared/contract";
import {
  parseTtsStatus,
  parseTtsWav,
  ttsFailure,
  type TtsCode,
  type TtsResult,
  type TtsStatus,
} from "../../shared/tts";
import type { TtsRequest } from "../../shared/tts";
import { redactSecrets } from "./redact";

const TTS_TIMEOUT_MS = 150_000;

export interface TtsCall {
  port: number | null;
  token: string;
  request: TtsRequest;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export async function postTts(input: TtsCall): Promise<TtsResult> {
  if (input.port === null || input.token.length === 0) {
    return ttsFailure("unavailable", "The local core is not running.");
  }
  const signal = input.signal
    ? AbortSignal.any([input.signal, AbortSignal.timeout(TTS_TIMEOUT_MS)])
    : AbortSignal.timeout(TTS_TIMEOUT_MS);
  try {
    const response = await (input.fetchImpl ?? fetch)(loopbackUrl(input.port, "/api/tts/synthesize"), {
      method: "POST",
      headers: {
        Accept: "audio/wav, application/json",
        Authorization: `Bearer ${input.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        voice: input.request.voice,
        speed: input.request.speed,
        text: input.request.text,
      }),
      signal,
    });
    if (!response.ok) {
      const raw = redactSecrets(await response.text(), [input.token]);
      return failureBody(response.status, raw);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const wav = parseTtsWav(bytes);
    if (!wav) {
      return ttsFailure("engine-error", "Local speech failed.");
    }
    const elapsedMs = headerInt(response.headers.get("x-eva-elapsed-ms"), 180_000) ?? 0;
    const loadHeader = response.headers.get("x-eva-load-ms");
    const loadMs = loadHeader == null || loadHeader.length === 0 ? null : headerInt(loadHeader, 600_000) ?? null;
    return {
      ok: true,
      audio: wav.audio,
      elapsedMs,
      loadMs,
      audioMs: wav.audioMs,
      sampleRate: wav.sampleRate,
    };
  } catch {
    if (input.signal?.aborted) {
      return ttsFailure("cancelled", "Speech was cancelled.");
    }
    return ttsFailure("unavailable", "The local core could not be reached.");
  }
}

export async function readTtsStatus(port: number | null, token: string, fetchImpl?: typeof fetch): Promise<TtsStatus | TtsResult> {
  if (port === null || token.length === 0) {
    return ttsFailure("unavailable", "The local core is not running.");
  }
  const response = await (fetchImpl ?? fetch)(loopbackUrl(port, "/api/tts"), {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5_000),
  });
  const raw = redactSecrets(await response.text(), [token]);
  if (!response.ok) {
    return failureBody(response.status, raw);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return ttsFailure("engine-error", "Local speech failed.");
  }
  return parseTtsStatus(parsed) ?? ttsFailure("engine-error", "Local speech failed.");
}

function failureBody(status: number, body: string): TtsResult {
  let code: TtsCode = "engine-error";
  let detail = "Local speech failed.";
  try {
    const parsed: unknown = JSON.parse(body);
    if (isRecord(parsed) && typeof parsed.error === "string") {
      const known = ["missing-engine", "missing-model", "missing-runtime", "invalid-speech", "cancelled", "busy", "engine-error", "unavailable"];
      if (known.includes(parsed.error)) {
        code = parsed.error as TtsCode;
      }
    }
    if (isRecord(parsed) && typeof parsed.detail === "string" && parsed.detail.length > 0 && parsed.detail.length <= 400) {
      detail = parsed.detail;
    }
  } catch {
    if (status === 0) {
      code = "unavailable";
      detail = "The local core could not be reached.";
    }
  }
  return ttsFailure(code, detail);
}

function headerInt(value: string | null, max: number): number | null {
  if (value == null || !/^[0-9]{1,6}$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  if (parsed > max) {
    return null;
  }
  return parsed;
}
