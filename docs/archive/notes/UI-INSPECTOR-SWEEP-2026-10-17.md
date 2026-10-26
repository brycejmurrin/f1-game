# UI inspector sweep — 2026-10-17

Scope: `node tools/ui/explorer.mjs inspect --screen <id> --viewports 932x430,844x390,390x844,1280x800`
over every catalog screen except `title` (Home is owned by #2611). Tool owned by #2613, so the
findings in §Tool gaps are proposals, not edits.

## History (git)
- `87cf319b5` (2026-10-15) added the explorer. `openSession({ touch })` and the touch `responsive`
  mode (settings only: 390x844, 844x390, 844x344) come from this commit.
- `56de57fe9` (#2587) added `inspect`, which calls `openSession(browser, url)` with no options, so
  touch never reached it. That makes T1 a wiring fix, not new plumbing.
- `85e657bac` refined CSS inspection and boxless clipping. It is already on the deploy tip.
- #2613 (`80f2aba95`, open) records `pointer.coarse/fine/hover/maxTouchPoints` to join with the
  native audits. It does **not** add a touch mode, safe-area override, provisional flags or a
  deferral exit code, so T1–T4 below are not covered by it.

## Tool gaps (measured on the deploy tip, Chromium 1194, Playwright 1.63.0)

| # | Gap | Evidence | Proposal |
|---|-----|----------|----------|
| T1 | **No touch.** `inspect` calls `openSession(browser, url)` without `touch`, so phone sizes run as a mouse desktop: `(pointer: coarse)` false, `--tap-min` 24px, the tiny-target floor stays 24 instead of 44. | `adaptive.media` in every 932x430 record; `tools/ui/explorer.mjs:135`. | `--touch` flag → `openSession(..., { touch: true })` (hasTouch/isMobile are per-context; a resize cannot switch them). Scratch probe: a touch context reports `pointer: coarse` true, `hover` false, `maxTouchPoints` 1. |
| T2 | **No safe-area insets.** `env(safe-area-inset-*)` is 0. | `--safe-*` tokens read `calc(0px + 8px)`. | `--safe l,r,t,b` → CDP `Emulation.setSafeAreaInsetsOverride({ insets })`. Measured: `padding-left: env(safe-area-inset-left)` goes 0px → 59px in this Chromium. The "Chromium cannot emulate a notch" comments in `layout-audit.mjs` and `menu-screens.mjs` are stale: their `--sat/...` CSS-var injection could become real `env()` values. |
| T3 | **Issues reported from unsettled layouts.** The first viewport after the 1280x800 boot never settles, and its hit tests land on `<html>`. | 14 of 116 records unstable; about 38 of the 41 `blocked … by html:nth-of-type(1)` flags are all at 932x430 (the first record) and absent at 844x390 on the same screens (select 19, garage 11, career 9). | When `settlement.stable` is false: re-sample once, then mark that record's issues `provisional`. Also wait on `document.getAnimations()` and `document.fonts.ready`. Report an `<html>`/`<body>` interceptor as `not-hit-testable` (transition / `pointer-events`), not as blocking by a sibling. |
| T4 | **Load deferral exits 1**, the same code as a page error, so a batch can't tell "retry" from "broken". | 29 of 55 first-pass screens: `Browser deferred: load average is >=3` (the sweep's own Chromium raised the load). | A distinct exit code (75, EX_TEMPFAIL) or `--wait-load <s>`. |
| T5 | **Single-point hit test.** It tests only the centre of the visible rect, so a half-covered button passes. | `inspector.mjs:148`. | Centre plus four inset points, or axe-core's unobscured-area + 24px-circle spacing (WCAG 2.5.8, axe ≥ 4.8). |
| T6 | **Missing defect classes the player sees:** a label split mid-word, clipped non-control text, overlap between sibling controls, and a screen scrolling that shouldn't. | Not in `issues` kinds. | Mid-word: per-word `Range.getClientRects()` with more than one line top. Text clip: `scrollWidth > clientWidth` under `overflow: hidden/clip`. Unexpected scroll: a per-screen `scroll: "none"|"y"` expectation in the catalog. Overlap: pairwise rect intersection of hit-testable controls. |
| T7 | **Booted at desktop size.** Boot-time classifiers see 1280x800. | `originalViewport` 1280x800. | `--boot-viewport WxH` (context viewport), plus device presets such as `iphone-pro-max-landscape` = 932x430, dpr 3, touch, insets 59/59/0/21. |
| T8 | **Output size.** One screen at four sizes prints MBs of JSON. | `artifacts/sweep/*.json`. | `--summary`: one line per issue (screen, viewport, kind, selector, provisional). |
| T9 | **Chromium is not iOS Safari.** WebKit isn't installed here, and Safari's toolbars change landscape `innerHeight`. | `/opt/pw-browsers` has Chromium only. | Keep a real-device (or BrowserStack) pass for final phone sign-off. |

| T10 | **A label's tap area is not counted.** A checkbox inside a `<label>` is measured alone, but tapping anywhere on the label toggles it. | F2 below. | Measure the activation area: the control's box joined with its wrapping or `for=` label. |

## Findings table (round 1)

Re-checked with a touch context booted at the target size (`hasTouch`/`isMobile`, `pointer: coarse` true), waiting for
finite animations to finish; one screenshot per cell in `artifacts/sweep/shots/`.

| id | screen | viewport | flag (desktop inspect) | touch re-check | verdict |
|----|--------|----------|------------------------|----------------|---------|
| F1 | hud | 390x844 | Brake intercepted by `#btn-throttle` | every pedal/button intercepted by `#rotate-device` | not-a-bug: portrait shows the rotate-device prompt by design |
| F2 | settingsdriving | 932x430, 844x390 | CONDITION-AWARE BRAKING CUES checkbox 13 × 44 | 14.2 × 56.7 | not-a-bug: `#pm-condition-cues` sits inside `label.player-tool-row` (`js/ui/condition-cue-controls.js:7`), so the whole row is the target (T10) |
| F3 | settingsfiles | 932x430 | SAVE GARAGE FILE intercepted | clean at 932x430 and 844x390 | not-a-bug: unsettled first record (T3) |
| — | select / garage / career | 932x430 | `blocked by html` ×38 | not re-flagged | not-a-bug (T3) |

## Round 2: `layout-audit.mjs` (touch, injected insets)

Every non-Home screen at ios-iphone-landscape-844, ios-iphone-landscape and ios-iphone-landscape-safari: 177 cells, 6
flagged, 19 skipped. The skips were timeouts while a commit hook's `test:guards` ran on top of the audit (load 13.7);
they need a rerun on a quiet box.

| id | screen | viewport | flag | verdict |
|----|--------|----------|------|---------|
| F4 | datastandings | all, including 1280x800 | constructor `.dh-name` 0–26px wide ("Me…", "F.", "N") | **CONFIRMED-LIVE**, fixed: `css/data.css` `.dh-row-cons` name floor 6.5em + `.dh-cons-main` `min-width: auto`, so the H2H bars wrap; spec `ui-redesign.spec.js` "data hub constructor names stay readable in phone landscape" |
| F5 | datastandings / dataresults | ios-iphone-landscape (852x393) | driver `.dh-name` ellipsis ("Max Verstappen") | to judge: 844x390 touch shot shows the driver names whole |
| F6 | vsfriend | all three | `#vs-close` 3px past `div.sheet-foot` left/right | **CONFIRMED-LIVE** (round 3): the skewX(-6deg) corners are shaved by the foot's `overflow:hidden` once the entrance animation ends; fixed in #2639 |
| F7 | trackdetail | all three | legend 2px past `#track-detail-canvas-wrap` | low: 2px |
| F8 | lightingtuner / cameratuner / flybyeditor | all three | `tapSoft` 14–27 | dev tools; not player-facing |

## Round 3: the improved inspector (#2628) — `inspect --touch --boot 932x430 --safe 0,59,21,59 --viewports 932x430,844x390 --summary`

All 57 non-Home screens. Every flag was re-checked live before any fix.

| id | screen | flag | verdict |
|----|--------|------|---------|
| F9 | career, garageteam, resultsseason, trackdetail @932x430 | every control `not-hit-testable` (`<html>`) | not-a-bug, **tool bug**: settle watched geometry only, so a fade was read as settled. Fixed in #2640 (settle waits for finite CSS animations); all four now `clean` |
| F10 | teampicker, customize | screen never opened (exit 1) | not-a-bug, **tool bug**: the catalog route clicked the garage card after a fixed 400 ms, before it rendered. Fixed in #2640 |
| F11 | teampicker @844x390 | team tiles `blocked` by the neighbour's `.tm-sub` | **CONFIRMED-LIVE**: wrapped tile text spilled over the next row (7 of 12); `#sel-teams` auto rows held 52px. Fixed in #2641 (`grid-auto-rows: max-content`) |
| F12 | customize @844x390 | NAME/CODE `blocked` by the foot | not-a-bug: fields scrolled under the foot's edge, reachable by scrolling. Inspector refinement filed below (T11) |
| F13 | Data Hub (every tab) | "Developer tools" `<summary>` 27px tall (44px touch floor) | CONFIRMED; rule in `css/menu-destinations.css:64` (Home session's file), handed to Bryce |
| F14 | settingsappearance | ADVANCED `<summary>` 28px tall | fixed upstream by #2632; clean on the tip `086e55bfc` |
| F15 | 9 screens | exit 75 at load 0.1 | **tool bug**: the occupancy check read a waiting shell that mentioned `playwright test` as a live suite. Fixed in #2638 (merged) |
| — | settingsdriving | condition-cues checkbox 13–14px | not-a-bug: label row is the target. Inspector now counts the label (#2628) |

**T11 (open):** a control partly under a sibling overlay at a scroller's edge reads `blocked`; when scrolling brings it clear, it should be "reachable by scroll", not a defect.

## Outcome

| PR | change | state |
|----|--------|-------|
| #2627 | Data Hub constructor names (F4) | merged |
| #2628 | inspector `--touch/--boot/--safe/--summary`, settle-retry, label targets, exit 75 (closes #2624) | merged |
| #2638 | occupancy: a shell mentioning `playwright test` is not a suite (F15) | merged (`086e55bf`) |
| #2639 | VS Friend CLOSE skew corners (F6) | open, ready for review |
| #2640 | inspector settle waits for CSS animations; catalog garage-card race (F9, F10) | merged (`0010dbe2`) |
| #2641 | team picker rows (F11) | open, ready for review |

## Sources
- Playwright emulation (hasTouch, isMobile): https://playwright.dev/docs/emulation
- CDP `Emulation.setSafeAreaInsetsOverride`: https://www.selenium.dev/selenium/docs/api/dotnet/webdriver/OpenQA.Selenium.DevTools.V146.Emulation.SetSafeAreaInsetsOverrideCommandSettings.html (verified live, above)
- axe-core target-size (24px circle, 4.8+): https://dequeuniversity.com/rules/axe/4.8/target-size
- Rendered line breaks with Range: https://www.bennadel.com/blog/4310-detecting-rendered-line-breaks-in-a-text-node-in-javascript.htm
- Safari innerHeight and toolbars: https://developer.apple.com/forums/thread/735055
