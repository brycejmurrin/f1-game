# Debug & test hooks — `window.__apex`

`js/game/apex.js` (`ApexApi`, instantiated by `js/game.js` with the `G` ctx
façade) exposes a `window.__apex` object: a scripting API for driving the
game from the devtools console or a headless (Playwright) harness. It lets you
jump into any circuit, position the car, frame the camera, pump the physics at a
fixed timestep, set up collision/AI scenarios, and read telemetry — without
clicking through the menus. All of it is debug-only and safe to call at runtime.

Lap position is given as a **fraction in `[0, 1)`**: `0.0` is the start/finish
line, increasing in the racing direction. Internally that maps to an arc-length
`s` in metres (`frac * total`). Lateral offset `x` is metres from the centreline,
**`+` = right**, `−` = left. World heading lives in `player.head`; the steering /
slip convention is `+steer → turns right (+x)`.

> **Driving this as an LLM agent?** Skip to
> [Agent world view](#agent-world-view). The ~182 hooks below are a dev console —
> one narrow question each, `false`/`null` on failure. The agent layer composes
> them into one egocentric snapshot per decision, renders the view as text
> instead of a screenshot, and never returns `null`. Start with
> `__apex.agentHelp()` or `node tools/agent.mjs help`.

**Prefer these hooks for test assertions.** They give deterministic,
geometry-/physics-grounded checks that don't drift when art or tuning changes:
`step()`+`physState()`/`probe()` and the `obs()`/`act()`/`reset()` headless loop
for behaviour; `groundY()` / `Tracks.terrainY()` for exact rendered-terrain
geometry; `eyeAt()`/`orbit()`/`view()` for reproducible camera framing. Assert
*behaviour and relative/geometric facts* ("tarmac faster than grass", "no terrain
above the racing line", "heading barely changes off-track") rather than brittle
absolute magnitudes, which go stale as physics is retuned. The older
`tests/manual/blank-scan.spec.js` (PNG byte-size) and `tracks-visual.spec.js`
(per-circuit pixel-diff) specs are coarser rendering heuristics — keep them, but
write new checks against hooks. Read `__apex.logs({ns})` rather than scraping
console text: a scraped message ties the spec to its exact wording and misses
anything below the print threshold.

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
circuit **id** (`"monza"`) or its index in `Tracks.LIST`. `timeOfDay` is stored
raw (an unknown string only becomes `"default"` when `setTimeOfDay()` later
coerces it), and accepts any of
`"dawn" | "day" | "dusk" | "night" | "default"` (default uses the circuit's own
setting); `weather` is `"dry" | "wet" | "rain" | "overcast" | "fog"` (`"wet"` =
damp road no rain; `"rain"` = wet road + falling rain). The recommended entry
point for any harness.

### `tt(trackRef, timeOfDay?) → {track, timeTrial} | false`
Load a circuit and start a **Time Trial** session (solo, no AI, `timeTrial: true`).
Same `trackRef` and `timeOfDay` semantics as `race()`. Use this instead of `race()`
when testing TT-specific behaviour (ghost delta, TT results, sector splits).

### `info() → {state, track, n, total, timeTrial, seasonMode, raceQuali, lapsTarget, sectors, turns}`
Snapshot of state: `state` is the state-machine value
(`menu｜count｜race｜results`), `track` the loaded circuit id, `n` the
sample count, `total` the lap length (m). `timeTrial` and `seasonMode` reflect the
active game mode. `sectors` is `[s1End, s2End]` racing-lap fractions from
`CircuitMarkings` (or `null`); `turns` is the curated FIA turn count (or `null`).
Returns `track: null` if no circuit is loaded — poll this to know when a track
has finished building.

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
visible. Eye 3.5 m up, target 20 m ahead and 34 m higher (~58° up) so the horizon
drops to the lower third and the frame fills with sky.

### `snapCam() → void`  — **call this after `jump()`/`park()`, before the screenshot**
Instantly snap the **player camera mode** (chase, cockpit, …) to its vantage (no
damping) — every mode, not just chase. Call right after `jump()`/`park()` so the
very next rendered frame is clean.

**Skip it and your screenshot is of a camera in transit.** The rig eases toward
its target exponentially, so a `jump()`/`park()` teleport leaves it flying to the
car for a second or more: empty frames, the car out of shot, or scenery from
hundreds of metres back. `camState()` read in that window describes the camera's
current position, not the mode's framing. Waiting longer is not a reliable fix —
`freeze()` can hold the ease. Sanity numbers once snapped: chase eye ≈ 5.8 m from
the car, cockpit ≈ 0.36 m, hood ≈ 0.58 m.

**Do NOT call it after `orbit()`/`view()`/`dolly()`/`eyeAt()`/`roadside()`/
`cinematic()`/`sky()`/`previewCam()`.** Every one of those sets `G.dbgCam`, a
free-cam override; `snapCam()` unconditionally does `G.dbgCam = null` first, so
calling it right after one of them **cancels the positioning you just set** and
silently falls back to whatever the player camera mode was — read the frame back
and it looks plausible (it's a real render, just the wrong one), so this doesn't
error, it just quietly invalidates the shot. MEASURED 2026-08-12: two screenshots
captured with `orbit(0.16,40,20,20); snapCam();` between a "before" and an
"after" `lightTune()` call showed a wide cityscape in one and a close-up car in
the other — not because anything in the scene changed, but because the two calls
landed at different points in the chase-cam's own spring-back after each
`snapCam()` silently discarded the orbit. The fix is to never call `snapCam()`
after a free-cam hook — those hooks already position instantly, no easing to
settle. Only call `snapCam()` when you want the ordinary player camera back
(after `camera(mode)`, or to end a debug-cam session).

Note `park()` places the car on the centreline with heading == the road tangent —
the one pose where every camera rig coincides. It is the right hook for a clean
shot, but it cannot show whether a rig follows the CAR or the ROAD; yaw the car
off the tangent first if that is what you are testing.

---

## Cameras

### `camera(mode?) → {mode, index, modes?} | false`
Get or set the **player camera mode**. Mirrors the in-game CAM button / `C` key.
Called with no argument it returns `{ mode, index, modes }`. Called with a mode
**id**, **label**, or **index** it switches and persists (to `localStorage`),
returning `{ mode, index }`; an unknown mode returns `false`.

| Mode | Label | Vantage |
|---|---|---|
| `chase` | CHASE | Close action cam anchored behind the car at fixed arc-length — car stays a constant readable size at all speeds (default). Aims at the curved centreline ahead, so it looks into the corner |
| `far` | FAR | Chase cam pulled further back and higher — more road ahead visible, better for race-craft |
| `drift` | DRIFT | Action chase that swings to the OUTSIDE of a slide so the car's flank faces camera under oversteer; settles directly behind when gripping |
| `cockpit` | COCKPIT | Driver's-eye onboard; the player car mesh is hidden |
| `hood` | HOOD | Nose/bonnet onboard, looking down the road |
| `overhead` | OVERHEAD | Top-down drone, high above and slightly behind — steeply angled to show the car and road ahead |
| `heli` | HELI | Broadcast helicopter — corner-aware: hovers on the OUTSIDE of the upcoming bend, long-lens telephoto across the apex |
| `reverse` | REVERSE | Mounted just ahead of the car looking back down the track — watch who's chasing you |
| `side` | TV SIDE | Trackside camera on the OUTSIDE of the upcoming corner, framing the car against the apex |
| `cinematic` | CINEMATIC | Outside-of-corner orbit that gently breathes its angle (auto-picks the outside of the bend) — not a full disorienting loop |
| `low` | LOW | Low-angle drama: eye skims the track surface 10 m behind, looking up at the car silhouetted against the sky |
| `tcam` | T-CAM | Broadcast roll-hoop (airbox) camera — narrow telephoto mounted 1.3 m above the car, looking forward |
| `rear` | REAR CAM | Rear-mounted onboard at the car's tail looking back down the track (unlike `reverse` which floats ahead) |

```js
__apex.camera();            // → { mode:"chase", index:0, modes:["chase","far","drift","cockpit","hood","overhead","heli","reverse","side","cinematic","low","tcam","rear"] }
__apex.camera("hood");      // → { mode:"hood", index:4 }
__apex.camera("tcam");      // → { mode:"tcam", index:11 }
__apex.camera(3);           // switch by index → cockpit
```

A camera cut eases in over ~0.35 s (a brief gentle glide); onboard cams
(cockpit/hood/tcam) lock instantly to the car so they never lag into the
bodywork.

### `previewCam(mode, frac, speed, lat) → {eye, target, fov, mode} | false`
Set the debug free-cam to EXACTLY how the in-game camera `mode` would frame the
car at lap-fraction `frac` (`speed` m/s, default 60; `lat` m off centre, default
0) — **without moving the car**. Preview or screenshot any mode's framing anywhere
without driving there. Cleared by `camera()`/`snapCam()` like other debug cams.
```js
__apex.previewCam("drift", 0.21, 65);   // how DRIFT frames the corner at 21%
__apex.previewCam("heli", 0.5);          // HELI's broadcast angle at half-distance
```

### `camTune(mode?, obj?) → {…} | false`
The **CAMERA TUNER**'s per-camera-mode framing offsets (`js/game/cam-tune.js`) —
the camera counterpart of `lightTune()`. Six knobs per mode, all defaulting to
`0` = the framing `js/game/cameras.js` ships:

| knob | unit | effect |
|---|---|---|
| `height` | m | raise/lower the **eye** (aim stays on the car, so raising looks further down) |
| `dist` | m | pull the eye back (+) / push it in (−) along the view axis |
| `side` | m | offset the eye right (+) / left (−) |
| `pitch` | ° | tilt the aim up (+) / down (−) |
| `yaw` | ° | pan the aim right (+) / left (−) |
| `fov` | ° | widen (+) / tighten (−) on top of the mode's own speed-scaled FOV |
| `cornerLead` | 0–1 | **chase/far only** — blend the rig toward the classic road-frame chase so the camera leads/swings INTO corners. 0 = locked behind the car (default); 1 = the old corner-following chase. Purely visual; never touches the car |

Translation knobs move the eye only, then `pitch`/`yaw` rotate the aim about it,
so the car can't fall out of frame. Values are stored **per mode** (a tuned
CHASE never moves HOOD), persist to `localStorage` (`apex26.camTune`), clamp to
the slider range, and are applied inside `vantage()` — so the live camera,
`snapCam()` and `previewCam()` all agree. The eye is still caught by the terrain
ground clamp after tuning.

```js
__apex.camTune();                                  // → {defs:[…], tuned:{chase:{…}}}
__apex.camTune("chase");                           // → {height:0, dist:0, side:0, pitch:0, yaw:0, fov:0}
__apex.camTune("chase", { height: 0.6, dist: 2, fov: -4 });   // apply + persist + re-snap
__apex.camTune("chase", null);                     // reset this camera to shipped framing
```
In-game the same values live behind PAUSE → SETTINGS → **CAMERA TUNER**: a chip
per camera mode (which also switches the live camera) plus a slider per knob,
with RESET CAM / RESET ALL.

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

#### Recipe: a full straight-down top-down of the whole circuit

`view({ azimuth, elevation })` caps `elevation` at **85°** — it never looks
*perfectly* vertical. For a true plan-view map shot, size the altitude from
`trackBounds()` and pass an explicit `eye`/`target` straight down:

```js
// 1. render MUST be running — do NOT enable headless() (it freezes the canvas)
__apex.race("monaco");
__apex.hud(false);                          // optional: clean map, no HUD

// 2. fit the larger span into the vertical FOV (here 60°), plus a margin
const b   = __apex.trackBounds();           // {spanX, spanZ, centerFrac, minX..maxZ}
const cx  = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
const vf  = 60 * Math.PI / 180, aspect = innerWidth / innerHeight;
const altZ = (b.spanZ / 2) / Math.tan(vf / 2);
const altX = (b.spanX / 2) / Math.tan(Math.atan(Math.tan(vf / 2) * aspect));
const alt  = Math.ceil(Math.max(altZ, altX) * 1.18);   // +18% margin

// 3. eye nudged +5 m in Z so the up-vector isn't degenerate (eye exactly over
//    target makes worldUp × back collapse → NaN camera)
__apex.view({ eye: [cx, alt, cz + 5], target: [cx, 0, cz], fov: 60, far: alt * 4, fog: 0 });
```

Three gotchas this avoids, all of which produce a blank/grey frame:
**(a)** headless on → render skipped → stale frame; **(b)** `elevation` capped at
85° so `view({elevation:90})` is never vertical; **(c)** eye placed exactly above
target → degenerate camera basis.

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

**`lat` is measured from the CENTRELINE; a circuit places scenery by `gap`
BEYOND THE ROAD EDGE.** The two spaces differ by the half-width, and nothing
converts for you — so aiming at something you can see in the source needs the
conversion done by hand:

```js
// a prop the circuit placed with anchor(k, side, gap):
const lat = side * (hw + gap);            // hw ≈ def.baseHW, ~7 m on most circuits
// building(k, side, gap, w, …) puts its CENTRE half a width further out again:
const lat = side * (hw + gap + w / 2);
```

Skipping this is how a search for Imola's pit complex — `building(…, -1, 20,
16, …)`, i.e. `lat ≈ -(7 + 20 + 8) = -35` — got hunted for at `lat ±75` across
a dozen screenshots that each showed grass or treetops. `scene().props[].at`
gives world coords for the same thing and is the faster way to aim when the
frame is already built: read `at`, then `view({eye, yaw, pitch})` at it.

### `orbit(f, az?, el?, dist?, h?) → {eye, target}`
Orbit the free-cam around a track point at lap-fraction `f`: `az` degrees around
(0 = from ahead/+s), `el` elevation, `dist` m out, aimed `h` m up. Sweep `az` to
inspect a spot (prop, berm, suspected gap) from every side. A low or negative `el`
gives a ground-skimming angle but the eye is floored just above the road, so it
never sinks under the terrain (which would render the track's underside).
```js
for (const a of [0,45,90,135,180]) { __apex.orbit(0.116, a, 15, 35); /* shot */ }
```

### `dolly(f, fwd?, right?, up?, opts?) → {eye, target} | false`
Track-relative free-cam placed by an **offset from the centreline** at
lap-fraction `f`: `fwd` m along the tangent (negative = behind), `right` m across
(+right of travel), `up` m above the road (default 5). Looks toward `opts.lookF`
(default `f+0.015`) at `opts.lookLat` m off centre and `opts.lookH` m up (default
1.5); `opts.fov` default 58. Like `eyeAt()` but framed in tangent/right metres —
handy for "N m behind and M m beside" broadcast setups.
```js
__apex.dolly(0.22, -25, 18, 4);   // 25 m behind, 18 m right, 4 m up, looking ahead
```

### `tourShots(n?, opts?) → [{frac, az, el, dist, label}, …]`
Returns `n` (default 12) orbit-shot descriptors covering the circuit, each ready
to spread into `orbit()`. `opts.dist` (80), `opts.el` (20), and `opts.azOffset`
(35) tune framing; `opts.atCorners:true` places the shots on detected corner
apexes (sharpest first, replayed in lap order) and frames each from the outside
of the bend. Pure data — no camera change until you call `orbit()`.
```js
for (const s of __apex.tourShots(16)) { __apex.orbit(s.frac, s.az, s.el, s.dist); /* shot */ }
```

### `roadside(f, side?, dist?, h?, opts?) → {eye, target, look} | false`
Free-cam standing **beside** the track at lap-fraction `f`: `dist` m from the
centreline on `side` (+1 = right of travel, −1 = left, default +1), `h` m above
the road (default 2.5). `opts.look` aims the camera — `"fwd"` (default, look
along travel), `"back"` (face oncoming), `"in"` (across the track), `"out"` (into
the scenery). `opts.lookAhead` m ahead/behind for fwd/back (default 30);
`opts.fov` default 58. The framed-shot companion to `eyeAt()`/`dolly()` for
inspecting barriers, verges and grandstands from track level.
```js
__apex.roadside(0.33, -1, 6, 2, { look:"in" }); // 6 m left of the hairpin, look across at the Armco
```

### `cinematic(frac, opts?) → {eye, target, fov, az, k} | false`
Auto **outside-of-corner** camera: reads the local curvature `k` at `frac` and
puts the free-cam on the outside of the bend so the car fills the frame; straight
sections fall back to a three-quarter chase angle. `opts.dist` (60), `opts.el`
(18°), `opts.h` (1.5 m look-at height), `opts.fov` (52), `opts.azOff` (extra
azimuth twist). Returns `orbit()`'s framing plus the chosen `az` and curvature
`k`. (Distinct from the `"cinematic"` **camera mode** in `camera()`.)
```js
__apex.cinematic(0.22, { dist: 80 }); // outside-of-corner framing at 22%
```

### `lightState() → {ambientSky, ambientGround, sunColor, exposure, numLights, meanLampRGB, bakedLights, lampPosts, …}`
Lighting snapshot for the current frame: hemisphere ambient (sky/ground), the
**scene** sun colour (`frameSky.sunColor` may differ — the sky keeps a warm sun
for dusk glow while the scene sun is dimmed at night), tone-map `exposure`, how
many point lights are **active this frame** after the nearest-N cull
(`numLights`), how many are **baked** on the track before cull (`bakedLights`),
and how many mast fixtures the scenery pass registered (`lampPosts`).
**LAMP DENSITY** moves `bakedLights` (and poles on the next track load);
**LAMP COUNT** / AI traffic moves `numLights`. Reading only `numLights` to
check density is a false no-op — with a full grid it sticks near `lampCull`
(def 40) even when density doubles the baked set.

Lamp-slider probes (for Chromium MCP / `tools/cdmcp-lamps-tune.py`):
- `meanLampRGB` — mean RGB of the **culled** `frame.lights` set this frame
  (after `lampTemp` / twilight / `lampLevel` scaling). Warm `lampTemp` raises R/B.
- `bakedLights` — pre-cull bake: `track._lights` when that set is non-empty,
  else `track._alwaysLights` (daytime always-on fixtures — Monaco tunnel).
  Reading only `_lights` reports 0 on a day session that is still lighting
  the tunnel.
- `lampPosts` — mast/lens registry length (`track.lampPosts`).
```js
__apex.race("singapore"); __apex.lightState();
// → { ambientSky:[0.13,0.14,0.20], sunColor:[0.16,0.18,0.26], numLights:28,
//     meanLampRGB:[…], bakedLights:210, lampPosts:200, … }
```

### `lightTune(o?) → {id: value, …}`
Get or set the live **lighting-tuner** values — the same registry (`TUNE_DEFS`)
the pause-menu LIGHTING TUNER panel exposes. No arg: returns `{id: value}` for
every tunable. With an object: merges the given entries (each clamped to its
slider's range), persists to `localStorage` (`apex26.lightTune`), invalidates any
baked light records that depend on them, and returns the updated set. Values are
stored per (track, time-of-day, weather) profile.
```js
__apex.lightTune({ wetness: 0.8 });    // pin road wetness instantly
__apex.lightTune({ wetness: -0.05 });  // back to the weather-driven ramp
```

### `lightCopy(arg?) → {ok, mode, tracks, changed, undo, …}`
The tuner's **COPY ALL**, headless. Takes the profile for the conditions on
screen and writes it into **every other track at the same time-of-day and
weather** — the 39-circuit version of what the panel's two chips do.

| call | what lands on the other tracks |
|---|---|
| `lightCopy()` | this profile's **own overrides only**, merged over each target's — every circuit keeps its shipped character for knobs you never touched |
| `lightCopy("look")` | **every live value**, so they all render identically at that time and weather (this overrides the per-track presets in `js/game/light-presets.js` — that is the point) |
| `lightCopy({undo})` | puts back exactly what a previous call replaced |

Persists in every case. Storage stays sparse either way: a value is written only
where the target would not have resolved there anyway. `{ok:false,
error:"no-edits"}` means nothing is tuned on this condition — move a slider, or
ask for `"look"`; `error:"no-track"` means no circuit is loaded.
```js
__apex.race("bahrain"); __apex.setTimeOfDay("dusk"); __apex.weather("wet");
__apex.lightTune({ ssrWetMul: 1.4 });
const r = __apex.lightCopy();     // → { ok:true, mode:"edits", tracks:39, changed:39, undo:{…} }
__apex.lightCopy({ undo: r.undo });        // …never mind
```

## Baked asset pack

The pack (`assets/pack/`, built by `node tools/assets.mjs`) supplies PBR
**material arrays** — one `TEXTURE_2D_ARRAY` whose *layer index is the `MAT` id*
(`js/track/geom.js`), so every surface in the game can be textured from the
per-vertex material id it already carries. No UV channel exists anywhere on the
lit path and none is needed: the sample reuses the procedural materials' own
triplanar convention. See
[research/ASSET-API-RESEARCH.md](research/ASSET-API-RESEARCH.md).

**The pack ships ON.** The blend knob (`matTexMix`) defaults to `1.0`,
so the pack is fetched at boot and blended by default; `matTex(0)` turns it off.

### `assets() → {supported, pack, uploaded, tier, layers, normal, scales, bytes, models, error}`
State of the pack. `supported:false` means the active renderer has no
texture-array path — true on WGX (WebGPU), which has not ported the procedural
material system either. `pack:false` means no pack is installed. **Both are
normal states** in which the game renders its pure-procedural look; neither is
an error. `scales` is the per-`MAT`-id world tile size in metres (`0` = that
material has no baked layer — `FLAT`, `GLASS` and `FLAG` never do).

### `assetLoad(tier?) → Promise<state>`
Force a (re)load. `"low"`/`"high"` pick the pack variant explicitly instead of
following `gfx.isMobile`; `false` unloads the arrays and frees the GPU memory.

### `matTex(v?) → number`
Get/set the **BAKED MATERIALS** blend — the A/B control for the whole feature,
and the same value as `lightTune({matTexMix})`. `1` is the shipped default
(full baked detail), `0` the pure procedural pre-scan look. Multiplicative, so the per-track tarmac tint
and racing-line wear survive at any setting.
```js
await __apex.assetLoad();      // upload the arrays
__apex.matTex(1);              // full baked materials
__apex.matTex(0);              // back to the pure procedural look
```

### `envProbe(on?) → {on, off, changed, needsReload}`
The clear path for the `apex26.envProbeOff` **latch**. GLX sets that key when the
WebGL context is lost while the page is VISIBLE — the memory-pressure signal, as
opposed to iOS's benign loss on backgrounding — and persisting it is what stops a
lose→reload→lose loop on memory-tight devices.

Nothing could clear it. One `setItem`, one `getItem`, no UI, no hook, no mention
in these docs: a device that lost its context once kept live env-probe
reflections disabled **forever**, and it presents as "reflections are just worse
on my phone" rather than as a setting anybody can find.

`game.js` reads the key once at module init, so a change needs a reload —
reported in `needsReload` rather than done silently.
```js
__apex.envProbe();             // {on:false, off:true, …} → the latch is set
__apex.envProbe(true);         // clear it, then reload
```

### `credits() → [{kind, id, author, licence, source}, …]`
Attribution roll for every baked asset. CC0 imposes no attribution duty, but
every entry must carry a `source` — that is what `node tools/assets.mjs verify`
audits.

### `stats(on?) → bool`
Live overlay: fps, adaptive render **scale + tier**, GPU ms, and the baked-material
blend. The stats.js role, but reading the game's own counters so it works on GLX
(which stats.js cannot attach to) as well as TLX/WGX. No arg toggles. Watch the
scale line — the governor holds fps by dropping resolution, so a soft frame at
60 fps usually means scale < 1.

### `diag(opts?) → object`
One call that snapshots everything worth having in a bug report — build, UA,
device pixel ratio, **GPU vendor/renderer** (real silicon vs SwiftShader),
backend, HDR/MSAA/render scale, plus `info`, `assets`, `lightTune`,
`lightState`, `viewState`, `physState`, `timing`, `gpuTimer` and collected
errors — and downloads it as `apex-diag.json`. `diag({download:false})` logs
without downloading. See [CONSOLE-RECIPES.md](CONSOLE-RECIPES.md).

For a rendering complaint from a device you cannot reach, four keys carry most
of the answer:

| Key | Reads |
|---|---|
| `canvas` | CSS size vs backing-store size vs DPR. A backing store far below `css × dpr` **is** the blur, whatever else is true |
| `perf` | PerfGov's `scale`/`fps`/`auto` and `tier`/`tierFloor`/`crashStrikes`. `tierFloor > 0` means features are withheld **on purpose** because this device crashed before — a shed feature, not a renderer fault |
| `glCaps` | `colorFloat`/`colorHalf` (absent sheds the HDR post chain), `maxFragUnif`, and `lost` — a lost context explains a black screen that reads like a shader bug |
| `stored` | the `apex26.*` overrides on that device: `lightTune`, `camTune`, `gfxBackend`, `debris`, `gfxHigh`, `resMode`, `forceMobileTier`, `envProbeOff`. Any of these beats every shipped default and lives only there, which is the exact shape of a bug that reproduces for one person and nobody else |

### `save(data, filename) → bytes`
Hand a file out of the browser. Objects are JSON-stringified; strings and Blobs
pass through. This is the reliable way to get state out of a real device —
`copy()` only resolves at top-level console scope and the clipboard API needs
document focus.

### `gpuTimer(on?) → {supported, on, ms, software}`
Opt-in GPU frame timer (`EXT_disjoint_timer_query_webgl2`). `gpuTimer(true)`
starts timing, `gpuTimer(false)` stops, `gpuTimer()` reads the latest sample.
`ms` is the GPU-side cost of a recent frame (`-1` until a result lands, a few
frames after enabling, or when unsupported). `software` is `ms < 0`: no sample
yet, the extension is absent, or the backend is a software rasterizer
(SwiftShader / Lavapipe). Do not treat a negative `ms` as a GPU millisecond —
on a real device after a few timed frames `software` goes false and `ms` is the
sample. This is the GPU-side counterpart to the `perf-profile` CPU flame chart —
use it to tell whether a spike is GPU-bound (fill/fragment) or CPU-bound before
optimising. **Chrome/Android only**: the extension is absent on iOS Safari
(`supported:false`) and yields garbage under SwiftShader (CI), where
GPU_DISJOINT stays set and readings stay at `-1` (`software:true`).
```js
__apex.race("vegas"); __apex.gpuTimer(true);
// drive a few frames on a busy night circuit, then:
__apex.gpuTimer();   // → { supported:true, on:true, ms:6.2, software:false }
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

### `persistState() → {ok, broken, keys, rev, foreign}`
Is `localStorage` actually storing anything? `ok:false` means a read or write has
thrown, and `broken` names the exception (`"QuotaExceededError"`,
`"SecurityError"`); `keys` is how many are cached and `rev` the write counter.
`foreign` counts cross-tab invalidations applied — a non-zero value means ANOTHER
tab of this origin has written `apex26.*` keys during this session, which is the
one condition under which a save can be overwritten from outside.

This needs a hook of its own because **the failure is otherwise invisible from
inside the session**. `js/game/store.js` caches every value it writes, so when
the write throws the cache still answers every later read with the right value —
the game plays perfectly and only a reload reveals that nothing was ever saved.
Safari on iOS puts the quota at **zero** in Private Browsing, which is the case
that actually loses a player's career.

A second tab is the other way a save disappears, and it used to be silent for
the same reason: `_cache` is filled on first read and was never invalidated, so a
tab that had read `career` answered from memory forever and wrote its stale copy
back over the other tab's. `store` now listens for `storage` (which fires only
for writes made by OTHER documents of this origin), drops the named key so the
next read goes to disk, bumps `rev`, and counts the event in `foreign`. One
honest limit: `js/game/career.js` holds its live career as module state and
`save()` writes THAT object, not a fresh `store.get()` — so an active career
session can still clobber another tab's finished season; the invalidation
protects everything read through `store.get()` per use (settings, slots,
boards, tuner profiles), not the in-play career object itself.

