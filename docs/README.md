# Apex 26 — docs

Three kinds of docs live here.

- **Engineering reference** — how the shipped game works today. Read it before
  touching the matching subsystem.
- **Research** (`research/`) — design notes and investigations still cited from
  source or from CLAUDE.md. Not a description of current behaviour, but load-bearing.
- **Archive** (`archive/`) — finished plans, superseded designs and build logs.
  Kept for provenance. **Never read these for current structure**; they were
  written against layouts that have since moved.

## Engineering reference (current)

| Doc | Covers |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Module layout, the game loop, how the pieces fit. |
| [ARCHITECTURE-REVIEW.md](ARCHITECTURE-REVIEW.md) | Standing assessment + defect register: what the no-build-step bet costs, why asserted invariants hold where prose ones drift, and what is deferred. |
| [DEBUG-HOOKS.md](DEBUG-HOOKS.md) | Full `window.__apex` dev-API reference (CLAUDE.md has the short list). |
| [CAREER.md](CAREER.md) | Career mode: the flow/session axes, the six `apex26.career.<flavour>.N` save slots, driver ratings, the economy and R&D gate, qualifying, reliability. |
| [PHYSICS.md](PHYSICS.md) | The driving model and its tuning variables, combined slip, active aero / X-mode, the overtake gate, and the world-space rigid-body authority. |
| [PARTS.md](PARTS.md) | The 12-category upgrade catalog: measured ERS and aero tables, SIGNATURE options, the visual recipe registry. |
| [MULTIPLAYER.md](MULTIPLAYER.md) | The `js/net/` wire: transport channels, the packed invite SDP, Nostr/room-code rendezvous, snapshots and interpolation, and who owns which car. |
| [SCENERY-API.md](SCENERY-API.md) | The `scenery(api)` callback — buildings, props, barriers, terrain anchoring. |
| [LIGHTING-REF.md](LIGHTING-REF.md) | Light-record layout, shader uniforms, time-of-day branches, floodlight masts. |
| [LIGHTING-KNOBS.md](LIGHTING-KNOBS.md) | Every hand-tuned lighting constant, what it does, and how to A/B it (mirrors `tools/lighting/ab-lighting.mjs`). |
| [LIGHTING-TUNER-SLIDERS.md](LIGHTING-TUNER-SLIDERS.md) | All 178 tuner sliders: range, default, the GLSL uniform each drives, and where it is consumed on the shipping path. Generated from TUNE_DEFS. Every slider IS wired — the table exists to say which of the three real failure modes you are actually looking at. |
| [LIGHTING-PRESETS.md](LIGHTING-PRESETS.md) | Per-track × time-of-day × weather lighting presets baked into `js/game/light-presets.js`. |
| [AGENT-WORLD-API.md](AGENT-WORLD-API.md) | The agent-facing JSON world view (`world`/`field`/`scene`/`rollout`/…). |
| [SCENERY-GROUNDING.md](SCENERY-GROUNDING.md) | How props seat on the terrain ribbon, and the float/clip audits. |
| [RENDER-CLIPPING.md](RENDER-CLIPPING.md) | Near/far planes, depth precision, and the clipping rules. |
| [PERF-FINDINGS.md](PERF-FINDINGS.md) | A four-way performance audit: what was measured, what was taken, what was reverted, and the recorded negative results. Its real content is which KINDS of finding survived measurement — mechanism-provable ones held up, operation-count estimates came in at a fraction. |
| [TRACK-MIGRATION-CHECKLIST.md](TRACK-MIGRATION-CHECKLIST.md) | Steps for moving a circuit onto the shared track foundation. |
| [TESTING.md](TESTING.md) | How to run tests (background + tail, picking groups), every `test:*` group, the fixtures, the full spec coverage table, the philosophy. |
| [research/UI-DESIGN-PRINCIPLES.md](research/UI-DESIGN-PRINCIPLES.md) | Why the UI is sized the way it is, and the two rules governing the component restructure: size for the PHONE at arm's length (the hardest legibility case, and the one this codebase got backwards), and collapse a primitive only when it passes the three-places-plus-generic test. |
| [PARALLEL-WORK.md](PARALLEL-WORK.md) | Where to spend concurrency: read-only agent fan-out is free, worktrees isolate FILES but not CPU, and the browser suite is serial on 4 cores — the bottleneck every plan has to respect. Written after parallelism produced ten confident, entirely fake test failures. |
| [LAYOUT-AUDIT.md](LAYOUT-AUDIT.md) | The screen x viewport grid: which mechanism owns which layout decision, what the probe measures, and how to read the results. |
| [COMPONENTS.md](COMPONENTS.md) | Every class family in `css/`, the file that owns it, and — the part worth reading — which classes are defined in more than one file. |
| [CONSOLE-RECIPES.md](CONSOLE-RECIPES.md) | Driving the deployed game from DevTools: `__apex.diag()`, browser gotchas, ready-made blocks. |
| [iOS-OPTIMIZATION.md](iOS-OPTIMIZATION.md) | Mobile/iOS perf and Safari quirks. |
| [tracks/](tracks/) | Per-circuit reference material. |

