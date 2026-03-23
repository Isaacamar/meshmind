#!/usr/bin/env bash
# MeshMind — GitHub Issues + Labels + Release setup
# Run AFTER: gh auth login
# Usage: bash scripts/create-issues.sh

set -e

echo "==> Creating labels..."

gh label create "database"       --color "0075ca" --description "Database schema and migrations"         --force
gh label create "backend"        --color "28a745" --description "Spring Boot / Java service layer"       --force
gh label create "frontend"       --color "e4e669" --description "React UI"                               --force
gh label create "infrastructure" --color "6f42c1" --description "Docker, CI, deployment"                 --force
gh label create "feature"        --color "0052cc" --description "New feature"                            --force
gh label create "bug"            --color "d73a4a" --description "Something is broken"                   --force
gh label create "completed"      --color "cfd3d7" --description "Done and merged"                       --force
gh label create "in-progress"    --color "e99695" --description "Currently being worked on"             --force
gh label create "F1-auth"        --color "bfd4f2" --description "Feature 1 — Auth"                      --force
gh label create "F2-chat"        --color "bfd4f2" --description "Feature 2 — Local AI Chat"             --force
gh label create "F3-nodes"       --color "bfd4f2" --description "Feature 3 — Node Registry"             --force
gh label create "F4-groups"      --color "bfd4f2" --description "Feature 4 — Peer Groups"               --force
gh label create "F5-routing"     --color "bfd4f2" --description "Feature 5 — Peer Query Routing"        --force
gh label create "F6-dashboard"   --color "bfd4f2" --description "Feature 6 — Node Dashboard"            --force

echo "==> Creating issues..."

# ── COMPLETED ──────────────────────────────────────────────────────────────────

gh issue create \
  --title "[F1] User registration, login, and JWT authentication — backend" \
  --label "backend,feature,F1-auth,completed" \
  --body "$(cat <<'EOF'
## Description
Implement user account creation and stateless JWT authentication in the Spring Boot service layer.

## Acceptance Criteria
- [x] `POST /api/auth/register` — validates username/email uniqueness, bcrypt password
- [x] `POST /api/auth/login` — returns signed JWT (24h expiry, HS256)
- [x] `GET /api/users/me` — returns authenticated user profile
- [x] `PUT /api/users/me` — update display name and avatar URL
- [x] JWT filter applied to all routes except `/api/auth/**`
- [x] CORS configured for React frontend origin

## Implementation Notes
- JWT key derived from env var `JWT_SECRET` via SHA-256 so any length works
- Passwords stored as bcrypt hash (`password_hash` column)
- All user data in PostgreSQL `users` table

## Status
Completed — backend fully implemented and testable via Postman/curl.

**Remaining:** Login/register screens in React frontend (separate issue).
EOF
)"

gh issue create \
  --title "[DATABASE] PostgreSQL schema — all tables via Flyway migration" \
  --label "database,infrastructure,completed" \
  --body "$(cat <<'EOF'
## Description
Design and implement the full PostgreSQL 16 schema for MeshMind cloud data. Schema runs automatically on startup via Flyway.

## Schema

| Table | Purpose |
|---|---|
| `users` | Accounts — username, email, password_hash, display_name, avatar_url |
| `nodes` | One active row per user session — model_list (TEXT[]), vram_gb, last_seen |
| `peer_groups` | Named peer groups with an owner |
| `group_members` | Many-to-many users↔groups — role, joined_at |
| `conversations` | Conversation metadata (title, model used) |
| `messages` | Messages — role, content, from_peer flag |

## Acceptance Criteria
- [x] All tables created with UUID primary keys and proper foreign key constraints
- [x] ON DELETE CASCADE on all child tables
- [x] `gen_random_uuid()` as default PK
- [x] Flyway migration `V1__init.sql` runs cleanly on fresh PostgreSQL container
- [x] `docker compose up` brings database online with full schema

## Notes
- Table is `peer_groups` (not `groups`) to avoid Hibernate reserved-keyword issues
- `model_list` is `TEXT[]` native PostgreSQL array type
EOF
)"

gh issue create \
  --title "[INFRA] Docker Compose — full 4-service stack" \
  --label "infrastructure,completed" \
  --body "$(cat <<'EOF'
## Description
Set up `docker-compose.yml` so the entire project builds and runs with a single command on any machine (macOS M4, Linux, Windows with Docker Desktop).

## Services

| Service | Port | Description |
|---|---|---|
| `db` | 5432 | PostgreSQL 16 |
| `backend` | 8080 | Spring Boot REST API |
| `openclaw` | 8000 | FastAPI local AI backend |
| `frontend` | 3000 | React UI via nginx |

## Acceptance Criteria
- [x] `docker compose up --build` starts all services
- [x] `db` has healthcheck; `backend` waits for it to pass before starting
- [x] `openclaw` connects to Ollama via `host.docker.internal:11434` (macOS Docker networking)
- [x] `frontend` nginx proxies `/api/*` to `openclaw` with SSE buffering disabled
- [x] `openclaw/app` mounted as volume for hot-reload during development
- [x] Named volumes for PostgreSQL and SQLite data persistence