The cache write on failure is deliberate, not a bug: dropping the value would
break the session as well as the save. What this reports is that the save is
gone, which is the part nothing used to say. `js/game/store.js` also sends one
loud `Log.warn` on the first failure and every repeat to the ring buffer only,
so `__apex.logs({ns:"game"})` has the history without the console being buried.

```js
__apex.persistState()   // { ok: true, broken: null, keys: 34, rev: 12, foreign: 0 }
```

### `logLevel(spec?, persist?) → {console, buffer, consoleNs, bufferNs}`
Read or move the two `Log` thresholds (see **Logging** in `AGENTS.md`). They are
independent on purpose: the **console** level decides what a human sees (default
`warn`), the **buffer** level decides what is RETAINED in the 500-entry ring
(default `info`) and read back with `logs()`. Retention can therefore exceed what
prints, so a failure that has already happened still has a record.

No argument reads the resolved state. A spec string applies it. `persist` writes
it to `localStorage` so it survives the reload — the shape to hand a player who
is reproducing something.

```js
__apex.logLevel()                   // resolved thresholds
__apex.logLevel("scenery:debug")    // one namespace up
__apex.logLevel("buffer:debug")     // retain more without printing more
__apex.logLevel("debug", true)      // …and remember it across reloads
__apex.logLevel(null, true)         // forget it
```

Raising the console level always raises retention with it — the ring can never
hold less than what printed. Also settable by `?log=scenery:debug` on the URL, by
`apex26.logLevel` in localStorage, and by `APEX_LOG=<spec>` for a whole test run.

### `probe() → {x, angle, k, hw, speed, s}`
Player steering telemetry: lateral `x` (m, +right), heading offset `angle`
(rad off the track tangent, +right), local curvature `k` (rad/m, **+ = left**
turn — note this is the raw curvature sign, opposite the steer convention),
half-width `hw` (m), `speed` (m/s), arc position `s` (m).

### `scan(distAhead) → {s, k, hw, slope} | [...]`
Look-ahead road sampler for closed-loop driving: signed curvature `k` (rad/m,
**+ = left** turn, same raw sign as `probe()`), half-width `hw` and road pitch `slope` at `distAhead` metres in front of
the player. Pass an **array** of distances to get one reading each (e.g. to find
the sharpest corner inside a braking window). Pure read — no state change. This is
the primitive the autopilot harness (`tests/specs/autopilot.spec.js`) steers and brakes
from; combine with `probe()` for a full closed-loop driver:

```js
const p = __apex.probe();
const ahead = __apex.scan([6, 30, 60, 100]);     // curvature at 6/30/60/100 m
const kMax = Math.max(...ahead.map(a => Math.abs(a.k)));
const targetSpeed = Math.sqrt(24 / Math.max(kMax, 1e-4));   // v = sqrt(aLat/|k|)
```

