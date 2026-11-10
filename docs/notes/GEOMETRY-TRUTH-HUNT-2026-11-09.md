# Geometry truth hunt — is every size on screen the size the code thinks it is (2026-11-09)

Kind: measurement · Re-measure-by: 2026-12-15

Bryce: "I really worry our ui aspect resolution pixel density and sizes is inaccurate and we have false assumptions."
This is the geometry half (the pixel / canvas / DPR half is the sibling hunt). Tree `e808230`. Rule of the hunt: no
comment, doc, test name or note counts as evidence; only a number read off a running page does.

## How it was measured, and what was NOT

- **Emulation (everything below unless marked):** Chromium through the Playwright MCP with CDP
  `Emulation.setDeviceMetricsOverride` 852×393, DPR 3, `mobile: true`, touch, and
  `Emulation.setSafeAreaInsetsOverride` left 59 / right 59 / bottom 21 (real `env()` values, not injected tokens),
  the iPhone UA, and the whole of `tests/data/settings-defaults-export.json` seeded into `localStorage` before boot.
  The page reported `inner` = `clientWidth/Height` = `visualViewport` = 852×393, `100vh = svh = dvh = lvh = 393`,
  `env()` box 59,0 → 793,372, `(pointer: coarse)` true, `(hover: hover)` false, `(any-pointer: fine)` false.
- **Real device: NONE.** BrowserStack answered `Automate testing time expired` (Free plan) to the first real-iPhone
  session request, and the phone bridge needs Bryce holding the phone. Every WebKit-specific claim below is therefore
  **unverified** and listed as such. The fix in this PR (the bridge `geom` command) makes that one command on his
  phone instead of a research project.
- `display-mode: standalone` could not be emulated (`Emulation.setEmulatedMedia` left it `browser`). No CSS rule keys
  on it (grep: only `js/ui/platform-session.js`, `js/perf/*`, `js/agent/apex-bridge.js` read it), so layout is
  unaffected; the standalone-only behaviours (launch with stale portrait `inner*`, resume) are not covered here.
- A box artefact to know about: at DPR 3 the software renderer in this container draws ~1 frame/s, so the 10 Hz HUD
  tick starves and `fitHud` does not re-run. A first reading ("HUD SIZE 70 % changes nothing") was that artefact; it
  went away under `__apex.headless(true)`. Any HUD fit measurement here needs headless mode or DPR 1.

## Findings, ranked

### F1 — HUD SIZE is inert from 99 % to 200 % on his window, and the slider does not say so (confirmed, emulation)
- Claim: `js/ui/scale.js:44-58` "three independent sliders … the player has the device"; HUD SIZE range 70–200.
- Measured (race, Monza, buttons steering, his profile, headless ticks running), minimap width / POS tile:

  | HUD SIZE | `--hud-scale` | `--hud-z-top` | minimap | POS tile |
  |---|---|---|---|---|
  | 70 | 0.7 | (none) | 77.0 | 62.4×38.9 |
  | 85 | 0.85 | (none) | 93.5 | 75.8×46.6 |
  | 100 | 1 | 0.99 | 108.9 | 88.3×54.3 |
  | 130 | 1.3 | 0.99 | 108.9 | 88.3×54.3 |
  | **155.25 (his)** | 1.5525 | 0.99 | 108.9 | 88.3×54.3 |
  | 200 | 2 | 0.99 | 108.9 | 88.3×54.3 |

  The fit cap (`js/ui/hud.js:1490-1512`) is correct arithmetic: the top band has ~36 px of slack before `#btn-cam`
  at x 657. But half the slider's travel does nothing, and the row reads "HUD SIZE 155%" with no cap readout, while
  BUTTON SIZE on the same page reads "245% · fits 119%" (`js/ui/scale.js:358-362`). A player who finds the HUD "way
  too big" at 155 has to drag below 99 before anything moves.
