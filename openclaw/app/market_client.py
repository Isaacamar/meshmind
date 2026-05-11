"""
Cloud marketplace client. Talks to the Spring Boot backend.
Drop-in module — can be imported by the existing OpenClaw app or used standalone.
"""
from __future__ import annotations

import httpx
from typing import Optional


class MarketClient:
    def __init__(self, base_url: str = "https://meshmind-g3am.onrender.com"):
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
            if not r.is_success:
                raise Exception(r.text or f"HTTP {r.status_code}")
            data = r.json()
            # v1 backend returns UserResponse on register (no token); v2 returns LoginResponse
            if "token" in data:
                self.token = data["token"]
                self.username = data.get("user", {}).get("username", username)
            else:
                self.username = data.get("username", username)
            return data

    async def login(self, username: str, password: str) -> dict:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.post(f"{self.base_url}/api/auth/login", headers=self._headers(),
                             json={"username": username, "password": password})
            if not r.is_success:
                raise Exception(r.text or f"HTTP {r.status_code}")
            data = r.json()
            self.token = data["token"]
            self.username = data["user"]["username"]
            return data

    async def me(self) -> dict:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f"{self.base_url}/api/users/me", headers=self._headers())
            r.raise_for_status()
            return r.json()

    async def update_me(self, display_name: Optional[str] = None,
                        current_password: Optional[str] = None,
                        new_password: Optional[str] = None) -> dict:
        body = {}
        if display_name is not None:
            body["displayName"] = display_name
        if current_password is not None:
            body["currentPassword"] = current_password
        if new_password is not None:
            body["newPassword"] = new_password

        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.put(f"{self.base_url}/api/users/me", headers=self._headers(), json=body)
            if not r.is_success:
                raise Exception(r.text or f"HTTP {r.status_code}")
            return r.json()

    async def search(self, embedding: list[float], k: int = 3,
                     token: Optional[str] = None) -> list[dict]:
        headers = self._headers()
        if token:
            headers["Authorization"] = f"Bearer {token}"
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(f"{self.base_url}/api/market/search", headers=headers,
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
