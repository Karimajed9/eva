package dev.karimajed.eva.speech.whisper;

import dev.karimajed.eva.conversation.CancelToken;
import dev.karimajed.eva.speech.EngineStatus;
import dev.karimajed.eva.speech.SpeechEngine;
import dev.karimajed.eva.speech.SpeechException;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class WhisperSpeechEngine implements SpeechEngine {

    private final WhisperSettings settings;
    private final CommandRunner runner;

    @org.springframework.beans.factory.annotation.Autowired
    public WhisperSpeechEngine(WhisperSettings settings) {
        this(settings, new LocalCommandRunner());
    }

    WhisperSpeechEngine(WhisperSettings settings, CommandRunner runner) {
        this.settings = settings;
        this.runner = runner;
    }

    @Override
    public EngineStatus status() {
        return settings.status();
    }

    @Override
    public String transcribe(byte[] wav, CancelToken cancel) {
        EngineStatus status = settings.status();
        if (!status.available() || settings.executable() == null || settings.model() == null) {
            throw new SpeechException(status.code(), status.httpStatus(), status.detail());
        }
        if (cancel.isCancelled()) {
            throw new SpeechException("cancelled", 409, "Transcription was cancelled.");
        }
        Path wavPath = null;
        try {
            wavPath = Files.createTempFile("eva-speech-", ".wav");
            Files.write(wavPath, wav);
            List<String> command = WhisperCommand.arguments(
                    settings.executable(),
                    settings.model(),
                    wavPath,
                    settings.gpu(),
                    settings.threads());
            String output = runner.run(command, wavPath.getParent(), cancel);
            String text = WhisperTranscript.normalize(output);
            if (text.isBlank()) {
                throw new SpeechException("engine-error", 502, "No speech was recognized.");
            }
            return text;
        } catch (SpeechException exception) {
            throw exception;
        } catch (IOException exception) {
            throw new SpeechException("engine-error", 502, "Local transcription failed.");
        } finally {
            if (wavPath != null) {
                deleteQuietly(wavPath);
                deleteQuietly(Path.of(wavPath.toString() + ".txt"));
            }
        }
    }

    private static void deleteQuietly(Path path) {
        try {
            Files.deleteIfExists(path);
        } catch (IOException ignored) {
            // A locked temp file is left for the operating system to remove.
        }
    }
}
