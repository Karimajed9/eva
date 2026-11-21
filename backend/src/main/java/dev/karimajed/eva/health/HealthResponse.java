package dev.karimajed.eva.health;

public record HealthResponse(String status, String service, String version, String timestamp) {
}
