"""
Unit tests for app/server.py — FastAPI routes and marketplace decision logic.

Run:  pytest tests/ -v
"""
from __future__ import annotations

import io
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient

from app.server import app

# ── Shared constants ──────────────────────────────────────────────────────────

FAKE_EMBEDDING = [0.01] * 768  # nomic-embed-text is 768-dim

# ── Shared async generator used to fake Ollama streaming ─────────────────────

async def _fake_stream(messages, model=None, temperature=0.7,
                       num_ctx=8192, out_meta=None):
    """Yields two tokens then populates out_meta like the real function does."""
    yield "Hello"
    yield " world"
    if out_meta is not None:
        out_meta["eval_count"] = 2
        out_meta["prompt_eval_count"] = 5
        out_meta["eval_duration_ns"] = 200_000_000  # 0.2s → 10 tok/s


def _sse_events(response_text: str) -> list[dict]:
    """Parse raw SSE text into a list of JSON payload dicts."""
    events = []
    for line in response_text.splitlines():
        if line.startswith("data: "):
            try:
                events.append(json.loads(line[6:]))
            except json.JSONDecodeError:
                pass
    return events


def _mock_ollama_tags(model_names: list[str]):
    """Return a patch context that fakes Ollama GET /api/tags."""
    fake_resp = MagicMock()
    fake_resp.raise_for_status = MagicMock()
    fake_resp.json.return_value = {"models": [{"name": n} for n in model_names]}

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=fake_resp)
    mock_cm = AsyncMock()
    mock_cm.__aenter__ = AsyncMock(return_value=mock_client)
    mock_cm.__aexit__ = AsyncMock(return_value=False)
    return patch("app.server.httpx.AsyncClient", return_value=mock_cm)


# ═════════════════════════════════════════════════════════════════════════════
#  GET /api/models
# ═════════════════════════════════════════════════════════════════════════════

class TestModelsEndpoint:
    """Embedding models must be invisible to the user — only chat models shown."""

    def test_embed_models_are_filtered_out(self):
        """nomic-embed-text, mxbai-embed-large, and all-minilm must be excluded."""
        ollama_models = [
            "qwen2.5-coder:14b",
            "llama3.2:3b",
            "nomic-embed-text",   # should be excluded
            "mxbai-embed-large",  # should be excluded
            "all-minilm",         # should be excluded
        ]
        with _mock_ollama_tags(ollama_models):
            with TestClient(app) as client:
                r = client.get("/api/models")

        assert r.status_code == 200
        names = r.json()["models"]
        assert "nomic-embed-text" not in names
        assert "mxbai-embed-large" not in names
        assert "all-minilm" not in names
        assert "qwen2.5-coder:14b" in names
        assert "llama3.2:3b" in names

    def test_chat_models_are_preserved(self):
        """Non-embed models must all be returned unchanged."""
        chat_models = ["llava:13b", "phi4:latest", "gemma3:9b"]
        with _mock_ollama_tags(chat_models):
            with TestClient(app) as client:
                r = client.get("/api/models")

        assert r.status_code == 200
        for m in chat_models:
            assert m in r.json()["models"]

    def test_all_embed_models_returns_empty_list(self):
        """If every installed model is embed-only, return an empty list — not 500."""
        with _mock_ollama_tags(["nomic-embed-text", "mxbai-embed-large"]):
            with TestClient(app) as client:
                r = client.get("/api/models")

        assert r.status_code == 200
        assert r.json()["models"] == []

    def test_ollama_unreachable_returns_empty_not_500(self):
        """A network error talking to Ollama must not propagate as a 500."""
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=OSError("connection refused"))
        mock_cm = AsyncMock()
        mock_cm.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cm.__aexit__ = AsyncMock(return_value=False)

        with patch("app.server.httpx.AsyncClient", return_value=mock_cm):
            with TestClient(app) as client:
                r = client.get("/api/models")

        assert r.status_code == 200
        assert r.json() == {"models": []}


# ═════════════════════════════════════════════════════════════════════════════
#  POST /api/parse/pdf
# ═════════════════════════════════════════════════════════════════════════════

class TestPdfEndpoint:
    """PDF upload → text extraction."""

    @staticmethod
    def _blank_pdf_bytes() -> bytes:
        from pypdf import PdfWriter
        writer = PdfWriter()
        writer.add_blank_page(width=72, height=72)
        buf = io.BytesIO()
        writer.write(buf)
        return buf.getvalue()

    def test_valid_pdf_returns_200_with_page_count(self):
        pdf = self._blank_pdf_bytes()
        with TestClient(app) as client:
            r = client.post(
                "/api/parse/pdf",
                files={"file": ("doc.pdf", io.BytesIO(pdf), "application/pdf")},
            )
        assert r.status_code == 200
        data = r.json()
        assert data["pages"] == 1
        assert "text" in data

    def test_blank_pdf_has_empty_text(self):
        """A blank page has no extractable text — must return empty string."""
        pdf = self._blank_pdf_bytes()
        with TestClient(app) as client:
            r = client.post(
                "/api/parse/pdf",
                files={"file": ("blank.pdf", io.BytesIO(pdf), "application/pdf")},
            )
        assert r.status_code == 200
        assert r.json()["text"] == ""


# ═════════════════════════════════════════════════════════════════════════════
#  POST /api/ask/stream  — marketplace routing logic
# ═════════════════════════════════════════════════════════════════════════════