### `physState() → {s, x, px, pz, speed, prog, head, vLat, yawRate, slipDeg, slope, wrongWay, rescueT, lap, axEstSm, axFrac, slipFactor}`
Richer readout for the world-space / drift model: world `head`ing (rad), lateral
slip velocity `vLat` (m/s), yaw rate `yawRate` (rad/s) and slip `slipDeg` (°),
road pitch `slope` (+up/−down), `wrongWay` flag, auto-rescue timer `rescueT`,
cumulative `prog` (m) and `lap`.

`vLat` and `yawRate` are the pair every hook that perturbs the car writes
together — `spin()` and `nudge()` both set or zero them — so reading one back
without the other left assertions able to cover only half of what a hook did.

Three combined-slip fields expose the traction-circle state in real time:

| Field | Meaning |
|---|---|
| `axEstSm` | Smoothed longitudinal acceleration (m/s²) — positive = accelerating, negative = braking |
| `axFrac` | `|axEstSm| / (LONG_GRIP × gripMult)` clamped to 1 — fraction of the longitudinal grip budget consumed |
| `slipFactor` | `sqrt(1 − axFrac²)` — fraction of lateral grip remaining (1 = none consumed, 0 = all consumed) |

`slipFactor` < 1 means the car is braking or accelerating hard enough to reduce cornering grip. When it approaches 0 the car will wash wide (understeer). Trail-braking — easing off the brake while turning in — lets `slipFactor` rise and rotates the car.

Six more expose the ACTIVE AERO trade, which is otherwise applied deep inside
`updateCar` and readable nowhere:

| Field | Meaning |
|---|---|
| `aeroX` | flap TRAVEL, 0 (shut) → 1 (open). What the physics reads |
| `vmaxNow` | this car's top-speed ceiling INCLUDING the X-mode gain |
| `aeroGrip` | the aero-load grip term at the current speed — `1 + DOWNFORCE × aeroDf × (v/vTop)²` |
| `aeroDf` | the downforce multiplier alone: 1 shut, `1 − xDfLoss` fully open |
| `aeroLoad` | HOW MUCH WING this car carries, 0..1 (`Parts.aeroLoad`) — 0 = `minimal`, 1 = `ground_effect`; AI uses the works FACTORY_PRESETS load, 0.5 only if unset |
| `xVmaxGain` / `xDfLoss` | the two halves of the trade for THIS car, interpolated by `aeroLoad` |

Six more cover the ERS part's grip on the battery and the overtake window:

| Field | Meaning |
|---|---|
| `ersDeploy` / `ersRegen` | the ERS option's two axes, 0..1 (`Parts.ersProfile`); 0.5 for a car with no parts |
| `drain` | energy/s while boosting — LOWER with better deployment, so the press lasts longer |
| `regen` | energy/s recovered — higher with better recovery |
| `otTime` / `otCool` | the overtake push and its lockout, both scaled by deployment |

Measured end to end: boost lasts 3.8 s on `harvest` and 7.1 s on `overcharge`;
recharge runs 5.4 s down to 4.0 s. Note BOOST is a TOGGLE — `setBoost(true)`,
not `setInput({boost:true})`, which is silently ignored. And do not measure boost
duration by running the battery flat: the car reaches a corner, and below half
`vmax` the throttle branch REGENERATES while boost drains, so energy asymptotes
and never empties. Measure the drop over one second at speed.

The trade is not one pair of constants: a big wing has more drag to shed and
more downforce to lose, so both halves scale with the aero part (+5.5 % → +15.5 %
of top speed, 42 % → 78 % of the aero load). Do not assert a literal against
`vmaxNow` ratios — read `xVmaxGain` and compare against that, or the assertion
breaks the moment the car changes wing.

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
| `pace` | OVERALL SPEED — ground-speed scale (see the note under `setPhysics`) |
| `raceLineAssist` | RACING LINE |
| `maxTilt` | TILT SENSITIVITY (deg for full lock) |
| `deadzone` | tilt dead zone (deg; fixed, not a slider) |
| `tiltCutoff` | STEER SMOOTHING (One-Euro min-cutoff frequency, Hz) |

### `cars() → [{id, x, xv, yaw, prog, speed, lap, ct, kerb, p}, …]`
Telemetry for every car, leader first: lateral `x` (and smoothed `xv`), visual
`yaw`, `prog`ress, `speed`, `lap`, in-contact timer `ct`, `kerb` flag, and `p` =
is-player. For measuring pack jitter / side-by-side stability.

### `carAt(idx?) → {id, driverId, isPlayer, team, x, speed, prog, s, lap, finished, finishT, contactT, wrongWay, rescueT, otArmed, otEnabled, xArmed, …} | null`
Detailed telemetry for one car by index (from the `cars()` list). Called with no
argument returns **the player** — note that `carAt(0)` is `cars[0]`, which is an
AI car, so a probe that means "me" must pass no argument. Returns `null` for an
out-of-range index. Extends `cars()` with fields not worth fetching for the whole
field: `team`, `finished`, `finishT` (finish timestamp), `contactT` (contact
timer), `wrongWay`, `rescueT`.

OVERTAKE fields, alongside the aero ones:

| Field | Meaning |
|---|---|
| `otEnabled` | the RACE-WIDE gate, identical for every car: false on the opening lap (until the LEADER starts lap 2) and false under any caution |
| `otArmed` | that gate AND this car's own gap (<1 s) and cooldown — i.e. can it actually be fired now |
| `otT` | seconds of push remaining, 0 when not deployed |
| `otCool` | seconds until it can arm again |

### `camState() → {eye, tgt, fov, roll, debug}`
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

### `garageCam() → {on, spin, az, el, dist, pan, xOn, aeroX}`
The GARAGE (`#carsetup`) preview camera — **read-only**. `on` is false whenever
the garage is closed (the rest is then just the parked state). `spin` is the
auto-turntable toggle; `az`/`el` are radians (az 0 = ahead of the nose, PI =
behind the wing; el 0 = level, ~1.2 = overhead) and `dist` is the orbit radius in
metres. The camera is driven by the `#cs-view` chips (`[data-cs-view]`, `hero` |
`front` | `side` | `rear` | `top`), the two wing framings in `#cs-wing-views`
(`wingFront` | `wingRear`), a drag on the canvas, the wheel/pinch, or the `+`/`−`
chips — this hook is how tests observe the result without going anywhere near
rendered pixels. All of those chips live in `#cs-cam-panel`, which is **shut
until the `#cs-cam` (CAMERA) disclosure is pressed**, so a test that clicks one
has to open the panel first; picking a preset shuts it again, while the
MOVE/zoom/SPIN controls leave it open.

### `corners() → [number, …]`
Lap-fractions of **curvature-peak** apexes (local maxima of `|curvature|`). Handy
for parking at sharp bends. This is **not** the curated FIA turn list — that lives
on `info().turns` / `track.def.turns` from `js/track/markings.js`.

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

### `wallStats() → {minB, maxB, minOverHw, anyNaN, tightFrac, street, n} | null`
Driving-boundary stats for the current track (both sides, all nodes): tightest
(`minB`) / widest (`maxB`) lateral limit, the closest a barrier sits to the road
edge (`minOverHw`), an `anyNaN` guard, and `tightFrac` (fraction of left/right
node boundaries tightened from default runoff), plus the `street` flag and node
count `n`. For verifying every track keeps the car off the models and is
recoverable.

### `modelDiagnostics() → {emitted, suppressed, invalid, unsafe} | null`
Atomic scenery outcomes for the loaded track. Entries include model `id`,
`required`, reason or vertex count, and overhead clearance where applicable.
Any required entry in `suppressed`, `invalid`, or `unsafe` is a hard
`verify-track` failure.

### `geometryDiagnostics() → [{name, ok, vertices?, indices?, reason?}, …] | null`
Validation manifest for floor, road, terrain, props, glass, water, gate, and
start-line buffers. Non-finite or structurally invalid geometry is recorded and
skipped before GPU upload.

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

### `setSpeed(v) → {speed} | false`
Instantly set the player's forward speed (m/s, clamped `[0, 200]`) without
cutting the throttle (which would coast). Handy for scripted entry-speed tests
and overspeed physics. Does not touch heading or yaw rate. Returns `false` if the
player isn't initialised yet.

### `spin(deg) → {head} | false`
Rotate the player's heading by `deg` degrees, instantly and exactly — the
implementation adds `deg * PI / 180` to `player.head`, so the sign is the
rotation's direction and a test can assert the signed delta rather than its
magnitude. Also ZEROES `vLat` and `yawRateCur`, which is the point: it puts the
car at a known attitude with no residual rotation, rather than mid-slide. Both
are readable back through `physState()` as `vLat` and `yawRate`. Returns the new
heading formatted in degrees, or `false` if the player isn't initialised.

Pair it with `aim(deg)` — `aim` points the car at an absolute bearing, `spin` is
relative to wherever it already points.

### `nudge(dLat, dSpeed) → {speed, vLat} | false`
Add an instantaneous lateral impulse (m/s, **+right of travel**) and/or a forward
speed delta (m/s); both default to 0 and speed clamps at 0. Unlike `spin` this
leaves heading alone, so it is the way to start a car sliding: push it toward a
barrier, simulate a kerb hop, or apply a standing-start bump without `jump()`.
Returns `false` if the player isn't initialised.

### `setBoost(on) → boolean`
Toggle the player's ERS boost flag (`player.boostOn`) for tests/screenshots.
Returns the new boost state, or `false` if no player is loaded.

### `aero(on?) → {xOn, xArmed, aeroX, mode, inZone, zoneAhead, zones, auto} | null`
ACTIVE AERO — the 2026 X-mode / Z-mode moveable wing. No argument reads the
state; a boolean requests or drops X-mode, exactly like pressing `Z` in-game.
Returns `null` if no player is loaded.

| Field | Meaning |
|---|---|
| `aeroX` | flap TRAVEL, 0 (Z-mode, full downforce) → 1 (X-mode, low drag). **This is what the physics reads.** |
| `xOn` | the switch: is X-mode requested |
| `xArmed` | is X-mode available here at all (inside an activation zone, not braking, on track, above ~25 m/s) |
| `mode` | `"X"` once the flap is off its stop, else `"Z"` |
| `inZone` | standing inside an ACTIVATION ZONE |
| `zoneAhead` | metres to the next zone, 0 while inside one |
| `zones` | how many the circuit has; **0 means none at all** (Monaco), and the mode is unavailable rather than merely unarmed |
| `auto` | the wing is driving itself (see `aeroMode`), and the AERO button is removed from the dock |

Requesting X-mode does NOT force the flaps open — `xArmed` still gates it, so
outside a zone this returns `xOn:false` and `aeroX` stays 0. That is the
mechanic, not a failure.

**Availability is a ZONE, not a look-ahead.** The FIA approves fixed zones per
circuit and the standard ECU refuses to rotate the wings outside one, so a zone
is a PLACE the HUD can count down to like a DRS board — which a rolling
"is the road ahead straight" test could never be. See `aeroZones()`.

**None of DRS's restrictions apply.** There is no proximity requirement (leader
and backmarker can both run X-mode down the same straight), and no opening-lap
or caution lock. Those belong to OVERTAKE, which is the actual overtaking aid —
see `carAt()`'s `otEnabled`. The flap also travels: it opens over ~0.39 s and shuts in ~0.12 s, so
poll `aeroX` rather than assuming the switch took effect on the same tick.

```js
__apex.aero(true);              // request X-mode
__apex.act({throttle:true}, 1/60, 60);
__apex.aero();                  // → {xOn:true, xArmed:true, aeroX:1, mode:"X"}
```

Both wings move, and so does more than one element on each: per the 2026 rules
every wing element except the mainplane rotates. At the default downforce level
`aeroX` swings four — the front cascade's top two flaps (23 deg / 26 deg) and
the rear wing's top two planes (26 deg / 28 deg) — on every car on track, in
cockpit view, and on the GARAGE turntable (the ACTIVE AERO button there).

X-mode is worth ~+10.5 % top speed and costs ~60 % of the aero-downforce term
(`DOWNFORCE` in `js/game.js`) — it is the only one of the three straight-line
levers that spends cornering grip instead of battery. `aeroX`/`xOn`/`xArmed`
also appear in `obs()`, `physState()` and `carAt(i)`; `cars()` carries the flap
travel as the short key `ax`.

### `aeroZones() → [{startFrac, endFrac, midFrac, len}] | null`
The circuit's fixed ACTIVATION ZONES, in lap fractions plus length in metres.
`null` before a track is built; an **empty array** on a circuit whose longest
straight does not clear the three-second minimum — that is Monaco, and it means
active aero is unavailable there entirely rather than merely unarmed.

**Use `midFrac`, never the average of `startFrac` and `endFrac`.** A zone may
WRAP the start line, in which case `endFrac < startFrac` and the average lands
on the opposite side of the circuit. Aiming `jump()` at `midFrac` is the only
wrap-safe way to stand inside one.

```js
const z = __apex.aeroZones().sort((a, b) => b.len - a.len)[0];
__apex.jump(z.midFrac, 60, 0);
__apex.step(1/60, 2);
__apex.aero().xArmed;           // → true
```

### `aeroMode(v?) → "manual" | "auto" | {ok:false, …}`
Get or set whether the wing drives itself. The same value the pause menu's
SETTINGS ▸ DRIVING ▸ ACTIVE AERO button writes, so the two cannot disagree — the
button repaints when this setter runs. On `"auto"` the car takes every zone by
itself and the on-screen AERO button is **removed from the dock** (not greyed):
the remaining taps close ranks. Anything other than the two strings returns a
typed `{ok:false, error:"bad_mode"}`.

### `caution(arg?) → {level, label, sector, frac, total, sectors, sinceT, cause, enabled}`
Race control's flags — the debris caution layer (`js/game.js`), a READ-ONLY
race-logic layer over `DebrisWorld.hazards()` that never slows or moves a car.

| `level` | `label` |
|---|---|
| 0 | `GREEN` |
| 1 | `YELLOW` (local, one sector) |
| 2 | `VSC` |
| 3 | `SAFETY CAR` |

- `caution({hazards:true})` → the same state plus the live hazard list.
- `caution(true|false)` or `caution({enabled})` → switch the whole layer. This is
  the same door as the CAUTIONS row in RACE SETTINGS, so the chips cannot go
  stale against it, and switching it **off drops any flag already flying** —
  a caution left up with nothing maintaining it is worse than no flag layer.

