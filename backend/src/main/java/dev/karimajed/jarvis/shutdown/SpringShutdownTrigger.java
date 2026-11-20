package dev.karimajed.jarvis.shutdown;

import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Component;

@Component
public class SpringShutdownTrigger implements ShutdownTrigger {

    private final ApplicationContext applicationContext;
    private final AtomicBoolean requested = new AtomicBoolean(false);

    public SpringShutdownTrigger(ApplicationContext applicationContext) {
        this.applicationContext = applicationContext;
    }

    @Override
    public void requestShutdown() {
        if (!requested.compareAndSet(false, true)) {
            return;
        }
        Thread thread = new Thread(() -> {
            try {
                Thread.sleep(150);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
            }
            SpringApplication.exit(applicationContext, () -> 0);
        }, "jarvis-shutdown");
        thread.setDaemon(true);
        thread.start();
    }
}
