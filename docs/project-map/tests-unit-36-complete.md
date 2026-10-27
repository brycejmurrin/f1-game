# Unit group 36 — complete source map

All 16 manifest files (4,173 lines) mapped. No tests/browser runs, runtime edits, or commits. Case descriptions are source evidence, not passing verdicts.

## Read evidence

Read AGENTS.md and `.claude/skills/code-nav/SKILL.md`. Every test line was returned in an individual bounded source result (≤100 lines and ≤10,000 characters); discarded aggregate truncations were re-read. Ranges below are inclusive. SHA-256 identifies inspected bytes.

| File | SHA-256 | Complete source windows |
|---|---|---|
| `tests/unit/pause-hud-layout.test.mjs` | `8d595eea122b0a91370fe25073a20c8312dff70a2a913c2589dbaf2a46ca4b78` | 1-90, 91-167 |
| `tests/unit/pause-key-tools.test.mjs` | `e3038745ebf1a4e215755c66b5bacfbbb92bc2996978619f7d8f9c16d3c475e1` | 1-100 |
| `tests/unit/pause-opts.test.mjs` | `4ac6d193fe9051bd4fd3eaf767d6f73478d1584b5f3977714cea2b95bfc742ff` | 1-90, 91-180, 181-270, 271-360, 361-450 |
| `tests/unit/pause-silence.test.mjs` | `cbb376284765c1c9dccdbfa1ecb108c0d2430d6415fe99828f4477052f681719` | 1-100, 101-200, 201-279 |
| `tests/unit/pause-taps.test.mjs` | `f758bf123175bff2220a87f338377dbad0372663c90c24e161bed07618b639a2` | 1-40 |
| `tests/unit/perf-frametime.test.mjs` | `244b81eac1d5cf7d1446494ecdcb41ce170892a7a8f3191f66f10e640f2fc333` | 1-22 |
| `tests/unit/perf-governor.test.mjs` | `2b8defcb3251c510104abc6d72355ee3200e7abe7d6a498b8748b7100690d8c0` | 1-100, 101-200, 201-300, 301-400, 401-500, 501-600, 601-700, 701-800, 801-900, 901-1000, 1001-1100, 1101-1200, 1201-1300, 1301-1400, 1401-1500, 1501-1599 |
| `tests/unit/perf-race-entry.test.mjs` | `2ff3e79bfa8a8159d7d4d48944bcb65f969f80f9dcd9e07f19e4f4a3d9fd0691` | 1-27 |
| `tests/unit/perf-sentinel.test.mjs` | `0883c4ac3f89cfbddf3dbffea7be4ddc9974da0be7e5e2f042a7602b0e82fb7b` | 1-100, 101-160 |
| `tests/unit/perf-spans.test.mjs` | `8bc1ac7090180915da7f122db2740c9b89e6b1324d3558d198dc6edb823e61c2` | 1-100, 101-160 |
| `tests/unit/perf-try.test.mjs` | `639b44a976b786ab5d0a0de0233bf7adb8923797c7a579ba75d2aba0b959a633` | 1-90, 91-180, 181-270, 271-360, 361-450, 451-540, 541-628 |
| `tests/unit/perf-vm-alloc-budget.test.mjs` | `aeed443a77bc7b5db7b8862364fa05d6242c8d44f97f44c7738c730ea414a15d` | 1-41 |
| `tests/unit/perf-vm-leak-cycles.test.mjs` | `d65785aed2f4800ba6011c4760b03f15fb4dbaff99df6e181b48f6aed09b15d0` | 1-51 |
| `tests/unit/persistence-vm.test.mjs` | `b863fcc7331f407a945d46be1f496689dedacd3f0bb953a99c26578b80958884` | 1-100 |
| `tests/unit/phone-input-improvements.test.mjs` | `5c3a308a75719aa8045a98441f9305cf8126bd0d06b5c2748cceede84e6fd373` | 1-90, 91-180, 181-201 |
| `tests/unit/phone-pad-netplay-vm.test.mjs` | `4f7fa5d020ee631c7685fd8808931b3b6d713f36602116e060c4c744d8d0d8f8` | 1-90, 91-148 |

## Navigation and fixture boundaries

Attached apex-lsp outlines resolved PauseOpts, PerfGov, PerfSpans, PhonePad, Announcer, PostCommon, PlatformSession, RenderRate, ThermalDrift and GameStore. Bounded definition bodies read: PauseOpts.onPauseClick `js/ui/pause-opts.js:146-158` (module-file fallback; caller/export coverage unverified), PostCommon.roadReflection `js/render/shared/post-common.js:189-211`, PerfGov.setUserTier `js/perf/governor.js:1109-1146`, PerfGov.sentinelArm `js/perf/governor.js:548-580`. Other target ranges identify outline declarations or explicit test load/read relationships, not full production-file audits.

Fixtures: abs-src labels VM sources; seed-log/seed-store supply test globals. game-vm boots real game modules with stub renderer/DOM/storage/timers. glx-mock records backend calls; css-source resolves CSS and css-rules parses declarations; mini-dom supplies settings navigation focus behavior. Inline renderer, speech, media, sensor, RTC and localStorage objects are doubles. Synthetic invite `ABC234`/`OFFER`/`ANSWER`, mock source names, track metadata and stored values are descriptive fixtures, not external resources. `the deleted PerfTry module` is an intentionally absent historical path.

Governor secondary targets: quality-preset.js defaults/caps/init; PostCommon.roadReflection wet/dry policy; game.js carReflect handoff; GLX/TLX/WGX SSR option reads, TLX DPR cap, shadow-pass fallback and GLSL/TSL/WGSL shadow/material parity. Replay cases evaluate real render-rate.js; thermal cases additionally evaluate thermal-drift.js.

## Cases

The case name states the semantic assertion contract; the last column gives its evidence boundary. `range` spans the complete declaration; `assertionSpans` lists assertion call line ranges inside its callback, including nested callbacks. Setup/helper assertions outside declarations are separately listed. Parameterized declarations retain their shared source range and state expansions below.

### tests/unit/pause-hud-layout.test.mjs

Fixture/limits: Banner VM uses fake DOM/audio/time; CSS and platform/backend checks are source shape only, not rendered layout or OS events.

Shared/setup assertion spans: none.

Production target family: js/race/announce-banner.js:39; css/hud.css; css/carsetup.css; css/components.css; css/dialogs.css; css/overlays.css; js/ui/platform-session.js:5; js/game.js; js/audio/engine.js; js/render/glx/glx.js; js/render/three/tlx.js; js/render/webgpu/wgx.js.

