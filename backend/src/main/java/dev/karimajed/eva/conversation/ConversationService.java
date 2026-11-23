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
import java.util.function.Consumer;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

@Service
public class ConversationService {

    static final int MAX_TEXT = 4_000;
    static final int MAX_MESSAGES = 16;
    static final int MAX_CONTEXT_CHARS = 8_000;
    static final int MAX_REPLY = 8_000;
    private static final Pattern MODEL_ID = Pattern.compile("[A-Za-z0-9_.:-]{1,80}");

    private final Map<ProviderId, ChatProvider> providers;
    private final Personality personality;
    private final List<ChatTurn> history = new ArrayList<>();
    private final AtomicReference<CancelToken> inFlight = new AtomicReference<>();
    private final StringBuilder activePartial = new StringBuilder();
    private String activeUserText = "";
    private int activeEpoch = -1;
    private boolean activeOpen;
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
        return send(command, ignored -> {
        });
    }

    public Prepared prepare(SendCommand command) {
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
        int epoch;
        List<ChatTurn> request;
        String text = command.text().strip();
        synchronized (this) {
            if (!inFlight.compareAndSet(null, cancel)) {
                throw new ConversationException("busy", 409, "A reply is already in progress.");
            }
            epoch = generation;
            request = modelContext();
            request.add(new ChatTurn("user", text));
            activeUserText = text;
            activePartial.setLength(0);
            activeEpoch = epoch;
            activeOpen = true;
        }
        return new Prepared(provider, providerId, cancel, epoch, request, text, command.model());
    }

    /**
     * Stopped assistant text stays in the transcript the window shows.
     * It is not a completed reply, and it is left out of the next model request.
     * The user question from that turn is included.
     */
    private List<ChatTurn> modelContext() {
        List<ChatTurn> context = new ArrayList<>();
        for (ChatTurn turn : history) {
            if (turn.stopped() && "assistant".equals(turn.role())) {
                continue;
            }
            context.add(new ChatTurn(turn.role(), turn.text()));
        }
        return context;
    }

    public Reply send(SendCommand command, Consumer<String> onDelta) {
        Prepared prepared = prepare(command);
        return emit(prepared, onDelta);
    }

    public Reply emit(Prepared prepared, Consumer<String> onDelta) {
        try {
            if (prepared.cancel().isCancelled()) {
                throw new ConversationException("cancelled", 409, "The reply was cancelled.");
            }
            Reply reply = prepared.provider().stream(
                    prepared.request(),
                    prepared.model(),
                    personality.prompt(),
                    prepared.cancel(),
                    piece -> acceptDelta(prepared, piece, onDelta));
            if (!currentTurn(prepared)) {
                throw new ConversationException("cancelled", 409, "The reply was cancelled.");
            }
            if (reply == null || reply.text() == null || reply.text().isBlank()
                    || !prepared.providerId().wire().equals(reply.provider())) {
                throw new ConversationException("provider-error", 502, "The selected provider did not answer.");
            }
            String text = reply.text().strip();
            if (text.length() > MAX_REPLY) {
                throw new ConversationException("provider-error", 502, "The reply was longer than EVA can keep.");
            }
            synchronized (this) {
                if (!currentTurn(prepared)) {
                    throw new ConversationException("cancelled", 409, "The reply was cancelled.");
                }
                history.add(new ChatTurn("user", prepared.text()));
                history.add(new ChatTurn("assistant", text));
                activeOpen = false;
                activePartial.setLength(0);
                trim();
            }
            return new Reply(reply.provider(), reply.model(), text, reply.usage());
        } catch (ConversationException exception) {
            synchronized (this) {
                if ("cancelled".equals(exception.code()) && currentTurn(prepared)) {
                    keepStoppedTurn();
                } else if (currentTurn(prepared)) {
                    activeOpen = false;
                    activePartial.setLength(0);
                }
            }
            throw exception;
        } finally {
            synchronized (this) {
                inFlight.compareAndSet(prepared.cancel(), null);
            }
        }
    }

    public void reset() {
        CancelToken current;
        synchronized (this) {
            current = inFlight.getAndSet(null);
            activeOpen = false;
            activePartial.setLength(0);
            history.clear();
            generation++;
        }
        if (current != null) {
            current.cancel();
        }
    }

    public void cancel() {
        CancelToken current;
        synchronized (this) {
            current = inFlight.get();
            if (activeOpen) {
                keepStoppedTurn();
            }
            if (current != null) {
                inFlight.compareAndSet(current, null);
            }
        }
        if (current != null) {
            current.cancel();
        }
    }

    private void acceptDelta(Prepared prepared, String piece, Consumer<String> onDelta) {
        if (piece == null || piece.isEmpty()) {
            return;
        }
        synchronized (this) {
            if (!currentTurn(prepared)) {
                throw new ConversationException("cancelled", 409, "The reply was cancelled.");
            }
            if (activePartial.length() + piece.length() > MAX_REPLY) {
                prepared.cancel().cancel();
                activeOpen = false;
                activePartial.setLength(0);
                throw new ConversationException("provider-error", 502, "The reply was longer than EVA can keep.");
            }
            activePartial.append(piece);
        }
        onDelta.accept(piece);
    }

    private boolean currentTurn(Prepared prepared) {
        return activeOpen && prepared.epoch() == activeEpoch && !prepared.cancel().isCancelled();
    }

    private void keepStoppedTurn() {
        if (!activeOpen) {
            return;
        }
        activeOpen = false;
        generation++;
        String partial = activePartial.toString();
        activePartial.setLength(0);
        if (partial.isBlank()) {
            history.add(new ChatTurn("user", activeUserText, ChatTurn.STOPPED));
        } else {
            history.add(new ChatTurn("user", activeUserText));
            history.add(new ChatTurn("assistant", partial, ChatTurn.STOPPED));
        }
        trim();
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

    public record Prepared(
            ChatProvider provider,
            ProviderId providerId,
            CancelToken cancel,
            int epoch,
            List<ChatTurn> request,
            String text,
            String model) {
    }
}
