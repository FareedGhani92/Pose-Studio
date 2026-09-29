"""Run the complete app: python3 start.py (Python 3.10–3.13)."""
import argparse
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys
import threading
import time
from urllib.request import urlopen
import venv
import webbrowser

ROOT = Path(__file__).resolve().parent

def main():
    parser = argparse.ArgumentParser(description="Set up and launch Pose Studio.")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    if not (3, 10) <= sys.version_info[:2] <= (3, 13):
        parser.error("Use Python 3.10, 3.11, 3.12, or 3.13.")
    if not 1 <= args.port <= 65535:
        parser.error("Port must be between 1 and 65535.")
    os.chdir(ROOT)
    env_dir = ROOT / ".venv"
    python = env_dir / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if not python.exists():
        print("Preparing the Python environment…", flush=True)
        venv.create(env_dir, with_pip=True)
    requirements = ROOT / "backend/requirements.txt"
    digest = hashlib.sha256(requirements.read_bytes()).hexdigest()
    stamp = env_dir / ".pose-requirements"
    if not stamp.exists() or stamp.read_text() != digest:
        print("Installing dependencies (internet needed on first run)…", flush=True)
        subprocess.run([str(python), "-m", "pip", "install", "-r", str(requirements)], check=True)
        stamp.write_text(digest)
    subprocess.run([str(python), "scripts/download_model.py"], check=True)
    if not (ROOT / "dist/index.html").exists():
        pnpm = shutil.which("pnpm")
        if not pnpm:
            parser.error("The frontend build is missing. Install Node.js and pnpm, then run pnpm install && pnpm build, or use the complete ZIP which includes dist/.")
        subprocess.run([pnpm, "install", "--frozen-lockfile"], check=True)
        subprocess.run([pnpm, "build"], check=True)
    url = f"http://127.0.0.1:{args.port}"
    process = subprocess.Popen([str(python), "-m", "uvicorn", "backend.main:app", "--host", args.host, "--port", str(args.port)])
    if not args.no_browser:
        def open_when_ready():
            for _ in range(60):
                if process.poll() is not None:
                    return
                try:
                    with urlopen(url + "/api/health", timeout=1) as response:
                        if response.status == 200:
                            webbrowser.open(url)
                            return
                except OSError:
                    time.sleep(.5)
        threading.Thread(target=open_when_ready, daemon=True).start()
    print(f"Pose Studio: {url}\nPress Ctrl+C to stop.", flush=True)
    try:
        return process.wait()
    except KeyboardInterrupt:
        process.terminate()
        process.wait()
        return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except subprocess.CalledProcessError as error:
        print(f"Setup failed. Resolve the error above, then run this command again. Exit code: {error.returncode}", file=sys.stderr)
        sys.exit(error.returncode)
