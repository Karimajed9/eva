package dev.karimajed.eva.conversation;

public final class ConversationException extends RuntimeException {

    private final String code;
    private final int status;

    public ConversationException(String code, int status, String detail) {
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
