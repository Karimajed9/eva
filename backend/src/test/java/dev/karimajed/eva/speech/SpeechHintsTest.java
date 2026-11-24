package dev.karimajed.eva.speech;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class SpeechHintsTest {

    @Test
    void acceptsAutomaticAndAShortVocabulary() {
        SpeechHints hints = SpeechHints.parse("FR", URLEncoder.encode("Muay Thai, مرحبا", StandardCharsets.UTF_8), "8000");
        assertEquals("fr", hints.language());
        assertEquals("Muay Thai, مرحبا", hints.prompt());
        assertEquals(8000, hints.recordingMs());
    }

    @Test
    void rejectsShellTextWithoutEchoingIt() {
        SpeechException failure = assertThrows(
                SpeechException.class,
                () -> SpeechHints.parse("en", URLEncoder.encode("Muay Thai\ncalc.exe", StandardCharsets.UTF_8), "1"));
        assertEquals("The speech settings were rejected.", failure.detail());
        assertFalse(failure.detail().contains("Muay"));
        assertFalse(failure.detail().contains("calc"));
        assertThrows(SpeechException.class, () -> SpeechHints.parse("de", "", "1"));
        assertThrows(SpeechException.class, () -> SpeechHints.parse("en", "", "60001"));
    }
}