### WebGPU backend (opt-in)

`js/render/webgpu/*` is **DEFERRED** — no `<script>` tag; `js/game.js` injects it
at boot only when `apex26.gfxBackend=webgpu`, with GLX fallback on any failure.

**What still matters is in [ARCHITECTURE.md](ARCHITECTURE.md)**: WGX never
reached parity with GLX (no volumetrics, MSAA 1, no `gpuTimer`, no baked
material arrays). The six phase/migration build logs are provenance and live in
[`archive/webgpu/`](archive/webgpu/).

### three.js / TLX backend (opt-in)

The third renderer behind the same `Gfx` seam (`js/render/three/`), activated
via `localStorage apex26.gfxBackend=three`. Evaluation spikes, measured
criteria and the phased adoption plan live in [`spike/`](../spike/) —
`spike/README.md` for the criteria table and numbers, `spike/ADOPTION-PLAN.md`
for the graphics phases and the additive Rapier plan that `js/game/debrisworld.js`
and `js/game/incidentsim.js` implement.

## Research (cited, but not a description of behaviour)

The docs that survive here (fifteen at last count — the table below is the
authoritative list) are cited from source, from `CLAUDE.md` or from
each other — that citation is what keeps them live. Everything else that used to
sit in this table was indexed by nothing and moved to
[`archive/research/`](archive/research/).

