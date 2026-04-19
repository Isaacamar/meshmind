# Mac Setup (M4, 24 GB unified memory)

Target machine: MacBook Pro M4, 24 GB RAM. Everything is unified memory → acts as VRAM.
Budget: ~8 GB for macOS/apps, ~14–16 GB for model + KV cache.
Hard ceiling: 14B–20B models. Skip 32B+ on this box.

## Prerequisites

```bash
# Install Homebrew if needed: https://brew.sh
brew install ollama git python@3.11 jq
brew install --cask docker

# Start Ollama (background service)
brew services start ollama
# or one-shot: ollama serve &
```

## Model lineup

```bash
ollama pull qwen2.5-coder:14b          # coding daily driver
ollama pull deepseek-r1:14b            # reasoning / debug
ollama pull qwen2.5:14b-instruct-1m    # long context (up to ~64K practical)
ollama pull gpt-oss:20b                # general / agent — tight fit
ollama pull qwen2.5vl:7b               # vision
ollama pull nomic-embed-text           # embeddings (matches schema vector(768))
ollama pull qwen2.5-coder:7b           # fast autocomplete
```

## Long-context Modelfiles (Ollama defaults to 2048 tokens)

```bash
cat > /tmp/Modelfile.coder <<'EOF'
FROM qwen2.5-coder:14b
PARAMETER num_ctx 65536
EOF
ollama create qwen2.5-coder-long -f /tmp/Modelfile.coder

cat > /tmp/Modelfile.r1 <<'EOF'
FROM deepseek-r1:14b
PARAMETER num_ctx 32768
EOF
ollama create deepseek-r1-long -f /tmp/Modelfile.r1
```

## Running the repo

```bash
cd ~/meshmind-v2

# 1. cloud stack
docker compose up -d --build
docker compose logs -f backend    # wait for "Started MeshMindApplication"

# 2. local node
cd openclaw
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# choose default chat model via env var (defaults to qwen2.5-coder:14b)
export MESHMIND_CHAT_MODEL=qwen2.5-coder-long
uvicorn app.server:app --reload --port 8000

# 3. open http://localhost:8000
```

## Env vars

| Var | Default | Purpose |
|---|---|---|
| `OLLAMA_URL` | `http://localhost:11434` | Point the node at a remote Ollama (e.g. another machine) |
| `MESHMIND_CHAT_MODEL` | `qwen2.5-coder:14b` | Default chat model |
| `MESHMIND_EMBED_MODEL` | `nomic-embed-text` | Must stay 768-dim to match schema |
| `MESHMIND_CLOUD` | `http://localhost:8080` | Cloud API base URL |

## Sanity checks

```bash
ollama list
ollama ps                                       # see loaded model + context size
curl http://localhost:11434/api/tags | jq .
curl http://localhost:8080/actuator/health 2>/dev/null
```

## Mac-specific gotchas

- **Docker Desktop memory**: default 2 GB is fine for Postgres+Spring Boot, bump to 4 GB if backend OOMs. Settings → Resources.
- **Metal flash-attention**: Ollama enables automatically. Past ~64K context on Metal, throughput drops faster than on CUDA — keep `num_ctx` conservative.
- **Activity Monitor → Memory tab** shows real pressure. Yellow/red = close apps before loading models.
- **Don't** pull 32B models. They load but eat all memory, making the OS swap and the demo crawl.
