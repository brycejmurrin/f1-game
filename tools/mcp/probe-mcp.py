#!/usr/bin/env python3
# @doc Passthrough for every Chrome DevTools MCP tool (`chrome_*`): list-tools / call / serve, plus the chrome daemon.
# @skill mcp-probe
"""probe-mcp — CLI passthrough for EVERY Chrome DevTools MCP tool.

NOT MCP-ATTACHED (removed from .mcp.json / .cursor/mcp.json 2026-09). The
attached servers are apex-tools, playwright-official and chrome-devtools; this
file stays a CLI because its `chrome-start` daemon + `call` auto-routing has no
equivalent elsewhere. The tinyfish_* half left on 2026-11-03 with
tools/mcp/tinyfish-mcp.sh (container egress blocked agent.tinyfish.ai, so it
never answered here) — live Pages checks go through the deploy-research
subagent (host fetch / WebFetch). `serve` still speaks stdio MCP for a host
that wants to attach it by hand. Prefix:

  chrome_<tool>     → tools/mcp/chrome-devtools-mcp.sh  (stdio, SwiftShader)

CLI (no MCP host required):
  python3 tools/mcp/probe-mcp.py help
  python3 tools/mcp/probe-mcp.py status
  python3 tools/mcp/probe-mcp.py list-tools
  python3 tools/mcp/probe-mcp.py call chrome_navigate_page '{"url":"http://127.0.0.1:3456/"}'
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
import hashlib
import importlib.util
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent.parent
CHROME_DAEMON_PORT = os.environ.get("PROBE_CHROME_PORT", "3712")
CHROME_DAEMON_STATE = ROOT / "scratch" / "probe-chrome-daemon.port"
CHROME_DAEMON_ID = hashlib.sha256(str(ROOT).encode()).hexdigest()[:16]
CHROME_DAEMON_SESSION = f"probe-chrome-{CHROME_DAEMON_ID}"
CHROME_PREFIX = "chrome_"
PROTOCOL = "2025-06-18"

# Frozen catalog for PROBE_MCP_MOCK=1 (measured 2026-08-17 on this box).
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

# Page creation/enumeration never needs an injected target. Other tools may
# use the selected page implicitly (pinned 1.7) or declare pageId explicitly;
# tools/list inputSchema, rather than a version assumption, decides injection.
PAGE_ID_OPTIONAL = frozenset({"list_pages", "new_page"})


def _page_lines(text: str) -> list[tuple[int, bool]]:
    """Parse `## Pages` lines: (id, selected)."""
    out: list[tuple[int, bool]] = []
    for line in text.splitlines():
        m = re.match(r"^(\d+):", line.strip())
        if m:
            out.append((int(m.group(1)), "[selected]" in line))
    return out


def _selected_page_id_from_result(result: dict[str, Any]) -> int | None:
    for block in result.get("content") or []:
        if block.get("type") != "text":
            continue
        lines = _page_lines(str(block.get("text") or ""))
        for page_id, selected in lines:
            if selected:
                return page_id
        if lines:
            return lines[-1][0]
    return None


def _normalize_chrome_args(tool: str, arguments: dict[str, Any]) -> dict[str, Any]:
    args = dict(arguments)
    if tool == "navigate_page" and "url" in args and "type" not in args:
        args["type"] = "url"
    return args


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
    try:
        text = CHROME_DAEMON_STATE.read_text().strip()
        if text.isdigit():
            candidates.append(int(text))
    except OSError:
        pass
    candidates.append(3712)
    for port in dict.fromkeys(candidates):
        if not 1 <= port <= 65535:
            continue
        try:
            with urllib.request.urlopen(
                f"http://127.0.0.1:{port}/healthz", timeout=0.5
            ) as resp:
                health = json.loads(resp.read(8192))
                if (resp.status == 200 and health.get("ok") is True
                        and health.get("service") == "apex-probe-chrome"
                        and health.get("rootId") == CHROME_DAEMON_ID):
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
    raise ValueError(
        f"tool name must start with {CHROME_PREFIX!r} (got {name!r}); "
        "tinyfish_* left on 2026-11-03 — live web goes through deploy-research"
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
        self._selected_page_id: int | None = None

    def _find_daemon(self) -> int | None:
        # Lazy: list-tools and route must not pay the health probe.
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

    def _invoke(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        if self._daemon is not None:
            return _daemon_post(self._daemon, "/call", {"name": name, "arguments": arguments})
        assert self._client is not None
        return self._client.call(name, arguments)

    def call(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        self.ensure()
        if _mock():
            return _mock_tool_result(name, arguments)
        args = _normalize_chrome_args(name, arguments)
        schema = next((t.get("inputSchema") or {} for t in self._tools if t.get("name") == name), {})
        supports_page_id = "pageId" in (schema.get("properties") or {})
        if supports_page_id and name not in PAGE_ID_OPTIONAL and "pageId" not in args:
            page_id = self._selected_page_id
            if page_id is None:
                listed = self._invoke("list_pages", {})
                page_id = _selected_page_id_from_result(listed)
                if page_id is not None:
                    self._selected_page_id = page_id
            if page_id is not None:
                args["pageId"] = page_id
        result = self._invoke(name, args)
        if name in ("list_pages", "new_page"):
            page_id = _selected_page_id_from_result(result)
            if page_id is not None:
                self._selected_page_id = page_id
        elif name == "select_page" and "pageId" in args:
            self._selected_page_id = int(args["pageId"])
        elif name == "close_page" and "pageId" in args and self._selected_page_id == args["pageId"]:
            self._selected_page_id = None
        return result

    def close(self) -> None:
        if self._client is not None:
            self._client.close()
            self._client = None


def _static_catalog(backend: str) -> list[dict[str, Any]]:
    """Frozen names so tools/list never returns empty.

    Cloud hosts call tools/list ONCE at session start (capabilities.tools.listChanged
    is False). If the backend's ensure() throws — chrome wrapper missing — the host
    caches an empty catalog for the whole session. Measured 2026-08-17: apex-wrap
    advertised 0 tools while the CLI list-tools traceback was a backend ensure failure.
    MOCK_CHROME holds the measured upstream names; advertising them statically lets
    the host route chrome_* even when the backend is down. `call` still ensure()s
    and fails with a useful error.
    """
    names = MOCK_CHROME
    return [
        {
            "name": n,
            "description": f"{backend} {n} (static catalog — live backend unavailable at list time)",
            "inputSchema": {"type": "object"},
        }
        for n in names
    ]


def prefix_tools(backend: str, tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    pref = CHROME_PREFIX
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

    def all_tools(self) -> list[dict[str, Any]]:
        # Hosts call tools/list ONCE at session start. Never spawn Chromium
        # here — Cursor times out live discovery and caches an empty catalog
        # (measured 2026-08-18: project-0-f1-game-probe serverStatus error).
        # Mock still lists via ensure(); call() still ensure()s the live
        # backend. FAIL_BACKENDS keeps the throw-fallback path covered by tests.
        fail_all = os.environ.get("PROBE_MCP_FAIL_BACKENDS", "").strip() not in ("", "0", "false", "no")
        if _mock() and not fail_all:
            return prefix_tools("chrome", self.chrome.tools())
        if fail_all:
            print("# chrome tools() skipped (PROBE_MCP_FAIL_BACKENDS)", file=sys.stderr)
        return prefix_tools("chrome", _static_catalog("chrome"))

    def call(self, name: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
        _backend, tool = route(name)
        return self.chrome.call(tool, arguments or {})

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
  status               chrome wrapper + chrome daemon
  route <prefixed>     show backend + upstream tool name
  list-tools           every chrome_* tool
  call <name> '<json>' invoke one prefixed tool (auto-routes to the daemon)
  chrome-start         persistent Chromium daemon in tmux (state survives calls);
                       refused while a Playwright run is live here (--force overrides)
  chrome-stop          stop it — test-bg.mjs refuses a browser group while it is up
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
    # The chrome wrapper's status is the verdict; the daemon line is informational.
    return 0 if r.returncode == 0 else 1


def cmd_list_tools(_: argparse.Namespace) -> int:
    bridge = Bridge()
    try:
        tools = bridge.all_tools()
        print(f"tools: {len(tools)} (chrome)")
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
            # Retain the original before returning a valid, bounded JSON preview.
            parent = ROOT / "artifacts" / "probe-mcp"
            parent.mkdir(parents=True, exist_ok=True)
            directory = Path(tempfile.mkdtemp(prefix="result-", dir=parent))
            artifact = directory / "result.json"
            with artifact.open("x", encoding="utf-8") as retained:
                artifact.chmod(0o600)
                retained.write(text + "\n")
            print(json.dumps({
                "truncated": True, "isError": failed,
                "originalCharacters": len(text), "artifact": str(artifact),
                "preview": text[:2000],
                "note": "Read artifact for the original result; PROBE_MCP_FULL=1 prints full future calls.",
            }, indent=2))

    finally:
        bridge.close()
    return 1 if failed else 0


def _tmux(*args: str) -> subprocess.CompletedProcess:
    if shutil.which("tmux") is None:
        return subprocess.CompletedProcess(["tmux", *args], 127, "", "tmux is required; install tmux before chrome-start/chrome-stop")
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
    # Bind first: an occupied port must never launch and leak an upstream browser.
    srv = None
    previous_signals = {}
    def interrupt(_signum: int, _frame: Any) -> None:
        raise KeyboardInterrupt
    for signum in (signal.SIGTERM, signal.SIGHUP):
        previous_signals[signum] = signal.signal(signum, interrupt)

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
                self._send(200, {"ok": True, "mock": _mock(), "service": "apex-probe-chrome",
                                 "rootId": CHROME_DAEMON_ID, "pid": os.getpid()})
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

    try:
        srv = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
        backend.ensure()  # healthz now means the upstream is usable
        port = srv.server_address[1]
        CHROME_DAEMON_STATE.parent.mkdir(parents=True, exist_ok=True)
        CHROME_DAEMON_STATE.write_text(str(port))
        print(f"probe-chrome daemon listening on 127.0.0.1:{port}", flush=True)
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        backend.close()
        if srv:
            srv.server_close()
        if srv and CHROME_DAEMON_STATE.is_file() and CHROME_DAEMON_STATE.read_text().strip() == str(srv.server_address[1]):
            CHROME_DAEMON_STATE.unlink()
        for signum, handler in previous_signals.items():
            signal.signal(signum, handler)
    return 0


def live_test_run() -> str:
    """`<pid>:<start> <log>` of a live Playwright run in THIS checkout, else ""
    (.claude/hooks/live-run.py, the same answer stop-guard and protect-files use)."""
    try:
        r = subprocess.run([sys.executable, str(ROOT / ".claude" / "hooks" / "live-run.py"), str(ROOT)],
                           capture_output=True, text=True, timeout=10)
        return r.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def cmd_chrome_start(args: argparse.Namespace) -> int:
    live = "" if getattr(args, "force", False) else live_test_run()
    if live:
        print(f"REFUSED: a Playwright run is live in this checkout ({live}); a Chrome beside it "
              "starves it. Wait for its `= run` line (node tools/ci/test-bg.mjs --status), "
              "or pass --force.", file=sys.stderr)
        return 1
    port = daemon_port()
    if port is not None:
        print(f"already running on 127.0.0.1:{port}")
        return 0
    if shutil.which("tmux") is None:
        print("tmux is required; install tmux before chrome-start", file=sys.stderr)
        return 1
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
            print("REMEMBER: `chrome-stop` before any test-bg.mjs run — test-bg refuses "
                  "a browser group while this daemon is live.")
            return 0
    print("daemon did not come up — tmux pane:", file=sys.stderr)
    print(_tmux("capture-pane", "-t", f"{CHROME_DAEMON_SESSION}:0.0", "-p").stdout,
          file=sys.stderr)
    _tmux("kill-session", "-t", CHROME_DAEMON_SESSION)
    return 1


def cmd_chrome_stop(_: argparse.Namespace) -> int:
    r = _tmux("kill-session", "-t", CHROME_DAEMON_SESSION)
    if r.returncode == 127:
        print(r.stderr, file=sys.stderr)
        return 1
    import time
    for _ in range(10):
        if daemon_port() is None:
            break
        time.sleep(0.1)
    else:
        print("chrome-stop failed: daemon is still healthy; state retained. " + r.stderr.strip(), file=sys.stderr)
        return 1
    if r.returncode != 0:
        absent = re.search(r"can't find session|no server running|no sessions", r.stderr, re.I)
        if not absent or _tmux("has-session", "-t", CHROME_DAEMON_SESSION).returncode == 0:
            print("chrome-stop failed: termination was not confirmed. " + r.stderr.strip(), file=sys.stderr)
            return 1
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
                                "Live version.json / public web is the deploy-research "
                                "subagent (host fetch). Park chrome to about:blank before Playwright."
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
        description="Chrome DevTools MCP bridge (chrome_* passthrough + persistent daemon)",
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
    def valid_port(value: str) -> int:
        try:
            port = int(value)
        except ValueError as e:
            raise argparse.ArgumentTypeError("port must be an integer between 0 and 65535") from e
        if not 0 <= port <= 65535:
            raise argparse.ArgumentTypeError("port must be between 0 and 65535")
        return port
    p_daemon.add_argument("--port", type=valid_port, default=CHROME_DAEMON_PORT)
    p_daemon.set_defaults(func=cmd_chrome_daemon)

    p_cstart = sub.add_parser("chrome-start", add_help=False)
    p_cstart.add_argument("--port", type=valid_port, default=CHROME_DAEMON_PORT)
    p_cstart.add_argument("--force", action="store_true")
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
