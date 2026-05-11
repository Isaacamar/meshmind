package dev.meshmind.user;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserRepository users;
    private final PasswordEncoder encoder;

    public UserController(UserRepository users, PasswordEncoder encoder) {
        this.users = users;
        this.encoder = encoder;
    }

    public record UpdateMeRequest(
            @Size(max = 128) String displayName,
            String currentPassword,
            @Size(min = 8) String newPassword) {}

    @GetMapping("/me")
    public ResponseEntity<?> me(@AuthenticationPrincipal UUID userId) {
        return users.findById(userId)
                .<ResponseEntity<?>>map(u -> ResponseEntity.ok(toResponse(u)))
                .orElse(ResponseEntity.status(404).body(Map.of("error", "not found")));
    }

    @PutMapping("/me")
    public ResponseEntity<?> updateMe(
            @AuthenticationPrincipal UUID userId,
            @Valid @RequestBody UpdateMeRequest req) {
        return users.findById(userId)
                .<ResponseEntity<?>>map(u -> {
                    if (req.displayName() != null) {
                        String displayName = req.displayName().trim();
                        u.setDisplayName(displayName.isEmpty() ? u.getUsername() : displayName);
                    }

                    if (req.newPassword() != null && !req.newPassword().isBlank()) {
                        if (req.currentPassword() == null || req.currentPassword().isBlank()) {
                            return ResponseEntity.badRequest()
                                    .body(Map.of("error", "current password required"));
                        }
                        if (!encoder.matches(req.currentPassword(), u.getPasswordHash())) {
                            return ResponseEntity.status(403)
                                    .body(Map.of("error", "current password is incorrect"));
                        }
                        u.setPasswordHash(encoder.encode(req.newPassword()));
                    }

                    User saved = users.save(u);
                    return ResponseEntity.ok(toResponse(saved));
                })
                .orElse(ResponseEntity.status(404).body(Map.of("error", "not found")));
    }

    private Map<String, Object> toResponse(User u) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", u.getId());
        body.put("username", u.getUsername());
        body.put("email", u.getEmail());
        body.put("displayName", u.getDisplayName());
        body.put("credits", u.getCredits());
        return body;
    }
}
