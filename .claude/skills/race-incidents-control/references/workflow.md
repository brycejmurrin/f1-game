# Race-incidents workflow — debris, takeovers, cautions, common mistakes

Load from the SKILL.md index when the task needs this detail.

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
   - The Safety Car / red flag disables OVERTAKE (until the leader's next crossing after it ends; Art. B7.2.2), not active aero; a yellow or VSC disables neither. LOW GRIP (wet: `TyreModel.treadFor` > 0) also disables it (B7.2.2(d)) and halves the active-aero trade (`aeroWetK` in game.js).
   - Under the Safety Car the field QUEUES (B5.13): `RaceControl.scQueueFrac` gives the leader the SC pace (0.45 × vTop) and a car > 1 s adrift of the car ahead on the road up to 0.6 × vTop until it closes — so a stop under the SC is genuinely cheaper. Overtake itself is `js/race/overtake-mode.js` (detection line, 0.5 MJ allowance).

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

   **`incident({reset:true})` is a NO-OP once the takeover already ended.**
   `IncidentSim.reset()` (`js/physics/incident-sim.js`) only iterates and hands back
   entries in `_incidents` — if the takeover already settled or hit its hard
   time cap, `_incidents` is already empty and `reset()` does nothing (the
   `for` loop runs zero times) even though it still returns `status()` looking
   like success. **It cannot fix a car that looks stuck *after* handback** —
   that is bespoke-model state (off-track, low speed, bad heading), not an
   active takeover. For a stuck-after-handback car, use `__apex.resetPlayer()`
   or `__apex.jump(frac, speed, x)` instead; only reach for `incident({reset:true})`
   while `incident().count > 0` / `incidents` is non-empty.

   **"A team's car retires on lap 1 / every race" (reliability trace, all node-level):**
   `Reliability.arm` (`js/race/reliability.js`, called by `armReliability` in game.js) plans `dnfAt` in [0.06, 0.94] of race DISTANCE, so in a 25-lap race a *Reliability* draw cannot land on lap 1 (a 3-lap race can: 0.06 x 3 = 0.18 lap). Per-team inputs: `TIER_RISK[car.tier]` x `1 - 0.40*devNorm(team)` (`Career.paceMult`/`tdev`), player-only `BUILD_RELIEF` (off when networked), x `LEVELS` (off 0 / low .5 / real 1). Draw = `Career.hash(seed,"dnf",round,driverId)` — same seed, same field. Other lap-1 sources to rule out first: `real-race.js` `DNS_AT = 0.002` (a game seat with no real driver retires on the first metres), `apex.js` grid setup retiring every planned car at once, and `checkRetirements` (game.js) firing on `prog/(lapsTarget*track.total)`. Steps: `__apex.retirements()` (browser) or `Reliability.plan(cars)` in a VM; `node --test tests/unit/reliability.test.mjs` (4 tests: OFF clears, seed-pure, tier/LOW rate, `at` bounds). NOT pinned by any unit test: team-dev relief, build relief, `checkRetirements`, DNS_AT — a fix there needs a new case in that file (stub `Career.paceMult`).

   **"SC never comes out" checklist** (steps 1-3 are `__apex` calls = browser/live page only; the gating logic is pinned by `node --test tests/unit/race-control.test.mjs`, 35 tests, <1 s):
   1. `caution().enabled` — **`apex26.caution` defaults OFF** (`race-control.js` `enabled` init), so a fresh page never throws a flag; `caution(true)` or the CAUTIONS race setting turns it on. The switch also gates OVERTAKE lock-out.
   2. `debris().active` — flags are computed ONLY from `DebrisWorld.hazards()`, and `update()` returns early (level frozen, only the hard cap ages) while `DebrisWorld.active()` is false: `apex26.debris` is `"1"`, and the Rapier wasm must have loaded (`_loadState === 2`; a trapped step latches it off).
   3. `caution({hazards:true})` — hazard `total` vs thresholds in `js/race/race-control.js`: YELLOW_MIN=3 (one sector), VSC_MIN=6, SC_MIN=10, RED_MIN=16 on `redTotal` (needs >= 2 source cars). Queried at ~4 Hz, so wait 0.25 s+. A pile-up that leaves fewer settled hazards than SC_MIN yields VSC/yellow, not SC.
   4. Multiplayer: only the **host** computes flags; guests adopt host `apply()`.
      **`__apex.net()` does NOT carry caution** — compare `__apex.caution()` on
      BOTH peers. Guest green while host shows VSC (roles correct via
      `__apex.net().role`) means the guest failed to adopt `EV.CAUTION` via
      `apply()`. Headless proof: loopback + inject caution, then read both sides.

7. **Verify narrowly, then with browser coverage.**
   - Run the pure unit guard `node --test tests/unit/race-control.test.mjs` after
     race-control logic changes.
   - Run `node tools/ci/test-bg.mjs physics-core` for debris and caution browser coverage
     (`debris.spec.js` and `race-control.spec.js` both ride there).
   - Use `test:tooling-fast` for docs/hooks/unit inventory checks.
   - If JS changed, run `node tools/gen/gen-shell.mjs --check` ([shell/cache](../../check-changes/references/bump.md): `?v=dev`, no bump).

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
- Calling `incident({reset:true})` to un-stick a car and concluding nothing is
  wrong when it returns cleanly — check `incident().count` first; a car stuck
  *after* handback needs `resetPlayer()`/`jump()`, not another reset call.
