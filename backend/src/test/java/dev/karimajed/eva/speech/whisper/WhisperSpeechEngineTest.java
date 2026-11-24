package dev.karimajed.eva.speech.whisper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.karimajed.eva.conversation.CancelToken;
import dev.karimajed.eva.speech.SpeechException;
import dev.karimajed.eva.speech.SpeechHints;
import dev.karimajed.eva.speech.SpeechServiceTest;
import dev.karimajed.eva.speech.SpeechTranscript;
import dev.karimajed.eva.speech.WavAudio;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class WhisperSpeechEngineTest {

    @TempDir
    Path directory;

    @Test
    void runsWhisperWithFixedArgumentsAndDeletesTheRecording() throws Exception {
        Path executable = directory.resolve("whisper-cli.exe");
        Path model = directory.resolve("ggml-small.bin");
        Files.write(executable, new byte[] {1});
        Files.write(model, new byte[] {1, 2, 3});
        AtomicReference<Path> seen = new AtomicReference<>();
        WhisperSpeechEngine engine = new WhisperSpeechEngine(
                new WhisperSettings(executable.toString(), model.toString(), "cpu"),
                (command, work, cancel) -> {
                    assertEquals(executable.toString(), command.get(0));
                    assertTrue(command.contains("-l"));
                    assertEquals("auto", command.get(command.indexOf("-l") + 1));
                    assertTrue(command.contains("-ng"));
                    assertFalse(String.join(" ", command).contains("cmd.exe"));
                    assertEquals(11, command.size());
                    Path wav = Path.of(command.get(command.indexOf("-f") + 1));
                    seen.set(wav);
                    assertTrue(Files.exists(wav));
                    assertEquals(WavAudio.MIN_SAMPLES * 2 + 44, fileSize(wav));
                    return new CommandOutput("  [00:00:00.000 --> 00:00:01.000]  hello there  ", 900L, 2_100L);
                });

        SpeechTranscript transcript = engine.transcribe(
                SpeechServiceTest.wav(WavAudio.MIN_SAMPLES),
                SpeechHints.automatic(),
                new CancelToken());

        assertEquals("hello there", transcript.text());
        assertEquals(900L, transcript.loadMs());
        assertEquals(1_200L, transcript.inferenceMs());
        assertFalse(Files.exists(seen.get()));
        assertFalse(Files.exists(Path.of(seen.get().toString() + ".txt")));
    }

    private static long fileSize(Path path) {
        try {
            return Files.size(path);
        } catch (java.io.IOException exception) {
            throw new IllegalStateException(exception);
        }
    }

    @Test
    void enablesGpuOnlyWhenAsked() throws Exception {
        Path executable = directory.resolve("whisper-cli.exe");
        Path model = directory.resolve("ggml-small.bin");
        Files.write(executable, new byte[] {1});
        Files.write(model, new byte[] {1});
        List<String> seen = new ArrayList<>();
        WhisperSpeechEngine engine = new WhisperSpeechEngine(
                new WhisperSettings(executable.toString(), model.toString(), "vulkan"),
                (command, work, cancel) -> {
                    seen.addAll(command);
                    return CommandOutput.text("bonjour");
                });
        assertEquals("bonjour", engine.transcribe(
                SpeechServiceTest.wav(WavAudio.MIN_SAMPLES),
                SpeechHints.automatic(),
                new CancelToken()).text());
        assertFalse(seen.contains("-ng"));
        assertTrue(engine.status().available());
    }

    @Test
    void failureDoesNotEchoAudioOrTheTranscript() throws Exception {
        Path executable = directory.resolve("whisper-cli.exe");
        Path model = directory.resolve("ggml-small.bin");
        Files.write(executable, new byte[] {1});
        Files.write(model, new byte[] {1});
        byte[] audio = SpeechServiceTest.wav(WavAudio.MIN_SAMPLES);
        audio[60] = 's';
        WhisperSpeechEngine engine = new WhisperSpeechEngine(
                new WhisperSettings(executable.toString(), model.toString(), null),
                (command, work, cancel) -> {
                    throw new SpeechException("engine-error", 502, "Local transcription failed.");
                });
        SpeechException failure = assertThrows(SpeechException.class, () -> engine.transcribe(audio, SpeechHints.automatic(), new CancelToken()));
        assertEquals("Local transcription failed.", failure.detail());
        assertFalse(failure.getMessage().contains("secret"));
    }

    @Test
    void cancelDeletesTheRecording() throws Exception {
        Path executable = directory.resolve("main.exe");
        Path model = directory.resolve("ggml-medium.bin");
        Files.write(executable, new byte[] {1});
        Files.write(model, new byte[] {1});
        AtomicReference<Path> seen = new AtomicReference<>();
        WhisperSpeechEngine engine = new WhisperSpeechEngine(
                new WhisperSettings(executable.toString(), model.toString(), "off"),
                (command, work, token) -> {
                    Path wav = Path.of(command.get(command.indexOf("-f") + 1));
                    seen.set(wav);
                    assertTrue(Files.exists(wav));
                    token.cancel();
                    throw new SpeechException("cancelled", 409, "Transcription was cancelled.");
                });
        SpeechException failure = assertThrows(
                SpeechException.class,
                () -> engine.transcribe(SpeechServiceTest.wav(WavAudio.MIN_SAMPLES), SpeechHints.automatic(), new CancelToken()));
        assertEquals("cancelled", failure.code());
        assertFalse(Files.exists(seen.get()));
    }

    @Test
    void passesLanguageAndVocabularyAsSeparateArguments() throws Exception {
        Path executable = directory.resolve("whisper-cli.exe");
        Path model = directory.resolve("ggml-base.bin");
        Files.write(executable, new byte[] {1});
        Files.write(model, new byte[] {1});
        List<String> seen = new ArrayList<>();
        WhisperSpeechEngine engine = new WhisperSpeechEngine(
                new WhisperSettings(executable.toString(), model.toString(), "cpu"),
                (command, work, cancel) -> {
                    seen.addAll(command);
                    return CommandOutput.text("Muay Thai");
                });
        SpeechTranscript transcript = engine.transcribe(
                SpeechServiceTest.wav(WavAudio.MIN_SAMPLES),
                new SpeechHints("fr", "Muay Thai", 8_000),
                new CancelToken());
        assertEquals("Muay Thai", transcript.text());
        assertEquals(8_000, transcript.recordingMs());
        assertEquals("fr", seen.get(seen.indexOf("-l") + 1));
        assertEquals("Muay Thai", seen.get(seen.indexOf("--prompt") + 1));
        assertEquals(13, seen.size());
        assertFalse(String.join("\n", seen).contains("cmd.exe"));
    }
}
