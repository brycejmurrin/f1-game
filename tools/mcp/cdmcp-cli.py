#!/usr/bin/env python3
# @doc Stdio JSON-RPC client for chrome-devtools MCP: `list-tools`, `call`, `survey-title`, `apex-shot`, `slider-ab`.
# @skill mcp-probe
"""Drive chrome-devtools MCP over stdio from the shell.

Examples:
  python3 tools/mcp/cdmcp-cli.py list-tools
  python3 tools/mcp/cdmcp-cli.py call navigate_page '{"url":"http://127.0.0.1:3456/"}'
  python3 tools/mcp/cdmcp-cli.py call evaluate_script '{"function":"() => document.title"}'
  python3 tools/mcp/cdmcp-cli.py survey-title
  python3 tools/mcp/cdmcp-cli.py measure boot --port 3462
  python3 tools/mcp/cdmcp-cli.py measure ui --bg
  python3 tools/mcp/cdmcp-cli.py apex-shot monza 0.97 --az -105 --el 26 --dist 110
  python3 tools/mcp/cdmcp-cli.py slider-ab bahrain 0.45 --tod night \\
      --set '{"shadowRange":300,"moonShadow":1}'

apex-shot uses orbit() (a free-cam) to frame shots — great for "does this scenery/
car geometry look right", WRONG for A/B-ing anything render-distance-sensitive
(the free-cam zeroes the draw-distance cull; see slider-ab's docstring and
.claude/skills/mcp-probe's FIFTH trap). Use slider-ab, not apex-shot, to test a
__apex.lightTune() knob's before/after visual effect.
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

ROOT = Path(__file__).resolve().parent.parent.parent
WRAPPER = ROOT / "tools" / "mcp" / "chrome-devtools-mcp.sh"
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


def eval_json(result: dict):
    """Parse the JSON value out of an evaluate_script text_result. The
    chrome-devtools MCP wraps the raw JS return value as prose + a ```json
    fence ("Script ran on page and returned:\\n```json\\n{...}\\n```"), not bare
    JSON — a plain json.loads(text_result(...)) fails on that wrapper."""
    txt = text_result(result)
    if "```" in txt:
        fence = txt.split("```", 2)[1]
        if fence.startswith("json"):
            fence = fence[4:]
        txt = fence
    return json.loads(txt.strip())


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
    """Delegate to tools/mcp/cdmcp-measure.py (background-friendly Chromium logs)."""
    script = ROOT / "tools" / "mcp" / "cdmcp-measure.py"
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


