package dev.karimajed.eva.conversation;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

@Component
public class Personality {

    private final String prompt;

    public Personality() {
        this(readDefault());
    }

    Personality(String prompt) {
        if (prompt == null || prompt.isBlank()) {
            throw new IllegalStateException("EVA personality prompt is empty.");
        }
        this.prompt = prompt.strip();
    }

    public String prompt() {
        return prompt;
    }

    private static String readDefault() {
        ClassPathResource resource = new ClassPathResource("personality/eva-system-prompt.txt");
        try (InputStream input = resource.getInputStream()) {
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException exception) {
            throw new IllegalStateException("EVA personality prompt could not be read.");
        }
    }
}
