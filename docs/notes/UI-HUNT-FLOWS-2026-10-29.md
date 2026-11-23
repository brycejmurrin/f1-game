# UI hunt — interactive flows at 844×390 touch (2026-10-29)

Read-only bug-hunting lane (dispatcher session_01BEw9UFcGrUdnxAQwobtH1J). Scope: menu FLOWS a static layout
audit cannot see — back/Escape/history, focus, D-pad reachability, scroll-to-final-action, stale state,
persistence, rotation, double-tap. The in-race HUD and the static layout matrix belong to other lanes.

**Rig.** One headless Chromium (harness `launchChromium`), Playwright device `iPhone 13 landscape` resized to
**844×390**, `hasTouch` + `isMobile`, DPR 3, service worker blocked, TLX default backend, working tree at
`b67866b6`. Taps are real `touchscreen.tap` / `locator.tap`; double-tap = two taps 120–175 ms apart (an ordinary
thumb double-tap; `touch-action: manipulation` turns each into a click). Driver and job scripts were scratch
(`scratch/uihunt/`, not committed). Dedupe: prior-art scan of `docs/BUGS.md`, `docs/notes/DEFECT-LEDGER.md`,
`SYSTEM-AUDIT-4-2026-10-26.md` and `git log` — none of the rows below were found there.

## Ranked findings

| # | Sev | Screen | Exact repro (844×390 touch) | Evidence | Suspected file:line | Fix idea |
|---|---|---|---|---|---|---|
| 1 | HIGH | Pause menu — QUIT / RESTART confirm | Race → ❚❚ → double-tap QUIT (175 ms) | Both taps reach `#pm-quit` (`pm-quit@11070`, `@11245`); race ends, title shown. Confirm mode is the default (`apex26.pauseConfirm` unset = "on") | `js/ui/pause-opts.js:151-163` `onPauseClick`: second press counts at any age ≤ `ARM_MS`, no floor | Second press must be ≥ ~350 ms after `armed.at` (else re-arm / swallow) — the guard exists to stop exactly an accidental double press |
| 2 | HIGH | Every screen, mid-race too | Open Settings (or race) → browser Back (Android back button/gesture, iOS Safari left-edge swipe) | `page.goBack()` from Settings → `about:blank`, `__apex` gone; `history.length` stays 2 through every screen | No `pushState`/`popstate` anywhere in `js/` (only `replaceState` in deep-link, share-code, title-flow…) | Push one history entry when a layer opens / a race starts; `popstate` presses the top layer's `data-esc-close` door (TopModal) or opens pause; re-push while any layer is up |
| 3 | MED-HIGH | Title doors (ghost tap) | Double-tap a title door: the 2nd tap activates whatever is under the thumb on the new screen | RACE → circuit pick silently changes (BAHRAIN → SUZUKA); TIME TRIAL → SINGAPORE; TRACK DESIGNER → the designer's **RACE** button fires → lands in RACE SETUP; RACE A FRIEND → JOIN A FRIEND; SETTINGS → BACK (opens and instantly closes); SEASON → a calendar row (R11 MADRID); results MENU → CAREER MODES opens | No ghost-click guard anywhere (`grep` ghost/double-tap: none). Designer: `js/editor/designer.js:804` | One shared tap shield: on layer show (TopModal `onLayerShow` / dialog `wire`) stamp `openedAt` and swallow clicks inside it for ~350 ms in a capture listener; or `pointer-events:none` for the vt entry |
| 4 | MED | Garage, Practice → close | Title → GARAGE → CLOSE GARAGE (or Escape); title → PRACTICE → Escape | Focus lands on `<body>`, not the door (RACE/TT/CAREER/VS/… return correctly). Event trace: `in:cs-cam` fires BEFORE the layer's `hidden` mutation, so `onLayerShow` sees focus already inside | `js/ui/modal.js:317-319` `onLayerShow` returns early ("the app placed focus itself") without recording `opener`; practice focuses its goal at `js/ui/experience.js:228` | Record the opener from the last focus OUTSIDE the layer (a `focusout`/`focusin` tracker) even when the app placed focus |
| 5 | MED | Settings search | SETTINGS → type `fov` in FIND A SETTING → close → reopen SETTINGS | Reopened sheet still filtered (`q:"fov"`, 12 controls). Escape inside the field also closes the whole sheet (circuit search clears first) | `js/ui/settings-search.js:236` — no reset on close | Clear the input + `paint()` from the `onLeave` hook / on sheet close |
| 6 | MED | Season setup | SEASON → CUSTOMISE SEASON → ✕ two rounds → BACK or Escape → CUSTOMISE again | Calendar 25 → 23 rows, back, reopen → 25; no prompt | `js/career/season-ui.js:261` `ss-back` → `close()` drops `draft` | Dirty-check: arm BACK ("DISCARD CHANGES?") like the pause confirm, or keep the draft until APPLY |
| 7 | LOW-MED | Career new-career wizard | CAREER MODES → SLOT 1 → NEW CAREER → Escape / BACK | Goes straight to the title, skipping the slot picker it came from | career wizard BACK (`#cr-back`), cf. `js/ui/title-flow.js` `openCareerSlots("title")` | BACK from the wizard returns to the slot list |
| 8 | LOW | RACE A FRIEND | VS → HOST A RACE (or JOIN) → want the other path | Step view offers only CLOSE; no BACK to HOST/JOIN. With #3 a double-tap lands in JOIN | `#vsfriend` step UI (`js/net/` lobby) | Add BACK in the step header; Escape steps back before closing |
| 9 | LOW | All modal dialogs (Settings, How to Play, Data Hub, VS, Pause) | Tab past the last control | Focus parks on `<body>` for one Tab (`BODY!OUT` in every walk), then wraps | `js/ui/modal.js:216-233` — `<body>` gets no `focusin`, so the comment's "pull that back" never runs | Reuse `wireLayer`'s keydown Tab wrap for dialogs |
| 10 | LOW | Data Hub | Arrow-key / D-pad from the tab strip | BFS over 4 arrows reaches 9/12 controls; `#dh-close-btn` (top-right ✕) never reached (Escape/B still close) | `js/ui/menu-nav.js` spatial step from `#dh-tab-*` | Make the header ✕ reachable (Up from the tab strip) |
| 11 | LOW | Data Hub door | WATCH → close → DATA HUB | DATA HUB opens on WATCH & DRIVE (tab memory shared by both doors) | data hub tab memory | Each door opens its own default tab |
| 12 | LOW | Career, rotation | CAREER → focus a mid-list button → rotate to portrait | Focused control off-screen in portrait (`cr-body` scrollTop kept at 25 while height grows 765→1374); returns fine on rotate back | `#cr-body` | `scrollIntoView({block:"nearest"})` on the focused control after a resize |

