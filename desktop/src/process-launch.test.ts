import { describe, expect, it } from "vitest";
import { parseJavaMajor, resolveJavaExecutable } from "./process-launch";

describe("parseJavaMajor", () => {
  it("reads modern and legacy version strings", () => {
    expect(parseJavaMajor('openjdk version "21.0.13.0.2" 2026-10-22')).toBe(21);
    expect(parseJavaMajor('java version "1.8.0_402"')).toBe(8);
    expect(parseJavaMajor("no version here")).toBeNull();
  });
});

describe("resolveJavaExecutable", () => {
  it("prefers JAVA_HOME when the binary exists", () => {
    const home = process.env.JAVA_HOME;
    if (!home) {
      expect(resolveJavaExecutable({})).toMatch(/java(\.exe)?$/);
      return;
    }
    expect(resolveJavaExecutable({ JAVA_HOME: home })).toContain(home);
  });
});
