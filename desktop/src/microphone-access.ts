import { isTrustedRendererUrl, type RendererTrustOptions } from "./trusted-renderer";

export interface MicrophoneRequestDetails {
  requestingUrl?: string;
  isMainFrame?: boolean;
  mediaTypes?: readonly string[];
}

export interface MicrophoneCheckDetails {
  requestingUrl?: string;
  isMainFrame?: boolean;
  mediaType?: string;
}

export function microphoneRequestAllowed(
  permission: string,
  details: MicrophoneRequestDetails,
  options: RendererTrustOptions,
): boolean {
  if (permission !== "media" || details.isMainFrame === false) {
    return false;
  }
  const types = details.mediaTypes ?? [];
  if (types.length !== 1 || types[0] !== "audio") {
    return false;
  }
  return Boolean(details.requestingUrl && isTrustedRendererUrl(details.requestingUrl, options));
}

export function microphoneCheckAllowed(
  permission: string,
  details: MicrophoneCheckDetails,
  options: RendererTrustOptions,
): boolean {
  if (permission !== "media" || details.isMainFrame === false) {
    return false;
  }
  if (details.mediaType !== "audio") {
    return false;
  }
  return Boolean(details.requestingUrl && isTrustedRendererUrl(details.requestingUrl, options));
}
