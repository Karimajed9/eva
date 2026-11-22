package dev.karimajed.eva.security;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.turbo.TurboFilter;
import ch.qos.logback.core.spi.FilterReply;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.slf4j.LoggerFactory;
import org.slf4j.Marker;

/**
 * Drops or rewrites log events that contain the session token. The filter is
 * installed before the application context refreshes, which is when Spring
 * debug logging walks configuration.
 */
public final class TokenLogFilter extends TurboFilter {

    private static final List<String> SECRETS = new CopyOnWriteArrayList<>();
    private static volatile boolean installed;

    private TokenLogFilter() {
    }

    public static void arm(String secret) {
        arm(secret, SessionToken.MINIMUM_LENGTH);
    }

    public static void arm(String secret, int minimumLength) {
        if (secret != null && secret.length() >= minimumLength && !SECRETS.contains(secret)) {
            SECRETS.add(secret);
        }
        if (installed || SECRETS.isEmpty()) {
            return;
        }
        synchronized (TokenLogFilter.class) {
            if (installed) {
                return;
            }
            if (LoggerFactory.getILoggerFactory() instanceof LoggerContext context) {
                context.addTurboFilter(new TokenLogFilter());
                installed = true;
            }
        }
    }

    @Override
    public FilterReply decide(Marker marker, Logger logger, Level level, String format, Object[] params, Throwable throwable) {
        redact(params);
        if (mentions(format) || mentions(throwable)) {
            return FilterReply.DENY;
        }
        return FilterReply.NEUTRAL;
    }

    private static void redact(Object[] params) {
        if (params == null) {
            return;
        }
        for (int index = 0; index < params.length; index++) {
            Object param = params[index];
            if (param instanceof String text && mentions(text)) {
                params[index] = redact(text);
            } else if (param != null && mentions(String.valueOf(param))) {
                params[index] = "[redacted]";
            }
        }
    }

    private static String redact(String text) {
        String redacted = text;
        for (String secret : SECRETS) {
            redacted = redacted.replace(secret, "[redacted]");
        }
        return redacted;
    }

    private static boolean mentions(String text) {
        if (text == null || text.isEmpty()) {
            return false;
        }
        for (String secret : SECRETS) {
            if (text.contains(secret)) {
                return true;
            }
        }
        return false;
    }

    private static boolean mentions(Throwable throwable) {
        Throwable current = throwable;
        int depth = 0;
        while (current != null && depth < 8) {
            if (mentions(current.getMessage())) {
                return true;
            }
            current = current.getCause();
            depth++;
        }
        return false;
    }
}
