import type {
  AppInfo,
  BackendStatus,
  CatalogResult,
  ConversationDelta,
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
  subscribeConversation(listener: (delta: ConversationDelta) => void): () => void;
}

declare global {
  interface Window {
    eva?: EvaBridge;
  }
}

export {};
