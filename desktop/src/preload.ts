import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import {
  IpcChannel,
  parseAppInfo,
  parseBackendStatus,
  type AppInfo,
  type BackendStatus,
} from "../../shared/contract";

const jarvis = {
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
};

contextBridge.exposeInMainWorld("jarvis", jarvis);
