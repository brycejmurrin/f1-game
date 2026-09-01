# Apex 26 — docs

Three kinds of docs live here.

- **Engineering reference** — how the shipped game works today. Read it before
  touching the matching subsystem.
- **Research** (`research/`) — design notes and investigations still cited from
  source or from AGENTS.md. Not a description of current behaviour, but
  load-bearing. Dated by design: when a path or number a research doc cites has
  since moved, add a one-line `> Errata:` under its title rather than rewriting
  the record.
- **Archive** (`archive/`) — finished plans, superseded designs and build logs.
  Kept for provenance. **Never read these for current structure**; they were
  written against layouts that have since moved.

## Engineering reference (current)

| Doc | Covers |
|---|---|
| [AGENT-SURFACE.md](AGENT-SURFACE.md) | Skills vs MCP vs `tools/` CLIs vs wrap — which `apex_*` exists, which stay CLI-only. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Module layout, the game loop, how the pieces fit. |
| [RENDERERS.md](RENDERERS.md) | Three backends behind one seam: GLX / WGX / TLX boot flow, frame pipeline, safety prefs, parity snapshot, the cross-backend parity workflow (mirror a knob on all three). |
| [ARCHITECTURE-REVIEW.md](ARCHITECTURE-REVIEW.md) | Standing assessment + defect register: what the no-build-step bet costs, why asserted invariants hold where prose ones drift, and what is deferred. |
| [DEBUG-HOOKS.md](DEBUG-HOOKS.md) | Full `window.__apex` dev-API reference (AGENTS.md has the short list). |
| [CAREER.md](CAREER.md) | Career mode: the flow/session axes, the six `apex26.career.<flavour>.N` save slots, driver ratings, the economy and R&D gate, qualifying, reliability. |
| [PHYSICS.md](PHYSICS.md) | The driving model and its tuning variables, combined slip, active aero / X-mode, the overtake gate, and the world-space rigid-body authority. |
| [PARTS.md](PARTS.md) | The 12-category upgrade catalog: measured ERS and aero tables, SIGNATURE options, the visual recipe registry. |
| [MULTIPLAYER.md](MULTIPLAYER.md) | The `js/net/` wire: transport channels, the packed invite SDP, Nostr/room-code rendezvous, snapshots and interpolation, and who owns which car. |
| [SCENERY-API.md](SCENERY-API.md) | The `scenery(api)` callback — buildings, props, barriers, terrain anchoring. |
| [LIGHTING-REF.md](LIGHTING-REF.md) | Light-record layout, shader uniforms, time-of-day branches, track lamps. |
| [LIGHTING-KNOBS.md](LIGHTING-KNOBS.md) | Every hand-tuned lighting constant, what it does, and how to A/B it (mirrors `tools/lighting/ab-lighting.mjs`). |
| [LIGHTING-TUNER-SLIDERS.md](LIGHTING-TUNER-SLIDERS.md) | All 183 tuner sliders: range, default, the GLSL uniform each drives, and where it is consumed on the shipping path. Generated from TUNE_DEFS. Every slider IS wired — the table exists to say which of the three real failure modes you are actually looking at. |
| [LIGHTING-PRESETS.md](LIGHTING-PRESETS.md) | Per-track × time-of-day × weather lighting presets baked into `js/game/light-presets.js`. |
| [look-survey/README.md](look-survey/README.md) | 4×5 contact sheets from the mcp-probe look-survey (one PNG per finished circuit). |
| [AGENT-WORLD-API.md](AGENT-WORLD-API.md) | The agent-facing JSON world view (`world`/`field`/`scene`/`rollout`/…). |
| [SCENERY-GROUNDING.md](SCENERY-GROUNDING.md) | How props seat on the terrain ribbon, and the float/clip audits. |
| [RENDER-CLIPPING.md](RENDER-CLIPPING.md) | Near/far planes, depth precision, and the clipping rules. |
| [COCKPIT-DATUMS.md](COCKPIT-DATUMS.md) | The FIA 2026 Technical Regulations numbers the first-person view is built on — mirror reference volume and reflective-surface size, headrest/halo/roll-structure heights, the survival-cell padding datum — with the three spec violations the table found (mirrors inboard of `RV-MIRROR-BODY` and above its ceiling, a portrait reflective surface that should be 200×50 landscape, stays that reached no bodywork). Also records the one number the regs do NOT give: driver eye height. |
| [OCCLUSION-PROBE.md](OCCLUSION-PROBE.md) | Proving which mesh hides which, mechanically: patch `GLX.createMesh`/`begin`/`draw` to keep the raw geometry and the renderer's own view-projection, rasterise both meshes into a JS depth buffer, and attribute every lost pixel to a `part()` name. Written after four rounds of moving cockpit geometry by eye made it worse; the first probe run found the cause (the tub's own rear cap, 55% of the wheel) in one call. |
| [PERF-FINDINGS.md](PERF-FINDINGS.md) | **Start at §0: which instrument answers which perf question, and the three that lie on this box** (an idle render profile, frame timing under SwiftShader, and local-server cache/compression insights). Then the four-way audit: what was measured, taken, reverted, and the recorded negative results. Its real content is which KINDS of finding survived measurement — mechanism-provable ones held up, operation-count estimates came in at a fraction. |
| [TRACK-MIGRATION-CHECKLIST.md](TRACK-MIGRATION-CHECKLIST.md) | Steps for moving a circuit onto the shared track foundation. |
| [TESTING.md](TESTING.md) | How to run tests (background + tail, picking groups), every `test:*` group, the fixtures, the full spec coverage table, the philosophy. |
| [research/CHROME-DEVTOOLS-MCP.md](research/CHROME-DEVTOOLS-MCP.md) | Playbook for the 40 chrome-devtools MCP tools against Apex: roots/`/tmp` file writes, snapshot uids, cold-boot LCP (script wall), clean heap cycles, track-switch heaps, lighthouse snapshot scores. Companion to `.claude/skills/mcp-probe`. |
| [research/UI-DESIGN-PRINCIPLES.md](research/UI-DESIGN-PRINCIPLES.md) | Why the UI is sized the way it is, and the two rules governing the component restructure: size for the PHONE at arm's length (the hardest legibility case, and the one this codebase got backwards), and collapse a primitive only when it passes the three-places-plus-generic test. |
| [PARALLEL-WORK.md](PARALLEL-WORK.md) | Where to spend concurrency: read-only agent fan-out is free, worktrees isolate FILES but not CPU, and the browser suite is serial on 4 cores — the bottleneck every plan has to respect. Written after parallelism produced ten confident, entirely fake test failures. |
| [LAYOUT-AUDIT.md](LAYOUT-AUDIT.md) | The screen x viewport grid: which mechanism owns which layout decision, what the probe measures, and how to read the results. |
| [COMPONENTS.md](COMPONENTS.md) | Every class family in `css/`, the file that owns it, and — the part worth reading — which classes are defined in more than one file. |
| [CONSOLE-RECIPES.md](CONSOLE-RECIPES.md) | Driving the deployed game from DevTools: `__apex.diag()`, browser gotchas, ready-made blocks. |
| [iOS-OPTIMIZATION.md](iOS-OPTIMIZATION.md) | Mobile/iOS perf and Safari quirks. |
| [tracks/](tracks/) | Per-circuit reference material. |

