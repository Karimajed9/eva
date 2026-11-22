import { failureFromCore, loopbackUrl, type ConversationFailure } from "../../shared/contract";
import { redactSecrets } from "./redact";

const GET_TIMEOUT_MS = 5_000;
const POST_TIMEOUT_MS = 150_000;
const MAX_BODY = 1_000_000;

export interface CoreCall {
  port: number | null;
  token: string;
  path: string;
  method: "GET" | "POST";
  body?: unknown;
  fetchImpl?: typeof fetch;
}

export async function callCore(input: CoreCall): Promise<{ status: number; json: unknown } | ConversationFailure> {
  if (input.port === null || input.token.length === 0) {
    return { ok: false, code: "unavailable", detail: "The local core is not running." };
  }
  let url: string;
  try {
    url = loopbackUrl(input.port, input.path);
  } catch {
    return { ok: false, code: "invalid", detail: "The conversation path was rejected." };
  }
  try {
    const response = await (input.fetchImpl ?? fetch)(url, {
      method: input.method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${input.token}`,
        ...(input.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: AbortSignal.timeout(input.method === "GET" ? GET_TIMEOUT_MS : POST_TIMEOUT_MS),
    });
    const text = await response.text();
    if (text.length > MAX_BODY) {
      return { ok: false, code: "provider-error", detail: "The conversation response was larger than expected." };
    }
    if (!response.ok) {
      return failureFromCore(response.status, redactSecrets(text, [input.token]));
    }
    return { status: response.status, json: JSON.parse(text) as unknown };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (redactSecrets(message, [input.token]) !== message) {
      return { ok: false, code: "unavailable", detail: "The local core could not be reached." };
    }
    return { ok: false, code: "unavailable", detail: "The local core could not be reached." };
  }
}
