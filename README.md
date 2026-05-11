# MeshMind

A privacy-first local AI network with a **prompt marketplace** — ask AI on your own hardware, but skip redundant inference when someone else has already answered your question.

---

## The Idea

Running LLMs locally is cheap but slow and repetitive — thousands of people ask "how do JWT refresh tokens work?" and their GPU generates the same answer every time.

MeshMind adds a shared, opt-in cache:

1. You ask a question. In local mode, your local node **embeds it privately** (nothing leaves your machine yet).
2. The cloud returns semantically similar prompts others have published.
3. One of three things happens:
   - **Verbatim hit** (similarity ≥ 0.90) — serve the cached answer, 0 inference tokens.
   - **Repackage** (0.70–0.90) — your local model rewrites the cached answer to fit your exact question. ~10x fewer tokens than a fresh answer.
   - **Miss** (< 0.70) — full local inference, and you can publish the result to earn credits.
4. Authors earn credits every time their published answer gets consumed.

Plaintext never leaves your machine unless **you** explicitly publish or choose the optional Groq web fallback. Account data and saved chat history are stored in the cloud so the public web app can log in and load prior chats without the local node running.

---

## Architecture

```
┌─ LOCAL (optional, your machine) ─────────────────────┐
│  OpenClaw (FastAPI, :8000)                           │
│   ├── Ollama client (embed + chat)                   │
│   ├── Market client (search + consume)               │
│   └── /api/ask orchestrator                          │
│  Ollama (:11434) — nomic-embed-text + chat model     │
└──────────────────────────────────────────────────────┘
          │  (embeddings for search; plaintext only on publish)
          ▼
┌─ CLOUD (Render) ─────────────────────────────────────┐
│  Spring Boot — auth, account, chats, marketplace     │
│  PostgreSQL 16 + pgvector — HNSW cosine index        │
│  Optional Groq proxy — user-provided key, not stored │
└──────────────────────────────────────────────────────┘
```

---

## Quick Start

**Just want to use the app?** See [GETTING_STARTED.md](GETTING_STARTED.md). Login, account management, and saved chats work from the public web app. Local OpenClaw/Ollama enables privacy-first local inference; a user-provided Groq key enables full web-only chat.

**Developer setup (self-host the backend):**

```bash
# Prerequisites: Docker, Python 3.10+, Ollama
git clone https://github.com/Isaacamar/meshmind.git
cd meshmind

# Start the cloud stack locally
docker compose up -d

# Start the local node
MESHMIND_CLOUD=http://localhost:8080 python3 local_node.py start
```

---

## Tech Stack

| Layer | Tech |
|---|---|
| Local inference | Ollama (chat + `nomic-embed-text`) |
| Local node | Python + FastAPI |
| Cloud API | Spring Boot 3.x, Java 21 |
| Vector search | PostgreSQL 16 + pgvector (HNSW, cosine) |
| Auth | JWT + BCrypt |
| Web fallback | Groq Chat Completions via Spring Boot proxy |
| Container | Docker, docker-compose |

---

## Repository Layout

```
meshmind-v2/
├── backend/            # Spring Boot cloud service (Schertz)
│   ├── src/main/java/dev/meshmind/
│   │   ├── auth/       # JWT + register/login
│   │   ├── user/       # profile + account management
│   │   ├── chat/       # cloud saved chats
│   │   ├── groq/       # optional web fallback proxy
│   │   ├── market/     # search / publish / consume / mine
│   │   └── config/     # Security, JPA
│   └── src/main/resources/schema.sql
├── openclaw/           # Local FastAPI node (Amar)
│   └── app/
│       ├── ollama_client.py    # embed + chat
│       ├── market_client.py    # cloud client
│       └── server.py           # /api/ask orchestrator + demo UI
├── docker-compose.yml
└── docs/
    ├── marketplace.md          # design notes for this pivot
    ├── proposal.md             # original ECE366 proposal (for reference)
    ├── architecture.md         # old P2P-routing architecture (superseded)
    └── agent-mode.md           # future: terminal/filesystem control
```

---

## API

### Cloud (Spring Boot, `:8080`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | no | create account |
| POST | `/api/auth/login` | no | issue JWT |
| GET | `/api/users/me` | yes | profile + credits |
| PUT | `/api/users/me` | yes | update display name / password |
| DELETE | `/api/users/me` | yes | delete account after password confirmation |
| GET | `/api/chats` | yes | load saved chats |
| POST | `/api/chats` | yes | save/update a chat |
| DELETE | `/api/chats/{id}` | yes | delete a saved chat |
| POST | `/api/market/search` | no | top-k by embedding (local node path) |
| POST | `/api/market/search/text` | no | top-k by raw text — server embeds via Nomic (Groq path) |
| POST | `/api/market/publish` | yes | add entry, earn bonus |
| POST | `/api/market/consume` | yes | record use, pay royalty |
| GET | `/api/market/mine` | yes | own published entries |
| POST | `/api/groq/chat` | yes | optional Groq fallback using caller's key |

### Local (FastAPI, `:8000`)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/ask` | embed → search → verbatim/repackage/miss |
| POST | `/api/ask/stream` | streaming local chat |
| POST | `/api/parse/pdf` | local PDF extraction |

---

## What Changed From the Original Proposal

The original MeshMind proposed peer query routing (send my prompt to your RTX 4090 via a WebSocket relay). That was cut. The marketplace replaces it with a stronger value proposition: **shared cache with attribution**, not borrowed hardware.

- Cut: peer routing (F5), node heartbeat (F3)
- Added: pgvector marketplace, credits ledger, cloud chat history, Groq fallback, three-mode ask orchestrator
- Kept: local-first inference, privacy contract, Spring Boot + Postgres stack, Docker
- Future: agent mode (filesystem + terminal control) — see `docs/agent-mode.md`

---

## Roadmap

| Milestone | Deliverable |
|---|---|
| **Now** | Auth, account management, cloud saved chats, marketplace, local chat, optional Groq fallback |
| **Next** | Upvote/downvote, broader integration coverage |
| **Demo** | Render deployment; web-only login/history/Groq flow plus local privacy-first flow |
| **Stretch** | Agent mode (read/write workspace files, run shell commands with approval) |

---

## Course Context

ECE366 — Software Engineering & Large Systems Design, Spring 2026, The Cooper Union.
Team: Isaac Amar (local node + frontend), Isaac Schertz (Spring Boot backend).
