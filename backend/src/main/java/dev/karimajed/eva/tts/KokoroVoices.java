package dev.karimajed.eva.tts;

import java.util.Map;
import java.util.Set;

public final class KokoroVoices {

    public record Voice(String id, String label, String lang) {
    }

    public static final Voice HEART = new Voice("af_heart", "Heart", "en-us");
    private static final Map<String, Voice> VOICES = Map.of(
            "af_heart", HEART,
            "af_bella", new Voice("af_bella", "Bella", "en-us"),
            "af_nova", new Voice("af_nova", "Nova", "en-us"),
            "af_sarah", new Voice("af_sarah", "Sarah", "en-us"),
            "bf_emma", new Voice("bf_emma", "Emma", "en-gb"),
            "ff_siwis", new Voice("ff_siwis", "Siwis", "fr-fr"));

    private KokoroVoices() {
    }

    public static Set<String> ids() {
        return VOICES.keySet();
    }

    public static Voice get(String id) {
        return id == null ? null : VOICES.get(id);
    }
}