| Doc | Topic |
|---|---|
| [research/physics-redesign.md](research/physics-redesign.md) | Cartesian-vs-Frenet physics migration plan. |
| [research/steering-research.md](research/steering-research.md) | Steering-model source notes + citations. |
| [research/ASSET-API-RESEARCH.md](research/ASSET-API-RESEARCH.md) | External model/texture/normal-map ingestion: CC0 asset APIs, a `MAT`-indexed texture array, offline bake tool. |
| [research/ENGINEERING-PRACTICE-NOTES.md](research/ENGINEERING-PRACTICE-NOTES.md) | Why the game loop's clamps and caps are load-bearing, what `seed()` can and cannot promise given float non-associativity, the characterization-test method for Phase 4 extractions, and the state of the no-build bet. |
| [research/CI-RENDERING-PERFORMANCE.md](research/CI-RENDERING-PERFORMANCE.md) | Why the Playwright suite is slow under SwiftShader, what llvmpipe/xvfb/GPU runners would change, why sharding is the wrong first move, and the (now shipped everywhere) state of WebGPU. External findings, not measurements — flagged as such. |
| [research/SCENE-GRAPH-PLAN.md](research/SCENE-GRAPH-PLAN.md) | Why detail is unaffordable without instancing; the staged scenery scene-graph plan and its measured per-emitter reuse. |
| [research/RESEARCH-WAVE-2026-08.md](research/RESEARCH-WAVE-2026-08.md) | Distilled, verified residue of the 2026-08-08 parallel research fleet: the unwired instanced path, the one-way perf governor (shipped fix), the throttle-bug sharpening, the Bedrock go/no-go, and Playwright suite health. The actionable items are the renderer/circuit tasks; unverified claims are flagged. |
| [research/PLATFORM-INPUT-NOTES.md](research/PLATFORM-INPUT-NOTES.md) | The platform behaviours that only bite on one device: pointer capture and the four-way release net, the top layer vs z-index, `zoom` and `--ui-scale`, `(pointer: coarse)`, Escape vs `<dialog>` close watchers, iOS WebGL context loss. Read before debugging anything that reproduces on one device and not another. |
| [research/DRIVING-CONTROLS-RESEARCH.md](research/DRIVING-CONTROLS-RESEARCH.md) | What shipped racing games (F1 24/25, EA's accessibility docs) do for assists and speed-sensitive steering — including the deliberately NEGATIVE conclusions that keep un-built features from being re-litigated. |
| [research/PHASE-C-SLIDER-DESIGN.md](research/PHASE-C-SLIDER-DESIGN.md) | The slider recalibration with the numbers: the arithmetic defects behind "I always end up at the bottom", computed from the shipped mappings in `js/game/steer-tuning.js`. |
| [research/UI-SCALE-AND-ZOOM.md](research/UI-SCALE-AND-ZOOM.md) | `zoom` as a scaling mechanism, measured: what the UI SIZE / HUD SIZE sliders cost, and why `zoom` is the right tool for them. |
| [research/UI-REDESIGN-2026-08.md](research/UI-REDESIGN-2026-08.md) | The menu system reconsidered from scratch (see $9 first — an adversarial review found four errors in it, two load-bearing), from seven defects measured live at 852x393: why they are three overlapping systems rather than seven bugs, a `--u` length token to replace `zoom`, a seven-rung type scale, four named container steps, and the order the work has to land in. |
| [research/UI-LAYOUT-CRITIQUE-2026-08.md](research/UI-LAYOUT-CRITIQUE-2026-08.md) | Every menu measured and criticised at 852x393: the vertical budget per screen (the garage spends 76% of its sheet on head+foot), the per-screen defects, and the finding underneath them — `container: sheet / inline-size` is the only container in the codebase, so every container query is blind to HEIGHT, which is the axis this game runs out of. |
| [research/UI-REMODEL-DECISION-2026-08.md](research/UI-REMODEL-DECISION-2026-08.md) | Should the menus be remodelled? The decision after measuring all 38 screens: NO for correctness (2 hard findings in 380 cells at the shipped scale), YES for maintainability (538 classes vs 102 tokens, 24 breakpoints, type with no range) — with what to do now, what not to do, and the trigger for the deferred half. |
| [research/ZOOM-ORIENTATION-STRUCTURE-2026-08.md](research/ZOOM-ORIENTATION-STRUCTURE-2026-08.md) | Is the app deciding its layout in the right COORDINATE SPACE? Every screen re-analysed by mechanism rather than appearance: 45 media queries and 29 container queries, none of which can see `zoom`, against four zoomed subtrees. Finds 9 of the 21 viewport-height queries genuinely wrong (the other 12 govern the two screens outside `.sheet`, and are correct *because* of that), names the migration order, and says which two obvious fixes are traps. |
| [research/UI-DESIGN-PRINCIPLES.md](research/UI-DESIGN-PRINCIPLES.md) | Why the UI is sized the way it is: size for the phone at arm's length, collapse a primitive only when it passes the three-places-plus-generic test. (Also indexed under Engineering reference above.) |
| [research/ARCHITECTURE-REDESIGN-2026-08.md](research/ARCHITECTURE-REDESIGN-2026-08.md) | Three competing redesigns (zero-build ESM, TypeScript+esbuild, harden-IIFE-in-place) scored by two judges; Bedrock-with-grafts adopted as the direction, ESM kept as the documented escalation path. |
| [research/CAMPAIGN-2026-08.md](research/CAMPAIGN-2026-08.md) | THE live plan of record for the cleanup & hardening campaign: wave status, the W2 execution order and gates, the design-ticket register, and which dated record owns which piece. Start here. |
| [research/TEST-AUDIT-2026-08.md](research/TEST-AUDIT-2026-08.md) | The 11-agent test-semantics audit: per-file verdicts for all 162 test files, the corrected group taxonomy, the tests/ split map, and the change-aware CI design with its feasibility gaps — feeds the W2 restructure; archives when spent. |

The four workflows' verbatim per-agent output now lives together in
[`archive/research/raw/`](archive/research/raw/) — `2026-08-audit-workflow.json`,
`2026-08-redesign-panel.json`, `2026-08-test-audit.json` and
`2026-08-total-audit.json`. Each dated record cites its own raw file; the two
whose parent record is still live (the redesign panel behind ARCHITECTURE-REDESIGN,
the test audit behind TEST-AUDIT) link across into the archive. Read them when a
summary's wording is doing too much work. Nothing else references them, and no
guard walks them, so they are provenance, not contract.

## Archive (`archive/`)

Provenance only. Nothing here describes current structure, and no live doc
depends on it for current structure (two research docs cite archived
investigations as historical companions — see the research row below).

The two dated audit records below archived per the campaign's Record lifecycle
once their fix/restructure items landed; their raw evidence sits in
`archive/research/raw/`.

| Path | What it is |
|---|---|
| [archive/superpowers/](archive/superpowers/) | 16 dated plans and specs from individual 2026-07 work sessions. Written against the pre-reorganisation flat `js/` layout, so their paths no longer resolve — expected, not rot. Their checkboxes are unchecked against work that shipped; read them for intent, never for status. |
| [archive/webgpu/](archive/webgpu/) | The WebGPU migration plan, maintainability review and four phase build logs. |
| [archive/research/](archive/research/) | Twelve investigations kept for provenance — no live doc depends on them for current structure, though two research docs cite them as historical companions (ASSET-API-RESEARCH.md → RENDERING-IMPROVEMENTS.md, SCENE-GRAPH-PLAN.md → EXTERNAL-MODEL-SOURCES.md): steering/tilt physics, circuit-briefing design + UI, rendering improvements, external model sources, longer-horizon physics, multiplayer research + the 4-player plan (both shipped), UI layout research, the driving-test review and the 2026-rules fidelity gap list. |
| [archive/research/AUDIT-SYNTHESIS-2026-08.md](archive/research/AUDIT-SYNTHESIS-2026-08.md) | The 21-agent audit workflow's synthesized execution plan — FIX-NOW (landed) / RESTRUCTURE / DEFER over 35 verified findings; drove the post-cleanup hardening. Archived once its restructure items landed. |
| [archive/research/TOTAL-AUDIT-2026-08.md](archive/research/TOTAL-AUDIT-2026-08.md) | The whole-tree audit: 197 adversarially-verified findings over every source file and doc — headlined by the curvature-sign trio in the track engine and the jump()/IncidentSim authority bug; drove the campaign fix waves. Archived once Batch A/B/C worked off. |
| [archive/SCENERY-UPGRADE-PLAN.md](archive/SCENERY-UPGRADE-PLAN.md) | The scenery upgrade roadmap. Its helpers (`grandstandEx`, `landmarkKit`, `circuitKit`, `sceneryTheme`) are all in the frozen 108-member contract now. |
| [archive/2026-08-repo-audit.md](archive/2026-08-repo-audit.md) | The Aug-2026 repo audit's finding register — the not-fixed backlog as recorded at the time, kept as provenance for what was found and what has since been worked off. |
| [archive/2026-08-architecture-review-journal.md](archive/2026-08-architecture-review-journal.md) | The session journal behind the architecture review: the full defect register with fix narratives and measurements, verbatim. The standing review distilled from it lives at [ARCHITECTURE-REVIEW.md](ARCHITECTURE-REVIEW.md). |

For day-to-day workflows, see the **skills** in `.claude/skills/` (`.claude/skills/README.md`)
and the **tools** in `tools/` (`tools/README.md`).
