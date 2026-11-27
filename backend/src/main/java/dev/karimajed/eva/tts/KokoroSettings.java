package dev.karimajed.eva.tts;

import dev.karimajed.eva.speech.EngineStatus;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Set;
import org.springframework.stereotype.Component;

@Component
public class KokoroSettings {

    static final String READY = "Local speech is ready. Audio stays on this machine.";
    static final String MISSING_PYTHON = "Kokoro is not configured. Set EVA_KOKORO_PYTHON to a local Python. EVA does not install it.";
    static final String PYTHON_REJECTED = "The configured Python path is not an absolute path to python.";
    static final String PYTHON_MISSING = "The configured Python program was not found.";
    static final String MISSING_WORKER = "The Kokoro worker is not configured. Set EVA_KOKORO_WORKER to worker.py. EVA does not download it.";
    static final String WORKER_REJECTED = "The Kokoro worker path must be an absolute path to worker.py.";
    static final String WORKER_MISSING = "The Kokoro worker script was not found.";
    static final String MISSING_MODEL = "The Kokoro model is not configured. Set EVA_KOKORO_MODEL to kokoro-v1.0.onnx. EVA does not download it.";
    static final String MODEL_REJECTED = "The Kokoro model path must be an absolute path to kokoro-v1.0.onnx.";
    static final String MODEL_MISSING = "The Kokoro model file was not found. EVA does not download a model.";
    static final String MISSING_VOICES = "The Kokoro voices file is not configured. Set EVA_KOKORO_VOICES to voices-v1.0.bin. EVA does not download it.";
    static final String VOICES_REJECTED = "The Kokoro voices path must be an absolute path to voices-v1.0.bin.";
    static final String VOICES_MISSING = "The Kokoro voices file was not found. EVA does not download voices.";

    private static final Set<String> PYTHON = Set.of("python", "python.exe", "python3", "python3.exe");

    private final Path python;
    private final Path worker;
    private final Path model;
    private final Path voices;
    private final EngineStatus status;

    @org.springframework.beans.factory.annotation.Autowired
    public KokoroSettings() {
        this(
                System.getenv("EVA_KOKORO_PYTHON"),
                System.getenv("EVA_KOKORO_WORKER"),
                System.getenv("EVA_KOKORO_MODEL"),
                System.getenv("EVA_KOKORO_VOICES"));
    }

    KokoroSettings(String pythonValue, String workerValue, String modelValue, String voicesValue) {
        Path program = file(pythonValue, PYTHON, true);
        Path script = namedFile(workerValue, "worker.py");
        Path weights = namedFile(modelValue, "kokoro-v1.0.onnx");
        Path voiceFile = namedFile(voicesValue, "voices-v1.0.bin");
        this.python = program;
        this.worker = script;
        this.model = weights;
        this.voices = voiceFile;
        if (program == null) {
            this.status = unavailable("missing-runtime", pythonDetail(pythonValue));
            return;
        }
        if (script == null) {
            this.status = unavailable("missing-engine", workerDetail(workerValue));
            return;
        }
        if (weights == null) {
            this.status = unavailable("missing-model", modelDetail(modelValue));
            return;
        }
        if (voiceFile == null) {
            this.status = unavailable("missing-model", voicesDetail(voicesValue));
            return;
        }
        this.status = new EngineStatus(true, "ready", 200, READY);
    }

    public EngineStatus status() {
        return status;
    }

    public Path python() {
        return python;
    }

    public Path worker() {
        return worker;
    }

    public Path model() {
        return model;
    }

    public Path voices() {
        return voices;
    }

    private static EngineStatus unavailable(String code, String detail) {
        return new EngineStatus(false, code, 503, detail);
    }

    private static String pythonDetail(String value) {
        if (value == null || value.isBlank()) {
            return MISSING_PYTHON;
        }
        if (file(value, PYTHON, false) == null) {
            return PYTHON_REJECTED;
        }
        return PYTHON_MISSING;
    }

    private static String workerDetail(String value) {
        if (value == null || value.isBlank()) {
            return MISSING_WORKER;
        }
        if (namedFile(value, "worker.py") == null && !exists(value)) {
            return WORKER_REJECTED;
        }
        return exists(value) ? WORKER_REJECTED : WORKER_MISSING;
    }

    private static String modelDetail(String value) {
        if (value == null || value.isBlank()) {
            return MISSING_MODEL;
        }
        return exists(value) ? MODEL_REJECTED : MODEL_MISSING;
    }

    private static String voicesDetail(String value) {
        if (value == null || value.isBlank()) {
            return MISSING_VOICES;
        }
        return exists(value) ? VOICES_REJECTED : VOICES_MISSING;
    }

    private static boolean exists(String value) {
        try {
            Path path = Path.of(value);
            return path.isAbsolute() && Files.isRegularFile(path);
        } catch (RuntimeException exception) {
            return false;
        }
    }

    private static Path file(String value, Set<String> names, boolean requirePresent) {
        if (value == null || value.isBlank()) {
            return null;
        }
        Path path;
        try {
            path = Path.of(value);
        } catch (RuntimeException exception) {
            return null;
        }
        if (!path.isAbsolute()) {
            return null;
        }
        String name = path.getFileName() == null ? "" : path.getFileName().toString().toLowerCase(Locale.ROOT);
        if (!names.contains(name)) {
            return null;
        }
        if (requirePresent && !Files.isRegularFile(path)) {
            return null;
        }
        return path.toAbsolutePath().normalize();
    }

    private static Path namedFile(String value, String expected) {
        if (value == null || value.isBlank()) {
            return null;
        }
        Path path;
        try {
            path = Path.of(value);
        } catch (RuntimeException exception) {
            return null;
        }
        if (!path.isAbsolute() || path.getFileName() == null || !path.getFileName().toString().equals(expected)) {
            return null;
        }
        if (!Files.isRegularFile(path)) {
            return null;
        }
        return path.toAbsolutePath().normalize();
    }
}
