import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readSpeechPreferences, writeSpeechPreferences } from "./speech-preferences";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("speech preference file", () => {
  it("starts empty and round-trips a vocabulary without logging it", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "eva-speech-prefs-"));
    directories.push(directory);
    const file = path.join(directory, "speech-preferences.json");
    expect(await readSpeechPreferences(file)).toEqual({ language: "auto", vocabulary: [] });
    await writeSpeechPreferences(file, { language: "ar", vocabulary: ["Muay Thai"] });
    expect(await readSpeechPreferences(file)).toEqual({ language: "ar", vocabulary: ["Muay Thai"] });
    const raw = await readFile(file, "utf8");
    expect(raw).toContain("Muay Thai");
    expect(raw).not.toContain("EVA_SESSION_TOKEN");
  });

  it("falls back when the file is corrupt and refuses shell text", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "eva-speech-prefs-"));
    directories.push(directory);
    const file = path.join(directory, "speech-preferences.json");
    await writeSpeechPreferences(file, { language: "en", vocabulary: ["tea"] });
    const { writeFile } = await import("node:fs/promises");
    await writeFile(file, "{not json", "utf8");
    expect(await readSpeechPreferences(file)).toEqual({ language: "auto", vocabulary: [] });
    await expect(writeSpeechPreferences(file, { language: "en", vocabulary: ["ok & calc"] })).rejects.toThrow(/invalid speech settings/i);
  });
});
