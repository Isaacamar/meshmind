# Architecture

This document describes MeshMind's system architecture, data flow, and the boundaries that enforce its core privacy contract.

---

## Privacy Contract

> The relay server must never be able to read a user's AI conversation content.

This constraint shapes every architectural decision. The cloud server stores accounts, group memberships, and node status. It relays peer messages as opaque encrypted blobs. It has no access to prompt text, response text, or file content.

---

## System Components

### 1. Local Machine (per user)

| Component | Technology | Responsibility |
|---|---|---|
| Chat UI | React + TypeScript | Chat interface, group sidebar, node dashboard, agent mode UI |
| Local AI backend | OpenClaw (FastAPI, Python) | Ollama API proxy, conversation storage, file extraction, agent loop |
| LLM runtime | Ollama | Runs the local language model |
| Local DB | SQLite | Conversation cache, agent action log |

### 2. Cloud

| Component | Technology | Responsibility |
|---|---|---|
| API server | Spring Boot 3.x (Java 21) | Auth, node registry, group management |
| WebSocket relay | Spring Boot WebSocket | Encrypted peer message routing |
| Database | PostgreSQL 16 | Users, groups, nodes, conversation metadata |

---

## Data Flow

### Local Chat (no peer routing)

```
User types message
       │
       ▼
React UI (browser)
       │  HTTP POST /api/sessions/{id}/chat
       ▼
OpenClaw FastAPI (local :8000)
       │  adds message to SQLite
       │  builds history
       ▼
Ollama (local :11434)
       │  streams tokens via SSE
       ▼
OpenClaw FastAPI
       │  SSE → browser
       ▼
React UI renders response
       │  stores in SQLite
```

Nothing leaves the machine.

### Peer Query Routing (F5)

```
User selects peer and clicks "Ask peer"
       │
       ▼
React UI encrypts {model, history, query} with peer's public key (Web Crypto API)
       │  WebSocket send to cloud relay
       ▼
Spring Boot WebSocket relay
       │  routes encrypted blob to target peer's WebSocket connection
       │  cannot decrypt — sees only {from, to, payload}
       ▼
Peer's React UI decrypts with private key
       │  HTTP POST to peer's local OpenClaw
       ▼
Peer's Ollama runs inference
       │  streams tokens → peer's OpenClaw → peer's React UI
       │  peer's React UI encrypts each token chunk and sends back via relay
       ▼
Originating React UI decrypts and renders
```

### Account / Group Operations

```
React UI ──JWT──► Spring Boot API ──► PostgreSQL
```

No AI content here — only metadata (usernames, group names, model names, node online status).

---

## Encryption Design (F5)

- Key pairs generated client-side on first login using the **Web Crypto API** (ECDH P-256)
- Public key stored in PostgreSQL (`users.public_key`)
- Private key stored in browser `localStorage` (never sent to server)
- Message encryption: ECDH key agreement → AES-GCM 256-bit session key
- Each message encrypted with a fresh AES-GCM key; the AES key is encrypted with the recipient's public key and prepended to the payload

This is standard hybrid encryption. We use browser-native APIs (no custom crypto).

---

## Database Design

### Cloud PostgreSQL (shared state only)

```
users ──────────────────────────────────────────────┐
  id, username, email, password_hash,               │
  display_name, avatar_url, public_key              │
                                                    │
nodes (one row per active session)                  │
  id, user_id → users, model_list[],               │
  vram_gb, last_seen                                │
                                                    │
groups                                              │
  id, owner_id → users, name, description          │
                                                    │
group_members                                       │
  group_id → groups, user_id → users,              │
  role, joined_at                                   │
                                                    │
conversations (metadata only, content is local)     │
  id, user_id → users, title, model_used           │
                                                    │
messages (synced metadata; content encrypted)       │
  id, conv_id → conversations, role,               │
  content (encrypted), from_peer, created_at       │
```

### Local SQLite (per machine)

```
sessions       — conversation sessions with model/system prompt/temperature
messages       — full message content (plaintext, local only)
settings       — default model, temperature, system prompt
agent_log      — agent action audit trail (agent mode)
```

---

## API Layer

### Spring Boot REST API

Handles auth and metadata only. No AI content passes through.

Endpoints documented in [proposal.md](proposal.md#rest-api-endpoints).

All endpoints return:
```json
{
  "success": true,
  "data": { ... },
  "error": null
}
```

Auth required on all endpoints except `/api/auth/register` and `/api/auth/login`. JWT passed as `Authorization: Bearer <token>`.

### OpenClaw FastAPI (local)

Handles AI inference, conversation management, file extraction, and (in agent mode) the agent action loop.

Key endpoints:
- `GET /api/models` — list available Ollama models
- `POST /api/sessions/{id}/chat` — stream chat response (SSE)
- `POST /api/upload` — extract text from PDF/TXT/CSV
- `POST /api/agent/run` — agent mode action loop (SSE, planned)

### WebSocket Relay (Spring Boot)

Endpoint: `ws://cloud/ws`

Authentication: JWT passed as query param on connect (`?token=...`).

Message envelope (all content is opaque to the relay):
```json
{
  "to": "user-uuid",
  "from": "user-uuid",
  "type": "peer_query | peer_response | peer_chunk",
  "payload": "<base64-encoded AES-GCM ciphertext>"
}
```

---

## Agent Mode Architecture (Phase 4)

See [agent-mode.md](agent-mode.md) for full design.

The agent loop runs as a module within the local OpenClaw FastAPI service (`app/agent/`). It receives a user message and workspace config, queries the local Ollama model to produce a structured action plan, waits for user approval events over SSE, then executes approved actions on the local filesystem.

```
React UI (agent mode)
       │  POST /api/agent/run  (workspace root, user message)
       ▼
OpenClaw agent loop
       │  queries Ollama for action plan (structured JSON)
       │  SSE → React UI: plan card
       │  waits for approve/cancel event
       │
       │  on approve:
       │    executes each action (read/write/shell)
       │    enforces workspace allowlist + traversal guard
       │    SSE → React UI: action status updates
       ▼
React UI renders live action log
```

---

## Deployment

### Local Development

```bash
docker-compose up -d          # PostgreSQL + Spring Boot
cd frontend && npm run dev    # React UI on :3000
cd openclaw && uvicorn app.server:app --reload --port 8000
```

### Production

- Spring Boot + PostgreSQL: AWS EC2 + RDS or GCP Cloud Run + Cloud SQL
- Ollama and OpenClaw: user's own machine (not deployed to cloud)
- React UI: served as static build from Spring Boot or a CDN

---

## Scalability Notes

The cloud layer is intentionally thin. The bottleneck in MeshMind is never the relay server — it's the user's local hardware. The relay only passes small encrypted blobs between WebSocket connections. A single low-cost cloud instance can serve hundreds of concurrent peer relay sessions.

PostgreSQL load is similarly light: auth tokens, group membership lookups, and heartbeat updates. No AI content is stored or processed in the cloud.
