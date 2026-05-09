# MeshMind Hosting Plan

## Fastest Honest Hosting Path

MeshMind is not a normal React + Spring Boot app because the AI runtime is local Ollama. A typical free PaaS deploy can host the UI, Java API, and Postgres, but it will not reliably run `llama3.2`, `qwen2.5-coder`, or `llava` locally. The fastest path that preserves the project thesis is therefore:

**Deploy the full Docker stack on one cloud VM with enough RAM, install Ollama on that VM, and expose the React UI.**

Recommended minimum VM for demo:

- Ubuntu 22.04/24.04
- 4 vCPU
- 8 GB RAM minimum
- 40+ GB disk
- Docker + Docker Compose
- Ollama installed on the host
- Models pulled on the host:
  - `nomic-embed-text`
  - `llama3.2:3b`
  - optional: `qwen2.5-coder:14b` only if the VM has enough RAM

This is the quickest way to satisfy:

- Docker development/runtime
- Java service layer
- persistent Postgres database
- non-command-line React UI
- internet-accessible deployment
- local-inference thesis, because inference stays on the VM instead of depending on OpenAI/Groq/etc.

## Why Not Vercel/Render/Railway Only?

Those platforms are good for the UI, Spring Boot service, and Postgres. They are not the best fit for running local LLMs. Railway's own pgvector/RAG guide describes the normal hosted pattern as CPU services plus external model APIs, not local model execution. Render can host Docker services and Postgres with pgvector, but local Ollama model hosting is still the hard part.

So there are three practical choices:

| Option | Time | Works for class? | Preserves local-model thesis? | Notes |
|---|---:|---|---|---|
| Cloud VM + Docker + Ollama | 2-4 hours | Yes | Yes | Best balance for final |
| Render/Railway + external LLM API fallback | 1 day | Yes | Partially | Fast public app, weaker privacy thesis |
| Cloudflare/ngrok tunnel to your laptop | 20 minutes | Yes for demo | Yes | Emergency only; not really cloud-hosted |

## Required Code/Repo Cleanup Before Hosting

1. Commit the current cleanup changes.
2. Make sure old `backend/src/main/java/com/meshmind` files stay deleted.
3. Make sure old Flyway files stay deleted.
4. Keep `spring.sql.init.mode=always` so managed or fresh Postgres gets `schema.sql`.
5. Remove `--reload` from the OpenClaw Docker command for production.
6. Use a real `JWT_SECRET` in production.
7. Do not expose Postgres publicly.
8. Expose only the frontend publicly unless debugging.

## VM Setup Commands

Run on a fresh Ubuntu VM:

```bash
sudo apt update
sudo apt install -y ca-certificates curl git

curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

curl -fsSL https://ollama.com/install.sh | sh
sudo systemctl enable ollama
sudo systemctl start ollama

ollama pull nomic-embed-text
ollama pull llama3.2:3b
```

Log out and back in so Docker group permissions take effect.

Clone and run:

```bash
git clone https://github.com/Isaacamar/meshmind.git
cd meshmind
docker compose up -d --build
```

Open:

```text
http://<VM_PUBLIC_IP>:3000
```

## Production Smoke Test

After deploy:

```bash
docker compose ps
curl http://localhost:8000/api/models
curl http://localhost:8080/actuator/health
```

In the browser:

1. Register a user.
2. Ask a first prompt.
3. Publish the answer.
4. Start a new chat.
5. Ask a semantically similar prompt.
6. Confirm mode is `verbatim` or `repackage`.
7. Run:

```bash
./scripts/thesis_stats.sh
```

## What To Say If Asked About Hosting

MeshMind is deployed as a Dockerized full-stack system: React frontend, FastAPI local-node service, Spring Boot Java service layer, PostgreSQL with pgvector, and Ollama for local model execution. The model runtime is intentionally part of the deployment because the core project claim is local/private inference rather than cloud API inference.

