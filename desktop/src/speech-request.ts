import { Buffer } from "node:buffer";
import {
  loopbackUrl,
  parseSpeechTranscript,
  speechFailureFromCore,
  type SpeechResult,
} from "../../shared/contract";
import { redactSecrets } from "./redact";

const SPEECH_TIMEOUT_MS = 150_000;
const MAX_RESPONSE = 64_000;

export interface SpeechCall {
  port: number | null;
  token: string;
  audio: Uint8Array;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export async function postSpeech(input: SpeechCall): Promise<SpeechResult> {
  if (input.port === null || input.token.length === 0) {
    return { ok: false, code: "unavailable", detail: "The local core is not running." };
  }
  let url: string;
  try {
    url = loopbackUrl(input.port, "/api/speech/transcribe");
  } catch {
    return { ok: false, code: "engine-error", detail: "The speech path was rejected." };
  }
  const signal = input.signal
    ? AbortSignal.any([input.signal, AbortSignal.timeout(SPEECH_TIMEOUT_MS)])
    : AbortSignal.timeout(SPEECH_TIMEOUT_MS);
  try {
    const response = await (input.fetchImpl ?? fetch)(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${input.token}`,
        "Content-Type": "application/octet-stream",
      },
      body: Buffer.from(input.audio),
      signal,
    });
    const raw = await response.text();
    if (raw.length > MAX_RESPONSE) {
      return { ok: false, code: "engine-error", detail: "The transcription response was larger than expected." };
    }
    const text = redactSecrets(raw, [input.token]);
    if (!response.ok) {
      return speechFailureFromCore(response.status, text);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      return { ok: false, code: "engine-error", detail: "Local transcription failed." };
    }
    return parseSpeechTranscript(parsed) ?? {
      ok: false,
      code: "engine-error",
      detail: "No speech was recognized.",
    };
  } catch {
    if (input.signal?.aborted) {
      return { ok: false, code: "cancelled", detail: "Transcription was cancelled." };
    }
    return { ok: false, code: "unavailable", detail: "The local core could not be reached." };
  }
}
