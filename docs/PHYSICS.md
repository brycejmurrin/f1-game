# Apex 26 — physics

The driving model, the pace discipline, active aero and overtake. Extracted
from the agent brief. `AGENTS.md` states the two rules that constrain code
elsewhere — the `vTop()`/`vStd()` rule and "the arc must not reach the
driver" — and THIS doc owns the curvature channel table (§Curvature
channels below; `tests/unit/curvature-channels.test.mjs` asserts every
consumer file appears in it). For years each doc deferred the table to the
other and it existed nowhere.

---

Per-axle bicycle model. Key tuning variables in `game.js`: `WHEELBASE`,
`STEER_EXPO`, `STEER_MAX_SLIP`, `STEER_SPEED_REF`, `DRIFT`, `ROAD_FOLLOW`,
`PLAYER_GRIP`, `FRONT_GRIP`, `YAW_DAMP`, `YAW_INERTIA`, `PACE`. Modify via
`__apex.setPhysics(o)` for A/B tests. The model's immutable constants (`VMAX`,
`ACCEL`, `BRAKE`, `LAT_MAX`, `LONG_GRIP`, the `X_*` aero pairs, the ERS/OT
windows, …) live in `js/physics/consts.js` (global `PhysicsConsts`),
destructured once by game.js at eval time — anything a slider or `setPhysics`
can change stays a `let` in game.js.

**`PACE` is a ground-speed scale, not a speed cap.** The OVERALL SPEED slider
scales the car's real m/s (and the accel curve) — nothing else. Everything else
measured in speed is pace-normalised through two helpers next to `PACE` in game.js:
`vTop()` (where the envelope tops out in m/s — divide by it to normalise) and
`vStd(v)` (that speed on the standard, pace-5 scale — compare hard-coded
thresholds against it). So `VMAX`, `GEAR_TOP`, `TAPER_LO/HI`, `GRASS_V` and
`STEER_SPEED_REF` all keep their literal values, while the gearbox still sweeps
1→8, the tach its whole band, and the dial 0 → ~259 km/h at *every* setting.
Only lap times move. **Adding anything that divides a speed by `VMAX`, or
compares one against a literal, means picking `vTop()` or `vStd()`** — a bare
`VMAX` there silently makes the slider shrink the player's envelope again.
`__apex` hooks stay raw m/s; `obs().dashKph` is what the dial reads. True force
constants (`LAT_MAX`, `BRAKE`, `LONG_GRIP`, `ACCEL`) are deliberately absolute —
that is what makes low pace more forgiving.

**`aStd()` is `vStd()` for ACCELERATION, and it is needed for the same reason.**
`PACE` multiplies the accel curve exactly as it multiplies ground speed
(`axEstTarget` is `ACCEL * PACE * …`), so an acceleration compared against a
hard-coded number is pace-sensitive in precisely the way a speed is. It is
written as the divisor (`a / max(PACE, 0.05)`) rather than `vStd`'s
`VMAX / vTop()` round trip, so at pace 5 it is the identity to the bit. This
shape is easy to miss because the lint only sees `.speed`: A16's launch-smoke
defect was reached sideways, by flagging the speed window on the same line.

**The slider is GEOMETRIC: `pace(n) = 1.06^(n - 14)` over 19 notches**, a uniform
6 % per notch, defaulting to notch 11 (0.840) with the 1.0 reference exactly
reachable on notch 14. It used to be piecewise linear with steps of 14-25 % below
the default and 4.8-6 % above, so the half of the slider a player wanting a
calmer car had to use was the half with no resolution. Pace is a multiplicative
scale, so a ratio is its natural unit — which is also why the v2→v3 store regrid
measures "nearest" in LOG space; in absolute pace the two fastest old settings
collapse onto one new notch. See `docs/research/PHASE-C-SLIDER-DESIGN.md`.

**Lateral tyre curve** (`TyreModel.lateralCurve`, `js/physics/tyre-model.js`):
each of the player's axles turns `x = cs·α/mu` into a normalised force —
`sin(x)` up to the peak at `x = π/2` (slope 1 at the origin, so `CS_FRONT` /
`CS_REAR` keep their meaning and the peak force is exactly `mu`), then a
Gaussian fall to `CURVE_FLOOR` (0.75) of width `CURVE_FALL_W` (1.4): ≥ 0.97 of
peak out to x ≈ 2.1, 0.85 at x = 3, the floor by x ≈ 5 — that is the FRONT.
The rear holds its peak out to `CURVE_HOLD_R` (2.6) before a gentler fall
(`CURVE_FALL_W_R` 2.0) to `CURVE_FLOOR_R` (0.80): with the front's fall on
both axles, full lock while coasting at 32–44 m/s spun the car, because the
rear's peak slip angle is only 6–7° without aero and every turn-in overshoot
carried it past the peak. It replaced `tanh(x)`,
which saturated and never fell, so an overdriven front kept 100 % of its force
at 16° of slip and a flick at full lock cost nothing. The peak slip angle is
`(π/2)·mu/cs` — about 9–11° front and 8–9° rear at 45 m/s, lower at low speed,
rising with aero load as it should. Never negative, never oscillating (a Magic
Formula with a sharpening E goes negative at spin-sized slips, which this model
reaches). The front-saturation haptic fires at `x > 1.15`, i.e. before the
peak; a rear haptic fires past the rear's peak. `c.frontUtil` / `c.rearUtil`
(the coach, `obs()`) are `x / (π/2)` — 1.0 at the peak, above it past — because
`|Fy| / mu` is not monotonic any more. Measured shapes and the
literature: `docs/notes/PLAYER-PHYSICS-RESEARCH-2026-09.md`; the shape is
locked by `tests/unit/player-dynamics-vm.test.mjs`.