## Run Command
```bash
docker compose up --build
```
EOF
)"

gh issue create \
  --title "[F3] Node registry — heartbeat endpoint and online status" \
  --label "backend,feature,F3-nodes,completed" \
  --body "$(cat <<'EOF'
## Description
Implement the node registry: a heartbeat system that tracks which users are online and what AI models they currently have loaded.

## Acceptance Criteria
- [x] `POST /api/nodes/heartbeat` — upserts a node row for the authenticated user, updates `last_seen` and `model_list`
- [x] `GET /api/nodes/{groupId}` — returns all nodes for members of a group seen within the last 2 minutes (online window)
- [x] One node row per user (upsert pattern)
- [x] `model_list` stored as PostgreSQL `TEXT[]`
- [x] Response includes `username`, `modelList`, `vramGb`, `lastSeen`

## Remaining
- [ ] Frontend sends heartbeat `POST /api/nodes/heartbeat` every 60s after login (#frontend)
- [ ] Online status badges shown in group sidebar

## Notes
Online window is 2 minutes (hardcoded in `NodeController` — can be made configurable later).
EOF
)"

gh issue create \
  --title "[F4] Peer groups — create, invite, list members" \
  --label "backend,feature,F4-groups,completed" \
  --body "$(cat <<'EOF'
## Description
Implement peer group management: users can create named groups, invite others by username, and list groups they belong to.

## Acceptance Criteria
- [x] `POST /api/groups` — creates group, automatically adds owner as `admin` member
- [x] `POST /api/groups/{id}/invite` — owner invites a user by username; 403 if caller is not owner; 409 if already a member
- [x] `GET /api/groups/mine` — returns all groups where user is owner OR member
- [x] Group membership stored in `group_members` with `role` (admin/member) and `joined_at`

## Remaining
- [ ] Group sidebar in React showing member list and online status (#frontend)
- [ ] Leave group endpoint
- [ ] Remove member endpoint (owner only)
EOF
)"

gh issue create \
  --title "[F2] OpenClaw local AI backend — FastAPI + Ollama streaming" \
  --label "backend,feature,F2-chat,completed" \
  --body "$(cat <<'EOF'
## Description
Build the local AI backend (Python / FastAPI) that wraps Ollama's API, manages conversation sessions in SQLite, and streams responses to the browser via Server-Sent Events (SSE).

## Acceptance Criteria
- [x] `GET /api/models` — lists available Ollama models from `/api/tags`
- [x] `POST /api/sessions` — creates a new conversation session (model, system prompt, temperature)
- [x] `GET /api/sessions` — lists sessions ordered by most recent
- [x] `GET /api/sessions/{id}/messages` — full message history for a session
- [x] `DELETE /api/sessions/{id}` — delete session and all messages
- [x] `POST /api/sessions/{id}/chat` — streams SSE response from Ollama, saves complete response to SQLite on finish
- [x] `POST /api/upload` — extracts text from PDF (PyMuPDF), TXT, CSV files
- [x] Graceful 503 error if Ollama is not running
- [x] SQLite persists: `sessions`, `messages`, `settings`, `agent_log`

## Notes
- Conversation content stays local — never sent to the Spring Boot cloud API
- `host.docker.internal:11434` used to reach Ollama on the host machine from inside Docker
EOF
)"

gh issue create \
  --title "[F2] React chat UI — session sidebar and streaming chat" \
  --label "frontend,feature,F2-chat,completed" \
  --body "$(cat <<'EOF'
## Description
Build the React + TypeScript chat interface that connects to OpenClaw for local AI conversations.

## Acceptance Criteria
- [x] Model picker auto-populated from `GET /api/models`
- [x] Sidebar: create, list, delete conversation sessions
- [x] Streaming chat: SSE tokens appended live with blinking cursor
- [x] Ollama offline warning shown if model list fails to load
- [x] Enter to send, Shift+Enter for newline
- [x] Dark theme UI

## Remaining
- [ ] Math rendering (KaTeX) for model responses containing LaTeX
- [ ] File upload drag-and-drop (sends to `POST /api/upload`, injects text into chat)
- [ ] System prompt field per session
- [ ] Model switching mid-conversation
EOF
)"

# ── OPEN — NEXT SPRINT ─────────────────────────────────────────────────────────

gh issue create \
  --title "[F1] Login and register screens in React" \
  --label "frontend,feature,F1-auth,in-progress" \
  --body "$(cat <<'EOF'
## Description
Add login and registration UI so users can authenticate against the Spring Boot backend and receive a JWT for subsequent API calls.

## Acceptance Criteria
- [ ] `/login` page — username + password form, calls `POST /api/auth/login` on Spring Boot (:8080)
- [ ] `/register` page — username, email, password form
- [ ] JWT stored in `localStorage` after login
- [ ] All Spring Boot API calls include `Authorization: Bearer <token>` header
- [ ] Redirect to chat on successful login
- [ ] Logout clears token and redirects to `/login`

