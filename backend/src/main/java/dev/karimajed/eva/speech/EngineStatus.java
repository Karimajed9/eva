package dev.karimajed.eva.speech;

public record EngineStatus(boolean available, String code, int httpStatus, String detail) {
}
