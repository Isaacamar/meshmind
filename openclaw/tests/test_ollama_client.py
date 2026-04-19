"""
Unit tests for app/ollama_client.py.

Tests the Ollama HTTP wrapper in isolation — all network calls are mocked.
Run:  pytest tests/ -v
"""
from __future__ import annotations

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app import ollama_client

FAKE_EMBEDDING = [0.01] * 768


# ── Helpers ───────────────────────────────────────────────────────────────────

def _json_response(payload: dict) -> MagicMock:
    """Mock httpx response that returns payload from .json()."""
    mock = MagicMock()
    mock.raise_for_status = MagicMock()
    mock.json.return_value = payload
    return mock


def _async_client_ctx(mock_client: AsyncMock) -> AsyncMock:
    """Wrap a mock client in an async context manager."""
    mock_cm = AsyncMock()
    mock_cm.__aenter__ = AsyncMock(return_value=mock_client)
    mock_cm.__aexit__ = AsyncMock(return_value=False)
    return mock_cm


def _streaming_ctx(sse_lines: list[str]) -> AsyncMock:
    """
    Build a mock for:
        async with client.stream(...) as r:
            async for line in r.aiter_lines(): ...
    """
    async def fake_aiter_lines():
        for line in sse_lines:
            yield line
        # also yield an empty line — the real stream often has these
        yield ""

    stream_resp = AsyncMock()
    stream_resp.__aenter__ = AsyncMock(return_value=stream_resp)
    stream_resp.__aexit__ = AsyncMock(return_value=False)
    stream_resp.aiter_lines = fake_aiter_lines

    mock_client = AsyncMock()
    mock_client.stream = MagicMock(return_value=stream_resp)
    return _async_client_ctx(mock_client)


# ═════════════════════════════════════════════════════════════════════════════
#  embed()
# ═════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_embed_returns_list_of_floats():
    """embed() should return the embedding vector from Ollama's response."""
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=_json_response({"embedding": FAKE_EMBEDDING}))

    with patch("app.ollama_client.httpx.AsyncClient", return_value=_async_client_ctx(mock_client)):
        result = await ollama_client.embed("hello world")

    assert isinstance(result, list)
    assert len(result) == 768
    assert result == FAKE_EMBEDDING


@pytest.mark.asyncio
async def test_embed_posts_to_correct_endpoint():
    """embed() must POST to /api/embeddings with model + prompt fields."""
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=_json_response({"embedding": FAKE_EMBEDDING}))

    with patch("app.ollama_client.httpx.AsyncClient", return_value=_async_client_ctx(mock_client)):
        await ollama_client.embed("test query")

    call_kwargs = mock_client.post.call_args
    posted_url = call_kwargs[0][0]
    posted_json = call_kwargs[1]["json"]

    assert "/api/embeddings" in posted_url
    assert posted_json["prompt"] == "test query"
    assert "model" in posted_json


# ═════════════════════════════════════════════════════════════════════════════
#  chat()
# ═════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_chat_returns_message_content():
    """chat() should return only the message content string."""
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(
        return_value=_json_response({"message": {"content": "The capital is Paris."}})
    )

    with patch("app.ollama_client.httpx.AsyncClient", return_value=_async_client_ctx(mock_client)):
        result = await ollama_client.chat("What is the capital of France?")

    assert result == "The capital is Paris."


@pytest.mark.asyncio
async def test_chat_includes_system_message_when_provided():
    """When a system prompt is given, it must appear first in the messages array."""
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(
        return_value=_json_response({"message": {"content": "Sure!"}})
    )

    with patch("app.ollama_client.httpx.AsyncClient", return_value=_async_client_ctx(mock_client)):
        await ollama_client.chat("Do X", system="You are a helpful assistant.")

    posted_json = mock_client.post.call_args[1]["json"]
    messages = posted_json["messages"]

    assert messages[0]["role"] == "system"
    assert messages[0]["content"] == "You are a helpful assistant."
    assert messages[1]["role"] == "user"


