package dev.karimajed.eva.security;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class TokenComparerTest {

    @Test
    void acceptsAnExactMatch() {
        assertTrue(TokenComparer.matches("eva-test-token-0123456789abcdef00", "eva-test-token-0123456789abcdef00"));
    }

    @Test
    void rejectsNullEmptyAndDifferentTokens() {
        assertFalse(TokenComparer.matches(null, "eva-test-token-0123456789abcdef00"));
        assertFalse(TokenComparer.matches("eva-test-token-0123456789abcdef00", null));
        assertFalse(TokenComparer.matches("eva-test-token-0123456789abcdef00", ""));
        assertFalse(TokenComparer.matches("eva-test-token-0123456789abcdef00", "eva-test-token-0123456789abcdee"));
        assertFalse(TokenComparer.matches("eva-test-token-0123456789abcdef00", "eva-test-token-0123456789abcdef00 "));
    }

    @Test
    void rejectsOversizedPresentedTokens() {
        assertFalse(TokenComparer.matches("expected-token-value-0123456789", "a".repeat(TokenComparer.MAXIMUM_PRESENTED_LENGTH + 1)));
    }
}
