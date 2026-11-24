package dev.karimajed.eva.speech.whisper;

import dev.karimajed.eva.conversation.CancelToken;
import dev.karimajed.eva.speech.EngineStatus;
import dev.karimajed.eva.speech.SpeechEngine;
import dev.karimajed.eva.speech.SpeechException;
import dev.karimajed.eva.speech.SpeechHints;
import dev.karimajed.eva.speech.SpeechTranscript;
import java.util.concurrent.TimeUnit;
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
    public SpeechTranscript transcribe(byte[] wav, SpeechHints hints, CancelToken cancel) {
        if (hints == null) {
            throw new SpeechException("invalid-audio", 400, "The speech settings were rejected.");
        }
        hints.check();
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
                    settings.threads(),
                    hints.language(),
                    hints.prompt());
            long started = System.nanoTime();
            CommandOutput output = runner.run(command, wavPath.getParent(), cancel);
            long elapsed = Math.min(180_000L, TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started));
            String text = WhisperTranscript.normalize(output.stdout());
            if (text.isBlank()) {
                throw new SpeechException("engine-error", 502, "No speech was recognized.");
            }
            Long inference = null;
            if (output.loadMillis() != null && output.totalMillis() != null && output.totalMillis() >= output.loadMillis()) {
                inference = output.totalMillis() - output.loadMillis();
            }
            return new SpeechTranscript(text, elapsed, hints.recordingMs(), output.loadMillis(), inference);
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
