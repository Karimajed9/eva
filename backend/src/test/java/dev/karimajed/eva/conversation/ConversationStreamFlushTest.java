package dev.karimajed.eva.conversation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.karimajed.eva.conversation.ConversationModels.ProviderId;
import dev.karimajed.eva.conversation.ConversationModels.Reply;
import dev.karimajed.eva.conversation.ConversationModels.Usage;
import dev.karimajed.eva.support.TestTokens;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.function.Consumer;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "eva.session-token=" + TestTokens.SESSION,
                "logging.level.root=WARN"
        })
class ConversationStreamFlushTest {

    private static final long GAP_MS = 500;
    private static final ObjectMapper JSON = new ObjectMapper();

    @LocalServerPort
    private int port;

    @MockitoBean
    private ConversationService conversations;

    @Test
    void eachDeltaLeavesTheServerBeforeTheNextChunkIsProduced() throws Exception {
        when(conversations.prepare(any())).thenReturn(new ConversationService.Prepared(
                null,
                ProviderId.OLLAMA,
                new CancelToken(),
                0,
                List.of(),
                "hi",
                "slow-model"));
        when(conversations.emit(any(), any())).thenAnswer(invocation -> {
            @SuppressWarnings("unchecked")
            Consumer<String> onDelta = invocation.getArgument(1);
            onDelta.accept("alpha");
            Thread.sleep(GAP_MS);
            onDelta.accept("beta");
            return new Reply("ollama", "slow-model", "alphabeta", new Usage(3, 2, null));
        });

        HttpResponse<InputStream> response = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(3))
                .build()
                .send(request(), HttpResponse.BodyHandlers.ofInputStream());
        assertEquals(200, response.statusCode());

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(response.body(), StandardCharsets.UTF_8))) {
            long firstRead = System.nanoTime();
            JsonNode first = JSON.readTree(reader.readLine());
            long afterFirst = System.nanoTime();
            JsonNode second = JSON.readTree(reader.readLine());
            long afterSecond = System.nanoTime();
            JsonNode done = JSON.readTree(reader.readLine());

            assertEquals("delta", first.path("type").asText());
            assertEquals(1, first.path("seq").asInt());
            assertEquals("alpha", first.path("text").asText());
            assertEquals("delta", second.path("type").asText());
            assertEquals(2, second.path("seq").asInt());
            assertEquals("beta", second.path("text").asText());
            assertEquals("done", done.path("type").asText());
            assertEquals("alphabeta", done.path("text").asText());
            long gapMs = (afterSecond - afterFirst) / 1_000_000;
            assertTrue(gapMs >= GAP_MS - 150,
                    "the second delta arrived with the first (gap " + gapMs + "ms, first read at "
                            + ((afterFirst - firstRead) / 1_000_000) + "ms)");
        }
    }

    private HttpRequest request() {
        return HttpRequest.newBuilder()
                .uri(URI.create("http://127.0.0.1:" + port + "/api/conversation"))
                .timeout(Duration.ofSeconds(10))
                .header("Authorization", "Bearer " + TestTokens.SESSION)
                .header("Accept", "application/x-ndjson")
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(
                        "{\"provider\":\"ollama\",\"model\":\"slow-model\",\"cloudEnabled\":false,\"text\":\"hi\"}"))
                .build();
    }
}
