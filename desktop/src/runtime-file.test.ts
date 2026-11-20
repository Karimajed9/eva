import { describe, expect, it } from "vitest";
import { parseRuntimeRecord, shouldReapCommandLine } from "./runtime-file";

describe("runtime records", () => {
  it("parses a pid file and rejects secrets-shaped extras", () => {
    expect(parseRuntimeRecord({
      pid: 42,
      port: 17341,
      createdAt: "2026-11-19T04:00:00.000Z",
    })).toEqual({
      pid: 42,
      port: 17341,
      createdAt: "2026-11-19T04:00:00.000Z",
    });
    expect(parseRuntimeRecord({ pid: -1, port: 80, createdAt: "2026-11-19T04:00:00.000Z" })).toBeNull();
    expect(parseRuntimeRecord({ pid: 4, port: 80, createdAt: "nope" })).toBeNull();
  });

  it("reaps only a confirmed JARVIS backend process", () => {
    expect(shouldReapCommandLine("java -jar C:\\apps\\jarvis-backend-0.1.0.jar --server.port=1")).toBe(true);
    expect(shouldReapCommandLine("java -jar some-other-app.jar")).toBe(false);
    expect(shouldReapCommandLine("mvn -q test jarvis-backend-0.1.0.jar")).toBe(false);
    expect(shouldReapCommandLine("")).toBe(false);
  });
});
