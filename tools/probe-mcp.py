#!/usr/bin/env python3
"""probe-mcp — unified passthrough for EVERY Chrome DevTools + TinyFish MCP tool.

Cloud / Cursor sessions often lack `mcp__chrome-devtools__*` and
`mcp__tinyfish__*` in the tool catalog (stdio list is fixed at session start).
This bridge exposes the full upstream catalogs under stable prefixes so one
entry (`.mcp.json` → `probe`) or one CLI covers both backends:

  chrome_<tool>     → tools/chrome-devtools-mcp.sh  (stdio, SwiftShader)
  tinyfish_<tool>   → tools/tinyfish-mcp.sh ensure + http://127.0.0.1:3711/mcp

CLI (no MCP host required):
  python3 tools/probe-mcp.py help
  python3 tools/probe-mcp.py status
  python3 tools/probe-mcp.py list-tools
  python3 tools/probe-mcp.py call chrome_navigate_page '{"url":"http://127.0.0.1:3456/"}'
  python3 tools/probe-mcp.py call tinyfish_fetch_content \\
      '{"urls":["https://brycejmurrin.github.io/f1-game/version.json"]}'
  python3 tools/probe-mcp.py serve          # stdio MCP for Cursor (.mcp.json)

Mock catalog (unit tests / offline): PROBE_MCP_MOCK=1 python3 tools/probe-mcp.py serve

See .claude/skills/mcp-probe — park chrome to about:blank before Playwright;
never render while test-bg.mjs is running.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
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

# Frozen catalogs for PROBE_MCP_MOCK=1 (measured 2026-08-17 on this box).
MOCK_CHROME = [
    "click", "close_heapsnapshot", "close_page", "compare_heapsnapshots", "drag",
    "emulate", "evaluate_script", "fill", "fill_form", "get_console_message",
    "get_heapsnapshot_class_nodes", "get_heapsnapshot_details",
    "get_heapsnapshot_dominators", "get_heapsnapshot_duplicate_strings",
    "get_heapsnapshot_edges", "get_heapsnapshot_object_details",
    "get_heapsnapshot_retainers", "get_heapsnapshot_retaining_paths",
    "get_heapsnapshot_summary", "get_network_request", "handle_dialog", "hover",
    "lighthouse_audit", "list_console_messages", "list_network_requests",
    "list_pages", "navigate_page", "new_page", "performance_analyze_insight",
    "performance_start_trace", "performance_stop_trace", "press_key",
    "resize_page", "select_page", "take_heapsnapshot", "take_screenshot",
    "take_snapshot", "type_text", "upload_file", "wait_for",
]
MOCK_TINYFISH = [
    "search", "fetch_content", "guide_next_step", "run_web_automation",
    "run_web_automation_async", "create_browser_session", "get_run", "list_runs",
    "cancel_run", "batch_status", "batch_cancel", "get_search_usage",
    "list_browser_sessions", "close_browser_session", "list_fetch_usage",
    "get_wallet",
]


def _mock() -> bool:
    return os.environ.get("PROBE_MCP_MOCK", "").strip() not in ("", "0", "false", "no")


def route(name: str) -> tuple[str, str]:
    """Return (backend, upstream_tool_name) for a prefixed tool name."""
    if name.startswith(CHROME_PREFIX):
        return "chrome", name[len(CHROME_PREFIX) :]
    if name.startswith(TINYFISH_PREFIX):
        return "tinyfish", name[len(TINYFISH_PREFIX) :]
    raise ValueError(
        f"tool name must start with {CHROME_PREFIX!r} or {TINYFISH_PREFIX!r} "
        f"(got {name!r})"
    )


def _load_cdmcp():
    spec = importlib.util.spec_from_file_location(
        "cdmcp_cli", ROOT / "tools" / "cdmcp-cli.py"
    )
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class ChromeBackend:
    def __init__(self) -> None:
        self._client = None
        self._tools: list[dict[str, Any]] = []

    def ensure(self) -> None:
        if _mock():
            self._tools = [
                {"name": n, "description": f"mock chrome {n}", "inputSchema": {"type": "object"}}
                for n in MOCK_CHROME
            ]
            return
        if self._client is not None:
            return
        mod = _load_cdmcp()
        self._client = mod.McpClient()
        self._client.start()
        raw = self._client._request("tools/list")  # noqa: SLF001
        self._tools = list(raw.get("tools") or [])

    def tools(self) -> list[dict[str, Any]]:
        self.ensure()
        return self._tools

    def call(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        self.ensure()
        if _mock():
            return {
                "content": [
                    {"type": "text", "text": json.dumps({"ok": True, "mock": True, "tool": name})}
                ]
            }
        assert self._client is not None
        return self._client.call(name, arguments)

    def close(self) -> None:
        if self._client is not None:
            self._client.close()
            self._client = None


class TinyfishBackend:
    def __init__(self) -> None:
        self._session = ""
        self._tools: list[dict[str, Any]] = []

    def _ensure_proxy(self) -> None:
        if _mock():
            return
        r = subprocess.run(
            [str(TINYFISH_SH), "ensure"],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            timeout=120,
        )
        if r.returncode != 0:
            raise RuntimeError(
                f"tinyfish ensure failed ({r.returncode}): {r.stderr or r.stdout}"
            )
        if TINYFISH_STATE.is_file():
            self._session = TINYFISH_STATE.read_text().strip()

    def _post(self, body: dict[str, Any], *, allow_empty: bool = False) -> dict[str, Any] | None:
        data = json.dumps(body).encode()
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "MCP-Protocol-Version": TINYFISH_PROTO,
        }
        if self._session:
            headers["Mcp-Session-Id"] = self._session
        req = urllib.request.Request(TINYFISH_MCP, data=data, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                sid = resp.headers.get("Mcp-Session-Id") or resp.headers.get("mcp-session-id")
                if sid:
                    self._session = sid.strip()
                    TINYFISH_STATE.parent.mkdir(parents=True, exist_ok=True)
                    TINYFISH_STATE.write_text(self._session)
                raw = resp.read().decode()
        except urllib.error.HTTPError as e:
            raw = e.read().decode() if e.fp else ""
            if not raw and allow_empty and 200 <= e.code < 300:
                return None
            raise RuntimeError(f"tinyfish HTTP {e.code}: {raw[:500]}") from e
        if not raw:
            if allow_empty:
                return None
            raise RuntimeError("tinyfish empty response")
        if raw.startswith("data:"):
            raw = raw.split("\n", 1)[0][5:].strip()
        return json.loads(raw)

    def ensure(self) -> None:
        if _mock():
            self._tools = [
                {
                    "name": n,
                    "description": f"mock tinyfish {n}",
                    "inputSchema": {"type": "object"},
                }
                for n in MOCK_TINYFISH
            ]
            return
        if self._tools:
            return
        self._ensure_proxy()
        # Fresh initialize for this Python client (shell may own another session).
        self._session = ""
        if TINYFISH_STATE.is_file():
            TINYFISH_STATE.unlink()
        init = self._post(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": TINYFISH_PROTO,
                    "capabilities": {},
                    "clientInfo": {"name": "probe-mcp", "version": "1"},
                },
            }
        )
        assert init is not None
        self._post({"jsonrpc": "2.0", "method": "notifications/initialized"}, allow_empty=True)
        listed = self._post(
            {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}
        )
        assert listed is not None
        self._tools = list((listed.get("result") or {}).get("tools") or [])

    def tools(self) -> list[dict[str, Any]]:
        self.ensure()
        return self._tools

    def call(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        self.ensure()
        if _mock():
            return {
                "content": [
                    {"type": "text", "text": json.dumps({"ok": True, "mock": True, "tool": name})}
                ]
            }
        resp = self._post(
            {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {"name": name, "arguments": arguments},
            }
        )
        assert resp is not None
        if "error" in resp:
            raise RuntimeError(json.dumps(resp["error"]))
        return resp.get("result") or resp


def prefix_tools(backend: str, tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    pref = CHROME_PREFIX if backend == "chrome" else TINYFISH_PREFIX
    out: list[dict[str, Any]] = []
    for t in tools:
        cloned = dict(t)
        name = t.get("name") or ""
        cloned["name"] = f"{pref}{name}"
        desc = t.get("description") or name
        cloned["description"] = f"[{backend}] {desc}"
        out.append(cloned)
    return out


class Bridge:
    def __init__(self) -> None:
        self.chrome = ChromeBackend()
        self.tinyfish = TinyfishBackend()

    def all_tools(self) -> list[dict[str, Any]]:
        chrome = prefix_tools("chrome", self.chrome.tools())
        tiny = prefix_tools("tinyfish", self.tinyfish.tools())
        return chrome + tiny

    def call(self, name: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
        backend, tool = route(name)
        args = arguments or {}
        if backend == "chrome":
            return self.chrome.call(tool, args)
        return self.tinyfish.call(tool, args)

    def close(self) -> None:
        self.chrome.close()


def cmd_help(_: argparse.Namespace) -> int:
    print(
        __doc__
        or "",
    )
    print(
        """Commands:
  help                 this text
  status               chrome wrapper + tinyfish healthz
  route <prefixed>     show backend + upstream tool name
  list-tools           every chrome_* and tinyfish_* tool
  call <name> '<json>' invoke one prefixed tool
  serve                stdio MCP server (Cursor .mcp.json entry)
