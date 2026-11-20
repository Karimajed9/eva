package dev.karimajed.jarvis.config;

import java.net.InetAddress;
import java.net.UnknownHostException;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.boot.web.server.servlet.ConfigurableServletWebServerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;

@Configuration
public class LoopbackBindingConfig {

    /**
     * Runs after Spring Boot applies {@code server.address}, so a command-line
     * or config override cannot publish the API beyond the local machine.
     */
    @Bean
    @Order(Ordered.LOWEST_PRECEDENCE)
    public WebServerFactoryCustomizer<ConfigurableServletWebServerFactory> loopbackOnlyCustomizer() {
        return factory -> {
            try {
                factory.setAddress(InetAddress.getByName("127.0.0.1"));
            } catch (UnknownHostException exception) {
                throw new IllegalStateException("IPv4 loopback address is unavailable.", exception);
            }
            factory.setServerHeader("jarvis");
        };
    }
}
