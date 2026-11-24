package dev.karimajed.eva.tts;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class SpokenTextTest {

    @Test
    void removesMarkdownCodeAndLinksWithoutReadingTheCommand() {
        String spoken = SpokenText.normalize("""
                # Hello
                See [the guide](https://example.com/docs/very/long/path) and https://example.com/a/b/c/d/e/f.
                - First item
                2. Second item
                Use `eva` in a sentence.
                ```sh
                Remove-Item -Recurse C:\\secret
                ```
                Price is 3.14 dollars.
                """);
        assertTrue(spoken.contains("Hello"));
        assertTrue(spoken.contains("the guide"));
        assertTrue(spoken.contains("a link"));
        assertTrue(spoken.contains("First item"));
        assertTrue(spoken.contains("2, Second item"));
        assertTrue(spoken.contains("code block omitted"));
        assertTrue(spoken.contains("3.14"));
        assertFalse(spoken.contains("```"));
        assertFalse(spoken.contains("Remove-Item"));
        assertFalse(spoken.contains("https://"));
    }

    @Test
    void keepsAbbreviationsTogetherAndBoundsTheQueue() {
        String joined = String.join(" ", SpokenText.segments("Dr. Eva lives in the U.S. and the total is 3.14 today. Please continue."));
        assertTrue(joined.contains("Dr. Eva"));
        assertTrue(joined.contains("3.14"));
        StringBuilder many = new StringBuilder();
        for (int index = 0; index < 30; index += 1) {
            many.append("Sentence number ").append(index).append(" is long enough to stand alone today. ");
        }
        var segments = SpokenText.segments(many.toString());
        assertTrue(segments.size() <= SpokenText.MAX_SEGMENTS);
        assertEquals(true, String.join(" ", segments).contains("Sentence number 0"));
        assertEquals(true, String.join(" ", segments).contains("Sentence number 29"));
    }
}
