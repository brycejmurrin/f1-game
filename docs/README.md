# Apex 26 — docs

Start here. This page is a **reading order**, not a filing cabinet: the tables
below say what to read and in what order, and the index at the bottom exists so
nothing goes unfindable.

## Read in this order

**If you are an agent**, the path is `AGENTS.md` → `ARCHITECTURE.md` →
`TESTING.md` §1-2 → the one area doc your change touches → the skill that
drives it.

| # | Read | Why, and how much |
|---|---|---|
| 1 | [`../AGENTS.md`](../AGENTS.md) | The rules. Every flat prohibition lives there and nowhere else. Read the whole thing — it is deliberately short. |
| 2 | [ARCHITECTURE.md](ARCHITECTURE.md) | The module map, the `G` façade, the game loop, and the three renderers behind one seam. Skim the generated module index; read the section for the directory you are about to edit. |
| 3 | [TESTING.md](TESTING.md) §1-2 | How to run tests without burning an hour, and which GROUP your change needs. §5 is a lookup table, not reading. |
| 4 | the area doc | One of the seven below. Load it only when the task touches its area. |
| 5 | the skill | `.claude/skills/README.md` picks it; the skill drives the tools. |

**If you are a person** reading to understand the game: [`../README.md`](../README.md)
→ [ARCHITECTURE.md](ARCHITECTURE.md) → [PHYSICS.md](PHYSICS.md) or
[CAREER.md](CAREER.md) → [TESTING.md](TESTING.md) §1.

## The area docs (load one on demand)

| Doc | Covers |
|---|---|
| [PHYSICS.md](PHYSICS.md) | The driving model and its tuning variables, combined slip, active aero / X-mode, the overtake gate, and the world-space rigid-body authority. **Two rules bind everywhere** — see `AGENTS.md` §Physics. |
| [CAREER.md](CAREER.md) | Career mode: the flow/session axes, the six `apex26.career.<flavour>.N` save slots, driver ratings, the economy and R&D gate, qualifying, reliability — and the 12-category upgrade catalog with its measured ERS/aero tables. |
| [SCENERY-API.md](SCENERY-API.md) | The `scenery(api)` callback — buildings, props, barriers, terrain anchoring — how props seat on the terrain ribbon (the float/clip audits), and the checklist for migrating a circuit onto the shared foundation. |
| [MULTIPLAYER.md](MULTIPLAYER.md) | The `js/net/` wire: transport channels, the packed invite SDP, Nostr/room-code rendezvous, snapshots and interpolation, and who owns which car. |
| [LIGHTING.md](LIGHTING.md) | Light-record layout, shader uniforms, time-of-day branches, track lamps; every hand-tuned constant and how to A/B it; the per-track × time-of-day × weather presets. |
| [COMPONENTS.md](COMPONENTS.md) | Every class family in `css/`, the file that owns it, which classes are defined in more than one file — plus the screen x viewport layout axes and what the layout probe measures. |
| [CODE-STANDARDS.md](CODE-STANDARDS.md) | The JavaScript house style: module shape, naming, declarations, functions, duplication, and the comment policy — plus the frozen surfaces a style pass must never rename. |
| [PLATFORM.md](PLATFORM.md) | iOS/Safari quirks, controller support, and what a static GitHub Pages host does and does not give you. |

## Agent surface and hooks

| Doc | Covers |
|---|---|
| [AGENT-SURFACE.md](AGENT-SURFACE.md) | Skills vs MCP vs `tools/` CLIs vs wrap — which `apex_*` exists, which stay CLI-only, and why the ones that left, left. |
| [DEBUG-HOOKS.md](DEBUG-HOOKS.md) | Full `window.__apex` dev-API reference (generated), the agent-facing JSON world view (`world`/`field`/`scene`/`rollout`), and the DevTools console recipes. `AGENTS.md` has the short list. |
| [LIGHTING-TUNER-SLIDERS.md](LIGHTING-TUNER-SLIDERS.md) | All 183 tuner sliders: range, default, the GLSL uniform each drives, where it is consumed. Generated from `TUNE_DEFS`. |
| [tracks/](tracks/) | Per-circuit reference material. |
| [look-survey/README.md](look-survey/README.md) | 4×5 contact sheets from the mcp-probe look-survey (one PNG per finished circuit); written by `tools/lighting/look-survey-sheet.py`. |