| name | range | assertionSpans | target | meaning / limits |
|---|---|---|---|---|
| driving warnings survive camera changes while quiet views suppress optional tips | 37-52 | 41, 42, 46, 47, 49, 50 | target family above | File boundary above applies. |
| any open screen hides race HUD chrome, DISPLAY keeps the live tower | 54-66 | 58, 59, 60, 61, 62, 63, 64, 65 | `css/hud.css` | File boundary above applies. |
| garage camera stack hides under a dim overlay, not under garage itself | 68-72 | 70, 71 | `css/carsetup.css` | File boundary above applies. |
| compact pause stack tightens without changing type tokens | 74-81 | 76, 80 | `css/components.css` | File boundary above applies. |
| short phone pause (≤400px) caps the sheet and uses a 2-col tray with no holes | 83-90 | 85, 86, 88, 89 | `css/dialogs.css`; `css/overlays.css` | File boundary above applies. |
| a queued INFO card older than ANN_STALE_MS is dropped at the drain; a warning never is | 92-112 | 101, 103, 111 | target family above | File boundary above applies. |
| a full announce queue sheds comm and coach so a box call can queue | 114-123 | 117, 118, 119, 120, 122 | target family above | File boundary above applies. |
| a give-back warning is not starved behind the caution's own radio card: it takes over at the floor | 125-145 | 130, 133, 134, 140, 143, 144 | `js/game.js` | File boundary above applies. |
| losing focus while visible pauses a solo race; an iOS audio interruption does too; neither in a friend race | 147-155 | 150, 151, 152, 154 | `js/ui/platform-session.js`; `js/audio/engine.js` | File boundary above applies. |
| a context lost within 3 s of becoming visible is iOS's late-reported BACKGROUND loss on every backend | 157-167 | 163, 164, 165 | `js/render/glx/glx.js`; `js/render/three/tlx.js`; `js/render/webgpu/wgx.js` | File boundary above applies. |
### tests/unit/pause-key-tools.test.mjs

Fixture/limits: Extracted real handler over stubs; no physical key/gamepad, focus stack or browser.

Shared/setup assertion spans: 23, 25.

Production target family: js/ui/platform-session.js:5 (extracted Input.init onPause).

| name | range | assertionSpans | target | meaning / limits |
|---|---|---|---|---|
| `paused with #${layer} on top: the pause key closes the tool (${door}), the race stays paused` | 47-52 | 50, 51 | js/ui/platform-session.js:5 (extracted Input.init onPause) | File boundary above applies. |
| the pause menu itself on top: the key resumes, as before | 55-60 | 58, 59 | js/ui/platform-session.js:5 (extracted Input.init onPause) | File boundary above applies. |
| settings on top keeps its own BACK path | 62-68 | 66, 67 | js/ui/platform-session.js:5 (extracted Input.init onPause) | File boundary above applies. |
| racing (not paused): the key pauses, whatever layer the DOM reports | 70-75 | 73, 74 | js/ui/platform-session.js:5 (extracted Input.init onPause) | File boundary above applies. |
| pre-race #loading on top: pause key is a no-op while unpaused | 77-84 | 82, 83 | js/ui/platform-session.js:5 (extracted Input.init onPause) | File boundary above applies. |
| pre-race #loading on top: pause key is a no-op while already paused | 86-91 | 89, 90 | js/ui/platform-session.js:5 (extracted Input.init onPause) | File boundary above applies. |
| a tool setPaused(false) closes itself (the lighting tuner) still resumes on the key | 93-100 | 98, 99 | js/ui/platform-session.js:5 (extracted Input.init onPause) | File boundary above applies. |
### tests/unit/pause-opts.test.mjs

Fixture/limits: Real module and inline boot on mini DOM/store/timers; CSS/source checks do not establish pixels or real dialog propagation.

Shared/setup assertion spans: 144.

Production target family: js/ui/pause-opts.js:43-206; index.html inline boot; css/components.css; css/dialog-platform.css; js/ui/settings-export.js; tools/manifest.cjs; js/game.js.

