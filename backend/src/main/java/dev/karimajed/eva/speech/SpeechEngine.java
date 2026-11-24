package dev.karimajed.eva.speech;

import dev.karimajed.eva.conversation.CancelToken;

/**
 * Local transcription boundary. A later engine can implement this without
 * changing the desktop bridge or the conversation providers.
 */
public interface SpeechEngine {

    EngineStatus status();

    String transcribe(byte[] wav, CancelToken cancel);
}
