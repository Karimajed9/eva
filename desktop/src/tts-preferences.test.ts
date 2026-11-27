import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readTtsPreferences, writeTtsPreferences } from "./tts-preferences";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("speech playback preferences", () => {
  it("defaults to Heart at normal speed with automatic playback off", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "eva-tts-prefs-"));
    directories.push(directory);
    const file = path.join(directory, "tts-preferences.json");
    expect(await readTtsPreferences(file)).toEqual({
      voice: "af_heart",
      speed: 1,
      volume: 1,
      autoPlay: false,
    });
    await writeTtsPreferences(file, { voice: "bf_emma", speed: 0.9, volume: 0.4, autoPlay: true });
    expect(await readTtsPreferences(file)).toEqual({ voice: "bf_emma", speed: 0.9, volume: 0.4, autoPlay: true });
  });

  it("falls back when the file is corrupt and refuses an unknown voice", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "eva-tts-prefs-"));
    directories.push(directory);
    const file = path.join(directory, "tts-preferences.json");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(file, "{not json", "utf8");
    expect(await readTtsPreferences(file)).toMatchObject({ voice: "af_heart", autoPlay: false });
    await expect(writeTtsPreferences(file, {
      voice: "af_heart",
      speed: 4,
      volume: 1,
      autoPlay: false,
    })).rejects.toThrow(/invalid speech settings/i);
  });
});
