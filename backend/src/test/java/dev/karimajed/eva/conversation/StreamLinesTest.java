package dev.karimajed.eva.conversation;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.karimajed.eva.conversation.ConversationModels.Reply;
import dev.karimajed.eva.conversation.ConversationModels.Usage;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.Test;

class StreamLinesTest {

    @Test
    void writesIncrementalDeltasThenOneDoneEvent() throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        StreamLines lines = new StreamLines(output, new ObjectMapper());
        lines.delta("He");
        lines.delta("llo");
        lines.done(new Reply("ollama", "llama3.2:3b", "Hello", new Usage(4, 2, null)));

        List<String> events = List.of(output.toString(StandardCharsets.UTF_8).split("\\R"));
        assertTrue(events.get(0).contains("\"type\":\"delta\""));
        assertTrue(events.get(0).contains("\"seq\":1"));
        assertTrue(events.get(0).contains("\"text\":\"He\""));
        assertTrue(events.get(1).contains("\"seq\":2"));
        assertTrue(events.get(1).contains("\"text\":\"llo\""));
        assertTrue(events.get(2).contains("\"type\":\"done\""));
        assertTrue(events.get(2).contains("\"text\":\"Hello\""));
        assertTrue(events.get(2).contains("\"promptTokens\":4"));
        assertTrue(events.get(2).contains("\"completionTokens\":2"));
        assertTrue(events.get(2).contains("\"estimatedUsd\":null"));
        assertFalse(output.toString(StandardCharsets.UTF_8).contains("unit-test-credential"));
    }

    @Test
    void errorEventKeepsTheFixedDetailAndDropsPartialSuccess() throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        StreamLines lines = new StreamLines(output, new ObjectMapper());
        lines.delta("partial");
        lines.error(new ConversationException("provider-error", 502, "Ollama closed the reply before it finished."));

        String body = output.toString(StandardCharsets.UTF_8);
        assertTrue(body.contains("\"code\":\"provider-error\""));
        assertFalse(body.contains("\"type\":\"done\""));
        assertFalse(body.contains("unit-test-credential"));
        assertFalse(body.contains("sk-"));
    }
}
