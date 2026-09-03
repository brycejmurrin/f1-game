#!/usr/bin/env python3
# @doc Asserts the LAMPS tuner sliders via Chromium MCP using `lightState().meanLampRGB` / `bakedLights` / `lampPosts`.
# @skill mcp-probe
"""cdmcp-lamps-tune — assert LAMP DENSITY / LAMP TEMPERATURE / POOL ENERGY via MCP.

Drives chrome-devtools MCP against a localhost Apex tree and checks that the
LAMPS tuner sliders actually move baked counts and per-frame lamp colour
(warmth). Not a CI Playwright gate — interactive / pre-push instrument twin of
cdmcp-lamps.py. Anchors watchers on:

  = run passed|failed|timedout|interrupted

Usage:
  python3 -m http.server 3456 &
  python3 tools/cdmcp-lamps-tune.py
  python3 tools/cdmcp-lamps-tune.py --bg --port 3456

Monitor:
  until grep -qE '= run (passed|failed|timedout|interrupted)' artifacts/logs/cdmcp-lamps-tune.log \\
    ; do sleep 15; done
  grep -E '= run ' artifacts/logs/cdmcp-lamps-tune.log | tail -1

Never run while a Playwright group is in flight (SwiftShader starvation).
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
OUT = ROOT / "scratch" / "captures" / "cdmcp-lamps-tune"
LOG_DIR = ROOT / "artifacts" / "logs"
LOG_PATH = LOG_DIR / "cdmcp-lamps-tune.log"
PID_PATH = LOG_DIR / "cdmcp-lamps-tune.pid"
STATUS_PATH = LOG_DIR / "cdmcp-lamps-tune.status"
JSON_PATH = LOG_DIR / "cdmcp-lamps-tune.json"

DEFAULT_PORT = int(os.environ.get("APEX_PORT") or os.environ.get("PORT") or "3456")

# TUNE_DEFS extremes — read from js/game/lighting-knobs.js, do not invent:
#   lampDensity  min 0.5 max 2.5 def 1.0
#   lampTemp     min -2  max 2   def 0
#   poolEnergy   min 0.04 max 2  def 0.55
TRACK = "monza"
FRAC = 0.10


class Logger:
    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self._fp = path.open("w", buffering=1)

    def log(self, msg: str) -> None:
        ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
        line = f"[{ts}] {msg}"
        print(line, flush=True)
        self._fp.write(line + "\n")
        self._fp.flush()

    def progress(self, i: int, total: int, detail: str) -> None:
        self.log(f"{i}/{total} done — {detail}")

    def terminal(self, status: str) -> None:
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


def parse_apex(text: str) -> dict:
    """Pull the JSON blob out of an evaluate_script text_result."""
    if not text:
        return {"ok": False, "error": "empty"}
    # Result often wraps as: Script ran… ```json … ```
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end < start:
        return {"ok": False, "error": "no-json", "raw": text[:400]}
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError as e:
        return {"ok": False, "error": f"json:{e}", "raw": text[:400]}


BOOT_JS = f"""async () => {{
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 80 && !window.__apex; i++) await wait(250);
  if (!window.__apex) return {{ ok: false, error: "no-apex" }};
  const a = window.__apex;
  a.race({TRACK!r});
  for (let i = 0; i < 100 && !(a.info() && a.info().track); i++) await wait(200);
  if (!(a.info() && a.info().track)) return {{ ok: false, error: "track-timeout" }};
  a.go();
  a.setTimeOfDay('night');
  a.freeze(false);
  a.park({FRAC});
  a.orbit({FRAC}, 35, 18, 70);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await wait(600);
  const ls = a.lightState();
  return {{
    ok: true,
    track: a.info().track,
    dens: a.lightTune().lampDensity,
    lampTemp: a.lightTune().lampTemp,
    poolEnergy: a.lightTune().poolEnergy,
    builtNight: ls.builtNight,
    numLights: ls.numLights,
    bakedLights: ls.bakedLights,
    lampPosts: ls.lampPosts,
    meanLampRGB: ls.meanLampRGB,
    hasMean: Array.isArray(ls.meanLampRGB),
  }};
}}"""


def dens_js(dens: float) -> str:
    # Pin dens, then flip day→night so loadTrack rebuilds mast stride (night→night
    # is a no-op for geometry — see __apex.setTimeOfDay). Re-assert LT after each
    # applyRaceSettings so the profile cannot wipe the slider.
    return f"""async () => {{
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const a = window.__apex;
  a.lightTune({{ lampDensity: {dens}, lampGapFill: 0 }});
  a.setTimeOfDay('day');
  a.lightTune({{ lampDensity: {dens}, lampGapFill: 0 }});
  a.setTimeOfDay('night');
  for (let i = 0; i < 80 && !(a.info() && a.info().track); i++) await wait(100);
  a.lightTune({{ lampDensity: {dens}, lampGapFill: 0 }});
  a.park({FRAC});
  a.orbit({FRAC}, 35, 18, 70);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await wait(800);
  const ls = a.lightState();
  return {{
    ok: true,
    dens: a.lightTune().lampDensity,
    bakedLights: ls.bakedLights,
    lampPosts: ls.lampPosts,
    numLights: ls.numLights,
    meanLampRGB: ls.meanLampRGB,
  }};
}}"""


def temp_js(temp: float) -> str:
    # lampTemp is live per-frame (floodScale) — no rebuild required.
    return f"""async () => {{
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const a = window.__apex;
  a.lightTune({{ lampTemp: {temp} }});
  a.park({FRAC});
  a.orbit({FRAC}, 35, 18, 70);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await wait(500);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const ls = a.lightState();
  const rgb = ls.meanLampRGB;
  const rb = (rgb && rgb[2] > 1e-6) ? (rgb[0] / rgb[2]) : null;
  return {{
    ok: true,
    lampTemp: a.lightTune().lampTemp,
    meanLampRGB: rgb,
    rOverB: rb,
    numLights: ls.numLights,
  }};
}}"""


def energy_js(energy: float) -> str:
    return f"""async () => {{
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const a = window.__apex;
  a.lightTune({{ poolEnergy: {energy} }});
  a.park({FRAC});
  a.orbit({FRAC}, 35, 18, 70);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await wait(600);
  const ls = a.lightState();
  const rgb = ls.meanLampRGB;
  const mag = rgb ? Math.hypot(rgb[0], rgb[1], rgb[2]) : null;
  return {{
    ok: true,
    poolEnergy: a.lightTune().poolEnergy,
    meanLampRGB: rgb,
    mag,
    bakedLights: ls.bakedLights,
    numLights: ls.numLights,
  }};
}}"""


def check(name: str, cond: bool, detail: str, failures: list) -> None:
    if cond:
        return
    failures.append(f"{name}: {detail}")


def run(log: Logger, url: str, *, shots: bool) -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    build = json.loads((ROOT / "version.json").read_text())["build"]
    log.log(f"cdmcp-lamps-tune start build={build} url={url}")
    STATUS_PATH.write_text("running\n")

    mod = load_cdmcp()
    c = mod.McpClient(roots=[f"file://{ROOT}", "file:///tmp"])
    report: dict = {"build": build, "url": url, "checks": [], "failures": []}
    failures: list[str] = []
    status = "failed"
    try:
        log.log("mcp: initialize + roots")
        c.start()
        log.log(f"navigate {url}")
        nav = mod.text_result(c.call("navigate_page", {"url": url}))
        log.log(f"navigate: {nav.splitlines()[0] if nav else '(empty)'}")
        if "ERR_" in nav or "Unable to navigate" in nav:
            log.log("FATAL: localhost not serving — start: python3 -m http.server <port>")
            status = "failed"
            return 1
        time.sleep(1.5)

        # ── boot ────────────────────────────────────────────────────────────
        log.log("boot monza night")
        boot = parse_apex(mod.text_result(c.call("evaluate_script", {"function": BOOT_JS})))
        log.log(f"  boot: {json.dumps(boot)[:500]}")
        check("boot.ok", bool(boot.get("ok")), str(boot), failures)
        check("boot.meanLampRGB", bool(boot.get("hasMean")), "lightState missing meanLampRGB — bump cache?", failures)
        check("boot.night", bool(boot.get("builtNight")), f"builtNight={boot.get('builtNight')}", failures)
        check("boot.lights", (boot.get("numLights") or 0) >= 8, f"numLights={boot.get('numLights')}", failures)
        report["boot"] = boot

        # ── LAMP DENSITY ────────────────────────────────────────────────────
        log.log("assert lampDensity 0.5 vs 2.5")
        sparse = parse_apex(mod.text_result(c.call("evaluate_script", {"function": dens_js(0.5)})))
        dense = parse_apex(mod.text_result(c.call("evaluate_script", {"function": dens_js(2.5)})))
        log.log(f"  sparse: {json.dumps(sparse)[:400]}")
        log.log(f"  dense:  {json.dumps(dense)[:400]}")
        check("dens.sparse.ok", sparse.get("ok") and sparse.get("dens") == 0.5, str(sparse), failures)
        check("dens.dense.ok", dense.get("ok") and dense.get("dens") == 2.5, str(dense), failures)
        sb, db = sparse.get("bakedLights") or 0, dense.get("bakedLights") or 0
        sp, dp = sparse.get("lampPosts") or 0, dense.get("lampPosts") or 0
        check("dens.baked", db > sb, f"baked dense={db} sparse={sb}", failures)
        check("dens.posts", dp > sp, f"posts dense={dp} sparse={sp}", failures)
        report["density"] = {"sparse": sparse, "dense": dense}
        if shots:
            for tag, fn in (("dens05", dens_js(0.5)), ("dens25", dens_js(2.5))):
                c.call("evaluate_script", {"function": fn})
                path = OUT / f"monza-{tag}-night.png"
                c.call("take_screenshot", {"filePath": str(path), "format": "png"})
                log.log(f"  shot {path.name} {path.stat().st_size if path.exists() else 0}B")

        # ── LAMP TEMPERATURE (warmth) ───────────────────────────────────────
        log.log("assert lampTemp -2 (warm) vs +2 (cool)")
        # Reset dens to 1 so colour compare is on a stable fixture set.
        c.call("evaluate_script", {"function": dens_js(1.0)})
        warm = parse_apex(mod.text_result(c.call("evaluate_script", {"function": temp_js(-2)})))
        cool = parse_apex(mod.text_result(c.call("evaluate_script", {"function": temp_js(2)})))
        log.log(f"  warm: {json.dumps(warm)[:400]}")
        log.log(f"  cool: {json.dumps(cool)[:400]}")
        check("temp.warm.ok", warm.get("ok") and warm.get("lampTemp") == -2, str(warm), failures)
        check("temp.cool.ok", cool.get("ok") and cool.get("lampTemp") == 2, str(cool), failures)
        wrb, crb = warm.get("rOverB"), cool.get("rOverB")
        check("temp.rOverB", isinstance(wrb, (int, float)) and isinstance(crb, (int, float)) and wrb > crb,
              f"warm R/B={wrb} cool R/B={crb} (warm must be higher)", failures)
        report["temperature"] = {"warm": warm, "cool": cool}
        if shots:
            for tag, t in (("temp-warm", -2), ("temp-cool", 2)):
                c.call("evaluate_script", {"function": temp_js(t)})
                path = OUT / f"monza-{tag}-night.png"
                c.call("take_screenshot", {"filePath": str(path), "format": "png"})
                log.log(f"  shot {path.name} {path.stat().st_size if path.exists() else 0}B")

        # ── POOL ENERGY ─────────────────────────────────────────────────────
        log.log("assert poolEnergy 0.04 vs 2.0")
        lo = parse_apex(mod.text_result(c.call("evaluate_script", {"function": energy_js(0.04)})))
        hi = parse_apex(mod.text_result(c.call("evaluate_script", {"function": energy_js(2.0)})))
        log.log(f"  lo: {json.dumps(lo)[:400]}")
        log.log(f"  hi: {json.dumps(hi)[:400]}")
        check("energy.lo.ok", lo.get("ok") and abs((lo.get("poolEnergy") or 0) - 0.04) < 1e-6, str(lo), failures)
        check("energy.hi.ok", hi.get("ok") and hi.get("poolEnergy") == 2, str(hi), failures)
        lmag, hmag = lo.get("mag"), hi.get("mag")
        check("energy.mag", isinstance(lmag, (int, float)) and isinstance(hmag, (int, float)) and hmag > lmag * 1.5,
              f"hi mag={hmag} lo mag={lmag}", failures)
        report["energy"] = {"lo": lo, "hi": hi}
        if shots:
            for tag, e in (("energy-lo", 0.04), ("energy-hi", 2.0)):
                c.call("evaluate_script", {"function": energy_js(e)})
                path = OUT / f"monza-{tag}-night.png"
                c.call("take_screenshot", {"filePath": str(path), "format": "png"})
                log.log(f"  shot {path.name} {path.stat().st_size if path.exists() else 0}B")

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
        failures.append(f"fatal: {e}")
        return 1
    finally:
        try:
            c.close()
        except Exception:
            pass
        report["failures"] = failures
        JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
        JSON_PATH.write_text(json.dumps(report, indent=2))
        if status not in ("interrupted",):
            status = "passed" if not failures else "failed"
        STATUS_PATH.write_text(f"{status}\n{len(failures)} failures\n")
        if failures:
            for f in failures:
                log.log(f"FAIL {f}")
        log.log(f"summary failures={len(failures)} → {JSON_PATH}")
        log.terminal(status)

    return 0 if status == "passed" else 1


def spawn_bg(forward: list[str]) -> int:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    if LOG_PATH.exists():
        LOG_PATH.write_text("")
    STATUS_PATH.write_text("starting\n")
    cmd = [sys.executable, str(Path(__file__).resolve()), *forward]
    env = {**os.environ, "PYTHONUNBUFFERED": "1"}
    with LOG_PATH.open("a") as fp:
        fp.write(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] spawning {' '.join(cmd)}\n")
        fp.flush()
        proc = __import__("subprocess").Popen(
            cmd, stdout=fp, stderr=fp, cwd=str(ROOT), env=env, start_new_session=True
        )
    PID_PATH.write_text(str(proc.pid))
    print(f"cdmcp-lamps-tune background pid={proc.pid}")
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
    ap.add_argument("--port", type=int, default=DEFAULT_PORT,
                    help=f"static server port (default {DEFAULT_PORT}; env APEX_PORT/PORT)")
    ap.add_argument("--url", help="full page URL (overrides --port + version.json)")
    ap.add_argument("--shots", action="store_true", help="also write evidence PNGs under scratch/captures/")
    ap.add_argument("--no-shots", action="store_true", help="skip PNGs (default is shots ON)")
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
        if args.shots:
            forward.append("--shots")
        if args.no_shots:
            forward.append("--no-shots")
        return spawn_bg(forward)

    # Default: take evidence shots unless --no-shots.
    take_shots = not args.no_shots
    if args.shots:
        take_shots = True
    log = Logger(LOG_PATH)
    try:
        return run(log, resolve_url(args), shots=take_shots)
    finally:
        log.close()


if __name__ == "__main__":
    raise SystemExit(main())
