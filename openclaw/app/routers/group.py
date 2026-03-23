import os
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

OLLAMA_BASE = os.environ.get("OLLAMA_BASE_URL", "http://host.docker.internal:11434")

SKIP_SIGNAL = "[SKIP]"


class GroupMsg(BaseModel):
    userId: str
    username: str
    content: str
    isAi: bool = False
    modelName: Optional[str] = None


class GroupReplyRequest(BaseModel):
    myUserId: str
    myUsername: str
    model: str
    messages: list[GroupMsg]  # recent group history, oldest first


@router.post("/group-reply")
async def group_reply(body: GroupReplyRequest):
    """
    Given the recent group chat history, decide whether this node's local model
    should respond, and if so return the reply.

    Returns: { "content": "...", "skipped": false }
         or  { "content": "",    "skipped": true  }
    """
    if not body.messages:
        return {"content": "", "skipped": True}

    last = body.messages[-1]

    # Never auto-respond to your own message or to another AI reply
    if last.userId == body.myUserId or last.isAi:
        return {"content": "", "skipped": True}

    system = (
        f"You are the AI assistant for user '{body.myUsername}' in a group chat. "
        f"Your job: read the conversation and decide whether to contribute a response. "
        f"Reply with {SKIP_SIGNAL} (and nothing else) if the last message doesn't need a response "
        f"(e.g. it's a simple acknowledgement, already answered, off-topic chatter). "
        f"Otherwise write a concise, helpful reply — no more than a few sentences. "
        f"Do NOT address the sender by name or repeat the question."
    )

    ollama_messages = [{"role": "system", "content": system}]

    # Feed the last 12 messages as alternating context.
    # Messages from self → "assistant", from others → "user".
    for m in body.messages[-12:]:
        if m.isAi and m.userId == body.myUserId:
            role = "assistant"
            text = m.content
        else:
            role = "user"
            label = f"[{m.username}{'·AI' if m.isAi else ''}]"
            text = f"{label}: {m.content}"
        ollama_messages.append({"role": role, "content": text})

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{OLLAMA_BASE}/api/chat",
                json={"model": body.model, "messages": ollama_messages, "stream": False},
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail=f"Ollama error: {resp.status_code}")
            data = resp.json()
            content = data.get("message", {}).get("content", "").strip()
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Ollama not reachable")

    if content.startswith(SKIP_SIGNAL):
        return {"content": "", "skipped": True}

    return {"content": content, "skipped": False}
