# Getting Started with MeshMind

MeshMind can run in two modes:

- **Local privacy mode:** OpenClaw + Ollama run on your machine. Prompts stay local unless you explicitly publish to the marketplace.
- **Web fallback mode:** the public app can log in, manage your account, load saved chats, and optionally generate new replies with your own Groq API key.

Saved chat history is stored in the cloud so you can log in from the public site and reopen chats without the local node running.

---

## What you need

| Requirement | Notes |
|---|---|
| **Web browser** | Enough for login, account management, saved chats, marketplace account data, and Groq fallback |
| **Groq API key** | Optional, enables full web-only chat from the public app |
| **Python 3.10–3.13** | Required for local privacy mode. **Do not use 3.14**. Download 3.13 specifically. |
| **Ollama** | Required for local privacy mode |
| **A chat model** | Required for local privacy mode |

No Docker, Java, or database setup is needed for normal use.

---

## Web-only use

Open the public app: **[meshmind-1.onrender.com](https://meshmind-1.onrender.com)**

1. Register or log in.
2. Open account settings if you need to update your display name, change your password, or delete your account.
3. Saved chats load from the Render/Postgres cloud backend.
4. To generate new replies without the local node, paste a Groq API key into **Groq fallback** in the sidebar and save it.

The Groq key is stored in your browser and sent to the MeshMind Spring Boot backend only for the single fallback request. MeshMind does not store the key.

---

## Setup (one time)

```bash
git clone https://github.com/Isaacamar/meshmind.git
cd meshmind
python3.13 local_node.py install
```

The script will:
1. Check that Ollama is installed
2. Set up a Python virtual environment
3. Pull `nomic-embed-text` (required — used for private semantic search)
4. Ask which chat model you want to install (or skip if you already have one)
5. Prepare the local node

> **Windows users:** use `python3.13 local_node.py` in a regular terminal (not WSL). Ollama must be installed and running first.

---

## Every time after that

Make sure Ollama is running, then:

```bash
python3.13 local_node.py start
```

Then open the MeshMind web app: **[meshmind-1.onrender.com](https://meshmind-1.onrender.com)** 

---

## In the app

1. **Register** or log in
2. **Pick a local model** when OpenClaw/Ollama is running, or save a Groq key for web fallback.
3. **Start a chat** — inference runs locally when possible, otherwise through Groq if configured.
4. **Get more local models** — click `+ get models` next to the model selector to browse and download recommended Ollama models, or type any Ollama model name.

### Mode badges

Every response shows how it was generated:

| Badge | Meaning |
|---|---|
| `✗ Fresh inference` | Full local inference — your GPU did the work |
| `↻ Repackaged` | A similar cached answer was adapted locally (~10x fewer tokens) |
| `✓ Cached answer` | Exact match found in the marketplace — 0 inference tokens |
| `⬡ Local only` | Local-only mode is ON — marketplace bypassed entirely |
| `⚡ Groq fallback` | Response was generated through your configured Groq key |

### Local only mode

Toggle **Local only** in the sidebar to skip the marketplace entirely. All responses are generated locally regardless of what's in the cache. Useful if you want full privacy or are working offline.

### Publishing

After a fresh inference, a **Publish** button appears. Publishing adds your prompt and response to the shared marketplace and earns you **+5 credits**. Every time someone else's query matches your entry, you earn **+1 credit**.

Publishing goes directly to the Render backend with your browser login token. If you generated a response through Groq, marketplace publishing is hidden because there is no local embedding for that prompt yet.

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
- Make sure `python3.13 local_node.py start` is running in a terminal
- Make sure Ollama is running (`ollama serve`)
- Or add a Groq API key in the sidebar to use web fallback mode.

**No models in the dropdown**
- You need at least one chat model. Run `python3.13 local_node.py models` to install one.

**I logged in but do not see old chats**
- Chats created before cloud history existed may still be in browser localStorage. The app imports local saved chats into the cloud the first time you log in on this version.
- Chats created after this update are saved to Render/Postgres and can load without OpenClaw.

**Slow first response**
- The free cloud backend spins down after inactivity. The first request after a period of inactivity may take up to 60 seconds while it wakes up. Subsequent requests are fast.
