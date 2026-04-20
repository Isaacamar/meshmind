package dev.meshmind.auth;

import dev.meshmind.user.User;
import dev.meshmind.user.UserRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final JwtService jwt;

    public AuthController(UserRepository users, PasswordEncoder encoder, JwtService jwt) {
        this.users = users;
        this.encoder = encoder;
        this.jwt = jwt;
    }

    public record RegisterRequest(
            @NotBlank @Size(min = 3, max = 64) String username,
            @NotBlank @Email String email,
            @NotBlank @Size(min = 8) String password) {}

    public record LoginRequest(@NotBlank String username, @NotBlank String password) {}

    @PostMapping("/register")
    public ResponseEntity<?> register(@Valid @RequestBody RegisterRequest req) {
        if (users.findByUsername(req.username()).isPresent()) {
            return ResponseEntity.badRequest().body(Map.of("error", "username taken"));
        }
        if (users.findByEmail(req.email()).isPresent()) {
            return ResponseEntity.badRequest().body(Map.of("error", "email taken"));
        }
        User u = new User();
        u.setId(UUID.randomUUID());
        u.setUsername(req.username());
        u.setEmail(req.email());
        u.setPasswordHash(encoder.encode(req.password()));
        u.setDisplayName(req.username());
        u.setCredits(100);
        u.setCreatedAt(Instant.now());
        users.save(u);
        String token = jwt.issue(u.getId(), u.getUsername());
        return ResponseEntity.ok(Map.of(
                "token", token,
                "user", Map.of("id", u.getId(), "username", u.getUsername(), "credits", u.getCredits())
        ));
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest req) {
        var opt = users.findByUsername(req.username());
        if (opt.isEmpty() || !encoder.matches(req.password(), opt.get().getPasswordHash())) {
            return ResponseEntity.status(401).body(Map.of("error", "invalid credentials"));
        }
        User u = opt.get();
        String token = jwt.issue(u.getId(), u.getUsername());
        return ResponseEntity.ok(Map.of(
                "token", token,
                "user", Map.of("id", u.getId(), "username", u.getUsername(), "credits", u.getCredits())
        ));
    }
}