"""
    )
    return 0


def cmd_route(args: argparse.Namespace) -> int:
    try:
        backend, tool = route(args.name)
    except ValueError as e:
        print(str(e), file=sys.stderr)
        return 1
    print(f"backend={backend} tool={tool}")
    return 0


def cmd_status(_: argparse.Namespace) -> int:
    # Chrome: wrapper status (no browser launch).
    r = subprocess.run(
        [str(ROOT / "tools" / "chrome-devtools-mcp.sh"), "status"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
    )
    print("=== chrome-devtools ===")
    print((r.stdout or r.stderr).rstrip() or f"exit {r.returncode}")
    print("=== tinyfish ===")
    t = subprocess.run(
        [str(TINYFISH_SH), "status"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
    )
    print((t.stdout or t.stderr).rstrip() or f"exit {t.returncode}")
    return 0 if r.returncode == 0 and t.returncode == 0 else 1


def cmd_list_tools(_: argparse.Namespace) -> int:
    bridge = Bridge()
    try:
        tools = bridge.all_tools()
        chrome_n = sum(1 for t in tools if t["name"].startswith(CHROME_PREFIX))
        tiny_n = sum(1 for t in tools if t["name"].startswith(TINYFISH_PREFIX))
        print(f"tools: {len(tools)} (chrome {chrome_n}, tinyfish {tiny_n})")
        for t in tools:
            print(f"  - {t['name']}")
    finally:
        bridge.close()
    return 0


def cmd_call(args: argparse.Namespace) -> int:
    try:
        route(args.name)
    except ValueError as e:
        print(str(e), file=sys.stderr)
        return 1
    arguments = json.loads(args.args_json) if args.args_json else {}
    if not isinstance(arguments, dict):
        print("arguments must be a JSON object", file=sys.stderr)
        return 1
    bridge = Bridge()
    try:
        result = bridge.call(args.name, arguments)
        print(json.dumps(result, indent=2, sort_keys=True)[:12000])
    finally:
        bridge.close()
    return 0


def _write(msg: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(msg, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def cmd_serve(_: argparse.Namespace) -> int:
    """Hand-rolled stdio MCP — no Python MCP SDK required."""
    bridge = Bridge()
    try:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue
            mid = msg.get("id")
            method = msg.get("method")
            if method is None:
                continue
            # Notifications (no id) — ignore after initialized.
            if mid is None:
                continue
            if method == "initialize":
                _write(
                    {
                        "jsonrpc": "2.0",
                        "id": mid,
                        "result": {
                            "protocolVersion": PROTOCOL,
                            "capabilities": {"tools": {"listChanged": False}},
                            "serverInfo": {"name": "probe-mcp", "version": "1.0.0"},
                            "instructions": (
                                "Unified Apex probe MCP. Prefer chrome_* for the local "
                                "working tree (WebGL/SwiftShader) and tinyfish_* for "
                                "public/deployed URLs. Park chrome to about:blank before "
                                "Playwright. Use tools/tinyfish-mcp.sh deploy-check for "
                                "live vs local version.json."
                            ),
                        },
                    }
                )
            elif method == "tools/list":
                tools = bridge.all_tools()
                _write({"jsonrpc": "2.0", "id": mid, "result": {"tools": tools}})
            elif method == "tools/call":
                params = msg.get("params") or {}
                name = params.get("name") or ""
                arguments = params.get("arguments") or {}
                try:
                    result = bridge.call(name, arguments)
                    _write({"jsonrpc": "2.0", "id": mid, "result": result})
                except Exception as e:  # noqa: BLE001 — surface to MCP client
                    _write(
                        {
                            "jsonrpc": "2.0",
                            "id": mid,
                            "error": {"code": -32000, "message": str(e)[:2000]},
                        }
                    )
            elif method == "ping":
                _write({"jsonrpc": "2.0", "id": mid, "result": {}})
            else:
                _write(
                    {
                        "jsonrpc": "2.0",
                        "id": mid,
                        "error": {"code": -32601, "message": f"Method not found: {method}"},
                    }
                )
    finally:
        bridge.close()
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Unified Chrome DevTools + TinyFish MCP bridge",
        add_help=False,
    )
    sub = ap.add_subparsers(dest="cmd")

    p_help = sub.add_parser("help", add_help=False)
    p_help.set_defaults(func=cmd_help)

    p_status = sub.add_parser("status", add_help=False)
    p_status.set_defaults(func=cmd_status)

    p_route = sub.add_parser("route", add_help=False)
    p_route.add_argument("name")
    p_route.set_defaults(func=cmd_route)

    p_list = sub.add_parser("list-tools", add_help=False)
    p_list.set_defaults(func=cmd_list_tools)

    p_call = sub.add_parser("call", add_help=False)
    p_call.add_argument("name")
    p_call.add_argument("args_json", nargs="?", default="{}")
    p_call.set_defaults(func=cmd_call)

    p_serve = sub.add_parser("serve", add_help=False)
    p_serve.set_defaults(func=cmd_serve)

    args = ap.parse_args()
    if not args.cmd:
        return cmd_help(args)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
