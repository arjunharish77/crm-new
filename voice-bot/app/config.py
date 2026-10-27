"""Settings read from the environment once at start-up.

The service has one secret, VOICE_BOT_SERVICE_SECRET, shared with the CRM. Provider keys are
never in its environment: the CRM hands over each conversation's keys when it is claimed.
"""

import os
from dataclasses import dataclass
from urllib.parse import urlparse


@dataclass(frozen=True)
class Settings:
    crm_url: str
    secret: str
    port: int
    # Origins a browser test call may connect from (the CRM's own site).
    browser_origins: tuple[str, ...]

    @property
    def configured(self) -> bool:
        return bool(self.secret)


def _origin(url: str) -> str | None:
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return None
    return f"{parsed.scheme}://{parsed.netloc}"


def load_settings() -> Settings:
    # Without a usable secret the service still starts (so a deploy before the secret is set
    # doesn't crash-loop), but /health reports it and every conversation is refused.
    secret = os.environ.get("VOICE_BOT_SERVICE_SECRET", "").strip()
    if len(secret) < 32:
        secret = ""
    origins = [_origin(value) for value in os.environ.get("VOICE_BOT_BROWSER_ORIGINS", os.environ.get("APP_URL", "")).split(",")]
    return Settings(
        crm_url=os.environ.get("CRM_INTERNAL_URL", "http://web:3000").strip().rstrip("/"),
        secret=secret,
        port=int(os.environ.get("VOICE_BOT_PORT", "8765")),
        browser_origins=tuple(origin for origin in origins if origin),
    )
