package com.meshmind.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "messages")
@Getter @Setter @NoArgsConstructor
public class Message {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "conv_id")
    private Conversation conversation;

    @Column(length = 16)
    private String role;

    @Column(columnDefinition = "TEXT")
    private String content;

    @Column(name = "from_peer")
    private boolean fromPeer = false;

    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();
}
