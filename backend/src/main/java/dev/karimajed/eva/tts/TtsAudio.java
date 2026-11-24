package dev.karimajed.eva.tts;

public record TtsAudio(byte[] wav, long elapsedMs, Long loadMs, int audioMs, int sampleRate) {
}
