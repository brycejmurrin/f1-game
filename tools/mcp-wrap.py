#!/usr/bin/env python3
"""Unified MCP server — full passthrough for chrome-devtools + tinyfish.

Exposes every upstream tool under prefixed names:
  chrome_<tool>   → tools/chrome-devtools-mcp.sh (stdio, one long-lived browser)
  tinyfish_<tool> → local tinyfish proxy at http://127.0.0.1:3711/mcp (HTTP)

Cursor / Claude Desktop entry (.mcp.json):
  { "command": "python3", "args": ["tools/mcp-wrap.py", "serve"] }

Shell helpers (no MCP host required):
  python3 tools/mcp-wrap.py list-tools
  python3 tools/mcp-wrap.py status
  python3 tools/mcp-wrap.py call chrome_evaluate_script '{"function":"() => 1"}'

See .claude/skills/mcp-probe — park with chrome_navigate_page to about:blank
before Playwright groups; never render here while test-bg.mjs is running.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import logging
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
TINYFISH_SH = ROOT / "tools" / "tinyfish-mcp.sh"
TINYFISH_BASE = os.environ.get("TINYFISH_MCP_BASE", "http://127.0.0.1:3711")
TINYFISH_MCP = f"{TINYFISH_BASE.rstrip('/')}/mcp"
TINYFISH_PROTO = "2025-06-18"
TINYFISH_STATE = ROOT / "scratch" / "tinyfish-mcp-server" / ".mcp-session"
CHROME_PREFIX = "chrome_"
TINYFISH_PREFIX = "tinyfish_"
PROTOCOL = "2025-06-18"

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s mcp-wrap: %(message)s",
    stream=sys.stderr,
)
log = logging.getLogger(__name__)


def _load_cdmcp():
    spec = importlib.util.spec_from_file_location("cdmcp_cli", ROOT / "tools" / "cdmcp-cli.py")
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod


class ChromeBackend:
    """Long-lived chrome-devtools MCP client."""

    def __init__(self) -> None:
        self._client = None
        self._tools: list[dict[str, Any]] = []

    def _mod(self):
        return _load_cdmcp()

    def ensure(self) -> None:
        if self._client is not None:
            return
        mod = self._mod()
        self._client = mod.McpClient()
        self._client.start()
        raw = self._client._request("tools/list")  # noqa: SLF001 — shared transport
        self._tools = raw.get("tools") or []
        log.info("chrome-devtools: %d tools", len(self._tools))

    @property
    def ok(self) -> bool:
        return self._client is not None and bool(self._tools)

    def list_tools(self) -> list[dict[str, Any]]:
        self.ensure()
        out = []
        for t in self._tools:
            name = t.get("name", "")
            out.append(
                {
                    "name": f"{CHROME_PREFIX}{name}",
                    "description": t.get("description") or f"Chrome DevTools MCP: {name}",
                    "inputSchema": t.get("inputSchema")
                    or {"type": "object", "properties": {}},
                }
            )
        return out

    def call(self, prefixed: str, arguments: dict[str, Any]) -> dict[str, Any]:
        self.ensure()
        assert self._client
        inner = prefixed[len(CHROME_PREFIX) :]
        return self._client.call(inner, arguments)

    def close(self) -> None:
        if self._client:
            try:
                self._client.call("navigate_page", {"url": "about:blank"})
            except Exception:
                pass
            self._client.close()
            self._client = None


class TinyfishBackend:
    """HTTP MCP client for the local tinyfish proxy."""

    def __init__(self) -> None:
        self._session_id: str | None = None
        self._tools: list[dict[str, Any]] = []
        self._error: str | None = None

    def _post(self, body: dict, *, with_session: bool = True) -> dict:
        data = json.dumps(body).encode()
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "MCP-Protocol-Version": TINYFISH_PROTO,
        }
        if with_session and self._session_id:
            headers["Mcp-Session-Id"] = self._session_id
        req = urllib.request.Request(TINYFISH_MCP, data=data, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                sid = resp.headers.get("Mcp-Session-Id") or resp.headers.get("mcp-session-id")
                if sid:
                    self._session_id = sid.strip()
                    TINYFISH_STATE.parent.mkdir(parents=True, exist_ok=True)
                    TINYFISH_STATE.write_text(self._session_id, encoding="utf-8")
                raw = resp.read().decode()
                if not raw.strip():
                    return {}
                payload = json.loads(raw)
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")[:500]
            raise RuntimeError(f"tinyfish HTTP {e.code}: {detail}") from e
        except urllib.error.URLError as e:
            raise RuntimeError(f"tinyfish unreachable at {TINYFISH_MCP}: {e}") from e
        if "error" in payload:
            raise RuntimeError(json.dumps(payload["error"]))
        return payload

    def _healthz(self) -> bool:
        try:
            with urllib.request.urlopen(f"{TINYFISH_BASE.rstrip('/')}/healthz", timeout=2) as r:
                return r.status == 200
        except Exception:
            return False

    def _try_start(self) -> None:
        if not TINYFISH_SH.is_file():
            raise RuntimeError(f"missing {TINYFISH_SH}")
        subprocess.run([str(TINYFISH_SH), "start"], check=False, cwd=str(ROOT))

    def ensure(self) -> None:
        if self._tools:
            return
        if TINYFISH_STATE.is_file():
            self._session_id = TINYFISH_STATE.read_text(encoding="utf-8").strip() or None
        if not self._healthz():
            log.info("starting tinyfish proxy…")
            self._try_start()
            for _ in range(40):
                if self._healthz():
                    break
                import time

                time.sleep(0.25)
        if not self._healthz():
            self._error = (
                f"tinyfish proxy down — set TINYFISH_API_KEY in "
                f"scratch/tinyfish-mcp-server/.env and run tools/tinyfish-mcp.sh start"
            )
            log.warning(self._error)
            return
        init = self._post(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": TINYFISH_PROTO,
                    "capabilities": {},
                    "clientInfo": {"name": "mcp-wrap", "version": "1"},
                },
            },
            with_session=False,
        )
        _ = init
        self._post({"jsonrpc": "2.0", "method": "notifications/initialized"})
        listed = self._post(
            {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}
        )
        self._tools = listed.get("result", {}).get("tools") or []
        log.info("tinyfish: %d tools", len(self._tools))

    @property
    def ok(self) -> bool:
        return bool(self._tools)

    @property
    def error(self) -> str | None:
        return self._error

    def list_tools(self) -> list[dict[str, Any]]:
        self.ensure()
        if not self._tools:
            return []
        out = []
        for t in self._tools:
            name = t.get("name", "")
            desc = t.get("description") or t.get("title") or f"TinyFish MCP: {name}"
            out.append(
                {
                    "name": f"{TINYFISH_PREFIX}{name}",
                    "description": desc,
                    "inputSchema": t.get("inputSchema")
                    or {"type": "object", "properties": {}},
                }
            )
        return out

    def call(self, prefixed: str, arguments: dict[str, Any]) -> dict[str, Any]:
        self.ensure()
        if not self._tools:
            raise RuntimeError(self._error or "tinyfish unavailable")
        inner = prefixed[len(TINYFISH_PREFIX) :]
        rid = 3
        payload = self._post(
            {
                "jsonrpc": "2.0",
                "id": rid,
                "method": "tools/call",
                "params": {"name": inner, "arguments": arguments},
            }
        )
        return payload.get("result") or {}


class UnifiedServer:
    def __init__(self) -> None:
        self.chrome = ChromeBackend()
        self.tinyfish = TinyfishBackend()
        self._instructions = (
            "Apex 26 probe MCP — full passthrough of chrome-devtools (local headless "
            "Chromium + SwiftShader) and tinyfish (public web fetch/search). "
            "Local game: serve on :3456 then chrome_navigate_page. Deploy checks: "
            "tinyfish_fetch_content on …/version.json. Park chrome to about:blank "
            "before Playwright test runs."
        )

    def all_tools(self) -> list[dict[str, Any]]:
        tools: list[dict[str, Any]] = []
        try:
            tools.extend(self.chrome.list_tools())
        except Exception as e:
            log.error("chrome tools/list failed: %s", e)
        try:
            tools.extend(self.tinyfish.list_tools())
        except Exception as e:
            log.error("tinyfish tools/list failed: %s", e)
        return tools

    def dispatch(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        if name.startswith(CHROME_PREFIX):
            return self.chrome.call(name, arguments)
        if name.startswith(TINYFISH_PREFIX):
            return self.tinyfish.call(name, arguments)
        raise ValueError(
            f"unknown tool {name!r} — expected {CHROME_PREFIX}* or {TINYFISH_PREFIX}*"
        )

    def close(self) -> None:
        self.chrome.close()


def _tool_result(upstream: dict[str, Any]) -> dict[str, Any]:
    """Normalise upstream tool results to MCP content blocks."""
    if "content" in upstream:
        return upstream
    text = json.dumps(upstream, indent=2) if isinstance(upstream, dict) else str(upstream)
    return {"content": [{"type": "text", "text": text}]}


def cmd_list_tools(_: list[str]) -> None:
    srv = UnifiedServer()
    try:
        tools = srv.all_tools()
        chrome_n = sum(1 for t in tools if t["name"].startswith(CHROME_PREFIX))
        tf_n = sum(1 for t in tools if t["name"].startswith(TINYFISH_PREFIX))
        print(f"tools: {len(tools)} (chrome {chrome_n}, tinyfish {tf_n})")
        for t in tools:
            print(f"  - {t['name']}")
        if srv.tinyfish.error:
            print(f"tinyfish note: {srv.tinyfish.error}", file=sys.stderr)
    finally:
        srv.close()


def cmd_status(_: list[str]) -> None:
    srv = UnifiedServer()
    try:
        chrome_ok = False
        tf_ok = False
        try:
            srv.chrome.ensure()
            chrome_ok = srv.chrome.ok
        except Exception as e:
            print(f"chrome: FAIL ({e})")
        else:
            print(f"chrome: OK ({len(srv.chrome._tools)} tools)")  # noqa: SLF001
        srv.tinyfish.ensure()
        tf_ok = srv.tinyfish.ok
        if tf_ok:
            print(f"tinyfish: OK ({len(srv.tinyfish._tools)} tools)")  # noqa: SLF001
        else:
            print(f"tinyfish: DOWN ({srv.tinyfish.error})")
        sys.exit(0 if chrome_ok else 1)
    finally:
        srv.close()


def cmd_call(args: list[str]) -> None:
    if len(args) < 2:
        print("usage: call <prefixed-tool> '<json-args>'", file=sys.stderr)
        sys.exit(1)
    name, raw = args[0], args[1]
    arguments = json.loads(raw)
    srv = UnifiedServer()
    try:
        mod = _load_cdmcp()
        result = srv.dispatch(name, arguments)
        print(mod.text_result(_tool_result(result)))
    finally:
        srv.close()


def cmd_serve(_: list[str]) -> None:
    srv = UnifiedServer()

    def write(msg: dict) -> None:
        sys.stdout.write(json.dumps(msg) + "\n")
        sys.stdout.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        method = msg.get("method")
        rid = msg.get("id")
        if method == "notifications/initialized":
            continue
        if method == "initialize":
            write(
                {
                    "jsonrpc": "2.0",
                    "id": rid,
                    "result": {
                        "protocolVersion": PROTOCOL,
                        "capabilities": {"tools": {"listChanged": False}},
                        "serverInfo": {"name": "apex-probes", "version": "1.0.0"},
                        "instructions": srv._instructions,
                    },
                }
            )
            continue
        if method == "tools/list":
            write(
                {
                    "jsonrpc": "2.0",
                    "id": rid,
                    "result": {"tools": srv.all_tools()},
                }
            )
            continue
        if method == "tools/call":
            params = msg.get("params") or {}
            name = params.get("name", "")
            arguments = params.get("arguments") or {}
            try:
                upstream = srv.dispatch(name, arguments)
                write({"jsonrpc": "2.0", "id": rid, "result": _tool_result(upstream)})
            except Exception as e:
                write(
                    {
                        "jsonrpc": "2.0",
                        "id": rid,
                        "error": {"code": -32000, "message": str(e)},
                    }
                )
            continue
        if rid is not None:
            write({"jsonrpc": "2.0", "id": rid, "result": {}})


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "command",
        nargs="?",
        default="serve",
        choices=["serve", "list-tools", "status", "call"],
    )
    parser.add_argument("args", nargs="*", help="arguments for call")
    ns = parser.parse_args()
    if ns.command == "serve":
        cmd_serve(ns.args)
    elif ns.command == "list-tools":
        cmd_list_tools(ns.args)
    elif ns.command == "status":
        cmd_status(ns.args)
    elif ns.command == "call":
        cmd_call(ns.args)


if __name__ == "__main__":
    main()