def cmd_slider_ab(argv: list[str]) -> None:
    """A/B a lighting-tuner (or any __apex.lightTune) knob change under a
    camera setup that's actually stable and actually respects the thing being
    tested — see .claude/skills/mcp-probe's FIFTH trap for why this exists.

    Unlike apex-shot (which uses orbit(), a free-cam that zeroes the
    render-distance cull — fine for framing shots, WRONG for A/B-ing a
    render-distance-sensitive knob), this command:
      - steps the race well past the start-lights hold BEFORE parking, so the
        grid-reset doesn't discard the parked position after the fact;
      - uses `chase` (player-relative, not a free-cam and not a broadcast-cut
        mode like heli/far that re-targets between calls) so cullDist and
        farPlane behave as they would for a real player;
      - re-reads viewState().eye/tgt after the tune change and FAILS LOUDLY if
        the camera moved, instead of silently comparing two different frames;
      - diffs the two screenshots (if PIL/numpy are available) and reports a
        same-scene noise floor alongside the signal, so "no visible effect"
        and "camera/noise dominated the frame" don't look the same.

    Example:
      python3 tools/mcp/cdmcp-cli.py slider-ab bahrain 0.45 \\
        --set '{"shadowRange":300,"moonShadow":1,"lampReach":4,"renderDistMul":2}' \\
        --tod night --out-prefix scratch/captures/shadowrange-ab
    """
    p = argparse.ArgumentParser(prog="slider-ab")
    p.add_argument("track", nargs="?", default="bahrain")
    p.add_argument("frac", nargs="?", type=float, default=0.45)
    p.add_argument("--set", required=True,
                    help='JSON dict of __apex.lightTune() values to apply for the '
                         '"after" shot, e.g. \'{"shadowRange":300}\'. Pass \'{}\' for '
                         "a same-value noise-floor check instead of a real A/B.")
    p.add_argument("--tod", default="night")
    p.add_argument("--weather", default="dry")
    p.add_argument("--camera", default="chase",
                    help="player-relative camera mode (default chase). heli/far/orbit/"
                         "view are NOT safe here — see the docstring above.")
    p.add_argument("--start-hold", type=int, default=120,
                    help="frames to step past the race start-lights hold before parking")
    p.add_argument("--settle", type=int, default=20,
                    help="frames to step after each tune change before screenshotting")
    p.add_argument("--port", type=int,
                    default=int(__import__("os").environ.get("APEX_PORT") or __import__("os").environ.get("PORT") or "3456"))
    p.add_argument("--out-prefix", default=None,
                    help="default: scratch/captures/slider-ab/<track>-<frac>")
    p.add_argument("--hud-crop-frac", type=float, default=0.28,
                    help="top fraction of the frame to exclude from the scene-only MAD "
                         "(default 0.28 — the POS/LAP/TIME row's race clock ticks every "
                         "settle step and otherwise dominates the noise floor; see report)")
    args = p.parse_args(argv)

    try:
        set_vals = json.loads(args.set)
    except json.JSONDecodeError as e:
        print(f"--set is not valid JSON: {e}", file=sys.stderr)
        sys.exit(1)

    if args.camera not in ("chase", "cockpit", "hood", "reverse", "tcam"):
        print(f"warning: --camera {args.camera!r} is not a confirmed player-relative "
              "mode (known-safe: chase, cockpit, hood, reverse, tcam) — heli/far/side/"
              "cinematic/overhead re-cut between calls, and this tool cannot detect "
              "that for you beyond the eye/tgt check below.", file=sys.stderr)

    prefix = Path(args.out_prefix) if args.out_prefix else \
        ROOT / "scratch" / "captures" / "slider-ab" / f"{args.track}-{args.frac}"
    prefix.parent.mkdir(parents=True, exist_ok=True)
    before_png = Path(f"{prefix}-before.png")
    after_png = Path(f"{prefix}-after.png")

    server = _ensure_static_server(args.port)
    url = f"http://127.0.0.1:{args.port}/"
    c = McpClient()
    try:
        c.start()
        print(f"→ navigate_page {url}")
        c.call("navigate_page", {"url": url})

        setup_js = f"""async () => {{
  const wait = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 80 && !window.__apex; i++) await wait(250);
  if (!window.__apex) return {{ ok: false, error: "no __apex" }};
  const a = window.__apex;
  if (typeof Assets !== "undefined" && Assets.loadModels) {{ try {{ await Assets.loadModels(); }} catch (_) {{}} }}
  a.race({json.dumps(args.track)});
  for (let i = 0; i < 80 && !(a.info() && a.info().track); i++) await wait(200);
  a.go();
  if (a.weather) a.weather({json.dumps(args.weather)});
  if (a.setTimeOfDay) a.setTimeOfDay({json.dumps(args.tod)});
  a.step(1/60, {args.start_hold});   // clear the start-lights hold BEFORE parking
  a.camera({json.dumps(args.camera)});
  a.park({args.frac});
  a.snapCam();
  a.step(1/60, {args.settle});
  await wait(300);
  return {{ ok: true, view: a.viewState(), tune: a.lightTune(), info: a.info() }};
}}"""
        print("→ evaluate_script (boot → race → step past start → park chase)")
        setup_r = eval_json(c.call("evaluate_script", {"function": setup_js}))
        if not setup_r.get("ok"):
            print(f"setup failed: {setup_r}", file=sys.stderr)
            sys.exit(1)
        view_before = setup_r["view"]
        if view_before.get("dbgCamActive"):
            print("warning: dbgCamActive=true after park()+snapCam() — the render-"
                  "distance cull will read as uncapped regardless of the knob under "
                  "test (frame.cullDist=0 under any free-cam). --camera should not "
                  "have set G.dbgCam.", file=sys.stderr)

        print(f"→ take_screenshot (before) {before_png}")
        c.call("take_screenshot", {"filePath": str(before_png)})

        tune_js = f"""async () => {{
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const a = window.__apex;
  a.lightTune({json.dumps(set_vals)});
  a.step(1/60, {args.settle});
  await wait(300);
  return {{
    view: a.viewState(), tune: a.lightTune(),
    errors: a.logs({{level:'error'}}), gfx: a.logs({{ns:'gfx'}}),
  }};
}}"""
        print(f"→ evaluate_script (lightTune({args.set}) → settle)")
        tune_r = eval_json(c.call("evaluate_script", {"function": tune_js}))
        view_after = tune_r["view"]

        print(f"→ take_screenshot (after) {after_png}")
        c.call("take_screenshot", {"filePath": str(after_png)})

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

    # ---- report ----
    print()
    print("== slider-ab report ==")
    cam_stable = True
    for k in ("eye", "tgt"):
        b, af = view_before.get(k), view_after.get(k)
        if b is None or af is None:
            continue
        delta = max(abs(x - y) for x, y in zip(b, af))
        if delta > 1e-3:
            cam_stable = False
            print(f"CAMERA MOVED: {k} before={b} after={af} (delta {delta:.4f}) — "
                  "this before/after pair is NOT a valid comparison, see mcp-probe "
                  "skill's FIFTH trap")
    print(f"camera stable: {cam_stable}")
    print(f"dbgCamActive before/after: {view_before.get('dbgCamActive')}/{view_after.get('dbgCamActive')}")
    requested = set(set_vals.keys())
    applied = {k: (setup_r['tune'].get(k), tune_r['tune'].get(k)) for k in requested}
    print(f"requested knobs (before -> after): {applied}")
    errs = tune_r.get("errors") or []
    gfx = tune_r.get("gfx") or []
    print(f"errors: {len(errs)}  gfx warnings: {len(gfx)}")
    if errs:
        print(f"  errors: {errs}")
    if gfx:
        print(f"  gfx: {gfx}")

    try:
        from PIL import Image
        import numpy as np
        a = np.array(Image.open(before_png).convert("RGB"), dtype=np.int16)
        b = np.array(Image.open(after_png).convert("RGB"), dtype=np.int16)
        diff = np.abs(a - b)
        mad = float(diff.mean())
        mx = int(diff.max())
        hud_rows = int(diff.shape[0] * args.hud_crop_frac)
        scene_mad = float(diff[hud_rows:].mean())
        diffmap_png = Path(f"{prefix}-diffmap.png")
        d = np.abs(a.astype(np.int32) - b.astype(np.int32)).sum(axis=2)
        d2 = (d / max(d.max(), 1) * 255).astype("uint8")
        Image.fromarray(d2).save(diffmap_png)
        print(f"pixel diff: full-frame MAD={mad:.3f}  scene-only MAD={scene_mad:.3f} "
              f"(below row {hud_rows}, excludes the ticking POS/LAP/TIME HUD)  max={mx}")
        print(f"  diffmap: {diffmap_png}")
        print("NOTE: neither MAD is self-interpreting — run this same command again with "
              "--set '{}' on the same track/frac to get a same-value noise floor (which "
              "itself won't be ~0 on full-frame, since the race clock ticks every settle "
              "step regardless of the tune — that's why scene-only exists), and trust a "
              "signal only if it clears the matching noise-floor MAD by several times over "
              "(see mcp-probe skill's FOURTH trap).")
    except ImportError:
        print("(PIL/numpy not installed — skipping pixel diff; compare "
              f"{before_png} and {after_png} by eye)")

    print(f"before: {before_png}")
    print(f"after:  {after_png}")


