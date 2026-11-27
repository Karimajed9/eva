import { describe, expect, it } from "vitest";
import { redactSecrets } from "./redact";

describe("redactSecrets", () => {
  it("removes a supplied secret and a bearer header that was not in the list", () => {
    const session = "evasessionevasession";
    expect(redactSecrets(`starting with ${session}`, [session])).toBe("starting with [redacted]");
    expect(redactSecrets(`starting with ${session}`, [session])).not.toContain(session);
    expect(redactSecrets("Authorization: Bearer evasessionevasession", [])).toBe("Authorization: Bearer [redacted]");
  });

  it("leaves ordinary log lines unchanged", () => {
    expect(redactSecrets("Tomcat started on port 17341", [])).toBe("Tomcat started on port 17341");
  });
});
