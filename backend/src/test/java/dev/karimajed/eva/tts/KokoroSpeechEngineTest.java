package dev.karimajed.eva.tts;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class KokoroSpeechEngineTest {

    @TempDir
    Path directory;

    @Test
    void reusesOneWorkerAndKeepsSecretsOutOfItsEnvironment() throws Exception {
        KokoroSpeechEngine engine = engine();
        TtsAudio first = engine.synthesize("af_heart", 1.0, "Hello from EVA.", "req-1");
        TtsAudio second = engine.synthesize("af_bella", 1.0, "Second line.", "req-2");
        assertEquals(1, engine.launches());
        assertEquals(24_000, first.sampleRate());
        assertTrue(first.wav().length > 44);
        assertEquals(0L, second.loadMs());
        assertTrue(second.elapsedMs() >= 9);
        engine.close();
    }

    @Test
    void dropsALateResultAfterCancelAndRestartsAfterACrash() throws Exception {
        KokoroSpeechEngine engine = engine();
        AtomicReference<Throwable> failure = new AtomicReference<>();
        Thread worker = new Thread(() -> {
            try {
                engine.synthesize("af_heart", 1.0, "please-wait", "req-wait");
            } catch (Throwable throwable) {
                failure.set(throwable);
            }
        });
        worker.start();
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(8);
        while (engine.launches() == 0 && System.nanoTime() < deadline) {
            Thread.sleep(50);
        }
        Thread.sleep(400);
        engine.cancel("req-wait");
        worker.join(5_000);
        assertFalse(worker.isAlive());
        assertTrue(failure.get() instanceof TtsException);
        TtsException cancelled = (TtsException) failure.get();
        assertEquals("cancelled", cancelled.code());
        assertFalse(cancelled.detail().contains("please-wait"));

        TtsException crashed = assertThrows(TtsException.class, () -> engine.synthesize("af_heart", 1.0, "please-crash-now", "req-crash"));
        assertEquals("engine-error", crashed.code());
        assertFalse(crashed.detail().contains("please-crash-now"));
        TtsAudio again = engine.synthesize("af_sarah", 1.0, "Recovered.", "req-3");
        assertEquals(2, engine.launches());
        assertTrue(again.wav().length > 44);
        engine.close();
    }

    @Test
    void rejectsAnUnknownVoiceWithoutCallingTheWorker() throws Exception {
        KokoroSpeechEngine engine = engine();
        TtsException failure = assertThrows(TtsException.class, () -> engine.synthesize("af_custom", 1.0, "Hello", "req-x"));
        assertEquals("invalid-speech", failure.code());
        assertEquals(0, engine.launches());
        assertFalse(failure.detail().contains("af_custom"));
        engine.close();
    }

    private KokoroSpeechEngine engine() throws Exception {
        Path python = directory.resolve("python.exe");
        Path worker = directory.resolve("worker.py");
        Path model = directory.resolve("kokoro-v1.0.onnx");
        Path voices = directory.resolve("voices-v1.0.bin");
        Files.write(python, new byte[] {1});
        Files.write(worker, new byte[] {1});
        Files.write(model, new byte[] {1});
        Files.write(voices, new byte[] {1});
        KokoroSettings settings = new KokoroSettings(python.toString(), worker.toString(), model.toString(), voices.toString());
        Map<String, String> environment = KokoroWorker.minimalEnvironment(Map.of(
                "PATH", System.getenv().getOrDefault("PATH", ""),
                "EVA_SESSION_TOKEN", "super-secret-token-value",
                "EVA_OPENAI_API_KEY", "sk-test-value"));
        assertFalse(environment.containsKey("EVA_SESSION_TOKEN"));
        assertFalse(environment.containsKey("EVA_OPENAI_API_KEY"));
        KokoroWorker process = new KokoroWorker(
                javaCommand(),
                environment);
        return new KokoroSpeechEngine(settings, process);
    }

    private static java.util.List<String> javaCommand() {
        Path home = Path.of(System.getProperty("java.home"), "bin");
        Path exe = home.resolve("java.exe");
        String program = Files.exists(exe) ? exe.toString() : home.resolve("java").toString();
        return java.util.List.of(program, "-cp", System.getProperty("java.class.path"), FakeKokoro.class.getName());
    }
}
