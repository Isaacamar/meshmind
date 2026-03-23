package com.meshmind.dto;

import com.meshmind.model.Message;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
public class MessageResponse {
    private UUID id;
    private String role;
    private String content;
    private boolean fromPeer;
    private LocalDateTime createdAt;

    public static MessageResponse from(Message m) {
        MessageResponse r = new MessageResponse();
        r.id = m.getId();
        r.role = m.getRole();
        r.content = m.getContent();
        r.fromPeer = m.isFromPeer();
        r.createdAt = m.getCreatedAt();
        return r;
    }
}
