export const SERVICE_NAME = "eva-backend";
export const SHELL_NAME = "EVA";

export const IpcChannel = {
  getStatus: "eva:backend:get-status",
  statusEvent: "eva:backend:status",
  getAppInfo: "eva:app:get-info",
  getConversation: "eva:conversation:get",
  sendConversation: "eva:conversation:send",
  resetConversation: "eva:conversation:reset",
  cancelConversation: "eva:conversation:cancel",
  conversationEvent: "eva:conversation:event",
  getSpeech: "eva:speech:get",
  transcribeSpeech: "eva:speech:transcribe",
  cancelSpeech: "eva:speech:cancel",
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

export const conversationProviders = ["ollama", "openai"] as const;
export type ConversationProvider = (typeof conversationProviders)[number];

export const conversationRoles = ["user", "assistant"] as const;
export type ConversationRole = (typeof conversationRoles)[number];

export const conversationStatuses = ["complete", "stopped"] as const;
export type ConversationStatus = (typeof conversationStatuses)[number];

export const conversationCodes = [
  "unavailable",
  "model-missing",
  "credentials",
  "cloud-denied",
  "rate-limited",
  "invalid",
  "cancelled",
  "provider-error",
  "busy",
] as const;
export type ConversationCode = (typeof conversationCodes)[number];

export interface ConversationModel {
  id: string;
  label: string;
}

export interface ConversationProviderStatus {
  id: ConversationProvider;
  label: string;
  local: boolean;
  reachable: boolean;
  configured: boolean;
  detail: string;
  models: ConversationModel[];
}

export interface ConversationMessage {
  role: ConversationRole;
  text: string;
  status: ConversationStatus;
}

export interface ConversationUsage {
  promptTokens: number;
  completionTokens: number;
  estimatedUsd: number | null;
}

export interface ConversationCatalog {
  messages: ConversationMessage[];
  providers: ConversationProviderStatus[];
}

export interface ConversationRequest {
  provider: ConversationProvider;
  model: string;
  cloudEnabled: boolean;
  text: string;
}

export interface ConversationSuccess {
  ok: true;
  provider: ConversationProvider;
  model: string;
  text: string;
  usage: ConversationUsage | null;
}

export interface ConversationFailure {
  ok: false;
  code: ConversationCode;
  detail: string;
}

export type ConversationResult = ConversationSuccess | ConversationFailure;
export type CatalogResult = ConversationCatalog | ConversationFailure;

export interface ConversationDelta {
  type: "delta";
  seq: number;
  text: string;
}

export type ConversationStreamLine =
  | { kind: "delta"; seq: number; text: string }
  | { kind: "done"; seq: number; result: ConversationSuccess }
  | { kind: "error"; seq: number; result: ConversationFailure };

const MODEL_ID = /^[A-Za-z0-9_.:-]{1,80}$/;

function isProvider(value: unknown): value is ConversationProvider {
  return typeof value === "string" && (conversationProviders as readonly string[]).includes(value);
}

function isShortText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function parseModel(value: unknown): ConversationModel | null {
  if (!isRecord(value) || !hasExactKeys(value, ["id", "label"])) {
    return null;
  }
  if (!isShortText(value.id, 80) || !MODEL_ID.test(value.id) || !isShortText(value.label, 80)) {
    return null;
  }
  return { id: value.id, label: value.label };
}

function parseMessage(value: unknown): ConversationMessage | null {
  if (!isRecord(value) || !hasExactKeys(value, ["role", "text", "status"])) {
    return null;
  }
  if (value.role !== "user" && value.role !== "assistant") {
    return null;
  }
  if (value.status !== "complete" && value.status !== "stopped") {
    return null;
  }
  if (typeof value.text !== "string" || value.text.length === 0 || value.text.length > 8000) {
    return null;
  }
  if (value.role === "assistant" && value.status === "stopped" && value.text.trim().length === 0) {
    return null;
  }
  return { role: value.role, text: value.text, status: value.status };
}

function parseUsage(value: unknown): ConversationUsage | null {
  if (value === null) {
    return null;
  }
  if (!isRecord(value) || !hasExactKeys(value, ["promptTokens", "completionTokens", "estimatedUsd"])) {
    return null;
  }
  if (!Number.isInteger(value.promptTokens) || !Number.isInteger(value.completionTokens)) {
    return null;
  }
  if ((value.promptTokens as number) < 0 || (value.completionTokens as number) < 0) {
    return null;
  }
  if (value.estimatedUsd !== null && (typeof value.estimatedUsd !== "number" || !Number.isFinite(value.estimatedUsd))) {
    return null;
  }
  return {
    promptTokens: value.promptTokens as number,
    completionTokens: value.completionTokens as number,
    estimatedUsd: value.estimatedUsd as number | null,
  };
}

export function parseConversationRequest(value: unknown): ConversationRequest | null {
  if (!isRecord(value) || !hasExactKeys(value, ["provider", "model", "cloudEnabled", "text"])) {
    return null;
  }
  if (!isProvider(value.provider) || typeof value.model !== "string" || !MODEL_ID.test(value.model)) {
    return null;
  }
  if (typeof value.cloudEnabled !== "boolean" || typeof value.text !== "string") {
    return null;
  }
  const text = value.text.trim();
  if (text.length === 0 || text.length > 4000) {
    return null;
  }
  return {
    provider: value.provider,
    model: value.model,
    cloudEnabled: value.cloudEnabled,
    text,
  };
}

export function parseConversationCatalog(value: unknown): ConversationCatalog | null {
  if (!isRecord(value) || !hasExactKeys(value, ["messages", "providers"])) {
    return null;
  }
  if (!Array.isArray(value.messages) || value.messages.length > 40 || !Array.isArray(value.providers) || value.providers.length !== 2) {
    return null;
  }
  const messages: ConversationMessage[] = [];
  for (const message of value.messages) {
    const parsed = parseMessage(message);
    if (!parsed) {
      return null;
    }
    messages.push(parsed);
  }
  const providers: ConversationProviderStatus[] = [];
  for (const provider of value.providers) {
    if (!isRecord(provider) || !hasExactKeys(provider, ["id", "label", "local", "reachable", "configured", "detail", "models"])) {
      return null;
    }
    if (!isProvider(provider.id) || !isShortText(provider.label, 40) || typeof provider.local !== "boolean") {
      return null;
    }
    if (typeof provider.reachable !== "boolean" || typeof provider.configured !== "boolean" || !isShortText(provider.detail, 400)) {
      return null;
    }
    if (!Array.isArray(provider.models) || provider.models.length > 100) {
      return null;
    }
    const models: ConversationModel[] = [];
    for (const model of provider.models) {
      const parsed = parseModel(model);
      if (!parsed) {
        return null;
      }
      models.push(parsed);
    }
    providers.push({
      id: provider.id,
      label: provider.label,
      local: provider.local,
      reachable: provider.reachable,
      configured: provider.configured,
      detail: provider.detail,
      models,
    });
  }
  if (providers[0]?.id !== "ollama" || providers[1]?.id !== "openai") {
    return null;
  }
  return { messages, providers };
}

export function parseConversationResult(value: unknown): ConversationResult | null {
  if (!isRecord(value)) {
    return null;
  }
  if (value.ok === false) {
    if (!hasExactKeys(value, ["ok", "code", "detail"])) {
      return null;
    }
    if (typeof value.code !== "string" || !(conversationCodes as readonly string[]).includes(value.code)) {
      return null;
    }
    if (!isShortText(value.detail, 400)) {
      return null;
    }
    return { ok: false, code: value.code as ConversationCode, detail: value.detail };
  }
  if (!hasExactKeys(value, ["ok", "provider", "model", "text", "usage"])) {
    return null;
  }
  if (value.ok !== true || !isProvider(value.provider) || typeof value.model !== "string" || !MODEL_ID.test(value.model)) {
    return null;
  }
  if (typeof value.text !== "string" || value.text.trim().length === 0 || value.text.length > 8000) {
    return null;
  }
  const usage = parseUsage(value.usage);
  if (value.usage !== null && usage === null) {
    return null;
  }
  return {
    ok: true,
    provider: value.provider,
    model: value.model,
    text: value.text,
    usage,
  };
}

export function parseCatalogResult(value: unknown): CatalogResult | null {
  if (isRecord(value) && value.ok === false) {
    const failure = parseConversationResult(value);
    return failure !== null && !failure.ok ? failure : null;
  }
  return parseConversationCatalog(value);
}

function parseSeq(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 100_000) {
    return null;
  }
  return value;
}

