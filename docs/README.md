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
| [SCENERY-API.md](SCENERY-API.md) | The `scenery(api)` callback — buildings, props, barriers, terrain anchoring. |
| [LIGHTING-REF.md](LIGHTING-REF.md) | Light-record layout, shader uniforms, time-of-day branches, floodlight masts. |
| [LIGHTING-KNOBS.md](LIGHTING-KNOBS.md) | Every hand-tuned lighting constant, what it does, and how to A/B it (mirrors `tools/ab-lighting.mjs`). |
| [LIGHTING-PRESETS.md](LIGHTING-PRESETS.md) | Per-track × time-of-day × weather lighting presets baked into `js/game/light-presets.js`. |
| [TESTING.md](TESTING.md) | Spec coverage table, fixtures, the test philosophy. |
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

For day-to-day workflows, see the **skills** in `.claude/skills/` (`.claude/skills/README.md`)
and the **tools** in `tools/` (`tools/README.md`).
