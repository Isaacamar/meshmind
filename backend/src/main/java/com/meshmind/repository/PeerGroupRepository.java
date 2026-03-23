package com.meshmind.repository;

import com.meshmind.model.PeerGroup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.UUID;

public interface PeerGroupRepository extends JpaRepository<PeerGroup, UUID> {

    @Query("""
        SELECT g FROM PeerGroup g
        WHERE g.owner.id = :userId
        OR g.id IN (SELECT gm.group.id FROM GroupMember gm WHERE gm.user.id = :userId)
    """)
    List<PeerGroup> findAllByMember(UUID userId);

    List<PeerGroup> findByIsPublicTrueOrderByCreatedAtDesc();
}
