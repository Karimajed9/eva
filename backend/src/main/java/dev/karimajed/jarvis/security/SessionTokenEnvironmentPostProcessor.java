package dev.karimajed.jarvis.security;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.boot.EnvironmentPostProcessor;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.context.config.ConfigDataEnvironmentPostProcessor;
import org.springframework.boot.env.OriginTrackedMapPropertySource;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.EnumerablePropertySource;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.PropertySource;
import org.springframework.core.env.SystemEnvironmentPropertySource;

/**
 * Reads the session token once, then removes it from every Spring property
 * source. The value lives on the {@link SessionToken} bean and in the process
 * environment, which this class cannot clear. It does not stay in the
 * {@link org.springframework.core.env.Environment} that debug logging inspects.
 */
public class SessionTokenEnvironmentPostProcessor implements EnvironmentPostProcessor, Ordered {

    static final String CONFIGURATION_PROPERTIES = "configurationProperties";

    @Override
    public int getOrder() {
        return ConfigDataEnvironmentPostProcessor.ORDER + 1;
    }

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        String token = capture(environment);
        TokenLogFilter.arm(token);
        scrub(environment);
        application.addInitializers(context -> context.getBeanFactory()
                .registerSingleton("sessionToken", new SessionToken(token)));
    }

    private static String capture(ConfigurableEnvironment environment) {
        for (PropertySource<?> source : environment.getPropertySources()) {
            if (!(source instanceof EnumerablePropertySource<?> enumerable)) {
                continue;
            }
            if (CONFIGURATION_PROPERTIES.equals(source.getName())) {
                continue;
            }
            for (String name : enumerable.getPropertyNames()) {
                if (!isSecretKey(name)) {
                    continue;
                }
                Object raw = source.getProperty(name);
                if (!(raw instanceof String value) || value.contains("${")) {
                    continue;
                }
                return value;
            }
        }
        return "";
    }

    private static void scrub(ConfigurableEnvironment environment) {
        List<PropertySource<?>> snapshot = new ArrayList<>();
        environment.getPropertySources().forEach(snapshot::add);
        for (PropertySource<?> source : snapshot) {
            if (CONFIGURATION_PROPERTIES.equals(source.getName())) {
                continue;
            }
            if (source instanceof MapPropertySource map && containsSecret(map)) {
                environment.getPropertySources().replace(map.getName(), copyWithoutSecret(map));
            } else if (source instanceof EnumerablePropertySource<?> enumerable && containsSecret(enumerable)) {
                environment.getPropertySources().replace(enumerable.getName(), new HiddenSecretSource(enumerable));
            }
        }
    }

    private static boolean containsSecret(EnumerablePropertySource<?> source) {
        return Arrays.stream(source.getPropertyNames()).anyMatch(SessionTokenEnvironmentPostProcessor::isSecretKey);
    }

    private static PropertySource<?> copyWithoutSecret(MapPropertySource source) {
        Map<String, Object> copy = new LinkedHashMap<>();
        for (String name : source.getPropertyNames()) {
            if (isSecretKey(name)) {
                continue;
            }
            copy.put(name, source.getProperty(name));
        }
        if (source instanceof SystemEnvironmentPropertySource) {
            return new SystemEnvironmentPropertySource(source.getName(), copy);
        }
        if (source instanceof OriginTrackedMapPropertySource) {
            return new OriginTrackedMapPropertySource(source.getName(), copy);
        }
        return new MapPropertySource(source.getName(), copy);
    }

    static boolean isSecretKey(String key) {
        String normalized = key.toLowerCase(Locale.ROOT).replace('-', '.').replace('_', '.');
        return "jarvis.session.token".equals(normalized);
    }

    private static final class HiddenSecretSource extends EnumerablePropertySource<EnumerablePropertySource<?>> {

        private HiddenSecretSource(EnumerablePropertySource<?> delegate) {
            super(delegate.getName(), delegate);
        }

        @Override
        public String[] getPropertyNames() {
            return Arrays.stream(this.source.getPropertyNames())
                    .filter(name -> !isSecretKey(name))
                    .toArray(String[]::new);
        }

        @Override
        public Object getProperty(String name) {
            if (isSecretKey(name)) {
                return null;
            }
            return this.source.getProperty(name);
        }
    }
}
