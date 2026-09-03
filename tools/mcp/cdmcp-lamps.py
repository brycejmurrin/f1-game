#!/usr/bin/env python3
# @doc Night lamp screenshot suite via chrome-devtools MCP (Qatar, Singapore, Bahrain, Monza); `--port`, `--only`, `--limit`.
# @skill mcp-probe
"""cdmcp-lamps — night lamp screenshots via local chrome-devtools MCP + localhost.

Serves whichever worktree you point at — pass --port / APEX_PORT so parallel
worktrees do not fight over :3456.

Logs line-buffered to artifacts/logs/cdmcp-lamps.log so a background watcher can
anchor on the terminal line:

  = run passed|failed|timedout|interrupted

Usage:
  python3 -m http.server 3462 &          # this worktree
  python3 tools/mcp/cdmcp-lamps.py --port 3462
  APEX_PORT=3462 python3 tools/mcp/cdmcp-lamps.py --bg
  python3 tools/mcp/cdmcp-lamps.py --port 3462 --only monza   # smoke subset

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

ROOT = Path(__file__).resolve().parent.parent.parent
OUT = ROOT / "scratch" / "captures" / "cdmcp-lamps"
LOG_DIR = ROOT / "artifacts" / "logs"
LOG_PATH = LOG_DIR / "cdmcp-lamps.log"
PID_PATH = LOG_DIR / "cdmcp-lamps.pid"
STATUS_PATH = LOG_DIR / "cdmcp-lamps.status"

# Default port: APEX_PORT env (worktree convention) then 3456.
DEFAULT_PORT = int(os.environ.get("APEX_PORT") or os.environ.get("PORT") or "3456")

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
    spec = importlib.util.spec_from_file_location("cdmcp", ROOT / "tools" / "mcp" / "cdmcp-cli.py")
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
  // Density must be set BEFORE reading baked lights; lightTune(rebuild) nulls
  // track._lights and the next presented frames rebuild via buildTrackLights.
  a.lightTune({{ lampDensity: {dens}, lampGapFill: 0 }});
  a.park({frac});
  a.orbit({frac}, 40, 16, 55);
  // Present frames so the flood path rebuilds _lights after the dens change.
  a.step(1/60, 12);
  await wait(400);
  const ls = a.lightState();
  const at = a.atmosphere();
  const vs = a.viewState && a.viewState();
  return {{
    ok: true,
    track: a.info().track,
    dens: a.lightTune().lampDensity,
    numLights: ls.numLights,
    bakedLights: ls.bakedLights,
    lampPosts: ls.lampPosts,
    floodEmit: ls.floodEmit,
    builtNight: ls.builtNight,
    brief: at.brief,
    dbgCam: vs && vs.dbgCamActive,
  }};
}}"""


def select_shots(only: list[str] | None, limit: int | None) -> list[dict]:
    shots = list(SHOTS)
    if only:
        want = {x.lower() for x in only}
        shots = [s for s in shots if s["id"] in want or s["label"] in want]
    if limit is not None and limit >= 0:
        shots = shots[:limit]
    return shots


