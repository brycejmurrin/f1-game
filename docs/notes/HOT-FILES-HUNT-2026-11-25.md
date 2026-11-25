# Hot-files bug hunt — 2026-11-25
Kind: hunt · Re-measure-by: 2027-02-25

Bryce asked the orchestrator for this on 2026-11-25 at about 02:15Z. The hunt covers the files changed most often on the deploy branch
in the last 24 h. It looks for bugs that today's changes introduced or exposed: state machines with new holes,
listeners that are never removed, flags that are not reset, early returns that skip cleanup, and timers that outlive
their screen.

- Tip hunted: `d0d1c21d`.
- Hot files: `git log --since=2026-11-24T00:00Z --name-only` counted the commits per file. input.js had 18, game.js 16,
  then pedal-travel.js, settings-export-body.js, phone-pad-page.js, touch-button-settings.js, telemetry-view.js,
  photo-studio-ui.js, phone-pad-codec.js, pad-menu.js, setup-camera.js, and so on.
- Method: seven `code-hunter` slices ran in parallel:
  - input.js
  - game.js
  - the phone controller (phone-pad-page, codec, phone-pad, pad-menu)
  - pedal-travel and touch buttons
  - photo-studio-ui and setup-camera
  - pit-lane and telemetry
  - the settings UI

  Together they returned 11 candidates. One `finding-verifier` re-read every row on the tip: 9 CONFIRMED, 2 REFUTED, 0 stale.
