# MeshMind

**A Privacy-First, Peer-to-Peer Local AI Network**

> All AI inference runs on each user's own machine.
> The cloud layer handles accounts, groups, and message routing only.
> No prompt or response content ever touches the central server.

---

## What Is MeshMind?

MeshMind is a web-based chat application where AI runs entirely on your own hardware. Unlike ChatGPT or Claude, your conversations never leave your machine. You can also form private groups with friends or teammates and optionally route a query to a peer with a more powerful local model — all end-to-end encrypted before it hits the relay.

The cloud is intentionally minimal: it stores user accounts, group memberships, and acts as an encrypted message relay. The AI itself runs locally via [Ollama](https://ollama.com), a free open-source tool for running LLMs on consumer hardware.

---

## Architecture Overview

```
                        Cloud (AWS / GCP)
                       ┌─────────────────────────────────┐
                       │  WebSocket Relay                │
                       │        │                        │
                       │  Spring Boot API ──► PostgreSQL │
                       └────────┬──────────┬────────────┘
                     auth/groups│          │auth/groups
                                │          │
              ┌─────────────────┘          └───────────────────┐
              │                                                 │
     ┌────────▼────────┐   peer query (encrypted)   ┌─────────▼────────┐
     │  React UI (A)   │ ◄────────────────────────► │  React UI (B)    │
     └────────┬────────┘                             └────────┬─────────┘
              │                                               │
     ┌────────▼────────┐                             ┌────────▼─────────┐
     │  Ollama (local) │                             │  Ollama (local)  │
     └────────┬────────┘                             └────────┬─────────┘
              │                                               │
     ┌────────▼────────┐                             ┌────────▼─────────┐
     │ SQLite (cache)  │                             │ SQLite (cache)   │
     └─────────────────┘                             └──────────────────┘
          Machine A                                       Machine B
```

The relay server passes encrypted blobs between peers. It cannot read message content.

---

## Technology Stack

| Layer | Technology | Role |
|---|---|---|
| Frontend | React + TypeScript | Chat UI, group sidebar, node dashboard |
| Local inference | Ollama (REST API) | LLM backend on user's machine |
| Local cache | SQLite | Offline conversation history |
| Service layer | Spring Boot 3.x (Java 21) | Auth, node registry, groups, WebSocket relay |
| Cloud database | PostgreSQL 16 | Users, groups, conversations |
| Auth | Spring Security + JWT | Stateless API authentication |
| Containers | Docker + docker-compose | Local dev and cloud deployment |
| Cloud hosting | AWS EC2 + RDS or GCP Cloud Run + Cloud SQL | Production |

---

## Core Features

| ID | Feature | Status |
|---|---|---|
| F1 | User registration, login, JWT auth, profile management | In Progress |
| F2 | Local AI chat interface (OpenClaw-based, already functional) | Done |
| F3 | Node registry and online status heartbeat | In Progress |
| F4 | Peer groups — create, invite, member list | In Progress|
| F5 | Peer query routing via encrypted WebSocket relay | Testing |
| F6 | Node dashboard — hardware stats, peer status | Planned |
| F7 | Agent mode — terminal/kernel integration, filesystem-aware AI | Roadmap |
| F8 | Distributed knowledge sharing — peer vector sync (stretch) | Stretch |

---

## Roadmap

### Phase 1 — Backend Core (Sprint 1–2)
- Spring Boot project setup with Docker + PostgreSQL
- User auth: register, login, JWT, bcrypt
- Node registry: heartbeat endpoint, online/offline tracking
- REST API for groups: create, invite, list members

### Phase 2 — Frontend Integration (Sprint 2–3)
- Integrate OpenClaw chat UI with Spring Boot backend
- Login/register screens
- Group sidebar: member list, online status, model badges
- Sync conversation history to PostgreSQL

### Phase 3 — Peer Routing (Sprint 3–4)
- WebSocket relay in Spring Boot
- Client-side encryption (Web Crypto API / libsodium.js)
- UI: "Ask peer" button, peer model selector
- Node dashboard: GPU/RAM stats, peer status panel

### Phase 4 — Agent Mode (Roadmap)
- Terminal/kernel integration within the chat UI
- Filesystem-aware AI with workspace scoping
- Three-layer path safety (allowlist, traversal guard, destructive-op confirmation)
- Plan-then-execute model: AI proposes actions, user approves before anything runs
- Inspired by Claude Code — local, private, and IDE-embeddable

### Phase 5 — Distributed Knowledge (Stretch)
- Local document embeddings (not the documents themselves)
- Peer vector sync within groups
- Cross-peer RAG queries

---

## Getting Started

### Prerequisites
- [Ollama](https://ollama.com) installed and running locally
- Java 21+
- Node.js 18+
- Docker + docker-compose

### Local Development

```bash
# Clone the repo
git clone https://github.com/isaacamar/meshmind.git
cd meshmind

# Start PostgreSQL and Spring Boot via Docker
docker-compose up -d

# Start the React frontend
cd frontend
npm install
npm run dev

# The OpenClaw local chat backend (Python/FastAPI) runs separately
cd openclaw
pip install -r requirements.txt
uvicorn app.server:app --reload --port 8000
```

> Full setup guide: [docs/setup.md](docs/setup.md) (coming soon)

---

## Repository Structure

```
meshmind/
├── backend/          # Spring Boot service (Java 21)
│   └── src/
├── frontend/         # React + TypeScript UI
│   └── src/
├── openclaw/         # Local FastAPI chat backend (Python)
│   └── app/
├── docs/             # Proposals, architecture, setup guides
│   ├── proposal.md
│   ├── agent-mode.md
│   └── architecture.md
├── docker-compose.yml
└── README.md
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch conventions, PR process, and code standards.

This project tracks work via GitHub Issues. Every PR requires at least one peer review before merge.

---

## Team

| Member | Role |
|---|---|
| [Isaac Amar](https://github.com/isaacamar) | React frontend, chat UI integration, local Ollama client, WebSocket client/relay, cloud deployment|
| Isaac Schertz | Spring Boot backend, REST API, PostgreSQL schema, Docker |

**Course:** ECE366 – Software Engineering & Large Systems Design
**Institution:** The Cooper Union for the Advancement of Science and Art
**Semester:** Spring 2026

---

## License

MIT — see [LICENSE](LICENSE).
