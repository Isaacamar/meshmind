package dev.meshmind.auth;

import dev.meshmind.user.User;
import dev.meshmind.user.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AuthControllerTest {

    private UserRepository users;
    private PasswordEncoder encoder;
    private JwtService jwt;
    private AuthController controller;

    @BeforeEach
    void setUp() {
        users = mock(UserRepository.class);
        encoder = mock(PasswordEncoder.class);
        jwt = mock(JwtService.class);
        controller = new AuthController(users, encoder, jwt);
    }

    @Test
    void registerCreatesUserWithStartingCreditsAndJwt() {
        when(users.findByUsername("ada")).thenReturn(Optional.empty());
        when(users.findByEmail("ada@example.com")).thenReturn(Optional.empty());
        when(encoder.encode("password123")).thenReturn("hashed-password");
        when(jwt.issue(any(UUID.class), org.mockito.ArgumentMatchers.eq("ada"))).thenReturn("jwt-token");

        var response = controller.register(
                new AuthController.RegisterRequest("ada", "ada@example.com", "password123"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isInstanceOf(Map.class);
        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) response.getBody();
        assertThat(body).containsEntry("token", "jwt-token");

        org.mockito.ArgumentCaptor<User> userCaptor = org.mockito.ArgumentCaptor.forClass(User.class);
        verify(users).save(userCaptor.capture());
        User saved = userCaptor.getValue();
        assertThat(saved.getUsername()).isEqualTo("ada");
        assertThat(saved.getEmail()).isEqualTo("ada@example.com");
        assertThat(saved.getDisplayName()).isEqualTo("ada");
        assertThat(saved.getCredits()).isEqualTo(100);
        assertThat(saved.getPasswordHash()).isEqualTo("hashed-password");
    }

    @Test
    void registerRejectsDuplicateUsername() {
        when(users.findByUsername("ada")).thenReturn(Optional.of(user("ada")));

        var response = controller.register(
                new AuthController.RegisterRequest("ada", "ada@example.com", "password123"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody()).isEqualTo(Map.of("error", "username taken"));
    }

    @Test
    void loginRejectsInvalidPassword() {
        User user = user("ada");
        user.setPasswordHash("hashed-password");
        when(users.findByUsername("ada")).thenReturn(Optional.of(user));
        when(encoder.matches("wrong-password", "hashed-password")).thenReturn(false);

        var response = controller.login(new AuthController.LoginRequest("ada", "wrong-password"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(response.getBody()).isEqualTo(Map.of("error", "invalid credentials"));
    }

    @Test
    void loginReturnsJwtForValidCredentials() {
        User user = user("ada");
        user.setPasswordHash("hashed-password");
        when(users.findByUsername("ada")).thenReturn(Optional.of(user));
        when(encoder.matches("password123", "hashed-password")).thenReturn(true);
        when(jwt.issue(user.getId(), "ada")).thenReturn("jwt-token");

        var response = controller.login(new AuthController.LoginRequest("ada", "password123"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) response.getBody();
        assertThat(body).containsEntry("token", "jwt-token");
    }

    private static User user(String username) {
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setUsername(username);
        user.setEmail(username + "@example.com");
        user.setCredits(100);
        return user;
    }
}
