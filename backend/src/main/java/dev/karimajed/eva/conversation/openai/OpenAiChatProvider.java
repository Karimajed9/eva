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
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.model.chat.response.PartialResponse;
import dev.langchain4j.model.chat.response.PartialResponseContext;
import dev.langchain4j.model.chat.response.StreamingChatResponseHandler;
import dev.langchain4j.model.chat.response.StreamingHandle;
import dev.langchain4j.model.openai.OpenAiChatModel;
import dev.langchain4j.model.openai.OpenAiChatRequestParameters;
import dev.langchain4j.model.openai.OpenAiStreamingChatModel;
import dev.langchain4j.model.openai.OpenAiTokenUsage;
import dev.langchain4j.model.output.TokenUsage;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;
import org.springframework.stereotype.Component;

@Component
public class OpenAiChatProvider implements ChatProvider {

    static final String LUNA = "gpt-6-luna";

    static final List<ModelChoice> MODELS = List.of(
            new ModelChoice("gpt-4o-mini", "GPT-4o mini"),
            new ModelChoice("gpt-4o", "GPT-4o"),
            new ModelChoice("gpt-4.1-mini", "GPT-4.1 mini"),
            new ModelChoice(LUNA, "GPT-6 Luna"));

    static final Map<String, double[]> ESTIMATE_PER_MILLION = Map.of(
            "gpt-4o-mini", new double[] {0.15, 0.60},
            "gpt-4o", new double[] {2.50, 10.00},
            "gpt-4.1-mini", new double[] {0.40, 1.60},
            LUNA, new double[] {0.10, 0.50});

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
    public Reply stream(List<ChatTurn> history, String model, String systemPrompt, CancelToken cancel, Consumer<String> onDelta) {
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
            CloudResult result = client.stream(model, messages, cancel, onDelta);
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

    /**
     * Completion tokens from the Chat Completions API already include reasoning tokens.
     * When the reported reasoning count is larger than the completion count, the reasoning
     * tokens were reported separately and are added so the estimate bills them.
     */
    static Integer billedCompletionTokens(TokenUsage usage) {
        if (usage == null) {
            return null;
        }
        Integer completion = usage.outputTokenCount();
        Integer reasoning = reasoningTokens(usage);
        if (reasoning == null) {
            return completion;
        }
        int visible = completion == null ? 0 : completion;
        if (reasoning > visible) {
            return visible + reasoning;
        }
        return completion == null ? reasoning : completion;
    }

    private static Integer reasoningTokens(TokenUsage usage) {
        if (!(usage instanceof OpenAiTokenUsage openAi) || openAi.outputTokensDetails() == null) {
            return null;
        }
        return openAi.outputTokensDetails().reasoningTokens();
    }

    static OpenAiChatModel chatModel(String apiKey, String model) {
        OpenAiChatModel.OpenAiChatModelBuilder builder = OpenAiChatModel.builder()
                .apiKey(apiKey)
                .modelName(model)
                .timeout(Duration.ofSeconds(45))
                .maxRetries(0)
                .logRequests(false)
                .logResponses(false);
        if (LUNA.equals(model)) {
            builder.reasoningEffort("none");
        }
        return builder.build();
    }

    static OpenAiStreamingChatModel streamingModel(String apiKey, String model) {
        OpenAiStreamingChatModel.OpenAiStreamingChatModelBuilder builder = OpenAiStreamingChatModel.builder()
                .apiKey(apiKey)
                .modelName(model)
                .timeout(Duration.ofSeconds(45))
                .logRequests(false)
                .logResponses(false);
        if (LUNA.equals(model)) {
            builder.reasoningEffort("none");
        }
        return builder.build();
    }

    static OpenAiChatRequestParameters requestParameters(OpenAiChatModel model, ChatRequest request) {
        return merged(model.defaultRequestParameters(), request);
    }

    static OpenAiChatRequestParameters requestParameters(OpenAiStreamingChatModel model, ChatRequest request) {
        return merged(model.defaultRequestParameters(), request);
    }

    private static OpenAiChatRequestParameters merged(OpenAiChatRequestParameters defaults, ChatRequest request) {
        return (OpenAiChatRequestParameters) defaults.overrideWith(request.parameters());
    }

    static String safeFailure(RuntimeException exception) {
        return "OpenAI did not complete the reply.";
    }

    public interface CloudClient {
        CloudResult stream(String model, List<ChatMessage> messages, CancelToken cancel, Consumer<String> onDelta);
    }

    public record CloudResult(String text, Integer promptTokens, Integer completionTokens) {
    }

    static final class LangChainCloudClient implements CloudClient {

        private final String apiKey;

        LangChainCloudClient(String apiKey) {
            this.apiKey = apiKey;
        }

        @Override
        public CloudResult stream(String model, List<ChatMessage> messages, CancelToken cancel, Consumer<String> onDelta) {
            if (cancel.isCancelled()) {
                throw new ConversationException("cancelled", 409, "The reply was cancelled.");
            }
            OpenAiStreamingChatModel chat = streamingModel(apiKey, model);
            CompletableFuture<CloudResult> done = new CompletableFuture<>();
            AtomicReference<StreamingHandle> handle = new AtomicReference<>();
            cancel.onCancel(() -> {
                StreamingHandle current = handle.get();
                if (current != null) {
                    current.cancel();
                }
                done.completeExceptionally(new ConversationException("cancelled", 409, "The reply was cancelled."));
            });
            try {
                chat.chat(ChatRequest.builder().messages(messages).build(), new StreamingChatResponseHandler() {
                    @Override
                    public void onPartialResponse(PartialResponse partial, PartialResponseContext context) {
                        handle.set(context.streamingHandle());
                        if (cancel.isCancelled()) {
                            context.streamingHandle().cancel();
                            return;
                        }
                        String text = partial.text();
                        if (text != null && !text.isEmpty()) {
                            onDelta.accept(text);
                        }
                    }

                    @Override
                    public void onCompleteResponse(ChatResponse response) {
                        if (cancel.isCancelled()) {
                            done.completeExceptionally(new ConversationException("cancelled", 409, "The reply was cancelled."));
                            return;
                        }
                        TokenUsage usage = response.tokenUsage();
                        String text = response.aiMessage() == null ? "" : response.aiMessage().text();
                        Integer prompt = usage == null ? null : usage.inputTokenCount();
                        Integer completion = billedCompletionTokens(usage);
                        done.complete(new CloudResult(text, prompt, completion));
                    }

                    @Override
                    public void onError(Throwable error) {
                        if (cancel.isCancelled()) {
                            done.completeExceptionally(new ConversationException("cancelled", 409, "The reply was cancelled."));
                            return;
                        }
                        if (error instanceof RuntimeException runtime) {
                            done.completeExceptionally(runtime);
                            return;
                        }
                        done.completeExceptionally(new ConversationException("provider-error", 502, safeFailure(new IllegalStateException(error))));
                    }
                });
            } catch (RuntimeException exception) {
                if (!done.isDone()) {
                    done.completeExceptionally(exception);
                }
            }
            try {
                return done.get(46, TimeUnit.SECONDS);
            } catch (ExecutionException exception) {
                Throwable cause = exception.getCause() == null ? exception : exception.getCause();
                if (cause instanceof ConversationException failure) {
                    throw failure;
                }
                if (cause instanceof RateLimitException rateLimit) {
                    throw rateLimit;
                }
                if (cause instanceof AuthenticationException authentication) {
                    throw authentication;
                }
                if (cause instanceof RuntimeException runtime) {
                    throw runtime;
                }
                throw new ConversationException("provider-error", 502, safeFailure(new IllegalStateException(cause)));
            } catch (TimeoutException exception) {
                cancel.cancel();
                throw new ConversationException("unavailable", 503, "The model did not answer before the timeout.");
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                cancel.cancel();
                throw new ConversationException("cancelled", 409, "The reply was cancelled.");
            }
        }
    }
}
