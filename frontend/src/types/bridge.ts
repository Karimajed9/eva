import type {
  AppInfo,
  BackendStatus,
  CatalogResult,
  ConversationDelta,
  ConversationRequest,
  ConversationResult,
  SpeechResult,
  SpeechStatusResult,
} from "../../../shared/contract";
import type { SpeechAudioRequest, SpeechPreferences } from "../../../shared/speech-preferences";

export interface EvaBridge {
  getBackendStatus(): Promise<BackendStatus>;
  subscribeBackendStatus(listener: (status: BackendStatus) => void): () => void;
  getAppInfo(): Promise<AppInfo>;
  getConversation(): Promise<CatalogResult>;
  sendConversation(request: ConversationRequest): Promise<ConversationResult>;
  resetConversation(): Promise<CatalogResult>;
  cancelConversation(): Promise<void>;
  getSpeechStatus(): Promise<SpeechStatusResult>;
  getSpeechPreferences(): Promise<SpeechPreferences>;
  saveSpeechPreferences(preferences: SpeechPreferences): Promise<SpeechPreferences>;
  transcribeSpeech(request: SpeechAudioRequest): Promise<SpeechResult>;
  cancelSpeech(): Promise<void>;
  subscribeConversation(listener: (delta: ConversationDelta) => void): () => void;
}

declare global {
  interface Window {
    eva?: EvaBridge;
  }
}

export {};
