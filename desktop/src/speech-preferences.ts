import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  emptySpeechPreferences,
  parseSpeechPreferences,
  type SpeechPreferences,
} from "../../shared/speech-preferences";

export async function readSpeechPreferences(filePath: string): Promise<SpeechPreferences> {
  try {
    const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
    return parseSpeechPreferences(parsed) ?? { language: "auto", vocabulary: [] };
  } catch {
    return { language: "auto", vocabulary: [] };
  }
}

export async function writeSpeechPreferences(filePath: string, preferences: SpeechPreferences): Promise<void> {
  const accepted = parseSpeechPreferences(preferences);
  if (!accepted) {
    throw new Error("Invalid speech settings.");
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  const body = `${JSON.stringify(accepted)}\n`;
  await writeFile(filePath, body, { encoding: "utf8", mode: 0o600 });
}

export { emptySpeechPreferences };