**Combined-slip (friction ellipse), per axle**: `LONG_GRIP = 34 m/s²` is the
longitudinal axis of the traction circle and each axle pays for what IT does.
Braking charges both axles from the smoothed deceleration `axEstSm` (split by
brake bias below; 1/1 at `BB_REF`), so easing off the pedal hands grip back
continuously and trail-braking rotates the car. Engine braking — the coast
part of a deceleration, `brakeMix` ramps the pedal's share in from coast drag
to 1.5× it — and the THROTTLE charge the driven rear only: the undriven front
spends nothing on the pedal, so a planted throttle at the limit of a slow exit
lightens the rear's lateral grip and the car rotates (power-on oversteer,
emergent). The throttle charge is a fraction of `LONG_GRIP`:
`clamp(THR_VK / vStd, THR_FLOOR, THR_CAP)` (14 / 0.34 / 0.62 in
`js/physics/consts.js`) — traction-limited at ≤ 23 m/s, power-limited (an
engine's P/v) above, floored so planting the throttle mid-corner spends grip
even when speed-limited; ERS deploy adds on top. Full brake is still the bigger
bill (`BRAKE` 22 / 34 ≈ 0.65). Each axle's `sqrt(1 − axFrac²)` scales its own
`mu`; `physState()` exposes `axEstSm`, `axFrac` (the larger axle) and
`slipFactor` (the rear's, which the engine audio reads).
**The surface scales the brake as well as the grip** (2026-09-16): `surfMu`
scaled lateral grip off-track while the brake term carried no surface at all,
so a tyre on grass retarded the car exactly as hard as one on tarmac. The brake
now carries the same `lerp(1, OFF_GRIP, depth)`. **A known defect remains next
to it**: the run-off SCRUB (`20 + offDepth·28` m/s², up to 4.6 g) dwarfs
`BRAKE`, so 70 → 30 m/s measured 90.9 m on tarmac against 34.9 m on grass —
running wide is still the quickest way to stop. Fixing that is a track-limits
DETERRENCE decision (the `c.cuts` counter is the other half), not a physics
tidy-up, so it is recorded here rather than changed.

**Brake bias** (the SETUP sheet,
`js/garage/setup-tune.js`) splits that budget per axle UNDER BRAKING only:
the front spends `bb / BB_REF` of it and the rear `(1 − bb) / (1 − BB_REF)`
(`BB_REF = 0.56`, `js/physics/consts.js`), so `muF`/`muR` carry their own
`slipF`/`slipR`. At `BB_REF` both scales are exactly 1 and the ellipse is the
single `slipFactor` it always was — AI and remote cars carry no `brakeBias` and
read `BB_REF`, so nothing outside the player's sheet moves. Forward bias spends
the front's circle (entry understeer); rearward lightens the rear (rotation).

**Load sensitivity** (2026-09-16, `LOAD_SENS` in `js/physics/consts.js`).
`muF`/`muR` used to scale linearly with axle load; each now carries
`1 − LOAD_SENS·(load/static − 1)`, so the loaded axle gains less than its
share and the unloaded one loses less. Static balance is exactly unchanged
(the factor is 1 at rest) and the pair under full braking has ~1.3 % less
lateral grip than at rest — the braking front's gain trimmed, "hard braking
mid-corner understeers" made slightly firmer. (The post-peak drop that landed
with it, a 12 % smoothstep on `tanh`, was superseded by the peaked curve
above in the same day's merge; `tests/unit/physics-rows-vm.test.mjs` pins
both.)

**ACTIVE AERO (X-mode / Z-mode)** is the THIRD straight-line lever, next to
BOOST (spends the battery) and OVERTAKE (a free, proximity-gated push). It adds
NO thrust and spends NO energy — it trades **downforce for drag**, the 2026
moveable-wing rules. Z-mode (the default) is flaps shut and full downforce;
X-mode is flaps open, `xVmaxGain(c)` on top speed and `xCoastCut(c)` off the
coast drag, paid for with `xDfLoss(c)` of the `DOWNFORCE` aero-load term.
Nothing else in the grip model changes.

**THE SIZE OF THE TRADE IS THE AERO PART'S.** All three were single constants,
which gave a Monza-spec sliver and a maximum-downforce floor exactly the same
deal — backwards, because a big wing has more drag to shed AND more downforce to
lose. `Parts.aeroLoad(setup, team)` reads the resolved aero option's own
`cornering` and normalises it against the catalog's span (0 = `minimal`,
1 = `ground_effect`; derived from the catalog, so a new option re-scales the axis
rather than clipping). The car carries it as `c.aeroLoad`, and each constant
became a `_LO`/`_HI` pair interpolated by it. AI cars now carry their works
`FACTORY_PRESETS` load (Williams low-drag vs McLaren flex); the MY TEAM
teammate carries the player's saved build instead. A car that still
has no resolved setup falls back to 0.5 via `aeroLoadOf`. `AiDrive.houseStyle`
reads `team.stats` (career `tdev` via `Career.teamStats` baked as `c.houseStats`),
then seat 0 attacks / seat 1 holds; `ordersMul` stops #2 diving #1 and lets #1
through. AI corner `vLim` now scales with that same `aeroLoad` (±8 % at the
catalog ends); harvest/overcharge maps shift `wantBoost`; hold cars mix less
racing line and may keep Z-mode. Player `mods.braking` now reaches `axEstTarget`
so garage brakes spend the friction ellipse. Measured end to end:

| aero part | load | top speed | downforce given up | net grip at 70 m/s |
|---|---|---|---|---|
| `minimal` | 0.00 | +5.5 % | 42 % | −16.0 % |
| `medium` | 0.41 | +9.6 % | 57 % | −21.4 % |
| `ground_effect` | 1.00 | +15.5 % | 78 % | −27.3 % |

The SETUP sheet's rake (rear minus front ride height, from the team's default)
adds `RH_GAIN = 0.06` of load per unit of rake ON TOP of the wing's normalised
load, clamped to [0, 1] — the untouched car and every AI car read exactly the
table above; the cost is that a max-wing car gains nothing from more rake. The
anti-roll bars fold into the four-channel contract through `Parts.getMods(…,
tune)` (stiffer overall: cornering up, accel down; stiffer front: braking up,
accel down; ±5 % clamp), and are exactly 1.0 at the works sheet.

The big-wing car has the LOWEST base top speed and the biggest gain from opening,
so X-mode partly buys back the straight-line speed the wing costs — which is the
real trade, and the reason the two ends are worth choosing between.
`physState()` reports `aeroLoad`, `xVmaxGain`, `xDfLoss`, `vmaxNow`, `aeroGrip`
and `aeroDf`, so none of this has to be read out of `updateCar` again.

`c.aeroX` is the FLAP TRAVEL (0..1) and is what every consumer reads — physics,
HUD and the wings' own moveable ELEMENTS. Per the 2026 rules every element
except each mainplane rotates, and both wings actuate together: at the default
downforce level that is the front cascade's top two flaps plus the rear wing's
top two planes — four elements, all driven by the one `aeroX`. They are NOT
baked into the car mesh; `Car3D.aeroFlaps()` hands them out as canonical hinged
specs (leading edge at the origin) and `drawAeroFlaps` places them, so the car
at rest is geometrically identical to the old fixed wing. `Car3D.buildFlapGeom`
runs the SAME `addWingFoil` emitter the baked wing uses and both read one
table, so they cannot drift apart. Closed = the element's own incidence plus
`Z_BITE`, CLAMPED per element against the measured nose underside (`NOSE_UNDER`)
so nothing ever swings into the bodywork; open = flat. `X_OPEN_RATE` is set by
the FIA's 400 ms transition cap, not by feel. The GARAGE turntable shares the
same draw, so its ACTIVE AERO button shows the real geometry at real angles.

`c.xOn` is the switch and `c.xArmed` whether the car is allowed the mode here at
all. Allowed means **inside an ACTIVATION ZONE**: the FIA approves fixed zones
per circuit and the standard ECU refuses to rotate the wings outside one, so
`AeroZones.create(G).build()` (`js/physics/aero-zones.js`, wired into game.js as
`aeroZ`) scans each built track for contiguous runs under `X_ZONE_K`
and keeps those longer than `X_STRAIGHT_T × X_ZONE_VREF` (210 m — the rule's
three seconds at racing speed). Zones are measured against a FIXED reference
speed, never the car's, because they are a property of the circuit and the
OVERALL SPEED slider must not redraw them. A circuit whose longest straight
misses the minimum gets **no zones and no active aero** — that is MONACO, and
`tests/specs/aero-zones.spec.js` pins it. Zones can WRAP the start line, so
`aeroZones()` exposes `midFrac` and every consumer should use it rather than
averaging `startFrac`/`endFrac`.

Braking or leaving the zone shuts the flap AND drops the switch, and
`X_CLOSE_RATE` (8.0/s) is ~3× `X_OPEN_RATE` (2.6/s) — the downforce comes back faster than it
left. The HUD chip counts the next zone down in metres like a DRS board, and
reads `NO AERO ZONE` (struck through, button faded) on a circuit that has none.