def run(log: Logger, *, url: str, shots: list[dict]) -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    build = json.loads((ROOT / "version.json").read_text())["build"]
    log.log(f"cdmcp-lamps start build={build} shots={len(shots)} url={url} out={OUT}")
    STATUS_PATH.write_text("running\n")

    mod = load_cdmcp()
    # Advertise worktree root + /tmp so take_screenshot(filePath=…) is allowed.
    c = mod.McpClient(roots=[f"file://{ROOT}", "file:///tmp"])
    report = []
    status = "failed"
    try:
        log.log("mcp: initialize + roots")
        c.start()
        log.log(f"navigate {url}")
        nav = mod.text_result(c.call("navigate_page", {"url": url}))
        log.log(f"navigate result: {nav.splitlines()[0] if nav else '(empty)'}")
        if "ERR_" in nav or "Unable to navigate" in nav:
            log.log(f"FATAL: not serving — start: python3 -m http.server <port>  (url was {url})")
            status = "failed"
            return 1
        time.sleep(1.5)

        for i, s in enumerate(shots, 1):
            tag = f"{s['id']}/{s['label']} dens={s['dens']}"
            log.log(f"shot {i}/{len(shots)} begin {tag}")
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
                # Parse dens vs bakedLights from the evaluate_script JSON blob.
                try:
                    import re
                    m = re.search(r"\{[^{}]*\"bakedLights\"[^{}]*\}", meta_txt)
                    if m:
                        blob = json.loads(m.group(0))
                        row["bakedLights"] = blob.get("bakedLights")
                        row["numLights"] = blob.get("numLights")
                        row["lampPosts"] = blob.get("lampPosts")
                except Exception:
                    pass
                report.append(row)
                flag = "BLANK" if blank else "ok"
                baked = row.get("bakedLights")
                extra = f" baked={baked}" if baked is not None else ""
                log.progress(
                    i, len(shots),
                    f"{tag} {kb:.1f}KB {flag}{extra} ({row['elapsed_s']}s)",
                )
            except Exception as e:
                log.log(f"  ERROR {tag}: {e}")
                report.append({**s, "error": str(e), "blank": True, "kb": 0})
                log.progress(i, len(shots), f"{tag} FAILED")

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
        (OUT / "report.json").write_text(json.dumps({"url": url, "shots": report}, indent=2))
        ok = sum(1 for r in report if not r.get("blank") and not r.get("error"))
        total = len(shots)
        # Gate: dens=2 shots must bake MORE lights than dens=1 on the same track.
        # Reading lightState().numLights alone is a false no-op (nearest-N cull).
        dens_fail = False
        by_track: dict[str, dict[float, int]] = {}
        for r in report:
            b = r.get("bakedLights")
            if b is None or r.get("error"):
                continue
            by_track.setdefault(r["id"], {})[float(r["dens"])] = int(b)
        for tid, dens_map in by_track.items():
            if 1.0 in dens_map and 2.0 in dens_map and dens_map[2.0] <= dens_map[1.0]:
                log.log(
                    f"! gate: {tid} dens=2 bakedLights={dens_map[2.0]} "
                    f"not > dens=1 bakedLights={dens_map[1.0]}"
                )
                dens_fail = True
        if status not in ("interrupted",):
            status = "passed" if ok == total and total > 0 and not dens_fail else "failed"
        STATUS_PATH.write_text(f"{status}\n{ok}/{total}\n")
        log.log(f"summary {ok}/{total} non-blank → {OUT}")
        log.terminal(status)

    return 0 if status == "passed" else 1


def spawn_bg(forward: list[str]) -> int:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    # Fresh log so a watcher seeded against an old terminal marker does not fire early.
    if LOG_PATH.exists():
        LOG_PATH.write_text("")
    STATUS_PATH.write_text("starting\n")
    cmd = [sys.executable, str(Path(__file__).resolve()), *forward]
    env = {**os.environ, "PYTHONUNBUFFERED": "1"}
    with LOG_PATH.open("a") as fp:
        fp.write(
            f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] spawning {' '.join(cmd)}\n"
        )
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


def resolve_url(args: argparse.Namespace) -> str:
    if args.url:
        return args.url
    build = json.loads((ROOT / "version.json").read_text())["build"]
    return f"http://127.0.0.1:{args.port}/?v={build}"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--bg", action="store_true", help="detach to background; log to artifacts/logs/")
    ap.add_argument("--status", action="store_true", help="print pid/status/last log line")
    ap.add_argument(
        "--port",
        type=int,
        default=DEFAULT_PORT,
        help=f"static server port (default {DEFAULT_PORT}; env APEX_PORT/PORT)",
    )
    ap.add_argument("--url", help="full page URL (overrides --port + version.json)")
    ap.add_argument(
        "--only",
        nargs="+",
        metavar="ID",
        help="subset by track id and/or label (e.g. monza qatar marina)",
    )
    ap.add_argument("--limit", type=int, help="cap shot count after --only filter")
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
        forward: list[str] = [f"--port={args.port}"]
        if args.url:
            forward.append(f"--url={args.url}")
        if args.only:
            forward.append("--only")
            forward.extend(args.only)
        if args.limit is not None:
            forward.append(f"--limit={args.limit}")
        return spawn_bg(forward)

    url = resolve_url(args)
    shots = select_shots(args.only, args.limit)
    if not shots:
        print("no shots selected", file=sys.stderr)
        return 2
    log = Logger(LOG_PATH)
    try:
        return run(log, url=url, shots=shots)
    finally:
        log.close()


if __name__ == "__main__":
    raise SystemExit(main())
