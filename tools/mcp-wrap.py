#!/usr/bin/env python3
"""Apex probes — official MCP server wrapping chrome-devtools + tinyfish.

Full Model Context Protocol server (tools, resources, prompts, ping) using the
Python SDK. Every upstream tool is exposed unchanged under a prefix:

  chrome_<tool>    chrome-devtools MCP (stdio, one long-lived Chromium)
  tinyfish_<tool>  tinyfish HTTP proxy (http://127.0.0.1:3711/mcp)

Transports:
  python3 tools/mcp-wrap.py serve            # stdio (.mcp.json → apex-wrap)
  python3 tools/mcp-wrap.py serve --http 3720  # Streamable HTTP at /mcp

Shell helpers (no host required):
  python3 tools/mcp-wrap.py list-tools
  python3 tools/mcp-wrap.py status
  python3 tools/mcp-wrap.py call chrome_evaluate_script '{"function":"() => 1"}'

Requires: pip install -r tools/requirements-mcp.txt
See .claude/skills/mcp-probe — park chrome to about:blank before Playwright.
"""
from __future__ import annotations

import argparse
import asyncio
import importlib.util
import json
import logging
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from contextlib import asynccontextmanager
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
DEPLOY_VERSION = "https://brycejmurrin.github.io/f1-game/version.json"

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s mcp-wrap: %(message)s",
    stream=sys.stderr,
)
log = logging.getLogger(__name__)


def _require_sdk() -> None:
    try:
        import mcp.server  # noqa: F401
    except ImportError as e:
        raise SystemExit(
            "mcp Python SDK is required. Install with:\n"
            "  pip install -r tools/requirements-mcp.txt"
        ) from e


def _load_cdmcp():
    spec = importlib.util.spec_from_file_location("cdmcp_cli", ROOT / "tools" / "cdmcp-cli.py")
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod


class ChromeBackend:
    """Long-lived chrome-devtools MCP client (one browser for the server life)."""

    def __init__(self) -> None:
        self._client = None
        self._tools: list[dict[str, Any]] = []

    def ensure(self) -> None:
        if self._client is not None:
            return
        mod = _load_cdmcp()
        self._client = mod.McpClient()
        self._client.start()
        raw = self._client._request("tools/list")  # noqa: SLF001
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
                    "title": t.get("title") or f"Chrome: {name}",
                    "description": t.get("description") or f"Chrome DevTools MCP: {name}",
                    "inputSchema": t.get("inputSchema")
                    or {"type": "object", "properties": {}},
                    "annotations": t.get("annotations"),
                }
            )
        return out

    def call(self, prefixed: str, arguments: dict[str, Any]) -> dict[str, Any]:
        self.ensure()
        assert self._client
        return self._client.call(prefixed[len(CHROME_PREFIX) :], arguments)

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
                time.sleep(0.25)
        if not self._healthz():
            self._error = (
                "tinyfish proxy down — set TINYFISH_API_KEY in "
                "scratch/tinyfish-mcp-server/.env and run tools/tinyfish-mcp.sh start"
            )
            log.warning(self._error)
            return
        self._post(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": TINYFISH_PROTO,
                    "capabilities": {},
                    "clientInfo": {"name": "apex-probes", "version": "1.0.0"},
                },
            },
            with_session=False,
        )
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
            out.append(
                {
                    "name": f"{TINYFISH_PREFIX}{name}",
                    "title": t.get("title") or f"TinyFish: {name}",
                    "description": t.get("description")
                    or t.get("title")
                    or f"TinyFish MCP: {name}",
                    "inputSchema": t.get("inputSchema")
                    or {"type": "object", "properties": {}},
                    "annotations": t.get("annotations"),
                }
            )
        return out

    def call(self, prefixed: str, arguments: dict[str, Any]) -> dict[str, Any]:
        self.ensure()
        if not self._tools:
            raise RuntimeError(self._error or "tinyfish unavailable")
        payload = self._post(
            {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {
                    "name": prefixed[len(TINYFISH_PREFIX) :],
                    "arguments": arguments,
                },
            }
        )
        return payload.get("result") or {}


