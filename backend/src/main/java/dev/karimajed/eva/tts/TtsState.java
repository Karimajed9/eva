package dev.karimajed.eva.tts;

public record TtsState(String engine, boolean available, String detail, Long loadMs) {
}
