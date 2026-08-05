import os
from pathlib import Path

from dotenv import load_dotenv

# Mirror the Node app's dotenv loading order (scripts/worker.ts): .env.local, then .env,
# then a parent .env, each without overriding an already-set process env var.
_here = Path(__file__).resolve().parent.parent.parent
for _candidate in (_here / ".env.local", _here / ".env", _here.parent / ".env"):
    if _candidate.exists():
        load_dotenv(_candidate, override=False)


def _require(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing env var: {name}")
    return value


class Settings:
    @property
    def database_url(self) -> str:
        return os.environ.get("DIRECT_DATABASE_URL") or _require("DATABASE_URL")

    @property
    def internal_secret(self) -> str | None:
        # Optional in local dev so the service is easy to hit with curl while iterating;
        # required implicitly in production because deploy/vps/.env.example sets it and
        # self-learning-scoring.ts always sends it.
        return os.environ.get("ML_SERVICE_SECRET") or None

    @property
    def storage_root(self) -> str:
        # Resolved against the repo root (_here), not Python's own process cwd, so a
        # relative FILE_STORAGE_ROOT (e.g. local dev's "./storage") lands in the same
        # directory Node resolves it to (path.resolve is relative to process.cwd(), and
        # both apps are conventionally launched from the repo root) rather than silently
        # diverging into ml-service/storage. An absolute path (e.g. Docker's /app/storage)
        # passes through unchanged.
        raw = os.environ.get("FILE_STORAGE_ROOT")
        if not raw:
            return str(_here / "storage")
        return raw if os.path.isabs(raw) else str((_here / raw).resolve())

    @property
    def embedding_model_name(self) -> str:
        return os.environ.get("ML_EMBEDDING_MODEL", "all-MiniLM-L6-v2")

    @property
    def port(self) -> int:
        return int(os.environ.get("ML_SERVICE_PORT", "8000"))


settings = Settings()