**MANUAL or AUTO** is a pause-menu setting (SETTINGS ▸ DRIVING, next to GEARS —
it is a control preference, not a property of the event, which is why it is not
in RACE SETTINGS). On AUTO the wing takes every zone by itself and the AERO
button is **removed from the dock**, not greyed: the survivors close ranks,
which the flex dock can do and the old absolutely-positioned stack could not.
`store.get("aeroMode")`, `__apex.aeroMode()`, `raceAeroMode` in game.js.

Adding a consumer? Read `c.aeroX` (or `aeroDfMult(c)` for the downforce
multiplier) — **never `c.xOn`**. The switch is not the wing.

**OVERTAKE IS NOT ACTIVE AERO, and the two sets of rules must not be crossed.**
Overtake mode is 2026's successor to DRS as the *proximity-gated* overtaking aid,
so it inherits DRS's safety restrictions; active aero inherits none of them.

| | ACTIVE AERO (X-mode) | OVERTAKE |
|---|---|---|
| proximity to the car ahead | **none** — leader and backmarker alike | within `OT_GAP` (1 s) |
| where | inside an ACTIVATION ZONE only | anywhere |
| opening lap | **available** | disabled until the LEADER completes lap 1 |
| under a caution | available | disabled |
| circuit with no zones | unavailable (Monaco) | available |

`otEnabled()` (a game.js delegate to `RaceControl`, `js/race/race-control.js`) is the race-wide gate — it reads `ranked[0].lap` (the
LEADER's, because a field-wide switch is what race control throws, and it is
O(1) since `ranked` is already sorted) and `caution.level`. `c.otArmed` folds
that together with the car's own gap and cooldown. The HUD says `NO OVERTAKE`
and fades the button while the gate is shut, because "not armed yet" (keep
closing) and "switched off" (nothing you do will arm it) are different messages;
the lockout after a push is a third one, `COOLDOWN 12` counting down in whole
seconds (it used to read `OVERTAKE` at half opacity, which is not a message).
`tests/specs/aero-zones.spec.js` pins both halves, driving a REAL opening lap —
`setLap()` moves only the player's counter, so a teleport cannot exercise a
leader-based gate.

**Slope gravity** adds up to `vmax × 1.06` on a descent and never confiscates
speed already above that margin (ERS / X leftover). On the flat or a climb,
speed above the margin bleeds at `0.35 × COAST_DRAG`. A hard `min(vmax×1.06)`
assign used to snap hills.

**The player is a world-space rigid body.** `px`/`pz`/`head` are the authority:
the car integrates its own position in world metres from tyre forces alone and
owes the road nothing. `(s, x)` is READ BACK off that position each frame by
`trackFrom()` — a predictor (distance along the road ÷ the Frenet stretch `h`,
see `frenetH`) plus two local Newton steps onto the perpendicular foot — purely
so the rest of the game can ask "where on the track is that?" (lap timing, walls,
kerbs, race position, HUD). The refinement is deliberately **local**: it never
leaves a few metres of last frame's `s`, so it cannot snap onto the wrong leg of
a hairpin the way a global `Tracks.project()` search does. That was the original
reason this code integrated in the road frame instead — keeping the search local
buys the road frame's robustness without surrendering the car's independence.

Only two things may move the player in road coordinates, because both are hard
constraints rather than suggestions: the **barrier clamp** (`xPinned`) and
**car-to-car collisions** (resolved in the `(prog, x)` plane). Both write back
into `px`/`pz`. Everything else flows world → `(s, x)`. Rebuilding the world
position from `(s, x)` unconditionally — as the code did when `(s, x)` was the
authority — silently puts the car back on the road's rails.

