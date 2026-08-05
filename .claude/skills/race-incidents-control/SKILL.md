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
| `js/game/debrisworld.js` | Rapier side-world for render/cosmetic-plus debris; never writes car pose, `(s,x)`, speed, or heading |
| `js/game/incidentsim.js` | High-risk layer; may move cars only inside finite, bounded takeover windows with fallback |
| `js/game/racecontrol.js` | Read-only flag machine over `DebrisWorld.hazards()`; host-owned in multiplayer |
| `js/game/reliability.js` | Staged DNF/retirement plan; deterministic and career-aware |

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
npm run test:debris
node --test tests/race-control.test.mjs
node tools/test-bg.mjs debris
```

Deep references:

- Headers of `js/game/debrisworld.js`, `js/game/incidentsim.js`,
  `js/game/racecontrol.js`.
- `docs/DEBUG-HOOKS.md` sections for `caution()` and `retirements()`.

## Workflow / Implementation

1. **Classify which authority owns the behavior.**
   - Visual shards, marbles, panels, and hazards belong in `DebrisWorld`.
   - Car launches, heavy car-car contact, and pile-ups belong in `IncidentSim`.
   - Flag decisions and overtake gating belong in `RaceControl`.
   - Planned mechanical failures belong in `Reliability`.

2. **Keep DebrisWorld writeback-free.**
   - It mirrors cars into Rapier as kinematic bodies and reads debris transforms
     back for rendering/hazard reporting only.
   - It must not write `px`, `pz`, `head`, speed, or `(s,x)`.
   - Gameplay-adjacent outputs are read-only scalars/state: hazards, panels,
     marble grip. The bespoke collision/barrier model remains authoritative.

3. **Treat IncidentSim as the bounded exception.**
   - A takeover starts from a clear trigger and always hands back by settle or
     hard time cap.
   - Every pose write must be inside an active takeover and guarded by finite
     checks, teleport bounds, Rapier-world generation checks, and fallback.
   - On anomaly, revert to last-good bespoke state and hand control back.
   - Incident takeovers must explicitly invalidate affected laps/ghosts.

4. **Keep RaceControl read-only and host-owned.**
   - `RaceControl.update()` reads `DebrisWorld.hazards()` at about 4 Hz.
   - It raises caution immediately but lowers with hysteresis/minimum hold and
     hard caps to avoid flicker or permanent neutralization.
   - In multiplayer, only the host computes; guests adopt host `apply()` state.
   - Caution disables OVERTAKE, not active aero.

5. **Preserve determinism.**
   - No `Date.now()` or `Math.random()` in debris, incident, caution, or
     reliability decisions.
   - Seed variation from game state: tick counters, car index, quantized `s`,
     incident sequence, round/driver keys.
   - Keep fixed insertion/order guarantees when interacting with Rapier.

6. **Use hooks to inspect the exact layer.**
   - `__apex.debris()` for side-world enabled/ready/active (`DebrisWorld.active`,
     `apex26.debris` localStorage key).
   - `__apex.incident()` / `incident({reset:true})` for R2/R3/C1 takeover state.
   - `__apex.caution({hazards:true})` for flag state plus hazard list.
   - `__apex.retirements()` after `seed()`/`reliability()`/`race()` for DNF plan.
   - `carAt(i).otEnabled` to confirm overtake gating under cautions.

   **"SC never comes out" checklist:**
   1. `DebrisWorld.active` / `apex26.debris` — side-world enabled?
   2. `caution({hazards:true})` — hazard `total` vs thresholds (`VSC_MIN=6`,
      `SC_MIN=10` in `racecontrol.js`)?
   3. `caution({enabled:true})` — cautions not disabled?
   4. Multiplayer: only the **host** computes flags; guests adopt host `apply()`.
      **`__apex.net()` does NOT carry caution** — compare `__apex.caution()` on
      BOTH peers. Guest green while host shows VSC (roles correct via
      `__apex.net().role`) means the guest failed to adopt `EV.CAUTION` via
      `apply()`. Headless proof: loopback + inject caution, then read both sides.

7. **Verify narrowly, then with browser coverage.**
   - Run the pure unit guard `node --test tests/race-control.test.mjs` after
     race-control logic changes.
   - Run `test:debris` for debris and caution browser coverage.
   - Use `test:tooling-fast` for docs/hooks/unit inventory checks.
   - If JS changed, use `bump-cache`.

## Common Mistakes

- Letting DebrisWorld "help" collision response by moving a car; that belongs to
  the bespoke model or bounded IncidentSim only.
- Adding an IncidentSim path without a hard handback cap and last-good fallback.
- Changing tire grip/friction ellipse from IncidentSim; the header forbids it.
- Computing race control on guests; debris is local, so only host flags define
  the shared race. Inspect `caution()` on each peer — `net()` omits it.
- Lowering flags directly on hazard count with no hysteresis, causing flicker as
  debris despawns.
- Assuming safety car/VSC slows cars by itself; this layer sets flags and gates
  overtake, it does not drive cars.
- Using wall-clock time or global random sources, breaking seeded determinism.
- Reporting a timeout-shaped browser failure as logic before checking load and
  re-running the specific spec alone if needed.
