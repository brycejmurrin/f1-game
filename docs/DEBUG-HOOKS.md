# Debug & test hooks — `window.__apex`

`js/game.js` exposes a `window.__apex` object: a scripting API for driving the
game from the devtools console or a headless (Playwright) harness. It lets you
jump into any circuit, position the car, frame the camera, pump the physics at a
fixed timestep, set up collision/AI scenarios, and read telemetry — without
clicking through the menus. All of it is debug-only and safe to call at runtime.

Lap position is given as a **fraction in `[0, 1)`**: `0.0` is the start/finish
line, increasing in the racing direction. Internally that maps to an arc-length
`s` in metres (`frac * total`). Lateral offset `x` is metres from the centreline,
**`+` = right**, `−` = left. World heading lives in `player.head`; the steering /
slip convention is `+steer → turns right (+x)`.

## Catalog & meta

### `tracks() → [{id, name, i}, …]`
List all loaded circuits in order. `id` matches the `trackRef` accepted by
`race()`. Use this in test loops instead of hardcoding circuit names.

### `teams() → [{id, name, engine, i}, …]`
List all teams. `engine` is the power-unit supplier string used to filter
factory-exclusive parts in the Parts catalog (e.g. `"Mercedes"`, `"Ferrari"`).

---

## Quick start

```js
__apex.race("suzuka");        // load Suzuka and start a race (skips the menus)
__apex.park(0.15);            // skip the countdown, clear the field, sit at 15% of the lap
__apex.view({ elevation: 52, azimuth: 30, zoom: 1.15 });  // aerial of the whole track
__apex.view("chase");         // back to the normal chase cam
__apex.camera("cockpit");     // switch the player cam to the onboard view
```

Pump the deterministic physics loop (for tests):

```js
__apex.jump(0.0, 60, 0);                 // 60 m/s on the start straight
__apex.setInput({ steer: 1, throttle: true });
for (let i = 0; i < 60; i++) __apex.step(1 / 60);   // 1 s of physics
console.log(__apex.physState());
__apex.clearInput();
```

---

## Loading, state & positioning

