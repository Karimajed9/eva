package dev.karimajed.eva.speech;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Set;

/**
 * Language and vocabulary chosen by the user. The prompt is one process argument,
 * never a shell command, and it is not written to the log.
 */
public record SpeechHints(String language, String prompt, int recordingMs) {

    private static final Set<String> LANGUAGES = Set.of("auto", "en", "fr", "ar");
    public static final int MAX_PROMPT = 240;
    public static final int MAX_RECORDING_MS = 60_000;

    public static SpeechHints automatic() {
        return new SpeechHints("auto", "", 0);
    }

    public static SpeechHints parse(String languageHeader, String encodedPrompt, String recordingHeader) {
        String language = languageHeader == null || languageHeader.isBlank()
                ? "auto"
                : languageHeader.trim().toLowerCase(java.util.Locale.ROOT);
        if (!LANGUAGES.contains(language)) {
            throw rejected();
        }
        return new SpeechHints(language, decodePrompt(encodedPrompt), decodeRecording(recordingHeader));
    }

    public void check() {
        if (!LANGUAGES.contains(language) || prompt == null || prompt.length() > MAX_PROMPT || !allowedPrompt(prompt)) {
            throw rejected();
        }
        if (recordingMs < 0 || recordingMs > MAX_RECORDING_MS) {
            throw rejected();
        }
    }

    private static String decodePrompt(String encoded) {
        if (encoded == null || encoded.isBlank()) {
            return "";
        }
        if (encoded.length() > 1_200) {
            throw rejected();
        }
        String decoded;
        try {
            decoded = URLDecoder.decode(encoded, StandardCharsets.UTF_8);
        } catch (IllegalArgumentException exception) {
            throw rejected();
        }
        if (decoded.length() > MAX_PROMPT || !allowedPrompt(decoded)) {
            throw rejected();
        }
        return decoded;
    }

    private static int decodeRecording(String header) {
        if (header == null || header.isBlank()) {
            return 0;
        }
        if (!header.matches("[0-9]{1,5}")) {
            throw rejected();
        }
        int value = Integer.parseInt(header);
        if (value > MAX_RECORDING_MS) {
            throw rejected();
        }
        return value;
    }

    public static boolean allowedPrompt(String prompt) {
        if (prompt.isEmpty()) {
            return true;
        }
        return prompt.codePoints().allMatch(SpeechHints::allowed);
    }

    private static boolean allowed(int codePoint) {
        return Character.isLetterOrDigit(codePoint)
                || codePoint == ' '
                || codePoint == ','
                || codePoint == '.'
                || codePoint == '\''
                || codePoint == '-';
    }

    private static SpeechException rejected() {
        return new SpeechException("invalid-audio", 400, "The speech settings were rejected.");
    }
}
