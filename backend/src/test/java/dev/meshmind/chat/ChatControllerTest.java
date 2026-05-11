package dev.meshmind.chat;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ChatControllerTest {

    private JdbcTemplate jdbc;
    private ChatController controller;

    @BeforeEach
    void setUp() {
        jdbc = mock(JdbcTemplate.class);
        controller = new ChatController(jdbc, new ObjectMapper());
    }

    // ── delete ─────────────────────────────────────────────────────────────────

    @Test
    void deleteReturnsNotFoundWhenNoRowDeleted() {
        UUID userId = UUID.randomUUID();
        UUID chatId = UUID.randomUUID();
        when(jdbc.update(anyString(), eq(chatId), eq(userId))).thenReturn(0);

        var response = controller.delete(userId, chatId);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) response.getBody();
        assertThat(body.get("error")).isEqualTo("not found");
    }

    @Test
    void deleteReturnsOkWithChatId() {
        UUID userId = UUID.randomUUID();
        UUID chatId = UUID.randomUUID();
        when(jdbc.update(anyString(), eq(chatId), eq(userId))).thenReturn(1);

        var response = controller.delete(userId, chatId);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) response.getBody();
        assertThat(body.get("deleted")).isEqualTo(chatId);
    }

    // ── save ──────────────────────────────────────────────────────────────────

    @Test
    void saveReturnsForbiddenWhenChatBelongsToAnotherUser() {
        UUID userId = UUID.randomUUID();
        when(jdbc.update(anyString(), any(), any(), any(), any(), any(), any())).thenReturn(0);

        var req = new ChatController.SaveChatRequest(UUID.randomUUID(), "My chat", "llama3.2", List.of());
        var response = controller.save(userId, req);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) response.getBody();
        assertThat(body.get("error")).isEqualTo("chat belongs to another user");
    }

    @Test
    void saveWithNullTitleDefaultsToNewChat() {
        UUID userId = UUID.randomUUID();
        when(jdbc.update(anyString(), any(), any(), any(), any(), any(), any())).thenReturn(0);

        // Null title must not throw — normalizeTitle handles it
        var req = new ChatController.SaveChatRequest(null, null, "llama3.2", List.of());
        var response = controller.save(userId, req);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void saveWithLongTitleDoesNotThrow() {
        UUID userId = UUID.randomUUID();
        when(jdbc.update(anyString(), any(), any(), any(), any(), any(), any())).thenReturn(0);

        String longTitle = "x".repeat(300);
        var req = new ChatController.SaveChatRequest(null, longTitle, "llama3.2", List.of());
        var response = controller.save(userId, req);

        // normalizeTitle truncates to 160 — no exception, still returns 403
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void saveWithNullMessagesDoesNotThrow() {
        UUID userId = UUID.randomUUID();
        when(jdbc.update(anyString(), any(), any(), any(), any(), any(), any())).thenReturn(0);

        var req = new ChatController.SaveChatRequest(null, "title", "llama3.2", null);
        var response = controller.save(userId, req);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    // ── list ──────────────────────────────────────────────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void listReturnsEmptyListWhenNoChats() {
        UUID userId = UUID.randomUUID();
        when(jdbc.query(anyString(), any(RowMapper.class), eq(userId))).thenReturn(List.of());

        List<ChatController.ChatResponse> result = controller.list(userId);

        assertThat(result).isEmpty();
    }
}
