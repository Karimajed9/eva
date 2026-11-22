package dev.karimajed.eva.conversation;

import java.net.URI;
import java.time.Duration;
import java.util.Map;

public interface ModelHttp {

    Response exchange(Request request, CancelToken cancel);

    record Request(String method, URI uri, String body, Duration timeout, Map<String, String> headers) {
    }

    record Response(int status, String body) {
    }
}
