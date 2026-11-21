package dev.karimajed.eva.api;

import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import dev.karimajed.eva.shutdown.ShutdownTrigger;
import dev.karimajed.eva.support.TestTokens;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {
        "eva.session-token=" + TestTokens.SESSION,
        "logging.level.root=WARN"
})
@AutoConfigureMockMvc
class ApiSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ShutdownTrigger shutdownTrigger;

    @Test
    void healthRequiresTheSessionTokenAndReturnsAFixedShape() throws Exception {
        mockMvc.perform(get("/api/health").headers(desktopHeaders()))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.service").value("eva-backend"))
                .andExpect(jsonPath("$.version").value("0.1.0"))
                .andExpect(jsonPath("$.timestamp").exists());
    }

    @Test
    void healthRejectsMissingAndWrongTokens() throws Exception {
        mockMvc.perform(get("/api/health").header("Host", "127.0.0.1"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("unauthorized"))
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString(TestTokens.SESSION))));

        mockMvc.perform(get("/api/health")
                        .header("Host", "127.0.0.1")
                        .header("Authorization", "Bearer " + "x".repeat(40)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void healthRejectsNonLoopbackClientsAndForeignHosts() throws Exception {
        mockMvc.perform(get("/api/health")
                        .headers(desktopHeaders())
                        .with(request -> {
                            request.setRemoteAddr("8.8.8.8");
                            return request;
                        }))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/health")
                        .header("Authorization", "Bearer " + TestTokens.SESSION)
                        .header("Host", "evil.example"))
                .andExpect(status().isForbidden());
    }

    @Test
    void shutdownAcceptsTheDesktopClientAndRejectsBrowserOrigins() throws Exception {
        mockMvc.perform(post("/api/shutdown").headers(desktopHeaders()))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("SHUTTING_DOWN"));
        verify(shutdownTrigger).requestShutdown();

        mockMvc.perform(post("/api/shutdown")
                        .headers(desktopHeaders())
                        .header("Origin", "https://evil.example"))
                .andExpect(status().isForbidden());
        verify(shutdownTrigger, times(1)).requestShutdown();
    }

    private static org.springframework.http.HttpHeaders desktopHeaders() {
        org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
        headers.set("Host", "127.0.0.1");
        headers.set("Authorization", "Bearer " + TestTokens.SESSION);
        return headers;
    }
}