class Backends:
    def __init__(self) -> None:
        self.chrome = ChromeBackend()
        self.tinyfish = TinyfishBackend()

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

    def status(self) -> dict[str, Any]:
        chrome_err = None
        try:
            self.chrome.ensure()
        except Exception as e:
            chrome_err = str(e)
        try:
            self.tinyfish.ensure()
        except Exception as e:
            if not self.tinyfish.error:
                self.tinyfish._error = str(e)  # noqa: SLF001
        return {
            "server": "apex-probes",
            "version": "1.0.0",
            "chrome": {
                "ok": self.chrome.ok,
                "tools": len(self.chrome._tools),  # noqa: SLF001
                "error": chrome_err,
            },
            "tinyfish": {
                "ok": self.tinyfish.ok,
                "tools": len(self.tinyfish._tools),  # noqa: SLF001
                "error": self.tinyfish.error,
                "proxy": TINYFISH_MCP,
            },
        }

    def close(self) -> None:
        self.chrome.close()


INSTRUCTIONS = (
    "Apex 26 probe MCP — official server wrapping chrome-devtools (local "
    "headless Chromium + SwiftShader) and tinyfish (public web fetch/search). "
    "Local game: serve on :3456 then chrome_navigate_page. Deploy checks: "
    "tinyfish_fetch_content on …/version.json, or read resource apex://deploy/version. "
    "Park chrome to about:blank (chrome_navigate_page) before Playwright test runs. "
    "Resources: apex://status, apex://chrome/tools, apex://tinyfish/tools, "
    "apex://deploy/version. Prompts: deploy_check, park_chrome, local_game."
)


def _tool_result(upstream: dict[str, Any]) -> dict[str, Any]:
    if "content" in upstream:
        return upstream
    text = json.dumps(upstream, indent=2) if isinstance(upstream, dict) else str(upstream)
    return {"content": [{"type": "text", "text": text}]}


def _as_mcp_tools(raw: list[dict[str, Any]]):
    from mcp.types import Tool, ToolAnnotations

    tools = []
    for t in raw:
        ann = None
        raw_ann = t.get("annotations")
        if isinstance(raw_ann, dict):
            try:
                ann = ToolAnnotations.model_validate(raw_ann)
            except Exception:
                ann = None
        tools.append(
            Tool(
                name=t["name"],
                title=t.get("title"),
                description=t.get("description"),
                inputSchema=t.get("inputSchema") or {"type": "object", "properties": {}},
                annotations=ann,
            )
        )
    return tools


def _as_call_result(upstream: dict[str, Any]):
    from mcp.types import CallToolResult, ImageContent, TextContent

    blocks: list[Any] = []
    for item in (_tool_result(upstream).get("content") or []):
        if not isinstance(item, dict):
            continue
        kind = item.get("type")
        if kind == "image":
            blocks.append(
                ImageContent(
                    type="image",
                    data=item.get("data") or "",
                    mimeType=item.get("mimeType") or "image/png",
                )
            )
        else:
            blocks.append(TextContent(type="text", text=item.get("text") or json.dumps(item)))
    if not blocks:
        blocks.append(TextContent(type="text", text=json.dumps(upstream)))
    return CallToolResult(content=blocks, isError=bool(upstream.get("isError")))


def _backends(ctx) -> Backends:
    state = ctx.lifespan_context
    if isinstance(state, Backends):
        return state
    raise RuntimeError("apex-probes lifespan did not yield Backends")


