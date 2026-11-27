import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import {
  IpcChannel,
  parseAppInfo,
  parseBackendStatus,
  parseCatalogResult,
  parseConversationDelta,
  parseConversationRequest,
  parseConversationResult,
  parseSpeechResult,
  parseSpeechStatusResult,
  type AppInfo,
  type BackendStatus,
  type CatalogResult,
  type ConversationDelta,
  type ConversationRequest,
  type ConversationResult,
  type SpeechResult,
  type SpeechStatusResult,
} from "../../shared/contract";
import {
  parseSpeechAudioRequest,
  parseSpeechPreferences,
  type SpeechAudioRequest,
  type SpeechPreferences,
} from "../../shared/speech-preferences";
import { isRecord } from "../../shared/contract";
import {
  parseTtsFailure,
  parseTtsRequest,
  parseTtsStatus,
  parseTtsWav,
  ttsFailure,
  type TtsRequest,
  type TtsResult,
  type TtsStatus,
} from "../../shared/tts";
import {
  defaultAudioDevicePreferences,
  parseAudioDevicePreferences,
  type AudioDevicePreferences,
} from "../../shared/audio-device-preferences";
import {
  defaultTtsPreferences,
  parseTtsPreferences,
  type TtsPreferences,
} from "../../shared/tts-preferences";

