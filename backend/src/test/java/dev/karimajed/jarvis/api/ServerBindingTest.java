package dev.karimajed.jarvis.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

import dev.karimajed.jarvis.support.TestTokens;
import java.io.IOException;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.Socket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Enumeration;
import java.util.Optional;
import org.apache.catalina.connector.Connector;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.tomcat.TomcatWebServer;
import org.springframework.boot.web.server.servlet.context.ServletWebServerApplicationContext;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "jarvis.session-token=" + TestTokens.SESSION,
                "server.address=0.0.0.0",
                "logging.level.root=WARN"
        })
class ServerBindingTest {

    @Autowired
    private ServletWebServerApplicationContext applicationContext;

    @LocalServerPort
    private int port;

    @Test
    void staysOnLoopbackEvenWhenConfiguredForEveryInterface() throws Exception {
        TomcatWebServer webServer = (TomcatWebServer) applicationContext.getWebServer();
        Connector connector = webServer.getTomcat().getConnector();
        String boundAddress = String.valueOf(connector.getProperty("address"));
        assertTrue(boundAddress.equals("127.0.0.1") || boundAddress.endsWith("/127.0.0.1"), boundAddress);

        HttpResponse<String> response = HttpClient.newHttpClient().send(
                HttpRequest.newBuilder()
                        .uri(URI.create("http://127.0.0.1:" + port + "/api/health"))
                        .header("Authorization", "Bearer " + TestTokens.SESSION)
                        .timeout(Duration.ofSeconds(3))
                        .GET()
                        .build(),
                HttpResponse.BodyHandlers.ofString());
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("\"service\":\"jarvis-backend\""));

        Optional<InetAddress> siteAddress = siteLocalAddress();
        if (siteAddress.isEmpty()) {
            return;
        }
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(siteAddress.get(), port), 800);
            fail("Backend accepted a non-loopback connection from " + siteAddress.get());
        } catch (IOException expected) {
            // Refused or timed out: the port is not published on this interface.
        }
    }

    private static Optional<InetAddress> siteLocalAddress() throws Exception {
        Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
        while (interfaces.hasMoreElements()) {
            NetworkInterface networkInterface = interfaces.nextElement();
            if (!networkInterface.isUp() || networkInterface.isLoopback()) {
                continue;
            }
            Enumeration<InetAddress> addresses = networkInterface.getInetAddresses();
            while (addresses.hasMoreElements()) {
                InetAddress address = addresses.nextElement();
                if (address instanceof Inet4Address && !address.isLoopbackAddress()) {
                    return Optional.of(address);
                }
            }
        }
        return Optional.empty();
    }
}