export function parseConversationDelta(value: unknown): ConversationDelta | null {
  if (!isRecord(value) || !hasExactKeys(value, ["type", "seq", "text"])) {
    return null;
  }
  const seq = parseSeq(value.seq);
  if (value.type !== "delta" || seq === null || typeof value.text !== "string" || value.text.length === 0 || value.text.length > 8000) {
    return null;
  }
  return { type: "delta", seq, text: value.text };
}

export function parseConversationStreamLine(value: unknown): ConversationStreamLine | null {
  const delta = parseConversationDelta(value);
  if (delta) {
    return { kind: "delta", seq: delta.seq, text: delta.text };
  }
  if (!isRecord(value) || typeof value.type !== "string") {
    return null;
  }
  const seq = parseSeq(value.seq);
  if (seq === null) {
    return null;
  }
  if (value.type === "done") {
    if (!hasExactKeys(value, ["type", "seq", "provider", "model", "text", "usage"])) {
      return null;
    }
    const result = parseConversationResult({
      ok: true,
      provider: value.provider,
      model: value.model,
      text: value.text,
      usage: value.usage,
    });
    if (!result || !result.ok) {
      return null;
    }
    return { kind: "done", seq, result };
  }
  if (value.type === "error") {
    if (!hasExactKeys(value, ["type", "seq", "code", "detail"])) {
      return null;
    }
    const result = parseConversationResult({
      ok: false,
      code: value.code,
      detail: value.detail,
    });
    if (!result || result.ok) {
      return null;
    }
    return { kind: "error", seq, result };
  }
  return null;
}