A caution also disables OVERTAKE (see `carAt()`'s `otEnabled`). It does **not**
disable active aero.

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
| `pace` | ground-speed scale for all cars (OVERALL SPEED) — see below |
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

`pace` scales the car's real **ground** speed (and the accel curve) and nothing
else. Everything else that is measured in speed is pace-normalised against it —
gear tops, rev range, engine pitch, downforce, the grip taper, the ERS deploy
taper, the grass crawl floor, the steering lock taper, the camera/blur/cockpit
speed effects, and the HUD + cockpit dial. So the gearbox always sweeps 1→8 and
the dial always spans 0 → ~259 km/h at any setting; only lap times move. The
debug hooks stay honest — every `speed`/`speedKph` in this API is raw m/s, and
`obs().dashKph` is the separate field that reports what the dial shows.

```js
__apex.setPhysics({ drift: 0, roadFollow: 0 });   // on-rails, no auto road-tracking
__apex.setPhysics({ drift: 0.6 });                // slidey
```

---

## Autopilot — programmatic driving to test steering settings

`tests/specs/autopilot.spec.js` is a closed-loop driver built entirely on these hooks.
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

Run it: `npx playwright test tests/specs/autopilot.spec.js` (or against a separate
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

### `uiScale(v?) → {pct, stored, min, max, step}` · `hudScale(v?) → {pct, stored, min, max, step}`
The two size sliders (pause ▸ SETTINGS ▸ DISPLAY), as **percentages**, 40–200.
`uiScale` drives `--ui-scale`, which the menu sheets and the overlay children
`zoom`; `hudScale` drives `--hud-scale`, which the in-race HUD clusters and the
touch dock `zoom`. **They are independent and absolute** — UI 115 + HUD 130 means
exactly that, nothing multiplies.

No argument reads; `pct` is the RESOLVED value and `stored` is what is actually
persisted, which is `null` until the player moves the slider. That distinction
matters: with nothing stored no inline custom property is set at all, so the
stylesheet default in `css/tokens.css` (100 % on every pointer) stands from the
FIRST paint rather than from whenever `game.js` runs. Passing `null` clears back
to that; a number sets and persists it (clamped to `min`/`max`).

```js
__apex.hudScale(130)   // {pct:130, stored:130, min:40, max:200}
__apex.uiScale()       // {pct:100, stored:null, …}  ← device default, nothing stored
__apex.hudScale(null)  // back to the device default
```

Both write to `document.documentElement`, **not `body`** — a custom property is
substituted on the element it is declared on, and every consumer's `calc()` is
declared at `:root`, so a value on `body` never reaches them.

### `weather(w?) → "dry" | "wet" | "rain" | "overcast" | "fog"`
Get or set race weather. Called with no argument returns the current mode.
`"wet"` = damp track (wet/reflective road, lower grip, no falling rain);
`"rain"` = active storm (wet road + falling rain + lightning + rain audio);
`"overcast"`/`"fog"` are dry-grip mood modes. Setting `"rain"` toggles the rain
layer + audio on; any other value turns them off. Takes effect immediately
without reloading the track.

### `setTimeOfDay(tod?) → "default" | "dawn" | "day" | "dusk" | "night"`
Get or set the session time of day live, **without reloading track assets**.
Called with no argument returns the current value. Setting it re-applies lighting
(sky, sun, lamps) immediately; geometry is rebuilt only when the night/day
state flips (`dawn`/`dusk`/`night` share one dark build, `day` is the light
build), so switching among the three dark times is near-instant and buildings
correctly swap between day-glass and night-neon. Fast path for time-of-day
sweeps — e.g. `race("vegas","day")` then `setTimeOfDay("night")` skips a full
re-race.

### `resetPlayer() → physState | false`
Force-rescue the player immediately — same mechanism as the 3-second auto-rescue
(repositions on the centreline at the nearest safe point). Returns the updated
`physState()` so a test can confirm the car was repositioned. Returns `false` if
no race is active.

### `inputState() → {steerMode, key, btn, pad, touchSteer, canvasTouches, holdPointers, throttle, braking, adaptiveButtons, speedStd, rateIn}`
Live per-source input snapshot: which source (keyboard `key`, on-screen buttons
`btn`, gamepad `pad`, canvas touch) is asserting throttle/brake/steer right now,
plus `holdPointers` — the pressed-pointer count each on-screen hold button is
tracking (all zeros when nothing is held; a non-zero entry with no finger down
means a stuck/ghost pointer). The one-call diagnosis for any "input seems stuck
on" report. `adaptiveButtons` / `adaptiveMix` (0..1) / `speedStd` / `rateIn` are the
STEERING & ASSISTS ADAPTIVE BUTTONS path (digital steer rate blended toward the
SPEED STEER hyperbola; the slider is how much).

**On-screen variant for a phone with no console:** load the game with
`?inputdebug=1` (or set `localStorage["apex26.inputDebug"] = "1"`) and a small
fixed readout renders in the bottom-left, refreshed 4×/s: THR/BRK with the
key/btn/pad source flags and the held-pointer counts. Built for the buttons-mode
"throttle stuck on after an off-track rescue" report, which four instrumented
emulation runs could not reproduce — when it happens live, the readout names
the asserting source on the spot.

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

### `carRoles() → [{id, code, team, human, local, isPlayer, hasPose, vLat, yawRateCur, mods, netInput}, …]`
Who is driving what. Cars carry **two** independent role flags, because
"the player" was really two things:

| flag | meaning | selects |
|---|---|---|
| `human` | driven by a PERSON — local **or** remote | the full per-axle bicycle model, a world-space pose (`px`/`pz`/`head`), the heavier collision mass, and an input source instead of the AI driver |
| `local` | the car on **this** screen | `Input`, the camera, the HUD, audio, haptics, announcements, particle FX |

`isPlayer` is the retained alias of `local` — that is what every consumer
already meant by it. In single player one car is both; a networked rival is
`human` without being `local`.

`vLat`/`yawRateCur` are included because they are the observable signature of
the bicycle model: an AI car is kinematic and leaves both at exactly zero
however hard it corners. `mods` is that car's own part multipliers (see
`carRole`); AI cars have `null` and run on tier × skill instead.

### `carRole(idx, {human?, local?, mods?}) → {id, human, local, isPlayer, mods} | false`
Promote a car to human control — which is what a networked rival *is* — or hand
it back to the AI. Omitted fields are left alone. `mods` sets that car's own
`{speed, accel, cornering, braking}` multipliers (missing keys default to 1);
pass `null` to clear. Demoting to AI also clears any fed input.

```js
// make car #4 a second human driver, on someone else's upgrades
__apex.carRole(4, { human: true, local: false, mods: { cornering: 1.2 } });
```

### `carInput(idx, {steer, throttle, brake, shiftUp?, shiftDown?, overtake?} | null) → input | false`
The controls a **non-local** human car drives on — same shape as `setInput()`.
Pass `null` to clear, after which the car coasts rather than inheriting the
local controls. Ignored by the local car (which reads the real `Input`) and by
AI cars (which drive themselves).

```js
__apex.carInput(4, { steer: 0.3, throttle: true });
__apex.step(1 / 60, 60);
```

### `net() → {active, role, localId, remoteId, remotes, slotFallback, net, buffered, events, reason, peerLaps, peerResult, startPending}`
The live session, or `{active:false}` when racing solo. `net` is the
clock/liveness snapshot (`rtt`, `offset`, `synced`, `alive`).

`remotes` is the one to read: an entry per rival, `{id, wire, driverId,
buffered}`. `remoteId`/`buffered` describe only the FIRST rival and are kept
for older callers.

`id` is a `cars()` index and is **not comparable across peers** — `makeCars()`
drops the custom team unless the local player picked it, so two screens in the
same race have grids of different length and order. `wire` (`G.wireId`) and
`driverId` are content-derived and are the same on every screen; key anything
cross-peer on those.

`slotFallback` is `null` when a rival got the seat it asked for, `"team"` or
`"any"` when it did not. Seat exclusivity should make the fallbacks
unreachable, so a non-null value means something upstream let two players hold
one seat.

### `netLoopback({nowMs?, latencyMs?, jitterMs?, loss?, interpDelayMs?, role?, peer?}) → {ok, role, localId, remoteId}`
Start a session against an **in-page** peer — no signalling, no second browser,
no network. This is how the game side of multiplayer is tested at all. Pass
`nowMs` to run the whole session on a virtual clock you control.

Authority recap, because it explains what you'll see: each peer owns its own
car outright. The rival is **posed from replicated state and not simulated
locally** — `updateCar()` early-outs on it — so with a session live and nothing
arriving, the rival does not move at all.

### `netPeerSend(state, atMs?, wireId?) → {sent, at} | false`
Publish one car state **as the remote peer**. Omitted fields default to the
rival's current values, so you can move one axis at a time. Pass `atMs` to
stamp it on your virtual clock.

`wireId` overrides the id stamped on the packet, so a test can post a car this
peer holds no slot for and assert it is **dropped** rather than posed over
whichever car that number happens to name locally. Without it the id is the
first rival's real `wire`, which is what a genuine peer would send.

### `lobbyInviteAnother() → Promise<{ok, code} | {ok:false, error}>`
Mint a FURTHER invite without disturbing the room — host only, and refused
past the four-player cap. Deliberately not `lobbyHost()` twice: that calls the
lobby's `open()`, which clears the peer maps, so inviting a third player would
forget the second.

### `lobbyReady(v?) → bool` · `lobbyStart() → bool`
The two buttons the waiting room ends with. `lobbyStart()` is host-only and
returns `false` if anyone is still choosing. Exposed for `tools/net/rtc-e2e-3p`,
which drives a real handshake and cannot click — Playwright's actionability
check fights the ~25 s a real ICE exchange takes, so it would end up testing
the buttons rather than the wire.

Note that saying READY and the host KNOWING it are separated by a real round
trip, so poll `lobbyRoom().peerReady` before pressing start rather than
assuming.

### `netTick(nowMs?) → status`
Pump the session by hand. The game loop already calls this every frame, but a
test must not depend on rAF running at a useful rate — drive it explicitly and
latency, loss and interpolation become reproducible, the same way `step()`
does for physics.

### `netStartArm(nowMs, atMs?, hold?) → {ok, at, hold, awaiting}`
Arm a synchronised lights-out directly, as the START event does — an absolute
instant on the shared clock, so a test can assert both grids are released at one
MOMENT rather than after an equal delay.

Omit `atMs` and it does the opposite: drops the sim into the countdown with
nothing named, which is the state a peer sits in while it waits to be told. That
branch holds the gantry unlit, and it was unreachable from a test until this
hook could decline to arm. `awaiting` reports `netPlay.awaitingStart()`.

Resets `countT`, `lightsLit` and the lamp DOM together. Worth knowing why: the
lamp elements and the counter used to be cleared separately, so a hook that
cleared the DOM left `lightsLit` at 5 and silently disarmed any later "did every
lamp light?" assertion.

### `netHostStart() → {ok, startPending}`
Run the host's `hostStart()` — naming the moment of lights-out, or arming the
`ARM_WAIT` deadline and holding until every guest reports its circuit built.
Otherwise reachable only from `js/net/lobby.js`, which meant the lead that
decides whether anybody SEES the countdown could not be asserted at all: every
countdown test armed `netStart` by hand and skipped the code under test.

The host names an instant a **whole countdown away** (`COUNTDOWN_S` + the hold +
a settle), not a short lead. A lead shorter than the sequence puts every peer
part-way through it by construction — which is what a 2.5 s lead against a
5.2–7.0 s sequence did, and why a guest reported correct timing and no lights.

### `netPeerClose() / netStop()`
Drop the rival's connection, or end the session locally. On a drop the rival's
car is handed back to the AI rather than left as a driverless obstacle.

```js
__apex.race("monza"); __apex.headless(true); __apex.reset(0.05, 40, 0, 1);
const s = __apex.netLoopback({ nowMs: 1000, latencyMs: 0, interpDelayMs: 0 });
__apex.netPeerSend({ s: __apex.info().total * 0.42, x: 2.5, speed: 0 }, 1000);
__apex.netTick(1010);
__apex.carAt(s.remoteId);        // the rival, posed where its owner said
```

### `lobbySdp() → {ice, conn, localTypes, remoteTypes, local, remote}`

The SDP that actually **crossed**, both directions — which is a different
question from what each side gathered, and the difference was invisible until
this existed. Every candidate counter in the game (`lobby().wire.candidates`,
`turnProbe()`) reports the LOCAL gather. Two devices can each hold four
reachable relay candidates and still fail to pair, if the description that
reached the other end carried none of them.

`localTypes` / `remoteTypes` are the candidate lines reduced to
`addr port typ <type>`, so a missing `relay` on the REMOTE side is visible at a
glance. `local` / `remote` are the raw SDP for when it is not.

```js
const s = __apex.lobbySdp();
s.remoteTypes.filter((t) => t.includes("relay"))   // did the peer send us any?
```

### `lobbyPairs() → Promise<{ice, conn, pairs}>`

**Why** no pair was nominated, straight from ICE's own candidate-pair table —
the last question `lobbySdp()` cannot answer. Both peers can send relay
candidates, both relays can be reachable, and ICE can still sit in `checking`
for ever. Each entry gives `state`, `nominated`, `sent`/`recv` (STUN
connectivity checks out and answered back) and `bytes`.

`recv: 0` across every pair means our checks are going out and nothing is
answering. A pair in `succeeded` that was never `nominated` means something
else ended the connection first.

```js
(await __apex.lobbyPairs()).pairs.filter((p) => p.local.includes("relay"))
```

### `turnProbe(ms?) → Promise<{ok, servers, relaysConfigured, summary}>`

Is a TURN relay actually there? One throwaway `RTCPeerConnection` **per
server**, each with `iceTransportPolicy: "relay"`, gathering for `ms`
(default 8000).

Relay-only is what makes the answer proof rather than inference: with host
and srflx candidates discarded, a candidate can only have come from TURN, so
`relay > 0` cannot be a direct pair in disguise. Per-server is the other half
— one combined gather says only "something worked", which is exactly the
answer that leaves a dead entry shipping next to a live one.

Probes `NetTransport.iceServers({})`, i.e. **what the game would really use**,
including anything `apex26.turn` / `apex26.turnApi` added. STUN entries are
reported with `stun: true, error: "not_a_relay"` rather than skipped: "you
have no relay" and "your relay is down" are opposite diagnoses, and the
lobby's failure copy branches on the difference.

| Field | Description |
|---|---|
| `ok` | Did **any** relay answer |
| `servers[]` | `{urls, relay, ok, stun?, error?}` per server — `relay` is the candidate count |
| `relaysConfigured` | How many TURN (not STUN) entries were in the config |
| `summary` | The sentence to paste back |

`error` carries the operator's own verdict when ICE gave one — `ice_701` is a
DNS failure, `ice_401` a rejected credential, and those want opposite fixes.

```js
await __apex.turnProbe();
// → { ok:false, relaysConfigured:0, servers:[…],
//     summary:"No TURN relay is configured — only STUN. …" }
```

**A relay ships by default** — a Metered free-tier credentials URL. Not a
luxury for hard networks: without one, two devices on the *same Wi-Fi* often
cannot connect at all, because the only host candidate a browser offers is
mDNS-obfuscated and, when that name will not resolve, the sole remaining pair
is srflx↔srflx needing router hairpinning that many routers do not do.
`apex26.turnApi` overrides it outright.

The two free no-signup relays are **measured dead** and stay off behind
`localStorage.setItem("apex26.freeTurn", "true")`: trickle-ICE gathers from two
independent vantage points, each carrying a Google-STUN control that *did*
produce an srflx candidate, returned zero relay candidates from both Open Relay
and freestun.

**Two traps this hook exists to expose**, both of which produced `relay: 0`
wire dumps for hours while the relay was demonstrably alive:

- `iceServers` are fixed **at construction**. `prefetchIce()` must be awaited
  before a connection is built — the lobby's `readyIce()` does this — or the
  fetch lands ~200 ms too late and the connection gathers STUN-only.
- The invite code caps candidates and SDP lists them in **gathering** order, so
  relay is always last. `sdp.js` selects round-robin by kind (`RETAIN`, relay
  first) rather than taking the first N.

So `turnProbe()` reporting `ok: true` while a race still fails means the relay
is fine and something downstream is discarding it. Check
`__apex.lobby().wire.candidates` for a non-zero `relay`.

---

## Timing & field

### `timing() → {raceT, lapTime, best, lastLap, lap, pos, total, gapAhead, gapBehind, energy, aeroX, gear, sector, sectorElapsed} | null`
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
Live S1/S2/S3 timing. Boundaries come from curated `CircuitMarkings` via
`sectorAt` (equal thirds only if a track has no `sectors` table). `idx` = current
sector (0–2). `elapsed` = seconds into it. `bests[i]` = personal-best for sector i
(`null` until that sector is completed with `lap ≥ 1` — formation-lap S3 is not
recorded). `last[i]` = most recent completed time for sector i.

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

### `trackBounds() → {minX, maxX, minZ, maxZ, spanX, spanZ, centerFrac} | null`
World-space bounding box of the loaded circuit (metres) plus `centerFrac`, the
lap-fraction whose node is closest to the geographic centre. The go-to hook for
framing whole-track shots — feed `centerFrac` to `orbit()` or compute an altitude
from `spanX`/`spanZ` for a straight-down `view({eye,target})` (see the top-down
recipe under `view()`).

```js
const b = __apex.trackBounds();
__apex.orbit(b.centerFrac, 0, 85, b.spanZ * 1.1);   // near-top-down (85° cap)
```

### `mapPts() → [[x, y], …] | null`
The circuit's 2D minimap polyline — the same `track.map` array used to draw the
in-game minimap and track-selector preview. Each entry is `[x, y]` **normalised to
[0,1]**, with `x=0..1` east and `y=0..1` where **0 = north** (top of map). Ideal
for asserting minimap orientation without a screenshot. `null` if no track.

### `trackShape(n?) → [{frac, x, z, k}, …] | null`
Sample the centreline at `n` evenly-spaced points (default 200, max 2000). `x`/`z`
are the world centreline **normalised to [0,1]** and aspect-centred within a unit
square (handy for plotting a custom 2D layout); `k` is curvature (rad/m) at each
point.

---

## Misc

### `loadCarModel(url) → Promise<bool>`
Load an optional `.glb` car model at runtime (team meshes rebuild from it, tinted
per livery); resolves `false` and keeps the procedural car on failure.

### `meshToggle(o) → overrides`
Hide or show individual track meshes by name. `o` is an object of `{meshName:
bool}` — **truthy HIDES the mesh, falsy restores it** (the value marks the mesh
as hidden). Keys are additive; omitted keys are unchanged. Returns the full
current override map.

```js
__apex.meshToggle({ props: true });        // hide track props (cones, barriers)
__apex.meshToggle({ road: true });         // hide the road surface
__apex.meshToggle({ props: false });       // show props again
__apex.clearMeshes();                      // restore all meshes
```

### `clearMeshes() → {}`
Reset all `meshToggle()` overrides, restoring every mesh to its default visibility
state. Companion to `meshToggle()` — call this between tests so toggled meshes
don't bleed into later screenshots.

### `renderScale(v?) → {scale, fps, floorMs, auto, tier, autoTier, userTier, tierFloor, crashStrikes}`
Adaptive-resolution control. No arg: report the current state. A number pins the
3D render scale (clamped `0.5–1`) and disables the auto-governor — a big
fill-rate win (softer 3D; the HUD stays crisp). `true` re-enables the
auto-governor. `floorMs` is the governor's derived per-device budget (the
observed floor of frame intervals, not a hardcoded 16.7 ms) — it rises to match
an external cap like iOS Low Power Mode's 30 fps `requestAnimationFrame`
throttle instead of judging that device against a 60 fps target it cannot
reach; see `docs/research/PLATFORM-INPUT-NOTES.md` §9c. `autoTier` / `userTier`
split the governor's measured ladder from the GRAPHICS preset floor.
```js
__apex.renderScale();      // full governor snapshot
__apex.renderScale(0.6);   // pin 60% 3D scale
__apex.renderScale(true);  // hand back to the auto governor
```

