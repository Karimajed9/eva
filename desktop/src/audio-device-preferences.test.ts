import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SYSTEM_AUDIO_DEVICE } from "../../shared/audio-device-preferences";
import { readAudioDevicePreferences, writeAudioDevicePreferences } from "./audio-device-preferences";

describe("audio device preference file", () => {
  it("recovers from a missing or outdated file and writes a valid pair", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "eva-audio-"));
    const file = path.join(directory, "audio-device-preferences.json");
    expect(await readAudioDevicePreferences(file)).toEqual({
      inputDeviceId: SYSTEM_AUDIO_DEVICE,
      outputDeviceId: SYSTEM_AUDIO_DEVICE,
    });
    await writeFile(file, "{\"voice\":\"af_heart\"}\n", "utf8");
    expect(await readAudioDevicePreferences(file)).toEqual({
      inputDeviceId: SYSTEM_AUDIO_DEVICE,
      outputDeviceId: SYSTEM_AUDIO_DEVICE,
    });
    await writeAudioDevicePreferences(file, { inputDeviceId: "mic-a", outputDeviceId: SYSTEM_AUDIO_DEVICE });
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
      inputDeviceId: "mic-a",
      outputDeviceId: SYSTEM_AUDIO_DEVICE,
    });
    await expect(writeAudioDevicePreferences(file, { inputDeviceId: "bad id", outputDeviceId: SYSTEM_AUDIO_DEVICE })).rejects.toThrow(/invalid/i);
  });
});
