package com.meshmind.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class GroupRequest {
    @NotBlank private String name;
    private String description;
    private boolean isPublic = false;
}