| name | range | assertionSpans | target | meaning / limits |
|---|---|---|---|---|
| shell declares the PAUSE MENU fold shell; rows mount via SettingRow.build | 159-174 | 160, 161, 162, 166, 168, 171, 172, 173 | js/ui/pause-opts.js:43-206; index.html inline boot; css/components.css; css/dialog-platform.css; js/ui/settings-export.js; tools/manifest.cjs; js/game.js | File boundary above applies. |
| defaults: GRID / CENTRE / FULL / confirm ON, no data-pause-* and SHIPPED | 176-185 | 178, 179, 180, 181, 182, 183, 184 | js/ui/pause-opts.js:43-206; index.html inline boot; css/components.css; css/dialog-platform.css; js/ui/settings-export.js; tools/manifest.cjs; js/game.js | File boundary above applies. |
| stored values stamp html[data-pause-*]; garbage reads as the shipped answer | 187-196 | 189, 190, 191, 193, 194, 195 | js/ui/pause-opts.js:43-206; index.html inline boot; css/components.css; css/dialog-platform.css; js/ui/settings-export.js; tools/manifest.cjs; js/game.js | File boundary above applies. |
| boot parity: index.html's inline stamp matches the module for every answer | 198-213 | 211 | js/ui/pause-opts.js:43-206; index.html inline boot; css/components.css; css/dialog-platform.css; js/ui/settings-export.js; tools/manifest.cjs; js/game.js | File boundary above applies. |
| rows mount, wire and round-trip every key; the summary follows | 215-238 | 217, 218, 219, 220, 221, 222, 224, 225, 226, 228, 230, 232, 233, 235, 236, 237 | js/ui/pause-opts.js:43-206; index.html inline boot; css/components.css; css/dialog-platform.css; js/ui/settings-export.js; tools/manifest.cjs; js/game.js | File boundary above applies. |
| wiring waits for DOMContentLoaded while deferred scripts still run | 240-247 | 242, 243, 245, 246 | js/ui/pause-opts.js:43-206; index.html inline boot; css/components.css; css/dialog-platform.css; js/ui/settings-export.js; tools/manifest.cjs; js/game.js | File boundary above applies. |
| CONFIRM QUIT: the first press arms, the second runs the game's handler | 249-264 | 252, 253, 254, 255, 256, 257, 259, 260, 261, 262, 263 | js/ui/pause-opts.js:43-206; index.html inline boot; css/components.css; css/dialog-platform.css; js/ui/settings-export.js; tools/manifest.cjs; js/game.js | File boundary above applies. |
| RESTART arms the same way; arming one button disarms the other | 266-279 | 270, 271, 272, 273, 275, 277, 278 | js/ui/pause-opts.js:43-206; index.html inline boot; css/components.css; css/dialog-platform.css; js/ui/settings-export.js; tools/manifest.cjs; js/game.js | File boundary above applies. |
| the arm expires after ARM_MS: on its timer, and by age when the timer is late | 281-295 | 284, 285, 287, 288, 290, 293, 294 | js/ui/pause-opts.js:43-206; index.html inline boot; css/components.css; css/dialog-platform.css; js/ui/settings-export.js; tools/manifest.cjs; js/game.js | File boundary above applies. |
| hiding the pause card disarms; other buttons pass through untouched | 297-307 | 301, 303, 304, 305, 306 | js/ui/pause-opts.js:43-206; index.html inline boot; css/components.css; css/dialog-platform.css; js/ui/settings-export.js; tools/manifest.cjs; js/game.js | File boundary above applies. |
| a disabled RESTART (multiplayer) is never armed; CONFIRM OFF passes straight through | 309-324 | 312, 313, 314, 316, 317, 318, 323 | js/ui/pause-opts.js:43-206; index.html inline boot; css/components.css; css/dialog-platform.css; js/ui/settings-export.js; tools/manifest.cjs; js/game.js | File boundary above applies. |
| js/game.js keeps its handlers and the multiplayer restart guard untouched | 326-330 | 327, 328, 329 | js/ui/pause-opts.js:43-206; index.html inline boot; css/components.css; css/dialog-platform.css; js/ui/settings-export.js; tools/manifest.cjs; js/game.js | File boundary above applies. |
| CSS: BACKGROUND feeds both scrim layers through tokens; LIST, SIDE and the armed fill | 332-348 | 334, 335, 337, 338, 343, 344, 345, 346, 347 | js/ui/pause-opts.js:43-206; index.html inline boot; css/components.css; css/dialog-platform.css; js/ui/settings-export.js; tools/manifest.cjs; js/game.js | File boundary above applies. |
| export rows, boot keys and the load order | 350-366 | 358, 359, 360, 361, 363, 364, 365 | `js\/ui\/pause-opts\.js`; `js\/core\/store\.js` | File boundary above applies. |
| LAYOUT: COMPACT / WIDE / SIDEBAR round-trip, stamp and read back | 368-385 | 370, 371-372, 374, 375, 376, 377, 378, 380, 381, 382, 384 | js/ui/pause-opts.js:43-206; index.html inline boot; css/components.css; css/dialog-platform.css; js/ui/settings-export.js; tools/manifest.cjs; js/game.js | File boundary above applies. |
| SHIPPED composes with ScreenLooks' lookPause knobs; absent ScreenLooks reads as shipped | 387-401 | 389, 391, 393, 395, 397, 399, 400 | js/ui/pause-opts.js:43-206; index.html inline boot; css/components.css; css/dialog-platform.css; js/ui/settings-export.js; tools/manifest.cjs; js/game.js | File boundary above applies. |
| every setter peeks the pause card through ScreenLooks, read at call time | 403-411 | 408, 410 | js/ui/pause-opts.js:43-206; index.html inline boot; css/components.css; css/dialog-platform.css; js/ui/settings-export.js; tools/manifest.cjs; js/game.js | File boundary above applies. |
| CSS: each new LAYOUT and every lookPause knob has a rule in the pause block | 413-440 | 416, 417, 418, 420, 421, 422, 424, 425, 426, 428, 434, 435, 437, 439 | js/ui/pause-opts.js:43-206; index.html inline boot; css/components.css; css/dialog-platform.css; js/ui/settings-export.js; tools/manifest.cjs; js/game.js | File boundary above applies. |
| dialog backdrop animations respect the explicit in-game reduced-motion preference | 443-450 | 447-448, 449 | `css/dialog-platform.css` | File boundary above applies. |
### tests/unit/pause-silence.test.mjs

Fixture/limits: Real announcer modules; fake synth/pack/MutationObserver and microtask flush; no audible output or native iOS interruption.

Shared/setup assertion spans: none.

Production target family: js/audio/announcer.js:540; js/audio/announcer-recorded.js; js/audio/radio-voice.js.

| name | range | assertionSpans | target | meaning / limits |
|---|---|---|---|---|
| the visible pause card stops the announcer mid-read | 114-123 | 116, 117, 118, 122 | js/audio/announcer.js:540; js/audio/announcer-recorded.js; js/audio/radio-voice.js | File boundary above applies. |
| a rotate-block / photo pause that re-hides the card in the same task still stops the announcer | 125-141 | 131, 132, 137, 139, 140 | js/audio/announcer.js:540; js/audio/announcer-recorded.js; js/audio/radio-voice.js | File boundary above applies. |
| the pit garage stops the announcer the way the pause card does | 143-153 | 146, 147, 148, 152 | js/audio/announcer.js:540; js/audio/announcer-recorded.js; js/audio/radio-voice.js | File boundary above applies. |
| hidden tab stops the announcer; resume does not restart the stale line | 155-214 | 200, 201, 204, 205, 206, 213 | `js/audio/radio-voice.js`; `js/audio/announcer-recorded.js`; `js/audio/announcer.js` | File boundary above applies. |
| recorded announcer clips stop on the pause card too | 216-279 | 269, 270, 272, 277, 278 | `js/audio/radio-voice.js`; `js/audio/announcer-recorded.js`; `js/audio/announcer.js` | File boundary above applies. |
### tests/unit/pause-taps.test.mjs

Fixture/limits: Parsed declaration/cascade contract; does not measure painted pixels.

Shared/setup assertion spans: none.

Production target family: `css/dialogs.css`.

| name | range | assertionSpans | target | meaning / limits |
|---|---|---|---|---|
| pause primary doors floor at painted tapSoft (44/s + --tap-paint) for UI SIZE 75% | 21-40 | 25-29, 30-34, 35-39 | `css/dialogs.css` | File boundary above applies. |
### tests/unit/perf-frametime.test.mjs

Fixture/limits: Synthetic samples and baseline objects only; no machine performance measurement.

Shared/setup assertion spans: none.

Production target family: tests/helpers/perf-frametime.mjs.

| name | range | assertionSpans | target | meaning / limits |
|---|---|---|---|---|
| summariseFrameMs computes percentiles on a synthetic run | 5-12 | 8, 9, 10, 11 | tests/helpers/perf-frametime.mjs | File boundary above applies. |
| compareToBaseline flags only large regressions | 14-22 | 17, 20, 21 | tests/helpers/perf-frametime.mjs | File boundary above applies. |
### tests/unit/perf-governor.test.mjs

