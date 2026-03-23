package com.meshmind.controller;

import com.meshmind.dto.HeartbeatRequest;
import com.meshmind.dto.NodeResponse;
import com.meshmind.model.Node;
import com.meshmind.model.User;
import com.meshmind.repository.NodeRepository;
import com.meshmind.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/nodes")
@RequiredArgsConstructor
public class NodeController {

    private final NodeRepository nodeRepository;
    private final UserRepository userRepository;

    @PostMapping("/heartbeat")
    public ResponseEntity<NodeResponse> heartbeat(@AuthenticationPrincipal UserDetails principal,
                                                  @RequestBody HeartbeatRequest req) {
        User user = getUser(principal);
        Node node = nodeRepository.findFirstByUserOrderByLastSeenDesc(user).orElse(new Node());
        node.setUser(user);
        if (req.getModelList() != null) {
            node.setModelList(req.getModelList().toArray(new String[0]));
        }
        node.setVramGb(req.getVramGb());
        node.setLastSeen(LocalDateTime.now());
        nodeRepository.save(node);
        return ResponseEntity.ok(NodeResponse.from(node));
    }

    @GetMapping("/{groupId}")
    public ResponseEntity<List<NodeResponse>> getOnlineNodes(@AuthenticationPrincipal UserDetails principal,
                                                             @PathVariable UUID groupId) {
        LocalDateTime since = LocalDateTime.now().minusMinutes(2);
        List<NodeResponse> nodes = nodeRepository.findOnlineNodesByGroup(groupId, since)
                .stream().map(NodeResponse::from).collect(Collectors.toList());
        return ResponseEntity.ok(nodes);
    }

    private User getUser(UserDetails principal) {
        return userRepository.findByUsername(principal.getUsername())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }
}
