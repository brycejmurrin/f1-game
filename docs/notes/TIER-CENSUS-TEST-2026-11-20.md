# Real-GPU test for the desktop tiers (2026-11-20)

Summary: the GPU census can now fail a forced ULTRA or EXTREME run when a feature that level turns on did not actually run on the real Metal GPU, instead of reading green on gpuErrors=0 alone.

Kind: design · Re-measure-by: 2026-12-20

Asked by Bryce 2026-11-20 ("implement the test"), a follow-up to #5951 and
[DESKTOP-GRAPHICS-TIERS-2026-11-20](DESKTOP-GRAPHICS-TIERS-2026-11-20.md). Evidence class: `read` plus node tests;
no GPU here, so the gate itself has not run on a runner yet (see §5).

## 1. The gap
Run 44714645589 (macos-latest, monza, `ls apex26.gfxDetail=2`) reported `webgpu phase=done ok=true gpuErrors=0`,
18.3 fps on Apple Paravirtual, with `csmEnd`, 128x128 rgba16float env passes and 1920x1080 r8unorm AO targets in its
pass list. That proves no GPU error, not that the extras ran: every EXTREME consumer catches its own build failure
and keeps today's path (`GfxQuality.feature()` contract), so a cascade or lit factory that threw still reads green.

## 2. What the game reports: `gfx.tiers`
`GfxDebug.tiers()` (`js/perf/gfx-debug-overlay.js`; the census always loads it, it boots `?gfxdebug=1`) returns
`{ detail, shed, cinema, shedOrder, features }`. Each of the 31 `GfxQuality.FEATURES` names gets
`{ need, on, ran }`: `on` is `feature(name)` now, `ran` is what the renderer itself reports (true / false), or null
plus `why` where the path has no signal. `tools/gfx/gpu-game-check.mjs` stores it as `gfx.tiers` next to
`gpuErrors` (`gfx.tiersError` when absent). `tiersRecord(q, probe)` is the pure half (`tests/unit/tier-record.test.mjs`).

| Feature | `ran` read from |
|---|---|
| ssaoHi, gtao, raysHi, ssrHi, ssgi, dof, motionBlur | `postState().hi.ran` (tlx-post.js `_last`: aoHi 1/2, rays, gi, ssrHi, dof, mblur); null when the base pass (AO, god rays, SSR) did not run in the last frame, dof/motionBlur null outside CINEMA |
| traa, hdrOut | `postState().aa` (`traa && taa`; `hdrPeak > 1`, null on a non-HDR display) |
| csm, lampShadows | `GLX.shadowX.state()`: `csm.on` and a cascade build count > 0; `lampX.on` and a slot with builds > 0 |
| superSample, ss2x | `GLX.maxRenderScale() > 1` (null at DPR > 1.25); ss2x > 1.5, CINEMA only |
| mirrorHi | `GLX.mirrorMax[0] > 1024` |
| lightsHi | `LightBudget.hiBuilt()` (the 128-slot loop compiled; boot-time, so not night-only) |
| skyAtmo | `__tlx.sky.atmo` |
| matDetail, envAll | `__tlx.lit.detail` |
| carSurf | `__tlx.lit.carSurf` (NEW one-field accessor, `tsl-lit.js`) |
| packHd | `Assets.state().tier === "hd"` (null until the pack uploaded) |
| liveryHi | `LiveryTex.liveryHiUsed()` (NEW: the value the AI atlas build cached, null before one) |
| meshHi, heroCar | `CarDraw.instance().carDetailUsed` (NEW getter: the detail the first car build used) |

**No `ran` signal yet** (always null, informational): `crowd3d`, `treesHi`, `kerbProfile`, `farTerrain`,
`density`, `propsHi` (the track builds in the worker from `TrackDetail.page()`; the page keeps no record of what the
build did) and `garageHi`, `crewHi` (garage only). A signal for the track six needs the worker's build result to
carry `track._detailFeatures` back to the page.

## 3. The verdict: `tierGate`
`tools/gfx/census-verdict.mjs` reads the level from `CENSUS_LS` (`lsDetail`, last `apex26.gfxDetail` wins). Level 0
adds nothing: today's census exactly. At 1 or 2, the WebGPU leg prints a `tiers:` head row and one row per feature
that level turns on (`need <= detail`, CINEMA adds one at detail 2, the last `shed` names of `shedOrder` excused):

- `ran` — pass.
- `DID NOT RUN — silent fallback` — **FAIL** naming the feature (`on` true, `ran` false).
- `GATE OFF` — **FAIL**: `feature()` answered false at a level that turns it on.
- `skipped — …` — declared in `TIER_SKIPS`: `lampShadows` needs a night build, so it is excused unless the leg's
  `timeOfDay` is night. Dispatch `tod=night` to hold it.
- `no signal — <why>` — information, never a pass by assumption nor a fail.

Also a FAIL: the record's `detail` differs from the level asked, or no record came back. The gate is live only on a
hardware census with `softAdapter=false`, `liteGpu` false and `api=webgpu`; anywhere else the head row says
`informational: <why>` and nothing fails.

## 4. Dispatch and read it
Once main applies §6: `detail` is a dispatch choice (0 / 1 / 2, default 0) that the plan job appends to `ls` as
`apex26.gfxDetail=<n>` (last, so it wins), validated like the other inputs (push requests may set `"detail"` too).

