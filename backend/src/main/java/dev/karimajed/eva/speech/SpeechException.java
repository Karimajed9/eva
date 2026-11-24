package dev.karimajed.eva.speech;

public final class SpeechException extends RuntimeException {

    private final String code;
    private final int status;

    public SpeechException(String code, int status, String detail) {
        super(detail);
        this.code = code;
        this.status = status;
    }

    public String code() {
        return code;
    }

    public int status() {
        return status;
    }

    public String detail() {
        return getMessage();
    }
}
