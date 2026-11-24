package dev.karimajed.eva.speech.whisper;

import dev.karimajed.eva.speech.SpeechException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * Arguments for whisper-cli. The list is passed to ProcessBuilder, never to a shell.
 */
public final class WhisperCommand {

    private WhisperCommand() {
    }

    public static List<String> arguments(Path executable, Path model, Path wav, boolean gpu, int threads) {
        if (executable == null || model == null || wav == null) {
            throw new SpeechException("engine-error", 502, "Local transcription failed.");
        }
        int workers = Math.max(1, Math.min(8, threads));
        List<String> command = new ArrayList<>();
        command.add(executable.toString());
        command.add("-m");
        command.add(model.toString());
        command.add("-f");
        command.add(wav.toString());
        command.add("-l");
        command.add("auto");
        command.add("-nt");
        command.add("-t");
        command.add(Integer.toString(workers));
        if (!gpu) {
            command.add("-ng");
        }
        return List.copyOf(command);
    }
}
