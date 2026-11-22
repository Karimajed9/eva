package dev.karimajed.eva.conversation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.karimajed.eva.conversation.ConversationModels.ChatTurn;
import dev.karimajed.eva.conversation.ConversationModels.ModelChoice;
import dev.karimajed.eva.conversation.ConversationModels.ProviderId;
import dev.karimajed.eva.conversation.ConversationModels.ProviderStatus;
import dev.karimajed.eva.conversation.ConversationModels.Reply;
import dev.karimajed.eva.conversation.ConversationModels.SendCommand;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class ConversationServiceTest {

    @Test
    void selectsOnlyTheRequestedProviderAndKeepsContextUntilReset() {
        Fake ollama = new Fake(ProviderId.OLLAMA, true, true);
        Fake openai = new Fake(ProviderId.OPENAI, false, true);
        ConversationService service = service(ollama, openai);

        service.send(new SendCommand("ollama", "local-model", false, "Hello"));
        service.send(new SendCommand("ollama", "local-model", true, "Again"));

        assertEquals(2, ollama.calls.get());
        assertEquals(0, openai.calls.get());
        assertEquals(1, ollama.seen.get(0).size());
        assertEquals(3, ollama.seen.get(1).size());
        assertEquals("user", ollama.seen.get(1).get(0).role());
        assertEquals("assistant", ollama.seen.get(1).get(1).role());

        service.reset();
        service.send(new SendCommand("ollama", "local-model", false, "Fresh"));
        assertEquals(1, ollama.seen.get(2).size());
        assertEquals(2, service.catalog().messages().size());
    }

    @Test
    void doesNotFallBackWhenTheLocalProviderFails() {
        Fake ollama = new Fake(ProviderId.OLLAMA, true, true);
        ollama.failure = new ConversationException("provider-error", 502, "local failed");
        Fake openai = new Fake(ProviderId.OPENAI, false, true);
        ConversationService service = service(ollama, openai);

        ConversationException error = assertThrows(ConversationException.class,
                () -> service.send(new SendCommand("ollama", "local-model", false, "Hello")));

        assertEquals("provider-error", error.code());
        assertEquals(0, openai.calls.get());
        assertTrue(service.catalog().messages().isEmpty());
    }

    @Test
    void refusesCloudWithoutOptInAndWithoutCredentials() {
        Fake ollama = new Fake(ProviderId.OLLAMA, true, true);
        Fake openai = new Fake(ProviderId.OPENAI, false, true);
        ConversationService enabled = service(ollama, openai);
        ConversationException denied = assertThrows(ConversationException.class,
                () -> enabled.send(new SendCommand("openai", "gpt-4o-mini", false, "Hello")));
        assertEquals("cloud-denied", denied.code());
        assertEquals(0, openai.calls.get());
        assertFalse(denied.detail().toLowerCase().contains("key"));

        Fake unconfigured = new Fake(ProviderId.OPENAI, false, false);
        ConversationService missing = service(ollama, unconfigured);
        ConversationException credentials = assertThrows(ConversationException.class,
                () -> missing.send(new SendCommand("openai", "gpt-4o-mini", true, "Hello")));
        assertEquals("credentials", credentials.code());
        assertEquals(0, unconfigured.calls.get());
    }

    @Test
    void rejectsInvalidRequestsAndASecondConcurrentSend() throws Exception {
        Fake ollama = new Fake(ProviderId.OLLAMA, true, true);
        ConversationService service = service(ollama, new Fake(ProviderId.OPENAI, false, true));

        assertEquals("invalid", assertThrows(ConversationException.class,
                () -> service.send(new SendCommand("ollama", "local-model", false, "  "))).code());
        assertEquals("invalid", assertThrows(ConversationException.class,
                () -> service.send(new SendCommand("elsewhere", "local-model", false, "Hi"))).code());
        assertEquals("invalid", assertThrows(ConversationException.class,
                () -> service.send(new SendCommand("ollama", "../secret", false, "Hi"))).code());

        ollama.gate = new CountDownLatch(1);
        ollama.started = new CountDownLatch(1);
        Thread first = new Thread(() -> service.send(new SendCommand("ollama", "local-model", false, "Hold")));
        first.start();
        assertTrue(ollama.started.await(2, TimeUnit.SECONDS));
        assertEquals("busy", assertThrows(ConversationException.class,
                () -> service.send(new SendCommand("ollama", "local-model", false, "Second"))).code());
        ollama.gate.countDown();
        first.join(2_000);
        assertFalse(first.isAlive());
    }

    @Test
    void reportsOllamaUnavailableFromDiscovery() {
        Fake ollama = new Fake(ProviderId.OLLAMA, false, true);
        ConversationService service = service(ollama, new Fake(ProviderId.OPENAI, false, true));
        ConversationException error = assertThrows(ConversationException.class,
                () -> service.send(new SendCommand("ollama", "local-model", false, "Hello")));
        assertEquals("unavailable", error.code());
        assertEquals(0, ollama.calls.get());
    }

    private static ConversationService service(Fake ollama, Fake openai) {
        return new ConversationService(List.of(ollama, openai), new Personality("You are EVA. You are not human."));
    }

    private static final class Fake implements ChatProvider {
        private final ProviderId id;
        private final boolean reachable;
        private final boolean configured;
        private final List<List<ChatTurn>> seen = new ArrayList<>();
        private final AtomicInteger calls = new AtomicInteger();
        private ConversationException failure;
        private CountDownLatch gate;
        private CountDownLatch started;

        private Fake(ProviderId id, boolean reachable, boolean configured) {
            this.id = id;
            this.reachable = reachable;
            this.configured = configured;
        }

        @Override
        public ProviderId id() {
            return id;
        }

        @Override
        public ProviderStatus describe() {
            String model = id == ProviderId.OPENAI ? "gpt-4o-mini" : "local-model";
            return new ProviderStatus(id.wire(), id.wire(), id == ProviderId.OLLAMA, reachable, configured,
                    reachable ? "ready" : "Ollama is not running.",
                    List.of(new ModelChoice(model, model)));
        }

        @Override
        public Reply complete(List<ChatTurn> history, String model, String systemPrompt, CancelToken cancel) {
            calls.incrementAndGet();
            if (started != null) {
                started.countDown();
            }
            if (gate != null) {
                try {
                    if (!gate.await(2, TimeUnit.SECONDS)) {
                        throw new ConversationException("cancelled", 409, "The reply was cancelled.");
                    }
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new ConversationException("cancelled", 409, "The reply was cancelled.");
                }
            }
            if (failure != null) {
                throw failure;
            }
            seen.add(List.copyOf(history));
            assertTrue(systemPrompt.contains("EVA"));
            return new Reply(id.wire(), model, "Reply " + calls.get(), null);
        }
    }
}
