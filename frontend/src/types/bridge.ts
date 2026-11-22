import type {
  AppInfo,
  BackendStatus,
  CatalogResult,
  ConversationRequest,
  ConversationResult,
} from "../../../shared/contract";

export interface EvaBridge {
  getBackendStatus(): Promise<BackendStatus>;
  subscribeBackendStatus(listener: (status: BackendStatus) => void): () => void;
  getAppInfo(): Promise<AppInfo>;
  getConversation(): Promise<CatalogResult>;
  sendConversation(request: ConversationRequest): Promise<ConversationResult>;
  resetConversation(): Promise<CatalogResult>;
  cancelConversation(): Promise<void>;
}

declare global {
  interface Window {
    eva?: EvaBridge;
  }
}

export {};
