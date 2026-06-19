# Debug hooks — `window.__apex`

`js/game.js` exposes a `window.__apex` object: a small scripting API for driving
the game from the devtools console or a headless (Playwright) harness. It lets
you jump straight into any circuit, position the car, frame the camera anywhere,
and read telemetry — without clicking through the menus. All of it is debug-only
and safe to call at runtime.

Lap position is given as a **fraction `s` in `[0, 1)`**: `0.0` is the
start/finish line, increasing in the racing direction.

## Quick start

```js
__apex.race("suzuka");      // load Suzuka and start a race (skips the menus)
__apex.park(0.15);          // skip the countdown, clear the field, sit at 15% of the lap
__apex.view({ elevation: 52, azimuth: 30, zoom: 1.15 });  // aerial of the whole track
__apex.view("chase");       // back to the normal chase cam
```

## Reference

### `race(trackRef, timeOfDay?, weather?) → {track, timeOfDay, weather} | false`
Load any circuit and start a normal race, skipping all menus. `trackRef` is a
circuit **id** (`"monza"`) or its index in `Tracks.LIST`. `timeOfDay` is
`"day" | "night" | "default"` (default uses the circuit's own setting);
`weather` is `"dry" | "wet"`. The fastest way for a harness to render any track.

### `info() → {state, track, n, total}`
Snapshot of the current state: `state` is the state-machine value
(`menu｜select｜count｜race｜results｜…`), `track` the loaded circuit id, `n` the
sample count, `total` the lap length in metres. Returns `track: null` if no
circuit is loaded — poll this to know when a track has finished building.

### `park(frac, lateral?) → {s, total} | false`
Jump into **race** state, hide the lights, shove the AI pack 600 m away, and park
the **stationary** player at lap-fraction `frac` (optional `lateral` metres from
the centreline). The clean way to grab a still of a corner or piece of scenery.

### `jump(frac, speed?, lateral?) → {s, total} | false`
Teleport the player to lap-fraction `frac`, optionally setting `speed` (m/s) and
`lateral` offset (m). Unlike `park`, it doesn't change state or move the AI — use
it to reposition mid-race (e.g. to test slope physics on a gradient).

### `go() → state`
Skip the countdown but leave the grid intact, so the whole field races and packs
up normally. For observing pack/AI behaviour rather than a static shot.

### `view(opts) → {eye, target, span} | {mode:"chase"} | false`
Debug **free camera** that overrides the chase cam — instant (no damping),
uncapped FOV, far plane and fog pushed out — for inspecting whole-track layouts
and trackside scenery from any angle. Call with no args (or `"chase"`) to restore
the normal cam.

| Call | Effect |
|---|---|
| `view()` | aerial framing of the **whole track** (from its bounding box) |
| `view({ s, radius })` | focus a point at lap-fraction `s`, framed to `radius` m |
| `view({ azimuth, elevation, zoom, fov, fog })` | aerial/focus framing — `azimuth`/`elevation` in degrees, `zoom` scales distance, `fog` multiplies fog density (default 0.15) |
| `view({ s, side, dist, height, look })` | stand **trackside** at `s` and look outward at the scenery on `side` (`"L"`/`"R"`/`±1`); `look:"in"` faces back at the track |
| `view({ eye:[x,y,z], yaw, pitch, fov })` | **free-look** from a point — `yaw` 0 = −Z, +90 = +X; `pitch` − = down (degrees) |
| `view({ eye:[x,y,z], target:[x,y,z], fov })` | fully explicit |
| `view("chase")` | restore the chase cam |

```js
__apex.view();                                   // whole-track aerial
__apex.view({ elevation: 22, azimuth: 35 });     // low aerial — see the hills/peaks
__apex.view({ s: 0.06, radius: 220, azimuth: 60 }); // inspect Turn 1's scenery
__apex.view({ s: 0.16, side: "L", dist: 18, height: 10 }); // survey left-side scenery
__apex.view({ eye: [0, 40, 0], yaw: 0, pitch: -90 });      // free-look straight down
```

### `corners() → [number, …]`
Lap-fractions of the corner apexes (local maxima of `|curvature|`). Handy for
parking at each corner in turn: `corners().forEach(s => …)`.

### `cars() → [{id, x, xv, yaw, prog, speed, ct, kerb, p}, …]`
Telemetry for every car, leader first: lateral `x` (and smoothed `xv`), visual
`yaw`, arc-`prog`ress, `speed`, in-contact timer `ct`, `kerb` flag, and `p` =
is-player. For measuring pack jitter / side-by-side stability.

### `pair(frac?, speed?) → {a, b}`
Place two AI cars dead-even and slightly overlapping at lap-fraction `frac`
(default 0.3) at `speed` (default 55 m/s); shove everyone else away. Returns the
two car ids — for measuring pure side-by-side jitter without pack chaos.

### `jam(n?) → [ids]`
Pile `n` (default 5) AI cars on top of each other at near-zero speed mid-track,
rest of the field shoved away. Tests stuck-recovery: a healthy AI digs out and
resumes within a couple of seconds.

## Headless usage (Playwright)

```js
await page.goto("http://localhost:3456/");
await page.waitForFunction(() => !!window.__apex);
await page.evaluate(() => window.__apex.race("spa"));
await page.waitForFunction(() => window.__apex.info().track != null);
await page.evaluate(() => window.__apex.park(0.0));
await page.evaluate(() => window.__apex.view({ elevation: 52, azimuth: 30 }));
await page.waitForTimeout(400);              // let a few frames flush
await page.locator("canvas#game").screenshot({ path: "spa-aerial.png" });
```

`race()` is more robust than clicking through the menus and is the recommended
entry point for any screenshot/verification harness.
