"""
MeshMind local node — FastAPI service that wraps Ollama and talks to the
cloud marketplace. This is the demo-able slice of the marketplace flow:

  user query
      → embed locally via Ollama
      → search cloud marketplace
      → if hit (verbatim): return cached answer
      → if partial (repackage): ask local Ollama to adapt cached answer (few tokens)
      → if miss: full local inference
      → offer to publish

Run: uvicorn app.server:app --reload --port 8000
"""
from __future__ import annotations

from fastapi import FastAPI, Header, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel
from typing import Optional
import os
import io
import json
import re
import httpx

from app import ollama_client
from app.market_client import MarketClient

app = FastAPI(title="MeshMind Local Node")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def private_network_access_headers(request, call_next):
    """Let a hosted MeshMind web UI talk to a user's local node."""
    response = await call_next(request)
    response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response


CLOUD_URL = os.environ.get("MESHMIND_CLOUD", "https://meshmind-g3am.onrender.com")
market = MarketClient(CLOUD_URL)
REQUIRED_MODELS = ["nomic-embed-text"]
RECOMMENDED_MODELS = [
    "llama3.2:3b", "mistral:7b", "qwen2.5-coder:7b",
    "llava:7b", "phi4:14b", "gemma3:12b",
]


# ----- auth pass-through -----

class AuthRequest(BaseModel):
    username: str
    email: Optional[str] = None
    password: str


class UpdateMeRequest(BaseModel):
    displayName: Optional[str] = None
    currentPassword: Optional[str] = None
    newPassword: Optional[str] = None


@app.post("/api/register")
async def register(req: AuthRequest):
    if not req.email:
        raise HTTPException(400, "email required")
    try:
        return await market.register(req.username, req.email, req.password)
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/api/login")
async def login(req: AuthRequest):
    try:
        return await market.login(req.username, req.password)
    except Exception as e:
        raise HTTPException(401, str(e))


EMBED_ONLY = {"nomic-embed-text", "mxbai-embed-large", "all-minilm", "nomic-embed"}


async def _ollama_tags() -> list[dict]:
    async with httpx.AsyncClient(timeout=5) as c:
        r = await c.get(f"{ollama_client.OLLAMA_URL}/api/tags")
        r.raise_for_status()
        return r.json().get("models", [])


def _model_names(models_data: list[dict]) -> list[str]:
    return [m["name"] for m in models_data if "name" in m]


def _has_model(installed: list[str], wanted: str) -> bool:
    base = wanted.split(":")[0]
    return any(name == wanted or name.split(":")[0] == base for name in installed)


@app.get("/api/models")
async def models():
    """Return list of locally available chat-capable Ollama models."""
    try:
        names = [
            name for name in _model_names(await _ollama_tags())
            if not any(e in name.lower() for e in EMBED_ONLY)
        ]
        return {"models": names}
    except Exception:
        return {"models": []}


@app.get("/api/local/status")
async def local_status():
    """Report whether the local node can see Ollama and required models."""
    try:
        models_data = await _ollama_tags()
        installed = _model_names(models_data)
        missing_required = [m for m in REQUIRED_MODELS if not _has_model(installed, m)]
        missing_recommended = [m for m in RECOMMENDED_MODELS if not _has_model(installed, m)]
        return {
            "ok": len(missing_required) == 0,
            "ollama": "reachable",
            "ollamaUrl": ollama_client.OLLAMA_URL,
            "cloudUrl": CLOUD_URL,
            "installedModels": installed,
            "requiredModels": REQUIRED_MODELS,
            "recommendedModels": RECOMMENDED_MODELS,
            "missingRequired": missing_required,
            "missingRecommended": missing_recommended,
        }
    except Exception as e:
        return {
            "ok": False,
            "ollama": "unreachable",
            "ollamaUrl": ollama_client.OLLAMA_URL,
            "cloudUrl": CLOUD_URL,
            "installedModels": [],
            "requiredModels": REQUIRED_MODELS,
            "recommendedModels": RECOMMENDED_MODELS,
            "missingRequired": REQUIRED_MODELS,
            "missingRecommended": RECOMMENDED_MODELS,
            "error": str(e),
        }


class PullModelRequest(BaseModel):
    model: str


_VALID_MODEL = re.compile(r'^[a-zA-Z0-9][\w.:\-/]{0,127}$')


