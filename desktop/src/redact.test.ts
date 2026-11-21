import { describe, expect, it } from "vitest";
import { redactSecrets } from "./redact";

describe("redactSecrets", () => {
  it("removes session tokens and bearer headers", () => {
    const token = "abc123def456abc123def456abc123de";
    const input = `starting with ${token} and Authorization: Bearer ${token}`;
    expect(redactSecrets(input, [token])).toBe("starting with [redacted] and Authorization: Bearer [redacted]");
    expect(redactSecrets(input, [token])).not.toContain(token);
  });

  it("leaves ordinary log lines unchanged", () => {
    expect(redactSecrets("Tomcat started on port 17341", [])).toBe("Tomcat started on port 17341");
  });
});
