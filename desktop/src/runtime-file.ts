import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { isRecord } from "../../shared/contract";

const execFileAsync = promisify(execFile);

export interface RuntimeRecord {
  pid: number;
  port: number;
  createdAt: string;
}

export function parseRuntimeRecord(value: unknown): RuntimeRecord | null {
  if (!isRecord(value)) {
    return null;
  }
  const { pid, port, createdAt } = value;
  if (!Number.isInteger(pid) || typeof pid !== "number" || pid <= 0) {
    return null;
  }
  if (!Number.isInteger(port) || typeof port !== "number" || port < 1 || port > 65535) {
    return null;
  }
  if (typeof createdAt !== "string" || Number.isNaN(Date.parse(createdAt))) {
    return null;
  }
  return { pid, port, createdAt };
}

export function shouldReapCommandLine(commandLine: string): boolean {
  const normalized = commandLine.toLowerCase();
  if (normalized.includes("surefire") || normalized.includes("maven") || normalized.includes("mvn")) {
    return false;
  }
  return normalized.includes("eva-backend-") && normalized.includes(".jar");
}

export async function readRuntimeRecord(filePath: string): Promise<RuntimeRecord | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
    return parseRuntimeRecord(parsed);
  } catch {
    return null;
  }
}

export async function writeRuntimeRecord(filePath: string, record: RuntimeRecord): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(record), { encoding: "utf8", mode: 0o600 });
}

export async function removeRuntimeRecord(filePath: string): Promise<void> {
  await rm(filePath, { force: true });
}

export async function readProcessCommandLine(pid: number): Promise<string> {
  if (!Number.isInteger(pid) || pid <= 0) {
    return "";
  }
  if (process.platform === "win32") {
    try {
      const { stdout } = await execFileAsync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`,
        ],
        { windowsHide: true, timeout: 8000 },
      );
      return stdout.trim();
    } catch {
      return "";
    }
  }

  try {
    const raw = await readFile(`/proc/${pid}/cmdline`);
    return raw.toString("utf8").replaceAll("\0", " ");
  } catch {
    return "";
  }
}
