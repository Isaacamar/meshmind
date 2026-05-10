package dev.meshmind.market;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.Array;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class MarketRepository {

    private final JdbcTemplate jdbc;

    public MarketRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private final RowMapper<MarketEntry> mapper = (rs, i) -> {
        Array tagsArr = rs.getArray("tags");
        List<String> tags = tagsArr == null ? List.of() : List.of((String[]) tagsArr.getArray());
        Float sim = null;
        try {
            sim = rs.getFloat("similarity");
            if (rs.wasNull()) sim = null;
        } catch (Exception ignored) {}
        return new MarketEntry(
                (UUID) rs.getObject("id"),
                (UUID) rs.getObject("author_id"),
                rs.getString("author_username"),
                rs.getString("prompt"),
                rs.getString("response"),
                rs.getString("model_used"),
                tags,
                rs.getInt("consume_count"),
                rs.getInt("upvotes"),
                rs.getInt("downvotes"),
                rs.getTimestamp("created_at").toInstant(),
                sim
        );
    };

    /** Format a float[] as a pgvector literal: [0.1,0.2,...] */
    public static String vectorLiteral(float[] v) {
        StringBuilder sb = new StringBuilder(v.length * 8);
        sb.append('[');
        for (int i = 0; i < v.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(v[i]);
        }
        sb.append(']');
        return sb.toString();
    }

    public UUID insert(UUID authorId, String prompt, String response, String modelUsed,
                       float[] embedding, List<String> tags) {
        UUID id = UUID.randomUUID();
        String[] tagArr = tags == null ? new String[0] : tags.toArray(new String[0]);
        jdbc.update(
                "INSERT INTO market_entries (id, author_id, prompt, response, model_used, embedding, tags) " +
                "VALUES (?, ?, ?, ?, ?, ?::vector, ?)",
                id, authorId, prompt, response, modelUsed, vectorLiteral(embedding), tagArr);
        return id;
    }

    /** Top-k nearest neighbours by cosine similarity. Returns entries with similarity field set. */
    public List<MarketEntry> search(float[] embedding, int k) {
        String vec = vectorLiteral(embedding);
        // 1 - cosine_distance = cosine_similarity
        return jdbc.query(
                "SELECT m.id, m.author_id, u.username AS author_username, m.prompt, m.response, " +
                "       m.model_used, m.tags, m.consume_count, m.upvotes, m.downvotes, m.created_at, " +
                "       (1 - (m.embedding <=> ?::vector)) AS similarity " +
                "FROM market_entries m JOIN users u ON u.id = m.author_id " +
                "ORDER BY m.embedding <=> ?::vector " +
                "LIMIT ?",
                mapper, vec, vec, k);
    }

    public Optional<MarketEntry> findById(UUID id) {
        List<MarketEntry> rows = jdbc.query(
                "SELECT m.id, m.author_id, u.username AS author_username, m.prompt, m.response, " +
                "       m.model_used, m.tags, m.consume_count, m.upvotes, m.downvotes, m.created_at, " +
                "       NULL::real AS similarity " +
                "FROM market_entries m JOIN users u ON u.id = m.author_id WHERE m.id = ?",
                mapper, id);
        return rows.stream().findFirst();
    }

    public void incrementConsumeCount(UUID id) {
        jdbc.update("UPDATE market_entries SET consume_count = consume_count + 1 WHERE id = ?", id);
    }

    public void recordConsumption(UUID entryId, UUID consumerId, String mode, float similarity) {
        jdbc.update(
                "INSERT INTO consumptions (entry_id, consumer_id, mode, similarity) VALUES (?, ?, ?, ?)",
                entryId, consumerId, mode, similarity);
    }

    public void logCreditEvent(UUID userId, int delta, String reason, UUID entryId) {
        jdbc.update(
                "INSERT INTO credit_events (user_id, delta, reason, entry_id) VALUES (?, ?, ?, ?)",
                userId, delta, reason, entryId);
    }

    public List<MarketEntry> listByAuthor(UUID authorId, int limit) {
        return jdbc.query(
                "SELECT m.id, m.author_id, u.username AS author_username, m.prompt, m.response, " +
                "       m.model_used, m.tags, m.consume_count, m.upvotes, m.downvotes, m.created_at, " +
                "       NULL::real AS similarity " +
                "FROM market_entries m JOIN users u ON u.id = m.author_id " +
                "WHERE m.author_id = ? ORDER BY m.created_at DESC LIMIT ?",
                mapper, authorId, limit);
    }

    /** Aggregate statistics for thesis proof — hit rates, credits, savings. */
    public java.util.Map<String, Object> stats() {
        Long totalEntries   = jdbc.queryForObject("SELECT COUNT(*) FROM market_entries", Long.class);
        Long totalUsers     = jdbc.queryForObject("SELECT COUNT(*) FROM users", Long.class);
        Long totalConsumed  = jdbc.queryForObject("SELECT COALESCE(SUM(consume_count),0) FROM market_entries", Long.class);
        Long creditsEarned  = jdbc.queryForObject(
                "SELECT COALESCE(SUM(delta),0) FROM credit_events WHERE delta > 0", Long.class);

        // consumptions breakdown by mode
        var modeRows = jdbc.queryForList(
                "SELECT mode, COUNT(*) AS cnt, AVG(similarity) AS avg_sim FROM consumptions GROUP BY mode");

        // credit event totals by reason
        var creditRows = jdbc.queryForList(
                "SELECT reason, COUNT(*) AS cnt, SUM(delta) AS total FROM credit_events GROUP BY reason");

        return java.util.Map.of(
                "totalEntries",  totalEntries  == null ? 0L : totalEntries,
                "totalUsers",    totalUsers    == null ? 0L : totalUsers,
                "totalConsumed", totalConsumed == null ? 0L : totalConsumed,
                "creditsEarned", creditsEarned == null ? 0L : creditsEarned,
                "byMode",        modeRows,
                "byReason",      creditRows
        );
    }
}
