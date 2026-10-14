# Recipe: "it understeers in slow corners — make turn-in snappier, prove it"

Node VM only, no browser (AGENTS.md rule 10 applies to Chromium; this boots none).

1. Baseline: `node tools/check/player-dyn.mjs --json > scratch/pd-base.json`. `TRACK`/`FRAC` only pick the straight the car is
   pinned to (position only), so they do not select a corner. Slow corner = the `skidpad` rows at `v` 20 and 30 m/s
   (`lockTaper` blend is 15-30 m/s, so these exercise it).
2. Sweep, in a `scratch/*.mjs` script: `createGame({track, storage:{difficulty:"normal", autoThrottle:false}})`
   (copy `main()` in `tools/check/player-dyn.mjs`), `await g.race(track)`, then per value
   `g.apex.setPhysics({frontGrip: x})` (or `yawInertia`, `wheelbase`) and `measure(g, frac)` (import it from player-dyn).
3. Read the same-`v`, same-`steer` skidpad rows: `uF` (front utilisation), `uR`, `aF`/`aR` (slip angles), `yaw`.
   Understeer = `uF` past its peak with `uR` settled.
4. Improved = at the slow `v` rows, `yaw` rises (or `uF` falls) for the same `steer`, and `uR` stays below saturation
   (rear not the new limit). `skidpad` is steady state and `stepSteer` (`rise_ms`) runs at 50 m/s only, so "snappier" at slow speed
   is proven as more steady-state yaw, not a faster rise; no slow-speed transient probe exists (a scratch step at `reset(20-30)` copying that block would add one). Report the before/after rows; never assert absolute magnitudes.
5. `node --test tests/unit/player-dynamics-vm.test.mjs` (shapes still hold), then ONE browser spec (`understeer-cue.spec.js`
   or `physics-characterization.spec.js`) per the Verify note in SKILL.md.
6. Landing a winner: `setPhysics` is an A/B only. A shipped default for a slider-backed knob goes in
   `js/input/steer-tuning.js` / `js/ui/settings-export.js` (input-controls owns that); a game.js `let` costs
   ratchet lines (`tests/data/ratchets.json`, AGENTS.md); fixed constants live in `js/physics/consts.js`.
