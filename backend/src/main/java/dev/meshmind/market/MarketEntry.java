package dev.meshmind.market;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Pure record — persisted via JdbcTemplate because of pgvector. */
public record MarketEntry(
        UUID id,
        UUID authorId,
        String authorUsername,
        String prompt,
        String response,
        String modelUsed,
        List<String> tags,
        int consumeCount,
        int upvotes,
        int downvotes,
        Instant createdAt,
        Float similarity     // set only on search results; null on raw reads
) {}
