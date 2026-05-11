package dev.meshmind.chat;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/chats")
public class ChatController {

    private static final TypeReference<List<Map<String, Object>>> MESSAGE_LIST =
            new TypeReference<>() {};

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public ChatController(JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    public record SaveChatRequest(
            UUID id,
            String title,
            String model,
            List<Map<String, Object>> messages) {}

    public record ChatResponse(
            UUID id,
            String title,
            String model,
            List<Map<String, Object>> messages,
            Instant createdAt,
            Instant updatedAt) {}

    @GetMapping
    public List<ChatResponse> list(@AuthenticationPrincipal UUID userId) {
        return jdbc.query("""
                SELECT id, title, model, messages::text AS messages, created_at, updated_at
                FROM chats
                WHERE user_id = ?
                ORDER BY updated_at DESC
                """, (rs, rowNum) -> new ChatResponse(
                rs.getObject("id", UUID.class),
                rs.getString("title"),
                rs.getString("model"),
                readMessages(rs.getString("messages")),
                toInstant(rs.getTimestamp("created_at")),
                toInstant(rs.getTimestamp("updated_at"))
        ), userId);
    }

    @PostMapping
    public ResponseEntity<?> save(
            @AuthenticationPrincipal UUID userId,
            @RequestBody SaveChatRequest req) {
        UUID chatId = req.id() != null ? req.id() : UUID.randomUUID();
        String title = normalizeTitle(req.title());
        String messagesJson = writeMessages(req.messages());

        int changed = jdbc.update("""
                INSERT INTO chats (id, user_id, title, model, messages, updated_at)
                VALUES (?, ?, ?, ?, CAST(? AS jsonb), NOW())
                ON CONFLICT (id) DO UPDATE SET
                    title = EXCLUDED.title,
                    model = EXCLUDED.model,
                    messages = EXCLUDED.messages,
                    updated_at = NOW()
                WHERE chats.user_id = ?
                """, chatId, userId, title, req.model(), messagesJson, userId);

        if (changed == 0) {
            return ResponseEntity.status(403).body(Map.of("error", "chat belongs to another user"));
        }

        List<ChatResponse> rows = jdbc.query("""
                SELECT id, title, model, messages::text AS messages, created_at, updated_at
                FROM chats
                WHERE id = ? AND user_id = ?
                """, (rs, rowNum) -> new ChatResponse(
                rs.getObject("id", UUID.class),
                rs.getString("title"),
                rs.getString("model"),
                readMessages(rs.getString("messages")),
                toInstant(rs.getTimestamp("created_at")),
                toInstant(rs.getTimestamp("updated_at"))
        ), chatId, userId);

        return rows.stream().findFirst()
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElse(ResponseEntity.status(404).body(Map.of("error", "not found")));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(
            @AuthenticationPrincipal UUID userId,
            @PathVariable UUID id) {
        int deleted = jdbc.update("DELETE FROM chats WHERE id = ? AND user_id = ?", id, userId);
        if (deleted == 0) {
            return ResponseEntity.status(404).body(Map.of("error", "not found"));
        }
        return ResponseEntity.ok(Map.of("deleted", id));
    }

    private String normalizeTitle(String title) {
        if (title == null || title.isBlank()) return "New chat";
        String trimmed = title.trim();
        return trimmed.length() > 160 ? trimmed.substring(0, 160) : trimmed;
    }

    private List<Map<String, Object>> readMessages(String raw) {
        try {
            return mapper.readValue(raw == null ? "[]" : raw, MESSAGE_LIST);
        } catch (Exception e) {
            return List.of();
        }
    }

    private String writeMessages(List<Map<String, Object>> messages) {
        try {
            return mapper.writeValueAsString(messages == null ? List.of() : messages);
        } catch (Exception e) {
            return "[]";
        }
    }

    private Instant toInstant(Timestamp ts) {
        return ts == null ? null : ts.toInstant();
    }
}