# ═════════════════════════════════════════════════════════════════════════════
#  chat_stream_messages()
# ═════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_stream_yields_token_chunks_in_order():
    """chat_stream_messages() must yield each non-empty content chunk in order."""
    sse_lines = [
        json.dumps({"message": {"content": "Hello"}, "done": False}),
        json.dumps({"message": {"content": " "}, "done": False}),
        json.dumps({"message": {"content": "world"}, "done": False}),
        json.dumps({"done": True, "eval_count": 3, "prompt_eval_count": 8,
                    "eval_duration": 300_000_000}),
    ]

    with patch("app.ollama_client.httpx.AsyncClient", return_value=_streaming_ctx(sse_lines)):
        chunks = []
        async for chunk in ollama_client.chat_stream_messages(
            [{"role": "user", "content": "Say hello"}]
        ):
            chunks.append(chunk)

    assert chunks == ["Hello", " ", "world"]


@pytest.mark.asyncio
async def test_stream_skips_empty_content_chunks():
    """Chunks with empty content strings must not be yielded."""
    sse_lines = [
        json.dumps({"message": {"content": "Hi"}, "done": False}),
        json.dumps({"message": {"content": ""}, "done": False}),   # empty — skip
        json.dumps({"message": {"content": "!"}, "done": False}),
        json.dumps({"done": True, "eval_count": 2, "prompt_eval_count": 4,
                    "eval_duration": 100_000_000}),
    ]

    with patch("app.ollama_client.httpx.AsyncClient", return_value=_streaming_ctx(sse_lines)):
        chunks = []
        async for chunk in ollama_client.chat_stream_messages(
            [{"role": "user", "content": "hi"}]
        ):
            chunks.append(chunk)

    assert "" not in chunks
    assert chunks == ["Hi", "!"]


@pytest.mark.asyncio
async def test_stream_populates_out_meta_on_done():
    """Token counts from the done event must be written into the out_meta dict."""
    sse_lines = [
        json.dumps({"message": {"content": "token"}, "done": False}),
        json.dumps({
            "done": True,
            "eval_count": 7,
            "prompt_eval_count": 12,
            "eval_duration": 500_000_000,
        }),
    ]

    out_meta: dict = {}
    with patch("app.ollama_client.httpx.AsyncClient", return_value=_streaming_ctx(sse_lines)):
        async for _ in ollama_client.chat_stream_messages(
            [{"role": "user", "content": "hi"}], out_meta=out_meta
        ):
            pass

    assert out_meta["eval_count"] == 7
    assert out_meta["prompt_eval_count"] == 12
    assert out_meta["eval_duration_ns"] == 500_000_000


@pytest.mark.asyncio
async def test_stream_out_meta_not_populated_when_none():
    """Passing out_meta=None must not raise any errors."""
    sse_lines = [
        json.dumps({"message": {"content": "ok"}, "done": False}),
        json.dumps({"done": True, "eval_count": 1, "prompt_eval_count": 2,
                    "eval_duration": 50_000_000}),
    ]

    with patch("app.ollama_client.httpx.AsyncClient", return_value=_streaming_ctx(sse_lines)):
        chunks = []
        # out_meta defaults to None — should not raise
        async for chunk in ollama_client.chat_stream_messages(
            [{"role": "user", "content": "hi"}]
        ):
            chunks.append(chunk)

    assert chunks == ["ok"]


@pytest.mark.asyncio
async def test_stream_options_include_temperature_and_num_ctx():
    """temperature and num_ctx must be sent in the Ollama request options."""
    sse_lines = [
        json.dumps({"message": {"content": "x"}, "done": False}),
        json.dumps({"done": True, "eval_count": 1, "prompt_eval_count": 1,
                    "eval_duration": 10_000_000}),
    ]

    stream_resp = AsyncMock()
    stream_resp.__aenter__ = AsyncMock(return_value=stream_resp)
    stream_resp.__aexit__ = AsyncMock(return_value=False)

    async def fake_lines():
        for l in sse_lines:
            yield l

    stream_resp.aiter_lines = fake_lines

    mock_client = AsyncMock()
    mock_client.stream = MagicMock(return_value=stream_resp)
    mock_cm = _async_client_ctx(mock_client)

    with patch("app.ollama_client.httpx.AsyncClient", return_value=mock_cm):
        async for _ in ollama_client.chat_stream_messages(
            [{"role": "user", "content": "hi"}],
            temperature=1.2,
            num_ctx=4096,
        ):
            pass

    call_kwargs = mock_client.stream.call_args[1]
    options = call_kwargs["json"]["options"]
    assert options["temperature"] == 1.2
    assert options["num_ctx"] == 4096
