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
      fetchImpl: async (url, init) => {
        seen.url = String(url);
        seen.type = new Headers(init?.headers).get("content-type") ?? "";
        seen.body = Buffer.isBuffer(init?.body) ? new Uint8Array(init.body) : undefined;
        return new Response(JSON.stringify({ text: "Bonjour EVA" }), { status: 200 });
      },
    });
    expect(result).toEqual({ ok: true, text: "Bonjour EVA" });
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
      signal: controller.signal,
      fetchImpl: async () => {
        throw new Error("aborted");
      },
    });
    expect(result).toMatchObject({ ok: false, code: "cancelled" });
  });
});
