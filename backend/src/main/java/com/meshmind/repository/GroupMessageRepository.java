package com.meshmind.repository;

import com.meshmind.model.GroupMessage;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface GroupMessageRepository extends JpaRepository<GroupMessage, UUID> {
    List<GroupMessage> findByGroupIdOrderByCreatedAtAsc(UUID groupId);
}