**Road-follow assist is OPT-IN and ships at 0.** `ROAD_FOLLOW` used to default to
0.7 with a DRIVING HELP slider that bottomed out at 0.25, so a quarter to a half
of every corner was steered for you and it could not be switched off (~20 % of
available lock at 50 m/s, ~40 % in a slow corner). Nothing steers the car by
default now except the driver; `helpFromSlider` runs `0 .. 0.70` with v1 = OFF,
and RELAX is the preset that opts back in. When enabled it steers toward the
curvature of the arc the car is actually on (`kPath = k/h`, not the centreline's),
**fades to zero off-track** (`offAssistFade`, over ~3 m of grass past the edge) so
the driver keeps full manual authority to recover, and fades under hard braking
(`brakeFade`) to kill the turn-in snap.

**Changing an assist DEFAULT does not reach existing players.** `store.get(k, d)`
returns the stored value whenever the key exists, so a new default only lands on a
fresh install — anyone who ever opened the settings keeps the old behaviour
forever. Lowering a default and migrating a stored value are DIFFERENT ACTS and
both are usually needed: the first reaches nobody who has opened the settings,
the second reaches nobody who has not.

`STEER_SCHEMA` in `js/input/steer-tuning.js` is the migration, and it is a
per-version LADDER (`STEER_MIGRATIONS`, currently at 4), not a single gate. That
distinction is load-bearing. It was once `if (stored >= STEER_SCHEMA) return`
followed by the v2 body, which works for exactly one version: bump the constant
and a store already at 2 falls through and receives v2's assist reset a SECOND
time, silently discarding a `drivingHelp`/`raceLine` value the player chose
deliberately after v2 ran. Each step now runs only if the stored schema is below
its own target, and every key a step rewrites is logged through `Log.info` —
a migration quietly rewriting someone's settings should leave a record.
`tests/specs/steer-migration.spec.js` pins all of it, including that a store at the
current schema is left completely alone.

---

## Weather and tyres

Weather and the fitted compound meet in ONE place: `gripMult(c)` in `js/game.js`,
reading `WET_GRIP` in `js/physics/consts.js`. The table is indexed by the
compound's tread class — `wetTread` in the Parts catalog, absent = 0 = slick:

| condition | slick | intermediate (`wetTread: 1`) | full wet (`wetTread: 2`) |
|---|---|---|---|
| dry / overcast / fog | 1 | 1 | 1 |
| `wet` | 0.82 | 0.94 | 0.99 |
| `rain` | 0.72 | 0.86 | 0.97 |

**The slick column is the old weather-only `gripMult()`, value for value.** Until
this landed the function read the weather and never the tyre, so the two wet
compounds were a pure penalty in the only conditions they exist for: you paid
about 10% of the car to fit a full wet and the rain treated you exactly like a
slick. `tools/car/parts-ladder.mjs` had been reporting it from the other side —
those two rows are the only never-optimal options in the whole catalog, and
`tests/unit/parts-ladder.test.mjs` still names them as exemptions because the
ladder scores the four DRY stats and none of them can say "works when it rains".

Keeping the slick column fixed is what makes the change purely additive: wet
compounds gain, nothing else moves, and the characterization baselines stay
honest instead of being re-cut. `headless-api.spec.js` asserting `gripMult ===
0.82` in the wet is the canary — the default compound is `medium`, tread 0, so
if that number ever has to change, the table is wrong.

### The three call shapes

- **`gripMult()`** — the slick column: the ROAD's condition, with no tyre in the
  question. Every readout wants this and every one of them is unchanged:
  `physState()`, agentview's `surface`/`gripMult` pair, `quali.lapTime`, the
  debug HUD line.
- **`gripMult(c)`** — what that car actually has. The physics seams only:
  `muBase`, the friction-ellipse budget `axFrac`, the AI steer term and
  `_aiBr.grip`.
- **`c.tread == null` → the top column.** See below.

`world().ego.grip` carries all three: `gripMult` (the road), `tyreGrip` (what
this car's compound has on it) and `fieldGrip` (what the AI around it have).
They are equal in the dry and on slicks, and separate only once it is wet —
which makes "am I on the right tyre for these conditions?" one subtraction for
an agent, rather than something it has to infer from lap times.

### The AI field is assumed competent

AI cars carry no stat mods — `modsFor` is player-only and `updateCar` falls
back to `NEUTRAL_MODS` — and, with one exception, no compound to read: the
MY TEAM teammate (`mate` in `makeCars`) shares the player's saved build, so it
carries the build's `wetTread`, `aeroLoad` and ERS axes. Every other AI car
has `tread: null`, which resolves to the top column: **the field is assumed to
have fitted the right tyre for the conditions.**

This is a design decision, not an oversight, and it is what keeps rain a race.
The alternative was a player-only advantage, which would have made a correct
tyre call worth ~35% more grip than every other car on track and turned a whole
weather condition into a walkover. As it stands a correct call roughly matches
the field and a wrong one costs about a quarter of your cornering.

### The racing line the AI drives

`js/track/core/line.js` (`TrackLine`) bakes a lateral offset per centreline
node at track build, beside `track.curv`: outside-inside-outside through every
corner — the turn-in from the outside edge at `sqrt(2 · 1.5R · 2w)` before the
apex, the apex a plateau on the inside edge wherever the road is still above
55% of the corner's peak curvature, the exit released to the outside 1.25× the
turn-in distance later. Corners are runs of |curv| above 0.006 rad/m (R < ~170
m; gentler bends are flat-out kinks) that end only below 0.0036 (hysteresis, so
a long opening bend like Parabolica keeps the inside to its real end); chicanes
share a knot through the middle. `lineW` is 1 in a corner window and 0 on a
straight, where the car's own lane preference spreads the field. The AI's
target is `lerp(lane, line, w · AiDrive.lineFollow)` read 8–25 m ahead.

Before it, the target was `-k · 130 · hw` mixed 55% with the lane: an
inside-hugging line (measured on monza: approach +1..+3.6 m INSIDE, apex only
+1.2 m inside on a 7 m half-width) and a lane-biased car apexed on the outside
all lap. After: approach 3–6 m outside, apex within a metre of the inside edge
(`tests/unit/ai-racecraft-vm.test.mjs`, the line test; `track-line.test.mjs`
for the geometry). The AI's corner SPEED comes from the path's curvature when
the car is ON the line and the road's when it is not (`TrackLine.pathK`, an
AI-only read — see the curvature table above).

`brakeTarget` sizes that corner off a flat `latMax`, and that is a DELIBERATE
choice as of 2026-09-09, not an oversight. Giving it the player's aerodynamic
term (`aeroGrip` = `1 + DOWNFORCE·aeroDfMult·(v/vTop)²`, 65 % more grip at the
top speed) was tried and reverted the same day, because the AI does not
simulate lateral grip the way the player does. The player integrates a slip
model whose `muBase` carries `aeroGrip`; the AI takes a kinematic lateral step
whose grip term is `gripScale = 1 - clamp((vStd(speed) - 20)/(VMAX - 20), 0, 1)
* 0.28` — it FALLS with speed — and a yaw cap with no aero term either. Adding
aero to the planner alone put planned grip (rising 65 %) and available grip
(falling 28 %) on opposite slopes: the AI planned entry speeds it could not
turn at and washed 0.60 m out of a short corner's apex at Monza while the long
ones were unmoved. That planner/actuator disagreement was CLOSED on
2026-09-14 (`bf1979d`): `AiDrive.lateralScale` is now the one grip envelope
(load ±8 %, grip, the 0.28 speed taper) that both the kinematic lateral step
in `updateCar` and `brakeTarget` read, and `AiDrive.cornerSpeed` inverts the
taper analytically so the planner's entry speed is one the actuator can turn
at. `latMax` is no longer flat — it carries the aero-load term — but it still
has no `aeroGrip` rise, on purpose: the actuator has none either. The 12 m
look-ahead floor that let every AI carry `sqrt(vC² + 449)` into an apex was
removed on 2026-09-15 with the `corner` difficulty dimension
(`docs/notes/AI-FIELD-RESEARCH.md`).

### Racecraft: who passes, who yields

The AI's traffic decisions live in `js/physics/ai-drive.js` as pure rules; the
O(n) scan and the Frenet lateral step that consume them stay in `updateCar`.
Three rules keep the field from welding itself together, each with a measured
defect behind it (`tests/unit/ai-stuck-vm.test.mjs`,
`tests/unit/ai-racecraft-vm.test.mjs`, and `docs/notes/CEILING-HISTORY.md` for
the numbers):

- **Overtake want compares PACE with pace** (`AiDrive.otWant`). The pull fires
  when the follower is closing, OR its free-running target speed beats the
  blocker's own ceiling by ~7% of the top speed (5.5% on a street circuit), OR
  the blocker is crawling (under 12% of the top speed — an obstacle whatever
  its pace). So an AI blocker that is slow for a corner, but no slower over a
  lap, is left alone; a genuinely slower car is attacked even while both are
  slow; and a parked car is passed, not queued behind at the crawl floor
  (measured: the crawl floor sits below the closing margin, so without the
  third clause an AI crept into the back of a stopped player and welded). A
  HUMAN blocker has no ceiling to read — `_vmaxNow` is the model's top speed
  for every car — so the caller passes 0 and the human's speed is their pace.
  Comparing instantaneous speeds alone let AI cars follow a slower car for
  36 s (monza) and 43 s (monaco); the pace comparison halved both.
- **A pass is a LATCH with a target beside the passed car** (`c.passOf`,
  `AiDrive.passTarget/passHold/passCooldown`). Once committed, the passer aims
  for a lateral position `minLatGap` beside the blocker rather than mirroring
  its own line, and the queue cap releases it as soon as it is 1.8 m clear
  laterally — before, the cap re-caught the passer the moment it fell back into
  the blocker box, which is why a pass kept aborting. Patience runs
  2.4–4.2 s by `craft`; a failed pass costs a 1.8–3.5 s cooldown by
  `experience`. `queueBrake` adds a real brake command behind a blocker only
  when the closing speed cannot be shed by lift alone within the gap.
- **A COMPLETED pass locks out the counter-attack** (the `passFailOf` /
  `passFailT` pair, written onto the PASSED car). Every cooldown above is on the
  attacker after a FAILURE; nothing distinguished a completed pass from a
  re-pass, so the car that had just been passed attacked straight back. It now
  takes the same `2 × passCooldown` lockout against that car specifically that a
  lunge-abandon already gives, scaled by its own `experience`, and never written
  onto a human — a player may re-pass whenever they like. Without it, 74 % of
  monza's order changes were the same PAIRS trading places rather than the field
  racing (`tools/check/ai-field.mjs` splits settled passes from oscillation).
- **Exactly one car yields in an alongside pair** (`AiDrive.sideYieldsA`): the
  car behind on arc, or the outer car when level. The same rule drives the
  collision resolver's side branch (only the yielder is scrubbed and flagged;
  with a human in the pair both are flagged, since the human's flag gates their
  stuck rescue and the AI's makes it compliant to a player leaning on it) and a
  hard planner constraint (the yielder's lane target is pushed clear of the
  other car). Scrubbing and softening BOTH gave neither priority: pairs
  sank to ~17 m/s at a 70 m/s ceiling for as long as the corner kept them
  touching — six such standoffs per four minutes on monza, none after.

- **A standing start is a launch** (`AiDrive.launchPlan` / `launchMul`). Every
  AI car used to accelerate identically, so a 22-car grid held its 8 m pitch for
  fifteen seconds and braked for T1 as one train (measured: median gap 8.0–8.6 m
  from t=1 to t=15, all speeds within 2 m/s). Each car now draws, per race, a
  reaction (0.05–0.75 s, shorter with awareness) and a getaway multiplier
  (0.7–1.08, better with craft and skill) that fades to ordinary acceleration
  over three seconds. The draw is a hash of the seed and grid slot, never a
  `simRnd()` — the stream's draw count is a contract. After: speeds span 8 m/s
  at t=4 and the first ten seconds see 17 order changes instead of 3.
- **Pace drifts over a stint** (`AiDrive.pacePhase`). Two cars of equal pace ran
  in lockstep for a whole race with no reason to pass; each AI car's `vmax` now
  carries a zero-mean sinusoid — ±0.5% for a consistent driver, ±1.6% for a
  rookie, period 24–60 s, phase from the same hash — so equal-pace pairs cross
  over and races happen inside the field, not only at its pace boundaries.
- **A crawling blocker is one that is not pulling away**: the `otWant` crawl
  clause reads the blocker's acceleration (`c.accSm` on an AI car, `axEstSm` on
  a human), so a launching grid is not 21 cars latching a pass on the car ahead.

