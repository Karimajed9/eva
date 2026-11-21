import type { AppInfo, BackendStatus } from "../../../shared/contract";

export interface EvaBridge {
  getBackendStatus(): Promise<BackendStatus>;
  subscribeBackendStatus(listener: (status: BackendStatus) => void): () => void;
  getAppInfo(): Promise<AppInfo>;
}

declare global {
  interface Window {
    eva?: EvaBridge;
  }
}

export {};
