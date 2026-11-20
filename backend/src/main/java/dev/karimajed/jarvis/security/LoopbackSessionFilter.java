package dev.karimajed.jarvis.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class LoopbackSessionFilter extends OncePerRequestFilter {

    static final String BEARER_PREFIX = "Bearer ";

    private final SessionToken sessionToken;

    public LoopbackSessionFilter(SessionToken sessionToken) {
        this.sessionToken = sessionToken;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {
        if (!isLoopbackRemote(request.getRemoteAddr())) {
            reject(response, HttpServletResponse.SC_FORBIDDEN, "forbidden");
            return;
        }
        if (!isAllowedHost(request.getHeader("Host"))) {
            reject(response, HttpServletResponse.SC_FORBIDDEN, "forbidden");
            return;
        }
        if ("POST".equalsIgnoreCase(request.getMethod()) && request.getHeader("Origin") != null) {
            reject(response, HttpServletResponse.SC_FORBIDDEN, "forbidden");
            return;
        }

        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith(BEARER_PREFIX)) {
            reject(response, HttpServletResponse.SC_UNAUTHORIZED, "unauthorized");
            return;
        }
        String presented = header.substring(BEARER_PREFIX.length()).trim();
        if (!TokenComparer.matches(sessionToken.value(), presented)) {
            reject(response, HttpServletResponse.SC_UNAUTHORIZED, "unauthorized");
            return;
        }

        filterChain.doFilter(request, response);
    }

    static boolean isAllowedHost(String hostHeader) {
        if (hostHeader == null) {
            return false;
        }
        String host = hostHeader.trim().toLowerCase(Locale.ROOT);
        if (host.isEmpty() || host.contains("@") || host.contains(" ")) {
            return false;
        }
        if (host.startsWith("[::1]")) {
            String remainder = host.substring("[::1]".length());
            return remainder.isEmpty() || remainder.matches(":[0-9]{1,5}");
        }

        String hostname = host;
        int colon = host.lastIndexOf(':');
        if (colon > 0 && host.indexOf(':') == colon) {
            String port = host.substring(colon + 1);
            if (!port.matches("[0-9]{1,5}")) {
                return false;
            }
            hostname = host.substring(0, colon);
        }
        return hostname.equals("localhost") || hostname.equals("127.0.0.1") || hostname.equals("::1");
    }

    static boolean isLoopbackRemote(String remoteAddress) {
        if (remoteAddress == null) {
            return false;
        }
        String value = remoteAddress.trim();
        if (value.isEmpty() || !value.matches("[0-9a-fA-F:.]+")) {
            return false;
        }
        try {
            return InetAddress.getByName(value).isLoopbackAddress();
        } catch (Exception exception) {
            return false;
        }
    }

    private static void reject(HttpServletResponse response, int status, String code) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write("{\"error\":\"" + code + "\"}");
    }
}
