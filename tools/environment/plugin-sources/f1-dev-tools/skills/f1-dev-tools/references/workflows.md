# Executable workflows

These examples run through a browser evaluate call on the SAME local game page after loading `scripts/browser.js`. Transfer JSON through structured arguments, never concatenate untrusted JSON into JavaScript or shell code.

## 1. Scene reproduction

Enter the reported race and call `F1Dev.capture()`. Save the returned document as `artifacts/f1-scene.json`. It includes the native `__apex.repro()` blob and a camera/build/viewport inspection. This is a static frame recipe: it does not serialize a full physics session, replay trace data, career state, active free-camera pose, or renderer configuration.

Restore in a disposable browser profile at the same viewport and renderer. If team or halo differ, set ONLY `apex26.team` to `String(scene.repro.teamIdx)` and `apex26.cockpitHalo` to `scene.repro.halo ? "1" : "0"`, skipping null values, then reload and load the helper again. The helper refuses a mismatch before applying anything. Call `await F1Dev.restore(scene)`; partial car placement or a wrong team is an error. Review build differences explicitly. Restore freezes the scene, as the native repro hook does, and places the captured inspection frame in a temporary static view. It preserves the current driving-camera mode, sparse tuner overrides, global/comfort inheritance and saved preferences; `inspection.camera.mode` therefore describes the driving mode, while `result.cam` names the captured scene mode. Call `__apex.view("chase")` to leave this static view before driving or calling `previewPreset`.

Restore validates the native v1 scene fields before calling any mutating API: finite car positions/progress/speeds, unique nonnegative car indices, one identified player, matching player/team identity, a known track and camera, finite captured eye/target/FOV and a valid far plane when present, and tuner values within the current registry bounds. Malformed JSON is rejected before it can apply camera settings or car state. Valid cross-session grids can still produce native partial-placement errors; use a disposable profile for those compatibility failures.

For cockpit evidence, read the header of `tools/shot/repro-shot.mjs`: its frozen cockpit capture has a documented incorrect-frame history. Use the documented live `race → go → camera → tune → jump` route in the isolated profile and allow real render frames. Do not label frozen cockpit repro output a validated player view.

## 2. Inspection and motion

`F1Dev.diagnose()` should be the first call on a page. It records the exact URL, document visibility/readiness, service-worker controller, `__apex.agentHelp()` manifest and the `F1Dev.inspect()` report in a `f1-dev-diagnostic/v1` document. It is read-only and is useful for proving which deployed shell and worker controlled a reproduction. `F1Dev.inspect()` reports the active track, camera mode, eye/target/FOV, damping anchors, simulation/render clocks, renderer/software information, viewport, reduced motion, and WATCH replay status where available. Optional unsupported diagnostics report an `unavailable` reason.

For release evidence, `await F1Dev.checkAssets(["/version.json", "/index.html", "/js/game.js?v=..."])` fetches each URL with `cache: "no-store"` and records the final URL, status, cache headers, byte count, elapsed time and SHA-256 of the response bytes. It performs no writes and continues after an individual timeout or HTTP error so a partial deployment is visible in one report. `await F1Dev.storageReport()` records localStorage key names and character counts plus `navigator.storage.estimate()`; it deliberately omits saved values and does not clear caches.

`await F1Dev.trace({label:"watch-seek", frames:12, timeoutMs:30000})` records distinct rendered frame numbers through requestAnimationFrame. Hidden tabs and a non-rendering page time out; never replace that with `step()` and claim smoothness. For screenshots await `__apex.awaitPresent()` using the repo's current renderer guidance and capture the visible canvas, including `#game-soft` where used. Inspect console errors as well.

## 3. Before/after comparison

Capture the same scene, production action, trace label, frame count, viewport, renderer and reduced-motion setting before and after the source change. Capture opening/middle/end frames at desktop and landscape-phone sizes. Keep a manifest recording the two commits, inputs, synthetic/real data, and matching PNGs. Run from the game checkout:

```sh
node <skill-root>/scripts/compare.mjs compare artifacts/before-trace.json artifacts/after-trace.json --out artifacts/f1-comparison.json
node <skill-root>/scripts/compare.mjs gallery artifacts/before-middle.png artifacts/after-middle.png --out artifacts/f1-middle.html
```

