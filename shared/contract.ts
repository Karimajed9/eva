export const SERVICE_NAME = "jarvis-backend";
export const SHELL_NAME = "JARVIS";

export const IpcChannel = {
  getStatus: "jarvis:backend:get-status",
  statusEvent: "jarvis:backend:status",
  getAppInfo: "jarvis:app:get-info",
} as const;

export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel];

export const backendStates = ["starting", "up", "down", "error"] as const;
export type BackendState = (typeof backendStates)[number];

export interface HealthPayload {
  status: "UP" | "DOWN";
  service: typeof SERVICE_NAME;
  version: string;
  timestamp: string;
}

export interface BackendStatus {
  state: BackendState;
  detail: string;
  health: HealthPayload | null;
  checkedAt: string | null;
}

export interface AppInfo {
  name: typeof SHELL_NAME;
  version: string;
  platform: string;
}

const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const PLATFORM = /^[a-z0-9]{2,20}$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isSemver(value: unknown): value is string {
  return typeof value === "string" && SEMVER.test(value);
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 20 || value.length > 40) {
    return false;
  }
  return Number.isFinite(Date.parse(value));
}

export function parseHealthPayload(value: unknown): HealthPayload | null {
  if (!isRecord(value) || !hasExactKeys(value, ["status", "service", "version", "timestamp"])) {
    return null;
  }
  if (value.status !== "UP" && value.status !== "DOWN") {
    return null;
  }
  if (value.service !== SERVICE_NAME || !isSemver(value.version) || !isIsoTimestamp(value.timestamp)) {
    return null;
  }
  return {
    status: value.status,
    service: SERVICE_NAME,
    version: value.version,
    timestamp: value.timestamp,
  };
}

export function parseBackendStatus(value: unknown): BackendStatus | null {
  if (!isRecord(value) || !hasExactKeys(value, ["state", "detail", "health", "checkedAt"])) {
    return null;
  }
  if (typeof value.state !== "string" || !(backendStates as readonly string[]).includes(value.state)) {
    return null;
  }
  if (typeof value.detail !== "string" || value.detail.length === 0 || value.detail.length > 400) {
    return null;
  }

  const health = value.health === null ? null : parseHealthPayload(value.health);
  if (value.health !== null && health === null) {
    return null;
  }
  if (value.checkedAt !== null && !isIsoTimestamp(value.checkedAt)) {
    return null;
  }
  if (health !== null && value.checkedAt === null) {
    return null;
  }

  return {
    state: value.state as BackendState,
    detail: value.detail,
    health,
    checkedAt: typeof value.checkedAt === "string" ? value.checkedAt : null,
  };
}

export function parseAppInfo(value: unknown): AppInfo | null {
  if (!isRecord(value) || !hasExactKeys(value, ["name", "version", "platform"])) {
    return null;
  }
  if (value.name !== SHELL_NAME || !isSemver(value.version)) {
    return null;
  }
  if (typeof value.platform !== "string" || !PLATFORM.test(value.platform)) {
    return null;
  }
  return {
    name: SHELL_NAME,
    version: value.version,
    platform: value.platform,
  };
}

export function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

export function loopbackUrl(port: number, requestPath: string): string {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid backend port.");
  }
  if (!requestPath.startsWith("/") || requestPath.startsWith("//") || requestPath.includes("\\")) {
    throw new Error("Backend path must be a single absolute path.");
  }
  const url = new URL(`http://127.0.0.1:${port}${requestPath}`);
  if (url.protocol !== "http:" || !isLoopbackHostname(url.hostname) || url.username || url.password) {
    throw new Error("Refusing a non-loopback backend URL.");
  }
  return url.toString();
}
