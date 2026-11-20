import type { AppInfo, BackendStatus } from "../../../shared/contract";

export interface JarvisBridge {
  getBackendStatus(): Promise<BackendStatus>;
  subscribeBackendStatus(listener: (status: BackendStatus) => void): () => void;
  getAppInfo(): Promise<AppInfo>;
}

declare global {
  interface Window {
    jarvis?: JarvisBridge;
  }
}

export {};
