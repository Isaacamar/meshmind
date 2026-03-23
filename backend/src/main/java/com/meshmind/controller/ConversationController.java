package com.meshmind.controller;

import com.meshmind.dto.ConversationRequest;
import com.meshmind.dto.ConversationResponse;
import com.meshmind.dto.MessageRequest;
import com.meshmind.dto.MessageResponse;
import com.meshmind.model.Conversation;
import com.meshmind.model.Message;
import com.meshmind.model.User;
import com.meshmind.repository.ConversationRepository;
import com.meshmind.repository.MessageRepository;
import com.meshmind.repository.UserRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/conversations")
@RequiredArgsConstructor
public class ConversationController {

    private final ConversationRepository conversationRepository;
    private final MessageRepository messageRepository;
    private final UserRepository userRepository;

    @GetMapping
    public ResponseEntity<List<ConversationResponse>> list(@AuthenticationPrincipal UserDetails principal) {
        User user = getUser(principal);
        List<ConversationResponse> convos = conversationRepository
                .findByUserIdOrderByCreatedAtDesc(user.getId())
                .stream().map(ConversationResponse::from).collect(Collectors.toList());
        return ResponseEntity.ok(convos);
    }

    @PostMapping
    public ResponseEntity<ConversationResponse> create(@AuthenticationPrincipal UserDetails principal,
                                                       @RequestBody ConversationRequest req) {
        User user = getUser(principal);
        Conversation conv = new Conversation();
        conv.setUser(user);
        conv.setTitle(req.getTitle());
        conv.setModelUsed(req.getModelUsed());
        conversationRepository.save(conv);
        return ResponseEntity.status(HttpStatus.CREATED).body(ConversationResponse.from(conv));
    }

    @PostMapping("/{id}/messages")
    public ResponseEntity<MessageResponse> addMessage(@AuthenticationPrincipal UserDetails principal,
                                                      @PathVariable UUID id,
                                                      @Valid @RequestBody MessageRequest req) {
        User user = getUser(principal);
        Conversation conv = conversationRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversation not found"));

        if (!conv.getUser().getId().equals(user.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }

        Message msg = new Message();
        msg.setConversation(conv);
        msg.setRole(req.getRole());
        msg.setContent(req.getContent());
        msg.setFromPeer(req.isFromPeer());
        messageRepository.save(msg);
        return ResponseEntity.status(HttpStatus.CREATED).body(MessageResponse.from(msg));
    }

    private User getUser(UserDetails principal) {
        return userRepository.findByUsername(principal.getUsername())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }
}
