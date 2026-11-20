package dev.karimajed.jarvis.security;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class LoopbackRulesTest {

    @Test
    void allowsOnlyLoopbackHostHeaders() {
        assertTrue(LoopbackSessionFilter.isAllowedHost("127.0.0.1"));
        assertTrue(LoopbackSessionFilter.isAllowedHost("127.0.0.1:17341"));
        assertTrue(LoopbackSessionFilter.isAllowedHost("localhost"));
        assertTrue(LoopbackSessionFilter.isAllowedHost("localhost:17341"));
        assertTrue(LoopbackSessionFilter.isAllowedHost("[::1]"));
        assertTrue(LoopbackSessionFilter.isAllowedHost("[::1]:17341"));

        assertFalse(LoopbackSessionFilter.isAllowedHost(null));
        assertFalse(LoopbackSessionFilter.isAllowedHost(""));
        assertFalse(LoopbackSessionFilter.isAllowedHost("0.0.0.0"));
        assertFalse(LoopbackSessionFilter.isAllowedHost("evil.example"));
        assertFalse(LoopbackSessionFilter.isAllowedHost("127.0.0.1.evil.example"));
        assertFalse(LoopbackSessionFilter.isAllowedHost("user@127.0.0.1"));
    }

    @Test
    void allowsOnlyLoopbackRemoteAddresses() {
        assertTrue(LoopbackSessionFilter.isLoopbackRemote("127.0.0.1"));
        assertTrue(LoopbackSessionFilter.isLoopbackRemote("::1"));

        assertFalse(LoopbackSessionFilter.isLoopbackRemote(null));
        assertFalse(LoopbackSessionFilter.isLoopbackRemote(""));
        assertFalse(LoopbackSessionFilter.isLoopbackRemote("8.8.8.8"));
        assertFalse(LoopbackSessionFilter.isLoopbackRemote("evil.example"));
        assertFalse(LoopbackSessionFilter.isLoopbackRemote("0.0.0.0"));
    }
}
