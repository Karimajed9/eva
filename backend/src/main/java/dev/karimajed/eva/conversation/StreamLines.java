package dev.karimajed.eva.conversation;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.karimajed.eva.conversation.ConversationModels.Reply;
import dev.karimajed.eva.conversation.ConversationModels.Usage;
import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

final class StreamLines {

    private final Writer writer;
    private final ObjectMapper json;
    private int seq;

    StreamLines(OutputStream output) {
        this(output, new ObjectMapper());
    }

    StreamLines(OutputStream output, ObjectMapper json) {
        this.writer = new OutputStreamWriter(output, StandardCharsets.UTF_8);
        this.json = json;
    }

    synchronized void delta(String text) throws IOException {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("type", "delta");
        event.put("seq", ++seq);
        event.put("text", text);
        write(event);
    }

    synchronized void done(Reply reply) throws IOException {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("type", "done");
        event.put("seq", ++seq);
        event.put("provider", reply.provider());
        event.put("model", reply.model());
        event.put("text", reply.text());
        event.put("usage", usage(reply.usage()));
        write(event);
    }

    synchronized void error(ConversationException exception) throws IOException {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("type", "error");
        event.put("seq", ++seq);
        event.put("code", exception.code());
        event.put("detail", exception.detail());
        write(event);
    }

    private void write(Map<String, Object> event) throws IOException {
        writer.write(json.writeValueAsString(event));
        writer.write('\n');
        writer.flush();
    }

    private static Map<String, Object> usage(Usage usage) {
        if (usage == null) {
            return null;
        }
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("promptTokens", usage.promptTokens());
        values.put("completionTokens", usage.completionTokens());
        values.put("estimatedUsd", usage.estimatedUsd());
        return values;
    }
}
