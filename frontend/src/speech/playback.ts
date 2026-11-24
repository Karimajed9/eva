export interface SpeechPlayer {
  play(wav: Uint8Array, volume: number, onLevel: (level: number) => void, onStart: () => void): Promise<void>;
  stop(): void;
}

export function createSpeechPlayer(): SpeechPlayer {
  let context: AudioContext | null = null;
  let source: AudioBufferSourceNode | null = null;
  let frame = 0;
  let stopped = false;

  return {
    async play(wav, volume, onLevel, onStart) {
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
      const gain = active.createGain();
      gain.gain.value = Math.min(1, Math.max(0, volume));
      const analyser = active.createAnalyser();
      analyser.fftSize = 256;
      const node = active.createBufferSource();
      node.buffer = buffer;
      node.connect(gain);
      gain.connect(analyser);
      analyser.connect(active.destination);
      source = node;
      const samples = new Uint8Array(analyser.fftSize);
      const pump = () => {
        if (stopped) {
          return;
        }
        analyser.getByteTimeDomainData(samples);
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
      source = null;
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
