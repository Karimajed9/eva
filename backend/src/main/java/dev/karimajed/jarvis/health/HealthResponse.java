package dev.karimajed.jarvis.health;

public record HealthResponse(String status, String service, String version, String timestamp) {
}
