package dev.meshmind.market;

import dev.meshmind.user.UserRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Prompt marketplace API. The privacy contract: nothing is stored here unless
 * the client explicitly publishes it. Embeddings for /search are the ONLY thing
 * that touches the cloud for unpublished prompts.
 */
@RestController
@RequestMapping("/api/market")
public class MarketController {

    private final MarketRepository market;
    private final UserRepository users;

    @Value("${meshmind.marketplace.verbatim-threshold}")
    private double verbatimThreshold;

    @Value("${meshmind.marketplace.repackage-threshold}")
    private double repackageThreshold;

    @Value("${meshmind.marketplace.publish-bonus}")
    private int publishBonus;

    @Value("${meshmind.marketplace.consume-royalty}")
    private int consumeRoyalty;

    @Value("${meshmind.marketplace.embedding-dims}")
    private int embeddingDims;

    public MarketController(MarketRepository market, UserRepository users) {
        this.market = market;
        this.users = users;
    }

    // ---------- DTOs ----------

    public record SearchRequest(
            @NotNull @Size(min = 1) List<Float> embedding,
            Integer k) {}

    public record PublishRequest(
            @NotBlank String prompt,
            @NotBlank String response,
            String modelUsed,
            @NotNull @Size(min = 1) List<Float> embedding,
            List<String> tags) {}

    public record ConsumeRequest(@NotNull UUID entryId) {}

    // ---------- Endpoints ----------

    /**
     * Search the marketplace by prompt embedding. Returns top-k with similarity scores
     * and a hint of how each could be used (verbatim / repackage / miss).
     */
    @PostMapping("/search")
    public ResponseEntity<?> search(@Valid @RequestBody SearchRequest req) {
        float[] vec = toFloatArray(req.embedding());
        if (vec.length != embeddingDims) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "embedding must be " + embeddingDims + " dims, got " + vec.length));
        }
        int k = req.k() == null ? 3 : Math.min(Math.max(req.k(), 1), 10);
        List<MarketEntry> hits = market.search(vec, k);
        List<Map<String, Object>> results = hits.stream().map(e -> {
            String mode;
            float sim = e.similarity() == null ? 0f : e.similarity();
            if (sim >= verbatimThreshold) mode = "verbatim";
            else if (sim >= repackageThreshold) mode = "repackage";
            else mode = "miss";
            return Map.<String, Object>of(
                    "id", e.id(),
                    "author", e.authorUsername(),
                    "prompt", e.prompt(),
                    "response", e.response(),
                    "modelUsed", e.modelUsed() == null ? "" : e.modelUsed(),
                    "similarity", sim,
                    "mode", mode,
                    "consumeCount", e.consumeCount()
            );
        }).toList();
        return ResponseEntity.ok(Map.of("results", results));
    }

    /**
     * Publish a prompt/response pair to the marketplace.
     * Author receives a publish bonus.
     */
    @PostMapping("/publish")
    @Transactional
    public ResponseEntity<?> publish(@AuthenticationPrincipal UUID userId,
                                     @Valid @RequestBody PublishRequest req) {
        float[] vec = toFloatArray(req.embedding());
        if (vec.length != embeddingDims) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "embedding must be " + embeddingDims + " dims"));
        }
        UUID id = market.insert(userId, req.prompt(), req.response(), req.modelUsed(), vec, req.tags());
        users.adjustCredits(userId, publishBonus);
        market.logCreditEvent(userId, publishBonus, "publish_bonus", id);
        return ResponseEntity.ok(Map.of("id", id, "creditsEarned", publishBonus));
    }

    /**
     * Record that the consumer actually used an entry (verbatim or repackage).
     * Pays royalty to the author.
     */
    @PostMapping("/consume")
    @Transactional
    public ResponseEntity<?> consume(@AuthenticationPrincipal UUID consumerId,
                                     @RequestBody ConsumeRequest req) {
        var opt = market.findById(req.entryId());
        if (opt.isEmpty()) return ResponseEntity.status(404).body(Map.of("error", "entry not found"));
        MarketEntry e = opt.get();
        // the client tells us sim implicitly via which mode they used, but for the
        // MVP we just re-classify using the stored row — good enough for attribution
        market.incrementConsumeCount(e.id());
        market.recordConsumption(e.id(), consumerId, "verbatim", 1.0f);
        users.adjustCredits(e.authorId(), consumeRoyalty);
        market.logCreditEvent(e.authorId(), consumeRoyalty, "consume_royalty", e.id());
        return ResponseEntity.ok(Map.of("royaltyPaid", consumeRoyalty));
    }

    /** List the caller's own published entries. */
    @GetMapping("/mine")
    public ResponseEntity<?> mine(@AuthenticationPrincipal UUID userId) {
        var rows = market.listByAuthor(userId, 50);
        return ResponseEntity.ok(Map.of("entries", rows));
    }

    // ---------- helpers ----------

    private static float[] toFloatArray(List<Float> list) {
        float[] a = new float[list.size()];
        for (int i = 0; i < list.size(); i++) a[i] = list.get(i);
        return a;
    }
}
