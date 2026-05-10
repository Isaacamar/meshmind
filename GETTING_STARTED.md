# Getting Started with MeshMind

MeshMind runs AI locally on your machine. Your conversations stay private — only embeddings (not text) are sent to the cloud for marketplace search.

---

## What you need

| Requirement | Notes |
|---|---|
| **Python 3.10–3.13** | [python.org/downloads](https://www.python.org/downloads/) — **do not use 3.14**, it is too new for a required dependency. Download 3.13 specifically. |
| **Ollama** | [ollama.com/download](https://ollama.com/download) — available for Mac, Linux, Windows |
| **A chat model** | Downloaded through the setup script or the in-app model browser |

That's it. No Docker, no Java, no database setup.

---

## Setup (one time)

```bash
git clone https://github.com/Isaacamar/meshmind.git
cd meshmind
python3 local_node.py
```

The script will:
1. Check that Ollama is installed
2. Set up a Python virtual environment
3. Pull `nomic-embed-text` (required — used for private semantic search)
4. Ask which chat model you want to install (or skip if you already have one)
5. Start the local node

> **Windows users:** use `python3 local_node.py` in a regular terminal (not WSL). Ollama must be installed and running first.

---

## Every time after that

Make sure Ollama is running, then:

```bash
python3 local_node.py start
```

Then open the MeshMind web app: **[meshmind-1.onrender.com](https://meshmind-1.onrender.com)** 

---

## In the app

1. **Register** or log in
2. **Pick a model** from the dropdown — any model you have installed in Ollama appears here
3. **Start a chat** — inference runs on your machine
4. **Get more models** — click `+ get models` next to the model selector to browse and download recommended models, or type any Ollama model name

### Mode badges

Every response shows how it was generated:

| Badge | Meaning |
|---|---|
| `✗ Fresh inference` | Full local inference — your GPU did the work |
| `↻ Repackaged` | A similar cached answer was adapted locally (~10x fewer tokens) |
| `✓ Cached answer` | Exact match found in the marketplace — 0 inference tokens |
| `⬡ Local only` | Local-only mode is ON — marketplace bypassed entirely |

### Local only mode

Toggle **Local only** in the sidebar to skip the marketplace entirely. All responses are generated locally regardless of what's in the cache. Useful if you want full privacy or are working offline.

### Publishing

After a fresh inference, a **Publish** button appears. Publishing adds your prompt and response to the shared marketplace and earns you **+5 credits**. Every time someone else's query matches your entry, you earn **+1 credit**.

---

## Recommended models

| Model | Size | Good for |
|---|---|---|
| `llama3.2:3b` | ~2 GB | Fast general chat |
| `mistral:7b` | ~4 GB | Great general-purpose |
| `qwen2.5-coder:7b` | ~4 GB | Code generation |
| `llava:7b` | ~5 GB | Images and vision |
| `phi4:14b` | ~8 GB | Math and reasoning |

You can also pull any model from [ollama.com/library](https://ollama.com/library) using the custom model input in the app.

---

## Troubleshooting

**"Local node not ready" in the app**
- Make sure `python3 local_node.py start` is running in a terminal
- Make sure Ollama is running (`ollama serve`)

**No models in the dropdown**
- You need at least one chat model. Run `python3 local_node.py models` to install one.

**Slow first response**
- The free cloud backend spins down after inactivity. The first request after a period of inactivity may take up to 60 seconds while it wakes up. Subsequent requests are fast.
