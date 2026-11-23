# Geometry truth hunt, part 2 — keyboard, rotation, resume, small UI SIZE, and whether the fit tools measure paint (2026-11-10)

Kind: measurement · Re-measure-by: 2026-12-15

Continues `GEOMETRY-TRUTH-HUNT-2026-11-09.md` (PR #5216) where it stopped. Trees `fcb2b81` (measurements) and `df5631b` (the fix). Same rule: no comment,
doc, test name or earlier note (the first hunt's included) counts until a number is read off a running page.

## How it was measured, and what was NOT

- **Every number below is Chromium EMULATION, not a device.** Playwright MCP + CDP: `setDeviceMetricsOverride`
  852×393, DPR 3, `mobile`, touch, iPhone UA, `setSafeAreaInsetsOverride` 59 / 21 / 59 (real `env()`; the page
  reported the box 59,0 → 793,372), fresh `localStorage` (the shipped defaults already carry Bryce's export:
  HELMET, text large), `__apex.headless(true)` so the HUD tick is not starved by the software rasteriser.
- UI SIZE was set through `__apex.uiScale(51)` / `(40)` and left unset for the touch default 109 %. The stored key
  is a PERCENT (`apex26.uiScale = "51"`); seeding `"0.51"` clamps to 40 %, which cost one wrong run here.
- **No real iPhone** (BrowserStack minutes expired, no device farm). WebKit-only behaviour is marked unverified.
- The software keyboard was SYNTHESISED: `visualViewport.height` / `offsetTop` getters overridden and a `resize`
  dispatched. That exercises `SheetShape`'s arithmetic and the CSS that spends `--kb`; it does not show what iOS
  itself does to the page when a field takes focus (K2).
- Resume was synthesised too (`Page.setWebLifecycleState` frozen → active, and a stubbed `visibilitychange` +
  `pageshow{persisted}`). The stale-portrait launch (ICB itself wrong) cannot be produced in Chromium; the nearest
  honest case, a real portrait boot followed by a real rotation, was run instead (R2).
- Box artefact: `npx serve` died with `EMFILE` when the circuit select hydrated every circuit file at once. A
  "screen is 0×0" reading right after that is the server, not the page.

## Findings, ranked

### T1 — The fit tools judge tap and type size in OWN px, so the `--scale=` axis cannot see a UI that paints tiny (confirmed)
- Claim: `tools/ui/ui-scale-axis.mjs` "a layer that fits at the default can lose its primary button two notches
  up … this axis turns each tool's matrix into screen × viewport × scale"; `apex_ui_fit` takes `scale` 40–200.
- Measured, circuit select at UI SIZE 51 %: the truth probe (`getBoundingClientRect` + hit-test) finds 16 of the 18
  on-screen controls under 44 painted px (`.sel-chip` 52×24, `#sel-track-search` 343×24) and 76 of 77 text nodes
  under 11 painted px (smallest 7.1). `apex_ui_fit {screen: "select", scale: 51}` on the same tree answers
  `tapUnder24 0  tapSoft 5` and lists that chip as **102×48**: `tools/ui/tap-floor.mjs` divides the rect by
  `currentCSSZoom` on purpose ("`--tap` is declared INSIDE the zoom, so compare in CSS px"), and `fit-audit.mjs`
  compares `getComputedStyle().fontSize` (own px) with `TYPE_MIN = 10`.
- So a `@51` or `@40` cell answers "does the layout still fit", never "can it be read or hit". Nothing in the
  matrix can turn red because UI SIZE 51 % paints 7 px type. The same cell also reports `scales.hud: 0.7`: the
  axis asks for HUD 51 %, the store clamps to its 70 % floor, and the cell is still labelled `@51`.
- Fix here: none to the verdicts (changing what `clean` means would move every baseline). Proposed in #5234:
  an additive `paint` block per cell (zoom, smallest painted tap, smallest painted text, count under 11 px).

### T2 — `fit-audit.mjs`'s visibility gate passes controls inside closed `<details>` (confirmed predicate, latent; fixed here)
- The first hunt's F7 asked which `tools/ui/*` filter visibility by rect. Measured on SETTINGS › DISPLAY (880
  focusable nodes under `#pmsettings`, 566 inside closed groups, 144 with a non-zero rect):

  | predicate | counted | of which inside a closed group |
  |---|---|---|
  | `fit-audit.mjs` `vis` + `painted` | 17 | **16** |
  | `layout-audit.mjs` `visible` | 1 | 0 |
  | `explorer/inspector.mjs` `visible` | 1 | 0 |
  | `checkVisibility()` and not in a closed group | 1 | — |

  `layout-audit` and the inspector already call `checkVisibility()`; `fit-audit` tests `display`, `visibility`
  and `opacity` only, and its clip walk finds no clipping ancestor because the hiding is on the
  `::details-content` pseudo-element. Its tap, spacing and type sweeps therefore judge controls nobody can see.
- `layout-audit`'s injected `* { content-visibility: visible !important }` does NOT reopen closed groups (same
  counts with and without it): `*` does not match the pseudo-element. That worry is refuted.
