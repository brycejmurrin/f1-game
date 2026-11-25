# Braking and grip on Bryce's profile: A/B of today's merges (#6705, 2026-11-25)

Kind: measurement · Re-measure-by: 2026-12-09, or as soon as `Parts.playerMods` or the player brake path changes
(rerun the script below at the tip).

Ask (Bryce, 2026-11-25 ~21:40Z): "On the current live I feel like breaking and grip got worse". He chose "Measure first".

## Method (repeatable, Node VM, no browser)

`node docs/notes/brake-grip-ab-6705/ab6705.mjs <repoRoot> <label>` runs Bryce's steering and driving store from
`tests/data/settings-live-export-2026-11-25.json`: PACE 17, steerRate 6, steerExpo 7, steerSmooth 3, steerLock 7,
steerSpeed 4, gripSteer 1, drivingHelp 1, the phone `carWeight` 10, buttons, HARD, wear off. It uses the `shipped` seat,
because the export excludes the garage. That seat is the fresh-boot Red Bull with GarageDefaults parts: works aero and
chassis parts, Ford engine. The run is deterministic, Monza, and every point uses the same seed.

The script measures four things. All speeds are on the standard scale (`vStd = v / pace`, distance `/ pace`).
- **Braking**: from 300 to 100 km/h, on the straight bench pin, straight ahead and with 0.3 steer held.
- **Skidpad**: steady lateral acceleration at vStd 30/45/60 m/s and steer 0.6/1.0.
- **Yaw traces**: braked turn-in (vStd 60, steer 0.6, pedal in), coasted turn-in, and a mid-corner stamp (vStd 45,
  steer 0.7 for 1.5 s, then the brake).
- **Laps**: a closed-loop flying lap with one fixed driver law (the SoakRun pursuit/speed-envelope law). Its envelope
  is in aStd g (1.8/2.2/2.6), so every point gets identical demands. Curvature feeds the measurement DRIVER only, never
  the car. The lap reports min speed and the path radius `v²/ay` at that minimum through T1 Rettifilo, T6 Lesmo 1 and
  T11 Parabolica.

The points were measured on worktrees. None of them was a reset of the branch.

| pt | tree | what |
|---|---|---|
| a | e272c661 (tip) | live |
| b | tip, `BRAKE_OVER_K = 0` | #6662 damp off |
| r | tip, `playerMods := getMods` | #6572 reserve back, #6662 on |
| c | d685ed1f^1 | before #6572 (and before #6662) |
| t | b12629c0^1 | after #6572, before train #6687 (#6527 collide, #6662) |
| n | 7849ae53 | before #6654 (steer-tuning numStore) |

## Results

Player mods (Red Bull shipped seat): **a/b/t/n: cornering ×0.97, braking ×0.92; r/c: cornering ×2.05, braking ×1.52**.

| metric | a tip | b damp off | r tip + reserve | c pre-#6572 |
|---|---|---|---|---|
| brake 300→100, straight (m std / s) | 181.5 / 3.28 | 181.5 / 3.28 | 108.4 / 1.97 | 108.4 / 1.97 |
| brake 300→100, 0.3 steer (m std) | 180.7 | 180.7 | 108.3 | 108.3 |
| decel (aStd g) | 1.72 | 1.72 | 2.88 | 2.88 |
| skidpad ay g, vStd 30 / 45 / 60, full lock | 1.74 / 2.03 / 2.22 | same | 3.66 / 4.14 / 4.03 | same as r |
| braked turn-in yaw max (rad/s), αR max | 0.560, 3.8° | same | 0.648, 4.9° | same as r |
| coasted turn-in yaw max | 0.304 | same | 0.321 | same as r |
| mid-corner stamp yaw max, αR max | 0.723, 10.9° | same | 0.949, 9.1° | same as r |
| flying lap, envelope 1.8 / 2.2 / 2.6 g (s) | 129.9 / 133.3 / 133.4 | 130.0 / 133.1 / 133.3 | 107.9 / 108.8 / 108.1 | 107.9 / 108.8 / 108.1 |
| off-road s on that lap (1.8 g) | 18.1 | 18.1 | 9.7 | 9.6 |
| T1 Rettifilo min km/h std (1.8 g) | 37.5 | 36.6 | 53.1 | 53.8 |
| T6 Lesmo 1 min km/h std, radius m (1.8 g) | 87.6, 67 | 87.2, 66 | 104.9, 49 | 104.2, 48 |
| T11 Parabolica min km/h std, radius m (2.6 g) | 38.8, 26 (ran wide, 5.8 m past the edge) | 38.8, 32 | 111.0, 74 | 109.8, 72 |

