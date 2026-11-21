package dev.karimajed.eva.security;

public record SessionToken(String value) {

    public static final int MINIMUM_LENGTH = 32;

    public SessionToken {
        if (value == null || value.length() < MINIMUM_LENGTH) {
            throw new IllegalStateException(
                    "EVA_SESSION_TOKEN must be provided and at least " + MINIMUM_LENGTH + " characters.");
        }
        if (value.chars().anyMatch(Character::isWhitespace)) {
            throw new IllegalStateException("EVA_SESSION_TOKEN must not contain whitespace.");
        }
    }
}