```
actions_run_trigger gpu-census.yml  ref=<branch>  inputs: { track: "monza", detail: "2" }
actions_run_trigger gpu-census.yml  ref=<branch>  inputs: { track: "singapore", tod: "night", detail: "2" }
```
Before §6 lands the same test runs with `ls: "apex26.gfxDetail=2"`. Read the Verdict step: under the `webgpu` leg,
the `tiers:` row must say `GATED`, and every row below it `ran` or a declared skip; a `DID NOT RUN` row is in the
**FAILED** list as `webgpu: tiers: <name> is on at detail 2 but did NOT run`.

**No scheduled EXTREME leg.** It does not fit today's schedule without changing the nightly: the nightly gate skips
when nothing changed since the last *green scheduled* run (`event=schedule&status=success`), and a second cron is
also a scheduled run, so a green EXTREME run would move that base and could skip a nightly that should have run; it
would also share the `nightly` concurrency group, which cancels in progress. Doing it properly means telling the
two crons apart in the gate (`github.event.schedule`) and giving the EXTREME leg its own group. Until then, dispatch
the two runs above when a tier changes.

## 5. Unverified
- No census has run with the gate: the first EXTREME dispatch may show `no signal` rows where a surface reads
  differently on the runner (e.g. `superSample` if the headless DPR exceeds 1.25), or a real silent fallback.
- `raysHi`, `ssaoHi`/`gtao` and `ssrHi` read only the LAST presented frame; a base pass that the scene skipped that
  frame reads null, not false.

## 6. The workflow diff (main applies it; workers cannot edit `.github/`)
```diff
--- a/.github/workflows/gpu-census.yml
+++ b/.github/workflows/gpu-census.yml
@@ -118,6 +118,16 @@
         type: string
         required: false
         default: "0"
+      # Appended LAST (the 12th of GitHub's 25 dispatch inputs). The desktop detail level the game checks boot at:
+      # the plan job appends apex26.gfxDetail=<n> to `ls` (after the dispatcher's own tokens, so it wins), and the
+      # Verdict then holds the TLX WebGPU leg to tools/gfx/census-verdict.mjs tierGate: every feature that level
+      # turns on must report it RAN (docs/notes/TIER-CENSUS-TEST-2026-11-20.md). 0 = today's census exactly.
+      detail:
+        description: "Desktop graphics detail for ALL game checks: 0 (HIGH, as before), 1 (ULTRA) or 2 (EXTREME). 1 and 2 add the tiers rows to the Verdict and fail a feature that silently fell back"
+        type: choice
+        options: ["0", "1", "2"]
+        required: false
+        default: "0"
   push:
     branches: ["cursor/**", "claude/**"]
     paths: [".github/gpu-census-request.json"]
@@ -257,6 +267,7 @@
           INPUT_MEM_CYCLES: ${{ inputs.mem_cycles || '0' }}
           INPUT_CAM: ${{ inputs.cam || 'helmet' }}
           INPUT_ENTRY: ${{ inputs.entry || 'api' }}
+          INPUT_DETAIL: ${{ inputs.detail || '0' }}
         run: |
           node - <<'JS'
           const fs = require("node:fs");
@@ -284,6 +295,8 @@
           if (!["helmet", "chase", "chase>cockpit"].includes(cam)) bad.push(`cam "${cam}" is not helmet|chase|chase>cockpit`);
           const entry = pick("entry", "INPUT_ENTRY", "api");
           if (!["api", "menu", "menu-full"].includes(entry)) bad.push(`entry "${entry}" is not api|menu|menu-full`);
+          const detail = pick("detail", "INPUT_DETAIL", "0");
+          if (!["0", "1", "2"].includes(detail)) bad.push(`detail "${detail}" is not 0|1|2`);
           for (const b of bad) console.log(`::error title=gpu-census input::${b.replace(/[\r\n%]/g, " ")}`);
           if (bad.length) process.exit(1);
           console.log(`census inputs ok: track=${tracks.join(",")}`);
@@ -306,7 +319,12 @@
           picked = [i.strip() for i in raw.split(",") if i.strip() in allow]
           print("images=" + json.dumps(picked or ["macos-latest"]))
           print("track=" + one(req.get("track") or os.environ.get("INPUT_TRACK") or "montreal"))
-          print("ls=" + one(req.get("ls") or os.environ.get("INPUT_LS") or ""))
+          # The desktop detail level rides `ls` (apex26.gfxDetail, read by js/perf/quality-preset.js detail()), LAST so
+          # it wins over a token the dispatcher typed; every game check and the Verdict (CENSUS_LS) then see it.
+          lsv = one(req.get("ls") or os.environ.get("INPUT_LS") or "")
+          dt = str(req.get("detail") or os.environ.get("INPUT_DETAIL") or "0").strip()
+          if dt in ("1", "2"): lsv = (lsv + " apex26.gfxDetail=" + dt).strip()
+          print("ls=" + lsv)
           # The HOUR the in-run A/B pins: 12 (noon, no lamps) measures the
           # PLAIN draw branch, 2 (night) the per-chunk lamp branch (census 146).
           try: ck = int(req.get("clock", os.environ.get("INPUT_CLOCK") or 12))
@@ -374,6 +392,7 @@
           INPUT_MEM_CYCLES: ${{ inputs.mem_cycles || '0' }}
           INPUT_CAM: ${{ inputs.cam || 'helmet' }}
           INPUT_ENTRY: ${{ inputs.entry || 'api' }}
+          INPUT_DETAIL: ${{ inputs.detail || '0' }}
 
   census:
     needs: plan
```
