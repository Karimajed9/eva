const GAIN_RAMP_SECONDS = 0.03;

export interface SpeechPlayer {
  play(wav: Uint8Array, volume: number, onLevel: (level: number) => void, onStart: () => void): Promise<void>;
  setVolume(volume: number): void;
  stop(): void;
}

const VOLUME_RANGE_DB = 30;

/** Slider position to amplitude. Equal slider steps are equal loudness steps across 30 dB. 0 is silent and 1 is unity gain. */
export function playbackGain(volume: number): number {
  if (!Number.isFinite(volume) || volume <= 0) {
    return 0;
  }
  const position = Math.min(1, volume);
  if (position >= 1) {
    return 1;
  }
  return 10 ** ((-VOLUME_RANGE_DB * (1 - position)) / 20);
}

function rampGain(param: AudioParam, context: BaseAudioContext, volume: number): void {
  const now = context.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(playbackGain(volume), now + GAIN_RAMP_SECONDS);
}

export function createSpeechPlayer(): SpeechPlayer {
  let context: AudioContext | null = null;
  let source: AudioBufferSourceNode | null = null;
  let gain: GainNode | null = null;
  let analyser: AnalyserNode | null = null;
  let level = 1;
  let frame = 0;
  let stopped = false;

  function releaseGraph(): void {
    source?.disconnect();
    gain?.disconnect();
    analyser?.disconnect();
    source = null;
    gain = null;
    analyser = null;
  }

  return {
    setVolume(volume) {
      level = volume;
      if (context && gain) {
        rampGain(gain.gain, context, volume);
      }
    },
    async play(wav, volume, onLevel, onStart) {
      level = volume;
      stopped = false;
      const browser = window as Window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
      const AudioCtor = browser.AudioContext ?? browser.webkitAudioContext;
      if (!AudioCtor) {
        throw new Error("Audio playback is unavailable.");
      }
      context ??= new AudioCtor();
      const active = context;
      if (active.state === "suspended") {
        await active.resume();
      }
      const copy = new ArrayBuffer(wav.byteLength);
      new Uint8Array(copy).set(wav);
      const buffer = await active.decodeAudioData(copy);
      if (stopped) {
        onLevel(0);
        return;
      }
      releaseGraph();
      const gainNode = active.createGain();
      gainNode.gain.value = playbackGain(level);
      const meter = active.createAnalyser();
      meter.fftSize = 256;
      const node = active.createBufferSource();
      node.buffer = buffer;
      node.connect(gainNode);
      gainNode.connect(meter);
      meter.connect(active.destination);
      source = node;
      gain = gainNode;
      analyser = meter;
      const samples = new Uint8Array(meter.fftSize);
      const pump = () => {
        if (stopped) {
          return;
        }
        meter.getByteTimeDomainData(samples);
        let sum = 0;
        for (const value of samples) {
          const centered = (value - 128) / 128;
          sum += centered * centered;
        }
        onLevel(Math.min(1, Math.sqrt(sum / samples.length) * 4));
        frame = requestAnimationFrame(pump);
      };
      await new Promise<void>((resolve) => {
        node.onended = () => {
          cancelAnimationFrame(frame);
          onLevel(0);
          if (source === node) {
            source = null;
          }
          resolve();
        };
        onStart();
        node.start();
        pump();
      });
    },
    stop() {
      stopped = true;
      cancelAnimationFrame(frame);
      const current = source;
      releaseGraph();
      if (!current) {
        return;
      }
      try {
        current.stop();
      } catch {
        // The buffer already finished.
      }
    },
  };
}
