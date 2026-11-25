# Runtime hunt (play) — 2026-11-24
Kind: measurement · Re-measure-by: 2027-02-24

Runtime hunter B: hunters that RUN the game. Scripted sessions on the working tree at `0f252d0b`,
driven through `__apex` and the real button ids, one headless Chromium at a time (AGENTS.md rules 4, 5).
Findings only: no code was changed. Calibration case: #6390 (black garage after END TIME TRIAL on
Bryce's iPhone).

## Harness

- One Node script (kept in `scratch/runtime-hunt/`, not committed). It uses `startStaticServer` and
  `launchChromium` from `tools/lib/harness.mjs` with `WEBGPU_CHROMIUM_ARGS`, so TLX runs three.js
  WebGPU on SwiftShader with the soft blit onto `#game-soft`. Viewport 852×393 (the iPhone 15 window).
  `?fullIntro=1` is required: without it `LoadingCard.isAutomation()` (`js/ui/loading-card.js:23`)
  skips every garage arrival under webdriver, and the drive-in under test never plays.
- Each step logs `info`, `viewState`, `lightState`, `physState`, `inputState`, `garageCam`,
  `logs({level:"warn"})`, unhandled rejections, console errors, and a 48×24 luma sample of `#game-soft`.
  It also logs `diag().env.backendState.presents` (renderer presents) and `softRead.gen` (soft-blit
  generation).
- **The soft blit is slow, so time it.** On SwiftShader WebGPU one soft readback takes about 3.6 s,
  so `#game-soft` stays black for about 16 s after race entry even though `presents` climbs. A pixel
  check must first wait for `softRead.gen` to advance. Without that wait every frame reads as black,
  which is what the first two runs here did. Use `presents` (not luma) to tell whether the game drew.
- Mobile path: `localStorage apex26.forceMobileTier=1` (`js/render/shared/glx-facade.js:8`) plus
  `deviceScaleFactor 3`. This gives the phone's garage render scale of 0.72 and its bay frame throttle.

## Flows covered

| Flow | Result |
|---|---|
| TT (Monza, night, rain): `tt` → `go` → arm → lane → box → `#hud-end-session` → drive-in → garage → `#cs-photo` → `#cs-done` VIEW RESULTS → results → `#res-next` TRY AGAIN → drive | F1, F4; TRY AGAIN clean |
| TT box → `#hud-work` → garage → RETURN TO TIME TRIAL → drive-out → box again | F3; otherwise clean |
| TT drive-in + `#cs-done` / Escape / `#cs-arrival-skip` | F2 |
| Race (Spa): hold GAS (ArrowUp) → `#pausebtn` → release while paused → `#pm-resume` | clean: throttle released, car coasts |
| Race: hold GAS → pause → `#pm-settings` → release → Esc, Esc | clean: settings closes, then resume, no stuck key |
| Race: pause → `#pm-photo` → Esc | clean: the pause card returns |
| Race → `finishRace` → results → `race()` again at night in rain → `weather("dry")` + `setTimeOfDay("day")` mid-race → QUIT (two taps) → menu | clean: `lightState` follows (night `trackNight` true, sky 0.007), no errors |
| Bahrain race: lane → box → `#hud-work` → Escape inside the work garage → RETURN TO RACE → drive-out | clean: Esc in the garage does not pause, the car is released (`pit: out`) |
| Title → `#mb-garage` → CLOSE GARAGE | clean: 179 presents in 3 s while open |
| 3 × (race → `finishRace` → `#res-menu`) with every `setInterval` wrapped | no interval leak: only the title-warm interval, which clears itself |

No unhandled rejections and no console errors in any flow; the only warnings were the per-circuit
`[scenery] suppressed …` counts. No NaN/Infinity reached `physState`.

## Ranked findings

All four were checked by `finding-verifier` on this tree: F1–F3 CONFIRMED. F4 is corrected below.

### F1 — The Time Trial garage after END TIME TRIAL is never drawn again (frozen; #6390's mechanism)
- **Repro (headless, reproduced every run):** TT → box → END SESSION → let the drive-in play. Renderer
  `presents` climb about 62/s through the drive-in. On the frame where the pit-in callback runs
  `G.endRace()` (`state` → `results`, `#cs-done` → VIEW RESULTS) they stop and stay stopped: 2611 → 2611
  over 5 s, and 3532 → 3532 on the mobile path. A garage view chip changes `garageCam()` but does not
  redraw. Photo Studio opened from this garage (`#cs-photo`) also draws nothing (0 presents in 3 s).
- **Code:** `js/game.js:7340`, `if (state === "results" && !resultsCam.live() && !ceremony?.needsWorldFrame()) return;`
  runs before the garage branch at `js/game.js:7344` (`if (setupPreviewOn && !heldWarm) … renderSetupPreview`).
  `endTimeTrialFromBox` (`js/game.js:9369`) leaves `#carsetup` open with `setupPreviewOn` set and
  `garageReturn = "tt-results"`. That is the only route that keeps the garage open in `results`, so
  from then on `render()` never reaches `renderSetupPreview`, `gfx.resize()` (`js/game.js:7356`) or a
  present.
- **Player impact:** the garage after a Time Trial is a still image. The turntable stops, and drag,
  view chips, part and livery edits and Photo Studio do not redraw. On the phone the image goes black (below).
