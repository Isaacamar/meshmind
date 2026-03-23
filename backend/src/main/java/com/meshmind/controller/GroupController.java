package com.meshmind.controller;

import com.meshmind.dto.*;
import com.meshmind.model.*;
import com.meshmind.repository.*;
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
@RequestMapping("/api/groups")
@RequiredArgsConstructor
public class GroupController {

    private final PeerGroupRepository groupRepository;
    private final GroupMemberRepository memberRepository;
    private final UserRepository userRepository;
    private final GroupMessageRepository messageRepository;

    @PostMapping
    public ResponseEntity<GroupResponse> createGroup(@AuthenticationPrincipal UserDetails principal,
                                                     @Valid @RequestBody GroupRequest req) {
        User owner = getUser(principal);
        PeerGroup group = new PeerGroup();
        group.setOwner(owner);
        group.setName(req.getName());
        group.setDescription(req.getDescription());
        group.setPublic(req.isPublicGroup());
        groupRepository.save(group);

        // Add owner as admin member
        GroupMember member = new GroupMember();
        member.setGroup(group);
        member.setUser(owner);
        member.setRole("admin");
        memberRepository.save(member);

        return ResponseEntity.status(HttpStatus.CREATED).body(GroupResponse.from(group));
    }

    @PostMapping("/{id}/invite")
    public ResponseEntity<Void> invite(@AuthenticationPrincipal UserDetails principal,
                                       @PathVariable UUID id,
                                       @Valid @RequestBody InviteRequest req) {
        PeerGroup group = groupRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Group not found"));

        User inviter = getUser(principal);
        if (!group.getOwner().getId().equals(inviter.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can invite members");
        }

        User invitee = userRepository.findByUsername(req.getUsername())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        if (memberRepository.existsByGroupAndUser(group, invitee)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "User is already a member");
        }

        GroupMember member = new GroupMember();
        member.setGroup(group);
        member.setUser(invitee);
        memberRepository.save(member);

        return ResponseEntity.status(HttpStatus.CREATED).build();
    }

    @GetMapping("/public")
    public ResponseEntity<List<GroupResponse>> publicGroups() {
        List<GroupResponse> groups = groupRepository.findByIsPublicTrueOrderByCreatedAtDesc()
                .stream().map(GroupResponse::from).collect(Collectors.toList());
        return ResponseEntity.ok(groups);
    }

    @PostMapping("/{id}/join")
    public ResponseEntity<Void> join(@AuthenticationPrincipal UserDetails principal, @PathVariable UUID id) {
        PeerGroup group = groupRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Group not found"));
        if (!group.isPublic()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "This group is private — ask the owner to invite you");
        }
        User user = getUser(principal);
        if (memberRepository.existsByGroupAndUser(group, user)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Already a member");
        }
        GroupMember member = new GroupMember();
        member.setGroup(group);
        member.setUser(user);
        memberRepository.save(member);
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }

    @GetMapping("/mine")
    public ResponseEntity<List<GroupResponse>> myGroups(@AuthenticationPrincipal UserDetails principal) {
        User user = getUser(principal);
        List<GroupResponse> groups = groupRepository.findAllByMember(user.getId())
                .stream().map(GroupResponse::from).collect(Collectors.toList());
        return ResponseEntity.ok(groups);
    }

    @GetMapping("/{id}/messages")
    public ResponseEntity<List<GroupMessageResponse>> getMessages(@AuthenticationPrincipal UserDetails principal,
                                                                   @PathVariable UUID id) {
        PeerGroup group = groupRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Group not found"));
        User user = getUser(principal);
        if (!memberRepository.existsByGroupAndUser(group, user)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not a member of this group");
        }
        List<GroupMessageResponse> msgs = messageRepository.findByGroupIdOrderByCreatedAtAsc(id)
                .stream().map(GroupMessageResponse::from).collect(Collectors.toList());
        return ResponseEntity.ok(msgs);
    }

    @PostMapping("/{id}/messages")
    public ResponseEntity<GroupMessageResponse> postMessage(@AuthenticationPrincipal UserDetails principal,
                                                             @PathVariable UUID id,
                                                             @Valid @RequestBody GroupMessageRequest req) {
        PeerGroup group = groupRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Group not found"));
        User user = getUser(principal);
        if (!memberRepository.existsByGroupAndUser(group, user)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not a member of this group");
        }
        GroupMessage msg = new GroupMessage();
        msg.setGroup(group);
        msg.setUser(user);
        msg.setContent(req.getContent());
        msg.setAi(req.isAi());
        msg.setModelName(req.getModelName());
        messageRepository.save(msg);
        return ResponseEntity.status(HttpStatus.CREATED).body(GroupMessageResponse.from(msg));
    }

    private User getUser(UserDetails principal) {
        return userRepository.findByUsername(principal.getUsername())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }
}
