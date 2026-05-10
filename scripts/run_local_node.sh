#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

export MESHMIND_CLOUD="${MESHMIND_CLOUD:-http://localhost:8080}"
export OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"

exec openclaw/.venv/bin/uvicorn app.server:app \
  --app-dir openclaw \
  --host 127.0.0.1 \
  --port 8000
