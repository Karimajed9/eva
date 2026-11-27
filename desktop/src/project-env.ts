import { readFileSync } from "node:fs";
import path from "node:path";

/** Configuration the desktop may copy from .env into the Java process. */
export const backendConfigKeys = [
  "EVA_WHISPER_EXECUTABLE",
  "EVA_WHISPER_MODEL",
  "EVA_WHISPER_GPU",
  "EVA_KOKORO_PYTHON",
  "EVA_KOKORO_WORKER",
  "EVA_KOKORO_MODEL",
  "EVA_KOKORO_VOICES",
  "EVA_OLLAMA_BASE_URL",
  "EVA_OPENAI_API_KEY",
] as const;

const pathKeys = new Set<string>([
  "EVA_WHISPER_EXECUTABLE",
  "EVA_WHISPER_MODEL",
  "EVA_KOKORO_PYTHON",
  "EVA_KOKORO_WORKER",
  "EVA_KOKORO_MODEL",
  "EVA_KOKORO_VOICES",
]);

const assignment = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

export function repositoryRoot(): string {
  return path.resolve(__dirname, "..", "..");
}

export function parseEnvFile(source: string): Record<string, string> {
  const values: Record<string, string> = {};
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  for (const line of text.split("\n")) {
    const trimmed = line.replace(/\r$/, "").trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }
    const match = assignment.exec(trimmed);
    if (!match) {
      continue;
    }
    const key = match[1];
    const value = unquote(match[2] ?? "");
    if (!key || value === null) {
      continue;
    }
    values[key] = value;
  }
  return values;
}

export function projectEnvironment(options: {
  root: string;
  environ: Readonly<NodeJS.ProcessEnv>;
  fileText: string | null;
}): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = { ...options.environ };
  if (options.fileText === null) {
    return next;
  }
  const parsed = parseEnvFile(options.fileText);
  for (const key of backendConfigKeys) {
    if (options.environ[key] !== undefined) {
      continue;
    }
    const value = parsed[key];
    if (value === undefined || value.trim().length === 0) {
      continue;
    }
    next[key] = pathKeys.has(key) ? path.resolve(options.root, value) : value;
  }
  return next;
}

export function applyProjectEnv(environ: NodeJS.ProcessEnv, root = repositoryRoot()): void {
  const merged = projectEnvironment({
    root,
    environ,
    fileText: readEnvFile(root),
  });
  for (const key of backendConfigKeys) {
    const value = merged[key];
    if (value !== undefined && environ[key] !== value) {
      environ[key] = value;
    }
  }
}

function readEnvFile(root: string): string | null {
  try {
    return readFileSync(path.join(root, ".env"), "utf8");
  } catch {
    return null;
  }
}

function unquote(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return "";
  }
  const quote = trimmed[0];
  if (quote === "\"" || quote === "'") {
    if (trimmed.length < 2 || !trimmed.endsWith(quote)) {
      return null;
    }
    return trimmed.slice(1, -1);
  }
  const comment = trimmed.search(/\s+#/);
  return (comment === -1 ? trimmed : trimmed.slice(0, comment)).trim();
}
