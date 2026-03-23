-- User accounts
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      VARCHAR(64) UNIQUE NOT NULL,
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name  VARCHAR(128),
    avatar_url    TEXT,
    created_at    TIMESTAMP DEFAULT NOW()
);

-- Node registrations (one active row per logged-in user)
CREATE TABLE nodes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    model_list  TEXT[],
    vram_gb     FLOAT,
    last_seen   TIMESTAMP DEFAULT NOW()
);

-- Peer groups
CREATE TABLE peer_groups (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID REFERENCES users(id),
    name        VARCHAR(128) NOT NULL,
    description TEXT,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- Group membership
CREATE TABLE group_members (
    group_id  UUID REFERENCES peer_groups(id) ON DELETE CASCADE,
    user_id   UUID REFERENCES users(id) ON DELETE CASCADE,
    role      VARCHAR(32) DEFAULT 'member',
    joined_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id)
);

-- Conversations (synced to cloud per user)
CREATE TABLE conversations (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT,
    model_used TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Messages within conversations
CREATE TABLE messages (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conv_id    UUID REFERENCES conversations(id) ON DELETE CASCADE,
    role       VARCHAR(16),
    content    TEXT,
    from_peer  BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);
