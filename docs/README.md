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
| [PLATFORM.md](PLATFORM.md) | iOS/Safari quirks, controller support, and what a static GitHub Pages host does and does not give you. |

## Agent surface and hooks

| Doc | Covers |
|---|---|
| [AGENT-SURFACE.md](AGENT-SURFACE.md) | Skills vs MCP vs `tools/` CLIs vs wrap — which `apex_*` exists, which stay CLI-only, and why the ones that left, left. |
| [DEBUG-HOOKS.md](DEBUG-HOOKS.md) | Full `window.__apex` dev-API reference (generated), the agent-facing JSON world view (`world`/`field`/`scene`/`rollout`), and the DevTools console recipes. `AGENTS.md` has the short list. |
| [LIGHTING-TUNER-SLIDERS.md](LIGHTING-TUNER-SLIDERS.md) | All 183 tuner sliders: range, default, the GLSL uniform each drives, where it is consumed. Generated from `TUNE_DEFS`. |
| [tracks/](tracks/) | Per-circuit reference material. |
| [look-survey/README.md](look-survey/README.md) | 4×5 contact sheets from the mcp-probe look-survey (one PNG per finished circuit); written by `tools/look-survey-sheet.py`. |

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
| [notes/ENGINEERING-PRACTICE-NOTES.md](notes/ENGINEERING-PRACTICE-NOTES.md) | Why the game loop's clamps and caps are load-bearing, what `seed()` can and cannot promise given float non-associativity, the characterization-test method, and the state of the no-build bet. |
| [notes/BUG-HUNT-2026-09-02.md](notes/BUG-HUNT-2026-09-02.md) | Two rounds of read-only bug hunts (UI, GLX, WGX+TLX, memory, race-flow; then track engine, physics/AI, input/audio, net): every CONFIRMED row and what each fix batch landed. |
| [notes/PERF-HUNT-2026-08-18.md](notes/PERF-HUNT-2026-08-18.md) | 08-17 board re-walk; union banner at cache 1421. WGX UBO flushes, `LAZY_AGENT`, DebrisWorld asleep-skip. |

## `research/` — cited from source, not a description of behaviour

What survives here is cited **by path from `js/`, `tests/` or `tools/`** — that
citation is what keeps it live and at this path. Dated by design: when a path a
research doc cites has since moved, add a one-line `> Errata:` under its title
rather than rewriting the record.