# dawn/dusk/night share one mesh build; day is the other (js/game.js loadTrack).
# Weather-only flips are applyRaceSettings — no 1.6 s rebuild.
DEFAULT_LOOK_COMBOS = (
    "dawn|dry,dawn|wet,dawn|rain,dawn|fog,dawn|overcast,"
    "day|dry,day|wet,day|rain,day|fog,day|overcast,"
    "dusk|dry,dusk|wet,dusk|rain,dusk|fog,dusk|overcast,"
    "night|dry,night|wet,night|rain,night|fog,night|overcast"
)


def session_dark(tod: str) -> bool:
    return tod != "day"


def parse_look_combos(raw: str) -> list[tuple[str, str]]:
    combos: list[tuple[str, str]] = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        tod, wx = part.split("|", 1)
        combos.append((tod, wx))
    return combos


def sort_combos_min_rebuild(
    combos: list[tuple[str, str]], prefer_dark: bool
) -> list[tuple[str, str]]:
    """Group by sessionDark so loadTrack rebuilds at most once per track."""
    wx_order = {"dry": 0, "wet": 1, "rain": 2, "fog": 3, "overcast": 4}
    tod_order = {"day": 0, "dawn": 1, "dusk": 2, "night": 3}

    def key(c: tuple[str, str]) -> tuple[int, int, int]:
        dark = session_dark(c[0])
        group = 0 if dark == prefer_dark else 1
        return (group, tod_order.get(c[0], 9), wx_order.get(c[1], 9))

    return sorted(combos, key=key)


