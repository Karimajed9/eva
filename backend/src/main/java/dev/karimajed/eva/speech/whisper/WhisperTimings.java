package dev.karimajed.eva.speech.whisper;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reads whisper.cpp timing lines and discards the rest of the process log.
 */
final class WhisperTimings {

    private static final Pattern LOAD = Pattern.compile("load time\\s*=\\s*([0-9]+(?:\\.[0-9]+)?)\\s*ms", Pattern.CASE_INSENSITIVE);
    private static final Pattern TOTAL = Pattern.compile("total time\\s*=\\s*([0-9]+(?:\\.[0-9]+)?)\\s*ms", Pattern.CASE_INSENSITIVE);

    private WhisperTimings() {
    }

    static Long loadMillis(String stderr) {
        return match(LOAD, stderr);
    }

    static Long totalMillis(String stderr) {
        return match(TOTAL, stderr);
    }

    private static Long match(Pattern pattern, String stderr) {
        if (stderr == null || stderr.isBlank()) {
            return null;
        }
        Matcher matcher = pattern.matcher(stderr);
        if (!matcher.find()) {
            return null;
        }
        double value = Double.parseDouble(matcher.group(1));
        if (!Double.isFinite(value) || value < 0 || value > 180_000) {
            return null;
        }
        return Math.round(value);
    }
}
