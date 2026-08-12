#!/usr/bin/env python3
"""Drive chrome-devtools MCP over stdio from the shell.

Examples:
  python3 tools/cdmcp-cli.py list-tools
  python3 tools/cdmcp-cli.py call navigate_page '{"url":"http://127.0.0.1:3456/"}'
  python3 tools/cdmcp-cli.py call evaluate_script '{"function":"() => document.title"}'
  python3 tools/cdmcp-cli.py survey-title
  python3 tools/cdmcp-cli.py measure boot --port 3462
  python3 tools/cdmcp-cli.py measure ui --bg
  python3 tools/cdmcp-cli.py apex-shot monza 0.97 --az -105 --el 26 --dist 110
"""
from __future__ import annotations

import argparse
import json
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WRAPPER = ROOT / "tools" / "chrome-devtools-mcp.sh"
TIMEOUT = 180


class McpClient:
    def __init__(self, roots: list[str] | None = None) -> None:
        self._id = 0
        self._pending: dict[int, dict] = {}
        self._buf = ""
        # Advertise workspace so take_screenshot(filePath=…) under /workspace works.
        # docs/research/CHROME-DEVTOOLS-MCP.md — without roots, writes are denied.
        self._roots = roots or [f"file://{ROOT}"]
        self.proc = subprocess.Popen(
            [str(WRAPPER), "run"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        assert self.proc.stdin and self.proc.stdout
        threading.Thread(target=self._reader, daemon=True).start()

    def _reply(self, rid: int, result: dict) -> None:
        assert self.proc.stdin
        self.proc.stdin.write(
            json.dumps({"jsonrpc": "2.0", "id": rid, "result": result}) + "\n"
        )
        self.proc.stdin.flush()

    def _reader(self) -> None:
        assert self.proc.stdout
        for line in self.proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue
            # Server → client request (e.g. roots/list) — answer it.
            if "method" in msg and "id" in msg:
                method = msg["method"]
                rid = msg["id"]
                if method == "roots/list":
                    self._reply(
                        rid,
                        {
                            "roots": [
                                {"uri": u, "name": Path(u.replace("file://", "")).name or "root"}
                                for u in self._roots
                            ]
                        },
                    )
                else:
                    self._reply(rid, {})
                continue
            mid = msg.get("id")
            if mid is not None and mid in self._pending:
                self._pending[mid]["result"] = msg

    def _request(self, method: str, params: dict | None = None) -> dict:
        self._id += 1
        rid = self._id
        payload = {"jsonrpc": "2.0", "id": rid, "method": method, "params": params or {}}
        self._pending[rid] = {}
        assert self.proc.stdin
        self.proc.stdin.write(json.dumps(payload) + "\n")
        self.proc.stdin.flush()
        deadline = time.time() + TIMEOUT
        while time.time() < deadline:
            if "result" in self._pending[rid]:
                msg = self._pending.pop(rid)["result"]
                if "error" in msg:
                    raise RuntimeError(json.dumps(msg["error"]))
                return msg.get("result", msg)
            time.sleep(0.05)
        raise TimeoutError(method)

    def _notify(self, method: str, params: dict | None = None) -> None:
        assert self.proc.stdin
        self.proc.stdin.write(
            json.dumps({"jsonrpc": "2.0", "method": method, "params": params or {}}) + "\n"
        )
        self.proc.stdin.flush()

    def start(self) -> None:
        self._request(
            "initialize",
            {
                "protocolVersion": "2025-06-18",
                "capabilities": {"roots": {"listChanged": True}},
                "clientInfo": {"name": "cdmcp-cli", "version": "1"},
            },
        )
        self._notify("notifications/initialized")
        # Tell the server our roots are ready (some builds wait for this).
        try:
            self._notify(
                "notifications/roots/list_changed",
                {},
            )
        except Exception:
            pass

    def tools_list(self) -> list[str]:
        r = self._request("tools/list")
        return [t["name"] for t in r.get("tools", [])]

    def call(self, name: str, arguments: dict) -> dict:
        r = self._request("tools/call", {"name": name, "arguments": arguments})
        return r

    def close(self) -> None:
        if self.proc.stdin:
            self.proc.stdin.close()
        try:
            self.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.proc.kill()


def text_result(result: dict) -> str:
    content = result.get("content") or []
    parts = []
    for c in content:
        if c.get("type") == "text":
            parts.append(c.get("text", ""))
    return "\n".join(parts) if parts else json.dumps(result, indent=2)[:4000]


def cmd_list_tools(_: list[str]) -> None:
    c = McpClient()
    try:
        c.start()
        tools = c.tools_list()
        print(f"tools: {len(tools)}")
        for t in tools:
            print(f"  - {t}")
    finally:
        c.close()


def cmd_call(args: list[str]) -> None:
    if len(args) < 2:
        print("usage: call <tool> '<json-args>'", file=sys.stderr)
        sys.exit(1)
    name, raw = args[0], args[1]
    arguments = json.loads(raw)
    c = McpClient()
    try:
        c.start()
        r = c.call(name, arguments)
        print(text_result(r))
    finally:
        c.close()


def cmd_measure(args: list[str]) -> None:
    """Delegate to tools/cdmcp-measure.py (background-friendly Chromium logs)."""
    script = ROOT / "tools" / "cdmcp-measure.py"
    raise SystemExit(subprocess.call([sys.executable, str(script), *args]))


def cmd_survey_title(argv: list[str]) -> None:
    import os
    ap = argparse.ArgumentParser(prog="survey-title")
    default_port = int(os.environ.get("APEX_PORT") or os.environ.get("PORT") or "3456")
    ap.add_argument("--port", type=int, default=default_port,
                    help=f"static server port (default {default_port}; env APEX_PORT/PORT)")
    args = ap.parse_args(argv)
    try:
        build = json.loads((ROOT / "version.json").read_text()).get("build")
    except Exception:
        build = None
    url = f"http://127.0.0.1:{args.port}/" + (f"?v={build}" if build else "")
    c = McpClient()
    try:
        c.start()
        print("→ navigate_page", url)
        print(text_result(c.call("navigate_page", {"url": url})))
        time.sleep(1)
        print("→ evaluate_script (survey harness)")
        js = """async () => {
  for (let i = 0; i < 60 && !window.__apex; i++) await new Promise(r => setTimeout(r, 250));
          window.__apex?.headless?.(true);
          const g = document.getElementById('game');
          if (g) g.style.visibility = 'hidden';
          await new Promise(r => setTimeout(r, 400));
          return {
            title: document.title,
            build: document.querySelector('script[src*="game.js"]')?.src.match(/v=(\\d+)/)?.[1],
            overlay: !document.getElementById('overlay')?.hidden,
            tap: getComputedStyle(document.body).getPropertyValue('--tap').trim(),
            uiScale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(),
            buttons: [...document.querySelectorAll('#overlay button')].map(b => b.textContent.trim()).slice(0, 6)
          };
        }"""
        print(text_result(c.call("evaluate_script", {"function": js})))
        print("→ take_snapshot")
        snap = text_result(c.call("take_snapshot", {}))
        print(snap[:2500] + ("…" if len(snap) > 2500 else ""))
        print("→ take_screenshot")
        shot_path = ROOT / "artifacts" / "tmp" / "cdmcp-title.png"
        shot_path.parent.mkdir(parents=True, exist_ok=True)
        shot = c.call("take_screenshot", {"filePath": str(shot_path)})
        print(text_result(shot))
        print(f"screenshot: {shot_path}")
        c.call("navigate_page", {"url": "about:blank"})
    finally:
        c.close()


def _port_open(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.4):
            return True
    except OSError:
        return False


def _ensure_static_server(port: int = 3456) -> subprocess.Popen | None:
    """Reuse an existing :port server, else start `npx serve` for the repo root."""
    if _port_open(port):
        print(f"reusing http://127.0.0.1:{port}/")
        return None
    print(f"starting static server on :{port}")
    proc = subprocess.Popen(
        ["npx", "--yes", "serve", "-l", str(port), str(ROOT)],
        cwd=str(ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    for _ in range(40):
        if _port_open(port):
            return proc
        time.sleep(0.25)
    proc.kill()
    raise RuntimeError(f"static server failed to bind :{port}")


def cmd_apex_shot(argv: list[str]) -> None:
    """Frame a free-cam orbit shot of a live track via chrome-devtools MCP.

    Waits for Assets.loadModels() before race(), and never calls snapCam() after
    orbit() (snapCam clears dbgCam back to chase — see mcp-probe skill).
    """
    p = argparse.ArgumentParser(prog="apex-shot")
    p.add_argument("track", nargs="?", default="monza")
    p.add_argument("frac", nargs="?", type=float, default=0.1)
    p.add_argument("--az", type=float, default=45.0)
    p.add_argument("--el", type=float, default=18.0)
    p.add_argument("--dist", type=float, default=45.0)
    p.add_argument("--tod", default="day")
    p.add_argument(
        "--port",
        type=int,
        default=int(__import__("os").environ.get("APEX_PORT") or __import__("os").environ.get("PORT") or "3456"),
        help="static server port (default APEX_PORT/PORT/3456)",
    )
    p.add_argument(
        "--out",
        default=str(ROOT / "artifacts" / "tmp" / "cdmcp-apex-shot.png"),
        help="screenshot path (must be inside the MCP workspace root; "
             "if denied, omit and rely on Playwright shot.mjs / baked-scenery.mjs)",
    )
    p.add_argument(
        "--no-file",
        action="store_true",
        help="call take_screenshot without filePath (MCP returns image inline)",
    )
    args = p.parse_args(argv)

    out = Path(args.out)
    if not args.no_file:
        out.parent.mkdir(parents=True, exist_ok=True)
    server = _ensure_static_server(args.port)
    url = f"http://127.0.0.1:{args.port}/"
    c = McpClient()
    try:
        c.start()
        print(f"→ navigate_page {url}")
        print(text_result(c.call("navigate_page", {"url": url})))
        # Boot + model prefetch + race + free-cam orbit (no snapCam).
        js = f"""async () => {{
  for (let i = 0; i < 80 && !window.__apex; i++)
    await new Promise(r => setTimeout(r, 250));
  if (!window.__apex) return {{ ok: false, error: "no __apex" }};
  const a = window.__apex;
  let models = 0;
  if (typeof Assets !== "undefined" && Assets.loadModels) {{
    try {{ models = await Assets.loadModels(); }} catch (_) {{}}
  }}
  a.race({json.dumps(args.track)});
  for (let i = 0; i < 80 && !(a.info && a.info().track); i++)
    await new Promise(r => setTimeout(r, 250));
  await new Promise(r => setTimeout(r, 1200));
  a.go();
  a.park({args.frac});
  a.freeze(true);
  if (a.setTimeOfDay) a.setTimeOfDay({json.dumps(args.tod)});
  if (a.hud) a.hud(false);
  a.orbit({args.frac}, {args.az}, {args.el}, {args.dist});
  if (a.step) a.step(1/60, 4);
  await new Promise(r => requestAnimationFrame(r));
  await new Promise(r => requestAnimationFrame(r));
  const cs = a.camState ? a.camState() : null;
  return {{
    ok: true,
    track: a.info().track,
    models,
    modelIds: (typeof Assets !== "undefined" && Assets.models) ? Assets.models() : [],
    dbgCam: !!(cs && cs.debug),
    eye: cs && cs.eye,
  }};
}}"""
        print("→ evaluate_script (loadModels → race → orbit)")
        print(text_result(c.call("evaluate_script", {"function": js})))
        print("→ take_screenshot")
        shot_args: dict = {}
        if not args.no_file:
            shot_args["filePath"] = str(out)
        shot = c.call("take_screenshot", shot_args)
        print(text_result(shot)[:500])
        if not args.no_file:
            print(f"screenshot: {out}")
        try:
            c.call("navigate_page", {"url": "about:blank"})
        except Exception:
            pass
    finally:
        c.close()
        if server is not None:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(0)
    cmd = sys.argv[1]
    rest = sys.argv[2:]
    if cmd == "list-tools":
        cmd_list_tools(rest)
    elif cmd == "call":
        cmd_call(rest)
    elif cmd == "survey-title":
        cmd_survey_title(rest)
    elif cmd == "measure":
        cmd_measure(rest)
    elif cmd == "apex-shot":
        cmd_apex_shot(rest)
    else:
        print(f"unknown: {cmd}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
