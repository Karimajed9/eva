package dev.karimajed.jarvis.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class SessionTokenConfiguration {

    @Bean
    public SessionToken sessionToken(@Value("${jarvis.session-token:}") String configuredToken) {
        return new SessionToken(configuredToken);
    }
}