@app.post("/api/models/pull")
async def pull_model(req: PullModelRequest):
    """Stream `ollama pull` progress as SSE. Accepts any valid Ollama model name."""
    if not _VALID_MODEL.match(req.model):
        raise HTTPException(400, "invalid model name")

    async def gen():
        try:
            async with httpx.AsyncClient(timeout=None) as c:
                async with c.stream(
                    "POST",
                    f"{ollama_client.OLLAMA_URL}/api/pull",
                    json={"name": req.model, "stream": True},
                ) as r:
                    r.raise_for_status()
                    async for line in r.aiter_lines():
                        if not line:
                            continue
                        yield f"data: {line}\n\n"
            yield f'data: {json.dumps({"status": "done", "model": req.model})}\n\n'
        except Exception as e:
            yield f'data: {json.dumps({"status": "error", "error": str(e)})}\n\n'

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/me")
async def me():
    if not market.token:
        raise HTTPException(401, "not logged in")
    return await market.me()


@app.put("/api/me")
async def update_me(req: UpdateMeRequest):
    if not market.token:
        raise HTTPException(401, "not logged in")
    try:
        return await market.update_me(req.displayName, req.currentPassword, req.newPassword)
    except Exception as e:
        raise HTTPException(400, str(e))


# ----- the core marketplace flow -----

class QueryRequest(BaseModel):
    prompt: str
    model: Optional[str] = None


@app.post("/api/ask")
async def ask(req: QueryRequest):
    """
    The hero endpoint. Takes a user prompt and decides:
      - verbatim (similarity >= 0.90): serve cached, 0 inference tokens
      - repackage (0.70-0.90): adapt cached with minimal local inference
      - miss (< 0.70): full local inference

    Always returns {mode, response, source_entry_id?, similarity?, embedding}
    so the client can decide whether to publish.
    """
    embedding = await ollama_client.embed(req.prompt)
    chat_model = req.model or ollama_client.DEFAULT_CHAT_MODEL

    hits = []
    if market.token:
        try:
            hits = await market.search(embedding, k=3)
        except Exception:
            hits = []   # cloud offline → fall through to local inference

    top = hits[0] if hits else None

    if top and top["mode"] == "verbatim":
        # serve the cached answer directly
        if market.token:
            try:
                await market.consume(top["id"])
            except Exception:
                pass
        return {
            "mode": "verbatim",
            "response": top["response"],
            "source_entry_id": top["id"],
            "source_author": top["author"],
            "similarity": top["similarity"],
            "embedding": embedding,
        }

    if top and top["mode"] == "repackage":
        # use the cached answer as context, local model adapts it
        adaptation_prompt = (
            f"A user asks: {req.prompt}\n\n"
            f"A similar question was previously answered as follows:\n"
            f"---\n{top['response']}\n---\n\n"
            f"Rewrite this answer to address the user's exact question. "
            f"Be concise — do not repeat information the user didn't ask for."
        )
        response = await ollama_client.chat(adaptation_prompt, model=chat_model)
        if market.token:
            try:
                await market.consume(top["id"])
            except Exception:
                pass
        return {
            "mode": "repackage",
            "response": response,
            "source_entry_id": top["id"],
            "source_author": top["author"],
            "similarity": top["similarity"],
            "embedding": embedding,
        }

    # miss — full local inference
    response = await ollama_client.chat(req.prompt, model=chat_model)
    return {
        "mode": "miss",
        "response": response,
        "embedding": embedding,
    }


class PublishRequest(BaseModel):
    prompt: str
    response: str
    model_used: Optional[str] = None
    embedding: list[float]
    tags: Optional[list[str]] = None


@app.post("/api/publish")
async def publish(req: PublishRequest):
    if not market.token:
        raise HTTPException(401, "not logged in")
    try:
        return await market.publish(req.prompt, req.response,
                                     req.model_used or ollama_client.DEFAULT_CHAT_MODEL,
                                     req.embedding, req.tags)
    except Exception as e:
        raise HTTPException(503, f"Marketplace unavailable: {e}")


@app.get("/api/mine")
async def mine():
    if not market.token:
        raise HTTPException(401, "not logged in")
    return {"entries": await market.mine()}


class DebugSearchRequest(BaseModel):
    prompt: str
    k: int = 10

