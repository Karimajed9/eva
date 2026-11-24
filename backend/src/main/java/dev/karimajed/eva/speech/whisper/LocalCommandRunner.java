package dev.karimajed.eva.speech.whisper;

import dev.karimajed.eva.conversation.CancelToken;
import dev.karimajed.eva.speech.SpeechException;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

final class LocalCommandRunner implements CommandRunner {

    static final Duration TIMEOUT = Duration.ofSeconds(120);
    private static final int MAX_STDOUT = 32_000;
    private static final int MAX_STDERR = 16_000;

    @Override
    public CommandOutput run(List<String> command, Path directory, CancelToken cancel) {
        if (command == null || command.isEmpty() || directory == null) {
            throw new SpeechException("engine-error", 502, "Local transcription failed.");
        }
        ProcessBuilder builder = new ProcessBuilder(command);
        builder.directory(directory.toFile());
        scrub(builder.environment());
        Process process;
        try {
            process = builder.start();
        } catch (IOException exception) {
            throw new SpeechException("engine-error", 502, "Local transcription failed.");
        }
        cancel.onCancel(process::destroyForcibly);
        ByteArrayOutputStream stdout = new ByteArrayOutputStream();
        ByteArrayOutputStream stderr = new ByteArrayOutputStream();
        Thread outReader = new Thread(() -> drain(process.getInputStream(), stdout, MAX_STDOUT), "eva-speech-stdout");
        Thread errReader = new Thread(() -> drain(process.getErrorStream(), stderr, MAX_STDERR), "eva-speech-stderr");
        outReader.setDaemon(true);
        errReader.setDaemon(true);
        outReader.start();
        errReader.start();
        long deadline = System.nanoTime() + TIMEOUT.toNanos();
        try {
            while (process.isAlive()) {
                if (cancel.isCancelled()) {
                    process.destroyForcibly();
                    throw new SpeechException("cancelled", 409, "Transcription was cancelled.");
                }
                if (System.nanoTime() > deadline) {
                    process.destroyForcibly();
                    throw new SpeechException("engine-error", 502, "Transcription took too long and was stopped.");
                }
                process.waitFor(100, TimeUnit.MILLISECONDS);
            }
            outReader.join(2_000);
            errReader.join(2_000);
        } catch (InterruptedException exception) {
            process.destroyForcibly();
            Thread.currentThread().interrupt();
            throw new SpeechException("cancelled", 409, "Transcription was cancelled.");
        }
        if (cancel.isCancelled()) {
            process.destroyForcibly();
            throw new SpeechException("cancelled", 409, "Transcription was cancelled.");
        }
        if (process.exitValue() != 0) {
            throw new SpeechException("engine-error", 502, "Local transcription failed.");
        }
        String timings = stderr.toString(StandardCharsets.UTF_8);
        return new CommandOutput(
                stdout.toString(StandardCharsets.UTF_8),
                WhisperTimings.loadMillis(timings),
                WhisperTimings.totalMillis(timings));
    }

    static void scrub(Map<String, String> environment) {
        environment.remove("EVA_SESSION_TOKEN");
        environment.remove("EVA_OPENAI_API_KEY");
    }

    private static void drain(InputStream input, ByteArrayOutputStream captured, int limit) {
        try (input) {
            byte[] buffer = new byte[1024];
            int read;
            while ((read = input.read(buffer)) >= 0) {
                if (captured.size() < limit) {
                    captured.write(buffer, 0, Math.min(read, limit - captured.size()));
                }
            }
        } catch (IOException ignored) {
            // The process is being stopped.
        }
    }
}
