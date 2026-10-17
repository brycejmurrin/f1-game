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

## Findings table (in progress)

| id | screen | viewport | kind | verdict |
|----|--------|----------|------|---------|
| F1 | hud | 390x844 | Brake intercepted by `#btn-throttle` | to verify (touch + screenshot) |
| F2 | settingsdriving | all | CONDITION-AWARE BRAKING CUES target 13 × 44 | to verify |
| F3 | settingsfiles | 932x430 | SAVE GARAGE FILE intercepted by `#pmsettings-inner > div:nth-of-type(3)` | to verify (first-record, see T3) |
| — | select / garage / career | 932x430 | `blocked by html` | not-a-bug candidate (T3); confirm at 932x430 as a second viewport |

## Sources
- Playwright emulation (hasTouch, isMobile): https://playwright.dev/docs/emulation
- CDP `Emulation.setSafeAreaInsetsOverride`: https://www.selenium.dev/selenium/docs/api/dotnet/webdriver/OpenQA.Selenium.DevTools.V146.Emulation.SetSafeAreaInsetsOverrideCommandSettings.html (verified live, above)
- axe-core target-size (24px circle, 4.8+): https://dequeuniversity.com/rules/axe/4.8/target-size
- Rendered line breaks with Range: https://www.bennadel.com/blog/4310-detecting-rendered-line-breaks-in-a-text-node-in-javascript.htm
- Safari innerHeight and toolbars: https://developer.apple.com/forums/thread/735055