### `race(trackRef, timeOfDay?, weather?) → {track, timeOfDay, weather} | false`
Load any circuit and start a normal race, skipping all menus. `trackRef` is a
circuit **id** (`"monza"`) or its index in `Tracks.LIST`. `timeOfDay` is
`"day" | "night" | "default"` (default uses the circuit's own setting);
`weather` is `"dry" | "wet"`. The recommended entry point for any harness.

### `tt(trackRef, timeOfDay?) → {track, timeTrial} | false`
Load a circuit and start a **Time Trial** session (solo, no AI, `timeTrial: true`).
Same `trackRef` and `timeOfDay` semantics as `race()`. Use this instead of `race()`
when testing TT-specific behaviour (ghost delta, TT results, sector splits).

### `info() → {state, track, n, total, timeTrial, seasonMode}`
Snapshot of state: `state` is the state-machine value
(`menu｜select｜count｜race｜results｜…`), `track` the loaded circuit id, `n` the
sample count, `total` the lap length (m). `timeTrial` and `seasonMode` reflect the
active game mode. Returns `track: null` if no circuit is loaded — poll this to
know when a track has finished building.

### `go() → state`
Skip the countdown but leave the grid intact, so the whole field races and packs
up normally. For observing pack/AI behaviour rather than a static shot.

### `finishRace() → {state} | false`
Mark all cars finished, call `endRace()`, and show the results screen. Returns
`false` if no race is loaded or the state machine is already in `results` or
`menu`. Useful for testing the podium / standings flow without driving a full lap.

### `park(frac, lateral?) → {s, total} | false`
Enter **race** state, hide the lights, shove the AI pack 600 m away, and park the
**stationary** player at lap-fraction `frac` (optional `lateral` m from centre).
Freezes the scene (`frozen`) for a deterministic screenshot.

### `jump(frac, speed?, lateral?) → {s, total} | false`
Teleport the player to lap-fraction `frac`, optionally setting `speed` (m/s) and
`lateral` (m). Unlike `park`, it doesn't change state or move the AI — use it to
reposition mid-race (e.g. to test slope physics on a gradient). Resets the
world-space pose (`px/pz/head/vLat`) so `probe()` reads correctly immediately.

### `aim(relDeg) → {head} | false`
Point the player `relDeg` degrees off the track tangent (`180` = backwards) for
wrong-way / spin / rescue tests. Position and progress are unchanged.

### `sky(frac, lateral?) → {s, total} | false`
Like `park()`, but tilts the camera toward the horizon so sky/clouds are clearly
visible. Eye 7 m up, target 25 m ahead and 14 m higher (~24° up).

### `snapCam() → void`
Instantly snap the chase camera behind the player (no damping). Call right after
`jump()` so the very next rendered frame is a clean forward-facing view.

---

## Cameras

### `camera(mode?) → {mode, index, modes?} | false`
Get or set the **player camera mode**. Mirrors the in-game CAM button / `C` key.
Called with no argument it returns `{ mode, index, modes }`. Called with a mode
**id**, **label**, or **index** it switches and persists (to `localStorage`),
returning `{ mode, index }`; an unknown mode returns `false`.

| Mode | Label | Vantage |
|---|---|---|
| `chase` | CHASE | Close action cam anchored behind the car at fixed arc-length — car stays a constant readable size at all speeds (default) |
| `far` | FAR | Chase cam pulled further back and higher — more road ahead visible, better for race-craft |
| `cockpit` | COCKPIT | Driver's-eye onboard; the player car mesh is hidden |
| `hood` | HOOD | Nose/bonnet onboard, looking down the road |
| `overhead` | OVERHEAD | Top-down drone, high above and slightly behind — steeply angled to show the car and road ahead |
| `heli` | HELI | Broadcast helicopter: high, behind and off to the side, long-lens telephoto on the car |
| `reverse` | REVERSE | Mounted just ahead of the car looking back down the track — watch who's chasing you |
| `side` | TV SIDE | Panning trackside camera, offset to the outside of the current corner, framing the car against the apex |
| `cinematic` | CINEMATIC | Free-orbit: circles the car continuously on a slow azimuth sweep — shows surroundings from every angle |
| `low` | LOW | Low-angle drama: eye skims the track surface 10 m behind, looking up at the car silhouetted against the sky |
| `tcam` | T-CAM | Broadcast roll-hoop (airbox) camera — narrow telephoto mounted 1.3 m above the car, looking forward |
| `rear` | REAR CAM | Rear-mounted onboard at the car's tail looking back down the track (unlike `reverse` which floats ahead) |

```js
__apex.camera();            // → { mode:"chase", index:0, modes:["chase","far","cockpit","hood","overhead","heli","reverse","side","cinematic","low","tcam","rear"] }
__apex.camera("hood");      // → { mode:"hood", index:3 }
__apex.camera("tcam");      // → { mode:"tcam", index:10 }
__apex.camera(2);           // switch by index → cockpit
```

### `view(opts) → {eye, target, …} | {mode:"chase"} | false`
Debug **free camera** that overrides the chase cam entirely — instant (no
damping), uncapped FOV, far plane and fog pushed out — for inspecting whole-track
layouts and trackside scenery from any angle. Call with no args (or `"chase"`) to
restore the normal cam.

The override is also cleared by `camera(mode)` and `snapCam()` — selecting a game
camera or snapping it leaves the free-cam. So the common sequence
`view({eye,target})` to inspect a spot, then `park(f); camera("chase"); snapCam()`
to grab a driving view, returns to the chase cam as expected (it does not "stick"
on the last free-cam). `camState()`/`viewState()` report which camera is live
(`debug: true` while a `view()` override is active).

| Call | Effect |
|---|---|
| `view()` | aerial framing of the **whole track** (from its bounding box) |
| `view({ s, radius })` | focus a point at lap-fraction `s`, framed to `radius` m |
| `view({ azimuth, elevation, zoom, fov, fog })` | aerial/focus framing — degrees; `zoom` scales distance; `fog` multiplies fog density (default 0.15) |
| `view({ s, side, dist, height, look })` | stand **trackside** at `s`, look outward at the scenery on `side` (`"L"`/`"R"`/`±1`); `look:"in"` faces back at the track |
| `view({ eye:[x,y,z], yaw, pitch, fov })` | **free-look** from a point — `yaw` 0 = −Z, +90 = +X; `pitch` − = down (degrees) |
| `view({ eye:[x,y,z], target:[x,y,z], fov })` | fully explicit |
| `view("chase")` | restore the chase cam |

```js
__apex.view();                                      // whole-track aerial
__apex.view({ elevation: 22, azimuth: 35 });        // low aerial — see the hills
__apex.view({ s: 0.06, radius: 220, azimuth: 60 }); // inspect Turn 1's scenery
__apex.view({ s: 0.16, side: "L", dist: 18, height: 10 }); // survey left-side scenery
__apex.view({ eye: [0, 40, 0], yaw: 0, pitch: -90 });      // free-look straight down
```

### `eyeAt(f, lat?, h?, lookF?, lookLat?, lookH?) → {eye, target}`
Track-relative free-cam placement — no hand-computed world coords. Eye sits at
lap-fraction `f`, `lat` m off the centreline (+right), `h` m up (default 2.5),
looking at lap-fraction `lookF` (default `f+0.01`), `lookLat` off centre, `lookH`
up (default 1). The fast way to inspect roadside geometry — verges, barriers,
berms — at a chosen eye height.
```js
__apex.eyeAt(0.116, 0, 2.5);              // driver's-eye look ahead
__apex.eyeAt(0.116, 0, 2.5, 0.116, 30, 2); // stand on the road, look out at the right barrier
```

### `orbit(f, az?, el?, dist?, h?) → {eye, target}`
Orbit the free-cam around a track point at lap-fraction `f`: `az` degrees around
(0 = from ahead/+s), `el` elevation, `dist` m out, aimed `h` m up. Sweep `az` to
inspect a spot (prop, berm, suspected gap) from every side.
```js
for (const a of [0,45,90,135,180]) { __apex.orbit(0.116, a, 15, 35); /* shot */ }
```

### `groundY(f, lat?) → {x, z, roadY, terrainY, gap}`
Ground/gap probe: the **rendered terrain height** at a track-relative point
(lap-fraction `f`, `lat` m off centre — raycast against the actual carved terrain
mesh), plus the road surface height (`roadY`) and `gap = terrainY − roadY`.
`terrainY` is `null` if no terrain covers the point. Use it to find where the
terrain leaves a prop floating, or dips/rises relative to the road, without
eyeballing — e.g. sweep `lat` across a verge to see the cross-section profile.
```js
[8,12,16,20,24,30].map(l => __apex.groundY(0.11, l).terrainY); // verge height profile
```

---

## Telemetry & diagnostics

### `probe() → {x, angle, k, hw, speed, s}`
Player steering telemetry: lateral `x` (m, +right), heading offset `angle`
(rad off the track tangent, +right), local curvature `k` (rad/m, **+ = left**
turn — note this is the raw curvature sign, opposite the steer convention),
half-width `hw` (m), `speed` (m/s), arc position `s` (m).

### `scan(distAhead) → {s, k, hw, slope} | [...]`
Look-ahead road sampler for closed-loop driving: signed curvature `k` (rad/m,
+right), half-width `hw` and road pitch `slope` at `distAhead` metres in front of
the player. Pass an **array** of distances to get one reading each (e.g. to find
the sharpest corner inside a braking window). Pure read — no state change. This is
the primitive the autopilot harness (`tests/autopilot.spec.js`) steers and brakes
from; combine with `probe()` for a full closed-loop driver:

```js
const p = __apex.probe();
const ahead = __apex.scan([6, 30, 60, 100]);     // curvature at 6/30/60/100 m
const kMax = Math.max(...ahead.map(a => Math.abs(a.k)));
const targetSpeed = Math.sqrt(24 / Math.max(kMax, 1e-4));   // v = sqrt(aLat/|k|)
```

### `physState() → {s, x, speed, prog, head, vLat, slipDeg, slope, wrongWay, rescueT, lap, axEstSm, axFrac, slipFactor}`
Richer readout for the world-space / drift model: world `head`ing (rad), lateral
slip velocity `vLat` (m/s) and slip `slipDeg` (°), road pitch `slope`
(+up/−down), `wrongWay` flag, auto-rescue timer `rescueT`, cumulative `prog` (m)
and `lap`.

Three combined-slip fields expose the traction-circle state in real time:

| Field | Meaning |
|---|---|
| `axEstSm` | Smoothed longitudinal acceleration (m/s²) — positive = accelerating, negative = braking |
| `axFrac` | `axEstSm / LONG_GRIP` clamped to 1 — fraction of the longitudinal grip budget consumed |
| `slipFactor` | `sqrt(1 − axFrac²)` — fraction of lateral grip remaining (1 = none consumed, 0 = all consumed) |

`slipFactor` < 1 means the car is braking or accelerating hard enough to reduce cornering grip. When it approaches 0 the car will wash wide (understeer). Trail-braking — easing off the brake while turning in — lets `slipFactor` rise and rotates the car.

### `tuning() → {wheelbase, expo, maxSlip, speedRef, drift, roadFollow, playerGrip, frontGrip, yawDamp, yawInertia, pace, raceLineAssist, maxTilt, deadzone, tiltCutoff}`
Live values the steering sliders and physics constants currently hold. Each slider
movement should move its corresponding value here (and the car's behaviour).

| Field | Slider / source |
|---|---|
| `wheelbase` | RESPONSE (shorter = snappier) |
| `expo` | LINEARITY |
| `maxSlip` | STEER LOCK |
| `speedRef` | SPEED STEER |
| `drift` | SLIDE |
| `roadFollow` | DRIVING HELP steer-assist gain (internal, not a user slider) |
| `playerGrip` | forgiveness headroom above AI grip (internal) |
| `frontGrip` | front-axle friction bias (understeer safety; internal) |
| `yawDamp` | yaw damping (internal) |
| `yawInertia` | rotational-inertia scale, controls turn-in speed (internal) |
| `pace` | OVERALL SPEED |
| `raceLineAssist` | RACING LINE |
| `maxTilt` | TILT SENSITIVITY (deg for full lock) |
| `deadzone` | tilt dead zone (deg; fixed, not a slider) |
| `tiltCutoff` | STEER SMOOTHING (One-Euro min-cutoff frequency, Hz) |

### `cars() → [{id, x, xv, yaw, prog, speed, lap, ct, kerb, p}, …]`
Telemetry for every car, leader first: lateral `x` (and smoothed `xv`), visual
`yaw`, `prog`ress, `speed`, `lap`, in-contact timer `ct`, `kerb` flag, and `p` =
is-player. For measuring pack jitter / side-by-side stability.

### `carAt(idx?) → {id, isPlayer, team, x, speed, prog, s, lap, finished, finishT, contactT, wrongWay, rescueT} | null`
Detailed telemetry for one car by index (from the `cars()` list). Called with no
argument returns the player car. Returns `null` for an out-of-range index. Extends
`cars()` with fields not worth fetching for the whole field: `team`, `finished`,
`finishT` (finish timestamp), `contactT` (contact timer), `wrongWay`, `rescueT`.

### `camState() → {eye, tgt, fov, debug}`
Raw camera geometry: `eye` `[x,y,z]`, `tgt` `[x,y,z]` (look-at point), `fov`
(degrees), and `debug` (true when a `view()` free-cam is the active camera). The
geometry reflects whichever camera is actually being rendered — the `view()`
free-cam when one is set, otherwise the game camera (chase, cockpit, hood, …).
For the combined scene+camera snapshot, prefer `viewState()`.

### `viewState() → {camMode, camIndex, frozen, dbgCamActive, skyOverride, weather, state, eye, tgt, fov}`
Combined scene snapshot: camera mode, frozen/debug flags, weather, the game
state-machine value, and current camera geometry (`eye`, `tgt`, `fov`). The
single call to check "what is the scene doing right now" before taking a
screenshot — avoids calling `info()`, `camera()`, and `probe()` separately.

### `corners() → [number, …]`
Lap-fractions of the corner apexes (local maxima of `|curvature|`). Handy for
parking at each corner in turn: `corners().forEach(s => …)`.

### `nodeAt(frac) → {k, frac, x, y, z, tx, tz, rx, rz} | null`
World position and orientation of the track node closest to lap-fraction `frac`
(0–1). Returns `null` if no track is loaded. Fields:

| Field | Meaning |
|---|---|
| `k` | Node index |
| `frac` | Actual fraction of the returned node |
| `x, y, z` | World-space centre position (m) |
| `tx, tz` | Track tangent direction (unit vector, XZ components) |
| `rx, rz` | Right-vector (perpendicular to tangent, in XZ plane) |

Useful for geometry tests, self-intersection checks, and building world-space
coordinates from arc-position data:
```js
const n = __apex.nodeAt(0.25);          // node at ~quarter-lap
const worldPt = [n.x + n.rx * 3, n.y, n.z + n.rz * 3];  // 3 m right of centreline
```

### `nodesNear(wx, wz, r) → [{i, frac, x, y, z}]`
All track nodes within radius `r` (m) of the world XZ point `(wx, wz)`. Returns
an empty array if no track is loaded. Each entry includes the node index `i`, its
lap-fraction, and world position `(x, y, z)`.

Useful for auditing self-intersecting track layouts:
```js
// nodes within 4 m of world origin
const near = __apex.nodesNear(0, 0, 4);
console.log(near.map(n => `[${n.i}] ${(n.frac*100).toFixed(1)}% @ (${n.x},${n.z})`));
```

### `wallStats() → {minB, maxB, minOverHw, anyNaN, street, n} | null`
Driving-boundary stats for the current track (both sides, all nodes): tightest
(`minB`) / widest (`maxB`) lateral limit, the closest a barrier sits to the road
edge (`minOverHw`), an `anyNaN` guard, the `street` flag and node count `n`. For
verifying every track keeps the car off the models and is recoverable.

### `maxWallOvershoot() → number | null`
The largest distance any car is currently past its per-side barrier — should stay
~0 across a full race, proving nothing clips through a wall.

### `wsInfo() → {pos, head, s, x} | string`
Console health-check for the world-space migration: live world position, heading
(°), and the recovered `(s, x)`.

### `projTest(frac, lateral) → {s, lat, world, got, err}`
World↔track round-trip check: builds a world point from `(s, lateral)` the way
the renderer does, projects it back with `Tracks.project`, and reports the error.

---

## Physics control (deterministic stepping)

### `setInput(v) → void` · `clearInput() → void`
Override player input. `v = { steer, throttle, brake }` — `steer` in `[−1, 1]`
(+right), `throttle`/`brake` booleans. Held until `clearInput()` restores live
input. Always pair them so later tests aren't affected.

### `step(dt?, n?) → void`
Run `n` (default 1) physics ticks of `dt` (default `1/60`) seconds each. The
deterministic substitute for the rAF loop — drive the whole model from a test.

### `setEnergy(v) → {energy} | false`
Set the player's ERS charge level. `v` is clamped to `[0, 1]`. Returns the new
energy value, or `false` if no race is loaded. Useful for testing ERS-sensitive
physics branches (cornering grip, top-speed boost) and the energy HUD element.

```js
__apex.setEnergy(0);    // empty — no ERS boost
__apex.setEnergy(1);    // full charge
```

### `setLap(n) → {lap} | false`
Override the player's lap counter (integer ≥ 0) without resetting lap time or
sector state. Useful for triggering end-of-race logic (`n = lapsTarget`) and
testing the results screen without driving a full session.

```js
__apex.setLap(5);       // skip to lap 5
```

### `setPhysics(o) → tuning`
Set physics params directly (bypassing the sliders) for A/B tests and on-device
tuning. Any omitted field is left unchanged; returns the new `tuning()`.

| Field | Meaning |
|---|---|
| `drift` | lateral-slip injection (SLIDE; 0 = on-rails) |
| `roadFollow` | passive road-curvature tracking — internal, not exposed as a slider |
| `pace` | global speed/accel multiplier for all cars (OVERALL SPEED) |
| `speedRef` | speed-sensitive steer taper reference (SPEED STEER) |
| `wheelbase` | turn-in snappiness (RESPONSE; shorter = snappier) |
| `expo` | input shaping (LINEARITY) |
| `maxSlip` | max steering/slip angle (STEER LOCK) |
| `playerGrip` | forgiveness headroom above AI grip (internal) |
| `frontGrip` | front-axle friction bias — controls understeer safety (internal) |
| `yawDamp` | yaw damping coefficient (internal) |
| `yawInertia` | rotational-inertia scale — how fast the car yaws (internal) |
| `maxTilt` | tilt sensitivity — degrees of roll for full lock (TILT SENSITIVITY) |
| `deadzone` | tilt dead zone around neutral, degrees |
| `tiltCutoff` | One-Euro filter min-cutoff (Hz) — STEER SMOOTHING slider |

Fields marked "internal" have no slider but are settable via `setPhysics()` for
A/B tests. `maxTilt`/`deadzone`/`tiltCutoff` are routed to the Input module.

```js
__apex.setPhysics({ drift: 0, roadFollow: 0 });   // on-rails, no auto road-tracking
__apex.setPhysics({ drift: 0.6 });                // slidey
```

---

## Autopilot — programmatic driving to test steering settings

`tests/autopilot.spec.js` is a closed-loop driver built entirely on these hooks.
Each tick it reads `probe()` + `scan()`, picks a target speed from the sharpest
upcoming curvature (`v = sqrt(aLat / |k|)`), and steers pure-pursuit toward the
centreline (aiming at where the centreline reaches `L` m ahead). `runLap()` drives
until the car completes a lap (or stalls / times out) and returns metrics:

```js
{ completed, lapTime, distPct, avgSpeed, minSpeed,
  offFrames,        // ticks spent past the road edge (line-holding quality)
  maxOverHw,        // worst excursion past the edge (m)
  maxWall,          // worst barrier overshoot (should be ~0)
  finite }
```

**Purpose: tuning the steering defaults players get.** Run a grid of `setPhysics()`
patches, score each lap, and rank them. The headline use is the **tilt tuner**: it
drives lap after lap *via tilt* while sweeping the tilt sliders and recommends what
to set in Advanced Steering. Run each candidate **on a fresh page** so laps don't
inherit one another's end state.

```
=== TILT slider tuning ranked (monza, driven via tilt) ===
 1051  sens36 slew6   off  34  ✓   matches the shipped default
  883  sens46 ...     off 219  ✓   too dull → can't reach full lock, understeers
   65  sens28 ...     off   0  ✗   too sensitive → twitchy, fails at T1
>>> RECOMMENDED: TILT RANGE 36°, DEAD ZONE 2.5°, STEER SMOOTHING slew 6
```

The tuner independently lands on the shipped sensitivity/dead-zone defaults
(36° / 2.4°), validating them; smoothing it judges only once **hand tremor** is
modelled (below).

### Emulated tilt — `__apex.tiltSim`
The autopilot drives **through the real tilt pipeline** so tilt settings are
tunable headless. In tilt mode the "human" rolls the phone proportional to intent
(a fixed gesture range) **plus hand tremor**, and the game's pipeline (One-Euro
filter → dead zone → `MAX_TILT` map → slew limiter) turns that roll back into the
actual steer:

```js
__apex.tiltSim.reset();                       // clear filter/slew state per run
const steer = __apex.tiltSim.step(rollDeg, dt);   // roll (deg) → filtered steer (-1..1)
__apex.tiltSim.steerToAngle(cmd);             // inverse map (steer → tilt deg), if needed
```

Modelling tremor matters: without it the "human" is a perfect controller that
always prefers zero smoothing; with it, smoothing becomes a real trade-off
(filter jitter vs add lag), so the recommendation is meaningful for real players.
Set tilt params with `setPhysics({ maxTilt, deadzone, tiltCutoff })`, the pause-menu
sliders, or `Input.setTilt*`. `runLap(page, settings, { mode: "tilt" })` drives a
whole lap this way; `opts.tremorDeg` controls the tremor amplitude.

Run it: `npx playwright test tests/autopilot.spec.js` (or against a separate
server with `--config playwright.alt.config.js`, see below).

---

## Scene control

### `freeze(v?) → boolean`
Get or set the `frozen` flag. `park()` sets `frozen` automatically; this exposes
it so tests can unfreeze after a `park()` call without reloading the track. Called
with no argument it returns the current state; called with a boolean it sets the
flag and returns the new value.

### `hud(show?) → boolean`
Get or set HUD visibility. Called with no argument returns whether the HUD is
currently visible. Called with a boolean shows (`true`) or hides (`false`) the
HUD overlay and returns the new state.

### `weather(w?) → "dry" | "wet"`
Get or set race weather. Called with no argument returns `"dry"` or `"wet"`.
Setting `"wet"` starts rain audio and changes the road/sky state; `"dry"` stops
it. The change takes effect immediately without reloading the track.

### `resetPlayer() → physState | false`
Force-rescue the player immediately — same mechanism as the 3-second auto-rescue
(repositions on the centreline at the nearest safe point). Returns the updated
`physState()` so a test can confirm the car was repositioned. Returns `false` if
no race is active.

---

## Scenario setup (collision / AI tests)

### `rival(dProg, dx) → {rival} | false`
Place ONE AI relative to the player: `dProg` m ahead(+)/behind(−), `dx` m
right(+), matched to the player's speed. Other AI are shoved away.

### `rivals(list) → [ids]`
Place several AI: `list = [{ dProg, dx, speed }]`. Unused AI are shoved away.

### `pair(frac?, speed?) → {a, b}`
Place two AI dead-even and slightly overlapping at `frac` (default 0.3) and
`speed` (default 55) — for measuring pure side-by-side jitter without pack chaos.

### `jam(n?) → [ids]`
Pile `n` (default 5) AI on top of each other at near-zero speed mid-track. Tests
stuck-recovery: a healthy AI digs out and resumes within a couple of seconds.

### `aiPlace(idx, frac, speed?, x?) → {id, frac, speed, x} | false`
Teleport an AI car (by its `cars()` index) to lap-fraction `frac`, optionally
setting `speed` (m/s) and `x` (lateral m). Cannot move the player car — use
`jump()` for that. Resets lateral velocity and yaw-rate, aligns heading with the
track tangent, and returns the car's new state.

```js
// put car #3 at 60% of the lap at 50 m/s, 2 m right
__apex.aiPlace(3, 0.6, 50, 2);
```

---

## Timing & field

### `timing() → {raceT, lapTime, best, lastLap, lap, pos, total, gapAhead, gapBehind, energy, gear, sector, sectorElapsed} | null`
Compact race-clock + ERS snapshot in one call. Returns `null` if no race is
loaded.

| Field | Description |
|---|---|
| `raceT` | Elapsed race time (s) |
| `lapTime` | Time in current lap (s) |
| `best` | Personal-best lap time (s), or `null` before the first completed lap |
| `lastLap` | Time of the most recently completed lap (s), or `null` |
| `lap` | Current lap count |
| `pos, total` | Race position and total cars |
| `gapAhead, gapBehind` | Progress gap (m) to nearest rival ahead/behind |
| `energy` | ERS charge 0–1 |
| `gear` | Current gear 1–8 |
| `sector` | Active sector (1, 2, or 3) |
| `sectorElapsed` | Seconds spent in the current sector so far |

### `sectorState() → {idx, elapsed, bests, last} | null`
Live S1/S2/S3 timing. `idx` = current sector (0–2). `elapsed` = seconds into it.
`bests[i]` = personal-best for sector i (`null` until a lap is completed).
`last[i]` = sector i time from the most recently completed lap.

```js
const s = __apex.sectorState();
// → { idx: 1, elapsed: 12.34, bests: [28.1, null, null], last: [28.4, null, null] }
```

### `lapHistory() → {mode, laps, best, lastLap} | null`
Completed-lap history for the current session. `mode` is `"tt"` or `"race"`.
In TT mode, `laps` is a full `[{lap, time}, …]` array (all laps this session).
In race mode, `laps` is `[]` — only `best` and `lastLap` are available.

```js
const h = __apex.lapHistory();
// TT:   { mode:"tt", laps:[{lap:1,time:84.2},{lap:2,time:82.9}], best:82.9, lastLap:82.9 }
// Race: { mode:"race", laps:[], best:83.1, lastLap:83.5 }
```

### `fieldState() → [{pos, id, name, code, team, isPlayer, lap, frac, speed, gap, finished, finishT}, …] | null`
Full field snapshot sorted by race position (leader first). `gap` is the
arc-progress distance (m) behind the leader.

```js
const field = __apex.fieldState();
field.slice(0, 3).forEach(c =>
  console.log(`P${c.pos} ${c.code} gap ${c.gap.toFixed(0)}m`)
);
```

### `trackProfile(n?) → [{frac, y, k, hw, slope}, …] | null`
Sample the circuit at `n` evenly-spaced points (default 100, max 1 000). Returns
an array of track cross-sections — elevation `y` (m), curvature `k` (rad/m),
half-width `hw` (m), road pitch `slope` (+up/−down) — useful for elevation
visualisation and offline curvature analysis.

```js
// elevation profile as CSV
const pts = __apex.trackProfile(360);
console.log(pts.map(p => `${(p.frac*100).toFixed(2)},${p.y.toFixed(1)}`).join("\n"));

// highest and lowest points on track
const maxY = Math.max(...pts.map(p => p.y));
const minY = Math.min(...pts.map(p => p.y));
```

---

## Misc

### `loadCarModel(url) → Promise<bool>`
Load an optional `.glb` car model at runtime (team meshes rebuild from it, tinted
per livery); resolves `false` and keeps the procedural car on failure.

### `meshToggle(o) → overrides`
Hide or show individual track meshes by name. `o` is an object of `{meshName:
bool}` — `false` hides the mesh, `true` restores it. Keys are additive; omitted
keys are unchanged. Returns the full current override map.

```js
__apex.meshToggle({ props: false });       // hide track props (cones, barriers)
__apex.meshToggle({ road: false });        // hide the road surface
__apex.clearMeshes();                      // restore all meshes
```

### `clearMeshes() → {}`
Reset all `meshToggle()` overrides, restoring every mesh to its default visibility
state. Companion to `meshToggle()` — call this between tests so toggled meshes
don't bleed into later screenshots.

---

## Headless / RL control loop

For reinforcement-learning, autopilot testing, or any high-throughput physics
simulation, the RL API lets you step physics at uncapped speed (skipping the
WebGL render pass entirely) and receive a rich observation in a single
cross-boundary call.

### `headless(on?) → boolean`
Get or set headless mode. When `true`, `render()` returns immediately — physics
can be stepped via `act()` at far above 60 fps without GPU overhead. Called with
no argument returns the current state.

```js
__apex.headless(true);   // skip render — physics-only loop
__apex.headless(false);  // restore normal rendering
```

### `obs() → observation | null`
Full debug observation of the current game state — superset of `physState()` and
`probe()` with track context, barrier clearances, lookahead scan, and rival
proximity. Returns `null` if no track is loaded.

| Field(s) | Description |
|---|---|
| `s, x, prog, lap, raceT` | Position, progress (m cumulative), lap count, race clock |
| `speed, speedKph, head, vLat` | Motion: speed (m/s), heading (rad), lateral velocity |
| `axEstSm, axFrac, slipFactor, slipDeg` | Combined-slip state (see `physState()`) |
| `k, hw, slope, gripMult, weather` | Track context at player: curvature, half-width, road pitch, grip multiplier |
| `wallR, wallL, clearR, clearL` | Signed barrier distances and clearances to each side (m) |
| `energy` | ERS charge level 0–1 |
| `gear` | Current gear (1–8) |
| `wrongWay, offT, rescueT, done` | Episode flags: `done = wrongWay ∥ rescueT > 8` |
| `input` | Currently applied override input (null fields = live device input) |
| `posInField, gapAhead, gapBehind` | Race position and gap to nearest rivals (m) |
| `scan` | Lookahead at [10, 30, 60] m: `{d, k, hw, wallR, wallL, width}` |
| `reward` | Pre-composed reward components: `speed`, `offTrack`, `wallDist`, `wrongWay` |

### `act(input, dt?, n?) → observation | null`
Set input, step `n` (default 1) physics ticks of `dt` (default `1/60`) seconds
each, then return `obs()`. Single round-trip replaces three separate
`page.evaluate()` calls in a control loop.

`input = { steer: -1..1, throttle: bool, brake: bool }` — pass `null` to keep the
current input. Returns `null` if no track is loaded.

### `reset(frac, speed?, x?) → observation | false`
Fast episode reset reusing the already-loaded track. Reinitialises the car grid,
positions the player at lap-fraction `frac` (0–1) with optional `speed` (m/s) and
lateral offset `x` (m), sets `state = "race"` and `raceT = 0` — all without
reloading assets. Returns the initial `obs()`, or `false` if no track is loaded.

Call `race()` first to load the desired circuit, then call `reset()` at the start
of each episode instead of reloading:

```js
// one-time setup
await page.evaluate(() => window.__apex.race("monza"));
await page.waitForFunction(() => window.__apex.info().track != null);

// per-episode: fast reset, no page reload
const obs = await page.evaluate(() => {
  window.__apex.headless(true);
  return window.__apex.reset(0.1, 30, 0);   // start at 10% lap, 30 m/s
});

// control loop: 1 evaluate() per decision step
while (!obs.done) {
  const next = await page.evaluate((steer) =>
    window.__apex.act({ steer, throttle: true, brake: false }, 1/60, 5),
    chooseSteer(obs)
  );
  obs = next;
}
```

---

## Headless usage (Playwright)

```js
await page.goto("http://localhost:3456/");
await page.waitForFunction(() => !!window.__apex);
await page.evaluate(() => window.__apex.race("spa"));
await page.waitForFunction(() => window.__apex.info().track != null);

// deterministic physics run
const out = await page.evaluate(() => {
  window.__apex.jump(0.0, 60, 0);
  window.__apex.setInput({ steer: 1, throttle: true });
  let maxX = 0;
  for (let i = 0; i < 90; i++) { window.__apex.step(1 / 60); maxX = Math.max(maxX, Math.abs(window.__apex.probe().x)); }
  window.__apex.clearInput();
  return { maxX, ...window.__apex.physState() };
});

// screenshot of a corner from a chosen camera
await page.evaluate(() => { window.__apex.park(0.06); window.__apex.view({ s: 0.06, radius: 220 }); });
await page.waitForTimeout(400);             // let a few frames flush
await page.locator("canvas#game").screenshot({ path: "t1.png" });
```

`race()` is more robust than clicking through the menus and is the recommended
entry point for any screenshot/verification harness.
