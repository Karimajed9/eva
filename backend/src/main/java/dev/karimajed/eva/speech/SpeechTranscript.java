package dev.karimajed.eva.speech;

public record SpeechTranscript(
        String text,
        long elapsedMs,
        int recordingMs,
        Long loadMs,
        Long inferenceMs) {
}