### `perf() → same as renderScale()`
Thin alias of the `renderScale()` report — scale / fps / tier / autoTier /
userTier / strikes — for agents that want a perf-named hook.
```js
__apex.perf();
```

### `safeMode(v?) → {strikes, tierFloor, tier}`
The crash sentinel's safe mode. A phone that was killed mid-race (jetsam/OOM)
earns a *strike*; two strikes pin the feature floor at tier 4 — env probe, lamp
shadows, SSR, car shadows, SSAO, god rays and bloom all shed — clamp the cull
distance to 900 m and pre-drop the render scale. That reads as a broken renderer
rather than as a protection, and strikes only pay back one per cleanly finished
race. Strikes now expire when the build number changes (`js/game/perf.js`);
`safeMode(false)` is the manual version.
```js
__apex.safeMode();        // { strikes: 2, tierFloor: 4, tier: 4 }
__apex.safeMode(false);   // forget the crash history, lift the floor now
```

### `f1api → F1API | null`
Raw handle to the `F1API` module (the cached Jolpica + OpenF1 client the data hub
uses); `null` if `F1API` didn't load. All methods return Promises.
```js
await __apex.f1api.schedule();
await __apex.f1api.lastRace();
```

### `openf1(path) → Promise<json>`
Direct OpenF1 fetch — GETs `https://api.openf1.org/v1` + `path` and returns the
parsed JSON (uncached, bypasses the F1API queue). With no path, or a path that
does not start with `/`, returns `{ok:false, error:"missing_path", message, fix}`
instead of hitting a garbage URL.
```js
await __apex.openf1("/sessions?circuit_short_name=Monaco&year=2024");
```

### `jolpica(path) → Promise<json>`
Direct Jolpica (Ergast-compatible) fetch — GETs `https://api.jolpi.ca/ergast/f1`
+ `path` and returns the parsed JSON (uncached). Same missing-path guard as
`openf1()` — a bare `jolpica()` used to throw on the HTML 404 page.
```js
await __apex.jolpica("/circuits/monaco.json");
```

### `fetchTrackOutline(sessionKey, driverNumber?) → Promise<[{x, z}, …] | null>`
Fetch OpenF1 GPS `location` data for a session/driver (`driverNumber` default 1)
and return a normalised, downsampled (≤400 pts) `{x, z}` track outline. `null` if
the session has no location rows. Find a `sessionKey` via `openf1()`.
```js
await __apex.fetchTrackOutline(9149, 1);
```

---

## Agent world view

Everything above is a dev console: flat hooks, one narrow question each, `false`
or `null` on failure. That is right for a human at a REPL and wrong for a
text-only agent, which wants one egocentric snapshot per decision with the
semantics sitting next to the numbers.

These hooks are that layer (`js/game/agentview.js`). They compose the hooks
above and change none of them — `__apex` is unchanged underneath. Design,
measurements and the research behind each decision: `docs/AGENT-WORLD-API.md`.


### The surface at a glance

| Hook | Question it answers | Cost |
|---|---|---|
| `world()` | Where am I, what is next? | cheap — the per-tick call |
| `render({what:"view"})` | What does it look like? (replaces a screenshot) | moderate |
| `scene()` | What is around the car? | moderate |
| `scene({visible:true})` | What is on screen, as a list? | moderate |
| `trackInfo()` | Corners, sectors, elevation | static — fetch once |
| `render({what:"circuit"})` | What is this place? The whole circuit | static — fetch once |
| `carView()` | What am I driving? (replaces the car viewer) | static per setup |
| `survey()` | Is anything broken? Geometry defects | static per track |
| `rollout()` | Drive an interval, get a digest | runs the sim |
| `terminal()` | Did the episode end, and why? | cheap |
| `agentHelp()` | This table, from inside the API | cheap |

Overlaps worth settling before you pick one:

- **`scene()` vs `scene({visible:true})`/`render({what:"view"})`** — plain `scene()`
  is a radius around the **car** and ignores where the camera points; the other
  two are the **camera's** view.
- **`scene({visible:true})` vs `render({what:"view"})`** — the visible list *names*
  what is in shot; the view raster shows *where* it sits and what hides what.
- **`scene()` vs `render({what:"circuit"})`** — live surroundings vs the static circuit.

Every hook here returns `{ok:false, error, message, fix}` on failure and **never
`null`**; `fix` names the call that resolves it.



---

### Perceive — what is happening now


Called during a session. `world()` is the only one cheap enough per tick.


### `world(opts?) → payload | typedError`

One egocentric JSON snapshot. **Never returns `null`** — on failure it returns
`{ok:false, error, message, fix, state}` where `fix` names the hook to call.

| opt | default | meaning |
|---|---|---|
| `detail` | `"drive"` | `"brief"` (~ego + next corner + summary) · `"drive"` (+ lookahead, rivals, affordances) · `"full"` (+ session, terminal, raw physics, all 21 rivals) |
| `horizonS` | `4` | lookahead horizon in **seconds** — the distance scales with speed |
| `points` | `5` | lookahead samples (2–12) |
| `since` | — | a `seq` you already hold; returns only what changed |

**Cost, measured** (bytes per step, 20-step driving loop on Monza):

| call | per step | vs `full` |
|---|---|---|
| `world({detail:"full"})` | 12,089 | 1× |
| `world({detail:"drive"})` | 3,501 | 3.5× |
| `world({detail:"drive", since})` | 2,908 | 4.2× |
| `world({detail:"brief"})` | 1,026 | 11.8× |
| **`world({detail:"brief", since})`** | **355** | **34×** |

Read that before optimising the wrong thing. **`detail` is the dominant lever**;
`since` is worth little on its own while the car is moving (1.20× on `drive`)
because at 5.5 m of travel per step every number genuinely changes. It pays on
`brief` (2.9×) where the unchanging envelope is a large share of a small
payload, and on a mostly static scene (1.55× parked). A control-loop tick at
`brief` + `since` costs ~355 bytes — about 90 tokens.

Deltas pass numbers through a deadband of `max(0.25 absolute, 2% relative)`: a
change smaller than you could act on is not reported. The baseline advances only
by what was actually sent, so the error stays bounded by one deadband instead of
drifting. Pass no `since` for a full resync at any time.

```js
__apex.world({ detail: "brief" })
// { apiVersion, physicsVersion, seq, t, detail, conventions, raceState,
//   track: {id, name, lengthM},
//   ego: { lap, pos, of, frac, s, speedKph, speed, gear, lateralM,
//          headingErrDeg, onTrack, halfWidthM, clearLeftM, clearRightM,
//          energy, grip:{slipFactor, longUsedPct, state, surface,
//                       gripMult, tyreGrip, fieldGrip} },
//   nextCorner: { turn, dir, radiusM, severity, distM, timeS, apexSpeedKph,
//                 straightAfterM, exitsOntoStraight, bankingDeg, camber,
//                 gradientPct, elevation, kerbs, suggestBrakeM, status, note },
//   brief: "Lap 3, P4, 218 km/h in 6, T7 L in 84 m — BRAKE NOW for T7, …" }
```

`detail:"drive"` adds **`pacenotes`** — the road ahead as one rally co-driver's
line, e.g. `"L1 @244m uphill don't-cut, L6 @398m uphill into-str, L4 @979m
downhill"`. Direction + rally severity 1–6 (1 = tightest, from the radius) at a
distance in metres, with the mutators that change the call: `uphill`/`downhill`,
`off-camber`, `into-str` (opens onto a straight — prioritise exit), `don't-cut`
(tight enough that an early apex throws the exit away). Three corners in ~60
characters. It also adds
`nextCorners:[{turn, dir, radiusM, severity, distM, apexSpeedKph, exitsOntoStraight,
suggestBrakeM}]` (the next few corners as a sequence, ordered by distance),
`rivals:[{id, code, team, rel, gapM, gapS, lateralM, side, speedKph, closingMps,
threat, lap}]` (sorted by gap, capped at 4), and `affordances` / `unavailable`.

**Road shape.** `bankingDeg` is the real road-plane roll (`+` = the right edge is
raised, which holds a **left**-hander), and `camber` says what that means for
*this* corner: `banked into the turn` / `off-camber` / `flat`. Note the source:
authored `def.bankZones` → `track.bankP` → `Tracks.banking()`, **not**
`Tracks.bankAngle()`/`track.bank[]`, which is a per-node tilt almost no circuit
sets. `gradientPct`/`elevation` measure the climb across the corner, and `kerbs`
lists the sides that carry one. The same facts appear as rally mutators in
`world().pacenotes` (`uphill`, `downhill`, `off-camber`).

**Previously-invisible state, now exposed.** `ego.penalties` gives `{cuts,
freeCutsLeft, timePenaltyS}` — cuts 1-3 warn, every cut from the 4th adds +5 s.
An agent that cannot see this is scored on a rule it cannot perceive.
`ego.ers` gives `{charge, deploying, overtakeArmed, boostRemainingS, cooldownS}`
— charge alone never said whether the energy was going anywhere, or whether the
overtake window (~1 s behind, 4 s boost, 9–14 s cooldown) was open.
`rivals[].pace` (and `field()` rows at `full`) expose AI skill, so one rival is
distinguishable from another. `detail:"full"` adds `physics.{rpm, offroad,
stuckS, wallContactS, vertLoad}` and a `tunables` block — `setPhysics()` can
retune the car underneath an agent, and without it the agent would attribute the
change to its own driving.

**No prescribed racing line.** A crude `apexOffsetM`/`moveToApexM` "fast line"
(apex = inside edge) was removed — it is confidently wrong (late apex onto a
straight, chicanes link). Instead the agent chooses a line from honest geometry:
`ego.lateralM` (offset from centre), `ego.headingErrDeg`, `ahead.pts` (curvature),
plus per corner `straightAfterM` (road to the next corner) and `exitsOntoStraight`
(true past ~120 m) — the cue to prioritise exit, without dictating the line.