## Assignee
Isaac Amar
EOF
)"

gh issue create \
  --title "[F3] Frontend heartbeat — register node as online after login" \
  --label "frontend,feature,F3-nodes" \
  --body "$(cat <<'EOF'
## Description
After a user logs in, the frontend should register itself as an online node by calling the heartbeat endpoint and refreshing it every 60 seconds.

## Acceptance Criteria
- [ ] On login, `POST http://localhost:8080/api/nodes/heartbeat` with current Ollama model list and vram info
- [ ] Heartbeat repeated every 60 seconds while the tab is open
- [ ] On logout or tab close, no further heartbeats sent
- [ ] Online status indicators visible in group member sidebar

## Notes
The model list can be fetched from OpenClaw `GET /api/models` and forwarded to the Spring Boot heartbeat.

## Assignee
Isaac Amar
EOF
)"

gh issue create \
  --title "[F4] Group sidebar — member list and online status in React" \
  --label "frontend,feature,F4-groups" \
  --body "$(cat <<'EOF'
## Description
Add a group sidebar panel to the React UI that shows the user's groups, members, and live online/offline status.

## Acceptance Criteria
- [ ] Sidebar panel lists all groups from `GET /api/groups/mine`
- [ ] Clicking a group expands to show members
- [ ] Online members shown with green indicator (fetched from `GET /api/nodes/{groupId}`)
- [ ] Create group button + modal
- [ ] Invite user by username (calls `POST /api/groups/{id}/invite`)
- [ ] Refreshes online status every 30 seconds

## Assignee
Isaac Amar
EOF
)"

gh issue create \
  --title "[F5] WebSocket relay — encrypted peer message routing in Spring Boot" \
  --label "backend,feature,F5-routing" \
  --body "$(cat <<'EOF'
## Description
Implement the WebSocket relay in Spring Boot that routes encrypted peer messages between group members. The server must not be able to read message content — it only routes opaque blobs.

## Acceptance Criteria
- [ ] `ws://localhost:8080/ws?token=<jwt>` — authenticated WebSocket connection
- [ ] Spring Boot WebSocket config with STOMP or raw WebSocket handler
- [ ] Message envelope: `{ to: userId, from: userId, type: "peer_query|peer_response|peer_chunk", payload: "<base64 ciphertext>" }`
- [ ] Server routes message to the target user's active WebSocket session
- [ ] Queue messages if recipient is temporarily disconnected (brief window)
- [ ] Only group members can message each other (validated server-side)

## Assignee
Isaac Schertz
EOF
)"

gh issue create \
  --title "[F5] Client-side encryption — Web Crypto API ECDH for peer messages" \
  --label "frontend,feature,F5-routing" \
  --body "$(cat <<'EOF'
## Description
Implement end-to-end encryption for peer queries so the relay server cannot read conversation content.

## Design
- ECDH P-256 key pair generated client-side on first login (Web Crypto API)
- Public key stored in PostgreSQL `users` table (add `public_key` column)
- Private key stored in `localStorage` only — never sent to server
- Message encryption: ECDH → AES-GCM 256-bit session key
- Each message encrypted with fresh AES-GCM key; AES key wrapped with recipient public key

## Acceptance Criteria
- [ ] Key pair generated on first login, public key uploaded to Spring Boot
- [ ] `GET /api/users/{id}/public-key` endpoint added to Spring Boot
- [ ] Encrypt outgoing peer query before sending via WebSocket
- [ ] Decrypt incoming peer response on receipt
- [ ] No plaintext AI content transmitted over WebSocket

## Assignee
Isaac Amar
EOF
)"

gh issue create \
  --title "[INFRA] Tag v0.1.0 release from main branch" \
  --label "infrastructure" \
  --body "$(cat <<'EOF'
## Description
Per ECE366 requirements, tag a release in GitHub from the main branch for the Sprint 1 submission.

## Steps
- [ ] Ensure all Sprint 1 work is merged to `main`
- [ ] Create GitHub release `v0.1.0` from `main`
- [ ] Release notes summarize: PostgreSQL schema, Spring Boot auth/groups/nodes API, OpenClaw local AI backend, React chat UI, full Docker stack

## Command
```bash
gh release create v0.1.0 --title "Sprint 1 — Database + Service prototype" \
  --notes "PostgreSQL schema via Flyway, Spring Boot REST API (auth, groups, nodes, conversations), OpenClaw FastAPI local AI backend, React chat UI, full Docker Compose stack."
```
EOF
)"

echo ""
echo "==> All issues created."
echo ""
echo "Next: tag the release with:"
echo "  gh release create v0.1.0 --title \"Sprint 1 — Database + Service prototype\" \\"
echo "    --notes \"PostgreSQL schema, Spring Boot REST API, OpenClaw local AI backend, React chat UI, Docker Compose.\""
