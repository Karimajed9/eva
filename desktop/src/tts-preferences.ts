import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  defaultTtsPreferences,
  parseTtsPreferences,
  type TtsPreferences,
} from "../../shared/tts-preferences";

export async function readTtsPreferences(filePath: string): Promise<TtsPreferences> {
  try {
    const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
    return parseTtsPreferences(parsed) ?? { ...defaultTtsPreferences };
  } catch {
    return { ...defaultTtsPreferences };
  }
}

export async function writeTtsPreferences(filePath: string, preferences: TtsPreferences): Promise<void> {
  const accepted = parseTtsPreferences(preferences);
  if (!accepted) {
    throw new Error("Invalid speech settings.");
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(accepted)}\n`, { encoding: "utf8", mode: 0o600 });
}
