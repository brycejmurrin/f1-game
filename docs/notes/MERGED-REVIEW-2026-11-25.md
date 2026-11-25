# Merged-set review — 2026-11-25
Kind: review · Re-measure-by: 2027-02-25

This is a fresh-eyes review of the PRs merged on the deploy branch since 2026-11-24T18:00Z. Bryce asked for it
(orchestrator, 2026-11-25 ~01:26Z). Each of these PRs was reviewed on its own when it merged. This review looks
instead at regressions and bad interactions BETWEEN them.

- Tip reviewed: `282eef07` (#6405).
- Method: five `code-hunter` slices ran in parallel (input.js, phone controller, photo/garage/render,
  menus/settings, race/replay/game.js). One `finding-verifier` then re-checked every row on the tip.
- It is a static read only: no browser, no tests run, no code edited. Bryce picks the fixes.

## Merges, by subsystem

The list comes from `git log --merges --first-parent --since=2026-11-24T18:00Z`. Train merges count as one entry, and
docs/tooling-only merges are listed last.

- **input.js** (7 PRs): #6247, #6316, #6343, #6318, #6361 (#6319, #6336), #6373 (#6328), #6393.
- **phone controller / touch**: #6247, #6366, #6372, #6334, #6393 (codec), #6361 (touch-button-actions).
- **photo studio / garage / render**: #6313, #6386, #6345, #6247 (photo-cam), #6396, #6374.
- **menus / settings / layout**: #6310, #6312, #6344, #6386, #6339, #6405, #6361 (quality-preset, desktop-graphics),
  #6367, #6307.
- **race / replay / game.js**: #6376, #6392, #6311, #6316, #6389, #6396, #6364, #6363, #6356.
- **docs, tooling, deps** (no runtime diff): #6409, #6413 (#6335), #6406, #6394, #6402, #6399, #6398, #6385, #6377,
  #6359, #6354, #6352, #6351 (index.html dep pin), #6321.

## Findings (verified on `282eef07`)

All six rows are CONFIRMED by `finding-verifier` from a static read. None is stale or refuted. They are ranked by
user impact.

| # | file:line | PRs | Mechanism | Failure scenario | Fix | Test | Confidence |
|---|---|---|---|---|---|---|---|
| 1 | `js/game.js:7581` (also `js/garage/setup-camera.js:1281`) | #6313 × #6247/#6345 photo-cam; studio shot presets | Once the focal-length slider sets `lens.mm`, `render()` overrides `fovY` after the camera's own FOV is applied. `setShot` (`js/ui/photo-studio-ui.js:611-628`) and `#pc-fov` (`js/camera/photo-cam.js:396`) write only the camera FOV. Neither clears `lens.mm`, and both stay visible while the studio is open (`css/hud.css:2021` shrinks the bar but does not hide it). | Set 24 mm, then press DETAIL or drag the FOV slider: the framing moves but the zoom never changes. Only RESET LENS restores the controls. | Clear `lens.mm` on `setShot` and on `pc-fov` input. Or disable those controls and label them "lens override" while `mm` is set. | `tests/unit/photo-studio.test.mjs`: set `lens.mm`, call `setShot("detail")`, and assert `lens()` reads null or the preset FOV reaches the camera. | high |
| 2 | `js/input/input.js:409` (`clearRemoteControls` 491-500) | #6393 resume fence × #6319 `invalidateRemoteDrive` (503-507) | A fenced sample calls `clearRemoteControls(true)`, which zeroes `remRoll` and `tiltSeen` and fires `onPhoneTiltChange`. `phone-pad.js:210-211` nulls `fenceSeq` on every non-drive dash, and `:150-151` then fences every echoing sample. That covers the whole pause or menu period, not just a short window. #6319 keeps the sensor capability on Resume on purpose, and this path undoes that. | On a paired phone whose page sends `driveEcho`, open PAUSE then SETTINGS. The tilt rows and the CALIBRATE button (`platform-session.js:231-247`, `setting-deps.js:79`) read as "no phone tilt" until the race resumes. | A fenced sample should zero only the drive: `remoteDriveReady=false`, `remThr=remBrk=0`, `remHeld=0`, `remSeq=null`, `tiltFilterClear()`, `remoteMs=n`. Keep `remRoll` and `remStick`. | `tests/unit/pause-resume-fence.test.mjs`: after a fenced sample, `phoneTiltAvailable()` stays true and `onPhoneTiltChange` is not called. | high |
| 3 | `js/input/phone-pad-page.js:468-479` (latch 34-43, `releaseControls` 206-209, `paintController` 762-769) | #6372 HOLD press mode × #6334 `releaseControls` × #6247 surface switch | `releaseAll()` / `releaseControls()` call each edge's `up()`. A HOLD latch's `up()` sends a toggle. On a surface flip, the host drops that toggle because non-menu edges are blocked (`input.js:484`). `clearDriveToggles` (`input.js:56-60`) does not clear boost, OT or aero, so the host bit stays on. | A finger is on a HOLD-mode OT/BOOST/AERO button when the host pauses. The effect stays on. After Resume, the next press does nothing on down and switches the effect off on lift: one inverted press. | Pass a `synthetic` flag from `releaseAll` / `releaseControls` so a non-drive lift is not sent. Or make a HOLD lift a set-state edge (`otOff`) rather than a toggle. | `tests/unit/phone-press-mode.test.mjs`: HOLD down, surface → menu, assert no toggle edge is queued (or that a set-off edge is). | med |
| 4 | `js/race/pit-lane.js:517-532` | #6392 `onClosedLane` × `held()` contract; #6376 HUD held cue | `onClosedLane` feeds only the limiter cap (`game.js:4975`). `held()` and `inLane()` ignore it. As a result `pitHeld` (`game.js:5093` → ERS block 5094, overtake 5155-5156, X-mode 5197), the HUD cue (`hud.js:1778`) and `recoverBlocked` (`game.js:4504`, `6494`) all treat a closed-lane car as on open track. | With the lane shut (wear and damage off), the player drives onto the pit tarmac. The car is speed-capped, but OT and boost still fire and the HUD does not show them as held. That contradicts `held()`'s doc ("everything the lane forbids it forbids"). | Make `held(c)` return `inLane(c) \|\| onClosedLane(c)`, or pass that OR to the pitHeld and recovery consumers. | Unit test (VM, `tests/unit/pit-lane*.test.mjs`): lane shut, human on the lane, then assert the limiter cap, `held()` and the pitHeld boost block agree. | med |
| 5 | `js/input/input.js:2167-2170` (`localDriveEngaged`, used at 1762) | #6373 pad loss × #6393 `keyDrive` | `localDriveEngaged()` reads raw `keyLeft/Right/Throttle/Brake`. #6393 made held keys inert under a menu via `keyDrive()`, so a held key there still counts as "local driving" and swallows `onPadLostCb`. | A key is held under an open menu when the pad disconnects. The CONTROLLER DISCONNECTED notice is skipped. In practice `platform-session.js:394-398` already returns when paused, so the effect is near-invisible. | Use `keyDrive(...)` for the key terms. | Hold a key with a menu latched, drop the driving pad, and expect `onPadLostCb`. | low |
| 6 | `js/input/input.js:2115-2118` (`remoteDriveEngaged`, used at 1765) | #6319 `invalidateRemoteDrive` × #6373 `reportControllerLoss` | `remoteDriveEngaged()` does not check `remoteDriveReady`, and `invalidateRemoteDrive()` does not zero `remThr`, `remBrk` or `remRoll`. Stale pedals therefore count as another driver from Resume until the next sample arrives. | A pad loss in the roughly 1-frame-to-66 ms window after Resume does not pause. This is practically unreachable. | Gate on `remoteDriveReady`, or zero the pedals in `invalidateRemoteDrive`. | Extend `pause-resume-fence.test.mjs`: Resume, then a pad loss before any sample, expect a pause. | low |

## Traced clean (no cross-PR defect)

- **Codec**: #6247 camera v4 (7 fields) and the #6393 `driveEcho` 8th field do not collide. `driveFence` is opt-in on
  both sides, so an old phone and a new host interoperate, and a new phone and an old host do too.
- **pedal-travel**: #6366 (contact profile, crossover) and #6372 (latch, label move) do not overlap.
- **setup-camera.js**: #6313 (presentOpts, stock FOV, preview) and #6396 (startHome, handoff, pit-out/in) touch disjoint
  hunks. TT results draw through `renderSetupPreview`.
- **photo-studio-ui.js / modal.js**: #6313, #6386 and #6310 keep focus-restore, Escape (`data-esc-close`) and LAYER_SKIP
  consistent. One cosmetic point: `rotate-device` in LAYER_SKIP is now unreachable behind #6386's earlier branch.
- **settings-export-body.js**: #6312, #6344 and #6386 do not overlap, and the reset ownership is consistent.
- **setting-row.js** (#6405) × desktop-graphics/quality-preset (#6361): repaint re-applies the aria-labels.
- **replay**: #6311 × #6316 compose (`reposition()` clears `deferredHighlight` first).
- **TT end** (#6396) × `invalidateRemoteDrive` (#6361): the garage early return comes first.
- **render parity** (#6374): GLX/WGX `photoFocus` reads as unavailable via `?.()` guards.

## Not covered

- #6307's new select-screen / circuit-details / loading-screen DOM × `menu-nav.js` focus (`MenuNav.ownsFocus`). This
  is the likeliest next site.
- #6405 `noPicker` listeners on Photo Studio selects and `<details>` rows × touchend `preventDefault`.
- #6396 `garageBack()` / SKIP TO GARAGE during the drive-in × `paused`.
- The #6318 wheel calibration, #6336 touch pause boundary and #6343 pad takeover × the #6393 `steerNow` early return.
- The diffs of #6364, #6363 and #6356 (career save, designer, cam picker): each is small and single-PR.
