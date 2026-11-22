package dev.karimajed.eva.conversation;

import dev.karimajed.eva.conversation.ConversationModels.SendCommand;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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

    @PostMapping
    public ConversationModels.Reply send(@RequestBody SendCommand command) {
        return conversations.send(command);
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
