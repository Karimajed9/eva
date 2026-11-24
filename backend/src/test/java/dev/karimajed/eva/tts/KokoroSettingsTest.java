package dev.karimajed.eva.tts;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class KokoroSettingsTest {

    @TempDir
    Path directory;

    @Test
    void acceptsOnlyTheNamedLocalFiles() throws Exception {
        Path python = directory.resolve("python.exe");
        Path worker = directory.resolve("worker.py");
        Path model = directory.resolve("kokoro-v1.0.onnx");
        Path voices = directory.resolve("voices-v1.0.bin");
        Files.write(python, new byte[] {1});
        Files.write(worker, new byte[] {1});
        Files.write(model, new byte[] {1});
        Files.write(voices, new byte[] {1});
        KokoroSettings ready = new KokoroSettings(python.toString(), worker.toString(), model.toString(), voices.toString());
        assertTrue(ready.status().available());
        KokoroSettings shell = new KokoroSettings(
                "C:\\Windows\\System32\\cmd.exe",
                worker.toString(),
                model.toString(),
                voices.toString());
        assertFalse(shell.status().available());
        assertEquals("missing-runtime", shell.status().code());
        assertFalse(shell.status().detail().contains("cmd.exe"));
    }
}
