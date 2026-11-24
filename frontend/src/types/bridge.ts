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
import type { TtsRequest, TtsResult, TtsStatus } from "../../../shared/tts";
import type { TtsPreferences } from "../../../shared/tts-preferences";

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
  getTtsStatus(): Promise<TtsStatus | TtsResult>;
  getTtsPreferences(): Promise<TtsPreferences>;
  saveTtsPreferences(preferences: TtsPreferences): Promise<TtsPreferences>;
  synthesizeSpeech(request: TtsRequest): Promise<TtsResult>;
  cancelTts(): Promise<void>;
  subscribeConversation(listener: (delta: ConversationDelta) => void): () => void;
}

declare global {
  interface Window {
    eva?: EvaBridge;
  }
}

export {};
