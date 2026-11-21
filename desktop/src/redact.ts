const BEARER = /Bearer\s+[A-Za-z0-9._~+/-]{8,}/gi;

export function redactSecrets(text: string, secrets: readonly string[]): string {
  let redacted = text;
  for (const secret of secrets) {
    if (secret.length < 8) {
      continue;
    }
    redacted = redacted.split(secret).join("[redacted]");
  }
  return redacted.replace(BEARER, "Bearer [redacted]");
}
