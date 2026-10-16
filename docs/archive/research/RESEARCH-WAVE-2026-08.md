# Research wave — 2026-08-08 (parallel agent fleet)

State-save of a parallel `Agent`-tool research fleet run during the 2026-08
campaign's survey/perf wave. Unlike the `Workflow` records in this directory,
these were free-standing subagents, so their full transcripts are ephemeral —
this file is the distilled, **verified** residue. Every headline finding below
was re-derived against the source in the main loop before being believed or
acted on; unverified claims are marked. The actionable items became the tasks
named inline.

The method that held all session: **verify before believing.** Two of this
wave's own conclusions were wrong on first pass and caught by re-derivation —
the perf-governor "refutation" (a bad harness that seeded two EMAs
independently, which the real code never does) and a "22 affected circuits"
count that came from grepping source files instead of resolved defs. Both are
recorded because the correction is the reusable part.

---

## Wave 1 — five threads, all reported and verified

### Renderer (WebGL2 / GLX)
- **The instanced-draw path is fully built, spec-tested, and has no caller.**
  Producer `graph.batches()`, consumer `glx.js` `createInstancedBatch`/
  `cullInstances`/`drawElementsInstanced`, shadow `castShadowInstanced`, façade
  entries, and 5 real assertions in `tests/specs/instanced-draw.spec.js` — but
  `js/game.js:5018` still draws the fused soup via `drawChunked`.
  `git log -S drawInstanced -- js/game.js` is empty across all history: never
  wired, not wired-and-reverted. `SCENE-GRAPH-PLAN.md` §6 measures the prize at
  fleet VBO **413 MB → 71 MB**. **Task #46.** Prerequisite recorded there:
  `cullInstances` allocates a `subarray()` per visible instance per frame.
- **Fragment uniform budget sits on the WebGL2 minimum.** `lit.js` declares six
  `MAX_LIGHTS=32` arrays (192 vec4 rows) + `uMatTexScale[17]`, ~240-250 total vs
  the 224 `MAX_FRAGMENT_UNIFORM_VECTORS` floor. Plus three triplanar/`lowp`
  sampler LOD defects. UNVERIFIED on device (needs a real GPU, not SwiftShader).
  **Task #47.**
- Chunked draw rebinds an IBO per chunk (VAO state churn); one IBO per mesh +
  feature-detected `WEBGL_multi_draw` collapses it. Props submit up to 4×/frame.
  **Task #49.**
- **Argued AGAINST WebGPU/WGX revival**: this project's bottleneck is prop
  vertex count / VRAM (a data-layout problem the scene graph already solves on
  paper), not CPU draw setup (WebGPU's headline). WGX also lacks
  `createTextureArray`, so it cannot render the asset pack at all.

### Perf governor — the wave's biggest find, SHIPPED
- **`perf.js`'s restore branch was unreachable for every input.** `_floorMs`
  chases dt down at α 0.3 / up at 0.02 while `_frameEMA` moves at 0.1, so
  `_floorMs ≤ _frameEMA` is invariant and `_frameEMA < _floorMs − 4.2` cannot
  hold. Zero firings across 60 M simulated frames; closest approach 4.2000 ms.
  The governor was **one-way** — any device that degraded once stayed degraded
  all session. Fixed (`RESTORE_WITHIN` above the floor, verified up-step), with
  the missing restore-path test that let a dead branch ship. Landed on the
  2026-08-08 wave (`acba1110`).
- **Deferred, bigger, own branch (Task #48):** feed the governor `gfx.gpuMs()`
  (the timer extension that ships off) instead of the vsync-clamped frame
  interval — headroom is invisible in the interval by construction. And retire
  the per-scale-step render-target realloc (the hitch every `_downHold`/
  `_govCool` constant pays for) via max-size targets + sub-viewport.

### UI / touch / accessibility
- **Sharpened the throttle-stuck-on bug (Task #41).** The shipped fix's comment
  claims a per-element `lostpointercapture` listener covers a button hidden
  mid-hold, but PE3 §9.5 fires that event **at the document** when the capture
  target disconnects — the element listener can't receive it. Moved the net to
  the document (landed `acba1110`). Also: `?inputdebug=1` now prints `mode`/
  `auto`, the two fields that separate a latched button (`btn:1`) from TOUCH
  mode's auto-throttle (`btn:0`, no pointer net involved) — ask the reporter
  which they see before writing more pointer code.
- Evidence (Teather & MacKenzie 2014): **order of control beats input method** —
  BUTTONS mode's held-arrow ramp is a *velocity* control (~2× worse, +40% error
  than a *position* control). Design note, not a bug.
- Racing-HUD peripheral-vision rules: energy-bar brightness encoding is already
  textbook; the gap is multi-character strings in the periphery (OVERTAKE/AERO/
  gap/sector). Accessibility gaps: 6 screens with no focus containment (use
  `inert`), no colourblind provision (minimap AI cars by shape, sector red/lime
  pair). Deferred, unticketed.

### No-build organization — Bedrock go/no-go
- **Verdict: GO on Phases 0-2, NO-GO (defer) on Phase 4 (seal & carve G).**
  Measured: 94 top-level globals, **0 collisions** — the one thing that kills
  script-mode `tsc --checkJs` elsewhere does not exist here, so the "IIFE is
  accidentally the one architecture TS can check" claim is true *here
  specifically*. But `Object.seal(G)` as specified **throws today**: `G.netNow`
  was an undeclared expando (now fixed — declared, landed `acba1110`). Phase 1
  gated on running `tsc --checkJs` once and counting first-run errors (~20 min,
  unrun). `HARD_EDGES` mostly survives as call-time edges, so "it retires" is
  overclaimed. This refines **Task #16** (W3-W5 Bedrock).
- Off-plan, best ratio in the report: a `bump-cache` tool for the 165 `?v=N`
  instances (still a manual `sed` ritual).

### Playwright suite health
- **`workers=1` for verification**, and the standing "re-run alone on a quiet
  box" rule — now the `tools/test-solo.mjs` command (landed `ba3fb583`), which
  refuses to start above a load threshold.
- `reuseExistingServer` defaults to `true` locally — the config that produced
  33 false `ERR_CONNECTION_REFUSED` once; flip to opt-in. Deferred.
- ~198 tests in zero-`locator` specs still pay a full page boot each; the
  `sharedTest` fixture is applied to 7 of ~18 eligible. Biggest wall-clock
  lever. Deferred.
- **Open question, handed to a wave-2 agent:** the docs claim the 109,665 ms
  `waitForFunction` overrun is "the timeout never fires"; a decompile of the
  installed runner argues it fires and the cost is an *unbounded teardown*. If
  so, `polling:100` helps the reachable-but-slow case, not the doomed one —
  which changes the rationale (not the value) of the 318-site ratchet. CLAUDE.md
  count corrected 353 → 318 either way (landed `acba1110`).

---

## Wave 2 — in flight at state-save

Four threads launched, not yet folded in (their transcripts exist but their
distilled results had not returned to the main loop when this was written):
`js/data` + `career.js` audit, the `waitForFunction` teardown-vs-timeout
question, an `audio`/`store`/`sw.js` audit, and a draw-call **counter ratchet**
design (the SwiftShader-proof "did this change make the renderer do more work?"
guard, modelled on `clip-baseline.json`). Fold their verified findings in here
when they land.
