# UI hunt 4 — menu flows, deeper (uihunt4-flows-1030, 2026-10-30)

Hunt id `uihunt4-flows-1030`. Work list: issue #4273 (what round 3, PR #4212, left open; report
`docs/notes/UI-HUNT-3-FLOWS-2026-10-30.md`). Base: deploy tip `7c6d11c6`. Already fixed by #4228 and not redone
here: the settings-search reset, the hub ✕, rotation focus and Garage focus. Scratch drivers (not committed):
`scratch/uihunt4/*.mjs`, one Chromium at a time, the working tree served on :3456; logs `artifacts/logs/uihunt4-*.log`.

## Per-item verdicts

| # | #4273 item | verdict | evidence |
|---|---|---|---|
| 1 | Data Hub `dh-tab-live` unreachable at 1280×800 | **not a bug** (round 3's BFS focused roving tabs directly); a neighbour bug fixed | `dh-arrows.mjs`: a BFS whose every edge is a REAL `keyboard.press` replayed from a fresh hub open reached 19 targets in 48 presses, LIVE among them. Along the rail, tab-owned arrows go to the hub's own handler (`hub.js` roving keydown). Fixed: Up/Down off a tab over an EMPTY panel (STANDINGS / LIVE offline) fell to the DOM wrap and focused the NEXT TAB without selecting it (`dh-rects.mjs`: Down from STANDINGS → `dh-tab-results`). `MenuNav.step` now skips the rail's own tabs in that wrap. Test: `menu-nav-spatial.test.mjs` |
| 2 | Status notes filled and inserted in one step | fixed | `SettingsNav.audioNote` speaks through `LiveRegion.say(…, "hud")` once per showing (the open modal's twin). The game.js HUD → race-settings note already called `LiveRegion.say` (game.js 8866), so no game.js edit (it is in open PRs #3981 / #4262). Test: `settings-tabs.test.mjs` |
| 3 | First-run: title boots with focus on `<body>` | decided + fixed | Measured (`first-run.mjs`, 1280×800, fresh store): boot `BODY`; ArrowDown/Up → `mb-career` (the `data-menu-default` anchor); Tab → `soundbtn` (DOM order); Enter → nothing; the pad already seeds via `padSeedFocus` on its first poll. **Decision: no boot autofocus** (a touch player would get a focus ring, a screen reader a jump past the title). Enter/Space with focus on `<body>` now seed the same anchor the first arrow does; Tab stays native. Test: `ui-improve-pass.test.mjs` |
| 4 | Reload-persistence matrix as a spec | done | `settings-reload.spec.js` second test: every live SettingRow `<select>` on every Settings page (163 measured) moved off its value → reload → diff. Transient by design, listed with reasons: fullscreen, the three HUD-layout editor pickers, the practice drill and goal, six Photo Studio framing/condition rows. XR MODE is not touched (switching it reloads into XR). `= run passed (2/2)` |
| 5 | Rotation round trip on every screen; real bfcache | see §Rotation | `rotate.mjs` |
| 6a | Gamepad menu scan cost | fixed | `leads.mjs` / `topparts.mjs` at 844×390: `UiLayers.top()` memo hit 0.008–0.018 ms; a cold call 3.2–5.1 ms median (max 11 ms), 12 cold calls per 3 s of rAF (the 250 ms memo window). The cost was the 36-id comma `querySelectorAll`: 3.62 ms vs 0.012 ms for the same ids by `getElementById` (5,347 nodes). `top()` now looks layers up by id and sorts to document order (the z-index tie rule). Tests: `layers-nav-memo.test.mjs` |
| 6b | Raw floats in phone-as-controller `aria-valuenow` | stale | already an integer percent (`phone-pad-page.js` 235-240, pinned by `phone-pad.test.mjs` "audit4 UB4") |
| 6c | Zero-size `aria-hidden` ancestors hide content | intended | probe: 0 on-screen `aria-hidden` subtrees with text on the title and Settings index. The audit's glyphs (`▾ ▴ SIZE PREVIEW GAS`) are the race dock's controls, hidden off-race. `#overlay` is `aria-hidden`+`inert` only while a modal is on top, and is restored on every door's Escape (7 doors, `overlay-hidden.mjs`). `#rotate-device`'s static `aria-hidden` is toggled by `syncRotateBlocker` |
| 7 | garage-livery-churn flake | quarantined, dated | #4212's attempt 1 (run 41059864671, job 124077512835): one 1024×1280 texture, empty name, created by three's `_renderTransparents` on the edit AFTER the 2.5 s pause (rows' gpuTex 0…0→1). 1024×1280 is the player decal-atlas PREVIEW (`car-draw.js`), so the path is the draft spare (`parkDraftAtlas` / `takeDraftSpare`), not the bay atlases the 10-27 exit fixed. Not reproducible on demand (about 1 in 38 jobs before). The spec now logs the texture's `version` and image type (a re-filled spare vs a fresh mint); row in `flaky-quarantine.json` until 2026-11-13 |
| 8 | Real iPhone via BrowserStack Automate | **blocked** | credentials are set and the hub answers, but `POST /session` returned `"Automate testing time expired."` (the account's Automate minutes are used up). Driver ready: `scratch/uihunt4/bs-iphone.mjs` (native edge swipe from x=2, native double-tap 120 ms apart, live site). VoiceOver cannot be driven through Automate at all. Item left open |

## Rotation

_Filled from `artifacts/logs/uihunt4-rotate.log`._
