"""Matches the key/path conventions in src/lib/storage/file-storage.ts so the same
FILE_STORAGE_ROOT volume can be shared between the Node app and this service without
either side needing to know about the other's language."""

import os
from pathlib import Path

from app.config import settings


def _storage_root() -> Path:
    return Path(settings.storage_root).resolve()


def normalize_storage_key(relative_path: str) -> str:
    normalized = relative_path.lstrip("/")
    if not normalized or "\0" in normalized:
        raise ValueError("INVALID_STORAGE_PATH")
    return normalized


def resolve_local_storage_path(relative_path: str) -> Path:
    normalized = normalize_storage_key(relative_path)
    root = _storage_root()
    absolute = (root / normalized).resolve()
    if absolute != root and root not in absolute.parents:
        raise ValueError("INVALID_STORAGE_PATH")
    return absolute


def write_private_file(relative_path: str, data: bytes) -> str:
    storage_key = normalize_storage_key(relative_path)
    absolute = resolve_local_storage_path(storage_key)
    absolute.parent.mkdir(parents=True, exist_ok=True)
    with open(absolute, "wb") as handle:
        handle.write(data)
    return storage_key


def read_private_file(relative_path: str) -> bytes:
    absolute = resolve_local_storage_path(relative_path)
    with open(absolute, "rb") as handle:
        return handle.read()