**`rivals[].lateralM` is relative to the PLAYER**, not the centreline — `+` is to
your right. `rivals[].team` is a team **id string**, not the team object — rivals
are the saliency-capped nearest few for a driving decision (`world().rivals`);
for the full grid call `field()`. Everything else is the usual convention (`+x`
right of centreline, `+k` **LEFT**-hand turn), restated in every `conventions`
field. (`+k` reads backwards from its old comment in `spline.js`: a zero-steer
run through a `+k` corner drifts to POSITIVE lateral, i.e. wide to the right,
so the road bends left. `game.js`'s racing line has always used `-sign(k)`.)

`suggestBrakeM` is a **hint**, not the car's physics: it assumes ~30 m/s²
braking and ~26 m/s² lateral grip. Treat it as a reference to check against, not
a target.

### `describe(id) → payload | typedError`

Everything known about **one** entity, by stable id. Ids are derived from the
registry/corner table, so they survive a rebuild and cost nothing to mint:

| id | resolves to |
|---|---|
| `prop:<n>` | a registered prop — measured box, arc position, side, fill/parts, board text, egocentric distance/bearing, and the corner it stands by |
| `corner:<turn>` | the full corner record + a census of scenery within 80 m |
| `car:<n>` | one car: code, team id, lap, position, speed, gap to the player |
| `span:<n>` | a barrier/fence run: kind, side, from/to, length, height |

```js
__apex.describe("prop:1980")   // ~314 bytes
__apex.describe("corner:T3")   // corner + sceneryWithin80m
```

Ids come back from `scene()`, `query()`, `trackInfo()` and `field()`, and
cross-reference each other (a prop names its `nearestCorner` as an id). An
unknown id is a typed error that says how to find a real one.

### `query({kind, near, fromS, toS, limit}?) → payload | typedError`

A **bounded slice** of the world. Filters compose: `kind` (string or array),
`near` (metres around the car), `fromS`/`toS` (an arc-position window), `limit`
(capped, default 40).

```js
__apex.query({ kind: "pine", near: 250, limit: 8 })
// { matched: 52, returned: 8, truncated: 44,
//   prototypes: { pine: { sizeM: [5, 32.1, 5], count: 8 } },
//   instances: [ { id:"prop:149", kind:"pine", s:288.1, side:"left",
//                  distM:19.1, bearingDeg:92.4 }, … ] }
```

Repeated dressing comes back as **prototype + instances**: one shape per kind,
then a position per instance, with `sizeM` repeated only when it differs by more
than 25%. Never a silent truncation — `truncated` says what was withheld.
Narrow the filter rather than raising `limit`.

**Why these two exist.** The world is stored in full but never dumped: a flat
serialisation of a rich scene is both enormous and *read worse* than a query,
and thousands of near-identical props are the worst case. Monza registers 2835.
So the default views stay lean and detail is **pulled** where a decision needs it.

### `atmosphere() → payload | typedError`

The light, narrated. `lightState()` is rich but raw — an agent can't act on an
RGB triple — so this describes the scene and keeps the numbers alongside:

```js
__apex.atmosphere().brief
// "night, dark, floodlit (29 lights active), moon to your right,
//  visibility ~433 m, stars out, moon up."
```

Carries `timeOfDay`, `weather`, `wetRoad`, `dark`, `brightness`,
`sun:{body,elevationDeg,relBearingDeg,where}`, `lights:{active,floodEmit}`,
`visibility:{fogDensity,approxRangeM}`, `exposure`, and `raw` RGB.

**`sun.body` is `"sun"` or `"moon"`** — at night the renderer keeps the sun
direction and dims it to moonlight, so elevation alone would report a high sun
over a floodlit midnight. Darkness comes from the session, not the sun vector.
Fog is reported as a **visibility distance**, the actionable form.

### `objective() → payload`

**What the GAME is**, as opposed to what the API is (`agentHelp()`). Static —
read once, needs no track loaded. Carries the win condition, the irreducible
trade-offs (track limits, ERS, the overtake window, the 600-credit parts
budget), the hard constraints (wrong-way, rescue, barriers) and the units
convention.

It deliberately does **not** describe how the car behaves. A fixed dynamics
description cannot be corrected when it is wrong and goes stale the moment
physics is retuned; the agent should learn dynamics by calling
`rollout()`/`act()` and reading `world()`.

### `seed(n?) → number`

Get or set the **simulation** random seed; setting it also rewinds the stream.
`seed(42)` then `reset(frac, speed, x)` reproduces an episode exactly — same
seed + same inputs ⇒ same result. `reset(frac, speed, x, seed)` does both, in
the right order (the seed is applied *before* the grid is rebuilt, since grid
order, lane and AI skill are drawn from the stream).

Only simulation randomness is seeded: AI grid order/lane/skill, the start-lights
hold, and the per-tick AI overtake decision. **Cosmetic randomness — camera
shake, lightning, particles, audio noise — deliberately stays on
`Math.random()`** so it can never perturb the sim; if it drew from the seeded
stream, whether a spark spawned would change where a car ended up.

Guarded by `tests/specs/agent-determinism.spec.js`.

### `field({detail}?) → payload | typedError`

The allocentric standings mirror of `fieldState()`/`cars()` — every car by race
position with second-gaps, compact (team is an id string, one row per car):

```js
__apex.field({ detail: "brief" })
// { raceState, of, lapsTarget, player:{pos,lap,gapToLeaderS,intervalS},
//   positions:[{ pos, id, code, team, isPlayer, lap, gapToLeaderS, intervalS }, …] }
```

`detail:"full"` adds `frac`, `speedKph`, `gapToLeaderM`, `finished` per row.
`world().rivals` is the egocentric nearest-few for the driving decision; `field()`
answers "where is everyone". Part of agent view being the **text-native mirror of
the whole `__apex` toolkit** — see `agentHelp()`, whose `read` section names the
raw hooks that already return JSON (`physState`, `lightState`, `timing`, …) and
whose `control` section names the drive/stage verbs.

### `render({what, ...})` — the one raster entry point

`render({what})` is the **one** entry point for every raster; `what` selects
`"view"` (the camera), `"map"` (top-down), `"circuit"` (the whole track as a
document) or `"car"` (measured elevations).
Every raster is flagged `aid: "APPROXIMATE…"` — the evidence is that dense
character grids read *worse* for an LLM than the structured numbers they are
drawn from, so this is a composition aid for looking at, not a surface to read
geometry off. The former `frame`/`plan`/`worldModel`/`visible` aliases have been
removed — the `what` values above are the only spelling. The next sections
document each raster under its `render({what})` name.

### `render({what:"view", cols, rows, camera, orbit, edges, depth, rangeM, cellAspect, limit}?) → render | typedError`

**The screenshot replacement.** `scene({visible:true})` lists what is on screen; this shows
*where*, by rasterising the scene into a character grid with per-cell depth
sorting — a real hidden-surface solve at grid resolution, not a guess.

**Resolution.** `cols` defaults to 48 (what an agent should read) and clamps
8–400; `rows` derives from the real viewport aspect unless pinned, clamped
4–150. Raising `cols` is a human-facing quality knob — a large, sharp view on
request — not something the default loop should reach for; `agentHelp()` keeps
pointing decisions at `world()`/`scene()`/`trackInfo()`. `carView({detail:
"render", cols, ss})` has the matching knob for the car elevations: `ss`
(supersampling, 1–6, default 3) trades render cost for a sharper edge+shade
result through the existing Sobel-on-depth pipeline — no new glyphs, just more
samples per cell. Both `cols` and `ss` clamp rather than hang the tab on an
unreasonable request.

```
ttttttttttttttttttttttttttt........tttttttttttttt.....tt
tttttttttttttttttttttttttttttt..tttttttttttttttttttttttt
######ttttttttttttt##tttttttttttttt###tttttttt######tttt
######ttttttttttttt##:============:#################tttt
######ttttttttt:=======@@@@@@@@@========:###########tttt
:======================================================:
```

Returned as `grid.lines` plus a `legend` (only glyphs actually drawn),
`coveragePct` per kind, `horizonRow`, ranked `objects`, camera and lighting.
`node tools/agent.mjs monza frame --cols 72 --rows 20` prints the grid directly.

Why a grid rather than a picture: [BALROG](https://arxiv.org/abs/2411.13543)
found VLMs score *lower* with the image than with text alone, and a few hundred
tokens of raster carries the composition and occlusion a screenshot carries.

**Why it is not ASCII art.** The obvious "render to text" is a luminance ramp —
map brightness to `.:-=+*#%@`. That is the wrong target for a model reader.
[ASCIIEval](https://arxiv.org/abs/2410.01733) measures LLMs on exactly this and
finds they "remain far behind human performance in shape recognition"; a ramp
demands the model reconstruct a shape from shading, which is the documented
weak spot. Semantic glyphs skip that step — each character already says what it
is. Two further findings from the same work shape the defaults:

- **Accuracy is sensitive to the LENGTH of the art**, and a low-resolution
  prompting strategy *improves* perception. More cells is not more legible, so
  the default grid is small on purpose. Ask for 160 columns and you will likely
  read it worse.
- **Text-and-image together scores below image alone.** Don't pair this with a
  screenshot and expect the best of both.

**Aspect.** A character cell is about twice as tall as it is wide, so a grid
whose ratio matches the viewport renders *squashed*. `rows` is therefore derived
from `gfx.aspect` and `cellAspect` (default 2) unless you pin it — the old fixed
48x18 default was an effective 1.33 against a 2.16 viewport, stretching a square
object 1.6x vertically. `grid.aspect` reports what was used and whether it was
corrected.

**Depth.** `{depth:true}` adds a second channel: per-cell distance as digits
0 (near) to 9 (far), logarithmic so the near field where driving decisions live
gets the resolution, with `scaleM` giving the metres for each digit. This is a
real render target read out of the depth buffer the raster already builds — not
a synthesised shading model — and reading it needs no shape recognition.

**Any camera, not just the live one.** `{camera:"cockpit"}` (any of the 13
modes — chase, cockpit, hood, heli, overhead, side, tcam, rear, …) or
`{orbit:{az,el,dist}}` computes the shot fresh from the car's position, without
moving it or waiting for a render. That is the text version of `apex-capture`'s
per-mode screenshots and `previewCam()`. A synthetic camera is never stale, so
`framePending` is false for it. Omit `camera` to use the live view.

**Edges.** `{edges:true}` overlays the depth-discontinuity edges — the
geometry-native version of the Acerola / Kang line pass — as `| - / \` over the
semantic glyphs, so a car against the road or a building against the sky reads
as an outline. Silhouettes and creases come straight from the depth buffer, not
a luminance Sobel, so they are exact.

```
t##t#####ttt######t:====@@@@@@@@@===:######tttttttttt###     35551111155555555554444433333333344445555555555555555555
t##t#####ttt:===========@@@@@@@@@==========:ttttttttt###     35551111155533333333333333333333333333333333555555555555
t:=====================================================:    22222222222222222222222222222222222222222222222222222222
```

Known approximations, all in the same direction — read them before trusting a
close call:

- Objects are rasterised as **axis-aligned boxes**, so a yawed car or a rotated
  building over-covers slightly at cell resolution.
- Depth is the box **centre**, not its nearest face. Using the near corner made a
  100 m assembly sort as if its far end were in front of the camera.
- Anonymous `structure` hulls with a **fill ratio under 6%** are skipped as
  occluders — they are scatter (lamp bases, fence posts), not walls. Painting one
  solid put a 32×31 m box across 68% of a frame that actually showed sky.
- Boxes containing the camera are skipped: a hull that encloses the viewer is not
  an object in shot.
- Tree canopies are cones drawn as boxes, so a dense treeline closes up gaps of
  sky a render would show. Sky is under-reported in wooded scenes.

### `scene({radius, kinds, limit}?) → payload | typedError`

**Named** scenery near the car. `scene({visible:true})` locates scenery mass; this says what
it is.

```js
__apex.scene({ radius: 120, limit: 5 })
// { origin:{from:"player", x, z, headingDeg, note},
//   radiusM, counts:{lapTotal, byKindLapTotal:{tree:985, …}, inRadius},
//   props:[{kind, distM, bearingDeg, side, sizeM:[w,h,d], at:[x,y,z]}],
//   truncated, lamps:[{kind, distM, bearingDeg, side}],
//   registry:{recorded, dropped, cap, complete, note} }
```

Egocentric: `distM` / `bearingDeg` are from the **player** (or the camera when
there is no player — `origin.from` says which), `+bearing` = to its right,
0 = straight ahead. Sorted by distance.

**This is the INTENT registry, not the geometry.** Entries come from the
`ctx.note(...)` calls the model helpers make, and several of those fire BEFORE
the helper decides whether to emit anything — `building()` notes itself after
its two footprint guards but before the `opts.kind` massing branch runs. So a
prop that draws nothing at all can still be listed here, at a plausible size and
position. MEASURED 2026-08-14: Imola's pit building appeared in `scene()` the
whole time it was emitting ZERO vertices, which is most of a debugging session
spent trusting a list instead of the picture.

`scene()` answers "what did this circuit ASK for". To ask "what is actually in
the buffers", diff the vertex count with the call removed:
`node tools/verify-track.cjs <id>` before and after commenting the line out —
identical `props N` means nothing was emitted. Run a control first (add a loop
of throwaway `addBox` calls and confirm the number moves), because two equal
readings look the same whether the instrument works or is simply not seeing
your edit.

Kinds: `tree` · `pine` · `palm` · `bush` · `building` · `house` · `motorhome` ·
`tower` · `grandstand` · `billboard` · `signBoard` · `marshalPost` · `gantry` ·
`mountain` · `peak` · `ridge` · `prop` (the generic `place()` box) · and
`structure` — an **anonymous assembly** of primitives a circuit's own
`scenery()` emitted without a named helper. Filter with `kinds: ["tree"]`.

Sizes are **measured** from the primitives each placement actually emitted, not
declared by the call site. The declarations were wrong in *both* directions
depending on species — measured against nominal across Monza, pines came out at
**0.39×** the guessed width (a 24.6 m pine is 5.7 m across, not 11.1 m) while
broadleaf trees came out at **1.55×** it. Anything reasoning about clearance or
screen coverage should trust `sizeM` now and should not have before. Records
carry `measured: true` when the box came from geometry; anonymous `structure`
records instead carry `parts` and `fill` (how much of the box is solid — a
scatter of posts fills a few percent, a building most of it).

Backed by `track.props`, filled by `note()` in `js/track/tracks.js` at each
semantic emitter, **after** that emitter's on-track and mass-collision guards —
so a suppressed prop never enters the registry and the list describes what
actually stands there. It records semantic placements, **not primitives**: Vegas
emits ~94k primitives but only ~450 placements, because one tree is a trunk plus
several canopy tiers. Measured totals run 169 (Monaco) to 1,887 (Suzuka) against
a 40,000 cap, so `dropped` is 0 everywhere and `registry.complete` is true — but
check it rather than assume, because the registry is emission-ordered and a
truncated one would under-report late-built areas non-uniformly.

Not covered: kerbs, barriers, guardrails and other road furniture — those live
in `track.barL`/`barR` as a driving limit, and `wallStats()` reports on them.

### `scene({visible:true, limit}?) → payload | typedError`

What is actually on screen. The renderer answers this every frame — it extracts
frustum planes from `frame.viewProj` and tests them against per-chunk AABBs —
and then throws the answer away. This runs the **same** cull test
(`GLX.makeFrustumPlanes` / `GLX.aabbInFrustum`, exported from
`js/render/glx/chunked.js` rather than reimplemented, so the two cannot drift)
and reports it.

```js
__apex.scene({ visible: true, limit: 8 })
// { camera:{eye,target,fovDeg,mode,debugCam}, framePending,
//   scenery:{ available, cellSizeM:72, totalCells, visibleCells, cullDistM,
//             nearest:[{distM,bearingDeg,centre,sizeM}], truncated, note },
//   cars:[{id,code,isPlayer,distM,bearingDeg,inFrame,screenPct,behindCamera}],
//   carsInFrame,
//   corners:[{turn,dir,distM,bearingDeg,inFrame,behindCamera,screenPct}] }
```

Three things to know:

- **It reflects the LAST RENDERED frame.** `jump()` does not move the camera
  until a frame draws, and `headless(true)` skips `render()` entirely. Call it
  after letting frames run, or you will read a camera hundreds of metres from
  where you just put the car. `framePending` is set under headless and a
  `warning` field explains it.
- **Scenery resolution is the 72 m chunk grid, and chunks are anonymous.** This
  locates scenery *mass* — "54 of 648 cells in view, nearest 24 m out on your
  right" — it does not name a grandstand. Naming needs the prop registry.
- **`screenPct` is null unless `inFrame`.** A point on the eye plane has `w→0`
  and projects to coordinates like `27629%`. That is correct projective maths
  and useless, so it isn't shipped. Corners behind you are still listed, with
  `behindCamera: true` when `|bearingDeg| > 90` (behind the look direction,
  not merely behind the near plane) — "T2 is 80 m behind you" is
  exactly what an agent needs after a spin.


---

### Know — what does not change


Static for the session (or the car). Fetch once and keep it.


### `trackInfo({what}?) → payload | typedError`

Static per-track data — **fetch once per session, never per tick**.
`what`: `"corners"` (default) · `"sectors"` · `"profile"` · `"all"`.

The `track` block grounds the circuit in the real world: `gp` (the Grand Prix
this is), `realLengthKm` and `lengthErrorPct` — the built geometry vs the actual
circuit (Monza builds 5777.2 m against a real 5.79 km, `-0.4%`), so an agent can
sanity-check its own world against the track it claims to be — plus `startFrac`
and `reverse`.

```js
__apex.trackInfo({ what: "corners" }).corners
// [{ turn:"T9-T10", frac, s, dir:"L", radiusM:134, k, sweepDeg:-168,
//    severity:"medium", widthM, entryS, exitS, lengthM, apexSpeedKph,
//    straightAfterM, exitsOntoStraight,
//    bankingDeg, camber, gradientPct, elevation, kerbs }, …]
//    straightAfterM = road to the next corner; exitsOntoStraight past ~120 m
```

Corners come from the curated `CircuitMarkings` apex list (real FIA turn
numbering) where a circuit has one, falling back to curvature peaks. Three
things happen to make the table trustworthy on OSM-derived centrelines:

- **Curvature is smoothed over a 30 m half-window.** Raw `Tracks.curvature`
  differentiates over 12 m, which is right for physics and too sharp to
  describe a corner — at Monza the point curvature through a fast right reads
  `+0.024, +0.022, −0.039` over 50 m. Taken literally that is a 22 m hairpin
  followed by a left. It is noise.
- **Radius comes from heading swept across the whole corner**, not from any one
  sample: `radius = arcLength / |Δheading|`.
- **Curated apexes are snapped** to the nearest smoothed-curvature peak (bounded
  by half the gap to the neighbouring turns), because `CircuitMarkings` is
  documented as best-effort against this game's centreline. Overlapping results
  are merged and keep both numbers (`"T9-T10"`).

Sanity check: Monaco's Grand Hotel hairpin resolves to ~10 m, and integrated
heading over a lap closes to exactly ±360°.

### `render({what:"circuit", detail, offset, limit}?) → document | typedError`

The **whole circuit as one structured document**. `scene()` answers "what is near
me"; this answers "what is this place".

The design problem is size, not availability. Suzuka records 3,422 point
objects; listed individually that is ~85k tokens of `pine, pine, pine` and it
describes the world no better than the raw vertex buffer did. So the model
aggregates:

- **`features`** — contiguous runs of one kind on one side, collapsed:
  `{kind:"pine", count:247, side:"left", fromS, toS, runLengthM, avgHeightM}`.
  A run is cut at a 60 m gap **or** 400 m of length, whichever comes first. The
  length cap matters: without it, trees spaced under the gap threshold all the
  way round a park circuit collapse into one feature covering 5,741 m of a
  5,777 m lap — true, and a useless description.
- **`landmarks`** — individually notable structures (grandstands, buildings,
  towers, mountains, gantries) with position and size. Landform *segments*
  (`ridge`, `peak`) cluster instead; a mountain range is hundreds of ridge
  segments and listing each would bury the real landmarks.
- **`spans`** — linear furniture (armco, catch fence, tyre walls, boundary
  walls) as arc-length spans. These are emitted in 3–6 m steps by `along()`;
  recorded per step they'd be thousands of records saying less. "Guardrail on
  the right from 0.93 to 0.07, 809 m" *is* the object.
- **`structure`** — an ANONYMOUS assembly. Each circuit's bespoke `scenery()`
  also calls the raw guarded emitters directly, and on a street circuit that is
  most of the world. Consecutive primitives that stay within 30 m of the running
  centroid are accumulated into one structure with real measured bounds and a
  `parts` count. Big ones (>6,000 m³ — casino frontages, pit complexes) are
  promoted to landmarks; the rest cluster.
- **`totals`** — counts by kind, plus `registryComplete`.

**How complete is it?** Measured by asking, for every shipped primitive, whether
its centroid falls inside some recorded placement's box: **99.5–99.8%** of
primitives across Monza, Monaco, Vegas and Suzuka, at 1,078–3,944 records per
circuit. Before the anonymous-assembly catch-all it was 85% on Monza and 21% on
Vegas — the named emitters alone miss almost everything on a street circuit.

**It is not vertex data.** `render({what:"circuit"})` describes objects and bounds. For raw
geometry use `__apex.trackGeometry()`, which needs `Tracks.setKeepGeometry(true)`
before the build and returns megabytes of floats — a file to analyse with code,
never something to read into context.

`detail: "sections"` adds a corner-by-corner walk of the lap:

```json
{ "from":"T2", "to":"T3", "lengthM":1012.6,
  "corner":{"dir":"L","radiusM":354.3,"severity":"kink"},
  "contains":{"pine":247,"tree":188,"bush":24,"grandstand":1,"motorhome":4} }
```

`detail: "full"` adds the unaggregated object list, paginated via
`offset`/`limit` (default 500, max 5000) with an `objectPage` cursor. Sign
boards keep their meaning here — `{board:"corner", value:1}` is the Turn 1
board, `{board:"braking", value:3}` the 300 m board.

Sizes: summary ~23 KB on Monza; a full Suzuka dump is ~775 KB, so write it to a
file rather than paging it through context:

```sh
node tools/agent.mjs suzuka model --detail sections
node tools/agent.mjs vegas  model --detail full --out artifacts/tmp/vegas.json
```

### `survey({stations, lats, reachM, limit, profile}?) → report | typedError`

**Geometry defects as JSON** — the screenshot-driven survey pass, made
queryable. The `survey-track` workflow hunts these classes by eye; measured
prop bounds make them coordinates you can act on.

**`survey()` always scans the whole lap — you cannot aim it at one corner.**
`stations` (default 24, alias `at`) is the *number* of evenly-spaced sample
points around the entire circuit, not a position; `reachM` is the *lateral*
half-width scanned at each one. There is no `fromS`/`toS` window the way
`query()` has one — to inspect one stretch, raise `stations` and filter the
returned rows by `frac` yourself.

Cross-checking a hit with `__apex.groundY()` confirms the report's arithmetic
but not the ground underneath it: both read the same `Tracks.terrainY()`
sampler, so a bug in that sampler would make survey and groundY agree while
both being wrong. For genuinely independent confirmation, look at the spot.

```js
__apex.survey().summary
// { propsChecked:2160, floating:0, buried:0, overVoid:0,
//   propsOverRoadCandidates:4, terrainHoles:0, groundCliffs:0,
//   terrainOverRoad:0, modelsSuppressed:0, modelsInvalid:0, clean:true }
```

Lists: `floating` · `buried` · `overVoid` · `propsOverRoadCandidates` ·
`terrainHoles` · `groundCliffs` · `terrainOverRoad` · `modelDiagnostics`.
Pass `{profile:true}` for the full lateral ground table.

It found a shipped bug on its first run: Vegas reported two invalid
primitives, `size:[0.18,true]` — `js/circuits/vegas.js` passed `mast: true` to
`tower()`, which takes a height in metres, and both landmark towers lost their
antennas silently.

**Thresholds are calibrated, and each guards a false positive that would
otherwise swamp the report:**

| Check | Why it isn't the obvious test |
|---|---|
| `floating` (base >0.6 m above **terrain**) | Props are deliberately sunk below grade — `place()` 0.8 m, `anchor()` 0.3 m. "Above zero" flags every prop in the game. |
| grounded kinds only | A 12.8×1.1×49.3 m slab 13 m up is a **roof**; gantries span the road by design. |
| `terrainHoles` outside `hw + 2.4 m` | The terrain ribbon stops ~2.2 m short of the tarmac by design and the road mesh covers the middle — counting those reported one hole per station on a clean circuit. |
| `groundCliffs` as **slope** (>0.55) | A cliff is a gradient, not a height: 1 m of rise over 10 m of lateral is a hillside. Testing absolute rise called Spa "157 steps". |

**`propsOverRoadCandidates` is a screen, not a verdict** — and is excluded from
`clean` to say so. Registry boxes are world-axis-aligned with no orientation, so
a 160 m grandstand on a curve inflates its apparent lateral extent: Monza lists
4 candidates where the vertex-level ground truth is **0**. Confirm with
`tools/measure-props-over-road.mjs`, which the payload names under
`authoritative`.

Monza reports `clean: true` while Spa, Monaco and Vegas do not — that
discrimination is the property that makes the check worth running.

### `render({what:"map", radiusM, cols, northUp}?) → map | typedError`

The **allocentric top-down map** — the companion to `render({what:"view"})`'s
first-person view, and the text companion of a survey-track aerial / topdown
(not the `--oblique` PNG pass). The first-person
raster forces a reference-frame shift for any "where am I on the circuit"
question; the map answers it directly, drawn **car-up** (forward is up) so no rotation is needed to
drive, or `{northUp:true}` for the world frame.

```
                     :#. t tt
                   t    :.@. tt t          @ = you (centre, facing up)
                 t      #:..: #t           . road   : kerb   t tree   # structure
```

Grounded in the research split: [VoT](https://arxiv.org/abs/2404.03622) (+27%
from a 2-D text grid), [GSU](https://arxiv.org/pdf/2603.17333) (Cartesian
coordinates beat an ASCII layout — so provide **both**), STMR (semantic +
topological + metric together wins). The raster is the gestalt; the payload also
carries a **metric index** so nothing is measured off the characters:

```js
{ frame:"car-up …", scale:{radiusM, metresPerCol, metresPerRow, cols, rows, note},
  grid:{ lines, ruler, rulerLabel },
  ego:{ headingDeg, speedKph, elevationM, onTrackFrac, lateralM, nextCorner },
  corners:[{ turn, dir, radiusM, cell:[col,row], world:[x,z], aheadM, rightM, distM, bearingDeg }],
  landmarks:[{ kind, sizeM, cell, world, aheadM, rightM, distM, bearingDeg }],
  cars:[{ id, code, aheadM, rightM }] }
```

`node tools/agent.mjs monza plan --radius 200`.

### `carView({team, parts, detail}?) → payload | typedError`

**The car-viewer replacement**, for everything except appearance itself.

```js
__apex.carView({ team: "ferrari" })
// { team:{id,name,engine,tier,colors,stats,drivers},
//   parts:{ budget, spent, remaining,
//           chosen:[{category,option,optionLabel,cost,desc,tier,supplier}] ×8,
//           mods:{speed,accel,cornering,braking} },
//   chassis:{ style:{noseTipZ,noseSlim,noseDroop,airbox,fin,mirror,inlet},
//             bespokeSilhouette, axles, stations },
//   geometry:{ vertices, triangles, lengthM, widthM, heightM, wheelbaseM,
//              boundsM, note } }
```

`geometry` is **measured from a real `Car3D.build`**, not declared — 5.95 m long,
2.10 m wide, 1.01 m tall, 3.30 m wheelbase on the default chassis. `chassis.style`
is the per-team silhouette: nose length/width/droop, airbox scale, dorsal fin,
mirror housing, sidepod inlet bias — what makes a team's car recognisable
independent of paint.

`detail:"render"` adds **orthographic edge+shade elevations** (side, top, front)
rasterised from the real mesh — the text version of the car photo studio. Depth
discontinuities become `| - / \` edges; interiors are Lambert-shaded into a
` .:-=+*oO#%@` ramp. `node tools/agent.mjs monza car --detail render`.

`detail:"parts"` adds **per-part measured boxes** under `partGeometry`
(`parts` stays the parts *spec*), taken from the vertices each
section of `Car3D.build` emitted — 19 sections including `chassis`, `sidepods`,
`engineCover`, `frontWing`, `rearAssembly`, `halo`, `mirrors`, `helmet`,
`suspension`, `wheels`:

```js
__apex.carView({ detail: "parts" }).partGeometry
// [{ name:"frontWing", vertices:486, sizeM:[1.89,0.42,1.91],
//    centreM:[0,0.24,1.77], boundsZ:[0.81,2.72] }, …]
```

Instrumentation only — the mesh is vertex-identical with or without it (10,992
either way on the default car), and the sections partition the mesh exactly, so
their vertex counts sum to the whole. Per-team silhouette shows up in the
measurements: the nose tip sits at z 2.54 / 2.60 / 2.68 for McLaren / Ferrari /
Mercedes, tracking each team's `noseTipZ`.

Caveat: sections are **ranges between markers**, so a section can carry a little
adjacent detail — `sharkFin` reports ~36 vertices even for a team whose
`chassis.style.fin` is 0. Read a conditional feature's presence from
`chassis.style`, not from a section's vertex count.

For "does it *look* right" — reflections, decal placement, paint reading — use
`tools/car/render-car.mjs`. This answers everything else without a render.


---

### Act — drive, and know when it ended


### `rollout(opts?) → digest | typedError`

Drive an interval and get a **digest**, not frames. A 5 s experiment at 60 Hz is
300 observations; reading them back costs tens of thousands of tokens to answer
a question a few hundred can ("did that change carry more speed through T4?").

| opt | default | meaning |
|---|---|---|
| `seconds` | `5` | wall-clock sim seconds (0.05–120) |
| `dt` | `1/60` | tick size |
| `input` | — | constant `{steer,throttle,brake}` — open-loop probe |
| `policy` | — | `(world) => {steer,throttle,brake}` — closed-loop |
| `policyHz` | `10` | how often the policy is consulted |
| `samples` | `12` | waypoints in the returned trace (2–60) |

```js
__apex.rollout({ seconds: 6, input: { steer: 0, throttle: true } })
// { ran:{ticks,dt,seconds,policy}, from:{frac,lap}, to:{frac,lap}, distanceM,
//   speedKph:{min,max,mean,final}, offTrack:{events,seconds,pct},
//   minClearanceM, wallContacts, lapsCompleted, lastLapS,
//   cornerMinSpeedKph:[{turn,minSpeedKph}], terminal:{done,reason,atS},
//   samples:[{t,frac,speedKph,lateralM,gear}] }
```

`policy` implements the loop the real-time agent literature converges on: an LLM
cannot decide at 60 Hz, so the policy is consulted at `policyHz` while physics
steps every tick. A policy that throws returns a typed `PolicyError` rather than
tearing down the run.

`cornerMinSpeedKph` is the field to watch for setup and physics work — minimum
speed through each corner *actually driven* is what a change moves.

`rollout` calls `world()` internally when given a policy, and restores the
`seq`/delta baseline afterwards, so it cannot silently break a caller's
`since=` chain.

### `terminal() → {done, reason} | typedError`

`reason` is `"retired"` · `"finished"` · `"wrong_way"` · `"rescued"` · `null`. `obs().done`
conflates the last two, so an agent cannot tell "my policy spun the car" from
"the sim teleported me".


---

### Discover and drive from a shell


### `agentHelp() → manifest`

Names the surface, the staging sequence and the loop, so an agent can find its
way without loading this file. `node tools/agent.mjs help`. Sections:
`perceive`/`know`/`act` (the calls, grouped by the question they answer),
`fields` (a **glossary** mapping the identifiers in a payload to *what to do
about them* — `"ego.headingErrDeg": "+ = nose right of the road; steer the
opposite sign to null it"`; the highest-value part), `read` (the raw `__apex`
hooks that already return JSON, call them directly), `control` (the drive/stage
verbs), `model` (static-vs-dynamic and decide-vs-show notes). Read once; it is
under 6 KB and asserted so. What the *game* is — as opposed to the API — is
`objective()`.

### From a shell — `tools/agent.mjs`

The same surface as a CLI, so an agent driving from a terminal doesn't hand-roll
Playwright boot + `race`/`go`/`jump` staging + `page.evaluate` for every
question. That boilerplate is where the sharp edges are (a stale camera because
no frame rendered; a null `obs()` because `player.px` was never initialised) —
this does the staging correctly once.

```sh
node tools/agent.mjs help                                  # the manifest
node tools/agent.mjs monza  objective                      # what the game IS
node tools/agent.mjs monza  world   --detail brief --at 0.25 --speed 70
node tools/agent.mjs monza  field   --detail full          # the grid / standings
node tools/agent.mjs monza  atmosphere                     # the light as text
node tools/agent.mjs monza  render  --what view --cols 72  # the ONE raster aid
node tools/agent.mjs monza  scene   --radius 120 --kinds tree,building --limit 8
node tools/agent.mjs monza  describe --id corner:T3        # one thing in full
node tools/agent.mjs monza  query   --kind pine --near 80  # a bounded slice
node tools/agent.mjs monaco track   --what corners
node tools/agent.mjs vegas  model   --detail sections
node tools/agent.mjs monza  car     --team ferrari --detail parts
node tools/agent.mjs vegas  survey  --stations 32 --reach 80
node tools/agent.mjs monza  rollout --seconds 6 --steer 0.1 --throttle
```

`frame` prints the grid itself rather than a JSON string array — the raster is
meant to be looked at. `--out <file>` writes any command's JSON to disk, which
is how you want a full `model` dump (hundreds of KB).

Staging flags apply to every command: `--at <frac>` `--speed <m/s>`
`--lateral <m>` `--weather` `--tod`. Use `apex-eval.mjs` for an arbitrary
`__apex` expression when you need the escape hatch.

### Recommended loop

An LLM cannot sustain 60 Hz decisions. Use the deterministic stepping below to
turn this into a turn-based problem:

```js
__apex.headless(true);
__apex.race("monza"); __apex.go(); __apex.jump(0.1, 55);
let w = __apex.world({ detail: "drive" });
// decide from w …
w = (__apex.act({ steer: 0.2, throttle: true }, 1/60, 10), __apex.world({ since: w.seq }));
```

---

## Career & qualifying

Career mode's hooks (`js/game/career.js`, `js/game/quali.js`). See
[CAREER.md](CAREER.md) for the design; this is the API surface.

Two things to know before using any of them. **A career save existing is not the
same as a career being played** — the save is read at boot so the title button can
offer CONTINUE, but its rules only apply while `flow` is `"career"`. And a career
**is** a championship, so `info().seasonMode` stays `true` inside one.

### `info()` — additions
`flow` (`"gp" | "season" | "career"`), `session` (`"race" | "tt" | "quali"`) and
`career` (bool: a save exists). `timeTrial` and `seasonMode` are unchanged derived
views of those, so older harnesses keep working.

### `career(opts?) → save | null`
No args returns the whole `apex26.career` save, or `null`. Pass `true` to resume
the stored career and open the hub. Pass an object to start a NEW career and open
the hub, skipping the setup screen.

| Option | Meaning |
|---|---|
| `flavour` | `"driver"` (default) or `"myteam"` |
| `teamId` | who you drive for; ignored for `myteam`, which is always `custom` |
| `seat` | 0 or 1 — which of the team's two seats you take |
| `name`, `code`, `num` | your driver identity |
| `hire` | MY TEAM only: the `code` of the free agent to sign |
| `seed` | fixes every career draw; same seed → same career |

```js
__apex.career({ teamId: "haas", seat: 1, code: "ZZZ", seed: 4242 });
__apex.career().season.round;   // 0
```

### `careerState() → {...} | null`
Compact snapshot — prefer this to reading the save. `flavour`, `year`, `round`,
`rounds`, `team`, `teamName`, `money`, `rep`, `budget`, `budgetLvl`, `owned`
(count), `deal`, `obj`, `dnfs` (retirements this season), `offers` (count),
`seasons`, and — MY TEAM only — `roster` and `wages`.

### `careerMoney(n?) → number | null`
Get or set the balance. A test that wants to buy a part should not have to drive
twelve races first.

### `careerSim(n) → [round, …] | null`
Settle `n` rounds with nobody driving, through the **same** `Career.settleRound()`
the driven path uses — so prize money, objectives, reputation and the standings are
genuinely exercised, not approximated. Each entry is `{round, podium, pos, pts,
prize, salary, bonus, wages, obj, dnf, sponsorPay, money, rep, save, unsaved}` —
`dnf` is `null` for a finish and the failure reason for a retirement.

Needs a track and a grid loaded, because the qualifying model reads both: stage one
weekend first. Every round is simulated on **that** circuit — the per-round
variation comes from the seeded draw, not from rebuilding twenty-four tracks
headlessly.

```js
__apex.career({ teamId: "haas", seed: 1 });   // then stage a weekend…
__apex.careerSim(24);                          // …and fast-forward the season
```

### `careerRollover() → {champion, offers, history} | null`
Force the season rollover: archive the year, develop drivers and teams, run the
driver market, and put contract offers on the table. What the end-of-season sheet
reads.

### `careerReset() → true`
Wipe the **live** slot. The other five are untouched.

### `careerSlots(flavour?, i?) → [{flavour, i, used, …}] | save | null`
Six careers can be saved at once, in **two sets of three** — `apex26.career.driver.N`
and `apex26.career.myteam.N` — so neither mode can cost the other room. A slot's
address is **both halves**; an index alone does not say which career it is.

No argument lists all six. A flavour narrows to that set. A flavour *and* an index
**switches** to that slot and returns the save it holds (`null` if empty); switching
writes the career being left first. Rows carry `used`, and for a used slot `live`,
`flavour`, `team`/`teamName`, `year`, `round`/`rounds`, `money`, `rep`, `seasons`,
`wins`, `titles`.

```js
__apex.career({ teamId: "haas", seat: 1, seed: 11 });        // -> driver slot 0
__apex.career({ flavour: "myteam", hire: "OKO", seed: 22 }); // -> myteam slot 0
__apex.careerSlots().map((s) => s.flavour + s.i + ":" + s.used);
// -> ["driver0:true","driver1:false","driver2:false","myteam0:true", …]
__apex.careerSlots("driver", 0).team;   // -> "haas", and it is now live
```

A career's **own flavour decides its set** — `career({teamId:"audi", slot:2})` fills
driver slot 2, and no argument can put a driver career in the MY TEAM set.

### `careerFreeMoney(on?) → boolean`
EXTRA FUNDS — a deliberate cheat, off by default. Money stops being the
constraint; **the fitted cap does not move**, so a bottomless balance still cannot
put more on the car than the rules allow. Stored *outside* the save
(`apex26.career.freeMoney`) because it is a preference about how you want to play,
not a fact about one career.

### `careerGrant(n?) → number | null`
Hand the live career credits; no argument grants `Career.GRANT` (5,000). Returns the
new balance, or `null` with no career loaded.

### `careerFacility(up?) → {level, max, cost, discount}`
The open-ended research facility — the money sink that keeps working once the
catalog is owned. Each level is a permanent cut to what research costs (5% per
level, capped at 40%). Pass a truthy argument to buy the next level. `cost` is
`null` at the ceiling.

```js
__apex.careerMoney(999999);
__apex.careerFacility(true);      // → { level: 1, max: 8, cost: 4800, discount: 0.05 }
```

### `careerHire(what?) → {kind, code, name, salary, ask} | null`
MY TEAM's second seat. No argument reports whether a decision is pending — `null`
means under contract. `kind` is `"renew"` (they will re-sign at `ask`) or `"left"`
(a better offer took them; only ever possible after they outperformed the car).
Pass `"renew"` to take their asking price, or a free-agent **code** to sign somebody
else. An unresolved seat blocks the weekend: MY TEAM enters two cars.

```js
__apex.careerHire();          // → { kind: "renew", code: "NKM", salary: 38, ask: 44 }
__apex.careerHire("renew");   // → null — signed, and the block is cleared
```

### `careerSlotDelete(flavour, i) → [{flavour, i, used, …}]`
Wipe **one** slot, live or not, and return all six. Reloads whatever is left
afterwards, so the title screen still has something behind it.

### `ratings(code?) → {pace, craft, awareness, consistency, experience, overall}`
The five-axis driver table (`js/car/driver-ratings.js`) with any career development
folded in. No args returns the whole grid keyed by code. **Ratings apply in every
mode**, not just career — the grid has personality in a one-off Grand Prix too.
`consistency` is a *variance* axis: it narrows the random band around a driver's
pace rather than raising it. An unknown code resolves through a deterministic tier
hash, so a custom or generated driver still has a stable personality.

### `qualiSim(playerTime?) → [{pos, driverId, code, name, team, t, gap, isPlayer, human}, …] | null`
The qualifying model's times for the **loaded** track, fastest first, **without**
running a session — a real weekend's classification is left alone. Pass a lap time
to substitute it for the player's row.

The AI field is modelled rather than driven: a quasi-steady forward/backward lap
simulation off the same `LAT_MAX`/`ACCEL`/`BRAKE` constants the driving model uses,
so a simulated time and a driven one land on one scale by construction.

```js
__apex.race("monza");
__apex.qualiSim()[0];   // → { pos:1, code:"VER", t:100.958, gap:0, … }
```

### `carAt(i)` — additions
`code`, `seat`, `tierV`, `skill`, `aeroLoad`, `ersDeploy` and `ratings`. `tierV` and `skill` are the two
multipliers that decide how fast an AI car is allowed to be (`vmax = VMAX · PACE ·
tierV · skill · difficulty`), so "why is this car quick?" is answerable without
reading the source. `tierV` folds the team's `TIER_V` together with career team
development; `skill` is the driver. `aeroLoad` / `ersDeploy` are the works-car
wing and ERS map the AI now actually runs (0.5 if unset).

## Reliability & retirements

Whether a car reaches the flag at all (`js/game/reliability.js`; see
[CAREER.md](CAREER.md#reliability-and-retirements) for the design). Risk comes from
the team tier, is relieved by career team development and by what the player has
spent on the power unit and gearbox, and the whole field's retirements are drawn
**once, at the green light** from a stateless hash of `(seed, round, driver)` — the
sim RNG stream is never touched, so arming a race cannot shift a seeded result.

**It ships OFF.** A retirement is opt-in via the RELIABILITY race setting.

### `reliability(level?) → "off" | "low" | "real"`
Get or set the setting. Persisted (`apex26.reliability`), like difficulty. Setting
it does **not** re-arm a race already running.

### `retirements() → [{idx, code, retired, why, at}, …]`
The retirement PLAN for the staged race: who is going to stop, `why` (`"engine" |
"gearbox" | "accident"`) and `at` what fraction of race distance — plus anyone who
already has (`retired: true`). Empty when reliability is off or the draw spared the
whole field. Deterministic: the same seed and round always give the same list.

```js
__apex.seed(7); __apex.reliability("real");
__apex.race("monza");
__apex.retirements();   // → [{ idx:4, code:"NOR", why:"gearbox", at:0.715 }, …]
```

### `retire(idx?, reason?) → {idx, code, retired, why} | null`
Retire a car **now**, whatever the draw said. `idx` indexes `cars[]`; no argument
retires the player. The car is parked against the barrier on the side it was
already on, stops being steered, and classifies below every finisher with no
points. The one way to get a guaranteed DNF without racing until the probability
obliges.

### `carAt(i)` / `fieldState()` — additions
`retired` and `dnf` (the reason, `null` unless the car actually stopped). `carAt`
also carries `dnfAt` — the planned retirement point it has not reached yet — and
`finPos`, the classified position (0 until the flag).

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

> ⚠️ **Headless skips ALL rendering — never combine it with screenshots.**
> Because `render()` returns early in headless mode, the WebGL canvas is *frozen*
> on whatever frame was last drawn. Any `view()` / `orbit()` / `camera()` change
> you make while headless takes effect in the game state but is **never drawn**,
> so a Playwright `page.screenshot()` captures a **stale frame** — typically the
> grid/chase view from before you moved the camera (the classic "I framed a
> beautiful aerial but the PNG shows a grey wall" trap). For any visual capture,
> leave headless **off** (or call `__apex.headless(false)` first) so the render
> loop runs. Headless is for the physics-only `obs()`/`act()` loop only.

### `obs() → observation | null`
Full debug observation of the current game state — superset of `physState()` and
`probe()` with track context, barrier clearances, lookahead scan, and rival
proximity. Returns `null` if no track is loaded.

| Field(s) | Description |
|---|---|
| `s, x, prog, lap, raceT` | Position, progress (m cumulative), lap count, race clock |
| `speed, speedKph, head, vLat` | Motion: TRUE ground speed (m/s), heading (rad), lateral velocity |
| `dashKph` | What the HUD/cockpit dial reads — km/h pace-normalised (see `setPhysics`'s `pace`) |
| `axEstSm, axFrac, slipFactor, slipDeg` | Combined-slip state (see `physState()`) |
| `k, hw, slope, gripMult, weather` | Track context at player: curvature, half-width, road pitch, grip multiplier |
| `wallR, wallL, clearR, clearL` | Signed barrier distances and clearances to each side (m) |
| `energy` | ERS charge level 0–1 |
| `gear` | Current gear (1–8) |
| `wrongWay, offT, rescueT, done` | Episode flags: `done = wrongWay ∥ rescued within the last 0.5 s` |
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
await (await import("node:fs/promises")).mkdir("artifacts/tmp", { recursive: true });
await page.locator("canvas#game").screenshot({ path: "artifacts/tmp/t1.png" });
```

`race()` is more robust than clicking through the menus and is the recommended
entry point for any screenshot/verification harness.

---

## `studio(opts?)` — studio light rig around the player car

Summons an inspection lighting rig that FOLLOWS the player car — a ring of
aimed point lamps plus an overhead key — replacing the session lamps while
active. Use it to test paint, clearcoat glints and reflections on any track at
any time of day, independent of the circuit's real lighting.

```js
__apex.studio()                                  // default: 6-lamp ring + overhead key
__apex.studio({ n: 8, dist: 6, h: 4, intensity: 4, color: [1, 0.9, 0.8] })
__apex.studio({ spin: 0.5 })                     // rotate the ring (radians)
__apex.studio(false)                             // off — session lamps restored
```

Options: `n` lamps in the ring (6), `dist` m from the car (7), `h` height (4.5),
`intensity` (1.6, pre-scaled to the track-lamp energy convention), `color`
linear RGB ([1,1,1]), `radius` falloff (18), `spin`, and `fill` (0.5) — how far
the scene ambient is lifted toward a neutral studio level while the rig is up
(at night the ambient is near-black and an unlit body reads as a silhouette).
The rig draws no corona/beam billboards (its lamps have no fixtures), and
`studio(false)` restores the session ambient + lamps. Note: `setTimeOfDay()`
while active rebuilds the ambient — call `studio()` again after switching.

For a one-command inspection render, use the committed tool:

```sh
node tools/car/carshot.mjs 40 night 2    # az, day|dusk|night, team index → ~6 KB crop
```

Pair with the car walk-around camera:

```js
__apex.park(0.3); __apex.studio({ intensity: 4 });
__apex.carOrbit(0, 40, 8, 4);    // az 0 = behind the car, 180 = head-on
```
