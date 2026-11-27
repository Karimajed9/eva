import { useCallback, useEffect, useState } from "react";
import {
  defaultAudioDevicePreferences,
  type AudioDevicePreferences,
} from "../../../shared/audio-device-preferences";
import type { ListedDevice, MicrophoneAudioConstraints } from "../../../shared/audio-devices";
import {
  attachAudioDeviceModel,
  AudioDeviceModel,
  type AudioDevicePorts,
  type AudioDeviceSnapshot,
  type OpenInput,
} from "./audio-device-model";

const emptySnapshot: AudioDeviceSnapshot = {
  inputs: [],
  outputs: [],
  inputDeviceId: defaultAudioDevicePreferences.inputDeviceId,
  outputDeviceId: defaultAudioDevicePreferences.outputDeviceId,
  inputMissing: false,
  outputMissing: false,
  labelsReady: false,
  ready: false,
  probing: false,
  probeLevel: 0,
  notice: "",
};

function browserPorts(): AudioDevicePorts {
  return {
    async enumerate() {
      const media = navigator.mediaDevices;
      if (!media?.enumerateDevices) {
        return [];
      }
      const devices = await media.enumerateDevices();
      return devices.map((device) => ({
        deviceId: device.deviceId,
        kind: device.kind,
        label: device.label,
      }));
    },
    async openInput(constraints: MicrophoneAudioConstraints): Promise<OpenInput> {
      const media = navigator.mediaDevices;
      if (!media?.getUserMedia) {
        throw new DOMException("No microphone is available.", "NotFoundError");
      }
      const stream = await media.getUserMedia({ audio: constraints, video: false });
      const AudioCtor = window.AudioContext;
      const context = AudioCtor ? new AudioCtor() : null;
      const source = context ? context.createMediaStreamSource(stream) : null;
      const analyser = context ? context.createAnalyser() : null;
      if (analyser && source) {
        analyser.fftSize = 1024;
        source.connect(analyser);
      }
      const data = new Float32Array(analyser?.fftSize ?? 0);
      let notify = () => {};
      let closed = false;
      stream.getAudioTracks()[0]?.addEventListener("ended", () => {
        if (!closed) {
          notify();
        }
      });
      return {
        level() {
          if (!analyser || data.length === 0) {
            return 0;
          }
          analyser.getFloatTimeDomainData(data);
          let sum = 0;
          for (const value of data) {
            sum += value * value;
          }
          return Math.max(0, Math.min(1, Math.sqrt(sum / data.length) * 4));
        },
        stop() {
          closed = true;
          for (const track of stream.getTracks()) {
            track.stop();
          }
          source?.disconnect();
          if (context && context.state !== "closed") {
            void context.close();
          }
        },
        onEnded(listener) {
          notify = listener;
        },
      };
    },
    async readPreferences() {
      const api = window.eva;
      if (!api) {
        return { ...defaultAudioDevicePreferences };
      }
      return api.getAudioDevicePreferences();
    },
    writePreferences(preferences: AudioDevicePreferences) {
      const api = window.eva;
      if (!api) {
        return Promise.resolve(preferences);
      }
      return api.saveAudioDevicePreferences(preferences);
    },
  };
}

let portsFactory: () => AudioDevicePorts = browserPorts;

export function setAudioDevicePorts(next: (() => AudioDevicePorts) | null): void {
  portsFactory = next ?? browserPorts;
}

export interface AudioDeviceView extends AudioDeviceSnapshot {
  refresh(): void;
  allowAccess(): void;
  setInput(deviceId: string): void;
  setOutput(deviceId: string): void;
  startProbe(): void;
  stopProbe(): void;
}

export function useAudioDevices(): AudioDeviceView {
  const [snapshot, setSnapshot] = useState<AudioDeviceSnapshot>(emptySnapshot);
  const [model, setModel] = useState<AudioDeviceModel | null>(null);

  useEffect(() => {
    const next = new AudioDeviceModel(portsFactory());
    attachAudioDeviceModel(next);
    setModel(next);
    const unsubscribe = next.subscribe(() => {
      setSnapshot(next.snapshot());
    });
    const onChange = () => {
      void next.refresh("devicechange");
    };
    navigator.mediaDevices?.addEventListener?.("devicechange", onChange);
    void next.load();
    return () => {
      unsubscribe();
      navigator.mediaDevices?.removeEventListener?.("devicechange", onChange);
      next.dispose();
      attachAudioDeviceModel(null);
    };
  }, []);

  const refresh = useCallback(() => {
    void model?.refresh("user");
  }, [model]);
  const allowAccess = useCallback(() => {
    void model?.allowAccess();
  }, [model]);
  const setInput = useCallback((deviceId: string) => {
    void model?.selectInput(deviceId);
  }, [model]);
  const setOutput = useCallback((deviceId: string) => {
    void model?.selectOutput(deviceId);
  }, [model]);
  const startProbe = useCallback(() => {
    void model?.startProbe();
  }, [model]);
  const stopProbe = useCallback(() => {
    model?.stopProbe();
  }, [model]);

  return {
    ...snapshot,
    refresh,
    allowAccess,
    setInput,
    setOutput,
    startProbe,
    stopProbe,
  };
}

export function deviceOptionLabel(device: ListedDevice, index: number, noun: "Microphone" | "Speaker"): string {
  const label = device.label.trim().slice(0, 80);
  return label.length > 0 ? label : `${noun} ${index + 1}`;
}
