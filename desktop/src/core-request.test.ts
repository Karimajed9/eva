import { describe, expect, it } from "vitest";
import { callCore, streamCore } from "./core-request";
import type { ConversationDelta } from "../../shared/contract";

function ndjson(parts: string[], status = 200): Response {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      for (const part of parts) {
        controller.enqueue(encoder.encode(part));
      }
      controller.close();
    },
  });
  return new Response(stream, { status, headers: { "Content-Type": "application/x-ndjson" } });
}

describe("callCore", () => {
  it("sends the session token only to loopback and hides it from failures", async () => {
    const token = "unit-test-credential";
    let seenUrl = "";
    let seenAuthorization = "";
    const result = await callCore({
      port: 17341,
      token,
      path: "/api/conversation",
      method: "POST",
      body: { provider: "ollama", model: "llama3.2", cloudEnabled: false, text: "Hi" },
      fetchImpl: (async (url, init) => {
        seenUrl = String(url);
        seenAuthorization = new Headers(init?.headers).get("Authorization") ?? "";
        throw new Error(`socket closed while using ${token}`);
      }) as typeof fetch,
    });

    expect(seenUrl).toBe("http://127.0.0.1:17341/api/conversation");
    expect(seenAuthorization).toBe(`Bearer ${token}`);
    expect(result).toEqual({ ok: false, code: "unavailable", detail: "The local core could not be reached." });
    expect(JSON.stringify(result)).not.toContain(token);
  });

  it("maps a cloud denial without calling another provider", async () => {
    const result = await callCore({
      port: 17341,
      token: "unit-test-credential",
      path: "/api/conversation",
      method: "POST",
      body: { provider: "openai", model: "gpt-4o-mini", cloudEnabled: false, text: "Hi" },
      fetchImpl: (async () => new Response(JSON.stringify({
        error: "cloud-denied",
        detail: "Cloud mode is off. Nothing was sent.",
      }), { status: 403 })) as typeof fetch,
    });
    expect(result).toEqual({
      ok: false,
      code: "cloud-denied",
      detail: "Cloud mode is off. Nothing was sent.",
    });
  });

  it("does not call the network when the core has no port", async () => {
    let called = false;
    const result = await callCore({
      port: null,
      token: "",
      path: "/api/conversation",
      method: "GET",
      fetchImpl: (async () => {
        called = true;
        return new Response("{}", { status: 200 });
      }) as typeof fetch,
    });
    expect(called).toBe(false);
    expect(result).toMatchObject({ ok: false, code: "unavailable" });
  });
});

describe("streamCore", () => {
  it("forwards each new chunk once and returns the finished reply", async () => {
    const deltas: ConversationDelta[] = [];
    const result = await streamCore({
      port: 17341,
      token: "unit-test-credential",
      path: "/api/conversation",
      method: "POST",
      body: { provider: "ollama", model: "llama3.2", cloudEnabled: false, text: "Hi" },
      onDelta: (delta) => deltas.push(delta),
      fetchImpl: (async () => ndjson([
        "{\"type\":\"delta\",\"seq\":1,\"text\":\"He\"}\n",
        "{\"type\":\"delta\",\"seq\":1,\"text\":\"NO\"}\n{\"type\":\"delta\",\"seq\":2,\"text\":\"llo\"}",
        "\n{\"type\":\"done\",\"seq\":3,\"provider\":\"ollama\",\"model\":\"llama3.2\",\"text\":\"Hello\",\"usage\":{\"promptTokens\":4,\"completionTokens\":2,\"estimatedUsd\":null}}\n",
      ])) as typeof fetch,
    });

    expect(deltas.map((delta) => delta.text)).toEqual(["He", "llo"]);
    expect(result).toMatchObject({ ok: true, text: "Hello", usage: { promptTokens: 4, completionTokens: 2 } });
  });

  it("treats a closed stream and a provider error as incomplete replies", async () => {
    const closed = await streamCore({
      port: 17341,
      token: "unit-test-credential",
      path: "/api/conversation",
      method: "POST",
      body: { text: "Hi" },
      onDelta: () => {},
      fetchImpl: (async () => ndjson(["{\"type\":\"delta\",\"seq\":1,\"text\":\"partial\"}\n"])) as typeof fetch,
    });
    expect(closed).toMatchObject({ ok: false, code: "provider-error" });
    expect(JSON.stringify(closed)).not.toContain("partial");

    const failed = await streamCore({
      port: 17341,
      token: "unit-test-credential",
      path: "/api/conversation",
      method: "POST",
      body: { text: "Hi" },
      onDelta: () => {},
      fetchImpl: (async () => ndjson([
        "{\"type\":\"error\",\"seq\":1,\"code\":\"provider-error\",\"detail\":\"Ollama closed the reply before it finished.\"}\n",
      ])) as typeof fetch,
    });
    expect(failed).toEqual({
      ok: false,
      code: "provider-error",
      detail: "Ollama closed the reply before it finished.",
    });
  });

  it("stops on abort without leaking the session token", async () => {
    const controller = new AbortController();
    const result = await streamCore({
      port: 17341,
      token: "unit-test-credential",
      path: "/api/conversation",
      method: "POST",
      body: { text: "Hi" },
      signal: controller.signal,
      onDelta: () => {},
      fetchImpl: (async (_url, init) => {
        controller.abort();
        init?.signal?.throwIfAborted();
        throw new Error("aborted unit-test-credential");
      }) as typeof fetch,
    });
    expect(result).toEqual({ ok: false, code: "cancelled", detail: "The reply was cancelled." });
    expect(JSON.stringify(result)).not.toContain("unit-test-credential");
  });
});