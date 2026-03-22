# MeshMind — Semester Project Proposal

**Course:** ECE366 – Software Engineering & Large Systems Design
**Department:** Electrical Engineering, Albert Nerken School of Engineering
**Institution:** The Cooper Union for the Advancement of Science and Art
**Team:** Isaac Amar, Isaac Schertz
**Date:** March 22, 2026

---

## Project Title

**MeshMind – Privacy-First Peer-to-Peer Local AI Network**

---

## What We Are Building

MeshMind is a web-based chat application where users run AI entirely on their own hardware. Unlike tools like ChatGPT or Claude, no conversation data is ever sent to a third-party server. Users can also form private groups with friends or teammates, and optionally send a query to a peer who has a more powerful local model available.

The cloud component of this project is intentionally minimal. It stores user accounts, group memberships, and acts as a message relay between peers. The AI itself runs locally on each user's machine using Ollama, a free open-source tool that runs large language models (LLMs) on consumer hardware.

We already have a working local chat interface built using OpenClaw (an open-source local AI GUI), which includes conversation saving, math rendering, and model switching. This project extends that foundation by adding user accounts, peer groups, and cloud-relayed peer routing through a full Java Spring Boot backend and PostgreSQL database.

The motivation comes from recent research showing that over 77% of real AI queries are simple tasks like writing help, summarization, and general questions. These tasks do not need expensive cloud infrastructure. Local models handle them well, and routing them locally removes both the cost and the privacy risk of sending data to a centralized server.

---

## Core Features

### F1. User Registration, Login, and Profile Management
Users create an account with a username, email, and password. They can update their display name, avatar, and list which local AI models they have available. Authentication uses JWT tokens. All user data is stored in PostgreSQL.

### F2. Local AI Chat Interface (already functional)
A chat UI that connects to the user's local Ollama instance. The existing OpenClaw-based interface already supports conversation history, math rendering, model switching, and system prompts. For this project, we will integrate it with the Spring Boot backend so that conversation history syncs to the user's account in PostgreSQL.

### F3. Node Registry and Online Status
When the app is open, the client sends a heartbeat to the Spring Boot server to register itself as online. This lets the server know which users are active and what models they currently have running. Other users in the same group can see this information.

### F4. Peer Groups
Users can create named groups and invite other users by username. The cloud stores group membership. Once in a group, members can see each other's online status and available models in a sidebar panel.

### F5. Peer Query Routing
From the chat interface, users can choose to send a query to a specific peer's machine instead of their own local model. The query travels from the sender's browser to the Spring Boot server via WebSocket, then gets relayed to the target peer. The peer's local model responds, and the answer comes back the same way. The server relays the message but cannot read it because it is encrypted client-side before sending.

### F6. Node Dashboard
A UI panel showing the user's own hardware stats (which model is loaded, approximate memory usage) and the online/offline status of peers in their groups.

### F7. Distributed Knowledge Sharing (stretch goal)
Users can optionally share document embeddings (not the documents themselves) with group peers, allowing group members to query each other's local knowledge bases. This feature will only be built if time allows.

---

## Feature Effort Estimation

| Feature | Key Components | Effort | Sprint |
|---|---|---|---|
| F1 – Auth | Spring Security, JWT, Postgres user table | Low | 1 |
| F2 – Chat UI | Already built; integrate with backend/DB | Low | 1 |
| F3 – Node Registry | Heartbeat endpoint, nodes table in Postgres | Medium | 1–2 |
| F4 – Peer Groups | Group schema, invite flow, member list UI | Medium | 2–3 |
| F5 – Peer Routing | WebSocket relay, client-side encryption, UI | High | 3–4 |
| F6 – Dashboard | WebSocket status updates, dashboard panel | Medium | 3–4 |
| F7 – Dist. Knowledge | Local embeddings, peer vector sync (stretch) | Very High | 5+ |

---

## Risks

- **WebSocket relay reliability:** Peer routing requires both sender and recipient to be online simultaneously. We will handle this with a server-side message queue so messages are not lost on brief disconnects.
- **Ollama cross-platform behavior:** The Ollama API behaves slightly differently on macOS, Windows, and Linux. We will test on at least two platforms.
- **Client-side encryption complexity:** Encrypting in the browser before sending requires careful key management. We will use the Web Crypto API or libsodium.js rather than rolling our own.
- **Cloud hosting costs:** Spring Boot and PostgreSQL deployment must stay within free tier limits on AWS or GCP.
- **Feature F7 scope:** Distributed knowledge sharing is explicitly a stretch goal and will be cut if it risks core features.

---

## Architecture

### High-Level System Diagram

```
                        Cloud (AWS / GCP)
                       ┌─────────────────────────────────┐
                       │  WebSocket Relay                │
                       │        │                        │
                       │  Spring Boot API ──► PostgreSQL │
                       └────────┬──────────┬────────────┘
                     auth/groups│          │auth/groups
              ┌─────────────────┘          └───────────────────┐
     ┌────────▼────────┐   peer query (encrypted)   ┌─────────▼────────┐
     │  React UI (A)   │ ◄────────────────────────► │  React UI (B)    │
     └────────┬────────┘                             └────────┬─────────┘
     │  Ollama (local) │                             │  Ollama (local)  │
     │ SQLite (cache)  │                             │ SQLite (cache)   │
          Machine A                                       Machine B
```

