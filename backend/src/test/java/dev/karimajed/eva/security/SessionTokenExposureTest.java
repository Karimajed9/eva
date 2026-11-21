package dev.karimajed.eva.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.fail;

import dev.karimajed.eva.EvaApplication;
import dev.karimajed.eva.support.TestTokens;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.EnumerablePropertySource;
import org.springframework.core.env.PropertySource;

@ExtendWith(OutputCaptureExtension.class)
class SessionTokenExposureTest {

    @Test
    void debugStartupKeepsTheSessionTokenOutOfLogsAndTheEnvironment(CapturedOutput output) {
        SpringApplication application = new SpringApplication(EvaApplication.class);
        try (ConfigurableApplicationContext context = application.run(
                "--eva.session-token=" + TestTokens.SESSION,
                "--server.port=0",
                "--debug",
                "--spring.main.banner-mode=off",
                "--logging.level.root=DEBUG",
                "--logging.level.org.springframework=DEBUG",
                "--logging.level.org.springframework.core.env=TRACE",
                "--logging.level.org.springframework.boot=TRACE")) {
            assertEquals(TestTokens.SESSION, context.getBean(SessionToken.class).value());
            assertNull(context.getEnvironment().getProperty("eva.session-token"));
            assertNull(context.getEnvironment().getProperty("EVA_SESSION_TOKEN"));
            if (context.getEnvironment() instanceof ConfigurableEnvironment environment) {
                environment.getPropertySources().forEach(SessionTokenExposureTest::assertSourceHidesToken);
            }
        }
        assertFalse(output.getAll().contains(TestTokens.SESSION), "session token appeared in application logs");
    }

    private static void assertSourceHidesToken(PropertySource<?> source) {
        if (source instanceof EnumerablePropertySource<?> enumerable) {
            String[] names = enumerable.getPropertyNames();
            for (String name : names) {
                if (SessionTokenEnvironmentPostProcessor.isSecretKey(name)) {
                    fail("property source " + source.getName() + " still lists the session token");
                }
                Object value = source.getProperty(name);
                if (value != null && String.valueOf(value).contains(TestTokens.SESSION)) {
                    fail("property source " + source.getName() + " still contains the session token");
                }
            }
        }
        for (String key : new String[] {"eva.session-token", "EVA_SESSION_TOKEN", "eva.session.token"}) {
            Object value = source.getProperty(key);
            if (value != null && String.valueOf(value).contains(TestTokens.SESSION)) {
                fail("property source " + source.getName() + " still exposes the session token");
            }
        }
    }
}
