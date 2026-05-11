package dev.meshmind.market;

import dev.meshmind.user.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MarketControllerTest {

    private MarketRepository market;
    private UserRepository users;
    private MarketController controller;

    @BeforeEach
    void setUp() {
        market = mock(MarketRepository.class);
        users = mock(UserRepository.class);
        controller = new MarketController(market, users);
        ReflectionTestUtils.setField(controller, "verbatimThreshold", 0.90);
        ReflectionTestUtils.setField(controller, "repackageThreshold", 0.70);
        ReflectionTestUtils.setField(controller, "publishBonus", 5);
        ReflectionTestUtils.setField(controller, "consumeRoyalty", 1);
        ReflectionTestUtils.setField(controller, "embeddingDims", 3);
    }

    @Test
    void searchRejectsWrongEmbeddingDimensions() {
        var response = controller.search(new MarketController.SearchRequest(List.of(0.1f, 0.2f), 3));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) response.getBody();
        assertThat(body.get("error")).isEqualTo("embedding must be 3 dims, got 2");
    }

    @Test
    void searchClassifiesVerbatimRepackageAndMissResults() {
        when(market.search(new float[] {0.1f, 0.2f, 0.3f}, 3)).thenReturn(List.of(
                entry(0.95f),
                entry(0.75f),
                entry(0.45f)
        ));

        var response = controller.search(new MarketController.SearchRequest(List.of(0.1f, 0.2f, 0.3f), 3));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) response.getBody();
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> results = (List<Map<String, Object>>) body.get("results");
        assertThat(results).extracting(row -> row.get("mode"))
                .containsExactly("verbatim", "repackage", "miss");
    }

    @Test
    void publishRejectsWrongEmbeddingDimensions() {
        UUID userId = UUID.randomUUID();

        var response = controller.publish(userId, new MarketController.PublishRequest(
                "prompt", "response", "llama", List.of(0.1f, 0.2f), List.of("demo")));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody()).isEqualTo(Map.of("error", "embedding must be 3 dims"));
    }

    @Test
    void publishStoresEntryAndAwardsCredits() {
        UUID userId = UUID.randomUUID();
        UUID entryId = UUID.randomUUID();
        when(market.insert(
                org.mockito.ArgumentMatchers.eq(userId),
                org.mockito.ArgumentMatchers.eq("prompt"),
                org.mockito.ArgumentMatchers.eq("response"),
                org.mockito.ArgumentMatchers.eq("llama"),
                org.mockito.ArgumentMatchers.any(float[].class),
                org.mockito.ArgumentMatchers.eq(List.of("demo"))
        )).thenReturn(entryId);

        var response = controller.publish(userId, new MarketController.PublishRequest(
                "prompt", "response", "llama", List.of(0.1f, 0.2f, 0.3f), List.of("demo")));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isEqualTo(Map.of("id", entryId, "creditsEarned", 5));
        verify(users).adjustCredits(userId, 5);
        verify(market).logCreditEvent(userId, 5, "publish_bonus", entryId);
    }

    @Test
    void consumeReturnsNotFoundForMissingEntry() {
        UUID entryId = UUID.randomUUID();
        when(market.findById(entryId)).thenReturn(Optional.empty());

        var response = controller.consume(UUID.randomUUID(), new MarketController.ConsumeRequest(entryId));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(response.getBody()).isEqualTo(Map.of("error", "entry not found"));
    }

    @Test
    void consumeRecordsUsageAndPaysAuthorRoyalty() {
        UUID consumerId = UUID.randomUUID();
        UUID authorId = UUID.randomUUID();
        UUID entryId = UUID.randomUUID();
        when(market.findById(entryId)).thenReturn(Optional.of(entry(entryId, authorId, 1.0f)));

        var response = controller.consume(consumerId, new MarketController.ConsumeRequest(entryId));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isEqualTo(Map.of("royaltyPaid", 1));
        verify(market).incrementConsumeCount(entryId);
        verify(market).recordConsumption(entryId, consumerId, "verbatim", 1.0f);
        verify(users).adjustCredits(authorId, 1);
        verify(market).logCreditEvent(authorId, 1, "consume_royalty", entryId);
    }

    private static MarketEntry entry(Float similarity) {
        return entry(UUID.randomUUID(), UUID.randomUUID(), similarity);
    }

    private static MarketEntry entry(UUID id, UUID authorId, Float similarity) {
        return new MarketEntry(
                id,
                authorId,
                "ada",
                "prompt",
                "response",
                "llama",
                List.of("demo"),
                0,
                0,
                0,
                Instant.now(),
                similarity
        );
    }
}
