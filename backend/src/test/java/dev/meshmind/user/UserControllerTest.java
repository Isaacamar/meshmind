package dev.meshmind.user;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UserControllerTest {

    private UserRepository users;
    private PasswordEncoder encoder;
    private UserController controller;
    private UUID userId;
    private User user;

    @BeforeEach
    void setUp() {
        users = mock(UserRepository.class);
        encoder = mock(PasswordEncoder.class);
        controller = new UserController(users, encoder);
        userId = UUID.randomUUID();
        user = user(userId);
    }

    @Test
    void meReturnsProfileAndCredits() {
        when(users.findById(userId)).thenReturn(Optional.of(user));

        var response = controller.me(userId);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) response.getBody();
        assertThat(body).containsEntry("username", "ada");
        assertThat(body).containsEntry("email", "ada@example.com");
        assertThat(body).containsEntry("displayName", "Ada");
        assertThat(body).containsEntry("credits", 110);
    }

    @Test
    void updateMeUpdatesDisplayName() {
        when(users.findById(userId)).thenReturn(Optional.of(user));
        when(users.save(user)).thenReturn(user);

        var response = controller.updateMe(userId, new UserController.UpdateMeRequest("Ada Lovelace", null, null));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(user.getDisplayName()).isEqualTo("Ada Lovelace");
        verify(users).save(user);
    }

    @Test
    void updateMeFallsBackToUsernameForBlankDisplayName() {
        when(users.findById(userId)).thenReturn(Optional.of(user));
        when(users.save(user)).thenReturn(user);

        var response = controller.updateMe(userId, new UserController.UpdateMeRequest("   ", null, null));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(user.getDisplayName()).isEqualTo("ada");
    }

    @Test
    void updateMeRejectsPasswordChangeWithoutCurrentPassword() {
        when(users.findById(userId)).thenReturn(Optional.of(user));

        var response = controller.updateMe(userId, new UserController.UpdateMeRequest(null, "", "new-password"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody()).isEqualTo(Map.of("error", "current password required"));
        verify(users, never()).save(user);
    }

    @Test
    void updateMeRejectsWrongCurrentPassword() {
        when(users.findById(userId)).thenReturn(Optional.of(user));
        when(encoder.matches("wrong-password", "old-hash")).thenReturn(false);

        var response = controller.updateMe(
                userId,
                new UserController.UpdateMeRequest(null, "wrong-password", "new-password"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(response.getBody()).isEqualTo(Map.of("error", "current password is incorrect"));
        verify(users, never()).save(user);
    }

    @Test
    void updateMeChangesPasswordWithCurrentPassword() {
        when(users.findById(userId)).thenReturn(Optional.of(user));
        when(encoder.matches("old-password", "old-hash")).thenReturn(true);
        when(encoder.encode("new-password")).thenReturn("new-hash");
        when(users.save(user)).thenReturn(user);

        var response = controller.updateMe(
                userId,
                new UserController.UpdateMeRequest(null, "old-password", "new-password"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(user.getPasswordHash()).isEqualTo("new-hash");
        verify(users).save(user);
    }

    @Test
    void deleteMeRequiresCurrentPassword() {
        when(users.findById(userId)).thenReturn(Optional.of(user));

        var response = controller.deleteMe(userId, new UserController.DeleteMeRequest(""));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody()).isEqualTo(Map.of("error", "current password required"));
        verify(users, never()).delete(user);
    }

    @Test
    void deleteMeRejectsWrongPassword() {
        when(users.findById(userId)).thenReturn(Optional.of(user));
        when(encoder.matches("wrong-password", "old-hash")).thenReturn(false);

        var response = controller.deleteMe(userId, new UserController.DeleteMeRequest("wrong-password"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(response.getBody()).isEqualTo(Map.of("error", "current password is incorrect"));
        verify(users, never()).delete(user);
    }

    @Test
    void deleteMeDeletesUserWithCorrectPassword() {
        when(users.findById(userId)).thenReturn(Optional.of(user));
        when(encoder.matches("old-password", "old-hash")).thenReturn(true);

        var response = controller.deleteMe(userId, new UserController.DeleteMeRequest("old-password"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isEqualTo(Map.of("deleted", true));
        verify(users).delete(user);
    }

    private static User user(UUID id) {
        User user = new User();
        user.setId(id);
        user.setUsername("ada");
        user.setEmail("ada@example.com");
        user.setDisplayName("Ada");
        user.setPasswordHash("old-hash");
        user.setCredits(110);
        return user;
    }
}