Replace `<skill-root>` with this SKILL.md's directory. The report includes maximum eye/target/FOV steps and frame interval changes. Exit 2 means metadata does not match; it is not a comparable pair. Compare matching opening and end frames as well. The HTML embeds the original PNG bytes without editing them. Metrics alone neither approve nor reject shot cuts. Explain any legitimate cut and inspect motion and track context directly. Software frame times measure the test machine, not a player's GPU.

## 4. WATCH replay transitions

Start WATCH through Data Hub with the desired real race and driver. Reuse the repo's fixture routing if external data is unavailable, and label it synthetic. Do not construct a parallel replay implementation.

Read `RealRace.replay().status()` and `.describe()` to discover duration, driver codes and allowed speeds. Then call, using valid values for the active replay:

```js
await F1Dev.replayCheck([
  {seek: 20},
  {pause: true},
  {follow: "LEC"},
  {pause: false},
  {speed: 2}
], {frames:12, timeoutMs:30000})
```

The helper validates the whole batch, invokes the production replay API, records camera history BEFORE each action and distinct render frames after it, and restores clock/driver/speed/pause on success or failure. It never calls `snapCam()` or a camera reset to hide a discontinuity. It does not restore the director's entire internal shot history: run in the disposable profile.

Driver availability is checked immediately before each follow action, including after seeks, and the resulting followed code must match. A retired/unavailable driver or a no-op follow rejects the check.

Checks require an unfinished full replay; highlight reels are rejected because automatic cuts can finish independently of elapsed playback time. Before any action, the helper budgets the entire batch using each trace's timeout plus a one-second scheduling/fixed-step margin, multiplied by the current projected replay speed. Seeks reset the projected clock; pause and speed actions update the budget. An unpaused action that could reach duration is rejected before any batch mutation. Shorten `timeoutMs` or pause first near the end; paused traces do not consume playback time. This intentionally overestimates ordinary rendered playback, whose native fixed-step simulation does not run faster than wall time. Do not run concurrent transport controls, `__apex.step()`/accelerated simulation, or another replay-check operation during a check. The budget assumes normal browser scheduling; it cannot promise restoration after an external lifecycle change, arbitrary main-thread stalls, or another caller finishing/exiting WATCH. The helper cannot undo a completed WATCH lifecycle.

Also exercise the actual WATCH controls via the browser: `[data-wt="play"]` for pause, `[data-wt="driver"]` for driver and `[data-wt="seek"]` for the timeline (check current DOM before using selectors). Test backward and forward seeks, mid-race start, paused follow changes, speed changes, skip where relevant, exit and re-entry. Confirm saved driving camera settings and reduced-motion behavior across exit. A hook trace alone is not user-control or lifecycle coverage.

## 5. Camera preset preview/export

Use the existing pause-menu Camera Tuner for interactive sliders. Discover current modes with `__apex.camera().modes` and knobs/bounds with `__apex.camTune().defs`; do not hardcode six knobs, since corner lead/hang are also tunable.

`F1Dev.previewPreset("chase", {height:0.6, dist:2, fov:-4}, {frac:0.2, speed:60, lateral:0})` returns preview geometry and a native `{v:1,modes,global,comfort}` preset pack for JSON export. It validates knobs and values; stores the full raw pack; applies changes synchronously with `CamTune.set()`; calls the game's actual preview solver; restores raw overrides in `finally`; and does not persist. Exit sky/free/debug-camera modes first. This geometry preview restores the driving view before returning; it is not a live animated preview.

For visible tuning use the game's existing panel in the disposable profile. Export `result.preset` for review. Only apply/persist a preset to the user's saved driving settings when that change is requested. The helper's preview does not certify corner framing: validate motion on the real track and current renderer before committing a preset.

## Sources and compatibility

Checked against brycejmurrin/f1-game's default branch on 2026-10-15: `js/agent/apex.js`, `js/camera/offsets.js`, `js/race/real-race.js`, `js/race/real-replay.js`, `js/ui/watch-transport.js`, `docs/DEBUG-HOOKS.md`, `docs/AGENT-SURFACE.md`. Treat the current checkout and `agentHelp()` as authoritative when APIs change.

- https://github.com/brycejmurrin/f1-game
- https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
- https://playwright.dev/docs/screenshots
