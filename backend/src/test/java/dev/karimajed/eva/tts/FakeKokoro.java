package dev.karimajed.eva.tts;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

public final class FakeKokoro {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final int SAMPLES = 2_400;

    private FakeKokoro() {
    }

    public static void main(String[] args) throws Exception {
        boolean leaked = System.getenv("EVA_SESSION_TOKEN") != null || System.getenv("EVA_OPENAI_API_KEY") != null;
        if (leaked) {
            System.out.write("{\"type\":\"ready\",\"ok\":false,\"code\":\"missing-runtime\"}\n".getBytes(StandardCharsets.UTF_8));
            System.out.flush();
            return;
        }
        System.out.write("{\"type\":\"ready\",\"ok\":true,\"loadMs\":15}\n".getBytes(StandardCharsets.UTF_8));
        System.out.flush();
        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        String line;
        while ((line = reader.readLine()) != null) {
            JsonNode message = JSON.readTree(line);
            String op = message.path("op").asText("");
            if ("shutdown".equals(op)) {
                return;
            }
            if ("cancel".equals(op)) {
                String id = message.path("id").asText("cancelled");
                System.out.write(("{\"type\":\"result\",\"id\":\"" + safe(id) + "\",\"ok\":false,\"code\":\"cancelled\"}\n")
                        .getBytes(StandardCharsets.UTF_8));
                System.out.flush();
                continue;
            }
            if (!"synthesize".equals(op)) {
                continue;
            }
            String text = message.path("text").asText("");
            String id = safe(message.path("id").asText(""));
            if (text.contains("please-crash-now")) {
                System.exit(3);
            }
            if (text.contains("please-wait")) {
                continue;
            }
            byte[] header = ("{\"type\":\"result\",\"id\":\"" + id + "\",\"ok\":true,\"sampleRate\":24000,\"samples\":"
                    + SAMPLES + ",\"elapsedMs\":9,\"loadMs\":0}\n").getBytes(StandardCharsets.UTF_8);
            System.out.write(header);
            System.out.write(new byte[SAMPLES * 2]);
            System.out.flush();
        }
    }

    private static String safe(String id) {
        return id.matches("[A-Za-z0-9_-]{1,40}") ? id : "invalid";
    }
}
