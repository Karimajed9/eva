package dev.karimajed.eva.speech.whisper;

import dev.karimajed.eva.speech.EngineStatus;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Set;
import org.springframework.stereotype.Component;

@Component
public class WhisperSettings {

    static final String READY = "Local transcription is ready. Audio stays on this machine.";
    static final String MISSING_PROGRAM = "whisper.cpp is not configured. Set EVA_WHISPER_EXECUTABLE to whisper-cli. EVA does not download it.";
    static final String PROGRAM_NOT_FOUND = "The whisper.cpp program was not found at the configured path.";
    static final String PROGRAM_REJECTED = "The configured transcription program is not whisper.cpp.";
    static final String PROGRAM_PATH = "The whisper.cpp program path must be an absolute path to whisper-cli.";
    static final String MISSING_MODEL = "The whisper.cpp model is not configured. Set EVA_WHISPER_MODEL to a multilingual ggml file such as ggml-small.bin. EVA does not download it.";
    static final String MODEL_NOT_FOUND = "The whisper.cpp model file was not found. EVA does not download a model.";
    static final String MODEL_PATH = "The whisper.cpp model path must be an absolute path to a ggml .bin file.";
    static final String MODEL_TYPE = "The whisper.cpp model must be a ggml .bin file. EVA does not download one.";
    static final String ENGLISH_ONLY = "That whisper.cpp model is English-only. Use a multilingual model such as ggml-small.bin so French and Arabic can be detected.";

    private static final Set<String> EXECUTABLES = Set.of(
            "whisper-cli",
            "whisper-cli.exe",
            "main",
            "main.exe",
            "whisper",
            "whisper.exe");

    private final Path executable;
    private final Path model;
    private final boolean gpu;
    private final int threads;
    private final EngineStatus status;

    @org.springframework.beans.factory.annotation.Autowired
    public WhisperSettings() {
        this(System.getenv("EVA_WHISPER_EXECUTABLE"), System.getenv("EVA_WHISPER_MODEL"), System.getenv("EVA_WHISPER_GPU"));
    }

    WhisperSettings(String executableValue, String modelValue, String gpuValue) {
        this.gpu = gpuEnabled(gpuValue);
        this.threads = Math.max(1, Math.min(8, Runtime.getRuntime().availableProcessors()));
        Path program = executablePath(executableValue);
        if (program == null) {
            this.executable = null;
            this.model = null;
            this.status = unavailable("missing-engine", executableDetail(executableValue));
            return;
        }
        Path weights = modelPath(modelValue);
        if (weights == null) {
            this.executable = program;
            this.model = null;
            this.status = unavailable("missing-model", modelDetail(modelValue));
            return;
        }
        this.executable = program;
        this.model = weights;
        this.status = new EngineStatus(true, "ready", 200, READY);
    }

    public EngineStatus status() {
        return status;
    }

    public Path executable() {
        return executable;
    }

    public Path model() {
        return model;
    }

    public boolean gpu() {
        return gpu;
    }

    public int threads() {
        return threads;
    }

    static boolean gpuEnabled(String value) {
        if (value == null) {
            return false;
        }
        String normalized = value.trim().toLowerCase(Locale.ROOT);
        return normalized.equals("on") || normalized.equals("vulkan") || normalized.equals("amd");
    }

    private static EngineStatus unavailable(String code, String detail) {
        return new EngineStatus(false, code, 503, detail);
    }

    private static String executableDetail(String value) {
        if (value == null || value.isBlank()) {
            return MISSING_PROGRAM;
        }
        if (unsafe(value) || !Path.of(value.trim()).isAbsolute()) {
            return PROGRAM_PATH;
        }
        Path path = Path.of(value.trim()).normalize();
        String name = fileName(path);
        if (!EXECUTABLES.contains(name)) {
            return PROGRAM_REJECTED;
        }
        return PROGRAM_NOT_FOUND;
    }

    private static String modelDetail(String value) {
        if (value == null || value.isBlank()) {
            return MISSING_MODEL;
        }
        if (unsafe(value) || !Path.of(value.trim()).isAbsolute()) {
            return MODEL_PATH;
        }
        Path path = Path.of(value.trim()).normalize();
        String name = fileName(path);
        if (name.endsWith(".en.bin")) {
            return ENGLISH_ONLY;
        }
        if (!name.endsWith(".bin")) {
            return MODEL_TYPE;
        }
        return MODEL_NOT_FOUND;
    }

    private static Path executablePath(String value) {
        Path path = absoluteFile(value);
        if (path == null || !EXECUTABLES.contains(fileName(path)) || !Files.isRegularFile(path)) {
            return null;
        }
        return path;
    }

    private static Path modelPath(String value) {
        Path path = absoluteFile(value);
        if (path == null) {
            return null;
        }
        String name = fileName(path);
        if (!name.endsWith(".bin") || name.endsWith(".en.bin") || !Files.isRegularFile(path)) {
            return null;
        }
        try {
            if (Files.size(path) <= 0) {
                return null;
            }
        } catch (IOException exception) {
            return null;
        }
        return path;
    }

    private static Path absoluteFile(String value) {
        if (value == null || value.isBlank() || unsafe(value) || !Path.of(value.trim()).isAbsolute()) {
            return null;
        }
        return Path.of(value.trim()).normalize();
    }

    private static boolean unsafe(String value) {
        return value.indexOf('\0') >= 0
                || value.indexOf('\n') >= 0
                || value.indexOf('\r') >= 0
                || value.indexOf('"') >= 0;
    }

    private static String fileName(Path path) {
        Path name = path.getFileName();
        return name == null ? "" : name.toString().toLowerCase(Locale.ROOT);
    }
}