def build_server():
    """Official MCP Server with tools + resources + prompts + ping."""
    from mcp.server.lowlevel.server import Server
    from mcp.types import (
        CallToolResult,
        EmptyResult,
        GetPromptResult,
        ListPromptsResult,
        ListResourcesResult,
        ListToolsResult,
        Prompt,
        PromptArgument,
        PromptMessage,
        ReadResourceResult,
        Resource,
        TextContent,
        TextResourceContents,
    )

    @asynccontextmanager
    async def lifespan(_server):
        backends = Backends()
        try:
            yield backends
        finally:
            backends.close()

    async def on_list_tools(ctx, _params) -> ListToolsResult:
        backends = _backends(ctx)
        raw = await asyncio.to_thread(backends.all_tools)
        return ListToolsResult(tools=_as_mcp_tools(raw))

    async def on_call_tool(ctx, params) -> CallToolResult:
        backends = _backends(ctx)
        try:
            upstream = await asyncio.to_thread(
                backends.dispatch, params.name, params.arguments or {}
            )
            return _as_call_result(upstream)
        except Exception as e:
            return CallToolResult(
                content=[TextContent(type="text", text=str(e))],
                isError=True,
            )

    async def on_list_resources(_ctx, _params) -> ListResourcesResult:
        return ListResourcesResult(
            resources=[
                Resource(
                    uri="apex://status",
                    name="status",
                    title="Backend status",
                    description="chrome-devtools + tinyfish health and tool counts",
                    mimeType="application/json",
                ),
                Resource(
                    uri="apex://chrome/tools",
                    name="chrome-tools",
                    title="Chrome DevTools tools",
                    description="Prefixed chrome_* tool names from the live backend",
                    mimeType="application/json",
                ),
                Resource(
                    uri="apex://tinyfish/tools",
                    name="tinyfish-tools",
                    title="TinyFish tools",
                    description="Prefixed tinyfish_* tool names from the live backend",
                    mimeType="application/json",
                ),
                Resource(
                    uri="apex://deploy/version",
                    name="deploy-version",
                    title="Live GitHub Pages version.json",
                    description=f"tinyfish_fetch_content of {DEPLOY_VERSION}",
                    mimeType="application/json",
                ),
            ]
        )

    async def on_read_resource(ctx, params) -> ReadResourceResult:
        backends = _backends(ctx)
        uri = str(params.uri)

        def body() -> str:
            if uri == "apex://status":
                return json.dumps(backends.status(), indent=2)
            if uri == "apex://chrome/tools":
                return json.dumps(
                    [t["name"] for t in backends.chrome.list_tools()], indent=2
                )
            if uri == "apex://tinyfish/tools":
                return json.dumps(
                    [t["name"] for t in backends.tinyfish.list_tools()], indent=2
                )
            if uri == "apex://deploy/version":
                result = backends.dispatch(
                    "tinyfish_fetch_content",
                    {
                        "urls": [DEPLOY_VERSION],
                        "format": "markdown",
                        "links": False,
                        "image_links": False,
                        "page_metadata": False,
                    },
                )
                return json.dumps(_tool_result(result), indent=2)
            raise ValueError(f"unknown resource {uri}")

        try:
            text = await asyncio.to_thread(body)
        except Exception as e:
            text = json.dumps({"ok": False, "error": str(e)})
        return ReadResourceResult(
            contents=[
                TextResourceContents(uri=uri, mimeType="application/json", text=text)
            ]
        )

    async def on_list_prompts(_ctx, _params) -> ListPromptsResult:
        return ListPromptsResult(
            prompts=[
                Prompt(
                    name="deploy_check",
                    title="Post-deploy liveness",
                    description="Fetch the live GitHub Pages version.json via tinyfish",
                ),
                Prompt(
                    name="park_chrome",
                    title="Park Chromium",
                    description="Navigate the chrome-devtools browser to about:blank",
                ),
                Prompt(
                    name="local_game",
                    title="Open local Apex 26",
                    description="Navigate chrome-devtools to the local static server",
                    arguments=[
                        PromptArgument(
                            name="port",
                            description="Static server port (default 3456)",
                            required=False,
                        ),
                        PromptArgument(
                            name="build",
                            description="Cache-bust ?v=N from version.json",
                            required=False,
                        ),
                    ],
                ),
            ]
        )

    async def on_get_prompt(_ctx, params) -> GetPromptResult:
        name = params.name
        args = params.arguments or {}
        if name == "deploy_check":
            text = (
                "Call tinyfish_fetch_content with urls "
                f'["{DEPLOY_VERSION}"] (format markdown). '
                "Compare the live build number to the local version.json."
            )
        elif name == "park_chrome":
            text = (
                "Call chrome_navigate_page with url about:blank so the MCP "
                "browser stops rendering before any Playwright group starts."
            )
        elif name == "local_game":
            port = args.get("port") or "3456"
            build = args.get("build")
            q = f"?v={build}" if build else ""
            text = (
                f"Call chrome_navigate_page with url "
                f"http://127.0.0.1:{port}/{q} and ignoreCache true. "
                "Then chrome_evaluate_script to wait for window.__apex."
            )
        else:
            text = f"unknown prompt {name}"
        return GetPromptResult(
            description=name,
            messages=[
                PromptMessage(
                    role="user",
                    content=TextContent(type="text", text=text),
                )
            ],
        )

    async def on_ping(_ctx, _params) -> EmptyResult:
        return EmptyResult()

    return Server(
        "apex-probes",
        version="1.0.0",
        title="Apex 26 probes",
        description="Official MCP server wrapping chrome-devtools and tinyfish",
        instructions=INSTRUCTIONS,
        website_url="https://brycejmurrin.github.io/f1-game/",
        lifespan=lifespan,
        on_list_tools=on_list_tools,
        on_call_tool=on_call_tool,
        on_list_resources=on_list_resources,
        on_read_resource=on_read_resource,
        on_list_prompts=on_list_prompts,
        on_get_prompt=on_get_prompt,
        on_ping=on_ping,
    )


