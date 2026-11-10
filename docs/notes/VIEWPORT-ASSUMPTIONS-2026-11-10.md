# Viewport, safe-area and scale assumptions on the iPhone Home Screen app (2026-11-10)

Kind: measurement · Re-measure-by: 2027-02-01 · Issue #5201 · Follows [UI-CONTRACT-2026-11-06.md](UI-CONTRACT-2026-11-06.md)

Bryce plays the Home Screen app in landscape: 852×393 CSS px, insets 59 / 21 / 59 (left / bottom / right), DPR 3,
THREE PATH: WEBGPU, HUD 155 %, BUTTON 245 %, TEXT large, contrast high (`tests/data/settings-defaults-export.json`).
Tree read: deploy tip `e808230`. Method: two read-only code sweeps (CSS, JS), then
`node tools/ui/profile-survey.mjs A,C,D,As` on the base tree and on this branch: every `menu-screens.mjs` screen (61) at
windows A (852×393, 59/21/59, standalone), C (852×283, 59/0/59), D (844×390, 47/21/47) and As (A with `inner*` stubbed
to the stale portrait 393×852), the export seeded through `SettingsExport.applySettings`, insets injected as `--sa*`
before first layout. 244 cells per run, 0 errors. Raw rows: `artifacts/profile-survey-{before,after}/` (regenerable).
Chromium only: nothing here is a device measurement, and the phone check is Bryce's.

## 1. Ranked findings

