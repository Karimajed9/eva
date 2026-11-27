import { microphoneConstraints } from "../../../shared/audio-devices";
import { samplesToSpeechWav } from "../../../shared/speech-wav";
import { audioDeviceActions } from "./audio-device-actions";
import { captureDevice } from "./audio-route";

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
  if (active) {
    throw new Error("A recording is already in progress.");
  }
  const media = navigator.mediaDevices;
  if (!media?.getUserMedia) {
    throw new DOMException("No microphone is available.", "NotFoundError");
  }
  const stream = await media.getUserMedia({
    audio: microphoneConstraints(captureDevice()),
    video: false,
  });
  let intentional = false;
  const track = stream.getAudioTracks()[0];
  track?.addEventListener("ended", () => {
    if (!intentional) {
      audioDeviceActions().discardRecording("The microphone was disconnected. This recording was discarded.");
    }
  });
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const chunks: Blob[] = [];
  let recorder: MediaRecorder;
  try {
    const mime = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "";
    recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  } catch (error) {
    intentional = true;
    releaseStream(stream);
    await context.close();
    throw error;
  }
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  });
  recorder.start();
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
      async capture() {
        const blob = await stopRecorder(recorder, chunks);
        if (blob.size > 8_000_000) {
          throw new Error("The recording is too large.");
        }
        const bytes = await blob.arrayBuffer();
        const decoded = await context.decodeAudioData(bytes.slice(0));
        return { samples: mixDown(decoded), sampleRate: decoded.sampleRate };
      },
      stopTracks() {
        intentional = true;
        releaseStream(stream);
        if (recorder.state !== "inactive") {
          try {
            recorder.stop();
          } catch {
            // The recorder has already stopped.
          }
        }
      },
      async close() {
        source.disconnect();
        if (context.state !== "closed") {
          await context.close();
        }
      },
    });
  } catch (error) {
    intentional = true;
    releaseStream(stream);
    await context.close();
    throw error;
  }
}

export function releaseStream(stream: { getTracks(): Array<{ stop(): void }> }): void {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function mixDown(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels <= 1) {
    return new Float32Array(buffer.getChannelData(0));
  }
  const mixed = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < buffer.length; index += 1) {
      mixed[index] = (mixed[index] ?? 0) + (data[index] ?? 0) / buffer.numberOfChannels;
    }
  }
  return mixed;
}

function stopRecorder(recorder: MediaRecorder, chunks: Blob[]): Promise<Blob> {
  if (recorder.state === "inactive") {
    return Promise.resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
  }
  return new Promise((resolve, reject) => {
    recorder.addEventListener("stop", () => {
      resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
    }, { once: true });
    recorder.addEventListener("error", () => {
      reject(new Error("The recording failed."));
    }, { once: true });
    recorder.stop();
  });
}
