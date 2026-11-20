package dev.karimajed.jarvis.health;

import java.time.Instant;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.info.BuildProperties;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class HealthController {

    static final String SERVICE_NAME = "jarvis-backend";
    static final String FALLBACK_VERSION = "0.1.0";

    private final BuildProperties buildProperties;

    public HealthController(ObjectProvider<BuildProperties> buildProperties) {
        this.buildProperties = buildProperties.getIfAvailable();
    }

    @GetMapping(value = "/health", produces = MediaType.APPLICATION_JSON_VALUE)
    public HealthResponse health() {
        String version = buildProperties == null ? FALLBACK_VERSION : buildProperties.getVersion();
        return new HealthResponse("UP", SERVICE_NAME, version, Instant.now().toString());
    }
}
