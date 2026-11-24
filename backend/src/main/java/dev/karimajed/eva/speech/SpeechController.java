package dev.karimajed.eva.speech;

import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/speech")
public class SpeechController {

    private final SpeechService speech;

    public SpeechController(SpeechService speech) {
        this.speech = speech;
    }

    @GetMapping
    public SpeechStatus status() {
        return speech.status();
    }

    @PostMapping(value = "/transcribe", consumes = MediaType.APPLICATION_OCTET_STREAM_VALUE)
    public SpeechTranscript transcribe(@RequestBody byte[] audio) {
        return new SpeechTranscript(speech.transcribe(audio));
    }

    @PostMapping("/cancel")
    public Map<String, String> cancel() {
        speech.cancel();
        return Map.of("status", "CANCELLED");
    }

    @ExceptionHandler(SpeechException.class)
    public ResponseEntity<Map<String, String>> failed(SpeechException exception) {
        return ResponseEntity.status(exception.status()).body(Map.of(
                "error", exception.code(),
                "detail", exception.detail()));
    }
}
