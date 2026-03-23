package com.meshmind.repository;

import com.meshmind.model.Node;
import com.meshmind.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface NodeRepository extends JpaRepository<Node, UUID> {
    Optional<Node> findFirstByUserOrderByLastSeenDesc(User user);

    @Query("""
        SELECT n FROM Node n
        WHERE n.user IN (
            SELECT gm.user FROM GroupMember gm WHERE gm.group.id = :groupId
        )
        AND n.lastSeen > :since
    """)
    List<Node> findOnlineNodesByGroup(UUID groupId, LocalDateTime since);
}