## Checked and clean

- Escape from all 16 title doors returns to the title; focus returns to the door except #4. Pause → Settings →
  Escape → pause → Escape resumes; Garage camera panel claims Escape first; track-detail Escape → picker.
- Scroll reaches the final action and it is hit-testable on every screen walked (title, picker, career, VS,
  settings, help, data hub, photo studio, garage, season setup, pause, results).
- Settings persistence: 114 rows stepped across Controls, Driving, Display, Appearance, Accessibility,
  Graphics and Visual; 110 survive reload. The 4 that reset are the HUD-layout editor's pickers
  (`pm-hl-set/el/visibility`, transient) and fullscreen (cannot re-enter without a gesture).
- Rotation 844×390 ↔ 390×844 round trip keeps the screen, focus and scroll on Settings, picker, Career, Help and
  Data Hub; the rotate blocker stays off in menus.
- Console: no `pageerror`, no unhandled rejection, no `console.error` across every flow above (warnings only:
  SwiftShader adapters, SW blocked by the rig, scenery suppression counts).
- Circuit search, garage tab memory and data hub tab memory reopen as intended.

## Data Hub at 844×390 — the layout-audit timeout is the harness (dispatcher follow-up)

The 844×390 layout-audit could not open five Data Hub tab cells (`#datahub:not([hidden])` timed out).
**This is a harness reset bug, not a game bug.** Repro on the same rig:

- Player path: tapping DATA HUB opens it every time (3 out of 3 Escape → reopen cycles). With the network up,
  SCHEDULE, STANDINGS, RESULTS, LIVE and the GPS export (under Developer tools) all render content in the
  211 px panel.
- layout-audit's reset (`tools/ui/layout-audit.mjs:775-777`) hides every overlay with `hidden = true` instead of
  going through the hub's own close. `DataHub`'s `openFlag` stays `true`. The next `#mb-data` click then
  takes the "already open: switch tab only" branch (`js/data/hub.js:267`) and never un-hides the root. The
  title passes the harness's `titleUsable` check, so no reload is triggered, and the wait times out. Reproduced:
  `afterHarnessReset {hidden:true, open:false}` → click `#mb-data` → `TIMEOUT`.
- No game path writes `#datahub.hidden` except `DataHub.close()`, so players cannot reach this state.
- Harness fix: call `DataHub.close()` in the reset before hiding overlays, if the hub is open
  (`typeof DataHub !== "undefined" && DataHub.isOpen()`). Better still, close each open layer through its
  `data-esc-close` door, which probes.md §2 asks for.

## Not run

Real iPhone Safari (emulated WebKit UA on Chromium only); gamepad (no emulation in this rig — D-pad was proxied
by arrow keys); screen reader; VS FRIEND with a live peer; track designer and photo studio deep flows; the
data hub telemetry popup; settings that APPLY (only that they persist).