- **Latent, not a wrong report today.** DISPLAY is not one of `fit-audit`'s layers. On the layers it does open
  (`--only=settings,settingsappearance,advanced --sizes=852x393`, which also matches the race-settings and
  accessibility layers) the tool printed the same `tap: 13` before and after the fix. The gap bites the day a
  layer with a closed group is added to its list, which is how `layout-audit` met it.
- Fix: `vis` asks the shared `__apexTap.rendered()` (`tools/ui/tap-floor.mjs` `isRendered`, `checkVisibility()`
  with the old answer where the method is missing) first. Test: `tests/unit/ui-reset-tap-floor.test.mjs`.

### K1 — At UI SIZE 51 % / 40 % the menus are structurally fine and physically tiny (confirmed)
Truth probe per screen; "small" = min side under 44 painted px, among controls that are rendered, on screen and
hit-test to themselves.

| screen | UI | sheet (painted) | on-screen controls | small | smallest side | text nodes under 11 px | smallest text |
|---|---|---|---|---|---|---|---|
| select | 109 | 718×356 | 18 | 0 | 52 | 0 / 15 | 15.3 |
| select | 51 | 520×356 | 18 | 16 | 24 | 76 / 77 | 7.1 |
| select | 40 | 408×356 | 16 | 15 | 24 | 78 / 78 | 5.6 |
| garage | 109 | 447×356 | 16 | 0 | 48 | 0 / 34 | 15.3 |
| garage | 51 | 214×356 | 13 | 2 | 30 | 34 / 40 | 7.1 |
| garage | 40 | 168×356 | 14 | 2 | 24 | 37 / 42 | 5.6 |
| results | 109 | 718×356 | 3 | 0 | 57 | 0 / 21 | 15.3 |
| results | 51 | 388×356 | 3 | 3 | 27 | 35 / 41 | 8.2 |
| results | 40 | 304×356 | 3 | 3 | 24 | 48 / 49 | 6.4 |

- TRUE at all nine cells: nothing rendered sits outside the viewport without a scroller, nothing is covered at its
  centre, nothing interactive enters the 59 / 21 / 59 insets.
- There is a painted tap floor of 24 px (chips are 24 tall at both 51 % and 40 %) and no floor on type. If Bryce's
  phone really stores UI SIZE ≈ 51 (first hunt F3, still not device-verified), every menu he sees is 7–8 px type.
  The slider's own row, at 51 %, is one of those 24 px controls.

### K2 — The "16px floor against iOS focus-zoom" is written in own px; under UI SIZE < 100 % the field paints smaller (confirmed size; the zoom itself unverified)
- Claim, eight places (`css/race-setup.css:611`, `css/overlays.css:491`, `css/appearance-studio.css:38`,
  `css/carsetup.css:997`, `css/editor.css:146`, `css/garage-experience.css:84`, and the `menus.css` / `tuner.css`
  rules they cite): "iOS Safari auto-zooms the page when a focused input's font-size is under 16px, and the zoom
  sticks", answered with `font-size: 16px`.
- Measured, TEAM editor `#cz-name` focused: computed 16 px × `currentCSSZoom`: **17.4 px at 109 %, 8.2 px at 51 %,
  6.4 px at 40 %**; the field itself is 66×24 at 51 %. The viewport meta is
  `width=device-width, initial-scale=1, viewport-fit=cover` (no `maximum-scale`).
- Unverified on a device: whether WebKit's focus-zoom looks at the zoomed size. If it does, the chain continues in
  `js/ui/sheet-shape.js:627`: `vv.scale > 1.01` sets `--kb` to 0, so a focus-zoomed page also loses its keyboard
  padding. One reading on the phone settles it (focus the team name at UI SIZE 51 %, then bridge `geom`).