- **A pass is engaged only where the move is on** (`AiDrive.attackOK`,
  `TrackLine.attackAt`). Each corner's braking zone (130 m before the turn-in)
  carries a baked quality: the length of the straight feeding it (0 at 60 m,
  1 at 450 m) times the road width (0 at a 4 m half-width, 1 at 6.5 m) — Game
  AI Pro's per-corner overtaking flags. Outside a zone a straight is 0.6 and a
  bend fades to 0.15. The utility is that quality times the closing rate, times
  craft (0.7–1.25) and a per-car roll; below 0.32 the car FOLLOWS — it does not
  hang half alongside (the bias without the commitment parked pairs side by
  side at monaco). A car with real pace in hand is passed wherever: the quality
  floor rises from a 6% deficit (the field's own tier spread) to 0.6 at 12%,
  and a crawling car is 1. A pass still behind by more than half a car at the
  turn-in is a lunge: abandoned, and that car is not re-attacked for twice the
  cooldown (rFactor 2's "threshold endured") — unless the attacker has 12% of
  pace in hand, in which case it will be alongside under braking anyway.
  Measured (sticking position swaps per field lap, six minutes, after the first
  minute): monaco 1.29 → 0.65 with flip-backs 25 → 3 — the real Monaco sees a
  handful of passes per race; monza 3.7 → 3.8, unchanged, since a long straight
  into a wide braking zone is where the move IS on.
- **On the line, the line's own corner speed** (`TrackLine.pathK`). The AI's
  brake target reads the road's curvature eased toward the line's arc — the
  widest arc touching the outside edge at the corner's ends and the inside at
  the apex, `ρ = (a² + b² − 2ab cos(θ/2)) / (2(b − a cos(θ/2)))` — never below
  85% of the road's, and only while the car is within 1.5 m of the line. Off
  the line, fighting, it gets the road's curvature: being off-line costs what it
  costs a real car. The whole geometric gain is not handed over because the
  AI's corner-speed model is an abstraction calibrated on the road's curvature
  against what the player can do; 85% is an 8% corner-speed edge for the line.
  Measured on a solo lap: monza 124.97 → 123.30 s, monaco 86.05 → 85.03 s, and
  the difficulty scales in `js/physics/consts.js` came down 1% so each level's
  lap time holds — the pace moved from the straights into the corners.
  **The AI's lateral controller is a heading state** (2026-09-08, game.js
  "--- lateral ---"): steered toward the target path's tangent plus a
  Stanley cross-track term, yaw-rate capped by the lateral grip budget, with
  the pass / defend / yield / separation biases slewed at 3 m/s; measured on
  a solo Monza lap the lateral acceleration RMS fell 10.0 → 5.9 m/s²
  (`docs/notes/RACING-LINE-RESEARCH.md` §7). Defending or passing blends
  toward a baked line FAMILY (`TrackLine.at(track, s, fam)`: inner / outer)
  rather than pushing the racing line sideways. The brake look samples every
  curvature node, node-aligned, so the target no longer steps as the 14 m
  stride slid across the nodes.
  The line's GEOMETRY was relaxed on 2026-09-08 (`TrackLine.bake`: minimum
  curvature plus a path-length term, `docs/notes/RACING-LINE-RESEARCH.md`);
  `pathK` and its 85% floor did not change, so the AI's brake model and the
  difficulty scales stay calibrated — the relaxation moves where the cars
  are, not how fast the model lets them corner. Since 2026-09-16 the
  relaxation minimises the offset curve's EXACT curvature (the first-order
  form taxed a road crossing up to 1.3×), converges through a stride-2 level
  with alternating sweeps, and is held under a 0.45 m/m lurch cap by
  projected relaxation afterwards (`RACING-LINE-RESEARCH.md` §11 — the
  cap is load-bearing: an uncapped 0.54 m/m crossing at Monza's first
  chicane cost the AI field 1.6 % of lap time).
- **The compound is the strategy** (`AiDrive.tyreClass` / `tyrePace`) — **while
  TYRE WEAR is off**, which is the shipped default. Each AI car draws a class for
  the race distance (sprints on softs, long races mixed): a soft starts +0.4% and
  degrades 0.12%/lap, a medium 0 and 0.07%, a hard −0.4% and 0.04%, capped at
  −2.5%. Soft- and hard-starters cross at lap 10, inside the 10- and 25-lap races
  hards are drawn for. Zero-mean over a mixed field, so the AI's pace against the
  player is unchanged on average. With TYRE WEAR **on**, this fudge is bypassed
  entirely and the AI's pace comes off the same `TyreModel` curve the player is
  driving, so a strategy fight is fought on one model (§Wear, and the stop), and
  the STARTING compound comes from the car's own plan rather than the class draw.
- **The field races a strategy** (`AiDrive.stintPlan` / `pitNow`, executed by
  `PitLane.planFor` / `think`), when TYRE WEAR is on. Each car enumerates every
  0-, 1- and 2-stop plan over the three dry compounds and keeps the cheapest
  under `Σ stint costs + stops × pit loss` — the formulation strategists
  actually solve, with pit loss taken from the LANE's own geometry so a circuit
  that costs more to stop at really does see fewer stops. Two per-car tastes
  come out of the same race hash the launch plan uses (so arming still costs the
  sim RNG nothing): one for stopping, one for grip over durability. Both are
  needed — biasing only the stop count measured as twenty cars on one plan.
  Strategies MIX because a full tank wears tyres (`FUEL_WEAR`), which is what
  puts harder rubber early and softer late.
  Three rules override the plan: the **free stop** under a caution (worth
  8-12 s, the biggest lever in the sport), the **wrong tyre for the conditions**
  in either direction, and a **spent set**. The last two ignore the plan's stop
  budget, because both are about a tyre that cannot do its job rather than about
  strategy — gating them left every 0-stop car circulating on slicks in the rain.
