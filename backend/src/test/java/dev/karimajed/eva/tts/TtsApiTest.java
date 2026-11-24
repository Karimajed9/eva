package dev.karimajed.eva.tts;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import dev.karimajed.eva.support.TestTokens;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest(properties = {
        "eva.session-token=" + TestTokens.SESSION,
        "logging.level.root=WARN"
})
@AutoConfigureMockMvc
class TtsApiTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void speechPlaybackRequiresTheSessionAndDoesNotEchoText() throws Exception {
        mockMvc.perform(get("/api/tts").header("Host", "127.0.0.1"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/tts").headers(desktopHeaders()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.engine").value("kokoro"))
                .andExpect(jsonPath("$.available").isBoolean());

        MvcResult rejected = mockMvc.perform(post("/api/tts/synthesize")
                        .headers(desktopHeaders())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voice\":\"af_heart\",\"speed\":1,\"text\":\"secretphrase\",\"executable\":\"cmd.exe\"}"))
                .andReturn();
        assertNotEquals(200, rejected.getResponse().getStatus());
        assertFalse(rejected.getResponse().getContentAsString().contains("secretphrase"));
        assertFalse(rejected.getResponse().getContentAsString().contains("cmd.exe"));
    }

    @Test
    void cancelIsALoopbackPost() throws Exception {
        mockMvc.perform(post("/api/tts/cancel").headers(desktopHeaders()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));
    }

    private static HttpHeaders desktopHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.set("Host", "127.0.0.1");
        headers.set("Authorization", "Bearer " + TestTokens.SESSION);
        return headers;
    }
}
