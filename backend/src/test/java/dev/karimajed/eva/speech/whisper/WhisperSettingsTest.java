package dev.karimajed.eva.speech.whisper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class WhisperSettingsTest {

    @TempDir
    Path directory;

    @Test
    void staysUnavailableUntilAnAbsoluteProgramAndMultilingualModelExist() throws Exception {
        WhisperSettings missing = new WhisperSettings(null, null, null);
        assertFalse(missing.status().available());
        assertEquals("missing-engine", missing.status().code());
        assertTrue(missing.status().detail().contains("does not download"));

        WhisperSettings relative = new WhisperSettings("whisper-cli.exe", null, null);
        assertEquals("missing-engine", relative.status().code());
        assertTrue(relative.status().detail().contains("absolute path"));

        Path command = directory.resolve("cmd.exe");
        Files.write(command, new byte[] {1});
        WhisperSettings shell = new WhisperSettings(command.toString(), null, null);
        assertEquals("missing-engine", shell.status().code());
        assertTrue(shell.status().detail().contains("not whisper.cpp"));
        assertFalse(shell.gpu());

        Path executable = directory.resolve("whisper-cli.exe");
        Files.write(executable, new byte[] {1});
        WhisperSettings noModel = new WhisperSettings(executable.toString(), null, "vulkan");
        assertEquals("missing-model", noModel.status().code());
        assertTrue(noModel.gpu());
        assertTrue(noModel.status().detail().contains("ggml-small.bin"));

        Path english = directory.resolve("ggml-base.en.bin");
        Files.write(english, new byte[] {1, 2});
        WhisperSettings englishOnly = new WhisperSettings(executable.toString(), english.toString(), "amd");
        assertEquals("missing-model", englishOnly.status().code());
        assertTrue(englishOnly.status().detail().contains("English-only"));

        Path model = directory.resolve("ggml-small.bin");
        Files.write(model, new byte[] {1, 2, 3});
        WhisperSettings ready = new WhisperSettings(executable.toString(), model.toString(), "cpu");
        assertTrue(ready.status().available());
        assertEquals(executable.normalize(), ready.executable());
        assertEquals(model.normalize(), ready.model());
        assertFalse(ready.gpu());
    }
}
