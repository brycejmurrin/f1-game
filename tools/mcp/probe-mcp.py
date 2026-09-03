#!/usr/bin/env python3
# @doc Passthrough for every Chrome DevTools + TinyFish MCP tool (`chrome_*` / `tinyfish_*`): list-tools / call / serve.
# @skill mcp-probe
"""probe-mcp — unified CLI passthrough for EVERY Chrome DevTools + TinyFish MCP tool.

NOT MCP-ATTACHED (removed from .mcp.json / .cursor/mcp.json 2026-09). The
attached servers are apex-tools, playwright-official and chrome-devtools; this
file stays a CLI because its `chrome-start` daemon + `call` auto-routing has no
equivalent elsewhere. The tinyfish_* half cannot work in this container (egress
blocks agent.tinyfish.ai) — live Pages checks go through the deploy-research
subagent (host fetch / WebFetch). `serve` still speaks stdio MCP for a host
with egress that wants to attach it by hand. Prefixes:

  chrome_<tool>     → tools/mcp/chrome-devtools-mcp.sh  (stdio, SwiftShader)
  tinyfish_<tool>   → tools/mcp/tinyfish-mcp.sh ensure + http://127.0.0.1:3711/mcp

CLI (no MCP host required):
  python3 tools/mcp/probe-mcp.py help
  python3 tools/mcp/probe-mcp.py status
  python3 tools/mcp/probe-mcp.py list-tools
  python3 tools/mcp/probe-mcp.py call chrome_navigate_page '{"url":"http://127.0.0.1:3456/"}'
  python3 tools/mcp/probe-mcp.py call tinyfish_fetch_content \\
      '{"urls":["https://brycejmurrin.github.io/f1-game/version.json"]}'
  python3 tools/mcp/probe-mcp.py serve          # stdio MCP (NOT wired in .mcp.json; opt-in)

A bare `call` spawns a FRESH Chromium per invocation — state does not survive
between calls (measured 2026-08-17: navigate_page in one call, list_pages in
the next reads `about:blank`). Any multi-step chrome flow (navigate →
evaluate → screenshot) needs the persistent daemon; `call` auto-routes to it
whenever it is up:

  python3 tools/mcp/probe-mcp.py chrome-start   # one browser in tmux, port 3712
  python3 tools/mcp/probe-mcp.py call chrome_navigate_page '{"url":"http://127.0.0.1:3456/"}'
  python3 tools/mcp/probe-mcp.py call chrome_evaluate_script '{"function":"() => 1"}'
  python3 tools/mcp/probe-mcp.py chrome-stop    # ALWAYS stop before test-bg.mjs

Mock catalog (unit tests / offline): PROBE_MCP_MOCK=1 python3 tools/mcp/probe-mcp.py serve

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

ROOT = Path(__file__).resolve().parent.parent.parent
CHROME_DAEMON_PORT = int(os.environ.get("PROBE_CHROME_PORT", "3712"))
CHROME_DAEMON_STATE = ROOT / "scratch" / "probe-chrome-daemon.port"
CHROME_DAEMON_SESSION = "probe-chrome"
TINYFISH_SH = ROOT / "tools" / "mcp" / "tinyfish-mcp.sh"
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


def _mock_tool_result(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    """Return an MCP-shaped tool result, including the error path tests need."""
    failed = arguments.get("__probeMockError") is True
    result: dict[str, Any] = {
        "content": [
            {
                "type": "text",
                "text": json.dumps(
                    {"ok": not failed, "mock": True, "tool": name,
                     **({"error": "mock tool failure"} if failed else {})}
                ),
            }
        ]
    }
    if failed:
        result["isError"] = True
    return result


def daemon_port() -> int | None:
    """Port of a LIVE chrome daemon, else None. Env wins, then the state file,
    then the default — each candidate is health-checked, never trusted."""
    candidates: list[int] = []
    env = os.environ.get("PROBE_CHROME_PORT", "").strip()
    if env.isdigit():
        candidates.append(int(env))
    if CHROME_DAEMON_STATE.is_file():
        text = CHROME_DAEMON_STATE.read_text().strip()
        if text.isdigit():
            candidates.append(int(text))
    candidates.append(3712)
    for port in dict.fromkeys(candidates):
        try:
            with urllib.request.urlopen(
                f"http://127.0.0.1:{port}/healthz", timeout=0.5
            ) as resp:
                if resp.status == 200:
                    return port
        except Exception:  # noqa: BLE001 — any failure means "not this port"
            continue
    return None


def _daemon_get(port: int, path: str) -> dict[str, Any]:
    with urllib.request.urlopen(f"http://127.0.0.1:{port}{path}", timeout=90) as resp:
        return json.loads(resp.read().decode())


def _daemon_post(port: int, path: str, body: dict[str, Any]) -> dict[str, Any]:
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        raw = e.read().decode() if e.fp else ""
        try:
            detail = json.loads(raw).get("error", raw)
        except (json.JSONDecodeError, AttributeError):
            detail = raw
        raise RuntimeError(f"chrome daemon HTTP {e.code}: {str(detail)[:2000]}") from e


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
        "cdmcp_cli", ROOT / "tools" / "mcp" / "cdmcp-cli.py"
    )
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class ChromeBackend:
    """One Chromium, three transports: mock (tests), a live daemon when one is
    up (state survives across CLI invocations), else an OWN spawn that dies
    with this process (a bare `call` gets a fresh browser every time)."""

    def __init__(self, *, use_daemon: bool = True) -> None:
        self._client = None
        self._tools: list[dict[str, Any]] = []
        self._use_daemon = use_daemon
        self._daemon: int | None = None
        self._probed = False

    def _find_daemon(self) -> int | None:
        # Lazy: a tinyfish-only invocation must not pay the health probe.
        if not self._probed:
            self._probed = True
            if self._use_daemon and not _mock():
                self._daemon = daemon_port()
                if self._daemon:
                    print(f"# chrome via daemon :{self._daemon}", file=sys.stderr)
        return self._daemon

    def ensure(self) -> None:
        if _mock():
            self._tools = [
                {"name": n, "description": f"mock chrome {n}", "inputSchema": {"type": "object"}}
                for n in MOCK_CHROME
            ]
            return
        if self._find_daemon() is not None:
            if not self._tools:
                self._tools = list(_daemon_get(self._daemon, "/tools").get("tools") or [])
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
            return _mock_tool_result(name, arguments)
        if self._daemon is not None:
            return _daemon_post(self._daemon, "/call", {"name": name, "arguments": arguments})
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
            # Upstream wraps refusals as JSON-RPC errors inside HTTP 400 —
            # surface the human message, not the transport wrapper.
            msg = ""
            try:
                msg = (json.loads(raw).get("error") or {}).get("message") or ""
            except (json.JSONDecodeError, AttributeError):
                pass
            if msg:
                raise RuntimeError(f"tinyfish: {msg}") from e
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
            return _mock_tool_result(name, arguments)
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


def _static_catalog(backend: str) -> list[dict[str, Any]]:
    """Frozen names so tools/list never returns empty.

    Cloud hosts call tools/list ONCE at session start (capabilities.tools.listChanged
    is False). If either backend's ensure() throws — tinyfish not built, chrome
    wrapper missing — the host caches an empty catalog for the whole session.
    Measured 2026-08-17: apex-wrap advertised 0 tools while the CLI list-tools
    traceback was `tinyfish ensure failed: Missing build at scratch/tinyfish-mcp-server`.
    The MOCK_* lists are the measured upstream names; advertising them statically
    lets the host route chrome_* / tinyfish_* even when the backend is down.
    `call` still ensure()s and fails with a useful error.
    """
    names = MOCK_CHROME if backend == "chrome" else MOCK_TINYFISH
    return [
        {
            "name": n,
            "description": f"{backend} {n} (static catalog — live backend unavailable at list time)",
            "inputSchema": {"type": "object"},
        }
        for n in names
    ]


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
        # Hosts call tools/list ONCE at session start. Never spawn Chromium
        # or `tinyfish ensure` here — Cursor times out live discovery and
        # caches an empty catalog (measured 2026-08-18: project-0-f1-game-probe
        # serverStatus error). Mock still lists via ensure(); call() still
        # ensure()s the live backend. FAIL_BACKENDS keeps the throw-fallback
        # path covered by tests.
        out: list[dict[str, Any]] = []
        fail_all = os.environ.get("PROBE_MCP_FAIL_BACKENDS", "").strip() not in ("", "0", "false", "no")
        if _mock() and not fail_all:
            for backend, getter in (("chrome", self.chrome.tools), ("tinyfish", self.tinyfish.tools)):
                out.extend(prefix_tools(backend, getter()))
            return out
        for backend in ("chrome", "tinyfish"):
            if fail_all:
                print(f"# {backend} tools() skipped (PROBE_MCP_FAIL_BACKENDS)", file=sys.stderr)
            out.extend(prefix_tools(backend, _static_catalog(backend)))
        return out

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
  status               chrome wrapper + tinyfish healthz + chrome daemon
  route <prefixed>     show backend + upstream tool name
  list-tools           every chrome_* and tinyfish_* tool
  call <name> '<json>' invoke one prefixed tool (auto-routes to the daemon)
  chrome-start         persistent Chromium daemon in tmux (state survives calls)
  chrome-stop          stop it — ALWAYS before test-bg.mjs / Playwright
  chrome-daemon        the daemon itself, foreground (chrome-start runs this)
  serve                stdio MCP server (not in .mcp.json since 2026-09; opt-in only)
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
        [str(ROOT / "tools" / "mcp" / "chrome-devtools-mcp.sh"), "status"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
    )
    print("=== chrome-devtools ===")
    print((r.stdout or r.stderr).rstrip() or f"exit {r.returncode}")
    print("=== chrome daemon ===")
    port = daemon_port()
    print(f"UP  127.0.0.1:{port} (calls share one browser)" if port
          else "DOWN (per-call spawn; chrome-start for a persistent browser)")
    print("=== tinyfish ===")
    t = subprocess.run(
        [str(TINYFISH_SH), "status"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
    )
    print((t.stdout or t.stderr).rstrip() or f"exit {t.returncode}")
    if t.returncode != 0:
        print("WARN: tinyfish DOWN — run tools/mcp/tinyfish-mcp.sh ensure", file=sys.stderr)
    # Chrome wrapper status is enough for Cloud `probe status` to be usable
    # before tinyfish setup. TinyFish DOWN is a warning, not a hard fail.
    return 0 if r.returncode == 0 else 1


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
        try:
            result = bridge.call(args.name, arguments)
        except Exception as e:  # noqa: BLE001 — a traceback buries the upstream message
            print(f"error: {e}", file=sys.stderr)
            return 1
        failed = result.get("isError") is True
        text = json.dumps(result, indent=2, sort_keys=True)
        full = os.environ.get("PROBE_MCP_FULL", "").strip() not in ("", "0")
        if full or len(text) <= 12000:
            print(text)
        else:
            # A silent cut reads as a complete answer — say what is missing.
            print(text[:12000])
            print(
                f"# … truncated {len(text) - 12000} of {len(text)} bytes — "
                "set PROBE_MCP_FULL=1 for everything",
                file=sys.stderr,
            )
    finally:
        bridge.close()
    return 1 if failed else 0


def _tmux(*args: str) -> subprocess.CompletedProcess:
    conf = Path("/exec-daemon/tmux.portal.conf")
    base = ["tmux", "-f", str(conf)] if conf.is_file() else ["tmux"]
    return subprocess.run([*base, *args], capture_output=True, text=True)


def cmd_chrome_daemon(args: argparse.Namespace) -> int:
    """Foreground HTTP wrapper around ONE Chromium MCP client (127.0.0.1 only).
    `call`/`list-tools` auto-route chrome_* here whenever /healthz answers, so
    page state survives across CLI invocations — the one thing a per-call
    spawn can never give. Normally run inside tmux via chrome-start."""
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    backend = ChromeBackend(use_daemon=False)
    backend.ensure()  # launch upstream now, so healthz means "browser is up"

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_a: Any) -> None:  # keep the tmux pane readable
            pass

        def _send(self, code: int, obj: dict[str, Any]) -> None:
            data = json.dumps(obj).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self) -> None:  # noqa: N802 — http.server API
            if self.path == "/healthz":
                self._send(200, {"ok": True, "mock": _mock()})
            elif self.path == "/tools":
                self._send(200, {"tools": backend.tools()})
            else:
                self._send(404, {"error": f"no route {self.path}"})

        def do_POST(self) -> None:  # noqa: N802 — http.server API
            if self.path != "/call":
                self._send(404, {"error": f"no route {self.path}"})
                return
            n = int(self.headers.get("Content-Length") or 0)
            try:
                body = json.loads(self.rfile.read(n) or b"{}")
            except json.JSONDecodeError:
                self._send(400, {"error": "body must be JSON"})
                return
            name = str(body.get("name") or "")
            if name.startswith(CHROME_PREFIX):
                name = name[len(CHROME_PREFIX) :]
            try:
                self._send(200, backend.call(name, body.get("arguments") or {}))
            except Exception as e:  # noqa: BLE001 — surface to the caller
                self._send(500, {"error": str(e)[:2000]})

    srv = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    port = srv.server_address[1]
    CHROME_DAEMON_STATE.parent.mkdir(parents=True, exist_ok=True)
    CHROME_DAEMON_STATE.write_text(str(port))
    print(f"probe-chrome daemon listening on 127.0.0.1:{port}", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        backend.close()
        if CHROME_DAEMON_STATE.is_file():
            CHROME_DAEMON_STATE.unlink()
    return 0


def cmd_chrome_start(args: argparse.Namespace) -> int:
    port = daemon_port()
    if port is not None:
        print(f"already running on 127.0.0.1:{port}")
        return 0
    _tmux("kill-session", "-t", CHROME_DAEMON_SESSION)
    r = _tmux(
        "new-session", "-d", "-s", CHROME_DAEMON_SESSION, "-c", str(ROOT),
        "python3", "tools/mcp/probe-mcp.py", "chrome-daemon", "--port", str(args.port),
    )
    if r.returncode != 0:
        print(f"tmux failed: {r.stderr.strip()}", file=sys.stderr)
        return 1
    import time

    # First run may npx-download the MCP server before Chromium even launches.
    for _ in range(240):
        time.sleep(0.5)
        port = daemon_port()
        if port is not None:
            print(f"probe-chrome daemon up on 127.0.0.1:{port}")
            print("REMEMBER: `chrome-stop` before any test-bg.mjs run — a live "
                  "MCP browser starves Playwright (see .claude/skills/mcp-probe).")
            return 0
    print("daemon did not come up — tmux pane:", file=sys.stderr)
    print(_tmux("capture-pane", "-t", f"{CHROME_DAEMON_SESSION}:0.0", "-p").stdout,
          file=sys.stderr)
    return 1


def cmd_chrome_stop(_: argparse.Namespace) -> int:
    _tmux("kill-session", "-t", CHROME_DAEMON_SESSION)
    if CHROME_DAEMON_STATE.is_file():
        CHROME_DAEMON_STATE.unlink()
    print("stopped (if it was running)")
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
                                "Apex probe bridge (CLI-first; not in .mcp.json since 2026-09). "
                                "chrome_* drives the local working tree (WebGL/SwiftShader). "
                                "tinyfish_* needs egress to agent.tinyfish.ai, which the "
                                "container blocks — live version.json / public web is the "
                                "deploy-research subagent (host fetch). Park chrome to "
                                "about:blank before Playwright."
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

    p_daemon = sub.add_parser("chrome-daemon", add_help=False)
    p_daemon.add_argument("--port", type=int, default=CHROME_DAEMON_PORT)
    p_daemon.set_defaults(func=cmd_chrome_daemon)

    p_cstart = sub.add_parser("chrome-start", add_help=False)
    p_cstart.add_argument("--port", type=int, default=CHROME_DAEMON_PORT)
    p_cstart.set_defaults(func=cmd_chrome_start)

    p_cstop = sub.add_parser("chrome-stop", add_help=False)
    p_cstop.set_defaults(func=cmd_chrome_stop)

    p_serve = sub.add_parser("serve", add_help=False)
    p_serve.set_defaults(func=cmd_serve)

    args = ap.parse_args()
    if not args.cmd:
        return cmd_help(args)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