Point t is bit-identical to b, and n is bit-identical to a in every row. `tuning()` is equal at a, n and c.

### What the table shows

- **#6572 is the cause, and the size of the change is large.** The 1.0× works build took the shipped car from
  cornering ×2.05 and braking ×1.52 down to ×0.97 and ×0.92. Over that change:
  - braking distance went from 108 m to 181 m (+67 %);
  - steady lateral grip at full lock roughly halved (4.1 g → 2.0 g at vStd 45);
  - the same driver laps 20+ s slower and spends twice as long off the road.

  This is the intended effect of decision A (docs/PHYSICS.md §Parts parity: the raw factory kit read 1.1–2.8× per stat
  and lapped about 10 % under the field). What Bryce is feeling is that intended effect.
- **#6662 (brake over-rotation damp) is inert here.** Straight braking, combined braking, the skidpad and all three yaw
  traces are identical with the damp at 0. On these probes |αR| never passes |αF| under the pedal. The laps move by
  0.1 s or less. The one visible effect is a Parabolica path difference at the 2.6 g envelope.
- **#6527 (collide / contact-geometry) and #6654 (numStore) are ruled out:** t = b and n = a, exactly.
- **#6695 (damage, train #6703)** only books damage records (`js/race/damage.js`) and does not touch the player's forces.

## Options put to Bryce

**He picked B** (AskUserQuestion via the orchestrator, ~21:51Z; recorded on #6705). It shipped in the PR that
closes #6705: `Parts.RESERVE` / `Parts.worksMods` in `js/car/parts.js`.

- **A: keep ×1.0.** The car now has the field's neutral grip. The lost reserve is the price of parity.
- **B: a partial grip reserve.** Cornering and braking keep half (log share) of a works bonus above ×1.0:
  `m /= w / max(1, w)^0.5`. Speed and accel stay at ×1.0. Measured on the same probes:
  - mods ×1.41 / ×1.18;
  - braking 141 m;
  - skidpad 3.0 g at vStd 45;
  - laps 124–126 s;
  - a mid-corner stamp reaches αR 12.7°.

  It needs a re-pin of 18 unit tests: the parity pins plus the physics-shape benches calibrated to the ×1.0 car (lift-off
  rotation, trail-brake rotation, the mid-corner stamp guard and the shipped-seat bands). The car's lap pace against the
  field would also need measuring before it could land.
- **C: revert #6572.** This puts back the ×2 reserve and the 10 % lap gap to the field.

## B as built: lap pace against the neutral (field-equivalent) car

`tests/unit/factory-parts-pace-vm.test.mjs`, the curvature-fed policy scaled by the car's own mods (neutral / works / raw):

| row | neutral ×1 | works + reserve | raw kit |
|---|---|---|---|
| Monza McLaren | 143.87 s | 135.73 s (−5.7 %) | 111.33 s |
| Monza Williams | 146.00 s | 146.07 s | 142.20 s |
| Suzuka McLaren | 166.87 s | 153.07 s (−8.3 %) | 127.40 s |
| Suzuka Williams | 169.67 s | 169.53 s | 161.47 s |