const eva = {
  async getBackendStatus(): Promise<BackendStatus> {
    const parsed = parseBackendStatus(await ipcRenderer.invoke(IpcChannel.getStatus));
    if (!parsed) {
      throw new Error("Invalid backend status.");
    }
    return parsed;
  },
  subscribeBackendStatus(listener: (status: BackendStatus) => void): () => void {
    if (typeof listener !== "function") {
      throw new Error("Status listener must be a function.");
    }
    const wrapped = (_event: IpcRendererEvent, payload: unknown) => {
      const parsed = parseBackendStatus(payload);
      if (parsed) {
        listener(parsed);
      }
    };
    ipcRenderer.on(IpcChannel.statusEvent, wrapped);
    return () => {
      ipcRenderer.removeListener(IpcChannel.statusEvent, wrapped);
    };
  },
  async getAppInfo(): Promise<AppInfo> {
    const parsed = parseAppInfo(await ipcRenderer.invoke(IpcChannel.getAppInfo));
    if (!parsed) {
      throw new Error("Invalid application info.");
    }
    return parsed;
  },
  async getConversation(): Promise<CatalogResult> {
    const parsed = parseCatalogResult(await ipcRenderer.invoke(IpcChannel.getConversation));
    if (!parsed) {
      throw new Error("Invalid conversation catalog.");
    }
    return parsed;
  },
  async sendConversation(request: ConversationRequest): Promise<ConversationResult> {
    const accepted = parseConversationRequest(request);
    if (!accepted) {
      return { ok: false, code: "invalid", detail: "That message cannot be sent." };
    }
    const parsed = parseConversationResult(await ipcRenderer.invoke(IpcChannel.sendConversation, accepted));
    if (!parsed) {
      throw new Error("Invalid conversation reply.");
    }
    return parsed;
  },
  async resetConversation(): Promise<CatalogResult> {
    const parsed = parseCatalogResult(await ipcRenderer.invoke(IpcChannel.resetConversation));
    if (!parsed) {
      throw new Error("Invalid conversation catalog.");
    }
    return parsed;
  },
  async cancelConversation(): Promise<void> {
    await ipcRenderer.invoke(IpcChannel.cancelConversation);
  },
  async getSpeechStatus(): Promise<SpeechStatusResult> {
    const parsed = parseSpeechStatusResult(await ipcRenderer.invoke(IpcChannel.getSpeech));
    if (!parsed) {
      throw new Error("Invalid speech status.");
    }
    return parsed;
  },
  async getSpeechPreferences(): Promise<SpeechPreferences> {
    return parseSpeechPreferences(await ipcRenderer.invoke(IpcChannel.getSpeechPreferences)) ?? {
      language: "auto",
      vocabulary: [],
    };
  },
  async saveSpeechPreferences(preferences: SpeechPreferences): Promise<SpeechPreferences> {
    const accepted = parseSpeechPreferences(preferences);
    if (!accepted) {
      throw new Error("Invalid speech settings.");
    }
    const parsed = parseSpeechPreferences(await ipcRenderer.invoke(IpcChannel.saveSpeechPreferences, accepted));
    if (!parsed) {
      throw new Error("Invalid speech settings.");
    }
    return parsed;
  },
  async transcribeSpeech(request: SpeechAudioRequest): Promise<SpeechResult> {
    const accepted = parseSpeechAudioRequest(request);
    if (!accepted) {
      return { ok: false, code: "invalid-audio", detail: "EVA could not use that recording." };
    }
    const parsed = parseSpeechResult(await ipcRenderer.invoke(IpcChannel.transcribeSpeech, accepted));
    if (!parsed) {
      throw new Error("Invalid transcription.");
    }
    return parsed;
  },
  async cancelSpeech(): Promise<void> {
    await ipcRenderer.invoke(IpcChannel.cancelSpeech);
  },
  async getTtsStatus(): Promise<TtsStatus | TtsResult> {
    const payload: unknown = await ipcRenderer.invoke(IpcChannel.getTts);
    return parseTtsStatus(payload) ?? parseTtsFailure(payload) ?? ttsFailure("engine-error", "Local speech failed.");
  },
  async getTtsPreferences(): Promise<TtsPreferences> {
    return parseTtsPreferences(await ipcRenderer.invoke(IpcChannel.getTtsPreferences)) ?? { ...defaultTtsPreferences };
  },
  async saveTtsPreferences(preferences: TtsPreferences): Promise<TtsPreferences> {
    const accepted = parseTtsPreferences(preferences);
    if (!accepted) {
      throw new Error("Invalid speech settings.");
    }
    const parsed = parseTtsPreferences(await ipcRenderer.invoke(IpcChannel.saveTtsPreferences, accepted));
    if (!parsed) {
      throw new Error("Invalid speech settings.");
    }
    return parsed;
  },
  async synthesizeSpeech(request: TtsRequest): Promise<TtsResult> {
    const accepted = parseTtsRequest(request);
    if (!accepted) {
      return ttsFailure("invalid-speech", "The speech request was rejected.");
    }
    const payload: unknown = await ipcRenderer.invoke(IpcChannel.synthesizeSpeech, {
      voice: accepted.voice,
      speed: accepted.speed,
      text: accepted.text,
    });
    if (isRecord(payload) && payload.ok === true && payload.audio instanceof Uint8Array) {
      const wav = parseTtsWav(payload.audio);
      const elapsedMs = typeof payload.elapsedMs === "number" ? payload.elapsedMs : 0;
      const loadMs = payload.loadMs === null || typeof payload.loadMs === "number" ? payload.loadMs : null;
      if (!wav || !Number.isInteger(elapsedMs) || elapsedMs < 0) {
        return ttsFailure("engine-error", "Local speech failed.");
      }
      return { ok: true, audio: wav.audio, elapsedMs, loadMs: loadMs ?? null, audioMs: wav.audioMs, sampleRate: wav.sampleRate };
    }
    return parseTtsFailure(payload) ?? ttsFailure("engine-error", "Local speech failed.");
  },
  async cancelTts(): Promise<void> {
    await ipcRenderer.invoke(IpcChannel.cancelTts);
  },
  async getAudioDevicePreferences(): Promise<AudioDevicePreferences> {
    return parseAudioDevicePreferences(await ipcRenderer.invoke(IpcChannel.getAudioDevicePreferences))
      ?? { ...defaultAudioDevicePreferences };
  },
  async saveAudioDevicePreferences(preferences: AudioDevicePreferences): Promise<AudioDevicePreferences> {
    const accepted = parseAudioDevicePreferences(preferences);
    if (!accepted) {
      throw new Error("Invalid audio device settings.");
    }
    const parsed = parseAudioDevicePreferences(await ipcRenderer.invoke(IpcChannel.saveAudioDevicePreferences, accepted));
    if (!parsed) {
      throw new Error("Invalid audio device settings.");
    }
    return parsed;
  },
  subscribeConversation(listener: (delta: ConversationDelta) => void): () => void {
    if (typeof listener !== "function") {
      throw new Error("Conversation listener must be a function.");
    }
    const wrapped = (_event: IpcRendererEvent, payload: unknown) => {
      const parsed = parseConversationDelta(payload);
      if (parsed) {
        listener(parsed);
      }
    };
    ipcRenderer.on(IpcChannel.conversationEvent, wrapped);
    return () => {
      ipcRenderer.removeListener(IpcChannel.conversationEvent, wrapped);
    };
  },
};

contextBridge.exposeInMainWorld("eva", eva);
