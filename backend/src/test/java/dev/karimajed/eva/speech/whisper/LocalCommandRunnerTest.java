package dev.karimajed.eva.speech.whisper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

import dev.karimajed.eva.conversation.CancelToken;
import dev.karimajed.eva.speech.SpeechException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

class LocalCommandRunnerTest {

    @Test
    void removesSecretEnvironmentVariables() {
        Map<String, String> environment = new HashMap<>();
        environment.put("EVA_SESSION_TOKEN", "super-secret-token-value");
        environment.put("EVA_OPENAI_API_KEY", "sk-test-value");
        environment.put("PATH", "kept");
        LocalCommandRunner.scrub(environment);
        assertFalse(environment.containsKey("EVA_SESSION_TOKEN"));
        assertFalse(environment.containsKey("EVA_OPENAI_API_KEY"));
        assertEquals("kept", environment.get("PATH"));
    }

    @Test
    void doesNotRunAMissingProgramThroughAShell() {
        SpeechException failure = assertThrows(SpeechException.class, () -> new LocalCommandRunner().run(
                List.of("definitely-missing-eva-speech-&-calc.exe"),
                Path.of(System.getProperty("java.io.tmpdir")),
                new CancelToken()));
        assertEquals("Local transcription failed.", failure.detail());
        assertFalse(failure.detail().contains("definitely-missing"));
        assertFalse(failure.detail().contains("calc"));
    }

    @Test
    @Timeout(value = 20, unit = TimeUnit.SECONDS)
    void childProcessDoesNotReceiveSecrets() throws Exception {
        String java = javaBin();
        String classpath = System.getProperty("java.class.path");
        ProcessBuilder builder = new ProcessBuilder(java, "-classpath", classpath, ProbeMain.class.getName());
        builder.environment().put("EVA_SESSION_TOKEN", "super-secret-token-value");
        builder.environment().put("EVA_OPENAI_API_KEY", "sk-test-value");
        builder.redirectError(ProcessBuilder.Redirect.DISCARD);
        Process process = builder.start();
        String output = new String(process.getInputStream().readAllBytes());
        int exit = process.waitFor();
        assertEquals(0, exit);
        assertEquals("absent", output.trim());
    }

    @Test
    @Timeout(value = 20, unit = TimeUnit.SECONDS)
    void keepsTimingNumbersAndDropsTheProcessLog() {
        CommandOutput output = new LocalCommandRunner().run(
                List.of(javaBin(), "-classpath", System.getProperty("java.class.path"), TimingProbe.class.getName()),
                Path.of(System.getProperty("java.io.tmpdir")),
                new CancelToken());
        assertEquals("hello", output.stdout());
        assertEquals(12L, output.loadMillis());
        assertEquals(40L, output.totalMillis());
    }

    static String javaBin() {
        Path home = Path.of(System.getProperty("java.home"), "bin");
        Path exe = home.resolve("java.exe");
        return Files.exists(exe) ? exe.toString() : home.resolve("java").toString();
    }

    public static final class ProbeMain {
        public static void main(String[] args) {
            try {
                String output = new LocalCommandRunner().run(
                        List.of(javaBin(), "-classpath", System.getProperty("java.class.path"), EnvProbe.class.getName()),
                        Path.of(System.getProperty("java.io.tmpdir")),
                        new CancelToken()).stdout();
                System.out.print(output.trim());
            } catch (RuntimeException exception) {
                System.out.print("failed");
            }
        }
    }

    public static final class EnvProbe {
        public static void main(String[] args) {
            boolean leaked = System.getenv("EVA_SESSION_TOKEN") != null || System.getenv("EVA_OPENAI_API_KEY") != null;
            System.out.print(leaked ? "present" : "absent");
        }
    }

    public static final class TimingProbe {
        public static void main(String[] args) {
            System.err.println("whisper_model_load: load time = 12 ms");
            System.err.println("whisper_print_timings: total time = 40 ms");
            System.err.println("secret phrase should stay in this log");
            System.out.print("hello");
        }
    }
}
