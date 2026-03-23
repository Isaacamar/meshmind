import uuid
import os
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
import aiosqlite

router = APIRouter()

OLLAMA_BASE = os.environ.get("OLLAMA_BASE_URL", "http://host.docker.internal:11434")


class SessionCreate(BaseModel):
    model: str
    title: Optional[str] = None
    system_prompt: Optional[str] = None
    temperature: float = 0.7


class ChatMessage(BaseModel):
    content: str
    model: Optional[str] = None  # override session model if provided


# --- Sessions ---

@router.post("/sessions")
async def create_session(body: SessionCreate, db: aiosqlite.Connection = Depends(get_db)):
    session_id = str(uuid.uuid4())
    await db.execute(
        "INSERT INTO sessions (id, title, model, system_prompt, temperature) VALUES (?, ?, ?, ?, ?)",
        (session_id, body.title or "New Chat", body.model, body.system_prompt, body.temperature)
    )
    await db.commit()
    return {"id": session_id, "title": body.title or "New Chat", "model": body.model}


@router.get("/sessions")
async def list_sessions(db: aiosqlite.Connection = Depends(get_db)):
    cursor = await db.execute(
        "SELECT id, title, model, created_at FROM sessions ORDER BY created_at DESC"
    )
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


@router.get("/sessions/{session_id}/messages")
async def get_messages(session_id: str, db: aiosqlite.Connection = Depends(get_db)):
    cursor = await db.execute(
        "SELECT role, content, from_peer, created_at FROM messages WHERE session_id = ? ORDER BY id ASC",
        (session_id,)
    )
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, db: aiosqlite.Connection = Depends(get_db)):
    await db.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
    await db.commit()
    return {"deleted": session_id}


# --- Chat (non-streaming JSON) ---

@router.post("/sessions/{session_id}/chat")
async def chat(session_id: str, body: ChatMessage, db: aiosqlite.Connection = Depends(get_db)):
    # Load session
    cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
    session = await cursor.fetchone()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session = dict(session)
    model = body.model or session["model"]

    # Save user message
    await db.execute(
        "INSERT INTO messages (session_id, role, content) VALUES (?, 'user', ?)",
        (session_id, body.content)
    )
    await db.commit()

    # Build message history for Ollama
    cursor = await db.execute(
        "SELECT role, content FROM messages WHERE session_id = ? ORDER BY id ASC",
        (session_id,)
    )
    history = [dict(r) for r in await cursor.fetchall()]

    ollama_messages = []
    if session.get("system_prompt"):
        ollama_messages.append({"role": "system", "content": session["system_prompt"]})
    ollama_messages.extend(history)

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{OLLAMA_BASE}/api/chat",
                json={"model": model, "messages": ollama_messages, "stream": False},
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail=f"Ollama error: {resp.status_code}")
            data = resp.json()
            content = data.get("message", {}).get("content", "")
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Ollama is not running. Run: OLLAMA_HOST=0.0.0.0 ollama serve")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Save assistant response
    await db.execute(
        "INSERT INTO messages (session_id, role, content) VALUES (?, 'assistant', ?)",
        (session_id, content)
    )
    await db.commit()

    return {"content": content}