- **Mistakes, under pressure most of all** (`AiDrive.mistakeChance`). Once per
  braking point a car may miss it: base 0.4% × (1 + 2 × pressure) × (1.3 −
  consistency), pressure being the share of the last six seconds spent with a
  car within 0.6 s behind. A metronome unpressured errs once in ~80 laps, a
  rookie under sustained pressure once in ~10. The error is a LATE phase
  (1.2 s: brakes 5% later, runs most of the way to the outside edge, fronts
  locked for the render) then a GATHER phase (1.8 s at 85% pace) — half a
  second to a second and a half lost, never while alongside another car, and
  rolled from a hash of the seed, grid slot, lap and braking point, never from
  the seeded stream. This is rFactor 2's Composure-scheduled "bad driving
  zones" and AMS2's forced-mistake channel; F1 22's two or three lock-ups a
  race was what players called too many, so the rates sit well under it.
- **The aim, not the contact** (`AiDrive.aimIntrudes`, 2026-09-16). Every
  side-by-side rule keyed on where the cars ARE — the clear-gap election and
  the rub clamp began when the boxes were 0.8 m apart, and against a human
  only after a 0.3 s grace — while the AI steers toward a point 8–25 m ahead
  on its line. A car overlapping by half a length and a lane over was aimed
  THROUGH until they touched. Now, for a HUMAN neighbour, the question is
  asked of the AIM: if the target point is inside the player's clear gap and
  on their side of where we are (steering into them, not holding while they
  come to us), the AI holds the gap at the aim — nobody else in the pair
  will. Between AI cars the contact-time election stays: asked at the aim of
  every neighbour it cost the AI-only field a quarter of its settled passes
  (40 → 30 per 240 s at Monza), two cars each conceding a side-by-side
  neither had lost. Measured with `tools/check/ai-human.mjs`
  (a driven scripted player 3 % under the field's pace, 3 seeds × 240 s,
  Monza): first touches per 100 s 5.6 → 4.9 with the player on the line, and
  the share of alongside frames spent touching 25 → 13 %; 5.8 → 3.9 with the
  player 1.5 m wide of it (rear-end 2.7 → 2.3, side 4.3 → 3.7, diagonal
  7.0 → 3.3). `queueBrake` gained a light brake for a small closing rate
  INSIDE the follow distance (a +1.5 m/s excess reached neither of its gates
  and was carried into the tail of the car ahead).
- **No moving under braking** (`AiDrive.holdLineGap`). Braking with a car
  within a second behind (eight metres at least), and not itself attacking,
  an AI freezes its offset from the racing line at what it was when the brakes
  went on — the line itself still sweeps into the corner. This is the FIA
  guideline's "no change of direction by the defending car once the
  deceleration phase has begun, except to follow the racing line", and it
  removes the class of contact a player can do nothing about: the car ahead
  changing line as you commit to a side. Measured: line changes over 1.5 m in
  half a second under braking with a chaser fell 128 → 93 per four minutes at
  monza, 155 → 135 at monaco; what remains is the line sweep and attackers.
- **One defensive move per straight** (`AiDrive.defendOnce`). The first
  defensive pull fixes the side; a pull the other way on the same straight is a
  second change of direction and is refused. The side resets in the braking
  zone, so the next straight is new.
