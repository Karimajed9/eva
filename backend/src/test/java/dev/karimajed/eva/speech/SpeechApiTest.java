package dev.karimajed.eva.speech;

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
class SpeechApiTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void speechRequiresTheSessionToken() throws Exception {
        mockMvc.perform(get("/api/speech").header("Host", "127.0.0.1"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(get("/api/speech").headers(desktopHeaders()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.engine").value("whisper.cpp"))
                .andExpect(jsonPath("$.available").isBoolean());
    }

    @Test
    void rejectsBrowserOriginsAndDoesNotEchoAudio() throws Exception {
        mockMvc.perform(post("/api/speech/transcribe")
                        .headers(desktopHeaders())
                        .header("Origin", "https://evil.example")
                        .contentType(MediaType.APPLICATION_OCTET_STREAM)
                        .content("secretphrase"))
                .andExpect(status().isForbidden());

        MvcResult result = mockMvc.perform(post("/api/speech/transcribe")
                        .headers(desktopHeaders())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"executable\":\"C:\\\\Windows\\\\System32\\\\cmd.exe\",\"text\":\"secretphrase\"}"))
                .andReturn();
        assertNotEquals(200, result.getResponse().getStatus());
        assertFalse(result.getResponse().getContentAsString().contains("secretphrase"));
        assertFalse(result.getResponse().getContentAsString().contains("cmd.exe"));

        MvcResult audio = mockMvc.perform(post("/api/speech/transcribe")
                        .headers(desktopHeaders())
                        .contentType(MediaType.APPLICATION_OCTET_STREAM)
                        .content("secretphrase"))
                .andReturn();
        assertNotEquals(200, audio.getResponse().getStatus());
        assertFalse(audio.getResponse().getContentAsString().contains("secretphrase"));
    }

    @Test
    void rejectsAVocabularyHintWithoutEchoingIt() throws Exception {
        String encoded = java.net.URLEncoder.encode("Muay Thai\ncalc.exe", java.nio.charset.StandardCharsets.UTF_8);
        MvcResult rejected = mockMvc.perform(post("/api/speech/transcribe")
                        .headers(desktopHeaders())
                        .header("X-Eva-Language", "en")
                        .header("X-Eva-Prompt", encoded)
                        .header("X-Eva-Recording-Ms", "1000")
                        .contentType(MediaType.APPLICATION_OCTET_STREAM)
                        .content(SpeechServiceTest.wav(WavAudio.MIN_SAMPLES)))
                .andReturn();
        assertNotEquals(200, rejected.getResponse().getStatus());
        String body = rejected.getResponse().getContentAsString();
        assertFalse(body.contains("Muay"));
        assertFalse(body.contains("calc"));
        assertFalse(body.contains("secret"));
    }

    @Test
    void cancelIsALoopbackPost() throws Exception {
        mockMvc.perform(post("/api/speech/cancel").headers(desktopHeaders()))
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
