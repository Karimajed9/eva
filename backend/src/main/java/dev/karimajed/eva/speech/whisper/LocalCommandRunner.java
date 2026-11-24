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

    @Override
    public String run(List<String> command, Path directory, CancelToken cancel) {
        if (command == null || command.isEmpty() || directory == null) {
            throw new SpeechException("engine-error", 502, "Local transcription failed.");
        }
        ProcessBuilder builder = new ProcessBuilder(command);
        builder.directory(directory.toFile());
        builder.redirectError(ProcessBuilder.Redirect.DISCARD);
        scrub(builder.environment());
        Process process;
        try {
            process = builder.start();
        } catch (IOException exception) {
            throw new SpeechException("engine-error", 502, "Local transcription failed.");
        }
        cancel.onCancel(process::destroyForcibly);
        ByteArrayOutputStream captured = new ByteArrayOutputStream();
        Thread reader = new Thread(() -> drain(process.getInputStream(), captured), "eva-speech-stdout");
        reader.setDaemon(true);
        reader.start();
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
            reader.join(2_000);
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
        return captured.toString(StandardCharsets.UTF_8);
    }

    static void scrub(Map<String, String> environment) {
        environment.remove("EVA_SESSION_TOKEN");
        environment.remove("EVA_OPENAI_API_KEY");
    }

    private static void drain(InputStream input, ByteArrayOutputStream captured) {
        try (input) {
            byte[] buffer = new byte[1024];
            int read;
            while ((read = input.read(buffer)) >= 0) {
                if (captured.size() < MAX_STDOUT) {
                    captured.write(buffer, 0, Math.min(read, MAX_STDOUT - captured.size()));
                }
            }
        } catch (IOException ignored) {
            // The process is being stopped.
        }
    }
}
