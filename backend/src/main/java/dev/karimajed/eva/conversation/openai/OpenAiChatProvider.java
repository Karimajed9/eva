package dev.karimajed.eva.conversation.openai;

import dev.karimajed.eva.conversation.CancelToken;
import dev.karimajed.eva.conversation.ChatProvider;
import dev.karimajed.eva.conversation.ConversationException;
import dev.karimajed.eva.conversation.ConversationModels.ChatTurn;
import dev.karimajed.eva.conversation.ConversationModels.ModelChoice;
import dev.karimajed.eva.conversation.ConversationModels.ProviderId;
import dev.karimajed.eva.conversation.ConversationModels.ProviderStatus;
import dev.karimajed.eva.conversation.ConversationModels.Reply;
import dev.karimajed.eva.conversation.ConversationModels.Usage;
import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.data.message.SystemMessage;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.exception.AuthenticationException;
import dev.langchain4j.exception.RateLimitException;
import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.model.openai.OpenAiChatModel;
import dev.langchain4j.model.output.TokenUsage;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class OpenAiChatProvider implements ChatProvider {

    static final List<ModelChoice> MODELS = List.of(
            new ModelChoice("gpt-4o-mini", "GPT-4o mini"),
            new ModelChoice("gpt-4o", "GPT-4o"),
            new ModelChoice("gpt-4.1-mini", "GPT-4.1 mini"));

    static final Map<String, double[]> ESTIMATE_PER_MILLION = Map.of(
            "gpt-4o-mini", new double[] {0.15, 0.60},
            "gpt-4o", new double[] {2.50, 10.00},
            "gpt-4.1-mini", new double[] {0.40, 1.60});

    private final CloudClient client;
    private final boolean configured;

    @org.springframework.beans.factory.annotation.Autowired
    public OpenAiChatProvider(dev.karimajed.eva.security.OpenAiCredential credentials) {
        this(credentials.configured() ? new LangChainCloudClient(credentials.value()) : null, credentials.configured());
    }

    public OpenAiChatProvider(CloudClient client, boolean configured) {
        this.client = client;
        this.configured = configured;
    }

    @Override
    public ProviderId id() {
        return ProviderId.OPENAI;
    }

    @Override
    public ProviderStatus describe() {
        if (!configured) {
            return new ProviderStatus(
                    "openai",
                    "OpenAI",
                    false,
                    false,
                    false,
                    "No OpenAI key is configured. Set EVA_OPENAI_API_KEY on the desktop process. The key stays out of the window.",
                    MODELS);
        }
        return new ProviderStatus(
                "openai",
                "OpenAI",
                false,
                true,
                true,
                "Cloud replies leave this machine only after you turn cloud mode on.",
                MODELS);
    }

    @Override
    public Reply complete(List<ChatTurn> history, String model, String systemPrompt, CancelToken cancel) {
        if (!configured || client == null) {
            throw new ConversationException("credentials", 503, "OpenAI is not configured. Nothing was sent.");
        }
        if (MODELS.stream().noneMatch(choice -> choice.id().equals(model))) {
            throw new ConversationException("invalid", 400, "That cloud model is not configured.");
        }
        if (cancel.isCancelled()) {
            throw new ConversationException("cancelled", 409, "The reply was cancelled.");
        }
        List<ChatMessage> messages = new ArrayList<>();
        messages.add(SystemMessage.from(systemPrompt));
        for (ChatTurn turn : history) {
            if ("assistant".equals(turn.role())) {
                messages.add(AiMessage.from(turn.text()));
            } else {
                messages.add(UserMessage.from(turn.text()));
            }
        }
        try {
            CloudResult result = client.complete(model, messages, cancel);
            String text = result.text() == null ? "" : result.text().strip();
            if (text.isEmpty()) {
                throw new ConversationException("provider-error", 502, "OpenAI returned an empty reply.");
            }
            return new Reply("openai", model, text, estimate(model, result.promptTokens(), result.completionTokens()));
        } catch (ConversationException exception) {
            throw exception;
        } catch (RateLimitException exception) {
            throw new ConversationException("rate-limited", 429, "OpenAI rate limit. Wait and try again. Nothing was sent to another provider.");
        } catch (AuthenticationException exception) {
            throw new ConversationException("credentials", 401, "OpenAI rejected the configured key. Nothing else was tried.");
        } catch (RuntimeException exception) {
            throw new ConversationException("provider-error", 502, safeFailure(exception));
        }
    }

    public static Usage estimate(String model, Integer promptTokens, Integer completionTokens) {
        if (promptTokens == null && completionTokens == null) {
            return null;
        }
        int prompt = promptTokens == null ? 0 : promptTokens;
        int completion = completionTokens == null ? 0 : completionTokens;
        double[] rates = ESTIMATE_PER_MILLION.get(model);
        Double usd = null;
        if (rates != null) {
            usd = (prompt * rates[0] + completion * rates[1]) / 1_000_000d;
        }
        return new Usage(prompt, completion, usd);
    }

    static String safeFailure(RuntimeException exception) {
        return "OpenAI did not complete the reply.";
    }

    public interface CloudClient {
        CloudResult complete(String model, List<ChatMessage> messages, CancelToken cancel);
    }

    public record CloudResult(String text, Integer promptTokens, Integer completionTokens) {
    }

    static final class LangChainCloudClient implements CloudClient {

        private final String apiKey;

        LangChainCloudClient(String apiKey) {
            this.apiKey = apiKey;
        }

        @Override
        public CloudResult complete(String model, List<ChatMessage> messages, CancelToken cancel) {
            if (cancel.isCancelled()) {
                throw new ConversationException("cancelled", 409, "The reply was cancelled.");
            }
            ChatModel chat = OpenAiChatModel.builder()
                    .apiKey(apiKey)
                    .modelName(model)
                    .timeout(Duration.ofSeconds(45))
                    .maxRetries(0)
                    .logRequests(false)
                    .logResponses(false)
                    .build();
            ChatResponse response = chat.chat(ChatRequest.builder().messages(messages).build());
            if (cancel.isCancelled()) {
                throw new ConversationException("cancelled", 409, "The reply was cancelled.");
            }
            TokenUsage usage = response.tokenUsage();
            String text = response.aiMessage() == null ? "" : response.aiMessage().text();
            Integer prompt = usage == null ? null : usage.inputTokenCount();
            Integer completion = usage == null ? null : usage.outputTokenCount();
            return new CloudResult(text, prompt, completion);
        }
    }
}
