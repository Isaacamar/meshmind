package com.meshmind.dto;

import com.meshmind.model.PeerGroup;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
public class GroupResponse {
    private UUID id;
    private String name;
    private String description;
    private UUID ownerId;
    private String ownerUsername;
    private boolean isPublic;
    private LocalDateTime createdAt;

    public static GroupResponse from(PeerGroup g) {
        GroupResponse r = new GroupResponse();
        r.id = g.getId();
        r.name = g.getName();
        r.description = g.getDescription();
        r.ownerId = g.getOwner().getId();
        r.ownerUsername = g.getOwner().getUsername();
        r.isPublic = g.isPublic();
        r.createdAt = g.getCreatedAt();
        return r;
    }
}
