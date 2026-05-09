#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required. Install Python 3.10+ first."
  exit 1
fi

if ! command -v ollama >/dev/null 2>&1; then
  echo "Ollama is required. Install it from https://ollama.com/download, then rerun this script."
  exit 1
fi

if [ ! -d "openclaw/.venv" ]; then
  python3 -m venv openclaw/.venv
fi

openclaw/.venv/bin/python -m pip install --upgrade pip
openclaw/.venv/bin/python -m pip install -r openclaw/requirements.txt

ollama pull nomic-embed-text
ollama pull llama3.2:3b

echo
echo "Local MeshMind node is installed."
echo "Start it with:"
echo "  ./scripts/run_local_node.sh"
