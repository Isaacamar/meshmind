# MeshMind v2 — Demo & Presentation Brief
ECE366 · Spring 2026 · Isaac Amar & Isaac Schertz

---

## 1. How to Start Everything (Local Demo)

```bash
# Terminal 1 — Docker stack (db + backend + openclaw + frontend)
cd /Users/isaacamar/Documents/meshmind-v2
docker compose up -d

# Ensure Ollama is running (separate process, not in Docker)
ollama serve

# Frontend dev server (optional — use if you want hot-reload)
cd frontend && npm run dev      # http://localhost:3001

# Or use the Docker frontend at http://localhost:3000
```

**Ports**
| Service | URL |
|---|---|
| React UI | http://localhost:3000 |
| OpenClaw (FastAPI) | http://localhost:8000 |
| Spring Boot backend | http://localhost:8080 |
| PostgreSQL | localhost:5432 |
| Ollama | localhost:11434 |

**After every restart — log back in.** The JWT token is held in memory by OpenClaw; restart clears it.

---

## 2. Inspecting the Backend (Live DB + API)

### 2a. PostgreSQL — see what's stored

```bash
# Open a psql shell in the running db container
docker exec -it meshmind-v2-db-1 psql -U meshmind -d meshmind

# Once inside psql:
\dt                                      -- list all tables
SELECT id, username, credits FROM users; -- registered accounts
SELECT id, prompt, author_id, consume_count FROM market_entries ORDER BY created_at DESC LIMIT 10;
SELECT * FROM credit_events ORDER BY created_at DESC LIMIT 20;
SELECT * FROM consumptions ORDER BY created_at DESC LIMIT 20;
\q                                       -- exit
```

### 2b. Spring Boot REST API — curl test

```bash
# Register
curl -s -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"demo","email":"demo@demo.com","password":"password123"}' | jq

# Login — copy the token
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"demo","password":"password123"}' | jq -r '.token')

# My profile + credits
curl -s http://localhost:8080/api/users/me \
  -H "Authorization: Bearer $TOKEN" | jq

# My published entries
curl -s http://localhost:8080/api/market/mine \
  -H "Authorization: Bearer $TOKEN" | jq

# Marketplace search (pass a real 768-dim embedding — this is a stub)
curl -s -X POST http://localhost:8080/api/market/search \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"embedding":[0.1, 0.2, ...],"k":3}' | jq
```

### 2c. OpenClaw FastAPI — curl test

```bash
# List available models
curl -s http://localhost:8000/api/models | jq

# Login through OpenClaw (stores token in-memory for subsequent calls)
curl -s -X POST http://localhost:8000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"demo","password":"password123"}' | jq

# Ask a question (streaming — will print SSE chunks)
curl -s -X POST http://localhost:8000/api/ask/stream \
  -H "Content-Type: application/json" \
  -d '{"prompt":"What is a JWT?","model":"llama3.2:3b","temperature":0.7}'
```

### 2d. Docker logs

```bash
docker compose logs backend  --tail=50 --follow
docker compose logs openclaw --tail=50 --follow
docker compose logs db       --tail=20
```

---

## 3. Project Feature Status

### ✅ Fully Working
| Feature | Where |
|---|---|
| User registration + login (JWT, BCrypt) | Spring Boot `/api/auth` |
| User profile + credits balance | Spring Boot `/api/users/me` |
| Credits ledger (publish +5, consume royalty +1) | `credit_events` table |
| Prompt embedding via nomic-embed-text | OpenClaw → Ollama |
| Marketplace vector search (pgvector IVFFlat cosine) | Spring Boot `/api/market/search` |
| Verbatim cache hit (similarity ≥ 0.90) — 0 inference tokens | OpenClaw orchestrator |
| Repackage (0.70–0.90) — local model adapts cached answer | OpenClaw orchestrator |
| Miss (< 0.70) — full local inference | OpenClaw → Ollama |
| Publish prompt/response to marketplace | Spring Boot `/api/market/publish` |
| Consumption logging + attribution | `consumptions` table |
| SSE streaming with per-token delivery | OpenClaw `/api/ask/stream` |
| Multi-model sessions (llama3.2, llava, qwen2.5-coder) | Frontend + OpenClaw |
| Image attachments (vision model — llava) | Frontend → OpenClaw |
| PDF attachment (text extraction via pypdf) | OpenClaw `/api/parse/pdf` |
| Temperature slider (0–2.0) | Frontend → OpenClaw |
| Context fill bar (% of model context used) | Frontend |
| Per-message token stats (in/out/tok/s) | OpenClaw SSE done event |
| Math rendering (KaTeX — `$...$` and `$$...$$`) | Frontend |
| Syntax highlighting (One Dark) | Frontend |
| Session persistence (localStorage) | Frontend |
| 21 unit tests for OpenClaw (server + ollama client) | `openclaw/tests/` |

