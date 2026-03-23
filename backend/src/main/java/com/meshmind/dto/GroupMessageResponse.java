package com.meshmind.dto;

import com.meshmind.model.GroupMessage;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
public class GroupMessageResponse {
    private UUID id;
    private UUID groupId;
    private UUID userId;
    private String username;
    private String content;
    private boolean isAi;
    private String modelName;
    private LocalDateTime createdAt;

    public static GroupMessageResponse from(GroupMessage m) {
        GroupMessageResponse r = new GroupMessageResponse();
        r.id = m.getId();
        r.groupId = m.getGroup().getId();
        r.userId = m.getUser().getId();
        r.username = m.getUser().getUsername();
        r.content = m.getContent();
        r.isAi = m.isAi();
        r.modelName = m.getModelName();
        r.createdAt = m.getCreatedAt();
        return r;
    }
}
