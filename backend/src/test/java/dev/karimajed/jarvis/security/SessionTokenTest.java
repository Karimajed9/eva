package dev.karimajed.jarvis.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class SessionTokenTest {

    @Test
    void keepsALongToken() {
        String value = "jarvis-test-token-0123456789abcdef";
        assertEquals(value, new SessionToken(value).value());
    }

    @Test
    void rejectsMissingShortAndWhitespaceTokens() {
        assertThrows(IllegalStateException.class, () -> new SessionToken(null));
        assertThrows(IllegalStateException.class, () -> new SessionToken("short-token"));
        assertThrows(IllegalStateException.class, () -> new SessionToken("jarvis-test-token-with a space-123456"));
    }
}
