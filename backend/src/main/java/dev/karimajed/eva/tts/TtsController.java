package dev.karimajed.eva.tts;

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
@RequestMapping("/api/tts")
public class TtsController {

    private final TtsService speech;

    public TtsController(TtsService speech) {
        this.speech = speech;
    }

    @GetMapping
    public TtsState status() {
        return speech.status();
    }

    @PostMapping(value = "/synthesize", consumes = MediaType.APPLICATION_JSON_VALUE, produces = "audio/wav")
    public ResponseEntity<byte[]> synthesize(@RequestBody byte[] body) {
        TtsAudio audio = speech.synthesize(TtsRequest.parse(body));
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("audio/wav"))
                .header("X-Eva-Elapsed-Ms", Long.toString(audio.elapsedMs()))
                .header("X-Eva-Load-Ms", audio.loadMs() == null ? "" : Long.toString(audio.loadMs()))
                .header("X-Eva-Audio-Ms", Integer.toString(audio.audioMs()))
                .header("X-Eva-Sample-Rate", Integer.toString(audio.sampleRate()))
                .body(audio.wav());
    }

    @PostMapping("/cancel")
    public Map<String, String> cancel() {
        speech.cancel();
        return Map.of("status", "CANCELLED");
    }

    @ExceptionHandler(TtsException.class)
    public ResponseEntity<Map<String, String>> failed(TtsException exception) {
        return ResponseEntity.status(exception.status()).body(Map.of(
                "error", exception.code(),
                "detail", exception.detail()));
    }
}