@app.get("/api/stats")
async def stats():
    """Aggregate marketplace stats — hit rates, credits, savings. Useful for thesis proof."""
    if not market.token:
        raise HTTPException(401, "not logged in")
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(
                f"{CLOUD_URL}/api/market/stats",
                headers={"Authorization": f"Bearer {market.token}"},
            )
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        raise HTTPException(503, f"Backend unavailable: {e}")

    # Compute derived thesis metrics from raw DB counts
    by_mode = {row["mode"]: row for row in data.get("byMode", [])}
    verbatim_n  = int(by_mode.get("verbatim",  {}).get("cnt", 0))
    repackage_n = int(by_mode.get("repackage", {}).get("cnt", 0))
    total_consumed = int(data.get("totalConsumed", 0))

    # Token savings estimate:
    #   verbatim  → 0 inference tokens (100% saved vs. ~512 avg miss)
    #   repackage → ~10% of miss tokens (90% saved vs. ~512 avg)
    AVG_MISS_TOKENS = 512
    tokens_saved = verbatim_n * AVG_MISS_TOKENS + repackage_n * int(AVG_MISS_TOKENS * 0.90)

    total_lookups = verbatim_n + repackage_n
    hit_rate = round(total_lookups / total_consumed * 100, 1) if total_consumed > 0 else 0.0

    data["derived"] = {
        "verbatimCount":  verbatim_n,
        "repackageCount": repackage_n,
        "hitRatePct":     hit_rate,
        "tokensSavedEst": tokens_saved,
        "avgMissTokensAssumed": AVG_MISS_TOKENS,
    }
    return data


@app.post("/api/debug/search")
async def debug_search(req: DebugSearchRequest):
    """Show raw marketplace similarity scores for any prompt — for tuning and inspection."""
    try:
        embedding = await ollama_client.embed(req.prompt)
    except Exception as e:
        raise HTTPException(500, f"embed failed: {e}")
    try:
        hits = await market.search(embedding, k=req.k)
    except Exception as e:
        return {"error": str(e), "hits": []}
    return {
        "prompt": req.prompt,
        "thresholds": {"verbatim": 0.85, "repackage": 0.60},
        "hits": hits,
    }


# ----- streaming ask -----

class HistoryMessage(BaseModel):
    role: str    # 'user' or 'assistant'
    content: str


class StreamAskRequest(BaseModel):
    prompt: str
    model: Optional[str] = None
    image_b64: Optional[str] = None          # base64 image for vision
    history: Optional[list[HistoryMessage]] = None  # prior turns for multi-model context
    temperature: float = 0.7
    local_only: bool = False                 # skip marketplace entirely, always infer locally


