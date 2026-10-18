# Race-incidents workflow — debris, takeovers, cautions, common mistakes

Load from the SKILL.md index when the task needs this detail.

## Contents
- Workflow / Implementation
- Traces
- Common Mistakes
- Fresh reset evidence

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
   - The ONE place for the SC/overtake facts this file relies on:
     - OVERTAKE: the Safety Car / red flag disables it until the leader's next
       line crossing after it ends (`otHoldLap`, Art. B7.2.2), so `otEnabled`
       stays false up to a lap after GREEN; a yellow or VSC disables neither
       overtake nor active aero. LOW GRIP (wet: `TyreModel.treadFor` > 0) also
       disables it (B7.2.2(d)) and halves the active-aero trade (`aeroWetK` in
       game.js). Overtake itself is `js/race/overtake-mode.js` (detection line,
       0.5 MJ allowance).
     - SPEED CAP: race control never slows a car. game.js applies it live from
       `raceCtl.level` (`cautionV`; AI `holdCap`): VSC 0.6 × vTop; under the SC
       the field QUEUES (B5.13), `RaceControl.scQueueFrac` giving the leader
       0.45 × vTop and a car > 1 s adrift of the car ahead up to 0.6 × vTop until
       it closes. Cars at SC pace with `level` 0 point at game.js.

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

7. **Verify narrowly, then with browser coverage.**
   - Rules: `node --test tests/unit/race-control.test.mjs` after race-control
     logic changes.
   - Takeovers (R2/R3/C1): `node --test tests/unit/incident-gate.test.mjs`
     (promote, handback, window, budget, `release`). `race-control.spec.js` and
     `debris.spec.js` do NOT exercise IncidentSim; `collisions-deep.spec.js` /
     `collisions-deep-vm.test.mjs` switch every takeover OFF via
     `incident({flags})` to test the bespoke clamp, so a takeover change can
     break them through that hook.
   - Browser coverage: a single spec (`npm test -- tests/specs/<file>.spec.js`, background) or, for the whole
     `physics-core` group, `node tools/ci/remote-group.mjs physics-core` on the pushed branch (AGENTS.md verification table).
   - Use `test:tooling-fast` (background, AGENTS.md rule 4) for docs/hooks/unit inventory checks.

## Traces

Takeover never released, reset after handback, lap-1 DNF, SC never deploys, SC stuck out.

### Takeover never released (cars frozen / floating after a pile-up)

All in `js/physics/incident-sim.js`; `__apex.incident()` is `status()`.
1. `incident().count` / `incidents[].ticks` / `owned`: count 0 means no live
   takeover — the car is bespoke-stuck (next section), not owned.
2. `postStep(dt)` is the only progress path and game.js calls it EVERY tick,
   even with debris off (`js/game.js` ~4523-4534; `preStep` only while
   `DebrisWorld.active()`). A paused or non-race state that skips the physics
   step also freezes the takeover.
3. Normal exit per car: settle (`pose.sleeping` or speed < `SETTLE_V` and spin
   < `SETTLE_W`) for `SETTLE_HOLD_S` (0.30 s), or `inc.elapsed >= WINDOW_MAX_S`
   (3.0 s hard cap) → `handbackCar(inc, i, false, pose)` (~381-382).
   `elapsed` advances by `dt`; a NaN/0 `dt` from the caller is the first suspect.
4. Anomaly exits → `handbackCar(…, true)` restores last-good `inc.good`/`snap`
   (`_fallbacks++`): world inactive or `worldGen()` changed, no/NaN body pose,
   teleport past `stepBound`, car retired/finished.
5. External release: `release(c)` (rescuePlayer, retireCar, `__apex.jump`)
   returns false when the car is not in `_owned`. `reset()` hands back ALL.
6. `c1Pileup` (`apex26.c1Pileup`, default ON) gates promotion; switching a
   kind off via `incident({flags})` (`setFlags`) also hands back that kind's
   live takeovers as anomalies — the quickest A/B for "is it the takeover?".
Tests: `incident-gate.test.mjs` (`incident window scales with time, not car
count`, `postStep hands a finished car back…`, `a world-generation handback…`).

### Incident reset is a no-op after handback

`IncidentSim.reset()` (`js/physics/incident-sim.js`) only hands back entries in
`_incidents`. Once the takeover settled or hit its time cap that list is empty, so
`incident({reset:true})` does nothing yet still returns a success-looking `status()`.
A car stuck *after* handback is bespoke-model state (off-track, low speed, bad
heading): use `__apex.resetPlayer()` or `__apex.jump(frac, speed, x)`. Reach for
`incident({reset:true})` only while `incident().count > 0`.

### Reliability: lap-1 / every-race DNF

Moved to [reliability-trace.md](reliability-trace.md) (team-car retirements, `__apex.retirements()`, `DNS_AT`).

### SC never deploys

