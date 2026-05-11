package dev.meshmind.market;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
public class EmbeddingService {

    private static final String NOMIC_URL = "https://api-atlas.nomic.ai/v1/embedding/text";

    @Value("${meshmind.nomic.api-key:}")
    private String apiKey;

    private final ObjectMapper mapper;
    private final HttpClient http;

    public EmbeddingService(ObjectMapper mapper) {
        this.mapper = mapper;
        this.http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank();
    }

    /** Calls Nomic Atlas API to embed text. Returns a 768-dim vector. */
    public List<Float> embed(String text) throws Exception {
        String body = mapper.writeValueAsString(Map.of(
                "model", "nomic-embed-text-v1",
                "texts", List.of(text),
                "task_type", "search_query"
        ));

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(NOMIC_URL))
                .timeout(Duration.ofSeconds(15))
                .header("Authorization", "Bearer " + apiKey.trim())
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();

        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 400) {
            throw new RuntimeException("Nomic API error " + response.statusCode() + ": " + response.body());
        }

        JsonNode root = mapper.readTree(response.body());
        JsonNode embNode = root.path("embeddings").path(0);
        List<Float> embedding = new ArrayList<>(768);
        for (JsonNode v : embNode) {
            embedding.add((float) v.asDouble());
        }
        if (embedding.isEmpty()) {
            throw new RuntimeException("Nomic API returned empty embedding");
        }
        return embedding;
    }
}
