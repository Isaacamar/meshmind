package com.meshmind.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class MessageRequest {
    @NotBlank private String role;
    @NotBlank private String content;
    private boolean fromPeer = false;
}
