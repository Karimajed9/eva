package dev.karimajed.eva.security;

/**
 * The optional OpenAI key, kept off the renderer and out of Spring's property
 * sources. An empty value means cloud chat is not configured.
 */
public final class OpenAiCredential {

    private final String value;

    public OpenAiCredential(String value) {
        this.value = value == null ? "" : value.trim();
    }

    public boolean configured() {
        return !value.isEmpty();
    }

    public String value() {
        return value;
    }
}