### Renderers (GLX / WGX / TLX)

Boot flow, shared frame pipeline, safety prefs, and the live parity snapshot
live in **[RENDERERS.md](RENDERERS.md)**. Module contracts and the GLX API
sketch stay in [ARCHITECTURE.md](ARCHITECTURE.md).

`js/render/webgpu/*` and `js/render/three/*` are **DEFERRED** — no `<script>`
tag; `js/game.js` injects them only when `apex26.gfxBackend` is `webgpu` or
`three`, with GLX fallback on any failure. GLX stays the default. WGX recipes
and remaining sharp edges (TAA still off) live in
[research/WEBGPU-PARITY.md](research/WEBGPU-PARITY.md). The WebGPU migration
plan and maintainability review are provenance under
[`archive/webgpu/`](archive/webgpu/); the four phase build logs were retired to
the attic ledger ([archive/ATTIC.md](archive/ATTIC.md)). TLX evaluation spikes and the phased
adoption plan live in [`spike/`](../spike/) (`spike/README.md`,
`spike/ADOPTION-PLAN.md`).

## Research (cited, but not a description of behaviour)

The docs that survive here (the table below is the
authoritative list) are cited from source, from `AGENTS.md` or from
each other — that citation is what keeps them live. Everything else that used to
sit in this table was indexed by nothing and moved to
[`archive/research/`](archive/research/).

