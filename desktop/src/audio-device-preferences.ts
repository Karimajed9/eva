import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  defaultAudioDevicePreferences,
  parseAudioDevicePreferences,
  type AudioDevicePreferences,
} from "../../shared/audio-device-preferences";

export async function readAudioDevicePreferences(filePath: string): Promise<AudioDevicePreferences> {
  try {
    const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
    return parseAudioDevicePreferences(parsed) ?? { ...defaultAudioDevicePreferences };
  } catch {
    return { ...defaultAudioDevicePreferences };
  }
}

export async function writeAudioDevicePreferences(filePath: string, preferences: AudioDevicePreferences): Promise<void> {
  const accepted = parseAudioDevicePreferences(preferences);
  if (!accepted) {
    throw new Error("Invalid audio device settings.");
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(accepted)}\n`, { encoding: "utf8", mode: 0o600 });
}