- **#6390 calibration: partly reproduced.** The frozen renderer reproduces headlessly on desktop and
  mobile tiers. The black pixels do not, because the soft-blit 2D canvas keeps its last image. On the
  phone there is no soft blit: the WebGPU canvas must keep its last swap-chain image with no further
  present. Any reconfigure, compositor-layer rebuild or backing resize blanks it, and nothing redraws.
  Bryce's `renderScale 0.72` is `GARAGE_PHONE_SCALE` (`js/garage/setup-camera.js:1049`), pinned by
  `pinGarageRes` on every phone bay frame. It is the garage's own scale, not the governor. `track: null`
  in `results` is documented behaviour of `info()` (docs/DEBUG-HOOKS.md §info), not a lead.
- **Fix sketch:** let the garage draw in `results`. Move the `setupPreviewOn` branch above the
  `results` early return, or exempt `setupPreviewOn` from that return. The return exists to stop
  redrawing a frozen race world under the results sheet; a garage preview is not that world.
- **Test:** a VM unit test on `render()`'s gate. After `endTimeTrialFromBox` plus the pit-in callback,
  `renderSetupPreview` must still be called per frame. Add a browser leg that asserts `presents` advance
  for 2 s with `#carsetup` open in TT `results`.

### F2 — During the END TIME TRIAL drive-in, the garage button reads "RETURN TO TIME TRIAL" and ends the run
- **Repro:** TT → box → END SESSION. During the drive-in, `#cs-done` is visible and labelled RETURN TO
  TIME TRIAL. Tap it, or press Escape: `state` becomes `results` within one frame and the label changes
  to VIEW RESULTS.
- **Code:** `openGarage("pit")` sets the label (`js/game.js:9129`). `garageReturn` stays `"pit"` until the
  pit-in callback, so `#cs-done` (`js/game.js:9241`) calls `setupCam.skipPitOut()`
  (`js/garage/setup-camera.js:533`). That fires the shared `handoff`, which `startPitIn` set to the END
  callback (`js/garage/setup-camera.js:535`).
- **Player impact:** a player who tapped END by mistake and taps the button that says RETURN TO TIME
  TRIAL loses the session instead.
- **Fix sketch:** in `endTimeTrialFromBox`, set `#cs-done` to SKIP TO GARAGE or VIEW RESULTS (or hide it)
  before `startPitIn`. This belongs with Bryce's pending decision on the skip destination (#6390).
- **Test:** extend `tests/unit/tt-pit-lane-vm.test.mjs`: after END, `#cs-done` text is not "RETURN TO
  TIME TRIAL" while the pit-in handoff is pending.

### F3 — The TT drive-out skip says "SKIP TO RACE" (low)
- **Repro:** TT → box → WORK → RETURN TO TIME TRIAL: `#cs-arrival-skip` reads SKIP TO RACE.
- **Code:** `startPitOut` (`js/garage/setup-camera.js:527`) passes no `skip`, so `js/garage/arrival.js:842`
  falls back to `"SKIP TO RACE"`. `startPitIn` passes its own label.
- **Fix sketch:** pass `skip: isTimeTrial ? "SKIP TO TIME TRIAL" : undefined` from `startPitOut`.
- **Test:** the same VM test, reading the skip label after WORK → DONE.

### F4 — Photo Studio from the post-TT garage draws nothing (part of F1)
- **Repro:** TT → box → END SESSION → SKIP TO GARAGE → `#cs-photo`. `body.photo-studio-open` is set and
  the studio panel is up, but `presents` stay frozen (0 in 3 s). CAPTURE and the framing controls act on
  a picture that never updates.
- **Mechanism:** Photo Studio draws through `renderFrame: () => render(0)` (`js/game.js:8911`), and
  `render()` returns at `js/game.js:7340` in `results`. The studio's `endGarageRes` at
  `js/garage/setup-camera.js:1134` sits inside `renderSetupPreview` and is never reached either.
- **Corrected by the verifier:** SKIP TO GARAGE (`arrival.js:869`, `finish()`) does NOT end the run
  before a garage frame. The handoff fires inside `renderSetupPreview` (`setup-camera.js:1140`) and that
  frame is still presented. The cockpit picture in `artifacts/runtime-hunt/ttafter-photo.png` is the slow
  soft blit lagging behind (`softRead.gen` stuck at 3), not what a phone shows. Only `#cs-done`/`#cs-back`
  (`skipPitOut`) fire the handoff synchronously in the click (F2).
- **Also:** on a phone the garage's 0.72 render-scale pin (`pinGarageRes`) is only lifted by
  `endGarageRes` at `js/game.js:7355`, which `results` never reaches. It is still pinned after VIEW
  RESULTS, until the next world frame.
- **Fix:** the same as F1.

## For the orchestrator (needs Bryce's iPhone, bridge commands)

Run these over the bridge after END TIME TRIAL, once the garage is up:
1. `__apex.diag({download:false}).env.backendState.presents` twice, 2 s apart. F1 predicts a delta of 0.
2. Tap a garage view chip (`[data-cs-view="front"]`) and re-read: `garageCam()` changes, `presents` do not.
3. Run once letting the drive-in play and once tapping SKIP TO GARAGE, and note when it goes black:
   at once, or at the first layer rebuild (tab switch, Safari toolbar resize). Every route presents one
   final garage frame, so "black at once" would point at the WebGPU canvas losing that frame with no
   present after it (iOS compositing), which F1's fix also removes.
4. `__apex.lifecycle()` (`renderScale` 0.72 = `GARAGE_PHONE_SCALE`) and `__apex.logs({level:"warn"})`.

## Not covered
- Real GPU and iOS compositing: no device here. The soft blit masks canvas clears, so "black" is
  inferred from the frozen present count, not seen.
- Pause during the lights countdown, ceremony skip paths, VS FRIEND, career and season weekends.
- Heap growth across cycles was not measured with a forced GC (the heap read 113 → 170 → 190 MB at the
  menu without one). This is not a finding; `tools/perf/vm-leak-census.mjs` owns it.
