package dev.karimajed.eva.tts;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

record KokoroChunk(byte[] pcm, long elapsedMs) {
}

/**
 * One long-lived Kokoro process. Model paths are fixed arguments of the environment.
 * Speech text is written only to the process stdin and is never logged.
 */
final class KokoroWorker implements AutoCloseable {

    private static final Set<String> KEPT = Set.of(
            "PATH", "Path", "PATHEXT", "SYSTEMROOT", "SystemRoot", "WINDIR", "TEMP", "TMP",
            "LOCALAPPDATA", "USERPROFILE", "HOME");
    private static final ObjectMapper JSON = new ObjectMapper();

    private final List<String> command;
    private final Map<String, String> environment;
    private final Object state = new Object();
    private final Object writeLock = new Object();
    private Process process;
    private volatile OutputStream stdin;
    private InputStream stdout;
    private Long loadMs;
    private final AtomicInteger launches = new AtomicInteger();
    private final AtomicBoolean closed = new AtomicBoolean();
    private volatile String cancelledId = "";

    KokoroWorker(List<String> command, Map<String, String> environment) {
        this.command = List.copyOf(command);
        this.environment = Map.copyOf(environment);
    }

    static KokoroWorker forSettings(KokoroSettings settings) {
        Map<String, String> environment = minimalEnvironment();
        environment.put("EVA_KOKORO_MODEL", settings.model().toString());
        environment.put("EVA_KOKORO_VOICES", settings.voices().toString());
        return new KokoroWorker(
                List.of(settings.python().toString(), "-u", settings.worker().toString()),
                environment);
    }

    int launches() {
        return launches.get();
    }

    Long loadMs() {
        return loadMs;
    }

    KokoroChunk synthesize(String id, String voice, String lang, double speed, String text) {
        if (closed.get()) {
            throw new TtsException("engine-error", 502, "Local speech failed.");
        }
        ensureStarted();
        if (id.equals(cancelledId)) {
            throw new TtsException("cancelled", 409, "Speech was cancelled.");
        }
        try {
            ObjectNode request = JSON.createObjectNode();
            request.put("op", "synthesize");
            request.put("id", id);
            request.put("voice", voice);
            request.put("lang", lang);
            request.put("speed", speed);
            request.put("text", text);
            writeLine(request);
            JsonNode header = readHeader(120);
            if (id.equals(cancelledId) || header.path("code").asText("").equals("cancelled")) {
                discardAudio(header);
                throw new TtsException("cancelled", 409, "Speech was cancelled.");
            }
            if (!header.path("ok").asBoolean(false) || !id.equals(header.path("id").asText())) {
                discardAudio(header);
                throw failed(header.path("code").asText(""));
            }
            int samples = header.path("samples").asInt(0);
            int rate = header.path("sampleRate").asInt(0);
            if (rate != PcmWav.SAMPLE_RATE || samples < PcmWav.MIN_SAMPLES || samples > PcmWav.MAX_SAMPLES) {
                throw new TtsException("engine-error", 502, "Local speech failed.");
            }
            byte[] pcm = stdout.readNBytes(samples * 2);
            if (pcm.length != samples * 2) {
                throw new TtsException("engine-error", 502, "Local speech failed.");
            }
            if (id.equals(cancelledId)) {
                throw new TtsException("cancelled", 409, "Speech was cancelled.");
            }
            long elapsed = Math.max(0, header.path("elapsedMs").asLong(0));
            if (header.has("loadMs") && header.path("loadMs").canConvertToLong()) {
                loadMs = header.path("loadMs").asLong();
            }
            return new KokoroChunk(pcm, elapsed);
        } catch (TtsException exception) {
            throw exception;
        } catch (IOException exception) {
            stopProcess();
            throw new TtsException("engine-error", 502, "Local speech failed.");
        }
    }

    void cancel(String id) {
        cancelledId = id == null ? "" : id;
        if (stdin == null) {
            return;
        }
        try {
            ObjectNode request = JSON.createObjectNode();
            request.put("op", "cancel");
            request.put("id", cancelledId);
            writeLine(request);
        } catch (IOException exception) {
            stopProcess();
        }
    }

    @Override
    public void close() {
        if (!closed.compareAndSet(false, true)) {
            return;
        }
        synchronized (state) {
            try {
                if (stdin != null) {
                    ObjectNode request = JSON.createObjectNode();
                    request.put("op", "shutdown");
                    writeLine(request);
                }
            } catch (IOException ignored) {
                // The process is about to be stopped.
            }
            if (process != null) {
                try {
                    process.waitFor(2, TimeUnit.SECONDS);
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                }
            }
            stopProcess();
        }
    }

