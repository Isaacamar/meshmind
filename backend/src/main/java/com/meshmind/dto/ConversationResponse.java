package com.meshmind.dto;

import com.meshmind.model.Conversation;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
public class ConversationResponse {
    private UUID id;
    private String title;
    private String modelUsed;
    private LocalDateTime createdAt;

    public static ConversationResponse from(Conversation c) {
        ConversationResponse r = new ConversationResponse();
        r.id = c.getId();
        r.title = c.getTitle();
        r.modelUsed = c.getModelUsed();
        r.createdAt = c.getCreatedAt();
        return r;
    }
}
