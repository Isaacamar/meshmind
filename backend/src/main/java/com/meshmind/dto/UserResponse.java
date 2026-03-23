package com.meshmind.dto;

import com.meshmind.model.User;
import lombok.Data;

import java.util.UUID;

@Data
public class UserResponse {
    private UUID id;
    private String username;
    private String email;
    private String displayName;
    private String avatarUrl;

    public static UserResponse from(User u) {
        UserResponse r = new UserResponse();
        r.id = u.getId();
        r.username = u.getUsername();
        r.email = u.getEmail();
        r.displayName = u.getDisplayName();
        r.avatarUrl = u.getAvatarUrl();
        return r;
    }
}