### ⚠️ Known Gaps (for May 11 Final)
| Gap | Priority | Notes |
|---|---|---|
| **Cloud deployment** | CRITICAL | Requirement: class must access via internet. Need AWS/GCP/Render |
| **Java backend unit tests** | HIGH | Requirement: 50% coverage by May 11. Currently 0 Java tests |
| Account management (update profile/password) | Medium | Only register/login/credits exist |
| Upvote/downvote on entries | Low | Schema has columns, no endpoint |
| JWT persisted across OpenClaw restart | Low | Token lost on restart; re-login required |

---

## 4. Architecture for the Presentation Slide

```
┌─ YOUR LAPTOP ────────────────────────────────────────────────┐
│                                                              │
│  React UI (Vite, :3000)                                      │
│    └── SSE streaming, multi-model, KaTeX, attachments        │
│                                                              │
│  OpenClaw (FastAPI, :8000)                         ◄─────────┼── User's browser
│    ├── Embed prompt (nomic-embed-text via Ollama)            │
│    ├── Search cloud marketplace (embeddings only)            │
│    ├── Verbatim hit  → serve cached answer (0 tokens)        │
│    ├── Repackage hit → adapt with local model (~10x less)    │
│    └── Miss          → full Ollama inference                 │
│                                                              │
│  Ollama (:11434)                                             │
│    ├── nomic-embed-text  (768-dim embeddings)                │
│    ├── llama3.2:3b       (fast chat)                         │
│    ├── llava:13b         (vision)                            │
│    └── qwen2.5-coder:14b (code)                              │
└──────────────────────────────────────────────────────────────┘
         │  JWT auth · embeddings only (no plaintext)
         ▼
┌─ CLOUD (Docker) ─────────────────────────────────────────────┐
│  Spring Boot (:8080)                                         │
│    ├── POST /api/auth/register|login   (JWT issue)           │
│    ├── GET  /api/users/me              (profile + credits)   │
│    ├── POST /api/market/search         (top-k by embedding)  │
│    ├── POST /api/market/publish        (earn +5 credits)     │
│    ├── POST /api/market/consume        (author earns +1)     │
│    └── GET  /api/market/mine           (my entries)          │
│                                                              │
│  PostgreSQL 16 + pgvector                                    │
│    ├── users          (auth, credits)                        │
│    ├── market_entries (prompt, response, embedding vector)   │
│    ├── credit_events  (full ledger)                          │
│    └── consumptions   (attribution log)                      │
└──────────────────────────────────────────────────────────────┘
```

---

## 5. Demo Script (5–10 min)

**Setup before demo:** register an account, ask 2–3 questions and publish at least one answer. Have a second incognito window ready as a second user.

1. **Open the UI** — show model selector, temperature slider, session list
2. **Ask a fresh question** (anything) → show "Fresh inference" badge, tok/s, context bar
3. **Publish the answer** → show +5 credits in the mode badge
4. **Start a new chat, ask the same question** → show "Cached answer" badge, 0 inference tokens
5. **Ask a slightly different version** → show "Repackaged" badge and similarity score
6. **Attach an image** → switch to llava, show vision response
7. **Ask a math question** → show KaTeX rendered equations
8. **Open psql** in a terminal and show `SELECT * FROM market_entries` and `SELECT * FROM credit_events` live
9. **Switch models mid-session** → show model separator pill in the chat

