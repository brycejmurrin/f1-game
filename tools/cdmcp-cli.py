#!/usr/bin/env python3
"""Drive chrome-devtools MCP over stdio from the shell.

Examples:
  python3 tools/cdmcp-cli.py list-tools
  python3 tools/cdmcp-cli.py call navigate_page '{"url":"http://127.0.0.1:3456/"}'
  python3 tools/cdmcp-cli.py call evaluate_script '{"function":"() => document.title"}'
  python3 tools/cdmcp-cli.py survey-title
  python3 tools/cdmcp-cli.py measure boot --port 3462
  python3 tools/cdmcp-cli.py measure ui --bg
"""
from __future__ import annotations

import json
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WRAPPER = ROOT / "tools" / "chrome-devtools-mcp.sh"
TIMEOUT = 120


class McpClient:
    def __init__(self) -> None:
        self._id = 0
        self._pending: dict[int, dict] = {}
        self._buf = ""
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
                "capabilities": {},
                "clientInfo": {"name": "cdmcp-cli", "version": "1"},
            },
        )
        self._notify("notifications/initialized")

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


def cmd_survey_title(_: list[str]) -> None:
    c = McpClient()
    try:
        c.start()
        print("→ navigate_page")
        print(text_result(c.call("navigate_page", {"url": "http://127.0.0.1:3456/?v=1116"})))
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
    finally:
        c.close()


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
    else:
        print(f"unknown: {cmd}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
