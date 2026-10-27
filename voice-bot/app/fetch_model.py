"""Downloads the knowledge-search model at image build time, pinned and checked.

multilingual-e5-small (MIT, by intfloat), the int8 ONNX export published as
Xenova/multilingual-e5-small. Run: python -m app.fetch_model <folder>
"""

import hashlib
import sys
import urllib.request
from pathlib import Path

REVISION = "761b726dd34fb83930e26aab4e9ac3899aa1fa78"
FILES = {
    "model_quantized.onnx": ("onnx/model_quantized.onnx", "f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193"),
    "tokenizer.json": ("tokenizer.json", "0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39"),
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def fetch(folder: str) -> None:
    target = Path(folder)
    target.mkdir(parents=True, exist_ok=True)
    for name, (remote, expected) in FILES.items():
        path = target / name
        if path.exists() and sha256(path) == expected:
            continue
        url = f"https://huggingface.co/Xenova/multilingual-e5-small/resolve/{REVISION}/{remote}"
        urllib.request.urlretrieve(url, path)
        actual = sha256(path)
        if actual != expected:
            path.unlink(missing_ok=True)
            raise SystemExit(f"{name}: checksum {actual} doesn't match the pinned {expected}")


if __name__ == "__main__":
    fetch(sys.argv[1] if len(sys.argv) > 1 else "models/e5")
