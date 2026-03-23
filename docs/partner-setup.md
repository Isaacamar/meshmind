# MeshMind — Partner Setup Guide
**For:** Isaac Schertz
**Written:** March 23, 2026

This gets MeshMind fully running on your Mac and explains how to connect with Isaac A for group/peer testing.

---

## Prerequisites

Install these if you don't have them:

```bash
# Homebrew (if not installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Docker Desktop — download from https://docker.com/products/docker-desktop
# (install manually, not via brew)

# Ollama — local AI runtime
brew install ollama

# Node.js
brew install node
```

Verify:
```bash
docker --version        # Docker version 25+
node --version          # v18+
ollama --version        # 0.x
```

---

## 1. Clone the repo

```bash
git clone https://github.com/isaacamar/meshmind.git
cd meshmind
```

---

## 2. Start Ollama (native — uses your Mac's GPU)

Ollama must run **natively** (not in Docker) to use Apple Silicon Metal acceleration.
It must also bind to `0.0.0.0` so Docker containers can reach it.

```bash
OLLAMA_HOST=0.0.0.0 ollama serve
```

Leave this running. Open a new terminal tab for the next steps.

**Pull a model** (do this once):
```bash
ollama pull llama3.2:3b
```
This is ~2GB. On an M-series Mac it runs fast. If you have more RAM, `llama3.1:8b` (~5GB) gives better output.

---

## 3. Start the Docker stack

This starts PostgreSQL, Spring Boot (REST API), and the OpenClaw local AI backend:

```bash
cd meshmind
docker compose up --build
```

First build takes ~5–10 minutes (downloads Maven + Python deps). After that it's fast.

What starts:

| Service | Port | What it does |
|---|---|---|
| PostgreSQL | 5432 | Database (users, groups, nodes) |
| Spring Boot | 8080 | REST API — auth, groups, heartbeat |
| OpenClaw | 8000 | Local AI backend — talks to your Ollama |

---

## 4. Start the React frontend

In a new terminal tab:

```bash
cd meshmind/frontend
npm install
npm run dev
```

Open **http://localhost:3000** in your browser.

---

## 5. Register your account

On the login screen, click **Register** and create your account. This registers you on whichever Spring Boot backend you're pointed at (see Section 6).

---

## 6. Connecting to Isaac A's backend vs. running your own

You have two options depending on the situation:

### Option A — Running your own full stack (default)

Everything runs on your machine. Good for individual development and testing.

Create this file (it's gitignored so it won't be committed):

```bash
# frontend/.env.local
VITE_CLOUD_URL=http://localhost:8080
```

Your frontend talks to your own Spring Boot on `:8080`.

### Option B — Connecting to Isaac A's machine (same WiFi)

When you're on the same network and want to test groups together:

1. Get Isaac A's local IP:
   ```bash
   # Isaac A runs this on his machine
   ipconfig getifaddr en0
   ```

2. You create `frontend/.env.local`:
   ```
   VITE_CLOUD_URL=http://<isaac-a-ip>:8080
   ```

3. Restart your frontend: `Ctrl+C` then `npm run dev`

4. Register on his backend, he invites you to a group, you both see each other online.

### Option C — Cloud deployment (production)

Once we deploy Spring Boot to AWS/GCP, update `.env.local` to point at the cloud URL:
```
VITE_CLOUD_URL=https://api.meshmind.app
```

Everyone connects to the same backend without needing to be on the same WiFi.

---

## 7. Testing the group feature with Isaac A

Once you're both pointing at the same Spring Boot backend:

1. **Isaac A** creates a group in the Groups panel (bottom of sidebar)
2. **Isaac A** clicks the `+` next to the group → types your username → Invite
3. **You** refresh the page → see the group appear in your sidebar
4. Expand the group → see each other listed as **online** with model name shown
5. This confirms node registry, group membership, and heartbeat all work end-to-end

---

## 8. Architecture overview (what runs where)

```
Your Mac                          Isaac A's Mac (or cloud)
─────────────────────             ──────────────────────────
Ollama (Metal GPU)                Ollama (Metal GPU)
  └─ llama3.2:3b                    └─ llama3.2:3b

OpenClaw (Docker :8000)           Spring Boot (Docker :8080)
  └─ FastAPI, SQLite                └─ Auth, Groups, Nodes
  └─ talks to local Ollama         PostgreSQL (Docker :5432)

React UI (npm :3000)
  └─ /api/* → OpenClaw            ← local AI chat
  └─ VITE_CLOUD_URL → Spring Boot ← accounts, groups, online status
```

Key point: **AI conversations stay on your machine.** The Spring Boot backend only stores account metadata, group memberships, and online status — never conversation content.

---

## 9. Quick reference — all commands

```bash
# Start Ollama (do every session)
OLLAMA_HOST=0.0.0.0 ollama serve

# Start backend + database + openclaw
docker compose up --build

# Start frontend (new tab)
cd frontend && npm run dev

# Check everything is running
curl http://localhost:8080/api/auth/login \
  -X POST -H "Content-Type: application/json" \
  -d '{"username":"yourname","password":"yourpassword"}'

curl http://localhost:8000/health
curl http://localhost:11434/api/tags
```

---

## 10. Common issues

| Problem | Fix |
|---|---|
| `ENOTFOUND openclaw` in Vite | You're running `npm run dev` locally — this is expected, it means OpenClaw Docker container isn't reachable by name. Make sure `docker compose up openclaw` is running. |
| Ollama not detected in UI | Stop `ollama serve`, restart with `OLLAMA_HOST=0.0.0.0 ollama serve` |
| Login fails with `Connection refused` | Check `VITE_CLOUD_URL` in `frontend/.env.local` points to a running Spring Boot instance |
| `No models found` in UI | Run `ollama pull llama3.2:3b` and make sure Ollama is running |
| Docker build fails | Make sure Docker Desktop is open and running before `docker compose up` |

---

## 11. Division of work (for reference)

| Area | Owner |
|---|---|
| React frontend, chat UI, WebSocket client | Isaac Amar |
| Spring Boot backend, REST API, PostgreSQL, Docker, WebSocket relay, cloud deployment | Isaac Schertz |

Your main focus for the next sprint: **WebSocket relay** in Spring Boot (`/ws` endpoint) and **cloud deployment** (AWS EC2 + RDS or GCP). See the open GitHub issues for details.
