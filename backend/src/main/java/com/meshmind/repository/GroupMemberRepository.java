package com.meshmind.repository;

import com.meshmind.model.GroupMember;
import com.meshmind.model.GroupMemberId;
import com.meshmind.model.PeerGroup;
import com.meshmind.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface GroupMemberRepository extends JpaRepository<GroupMember, GroupMemberId> {
    boolean existsByGroupAndUser(PeerGroup group, User user);
}
