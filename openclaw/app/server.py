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

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel
from typing import Optional
import os
import io
import json
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

CLOUD_URL = os.environ.get("MESHMIND_CLOUD", "http://localhost:8080")
market = MarketClient(CLOUD_URL)


# ----- auth pass-through -----

class AuthRequest(BaseModel):
    username: str
    email: Optional[str] = None
    password: str


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

@app.get("/api/models")
async def models():
    """Return list of locally available chat-capable Ollama models."""
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.get(f"{ollama_client.OLLAMA_URL}/api/tags")
            r.raise_for_status()
            data = r.json()
            names = [
                m["name"] for m in data.get("models", [])
                if not any(e in m["name"].lower() for e in EMBED_ONLY)
            ]
            return {"models": names}
    except Exception:
        return {"models": []}


@app.get("/api/me")
async def me():
    if not market.token:
        raise HTTPException(401, "not logged in")
    return await market.me()


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
    return await market.publish(req.prompt, req.response,
                                 req.model_used or ollama_client.DEFAULT_CHAT_MODEL,
                                 req.embedding, req.tags)


@app.get("/api/mine")
async def mine():
    if not market.token:
        raise HTTPException(401, "not logged in")
    return {"entries": await market.mine()}


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


async def _stream_ask(prompt: str, chat_model: str,
                      image_b64: Optional[str] = None,
                      history: Optional[list[HistoryMessage]] = None,
                      temperature: float = 0.7):
    """SSE generator:
    - Single-turn (no history): embed → marketplace → verbatim/repackage/miss
    - Multi-turn (has history): skip marketplace, give model full conversation context
    - Vision: skip marketplace, route to vision model with image
    """
    try:
        embedding = await ollama_client.embed(prompt)
    except Exception:
        embedding = []

    has_history = bool(history)

    # Multi-turn conversations and vision queries bypass the marketplace —
    # each turn is unique in context so caching doesn't apply.
    hits = []
    if market.token and not image_b64 and not has_history:
        try:
            hits = await market.search(embedding, k=3)
        except Exception:
            pass

    top = hits[0] if hits else None

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
    messages: list[dict] = []

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

    yield f'data: {json.dumps({"done": True, "mode": "miss", "embedding": embedding, "tokens_in": tokens_in, "tokens_out": tokens_out, "toks_per_sec": toks_per_sec})}\n\n'


@app.post("/api/ask/stream")
async def ask_stream(req: StreamAskRequest):
    chat_model = req.model or ollama_client.DEFAULT_CHAT_MODEL
    return StreamingResponse(
        _stream_ask(req.prompt, chat_model, req.image_b64, req.history, req.temperature),
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
