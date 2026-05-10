#!/usr/bin/env python3
"""
MeshMind local node — cross-platform setup and launcher.
Works on macOS, Linux, and Windows. Requires Python 3.10+.

  python local_node.py           # first time: install deps + required model + start
  python local_node.py install   # install deps and pull required model only
  python local_node.py start     # start the node (assumes already set up)
  python local_node.py models    # browse and pull extra models interactively

Environment variables (optional):
  MESHMIND_CLOUD=https://...   URL of the cloud backend (default: http://localhost:8080)
  OLLAMA_URL=http://...        URL of local Ollama (default: http://localhost:11434)
"""
from __future__ import annotations
import os
import re
import sys
import shutil
import subprocess

# ── paths ──────────────────────────────────────────────────────────────────────
REPO = os.path.dirname(os.path.abspath(__file__))
CLAW = os.path.join(REPO, "openclaw")
VENV = os.path.join(CLAW, ".venv")
WIN  = sys.platform == "win32"
BIN  = "Scripts" if WIN else "bin"
EXT  = ".exe"   if WIN else ""


def _v(name: str) -> str:
    """Path to an executable inside the virtual environment."""
    return os.path.join(VENV, BIN, name + EXT)


# ── model catalog ──────────────────────────────────────────────────────────────
EMBED_MODEL = "nomic-embed-text"   # required — used for privacy-preserving search

CATALOG: list[tuple[str, str, str]] = [
    ("llama3.2:3b",       "~2 GB", "Fast general chat — good starting point"),
    ("mistral:7b",        "~4 GB", "Great general-purpose model"),
    ("qwen2.5-coder:7b",  "~4 GB", "Code generation and debugging"),
    ("llava:7b",          "~5 GB", "Understands images — needed for vision"),
    ("phi4:14b",          "~8 GB", "Strong at math and reasoning"),
    ("gemma3:12b",        "~7 GB", "Google's latest, well-rounded"),
]

_EMBED_KEYWORDS = ("nomic", "embed", "minilm", "mxbai")


# ── helpers ────────────────────────────────────────────────────────────────────
def _run(*cmd: str, **kw) -> int:
    return subprocess.run(list(cmd), **kw).returncode


def _out(*cmd: str) -> str:
    r = subprocess.run(list(cmd), capture_output=True, text=True)
    return r.stdout.strip()


def _installed_models() -> list[str]:
    raw = _out("ollama", "list")
    names = []
    for line in raw.splitlines()[1:]:   # skip header row
        parts = line.split()
        if parts:
            names.append(parts[0])
    return names


def _has(name: str, installed: list[str]) -> bool:
    base = name.split(":")[0]
    return any(m == name or m.split(":")[0] == base for m in installed)


def _pull(model: str) -> None:
    print(f"\nPulling {model} ...")
    rc = _run("ollama", "pull", model)
    if rc != 0:
        print(f"Warning: ollama pull {model} exited {rc} — check the model name and try again.")


def _print_catalog(installed: list[str]) -> None:
    print()
    print(f"  {'':3}  {'Model':<24}  {'Size':<8}  Description")
    print("  " + "─" * 68)
    for i, (name, size, desc) in enumerate(CATALOG, 1):
        tick = "✓" if _has(name, installed) else " "
        print(f"  {tick}{i:<3} {name:<24}  {size:<8}  {desc}")
    print()


def _pick_from_input(choice: str) -> list[str]:
    """Turn a user input like '1 3' or 'deepseek-r1:7b' into a list of model names."""
    to_pull: list[str] = []
    for token in choice.split():
        if token.isdigit():
            idx = int(token) - 1
            if 0 <= idx < len(CATALOG):
                to_pull.append(CATALOG[idx][0])
            else:
                print(f"  Unknown number: {token}")
        elif re.match(r'^[a-zA-Z0-9][\w.:\-/]{0,127}$', token):
            to_pull.append(token)
        else:
            print(f"  Skipping invalid model name: {token}")
    return to_pull


# ── check / setup ──────────────────────────────────────────────────────────────
def check_python() -> None:
    if sys.version_info < (3, 10):
        sys.exit("MeshMind requires Python 3.10+. Download it from https://python.org")
    if sys.version_info >= (3, 14):
        sys.exit(
            f"Python {sys.version_info.major}.{sys.version_info.minor} is too new — "
            "pydantic-core does not support it yet. Use Python 3.10–3.13.\n"
            "Install with: brew install python@3.13\n"
            "Then run:     python3.13 local_node.py"
        )


