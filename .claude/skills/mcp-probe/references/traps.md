# MCP probe traps (load on demand)

Twelve measured traps, each as a rule plus the check that proves you are
clear of it. The dated narratives behind them are in git history
(`git log -p -- .claude/skills/mcp-probe/references/traps.md`); this file is
the rule, not the story.

## Machine load

**1.** The one that costs a whole run: never render in the MCP browser while Playwright is running. A live
game page in the MCP browser holds ~20 % CPU; on four cores that turned two
passing specs red (a 120 s timeout and a stale-frame assertion) and, on a later
day, load 8–12 with `page.screenshot: Timeout 60000ms`. Rules:

- `node tools/ci/test-bg.mjs --status` before you render here; if a group is
  running, wait.
- Park to `about:blank` (`navigate_page`) before EVERY `test-bg.mjs` launch,
  unconditionally — the one time it is skipped is the contaminated run.
- Parking is necessary, not sufficient: emulation overrides survive navigation
  and a blank MCP page once held 174 % CPU. After the run starts, check by
  process AGE and kill by PID:

  ```sh
  ps -eo pid,etimes,pcpu,comm | awk '$4 ~ /chrome/ {print $1, $2"s", $3"%"}'
  for p in $(ps -eo pid,etimes,comm | awk '$2>120 && $3 ~ /chrome/ {print $1}'); do
    kill -9 $p 2>/dev/null   # >120 s pre-dates the run: the MCP browser's, not Playwright's
  done
  ```

- A screenshot with the left ~400 px solid black is the hidden WebGL canvas,
  not the MCP: await `GLX.awaitSoftPresent()` then capture `#game-soft`. For
  UI work, `headless(true)` and hide `#game` (survey-ui-matrix).

## Cameras

**2. `snapCam()` after a free-cam call cancels the free-cam.** `park()`/`jump()`
need `snapCam()`; `orbit()`/`view()`/`dolly()`/`eyeAt()`/`roadside()`/
`cinematic()`/`sky()` do not — `snapCam()` sets `G.dbgCam = null` and snaps back
to the player camera, silently, so a before/after pair lands on two framings.
After a free-cam call wait two `requestAnimationFrame`s instead; confirm with
`viewState().dbgCamActive`.

**5. Only player-relative modes hold still for a frozen pair.** `heli`, `far`
and other broadcast modes re-cut between calls even with the player frozen;
`chase` (and `cockpit`/`hood`/`reverse`/`tcam`) hold `eye`/`tgt` to five
decimals. Also: any free-cam hook zeroes the draw-distance cull on desktop
(`frame.cullDist`), so a render-distance knob shows nothing under
`orbit()`/`view()`; and a `park()` before the start-lights resolve is discarded
by the next `step()`. The safe recipe:

```js
__apex.race(track); /* wait */ __apex.go();
__apex.step(1/60, 120);          // clear the start-lights hold FIRST
__apex.camera('chase');          // player-relative
__apex.park(s); __apex.snapCam();
// record viewState().eye/.tgt, shoot; change ONLY the tuned value; short step();
// re-check eye/tgt equal before the second shot, and again right after it
```

**7. The chase cam auto-cuts to a broadcast angle after ~2 s idle**, and every
~2.3 s after that, with `camMode` still reporting `"chase"`. Shoot within
~1.5 s of `snapCam()`, or use the free-cam family for a multi-shot sequence
(zero drift over 3 s in the same session).

**10. Camera `lat` and circuit `gap` are different spaces.** `eyeAt(f, lat)`
measures from the centreline; `anchor(k, side, gap)` and `building(...)`
measure beyond the road edge (`lat = side * (hw + gap)`, plus `w / 2` for a
building's mass centre). When the frame exists, skip the arithmetic: read
`scene().props[].at` and aim with `view({eye, yaw, pitch})` in world space.
`orbit()` always targets the centreline at `f`.

**12. The camera only advances on real rAF frames, not on `step()`/`act()`.**
A tight `act(); viewState()` loop reads a camera frozen at the last rendered
frame while the heading marches on. Null test first: if `dAim` is 0 while
`dHead` is not, stop. Sample inside `requestAnimationFrame` and drive with a
real key event over wall-clock time; under SwiftShader filter to frames with
`yawRate > 5` and report a median.

## Measurement

**3. Verify `TUNE_DEFS` by grep, not memory.** Seven knobs were once tested
against guessed defaults. `grep -n 'id: "<knobId>"' js/lighting/knobs.js`
immediately before testing and read `min`/`max`/`def` off that line. A knob
that shows nothing frame-wide may be spatially thin (a 2–3 px flare streak):
diff horizontal bands independently.

**4. Two same-value screenshots must diff near zero before any pair counts.**
A moving car under a free-cam after `jump()` gave a same-value MAD of 5.96
against a "signal" of 6.03. Use `park()` (freezes the car) before free-cam
comparisons; it dropped the floor to 0.42. For sky/cloud knobs avoid `sky()`
(its ~58° pitch collapses the cloud sample toward one point): `park()` plus a
`view({eye, yaw, pitch: 25–35})` toward the horizon, nudge `cloudCover`, and
look for a cloud-shaped blob in a saved diff map.

**8. `lightState().numLights` reads 0 until enough frames render.** It is the
per-frame culled count; after `race()` or `setTimeOfDay()` it read 0 for up to
2.7 s on this box. Never sample it on a timer:

```js
let n = 0;
for (let i = 0; i < 40 && n === 0; i++) {
  await new Promise(r => requestAnimationFrame(r));
  n = __apex.lightState().numLights;
}
```

`bakedLights > 0 && numLights === 0` means not settled; `bakedLights === 0`
means the circuit baked no lights.

**9. `scene()` lists what the circuit ASKED for, not what got drawn.** Model
helpers `note()` themselves before their emit guards, so a prop that emits
zero vertices still appears with a plausible `at`. The honest instrument is the
vertex count from `node tools/track/verify-track.cjs <id>` with the call
commented in and out — run a control (`addBox` × 50 must move it by +1200)
first, and remember that MOVING a prop never changes the count.

**11. A screenshot cannot say WHICH mesh hides another.** A near-clipped mesh
looks washed out, not clipped; `render({what:"view"})`'s `player` entry is the
car's bounding box; hand-rolled projection is wrong on the cockpit rig. Patch
`GLX.createMesh`/`begin`/`draw` from an `initScript`, rasterise both meshes
into a JS depth buffer and attribute every lost pixel to a `part()` name —
[`../../../../docs/notes/OCCLUSION-PROBE.md`](../../../../docs/notes/OCCLUSION-PROBE.md).
`2722 px → 0 px` beats "looks better now".

## Fixed, kept for the shape

**6. `jump()`/`park()` used to render the car mid-air** (fixed 2026-08-13:
`jump()` now syncs `rPrevPx`/`rPrevPz`). If a screenshot ever shows the car
detached from the road while `physState()` reads correctly, compare `rPrevPx`
with `px` before distrusting the shot.