Fixture/limits: Real governor under synthetic frame costs, fake renderer/storage; evidence about policy, not player GPU speed.

Shared/setup assertion spans: none.

Production target family: `js/perf/governor.js`.

| name | range | assertionSpans | target | meaning / limits |
|---|---|---|---|---|
| software GL UI readback deferral preserves the Document receiver | 43-71 | 47, 62, 65, 69 | `js/perf/governor.js` | File boundary above applies. |
| cover + " defers readback on software GL" | 61-63 | 62 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| cover + " does not defer readback on hardware GL" | 64-66 | 65 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| hidden covers do not defer readback | 68-70 | 69 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| a device capped at 30 fps (Low Power Mode) settles at full quality, not the floor | 108-121 | 116, 117, 120 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| a healthy 60 Hz device never enters the degrade branches | 123-128 | 126, 127 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| genuine GPU-bound slowness (scale actually helps) settles at a lower scale and stays there | 130-140 | 138, 139 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| a reverted downscale does not repeat forever (the causal check actually halts) | 142-156 | 154, 155 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| feature tiers are shed only when they actually help, same as resolution | 174-182 | 177, 181 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| floorMs is exposed for live inspection (__apex.renderScale()) | 184-188 | 186, 187 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| inactive early features do not prevent a later post reduction from helping | 190-208 | 197, 198, 199, 200, 205, 206 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| an exhausted feature probe rolls back the entire trial on a capped clock | 210-218 | 215, 216, 217 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| a futility verdict from the previous race does not carry into the next (sentinelArm) | 220-231 | 226, 228, 229 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| the two futility latches are inspectable, and start clear | 233-243 | 239, 240, 241, 242 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| a sustained-slow device now sheds past the first rung (§2au discriminator) | 245-303 | 292-293, 294-295, 296-297, 298-299, 300-301 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| the adapted floor is what closes the ladder, not a latched-off lever | 305-319 | 314-315, 317-318 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| RESTORE IS REACHABLE AT ALL: the predicate is satisfiable for some input | 323-344 | 339-340, 341, 342-343 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| a device that degraded RECOVERS once the frames come good again | 346-366 | 358, 363-364, 365 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| restore does NOT fire while frames are still missing | 368-378 | 376-377 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| setTierHold(true) pins the ladder on an overloaded pinned box, and releases cleanly | 415-431 | 418, 420, 421, 424, 430 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| a PINNED resolution still sheds features when the device is overloaded | 433-438 | 436-437 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| a PINNED resolution never moves the scale the user chose | 440-452 | 446, 451 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| pinning the resolution drops a pending SCALE verify, not a pending TIER one | 454-468 | 461, 466-467 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| the crash-sentinel floor still cannot be defeated by pinning the resolution | 470-486 | 483, 485 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| two crash strikes cap the backend's DPR at 1 at init; one strike or a desktop leaves it alone (#1641) | 488-506 | 501, 502, 503, 504, 505 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| TLX capDpr only ever lowers the cap and re-sizes (#1641) | 508-512 | 510, 511 | `js/render/three/tlx.js` | File boundary above applies. |
| a fresh phone defaults to GRAPHICS MEDIUM; legacy HIGH is phone-capped to HIGH | 520-536 | 524-525, 526-527, 529-530, 532, 533, 534, 535 | `js/perf/quality-preset.js` | File boundary above applies. |
| a user tier sheds at least that much, live, without touching the render path | 538-545 | 540, 542, 544 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| a user tier is a FLOOR, so the governor may still shed BELOW it but never above | 547-560 | 554, 559 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| ULTRA cannot defeat the crash-sentinel floor | 562-579 | 574, 576, 578 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| a bad preset cannot invent a tier above the ladder | 581-589 | 586, 588 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| autoTier ignores the GRAPHICS user floor; lookPostShed pins look post on LOW | 591-610 | 598, 599, 600, 601, 603, 604, 605, 607, 608, 609 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| a phone that measured slow keeps its shed on GRAPHICS: MEDIUM (slow latch) | 612-644 | 620, 621, 624, 625-626, 627, 633, 636, 637, 638, 639, 643 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| GRAPHICS: LOW can still shed by evidence — the ladder is not short-circuited by its own floor | 646-668 | 658, 659, 663-664, 665-666, 667 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| LOW keeps measured sheds under the phone slow latch (look post stays off) | 670-682 | 674, 675, 676, 678, 679, 680, 681 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| phone slow latch blocks LOW restore; raising GRAPHICS clears it | 684-695 | 688, 691, 694 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| switching to LOW after several measured cuts keeps the phone slow latch | 697-710 | 700, 702, 703, 705, 707, 708, 709 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| the opening window keeps the frames every EMA in this file forgets | 712-729 | 722, 723, 724-725, 728 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| autoTier still honours the crash-sentinel floor and a measured shed | 731-746 | 741, 742, 744, 745 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| wet-road reflections survive every user tier while overload and dry shedding remain independent | 748-769 | 753, 754, 755, 758, 760, 763, 766, 768 | `js/render/shared/post-common.js` | File boundary above applies. |
| LOW wet-road reflection switches off and back on when a real governor cut is rolled back | 771-803 | 795-796, 797, 798, 799, 800-801, 802 | `js/render/shared/post-common.js` | File boundary above applies. |
| tier 2 sheds car-paint SSR independently of the wet-road quality policy | 805-819 | 813, 814, 815, 816, 817, 818 | `js/game.js`; `js/render/glx/post.js`; `js/render/three/tlx-post.js`; `js/render/webgpu/wgx.js` | File boundary above applies. |
| shadow box and shader fade share the same unset shadowRange fallback | 821-828 | 824, 825, 826-827 | `js/render/shared/shadow-pass.js`; `js/render/glx/glx.js` | File boundary above applies. |
| sun-shadow fade origin is yaw-invariant (eye XZ, look-target Y) | 830-840 | 837, 838, 839 | `js/render/glx/shaders/glsl-lit.js`; `js/render/three/tsl-lit.js`; `js/render/webgpu/wgsl-chunks.js` | File boundary above applies. |
| TLX zeros sunShaft when bloom is shed, matching GLX doBloom gate | 842-847 | 845, 846 | `js/render/glx/post.js`; `js/render/three/tlx-post.js` | File boundary above applies. |
| TLX wet analytic mirror and chrome MIRROR id 27 match GLX | 849-867 | 852, 853, 859, 860, 861, 862, 864, 865 | `js/render/glx/shaders/glsl-lit.js`; `js/render/three/tsl-lit.js` | File boundary above applies. |
| changing preset drops a pending TIER verify | 869-880 | 878-879 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| a CPU-bound device sheds features instead of looping on a scale lever that cannot help | 882-912 | 907-908, 910-911 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| raising the GRAPHICS preset releases a shed the preset itself caused | 914-945 | 930, 935, 939-940, 941-942, 943-944 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| clearStrikes / safeMode(false) releases a latched _perfTier | 947-959 | 953, 956-957, 958 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| a refused climb backs off: restore→verify-fail→revert must not cycle every cooldown | 961-978 | 976, 977 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| a device slow from frame 1 is degraded despite the cooldowns boot arms | 980-1001 | 998, 1000 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| a GRAPHICS change made in the menu does not spend the next race's opening window | 1003-1017 | 1012, 1016 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| a cooldown armed in the previous race cannot spend the next race's opening window | 1019-1035 | 1033-1034 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| a cooldown armed DURING a race still holds (only the pre-race arm is skipped) | 1037-1053 | 1047, 1052 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| a device below 10 fps is SEEN by the governor, not filtered out of existence | 1074-1085 | 1077-1079 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| a GPU-bound device below 10 fps now steps the ladder (it could not be seen before) | 1087-1098 | 1095-1097 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| one huge frame is still a spike, not evidence about the device | 1100-1113 | 1109-1110, 1111, 1112 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| a run of slow frames feeds CLAMPED, so a 60 s gap can never enter as 60 000 ms | 1115-1122 | 1118-1119, 1120-1121 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| init() reconciles the boot tier with the resolved preset | 1135-1179 | 1155-1156, 1164-1165, 1166-1167, 1173, 1174-1175, 1176 | `js/perf/quality-preset.js` | File boundary above applies. |
| raw frame percentiles retain hitches and report discarded simulation time | 1181-1190 | 1187, 1187, 1187, 1187, 1188, 1188, 1189, 1189 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| the recovery hold is wall-clock: the same seconds at 60, 120 and 144 Hz | 1192-1221 | 1204, 1208, 1213, 1219, 1220 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| a lap with one heavy section must not cost a render-target realloc every few seconds | 1223-1272 | 1262-1263, 1270-1271 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| a genuine recovery still gets ALL its resolution back, ceiling or not | 1274-1287 | 1284, 1286 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| a device slow ONLY at full resolution settles, instead of re-probing it every few seconds | 1289-1324 | 1316-1317, 1318-1319, 1322-1323 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| a load that STEPS does not buy a reallocation every few seconds | 1326-1363 | 1361-1362 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| one short or negative frame sample (pause -> resume stamps) must not collapse the frame floor into a spurious step-down | 1365-1383 | 1380, 1381 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| preset changes expire scale attribution while keeping provisional resolution and no-op semantics | 1386-1404 | 1396, 1398, 1399, 1401 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| replay A: a 120 Hz phone drawing every second rAF is judged on drawn frames (was 4 moves, floor 8.9) | 1440-1451 | 1446, 1447, 1447, 1447, 1450 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| replay B: the opt-in "30" tier on a 60 Hz phone never sheds (was 10 moves, tier 4) | 1453-1468 | 1458, 1458, 1458, 1459, 1460, 1466, 1466 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| no frame skipped: tick(ms) and tick(ms, true) take identical decisions | 1470-1477 | 1473, 1474, 1474, 1476, 1476 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| replay Eq/Eq2: a vsync-quantised fill-bound phone crosses to 60 fps (was scale 1, floor 33.3) | 1479-1494 | 1484, 1485, 1486, 1491, 1492 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| replay Eq4: a fill-bound phone that half the pixels cannot cross still reaches 60 fps (was scale 1, floor 33.3) | 1496-1510 | 1504, 1505, 1506, 1507, 1508 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| replay Eq3/LPM: when the bigger probe buys nothing too, the lever is futile and scale returns to 1 | 1512-1521 | 1515, 1516, 1517, 1517, 1518, 1519 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| thermal drift on an undecided phone caps the presented rate at 45 before touching quality | 1567-1576 | 1570, 1571, 1572, 1573, 1574 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| an explicit render-rate choice is never overridden by thermal drift | 1578-1585 | 1581, 1582, 1583 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| without RenderRate the drift response is the governor rung, unchanged | 1587-1593 | 1590, 1591 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
| software garage preview sheds render scale on SwiftShader and restores | 1595-1599 | 1596, 1597, 1598 | js/perf/governor.js:470-1235 (tick:669; sentinelArm:548; setUserTier:1109); additional targets named below | File boundary above applies. |
### tests/unit/perf-race-entry.test.mjs

