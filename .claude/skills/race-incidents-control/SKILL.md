---
name: race-incidents-control
description: "Use when debris, Rapier side-worlds, incident takeovers, car launches or pileups, cautions, VSC, safety car, overtake gating, reliability retirements, or race-control tests are being changed or debugged."
---

## Overview

Incidents are split by authority: `DebrisWorld` never moves cars,
`IncidentSim` may move cars only inside bounded takeover windows, and
`RaceControl` reads hazards to set flags without touching car pose or speed.

## When to Use

Use this for:

- Cosmetic debris, marbles, breakable panels, clippable cones, or Rapier
  side-world behavior.
- R2/R3/C1 incident takeover, airborne/rollover, car-car contact, or pile-up
  behavior.
- Yellow/VSC/safety-car state, host-owned race control, caution HUD/copy, or
  overtake disabling.
- Reliability/DNF plans when they interact with incident/caution state.
- Determinism checks around incident seeds, fixed ticks, or hazard queries.

Do **not** use this for:

- Ordinary bicycle-model grip/handling tuning.
- Pure multiplayer lobby/signalling issues; use `multiplayer-debug`.
- Active aero zones themselves; only use this for overtake/caution gating.

## Quick Reference

| Module | Authority contract |
|---|---|
| `js/physics/debris-world.js` | Rapier side-world for render/cosmetic-plus debris; never writes car pose, `(s,x)`, speed, or heading |
| `js/physics/incident-sim.js` | High-risk layer; may move cars only inside finite, bounded takeover windows with fallback |
| `js/race/race-control.js` | Read-only flag machine over `DebrisWorld.hazards()`; host-owned in multiplayer |
| `js/race/reliability.js` | Staged DNF/retirement plan; deterministic and career-aware |

Flags / storage:

| Key | Meaning |
|---|---|
| `apex26.debris` | Enables Rapier debris side-world (`"0"` disables) |
| `apex26.breakBarriers` | Breakable barrier panels |
| `apex26.marbleGrip` | Marble grip scalar |
| `apex26.r2Airborne` | Airborne/rollover takeover |
| `apex26.r3Contact` | Heavy car-car contact takeover |
| `apex26.c1Pileup` | Multi-car pile-up takeover |
| `apex26.caution` | Race-control cautions |

Hooks:

| Hook | Use |
|---|---|
| `__apex.debris(arg?)` | Enable/disable, inspect status, `{hazards:true}`, `{reset:true}`, `{burst:n}` — thin in DEBUG-HOOKS prose but fully documented in `apex.js` |
| `__apex.incident(arg?)` | R2/R3/C1 takeover status; `{launch:true}`, `{flags:{…}}`, `{reset:true}` to abort takeovers |
| `__apex.caution(arg?)` | Inspect/toggle flags; pass `{hazards:true}` for live hazard list |
| `__apex.retirements()` | Inspect planned and active DNFs |
| `__apex.reliability(mode?)` | Configure staged reliability behavior |
| `__apex.carAt(i)` | Check `otEnabled`, pose, retirement state, and incident-visible effects |
| `__apex.physState()` / `obs()` | Inspect player pose, slip, speed, and recovery after an incident |

Commands:

```sh
npm run test:tooling-fast
node --test tests/unit/race-control.test.mjs
node tools/test-bg.mjs driving   # in background (non-blocking)
```

Deep references:

- Headers of `js/physics/debris-world.js`, `js/physics/incident-sim.js`,
  `js/race/race-control.js`.
- `docs/DEBUG-HOOKS.md` sections for `caution()` and `retirements()`.


---

## Load on demand

- Workflow, takeovers/cautions, common mistakes → [references/workflow.md](references/workflow.md).