    private void ensureStarted() {
        synchronized (state) {
        if (process != null && process.isAlive()) {
            return;
        }
        stopProcess();
        ProcessBuilder builder = new ProcessBuilder(command);
        builder.environment().clear();
        builder.environment().putAll(environment);
        builder.redirectError(ProcessBuilder.Redirect.PIPE);
        try {
            process = builder.start();
        } catch (IOException exception) {
            throw new TtsException("missing-runtime", 503, "Kokoro could not be started.");
        }
        launches.incrementAndGet();
        stdin = process.getOutputStream();
        stdout = process.getInputStream();
        Thread drain = new Thread(() -> drain(process.getErrorStream()), "eva-kokoro-stderr");
        drain.setDaemon(true);
        drain.start();
        try {
            JsonNode ready = readHeader(120);
            if (!ready.path("ok").asBoolean(false) || !"ready".equals(ready.path("type").asText())) {
                String code = ready.path("code").asText("");
                stopProcess();
                if ("missing-model".equals(code)) {
                    throw new TtsException("missing-model", 503, "The Kokoro model file was not found. EVA does not download a model.");
                }
                throw new TtsException("missing-runtime", 503, "Kokoro could not be started.");
            }
            loadMs = ready.path("loadMs").asLong(0);
        } catch (IOException exception) {
            stopProcess();
            throw new TtsException("engine-error", 502, "Local speech failed.");
        }
        }
    }

    private void writeLine(ObjectNode node) throws IOException {
        synchronized (writeLock) {
        stdin.write(JSON.writeValueAsBytes(node));
        stdin.write('\n');
        stdin.flush();
        }
    }

    private JsonNode readHeader(long timeoutSeconds) throws IOException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(timeoutSeconds);
        ByteArrayOutputStream line = new ByteArrayOutputStream();
        while (System.nanoTime() < deadline) {
            if (stdout.available() == 0) {
                if (process != null && !process.isAlive()) {
                    throw new IOException("closed");
                }
                try {
                    Thread.sleep(20);
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new IOException("interrupted");
                }
                continue;
            }
            int next = stdout.read();
            if (next < 0) {
                throw new IOException("closed");
            }
            if (next == '\n') {
                return JSON.readTree(line.toByteArray());
            }
            if (next != '\r') {
                line.write(next);
            }
            if (line.size() > 2_000) {
                throw new IOException("header");
            }
        }
        stopProcess();
        throw new IOException("timeout");
    }

    private void discardAudio(JsonNode header) throws IOException {
        if (!header.path("ok").asBoolean(false)) {
            return;
        }
        int samples = header.path("samples").asInt(0);
        if (samples > 0 && samples <= PcmWav.MAX_SAMPLES) {
            stdout.readNBytes(samples * 2);
        }
    }

    private static TtsException failed(String code) {
        if ("invalid-speech".equals(code)) {
            return new TtsException("invalid-speech", 400, "The speech request was rejected.");
        }
        if ("cancelled".equals(code)) {
            return new TtsException("cancelled", 409, "Speech was cancelled.");
        }
        if ("missing-model".equals(code)) {
            return new TtsException("missing-model", 503, "The Kokoro model file was not found. EVA does not download a model.");
        }
        return new TtsException("engine-error", 502, "Local speech failed.");
    }

    private void stopProcess() {
        Process current = process;
        process = null;
        stdin = null;
        stdout = null;
        if (current != null) {
            current.destroyForcibly();
        }
    }

    private static void drain(InputStream error) {
        try (error) {
            error.readAllBytes();
        } catch (IOException ignored) {
            // The process is being stopped. The bytes are discarded.
        }
    }

    static Map<String, String> minimalEnvironment() {
        return minimalEnvironment(System.getenv());
    }

    static Map<String, String> minimalEnvironment(Map<String, String> source) {
        Map<String, String> environment = new HashMap<>();
        for (String key : KEPT) {
            String value = source.get(key);
            if (value != null && !value.isBlank()) {
                environment.put(key, value);
            }
        }
        environment.put("PYTHONUTF8", "1");
        environment.put("PYTHONIOENCODING", "utf-8");
        environment.put("HF_HUB_OFFLINE", "1");
        environment.put("HF_HUB_DISABLE_TELEMETRY", "1");
        environment.remove("EVA_SESSION_TOKEN");
        environment.remove("EVA_OPENAI_API_KEY");
        return environment;
    }
}
