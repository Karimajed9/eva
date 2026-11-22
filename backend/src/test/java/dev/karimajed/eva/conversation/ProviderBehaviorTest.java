package dev.karimajed.eva.conversation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.karimajed.eva.conversation.ConversationModels.ChatTurn;
import dev.karimajed.eva.conversation.ConversationModels.ProviderStatus;
import dev.karimajed.eva.conversation.ConversationModels.Reply;
import dev.karimajed.eva.conversation.ollama.OllamaChatProvider;
import dev.karimajed.eva.conversation.openai.OpenAiChatProvider;
import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.exception.RateLimitException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

class ProviderBehaviorTest {

    @Test
    void ollamaDiscoveryListsInstalledModelsAndNeverRequestsADownload() {
        RecordingHttp http = new RecordingHttp();
        http.next = new ModelHttp.Response(200, "{\"models\":[{\"name\":\"llama3.2:latest\"}]}");
        OllamaChatProvider provider = new OllamaChatProvider(http, "http://127.0.0.1:11434");

        ProviderStatus status = provider.describe();

        assertTrue(status.reachable());
        assertEquals("llama3.2:latest", status.models().get(0).id());
        assertEquals("/api/tags", http.paths.get(0));
        assertTrue(http.paths.stream().noneMatch(path -> path.contains("pull")));
    }

    @Test
    void ollamaUnavailableAndMissingModelsStayLocal() {
        RecordingHttp down = new RecordingHttp();
        down.failure = new ConversationException("unavailable", 503, "down");
        ProviderStatus offline = new OllamaChatProvider(down, "http://127.0.0.1:11434").describe();
        assertFalse(offline.reachable());
        assertTrue(offline.detail().contains("will not download"));

        RecordingHttp empty = new RecordingHttp();
        empty.next = new ModelHttp.Response(200, "{\"models\":[]}");
        ProviderStatus noModels = new OllamaChatProvider(empty, "http://127.0.0.1:11434").describe();
        assertTrue(noModels.reachable());
        assertTrue(noModels.models().isEmpty());
        assertTrue(noModels.detail().contains("will not download"));

        RecordingHttp missing = new RecordingHttp();
        missing.next = new ModelHttp.Response(404, "{\"error\":\"not found\"}");
        OllamaChatProvider provider = new OllamaChatProvider(missing, "http://localhost:11434");
        ConversationException error = assertThrows(ConversationException.class, () -> provider.stream(
                List.of(new ChatTurn("user", "Hi")),
                "missing-model",
                "You are EVA.",
                new CancelToken(),
                ignored -> {
                }));
        assertEquals("model-missing", error.code());
        assertEquals("/api/chat", missing.paths.get(0));
        assertFalse(missing.bodies.get(0).contains("/api/pull"));
        assertTrue(missing.bodies.get(0).contains("\"stream\":true"));
    }

    @Test
    void ollamaStreamsChunksAndKeepsUsageWhenTheStreamFinishes() {
        RecordingHttp http = new RecordingHttp();
        http.next = new ModelHttp.Response(200, """
                {"message":{"content":"He"},"done":false}
                {"message":{"content":"llo"},"done":false}
                {"done":true,"prompt_eval_count":4,"eval_count":2}
                """);
        List<String> deltas = new ArrayList<>();
        Reply reply = new OllamaChatProvider(http, "http://127.0.0.1:11434").stream(
                List.of(new ChatTurn("user", "Hi")),
                "llama3.2:3b",
                "You are EVA.",
                new CancelToken(),
                deltas::add);
        assertEquals(List.of("He", "llo"), deltas);
        assertEquals("Hello", reply.text());
        assertEquals(4, reply.usage().promptTokens());
        assertEquals(2, reply.usage().completionTokens());
        assertNull(reply.usage().estimatedUsd());
        assertTrue(http.bodies.get(0).contains("\"stream\":true"));
        assertTrue(http.paths.stream().noneMatch(path -> path.contains("pull")));
    }

