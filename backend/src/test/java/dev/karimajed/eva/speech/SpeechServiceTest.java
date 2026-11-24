package dev.karimajed.eva.speech;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.karimajed.eva.conversation.CancelToken;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;

public class SpeechServiceTest {

    @Test
    void reportsAMissingEngineWithoutCallingIt() {
        SpeechService service = new SpeechService(new FixedEngine(false, "missing-engine", "whisper.cpp is not configured."));
        SpeechStatus status = service.status();
        assertEquals("whisper.cpp", status.engine());
        assertFalse(status.available());
        SpeechException failure = assertThrows(SpeechException.class, () -> service.transcribe(wav(WavAudio.MIN_SAMPLES)));
        assertEquals("missing-engine", failure.code());
        assertFalse(failure.detail().contains("secretphrase"));
    }

    @Test
    void rejectsInvalidAudioBeforeAReadyEngineRuns() {
        AtomicBoolean called = new AtomicBoolean();
        SpeechService service = new SpeechService(new FixedEngine(true, "ready", "ready") {
            @Override
            public String transcribe(byte[] wav, CancelToken cancel) {
                called.set(true);
                return "should not run";
            }
        });
        byte[] audio = "secretphrase".getBytes(StandardCharsets.UTF_8);
        SpeechException failure = assertThrows(SpeechException.class, () -> service.transcribe(audio));
        assertEquals("invalid-audio", failure.code());
        assertFalse(called.get());
        assertFalse(failure.detail().contains("secretphrase"));
    }

    @Test
    void keepsOneTranscriptionAndHonoursCancel() throws Exception {
        BlockingEngine engine = new BlockingEngine();
        SpeechService service = new SpeechService(engine);
        byte[] audio = wav(WavAudio.MIN_SAMPLES);
        Thread worker = new Thread(() -> {
            SpeechException failure = assertThrows(SpeechException.class, () -> service.transcribe(audio));
            assertEquals("cancelled", failure.code());
        });
        worker.start();
        assertTrue(engine.started.await(2, TimeUnit.SECONDS));
        SpeechException busy = assertThrows(SpeechException.class, () -> service.transcribe(audio));
        assertEquals("busy", busy.code());
        service.cancel();
        worker.join(2_000);
        assertFalse(worker.isAlive());
        assertEquals("again", service.transcribe(audio));
    }

    public static byte[] wav(int samples) {
        int dataBytes = samples * 2;
        ByteBuffer buffer = ByteBuffer.allocate(44 + dataBytes).order(ByteOrder.LITTLE_ENDIAN);
        buffer.put("RIFF".getBytes(StandardCharsets.US_ASCII));
        buffer.putInt(36 + dataBytes);
        buffer.put("WAVE".getBytes(StandardCharsets.US_ASCII));
        buffer.put("fmt ".getBytes(StandardCharsets.US_ASCII));
        buffer.putInt(16);
        buffer.putShort((short) 1);
        buffer.putShort((short) 1);
        buffer.putInt(WavAudio.SAMPLE_RATE);
        buffer.putInt(WavAudio.SAMPLE_RATE * 2);
        buffer.putShort((short) 2);
        buffer.putShort((short) 16);
        buffer.put("data".getBytes(StandardCharsets.US_ASCII));
        buffer.putInt(dataBytes);
        return buffer.array();
    }

    private static class FixedEngine implements SpeechEngine {
        private final EngineStatus status;

        FixedEngine(boolean available, String code, String detail) {
            this.status = new EngineStatus(available, code, available ? 200 : 503, detail);
        }

        @Override
        public EngineStatus status() {
            return status;
        }

        @Override
        public String transcribe(byte[] wav, CancelToken cancel) {
            return "again";
        }
    }

    private static final class BlockingEngine extends FixedEngine {
        private final CountDownLatch started = new CountDownLatch(1);
        private final java.util.concurrent.atomic.AtomicInteger calls = new java.util.concurrent.atomic.AtomicInteger();

        BlockingEngine() {
            super(true, "ready", "ready");
        }

        @Override
        public String transcribe(byte[] wav, CancelToken cancel) {
            if (calls.incrementAndGet() > 1) {
                return "again";
            }
            started.countDown();
            CountDownLatch released = new CountDownLatch(1);
            cancel.onCancel(released::countDown);
            try {
                if (!released.await(2, TimeUnit.SECONDS)) {
                    throw new SpeechException("engine-error", 502, "Local transcription failed.");
                }
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new SpeechException("cancelled", 409, "Transcription was cancelled.");
            }
            if (cancel.isCancelled()) {
                throw new SpeechException("cancelled", 409, "Transcription was cancelled.");
            }
            return "again";
        }
    }
}