def look_boot_js(track: str) -> str:
    return f"""async () => {{
  const wait = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 80 && !window.__apex; i++) await wait(250);
  if (!window.__apex) return {{ ok: false, error: "no __apex" }};
  const a = window.__apex;
  if (typeof Assets !== "undefined" && Assets.loadModels) {{
    try {{ await Assets.loadModels(); }} catch (_) {{}}
  }}
  a.race({json.dumps(track)});
  for (let i = 0; i < 80 && !(a.info() && a.info().track); i++) await wait(200);
  a.go();
  a.step(1/60, 120);
  a.camera("chase");
  if (a.hud) a.hud(false);
  const ls = a.lightState ? a.lightState() : null;
  const info = a.info() || {{}};
  return {{
    ok: true,
    track: info.track,
    builtNight: ls && ls.builtNight,
    trackNight: ls && ls.trackNight,
  }};
}}"""


def look_settle_js(tod: str, wx: str, frac: float, prev_tod: str | None, parked: bool) -> str:
    """Settle one look. 1.6 s poll only when sessionDark flips (day ↔ dawn/dusk/night)."""
    return f"""async () => {{
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const a = window.__apex;
  const tod = {json.dumps(tod)};
  const wx = {json.dumps(wx)};
  const frac = {frac};
  const prevTod = {json.dumps(prev_tod)};
  const parked = {json.dumps(parked)};
  if (a.weather) a.weather(wx);
  if (prevTod !== tod && a.setTimeOfDay) a.setTimeOfDay(tod);
  const nowDark = tod !== "day";
  const prevDark = prevTod == null ? null : prevTod !== "day";
  const rebuilt = prevDark == null || nowDark !== prevDark;
  if (!parked || rebuilt) {{
    a.park(frac);
    a.snapCam();
  }}
  if (rebuilt) {{
    const t0 = performance.now();
    while (performance.now() - t0 < 1800) {{
      const ls = a.lightState && a.lightState();
      if (ls && !!ls.builtNight === nowDark) break;
      await wait(40);
    }}
    a.step(1/60, 6);
  }} else {{
    a.step(1/60, 2);
  }}
  await new Promise(r => requestAnimationFrame(r));
  const ls = a.lightState ? a.lightState() : null;
  return {{
    ok: true,
    rebuilt,
    tod: a.setTimeOfDay(),
    weather: a.weather(),
    lightState: ls,
    exposure: ls && ls.exposure,
    numLights: ls && ls.numLights,
    sunY: ls && ls.sunY,
    builtNight: ls && ls.builtNight,
  }};
}}"""


