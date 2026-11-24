package dev.karimajed.eva.speech.whisper;

public final class WhisperTranscript {

    private WhisperTranscript() {
    }

    public static String normalize(String stdout) {
        if (stdout == null || stdout.isBlank()) {
            return "";
        }
        StringBuilder kept = new StringBuilder();
        for (String line : stdout.split("\\R")) {
            String trimmed = line.trim();
            if (trimmed.startsWith("[") && trimmed.contains("-->") && trimmed.contains("]")) {
                trimmed = trimmed.substring(trimmed.indexOf(']') + 1).trim();
            }
            if (trimmed.isEmpty()) {
                continue;
            }
            if (kept.length() > 0) {
                kept.append('\n');
            }
            kept.append(trimmed);
        }
        String text = kept.toString().strip();
        if (text.length() > 4_000) {
            text = text.substring(0, 4_000).strip();
        }
        return text;
    }
}
