import { SYSTEM_AUDIO_DEVICE } from "../../../shared/audio-device-preferences";

let capture = SYSTEM_AUDIO_DEVICE;
let sink = "";
let allowed = true;

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