### K3 — `--kb` does what it says for a 210 px keyboard at 109 / 51 / 40 % (TRUE), with one bistable sheet at 40 %
- Synthetic keyboard 210 px on the TEAM editor: `--kb: 210px`, `.screen` padding-bottom 29 → 210, the sheet's
  bottom edge lands exactly on the visible band (0 px over) at all three sizes, the focused field stays inside the
  band and hit-tests to itself, and at 109 % the fit drops the sheet's zoom 1.09 → 1 (`--sheet-scale: 1`). On
  keyboard close `--kb` is removed and 109 % and 51 % return to the identical rects.
- At **40 %** the sheet does not come back: before the keyboard `data-shape="tall"`, 304×335, name field 175 px
  wide; after it `data-shape="wide"`, 304×239, name field 52 px wide; a `resize` and the 1.5 s settle leave it
  there. Both states are stable, so the shape classifier has hysteresis at that size: the layout depends on
  history. Cosmetic at a size few will use; `js/ui/sheet-shape.js` is #5208's plumbing, so reported, not edited.
- Not exercised: the 459 px stale latch (needs an ICB that disagrees with `visualViewport`; `viewportPx()` reads
  the ICB, which Chromium cannot hold stale), a pan (`offsetTop` > 0) and pinch.

### R1 — Rotation round trip restores the same geometry (TRUE)
Title and race, landscape → portrait (393×852, insets 59 top / 34 bottom) → landscape, 2 s each: body tier
`compact/wide` → `normal/tall` → `compact/wide`; HUD caps `0.99 / 1.186 / 1.942` and every rect (minimap 109,
throttle 85, steer 140, POS 88×54, pause chip 44) identical before and after; `--kb` never written. A freeze →
rotate twice → thaw and a hidden → shown cycle changed nothing either (the race auto-pauses, as intended).

### R2 — Portrait boot, then landscape: the race HUD is uncapped until the first HUD tick after RESUME (confirmed, minor)
- Booted at 393×852, started a race (portrait publishes no fit caps: `--hud-z-*` unset), rotated to 852×393. The
  game opens the pause sheet on the rotation, and for as long as it is open the caps stay unset: minimap 171 px
  (= 110 × 1.5525, his HUD SIZE uncapped), POS 139×85, throttle and steer 176×176 (= 72 × 2.45), brake at
  y −27 and throttle to x 860 of 852. A `resize` event and a slider nudge while paused do not fit it.
- The dock is not rendered while paused (`checkVisibility` false) but the top band is, behind the sheet. After
  RESUME the caps were still unset 0.5 s later and correct (0.99 / 1.186 / 1.942) by 3.5 s; this box draws ~1
  frame/s, so on a phone that window is one 10 Hz tick. The oversize minimap behind the pause sheet is the
  visible part. `js/ui/hud.js` is in #5208's diff; reported there, not edited.

## Assumptions that turned out TRUE (measured)

- `layout-audit.mjs` and `explorer/inspector.mjs` (so `apex_ui_fit`, `apex_ui_inspect`) do not count closed
  `<details>` content; only `fit-audit.mjs`'s predicate would have (T2).
- `apex_ui_fit`'s cell is the right window: 852×393, insets 59 / 21 / 59 by token, `pointer: coarse`, UI 51 % when
  asked. Its DPR is 2, which changes no layout (first hunt).
- Select, garage and results keep every control on screen, uncovered and out of the insets at 109, 51 and 40 %.
- `--kb` tracks a keyboard, pads `.screen`, refits `--fit-at` sheets and clears on close at 109 and 51 %.
- Rotation and background/resume do not latch body tier, `--kb` or HUD caps when the boot was landscape.

## One more definition of the Safari-tab cell

The first hunt's F4 found two (contract 852×283 with 59/0/59; `tests/helpers/title-fit.mjs` 67/21/67).
`tools/ui/menu-screens.mjs` has a third: `ios-iphone-landscape-safari` = **852×344**, insets 59/21/59, described as
"the shortest real viewport". None cites a device reading. Added to #5218. Issues from this note: #5234 (T1), #5235 (K1), #5236 (K2), #5237 (R2, K3).

## Not covered

Pause sheet, title, ARRANGE HUD and the garage overlay buttons (other lanes' open PRs); `apex_ui_inspect`'s own
output (only its visibility predicate was tested); the survey matrix job; any WebKit behaviour.
