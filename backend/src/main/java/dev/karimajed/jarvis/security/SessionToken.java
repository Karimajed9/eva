package dev.karimajed.jarvis.security;

public record SessionToken(String value) {

    public static final int MINIMUM_LENGTH = 32;

    public SessionToken {
        if (value == null || value.length() < MINIMUM_LENGTH) {
            throw new IllegalStateException(
                    "JARVIS_SESSION_TOKEN must be provided and at least " + MINIMUM_LENGTH + " characters.");
        }
        if (value.chars().anyMatch(Character::isWhitespace)) {
            throw new IllegalStateException("JARVIS_SESSION_TOKEN must not contain whitespace.");
        }
    }
}
