---
name: race-incidents-control
description: "Use when debris (debris-world.js), Rapier side-worlds, incident takeovers (incident-sim.js), car launches/flips, airborne or frozen cars, the pile-up takeover (c1Pileup), cautions, yellow/red flags, VSC, safety car never deploying or stuck out, overtake gating or reliability retirements change. AI racing badly or misusing ERS/overtake → ai-racecraft; career DNF money/contracts → career-mode."
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

- A car that will not move: `caution().level` ≠ 0 or `sinceT` growing (a flag or
  safety car stuck out) is HERE; level 0 with `speed < 7` and `stuckT` growing is
  `ai-racecraft` (wedged AI).
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
| `apex26.debris` | Rapier debris side-world; default OFF, only `"1"` enables (read once at boot) |
| `apex26.breakBarriers` | Breakable barrier panels (`"0"` disables; likewise the keys below) |
| `apex26.marbleGrip` | Marble grip scalar |
| `apex26.r2Airborne` | Airborne/rollover takeover |
| `apex26.r3Contact` | Heavy car-car contact takeover |
| `apex26.c1Pileup` | Multi-car pile-up takeover |
| `apex26.caution` | Race-control cautions (default off) |

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
npm run test:tooling-fast                      # background, AGENTS.md rule 4
node --test tests/unit/race-control.test.mjs   # flags/caution rules, <1 s; also reliability, debris-*.test.mjs
node --test tests/unit/incident-gate.test.mjs  # R2/R3/C1 takeovers: promote, window, handback, release
npm test -- tests/specs/race-control.spec.js   # flags only (no IncidentSim); background (AGENTS.md rules 4-5); whole group: tools/ci/remote-group.mjs physics-core
```

## Load on demand

- Workflow, test map, traces (takeover never released, SC never deploys / stuck out), common mistakes → [references/workflow.md](references/workflow.md).
- DNF on lap 1 / every race → [references/reliability-trace.md](references/reliability-trace.md).
- Module headers: `js/physics/debris-world.js`, `js/physics/incident-sim.js`, `js/race/race-control.js`; `docs/DEBUG-HOOKS.md` `caution()`/`retirements()`.
