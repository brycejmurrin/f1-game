---
name: race-incidents-control
description: "Use when crashes or race control misbehave: debris, cars flipping or freezing, pile-ups, flags, VSC, marshals, a safety car stuck out or never deploying, or reliability retirements. Not for: AI racecraft → ai-racecraft; career DNF money → career-mode; handling → tune-physics."
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
- The reliability retirement plan (`Reliability.arm`/`plan`, `__apex.retirements()`): this skill owns it;
  career-mode owns only what a career does with a DNF (money, standings).
- Blue flags (the call; the time penalty is `SportingRegs`, race-weekend).
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

**What `hazards()` counts** (`DebrisWorld.hazards`, read its body): only SLEEPING debris shards, disturbed
cones and broken panels on the road (within the half-width and `HAZARD_Y_TOL` of road height). Stopped,
retired or pile-up CARS never count. A shard returns to the pool `REST_DESPAWN_S` after it sleeps (or past
`FAR_DESPAWN_M` from the player), and the pool is `CAP_DESKTOP` / `CAP_MOBILE` (the phone tier) with
oldest-recycle — so the count is a short peak. "SC never deploys after a pile-up" is often this, not a
threshold: sample `caution({hazards:true})` every 0.25 s through the settle window, never once afterwards
(recipe: references/workflow.md §SC never deploys).
| `js/race/reliability.js` | Staged DNF/retirement plan; deterministic and career-aware |

**Marbles are not cosmetic.** AI cars drop marbles through `DebrisWorld.tyreMarble`, and
`marbleGrip` then cuts the player's grip in the force path (`js/physics/player-forces.js`, floor
0.93). Arc-rule class: **surface** (pass-4 audit DECISIONS #4): the drop signal must be the AI
car's own measured lateral acceleration / tyre slip, never track curvature or the racing line — a
curvature-derived drop is an arc-rule leak. The classification home is the marble row of
docs/PHYSICS.md's legitimate-columns table; point there, do not copy it. Changing marbles is a
physics change: tune-physics' arc check and agent `physics-contract-auditor`.

Flags / storage:

| Key | Meaning |
|---|---|
| `apex26.debris` | Rapier debris side-world; default OFF, only `"1"` enables (read once at boot) |
| `apex26.breakBarriers` | Breakable barrier panels (`"0"` disables; likewise the keys below) |
| `apex26.marbleGrip` | Marble grip scalar — reaches the PLAYER's grip (see Marbles above) |
| `apex26.r2Airborne` | Airborne/rollover takeover |
| `apex26.r3Contact` | Heavy car-car contact takeover |
| `apex26.c1Pileup` | Multi-car pile-up takeover |
| `apex26.caution` | Race-control cautions (default off) |

Hooks:

| Hook | Use |
|---|---|
| `__apex.debris(arg?)` | Enable/disable, inspect status, `{hazards:true}`, `{reset:true}`, `{burst:n}` (full contract: the hook's comment in `js/agent/apex.js`) |
| `__apex.incident(arg?)` | R2/R3/C1 takeover status; `{launch:true}`, `{flags:{…}}`, `{reset:true}` to abort takeovers |
| `__apex.caution(arg?)` | Inspect/toggle flags; pass `{hazards:true}` for live hazard list |
| `__apex.retirements()` | Inspect planned and active DNFs |
| `__apex.reliability(mode?)` | Configure staged reliability behavior |
| `__apex.carAt(i)` | Check `otEnabled`, pose, retirement state, and incident-visible effects |
| `__apex.physState()` / `obs()` | Inspect player pose, slip, speed, and recovery after an incident |

Commands:

```sh
node tools/ci/tooling-fast.mjs --changed --jobs=3 --quiet   # diff-aware; the full suite runs on the PR
node --test tests/unit/race-control.test.mjs   # flags/caution rules, <1 s; also reliability, debris-*.test.mjs
node --test tests/unit/incident-gate.test.mjs  # R2/R3/C1 takeovers: promote, window, handback, release
APEX_VM_PAGE_GROUP=b node --test tests/unit/adapted-specs.test.mjs   # race-control.spec (flags only, no IncidentSim) VM-adapted, NO browser (test:vm-page-b)
node tools/ci/test-bg.mjs --spec tests/specs/debris.spec.js   # BROWSER, one spec, backgrounded (AGENTS.md rule 4); a subagent reports it not run
node tools/ci/remote-group.mjs physics-core     # the whole group, pushed branch only
```

## Load on demand

- Workflow, test map, traces (takeover never released, SC never deploys / stuck out), common mistakes → [references/workflow.md](references/workflow.md).
- DNF on lap 1 / every race → [references/reliability-trace.md](references/reliability-trace.md).
- Module headers: `js/physics/debris-world.js`, `js/physics/incident-sim.js`, `js/race/race-control.js`; `docs/DEBUG-HOOKS.md` `caution()`/`retirements()`.