| Doc | Topic | Cited from |
|---|---|---|
| [research/PLATFORM-INPUT-NOTES.md](research/PLATFORM-INPUT-NOTES.md) | The platform behaviours that only bite on one device: pointer capture and the four-way release net, the top layer vs `z-index`, `zoom` and `--ui-scale`, `(pointer: coarse)`, Escape vs `<dialog>` close watchers, iOS WebGL context loss. | `js/input/input.js`, `js/ui/modal.js`, 4 specs |
| [research/WEBGPU-PARITY.md](research/WEBGPU-PARITY.md) | How to close WGX vs GLX: gap inventory, WebGPU API recipes (MSAA resolve, timestamp-query, texture arrays, mip-gen, god-ray), recommended slice order. §5 holds the two WGSL rules a mock device cannot enforce. | `js/render/webgpu/*` |
| [research/PHASE-C-SLIDER-DESIGN.md](research/PHASE-C-SLIDER-DESIGN.md) | The slider recalibration with the numbers: the arithmetic defects behind "I always end up at the bottom", computed from the shipped mappings. | `js/game.js`, `js/input/steer-tuning.js` |
| [research/DRIVING-CONTROLS-RESEARCH.md](research/DRIVING-CONTROLS-RESEARCH.md) | What shipped racing games do for assists and speed-sensitive steering — including the deliberately NEGATIVE conclusions that keep un-built features from being re-litigated. | `js/audio/engine.js`, `js/physics/brake-cue.js` |
| [research/SCENE-GRAPH-PLAN.md](research/SCENE-GRAPH-PLAN.md) | Why detail is unaffordable without instancing; the staged scenery scene-graph plan and its measured per-emitter reuse. | `js/render/glx/glx.js` |
| [research/UI-DESIGN-PRINCIPLES.md](research/UI-DESIGN-PRINCIPLES.md) | Why the UI is sized the way it is: size for the PHONE at arm's length, and collapse a primitive only when it passes the three-places-plus-generic test. | `css/tokens.css`, `tests/unit/game-ctx-surface.test.mjs` |
| [research/ARCHITECTURE-REDESIGN-2026-08.md](research/ARCHITECTURE-REDESIGN-2026-08.md) | Three competing redesigns (zero-build ESM, TypeScript+esbuild, harden-IIFE-in-place) scored by two judges; Bedrock-with-grafts adopted, ESM kept as the documented escalation path. | `tools/check-gctx.mjs`, `tools/scan-globals.mjs` |
| [research/ASSET-API-RESEARCH.md](research/ASSET-API-RESEARCH.md) | External model/texture/normal-map ingestion: CC0 asset APIs, a `MAT`-indexed texture array, offline bake tool. | `tools/check-gctx.mjs`, `tools/assets.mjs` |
| [research/APEX-TOOLS-MCP.md](research/APEX-TOOLS-MCP.md) | Design / refuses for the `apex-tools` wrap. Agent map: [AGENT-SURFACE.md](AGENT-SURFACE.md). | `tools/apex-tools-mcp.mjs`, `tools/wgx-shot.mjs` |
| [research/CHROME-DEVTOOLS-MCP.md](research/CHROME-DEVTOOLS-MCP.md) | Playbook for the chrome-devtools MCP tools against Apex: roots/`/tmp` file writes, snapshot uids, cold-boot LCP, clean heap cycles, lighthouse snapshot scores. Companion to `.claude/skills/mcp-probe`. | `tools/cdmcp-cli.py`, `tools/ratchets.mjs` |
| [research/STRUCTURE-REDECISION-2026-08.md](research/STRUCTURE-REDECISION-2026-08.md) | Six structural questions re-opened on user request and re-decided from fresh measurement. | `tests/unit/perf-governor.test.mjs` |
| [research/UI-REDESIGN-2026-08-18.md](research/UI-REDESIGN-2026-08-18.md) | UI redesign implementation plan + acceptance contract: catalogue screens restructured around one dominant scroller; the visual identity kept. | `tests/unit/css-token-adoption.test.mjs` |
| [research/TREE-RESTRUCTURE-2026-09.md](research/TREE-RESTRUCTURE-2026-09.md) | The verified diagnosis and the approved six-phase restructuring plan: generate the shell from the manifest (Phase 0), js/ domain directories (Phase 2), the test-tree taxonomy, game.js carves, tools/ and docs/ consolidation. | `js/perf/renderer-picker.js`, 2 tests, 3 tools |
| [research/RENDERER-PERF-AUDIT-2026-09-02.md](research/RENDERER-PERF-AUDIT-2026-09-02.md) | Three read-only renderer perf audits (GLX / WGX / TLX), ranked findings with proposed patches; landed items marked. Held at this path by the pending WGX/TLX spike-out. | `spike/backends/README.md`, `tools/moves/spike-backends.json` |
| [research/steering-research.md](research/steering-research.md) | Steering-model source notes + citations. | `.claude/skills/tune-physics` |
| [research/wgx-gallery/](research/wgx-gallery/) | WGX reference frames + `wgx-gallery-manifest.json`, read by `tools/wgx-shot.mjs`. Moves with the spike-out. | `tools/wgx-shot.mjs` |

## `archive/` — provenance only

**Never read these for current structure.** They were written against layouts
that have since moved. `git show <sha>:<path>` recovers anything the attic
ledger lists.

| Path | What it is |
|---|---|
| [archive/ATTIC.md](archive/ATTIC.md) | The attic ledger: one row per record deleted from `docs/` (title, original path, last SHA, one-line summary). |
| [archive/research/](archive/research/) | Provenance investigations — the 2026-08 audit records, the UI campaign set, the browser-graphics survey, the cleanup sweep and the parallel fleet survey. |
| [archive/research/raw/](archive/research/raw/) | The four workflows' verbatim per-agent output. Read when a summary's wording is doing too much work. |
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
