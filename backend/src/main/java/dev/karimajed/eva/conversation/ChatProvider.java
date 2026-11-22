package dev.karimajed.eva.conversation;

import dev.karimajed.eva.conversation.ConversationModels.ChatTurn;
import dev.karimajed.eva.conversation.ConversationModels.ProviderId;
import dev.karimajed.eva.conversation.ConversationModels.ProviderStatus;
import dev.karimajed.eva.conversation.ConversationModels.Reply;
import java.util.List;
import java.util.function.Consumer;

public interface ChatProvider {

    ProviderId id();

    ProviderStatus describe();

    Reply stream(List<ChatTurn> history, String model, String systemPrompt, CancelToken cancel, Consumer<String> onDelta);
}
