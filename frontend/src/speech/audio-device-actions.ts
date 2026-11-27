import type { SinkResult } from "./playback";

export interface AudioDeviceActions {
  captureBusy(): boolean;
  speaking(): boolean;
  discardRecording(notice: string): void;
  stopPlayback(notice: string): void;
  applySink(sinkId: string): Promise<SinkResult>;
}

let captureBusyImpl: () => boolean = () => false;
let speakingImpl: () => boolean = () => false;
let discardImpl: (notice: string) => void = () => {};
let stopPlaybackImpl: (notice: string) => void = () => {};
let applySinkImpl: (sinkId: string) => Promise<SinkResult> = async () => "applied";

const live: AudioDeviceActions = {
  captureBusy: () => captureBusyImpl(),
  speaking: () => speakingImpl(),
  discardRecording: (notice) => discardImpl(notice),
  stopPlayback: (notice) => stopPlaybackImpl(notice),
  applySink: (sinkId) => applySinkImpl(sinkId),
};

export function audioDeviceActions(): AudioDeviceActions {
  return live;
}

export function bindCaptureActions(next: {
  captureBusy: () => boolean;
  discardRecording: (notice: string) => void;
}): () => void {
  const previousBusy = captureBusyImpl;
  const previousDiscard = discardImpl;
  captureBusyImpl = next.captureBusy;
  discardImpl = next.discardRecording;
  return () => {
    captureBusyImpl = previousBusy;
    discardImpl = previousDiscard;
  };
}

export function bindPlaybackActions(next: {
  speaking: () => boolean;
  stopPlayback: (notice: string) => void;
  applySink: (sinkId: string) => Promise<SinkResult>;
}): () => void {
  const previousSpeaking = speakingImpl;
  const previousStop = stopPlaybackImpl;
  const previousSink = applySinkImpl;
  speakingImpl = next.speaking;
  stopPlaybackImpl = next.stopPlayback;
  applySinkImpl = next.applySink;
  return () => {
    speakingImpl = previousSpeaking;
    stopPlaybackImpl = previousStop;
    applySinkImpl = previousSink;
  };
}
