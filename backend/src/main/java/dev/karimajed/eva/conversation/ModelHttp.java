package dev.karimajed.eva.conversation;

import java.net.URI;
import java.time.Duration;
import java.util.Map;

public interface ModelHttp {

    Response exchange(Request request, CancelToken cancel);

    default void stream(Request request, CancelToken cancel, StreamConsumer consumer) {
        Response response = exchange(request, cancel);
        consumer.status(response.status());
        if (response.body() == null || response.body().isEmpty()) {
            return;
        }
        for (String line : response.body().split("\\R", -1)) {
            if (!line.isEmpty()) {
                consumer.line(line);
            }
        }
    }

    record Request(String method, URI uri, String body, Duration timeout, Map<String, String> headers) {
    }

    record Response(int status, String body) {
    }

    interface StreamConsumer {
        void status(int status);

        void line(String line);
    }
}
