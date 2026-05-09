# Local-First MeshMind Hosting

## Product Shape

MeshMind should be hosted as a **cloud marketplace plus local inference node**.

The cloud runs:

- React web interface
- Spring Boot Java service
- PostgreSQL + pgvector marketplace
- Accounts, credits, prompt search, publish/consume records

Each user runs locally:

- Ollama
- OpenClaw FastAPI node on `http://127.0.0.1:8000`
- Local models such as `nomic-embed-text` and `llama3.2:3b`

The hosted web app talks to the user's local node. The local node talks to Ollama and optionally talks to the cloud marketplace when the user logs in.

```text
Browser at hosted MeshMind UI
        |
        | HTTP to localhost
        v
OpenClaw local node (:8000)
        |                         |
        | local HTTP              | HTTPS/HTTP to cloud
        v                         v
Ollama local models          Spring Boot marketplace
                              PostgreSQL + pgvector
```

This keeps the thesis honest: inference stays local, while accounts and the shared cache are online.

## User Install Flow

For a normal user:

1. Install Ollama.
2. Download/clone MeshMind.
3. Run:

```bash
./scripts/install_local_node.sh
./scripts/run_local_node.sh
```

4. Open the hosted MeshMind website.
5. Log in or register.
6. If required models are missing, the sidebar can call:

```text
POST /api/models/pull
```

and stream `ollama pull` progress from the local node.

## Local Node Endpoints

These endpoints exist specifically to support a downloadable/local-first product:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/local/status` | Check Ollama reachability, cloud URL, installed models, missing models |
| POST | `/api/models/pull` | Pull approved Ollama models locally via streaming SSE |
| GET | `/api/models` | List installed chat-capable models |
| POST | `/api/ask/stream` | Local inference plus marketplace routing |
| POST | `/api/publish` | Publish explicit prompt/response pair to cloud marketplace |

## Hosted Frontend Behavior

The frontend uses `frontend/src/api/local.ts`.

- If the UI is running on `localhost`, API calls stay same-origin (`/api/...`) so Docker/Vite proxying works.
- If the UI is hosted on a public domain, API calls go to `http://127.0.0.1:8000/api/...`.
- Users can override with:

```js
localStorage.setItem('mm_local_api', 'http://127.0.0.1:8000')
```

The local FastAPI node sends:

```text
Access-Control-Allow-Private-Network: true
```

so modern browsers are allowed to call a private/local address from a public website.

## Offline/Online Modes

### Offline

If the cloud is unavailable:

- Local Ollama chat still works.
- The marketplace is skipped.
- Publishing, credits, and search are unavailable.

### Online

If the cloud is available and the user is logged in:

- Prompt embeddings are generated locally.
- Embeddings are sent to the cloud for pgvector search.
- Verbatim/repackage/miss routing works.
- Users can publish answers and earn credits.

## Fastest Path To Final Assignment Compliance

For the final class deployment:

1. Host the cloud marketplace stack somewhere public:
   - Spring Boot backend
   - Postgres + pgvector
   - React static site
2. Keep Ollama local on each user's machine.
3. Provide an install script and a clear "Local node connected" status in the UI.
4. During demo, show:
   - hosted website URL
   - local node status
   - model install/check
   - login/register
   - local chat
   - publish to marketplace
   - new chat that hits verbatim/repackage

This satisfies the assignment's hosted requirement while preserving the local inference architecture.

## What Still Needs Packaging

For a polished product, the local node should eventually be packaged as:

- macOS `.app` menu-bar app, or
- signed installer `.pkg`, or
- Homebrew command:

```bash
brew install meshmind
meshmind start
```

For ECE366, scripts are enough if the demo clearly shows the install/run path.

