package dev.karimajed.eva.tts;

import dev.karimajed.eva.speech.EngineStatus;

public interface TextToSpeechEngine {

    EngineStatus status();

    TtsAudio synthesize(String voice, double speed, String text, String requestId);

    void cancel(String requestId);

    void close();
}