async def _stream_ask(prompt: str, chat_model: str,
                      image_b64: Optional[str] = None,
                      history: Optional[list[HistoryMessage]] = None,
                      temperature: float = 0.7,
                      local_only: bool = False,
                      effective_token: Optional[str] = None):
    """SSE generator:
    - local_only=True: skip embed + marketplace, always do full local inference
    - Single-turn (no history): embed → marketplace → verbatim/repackage/miss
    - Multi-turn (has history): skip marketplace, give model full conversation context
    - Vision: skip marketplace, route to vision model with image
    """
    try:
        embedding = await ollama_client.embed(prompt) if not local_only else []
    except Exception:
        embedding = []

    has_history = bool(history)

    # local_only, multi-turn, and vision all bypass the marketplace
    hits = []
    search_token = effective_token or market.token
    if search_token and not local_only and not image_b64 and not has_history:
        try:
            hits = await market.search(embedding, k=5, token=search_token)
        except Exception:
            pass

    # Override mode classification with local thresholds
    # (backend uses 0.90/0.70; we use tighter verbatim, looser repackage)
    VERBATIM_T = 0.85
    REPACKAGE_T = 0.60
    for h in hits:
        sim = h.get("similarity", 0)
        if sim >= VERBATIM_T:
            h["mode"] = "verbatim"
        elif sim >= REPACKAGE_T:
            h["mode"] = "repackage"
        else:
            h["mode"] = "miss"

    top = next((h for h in hits if h["mode"] in ("verbatim", "repackage")), None)
    print(f"[SEARCH] prompt='{prompt[:60]}' hits={[(h.get('prompt','?')[:40], round(h.get('similarity',0),3), h['mode']) for h in hits[:3]]}")

    # Verbatim cache hit — no inference needed
    if top and top["mode"] == "verbatim":
        try:
            await market.consume(top["id"])
        except Exception:
            pass
        yield f'data: {json.dumps({"chunk": top["response"]})}\n\n'
        yield f'data: {json.dumps({"done": True, "mode": "verbatim", "source_author": top["author"], "similarity": top["similarity"], "source_entry_id": top["id"], "embedding": embedding})}\n\n'
        return

    # Repackage — stream the adaptation
    if top and top["mode"] == "repackage":
        try:
            await market.consume(top["id"])
        except Exception:
            pass
        adaptation_prompt = (
            f"A user asks: {prompt}\n\n"
            f"A similar question was previously answered as follows:\n"
            f"---\n{top['response']}\n---\n\n"
            f"Rewrite this answer to address the user's exact question. "
            f"Be concise — do not repeat information the user didn't ask for."
        )
        async for chunk in ollama_client.chat_stream(adaptation_prompt, model=chat_model):
            yield f'data: {json.dumps({"chunk": chunk})}\n\n'
        yield f'data: {json.dumps({"done": True, "mode": "repackage", "source_author": top["author"], "similarity": top["similarity"], "source_entry_id": top["id"], "embedding": embedding})}\n\n'
        return

    # Miss, multi-turn, or vision — build full messages array and stream
    messages: list[dict] = [
        {"role": "system", "content": (
            "You are a helpful assistant. Follow these formatting rules exactly:\n"
            "- MATH inline: wrap in single dollar signs like $E = mc^2$\n"
            "- MATH display/block: put $$ on its own line with a blank line before and after, never mid-sentence:\n"
            "  (blank line)\n  $$\n  F = ma\n  $$\n  (blank line)\n"
            "- NEVER place $$ in the middle of a sentence or run text after $$ on the same line\n"
            "- HEADERS (##, ###) must be on their own line, never embedded in a sentence\n"
            "- CODE: fenced blocks with language tag (```python, ```java, etc.)\n"
            "- TABLES: standard markdown pipe tables\n"
            "- \\begin{align} environments must be wrapped inside $$ $$ delimiters"
        )}
    ]

    if has_history:
        messages.extend({"role": m.role, "content": m.content} for m in history)

    out_meta: dict = {}

    if image_b64:
        messages.append({"role": "user", "content": prompt, "images": [image_b64]})
        async for chunk in ollama_client.chat_stream_messages(
            messages, model=ollama_client.VISION_MODEL,
            temperature=temperature, out_meta=out_meta,
        ):
            yield f'data: {json.dumps({"chunk": chunk})}\n\n'
    else:
        messages.append({"role": "user", "content": prompt})
        async for chunk in ollama_client.chat_stream_messages(
            messages, model=chat_model,
            temperature=temperature, out_meta=out_meta,
        ):
            yield f'data: {json.dumps({"chunk": chunk})}\n\n'

    tokens_out = out_meta.get("eval_count", 0)
    tokens_in  = out_meta.get("prompt_eval_count", 0)
    dur_ns     = out_meta.get("eval_duration_ns", 0)
    toks_per_sec = round(tokens_out / (dur_ns / 1e9), 1) if dur_ns > 0 else None

    mode = "local" if local_only else "miss"
    yield f'data: {json.dumps({"done": True, "mode": mode, "embedding": embedding, "tokens_in": tokens_in, "tokens_out": tokens_out, "toks_per_sec": toks_per_sec})}\n\n'


