package dev.karimajed.jarvis.security;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class TokenComparerTest {

    @Test
    void acceptsAnExactMatch() {
        assertTrue(TokenComparer.matches("jarvis-test-token-0123456789abcdef", "jarvis-test-token-0123456789abcdef"));
    }

    @Test
    void rejectsNullEmptyAndDifferentTokens() {
        assertFalse(TokenComparer.matches(null, "jarvis-test-token-0123456789abcdef"));
        assertFalse(TokenComparer.matches("jarvis-test-token-0123456789abcdef", null));
        assertFalse(TokenComparer.matches("jarvis-test-token-0123456789abcdef", ""));
        assertFalse(TokenComparer.matches("jarvis-test-token-0123456789abcdef", "jarvis-test-token-0123456789abcdee"));
        assertFalse(TokenComparer.matches("jarvis-test-token-0123456789abcdef", "jarvis-test-token-0123456789abcdef "));
    }

    @Test
    void rejectsOversizedPresentedTokens() {
        assertFalse(TokenComparer.matches("expected-token-value-0123456789", "a".repeat(TokenComparer.MAXIMUM_PRESENTED_LENGTH + 1)));
    }
}
