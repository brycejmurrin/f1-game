# Racing line — how it is chosen today, and how it could be

Assessment note, 2026-09-08. The question was "can we reconsider how we
actually choose the racing line". This is the code audit, the measurements,
the literature, and a recommendation. §6 records what was implemented the same evening; the
rules that bind an implementation are in `AGENTS.md` (`PHYSICS.md` §curvature
channels: the line is an AI-only / display-only channel and must never reach
the player's physics).

Companion: `docs/notes/DRIVING-LINE-RESEARCH.md` is the on-track DISPLAY
(the glowing chevrons). This note is about the LINE itself — the lateral
offset table both the AI and the display read.

## 1. What the code does today

One table, baked once per track build in `js/track/core/line.js`
(`TrackLine.bake`), consumed by three things:

| consumer | what it reads | where |
|---|---|---|
| AI steering target | `TrackLine.at(track, s + lookahead).x`, weighted by `w` and `AiDrive.lineFollow` (0.92 base / 0.86 street) against the car's own lane | `js/game.js` ~5044 |
| AI brake target | `TrackLine.pathK` **only while the car is within 1.5 m of the line**; off it, the road's own curvature | `js/game.js` ~4724 |
| DRIVING LINE display | `api.lineAt(s)` → `x·w`, clamped 0.6 m inside `hw` | `js/render/shared/driving-line.js` |

The bake is **geometric, not optimised**. Per corner (a run of `|curv|` above
`K_ON = 0.006`, hysteresis to `K_OFF = 0.0036`, same-sign runs within 30 m
merged, runs under 12 m dropped) it places three knots:

- **apex** on the inside edge at the curvature-weighted centre of the run, held
  as a plateau while `|k| ≥ 55 % kMax`;
- **turn-in** on the outside edge `clamp(sqrt(2·1.5R·2w), 25, 110)` m before
  the apex;
- **exit** on the outside edge `1.25 × turn-in` after it.

Consecutive corners whose windows overlap share one knot at the midpoint
(opposite signs straight-line the chicane, same signs stay outside). Knots are
joined with a cosine ease, box-smoothed over ±8 m, and clamped 1.2 m inside the
road edge at every node. `bakePathK` then gives the AI a *path* curvature: a
single constant-radius arc through the three knots (the classic
`ρ = (a²+b²−2ab·cosθ)/(2(b−a·cosθ))` with `a = R+w`, `b = R−w`), floored at
85 % of the road's curvature, so being on the line is worth at most an 8 %
corner-speed edge in the AI's `sqrt(LAT_MAX·grip/|k|)` model.

The lap-time model never sees the line. AI corner speed comes from the road's
curvature at a lookahead (`Tracks.curvature`), so the line changes **where**
the cars are, and their brake point by ≤ 8 %, but not the speed model itself.
That is deliberate (the arc must not reach the driver) and is fine — but it
means a better line buys the AI position realism, not pace.

## 2. What the bake actually produces (measured)

`scratch/line-audit.mjs` (gitignored) builds circuits through
`tools/track/verify-track.cjs`'s `buildContext()` and reads the baked table.
"steep" is the lateral slope `|Δx|/Δs` — 0.2 m/m is an 11° crossing angle,
0.35 m/m is 19°. A real car crossing a 12 m road over 60 m runs ~0.2.
"onClamp" is the share of nodes sitting exactly on the 1.2 m edge clamp.
"overlap" is consecutive corner windows that intersect and so share a knot.

| circuit | corners | overlap | onClamp | steep > 0.2 | steep > 0.35 | worst slope | road R / line R at the tightest |
|---|---|---|---|---|---|---|---|
| monza | 10 | 4 | 15 % | 8.3 % | 3.5 % | 0.58 at s=1780 (Lesmo 1→2) | 15 / 18 |
| spa | 18 | 6 | 26 % | 15.6 % | 5.5 % | 0.66 at s=2424 (Les Combes) | 12 / 14 |
| monaco | 22 | 15 | 22 % | 15.0 % | 1.7 % | 0.38 | 10 / 12 |
| silverstone | 18 | 5 | 41 % | 19.3 % | 6.7 % | 0.68 at s=2521 (Maggotts/Becketts) | 20 / 23 |
| suzuka | 18 | 8 | — | 13.1 % | 2.6 % | — | 19 / 22 |
| bahrain | 15 | 5 | — | 12.5 % | 5.4 % | — | 13 / 15 |
| baku | 18 | 5 | — | 11.7 % | 2.2 % | — | 18 / 21 |
| zandvoort | 12 | 3 | — | 12.3 % | 4.6 % | — | 19 / 22 |

Pure corner time from the AI's own model (`Σ ds / min(72, sqrt(22/|k|))`),
road curvature vs the baked path curvature:

| circuit | road | line | gain |
|---|---|---|---|
| monza | 89.7 s | 88.5 s | 1.3 % |
| spa | 113.3 s | 110.6 s | 2.4 % |
| monaco | 65.1 s | 63.4 s | 2.6 % |
| silverstone | 98.1 s | 95.8 s | 2.3 % |

Three findings:

1. **The path curvature is barely wider than the road.** At Monza's first
   chicane the road is R15 and the "line" R18. A real car in a 12 m wide R15
   chicane runs an arc nearer R30–40. The arc formula is right but the 85 %
   floor and the per-corner window (it cannot borrow the straights either
   side) cap it. The 8 % edge the comment promises is the ceiling, not the
   typical value.
2. **Overlapping corners fight.** Every worst-slope site is a pair of corners
   whose windows intersect: one corner's exit knot says "outside", the next
   corner's turn-in says "the other outside", and the midpoint rule plus an
   8 m box smooth leaves a 0.6–0.7 m/m lateral lurch — a 34° crossing angle
   that no car takes. Silverstone's Maggotts–Becketts, Spa's Les Combes and
   Monza's Lesmos are exactly where the display line looks wrong and where
   the AI visibly zig-zags. Monaco has 15 of 22 corners overlapping and
   survives only because everything is slow.
3. **The line lives on the clamp.** 15–41 % of nodes sit exactly on the edge
   clamp. The knots ask for more lateral travel than the road has, the cosine
   ease overshoots, and the clamp cuts it flat. A clamped line has a
   curvature discontinuity at each clamp edge, which is why `pathK` has to be
   a separate synthetic arc rather than the geometry of the line itself.

None of this is visible to a lap-time test: the AI's pace does not depend on
the line. It is visible to the eye, and now that the line is drawn on the road
it is visible to the player.

## 3. How racing games and the literature choose a line

Read this pass (details in `DRIVING-LINE-RESEARCH.md` §sources where they
overlap):

- **Forza (Turn 10, City University paper on Drivatars)** — authored: designers
  place waypoints per corner and the game fits Catmull-Rom splines; the AI's
  "racing line database" is data, the speed profile is learned. Cheap at
  runtime, expensive per circuit, and it is what most console games do
  (Top Gear, F1 up to at least 2012: the line is drawn by a designer).
- **K1999 (Rémi Coulom, 2002 thesis, "path optimisation" appendix)** — the
  method behind the best TORCS bots and AWS DeepRacer's reference line.
  Iterative: for each point, move it laterally toward the position that
  equalises the curvature with its neighbours (a discrete "curvature
  relaxation"), clamp to the road edges, repeat a few hundred passes; a
  second pass adds a speed-aware term so the line straightens where the car
  is accelerating. ~50 lines of code, seconds per track, produces an
  outside-inside-outside line without ever detecting a "corner".
- **Minimum-curvature QP (TUMFTM `global_racetrajectory_optimization`,
  Heilmeier et al. 2019)** — pose the lateral offset at every node as a
  quadratic programme minimising Σ κ² subject to the road bounds; then a
  forward/backward speed profile. Their measurement: min-curvature lands
  within ~1 % of the min-time lap on their circuits; min-time itself is
  minutes per track and needs a vehicle model. Python/OSQP; a plain
  projected-gradient solve of the same objective is what K1999 is.
- **Kapania, Subosits, Gerdes (Stanford, 2016), "sequential two-step"** —
  alternate: fix the speed profile, solve the convex min-curvature path;
  recompute the speed profile on the new path; repeat. Three iterations put
  a physical Audi TTS within ~1 s of a professional driver's lap at
  Thunderhill. Their point is that the speed profile changes which corners
  matter (the line straightens the exit of a corner onto a long straight —
  the "late apex" every F1 guide describes).
- **Genetic / learned lines (Cardamone 2010, Vesel 2015)** — heavier, no
  better than min-curvature for a display line; not considered.

What the F1 games do is the display half (Full/Corners, 3D vs 2D, colour by
brake state); their underlying line is authored per circuit and is the same
outside-inside-outside with a late apex before a long straight.

## 4. Options

| option | what changes | cost | what it fixes |
|---|---|---|---|
| **A. keep the knot bake, fix the overlap rule** | overlapping same/opposite pairs get a shared *arc* not a midpoint; SMOOTH_M up; a slope limiter (`|Δx|/Δs ≤ 0.25`) before the clamp | half a day | the lurches (finding 2), some clamp-riding |
| **B. K1999 curvature relaxation, seeded from today's knots** | keep corner detection, knots and `w`; replace "cosine ease + box smooth + clamp" with 200–400 relaxation passes toward equal neighbouring curvature, clamped to `hw − MARGIN` each pass; `pathK` becomes the *measured* curvature of the relaxed line, the synthetic arc and the 85 % floor go | one to two days, bake-time only (n ≈ 800–1800 nodes, well under 50 ms) | findings 1–3; the display line becomes a smooth arc with no kinks; `pathK` is honest |
| **C. min-curvature QP (TUMFTM) at bake** | same objective as B solved exactly; needs a QP solver in the browser or a pre-baked table per circuit shipped as data | days, plus a data file per circuit | as B, marginally smoother; not worth the solver |
| **D. two-step (Kapania) with the existing speed sweep** | B or C, then re-weight the curvature objective by the `DrivingLine` speed profile and iterate twice | B + a day | late apexes onto straights; the line the F1 guides draw |
| **E. authored waypoints (Forza)** | per-circuit `def.line` knots hand-placed | 24 circuits × survey time | exact where somebody surveyed it, stale everywhere else |

## 5. Recommendation

**B, then D as a follow-up.** K1999-style relaxation is the smallest change
that fixes all three measured defects, it keeps every existing contract
(`TrackLine.at/pathK/attackAt`, `lineCorners`, `w`, `MARGIN`, the AI's
lane blend, the DRIVING LINE display) and it makes `pathK` the line's own
curvature instead of a formula the audit shows is capped. It is bake-time
only, deterministic, and testable with the existing synthetic tracks in
`tests/unit/track-line.test.mjs` plus two new assertions: max lateral slope
below 0.25 m/m on every real circuit, and `|lineK| ≤ |curv|` everywhere.

D is worth doing after B because it is what separates "geometrically widest
arc" from "the line a driver takes": the speed profile the display already
computes (`DrivingLine` sweep) is the input Kapania's method needs, so the
second step is a re-weighting, not new machinery.

Not recommended: A alone (it patches the symptom and leaves `pathK`
synthetic), C (a solver for a gain the eye cannot see), E (survey cost, and
the point of a baked line is that a circuit edit re-derives it).

What an implementation must keep: the arc-must-not-reach-the-driver rule
(`PHYSICS.md` table row for `drivingLineApi` stays AI-only/display-only), the
`_sceneryShift` idiom is not involved (the line is baked in racing space), and
`lineFollow` stays as the knob that keeps the field two lines wide.

## 6. Implemented (2026-09-08, same evening)

**What shipped.** `TrackLine.bake` keeps the corner detection, the knots and
`lineW`, uses the cosine-eased knot line as the SEED, and replaces the 8 m box
smooth + clamp with a relaxation toward the minimum of
`Σ κ_line² + λ Σ κ_road·x` over the lap, `κ_line = κ/(1+κx) − x''`, clamped
to `hw − MARGIN` at every step: Gauss-Seidel with over-relaxation 1.5, 400
passes on every 4th node first (the long corners' wavelengths), then 300 fine
passes — ~25 ms per circuit at bake. `pathK` (the AI's calibrated brake
model with its 85 % floor) is unchanged, deliberately: see §5's last
paragraph and PHYSICS.md.

**Why the path-length term (λ = 0.001 /m²).** Pure minimum curvature (option
B as written above) converged to the OUTSIDE of long constant-radius corners
— Parabolica's apex 3.8 m outside, Ascari's on the centre — the known
artefact of the objective ignoring distance. A local lap-time objective
(path length over cornering speed, minimised node by node with finite
differences) zig-zagged (corner time 30 % worse). The standard blend, TUMFTM's
minimum curvature plus a shortest-path term, fixes it with one quadratic:
λ = 0.001 puts every Monza apex on the inside clamp with the turn-in still
from the outside (x(s0) −3.7 to −5.0 m); λ = 0.003 pulls the entries inside
too early (x(s0) −1.1 m).

**What the speed-weighted pass (option D) measured.** Re-weighting the
objective by the line's own speed profile (`w = 0.5 + 0.5 (v/vmax)²`, two
Kapania-style iterations) changed corner time by under 0.2 % and raised the
number of corners whose peak curvature exceeds the road's (Spa 2 → 9 at
λ = 0.003). Not shipped; the prototype is `scratch/relax-proto.mjs`
(gitignored, `--weighted=true`).

**Measured, seed → relaxed** (`scratch/line-audit.mjs`; corner time is the
AI's model on the line's OWN curvature, which the arc formula in §2 hid):

| circuit | worst slope | steep > 0.2 | on clamp | corner time vs centreline |
|---|---|---|---|---|
| monza | 0.58 → 0.44 (Lesmo 1→2) | 8.3 → 6.9 % | 15 → 25 % | −5.1 % → +1.5 % |
| spa | 0.66 → 0.37 | 15.6 → 4.8 % | 26 → 23 % | −10.6 % → +1.5 % |
| silverstone | 0.68 → 0.38 | 19.3 → 4.2 % | 41 → 16 % | −13.6 % → +0.8 % |
| monaco | 0.38 → 0.42 | 15.0 → 7.4 % | 22 → 27 % | −4.0 % → positive |

Negative means the knot line was SLOWER than the centreline; every circuit
was. Steep nodes above 0.35 m/m fell from 1.7–6.7 % to 0–1 %; no corner's
peak line curvature exceeds the road's on any of the eight circuits audited
(the "tighter" column of §2 is 0 everywhere). "On clamp" rose on Monza and
Monaco because the apexes now sit ON the inside clamp for the whole plateau —
the intent, not the overshoot §2 described.

**Tests.** `tests/unit/track-line.test.mjs` (synthetic, expectations
unchanged, all pass) and the new `tests/unit/track-line-circuits.test.mjs`
(on the road, no node step over 0.5 m/m, corner time ≤ centreline on monza /
spa / silverstone, and monza's long corners outside-in-outside on the baked
table). `ai-racecraft-vm` drives an AI car through monza's long corners on
the new line: 4/4 pass.

## 7. The AI on the line (2026-09-08, later the same evening)

The owner's follow-up: make the AI less jittery and more calculated on and
around the line. Measured first, on a solo Monza lap driven by an AI in
`tests/unit/ai-racecraft-vm.test.mjs` (`laneJitter`: steering reversals per
km with a 0.25 m/s hysteresis on the lateral velocity, and the RMS of the
frame-to-frame lateral acceleration):

| controller | reversals / km | lateral accel RMS |
|---|---|---|
| position P-loop (before) | 5.4 | 10.0 m/s² |
| heading state + slewed biases (after) | 4.7 | 5.9 m/s² |

What changed, and why each one:

- **Brake look sampled at every node, node-aligned** (game.js, the brake
  target). The old loop sampled every 14 m *from the car*, so the sample set
  slid across the 4 m curvature nodes as the car moved and the min over it
  stepped every frame — throttle/brake chatter at every entry. Anchored on
  the nodes, the window gains one node ahead and drops one behind per node
  travelled. Same formula (`AiDrive.brakeTarget`), so the pace calibration
  is untouched; the option of a baked per-circuit speed profile was
  considered and not taken: the per-car factors (aero load, tyre grip,
  skill, late-brake craft) scale the cornering speed inside the sweep, so a
  nominal profile would have re-tuned every driver's braking point.
- **A heading state instead of a position P-loop** (game.js "--- lateral
  ---"). `steer = 0.9·err` was 13.5 m/s of lateral speed per metre of error
  in the same frame. The car now carries a heading off the road tangent,
  steered toward the target path's tangent (read 4 m past the look-ahead
  point) plus a Stanley cross-track term `atan(k·e/v)`, with the heading
  rate capped by the lateral grip budget (`a_lat = v·yawRate ≤
  0.6·LAT_MAX·grip`). The lateral speed is `v·sin(heading)`; every existing
  multiplier on the lateral step (grip taper, kerb, contact give, off-track
  fade) still applies because `steer` is that speed as a fraction of the
  full-lock authority. Below 6 m/s (vStd), while digging out, in contact or
  under the side-rub clamp, the old position loop drives with its full,
  immediate authority (a heading means nothing without speed; a car being
  rubbed must be clear in a few frames — the collision benches pin it) and
  the heading is re-synced from the steer it produced. Side effect worth
  knowing: two AI cars dropped beside a player now settle at the 2.8 m clean
  gap and hold it — the P-loop's overshoot used to press them into contact
  (`collision-contact-vm` starts its sandwich overlapped for that reason).
- **Slewed biases.** Overtake, defend, yield and separation are summed as
  before but the sum moves toward its value at 3 m/s, so a pass decision is
  a lane change at a car's lateral pace, not a step. The dig-out is not
  slewed. The hold-line-under-braking and side-rub constraints are unchanged
  and still win.
- **Line families.** `TrackLine.bake` relaxes the same seed twice more:
  `lineIn` with the path-length term ×4 (inside on entry, the defensive
  line) and `lineOut` with it off (pure minimum curvature, wide through the
  long corners). `TrackLine.at(track, s, fam)` blends; the AI damps `fam`
  toward +1 while defending or passing on the inside of the next corner, −1
  when passing around the outside, so a move is one coherent line from entry
  to exit rather than a sideways push on the racing line.
- **Authored hints.** `def.lineHints: [{ turn, apexShift, apexInside }]`
  (copied through tracks.js; `turn` 1-based into `def.turns`, racing-space,
  the bankZones idiom). `apexShift` metres moves the corner's knots later —
  a late apex onto a straight; `apexInside` (−1..1, a fraction of the usable
  half-width) bounds the apex plateau to the inside or the outside. The
  relaxation honours them as bounds. A hint more than 80 m from any baked
  corner is dropped with a warning. No circuit authors one yet.

What the remaining reversals are: on the solo lap they sit at the chicanes
(a real direction change each) and at sub-degree heading crossings where the
straight's lane target hands over to the corner's line (`lineW` easing in) —
heading ±0.01 rad at 45 m/s trips the 0.25 m/s hysteresis. The acceleration
RMS is the metric that moves; both are capped in the test.

Not done: a full lap-time re-measure per difficulty level (the brake formula
is unchanged and the controller reaches the same apexes, but the smoother
lateral motion may be worth a tenth); the CI `driving` and `hooks` groups
were run for this change, the rest of the AI groups were not.
