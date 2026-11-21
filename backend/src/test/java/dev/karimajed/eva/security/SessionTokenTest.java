package dev.karimajed.eva.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class SessionTokenTest {

    @Test
    void keepsALongToken() {
        String value = "eva-test-token-0123456789abcdef00";
        assertEquals(value, new SessionToken(value).value());
    }

    @Test
    void rejectsMissingShortAndWhitespaceTokens() {
        assertThrows(IllegalStateException.class, () -> new SessionToken(null));
        assertThrows(IllegalStateException.class, () -> new SessionToken("short-token"));
        assertThrows(IllegalStateException.class, () -> new SessionToken("eva-test-token-with a space-123456"));
    }
}