export const speechCodes = [
  "unavailable",
  "missing-engine",
  "missing-model",
  "invalid-audio",
  "cancelled",
  "busy",
  "engine-error",
] as const;
export type SpeechCode = (typeof speechCodes)[number];

export interface SpeechStatus {
  engine: "whisper.cpp";
  available: boolean;
  detail: string;
}

export interface SpeechSuccess {
  ok: true;
  text: string;
}

export interface SpeechFailure {
  ok: false;
  code: SpeechCode;
  detail: string;
}

export type SpeechResult = SpeechSuccess | SpeechFailure;
export type SpeechStatusResult = SpeechStatus | SpeechFailure;

export function parseSpeechStatus(value: unknown): SpeechStatus | null {
  if (!isRecord(value) || !hasExactKeys(value, ["engine", "available", "detail"])) {
    return null;
  }
  if (value.engine !== "whisper.cpp" || typeof value.available !== "boolean" || !isShortText(value.detail, 400)) {
    return null;
  }
  return { engine: "whisper.cpp", available: value.available, detail: value.detail };
}

export function parseSpeechResult(value: unknown): SpeechResult | null {
  if (!isRecord(value)) {
    return null;
  }
  if (value.ok === false) {
    if (!hasExactKeys(value, ["ok", "code", "detail"])) {
      return null;
    }
    if (typeof value.code !== "string" || !(speechCodes as readonly string[]).includes(value.code)) {
      return null;
    }
    if (!isShortText(value.detail, 400)) {
      return null;
    }
    return { ok: false, code: value.code as SpeechCode, detail: value.detail };
  }
  if (!hasExactKeys(value, ["ok", "text"]) || value.ok !== true || typeof value.text !== "string") {
    return null;
  }
  const text = value.text.trim();
  if (text.length === 0 || text.length > 4000) {
    return null;
  }
  return { ok: true, text };
}

export function parseSpeechTranscript(value: unknown): SpeechSuccess | null {
  if (!isRecord(value) || !hasExactKeys(value, ["text"]) || typeof value.text !== "string") {
    return null;
  }
  return parseSpeechResult({ ok: true, text: value.text }) as SpeechSuccess | null;
}

export function parseSpeechStatusResult(value: unknown): SpeechStatusResult | null {
  if (isRecord(value) && value.ok === false) {
    const failure = parseSpeechResult(value);
    return failure !== null && !failure.ok ? failure : null;
  }
  return parseSpeechStatus(value);
}

export function speechFailureFromCore(status: number, body: string): SpeechFailure {
  let code: SpeechCode = "engine-error";
  let detail = "Local transcription failed.";
  try {
    const parsed = JSON.parse(body) as unknown;
    if (isRecord(parsed) && typeof parsed.error === "string" && (speechCodes as readonly string[]).includes(parsed.error)) {
      code = parsed.error as SpeechCode;
    }
    if (isRecord(parsed) && typeof parsed.detail === "string" && parsed.detail.length > 0 && parsed.detail.length <= 400) {
      detail = parsed.detail;
    }
  } catch {
    if (status === 0) {
      code = "unavailable";
      detail = "The local core could not be reached.";
    }
  }
  return { ok: false, code, detail };
}

export function failureFromCore(status: number, body: string): ConversationFailure {
  let code: ConversationCode = "provider-error";
  let detail = "The local core could not complete the conversation.";
  try {
    const parsed = JSON.parse(body) as unknown;
    if (isRecord(parsed) && typeof parsed.error === "string" && (conversationCodes as readonly string[]).includes(parsed.error)) {
      code = parsed.error as ConversationCode;
    }
    if (isRecord(parsed) && typeof parsed.detail === "string" && parsed.detail.length > 0 && parsed.detail.length <= 400) {
      detail = parsed.detail;
    }
  } catch {
    if (status === 0) {
      code = "unavailable";
    }
  }
  return { ok: false, code, detail };
}
