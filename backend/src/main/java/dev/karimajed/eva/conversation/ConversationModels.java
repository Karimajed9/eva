package dev.karimajed.eva.conversation;

import java.util.List;

public final class ConversationModels {

    private ConversationModels() {
    }

    public enum ProviderId {
        OLLAMA("ollama"),
        OPENAI("openai");

        private final String wire;

        ProviderId(String wire) {
            this.wire = wire;
        }

        public String wire() {
            return wire;
        }

        public static ProviderId fromWire(String value) {
            for (ProviderId id : values()) {
                if (id.wire.equals(value)) {
                    return id;
                }
            }
            return null;
        }
    }

    public record ChatTurn(String role, String text) {
    }

    public record ModelChoice(String id, String label) {
    }

    public record Usage(int promptTokens, int completionTokens, Double estimatedUsd) {
    }

    public record ProviderStatus(
            String id,
            String label,
            boolean local,
            boolean reachable,
            boolean configured,
            String detail,
            List<ModelChoice> models) {
    }

    public record Reply(String provider, String model, String text, Usage usage) {
    }

    public record SendCommand(String provider, String model, boolean cloudEnabled, String text) {
    }
}
