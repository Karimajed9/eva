import { describe, expect, it } from "vitest";
import { callCore } from "./core-request";

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