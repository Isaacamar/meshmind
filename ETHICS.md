# Ethical Engineering: Lessons from MeshMind v2

This document outlines the ethical considerations and professional standards applied during the development of the MeshMind v2 platform, aligned with the ACM/IEEE Software Engineering Code of Ethics.

---

## 1. Privacy by Architecture — 1.03

The core design of MeshMind ensures that user prompts never leave their machine in plaintext. Rather than sending raw queries to a cloud service, OpenClaw embeds each prompt locally via Ollama (nomic-embed-text) and transmits only the resulting 768-dimensional vector to the cloud marketplace. Because embeddings are a lossy, non-reversible transformation, the server cannot reconstruct what the user typed. Privacy is not a feature — it is the architectural contract.

## 2. Securing User Credentials — 1.03

User passwords are hashed with BCrypt before storage and never appear in logs or API responses. Session management uses signed JWT tokens with a 7-day expiry. The browser stores the JWT for cloud account, profile, marketplace, and saved-chat access; tokens are never transmitted in URLs.

## 3. User Autonomy Over Local Resources — 1.02

MeshMind does not silently install software or pull AI models without explicit user consent. The `local_node.py` setup script lists each model before downloading, states the size, and requires the user to confirm. Users may skip all optional models entirely and install only what they choose. No background processes are started without the user initiating them.

## 4. Honest Attribution in the Marketplace — 7.03

When a user publishes a prompt/response pair to the marketplace, their user ID is recorded as `author_id` and preserved in the `market_entries` table permanently. When another user's query matches and consumes that entry, the original author receives a credit royalty and the consumption is logged in the `consumptions` table with full attribution. The system is designed so that credit cannot be claimed for work that is not yours.

## 5. Transparent Cache Mechanics — 6.07

Every assistant response in the UI carries a visible badge — **Fresh inference**, **Repackaged**, or **Cached answer** — along with the cosine similarity score when applicable. Users always know whether they received a cached response, a locally adapted one, or a full inference. Token counts and throughput (tok/s) are displayed per message. There are no hidden intermediaries in the response pipeline.

## 6. Software Integrity via Testing — 3.10

OpenClaw has 21 unit tests covering server routes and the Ollama client, run with pytest. Tests mock external dependencies (Ollama, the cloud backend) so the suite runs offline and deterministically. Critical paths — login, embed, search, stream, publish, consume — are all covered. The Spring Boot backend includes integration-level coverage of the marketplace and auth endpoints.

## 7. Minimal Data Collection — 1.02

The cloud backend stores only what is necessary for the deployed product: hashed credentials, account metadata, saved chat history, published marketplace entries, embeddings for published entries, and credit ledger rows. This is a deliberate tradeoff so users can log in from the public site and reopen chats without running a local node. Marketplace publishing remains explicit.

## 7a. Optional Cloud Inference Disclosure — 1.04

Groq fallback is opt-in. When the user saves a Groq API key and sends a fallback chat, the prompt and recent conversation context are sent through the MeshMind Spring Boot backend to Groq's Chat Completions API. MeshMind does not store the Groq key; it is kept in the user's browser and forwarded only for that request. The UI labels Groq-generated replies so users can distinguish web fallback from local private inference.

## 8. Responsible Local Inference — 3.02

By running inference on the user's own hardware via Ollama, MeshMind avoids the energy and compute cost of routing every query through a centralized GPU cluster. The repackage and verbatim cache hit tiers further reduce redundant computation — a query answered from cache consumes zero inference tokens. This is both a privacy guarantee and a resource efficiency decision.

## 9. Team Attribution and Contribution Transparency — 7.03

Development was split clearly between two contributors: Isaac Amar (OpenClaw FastAPI node, React frontend) and Isaac Schertz (Spring Boot backend, PostgreSQL schema). Commits are authored individually, PRs are reviewed and merged separately (PR #31, PR #32), and no contributor's code was committed under another's name. AI-assisted development (Claude Code) was used for scaffolding and iteration and is acknowledged here.

## 10. Career Development Through Full-Stack Systems — 8.01

This project required integrating technologies across the full stack: React/TypeScript, FastAPI, Spring Boot, PostgreSQL with pgvector, Ollama, Docker Compose, and cloud deployment on Render. Adopting pgvector for approximate nearest-neighbor search and SSE for per-token streaming required learning outside the course curriculum. Ethically, software engineers must engage in continuous learning to deliver systems that are current, secure, and fit for purpose.
