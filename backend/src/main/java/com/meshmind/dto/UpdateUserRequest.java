package com.meshmind.dto;

import lombok.Data;
import java.util.List;

@Data
public class UpdateUserRequest {
    private String displayName;
    private String avatarUrl;
    private List<String> modelList;
}
