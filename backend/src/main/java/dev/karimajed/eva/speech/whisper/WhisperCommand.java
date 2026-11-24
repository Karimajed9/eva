package dev.karimajed.eva.speech.whisper;

import dev.karimajed.eva.speech.SpeechException;
import dev.karimajed.eva.speech.SpeechHints;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * Arguments for whisper-cli. The list is passed to ProcessBuilder, never to a shell.
 */
public final class WhisperCommand {

    private WhisperCommand() {
    }

    public static List<String> arguments(
            Path executable,
            Path model,
            Path wav,
            boolean gpu,
            int threads,
            String language,
            String prompt) {
        if (executable == null || model == null || wav == null) {
            throw new SpeechException("engine-error", 502, "Local transcription failed.");
        }
        if (language == null || !Set.of("auto", "en", "fr", "ar").contains(language)) {
            throw new SpeechException("invalid-audio", 400, "The speech settings were rejected.");
        }
        String vocabulary = prompt == null ? "" : prompt;
        if (vocabulary.length() > SpeechHints.MAX_PROMPT || !SpeechHints.allowedPrompt(vocabulary)) {
            throw new SpeechException("invalid-audio", 400, "The speech settings were rejected.");
        }
        int workers = Math.max(1, Math.min(8, threads));
        List<String> command = new ArrayList<>();
        command.add(executable.toString());
        command.add("-m");
        command.add(model.toString());
        command.add("-f");
        command.add(wav.toString());
        command.add("-l");
        command.add(language);
        if (!vocabulary.isEmpty()) {
            command.add("--prompt");
            command.add(vocabulary);
        }
        command.add("-nt");
        command.add("-t");
        command.add(Integer.toString(workers));
        if (!gpu) {
            command.add("-ng");
        }
        return List.copyOf(command);
    }
}
