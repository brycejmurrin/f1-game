#!/usr/bin/env python3
"""cdmcp-lamps — night lamp screenshots via local chrome-devtools MCP + localhost.

Runs against the working tree served on http://127.0.0.1:3456 (start that yourself).
Logs line-buffered to artifacts/logs/cdmcp-lamps.log so a background watcher can
anchor on the terminal line:

  = run passed|failed|timedout|interrupted

Usage:
  python3 -m http.server 3456 &          # once
  python3 tools/cdmcp-lamps.py           # foreground
  python3 tools/cdmcp-lamps.py --bg      # background; prints log path + pid

Monitor:
  until grep -qE '= run (passed|failed|timedout|interrupted)' artifacts/logs/cdmcp-lamps.log \\
    ; do sleep 15; done
  grep -E '= run ' artifacts/logs/cdmcp-lamps.log | tail -1
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "scratch" / "captures" / "cdmcp-lamps"
LOG_DIR = ROOT / "artifacts" / "logs"
LOG_PATH = LOG_DIR / "cdmcp-lamps.log"
PID_PATH = LOG_DIR / "cdmcp-lamps.pid"
STATUS_PATH = LOG_DIR / "cdmcp-lamps.status"

SHOTS = [
    {"id": "qatar", "frac": 0.90, "label": "sf", "dens": 1.0},
    {"id": "qatar", "frac": 0.90, "label": "sf-dense", "dens": 2.0},
    {"id": "singapore", "frac": 0.12, "label": "marina", "dens": 1.0},
    {"id": "bahrain", "frac": 0.05, "label": "pit", "dens": 1.0},
    {"id": "monza", "frac": 0.10, "label": "generic", "dens": 1.0},
    {"id": "monza", "frac": 0.10, "label": "generic-dense", "dens": 2.0},
]


class Logger:
    """Line-buffered dual sink (stdout + log file) for background monitors."""

    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self._fp = path.open("w", buffering=1)  # line buffered
        self.n = 0

    def log(self, msg: str, *, level: str = "info") -> None:
        ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
        line = f"[{ts}] {msg}"
        print(line, flush=True)
        self._fp.write(line + "\n")
        self._fp.flush()
        self.n += 1

    def progress(self, i: int, total: int, detail: str) -> None:
        # Heartbeat-style line — do NOT match this with the terminal watcher.
        self.log(f"{i}/{total} done — {detail}", level="progress")

    def terminal(self, status: str) -> None:
        # THE line a background watcher must anchor on (same shape as test-bg).
        self.log(f"= run {status}")

    def close(self) -> None:
        try:
            self._fp.close()
        except Exception:
            pass


def load_cdmcp():
    spec = importlib.util.spec_from_file_location("cdmcp", ROOT / "tools" / "cdmcp-cli.py")
    mod = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(mod)
    return mod


def boot_js(track: str, frac: float, dens: float) -> str:
    return f"""async () => {{
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 80 && !window.__apex; i++) await wait(250);
  if (!window.__apex) return {{ ok: false, error: "no-apex" }};
  const a = window.__apex;
  a.race({track!r});
  for (let i = 0; i < 100 && !(a.info() && a.info().track); i++) await wait(200);
  if (!(a.info() && a.info().track)) return {{ ok: false, error: "track-timeout", track: {track!r} }};
  a.go();
  a.setTimeOfDay('night');
  a.freeze(false);
  a.lightTune({{ lampDensity: {dens} }});
  a.park({frac});
  a.orbit({frac}, 40, 16, 55);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await wait(1000);
  const ls = a.lightState();
  const at = a.atmosphere();
  const vs = a.viewState && a.viewState();
  return {{
    ok: true,
    track: a.info().track,
    dens: a.lightTune().lampDensity,
    numLights: ls.numLights,
    floodEmit: ls.floodEmit,
    builtNight: ls.builtNight,
    brief: at.brief,
    dbgCam: vs && vs.dbgCamActive,
  }};
}}"""


def run(log: Logger) -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    build = json.loads((ROOT / "version.json").read_text())["build"]
    log.log(f"cdmcp-lamps start build={build} shots={len(SHOTS)} out={OUT}")
    STATUS_PATH.write_text("running\n")

    mod = load_cdmcp()
    # Advertise /workspace so take_screenshot(filePath=…) is allowed.
    c = mod.McpClient(roots=[f"file://{ROOT}", "file:///tmp"])
    report = []
    status = "failed"
    try:
        log.log("mcp: initialize + roots")
        c.start()
        url = f"http://127.0.0.1:3456/?v={build}"
        log.log(f"navigate {url}")
        nav = mod.text_result(c.call("navigate_page", {"url": url}))
        log.log(f"navigate result: {nav.splitlines()[0] if nav else '(empty)'}")
        if "ERR_" in nav or "Unable to navigate" in nav:
            log.log("FATAL: localhost not serving — start: python3 -m http.server 3456")
            status = "failed"
            return 1
        time.sleep(1.5)

        for i, s in enumerate(SHOTS, 1):
            tag = f"{s['id']}/{s['label']} dens={s['dens']}"
            log.log(f"shot {i}/{len(SHOTS)} begin {tag}")
            t0 = time.time()
            try:
                meta = c.call(
                    "evaluate_script",
                    {"function": boot_js(s["id"], s["frac"], s["dens"])},
                )
                meta_txt = mod.text_result(meta)
                log.log(f"  apex: {meta_txt[:500].replace(chr(10), ' ')}")
                path = OUT / f"{s['id']}-{s['label']}-night.png"
                shot = c.call("take_screenshot", {"filePath": str(path), "format": "png"})
                shot_txt = mod.text_result(shot)
                log.log(f"  screenshot: {shot_txt[:240].replace(chr(10), ' ')}")
                kb = path.stat().st_size / 1024 if path.exists() else 0
                blank = kb < 5
                row = {
                    **s,
                    "meta": meta_txt,
                    "path": str(path),
                    "kb": round(kb, 1),
                    "blank": blank,
                    "elapsed_s": round(time.time() - t0, 1),
                }
                report.append(row)
                flag = "BLANK" if blank else "ok"
                log.progress(i, len(SHOTS), f"{tag} {kb:.1f}KB {flag} ({row['elapsed_s']}s)")
            except Exception as e:
                log.log(f"  ERROR {tag}: {e}")
                report.append({**s, "error": str(e), "blank": True, "kb": 0})
                log.progress(i, len(SHOTS), f"{tag} FAILED")

        try:
            log.log("park about:blank")
            c.call("navigate_page", {"url": "about:blank"})
        except Exception as e:
            log.log(f"park skipped: {e}")
    except KeyboardInterrupt:
        status = "interrupted"
        log.log("interrupted")
        return 130
    except Exception as e:
        status = "failed"
        log.log(f"FATAL: {e}")
        return 1
    finally:
        try:
            c.close()
        except Exception:
            pass
        (OUT / "report.json").write_text(json.dumps(report, indent=2))
        ok = sum(1 for r in report if not r.get("blank") and not r.get("error"))
        total = len(SHOTS)
        if status not in ("interrupted",):
            status = "passed" if ok == total else "failed"
        STATUS_PATH.write_text(f"{status}\n{ok}/{total}\n")
        log.log(f"summary {ok}/{total} non-blank → {OUT}")
        log.terminal(status)

    return 0 if status == "passed" else 1


def spawn_bg() -> int:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    # Fresh log so a watcher seeded against an old terminal marker does not fire early.
    if LOG_PATH.exists():
        LOG_PATH.write_text("")
    STATUS_PATH.write_text("starting\n")
    # Detach: re-exec ourselves without --bg, stdout/stderr → log.
    cmd = [sys.executable, str(Path(__file__).resolve())]
    # Line-buffered python so the watcher sees heartbeats live.
    env = {**os.environ, "PYTHONUNBUFFERED": "1"}
    with LOG_PATH.open("a") as fp:
        fp.write(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] spawning cdmcp-lamps\n")
        fp.flush()
        proc = __import__("subprocess").Popen(
            cmd,
            stdout=fp,
            stderr=fp,
            cwd=str(ROOT),
            env=env,
            start_new_session=True,
        )
    PID_PATH.write_text(str(proc.pid))
    print(f"cdmcp-lamps background pid={proc.pid}")
    print(f"log={LOG_PATH}")
    print(f"status={STATUS_PATH}")
    print("monitor:")
    print(
        f"  until grep -qE '= run (passed|failed|timedout|interrupted)' {LOG_PATH}"
        f"; do sleep 15; done; grep -E '= run ' {LOG_PATH} | tail -1"
    )
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--bg", action="store_true", help="detach to background; log to artifacts/logs/")
    ap.add_argument("--status", action="store_true", help="print pid/status/last log line")
    args = ap.parse_args()
    if args.status:
        pid = PID_PATH.read_text().strip() if PID_PATH.exists() else "?"
        st = STATUS_PATH.read_text().strip() if STATUS_PATH.exists() else "?"
        last = ""
        if LOG_PATH.exists():
            lines = LOG_PATH.read_text().splitlines()
            last = lines[-1] if lines else "(empty)"
        print(f"pid={pid} status={st}\nlast: {last}")
        return 0
    if args.bg:
        return spawn_bg()
    log = Logger(LOG_PATH)
    try:
        return run(log)
    finally:
        log.close()


if __name__ == "__main__":
    raise SystemExit(main())
