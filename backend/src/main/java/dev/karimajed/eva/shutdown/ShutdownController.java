package dev.karimajed.eva.shutdown;

import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class ShutdownController {

    private final ShutdownTrigger shutdownTrigger;

    public ShutdownController(ShutdownTrigger shutdownTrigger) {
        this.shutdownTrigger = shutdownTrigger;
    }

    @PostMapping(value = "/shutdown", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, String>> shutdown() {
        shutdownTrigger.requestShutdown();
        return ResponseEntity.accepted().body(Map.of("status", "SHUTTING_DOWN"));
    }
}