| Doc | Topic |
|---|---|
| [research/steering-research.md](research/steering-research.md) | Steering-model source notes + citations. |
| [research/ASSET-API-RESEARCH.md](research/ASSET-API-RESEARCH.md) | External model/texture/normal-map ingestion: CC0 asset APIs, a `MAT`-indexed texture array, offline bake tool. |
| [research/ENGINEERING-PRACTICE-NOTES.md](research/ENGINEERING-PRACTICE-NOTES.md) | Why the game loop's clamps and caps are load-bearing, what `seed()` can and cannot promise given float non-associativity, the characterization-test method for Phase 4 extractions, and the state of the no-build bet. |
| [research/PROCESS-SPEEDUP-2026-09.md](research/PROCESS-SPEEDUP-2026-09.md) | Measured plan to make verification and deploys faster: where the minutes go (boot waits, JSON-only browser specs, the 559 s sweeps subtest, bump-commit churn), a node harness for the physics, groups 30 → 12, CI-derived build numbers, `deploy.mjs`, the MCP/skill cut, and a tracked API key that must be rotated. |
| [research/CI-RENDERING-PERFORMANCE.md](research/CI-RENDERING-PERFORMANCE.md) | SwiftShader vs Lavapipe vs llvmpipe (measured canvas colours + wall-clock), WGX soft-present / `wgx-capture`, Cursor Cloud `mesa-vulkan-drivers` persist, and why sharding is the wrong first speedup. Part 1 external; Part 2 + §Measured grounded. |
| [research/WEBGPU-PARITY.md](research/WEBGPU-PARITY.md) | How to close WGX vs GLX: gap inventory, WebGPU API recipes (MSAA resolve, timestamp-query, texture arrays, mip-gen, god-ray), recommended slice order. |
| [research/CHROME-DEVTOOLS-MCP.md](research/CHROME-DEVTOOLS-MCP.md) | Interactive Chrome DevTools MCP recipes (heap / perf insights / a11y snapshots) measured on the live shell — not a substitute for the suite. |
| [research/SCENE-GRAPH-PLAN.md](research/SCENE-GRAPH-PLAN.md) | Why detail is unaffordable without instancing; the staged scenery scene-graph plan and its measured per-emitter reuse. |
| [research/PLATFORM-INPUT-NOTES.md](research/PLATFORM-INPUT-NOTES.md) | The platform behaviours that only bite on one device: pointer capture and the four-way release net, the top layer vs z-index, `zoom` and `--ui-scale`, `(pointer: coarse)`, Escape vs `<dialog>` close watchers, iOS WebGL context loss. Read before debugging anything that reproduces on one device and not another. |
| [research/DRIVING-CONTROLS-RESEARCH.md](research/DRIVING-CONTROLS-RESEARCH.md) | What shipped racing games (F1 24/25, EA's accessibility docs) do for assists and speed-sensitive steering — including the deliberately NEGATIVE conclusions that keep un-built features from being re-litigated. |
| [research/PHASE-C-SLIDER-DESIGN.md](research/PHASE-C-SLIDER-DESIGN.md) | The slider recalibration with the numbers: the arithmetic defects behind "I always end up at the bottom", computed from the shipped mappings in `js/game/steer-tuning.js`. |
| [research/UI-DESIGN-PRINCIPLES.md](research/UI-DESIGN-PRINCIPLES.md) | Why the UI is sized the way it is: size for the phone at arm's length, collapse a primitive only when it passes the three-places-plus-generic test. (Also indexed under Engineering reference above.) |
| [research/ARCHITECTURE-REDESIGN-2026-08.md](research/ARCHITECTURE-REDESIGN-2026-08.md) | Three competing redesigns (zero-build ESM, TypeScript+esbuild, harden-IIFE-in-place) scored by two judges; Bedrock-with-grafts adopted as the direction, ESM kept as the documented escalation path. |
| [research/STRUCTURE-REDECISION-2026-08.md](research/STRUCTURE-REDECISION-2026-08.md) | Six structural questions re-opened on user request and re-decided from fresh measurement (surveyor → three analysts → two judges; flip only on judge agreement). |
| [research/UI-REDESIGN-2026-08-18.md](research/UI-REDESIGN-2026-08-18.md) | UI redesign implementation plan + acceptance contract: catalogue screens (Circuit Select, Garage) restructured around one dominant scroller; the visual identity kept. |
| [research/SURVEY-BUGS-PERF-2026-08-17.md](research/SURVEY-BUGS-PERF-2026-08-17.md) | Parallel fleet survey at tip 46554737. **Leftovers after 1421:** next row. |
| [research/CLEANUP-SWEEP-2026-08-18.md](research/CLEANUP-SWEEP-2026-08-18.md) | Six-agent dead-code / bug / split sweep: what was removed, what looked dead and is not, next `game.js` extractions. |
| [research/PERF-HUNT-2026-08-18.md](research/PERF-HUNT-2026-08-18.md) | 08-17 board re-walk; union banner at cache 1421. WGX UBO flushes, `LAZY_AGENT` (`apex.js` / `agentview*`), DebrisWorld asleep-skip taken 2026-08-18. |
| [research/APEX-TOOLS-MCP.md](research/APEX-TOOLS-MCP.md) | Design / refuses for the `apex-tools` wrap. Agent map: [AGENT-SURFACE.md](AGENT-SURFACE.md). Five-server catalog includes `playwright` → `tools/playwright-mcp.sh`; HTTP `127.0.0.1:3713`. |

The four workflows' verbatim per-agent output now lives together in
[`archive/research/raw/`](archive/research/raw/) — `2026-08-audit-workflow.json`,
`2026-08-redesign-panel.json`, `2026-08-test-audit.json` and
`2026-08-total-audit.json`. Each dated record cites its own raw file; the
redesign panel behind ARCHITECTURE-REDESIGN links across into the archive.
Read them when a summary's wording is doing too much work. Nothing else
references them, and no guard walks them, so they are provenance, not contract.

## Archive (`archive/`)

Provenance only. Nothing here describes current structure, and no live doc
depends on it for current structure (two research docs cite archived
investigations as historical companions — see the research row below).

The two dated audit records below archived per the campaign's Record lifecycle
once their fix/restructure items landed; their raw evidence sits in
`archive/research/raw/`.

| Path | What it is |
|---|---|
| [archive/manual-probes/](archive/manual-probes/) | Four single-incident diagnostic instruments (banking, throttle-rescue, skid, act) — bugs resolved, kept verbatim as reusable probe patterns; see `AGENTS.md` and `docs/TESTING.md` for what each found. |
| [archive/tracks/](archive/tracks/) | Spent track-campaign notes: `HANDOFF-STARTFRAC.md` (superseded by `tracks/START-LINES.md`) and `RESEARCH-LEDGER.md` (40/40 complete). |
| [archive/workflows/](archive/workflows/) | Spent multi-agent orchestration scripts kept for provenance (`audit-verify-restructure.js`). Live workflows remain under `.claude/workflows/`. |
| [archive/webgpu/](archive/webgpu/) | The WebGPU migration plan and maintainability review (still cited by `spike/README.md`); the four phase build logs are in the attic ledger below. |
| [archive/ATTIC.md](archive/ATTIC.md) | The attic ledger: one row per record deleted from `docs/` on 2026-09-01 (title, original path, last SHA, one-line summary) — the 16 superpowers plans/specs, the four WebGPU phase build logs, the F1-25 product-research cluster, the circuit-briefing / steering / tilt / multiplayer surveys, and four spent research docs. `git show <sha>:<path>` recovers any of them. |
| [archive/research/](archive/research/) | Provenance investigations — no live doc depends on them for current structure. Includes shipped `physics-redesign.md`, implemented `UI-CSS-RESEARCH-2026-08.md`, the UI campaign set, and the 2026-08 audit records below. |
| [archive/research/PERF-LEDGER-2026-08.md](archive/research/PERF-LEDGER-2026-08.md) | PERF-FINDINGS §3 "Left on the table" as it stood before the 2026-08-18 hunt, verbatim: the reasoning behind every TAKEN / SUPERSEDED note the live §3 now keeps as one line each, the boot-wall / code-cache / `defer` analysis, and the VOID boot A/B. |
| [archive/research/AUDIT-SYNTHESIS-2026-08.md](archive/research/AUDIT-SYNTHESIS-2026-08.md) | The 21-agent audit workflow's synthesized execution plan — FIX-NOW (landed) / RESTRUCTURE / DEFER over 35 verified findings; drove the post-cleanup hardening. Archived once its restructure items landed. |
| [archive/research/TOTAL-AUDIT-2026-08.md](archive/research/TOTAL-AUDIT-2026-08.md) | The whole-tree audit: 197 adversarially-verified findings over every source file and doc — headlined by the curvature-sign trio in the track engine and the jump()/IncidentSim authority bug; drove the campaign fix waves. Archived once Batch A/B/C worked off. |
| [archive/research/CAMPAIGN-2026-08.md](archive/research/CAMPAIGN-2026-08.md) | The 2026 cleanup & hardening campaign plan of record: wave status, W2 execution order and gates, the design-ticket register, and which dated record owns which piece. Archived once the campaign completed. |
| [archive/research/TEST-AUDIT-2026-08.md](archive/research/TEST-AUDIT-2026-08.md) | The 11-agent test-semantics audit: per-file verdicts for all 162 test files, the corrected group taxonomy, the tests/ split map, and the change-aware CI design. Archived once W2 restructure landed. |
| [archive/research/RESEARCH-WAVE-2026-08.md](archive/research/RESEARCH-WAVE-2026-08.md) | Distilled residue of the 2026-08-08 parallel research fleet: instancing path, perf governor fix, throttle-bug sharpening, Bedrock go/no-go, Playwright suite health. |
| [archive/research/UI-SCALE-AND-ZOOM.md](archive/research/UI-SCALE-AND-ZOOM.md) | `zoom` as a scaling mechanism, measured: UI/HUD SIZE slider costs and why `zoom` is the right tool. |
| [archive/research/UI-REDESIGN-2026-08.md](archive/research/UI-REDESIGN-2026-08.md) | Menu system redesign proposal from seven defects measured at 852×393 — deferred; see UI-REMODEL-DECISION for the go/no-go. |
| [archive/research/UI-LAYOUT-CRITIQUE-2026-08.md](archive/research/UI-LAYOUT-CRITIQUE-2026-08.md) | Every menu measured at 852×393: vertical budget per screen and the height-blind container-query finding. |
| [archive/research/UI-REMODEL-DECISION-2026-08.md](archive/research/UI-REMODEL-DECISION-2026-08.md) | Remodel decision after 380-cell survey: NO for correctness, YES for maintainability — with deferred triggers. |
| [archive/research/ZOOM-ORIENTATION-STRUCTURE-2026-08.md](archive/research/ZOOM-ORIENTATION-STRUCTURE-2026-08.md) | Layout coordinate-space analysis: which vh queries are wrong under `zoom`, migration order, and trap fixes. |
| [archive/research/UI-CSS-RESEARCH-2026-08.md](archive/research/UI-CSS-RESEARCH-2026-08.md) | Token-adoption / first-paint research — recommendations implemented; kept as provenance. |
| [archive/research/physics-redesign.md](archive/research/physics-redesign.md) | Cartesian-vs-Frenet migration plan — executed; kept as provenance. |
| [archive/SCENERY-UPGRADE-PLAN.md](archive/SCENERY-UPGRADE-PLAN.md) | The scenery upgrade roadmap. Its helpers (`grandstandEx`, `landmarkKit`, `circuitKit`, `sceneryTheme`) are all in the frozen 111-member contract now. |
| [archive/2026-08-repo-audit.md](archive/2026-08-repo-audit.md) | The Aug-2026 repo audit's finding register — the not-fixed backlog as recorded at the time, kept as provenance for what was found and what has since been worked off. |
| [archive/2026-08-architecture-review-journal.md](archive/2026-08-architecture-review-journal.md) | The session journal behind the architecture review: the full defect register with fix narratives and measurements, verbatim. The standing review distilled from it lives at [ARCHITECTURE-REVIEW.md](ARCHITECTURE-REVIEW.md). |

For day-to-day workflows, see the **skills** in `.claude/skills/` (`.claude/skills/README.md`)
and the **tools** in `tools/` (`tools/README.md`).
