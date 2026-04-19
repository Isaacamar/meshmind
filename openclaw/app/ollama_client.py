"""Minimal Ollama client: embeddings + chat."""
from __future__ import annotations

import os
import httpx
from typing import AsyncIterator
import json


OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
EMBED_MODEL = os.environ.get("MESHMIND_EMBED_MODEL", "nomic-embed-text")   # 768 dims
DEFAULT_CHAT_MODEL = os.environ.get("MESHMIND_CHAT_MODEL", "qwen2.5-coder:14b")


async def embed(text: str, model: str = EMBED_MODEL) -> list[float]:
    """Return an embedding vector for text. Requires `ollama pull nomic-embed-text`."""
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{OLLAMA_URL}/api/embeddings",
                         json={"model": model, "prompt": text})
        r.raise_for_status()
        return r.json()["embedding"]


async def chat(prompt: str, model: str = DEFAULT_CHAT_MODEL,
               system: str | None = None) -> str:
    """Non-streaming chat for simplicity. Returns full response text."""
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    async with httpx.AsyncClient(timeout=120) as c:
        r = await c.post(f"{OLLAMA_URL}/api/chat",
                         json={"model": model, "messages": messages, "stream": False})
        r.raise_for_status()
        return r.json()["message"]["content"]


VISION_MODEL = os.environ.get("MESHMIND_VISION_MODEL", "llava:13b")


async def chat_stream(prompt: str, model: str = DEFAULT_CHAT_MODEL,
                      system: str | None = None) -> AsyncIterator[str]:
    """Streaming chat. Yields token chunks."""
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    async with httpx.AsyncClient(timeout=None) as c:
        async with c.stream("POST", f"{OLLAMA_URL}/api/chat",
                            json={"model": model, "messages": messages, "stream": True}) as r:
            async for line in r.aiter_lines():
                if not line:
                    continue
                obj = json.loads(line)
                if obj.get("done"):
                    break
                chunk = obj.get("message", {}).get("content", "")
                if chunk:
                    yield chunk


DEFAULT_NUM_CTX = int(os.environ.get("MESHMIND_NUM_CTX", "8192"))
DEFAULT_TEMPERATURE = float(os.environ.get("MESHMIND_TEMPERATURE", "0.7"))


async def chat_stream_messages(
    messages: list[dict],
    model: str = DEFAULT_CHAT_MODEL,
    temperature: float = DEFAULT_TEMPERATURE,
    num_ctx: int = DEFAULT_NUM_CTX,
    out_meta: dict | None = None,
) -> AsyncIterator[str]:
    """Streaming multi-turn chat from a pre-built messages array.
    Each dict must have 'role' and 'content'; vision messages may include 'images'.
    Pass ``out_meta={}`` to receive token counts (eval_count, prompt_eval_count,
    eval_duration_ns) after the generator exhausts.
    """
    async with httpx.AsyncClient(timeout=None) as c:
        async with c.stream(
            "POST", f"{OLLAMA_URL}/api/chat",
            json={
                "model": model,
                "messages": messages,
                "stream": True,
                "options": {"temperature": temperature, "num_ctx": num_ctx},
            },
        ) as r:
            async for line in r.aiter_lines():
                if not line:
                    continue
                obj = json.loads(line)
                if obj.get("done"):
                    if out_meta is not None:
                        out_meta["eval_count"]        = obj.get("eval_count", 0)
                        out_meta["prompt_eval_count"] = obj.get("prompt_eval_count", 0)
                        out_meta["eval_duration_ns"]  = obj.get("eval_duration", 0)
                    break
                chunk = obj.get("message", {}).get("content", "")
                if chunk:
                    yield chunk


async def chat_vision_stream(prompt: str, image_b64: str,
                             model: str = VISION_MODEL) -> AsyncIterator[str]:
    """Streaming vision chat. Sends a base64-encoded image alongside the prompt."""
    messages = [{"role": "user", "content": prompt, "images": [image_b64]}]
    async with httpx.AsyncClient(timeout=None) as c:
        async with c.stream("POST", f"{OLLAMA_URL}/api/chat",
                            json={"model": model, "messages": messages, "stream": True}) as r:
            async for line in r.aiter_lines():
                if not line:
                    continue
                obj = json.loads(line)
                if obj.get("done"):
                    break
                chunk = obj.get("message", {}).get("content", "")
                if chunk:
                    yield chunk
