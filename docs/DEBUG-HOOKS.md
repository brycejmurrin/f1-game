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

### `info() → {state, track, n, total}`
Snapshot of state: `state` is the state-machine value
(`menu｜select｜count｜race｜results｜…`), `track` the loaded circuit id, `n` the
sample count, `total` the lap length (m). Returns `track: null` if no circuit is
loaded — poll this to know when a track has finished building.

### `go() → state`
Skip the countdown but leave the grid intact, so the whole field races and packs
up normally. For observing pack/AI behaviour rather than a static shot.

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

| Mode | Vantage |
|---|---|
| `chase` | close action cam, just behind and above the car (default) |
| `far` | pulled back & higher — more of the road ahead, for race-craft |
| `cockpit` | driver's-eye onboard; the player car mesh is hidden |
| `hood` | nose/bonnet onboard, looking down the road |

```js
__apex.camera();            // → { mode:"chase", index:0, modes:[chase,far,cockpit,hood] }
__apex.camera("hood");      // → { mode:"hood", index:3 }
__apex.camera(2);           // switch by index → cockpit
```

### `view(opts) → {eye, target, …} | {mode:"chase"} | false`
Debug **free camera** that overrides the chase cam entirely — instant (no
damping), uncapped FOV, far plane and fog pushed out — for inspecting whole-track
layouts and trackside scenery from any angle. Independent of `camera()` (which
selects among the in-game player cams). Call with no args (or `"chase"`) to
restore the normal cam.

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

---

## Telemetry & diagnostics

### `probe() → {x, angle, k, hw, speed, s}`
Player steering telemetry: lateral `x` (m, +right), heading offset `angle`
(rad off the track tangent, +right), local curvature `k` (rad/m, **+ = left**
turn — note this is the raw curvature sign, opposite the steer convention),
half-width `hw` (m), `speed` (m/s), arc position `s` (m).

### `physState() → {s, x, speed, prog, head, vLat, slipDeg, slope, wrongWay, rescueT, lap}`
Richer readout for the world-space / drift model: world `head`ing (rad), lateral
slip velocity `vLat` (m/s) and slip `slipDeg` (°), road pitch `slope`
(+up/−down), `wrongWay` flag, auto-rescue timer `rescueT`, cumulative `prog` (m)
and `lap`.

### `tuning() → {…}`
Live values the steering sliders map to: `tiltOutputScale`, `wheelbase`, `expo`,
`maxSlip`, `speedRef`, `drift`, `roadFollow`, `pace`, `raceLineAssist`,
`maxTilt`, `deadzone`, `tiltSlew`. Each slider movement should move its value
here (and the car's behaviour).

### `cars() → [{id, x, xv, yaw, prog, speed, lap, ct, kerb, p}, …]`
Telemetry for every car, leader first: lateral `x` (and smoothed `xv`), visual
`yaw`, `prog`ress, `speed`, `lap`, in-contact timer `ct`, `kerb` flag, and `p` =
is-player. For measuring pack jitter / side-by-side stability.

### `corners() → [number, …]`
Lap-fractions of the corner apexes (local maxima of `|curvature|`). Handy for
parking at each corner in turn: `corners().forEach(s => …)`.

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

### `setPhysics(o) → tuning`
Set physics params directly (bypassing the sliders) for A/B tests and on-device
tuning. Any omitted field is left unchanged; returns the new `tuning()`.

| Field | Meaning |
|---|---|
| `drift` | lateral-slip injection (SLIDE; 0 = on-rails) |
| `roadFollow` | passive road-curvature tracking (0 = pure world-space, 1 = Frenet-like) |
| `pace` | global speed/accel multiplier for all cars (OVERALL SPEED) |
| `speedRef` | speed-sensitive steer taper reference (SPEED STEER) |
| `wheelbase` | turn-in snappiness (RESPONSE; shorter = snappier) |
| `expo` | input shaping (LINEARITY) |
| `maxSlip` | max steering/slip angle (STEER LOCK) |

```js
__apex.setPhysics({ drift: 0, roadFollow: 0 });   // on-rails, no auto road-tracking
__apex.setPhysics({ drift: 0.6 });                // slidey
```

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

---

## Misc

### `loadCarModel(url) → Promise<bool>`
Load an optional `.glb` car model at runtime (team meshes rebuild from it, tinted
per livery); resolves `false` and keeps the procedural car on failure.

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
