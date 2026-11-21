import path from "node:path";
import { fileURLToPath } from "node:url";

export interface RendererTrustOptions {
  dev: boolean;
  rendererUrl: string;
  rendererFile: string;
}

export function isTrustedRendererUrl(url: string, options: RendererTrustOptions): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (options.dev) {
    try {
      const allowed = new URL(options.rendererUrl);
      return parsed.protocol === "http:" && parsed.origin === allowed.origin;
    } catch {
      return false;
    }
  }
  if (parsed.protocol !== "file:") {
    return false;
  }
  try {
    const actual = path.normalize(fileURLToPath(parsed));
    const expected = path.normalize(options.rendererFile);
    return process.platform === "win32"
      ? actual.toLowerCase() === expected.toLowerCase()
      : actual === expected;
  } catch {
    return false;
  }
}
