import { describe, expect, it } from "vitest";
import { TTS_SAMPLE_RATE } from "../../shared/tts";
import { postTts } from "./tts-request";

function wav(samples = TTS_SAMPLE_RATE / 10): Uint8Array {
  const dataBytes = samples * 2;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  bytes.set([82, 73, 70, 70], 0);
  view.setUint32(4, 36 + dataBytes, true);
  bytes.set([87, 65, 86, 69, 102, 109, 116, 32], 8);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, TTS_SAMPLE_RATE, true);
  view.setUint32(28, TTS_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  bytes.set([100, 97, 116, 97], 36);
  view.setUint32(40, dataBytes, true);
  return bytes;
}

describe("postTts", () => {
  it("posts text only to the loopback speech route and returns wav timings", async () => {
    const seen: { url?: string; body?: string; type?: string } = {};
    const result = await postTts({
      port: 17341,
      token: "a".repeat(64),
      request: { voice: "af_heart", speed: 1, lang: "en-us", text: "Hello." },
      fetchImpl: async (url, init) => {
        seen.url = String(url);
        seen.type = new Headers(init?.headers).get("content-type") ?? "";
        seen.body = String(init?.body);
        return new Response(Buffer.from(wav()), {
          status: 200,
          headers: {
            "Content-Type": "audio/wav",
            "X-Eva-Elapsed-Ms": "40",
            "X-Eva-Load-Ms": "0",
            "X-Eva-Audio-Ms": "100",
            "X-Eva-Sample-Rate": "24000",
          },
        });
      },
    });
    expect(seen.url).toBe("http://127.0.0.1:17341/api/tts/synthesize");
    expect(seen.type).toBe("application/json");
    expect(seen.body).toBe("{\"voice\":\"af_heart\",\"speed\":1,\"text\":\"Hello.\"}");
    expect(seen.url).not.toContain("openai");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.elapsedMs).toBe(40);
      expect(result.loadMs).toBe(0);
      expect(result.sampleRate).toBe(24_000);
    }
  });

  it("returns a fixed error and does not echo the text", async () => {
    const result = await postTts({
      port: 17341,
      token: "a".repeat(64),
      request: { voice: "af_heart", speed: 1, lang: "en-us", text: "secretphrase" },
      fetchImpl: async () => new Response("not-json-secretphrase", { status: 500 }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.detail).not.toContain("secretphrase");
    }
  });
});
