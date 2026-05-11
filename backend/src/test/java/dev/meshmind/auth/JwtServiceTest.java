package dev.meshmind.auth;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtServiceTest {

    private static final String SECRET = "test-secret-key-that-is-at-least-32-chars!!";
    private final JwtService jwt = new JwtService(SECRET, 1L);

    @Test
    void issueAndParseRoundTrip() {
        UUID id = UUID.randomUUID();
        String token = jwt.issue(id, "alice");
        assertThat(jwt.parseUserId(token)).isEqualTo(id);
    }

    @Test
    void differentUserIdsProduceDifferentTokens() {
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        assertThat(jwt.issue(a, "alice")).isNotEqualTo(jwt.issue(b, "bob"));
    }

    @Test
    void parseRejectsGarbageToken() {
        assertThatThrownBy(() -> jwt.parseUserId("not.a.token"))
                .isInstanceOf(Exception.class);
    }

    @Test
    void parseRejectsTokenSignedWithDifferentKey() {
        JwtService other = new JwtService("completely-different-secret-at-least-32-chars", 1L);
        String foreignToken = other.issue(UUID.randomUUID(), "bob");
        assertThatThrownBy(() -> jwt.parseUserId(foreignToken))
                .isInstanceOf(Exception.class);
    }
}
