package dev.karimajed.eva.speech;

import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
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
    public SpeechTranscript transcribe(
            @RequestHeader(value = "X-Eva-Language", required = false) String language,
            @RequestHeader(value = "X-Eva-Prompt", required = false) String prompt,
            @RequestHeader(value = "X-Eva-Recording-Ms", required = false) String recordingMs,
            @RequestBody byte[] audio) {
        return speech.transcribe(audio, SpeechHints.parse(language, prompt, recordingMs));
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