**"SC never deploys" checklist** (steps 1-3 also run through `createGame()` in `tools/lib/game-vm.cjs`; browser presentation is separate; the gating logic is pinned by `node --test tests/unit/race-control.test.mjs`, focused rules tests, <1 s):
1. `caution().enabled` — **`apex26.caution` defaults OFF** (`race-control.js` `enabled` init), so a fresh page never throws a flag; `caution(true)` or the CAUTIONS race setting turns it on. The switch also gates OVERTAKE lock-out.
2. `debris().active` — flags are computed ONLY from `DebrisWorld.hazards()`, and `update()` returns early (level frozen, only the hard cap ages) while `DebrisWorld.active()` is false: `apex26.debris` is `"1"`, and the Rapier wasm must have loaded (`_loadState === 2`; a trapped step latches it off).
3. `caution({hazards:true})` — hazard `total` vs thresholds in `js/race/race-control.js`: YELLOW_MIN=3 (one sector), VSC_MIN=6, SC_MIN=10, RED_MIN=16 on `redTotal` (needs >= 2 source cars). Queried at ~4 Hz, so wait 0.25 s+. A pile-up that leaves fewer settled hazards than SC_MIN yields VSC/yellow, not SC.
4. Multiplayer: only the **host** computes flags; guests adopt host `apply()`.
   **`__apex.net()` does NOT carry caution** — compare `__apex.caution()` on
   BOTH peers. Guest green while host shows VSC (roles correct via
   `__apex.net().role`) means the guest failed to adopt `EV.CAUTION` via
   `apply()`. Headless proof: loopback + inject caution, then read both sides.

### SC deploys but never comes back in (stuck out)

Browser first: `__apex.caution()` then read `level`, `sinceT`, `cause`. `held` is not in the hook result (a scripted hold shows its own `cause`); a flag older than ~90 s of `sinceT` is not the hazard loop.

**"SC deploys but never comes back in" (stuck out)** — all in `RaceControl.update()`, pinned by `race-control.test.mjs` ("a stuck hazard cannot neutralise the race forever", "a frozen flag still AGES", "hold(): a scripted flag flies past the SC cap"):
- Normal exits: hazards fall below SC_MIN and `sinceT >= MIN_HOLD` (6 s) lowers it a level at a time, or the hard cap SC_MAX (90 s, VSC/SC; YELLOW_MAX 30 s) forces GREEN even with the hazard picture intact, then CAP_REARM_HOLD (45 s) suppresses a same-level re-raise from that stale picture (an escalation still flies). A flag that outlives ~90 s of `caution().sinceT` is therefore not the hazard loop: look for a `held` flag.
- `held` (scripted, `G.holdCaution` from `js/race/real-race.js`): exempt from the cap and MIN_HOLD until `hold(0)`; a real-race replay that never releases keeps the SC out. Hazard-loop inputs cannot lower it.
- Debris going inactive or CAUTIONS switched off mid-flag freezes the LEVEL but it still ages to the cap (`capDropIfExpired`); `caution(false)` drops it at once.
- "Back in" for the player is two separate things: the flag (`caution().level`) and the OVERTAKE hold / game.js speed cap (step 4).
- Guest: green on the host but SC on the guest = missed `EV.CAUTION` (`apply()`); `update()` returns early for guests, so only a host message clears it (`reset()` clears it when `G.state !== "race"`).
- Repro in the VM: `caution(true)`, raise the flag, step past 90 s of sim time (or `hold()`) and read `caution().sinceT`/`level` each step.

## Common Mistakes

- Letting DebrisWorld "help" collision response by moving a car; that belongs to
  the bespoke model or bounded IncidentSim only.
- Adding an IncidentSim path without a hard handback cap and last-good fallback.
- Changing tire grip/friction ellipse from IncidentSim; the header forbids it.
- Computing race control on guests; debris is local, so only host flags define
  the shared race. Inspect `caution()` on each peer — `net()` omits it.
- Lowering flags directly on hazard count with no hysteresis, causing flicker as
  debris despawns.
- Assuming `RaceControl.update()` slows cars: it only sets the flag and gates
  overtake; the speed cap is game.js's (step 4). Do not drive cars from here.
- Using wall-clock time or global random sources, breaking seeded determinism.
- Reporting a timeout-shaped browser failure as logic before checking load and
  re-running the specific spec alone if needed.
- Trusting a clean `incident({reset:true})` return: see "Incident reset is a no-op after handback" above.

## Fresh reset evidence

Use `createGame({track:"monza"})`, `a.headless(true)`, then
`a.reset(0.1,30,0,42)` for fixed-step caution/ownership tests. Fresh episode reset
clears prior caution/hold/restart gates before re-arming the scenario; verify
GREEN after a deliberately held flag. Flags and episode ownership are VM
contracts. Actual Rapier wasm/body motion and displayed cautions need their
specific activation/browser evidence. Close the VM in `finally`.