- Confidence: high for the numbers; the cap value itself may differ by a few % on WebKit font metrics.
- Fix (not in this PR: `js/ui/scale.js` is owned by #5198): give HUD SIZE the same "· fits N%" readout from
  `--hud-z-top`, or clamp the slider's max to the cap. Issue filed.

### F2 — BUTTON SIZE 245 % paints two different sizes, and the readout names only one (confirmed, emulation)
- Measured: right dock `zoom 1.186` → pedals 85.4×85.4 CSS px (14.8 mm); left dock `zoom 1.942` → steer buttons
  139.8×139.8 (24.2 mm). Own size of both is 72×72. The label says "fits 119%"; the left side is at 194 %.
  Hit-testing matches the painted rects on all four corners for the square pedals; the round buttons miss only
  outside the circle.
- The per-side caps (`--hud-z-dock`, `--hud-z-dock-l`, `css/touch-controls.css:507,516`) are deliberate; the
  finding is the readout, and that one slider value produces a 1.64× left/right size ratio that no setting shows.
- Fix: readout "fits 194% / 119%" (same owner as F1). Folded into the F1 issue.

### F3 — His export plus either contract window does not reproduce today's pause screenshot (confirmed gap)
- Claim: UI contract §2 and memory `bryce-settings-profile`: the export "is his real iPhone" profile, and cell A
  (852×393, 59/21/59) or C (852×283) is what his phone shows.
- Measured with that export on this tree: pause sheet 718×222 at (67,75), RESUME at y 145–223, QUIT at 227–293, **no
  scroller anywhere**, at 852×393; the same card, still no scroller, at 852×283 with insets 59/0/59 and with
  67/21/67. His screenshot today shows a pause sheet that scrolls with no RESUME.
- So at least one input is wrong: the export is dated **2026-10-05, build 14012** (five weeks old; his title layout
  has changed since, by his own report), or the deployed build differs from this tree, or the real window is not
  one of the contract cells. Emulation cannot say which. Every "at his profile" number in the repo (this note
  included) inherits this.
- Fix: a fresh export from his phone and one `geom` + `display` bridge reading (this PR adds `geom`). Issue filed
  with `needs-decision` because only Bryce can produce either.

### F4 — The Safari-tab cell has two different definitions in the repo (confirmed, static)
- `docs/notes/UI-CONTRACT-2026-11-06.md` §2: C = 852×283, insets **59 / 0 / 59**. `tests/helpers/title-fit.mjs:28`:
  `852x283-safari` insets **67 / 21 / 67**. Neither cites a device reading; no file in `docs/` or `tests/data/`
  holds a recorded `visualViewport`/inset reading from his phone (grep). The pause card moved 8 px sideways and
  10 px up between the two (F3), so they are not interchangeable.
- Fix: read it on the phone (`geom`), then make both agree. Folded into the F3 issue.

### F5 — WebKit `zoom` semantics are assumed, never measured (unverified)
- The whole scale system is CSS `zoom` (38 rules) plus `Element.currentCSSZoom` in 20 JS readers.
  `js/ui/hud.js:14-17` asserts "iOS Safari < 26.4 has no currentCSSZoom" and `:953` "still paints zoom into rects".
  Fallbacks of the form `el.currentCSSZoom || 1` (`js/ui/results-sheet.js:189`, `js/ui/select-screen.js:1047,1260,1569`,
  `js/ui/hud-minimap.js:58`, `js/camera/photo-cam.js:222`, `js/data/telemetry-view.js:412`, `js/ui/dock-layout.js:109`)
  silently become 1 on an engine without the property; `js/ui/hud-layout.js:674-676` falls back to the element's OWN
  computed zoom, which drops every ancestor's.
- Measured in Chromium (standardized zoom): a 100×50 box at `zoom: 2` has rect 200×100 and `offsetWidth` 100;
  `10vw` inside it paints 170.4 px (2×), `env(safe-area-inset-left)` inside it paints 118 px (2×), `clamp(44px,…)`
  paints 88 px, a `position: fixed; inset: 0` child still covers 852×393, `@container` sees the OWN width (300, not
  600). The code is consistent with these (`--vwz`, `--svhz`, `.screen` unzoomed, caps divided by the published zoom).
- Not measured: whether his Safari (UA `Version/26.6.2`) agrees on each line. Web search did not settle it. `geom`
  reports `zoom: {currentCSSZoom, rectOf100At2, vwInZoom2, envInZoom2}` so one reading does.

### F6 — Width-only media bands his 852 px window sits inside (confirmed buckets, emulation)
Measured at 852×393: `(min-width: 700px)`, `761`, `800` true; `(max-width: 860px)`, `899` true; `(min-width: 900px)`
false; `(max-height: 400/460/500/560px)` true; `(max-height: 380px)` false; `(min-height: 370px)` true.
- `css/tokens.css:1078` sets `--layout-active: var(--bp-tablet)` at ≥ 700 px: his phone is still "tablet" in the one
  consumer `css/responsive.css:371`. The contract's "gap 20" removed `html[data-layout]` and left this twin.
- `css/menus.css:748` `(max-width: 860px)` moves the title car for him and not for an 874 px (16 Pro) or 932 px
  phone; `css/menus.css:137` `(max-width: 899px) and (min-height: 370px)` applies in the Home Screen app (393) and
  stops in a Safari tab (283). Both are title-screen rules (#5199's lane): reported there, not edited here.
- textSize large moves no media bucket (it only restates `--fs-*` and `--hud-text-boost: 1.10`, measured inline).

### F7 — Closed `<details>` content still reports a rect (harness trap, confirmed)
On SETTINGS › DISPLAY, 28 controls inside closed disclosure groups returned non-zero `getBoundingClientRect()` inside
the viewport while `elementFromPoint` at their centre returned the `summary`. A visibility filter built on
`rect.width > 0` counts them as on-screen controls. Use `checkVisibility()` or a hit-test. Not audited: which of
`tools/ui/*` filters this way.

## Per-element factor table (his profile, 852×393, emulation)

Painted = `getBoundingClientRect`; own = `offsetWidth/Height`; zoom = `currentCSSZoom` (product of ancestor zooms).

| Element | Own px | Factors | Zoom | Painted px | Painted font | Hit = paint |
|---|---|---|---|---|---|---|
| HUD POS tile `#hud-box-pos` | 89×55 | HUD SIZE 1.5525 → fit cap 0.99 on `.hud-top`; translateX −197 | 0.99 | 88.3×54.3 | 16 → 15.8 | n/a (pointer-events none) |
| HUD minimap `#minimap` | 110×110 | cap 0.99, `scale: 1` | 0.99 | 108.9×108.9 | — | n/a |
| Steer button `#btn-steer-left` | 72×72 | BUTTON 2.45 → `min(--hud-z-dock-l 1.942, max(floor 0.82, 2.45))` | 1.942 | 139.8×139.8 | 21.6 → 41.9 | yes (round) |
| Throttle `#btn-throttle` | 72×72 | BUTTON 2.45 → `min(--hud-z-dock 1.186, …)` | 1.186 | 85.4×85.4 | 16 → 19.0 | yes, 5/5 points |
| Pause chip `#pausebtn` | 44×44 | none (fixed chrome) | 1 | 44×44 | — | yes (round) |
| Camera chip `#btn-cam` | 78×44 | none | 1 | 78×44 | — | yes, 5/5 |
| Title door (first `#menu-buttons button`) | 160×48 | UI 1.09 × stored title size 0.91 | 0.9919 | 159.0×47.3 | 15.5 → 15.4 | — |
| Title brand `#menu-brand` | 329×243 | UI 1.09 × stored 1.06 | 1.1554 | 379.7×281.2 | — | — |
| Pause sheet `.sheet` | 659×204 | UI 1.09 | 1.09 | 718×222.3 | 16 → 17.4 | yes |
| RESUME `#pm-resume` | 227×71 | UI 1.09 (look btn 115 in own px) | 1.09 | 247.9×77.7 | 23 → 25.1 | yes, 5/5 |
| Settings sheet `#pmsettings-inner` | 659×327 | UI 1.09 | 1.09 | 718×356 at (67,8) | 16 → 17.4 | yes |
| Settings door `#pm-open-display` | — | UI 1.09 | 1.09 | 226×65 | — | — |
| Stepper select `#pm-hidehud-sel` | 128×48 | UI 1.09, min-height 47.7 own | 1.09 | 139.5×52 | 18 → 19.6 | (inside closed details, F7) |
| Stepper arrow `#pm-*-prev` | — | UI 1.09 | 1.09 | 52×52 | — | — |

No element showed a double application of a scale. No slider (`input[type=range]`) was on screen on the pages
opened, so the slider row of the table is missing.

## Assumptions that turned out TRUE (measured)

- Contract cell A arithmetic: `.screen` content box 718×356 and sheet own 658.7×326.6 at UI 109 %: measured
  718×356 at (67,8), own 659×327; `--safe-l` = 59 + 8 (`--gut` 8 under landscape ≤ 560).
- Body tier on his window: `compact` / `wide` pre-paint, from `clientWidth/Height`; `--ui-scale` 1.09 with nothing
  stored; `--hud-text-boost: 1.10` from textSize large; `(pointer: coarse)` on, no hover.
- **Token-injected insets measure the same HUD as real `env()` insets.** The `hud-layout.spec.js` recipe
  (`hasTouch` only, DPR 1, `--sal/--sar/--sab` injected by a style tag after boot) and the CDP recipe (`mobile`,
  DPR 3, `setSafeAreaInsetsOverride`) gave identical fit caps (0.99 / 1.186 / 1.942) and identical rects for 14 of
  15 HUD pieces; the 15th (`#hud-strat`) differed by race state, not geometry. Only 5 places read `env()` directly
  (`css/carsetup.css:1946`, `js/ui/select-screen.js:181`, `js/race/ceremony.js:118`, `js/race/parc-ferme.js:160`,
  the bridge badge); those five are invisible to a token-injecting harness.
- DPR changes no layout: the two recipes above differ in DPR 1 vs 3 and agree.
- Nothing in the race HUD entered the safe-area insets at HUD 70/100/155/200 × BUTTON 100/245/300 (scan of every
  text-bearing or interactive node under `#hud`).
- In Chromium, `100vh = svh = dvh = lvh` and `inner = client = visualViewport` in this window. On iOS these differ
  in a Safari tab; unverified.

## Not covered (said plainly)

The keyboard inset `--kb` (`js/ui/sheet-shape.js:585-720`), rotation, app resume and the stale-portrait launch were
read but not exercised: Chromium has no software keyboard that shrinks only the visual viewport, and the resume and
launch behaviours are standalone-WebKit only. Garage, select screen, results and the ARRANGE HUD editor were not
traced (the last is #5198's). `apex_ui_fit` / `apex_ui_inspect` / the survey matrix were not run; only the
`hud-layout.spec.js` recipe and the F7 trap were tested against the truth recipe.

## What to run on the phone

One bridge session (skill `phone-bridge`), in the Home Screen app and again in a Safari tab, landscape:
` ```apex-cmd {"cmd":"batch","args":{"steps":[{"cmd":"geom"},{"cmd":"display"}]}} ``` ` in a race, and again with
the pause sheet open. `geom.insets`, `geom.units`, `geom.inner` vs `geom.client` settle F3/F4; `geom.zoom` settles
F5; `geom.wish` vs `geom.paint` is F1/F2 on the device.
