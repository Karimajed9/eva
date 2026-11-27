package dev.karimajed.eva.tts;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;

public record TtsRequest(String voice, double speed, String text) {

    private static final ObjectMapper JSON = new ObjectMapper();

    public static TtsRequest parse(byte[] body) {
        if (body == null || body.length == 0 || body.length > 20_000) {
            throw rejected();
        }
        JsonNode node;
        try {
            node = JSON.readTree(body);
        } catch (Exception exception) {
            throw rejected();
        }
        if (!node.isObject() || node.size() != 3 || !node.hasNonNull("voice") || !node.has("speed") || !node.hasNonNull("text")) {
            throw rejected();
        }
        KokoroVoices.Voice voice = KokoroVoices.get(node.path("voice").asText(""));
        if (voice == null || !node.path("speed").isNumber() || node.path("speed").isBoolean()) {
            throw rejected();
        }
        BigDecimal speed = node.path("speed").decimalValue().stripTrailingZeros();
        if (speed.scale() > 2 || speed.compareTo(new BigDecimal("0.5")) < 0 || speed.compareTo(new BigDecimal("1.5")) > 0) {
            throw rejected();
        }
        String text = node.path("text").asText("");
        if (text.isBlank() || text.length() > SpokenText.MAX_CHARS) {
            throw rejected();
        }
        return new TtsRequest(voice.id(), speed.doubleValue(), text);
    }

    private static TtsException rejected() {
        return new TtsException("invalid-speech", 400, "The speech request was rejected.");
    }
}
