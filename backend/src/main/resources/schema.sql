-- MeshMind cloud schema (marketplace pivot)
-- Privacy contract: only explicitly-published prompts land here. Everything else stays local.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- User accounts
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username        VARCHAR(64) UNIQUE NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    display_name    VARCHAR(128),
    credits         INTEGER NOT NULL DEFAULT 100,   -- starting allotment
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Published marketplace entries
-- embedding is nomic-embed-text (768 dims)
CREATE TABLE IF NOT EXISTS market_entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    prompt          TEXT NOT NULL,
    response        TEXT NOT NULL,
    model_used      VARCHAR(128),
    embedding       vector(768) NOT NULL,
    tags            TEXT[],
    consume_count   INTEGER NOT NULL DEFAULT 0,
    upvotes         INTEGER NOT NULL DEFAULT 0,
    downvotes       INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- HNSW index for cosine similarity search (no maintenance_work_mem requirement)
CREATE INDEX IF NOT EXISTS market_entries_embedding_idx
    ON market_entries USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS market_entries_author_idx
    ON market_entries (author_id);

-- Credit ledger: one row per credit-affecting event
-- Positive delta = earn, negative = spend
CREATE TABLE IF NOT EXISTS credit_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delta           INTEGER NOT NULL,
    reason          VARCHAR(64) NOT NULL,   -- 'publish_bonus', 'consume_royalty', 'search_spend', 'daily_grant'
    entry_id        UUID REFERENCES market_entries(id) ON DELETE SET NULL,
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS credit_events_user_idx ON credit_events (user_id, created_at DESC);

-- Consumption log: who used whose entry, for attribution and analytics
CREATE TABLE IF NOT EXISTS consumptions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id        UUID NOT NULL REFERENCES market_entries(id) ON DELETE CASCADE,
    consumer_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mode            VARCHAR(32) NOT NULL,   -- 'verbatim' (sim > 0.9) or 'repackage' (0.7-0.9)
    similarity      REAL NOT NULL,
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS consumptions_entry_idx ON consumptions (entry_id);

-- Cloud chat history
-- Stores completed browser conversations so login + saved-chat access works
-- without requiring the user's local OpenClaw/Ollama node to be running.
CREATE TABLE IF NOT EXISTS chats (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           VARCHAR(160) NOT NULL DEFAULT 'New chat',
    model           VARCHAR(128),
    messages        JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chats_user_updated_idx ON chats (user_id, updated_at DESC);
