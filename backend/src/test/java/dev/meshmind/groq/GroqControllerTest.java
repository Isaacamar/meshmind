package dev.meshmind.groq;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class GroqControllerTest {

    private GroqController controller;

    @BeforeEach
    void setUp() {
        controller = new GroqController(new ObjectMapper());
    }

    @Test
    void chatRejectsMissingApiKey() {
        var req = new GroqController.GroqChatRequest(
                "llama-3.1-8b-instant",
                List.of(new GroqController.GroqMessage("user", "hello")),
                0.7);

        var response = controller.chat(UUID.randomUUID(), null, req);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) response.getBody();
        assertThat(body.get("error")).isEqualTo("Groq API key required");
    }

    @Test
    void chatRejectsBlankApiKey() {
        var req = new GroqController.GroqChatRequest(
                "llama-3.1-8b-instant",
                List.of(new GroqController.GroqMessage("user", "hello")),
                0.7);

        var response = controller.chat(UUID.randomUUID(), "   ", req);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void chatRejectsNullMessages() {
        var req = new GroqController.GroqChatRequest("llama-3.1-8b-instant", null, 0.7);

        var response = controller.chat(UUID.randomUUID(), "valid-api-key", req);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) response.getBody();
        assertThat(body.get("error")).isEqualTo("messages required");
    }

    @Test
    void chatRejectsEmptyMessageList() {
        var req = new GroqController.GroqChatRequest("llama-3.1-8b-instant", List.of(), 0.7);

        var response = controller.chat(UUID.randomUUID(), "valid-api-key", req);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }
}
