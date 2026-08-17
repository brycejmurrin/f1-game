#!/usr/bin/env python3
"""Compat entry for cloud environments that still launch tools/mcp-wrap.py.

Forwards every argv to tools/probe-mcp.py — the unified Chrome DevTools +
TinyFish bridge (`chrome_*` / `tinyfish_*`). Prefer calling probe-mcp.py
directly; this file exists so a stale MCP config of:

  { "command": "python3", "args": ["tools/mcp-wrap.py", "serve"] }

keeps working after the old SDK-based server was removed.
"""
from __future__ import annotations

import runpy
import sys
from pathlib import Path

TARGET = Path(__file__).resolve().parent / "probe-mcp.py"


def main() -> None:
    # Preserve "python3 tools/mcp-wrap.py serve" → probe-mcp serve
    sys.argv[0] = str(TARGET)
    runpy.run_path(str(TARGET), run_name="__main__")


if __name__ == "__main__":
    main()
