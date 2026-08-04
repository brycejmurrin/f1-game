# Apex 26 — docs

Two kinds of docs live here. **Engineering reference** describes how the shipped
game works today — read it before touching the matching subsystem. **Research**
(`research/`) is historical design notes and investigations that informed the
code but are *not* a description of current behaviour.

## Engineering reference (current)

| Doc | Covers |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Module layout, the game loop, how the pieces fit. |
| [DEBUG-HOOKS.md](DEBUG-HOOKS.md) | Full `window.__apex` dev-API reference (CLAUDE.md has the short list). |
| [CAREER.md](CAREER.md) | Career mode: the flow/session axes, the six `apex26.career.<flavour>.N` save slots, driver ratings, the economy and R&D gate, qualifying, reliability. |
| [SCENERY-API.md](SCENERY-API.md) | The `scenery(api)` callback — buildings, props, barriers, terrain anchoring. |
| [LIGHTING-REF.md](LIGHTING-REF.md) | Light-record layout, shader uniforms, time-of-day branches, floodlight masts. |
| [LIGHTING-KNOBS.md](LIGHTING-KNOBS.md) | Every hand-tuned lighting constant, what it does, and how to A/B it (mirrors `tools/ab-lighting.mjs`). |
| [LIGHTING-PRESETS.md](LIGHTING-PRESETS.md) | Per-track × time-of-day × weather lighting presets baked into `js/game/light-presets.js`. |
| [AGENT-WORLD-API.md](AGENT-WORLD-API.md) | The agent-facing JSON world view (`world`/`field`/`scene`/`rollout`/…). |
| [SCENERY-GROUNDING.md](SCENERY-GROUNDING.md) | How props seat on the terrain ribbon, and the float/clip audits. |
| [RENDER-CLIPPING.md](RENDER-CLIPPING.md) | Near/far planes, depth precision, and the clipping rules. |
| [TRACK-MIGRATION-CHECKLIST.md](TRACK-MIGRATION-CHECKLIST.md) | Steps for moving a circuit onto the shared track foundation. |
| [TESTING.md](TESTING.md) | Spec coverage table, fixtures, the test philosophy. |
| [LAYOUT-AUDIT.md](LAYOUT-AUDIT.md) | The screen x viewport grid: which mechanism owns which layout decision, what the probe measures, and how to read the results. |
| [AUDIT-2026-08.md](AUDIT-2026-08.md) | Open findings from the Aug-2026 repo audit — verified bugs and tooling gaps that are **not** fixed yet. The backlog, not a description of behaviour. |
| [iOS-OPTIMIZATION.md](iOS-OPTIMIZATION.md) | Mobile/iOS perf and Safari quirks. |
| [tracks/](tracks/) | Per-circuit reference material. |

### WebGPU backend (opt-in)

The additive WebGPU renderer (loaded by `index.html`, activated only via
`localStorage apex26.gfxBackend=webgpu`, WebGL2/GLX fallback on any failure).

| Doc | Covers |
|---|---|
| [WEBGPU-MIGRATION.md](WEBGPU-MIGRATION.md) | The original migration plan: renderer inventory, WebGL2→WebGPU concept map, the `Gfx` seam, phased roadmap. |
| [WEBGPU-MAINTAINABILITY.md](WEBGPU-MAINTAINABILITY.md) | Companion review: shader-chunk sharing + the "do anyway" refactor roadmap. |
| [WEBGPU-PHASE0-NOTES.md](WEBGPU-PHASE0-NOTES.md) | Phase 0/1 build notes: the `Gfx` seam + device/clear/sky skeleton. |
| [WEBGPU-PHASE2-NOTES.md](WEBGPU-PHASE2-NOTES.md) | Phase 2: real geometry + the lit shading pipeline. |
| [WEBGPU-PHASE3-NOTES.md](WEBGPU-PHASE3-NOTES.md) | Phase 3: sun shadow map + comparison-sampler PCF. |
| [WEBGPU-PHASE4-NOTES.md](WEBGPU-PHASE4-NOTES.md) | Phase 4/4b: post chain, foreground FX, SSR, env probe. |

### three.js / TLX backend (opt-in)

The third renderer behind the same `Gfx` seam (`js/render/three/`), activated
via `localStorage apex26.gfxBackend=three`. Evaluation spikes, measured
criteria and the phased adoption plan live in [`spike/`](../spike/) —
`spike/README.md` for the criteria table and numbers, `spike/ADOPTION-PLAN.md`
for the graphics phases and the additive Rapier plan that `js/game/debrisworld.js`
and `js/game/incidentsim.js` implement.

## Research (historical — not current behaviour)

Design explorations and source-cited investigations kept for context. They may
describe paths not taken or plans only partly implemented.

| Doc | Topic |
|---|---|
| [research/physics-redesign.md](research/physics-redesign.md) | Cartesian-vs-Frenet physics migration plan. |
| [research/physics-future.md](research/physics-future.md) | Longer-horizon physics ideas. |
| [research/steering-research.md](research/steering-research.md) | Steering-model source notes + citations. |
| [research/STEERING-PHYSICS-RESEARCH.md](research/STEERING-PHYSICS-RESEARCH.md) | Deep dive on steering/physics literature. |
| [research/TILT-STEERING-RESEARCH.md](research/TILT-STEERING-RESEARCH.md) | Tilt-steering (device orientation) investigation. |
| [research/CIRCUIT-BRIEFING-DESIGN.md](research/CIRCUIT-BRIEFING-DESIGN.md) | Circuit-briefing feature design. |
| [research/CIRCUIT-BRIEFING-UI-RESEARCH.md](research/CIRCUIT-BRIEFING-UI-RESEARCH.md) | Circuit-briefing UI research. |
| [CONSOLE-RECIPES.md](CONSOLE-RECIPES.md) | Driving the deployed game from DevTools: `__apex.diag()`, browser gotchas, ready-made blocks. |
| [research/RENDERING-IMPROVEMENTS.md](research/RENDERING-IMPROVEMENTS.md) | Renderer/geometry audit, measured budgets, ranked opportunities. |
| [research/ASSET-API-RESEARCH.md](research/ASSET-API-RESEARCH.md) | External model/texture/normal-map ingestion: CC0 asset APIs, a `MAT`-indexed texture array, offline bake tool. |
| [research/EXTERNAL-MODEL-SOURCES.md](research/EXTERNAL-MODEL-SOURCES.md) | Where 3D models can come from (Poly Pizza / Sketchfab / Poly Haven / OSM), and why the bake must be offline. |
| [research/SCENE-GRAPH-PLAN.md](research/SCENE-GRAPH-PLAN.md) | Why detail is unaffordable without instancing; the staged scenery scene-graph plan and its measured per-emitter reuse. |
| [research/SCENERY-UPGRADE-PLAN.md](SCENERY-UPGRADE-PLAN.md) | Scenery upgrade roadmap. |

### Dated plans & specs (`superpowers/`)

`superpowers/plans/` and `superpowers/specs/` are **point-in-time records** from
individual work sessions, kept for provenance. They were written against the
*pre-reorganisation* flat layout, so
their file paths no longer resolve (they name modules at a flat `js/` root that
have since moved into `js/track/`, `js/render/`, `js/game/` and `js/data/`).
That is expected, not rot. Read them for intent, never for current structure.

For day-to-day workflows, see the **skills** in `.claude/skills/` (`.claude/skills/README.md`)
and the **tools** in `tools/` (`tools/README.md`).
