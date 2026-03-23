package com.meshmind.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class GroupMessageRequest {
    @NotBlank private String content;
    private boolean isAi = false;
    private String modelName;
}
