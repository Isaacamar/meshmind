package dev.meshmind.groq;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/groq")
public class GroqController {

    private static final String GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

    private final ObjectMapper mapper;
    private final HttpClient http;

    public GroqController(ObjectMapper mapper) {
        this.mapper = mapper;
        this.http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    public record GroqMessage(String role, String content) {}

    public record GroqChatRequest(
            String model,
            List<GroqMessage> messages,
            Double temperature) {}

    @PostMapping("/chat")
    public ResponseEntity<?> chat(
            @AuthenticationPrincipal UUID userId,
            @RequestHeader(name = "X-Groq-Api-Key", required = false) String apiKey,
            @RequestBody GroqChatRequest req) {
        if (apiKey == null || apiKey.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Groq API key required"));
        }
        if (req.messages() == null || req.messages().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "messages required"));
        }

        String model = req.model() == null || req.model().isBlank()
                ? "llama-3.1-8b-instant"
                : req.model().trim();
        double temperature = req.temperature() == null ? 0.7 : Math.max(0, Math.min(req.temperature(), 2));

        try {
            String body = mapper.writeValueAsString(Map.of(
                    "model", model,
                    "messages", req.messages(),
                    "temperature", temperature,
                    "max_tokens", 2048
            ));

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(GROQ_CHAT_URL))
                    .timeout(Duration.ofSeconds(60))
                    .header("Authorization", "Bearer " + apiKey.trim())
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();

            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 400) {
                return ResponseEntity.status(502).body(Map.of("error", response.body()));
            }

            JsonNode root = mapper.readTree(response.body());
            String content = root.path("choices").path(0).path("message").path("content").asText("");
            JsonNode usage = root.path("usage");
            return ResponseEntity.ok(Map.of(
                    "content", content,
                    "model", root.path("model").asText(model),
                    "usage", mapper.convertValue(usage, Map.class)
            ));
        } catch (Exception e) {
            return ResponseEntity.status(502).body(Map.of("error", "Groq request failed: " + e.getMessage()));
        }
    }
}