Fixture/limits: Synthetic stage rows only; no actual race-entry timings.

Shared/setup assertion spans: none.

Production target family: tests/helpers/perf-race-entry.mjs.

| name | range | assertionSpans | target | meaning / limits |
|---|---|---|---|---|
| formatStageTable orders stages by duration | 5-11 | 9, 10 | tests/helpers/perf-race-entry.mjs | File boundary above applies. |
| markdownStageTable renders a GitHub table | 13-16 | 15 | tests/helpers/perf-race-entry.mjs | File boundary above applies. |
| markdownDiffTable and raceOnlyStages summarise race vs practice | 18-27 | 25, 26 | tests/helpers/perf-race-entry.mjs | File boundary above applies. |
### tests/unit/perf-sentinel.test.mjs

Fixture/limits: Fresh real governor per Map-like storage/build fixture; inferred crashes, not process kills.

Shared/setup assertion spans: none.

Production target family: js/perf/governor.js:470-598,1062-1161.

| name | range | assertionSpans | target | meaning / limits |
|---|---|---|---|---|
| a race that never ended is counted as a crash | 45-54 | 51, 52, 53 | js/perf/governor.js:470-598,1062-1161 | File boundary above applies. |
| two strikes pin the heavy floor — the state that looks like a broken renderer | 56-60 | 58, 59 | js/perf/governor.js:470-598,1062-1161 | File boundary above applies. |
| a NEW BUILD clears the strikes | 62-69 | 66, 67, 68 | js/perf/governor.js:470-598,1062-1161 | File boundary above applies. |
| an update mid-race is not a crash | 71-78 | 77 | js/perf/governor.js:470-598,1062-1161 | File boundary above applies. |
| within the SAME build the strikes still accumulate | 80-87 | 85, 86 | js/perf/governor.js:470-598,1062-1161 | File boundary above applies. |
| clearStrikes() is the manual way out | 89-97 | 92, 94, 95, 96 | js/perf/governor.js:470-598,1062-1161 | File boundary above applies. |
| paying a strike down on GRAPHICS: MEDIUM releases autoTier to the new crash floor (#3294) | 99-111 | 105, 107, 108, 109 | js/perf/governor.js:470-598,1062-1161 | File boundary above applies. |
| a menu world build that never raced is not a crash | 113-122 | 118, 119, 120, 121 | js/perf/governor.js:470-598,1062-1161 | File boundary above applies. |
| the first race tick stamps the session so a later kill still counts | 124-135 | 128, 129, 131, 133, 134 | js/perf/governor.js:470-598,1062-1161 | File boundary above applies. |
| desktop never enters safe mode at all | 137-148 | 146, 147 | js/perf/governor.js:470-598,1062-1161 | File boundary above applies. |
| lifetime evidence counts ticked crashes once across same/new builds, excluding menus | 150-160 | 155, 156, 157, 158 | js/perf/governor.js:470-598,1062-1161 | File boundary above applies. |
### tests/unit/perf-spans.test.mjs

Fixture/limits: Fake clock plus Node performance and one game VM; no real GPU timestamps or browser LoAF support.

Shared/setup assertion spans: none.

Production target family: js/perf/spans.js:23; js/agent/apex.js perf; tools/lib/game-vm.cjs.

| name | range | assertionSpans | target | meaning / limits |
|---|---|---|---|---|
| off by default: begin/end record nothing | 18-23 | 21, 22 | js/perf/spans.js:23; js/agent/apex.js perf; tools/lib/game-vm.cjs | File boundary above applies. |
| on: durations land in p50/p95/p99/max | 25-33 | 30, 31, 31, 31, 31, 32 | js/perf/spans.js:23; js/agent/apex.js perf; tools/lib/game-vm.cjs | File boundary above applies. |
| nested spans are independent; end without begin is ignored | 35-42 | 41, 41, 41 | js/perf/spans.js:23; js/agent/apex.js perf; tools/lib/game-vm.cjs | File boundary above applies. |
| ring wraps: window caps at 512 while n keeps counting | 44-50 | 49, 49 | js/perf/spans.js:23; js/agent/apex.js perf; tools/lib/game-vm.cjs | File boundary above applies. |
| reset clears spans; report is JSON-serialisable | 52-58 | 55, 57 | js/perf/spans.js:23; js/agent/apex.js perf; tools/lib/game-vm.cjs | File boundary above applies. |
| LoAF is feature-detected: unsupported env reports supported:false, no throw | 60-65 | 63, 64 | js/perf/spans.js:23; js/agent/apex.js perf; tools/lib/game-vm.cjs | File boundary above applies. |
| __apex.perf() on the booted game: ai/collide spans fill from step() | 67-85 | 72, 72, 77, 77, 78, 79, 80, 81, 82 | js/perf/spans.js:23; js/agent/apex.js perf; tools/lib/game-vm.cjs | File boundary above applies. |
| measure(true) tags each phase with a detail.devtools track-entry; off emits nothing | 87-105 | 93, 97, 98, 100, 100, 100, 101, 102, 104 | js/perf/spans.js:23; js/agent/apex.js perf; tools/lib/game-vm.cjs | File boundary above applies. |
| trace measures stay bounded without losing observer entries or unrelated timeline data | 107-136 | 120, 123, 124, 125, 126, 128, 129, 130, 131 | `js/perf/spans.js` | File boundary above applies. |
| reset and disabling trace measures release partial batches without disabling span recording | 138-160 | 147, 148, 151, 152, 154, 155 | `js/perf/spans.js` | File boundary above applies. |
### tests/unit/perf-try.test.mjs

Fixture/limits: Mixed real game VM and GLX WebGL mock behavior with comment-stripped shader/structure pins; shaders are not compiled or rendered.

Shared/setup assertion spans: none.

Production target family: `the deleted PerfTry module`; `index.html`; `tools/manifest.cjs`; `js/ui/settings-tabs.js`; `js/lighting/knobs.js`; `js/lighting/track-lights.js`; `js/lighting/frame-lights.js`; `js/lighting/lighting.js`; `js/game.js`.

| name | range | assertionSpans | target | meaning / limits |
|---|---|---|---|---|
| PerfTry module and the PERF tab are gone | 107-116 | 108, 110, 111, 112, 114, 115 | target family above | File boundary above applies. |
| late sky is the only world draw order: world meshes → sky → glow → present | 118-127 | 120, 122, 123, 125, 126 | js/game.js render path; GLX mock-backed backend; GLSL/WGSL/TSL shader sources named in case | File boundary above applies. |
| env-probe face uses the same opaque → sky order as the main camera | 129-146 | 134, 136, 139, 141, 142, 143, 144, 145 | js/game.js render path; GLX mock-backed backend; GLSL/WGSL/TSL shader sources named in case | File boundary above applies. |
| main camera cullDist contains the far-plane corners (not the 150 m probe cap) | 148-155 | 153, 154 | js/game.js render path; GLX mock-backed backend; GLSL/WGSL/TSL shader sources named in case | File boundary above applies. |
| AI cars outside an 8 m frustum sphere are not drawn — shadows enqueued first only with apex26.fieldLod=0 | 157-194 | 183, 184, 185, 186, 190, 191, 192 | js/game.js render path; GLX mock-backed backend; GLSL/WGSL/TSL shader sources named in case | File boundary above applies. |
| GLX skips equal tuner-uniform re-uploads (lit / sky / composite) | 196-219 | 205, 206, 209, 213, 217, 218 | js/game.js render path; GLX mock-backed backend; GLSL/WGSL/TSL shader sources named in case | File boundary above applies. |
| props fuse uses sealed typed accumulators | 221-245 | 228, 231, 232, 234, 235, 236, 237, 238, 239, 243, 244 | `js/track/scenery/models.js` | File boundary above applies. |
| already-landed leftovers stay in the product path | 247-256 | 249, 250, 252, 255 | `js/track/scenery/build-props.js`; `js/track/core/geom.js` | File boundary above applies. |
| env-probe radial cull is 150 m without a toggle | 258-295 | 264, 266, 269, 271, 273, 277, 278, 279-280, 285, 286, 287, 289, 290, 291, 292, 293, 294 | `js/render/glx/glx.js`; `js/game.js`; `js/render/webgpu/wgx.js`; `js/render/three/tlx.js` | File boundary above applies. |
| GLSL / WGSL / TSL keep only the gated ON path | 297-318 | 300, 301, 302, 303, 307, 308, 309, 310, 314, 315, 316, 317 | target family above | File boundary above applies. |
| SETTINGS still has GRAPHICS: HIGH and a door-index stack | 320-359 | 325, 326, 328, 329, 330, 331, 333, 336, 337, 338, 347, 348, 349, 350, 351, 352, 354, 357-358 | `index.html`; `js/perf/quality-preset.js`; `js/ui/settings-tabs.js`; `css/components.css` | File boundary above applies. |
| sun GGX and clearcoat skip backfaces on all three backends | 361-373 | 365, 366, 368, 369, 371, 372 | `js/render/glx/shaders/glsl-lit.js`; `js/render/webgpu/wgsl-chunks.js`; `js/render/three/tsl-lit.js` | File boundary above applies. |
| composite skips dummy SSAO / bloom / godray fetches | 375-432 | 377, 378, 379, 380, 381, 382, 396, 401, 402, 403, 404, 405-406, 409, 410, 411, 412, 415, 416, 418, 420, 421, 422, 424, 427, 428, 429, 430, 431 | target family above | File boundary above applies. |
| SSAO reconstructs the centre from one depth sample | 434-445 | 436, 437, 439, 441, 443, 444 | `js/render/glx/shaders/glsl-post.js`; `js/render/webgpu/wgsl-post.js`; `js/render/three/tsl-post.js` | File boundary above applies. |
| frustum-plane helpers are exported by GLX and TLX for the car cull | 447-457 | 450, 451, 453, 454, 456 | `js/render/three/tlx.js` | File boundary above applies. |
| fog stack skips pow/exp when density and mist are off | 459-478 | 464, 465, 470, 471, 473, 474, 476, 477 | `js/render/glx/shaders/glsl-lit.js`; `js/render/webgpu/wgsl-chunks.js`; `js/render/three/tsl-lit.js` | File boundary above applies. |
| the fog's eye distance is measured per FRAGMENT on all three backends | 480-498 | 489, 490, 491, 492, 493, 494, 495, 496, 497 | `js/render/glx/shaders/glsl-lit.js`; `js/render/three/tsl-lit.js`; `js/render/webgpu/wgsl-chunks.js` | File boundary above applies. |
| window sun flash skips pow(_,22) when wet or the knobs are off | 500-509 | 504, 506, 508 | `js/render/glx/shaders/glsl-lit.js`; `js/render/webgpu/wgsl-chunks.js`; `js/render/three/tsl-lit.js` | File boundary above applies. |
| sky sunset-band guards admit low solar keys but reject high sun and every night moon key | 511-544 | 521, 524, 531, 540, 541, 542 | `js/render/glx/shaders/glsl-sky.js`; `js/render/webgpu/wgsl-chunks.js`; `js/render/three/tsl-sky.js` | File boundary above applies. |
| WGX composite godray fetch is gated on lift.w haveGR | 546-558 | 553, 554, 555-556, 557 | `js/render/webgpu/wgsl-post.js`; `js/render/webgpu/wgx.js` | File boundary above applies. |
| sky twilight cloud wash skips pow(sd,2.5) when twilight is 0 | 560-566 | 564, 565 | `js/render/glx/shaders/glsl-sky.js`; `js/render/three/tsl-sky.js` | File boundary above applies. |
| godray sun HG and TSL sun-half skip when shaft strength is 0 | 568-582 | 572, 573, 574, 576, 577, 579, 580, 581 | `js/render/glx/shaders/glsl-post.js`; `js/render/webgpu/wgsl-post.js`; `js/render/three/tsl-post.js` | File boundary above applies. |
| TSL heat-haze tests the plume before the scene-tag fetch | 584-588 | 586, 587 | `js/render/three/tsl-post.js` | File boundary above applies. |
| WGX SSR pass omitted carReflect is the 0.05 tuner default | 590-605 | 600, 602-603 | `js/render/webgpu/wgx.js` | File boundary above applies. |
| env-probe holds after a full 6-face cycle until the player moves | 607-628 | 619, 622, 626 | js/game.js render path; GLX mock-backed backend; GLSL/WGSL/TSL shader sources named in case | File boundary above applies. |
### tests/unit/perf-vm-alloc-budget.test.mjs

Fixture/limits: Child Node VM allocation census with stub renderer; GC-free window mean, not browser/GPU memory.

Shared/setup assertion spans: none.

Production target family: tools/perf/vm-alloc-census.mjs; tools/perf/baselines/vm-alloc.json.

| name | range | assertionSpans | target | meaning / limits |
|---|---|---|---|---|
| the baseline describes the scenario the census runs | 20-25 | 22, 23, 24 | tools/perf/vm-alloc-census.mjs; tools/perf/baselines/vm-alloc.json | File boundary above applies. |
| compare(): over the ratio fails, at or under it passes, far under asks for a lower baseline | 27-34 | 29, 30, 31, 32, 33 | tools/perf/vm-alloc-census.mjs; tools/perf/baselines/vm-alloc.json | File boundary above applies. |
| monza race loop: JS bytes per frame stay within the baseline ratio | 36-41 | 38, 40 | tools/perf/vm-alloc-census.mjs; tools/perf/baselines/vm-alloc.json | File boundary above applies. |
### tests/unit/perf-vm-leak-cycles.test.mjs

Fixture/limits: Real VM race/menu lifecycle with counted mock GPU handles/listeners/timers; excludes renderer internal caches and heap bytes.

Shared/setup assertion spans: none.

Production target family: tools/perf/vm-leak-census.mjs; Tracks.free; G.quitToMenu.

| name | range | assertionSpans | target | meaning / limits |
|---|---|---|---|---|
| monza + spa × 3: GPU handles, listeners and timers repeat exactly from cycle 2 | 25-33 | 28, 31, 32 | tools/perf/vm-leak-census.mjs; Tracks.free; G.quitToMenu | File boundary above applies. |
| positive control: a skipped Tracks.free and a listener added per quit are both caught | 35-51 | 48, 49, 50 | tools/perf/vm-leak-census.mjs; Tracks.free; G.quitToMenu | File boundary above applies. |
### tests/unit/persistence-vm.test.mjs

Fixture/limits: Real game VM storage fault injection; warning DOM/download stays in browser twins.

Shared/setup assertion spans: none.

Production target family: js/core/store.js:29; __apex.persistState/aeroMode/logs through tools/lib/game-vm.cjs.

| name | range | assertionSpans | target | meaning / limits |
|---|---|---|---|---|
| a healthy page reports ok | 31-36 | 33, 34, 35 | js/core/store.js:29; __apex.persistState/aeroMode/logs through tools/lib/game-vm.cjs | File boundary above applies. |
| a failing write is recorded, logged, and reported by persistState() | 38-47 | 43, 44, 45, 46 | js/core/store.js:29; __apex.persistState/aeroMode/logs through tools/lib/game-vm.cjs | File boundary above applies. |
| the exception's own name is reported, not a generic flag | 49-70 | 67, 68 | js/core/store.js:29; __apex.persistState/aeroMode/logs through tools/lib/game-vm.cjs | File boundary above applies. |
| the session still reads back what it wrote (a lost save is not a lost session) | 72-76 | 75 | js/core/store.js:29; __apex.persistState/aeroMode/logs through tools/lib/game-vm.cjs | File boundary above applies. |
| the loud warning fires once, not once per write | 78-100 | 96, 98 | js/core/store.js:29; __apex.persistState/aeroMode/logs through tools/lib/game-vm.cjs | File boundary above applies. |
### tests/unit/phone-input-improvements.test.mjs

Fixture/limits: EventTarget DOM, simulated RTC channels/clock/media/sensors and real loopback; no physical phone, permissions UI or WAN.

Shared/setup assertion spans: none.

Production target family: js/input/phone-pad.js:69-116,221,488,647; js/net/transport.js; js/net/scan.js.

| name | range | assertionSpans | target | meaning / limits |
|---|---|---|---|---|
| actual RTC backpressure preserves phone edge FIFO and retries hello without double delivery | 57-64 | 60, 60, 63, 63 | js/input/phone-pad.js:69-116,221,488,647; js/net/transport.js; js/net/scan.js | File boundary above applies. |
| queue expires old actions and coalesces nav repeats; long stall never floods | 65-74 | 69, 71, 72, 72, 73, 73 | js/input/phone-pad.js:69-116,221,488,647; js/net/transport.js; js/net/scan.js | File boundary above applies. |
| retargeted lift releases only its pointer while another finger remains; capture alone does not release | 75-85 | 78, 80, 80, 81, 83, 84 | js/input/phone-pad.js:69-116,221,488,647; js/net/transport.js; js/net/scan.js | File boundary above applies. |
| semantic activation fires once; pointer-generated click does not double-fire | 86-91 | 90 | js/input/phone-pad.js:69-116,221,488,647; js/net/transport.js; js/net/scan.js | File boundary above applies. |
| old peer keeps v1 samples; touch requires explicit advertised capability, then centers on release | 92-107 | 95, 97, 98, 102, 102, 103, 104, 105, 106, 106 | js/input/phone-pad.js:69-116,221,488,647; js/net/transport.js; js/net/scan.js | File boundary above applies. |
| input health requires an ACK for an actual sent sequence; HUD traffic cannot fake freshness | 108-117 | 110, 111, 112, 113, 114, 115, 116 | js/input/phone-pad.js:69-116,221,488,647; js/net/transport.js; js/net/scan.js | File boundary above applies. |
| desktop ACKs only accepted fresh samples and tags phone ownership | 118-127 | 123, 124, 125, 125, 126 | js/input/phone-pad.js:69-116,221,488,647; js/net/transport.js; js/net/scan.js | File boundary above applies. |
| new phone and actual desktop link negotiate touch/ACK over the real loopback transport | 128-137 | 134, 136, 136, 136 | js/input/phone-pad.js:69-116,221,488,647; js/net/transport.js; js/net/scan.js | File boundary above applies. |
| window release, backgrounding and disconnect center touch steering without clearing another pointer early | 138-146 | 141, 142, 144, 144, 145, 145 | js/input/phone-pad.js:69-116,221,488,647; js/net/transport.js; js/net/scan.js | File boundary above applies. |
| actual scanner stops on manual connect/cancel and invalidates pending sensor/media work | 148-181 | 167, 168, 169, 171, 175, 175, 176, 177 | `js/net/scan.js` | File boundary above applies. |
| an old cancelled camera start cannot hide or stop the newer scan panel | 183-201 | 192, 193, 194, 196, 197, 198, 198, 199, 199, 199, 200 | `js/net/scan.js` | File boundary above applies. |
### tests/unit/phone-pad-netplay-vm.test.mjs

Fixture/limits: Real game Input and two independent real loopback pairs; no WebRTC radios, actual touch or remote peer latency.

Shared/setup assertion spans: none.

Production target family: js/input/phone-pad.js:221,488; js/input/input.js; js/net/transport.js; __apex net/step hooks via game-vm.

| name | range | assertionSpans | target | meaning / limits |
|---|---|---|---|---|
| the net stack and the phone module load together, and a netplay session starts | 70-76 | 71, 72, 73, 74, 75 | js/input/phone-pad.js:221,488; js/input/input.js; js/net/transport.js; __apex net/step hooks via game-vm | File boundary above applies. |
| inside the session the phone's throttle drives the LOCAL car, and the rival stays network-owned | 78-93 | 84, 85, 90, 91, 92 | js/input/phone-pad.js:221,488; js/input/input.js; js/net/transport.js; __apex net/step hooks via game-vm | File boundary above applies. |
| inside the session the phone's tilt is the steer the game reads | 95-114 | 104, 105, 112 | js/input/phone-pad.js:221,488; js/input/input.js; js/net/transport.js; __apex net/step hooks via game-vm | File boundary above applies. |
| two wires, no crosstalk: phone edges reach Input once, the session's traffic never reaches the phone link | 116-129 | 120, 121, 122, 127, 128 | js/input/phone-pad.js:221,488; js/input/input.js; js/net/transport.js; __apex net/step hooks via game-vm | File boundary above applies. |
| stopping the session leaves the phone driving; dropping the phone leaves the session up | 131-148 | 133, 134, 138, 142, 145, 146 | js/input/phone-pad.js:221,488; js/input/input.js; js/net/transport.js; __apex net/step hooks via game-vm | File boundary above applies. |

Parameter expansions: pause-key-tools tool case runs for garrival→ga-close, photo-studio→ps-close, spotifypanel→sp-close. Governor software readback cover subtests run loading/carsetup/race-settings on software and hardware plus hidden covers. Numeric governor loops sweep helpful tier 2–4, scale gains 4/8/15/25%, 60/120/144 Hz, invalid samples -8/-5/-3/0/NaN, preset directions 0↔4, replay fill costs 20/22/24/26/28/30 and thermal auto/explicit/absent-rate paths. Announce camera loop covers chase/cockpit/heli/side/cinematic/low/overhead; warning priorities and broadcast optional cards are tested independently. Scanner lifecycle case sweeps manual/QR/cancel/pending-media/pending-sensor/hidden-media/hidden-sensor. These loops share their declaration’s assertion spans.
