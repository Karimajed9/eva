import { SYSTEM_AUDIO_DEVICE } from "../../../shared/audio-device-preferences";

let capture = SYSTEM_AUDIO_DEVICE;
let sink = "";
let allowed = false;
let ready = false;
let waiters: Array<(settled: boolean) => void> = [];

export function setCaptureDevice(deviceId: string): void {
  capture = deviceId;
}

export function captureDevice(): string {
  return capture;
}

export function setPlaybackRoute(sinkId: string, playbackAllowed: boolean): void {
  sink = sinkId;
  allowed = playbackAllowed;
}

export function playbackSink(): string {
  return sink;
}

export function playbackAllowed(): boolean {
  return allowed;
}

export function audioRouteReady(): boolean {
  return ready;
}

/** Resolves true once preferences and the first device list have been applied. Resolves false when that discovery fails. */
export function whenAudioRouteReady(): Promise<boolean> {
  if (ready) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    waiters.push(resolve);
  });
}

export function markAudioRouteSettled(): void {
  ready = true;
  const pending = waiters;
  waiters = [];
  for (const resolve of pending) {
    resolve(true);
  }
}

export function failAudioRoute(): void {
  const pending = waiters;
  waiters = [];
  for (const resolve of pending) {
    resolve(false);
  }
}

export function resetAudioRoute(): void {
  capture = SYSTEM_AUDIO_DEVICE;
  sink = "";
  allowed = false;
  ready = false;
  waiters = [];
}
