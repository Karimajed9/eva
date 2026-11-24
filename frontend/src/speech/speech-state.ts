export function describeMicrophoneFailure(error: unknown): string {
  const name = typeof DOMException !== "undefined" && error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone permission was denied. EVA did not record anything.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") {
    return "No microphone is available.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "The microphone is unavailable.";
  }
  if (error instanceof Error && /too short/i.test(error.message)) {
    return "The recording was too short.";
  }
  if (error instanceof Error && /(too large|60 seconds)/i.test(error.message)) {
    return error.message;
  }
  if (error instanceof Error && /already in progress/i.test(error.message)) {
    return "A recording is already in progress.";
  }
  return "The microphone could not be opened.";
}

export function formatDuration(elapsedMs: number): string {
  const total = Math.max(0, Math.min(60, Math.floor(elapsedMs / 1000)));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function readyNotice(elapsedMs: number, recordingMs: number): string {
  const transcribed = elapsedMs < 1000 ? `${elapsedMs} ms` : `${(elapsedMs / 1000).toFixed(1)} s`;
  return `Ready to send. Recorded ${formatDuration(recordingMs)} · transcribed in ${transcribed}.`;
}

export function timingTitle(loadMs: number | null, inferenceMs: number | null): string {
  if (loadMs === null || inferenceMs === null) {
    return "";
  }
  return `Model load ${(loadMs / 1000).toFixed(1)} s · recognition ${(inferenceMs / 1000).toFixed(1)} s`;
}

export const MAX_RECORDING_MS = 60_000;