## `notes/` — the dated ledgers

Measurements, defect registers and campaign records. **They are dated by
design**: a note is what was true when it was measured, and it is cited for its
evidence, never for current structure. Path-checked only — no guard counts
anything in here.

| Note | What it records |
|---|---|
| [notes/PERF-FINDINGS.md](notes/PERF-FINDINGS.md) | **Start at §0: which instrument answers which perf question, and the three that lie on this box.** Then the four-way audit: what was measured, taken, reverted, and the recorded negative results. Its real content is which KINDS of finding survived measurement. |
| [notes/TESTING-FIELD-NOTES.md](notes/TESTING-FIELD-NOTES.md) | The operational field notes carved out of `TESTING.md`: boot walls on this box, the two-worker factor, the instruments that lie here, the real-GPU runs. Cited from `AGENTS.md` as "TESTING field notes". |
| [notes/DEFECT-LEDGER.md](notes/DEFECT-LEDGER.md) | The open-defect register and the backlog behind it (was `ARCHITECTURE-REVIEW.md` §7-8). |
| [notes/ARCHITECTURE-REVIEW.md](notes/ARCHITECTURE-REVIEW.md) | The standing assessment: what the no-build-step bet costs, why asserted invariants hold where prose ones drift, and the lessons. |
| [notes/CI-RENDERING-PERFORMANCE.md](notes/CI-RENDERING-PERFORMANCE.md) | SwiftShader vs Lavapipe vs llvmpipe (measured canvas colours + wall-clock), WGX soft-present / `wgx-capture`, Cursor Cloud `mesa-vulkan-drivers` persist, why sharding is the wrong first speedup, and **§There IS a real GPU** — `macos-latest`. |
| [notes/CEILING-HISTORY.md](notes/CEILING-HISTORY.md) | Why every size-ratchet number moved, 2026-08 → 2026-09-03; the live numbers are `tests/data/ratchets.json`. |
| [notes/SPIKE-BACKENDS-CHECKLIST.md](notes/SPIKE-BACKENDS-CHECKLIST.md) | The WGX/TLX spike-out inventory: the move map, every non-move edit with file:line evidence, the tests that go red and their fixes. |
| [notes/OCCLUSION-PROBE.md](notes/OCCLUSION-PROBE.md) | Proving which mesh hides which, mechanically: patch `GLX.createMesh`/`begin`/`draw`, rasterise into a JS depth buffer, attribute every lost pixel to a `part()` name. |
| [notes/COCKPIT-DATUMS.md](notes/COCKPIT-DATUMS.md) | The FIA 2026 Technical Regulations numbers the first-person view is built on, with the three spec violations the table found — and the one number the regs do NOT give: driver eye height. |
| [notes/PARALLEL-WORK.md](notes/PARALLEL-WORK.md) | Where to spend concurrency: read-only fan-out is free, worktrees isolate FILES but not CPU, the browser suite is serial on 4 cores. Written after parallelism produced ten confident, entirely fake test failures. |
| [notes/PROCESS-SPEEDUP-2026-09.md](notes/PROCESS-SPEEDUP-2026-09.md) | Measured plan to make verification and deploys faster: where the minutes go, groups 30 → 12, CI-derived build numbers, `deploy.mjs`, the MCP/skill cut. |
| [notes/AGENT-PROCESS-RESEARCH-2026-09-16.md](notes/AGENT-PROCESS-RESEARCH-2026-09-16.md) | Third pass, as research: what the two speed-up plans left open, live CI timings (60 runs), the box's own gate timings, and the ranked remaining sinks — twins run twice locally, serial node gates, the double deploy gate, ratchet churn, permission prompts — plus the ideas closed as not-applicable. |
| [notes/ENGINEERING-PRACTICE-NOTES.md](notes/ENGINEERING-PRACTICE-NOTES.md) | Why the game loop's clamps and caps are load-bearing, what `seed()` can and cannot promise given float non-associativity, the characterization-test method, and the state of the no-build bet. |
| [notes/BUG-HUNT-2026-09-02.md](notes/BUG-HUNT-2026-09-02.md) | Two rounds of read-only bug hunts (UI, GLX, WGX+TLX, memory, race-flow; then track engine, physics/AI, input/audio, net): every CONFIRMED row and what each fix batch landed. |
| [notes/PERF-HUNT-2026-08-18.md](notes/PERF-HUNT-2026-08-18.md) | 08-17 board re-walk; union banner at cache 1421. WGX UBO flushes, `LAZY_AGENT`, DebrisWorld asleep-skip. |
| [notes/TRACK-ROSTER-RESEARCH-2026-09-14.md](notes/TRACK-ROSTER-RESEARCH-2026-09-14.md) | The 38 World Championship venues the game does not carry, why the upstream `bacinger/f1-circuits` trace file can add no more, what each remaining candidate costs to import (Overpass-measured), and the four shipped defs whose `classic` flag the 2027 calendar contradicts. |

