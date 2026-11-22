package dev.karimajed.eva.conversation.openai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import dev.karimajed.eva.conversation.CancelToken;
import dev.karimajed.eva.conversation.ConversationException;
import dev.karimajed.eva.conversation.ConversationModels.ChatTurn;
import dev.karimajed.eva.conversation.ConversationModels.ModelChoice;
import dev.karimajed.eva.conversation.ConversationModels.Reply;
import dev.karimajed.eva.conversation.ConversationModels.Usage;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.openai.OpenAiChatModel;
import dev.langchain4j.model.openai.OpenAiChatModelName;
import dev.langchain4j.model.openai.OpenAiChatRequestParameters;
import dev.langchain4j.model.openai.OpenAiTokenUsage;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

class OpenAiLunaTest {

    @Test
    void catalogKeepsExistingModelsAndAddsLuna() {
        List<String> ids = new OpenAiChatProvider(null, false).describe().models().stream()
                .map(ModelChoice::id)
                .toList();
        assertEquals(List.of("gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-6-luna"), ids);
        assertEquals("gpt-6-luna", OpenAiChatModelName.GPT_6_LUNA.toString());
    }

    @Test
    void lunaUsesStandardProcessingRatesAndExistingRatesStay() {
        Usage luna = OpenAiChatProvider.estimate("gpt-6-luna", 1_000_000, 1_000_000);
        assertEquals(0.60d, luna.estimatedUsd(), 0.0000001d);
        Usage mini = OpenAiChatProvider.estimate("gpt-4o-mini", 1_000_000, 1_000_000);
        assertEquals(0.75d, mini.estimatedUsd(), 0.0000001d);
        assertNull(OpenAiChatProvider.estimate("gpt-6-luna", null, null));
    }

    @Test
    void reasoningTokensAreBilledWhenReportedBeyondTheCompletionCount() {
        OpenAiTokenUsage included = OpenAiTokenUsage.builder()
                .inputTokenCount(1_000)
                .outputTokenCount(50)
                .outputTokensDetails(OpenAiTokenUsage.OutputTokensDetails.builder().reasoningTokens(40).build())
                .build();
        assertEquals(50, OpenAiChatProvider.billedCompletionTokens(included));

        OpenAiTokenUsage separate = OpenAiTokenUsage.builder()
                .inputTokenCount(1_000)
                .outputTokenCount(10)
                .outputTokensDetails(OpenAiTokenUsage.OutputTokensDetails.builder().reasoningTokens(40).build())
                .build();
        assertEquals(50, OpenAiChatProvider.billedCompletionTokens(separate));
        Usage priced = OpenAiChatProvider.estimate("gpt-6-luna", 1_000, 50);
        assertEquals(1_000, priced.promptTokens());
        assertEquals(50, priced.completionTokens());
        assertEquals((1_000 * 0.10d + 50 * 0.50d) / 1_000_000d, priced.estimatedUsd(), 0.0000001d);

        OpenAiTokenUsage reasoningOnly = OpenAiTokenUsage.builder()
                .outputTokensDetails(OpenAiTokenUsage.OutputTokensDetails.builder().reasoningTokens(40).build())
                .build();
        assertEquals(40, OpenAiChatProvider.billedCompletionTokens(reasoningOnly));
        assertNull(OpenAiChatProvider.billedCompletionTokens(null));
    }

    @Test
    void lunaRequestsReasoningEffortNoneAndExistingModelsDoNot() {
        OpenAiChatModel luna = OpenAiChatProvider.chatModel("unit-test-credential", "gpt-6-luna");
        ChatRequest request = ChatRequest.builder()
                .messages(List.of(UserMessage.from("Hi")))
                .build();
        OpenAiChatRequestParameters lunaParameters = OpenAiChatProvider.requestParameters(luna, request);
        assertEquals("gpt-6-luna", lunaParameters.modelName());
        assertEquals("none", lunaParameters.reasoningEffort());

        OpenAiChatModel mini = OpenAiChatProvider.chatModel("unit-test-credential", "gpt-4o-mini");
        OpenAiChatRequestParameters miniParameters = OpenAiChatProvider.requestParameters(mini, request);
        assertEquals("gpt-4o-mini", miniParameters.modelName());
        assertNull(miniParameters.reasoningEffort());

        OpenAiChatModel full = OpenAiChatProvider.chatModel("unit-test-credential", "gpt-4o");
        assertNull(OpenAiChatProvider.requestParameters(full, request).reasoningEffort());
        OpenAiChatModel later = OpenAiChatProvider.chatModel("unit-test-credential", "gpt-4.1-mini");
        assertNull(OpenAiChatProvider.requestParameters(later, request).reasoningEffort());
    }

    @Test
    void lunaCompletesThroughTheCatalogWithoutCallingOpenAi() {
        AtomicReference<String> seen = new AtomicReference<>();
        OpenAiChatProvider provider = new OpenAiChatProvider((model, messages, cancel) -> {
            seen.set(model);
            return new OpenAiChatProvider.CloudResult("saved", 1_000_000, 1_000_000);
        }, true);
        Reply reply = provider.complete(
                List.of(new ChatTurn("user", "Hi")),
                "gpt-6-luna",
                "You are EVA.",
                new CancelToken());
        assertEquals("gpt-6-luna", seen.get());
        assertEquals(0.60d, reply.usage().estimatedUsd(), 0.0000001d);

        ConversationException unknown = assertThrows(ConversationException.class, () -> provider.complete(
                List.of(new ChatTurn("user", "Hi")),
                "gpt-6-luna-preview",
                "You are EVA.",
                new CancelToken()));
        assertEquals("invalid", unknown.code());
        assertEquals("gpt-6-luna", seen.get());

        OpenAiChatProvider unconfigured = new OpenAiChatProvider(null, false);
        ConversationException missing = assertThrows(ConversationException.class, () -> unconfigured.complete(
                List.of(new ChatTurn("user", "Hi")),
                "gpt-6-luna",
                "You are EVA.",
                new CancelToken()));
        assertEquals("credentials", missing.code());
        assertFalse(missing.detail().contains("unit-test-credential"));
    }
}
