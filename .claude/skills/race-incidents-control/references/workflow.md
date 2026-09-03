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
   - Run the pure unit guard `node --test tests/unit/race-control.test.mjs` after
     race-control logic changes.
   - Run `node tools/ci/test-bg.mjs driving` for debris and caution browser coverage.
   - Use `test:tooling-fast` for docs/hooks/unit inventory checks.
   - If JS changed, run `node tools/gen/gen-shell.mjs --check` (no cache bump is needed (tags read `?v=dev`; `pages.yml` stamps the hashes at deploy) — after a `tools/manifest.cjs` change run `node tools/gen/gen-shell.mjs`).

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
