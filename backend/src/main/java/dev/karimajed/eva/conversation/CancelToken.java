package dev.karimajed.eva.conversation;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

public final class CancelToken {

    private final AtomicBoolean cancelled = new AtomicBoolean();
    private final AtomicReference<CompletableFuture<?>> call = new AtomicReference<>();
    private final AtomicReference<Runnable> hook = new AtomicReference<>();

    public void cancel() {
        cancelled.set(true);
        CompletableFuture<?> current = call.getAndSet(null);
        if (current != null) {
            current.cancel(true);
        }
        Runnable action = hook.getAndSet(null);
        if (action != null) {
            action.run();
        }
    }

    public boolean isCancelled() {
        return cancelled.get();
    }

    public void attach(CompletableFuture<?> future) {
        if (future == null) {
            return;
        }
        if (cancelled.get()) {
            future.cancel(true);
            return;
        }
        call.set(future);
        if (cancelled.get()) {
            future.cancel(true);
            call.compareAndSet(future, null);
        }
    }

    public void onCancel(Runnable action) {
        if (action == null) {
            return;
        }
        if (cancelled.get()) {
            action.run();
            return;
        }
        hook.set(action);
        if (cancelled.get()) {
            action.run();
            hook.compareAndSet(action, null);
        }
    }
}