@app.post("/api/ask/stream")
async def ask_stream(req: StreamAskRequest, authorization: Optional[str] = Header(None)):
    chat_model = req.model or ollama_client.DEFAULT_CHAT_MODEL
    effective_token = market.token
    if not effective_token and authorization:
        parts = authorization.split(" ", 1)
        if len(parts) == 2 and parts[0].lower() == "bearer":
            effective_token = parts[1]
    return StreamingResponse(
        _stream_ask(req.prompt, chat_model, req.image_b64, req.history,
                    req.temperature, req.local_only, effective_token),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ----- PDF parsing -----

@app.post("/api/parse/pdf")
async def parse_pdf(file: UploadFile = File(...)):
    """Extract text from an uploaded PDF and return it."""
    try:
        from pypdf import PdfReader
    except ImportError:
        raise HTTPException(500, "pypdf not installed — run: pip install pypdf")
    content = await file.read()
    reader = PdfReader(io.BytesIO(content))
    pages_text = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            pages_text.append(text)
    return {"text": "\n\n".join(pages_text), "pages": len(reader.pages)}


# ----- tiny built-in UI for demo purposes -----

@app.get("/", response_class=HTMLResponse)
async def index():
    return HTMLResponse(INDEX_HTML)


INDEX_HTML = """<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>MeshMind — Marketplace Demo</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 780px; margin: 2em auto; padding: 0 1em; color: #111; }
    .mode-verbatim { background: #d4edda; border-left: 4px solid #28a745; padding: 0.6em; }
    .mode-repackage { background: #fff3cd; border-left: 4px solid #ffc107; padding: 0.6em; }
    .mode-miss { background: #f8d7da; border-left: 4px solid #dc3545; padding: 0.6em; }
    .hint { color: #666; font-size: 0.9em; }
    textarea { width: 100%; min-height: 80px; font-family: inherit; }
    input, button { font: inherit; padding: 0.4em 0.8em; }
    pre { background: #f6f8fa; padding: 0.8em; overflow-x: auto; white-space: pre-wrap; }
    .row { display: flex; gap: 0.5em; align-items: center; margin: 0.5em 0; }
    #me { font-size: 0.9em; color: #555; }
  </style>
</head>
<body>
  <h1>MeshMind <span class="hint">local node</span></h1>
  <div id="me">Not logged in.</div>

  <details open>
    <summary>Login / Register</summary>
    <div class="row">
      <input id="username" placeholder="username">
      <input id="email" placeholder="email (register only)">
      <input id="password" type="password" placeholder="password">
      <button onclick="doLogin()">Log in</button>
      <button onclick="doRegister()">Register</button>
    </div>
  </details>

  <h2>Ask</h2>
  <textarea id="prompt" placeholder="What do you want to know?"></textarea>
  <div class="row">
    <button onclick="ask()">Ask</button>
    <span class="hint">local embed → cloud search → best strategy</span>
  </div>

  <div id="answer"></div>

  <script>
    let lastAsk = null;

    async function fetchMe() {
      try {
        const r = await fetch('/api/me');
        if (!r.ok) return;
        const me = await r.json();
        document.getElementById('me').textContent =
          `Logged in as ${me.username} — ${me.credits} credits`;
      } catch {}
    }

    async function doLogin() {
      const body = { username: u().value, password: p().value };
      const r = await fetch('/api/login', { method: 'POST',
        headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)});
      if (!r.ok) return alert('login failed');
      fetchMe();
    }

    async function doRegister() {
      const body = { username: u().value, email: document.getElementById('email').value, password: p().value };
      const r = await fetch('/api/register', { method: 'POST',
        headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)});
      if (!r.ok) return alert('register failed: ' + await r.text());
      fetchMe();
    }

    async function ask() {
      const prompt = document.getElementById('prompt').value.trim();
      if (!prompt) return;
      const box = document.getElementById('answer');
      box.innerHTML = '<p class="hint">thinking…</p>';
      const r = await fetch('/api/ask', { method: 'POST',
        headers: {'Content-Type':'application/json'}, body: JSON.stringify({ prompt })});
      if (!r.ok) { box.innerHTML = '<p>error: ' + await r.text() + '</p>'; return; }
      const data = await r.json();
      lastAsk = { prompt, ...data };
      render(data);
      fetchMe();
    }

    function render(data) {
      const box = document.getElementById('answer');
      let badge = '';
      if (data.mode === 'verbatim') {
        badge = `<div class="mode-verbatim">✓ Cached answer from <b>${data.source_author}</b>
          (similarity ${data.similarity.toFixed(3)}) — 0 inference tokens.</div>`;
      } else if (data.mode === 'repackage') {
        badge = `<div class="mode-repackage">↻ Repackaged from <b>${data.source_author}</b>
          (similarity ${data.similarity.toFixed(3)}) — minimal inference.</div>`;
      } else {
        badge = `<div class="mode-miss">✗ No cache hit — full local inference.</div>`;
      }
      let publishBtn = '';
      if (data.mode === 'miss') {
        publishBtn = `<button onclick="publish()">Publish to marketplace (+5 credits)</button>`;
      }
      box.innerHTML = badge + '<pre>' + escapeHtml(data.response) + '</pre>' + publishBtn;
    }

    async function publish() {
      if (!lastAsk) return;
      const r = await fetch('/api/publish', { method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          prompt: lastAsk.prompt, response: lastAsk.response,
          embedding: lastAsk.embedding, tags: []
        })});
      if (!r.ok) return alert('publish failed: ' + await r.text());
      const data = await r.json();
      alert(`published! +${data.creditsEarned} credits`);
      fetchMe();
    }

    const u = () => document.getElementById('username');
    const p = () => document.getElementById('password');
    const escapeHtml = s => s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

    fetchMe();
  </script>
</body>
</html>
"""