def cmd_list_tools(_: list[str]) -> None:
    backends = Backends()
    try:
        tools = backends.all_tools()
        chrome_n = sum(1 for t in tools if t["name"].startswith(CHROME_PREFIX))
        tf_n = sum(1 for t in tools if t["name"].startswith(TINYFISH_PREFIX))
        print(f"tools: {len(tools)} (chrome {chrome_n}, tinyfish {tf_n})")
        for t in tools:
            print(f"  - {t['name']}")
        if backends.tinyfish.error:
            print(f"tinyfish note: {backends.tinyfish.error}", file=sys.stderr)
    finally:
        backends.close()


def cmd_status(_: list[str]) -> None:
    backends = Backends()
    try:
        st = backends.status()
        ch, tf = st["chrome"], st["tinyfish"]
        print(f"chrome: {'OK' if ch['ok'] else 'FAIL'} ({ch['tools']} tools)"
              + (f" ({ch['error']})" if ch["error"] else ""))
        print(f"tinyfish: {'OK' if tf['ok'] else 'DOWN'} ({tf['tools']} tools)"
              + (f" ({tf['error']})" if tf["error"] else ""))
        sys.exit(0 if ch["ok"] else 1)
    finally:
        backends.close()


def cmd_call(args: list[str]) -> None:
    if len(args) < 2:
        print("usage: call <prefixed-tool> '<json-args>'", file=sys.stderr)
        sys.exit(1)
    name, raw = args[0], args[1]
    arguments = json.loads(raw)
    backends = Backends()
    try:
        result = backends.dispatch(name, arguments)
        content = _tool_result(result).get("content") or []
        texts = [c.get("text", "") for c in content if isinstance(c, dict)]
        print("\n".join(texts) if texts else json.dumps(result, indent=2)[:4000])
    finally:
        backends.close()


async def _serve_stdio() -> None:
    from mcp.server.stdio import stdio_server

    server = build_server()
    async with stdio_server() as (read, write):
        await server.run(read, write, server.create_initialization_options())


def _serve_http(host: str, port: int) -> None:
    import uvicorn

    server = build_server()
    app = server.streamable_http_app()
    log.info("apex-probes Streamable HTTP on http://%s:%d/mcp", host, port)
    uvicorn.run(app, host=host, port=port, log_level="info")


def cmd_serve(args: list[str]) -> None:
    _require_sdk()
    p = argparse.ArgumentParser(prog="serve")
    p.add_argument(
        "--http",
        nargs="?",
        const="3720",
        metavar="PORT",
        help="Streamable HTTP on 127.0.0.1:PORT (default 3720) instead of stdio",
    )
    p.add_argument("--host", default="127.0.0.1")
    ns = p.parse_args(args)
    if ns.http is not None:
        _serve_http(ns.host, int(ns.http))
        return
    asyncio.run(_serve_stdio())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "command",
        nargs="?",
        default="serve",
        choices=["serve", "list-tools", "status", "call"],
    )
    parser.add_argument("args", nargs=argparse.REMAINDER, help="args for serve/call")
    ns = parser.parse_args()
    rest = ns.args
    if rest[:1] == ["--"]:
        rest = rest[1:]
    if ns.command == "serve":
        cmd_serve(rest)
    elif ns.command == "list-tools":
        cmd_list_tools(rest)
    elif ns.command == "status":
        cmd_status(rest)
    elif ns.command == "call":
        cmd_call(rest)


if __name__ == "__main__":
    main()
