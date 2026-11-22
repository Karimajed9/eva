package dev.karimajed.eva.conversation;

import dev.karimajed.eva.conversation.ConversationModels.Reply;
import dev.karimajed.eva.conversation.ConversationModels.SendCommand;
import java.io.IOException;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

@RestController
@RequestMapping("/api/conversation")
public class ConversationController {

    private final ConversationService conversations;

    public ConversationController(ConversationService conversations) {
        this.conversations = conversations;
    }

    @GetMapping
    public ConversationService.Catalog catalog() {
        return conversations.catalog();
    }

    @PostMapping(produces = "application/x-ndjson")
    public ResponseEntity<StreamingResponseBody> send(@RequestBody SendCommand command) {
        ConversationService.Prepared prepared = conversations.prepare(command);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/x-ndjson"))
                .header("Cache-Control", "no-store")
                .header("X-Accel-Buffering", "no")
                .body(output -> {
                    StreamLines lines = new StreamLines(output);
                    try {
                        Reply reply = conversations.emit(prepared, text -> {
                            try {
                                lines.delta(text);
                            } catch (IOException exception) {
                                throw new ConversationException("cancelled", 409, "The reply stream closed before it finished.");
                            }
                        });
                        lines.done(reply);
                    } catch (ConversationException exception) {
                        try {
                            lines.error(exception);
                        } catch (IOException ignored) {
                            // The client is already gone, and the in-flight reply was released.
                        }
                    }
                });
    }

    @PostMapping("/reset")
    public ConversationService.Catalog reset() {
        conversations.reset();
        return conversations.catalog();
    }

    @PostMapping("/cancel")
    public Map<String, String> cancel() {
        conversations.cancel();
        return Map.of("status", "CANCELLED");
    }

    @ExceptionHandler(ConversationException.class)
    public ResponseEntity<Map<String, String>> failed(ConversationException exception) {
        return ResponseEntity.status(exception.status()).body(Map.of(
                "error", exception.code(),
                "detail", exception.detail()));
    }
}
