package dev.karimajed.eva.speech.whisper;

public record CommandOutput(String stdout, Long loadMillis, Long totalMillis) {

    public static CommandOutput text(String stdout) {
        return new CommandOutput(stdout, null, null);
    }
}