def survey_track_looks(
    c: McpClient,
    track: str,
    frac: float,
    combos: list[tuple[str, str]],
    out_dir: Path,
    prefer_dark: bool | None = None,
) -> list[dict]:
    """Boot one track, shoot combos, merge state.json. Returns new look records."""
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"→ boot {track}")
    boot = eval_json(c.call("evaluate_script", {"function": look_boot_js(track)}))
    if not boot.get("ok"):
        print(f"boot failed {track}: {boot}", file=sys.stderr)
        return [{"track": track, "ok": False, "error": boot}]
    if prefer_dark is None:
        prefer_dark = bool(boot.get("trackNight") or boot.get("builtNight"))
    ordered = sort_combos_min_rebuild(combos, prefer_dark)
    prev: dict[str, dict] = {}
    state_path = out_dir / "state.json"
    if state_path.is_file():
        try:
            old = json.loads(state_path.read_text())
            for rec in old.get("looks") or []:
                if rec.get("combo"):
                    prev[rec["combo"]] = rec
        except Exception:
            prev = {}
    states: list[dict] = []
    prev_tod: str | None = None
    parked = False
    for tod, wx in ordered:
        print(f"  look {tod}|{wx}")
        rec = eval_json(c.call("evaluate_script", {
            "function": look_settle_js(tod, wx, frac, prev_tod, parked),
        }))
        png = out_dir / f"{tod}-{wx}.png"
        c.call("take_screenshot", {"filePath": str(png)})
        rec["png"] = str(png)
        rec["combo"] = f"{tod}|{wx}"
        prev[rec["combo"]] = rec
        states.append(rec)
        parked = True
        prev_tod = tod
        print(
            f"    wrote {png} rebuilt={rec.get('rebuilt')} "
            f"lights={rec.get('numLights')} exp={rec.get('exposure')} sunY={rec.get('sunY')}"
        )
    merged = list(prev.values())
    merged.sort(key=lambda r: r.get("combo") or "")
    state_path.write_text(
        json.dumps({"track": track, "frac": frac, "looks": merged}, indent=2) + "\n"
    )
    return states


