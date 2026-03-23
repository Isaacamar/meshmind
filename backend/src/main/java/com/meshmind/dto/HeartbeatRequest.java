package com.meshmind.dto;

import lombok.Data;
import java.util.List;

@Data
public class HeartbeatRequest {
    private List<String> modelList;
    private Double vramGb;
}