---

## 6. Requirements Checklist (ECE366)

| Requirement | Status |
|---|---|
| Source code on GitHub | ✅ github.com/Isaacamar/meshmind |
| Service layer in Java | ✅ Spring Boot 3.3, dev.meshmind package |
| Docker for development | ✅ docker-compose.yml, all 4 services |
| Non-CLI user interface | ✅ React + Vite frontend |
| Persistent database | ✅ PostgreSQL 16 + pgvector |
| Cloud hosted (class can access) | ❌ Not deployed yet — needed by May 11 |
| User registration + login | ✅ JWT + BCrypt |
| Basic profile + account management | ⚠️ Profile read-only; no password change |
| GitHub PRs + code review | ✅ PR #31 (Amar) + PR #32 (Schertz), merged |
| ≥75% features complete (Apr 20) | ✅ ~80% feature complete |
| 25% unit test coverage (Apr 20) | ⚠️ 21 Python tests; 0 Java tests |
| 50% unit test coverage (May 11) | ❌ Java tests needed |

---

## 7. What to Tell Claude in a New Chat

Paste this as your first message:

---

> **Project:** MeshMind v2 — a privacy-first local AI network with a shared prompt marketplace.
>
> **Stack:** React/TypeScript frontend (Vite, port 3000) → OpenClaw FastAPI local node (port 8000) → Spring Boot 3.3 cloud backend (port 8080) → PostgreSQL 16 + pgvector. Local inference via Ollama (nomic-embed-text, llama3.2, llava, qwen2.5-coder).
>
> **Team:** Isaac Amar (OpenClaw + frontend), Isaac Schertz (Spring Boot + DB). ECE366, Cooper Union, Spring 2026.
>
> **How it works:** User asks a question → OpenClaw embeds it locally via Ollama → sends *only the embedding* (no plaintext) to the cloud backend → backend does pgvector cosine search → returns top-k cached answers with similarity scores. If similarity ≥ 0.90: serve cached answer (0 inference tokens). If 0.70–0.90: local model rewrites cached answer (~10x fewer tokens). If < 0.70: full local inference. User can publish their answer to the marketplace and earn credits; authors earn a royalty every time their entry is consumed.
>
> **Working features:** JWT auth, credits ledger, marketplace publish/search/consume, SSE streaming, multi-model chat, image+PDF attachments, temperature control, KaTeX math rendering, context fill bar, per-message token stats, 21 Python unit tests.
>
> **Gaps to address before May 11:** (1) Cloud deployment — AWS/GCP/Render; (2) Java unit tests (need 50% coverage); (3) Optional: account profile update, upvote/downvote.
>
> **I need a 5–10 minute final presentation** covering: what we built, why it's interesting, architecture diagram, live demo plan, what's complete vs. what's left, and how it meets the ECE366 project requirements.

---

## 8. Quick Reference — Key Files

| File | Purpose |
|---|---|
| `openclaw/app/server.py` | FastAPI endpoints + marketplace orchestrator |
| `openclaw/app/ollama_client.py` | Ollama embed + chat + streaming |
| `openclaw/app/market_client.py` | HTTP client for Spring Boot backend |
| `openclaw/tests/test_server.py` | 12 server route tests |
| `openclaw/tests/test_ollama_client.py` | 9 Ollama client tests |
| `backend/src/main/java/dev/meshmind/market/MarketController.java` | search, publish, consume, mine |
| `backend/src/main/java/dev/meshmind/auth/AuthController.java` | register, login |
| `backend/src/main/resources/schema.sql` | Full DB schema (users, market_entries, credit_events, consumptions) |
| `frontend/src/components/Chat.tsx` | Main chat component |
| `frontend/src/utils/models.ts` | Model tags, colors, context window sizes |
| `docker-compose.yml` | All 4 services wired together |