    @Test
    void ollamaIncompleteStreamDoesNotBecomeAReply() {
        RecordingHttp http = new RecordingHttp();
        http.next = new ModelHttp.Response(200, "{\"message\":{\"content\":\"partial-secret-text\"},\"done\":false}\n");
        OllamaChatProvider provider = new OllamaChatProvider(http, "http://127.0.0.1:11434");
        ConversationException error = assertThrows(ConversationException.class, () -> provider.stream(
                List.of(new ChatTurn("user", "Hi")),
                "llama3.2:3b",
                "You are EVA.",
                new CancelToken(),
                ignored -> {
                }));
        assertEquals("provider-error", error.code());
        assertFalse(error.detail().contains("partial-secret-text"));
    }

    @Test
    void ollamaBaseUrlMustStayOnLoopback() {
        RecordingHttp http = new RecordingHttp();
        assertThrows(IllegalStateException.class, () -> new OllamaChatProvider(http, "https://models.example/v1"));
        assertThrows(IllegalStateException.class, () -> new OllamaChatProvider(http, "http://10.0.0.8:11434"));
    }

    @Test
    void openAiMissingKeyDoesNotCallTheCloudClient() {
        OpenAiChatProvider provider = new OpenAiChatProvider(null, false);
        ProviderStatus status = provider.describe();
        assertFalse(status.configured());
        assertFalse(status.models().isEmpty());
        ConversationException error = assertThrows(ConversationException.class, () -> provider.stream(
                List.of(new ChatTurn("user", "Hi")),
                "gpt-4o-mini",
                "You are EVA.",
                new CancelToken(),
                ignored -> {
                }));
        assertEquals("credentials", error.code());
        assertFalse(error.detail().contains("unit-test-credential"));
    }

    @Test
    void openAiRateLimitIsReportedWithoutTheCredentialAndUsageIsEstimated() {
        AtomicReference<String> seenKey = new AtomicReference<>();
        OpenAiChatProvider.CloudClient client = (model, messages, cancel, onDelta) -> {
            seenKey.set("should-not-be-read");
            throw new RateLimitException("rejected unit-test-credential");
        };
        OpenAiChatProvider provider = new OpenAiChatProvider(client, true);
        ConversationException error = assertThrows(ConversationException.class, () -> provider.stream(
                List.of(new ChatTurn("user", "Hi")),
                "gpt-4o-mini",
                "You are EVA.",
                new CancelToken(),
                ignored -> {
                }));
        assertEquals("rate-limited", error.code());
        assertFalse(error.detail().contains("unit-test-credential"));
        assertEquals("should-not-be-read", seenKey.get());

        Reply priced = new Reply("openai", "gpt-4o-mini", "ok", OpenAiChatProvider.estimate("gpt-4o-mini", 1_000_000, 1_000_000));
        assertEquals(0.75d, priced.usage().estimatedUsd());
        assertNull(OpenAiChatProvider.estimate("gpt-4o-mini", null, null));
    }

    @Test
    void personalityPromptIsSeparateFromTheProviderCode() {
        Personality personality = new Personality();
        assertTrue(personality.prompt().contains("EVA"));
        assertTrue(personality.prompt().toLowerCase().contains("not pretend to be human")
                || personality.prompt().toLowerCase().contains("do not pretend to be human"));
        assertFalse(personality.prompt().contains("System.getenv"));
    }

    private static final class RecordingHttp implements ModelHttp {
        private final List<String> paths = new ArrayList<>();
        private final List<String> bodies = new ArrayList<>();
        private Response next;
        private ConversationException failure;

        @Override
        public Response exchange(Request request, CancelToken cancel) {
            paths.add(request.uri().getPath());
            bodies.add(request.body());
            if (failure != null) {
                throw failure;
            }
            return next;
        }
    }

    @SuppressWarnings("unused")
    private static List<ChatMessage> ignore(List<ChatMessage> messages) {
        return messages;
    }
}
