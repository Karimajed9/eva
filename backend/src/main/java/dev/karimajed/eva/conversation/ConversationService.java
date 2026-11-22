package dev.karimajed.eva.conversation;

import dev.karimajed.eva.conversation.ConversationModels.ChatTurn;
import dev.karimajed.eva.conversation.ConversationModels.ProviderId;
import dev.karimajed.eva.conversation.ConversationModels.ProviderStatus;
import dev.karimajed.eva.conversation.ConversationModels.Reply;
import dev.karimajed.eva.conversation.ConversationModels.SendCommand;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

@Service
public class ConversationService {

    static final int MAX_TEXT = 4_000;
    static final int MAX_MESSAGES = 16;
    static final int MAX_CONTEXT_CHARS = 8_000;
    private static final Pattern MODEL_ID = Pattern.compile("[A-Za-z0-9_.:-]{1,80}");

    private final Map<ProviderId, ChatProvider> providers;
    private final Personality personality;
    private final List<ChatTurn> history = new ArrayList<>();
    private final AtomicReference<CancelToken> inFlight = new AtomicReference<>();
    private int generation;

    public ConversationService(List<ChatProvider> providers, Personality personality) {
        Map<ProviderId, ChatProvider> indexed = new EnumMap<>(ProviderId.class);
        for (ChatProvider provider : providers) {
            indexed.put(provider.id(), provider);
        }
        if (!indexed.containsKey(ProviderId.OLLAMA) || !indexed.containsKey(ProviderId.OPENAI)) {
            throw new IllegalStateException("EVA needs both the local and cloud conversation providers.");
        }
        this.providers = Map.copyOf(indexed);
        this.personality = personality;
    }

    public synchronized Catalog catalog() {
        return new Catalog(List.copyOf(history), List.of(
                providers.get(ProviderId.OLLAMA).describe(),
                providers.get(ProviderId.OPENAI).describe()));
    }

    public Reply send(SendCommand command) {
        ProviderId providerId = validate(command);
        if (providerId == ProviderId.OPENAI && !command.cloudEnabled()) {
            throw new ConversationException("cloud-denied", 403, "Cloud mode is off. Nothing was sent.");
        }
        ChatProvider provider = providers.get(providerId);
        ProviderStatus described = provider.describe();
        if (providerId == ProviderId.OLLAMA && !described.reachable()) {
            throw new ConversationException("unavailable", 503, described.detail());
        }
        if (providerId == ProviderId.OPENAI && !described.configured()) {
            throw new ConversationException("credentials", 503, described.detail());
        }
        if (described.models().stream().noneMatch(model -> model.id().equals(command.model()))) {
            throw new ConversationException("model-missing", 404, described.reachable()
                    ? "That model is not available. EVA will not choose another one."
                    : described.detail());
        }
        CancelToken cancel = new CancelToken();
        if (!inFlight.compareAndSet(null, cancel)) {
            throw new ConversationException("busy", 409, "A reply is already in progress.");
        }
        int epoch;
        List<ChatTurn> request;
        String text = command.text().strip();
        synchronized (this) {
            epoch = generation;
            request = new ArrayList<>(history);
            request.add(new ChatTurn("user", text));
        }
        try {
            Reply reply = provider.complete(request, command.model(), personality.prompt(), cancel);
            if (cancel.isCancelled() || reply == null || reply.text() == null || reply.text().isBlank()
                    || !providerId.wire().equals(reply.provider())) {
                throw new ConversationException("provider-error", 502, "The selected provider did not answer.");
            }
            synchronized (this) {
                if (cancel.isCancelled() || epoch != generation) {
                    throw new ConversationException("cancelled", 409, "The reply was cancelled.");
                }
                history.add(new ChatTurn("user", text));
                history.add(new ChatTurn("assistant", reply.text().strip()));
                trim();
            }
            return reply;
        } finally {
            inFlight.compareAndSet(cancel, null);
        }
    }

    public synchronized void reset() {
        cancel();
        history.clear();
        generation++;
    }

    public void cancel() {
        CancelToken current = inFlight.get();
        if (current != null) {
            current.cancel();
        }
    }

    private ProviderId validate(SendCommand command) {
        if (command == null || command.text() == null || command.provider() == null || command.model() == null) {
            throw new ConversationException("invalid", 400, "The message is missing a provider, model, or text.");
        }
        String text = command.text().strip();
        if (text.isEmpty() || text.length() > MAX_TEXT) {
            throw new ConversationException("invalid", 400, "Messages must be between 1 and 4000 characters.");
        }
        ProviderId providerId = ProviderId.fromWire(command.provider());
        if (providerId == null || !MODEL_ID.matcher(command.model()).matches()) {
            throw new ConversationException("invalid", 400, "The provider or model is not valid.");
        }
        return providerId;
    }

    private void trim() {
        while (history.size() > MAX_MESSAGES || chars(history) > MAX_CONTEXT_CHARS) {
            if (history.isEmpty()) {
                return;
            }
            history.remove(0);
        }
    }

    private static int chars(List<ChatTurn> turns) {
        int total = 0;
        for (ChatTurn turn : turns) {
            total += turn.text().length();
        }
        return total;
    }

    public record Catalog(List<ChatTurn> messages, List<ProviderStatus> providers) {
    }
}