def cmd_look_survey(argv: list[str]) -> None:
    """One Chrome boot, several tod×weather lighting looks, chase+park+snapCam.

    Uses chrome-devtools MCP (take_screenshot) — NOT Playwright. This is the
    right tool for a full per-circuit lighting matrix (4 tod × 5 weather = 20
    conditions) because it connects to a persistent Chrome session you can
    also inspect interactively.  slider-effect --live is better for A/B-ing a
    single LIGHTING TUNER knob because it owns its browser, locks the camera
    between shots, and produces pixel-diff outputs.

    Do NOT run look-survey while slider-effect --live is active — both open
    Chromium. Check first: pgrep -a chromium | head -3

    Outputs:
      artifacts/lighting/shots/<track>/<tod>-<wx>.png  — one per combo
      artifacts/lighting/shots/<track>/state.json       — lightState snapshot
      docs/look-survey/<track>_grid.png                 — stitched sheet
        (run: python3 tools/lighting/look-survey-sheet.py <track>)

    loadTrack rebuilds only on day ↔ dawn/dusk/night flip; weather-only combos
    skip the rebuild poll. Combos are sorted so each track rebuilds at most once.

    Examples:
      # All 20 conditions for Monaco
      python3 tools/mcp/cdmcp-cli.py look-survey monaco --frac 0.45
      # Specific subset
      python3 tools/mcp/cdmcp-cli.py look-survey bahrain --frac 0.12 \\
        --combos dawn|dry,day|dry,night|dry,night|rain
      # Batch plan (shoots only missing PNGs)
      python3 tools/mcp/cdmcp-cli.py look-survey --plan artifacts/lighting/survey-plan.json
      # Stitch the contact sheet after shooting
      python3 tools/lighting/look-survey-sheet.py monaco
    """
    p = argparse.ArgumentParser(prog="look-survey")
    p.add_argument("track", nargs="?", default=None)
    p.add_argument("--frac", type=float, default=0.12)
    p.add_argument(
        "--combos",
        default="day|dry,night|dry,day|rain,dawn|fog",
        help="comma list of tod|wx (dawn|day|dusk|night × dry|wet|rain|fog|overcast)",
    )
    p.add_argument(
        "--plan",
        default=None,
        help="JSON plan with tracks[] + optional combos; shoots every missing PNG",
    )
    p.add_argument(
        "--only",
        default="",
        help="with --plan, comma track ids",
    )
    p.add_argument("--force", action="store_true", help="re-shoot existing PNGs")
    p.add_argument(
        "--port",
        type=int,
        default=int(__import__("os").environ.get("APEX_PORT") or __import__("os").environ.get("PORT") or "3456"),
    )
    p.add_argument(
        "--out",
        default=None,
        help="directory for <tod>-<wx>.png + state.json (single-track mode)",
    )
    args = p.parse_args(argv)

    jobs: list[tuple[str, float, list[tuple[str, str]], Path, bool | None]] = []
    if args.plan:
        plan = json.loads(Path(args.plan).read_text())
        wanted = {s.strip() for s in args.only.split(",") if s.strip()}
        default_combos = parse_look_combos(plan.get("combos") or DEFAULT_LOOK_COMBOS)
        for t in plan["tracks"]:
            if wanted and t["id"] not in wanted:
                continue
            combos = parse_look_combos(t["combos"]) if t.get("combos") else default_combos
            out_dir = ROOT / "artifacts" / "lighting" / "shots" / t["id"]
            need = combos if args.force else [
                c for c in combos if not (out_dir / f"{c[0]}-{c[1]}.png").is_file()
            ]
            if not need:
                print(f"skip {t['id']} ({len(combos)}/{len(combos)} looks exist)")
                continue
            print(f"todo {t['id']} {len(need)}/{len(combos)} missing")
            jobs.append((t["id"], float(t["frac"]), need, out_dir, bool(t.get("night"))))
    else:
        if not args.track:
            print("look-survey needs a track or --plan", file=sys.stderr)
            sys.exit(2)
        combos = parse_look_combos(args.combos)
        if not combos:
            print("no combos", file=sys.stderr)
            sys.exit(1)
        out_dir = Path(args.out) if args.out else \
            ROOT / "artifacts" / "lighting" / "shots" / args.track
        jobs.append((args.track, float(args.frac), combos, out_dir, None))

    if not jobs:
        print("nothing to survey")
        print("= run passed (0/0 tracks)")
        return

    server = _ensure_static_server(args.port)
    url = f"http://127.0.0.1:{args.port}/"
    c = McpClient()
    summary = []
    try:
        c.start()
        print(f"→ navigate_page {url}")
        c.call("navigate_page", {"url": url})
        for track, frac, combos, out_dir, prefer_dark in jobs:
            states = survey_track_looks(c, track, frac, combos, out_dir, prefer_dark)
            ok = all(s.get("ok") for s in states)
            summary.append({"track": track, "ok": ok, "looks": len(states)})
            print(f"= {track} {'passed' if ok else 'failed'} ({len(states)} looks)")
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

    failed = [s for s in summary if not s.get("ok")]
    print(f"= run {'passed' if not failed else 'failed'} ({len(summary) - len(failed)}/{len(summary)} tracks)")
    if failed:
        sys.exit(1)


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
    elif cmd == "slider-ab":
        cmd_slider_ab(rest)
    elif cmd == "look-survey":
        cmd_look_survey(rest)
    else:
        print(f"unknown: {cmd}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
