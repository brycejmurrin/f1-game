# Recipe: "it understeers in slow corners — make turn-in snappier, prove it"

Node VM only, no browser.

0. Rule out assists/input and label both cars (phone `carWeight` 10, desktop 5): SKILL.md §Which car?.
1. Baseline: `node tools/check/player-dyn.mjs --json > scratch/pd-base.json` (desktop car). `TRACK`/`FRAC` only pick the
   straight the car is pinned to (position only), so they do not select a corner. Slow corner = `skidpad` rows whose
   STANDARD speed `vStd(v) = v / PACE` (read `g.apex.tuning().pace`) falls in the `lockTaper` blend (vStd 15-30): at
   PACE 0.84 the ground row v 20 is in it and v 30 is past it. Add a v 15/25 row if the shipped rows miss the blend.
2. Sweep with this script (~25 s for three values, Node only). Save it as `scratch/sweep-frontgrip.mjs`
   (the `../tools/…` imports resolve from `scratch/`) and run it from the repo root; swap `frontGrip` for
   `yawInertia` or `wheelbase`:
   ```js
   import { createRequire } from "node:module";
   import { measure } from "../tools/check/player-dyn.mjs";
   const { createGame } = createRequire(import.meta.url)("../tools/lib/game-vm.cjs");
   const track = "monza", rows = [];
   for (const carWeight of [5, 10])                  // desktop car, PHONE car (device-aware CAR WEIGHT)
   for (const x of [0.94, 1.0, 1.06]) {             // one fresh game per value: no state carry-over
     const g = await createGame({ track, seat: "pin", storage: { difficulty: "normal", autoThrottle: false, carWeight } });
     await g.race(track);
     g.apex.setPhysics({ frontGrip: x });
     const pace = g.apex.tuning().pace;               // vStd = v / pace: keep the blend rows (vStd ≤ 30)
     const slow = measure(g, 0).skidpad.filter((r) => r.v / pace <= 30);
     rows.push({ carWeight, frontGrip: x, pace, slow: slow.map(({ v, steer, yaw, aF, aR, uF, uR }) => ({ v, steer, yaw, aF, aR, uF, uR })) });
     g.close();
   }
   console.log(JSON.stringify(rows, null, 1));
   ```
3. Read the same-`v`, same-`steer` skidpad rows: `uF` (front utilisation), `uR`, `aF`/`aR` (slip angles), `yaw`.
   Understeer = front slip `aF` past its peak with `uR` settled below ~1.
4. Improved = at the slow `v` rows, `yaw` rises (or `uF` falls) for the same `steer`, and `uR` stays below saturation
   (rear not the new limit). `skidpad` is steady state and `stepSteer` (`rise_ms`) runs at 50 m/s only, so "snappier" at slow speed
   is proven as more steady-state yaw, not a faster rise; no slow-speed transient probe exists (a scratch step at `reset(20-30)` copying that block would add one). Report the before/after rows; never assert absolute magnitudes.
5. `node --test tests/unit/player-dynamics-vm.test.mjs` (shapes still hold), then ONE browser spec:
   `node tools/ci/test-bg.mjs --spec tests/specs/understeer-cue.spec.js` (or `physics-characterization.spec.js`); parent only (SKILL.md).
6. Landing a winner: `setPhysics` is an A/B only; land it where SKILL.md says the defaults live (input-controls owns the
   sliders). Report the win for the phone car and the desktop car separately.
