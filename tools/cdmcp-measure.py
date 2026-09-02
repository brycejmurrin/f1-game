#!/usr/bin/env python3
# @doc Background-friendly Chromium MCP measure suite: boot (network/console/LCP), ui floors, full(+heap); `= run` verdict.
# @skill mcp-probe
"""Measure Apex 26 through chrome-devtools MCP with background-friendly logs.

Runs a Chromium (SwiftShader) session via tools/chrome-devtools-mcp.sh, writes
line-oriented progress to artifacts/logs/cdmcp-measure.log and a JSON summary
to artifacts/logs/cdmcp-measure.json. Terminal line matches test-bg watchers:

  = run passed|failed|timedout|interrupted

Examples:
  python3 tools/cdmcp-measure.py                  # foreground boot profile
  python3 tools/cdmcp-measure.py --bg             # detach; returns immediately
  python3 tools/cdmcp-measure.py ui --url http://127.0.0.1:3462
  python3 tools/cdmcp-measure.py full --port 3462
  APEX_PORT=3462 python3 tools/cdmcp-measure.py boot --bg
  node tools/cdmcp-bg.mjs boot                    # same as --bg (test-bg twin)
  # Parallel worktrees: each serves its own port (3456, 3460, 3461, …).

Profiles:
  boot  — cold navigate, network, console, LCP/trace, lighthouse (default)
  ui    — settings@90 + garage@115 type/truncation floors (headless canvas)
  full  — boot + ui + heap summary (no Lighthouse-before-heap)

Never run while a Playwright group is in flight (starves SwiftShader).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WRAPPER = ROOT / "tools" / "chrome-devtools-mcp.sh"
LOGDIR = ROOT / "artifacts" / "logs"
LOG_PATH = LOGDIR / "cdmcp-measure.log"
JSON_PATH = LOGDIR / "cdmcp-measure.json"
STATE_PATH = LOGDIR / "cdmcp-bg.json"
ARTIFACT_DIR = ROOT / "artifacts" / "tmp" / "cdmcp-measure"
TIMEOUT = 180

PROFILES = ("boot", "ui", "full")

# Default port: APEX_PORT / PORT env (parallel worktrees), else 3456.
DEFAULT_PORT = int(os.environ.get("APEX_PORT") or os.environ.get("PORT") or "3456")


class Log:
    """Timestamped line logger → stdout + log file (unbuffered)."""

    def __init__(self, path: Path) -> None:
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        self._fh = path.open("w", buffering=1)

    def line(self, msg: str) -> None:
        ts = datetime.now(timezone.utc).astimezone().strftime("%H:%M:%S")
        text = f"[{ts}] {msg}"
        print(text, flush=True)
        self._fh.write(text + "\n")
        self._fh.flush()

    def close(self) -> None:
        try:
            self._fh.close()
        except Exception:
            pass


class McpClient:
    """JSON-RPC client that answers roots/list so artifacts/ writes succeed."""

    def __init__(self, log: Log) -> None:
        self.log = log
        self._id = 0
        self._pending: dict[int, dict] = {}
        self._lock = threading.Lock()
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
        for raw in self.proc.stdout:
            line = raw.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue
            # Server→client request (roots/list)
            if "method" in msg and "id" in msg and "result" not in msg and "error" not in msg:
                self._handle_server_request(msg)
                continue
            mid = msg.get("id")
            if mid is not None:
                with self._lock:
                    if mid in self._pending:
                        self._pending[mid]["result"] = msg

    def _handle_server_request(self, msg: dict) -> None:
        method = msg.get("method")
        rid = msg["id"]
        if method == "roots/list":
            roots = [
                {"uri": ROOT.as_uri(), "name": "workspace"},
                {"uri": Path("/tmp").as_uri(), "name": "tmp"},
            ]
            self._send({"jsonrpc": "2.0", "id": rid, "result": {"roots": roots}})
        else:
            self._send(
                {
                    "jsonrpc": "2.0",
                    "id": rid,
                    "error": {"code": -32601, "message": f"unsupported: {method}"},
                }
            )

    def _send(self, payload: dict) -> None:
        assert self.proc.stdin
        with self._lock:
            self.proc.stdin.write(json.dumps(payload) + "\n")
            self.proc.stdin.flush()

    def _request(self, method: str, params: dict | None = None) -> dict:
        self._id += 1
        rid = self._id
        with self._lock:
            self._pending[rid] = {}
        self._send({"jsonrpc": "2.0", "id": rid, "method": method, "params": params or {}})
        deadline = time.time() + TIMEOUT
        while time.time() < deadline:
            with self._lock:
                if "result" in self._pending.get(rid, {}):
                    msg = self._pending.pop(rid)["result"]
                    if "error" in msg:
                        raise RuntimeError(json.dumps(msg["error"]))
                    return msg.get("result", msg)
            time.sleep(0.05)
        raise TimeoutError(method)

    def _notify(self, method: str, params: dict | None = None) -> None:
        self._send({"jsonrpc": "2.0", "method": method, "params": params or {}})

    def start(self) -> None:
        self._request(
            "initialize",
            {
                "protocolVersion": "2025-06-18",
                "capabilities": {"roots": {"listChanged": False}},
                "clientInfo": {"name": "cdmcp-measure", "version": "1"},
            },
        )
        self._notify("notifications/initialized")

    def call(self, name: str, arguments: dict) -> dict:
        return self._request("tools/call", {"name": name, "arguments": arguments})

    def text(self, result: dict) -> str:
        parts = []
        for c in result.get("content") or []:
            if c.get("type") == "text":
                parts.append(c.get("text", ""))
        return "\n".join(parts) if parts else json.dumps(result)[:4000]

    def eval_json(self, fn: str):
        t = self.text(self.call("evaluate_script", {"function": fn}))
        if "```json" in t:
            return json.loads(t.split("```json", 1)[1].split("```", 1)[0].strip())
        # bare json
        t2 = t.strip()
        if t2.startswith("{") or t2.startswith("["):
            return json.loads(t2)
        raise RuntimeError(t[:800])

    def close(self) -> None:
        # Soft park — never block the measure terminal line on a hung navigate.
        try:
            self.proc.kill()
        except Exception:
            pass
        try:
            self.proc.wait(timeout=3)
        except Exception:
            pass


def parse_lighthouse_scores(text: str) -> dict:
    scores = {}
    for m in re.finditer(r"- ([A-Za-z ]+): (\d+)\s*\(", text):
        key = m.group(1).strip().lower().replace(" ", "_")
        scores[key] = int(m.group(2))
    return scores


def parse_lcp_ms(text: str) -> float | None:
    m = re.search(r"LCP:\s*([\d.]+)\s*ms", text)
    return float(m.group(1)) if m else None


def wait_apex_headless() -> str:
    return """async () => {
      for (let i = 0; i < 80 && !window.__apex; i++) await new Promise(r => setTimeout(r, 250));
      if (!window.__apex) return { ok: false, error: "no __apex" };
      window.__apex.headless(true);
      const g = document.getElementById("game");
      if (g) g.style.visibility = "hidden";
      const src = [...document.scripts].map(s => s.src).find(s => s.includes("game.js")) || "";
      const build = (src.match(/v=(\\d+)/) || [])[1] || null;
      return {
        ok: true,
        build,
        title: document.title,
        fsMicro: getComputedStyle(document.documentElement).getPropertyValue("--fs-micro").trim(),
        deferredCss: [...document.querySelectorAll('link[rel="stylesheet"]')]
          .filter(l => (l.getAttribute("media") || "") !== "")
          .map(l => (l.getAttribute("href") || "").split("/").pop() + "→" + l.media),
      };
    }"""


def measure_boot(c: McpClient, log: Log, url: str, summary: dict) -> None:
    log.line(f"→ navigate {url}")
    log.line(c.text(c.call("navigate_page", {"url": url}))[:240].replace("\n", " | "))
    time.sleep(2.0)

    boot = c.eval_json(wait_apex_headless())
    summary["boot"] = boot
    log.line(f"ok apex build={boot.get('build')} deferred={len(boot.get('deferredCss') or [])}")

    net = c.text(c.call("list_network_requests", {}))
    n_req = len(re.findall(r"^reqid=", net, re.M))
    summary["network"] = {"count": n_req, "head": net[:1200]}
    log.line(f"→ network requests={n_req}")

    cons = c.text(c.call("list_console_messages", {}))
    err_n = len(re.findall(r"\[error\]", cons, re.I))
    warn_n = len(re.findall(r"\[warn\]", cons, re.I))
    issue_n = len(re.findall(r"\[issue\]", cons, re.I))
    summary["console"] = {"errors": err_n, "warns": warn_n, "issues": issue_n, "head": cons[:1500]}
    log.line(f"→ console errors={err_n} warns={warn_n} issues={issue_n}")

    log.line("→ performance_start_trace (reload)")
    tr = c.text(c.call("performance_start_trace", {"reload": True, "autoStop": True}))
    summary["trace_raw"] = tr[:4000]
    lcp = parse_lcp_ms(tr)
    summary["lcp_ms"] = lcp
    log.line(f"→ trace LCP_ms={lcp}")

    # Prefer NAVIGATION_0; ignore about:blank if present
    insight_ids = re.findall(r"insight set id:\s*(\S+)", tr)
    nav_id = insight_ids[0] if insight_ids else "NAVIGATION_0"
    for name in ("LCPBreakdown", "RenderBlocking", "DocumentLatency"):
        try:
            insight = c.text(
                c.call(
                    "performance_analyze_insight",
                    {"insightSetId": nav_id, "insightName": name},
                )
            )
            summary.setdefault("insights", {})[name] = insight[:2500]
            log.line(f"→ insight {name} ({len(insight)} chars)")
        except Exception as e:
            log.line(f"→ insight {name} skip: {e}")

    log.line("→ lighthouse_audit navigation/desktop")
    lh = c.text(c.call("lighthouse_audit", {"mode": "navigation", "device": "desktop"}))
    scores = parse_lighthouse_scores(lh)
    summary["lighthouse"] = {"scores": scores, "raw": lh[:2500]}
    log.line(
        "→ lighthouse "
        + " ".join(f"{k}={v}" for k, v in scores.items())
        if scores
        else "→ lighthouse (no scores parsed)"
    )


def measure_ui(c: McpClient, log: Log, url: str, summary: dict) -> None:
    log.line(f"→ ui floors navigate {url}")
    c.call("navigate_page", {"url": url})
    time.sleep(2.0)
    c.eval_json(wait_apex_headless())

    ui = c.eval_json(
        """async () => {
      __apex.uiScale(90);
      await new Promise(r => setTimeout(r, 350));
      document.getElementById("mb-settings")?.click();
      await new Promise(r => setTimeout(r, 500));
      for (const a of document.getAnimations()) try { a.finish(); } catch {}
      const root = document.getElementById("pmsettings");
      const small = [];
      if (root) {
        const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        while (tw.nextNode()) {
          const t = tw.currentNode.textContent.trim();
          if (!t || t.length > 48) continue;
          const el = tw.currentNode.parentElement;
          if (!el) continue;
          const cs = getComputedStyle(el);
          if (cs.display === "none" || cs.visibility === "hidden") continue;
          const fs = parseFloat(cs.fontSize) || 0;
          const z = el.currentCSSZoom || 1;
          if (fs * z < 11.95) small.push({ t: t.slice(0, 36), fs, vis: +(fs * z).toFixed(2) });
        }
      }
      const b = document.getElementById("pm-uiscale-v");
      // Close SETTINGS before opening GARAGE — leaving it open paints the
      // overlay on the garage-115 screenshot and confused a prior fail read.
      document.getElementById("pmsettings")?.querySelector("[data-close],.sheet-back,#pm-back")
        ?.click();
      document.getElementById("pmsettings")?.close?.();
      __apex.uiScale(115);
      await new Promise(r => setTimeout(r, 350));
      document.getElementById("mb-garage")?.click();
      await new Promise(r => setTimeout(r, 600));
      const sus = [...document.querySelectorAll(".cs-tab-lbl")]
        .find(el => /SUSPENSION/.test(el.textContent || ""));
      return {
        settingsSmall: small,
        uiscaleFs: b ? getComputedStyle(b).fontSize : null,
        sus: sus ? {
          truncated: sus.scrollWidth > sus.clientWidth + 1,
          cw: sus.clientWidth,
          sw: sus.scrollWidth,
          ls: getComputedStyle(sus).letterSpacing,
        } : null,
      };
    }"""
    )
    summary["ui"] = ui
    small_n = len(ui.get("settingsSmall") or [])
    sus = ui.get("sus") or {}
    log.line(
        f"→ ui settingsSmall@90={small_n} susTruncated@115={sus.get('truncated')} "
        f"uiscaleFs={ui.get('uiscaleFs')}"
    )
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    try:
        shot = ARTIFACT_DIR / "garage-115.png"
        c.call("take_screenshot", {"filePath": str(shot)})
        log.line(f"→ screenshot {shot.relative_to(ROOT)}")
        summary["screenshot"] = str(shot.relative_to(ROOT))
    except Exception as e:
        log.line(f"→ screenshot skip: {e}")


def measure_heap(c: McpClient, log: Log, url: str, summary: dict) -> None:
    # Fresh nav — never after lighthouse (axe string pollution)
    log.line("→ heap (fresh nav, no lighthouse)")
    c.call("navigate_page", {"url": url})
    time.sleep(2.0)
    c.eval_json(wait_apex_headless())
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    heap = ARTIFACT_DIR / "title.heapsnapshot"
    c.call("take_heapsnapshot", {"filePath": str(heap)})
    summ = c.text(c.call("get_heapsnapshot_summary", {"filePath": str(heap)}))
    dups = c.text(
        c.call("get_heapsnapshot_duplicate_strings", {"filePath": str(heap), "pageSize": 10})
    )
    summary["heap"] = {
        "path": str(heap.relative_to(ROOT)),
        "summary": summ[:2000],
        "dups": dups[:2000],
    }
    log.line(f"→ heap saved {heap.relative_to(ROOT)} ({len(summ)} summary chars)")


def resolve_url(args: argparse.Namespace) -> str:
    if args.url:
        return args.url
    build = json.loads((ROOT / "version.json").read_text())["build"]
    return f"http://127.0.0.1:{args.port}/?v={build}"


def run_measure(profile: str, url: str) -> int:
    LOGDIR.mkdir(parents=True, exist_ok=True)
    log = Log(LOG_PATH)
    t0 = time.time()
    summary: dict = {
        "profile": profile,
        "url": url,
        "started": datetime.now(timezone.utc).isoformat(),
        "pid": os.getpid(),
    }
    status = "failed"
    c: McpClient | None = None
    try:
        log.line(f"= run start: profile={profile} url={url} pid={os.getpid()}")
        c = McpClient(log)
        c.start()
        log.line("→ mcp initialized")

        if profile in ("boot", "full"):
            measure_boot(c, log, url, summary)
        if profile in ("ui", "full"):
            # After lighthouse, re-nav for UI (boot already polluted DOM)
            measure_ui(c, log, url, summary)
        if profile == "full":
            measure_heap(c, log, url, summary)

        # Gates (soft — recorded, hard fail only on apex missing / trunc/floor)
        ok = True
        boot = summary.get("boot") or {}
        if profile in ("boot", "full", "ui") and not boot.get("ok") and profile != "ui":
            # ui re-navigates; check ui path
            pass
        if profile in ("boot", "full") and not (summary.get("boot") or {}).get("ok"):
            ok = False
            log.line("! gate: apex boot failed")
        ui = summary.get("ui") or {}
        if ui:
            if len(ui.get("settingsSmall") or []) > 0:
                ok = False
                log.line(f"! gate: settings smallText={ui.get('settingsSmall')}")
            if (ui.get("sus") or {}).get("truncated"):
                ok = False
                log.line("! gate: SUSPENSION truncated")
        status = "passed" if ok else "failed"
        return 0 if ok else 1
    except TimeoutError as e:
        status = "timedout"
        summary["error"] = f"timeout: {e}"
        log.line(f"! timeout: {e}")
        return 2
    except KeyboardInterrupt:
        status = "interrupted"
        log.line("! interrupted")
        return 130
    except Exception as e:
        status = "failed"
        summary["error"] = str(e)[:500]
        log.line(f"! error: {e}")
        return 1
    finally:
        elapsed = round(time.time() - t0, 1)
        summary["status"] = status
        summary["elapsed_s"] = elapsed
        summary["finished"] = datetime.now(timezone.utc).isoformat()
        try:
            JSON_PATH.write_text(json.dumps(summary, indent=2)[:500_000])
            log.line(f"→ wrote {JSON_PATH.relative_to(ROOT)}")
        except Exception as e:
            log.line(f"! json write: {e}")
        log.line(f"= run {status}  (profile={profile}, {elapsed}s)")
        if c:
            try:
                c.close()
            except Exception:
                pass
        log.close()


def spawn_background(argv: list[str]) -> int:
    """Detach a foreground measure; write state like test-bg."""
    LOGDIR.mkdir(parents=True, exist_ok=True)
    # Drop --bg from child argv
    child_argv = [a for a in argv if a != "--bg"]
    cmd = [sys.executable, str(Path(__file__).resolve()), *child_argv]
    fd = os.open(LOG_PATH, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o644)
    child = subprocess.Popen(
        cmd,
        cwd=str(ROOT),
        stdin=subprocess.DEVNULL,
        stdout=fd,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    os.close(fd)
    state = {
        "pid": child.pid,
        "log": str(LOG_PATH.relative_to(ROOT)),
        "json": str(JSON_PATH.relative_to(ROOT)),
        "started": datetime.now(timezone.utc).isoformat(),
        "cmd": cmd,
    }
    STATE_PATH.write_text(json.dumps(state, indent=2))
    print(f"> cdmcp-measure   pid={child.pid}  log={LOG_PATH.relative_to(ROOT)}")
    print(f"\ntail:    tail -f {LOG_PATH.relative_to(ROOT)}")
    print(f"json:    cat {JSON_PATH.relative_to(ROOT)}")
    print("check:   node tools/cdmcp-bg.mjs --status")
    print("block:   node tools/cdmcp-bg.mjs --wait")
    print(
        "watch:   until grep -qE '= run (passed|failed|timedout|interrupted)' "
        f"{LOG_PATH.relative_to(ROOT)}; do sleep 15; done; "
        f"grep -E '= run ' {LOG_PATH.relative_to(ROOT)} | tail -1"
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument(
        "profile",
        nargs="?",
        default="boot",
        choices=PROFILES,
        help="measurement profile (default: boot)",
    )
    p.add_argument("--url", help="full page URL (overrides --port + version.json)")
    p.add_argument(
        "--port",
        type=int,
        default=DEFAULT_PORT,
        help=f"local server port (default {DEFAULT_PORT}; env APEX_PORT/PORT)",
    )
    p.add_argument("--bg", action="store_true", help="detach to background; log under artifacts/logs/")
    args = p.parse_args(argv)

    if args.bg:
        # Rebuild argv for child without --bg
        child = [args.profile, f"--port={args.port}"]
        if args.url:
            child += [f"--url={args.url}"]
        return spawn_background(child)

    url = resolve_url(args)
    return run_measure(args.profile, url)


if __name__ == "__main__":
    sys.exit(main())
