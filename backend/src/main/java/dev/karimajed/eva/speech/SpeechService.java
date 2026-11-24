package dev.karimajed.eva.speech;

import dev.karimajed.eva.conversation.CancelToken;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.stereotype.Service;

@Service
public class SpeechService {

    private final SpeechEngine engine;
    private final AtomicReference<CancelToken> inFlight = new AtomicReference<>();

    public SpeechService(SpeechEngine engine) {
        this.engine = engine;
    }

    public SpeechStatus status() {
        EngineStatus status = engine.status();
        return new SpeechStatus("whisper.cpp", status.available(), status.detail());
    }

    public SpeechTranscript transcribe(byte[] wav, SpeechHints hints) {
        if (hints == null) {
            throw new SpeechException("invalid-audio", 400, "The speech settings were rejected.");
        }
        hints.check();
        EngineStatus status = engine.status();
        if (!status.available()) {
            throw new SpeechException(status.code(), status.httpStatus(), status.detail());
        }
        WavAudio.validate(wav);
        CancelToken cancel = new CancelToken();
        if (!inFlight.compareAndSet(null, cancel)) {
            throw new SpeechException("busy", 409, "A transcription is already running.");
        }
        try {
            if (cancel.isCancelled()) {
                throw new SpeechException("cancelled", 409, "Transcription was cancelled.");
            }
            SpeechTranscript transcript = engine.transcribe(wav, hints, cancel);
            if (transcript == null || transcript.text() == null || transcript.text().isBlank()) {
                throw new SpeechException("engine-error", 502, "No speech was recognized.");
            }
            return new SpeechTranscript(
                    transcript.text().strip(),
                    Math.max(0, transcript.elapsedMs()),
                    hints.recordingMs(),
                    transcript.loadMs(),
                    transcript.inferenceMs());
        } finally {
            inFlight.compareAndSet(cancel, null);
        }
    }

    public void cancel() {
        CancelToken current = inFlight.get();
        if (current != null) {
            current.cancel();
        }
    }
}