- **Braking for the car ahead reads the time to collision** (`queueBrake`'s
  second gate, after Speed Dreams' simplix): catch time under 3 s and a required
  deceleration above 5 m/s² brake in proportion to the need (`aReq / BRAKE`),
  so a creep the closing-rate gate could not see is caught early and a train
  brakes smoothly instead of tapping and stamping.

Grid lanes interleave left/right by grid slot, so the start pack is already two
lines rather than one file. All of this is AI-only — every read sits inside
the `!c.human` arm, and `otSide`'s corner-inside tie-break is in the arc table
below.

### Slipstream vs wake — the two are not one number

`c.wake` is the positions-only proximity to the car ahead (game.js `wakeOf`,
window `TOW_RANGE`/`TOW_FADE`/`TOW_HALF_W` in `js/physics/consts.js`) and is
recorded for EVERY car every step; `dirtyAirMul(c.wake)` charges it at
`aeroGrip` (player) and `_aiBr.grip` (AI), so both pay dirty air in the
corners. `c.towing` is the tow BENEFIT actually applied to vmax — gated on the
driver (not braking, wheel near straight) for the player and on the curvature
lookahead for the AI — and is what the HUD chip and engine audio read. The
player's wake used to be the gated value, so it paid no dirty air in corners
while the AI always did.

Under a caution (`raceCtl.level >= 2`) a car above the delta pace is braked
at `CAUTION_BRAKE · BRAKE` (game.js) toward it, on descents too; the cut vmax
alone was only an acceleration ceiling, and the field was still rolling at the
restart.

### Car-to-car contact: what a touch costs

The resolver (`Collide.resolveCollisions` → `_colResolvePair` / `_colSepPair`,
`js/physics/collide.js`, `Collide.create(G)`) works in
the `(prog, x)` plane on 4.8 × 2.0 m boxes, four relaxation passes and a
separation pass per step. Its rules, each with the measurement that set it
(`scratch/collision-bench.mjs`, `tests/unit/collision-contact-vm.test.mjs`):

- **A rear-end is an impulse, `j = (1 + e) · relV / (invA + invB)`**, with
  `AiDrive.bumpRestitution`: e = 0 below 1 m/s closing (a resting contact — a
  car sitting on a bumper must not jitter off it), 0.1 from 3 m/s (real cars'
  floor at speed), a ramp between. The old `0.5 · relV` was (1 + e) = 0.5: the
  pair was still closing at half speed after it and penetration ate the rest
  over ~30 frames, which is why a bump read as being pushed along. The car in
  front takes the punt in full; a HUMAN in front is capped at a closing speed
  of `AiDrive.humanPuntCap()` (8 m/s at PACE 1, pace-scaled) so an AI misjudging
  a braking zone cannot launch the player, while the AI still pays its share.
  The human's inverse mass stays 0.5 (`AiDrive.humanInvMass`): the player is
  the heavy car in every exchange.
- **A YAWED pair skips all of the above and goes through a real impulse**
  (`ContactGeometry.impulse`, reached from `Collide.orientedResponse` whenever
  either car's `psi * yawMix(psi)` is non-zero — the player past 20 degrees of
  yaw, never an AI car, which has no real heading). Since 2026-09-16 that
  impulse carries restitution and Coulomb friction: `e` is the SAME
  `AiDrive.bumpRestitution` ramp as the rear-end bullet above, and a tangential
  impulse clamped to `0.5 * j` is what lets leaning on a rival transfer lateral
  momentum and yaw at all — before it, the resolver could only ever push along
  the contact normal, so a rub was a shove and never a scrub. The tangential
  half is solved from the velocities AFTER the normal one, which is what keeps
  the pair's kinetic energy monotonically falling; solving both from the same
  pre-velocities leaves the `j*jt*(n.K.t)` cross term unaccounted for and can
  create energy. `FRICTION = 0.5` is a first value with no measurement behind
  it. The gate is structural rather than numeric: the unyawed field is
  bit-identical by construction, because `e` is zero and the friction block
  does not run when both angles are zero, which is every AI pair and every
  player under the yaw floor.
- **A side rub is a small deceleration, taken once a frame**
  (`AiDrive.rubDecel`, 3 m/s² permanent / 3.5 street, on the yielder only). It
  was a 0.995 factor applied on every relaxation pass — 2 % a frame, 48 m/s² at
  40 m/s — and a player boxed between two AI cars lost 18 m/s in a second with
  zero slip. Bodywork on bodywork costs little; interlocking wheels are the
  incident sim's business.
- **"Behind" means less than half a car alongside** (`AiDrive.sideYieldsA`,
  2.4 m of 4.8). The old ±0.5 m level band made a car a bumper back the one
  that yields and pays the rub — that was the player, every time an AI was
  marginally ahead. Inside half a car both must leave room, so the outer car
  concedes; past it the leader may take the line. This is the FIA driving
  standards' "significant portion alongside" (front axle past the mirror) in
  arc-length.
- **The yielding AI keeps its steering when steering AWAY.** Contact compliance
  (`AiDrive.contactGive`) exists so a player leaning on an AI can move it; it
  used to scale every lateral step, so the same compliance held the AI against
  the car it was trying to leave. It now applies only toward the contact.
- **The alongside constraint targets the LATERALLY nearest car.** With a car on
  each side, the scan picked the one half a metre closer in arc and two lanes
  away, so the constraint aimed at the wrong car and the sandwich rubbed for two
  seconds with nobody yielding.
- **A squeezed yielder backs out** (`AiDrive.squeezeEase` / `squeezeBrake`):
  in contact, ours to yield, and no lane on the far side to yield into — the
  pace ceiling drops to 90% of the other car's speed (88% street) with a quarter
  brake, and any pass in progress is abandoned with its cooldown. This is what
  a driver does when walked to the edge. It became necessary the moment a rub
  stopped costing 48 m/s²: AI pairs then ground along a barrier for seconds
  where the old scrub had knocked the trailing car back (prolonged-contact
  pairs 0 → 4 on monaco; 0 again with the back-out).

Measured on monza's start straight, before → after: boxed between two AI cars
at 40 m/s, player loss over one second 18 → 0 m/s; a wheel-to-wheel lean 15 →
0 m/s; a rear-end bump leaves ≤ 15 % of the closing speed instead of 55 % per
pass. Left as is, deliberately: the aggressive position correction (~93 % of a
penetration per step — Box2D would use 20 %) because a lateral shove of 2 cm a
frame is what the player actually receives; and a pair sitting exactly at the
5 cm slop exchanges momentum without raising `contactT` (the flag is gated on a
real penetration), so a full-throttle push along a slower car rumbles through
`collideFx` but does not flag either car as colliding.

### Braking

Weather never scaled `BRAKE` — it only ever touched lateral grip and the
friction ellipse. That made a full wet's `braking: 0.94` an *uncompensated*
penalty: in the rain it braked worse than a slick and got nothing back. Braking
and its `axEstTarget` estimate now carry `gripMult(c) / gripMult()`, the
compound's advantage over a slick in the current conditions. That ratio is
exactly 1.0 on slicks and 1.0 for everyone in the dry, so slick braking does not
move — it only hands the wet compounds back the braking their tread earns.

### Wear, and the stop

> Until 2026-09-14 this section read "Two things this does NOT do", and the
> first was **"There are no pit stops. The compound is a pre-race commitment."**
> That is no longer true. What follows replaces it; the design and the cited
> numbers behind every constant are in
> [research/TYRE-STRATEGY-DESIGN.md](research/TYRE-STRATEGY-DESIGN.md).

**`js/physics/tyre-model.js` (`TyreModel`) wears the tyre, and
`js/race/pit-lane.js` (`PitLane`) lets you do something about it.** Both are
gated on the TYRE WEAR race setting (`off` / `light` / `real`), which **ships
`off`** — and `off` is a *true* no-op: `gripMul`, `tractionMul` and the two fuel
multipliers all return exactly 1, so
`tests/specs/physics-characterization.spec.js` is untouched until somebody turns
it on. `js/race/reliability.js` ships off for the same reason.

- **Life is a fraction of the SCHEDULED distance, not a lap count.** Real
  degradation over a 25-lap stint accumulates ~1.5 s against a ~21 s pit loss,
  so a literal port of real rates means no stop is ever worth making at any
  distance the lap ladder offers (3 / 5 / 10 / 25 / FULL). A 0.5-life compound
  is spent halfway through a 5-lap race and halfway through a 50-lap race alike,
  and `MIN_LIFE_LAPS` keeps a 3-lap blast off the cliff.
- **Wear reads the forces the car made, never the arc.** Lateral and
  longitudinal friction-circle use, body slip, kerbs, off-track — no curvature
  read anywhere, which is both the rule above and the correct physics (sliding
  wears tyres; corners do not). The player and the AI are scored differently
  because only human cars run the full bicycle model, and both land on one ~1.0
  scale — `LOAD_REF` is measured off driven laps, not guessed.
- **`tyreMu` enters at `muBase`, beside `marbleMu`** — the same external-scalar
  seam, on the same terms. Traction and braking take a smaller share of the drop.
- **There is no pit button.** A stop is called the way a driver calls one: put
  the car on the pit side at the entry and hold it there. A control made the
  stop a MODE you toggle on the approach; the real thing is a LINE you take.
  Telling that apart from a car that merely ran wide at the entry is the same
  discrimination the half-plane `inLane` failed at, and four conditions do it —
  only in the first 120 m of the window, past 0.70 of the half-width, held for
  0.55 s, and moving forward on the road. The last one refuses the spun or
  beached car by construction. The HUD's compound chip fills with the dwell,
  because a gesture needs the feedback a button gave for free.
- **The stop is a STATE, not a place.** The first cut opened the driving
  boundary across the pit window so the lane was real tarmac. It measured well
  and broke two other things: lap distance jumped 250 m at Monaco, and a beached
  car stopped reading as off-track and so was never rescued. The lane is
  therefore longitudinal — arm a stop, and the limiter, the box and the release
  are keyed to `pitState` and arc distance, with no geometry mutation at all
  (`docs/research/TYRE-STRATEGY-DESIGN.md` §5.2 erratum). **Pit loss is still
  emergent**: window length over the limiter against racing the same stretch,
  plus the box. Measured **23.6 s at Monza** on the original 530 m window,
  inside the real 20-25 s band, and it varies by circuit the way real strategy
  does. The window was shortened on 2026-09-16 (`TrackPit` ENTRY_MAX 400→260,
  EXIT_M 130→110, a 370 m lane at most; the box hold 2.4→2.2 s), which
  `PitLane.estimate` puts at ~12 s at 80 km/h on a full-length lane — a stop
  that still decides a strategy without a quarter of a lap under the limiter.
- **Temperature is TWO states, and the second one is not decoration.** A real
  tyre fails in two opposite ways a single temperature cannot tell apart:
  **graining** is SURFACE damage from cold or sliding rubber, costs a couple of
  tenths, and drives itself clean again; **blistering** is BULK damage from a
  core that got too hot, costs a second or more, and never recovers. One state
  gives you one failure and therefore no decision — with two, backing off is a
  real move. The carcass follows the surface on a ~35 s constant against the
  surface's ~9 s, and that gap *is* the distinction. Optimum window is derived
  from `life` rather than authored twice (soft ~91 °C, hard ~111 °C), and the
  cooling coefficient is *solved* so each compound equilibrates near its own
  window — scaling only the heating made a soft both warm faster and want less
  heat, so it sat 19 °C above its window permanently. What still differs
  between compounds is the time constant: softs switch on in about a lap, hards
  in two or three.
- **A fresh set comes out of blankets at 70 °C, below its window.** That is the
  out-lap, and it is the counterweight the undercut needs — without it a stop is
  free and therefore always correct, which is a worse game than the one with the
  trade in it.
- **Wear is per-axle, as a bias on one integration.** Braking loads the front
  (and brake bias says how much), traction loads the rear; the two shares
  average to exactly 1, so `c.tyreWear` — what the planner, the AI, the HUD and
  the pit call all read — is untouched and only `muF`/`muR` differ. Worn fronts
  stop the car turning in, worn rears let it step out: opposite complaints with
  opposite answers, which is what makes a gone tyre something you can drive
  around. `axleSplit` is a RATIO against `gripMul` because `muBase` already
  carries the shared drop.
- **Circuit severity is what the SURFACE does, on top of what the layout does.**
  The emergent load already says how hard a LAYOUT works a tyre — it falls out
  of the forces the car made, with no authoring. `tyreSeverity` says what the
  abrasiveness, the tarmac age and the track temperature do on top, none of
  which geometry can know, and the two multiply. That decomposition is what
  lets the model say something one number could not: Monaco's layout works the
  tyre hard (1.221 emergent) while its surface and speeds work it gently, which
  is how one of the sport's most demanding layouts is one of its LOWEST deg
  circuits (0.050 s/lap against Austria's 0.097). Authored on the seven
  circuits with a measured 2026 rate; the other forty-four stay at 1.0 rather
  than guessed (`docs/research/TYRE-STRATEGY-DESIGN.md` §5.5).
- **The player is told, in words they can act on** (`js/race/engineer.js`).
  Every line names something to DO: graining says ease off and clean them up
  because it heals, blistering says the set is done because it does not, and
  the axle split says brake earlier or ease on the throttle. It ADVISES and
  never decides — nothing it says arms a stop. That is §11 decision 1 ("live,
  not pre-planned") made good: the AI has a plan and `PitLane.think` executes
  it; the player has an engineer.
- **A stop fits what you OWN.** Real F1 allocates 13 sets a weekend and Apex has
  no practice sessions to allocate across — but career already tracks which
  parts you own, so `PitLane.pickFor` fits the fastest owned compound that still
  reaches the flag, and the career economy becomes the allocation rule with no
  new system (§6). Tread comes first and is not a preference: a save that owns
  no wet tyre still gets one from the class ladder, because the alternative is a
  player who cannot respond to the weather. This also fixed a real defect — a
  player stopping in the rain used to refit their garage slick, the exact loop
  the AI's weather rule exists to prevent.
- **The weather recourse now exists.** This section used to warn that a
  `dry→rain` arc "punishes a slick with no recourse… the first thing to revisit
  if rain feels unfair". Pitting IS the recourse. Acting on it automatically is
  the AI strategy phase's job, not the lane's.

Still open:

- **Remote human cars in multiplayer do not replicate their compound** and land
  on `tread == null`, i.e. the competent-field column. Wear and stints are not
  replicated either, so a friend race sees the right cars in the wrong rubber.

---

## Curvature channels — the "arc must not reach the driver" table

Every consumer of `Tracks.curvature()` (direct calls plus the two
destructured aliases in `js/track/core/mesh.js` and `js/track/tracks.js`)
classified into its legitimate channel. Audited 2026-08-27 by the
physics-contract-auditor: ZERO violations — every player-path read is
behind an assist knob that defaults to 0, or reaches only render / audio /
telemetry. `tests/unit/curvature-channels.test.mjs` asserts every file that
reads curvature appears here, so a new consumer must be classified before
it lands.

| file | sites (symbol) | channel | why it never reaches the player with assists off |
|---|---|---|---|
| `js/game.js` | `updateCar` k/`c.kCur` cache | **assist-gated** | every player-path use is multiplied by `ROAD_FOLLOW` (def 0) or sits inside `if (raceLineAssist !== 0)` (def 0); `c.kCur` feeds only BodyAttitude (render-only) |
| `js/game.js` | `updateCar` ERS boost / OT fire / brake look / lane target / overtake side pick | **AI-only** | each inside the `!c.human` arm. The side pick passes the SAME `kA` the lane target already sampled into `AiDrive.otSide`, which breaks an equal-room tie toward the inside of the next corner — the arc chooses which way an AI goes around another AI, and touches no player force path |
| `js/game.js` | `updateCar` RACING LINE assist | **assist-gated** | inside `if (raceLineAssist !== 0)`; slider def 0 |
| `js/game.js` | `drivingLineApi` (feeds `js/render/shared/driving-line.js`) | **surface** | the DRIVING LINE ribbon: the adapter hands the builder the static curvature LUT, read once per circuit to place the line and shade its braking zones; a picture on the road, no car reads it. Same lateral formula as the assist-gated `lineX` so the two agree |
| `js/game.js` | `coast` | **broadcast-only** | runs only on `c.finished` cars — driving control is already disconnected. Any future reuse of `coast()` on a live car is a BLOCKER |
| `js/race/pit-lane.js` | `entryRunM` | **surface** | where the pit lane OPENS, walked back from the start/finish line once per circuit to find where the last corner lets go. The aero-zones row below is the precedent and this is the same shape: a fixed zone computed from the static arc, gating a driver-INITIATED action (calling a stop) identically for every car, no force path, nothing read per frame. Replaced a flat 320 m that landed Monza's entry inside Parabolica — where the commit gesture (hold the pit side) asks a driver to hold a line mid-corner. Threshold 0.0035 (r ~= 285 m) is deliberately looser than a DRS zone's 0.0014: an entry needs "not actively cornering", not a proper straight |
| `js/physics/aero-zones.js` | `build` | **surface** | fixed FIA-style activation zones computed once per circuit; gates the driver-INITIATED X-mode button identically for all cars; no steer torque |
| `js/physics/debris-world.js` | `registerFurniture` | **broadcast-only** | apex-kerb cones in the one-way cosmetic Rapier side-world |
| `js/camera/vantage.js` | `vantage` | **broadcast-only** | only heli/side/cinematic broadcast cams; 0 in every driven mode |
| `js/race/quali-model.js` | `lapTime` | **AI-only** | offline lap-time model for the simulated field; a player-driven lap always overrides it |
| `js/physics/brake-cue.js` | `tick` | **assist-gated** | behind the BRAKE CUE slider (notch 1 = OFF); audio/haptic pulse only, no force path. NOTE: ships defaulted ON (notch 6) — sensory-only, but a fresh install does hear a curvature-derived cue |
| `js/agent/apex.js` | probe/scan/cinematic/tourShots/corners/obs/trackShape/trackProfile | **broadcast-only** | `__apex` dev/telemetry reads; nothing writes into the driving model |
| `js/agent/agentview.js` | state dump, corner table | **broadcast-only** | agent telemetry output |
| `js/ui/track-maps.js` | measureApex/detectDRS/detectCorners | **broadcast-only** | 2D picker/popup/minimap outlines (menus + HUD drawing only) |
| `js/track/core/mesh.js` | findCorners, bankingProfile, banked-corner pick | **surface** | build-time road-geometry decisions baked into the mesh — road shape itself |
| `js/track/tracks.js` | build LUT bake, signboard side pick | **surface** | the producer itself, plus static scenery placement |

A module that consumes only REPORTS other code already produced is not in this
table, because it has no curvature site to classify — the first-run coach marks
(`js/ui/onboard.js`) are the worked example: they read `BrakeCue.debug().urgency`,
the overtake arm flag the HUD already draws and `G.aeroZoneAhead`, and write only
to `#announce`. `tests/unit/onboard.test.mjs` asserts the source contains no
`Tracks` read, no `curvature`, and no assignment to a car — which is what keeps
it out of this table honestly rather than by omission.
