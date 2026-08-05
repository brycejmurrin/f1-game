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
| [LIGHTING-KNOBS.md](LIGHTING-KNOBS.md) | Every hand-tuned lighting constant, what it does, and how to A/B it (mirrors `tools/ab-lighting.mjs`). |
| [LIGHTING-PRESETS.md](LIGHTING-PRESETS.md) | Per-track × time-of-day × weather lighting presets baked into `js/game/light-presets.js`. |
| [AGENT-WORLD-API.md](AGENT-WORLD-API.md) | The agent-facing JSON world view (`world`/`field`/`scene`/`rollout`/…). |
| [SCENERY-GROUNDING.md](SCENERY-GROUNDING.md) | How props seat on the terrain ribbon, and the float/clip audits. |
| [RENDER-CLIPPING.md](RENDER-CLIPPING.md) | Near/far planes, depth precision, and the clipping rules. |
| [TRACK-MIGRATION-CHECKLIST.md](TRACK-MIGRATION-CHECKLIST.md) | Steps for moving a circuit onto the shared track foundation. |
| [TESTING.md](TESTING.md) | How to run tests (background + tail, picking groups), every `test:*` group, the fixtures, the full spec coverage table, the philosophy. |
| [LAYOUT-AUDIT.md](LAYOUT-AUDIT.md) | The screen x viewport grid: which mechanism owns which layout decision, what the probe measures, and how to read the results. |
| [COMPONENTS.md](COMPONENTS.md) | Every class family in `css/`, the file that owns it, and — the part worth reading — which classes are defined in more than one file. |
| [AUDIT-2026-08.md](AUDIT-2026-08.md) | Open findings from the Aug-2026 repo audit — verified bugs and tooling gaps that are **not** fixed yet. The backlog, not a description of behaviour. |
| [CONSOLE-RECIPES.md](CONSOLE-RECIPES.md) | Driving the deployed game from DevTools: `__apex.diag()`, browser gotchas, ready-made blocks. |
| [iOS-OPTIMIZATION.md](iOS-OPTIMIZATION.md) | Mobile/iOS perf and Safari quirks. |
| [tracks/](tracks/) | Per-circuit reference material. |

### WebGPU backend (opt-in)

`js/render/webgpu/*` is **DEFERRED** — no `<script>` tag; `js/game.js` injects it
at boot only when `apex26.gfxBackend=webgpu`, with GLX fallback on any failure.

**What still matters is in [ARCHITECTURE.md](ARCHITECTURE.md)**: WGX never
reached parity with GLX (no volumetrics, no PCSS, MSAA 1, no `gpuTimer`, no baked
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

The four that survive here are cited from source or from `CLAUDE.md`, which is
what keeps them live. Everything else that used to sit in this table was indexed
by nothing and moved to [`archive/research/`](archive/research/).

| Doc | Topic |
|---|---|
| [research/physics-redesign.md](research/physics-redesign.md) | Cartesian-vs-Frenet physics migration plan. |
| [research/steering-research.md](research/steering-research.md) | Steering-model source notes + citations. |
| [research/ASSET-API-RESEARCH.md](research/ASSET-API-RESEARCH.md) | External model/texture/normal-map ingestion: CC0 asset APIs, a `MAT`-indexed texture array, offline bake tool. |
| [research/ENGINEERING-PRACTICE-NOTES.md](research/ENGINEERING-PRACTICE-NOTES.md) | Why the game loop's clamps and caps are load-bearing, what `seed()` can and cannot promise given float non-associativity, the characterization-test method for Phase 4 extractions, and the state of the no-build bet. |
| [research/CI-RENDERING-PERFORMANCE.md](research/CI-RENDERING-PERFORMANCE.md) | Why the Playwright suite is slow under SwiftShader, what llvmpipe/xvfb/GPU runners would change, why sharding is the wrong first move, and the (now shipped everywhere) state of WebGPU. External findings, not measurements — flagged as such. |
| [research/SCENE-GRAPH-PLAN.md](research/SCENE-GRAPH-PLAN.md) | Why detail is unaffordable without instancing; the staged scenery scene-graph plan and its measured per-emitter reuse. |

## Archive (`archive/`)

Provenance only. Nothing here describes current structure, and no live doc
depends on it.

| Path | What it is |
|---|---|
| [archive/superpowers/](archive/superpowers/) | 17 dated plans and specs from individual 2026-07 work sessions. Written against the pre-reorganisation flat `js/` layout, so their paths no longer resolve — expected, not rot. Their checkboxes are unchecked against work that shipped; read them for intent, never for status. |
| [archive/webgpu/](archive/webgpu/) | The WebGPU migration plan, maintainability review and four phase build logs. |
| [archive/research/](archive/research/) | Ten investigations that no live doc or source file references: steering/tilt physics, circuit-briefing design + UI, rendering improvements, external model sources, longer-horizon physics, multiplayer research + the 4-player plan (both shipped), UI layout research. |
| [archive/SCENERY-UPGRADE-PLAN.md](archive/SCENERY-UPGRADE-PLAN.md) | The scenery upgrade roadmap. Its helpers (`grandstandEx`, `landmarkKit`, `circuitKit`, `sceneryTheme`) are all in the frozen 107-member contract now. |

For day-to-day workflows, see the **skills** in `.claude/skills/` (`.claude/skills/README.md`)
and the **tools** in `tools/` (`tools/README.md`).
