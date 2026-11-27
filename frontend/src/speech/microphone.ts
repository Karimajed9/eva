import { microphoneConstraints } from "../../../shared/audio-devices";
import { audibleSpeech, MAX_SPEECH_SECONDS, MIN_SPEECH_SECONDS, samplesToSpeechWav } from "../../../shared/speech-wav";
import { audioDeviceActions } from "./audio-device-actions";
import { audioRouteReady, captureDevice } from "./audio-route";

export interface CaptureResources {
  level(): number;
  capture(): Promise<{ samples: Float32Array; sampleRate: number }>;
  stopTracks(): void;
  close(): Promise<void>;
}

let active = false;

export class MicrophoneSession {
  private stopped = false;
  private released = false;

  constructor(
    private readonly resources: CaptureResources,
    private readonly release: () => void,
  ) {}

  level(): number {
    if (this.stopped) {
      return 0;
    }
    return this.resources.level();
  }

  cancel(): void {
    this.stopped = true;
    this.releaseOnce();
  }

  async finish(): Promise<Uint8Array> {
    if (this.stopped) {
      throw new Error("The recording has already stopped.");
    }
    this.stopped = true;
    try {
      const captured = await this.resources.capture();
      if (this.released) {
        throw new Error("The recording was cancelled.");
      }
      const duration = captured.sampleRate > 0 ? captured.samples.length / captured.sampleRate : 0;
      if (duration < MIN_SPEECH_SECONDS) {
        throw new Error("The recording was too short.");
      }
      if (!audibleSpeech(captured.samples, captured.sampleRate)) {
        throw new Error("No speech was heard.");
      }
      return samplesToSpeechWav(captured.samples, captured.sampleRate);
    } finally {
      this.releaseOnce();
    }
  }

  private releaseOnce(): void {
    if (this.released) {
      return;
    }
    this.released = true;
    this.resources.stopTracks();
    void this.resources.close();
    this.release();
  }
}

export function beginSession(resources: CaptureResources): MicrophoneSession {
  if (active) {
    throw new Error("A recording is already in progress.");
  }
  active = true;
  return new MicrophoneSession(resources, () => {
    active = false;
  });
}

export function recordingActive(): boolean {
  return active;
}

let opener: () => Promise<MicrophoneSession> = openMicrophone;

export function setMicrophoneOpener(next: () => Promise<MicrophoneSession>): void {
  opener = next;
}

export function openRecording(): Promise<MicrophoneSession> {
  return opener();
}

export async function openMicrophone(): Promise<MicrophoneSession> {
  if (!audioRouteReady()) {
    throw new Error("Audio devices are still starting.");
  }
  if (active) {
    throw new Error("A recording is already in progress.");
  }
  const media = navigator.mediaDevices;
  if (!media?.getUserMedia) {
    throw new DOMException("No microphone is available.", "NotFoundError");
  }
  // Open the graph during the click, before the microphone promise, so the first samples are kept.
  const context = new AudioContext({ latencyHint: "interactive" });
  const resumed = context.state === "suspended" ? context.resume() : Promise.resolve();
  let stream: MediaStream | null = null;
  try {
    stream = await media.getUserMedia({
      audio: microphoneConstraints(captureDevice()),
      video: false,
    });
    await resumed;
    if (context.state === "suspended") {
      await context.resume();
    }
    if (context.state !== "running") {
      throw new Error("The microphone could not be opened.");
    }
  } catch (error) {
    releaseStream(stream ?? { getTracks: () => [] });
    await context.close();
    throw error;
  }
  let intentional = false;
  const track = stream.getAudioTracks()[0];
  track?.addEventListener("ended", () => {
    if (!intentional) {
      audioDeviceActions().discardRecording("The microphone was disconnected. This recording was discarded.");
    }
  });
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const captured = collectSamples(context, source);
  const levelData = new Float32Array(analyser.fftSize);
  try {
    return beginSession({
      level() {
        analyser.getFloatTimeDomainData(levelData);
        let sum = 0;
        for (const value of levelData) {
          sum += value * value;
        }
        return Math.max(0, Math.min(1, Math.sqrt(sum / levelData.length) * 4));
      },
      capture() {
        return Promise.resolve(captured.take(context.sampleRate));
      },
      stopTracks() {
        intentional = true;
        releaseStream(stream);
      },
      async close() {
        captured.stop();
        source.disconnect();
        if (context.state !== "closed") {
          await context.close();
        }
      },
    });
  } catch (error) {
    intentional = true;
    captured.stop();
    releaseStream(stream);
    await context.close();
    throw error;
  }
}

/**
 * Copies mic samples as they arrive. MediaRecorder's encoder drops the beginning of a take,
 * so the words spoken as recording starts never reached Whisper.
 */
function collectSamples(context: AudioContext, source: AudioNode): {
  take(sampleRate: number): { samples: Float32Array; sampleRate: number };
  stop(): void;
} {
  const processor = context.createScriptProcessor(2048, 1, 1);
  const chunks: Float32Array[] = [];
  let stored = 0;
  const maxSamples = Math.ceil(context.sampleRate * MAX_SPEECH_SECONDS);
  let capturing = true;
  processor.onaudioprocess = (event) => {
    if (!capturing || stored >= maxSamples) {
      return;
    }
    const channels = event.inputBuffer.numberOfChannels;
    const length = event.inputBuffer.length;
    const room = maxSamples - stored;
    const count = Math.min(length, room);
    const mixed = new Float32Array(count);
    for (let channel = 0; channel < channels; channel += 1) {
      const data = event.inputBuffer.getChannelData(channel);
      for (let index = 0; index < count; index += 1) {
        mixed[index] = (mixed[index] ?? 0) + (data[index] ?? 0) / channels;
      }
    }
    chunks.push(mixed);
    stored += count;
    if (stored >= maxSamples) {
      capturing = false;
    }
  };
  const mute = context.createGain();
  mute.gain.value = 0;
  source.connect(processor);
  processor.connect(mute);
  mute.connect(context.destination);
  return {
    take(sampleRate) {
      capturing = false;
      const samples = new Float32Array(stored);
      let offset = 0;
      for (const chunk of chunks) {
        samples.set(chunk, offset);
        offset += chunk.length;
      }
      chunks.length = 0;
      stored = 0;
      return { samples, sampleRate };
    },
    stop() {
      capturing = false;
      processor.onaudioprocess = null;
      processor.disconnect();
      mute.disconnect();
    },
  };
}

export function releaseStream(stream: { getTracks(): Array<{ stop(): void }> }): void {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

