package dev.karimajed.eva.conversation;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.springframework.stereotype.Component;

@Component
public class JdkModelHttp implements ModelHttp {

    private final HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofMillis(800))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();
    private final ScheduledExecutorService timers = Executors.newSingleThreadScheduledExecutor(task -> {
        Thread thread = new Thread(task, "eva-model-timeout");
        thread.setDaemon(true);
        return thread;
    });

    @Override
    public Response exchange(Request request, CancelToken cancel) {
        if (cancel.isCancelled()) {
            throw new ConversationException("cancelled", 409, "The reply was cancelled.");
        }
        HttpRequest.Builder builder = HttpRequest.newBuilder(request.uri())
                .timeout(request.timeout())
                .header("Accept", "application/json");
        request.headers().forEach(builder::header);
        if ("POST".equals(request.method())) {
            builder.header("Content-Type", "application/json");
            builder.POST(HttpRequest.BodyPublishers.ofString(request.body() == null ? "" : request.body()));
        } else {
            builder.GET();
        }
        CompletableFuture<HttpResponse<String>> future = client.sendAsync(builder.build(), HttpResponse.BodyHandlers.ofString());
        cancel.attach(future);
        try {
            HttpResponse<String> response = future.get(request.timeout().toMillis() + 1_000, TimeUnit.MILLISECONDS);
            String body = response.body() == null ? "" : response.body();
            if (body.length() > 1_000_000) {
                throw new ConversationException("provider-error", 502, "The model response was larger than expected.");
            }
            return new Response(response.statusCode(), body);
        } catch (ConversationException exception) {
            throw exception;
        } catch (TimeoutException exception) {
            future.cancel(true);
            throw new ConversationException("unavailable", 503, "The model did not answer before the timeout.");
        } catch (CancellationException exception) {
            throw new ConversationException("cancelled", 409, "The reply was cancelled.");
        } catch (ExecutionException exception) {
            if (cancel.isCancelled() || exception.getCause() instanceof CancellationException) {
                throw new ConversationException("cancelled", 409, "The reply was cancelled.");
            }
            throw new ConversationException("unavailable", 503, "The model server could not be reached.");
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ConversationException("cancelled", 409, "The reply was cancelled.");
        }
    }

    @Override
    public void stream(Request request, CancelToken cancel, StreamConsumer consumer) {
        if (cancel.isCancelled()) {
            throw new ConversationException("cancelled", 409, "The reply was cancelled.");
        }
        HttpRequest.Builder builder = HttpRequest.newBuilder(request.uri())
                .timeout(request.timeout())
                .header("Accept", "application/x-ndjson, application/json");
        request.headers().forEach(builder::header);
        if ("POST".equals(request.method())) {
            builder.header("Content-Type", "application/json");
            builder.POST(HttpRequest.BodyPublishers.ofString(request.body() == null ? "" : request.body()));
        } else {
            builder.GET();
        }
        CompletableFuture<HttpResponse<InputStream>> future = client.sendAsync(
                builder.build(),
                HttpResponse.BodyHandlers.ofInputStream());
        cancel.attach(future);
        HttpResponse<InputStream> response;
        try {
            response = future.get(request.timeout().toMillis() + 1_000, TimeUnit.MILLISECONDS);
        } catch (ConversationException exception) {
            throw exception;
        } catch (TimeoutException exception) {
            future.cancel(true);
            throw new ConversationException("unavailable", 503, "The model did not answer before the timeout.");
        } catch (CancellationException exception) {
            throw new ConversationException("cancelled", 409, "The reply was cancelled.");
        } catch (ExecutionException exception) {
            if (cancel.isCancelled() || exception.getCause() instanceof CancellationException) {
                throw new ConversationException("cancelled", 409, "The reply was cancelled.");
            }
            throw new ConversationException("unavailable", 503, "The model server could not be reached.");
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ConversationException("cancelled", 409, "The reply was cancelled.");
        }
        InputStream body = response.body();
        cancel.onCancel(() -> closeQuietly(body));
        ScheduledFuture<?> timeout = timers.schedule(() -> closeQuietly(body), request.timeout().toMillis(), TimeUnit.MILLISECONDS);
        consumer.status(response.statusCode());
        if (response.statusCode() != 200) {
            timeout.cancel(false);
            closeQuietly(body);
            return;
        }
        long total = 0;
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(body, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (cancel.isCancelled()) {
                    throw new ConversationException("cancelled", 409, "The reply was cancelled.");
                }
                if (timeout.isDone()) {
                    throw new ConversationException("unavailable", 503, "The model did not answer before the timeout.");
                }
                total += line.length();
                if (total > 1_000_000) {
                    throw new ConversationException("provider-error", 502, "The model response was larger than expected.");
                }
                if (!line.isEmpty()) {
                    consumer.line(line);
                }
            }
        } catch (ConversationException exception) {
            throw exception;
        } catch (IOException exception) {
            if (cancel.isCancelled() || timeout.isDone()) {
                throw cancel.isCancelled()
                        ? new ConversationException("cancelled", 409, "The reply was cancelled.")
                        : new ConversationException("unavailable", 503, "The model did not answer before the timeout.");
            }
            throw new ConversationException("unavailable", 503, "The model server could not be reached.");
        } finally {
            timeout.cancel(false);
        }
    }

    private static void closeQuietly(InputStream body) {
        try {
            body.close();
        } catch (IOException ignored) {
            // Closing a cancelled stream is cleanup, not a second error.
        }
    }
}