The cloud server relays peer messages but cannot read them because they are encrypted before leaving the client. All AI inference happens on the user's local machine.

---

## ECE366 Requirement Checklist

| Requirement | How MeshMind Satisfies It | Met |
|---|---|---|
| Full-stack (DB, service, UI) | PostgreSQL on cloud, Spring Boot service, React frontend | Yes |
| Service layer in Java | Spring Boot 3.x handles auth, node registry, group management, WebSocket relay | Yes |
| Docker for development | docker-compose bundles Postgres and Spring Boot; Ollama runs separately | Yes |
| Non-CLI user interface | React web app with chat UI, group sidebar, and node dashboard | Yes |
| Persistent database | PostgreSQL (cloud) for users, groups, nodes; local SQLite for conversation cache | Yes |
| Cloud hosted | Spring Boot and Postgres deployed on AWS or GCP | Yes |
| User auth and profile | JWT login, bcrypt passwords, profile with model list and hardware info | Yes |
| Achievable in one semester | F1–F4, F6 are standard full-stack work; F2 is already built; F7 is optional stretch | Yes |

---

## Database Schema

### Cloud PostgreSQL

```sql
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
CREATE TABLE groups (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID REFERENCES users(id),
    name        VARCHAR(128) NOT NULL,
    description TEXT,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- Group membership
CREATE TABLE group_members (
    group_id  UUID REFERENCES groups(id) ON DELETE CASCADE,
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
    role       VARCHAR(16),   -- 'user' or 'assistant'
    content    TEXT,
    from_peer  BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## REST API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | /api/auth/register | Create a new user account |
| POST | /api/auth/login | Log in and receive a JWT |
| GET | /api/users/me | Get current user profile |
| PUT | /api/users/me | Update profile and model list |
| POST | /api/nodes/heartbeat | Register or refresh node as online |
| GET | /api/nodes/{groupId} | List online nodes in a group |
| POST | /api/groups | Create a new peer group |
| POST | /api/groups/{id}/invite | Invite a user to a group |
| GET | /api/groups/mine | List all groups for the current user |
| GET | /api/conversations | List all conversations for current user |
| POST | /api/conversations | Create a new conversation |
| POST | /api/conversations/{id}/messages | Save a message to a conversation |

WebSocket connections are handled via Spring Boot's WebSocket support. The relay endpoint at `/ws` accepts authenticated connections and routes encrypted peer messages between group members.

---

## Team and Division of Work

| Member | Primary Responsibility | Secondary |
|---|---|---|
| Isaac Amar | React frontend, chat UI integration, local Ollama client | WebSocket client, node dashboard |
| Isaac Schertz | Spring Boot backend, REST API, PostgreSQL schema, Docker | WebSocket relay, cloud deployment |

Weekly check-ins, GitHub Issues with assignees and deadlines, at least one peer review per PR before merge.

---

## Project Schedule

| Date | Milestone | Target Deliverables |
|---|---|---|
| Mar 9 | Backend Demo | PostgreSQL schema in Docker; Spring Boot serving auth, node registry, and group CRUD (~50% of F1–F4); testable via Postman |
| Apr 20 | Local Working Demo | Full chat UI connected to Ollama; login and group invite working; basic peer routing; 25% unit test coverage |
| May 11 | Final Presentation | Full stack on cloud; F1–F6 complete; F7 if time allows; 50% unit test coverage; live demo |

---

## Technology Stack

| Layer | Technology | Role |
|---|---|---|
| Frontend | React + TypeScript | Chat UI, group sidebar, node dashboard |
| Local inference | Ollama (REST API) | LLM backend on user's machine |
| Local cache | SQLite | Offline conversation history |
| Service layer | Spring Boot 3.x (Java 21) | Auth, node registry, groups, WebSocket relay |
| Cloud database | PostgreSQL 16 | Users, groups, conversations, messages |
| Auth | Spring Security + JWT | Stateless API authentication |
| Containers | Docker + docker-compose | Local dev and cloud deployment |
| Cloud hosting | AWS EC2 + RDS or GCP Cloud Run + Cloud SQL | Production |

---

## Why This Project Fits the Course

This project covers every ECE366 requirement and also has real-world significance. It is a genuine full-stack application: Spring Boot Java backend, PostgreSQL database, React frontend, Docker containerization, and cloud deployment.

What makes it interesting beyond the requirements is the architectural constraint: the cloud server should never be able to read a user's AI conversations. Enforcing this in the schema and the message relay design requires careful thinking about what data lives where — exactly the kind of system design reasoning this course is built around.

The chat UI is already functional from prior work, so the semester can focus on the backend, account system, group infrastructure, and peer routing layer, with time for thorough testing.
