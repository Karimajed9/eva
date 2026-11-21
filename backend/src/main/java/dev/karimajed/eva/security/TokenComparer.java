package dev.karimajed.eva.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

public final class TokenComparer {

    public static final int MAXIMUM_PRESENTED_LENGTH = 256;

    private TokenComparer() {
    }

    public static boolean matches(String expected, String presented) {
        if (expected == null || presented == null) {
            return false;
        }
        if (presented.length() > MAXIMUM_PRESENTED_LENGTH) {
            return false;
        }
        byte[] expectedHash = sha256(expected);
        byte[] presentedHash = sha256(presented);
        return MessageDigest.isEqual(expectedHash, presentedHash);
    }

    private static byte[] sha256(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable.", exception);
        }
    }
}
