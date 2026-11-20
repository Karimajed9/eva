package dev.karimajed.jarvis;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ConfigurableApplicationContext;

class JarvisApplicationStartupTest {

    @Test
    void refusesToStartWithoutASessionToken() {
        SpringApplication application = new SpringApplication(JarvisApplication.class);
        Exception failure = assertThrows(Exception.class, () -> {
            try (ConfigurableApplicationContext ignored = application.run(
                    "--jarvis.session-token=",
                    "--server.port=0",
                    "--spring.main.web-application-type=servlet",
                    "--spring.main.banner-mode=off",
                    "--logging.level.root=OFF")) {
                // Startup must fail before this block runs.
            }
        });
        assertTrue(mentionsSessionToken(failure), failure.toString());
    }

    private static boolean mentionsSessionToken(Throwable failure) {
        Throwable current = failure;
        while (current != null) {
            if (current.getMessage() != null && current.getMessage().contains("JARVIS_SESSION_TOKEN")) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }
}