| # | Finding | Where | Evidence | Status |
|---|---|---|---|---|
| 1 | The race HUD budgets itself from `innerWidth/innerHeight`. On a Home Screen landscape launch that still reports portrait (393×852, no resize follows; #5152) the dock is not height-capped and half the viewport is taken as 196 px | `js/ui/hud.js` `vpSync` and 25 direct reads | Survey As, base tree: BUTTONS dock 158 px a button (85 in A), BOOST at y −155, off screen. Branch: As equals A | **fixed here** |
| 2 | The safe box adds the gutter to the hardware inset: 67 px a side and 29 px at the bottom, 718×356 of 852×393 | `css/tokens.css` `--safe-t/r/b/l` | Every sheet in A measured 718×356; on the branch 734×364 (D 750×361, C 734×267) | **fixed here** |
| 3 | The helmet visor and rain canvases take their backing store from `inner*` | `js/fx/visor-optics.js`, `js/fx/droplets.js` | Code: a 393×852 store stretched over the 852×393 layer on the stale launch; Bryce plays HELMET | **fixed here** |
| 4 | Blocky 3D is a stored setting, not a viewport bug: the export holds `resMode: "low"`, so #5193's new default never reaches him. 852×393 × min(DPR, 1.5) × 0.5 = 639×295 buffer under a 3× DOM HUD; HIGH tops out at 1278×590 because the phone DPR cap is 1.5 | export line 157; `js/ui/scale.js` RES_MODES; `js/render/three/tlx.js` DPR_CAP | Code arithmetic; camera aspect matches the CSS box within 0.15 %, so nothing is stretched | #5198 (comment) |
| 5 | Every sheet spends a fixed ~95 painted px on head + foot, whatever the window. The list pane is 261 px in A and 172 px in C; the foot is often one BACK button | `css/components.css` `.sheet-head`, `.sheet-foot` | Survey median over 45 sheets per window | #5215 |
| 6 | Tuner panels in the Safari window: the rows pane is 48 px tall, the panel is clipped by 12–37 px and FLY-mode `#lt-close` is off screen | `css/tuner.css` | Survey C: `lightingtuner`, `cameratuner`, `flybyeditor`, `lightingtunerfly` | #5215 |
| 7 | Sheet titles and foot buttons take their type from a raw `vh` clamp that sits on its floor on every phone and ignores TEXT SIZE: titles are 15–16 painted px under 17 px body text | `css/components.css:269,331,339` | Code arithmetic; visible in every A capture | #5215 |
| 8 | `#save-warning` was capped by `100vw` and centred: 17 px of each end under the notch at 852 | `css/overlays.css` | Code arithmetic | **fixed here** |
| 9 | `--safe-h` subtracted painted insets from own px; the data hub repeated the inset arithmetic by hand | `css/tokens.css`, `css/data.css` | Short by insets × (1 − 1/scale): 3 px at 109 %, 8.5 px at 130 % | **fixed here** |
| 10 | The mirror's right edge, the REL card's slide limit and PageUp/Down pane pick read `inner*` | `mirror-pass.js`, `hud-relative.js`, `menu-nav.js` | Code | **fixed here** |
| 11 | The HUD button tier flips on `(max-height: 380px)`, so the Safari toolbar changes the tier; HUD density comes from the MENU slider | `css/touch-controls.css:589`, `css/hud.css:1289` | Contract gaps 7 and §5, still true | #5198 (comment) |
| 12 | Drag editors divide by `inner*` while CSS applies `vw/vh`: 2.17× / 0.46× drag error on the stale launch | `js/ui/hud-arrange.js:259,333,544`, `js/ui/hud-layout.js:376-383`; `js/ui/title-layout.js:537,597` | Code | #5198, #5199 (comments) |
| 13 | Pause doors use `--tap-paint-at` (painted 52) as an own length: 65 painted px a door at Bryce's btn 115 | `css/overlays.css:1119-1121` | Code arithmetic; the card itself fits A, C and D (210 px, no scroll) | #5200 (comment) |
| 14 | TEXT large × HUD 155 multiply in CSS (`40px × 1.10 × 1.5525` = 68 px speed) and BUTTON 245 is bounded only by `fitHud` in JS | `css/hud.css:302`, `css/touch-controls.css:383-516` | Code; the Settings HUD sample zooms twice (1.09 × 1.5525) | #5198 (comment) |

What the survey did **not** find, in A, C and D with the export: no control outside the safe box on any menu, no
document scroll, no sheet outside its host, no page error. Before and after counts are identical (clipped 13 / 18 / 14,
off-screen 0 / 1 / 0), so the safe-box change moved no control under hardware. The tap-floor rows (about 800 per
window) are the standing 52 px comfort floor against 48 px chips and are unchanged.

## 2. What this PR changes

- `--safe-t/r/b/l: max(inset, gutter)`. An edge with no inset keeps the gutter, so desktop and the top edge in
  landscape are unchanged. `--safe-h` is `(100svh − safe-t − safe-b) / --ui-scale`. `--dh-safe-h` and the desktop hub
  card read the same tokens. `#save-warning` caps to `--safe-w`. Test: `tests/unit/safe-box-tokens.test.mjs`.
- `hud.js` `vpSync` reads `documentElement.clientWidth/Height` (inner* only when there is no layout, which keeps the VM
  harnesses as they were); every other read in the file goes through `vpW()/vpH()`; `GameHud.vp()` serves the mirror
  and the REL card. Visor, rain and menu paging read the ICB. Test: `tests/unit/viewport-icb-readers.test.mjs`.
- `tools/ui/profile-survey.mjs`, the survey above.

## 3. Assumption table — JS readers

Verdict: ok / STALE (wrong only while `inner*` is stale) / QUALITY. "→" is what this PR did.

| file:line (base tree) | reads | verdict |
|---|---|---|
| index.html:582-594; js/ui/sheet-shape.js:158-162, 461, 625 | ICB, `inner*` fallback | ok (#5152, #5167) |
| js/ui/hud.js:41 `vpSync`; :599-600, 639, 655, 762-764, 1008, 1048, 1082-1085, 1154, 1347, 1393-1394, 1413, 1423, 1436, 1478, 1563, 1596-1597 | `inner*`, cached and latched | STALE → ICB |
| js/fx/visor-optics.js:419; js/fx/droplets.js:122 | `inner*` → canvas store | STALE → ICB |
| js/render/shared/mirror-pass.js:363; js/ui/hud-relative.js:322; js/ui/menu-nav.js:121, 611 | `inner*` | STALE → ICB |
| js/ui/hud-layout.js:376-383, 402, 412, 480-488, 690, 770, 914; js/ui/hud-arrange.js:163, 259-260, 333, 544 | `inner*` ∩ `visualViewport` | STALE, owner #5198 |
| js/ui/title-layout.js:537, 597-598 | `inner*` as the vw/vh divisor | STALE, owner #5199 |
| js/perf/metrics-overlay.js:76, 156; js/ui/hud-inputs.js:89 | `inner*` (dev overlay; redraw key) | STALE, benign |
| js/render/shared/canvas-css-size.js:35-48 | canvas `clientWidth/Height`; `inner*` only as a change detector | ok |
| js/render/three/tlx.js:1261, 4626-4662 | CSS box × min(DPR, 1.5 on a phone) × renderScale | QUALITY, finding 4 |
| js/ui/scale.js:263-287 | RES_MODES low 0.5 / med 0.75 / high 1.0, stored value wins | QUALITY, owner #5198 |
| js/ui/dock-layout.js:91-100; js/ui/look-avail.js:199; js/ui/experience.js:399; js/data/telemetry-view.js:22-28 | ICB | ok |
| js/input/input.js:1185 | `max(innerWidth, innerHeight)` | ok (orientation-free) |
| js/ui/platform-session.js:95 | `navigator.standalone`, `(display-mode: standalone)` | ok (install nudge only; no CSS reads display-mode) |
| js/game.js:4270; js/ui/watch-transport.js:14; js/ui/editor-workspace.js:97 | orientation / height media queries | ok (true in A, C, D as intended) |

There is still no exported viewport helper: `viewportPx()` is private to `sheet-shape.js` and hand-copied in six files.
`GameHud.vp()` is the HUD's; a shared `Viewport.px()` is a follow-up, not a bug.

## 4. Assumption table — CSS

| file:line | reads | wrong at A? |
|---|---|---|
| css/tokens.css:241-244 | `--sa*` = `env()`, the one source (one raw `env()` left: carsetup.css:1946) | no |
| css/tokens.css:273-276 | `--safe-*` = inset + gutter | yes → `max()` |
| css/tokens.css:285-286 | `--safe-w` painted px; `--safe-h` mixed own and painted | `--safe-h` yes → fixed |
| css/tokens.css:288-294, 1078-1082 | `--bp-*`, `--layout-active` ("tablet" at 852) | dead on a phone |
| css/tokens.css:701-711 | touch `--tap` 52 OWN px, zoomed: 56.7 painted a row; `--tap-paint` is the painted 52 | by design (UI SIZE scales taps) |
| css/tokens.css:753-756 | `--vwz/--vhz/--svhz` = raw viewport ÷ scale, no safe area | risky; caps win today |
| css/tokens.css:854-856 | TEXT large: `--fs-*` 16…23 own, `--hud-text-boost` 1.10 | compounds with HUD SIZE (finding 14) |
| css/tokens.css:1064-1069 | `(orientation: landscape) and (max-height: 560px)` → pad 13, gap 8, gut 8 | no (the phone tier) |
| css/components.css:60-87, 103-112; css/dialog-platform.css:18-24 | `.screen` and `dialog.screen` pad by `--safe-*`, bottom `max(--safe-b, --kb)` | no (contract gap 5 fixed) |
| css/components.css:269, 331, 339, 342 | head and foot type from `vh` clamps | yes (finding 7) |
| css/overlays.css:234 | `#save-warning` `100vw` | yes → `--safe-w` |
| css/data.css:88, 119 | hub cap, own copy of the inset arithmetic | yes, small → tokens |
| css/touch-controls.css:589 | `(max-width: 700px), (max-height: 380px)` | C only (finding 11) |
| css/hud.css:1289-1325 | HUD restyled by the MENU density | yes (finding 11) |
| css/dialogs.css:16-45 | Settings HUD sample: `--hud-scale` zoom inside the sheet zoom | yes (finding 14) |
| css/overlays.css:1119-1121; css/dialogs.css:276-298 | pause door floor; `(max-height: 400px)` cap ignores the bottom inset | finding 13; cap bites in C only |
| css/menu-destinations.css:176 | title phone split gated on `(min-width: 700px)` | 667-wide phones miss it, owner #5199 |
| css/cockpit-preview.css:7, 11 | fixed 150 px band under `(max-height: 500px)` | C only: 61 % of the box |

Contract §5 / §7 re-check on this tree: gaps 1, 3, 4, 5, 11, 12, 14, 15, 16, 17, 18, 19, 20 (JS half), 21, 22, 23
(CSS half) are fixed; 7 and the HUD density row are still true; 8 is changed in part (owner #5198); 13 was not re-read.

## 5. Not measured

- No real device. Chromium reports `env(safe-area-inset-*)` as 0, so insets are injected; the stale launch is a stub.
- The survey measures one state per screen: no keyboard (`--kb`), no rotation, no pinch, one scroll position.
- `css/tuner.css`, `css/editor.css` and most of `css/hud.css` were not read line by line.
