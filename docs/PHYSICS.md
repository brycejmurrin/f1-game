# Apex 26 — physics

The driving model, the pace discipline, active aero and overtake. Extracted from
`CLAUDE.md`, which keeps the two things that constrain code elsewhere: the
`vTop()`/`vStd()` rule and the "arc must not reach the driver" channel table.

---

Per-axle bicycle model. Key tuning variables in `game.js`: `WHEELBASE`,
`STEER_EXPO`, `STEER_MAX_SLIP`, `STEER_SPEED_REF`, `DRIFT`, `ROAD_FOLLOW`,
`PLAYER_GRIP`, `FRONT_GRIP`, `YAW_DAMP`, `YAW_INERTIA`, `PACE`. Modify via
`__apex.setPhysics(o)` for A/B tests.

**`PACE` is a ground-speed scale, not a speed cap.** The OVERALL SPEED slider
scales the car's real m/s (and the accel curve) — nothing else. Everything else
measured in speed is pace-normalised through two helpers next to `VMAX`:
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
became a `_LO`/`_HI` pair interpolated by it. **A car with no parts — every AI —
sits at the midpoint**, so the grid is one well-defined thing rather than
whatever the catalog default is this month. Measured end to end:

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
runs the SAME `addWingPlanform` emitter the baked wing uses and both read one
table, so they cannot drift apart. Closed = the element's own incidence plus
`Z_BITE`, CLAMPED per element against the measured nose underside (`NOSE_UNDER`)
so nothing ever swings into the bodywork; open = flat. `X_OPEN_RATE` is set by
the FIA's 400 ms transition cap, not by feel. The GARAGE turntable shares the
same draw, so its ACTIVE AERO button shows the real geometry at real angles.

`c.xOn` is the switch and `c.xArmed` whether the car is allowed the mode here at
all. Allowed means **inside an ACTIVATION ZONE**: the FIA approves fixed zones
per circuit and the standard ECU refuses to rotate the wings outside one, so
`buildAeroZones()` scans each built track for contiguous runs under `X_ZONE_K`
and keeps those longer than `X_STRAIGHT_T × X_ZONE_VREF` (210 m — the rule's
three seconds at racing speed). Zones are measured against a FIXED reference
speed, never the car's, because they are a property of the circuit and the
OVERALL SPEED slider must not redraw them. A circuit whose longest straight
misses the minimum gets **no zones and no active aero** — that is MONACO, and
`tests/aero-zones.spec.js` pins it. Zones can WRAP the start line, so
`aeroZones()` exposes `midFrac` and every consumer should use it rather than
averaging `startFrac`/`endFrac`.

Braking or leaving the zone shuts the flap AND drops the switch, and
`X_CLOSE_RATE` is ~4× `X_OPEN_RATE` — the downforce comes back faster than it
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

`otEnabled()` in game.js is the race-wide gate — it reads `ranked[0].lap` (the
LEADER's, because a field-wide switch is what race control throws, and it is
O(1) since `ranked` is already sorted) and `caution.level`. `c.otArmed` folds
that together with the car's own gap and cooldown. The HUD says `NO OVERTAKE`
and fades the button while the gate is shut, because "not armed yet" (keep
closing) and "switched off" (nothing you do will arm it) are different messages.
`tests/aero-zones.spec.js` pins both halves, driving a REAL opening lap —
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
forever. `drivingHelp` and `raceLine` are migrated once via `STEER_SCHEMA` in
`js/game/steer-tuning.js`; bump it if a slider's *meaning* changes again (an old
stored number does not carry over when the scale it was written against moves).
