"""
Cloud marketplace client. Talks to the Spring Boot backend.
Drop-in module — can be imported by the existing OpenClaw app or used standalone.
"""
from __future__ import annotations

import httpx
from typing import Optional


class MarketClient:
    def __init__(self, base_url: str = "http://localhost:8080"):
        self.base_url = base_url.rstrip("/")
        self.token: Optional[str] = None
        self.username: Optional[str] = None

    def _headers(self) -> dict:
        h = {"Content-Type": "application/json"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    async def register(self, username: str, email: str, password: str) -> dict:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.post(f"{self.base_url}/api/auth/register", headers=self._headers(),
                             json={"username": username, "email": email, "password": password})
            r.raise_for_status()
            data = r.json()
            self.token = data["token"]
            self.username = data["user"]["username"]
            return data

    async def login(self, username: str, password: str) -> dict:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.post(f"{self.base_url}/api/auth/login", headers=self._headers(),
                             json={"username": username, "password": password})
            r.raise_for_status()
            data = r.json()
            self.token = data["token"]
            self.username = data["user"]["username"]
            return data

    async def me(self) -> dict:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f"{self.base_url}/api/users/me", headers=self._headers())
            r.raise_for_status()
            return r.json()

    async def search(self, embedding: list[float], k: int = 3) -> list[dict]:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(f"{self.base_url}/api/market/search", headers=self._headers(),
                             json={"embedding": embedding, "k": k})
            r.raise_for_status()
            return r.json()["results"]

    async def publish(self, prompt: str, response: str, model_used: str,
                      embedding: list[float], tags: Optional[list[str]] = None) -> dict:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(f"{self.base_url}/api/market/publish", headers=self._headers(),
                             json={"prompt": prompt, "response": response,
                                   "modelUsed": model_used, "embedding": embedding,
                                   "tags": tags or []})
            r.raise_for_status()
            return r.json()

    async def consume(self, entry_id: str) -> dict:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.post(f"{self.base_url}/api/market/consume", headers=self._headers(),
                             json={"entryId": entry_id})
            r.raise_for_status()
            return r.json()

    async def mine(self) -> list[dict]:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f"{self.base_url}/api/market/mine", headers=self._headers())
            r.raise_for_status()
            return r.json()["entries"]
