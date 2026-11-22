package dev.karimajed.eva.conversation.ollama;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.karimajed.eva.conversation.CancelToken;
import dev.karimajed.eva.conversation.ChatProvider;
import dev.karimajed.eva.conversation.ConversationException;
import dev.karimajed.eva.conversation.ConversationModels.ChatTurn;
import dev.karimajed.eva.conversation.ConversationModels.ModelChoice;
import dev.karimajed.eva.conversation.ConversationModels.ProviderId;
import dev.karimajed.eva.conversation.ConversationModels.ProviderStatus;
import dev.karimajed.eva.conversation.ConversationModels.Reply;
import dev.karimajed.eva.conversation.ConversationModels.Usage;
import dev.karimajed.eva.conversation.ModelHttp;
import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class OllamaChatProvider implements ChatProvider {

    static final Duration DISCOVERY_TIMEOUT = Duration.ofMillis(800);
    static final Duration CHAT_TIMEOUT = Duration.ofSeconds(90);

    private final ModelHttp http;
    private final ObjectMapper json = new ObjectMapper();
    private final URI base;

    public OllamaChatProvider(ModelHttp http, @Value("${EVA_OLLAMA_BASE_URL:http://127.0.0.1:11434}") String baseUrl) {
        this.http = http;
        this.base = requireLoopback(baseUrl);
    }

    @Override
    public ProviderId id() {
        return ProviderId.OLLAMA;
    }

    @Override
    public ProviderStatus describe() {
        try {
            ModelHttp.Response response = http.exchange(new ModelHttp.Request(
                    "GET",
                    base.resolve("/api/tags"),
                    null,
                    DISCOVERY_TIMEOUT,
                    Map.of()), new CancelToken());
            if (response.status() != 200) {
                return status(false, "Ollama answered with an unexpected status.", List.of());
            }
            List<ModelChoice> models = modelNames(json.readTree(response.body()));
            if (models.isEmpty()) {
                return status(true, "Ollama is running and has no installed models. EVA will not download one.", List.of());
            }
            return status(true, "Local models stay on this machine.", models);
        } catch (ConversationException exception) {
            return status(false, "Ollama is not running at " + base + ". EVA will not download a model.", List.of());
        } catch (Exception exception) {
            return status(false, "Ollama is not running at " + base + ". EVA will not download a model.", List.of());
        }
    }

    @Override
    public Reply complete(List<ChatTurn> history, String model, String systemPrompt, CancelToken cancel) {
        ObjectNode body = json.createObjectNode();
        body.put("model", model);
        body.put("stream", false);
        ArrayNode messages = body.putArray("messages");
        messages.addObject().put("role", "system").put("content", systemPrompt);
        for (ChatTurn turn : history) {
            messages.addObject().put("role", turn.role()).put("content", turn.text());
        }
        ModelHttp.Response response = http.exchange(new ModelHttp.Request(
                "POST",
                base.resolve("/api/chat"),
                body.toString(),
                CHAT_TIMEOUT,
                Map.of()), cancel);
        if (response.status() == 404) {
            throw new ConversationException("model-missing", 404, "That model is not installed in local Ollama. EVA will not download it.");
        }
        if (response.status() != 200) {
            throw new ConversationException("provider-error", 502, "Ollama rejected the request.");
        }
        try {
            JsonNode root = json.readTree(response.body());
            String text = root.path("message").path("content").asText("").strip();
            if (text.isEmpty()) {
                throw new ConversationException("provider-error", 502, "Ollama returned an empty reply.");
            }
            Usage usage = usageOf(root);
            return new Reply(ProviderId.OLLAMA.wire(), model, text, usage);
        } catch (ConversationException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new ConversationException("provider-error", 502, "Ollama returned a response EVA could not read.");
        }
    }

    static List<ModelChoice> modelNames(JsonNode root) {
        List<ModelChoice> models = new ArrayList<>();
        for (JsonNode model : root.path("models")) {
            String name = model.path("name").asText("").strip();
            if (!name.isEmpty() && name.length() <= 80) {
                models.add(new ModelChoice(name, name));
            }
        }
        return List.copyOf(models);
    }

    private static Usage usageOf(JsonNode root) {
        if (!root.has("prompt_eval_count") && !root.has("eval_count")) {
            return null;
        }
        int prompt = root.path("prompt_eval_count").asInt(0);
        int completion = root.path("eval_count").asInt(0);
        return new Usage(prompt, completion, null);
    }

    private static ProviderStatus status(boolean reachable, String detail, List<ModelChoice> models) {
        return new ProviderStatus("ollama", "Ollama", true, reachable, true, detail, models);
    }

    static URI requireLoopback(String baseUrl) {
        URI uri;
        try {
            uri = URI.create(baseUrl == null ? "" : baseUrl.trim());
        } catch (IllegalArgumentException exception) {
            throw new IllegalStateException("EVA_OLLAMA_BASE_URL must be a loopback HTTP address.");
        }
        String host = uri.getHost() == null ? "" : uri.getHost();
        boolean loopback = "127.0.0.1".equals(host) || "localhost".equalsIgnoreCase(host) || "::1".equals(host);
        if (!"http".equalsIgnoreCase(uri.getScheme()) || !loopback || uri.getUserInfo() != null) {
            throw new IllegalStateException("EVA_OLLAMA_BASE_URL must be a loopback HTTP address.");
        }
        if (!uri.getPath().isEmpty() && !"/".equals(uri.getPath())) {
            throw new IllegalStateException("EVA_OLLAMA_BASE_URL must not include a path.");
        }
        String text = uri.toString();
        if (text.endsWith("/")) {
            return uri;
        }
        return URI.create(text + "/");
    }
}
