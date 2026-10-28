# PERF › IPHONE AUDIT 2026-10-21: live-site freeze, governor ladder §2u, TLX phone costs, BrowserStack profiling map

An external audit of the live site (https://brycejmurrin.github.io/f1-game/) run two ways on
2026-10-21 — a browser agent in a software-GL Chromium, and a local Playwright run — plus a
code-level pass over the iPhone render path and a capability check of BrowserStack for real-device
evidence. This note consolidates what was found so the fixes can cite one place. The governor and
thermal fixes that follow from §3–§4 land on the same branch as this note.

## 1. Live-site audit: what works, what freezes

Both tracks agree: the page itself is healthy. Menus, How to Play, searchable Settings, the
52-circuit Time Trial list, the Garage and the Data Hub (real data) all work; no failed resources
(local track: FCP 727 ms, DOMContentLoaded 2.8 s, load 4.7 s, 0 responses ≥ 400, 0 console errors,
0 uncaught page errors).

The failure is the graphics path in **software-GL environments**, and it is total:

- Round 1 (default graphics): starting a Time Trial froze the tab for 60 s+; the context-loss
  recovery fired as designed — menu plus the "Graphics reset — retrying with lighter settings"
  toast (`CTX_LOST_NOTICE_MSG`, `js/game.js`) — but RETRY then initialised the full HUD while the
  render loop starved the page indefinitely. No gameplay frame was ever presented.
- Round 2 (everything at its lowest: RESOLUTION LOW, GRAPHICS LOW, post effects off, then the
  renderer switched from THREE.JS to plain WEBGL2): the tab stayed busy 90 s+ and 150 s+
  respectively, with no toast and no HUD. **The freeze happens at every quality level and on both
  renderer paths in software GL.** Lowering settings does not save it.
- The local track could not reach gameplay at all: headless Firefox on that box has no WebGL in
  any configuration tried ("Failed to create WebGL context… Exhausted GL driver options"), so the
  game booted straight to the RendererPicker "Graphics unavailable" panel — the same `#nogl`
  surface the browser track reached after context loss.

Mechanism, from the code: the "Graphics reset" toast is WebGL/WebGPU **context-loss recovery**,
not a generic crash handler. GLX's handler (`js/render/glx/glx.js`) latches
`apex26.envProbeOff`/`apex26.perChunkOff`, counts `apex26.ctxLostReloads`, and reloads at most
twice before `RendererPicker.showUnavailable`. What no safety net covers is a loop that keeps
running but never presents: `js/perf/loop-health.js` faults only on exceptions (8 consecutive /
240 total throwing frames), never on frame duration, and the context handler needs a loss event.
A software rasteriser grinding multi-second frames trips neither.

Smaller findings from the same audit, recorded so they are not lost:

- ~1 in 6 fresh loads failed boot with an in-page toast "⚠ Promise rejection / [object Object]"
  (build 20458) — an unhandled promise rejection surfaced with a useless message; a reload fixed
  it. Intermittent and separate from the freeze.
- Data Hub lists R16 as "Bahrain Grand Prix in Malaysia" at Sepang — a name/circuit mismatch.
- ~12 unused-preload warnings for GLX backend files plus 3 fonts on the local track: GLX preloads
  are wasted when TLX is the bound default backend.

## 2. A correction, stated plainly: the <10 fps governor blindness is ALREADY FIXED

The first write-up of the freeze blamed the governor's degrade ladder being dead below ~10 fps —
every frame over the sample cap, `_frameEMA` stuck at its 16.7 ms seed, telemetry reporting a
fabricated ~59.9 fps. **That defect was fixed on 2026-09-02** and is pinned by tests:
`PERF-FINDINGS.md` §2t, `SPIKE_RUN = 3` / `SLOW_CAP = 1000` in `js/perf/governor.js` (isolated
over-cap frames are still discarded as spikes; a sustained run feeds the EMA clamped), with
coverage in `tests/unit/perf-governor.test.mjs` ("a device below 10 fps is SEEN by the governor").
Do not re-fix it and do not re-file it. What remains genuinely open from the freeze is the missing
frame-duration watchdog above, and §3 below.

## 3. The open governor problem: §2u — one rung of four is reachable on a slow phone

`PERF-FINDINGS.md` §2u (2026-09-10), still open. On a genuinely slow phone only the ladder's first
rung is ever taken: `_floorMs` creeps up at `FLOOR_UP_A` (0.02) toward the sustained frame time
until `degradeAt = _floorMs + 2.3` can never fire again — the window is ~2.7 s (frames ~3..90 at a
sustained 31.06 ms). After that the governor sits in its restore branch, periodically paying ~9 s
of dropped frames for climbs that `_pendingVerify` reverts (`_upBackoff` doubling 10 s → 2 min).
The live capture behind it: Suzuka, GLX, mobileTier, scale 0.5, **32.2 fps, tier 0, nothing shed**
— bloom, god-rays, SSR and per-chunk lamps all still on.

§2u's own prescription is the discriminator this branch implements: **an external cap is
indifferent to render scale; a fill-bound frame is not** — and `_pendingVerify` already measures
exactly that delta on every scale step. A step that moves the EMA is compute-bound proof the ladder
should keep shedding; a step that moves nothing is the cap signature the floor adaptation exists
to protect (iOS Low Power Mode / an external 30 Hz cap must still settle at full quality — pinned
by the governor test suite's first test). §2u was left as "the owner's call" upstream because any
fix trades against that protection; the verify evidence is what separates the two cases without
weakening it.

## 4. iPhone path facts (code-verified)

- The shipped iPhone path is **TLX on three's WebGL2 leg**, not WebGPU (`PHONE-GPU-TEST-2026-10-21.md`:
  "webgl2 is the iPhone path (TLX on three's WebGL2), webgpu is Android"). WGX is opt-in only.
  WebGPU is default-on only in **Safari 26 / iOS 26**; iOS 17/18 expose it behind a feature flag,
  older not at all. The owner decided 2026-10-21 to **keep TLX as the phone default**.
- Boot is probe-gated: `gpuAdapterAvailable()` races `navigator.gpu.requestAdapter()` against a
  4 s cap; no adapter → GLX boot (which also avoids fetching the ~1.1 MB TLX island). A boot
  canary (`apex26.gfxBackendProbe` / `gfxProbeStrikes`) reverts a backend that never presents.
- Phone quality default is **MEDIUM, tier floor 2** (tier 1 = env probe off; tier 2 = lamp
  spot-shadows + dry SSR off, pre-shed on phones). The governor can still add tier 3 (car
  sun-shadow off) and tier 4 (SSAO / god-rays / bloom off). Legacy `apex26.gfxHigh = 1` → ULTRA.
- DPR cap **1.5** on mobileTier; phone resolution default LOW = 0.5 render scale; ~844×390 CSS
  frame ≈ 741k px, no MSAA, half-res post targets. Crash sentinel: ≥ 2 jetsam strikes → floor
  tier 4 + `capDpr(1)`; strikes are build-keyed, a clean race pays one back.
- Thermal machinery exists in two halves that were never wired together: `js/perf/thermal-drift.js`
  detects sustained p50 drift, and `js/perf/render-rate.js` has 45/30 fps tiers — but the tiers
  are **player-opt-in only**, and drift currently only nudges governor rungs. (Wired on this
  branch — ranked item 3.)
- Already-fixed iOS landmine worth not re-discovering: `tsl-lit.js` `MAX_LIGHTS` is 16 on
  `_liteGpu` (mobile/WebKit/software) vs 48 elsewhere — 48 overran WebGL2's 224 fragment-uniform
  floor on iOS, failed the lit program link, and made the car see-through.

Cost centres on the iPhone profile (PERF-FINDINGS §2q and the TLX/GLX comparisons):

- TLX memory excess vs GLX is dominated by the **shadow pass (40.4 MB)** and the **env probe
  (12.8 MB)**; `js/render/three/tlx-shadow.js` itself notes TLX allocates targets GLX refuses on
  every phone. TLX also carries +30 MB in menu and +42–53 MB in race from three's CPU geometry
  copies — jetsam risk on the devices least able to afford it.
- Mirror on the lite rung still costs a 65–75k-triangle floor because the TLX road is one
  unchunked ~51k-triangle mesh (#2657).
- Post chain: half-res SSAO + blur, god-ray march (RGBA16F on TLX vs R11F on GLX), 5-level bloom,
  full-res composite, FXAA (#2649). Scene runs 101–122 draws/frame, 218–281k triangles.
- Race entry: **19.1 s TLX vs 5.9 s GLX** under phone caps on a Mac GPU (#1651).

## 5. BrowserStack: what it can and cannot measure for iPhone web

Checked against `@browserstack/mcp-server` v2.2.4's tool schemas and BrowserStack's docs
(2026-10-21), because "run the profiler on the iPhone session" turns out not to exist:

- BrowserStack **"Profiler" is App Profiling — App Automate only** (native apps; CPU/memory/
  battery charts). Against a web Automate session it returns 400 ("App Profiling is only supported
  for App Automate sessions"). It does not apply to web Live or web Automate sessions.
- **Browser Profiling** (`browserProfiling: true`, browser CPU + memory) supports Chrome/Edge on
  Windows/macOS and Safari on macOS only — **iOS Safari is not supported**.
- For iPhone *web*, what exists: Live sessions with the Safari Web Inspector in-session (network,
  DOM, debugger, storage — interactive only, no HAR/profile export), Record Session video, and
  in-session screenshots; scripted Automate adds video, `browserstack.debug` visual logs,
  `browserstack.consoleLogs`, and `browserstack.networkLogs = true` → network HAR. There is no
  MCP screenshot tool for browser sessions (`takeAppScreenshot` is app-only).
- Consequence: real-device frame evidence for this project still comes from the game's own
  instruments — the PHONE TEST / GPU TEST protocol (`PHONE-GPU-TEST-2026-10-21.md`), whose fields
  map onto the ranked list below (`gpuTest.fill.msPerFullFrame` → items 1, 2, 6;
  `gpuTest.mirrorMs` → item 5; `gpuTest.driftMs` → item 3) — with BrowserStack Live as the
  interactive inspection route, not a profiler.

## 6. Ranked improvements

Already built, do not engage (this branch, in order):

1. **Governor ladder §2u** — let the ladder reach rungs 2–4 on compute-bound phones via the
   `_pendingVerify` scale-response discriminator (§3). Largest lever.
2. **SGSR1 spatial upscale default ON at phone MEDIUM/LOW** (#1652) — was blocked on a real-GPU
   A/B. **Decided 2026-10-27: stays OFF** (iPhone 14 A/B, PR #3708; UPSCALING-2026-09 §7.7).
   Do not flip the default.
3. **Thermal → render rate** — auto-engage the RenderRate 45 fps tier from ThermalDrift's due
   signal, only when the player's render-rate setting is "auto"; never override an explicit
   player choice.
4. **TLX phone shadow allocations** — align them with what GLX refuses on phones (§4), gated to
   mobileTier / lite GPUs only. *Landed on this branch:* the one target still allocated against
   that rule — the PCSS blocker, built on the WebGPU leg even for phones — is now gated off on
   mobile; the sun/car/lamp targets were already aligned. The rest of §2q's 40.4 MB is three's
   shadow-pass machinery rather than target sizes, and is untouched.

New work, later:

5. Mirror triangle floor — chunk / index-LOD the TLX road for the mirror (#2657; step 1 is counting).
6. Tile-GPU bandwidth pack (#2649): god-ray target RGBA16F → R11F, 512² sky cache on mobileTier,
   depth-only shadow render target (needs three r187), framebuffer-invalidate audit.
7. Render-object diet (#2656, gated on phone JS-bound evidence): wheels as BatchedMesh ≈ −37
   render objects, brake rings instanced.
8. WebGPU leg: present-path / submission overhead (~9 `queue.submit` per frame, soft-blit readback).
9. WebGPU leg: root-cause #1639 (Float16 colour darker on WebGPU) — blocked.
10. Race-entry time, TLX 19.1 s vs GLX 5.9 s (#1651, in the real-GPU evidence epic #3279).