## `research/` — cited from source, not a description of behaviour

What survives here is cited **by path from `js/`, `tests/` or `tools/`** — that
citation is what keeps it live and at this path. Dated by design: when a path a
research doc cites has since moved, add a one-line `> Errata:` under its title
rather than rewriting the record.

| Doc | Topic | Cited from |
|---|---|---|
| [research/PLATFORM-INPUT-NOTES.md](research/PLATFORM-INPUT-NOTES.md) | The platform behaviours that only bite on one device: pointer capture and the four-way release net, the top layer vs `z-index`, `zoom` and `--ui-scale`, `(pointer: coarse)`, Escape vs `<dialog>` close watchers, iOS WebGL context loss. | `js/input/input.js`, `js/ui/modal.js`, 4 specs |
| [WEBGPU-PARITY.md](../docs/research/WEBGPU-PARITY.md) | How to close WGX vs GLX: gap inventory, WebGPU API recipes (MSAA resolve, timestamp-query, texture arrays, mip-gen, god-ray), recommended slice order. §5 holds the WGSL rules a mock device cannot enforce. **Moved with the backends** in the 2026-09-03 spike-out — read it with `spike/backends/README.md`. | `spike/backends/webgpu/*` |
| [research/PHASE-C-SLIDER-DESIGN.md](research/PHASE-C-SLIDER-DESIGN.md) | The slider recalibration with the numbers: the arithmetic defects behind "I always end up at the bottom", computed from the shipped mappings. | `js/game.js`, `js/input/steer-tuning.js` |
| [research/AI-CONTACT-RESEARCH-2026-09.md](research/AI-CONTACT-RESEARCH-2026-09.md) | Six-lens web research into AI racecraft and car-to-car contact: GT Sophy's transferable parts, overtake decision rules, field spread from driver error rather than speed, PBD/XPBD contact, where a Frenet formulation breaks and whether the Rapier handback seam is in the right place, and deterministic contact between peers. Carries three source-verified defects (straight-line defence, the contact-normal choice, the non-invertible handback) and an appendix of what was rejected, so it is not re-proposed. NOT a plan of record. | `js/physics/ai-drive.js`, `js/physics/collide.js`, `js/physics/incident-sim.js` |
| [research/CONTROLS-AUDIT-2026-09.md](research/CONTROLS-AUDIT-2026-09.md) | Whole-surface control audit: what every device and mode ships, measured against four parallel external research passes (mobile touch, Apple platform, gamepad, desktop). Ranked improvements, the negative decisions, and the corrections to its own briefing. | `js/input/input.js`, `js/input/steer-tuning.js`, `js/ui/key-binds.js`, `js/ui/onboard.js` |
| [research/CONTROLS-RESEARCH-2026-09-14.md](research/CONTROLS-RESEARCH-2026-09-14.md) | Second mobile-controls research pass (tilt/gyro, touch & buttons, competitive scan, accessibility). Every checkable claim verified against source first, so it opens with what is ALREADY ours and must not be rebuilt — gravity-vector tilt, One-Euro, and analogue touch throttle, which the competitive scan wrongly called the category's biggest gap. Carries one shipped defect (the HAPTICS slider is dead on every iPhone), the WCAG 2.5.4 problem with defaulting to tilt, four guideline conflicts stated as deliberate gaps, and an evidence-quality section for the claims that must not be acted on alone. NOT a plan of record. | `js/input/input.js`, `js/input/steer-tuning.js`, `index.html` |
| [research/DRIVING-CONTROLS-RESEARCH.md](research/DRIVING-CONTROLS-RESEARCH.md) | What shipped racing games do for assists and speed-sensitive steering — including the deliberately NEGATIVE conclusions that keep un-built features from being re-litigated. | `js/audio/engine.js`, `js/physics/brake-cue.js` |
| [research/SCENE-GRAPH-PLAN.md](research/SCENE-GRAPH-PLAN.md) | Why detail is unaffordable without instancing; the staged scenery scene-graph plan and its measured per-emitter reuse. | `js/render/glx/glx.js` |
| [research/UI-DESIGN-PRINCIPLES.md](research/UI-DESIGN-PRINCIPLES.md) | Why the UI is sized the way it is: size for the PHONE at arm's length, and collapse a primitive only when it passes the three-places-plus-generic test. | `css/tokens.css`, `tests/unit/game-ctx-surface.test.mjs` |
| [research/ARCHITECTURE-REDESIGN-2026-08.md](research/ARCHITECTURE-REDESIGN-2026-08.md) | Three competing redesigns (zero-build ESM, TypeScript+esbuild, harden-IIFE-in-place) scored by two judges; Bedrock-with-grafts adopted, ESM kept as the documented escalation path. | `tools/check/check-gctx.mjs`, `tools/check/scan-globals.mjs` |
| [research/ASSET-API-RESEARCH.md](research/ASSET-API-RESEARCH.md) | External model/texture/normal-map ingestion: CC0 asset APIs, a `MAT`-indexed texture array, offline bake tool. | `tools/check/check-gctx.mjs`, `tools/gen/assets.mjs` |
| [research/APEX-TOOLS-MCP.md](research/APEX-TOOLS-MCP.md) | Design / refuses for the `apex-tools` wrap. Agent map: [AGENT-SURFACE.md](AGENT-SURFACE.md). | `tools/mcp/apex-tools-mcp.mjs`, `tools/gfx/wgx-shot.mjs` |
| [research/CHROME-DEVTOOLS-MCP.md](research/CHROME-DEVTOOLS-MCP.md) | Playbook for the chrome-devtools MCP tools against Apex: roots/`/tmp` file writes, snapshot uids, cold-boot LCP, clean heap cycles, lighthouse snapshot scores. Companion to `.claude/skills/mcp-probe`. | `tools/mcp/cdmcp-cli.py`, `tools/check/ratchets.mjs` |
| [research/STRUCTURE-REDECISION-2026-08.md](research/STRUCTURE-REDECISION-2026-08.md) | Six structural questions re-opened on user request and re-decided from fresh measurement. | `tests/unit/perf-governor.test.mjs` |
| [research/UI-REDESIGN-2026-08-18.md](research/UI-REDESIGN-2026-08-18.md) | UI redesign implementation plan + acceptance contract: catalogue screens restructured around one dominant scroller; the visual identity kept. | `tests/unit/css-token-adoption.test.mjs` |
| [research/PAUSE-SETTINGS-IA.md](research/PAUSE-SETTINGS-IA.md) | Pause stays a 1-2-1-1 action sheet; settings is a home → CONTROLS / DISPLAY stack. Tabs and MORE are gone. | `js/ui/settings-tabs.js` |
| [research/TREE-RESTRUCTURE-2026-09.md](research/TREE-RESTRUCTURE-2026-09.md) | The verified diagnosis and the approved six-phase restructuring plan: generate the shell from the manifest (Phase 0), js/ domain directories (Phase 2), the test-tree taxonomy, game.js carves, tools/ and docs/ consolidation. | `js/perf/renderer-picker.js`, 2 tests, 3 tools |
| [research/RENDERER-PERF-AUDIT-2026-09-02.md](research/RENDERER-PERF-AUDIT-2026-09-02.md) | Three read-only renderer perf audits (GLX / WGX / TLX), ranked findings with proposed patches; landed items marked. Held at this path by the pending WGX/TLX spike-out. | `spike/backends/README.md`, `tools/moves/spike-backends.json` |
| [research/UPSCALING-2026-09.md](research/UPSCALING-2026-09.md) | Can we fake resolution by generating pixels? Spatial upscalers (FSR 1, Snapdragon GSR) vs temporal reconstruction, with the two blockers a WebGL2 port hits: `textureGather` is ES 3.1 (not WebGL2), and stock EASU costs 6.3 ms on an iPhone 12. Temporal and frame-generation closed with reasons. | `js/render/glx/post.js`, `js/perf/governor.js` |
| [research/steering-research.md](research/steering-research.md) | Steering-model source notes + citations. | `.claude/skills/tune-physics` |
| [research/PIT-LANE-REDESIGN-2026-09.md](research/PIT-LANE-REDESIGN-2026-09.md) | Why the pit lane has to be rebuilt as ONE model: the five places that describe it today (ribbon fit, stop row, painted boxes, scenery hulls, the GARAGE screen's frontage) and the defects that fall out, the FIA/FIM dimensions a lane needs (≥ 12 m, fast lane ≤ 3.5 m, corridor, wall + platform, entry/exit lines), and the design — a lateral profile with real entry/exit easing, bands in metres, the existing `js/garage/scene.js` bay instanced eleven times as the garages. Implemented 2026-09-15 as `TrackPit` + `SceneryPits`; the doc is the evidence and the design record. | `js/track/core/pit.js`, `js/track/scenery/pits.js`, `tests/unit/pit-complex.test.mjs` |
| [research/PIT-BAY-LOGOS-PLAN-2026-09.md](research/PIT-BAY-LOGOS-PLAN-2026-09.md) | Team crests and wordmarks on the outside of the engine's pit bays — one shared canvas atlas drawn as a world-space textured decal, one quad per bay, with box lettering as the headless-safe fallback; the facts it rests on (the track props buffer has no UVs and a fixed material array; all three backends have a decal path; the garage screen already paints the same sign). Built 2026-09-16 as design A: `TrackPit.SIGN` + `track.pitSigns` (SceneryPits) + `PitSigns` (js/garage/pit-signs.js), crest + code + name per cell, one `drawDecal` after the sky. | `js/track/scenery/pits.js`, `js/garage/pit-signs.js`, `tests/unit/pit-signs.test.mjs` |
| [research/PIT-LIGHTING-PLAN-2026-09.md](research/PIT-LIGHTING-PLAN-2026-09.md) | Lighting the engine's pit complex at night — six LED canopy luminaires over the working lane registered from `SceneryPits` through a pit-lamp list into `track.lampPosts`, an `aimAt` field so the energy formula measures throw to the lane rather than the road, exit signal by over-white albedo; corrects the first pass (track props DO draw emissive at night — `game.js` sets `floodEmit`) and lists the circuits' own pit-side lamps the keep-out supersedes. Built 2026-09-16 (six fixtures at 22 m; Miami's pit-side posts and the generic pit building retired, Abu Dhabi's towers now `floodMast`). | `js/track/scenery/pits.js`, `js/lighting/track-lights.js`, `js/track/tracks.js`, `tests/unit/pit-complex.test.mjs` |
| [research/STREET-PIT-LANES-PLAN-2026-09.md](research/STREET-PIT-LANES-PLAN-2026-09.md) | Real, separated pit lanes on the five street circuits instead of the painted lane — a STREET band set (10.6 m, platform 1.6) that leaves 2.5 m placeable beside the road, per-circuit def edits (walls split at the window, city fronts moved to the new garage line, sides corrected for Jeddah/Vegas), Jeddah on `bays:false` with a kit pit building (its 190 m window compresses the pitch under a bay), an engine fix so the instanced lap-long street barrier skips the pit side, and the measured proof that no phantom armco survives in the driving boundary. Built 2026-09-16 (`TrackPit.STREET`, the bay-pitch guard, the five defs and their scenery splits; `narrow` kept as the painted opt-out). | `js/track/core/pit.js`, `js/track/tracks.js`, `js/circuits/{baku,jeddah,monaco,singapore,vegas}.js`, `tests/unit/pit-complex.test.mjs` |
| [research/TYRE-STRATEGY-DESIGN.md](research/TYRE-STRATEGY-DESIGN.md) | Tyre degradation, temperature and pit strategy: the cited real-world numbers (compound deltas, deg s/lap, pit loss by circuit, the FIA articles that create strategy), the race-length problem that decides whether any of it is playable, and a five-phase design against the seams this tree already has. Nothing implemented — §11 is the open decisions. | `js/physics/tyre-model.js`, `js/race/pit-lane.js`, 2 tests |
| [research/wgx-gallery/](research/wgx-gallery/) | WGX reference frames + `wgx-gallery-manifest.json`, read by `tools/gfx/wgx-shot.mjs`. Left with the spike-out on 2026-09-03 and **back at this path** with the 2026-09-04 re-attach. | `tools/gfx/wgx-shot.mjs` |

## `archive/` — provenance only

**Never read these for current structure.** They were written against layouts
that have since moved. `git show <sha>:<path>` recovers anything the attic
ledger lists.

| Path | What it is |
|---|---|
| [archive/ATTIC.md](archive/ATTIC.md) | The attic ledger: one row per record deleted from `docs/` (title, original path, last SHA, one-line summary). |
| [archive/research/](archive/research/) | Provenance investigations — the 2026-08 audit records, the UI campaign set, the browser-graphics survey, the cleanup sweep, the parallel fleet survey and the 2026-09 code survey (dead code / bugs / perf). |
| [archive/research/raw/](archive/research/raw/) | The five workflows' verbatim per-agent output. Read when a summary's wording is doing too much work. |
| [archive/superpowers/](archive/superpowers/) | The 2026-08 plans and specs (apex-tools MCP weeks 1-4, release safety, audit remediation, perf-hunt fixes). |
| [archive/slider-effect/](archive/slider-effect/) | 20 before/after slider-effect PNG pairs from the lighting classifier. |
| [archive/manual-probes/](archive/manual-probes/) | Four single-incident diagnostic instruments (banking, throttle-rescue, skid, act) — bugs resolved, kept as reusable probe patterns. |
| [archive/webgpu/](archive/webgpu/) | The WebGPU migration plan and maintainability review (still cited by `spike/README.md`). |
| [archive/tracks/](archive/tracks/) | Spent track-campaign notes. |
| [archive/workflows/](archive/workflows/) | Spent multi-agent orchestration scripts. Live workflows remain under `.claude/workflows/`. |
| [archive/2026-08-repo-audit.md](archive/2026-08-repo-audit.md) | The Aug-2026 repo audit's finding register as recorded at the time. |
| [archive/2026-08-architecture-review-journal.md](archive/2026-08-architecture-review-journal.md) | The session journal behind the architecture review: the full defect register with fix narratives, verbatim. |
| [archive/SCENERY-UPGRADE-PLAN.md](archive/SCENERY-UPGRADE-PLAN.md) | The scenery upgrade roadmap; its helpers are all in the frozen contract now. |

## Redirect stubs

These paths are cited from `js/`, `css/`, `tests/` or `tools/` comments, so they
survive as one-line pointers rather than breaking those citations. Nothing to
read here — follow the link.

| Stub | Content now lives in |
|---|---|
| [RENDERERS.md](RENDERERS.md) | [ARCHITECTURE.md](ARCHITECTURE.md) §Renderers |
| [SCENERY-GROUNDING.md](SCENERY-GROUNDING.md) | [SCENERY-API.md](SCENERY-API.md) §Grounding |
| [LAYOUT-AUDIT.md](LAYOUT-AUDIT.md) | [COMPONENTS.md](COMPONENTS.md) §Layout axes |
| [AGENT-WORLD-API.md](AGENT-WORLD-API.md) | [DEBUG-HOOKS.md](DEBUG-HOOKS.md) §Agent world API |
| [CONSOLE-RECIPES.md](CONSOLE-RECIPES.md) | [DEBUG-HOOKS.md](DEBUG-HOOKS.md) §Console recipes |
| [PERF-FINDINGS.md](PERF-FINDINGS.md) | [notes/PERF-FINDINGS.md](notes/PERF-FINDINGS.md) |
| [ARCHITECTURE-REVIEW.md](ARCHITECTURE-REVIEW.md) | [notes/ARCHITECTURE-REVIEW.md](notes/ARCHITECTURE-REVIEW.md) + [notes/DEFECT-LEDGER.md](notes/DEFECT-LEDGER.md) |
| [OCCLUSION-PROBE.md](OCCLUSION-PROBE.md) | [notes/OCCLUSION-PROBE.md](notes/OCCLUSION-PROBE.md) |
| [COCKPIT-DATUMS.md](COCKPIT-DATUMS.md) | [notes/COCKPIT-DATUMS.md](notes/COCKPIT-DATUMS.md) |
| [PARALLEL-WORK.md](PARALLEL-WORK.md) | [notes/PARALLEL-WORK.md](notes/PARALLEL-WORK.md) |

For day-to-day workflows, see the **skills** in `.claude/skills/`
(`.claude/skills/README.md`) and the **tools** in `tools/` (`tools/README.md`).

## Mechanics survey and implementation

- [Mechanics opportunity survey](research/MECHANICS-OPPORTUNITY-SURVEY-2026-09-14.md): code survey, primary research and priorities.
- [Mechanics coherence implementation](plans/2026-09-14-mechanics-coherence.md): completed behavior, validation and remaining opportunities.
- [Process speed-up research, five plans](plans/research-2026-09-16/README.md): testing (a `vmPage` adapter for the 67 DOM-free specs), the VM harness (measured: physics stepping is 70 % of the fast tier's floor — a worker pool, not a cache), CI (base-red verdict line, per-job verdict cache, status.json), measurement (a nightly process dashboard, waste detectors, a session ledger) and agent ergonomics (hook filters, a Stop hook, `defaultMode: auto`, an AGENTS.md re-cut).
- [Process speed-up: the next fifteen](plans/2026-09-16-process-speedup-next.md): plans for what the 2026-09-16 research landing left — `selected` on llvmpipe, the elevation-tracks floor, a runner-side dispatch tool, more VM twins, the settings and docs items — each with evidence, files, verification and expected saving.