- It is a static read only: no browser, no tests run, no code edited. Bryce picks the fixes.
- This note does not repeat the rows in `docs/notes/MERGED-REVIEW-2026-11-25.md` (#6422) or the fixes in open
  PRs #6426, #6427 and #6429.

## Findings (verified on `d0d1c21d`, most severe first)

| # | file:line | PRs | Mechanism | Failure scenario | Fix | Test | Confidence |
|---|---|---|---|---|---|---|---|
| 1 | `js/game.js:9232` (door `9392-9394`; cleared only at `2960`, `9394`) | #6396 | In garageBack's tt-results branch, `ttGarageDoor(true)` shows the GARAGE button and binds Escape to it (`data-esc-close="res-garage"`). Only the TT branch of endRace and the button's own onclick turn it off. quitToMenu (`4361`) and startRace (`2732`) never clear it. | Run TT to SKIP TO RESULTS, the garage, then BACK. Now pick MAIN MENU and run any normal race. The race results sheet shows GARAGE, and Escape opens `openGarage("tt-results")`. Leaving that garage goes back through the TT results branch. | Call `ttGarageDoor(false)` in quitToMenu and startRace. Better, let buildResults and buildTTResults own the door state. | VM test: set `garageReturn="tt-results"`, run garageBack, then quitToMenu, then a race endRace. Assert `res-garage` is hidden and `els.results` has no `data-esc-close`. | high |
| 2 | `js/ui/photo-studio-ui.js:1127-1132` (consumers `js/game.js:8451`, `js/garage/setup-camera.js:1399`) | #6313 | `activeLens()` returns `lens` whenever the studio is open and ignores Depth focus. `lens.focus` stays `null` until a tap. Both consumers pass `photoLens.focus`, which is `null` and not `undefined`. In `tlx-post.js:654`, `o.photoFocus !== undefined` then turns the photo-focus pass on, and `null` means autofocus on the car tag (`:1646`). | Depth focus is Off by default, documented as "opt-in until verified on real GPUs". On an HDR TLX renderer, opening Photo Studio from the garage or from a race runs the unverified DOF/autofocus pass every frame. CAPTURE can bake blur into the PNG while the toggle reads Off. | Make `activeLens()` return `focus: undefined` when `!depthFocus`, or guard both consumers on depth focus. | Unit test with a stub gfx where `photoFocusAvailable()` is true and depthFocus is false: `lens().focus === undefined`. With depthFocus On it is `null`, and after a tap it is `{x,y}`. | high (code); medium (visible effect, NEEDS-BROWSER) |
| 3 | `js/ui/settings-export.js:268` with `js/ui/settings-export-body.js:458-466` | #6248, #6337 | The padProfiles normalizer runs before the sparse merge. It does `Object.assign({v:1,devices:[],legacyClaimed:false}, v)`. `ControllerProfiles.clean` (`controller-profiles.js:23`) re-infers `legacyClaimed` only when it is `null`, so the explicit `false` survives. `mergeChangedFields` (depth 1, `{...existing,...incoming}`) then writes it over the stored value. | A sender at the default (`legacyClaimed:false`) exports a "changes" file that carries only `devices`. Importing it on a device whose own value is `legacyClaimed:true` resets that to false. `input.js:893` then re-runs the legacy pad migration: the old shared pad map and axes are adopted again by the next pad. | For sparse rows, merge the raw incoming value into `stored` first, then normalize. Or skip default-filling in this normalizer when the file is a changes file. | Apply a `mode:"changes"` file with `padProfiles:{devices:[d]}` onto a store with `legacyClaimed:true`. Assert it stays true. | high (code); medium (frequency) |
| 4 | `js/ui/touch-button-settings.js:350-354` | #6248 × #6337 | Applying a saved Gamepad profile does `store.set("pad", read())` with no guard. #6337 guarded the same write in `key-binds.js:91` (`if (dev.keys \|\| !Input.controllerProfile?.())`) to keep the legacy shared pad map for wheels that have not migrated yet. | A pad is connected, a per-device profile is active, and the legacy key is still unclaimed. Applying preset B overwrites the shared `pad` key with B. The next unclaimed wheel then migrates B instead of its own legacy map (`input.js:893-896`). | Mirror the key-binds guard: skip `store.set("pad")` when `Input.controllerProfile()` is active, and take the durable flag from the profile save. | Seed `pad=A` with no legacy claim and an active device profile, apply B, and assert `store.get("pad")` is still A. | high (guard missing); medium (end to end) |
| 5 | `js/input/input.js:2445-2452` | #6323 (with #6393's `localControlDevice`) | The `_coarseMql` change listener assigns `localControlDevice` directly. It skips `setLocalControlDevice`, whose keyboard-leave cleanup (`735-739`) clears `keyThrottleToggle` and `keyLookBackToggle`. `keyDrive()` (`2154`) checks only `navBlocksTouch()`, not the device. | A keyboard driver with the throttle set to TOGGLE has it latched. The pointer media query then flips to coarse (a 2-in-1 keyboard detach, or devtools emulation). Throttle stays on under touch control until a pause. | Route the listener through `setLocalControlDevice(physicalPadAvailable ? "controller" : null, true)`. | Set throttle hold mode to toggle, press the throttle key, fire the coarse change, and assert `Input.throttle()` is false. | high (code); low (reach) |
| 6 | `js/input/phone-pad-page.js:769` (also `752`; `releaseAll` `210-219`) | #6247 (surface flips) | Every surface flip calls `releaseAll()`, which sets `roll = null` and forces a sample with `roll: null`. The host (`input.js:417`) then sets `remRoll=false`, so `phoneTiltAvailable()` reads false and `onPhoneTiltChange` fires. `roll` comes back only from the next `deviceorientation` event (`:164`). | Pause, then Resume with the phone held still. Until the sensor reports a change, the host sees no phone tilt and tilt steering is dead. Each flip also toggles the tilt rows the phone is navigating. Same symptom as #6429, but a separate cause: #6429 fixes the host's fenced path, while here the phone itself nulls its roll. Re-check after #6429 lands. | On a surface flip, release only the held controls (`releaseControls()`), or give `releaseAll` a flag that keeps `roll`. | Phone-page test: drive dash, then menu dash, then drive dash with no `setRoll` in between. Assert `state().roll` and the next encoded roll are unchanged. | high (code); low (felt effect, NEEDS-BROWSER on a phone) |
| 7 | `js/input/phone-pad-page.js:491` (`fire` `34-38`; `phone-pad.js:602-608`) | #6372 (#6365) | The `send` wrapper given to `pressLatch` is `key => !!session && (session.event(key), true)`. It returns true even when `session.event()` returns false: the link is closed, the key is unknown, the transport is not open, or the edge queue is full (`EDGE_CAP`). `fire()` therefore records `local` and `expect` as sent. | A BOOST/OT/AERO tap while the transport is down or the queue is full paints the button as on for 600 ms. With no host dash yet (`host === null`) the local flip is never corrected, and the next press sends the opposite of what the player wants. | `key => !!session && session.event(key) !== false`. | pressLatch unit test whose `send` returns false: assert `active()` does not change. | high |
| 8 | `js/ui/learn-door.js:168-195` (launch `js/game.js:3506`, restore `4406`) | #6251 (#6231) | `launchAeroDrill` writes `G.flow = "gp"` and `G.session = "race"`. Through the setter, the flow write also engages Career and SeasonCal. The `previous` snapshot and `restore()` cover track, weather, grid and the rest, but not flow or session. | After an Aero Lab drill launched from the title while a career or season flow was selected, quitting to the menu leaves flow gp and session race. | Add `flow` and `session` to `previous` and to `restore()`. | Launch the drill with `session="quali"` and quitToMenu. Assert the session is `quali`. | high (code); low (impact: menu entries may re-set flow before use) |
| 9 | `js/input/phone-pad-page.js:898-906` (cancel `833-836`, backoff `957-974`) | pre-existing (#6054); exposed by today's re-dial use | The 15 s connect deadline calls `cancel()`. That calls `stopRedial()` and sets `attempt = null`, so when `swap` resolves it returns `cancelled` before the `!done.ok` branch that schedules the 5/15/30 s re-dial backoff. The deadline makes no exception for `owner.isRedial`. | After a wire drop, the re-dial answers but the link never opens within 15 s. The phone stops re-dialling and says "choose MAKE NEW CODE", even though the host keeps hosting the same code for its re-host grace window. | In the deadline, when `owner.isRedial`, close the transport and take the backoff path. Share the scheduler with `!done.ok`. | `pad()` test with fake timers: an answered offer that never opens on a re-dial schedules a retry after the deadline. | high (code); low (narrow window) |

## Refuted by the verifier (not findings)

- `js/game.js:2644`: `aeroDrill.staging` stuck true after an early return. Every exit after staging is either a
  supersede that re-stages the drill, or a quit that runs `learnAeroDrill.restore(); learnAeroDrill = null` (`4406`).
- `js/ui/touch-button-settings.js:102-103`: applying a malformed preset deletes `phoneButtonProfiles`. The picker
  never offers one: `controller-profiles.js:69-70`/`93-94` drop any preset that `normalizeProfiles` rejects.

## Checked clean

- **Telemetry player and replay:** the rAF, the visibilitychange listener, the ResizeObserver and `dispose()` all tear down through `stopTelAnim`.
- **Pit lane:** `recommendedTread`, `onClosedLane` and the `wetLapsToStop` gate (#6340, #6376, #6392) add no per-car state.
- **Photo Studio close machine:** `st.busy`/`st.closing` reset, `generation` guard, window listeners, reticle and capture timers. A reopen from the other source closes the old session first.
- **Modal / settings:** Escape routing; the rotate-blocker (#6386); file review and the arm/flash timers; `resetRow` onLeave; lazy `openTrackDetail` (#6307).
- **Input:** `drivingPadKey`, `pedalCapture`, `cameraHeldPads`, the pause guard at `1256`, and `clearArmed` in key-binds (#6411).
- **Phone codec:** v1–v4 encode and decode agree. The link fence numbering holds. `cancel`/`pageHide`/`rebind` cleanup.

## Not covered

- **input.js:** steering and tilt (about lines 100-390, 530-700), the wheel profile and rest-offset code (about 900-1100), and haptics.
- **Other unread code:**
  - The pit-lane state machine outside the diff hunks (`update`, `reset`, retire).
  - key-binds.js wheel wizard (215-731).
  - phone-pad-page.js layout (1200+).
- **Other normalizer rows** that fill defaults before a sparse merge (appearanceShapes, dockLayout, `camTune*`). These are the likeliest siblings of row 3.
