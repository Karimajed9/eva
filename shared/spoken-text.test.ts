import { describe, expect, it } from "vitest";
import { MAX_SEGMENT_CHARS, MAX_SPEECH_SEGMENTS, speakableSegments, spokenText } from "./spoken-text";

describe("spoken text", () => {
  it("removes markdown, code, and long urls without keeping the original markers", () => {
    const spoken = spokenText([
      "# Hello",
      "See [the guide](https://example.com/docs/very/long/path) and https://example.com/a/b/c/d/e/f.",
      "- First item",
      "2. Second item",
      "Use `eva` in a sentence.",
      "```sh",
      "Remove-Item -Recurse C:\\secret",
      "```",
      "Price is 3.14 dollars.",
    ].join("\n"));
    expect(spoken).toContain("Hello");
    expect(spoken).toContain("the guide");
    expect(spoken).toContain("a link");
    expect(spoken).toContain("First item");
    expect(spoken).toContain("2, Second item");
    expect(spoken).toContain("eva");
    expect(spoken).toContain("code block omitted");
    expect(spoken).toContain("3.14");
    expect(spoken).not.toContain("```");
    expect(spoken).not.toContain("Remove-Item");
    expect(spoken).not.toContain("https://");
    expect(spoken).not.toContain("**");
  });

  it("keeps abbreviations and decimals together and bounds the queue", () => {
    const segments = speakableSegments("Dr. Eva lives in the U.S. and the total is 3.14 today. Please continue.");
    expect(segments.join(" ")).toContain("Dr. Eva");
    expect(segments.join(" ")).toContain("3.14");
    expect(segments.length).toBeGreaterThan(0);
    expect(segments.length).toBeLessThanOrEqual(MAX_SPEECH_SEGMENTS);
    const many = speakableSegments(Array.from({ length: 30 }, (_, index) => `Sentence number ${index} is long enough to stand alone today.`).join(" "));
    expect(many.length).toBeLessThanOrEqual(MAX_SPEECH_SEGMENTS);
    expect(many.every((part) => part.length <= MAX_SEGMENT_CHARS)).toBe(true);
    expect(many.join(" ")).toContain("Sentence number 0");
    expect(many.join(" ")).toContain("Sentence number 29");
    const long = speakableSegments(Array.from({ length: 24 }, (_, index) => `${"word ".repeat(40)}${index}.`).join(" "));
    expect(long.length).toBeGreaterThan(16);
    expect(long.every((part) => part.length <= MAX_SEGMENT_CHARS)).toBe(true);
  });
});
