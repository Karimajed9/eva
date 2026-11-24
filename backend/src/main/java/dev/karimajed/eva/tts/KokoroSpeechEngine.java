package dev.karimajed.eva.tts;

import dev.karimajed.eva.speech.EngineStatus;
import java.util.List;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.stereotype.Component;

@Component
public class KokoroSpeechEngine implements TextToSpeechEngine, DisposableBean {

    private final KokoroSettings settings;
    private final KokoroWorker worker;
    private volatile String activeId = "";

    @org.springframework.beans.factory.annotation.Autowired
    public KokoroSpeechEngine(KokoroSettings settings) {
        this(settings, settings.status().available() ? KokoroWorker.forSettings(settings) : null);
    }

    KokoroSpeechEngine(KokoroSettings settings, KokoroWorker worker) {
        this.settings = settings;
        this.worker = worker;
    }

    @Override
    public EngineStatus status() {
        EngineStatus configured = settings.status();
        if (!configured.available() || worker == null) {
            return configured;
        }
        if (worker.loadMs() == null) {
            return new EngineStatus(true, "ready", 200, "Kokoro is configured. The model loads on the first request.");
        }
        return new EngineStatus(true, "ready", 200, "Kokoro is loaded. Speech stays on this machine.");
    }

    public Long loadMs() {
        return worker == null ? null : worker.loadMs();
    }

    public int launches() {
        return worker == null ? 0 : worker.launches();
    }

    @Override
    public TtsAudio synthesize(String voice, double speed, String text, String requestId) {
        EngineStatus configured = settings.status();
        if (!configured.available() || worker == null) {
            throw new TtsException(configured.code(), configured.httpStatus(), configured.detail());
        }
        KokoroVoices.Voice selected = KokoroVoices.get(voice);
        if (selected == null || requestId == null || !requestId.matches("[A-Za-z0-9_-]{1,40}")) {
            throw new TtsException("invalid-speech", 400, "The speech request was rejected.");
        }
        if (speed < 0.5 || speed > 1.5) {
            throw new TtsException("invalid-speech", 400, "The speech request was rejected.");
        }
        List<String> segments = SpokenText.segments(text);
        if (segments.isEmpty()) {
            throw new TtsException("invalid-speech", 400, "Nothing to speak.");
        }
        activeId = requestId;
        long started = System.nanoTime();
        byte[] combined = new byte[0];
        long elapsed = 0;
        for (String segment : segments) {
            if (!requestId.equals(activeId)) {
                throw new TtsException("cancelled", 409, "Speech was cancelled.");
            }
            KokoroChunk chunk = worker.synthesize(requestId, selected.id(), selected.lang(), speed, segment);
            elapsed += chunk.elapsedMs();
            combined = concat(combined, chunk.pcm());
            if (!requestId.equals(activeId)) {
                throw new TtsException("cancelled", 409, "Speech was cancelled.");
            }
        }
        long wall = Math.min(180_000, java.util.concurrent.TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started));
        byte[] wav = PcmWav.encode(combined);
        int samples = (wav.length - 44) / 2;
        return new TtsAudio(wav, Math.max(wall, elapsed), worker.loadMs(), PcmWav.audioMillis(samples), PcmWav.SAMPLE_RATE);
    }

    @Override
    public void cancel(String requestId) {
        activeId = "";
        if (worker != null) {
            worker.cancel(requestId);
        }
    }

    @Override
    public void close() {
        if (worker != null) {
            worker.close();
        }
    }

    @Override
    public void destroy() {
        close();
    }

    private static byte[] concat(byte[] left, byte[] right) {
        byte[] combined = new byte[left.length + right.length];
        System.arraycopy(left, 0, combined, 0, left.length);
        System.arraycopy(right, 0, combined, left.length, right.length);
        if (combined.length > PcmWav.MAX_SAMPLES * 2) {
            throw new TtsException("invalid-speech", 400, "The speech request was rejected.");
        }
        return combined;
    }
}
