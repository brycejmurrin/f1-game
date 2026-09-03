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

**Combined-slip (friction ellipse)**: `LONG_GRIP = 34 m/s²` is the longitudinal
axis of the traction circle. Braking or accelerating consumes longitudinal grip;
`slipFactor = sqrt(1 − (axEstSm/LONG_GRIP)²)` scales lateral grip. Trail-braking
rotates the car; hard braking mid-corner understeers. Exposed via `physState()`
fields `axEstSm`, `axFrac`, `slipFactor`.

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
slick. `tools/parts-ladder.mjs` had been reporting it from the other side —
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

### Braking

Weather never scaled `BRAKE` — it only ever touched lateral grip and the
friction ellipse. That made a full wet's `braking: 0.94` an *uncompensated*
penalty: in the rain it braked worse than a slick and got nothing back. Braking
and its `axEstTarget` estimate now carry `gripMult(c) / gripMult()`, the
compound's advantage over a slick in the current conditions. That ratio is
exactly 1.0 on slicks and 1.0 for everyone in the dry, so slick braking does not
move — it only hands the wet compounds back the braking their tread earns.

### Two things this does NOT do

- **There are no pit stops.** The compound is a pre-race commitment, and weather
  can still swing mid-race through `startWeatherArc` (`dry→wet→rain` and back).
  A dry→rain arc punishes a slick with no recourse. That is what gives the
  choice teeth; it is also the first thing to revisit if rain feels unfair.
- **Remote human cars in multiplayer do not replicate their compound** and land
  on `tread == null`, i.e. the competent-field column.

---

## Curvature channels — the "arc must not reach the driver" table

Every consumer of `Tracks.curvature()` (direct calls plus the two
destructured aliases in `js/track/mesh.js` and `js/track/tracks.js`)
classified into its legitimate channel. Audited 2026-08-27 by the
physics-contract-auditor: ZERO violations — every player-path read is
behind an assist knob that defaults to 0, or reaches only render / audio /
telemetry. `tests/unit/curvature-channels.test.mjs` asserts every file that
reads curvature appears here, so a new consumer must be classified before
it lands.

| file | sites (symbol) | channel | why it never reaches the player with assists off |
|---|---|---|---|
| `js/game.js` | `updateCar` k/`c.kCur` cache | **assist-gated** | every player-path use is multiplied by `ROAD_FOLLOW` (def 0) or sits inside `if (raceLineAssist !== 0)` (def 0); `c.kCur` feeds only BodyAttitude (render-only) |
| `js/game.js` | `updateCar` ERS boost / OT fire / brake look / lane target | **AI-only** | each inside the `!c.human` arm |
| `js/game.js` | `updateCar` RACING LINE assist | **assist-gated** | inside `if (raceLineAssist !== 0)`; slider def 0 |
| `js/game.js` | `coast` | **broadcast-only** | runs only on `c.finished` cars — driving control is already disconnected. Any future reuse of `coast()` on a live car is a BLOCKER |
| `js/physics/aero-zones.js` | `build` | **surface** | fixed FIA-style activation zones computed once per circuit; gates the driver-INITIATED X-mode button identically for all cars; no steer torque |
| `js/physics/debris-world.js` | `registerFurniture` | **broadcast-only** | apex-kerb cones in the one-way cosmetic Rapier side-world |
| `js/camera/vantage.js` | `vantage` | **broadcast-only** | only heli/side/cinematic broadcast cams; 0 in every driven mode |
| `js/race/quali-model.js` | `lapTime` | **AI-only** | offline lap-time model for the simulated field; a player-driven lap always overrides it |
| `js/physics/brake-cue.js` | `tick` | **assist-gated** | behind the BRAKE CUE slider (notch 1 = OFF); audio/haptic pulse only, no force path. NOTE: ships defaulted ON (notch 6) — sensory-only, but a fresh install does hear a curvature-derived cue |
| `js/game/apex.js` | probe/scan/cinematic/tourShots/corners/obs/trackShape/trackProfile | **broadcast-only** | `__apex` dev/telemetry reads; nothing writes into the driving model |
| `js/game/agentview.js` | state dump, corner table | **broadcast-only** | agent telemetry output |
| `js/track/maps.js` | measureApex/detectDRS/detectCorners | **broadcast-only** | 2D picker/popup/minimap outlines (menus + HUD drawing only) |
| `js/track/mesh.js` | findCorners, bankingProfile, banked-corner pick | **surface** | build-time road-geometry decisions baked into the mesh — road shape itself |
| `js/track/tracks.js` | build LUT bake, signboard side pick | **surface** | the producer itself, plus static scenery placement |
