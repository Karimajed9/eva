import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import {
  IpcChannel,
  parseAppInfo,
  parseBackendStatus,
  parseCatalogResult,
  parseConversationRequest,
  parseConversationResult,
  type AppInfo,
  type BackendStatus,
  type CatalogResult,
  type ConversationRequest,
  type ConversationResult,
} from "../../shared/contract";

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
};

contextBridge.exposeInMainWorld("eva", eva);
