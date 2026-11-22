import {
  failureFromCore,
  loopbackUrl,
  parseConversationStreamLine,
  type ConversationDelta,
  type ConversationFailure,
  type ConversationResult,
} from "../../shared/contract";
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
  signal?: AbortSignal;
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
      signal: input.signal ?? AbortSignal.timeout(input.method === "GET" ? GET_TIMEOUT_MS : POST_TIMEOUT_MS),
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

const INCOMPLETE = {
  ok: false as const,
  code: "provider-error" as const,
  detail: "The reply stream closed before it finished.",
};

export async function streamCore(
  input: CoreCall & { onDelta: (delta: ConversationDelta) => void },
): Promise<ConversationResult> {
  if (input.port === null || input.token.length === 0) {
    return { ok: false, code: "unavailable", detail: "The local core is not running." };
  }
  let url: string;
  try {
    url = loopbackUrl(input.port, input.path);
  } catch {
    return { ok: false, code: "invalid", detail: "The conversation path was rejected." };
  }
  const signal = input.signal
    ? AbortSignal.any([input.signal, AbortSignal.timeout(POST_TIMEOUT_MS)])
    : AbortSignal.timeout(POST_TIMEOUT_MS);
  try {
    const response = await (input.fetchImpl ?? fetch)(url, {
      method: "POST",
      headers: {
        Accept: "application/x-ndjson",
        Authorization: `Bearer ${input.token}`,
        "Content-Type": "application/json",
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal,
    });
    if (!response.ok) {
      const text = await response.text();
      if (text.length > MAX_BODY) {
        return { ok: false, code: "provider-error", detail: "The conversation response was larger than expected." };
      }
      return failureFromCore(response.status, redactSecrets(text, [input.token]));
    }
    if (!response.body) {
      return INCOMPLETE;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let expected = 1;
    let total = 0;
    let result: ConversationResult | null = null;
    while (result === null) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      total += chunk.value.byteLength;
      if (total > MAX_BODY) {
        await reader.cancel();
        return { ok: false, code: "provider-error", detail: "The conversation response was larger than expected." };
      }
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const raw of lines) {
        const line = raw.trim();
        if (line.length === 0) {
          continue;
        }
        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(redactSecrets(line, [input.token])) as unknown;
        } catch {
          await reader.cancel();
          return INCOMPLETE;
        }
        const parsed = parseConversationStreamLine(parsedJson);
        if (!parsed) {
          await reader.cancel();
          return INCOMPLETE;
        }
        if (parsed.seq !== expected) {
          if (parsed.seq < expected) {
            continue;
          }
          await reader.cancel();
          return INCOMPLETE;
        }
        expected += 1;
        if (parsed.kind === "delta") {
          input.onDelta({ type: "delta", seq: parsed.seq, text: parsed.text });
        } else if (parsed.kind === "error") {
          await reader.cancel();
          return {
            ...parsed.result,
            detail: redactSecrets(parsed.result.detail, [input.token]),
          };
        } else {
          result = parsed.result;
        }
      }
    }
    return result ?? INCOMPLETE;
  } catch {
    if (input.signal?.aborted) {
      return { ok: false, code: "cancelled", detail: "The reply was cancelled." };
    }
    return { ok: false, code: "unavailable", detail: "The local core could not be reached." };
  }
}