def check_ollama() -> bool:
    if shutil.which("ollama"):
        return True
    print()
    print("Ollama is not installed. Get it from: https://ollama.com/download")
    if WIN:
        print("  Windows : run the OllamaSetup.exe installer, then reopen this terminal.")
    elif sys.platform == "darwin":
        print("  macOS   : download Ollama.app  or  brew install ollama")
    else:
        print("  Linux   : curl -fsSL https://ollama.com/install.sh | sh")
    return False


def setup_venv() -> None:
    if not os.path.isfile(_v("python")):
        print("Creating Python virtual environment ...")
        import venv as _venv
        _venv.create(VENV, with_pip=True)
    print("Installing Python dependencies ...")
    _run(_v("pip"), "install", "--quiet", "--upgrade", "pip")
    _run(_v("pip"), "install", "--quiet", "-r", os.path.join(CLAW, "requirements.txt"))


def install_embed() -> None:
    installed = _installed_models()
    if _has(EMBED_MODEL, installed):
        print(f"  {EMBED_MODEL}: already installed ✓")
    else:
        print(f"\nPulling required embedding model ({EMBED_MODEL}) ...")
        print("  This model runs locally and converts your prompts into numbers.")
        print("  Plaintext never leaves your machine.")
        _pull(EMBED_MODEL)


def choose_chat_models() -> None:
    installed = _installed_models()
    chat = [m for m in installed if not any(k in m.lower() for k in _EMBED_KEYWORDS)]

    if chat:
        print(f"\nChat models already installed: {', '.join(chat)}")
        ans = input("Add more? [y/N] ").strip().lower()
        if ans != "y":
            return
    else:
        print("\nNo chat models found — you need at least one to start chatting.")

    print("Recommended models (you can also type any Ollama model name):")
    _print_catalog(installed)
    print("Enter number(s) or a model name, or press Enter to skip.")
    print("  Example: '1'  or  '1 3'  or  'deepseek-r1:7b'")
    choice = input("  > ").strip()

    if not choice:
        print("Skipped. Pull models later from the app or with: ollama pull <model>")
        return

    for model in _pick_from_input(choice):
        _pull(model)


# ── start ──────────────────────────────────────────────────────────────────────
def start_node() -> None:
    cloud  = os.environ.get("MESHMIND_CLOUD", "http://localhost:8080")
    ollama = os.environ.get("OLLAMA_URL",     "http://localhost:11434")

    print()
    print("Starting MeshMind local node ...")
    print(f"  OpenClaw   →  http://127.0.0.1:8000")
    print(f"  Cloud      →  {cloud}")
    print(f"  Ollama     →  {ollama}")
    print()
    print("Press Ctrl-C to stop.")
    print()

    env = {**os.environ, "MESHMIND_CLOUD": cloud, "OLLAMA_URL": ollama}
    uvicorn = [
        _v("uvicorn"), "app.server:app",
        "--app-dir", CLAW,
        "--host", "127.0.0.1",
        "--port", "8000",
    ]

    if WIN:
        # execv not available on Windows — subprocess.run is fine
        subprocess.run(uvicorn, env=env)
    else:
        # Replace this process so Ctrl-C works cleanly
        os.execve(uvicorn[0], uvicorn, env)


# ── subcommands ────────────────────────────────────────────────────────────────
def cmd_install() -> None:
    check_python()
    if not check_ollama():
        sys.exit(1)
    setup_venv()
    install_embed()
    choose_chat_models()
    print("\nSetup complete.  Run:  python local_node.py start")


def cmd_start() -> None:
    if not os.path.isfile(_v("uvicorn")):
        print("Not installed yet. Run:  python local_node.py install")
        sys.exit(1)
    if not check_ollama():
        sys.exit(1)
    start_node()


def cmd_models() -> None:
    if not check_ollama():
        sys.exit(1)
    installed = _installed_models()
    print("Recommended models:")
    _print_catalog(installed)
    print("Enter model name(s) or number(s) to pull, or press Enter to quit:")
    choice = input("  > ").strip()
    if choice:
        for model in _pick_from_input(choice):
            _pull(model)


def cmd_run() -> None:
    """Default: install everything then start."""
    check_python()
    if not check_ollama():
        sys.exit(1)
    setup_venv()
    install_embed()
    choose_chat_models()
    start_node()


# ── entry point ────────────────────────────────────────────────────────────────
COMMANDS = {
    "install": cmd_install,
    "start":   cmd_start,
    "models":  cmd_models,
    "run":     cmd_run,
}

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "run"
    fn  = COMMANDS.get(cmd)
    if fn is None:
        print(__doc__)
        sys.exit(1)
    fn()
