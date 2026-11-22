import { describe, expect, it } from "vitest";
import {
  IpcChannel,
  loopbackUrl,
  parseAppInfo,
  parseBackendStatus,
  parseConversationCatalog,
  parseConversationRequest,
  parseConversationResult,
  parseHealthPayload,
} from "./contract";

const health = {
  status: "UP",
  service: "eva-backend",
  version: "0.1.0",
  timestamp: "2026-11-19T04:00:00.000Z",
};

describe("parseHealthPayload", () => {
  it("accepts the health contract", () => {
    expect(parseHealthPayload(health)).toEqual(health);
  });

  it("rejects extra fields, wrong services, and bad versions", () => {
    expect(parseHealthPayload({ ...health, extra: true })).toBeNull();
    expect(parseHealthPayload({ ...health, service: "other" })).toBeNull();
    expect(parseHealthPayload({ ...health, version: "0.1" })).toBeNull();
    expect(parseHealthPayload({ ...health, status: "OK" })).toBeNull();
    expect(parseHealthPayload(null)).toBeNull();
  });
});

describe("parseBackendStatus", () => {
  const status = {
    state: "up",
    detail: "The local core is online.",
    health,
    checkedAt: "2026-11-19T04:00:01.000Z",
  };

  it("accepts a complete status", () => {
    expect(parseBackendStatus(status)).toEqual(status);
  });

  it("rejects malformed status payloads", () => {
    expect(parseBackendStatus({ ...status, state: "sleeping" })).toBeNull();
    expect(parseBackendStatus({ ...status, detail: "" })).toBeNull();
    expect(parseBackendStatus({ ...status, health: { ...health, service: "nope" } })).toBeNull();
    expect(parseBackendStatus({ ...status, health, checkedAt: null })).toBeNull();
    expect(parseBackendStatus({ ...status, note: "extra" })).toBeNull();
  });
});

describe("parseAppInfo", () => {
  it("accepts the shell identity", () => {
    expect(parseAppInfo({ name: "EVA", version: "0.1.0", platform: "win32" })).toEqual({
      name: "EVA",
      version: "0.1.0",
      platform: "win32",
    });
  });

  it("rejects unexpected identities", () => {
    expect(parseAppInfo({ name: "Other", version: "0.1.0", platform: "win32" })).toBeNull();
    expect(parseAppInfo({ name: "EVA", version: "0.1.0", platform: "../win" })).toBeNull();
  });
});

describe("loopbackUrl", () => {
  it("builds only loopback http URLs", () => {
    expect(loopbackUrl(17341, "/api/health")).toBe("http://127.0.0.1:17341/api/health");
  });

  it("refuses non-local targets", () => {
    expect(() => loopbackUrl(0, "/api/health")).toThrow(/port/i);
    expect(() => loopbackUrl(17341, "http://evil.example")).toThrow(/path/i);
    expect(() => loopbackUrl(17341, "//evil.example")).toThrow(/path/i);
  });
});

describe("IpcChannel", () => {
  it("exposes only the status and conversation channels", () => {
    expect(Object.values(IpcChannel)).toEqual([
      "eva:backend:get-status",
      "eva:backend:status",
      "eva:app:get-info",
      "eva:conversation:get",
      "eva:conversation:send",
      "eva:conversation:reset",
      "eva:conversation:cancel",
    ]);
  });
});

describe("conversation contract", () => {
  const provider = {
    id: "ollama",
    label: "Ollama",
    local: true,
    reachable: true,
    configured: true,
    detail: "Local models stay on this machine.",
    models: [{ id: "llama3.2", label: "llama3.2" }],
  };
  const openai = {
    ...provider,
    id: "openai",
    label: "OpenAI",
    local: false,
    reachable: true,
    models: [{ id: "gpt-4o-mini", label: "GPT-4o mini" }],
  };

  it("accepts a catalog and rejects a credential-shaped extra field", () => {
    expect(parseConversationCatalog({
      messages: [{ role: "user", text: "Hello" }],
      providers: [provider, openai],
    })?.providers[0].id).toBe("ollama");
    expect(parseConversationCatalog({
      messages: [],
      providers: [{ ...provider, apiKey: "secret" }, openai],
    })).toBeNull();
  });

  it("rejects cloud requests that are missing the explicit opt-in flag", () => {
    expect(parseConversationRequest({
      provider: "openai",
      model: "gpt-4o-mini",
      text: "Hello",
    })).toBeNull();
    expect(parseConversationRequest({
      provider: "openai",
      model: "gpt-4o-mini",
      cloudEnabled: false,
      text: "Hello",
    })).toEqual({
      provider: "openai",
      model: "gpt-4o-mini",
      cloudEnabled: false,
      text: "Hello",
    });
  });

  it("parses usage and a redacted failure", () => {
    expect(parseConversationResult({
      ok: true,
      provider: "openai",
      model: "gpt-4o-mini",
      text: "Hello.",
      usage: { promptTokens: 3, completionTokens: 4, estimatedUsd: 0.01 },
    })).toMatchObject({ ok: true, usage: { estimatedUsd: 0.01 } });
    expect(parseConversationResult({
      ok: false,
      code: "cloud-denied",
      detail: "Cloud mode is off. Nothing was sent.",
    })).toMatchObject({ ok: false, code: "cloud-denied" });
    expect(parseConversationResult({
      ok: false,
      code: "cloud-denied",
      detail: "Cloud mode is off.",
      apiKey: "secret",
    })).toBeNull();
  });
});
