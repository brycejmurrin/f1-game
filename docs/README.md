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
| [LIGHTING-REF.md](LIGHTING-REF.md) | UBO layout, shader uniforms, time-of-day branches, floodlight masts. |
| [TESTING.md](TESTING.md) | Spec coverage table, fixtures, the test philosophy. |
| [iOS-OPTIMIZATION.md](iOS-OPTIMIZATION.md) | Mobile/iOS perf and Safari quirks. |
| [tracks/](tracks/) | Per-circuit reference material. |

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
