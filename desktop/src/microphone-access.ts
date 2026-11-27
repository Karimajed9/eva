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

function trustedMainFrame(url: string | undefined, isMainFrame: boolean | undefined, options: RendererTrustOptions): boolean {
  if (isMainFrame === false) {
    return false;
  }
  return Boolean(url && isTrustedRendererUrl(url, options));
}

export function microphoneRequestAllowed(
  permission: string,
  details: MicrophoneRequestDetails,
  options: RendererTrustOptions,
): boolean {
  if (!trustedMainFrame(details.requestingUrl, details.isMainFrame, options)) {
    return false;
  }
  if (permission === "speaker-selection") {
    return true;
  }
  if (permission !== "media") {
    return false;
  }
  const types = details.mediaTypes ?? [];
  return types.length === 1 && types[0] === "audio";
}

export function microphoneCheckAllowed(
  permission: string,
  details: MicrophoneCheckDetails,
  options: RendererTrustOptions,
): boolean {
  if (!trustedMainFrame(details.requestingUrl, details.isMainFrame, options)) {
    return false;
  }
  if (permission === "speaker-selection") {
    return true;
  }
  if (permission !== "media") {
    return false;
  }
  return details.mediaType === "audio";
}
