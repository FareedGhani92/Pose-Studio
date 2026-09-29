"""Verify bundled models and restore missing ones from their official sources."""
from pathlib import Path
import hashlib
import json
from urllib.request import urlretrieve
ROOT = Path(__file__).resolve().parents[1]
for item in json.loads((ROOT / "scripts/models.json").read_text()):
    target = ROOT / item["path"]
    if target.exists():
        if hashlib.sha256(target.read_bytes()).hexdigest() != item["sha256"]:
            raise RuntimeError(f"Model checksum mismatch: {target}. Remove this file and rerun to restore it.")
        continue
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(".download")
    try:
        print(f"Downloading {target.name}…", flush=True)
        urlretrieve(item["url"], temporary)
        if hashlib.sha256(temporary.read_bytes()).hexdigest() != item["sha256"]:
            raise RuntimeError(f"Downloaded model failed checksum verification: {target.name}")
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
print("All pose models are ready.")
