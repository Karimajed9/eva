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