class TestAskStream:
    """Core marketplace decision: verbatim / repackage / miss."""

    def test_miss_streams_tokens_and_done_event(self):
        """No cache hit → Ollama is called, chunks are streamed, mode is 'miss'."""
        with (
            patch("app.server.ollama_client.embed", new=AsyncMock(return_value=FAKE_EMBEDDING)),
            patch("app.server.market.token", new="fake-jwt"),
            patch("app.server.market.search", new=AsyncMock(return_value=[])),
            patch("app.server.ollama_client.chat_stream_messages", new=_fake_stream),
        ):
            with TestClient(app) as client:
                r = client.post("/api/ask/stream", json={
                    "prompt": "What is entropy?",
                    "model": "qwen2.5-coder:14b",
                })

        assert r.status_code == 200
        events = _sse_events(r.text)
        chunks = [e["chunk"] for e in events if "chunk" in e]
        done = [e for e in events if e.get("done")]

        assert "".join(chunks) == "Hello world"
        assert len(done) == 1
        assert done[0]["mode"] == "miss"
        assert "embedding" in done[0]

    def test_verbatim_hit_skips_ollama_and_returns_cached_response(self):
        """Similarity ≥ 0.90 → serve cached answer, never call chat_stream_messages."""
        cache_entry = {
            "mode": "verbatim",
            "id": "uuid-abc",
            "author": "alice",
            "similarity": 0.97,
            "response": "Entropy is disorder.",
        }
        stream_spy = MagicMock()  # should not be called

        with (
            patch("app.server.ollama_client.embed", new=AsyncMock(return_value=FAKE_EMBEDDING)),
            patch("app.server.market.token", new="fake-jwt"),
            patch("app.server.market.search", new=AsyncMock(return_value=[cache_entry])),
            patch("app.server.market.consume", new=AsyncMock(return_value={})),
            patch("app.server.ollama_client.chat_stream_messages", new=stream_spy),
        ):
            with TestClient(app) as client:
                r = client.post("/api/ask/stream", json={"prompt": "What is entropy?"})

        assert r.status_code == 200
        events = _sse_events(r.text)
        done = [e for e in events if e.get("done")]

        assert done[0]["mode"] == "verbatim"
        assert done[0]["source_author"] == "alice"
        assert abs(done[0]["similarity"] - 0.97) < 0.001
        stream_spy.assert_not_called()

    def test_marketplace_bypassed_when_history_present(self):
        """Multi-turn (history provided) must skip marketplace search entirely."""
        search_spy = AsyncMock(return_value=[])

        with (
            patch("app.server.ollama_client.embed", new=AsyncMock(return_value=FAKE_EMBEDDING)),
            patch("app.server.market.token", new="fake-jwt"),
            patch("app.server.market.search", new=search_spy),
            patch("app.server.ollama_client.chat_stream_messages", new=_fake_stream),
        ):
            with TestClient(app) as client:
                r = client.post("/api/ask/stream", json={
                    "prompt": "And what about temperature?",
                    "model": "qwen2.5-coder:14b",
                    "history": [
                        {"role": "user",      "content": "What is entropy?"},
                        {"role": "assistant", "content": "Entropy is disorder."},
                    ],
                })

        assert r.status_code == 200
        search_spy.assert_not_called()

    def test_marketplace_bypassed_for_vision_request(self):
        """Image attachments (image_b64 present) must skip marketplace search."""
        search_spy = AsyncMock(return_value=[])

        with (
            patch("app.server.ollama_client.embed", new=AsyncMock(return_value=FAKE_EMBEDDING)),
            patch("app.server.market.token", new="fake-jwt"),
            patch("app.server.market.search", new=search_spy),
            patch("app.server.ollama_client.chat_stream_messages", new=_fake_stream),
        ):
            with TestClient(app) as client:
                r = client.post("/api/ask/stream", json={
                    "prompt": "Describe this image.",
                    "image_b64": "aGVsbG8=",  # base64("hello"), fake image
                })

        assert r.status_code == 200
        search_spy.assert_not_called()

    def test_done_event_includes_token_counts_on_miss(self):
        """tokens_in, tokens_out, and toks_per_sec must appear on a miss done event."""
        with (
            patch("app.server.ollama_client.embed", new=AsyncMock(return_value=FAKE_EMBEDDING)),
            patch("app.server.market.token", new="fake-jwt"),
            patch("app.server.market.search", new=AsyncMock(return_value=[])),
            patch("app.server.ollama_client.chat_stream_messages", new=_fake_stream),
        ):
            with TestClient(app) as client:
                r = client.post("/api/ask/stream", json={"prompt": "hello"})

        events = _sse_events(r.text)
        done = [e for e in events if e.get("done")][0]

        assert "tokens_in" in done
        assert "tokens_out" in done
        assert "toks_per_sec" in done
        assert done["tokens_out"] == 2
        assert done["tokens_in"] == 5
        assert done["toks_per_sec"] == 10.0  # 2 tokens / 0.2s

    def test_custom_temperature_is_accepted(self):
        """temperature field in request body must not cause a 422 validation error."""
        with (
            patch("app.server.ollama_client.embed", new=AsyncMock(return_value=FAKE_EMBEDDING)),
            patch("app.server.market.token", new="fake-jwt"),
            patch("app.server.market.search", new=AsyncMock(return_value=[])),
            patch("app.server.ollama_client.chat_stream_messages", new=_fake_stream),
        ):
            with TestClient(app) as client:
                r = client.post("/api/ask/stream", json={
                    "prompt": "Be creative",
                    "temperature": 1.5,
                })

        assert r.status_code == 200
