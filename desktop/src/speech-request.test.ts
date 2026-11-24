import { encodePcm16Wav, MIN_SPEECH_SAMPLES } from "../../shared/speech-wav";
import { postSpeech } from "./speech-request";
import { describe, expect, it } from "vitest";

describe("postSpeech", () => {
  it("posts the wav bytes only to the loopback speech route", async () => {
    const audio = encodePcm16Wav(new Float32Array(MIN_SPEECH_SAMPLES));
    const seen: { url?: string; type?: string; body?: Uint8Array } = {};
    const result = await postSpeech({
      port: 17341,
      token: "a".repeat(64),
      audio,
      language: "auto",
      prompt: "",
      recordingMs: 1_200,
      fetchImpl: async (url, init) => {
        seen.url = String(url);
        seen.type = new Headers(init?.headers).get("content-type") ?? "";
        seen.body = Buffer.isBuffer(init?.body) ? new Uint8Array(init.body) : undefined;
        return new Response(JSON.stringify({
          text: "Bonjour EVA",
          elapsedMs: 900,
          recordingMs: 1_200,
          loadMs: null,
          inferenceMs: null,
        }), { status: 200 });
      },
    });
    expect(result).toEqual({
      ok: true,
      text: "Bonjour EVA",
      elapsedMs: 900,
      recordingMs: 1_200,
      loadMs: null,
      inferenceMs: null,
    });
    expect(seen.url).toBe("http://127.0.0.1:17341/api/speech/transcribe");
    expect(seen.type).toBe("application/octet-stream");
    expect(seen.body).toEqual(audio);
    expect(seen.url).not.toContain("openai");
  });

  it("returns a fixed error and does not echo the recording", async () => {
    const audio = encodePcm16Wav(new Float32Array(MIN_SPEECH_SAMPLES).fill(0.2));
    const result = await postSpeech({
      port: 17341,
      token: "a".repeat(64),
      audio,
      language: "en",
      prompt: "",
      recordingMs: 0,
      fetchImpl: async () => new Response("not-json-secretphrase", { status: 500 }),
    });
    expect(result).toMatchObject({ ok: false, code: "engine-error" });
    expect(result.ok ? "" : result.detail).not.toContain("secretphrase");
  });

  it("maps cancellation without calling the network again", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await postSpeech({
      port: 17341,
      token: "a".repeat(64),
      audio: encodePcm16Wav(new Float32Array(MIN_SPEECH_SAMPLES)),
      language: "auto",
      prompt: "",
      recordingMs: 0,
      signal: controller.signal,
      fetchImpl: async () => {
        throw new Error("aborted");
      },
    });
    expect(result).toMatchObject({ ok: false, code: "cancelled" });
  });

  it("sends the language and one encoded vocabulary prompt", async () => {
    const audio = encodePcm16Wav(new Float32Array(MIN_SPEECH_SAMPLES));
    const headers = new Headers();
    await postSpeech({
      port: 17341,
      token: "a".repeat(64),
      audio,
      language: "ar",
      prompt: "Muay Thai",
      recordingMs: 4_000,
      fetchImpl: async (_url, init) => {
        new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
        return new Response(JSON.stringify({
          text: "Muay Thai",
          elapsedMs: 1500,
          recordingMs: 4_000,
          loadMs: 800,
          inferenceMs: 500,
        }), { status: 200 });
      },
    });
    expect(headers.get("x-eva-language")).toBe("ar");
    expect(headers.get("x-eva-prompt")).toBe(encodeURIComponent("Muay Thai"));
    expect(headers.get("x-eva-recording-ms")).toBe("4000");
    expect(headers.get("x-eva-prompt")).not.toContain(" ");
  });
});
