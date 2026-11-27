package dev.karimajed.eva.tts;

import dev.karimajed.eva.speech.EngineStatus;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.stereotype.Service;

@Service
public class TtsService {

    private final TextToSpeechEngine engine;
    private final AtomicReference<String> inFlight = new AtomicReference<>();
    private final AtomicInteger ids = new AtomicInteger();

    public TtsService(TextToSpeechEngine engine) {
        this.engine = engine;
    }

    public TtsState status() {
        EngineStatus status = engine.status();
        Long loadMs = engine instanceof KokoroSpeechEngine kokoro ? kokoro.loadMs() : null;
        return new TtsState("kokoro", status.available(), status.detail(), loadMs);
    }

    public TtsAudio synthesize(TtsRequest request) {
        String id = "s" + ids.incrementAndGet();
        if (!inFlight.compareAndSet(null, id)) {
            throw new TtsException("busy", 409, "Speech is already being prepared.");
        }
        try {
            return engine.synthesize(request.voice(), request.speed(), request.text(), id);
        } finally {
            inFlight.compareAndSet(id, null);
        }
    }

    public void cancel() {
        String id = inFlight.get();
        if (id != null) {
            engine.cancel(id);
        }
    }
}
