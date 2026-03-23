package com.meshmind.dto;

import com.meshmind.model.Node;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

@Data
public class NodeResponse {
    private UUID id;
    private UUID userId;
    private String username;
    private List<String> modelList;
    private Double vramGb;
    private LocalDateTime lastSeen;

    public static NodeResponse from(Node n) {
        NodeResponse r = new NodeResponse();
        r.id = n.getId();
        r.userId = n.getUser().getId();
        r.username = n.getUser().getUsername();
        r.modelList = n.getModelList() != null ? Arrays.asList(n.getModelList()) : List.of();
        r.vramGb = n.getVramGb();
        r.lastSeen = n.getLastSeen();
        return r;
    }
}
