package com.meshmind.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "nodes")
@Getter @Setter @NoArgsConstructor
public class Node {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "model_list", columnDefinition = "text[]")
    private String[] modelList;

    @Column(name = "vram_gb")
    private Double vramGb;

    @Column(name = "last_seen")
    private LocalDateTime lastSeen = LocalDateTime.now();
}
