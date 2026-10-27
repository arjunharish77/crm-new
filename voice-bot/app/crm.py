"""Signed calls from the service to the CRM's internal API (/api/internal/voice-bot).

Each request carries x-voice-bot-signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of
"<t>.<METHOD>.<path>.<body>"> with the shared secret, the same scheme the CRM checks in
src/lib/server/voice-bot-service.ts. The CRM refuses anything more than a minute old.
"""

import hashlib
import hmac
import json
import time
from typing import Any

import aiohttp
from loguru import logger

SIGNATURE_HEADER = "x-voice-bot-signature"


def sign(secret: str, method: str, path: str, body: str, timestamp: int | None = None) -> str:
    timestamp = int(time.time()) if timestamp is None else timestamp
    message = f"{timestamp}.{method.upper()}.{path}.{body}".encode()
    digest = hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={digest}"


def verify(secret: str, header: str | None, method: str, path: str, body: str, now: int | None = None) -> bool:
    """True when `header` is a fresh (under a minute), valid signature of this request."""
    if not secret or not header:
        return False
    parts = dict(part.strip().split("=", 1) for part in header.split(",") if "=" in part)
    try:
        timestamp = int(parts.get("t", ""))
    except ValueError:
        return False
    now = int(time.time()) if now is None else now
    if abs(now - timestamp) > 60 or not re_hex64(parts.get("v1", "")):
        return False
    expected = sign(secret, method, path, body, timestamp).split("v1=")[1]
    return hmac.compare_digest(expected, parts["v1"])


def re_hex64(value: str) -> bool:
    return len(value) == 64 and all(char in "0123456789abcdef" for char in value)


class CrmClient:
    def __init__(self, base_url: str, secret: str, session: aiohttp.ClientSession | None = None):
        self._base_url = base_url.rstrip("/")
        self._secret = secret
        self._session = session

    async def _post(self, path: str, payload: dict[str, Any], timeout: float = 10) -> dict[str, Any] | None:
        body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
        headers = {"content-type": "application/json", SIGNATURE_HEADER: sign(self._secret, "POST", path, body)}
        owns_session = self._session is None
        session = self._session or aiohttp.ClientSession()
        try:
            async with session.post(f"{self._base_url}{path}", data=body.encode(), headers=headers, timeout=aiohttp.ClientTimeout(total=timeout)) as response:
                if response.status == 404:
                    return None
                if response.status >= 400:
                    logger.warning(f"CRM {path} answered {response.status}")
                    return None
                return await response.json()
        except Exception as error:  # the CRM being briefly unreachable must never end a call
            logger.warning(f"CRM {path} failed: {error}")
            return None
        finally:
            if owns_session:
                await session.close()

    async def claim(self, token: str) -> dict[str, Any] | None:
        return await self._post("/api/internal/voice-bot/sessions/claim", {"token": token})

    async def usage(self, session_id: str, usage: dict[str, Any]) -> dict[str, Any] | None:
        return await self._post(f"/api/internal/voice-bot/sessions/{session_id}/usage", usage, timeout=5)

    async def transfer(self, session_id: str, request: dict[str, Any]) -> dict[str, Any] | None:
        """Asks the CRM to move a phone call to a person (decision 3). The CRM rings them through Plivo."""
        return await self._post(f"/api/internal/voice-bot/sessions/{session_id}/transfer", request, timeout=15)

    async def end(self, session_id: str, report: dict[str, Any]) -> bool:
        # The end report matters most, so it gets a few tries.
        for attempt in range(3):
            result = await self._post(f"/api/internal/voice-bot/sessions/{session_id}/end", report, timeout=15)
            if result is not None:
                return True
            await _sleep(1.5 * (attempt + 1))
        return False


async def _sleep(seconds: float):
    import asyncio

    await asyncio.sleep(seconds)
