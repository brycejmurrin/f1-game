# UI scaling contract — every screen on a phone-landscape window (2026-11-06)

Kind: design · Re-measure-by: 2027-02-01

Issue #5153 (Bryce, 2026-11-06: "reconsider this whole menu and UI again, to fix from scratch; re-read the code").
Tree read: `94fb81c2` (= `d921fd52`, the Nov 2 rollback). History: [UI-HISTORY-2026-11-06.md](UI-HISTORY-2026-11-06.md).
Method: a static read of the whole UI layer (css/, index.html, js/ui/) by one steward and eight read-only helpers; no
browser was run, so every pixel figure below is arithmetic from the cited CSS and is marked **est.** where it depends
on an intrinsic width only a live measurement gives. The title screen itself is PR #5152's lane; §4.1 describes it and
proposes no edit to `css/title.css`.

## 1. Inputs — what decides a layout today

| Input | Where it enters | Notes |
|---|---|---|
| Layout viewport (CSS px) | every `@media (min/max-width/height)`, `vw/vh/svh` | the ICB; media queries never see zoom |
| JS viewport `innerWidth/innerHeight` | pre-paint boot index.html:579-598; `SheetShape.classifyBody` js/ui/sheet-shape.js:402-409; 30 more readers (§6) | on iOS this is the VISUAL viewport, and on a Home Screen landscape launch it can still hold the portrait numbers (#5152, reproduced in Chromium) |
| Safe-area insets | `--sal/--sar/--sat/--sab = env()` css/tokens.css:241-244; `--safe-*` = inset + `--gut` :272-276 | `--gut` is 8 under `(orientation: landscape) and (max-height: 560px)` tokens.css:1064-1069, so a 59 inset pads 67 |
| Standalone vs Safari tab | **no CSS rule anywhere** (`display-mode` appears only in js/ui/platform-session.js:95) | the two differ only through height (393 vs 283), insets, and the stale-launch bug above |
| Device pixel ratio | renderers only | no layout rule reads DPR |
| UI SIZE `--ui-scale` | `zoom: var(--sheet-scale, var(--ui-scale))` on every `.sheet` css/components.css:183, `#overlay > *` css/title.css:25, `.dh-card` css/data.css:68; `--vwz/--vhz/--svhz` = 1v* ÷ scale tokens.css:752-756 | CSS default 1.09 on `pointer: coarse` tokens.css:742-749; a stored value lands inline AFTER first paint (js/ui/scale.js:122-132). Bryce has none stored |
| Body density / shape / width | `body { --compact-at: 600px; --wide-at: 620px }` css/menus.css:291 (blocking sheet); stamped pre-paint from `innerHeight / --ui-scale`; `--tall-at` 1.05 tokens.css:183 | **a landscape phone is compact at every UI SIZE ≥ 66 %** (393 < 600). The issue brief's "normal at 100 %" is wrong; the 380 is only the per-sheet default (tokens.css:174) |
| Per-sheet density / shape / pair / fit | `SheetShape` writes `data-density` (room ÷ zoom vs the sheet's `--compact-at`, +40 hysteresis), `data-shape` (h/w ≥ 1.05), `data-pair` (`--pair-at`, `--pair-compact`), `--sheet-scale` (`--fit-at`, ±0.03 band, floor 1.0), `data-page` (`--page-at`, room ÷ zoom, +12 band; race settings only) sheet-shape.js:75-91, :154-251 | most sheets declare `--compact-at: 480` |
| TEXT SIZE | `html[data-text-size]` re-states `--fs-*` (large 16…23) and `--hud-text-boost` 1.10 tokens.css:854-861 | **large is the shipped default** since #1023 (js/data/settings-defaults.js:81-83) |
| HIGH CONTRAST | `html[data-ui-contrast=high]` tokens.css:886-900 | colours and plate alpha only; pins `--hud-panel-a-eff` to 1, so Bryce's PANEL OPACITY 65 is inert |
| HUD SIZE / BUTTON SIZE | `--hud-scale`, `--hud-btn-scale` (coarse default `--hud-btn-mult` 1.25 tokens.css:746-748; a stored value REPLACES it, js/ui/scale.js:131); fit caps `--hud-z-top/-bot/-dock/-dock-l` js/ui/hud.js:1335-1523 | BUTTON 245 % is absolute, not ×1.25 |
| Per-screen looks | `html[data-look-<screen>-<k>]` js/ui/screen-looks.js:50-170; `density: roomy` → `--compact-at: 1px` css/overlays.css:1162-1166 | Bryce: career density **roomy**, lookPause btn 115 / w 130, select w 115 / tile 160, garage btn 125 / pw 135 |
| Stored layouts | title `apex26.titleLayout {v:2, wide, tall}` (pre-paint index.html:611-630; js/ui/title-layout.js); pause `data-pause-layout/side/dim` (pre-paint :570-576); HUD `apex26.hudLayout {v:4}` js/ui/hud-layout.js:43; dock `apex26.dockLayout` js/ui/dock-layout.js:10-31; `apex26.layoutPreset` | Bryce: title wide `btns {x -2, y -2, size 91, width 20}`; pause grid (default); hudLayout null |
| `html[data-layout]` width tier | js/ui/scale.js:15-39 from `visualViewport.width` | 852 and 844 are stamped **"tablet"**; no CSS consumer (grep css/ is empty): dead, and a trap |

Three coordinate systems disagree, and that is the structural source of "squished" and "zoom remapped":
(a) `@media` and `vw/vh` read the raw layout viewport; (b) body and sheet flags read `inner*` ÷ `--ui-scale`; (c)
`@container` and `--vwz` read the zoomed boxes under `zoom`. UI SIZE and TEXT SIZE move (b) and (c) and never (a).

## 2. The windows this contract is computed for

Bryce's profile is tests/data/settings-defaults-export.json (iPhone, build 14012; `uiScale` null → 109 %, `hudScale`
155.25, `hudBtnScale` 245, `textSize` large, `uiContrast` high). The `.screen` content box is the viewport minus
`--safe-*` (inset + 8). A sheet never gets more than that box, divided by its zoom, in its own px.

| Window | Viewport, insets L/B/R | `.screen` box | sheet own px @1.09 | body own (`inner*/1.09`) | body density / shape |
|---|---|---|---|---|---|
| **A** Home Screen app | 852×393, 59/21/59 | 718×356 | 658.7×326.6 | 781.7×360.6 | compact / wide |
| **A100** same at UI SIZE 100 % | 852×393 | 718×356 | 718×356 | 852×393 | **compact** / wide |
| **C** Safari tab | 852×283, 59/0/59 (toolbar) | 718×267 | 658.7×245.0 | 781.7×259.6 | compact / wide |
| **D** spec phone | 844×390, 47/21/47 | 734×353 | 673.4×323.9 | 774.3×357.8 | compact / wide |
| **D′** spec phone, Playwright (no insets) | 844×390 | 828×374 | 759.6×343.1 | 774.3×357.8 | compact / wide |
| **Aₛ** A at launch with the stale portrait `inner*` (393×852) | CSS lays out 852×393 | 718×356 | — | 360.6×781.7 | **normal / tall** (wrong) |

What flips to "normal" at 852×393: body at UI SIZE ≤ 65 %; a 480 sheet at ≤ 74 %; a 380 sheet at ≤ 93 %. The
`(max-height: 400px)` and `(max-height: 500px)` media bands (menu-destinations.css:45,50,152; dialogs.css:252-311;
overlays.css:1087; photo-studio.css:124-134; watch-transport.css:73-97; touch-controls.css:589) fire in A, C and D but
not on a 932×430 Pro Max; in C every fixed-height band fires. `(max-height: 380px)` (touch-controls.css:589) fires
in C only, so the Safari toolbar changes the HUD button tier.

## 3. The contract

1. **One input.** Every tier decision (compact, tall, wide, pair, button tier) derives from the layout viewport minus
   the safe area, in CSS px: `documentElement.clientWidth/Height` and `env()`. Never `innerWidth/innerHeight` (stale
   on a Home Screen landscape launch; the visual viewport under pinch and keyboard) and never raw `visualViewport`
   for a tier. #5152 lands this for the pre-paint boot and `SheetShape.classifyBody`; §6 lists the other readers.
2. **Zoom scales type and taps inside a fitted box; it never decides the box.** Card geometry comes from the safe box
   and `@container` queries in own px. `data-shape` (aspect) may pick columns only when the sheet is also wide in own
   px; aspect alone never produces two columns on a phone.
3. **Fit, never scroll — except lists that are lists.** Head and foot are fixed rows; one body scroller per sheet; the
   primary action is never scrolled away. A circuit list, a results classification, a parts list, a settings page
   may scroll. A title cluster, a pause card, a hero, a dock may not. A stored layout value is a request clamped by
   the box (#5152's `fit()` for the title is the model).
4. **No tablet or desktop branch is reachable from a phone-sized window.** Every rule in §5 marked *goes* is gated
   on a fine pointer, or on a short side ≥ 600 CSS px, or deleted.
5. **Standalone equals Safari** except for height and insets. No `display-mode` rule. A window of 283 CSS px gets the
   same geometry as 393, shorter; a toolbar show/hide moves no tier (contract 4) and re-zooms no sheet by more than
   a hysteresis band.
6. **Thresholds sit away from the phone band.** The phone band is 640–760 own px wide (A: 656.7, D: 757.6). No
   `@container` threshold lies within 40 own px of it. Today 640/660 (race-setup.css:501; career.css:71,297) and
   620 (select.css:428) straddle it.
7. **The HUD owns its density and its budget.** `body[data-density]` from the MENU slider does not restyle the race
   HUD; the dock caps budget the top band and the cluster as well as the bar width; a stored MOVE & SIZE entry is
   clamped at paint time like a shipped one.
8. **Profile cells are test cells.** The UI spec matrix carries A (with insets), C and D for every screen, × textSize
   normal/large × uiScale 100/130 (× BUTTON 100/245 for the HUD), seeded from the export, with a `__apex` probe of
   the measured layout as the assertion and a screenshot as sign-off only.

## 4. Per screen — the ONE phone-landscape layout

Legend: *may scale* = follows UI SIZE / TEXT SIZE through zoom; *only nudges* = fixed geometry that moves by at most
a tap or a gap; *overflow* = what is allowed to scroll.

### 4.1 Title (#overlay) — lane #5152, described only
Mechanism: `#overlay > *` zoomed (title.css:25); compact body splits the zoom (brand `min(ui,1)`, doors `min(ui,1.25)`,
menus.css:840-856); a stored layout multiplies `zoom: ui × --tl-*-size` (responsive.css:238-244). The factory phone
block is `body:not(.desktop)[data-shape=wide][data-density=compact]` AND no `data-title-btnw|btns|side`
(menu-destinations.css:122-161) with an inner `(min-width: 700px) and (max-height: 500px)` split (:152). Bryce's
stored `width 20` sets `data-title-btnw`, skips the factory block and pins the cluster to `20 × --vwz` ≈ 170 of
852 px (responsive.css:255). The tablet branches `(min-width:700px) and (min-height:720px)` (:208) and
`(min-height:1000px) and (min-aspect-ratio:1/1)` (:282) are plain media queries, so they fire only when the layout
viewport itself is portrait — which is what window Aₛ's classification painted into a landscape box (914 own px of
`#menu-buttons` in a 96 px box, per #5152's reproduction).
**The one layout:** brand left or top, one door cluster that fits the safe box at every stored value (#5152's `fit()`),
no scroll in landscape. *Goes:* `(min-width: 700px)` as a gate on a phone rule (:152); width as a share of the
viewport without a floor. Owned by #5152: `css/title.css`, `css/menus.css`, `css/menu-destinations.css`,
`css/responsive.css`, `js/ui/title-layout.js`, the inline boot and `js/ui/sheet-shape.js`.

### 4.2 Settings sheet (#pmsettings-inner)
Inputs: `--sheet-w min(1020, --safe-w − 2·pad)` settings.css:11-12 (dialogs.css:8 also sets 760; load order decides);
`--fit-at` 300/220, `--compact-at` 480 settings.css:14-18; `@container sheet` 24rem / 40rem / 52rem / 620
settings-controls.css:280-311,675; **`[data-shape=wide] .pm-group` → 2-column grid** :318-335; appearance studio
three competing width rules appearance-studio.css:175 (≤900 → 1 col), :186 (≥641 & ≤500 tall → tablet split), :240
(shape wide → 2 col), presets `.64em` :263. JS (settings-tabs, settings-search, setting-row) has no viewport input.
In A/C/D: compact, wide, fit off (C caps above UI 121 %); 40rem and 620 fire (657 own); **every page is a 2-column
grid of ~320-own half-width plates** with large-text labels wrapping to 2–3 lines; the studio ends 2-column with
preset names at ≈11.9 painted px (under the 14 px floor, tokens.css:713).
**The one layout:** 3-up door index on home; a page is ONE reading column of label-left / control-right rows; the
Appearance preview on top, controls below, in one column. *May scale:* type, row height. *Only nudges:* head
(≤ 36 painted), foot (BACK at the 52 floor), `--pad/--gap` 13/8. *Overflow:* the page body scrolls (a list).
*Goes:* `[data-shape=wide]` as the column switch (:318); the `min-width: 641px` tablet split (:186); `.64em`.

### 4.3 Pause card (#pausemenu)
Inputs: `--sheet-w 420; --fit-at 260/180` dialogs.css:7,74; landscape ≤500 hides now-card/build :251-274; ≤400 caps the
sheet at `min(100%, 100·--svhz − 24)` :276-299; thumb-reach RESUME bar `(landscape) and (max-height:500px) and
(pointer:coarse)` only when `data-pause-layout` is set or the body is not compact+wide :310-325; **SPLIT CARD**
`:root:not([data-pause-layout]) body[compact][wide]` 3-col areas, tray 3-up, `--sheet-w min(760·--look-pause-w, 100%)`
overlays.css:1109-1129; looks dialogs.css:450-467. Bryce: grid (default), btn 115, w 130 → split card in A/C/D, width
100 % of the box. Height cap A 326.6, C **235.6**, D 323.9 own; content **est.** ≈ 270 own → fits A/D, **overflows
≈ 35 own in C: QUIT scrolls.** Any stored non-default layout swaps to the 420 card with the bottom RESUME bar: two
different phone cards for one phone.
**The one layout:** the split card, every door on screen in C (≥ 235 own) with no scroll: tray 6-up on one row, or the
context line folded into the RESUME slab, when the card is under 260 own. Player layouts rearrange doors inside this
geometry. *May scale:* type, door height to the floor. *Only nudges:* tray height. *Overflow:* none.

### 4.4 Dialogs — the shared `.screen > .sheet` contract
`.screen` pads with `--safe-*` and `padding-bottom: max(--safe-b, --kb)` components.css:60-88; **`dialog.screen`
re-declares the `padding` shorthand with `--safe-b` only** (components.css:103-112; dialog-platform.css:18-27), so the
iOS keyboard inset never reaches any `<dialog>` — Settings search and share-code inputs included. #5097 fixed this on
Nov 5 and the rollback removed it (#5067 is live again). `.sheet` `width: min(100%, --sheet-w 520)`, `max-height:
100%`, `overflow: hidden`, `container: sheet / inline-size` components.css:199-211. Every 760 dialog fills 658.7 own
in A; all are compact at 380; POPUPS `density: roomy` drops a dialog out of compact (overlays.css:1166).
**The one layout:** one card in the safe box, head ≤ 36 painted, one body scroller, foot never scrolled away.
*Goes:* the shorthand (restate `padding-bottom: max(var(--safe-b), var(--kb))`); `roomy` on the phone.

### 4.5 Select / circuit picker (#sel-inner), race settings, circuit detail
`--sheet-w 1020; --fit-at 260; --compact-at 480` select.css:54-62; BESIDE `@container sheet (min-width: 620px)` :428
(true in A–D, beaten only by the compact lower-third rules' specificity :460-499); looks :354-383, w/density/btn
overlays.css:1154-1215. In A–D: compact, wide, LOWER THIRD; C fit caps at 1.027. Chrome (head 30 + shelf 105 + foot 58
+ gaps) ≈ 202 own; the lower third floors hero + numbers at ≈ 170 (select.css:471) → **the hero section is a
scroller in every window (est. −16 to −112 own)**. Race settings `--compact-at 260`, own zoom, two columns at
`@container (min-width: 640px)` race-setup.css:246-260,501: normal chrome in A/D while its neighbours are compact,
and the column flip sits 17 own px from the phone. Circuit detail `--fit-at 280` caps C at **0.954 — below UI 100 %**;
`@media (orientation: landscape)` survivors track-detail.css:119-188.
**The one layout:** thin head (title, count); one pan-x flag strip; the hero still with outline and name filling the
rest, the two key numbers and CIRCUIT DETAIL as one row on it; BACK / CHANGE CAR / RACE SETUP as one row. No vertical
scroller for the hero. *May scale:* still height, tile width, type. *Only nudges:* strip and foot heights. *Overflow:*
the flag strip and filter row pan sideways. *Goes:* the uncapped BESIDE at 620 (gate on fine pointer or ≥ 900 own);
`density: roomy` on a phone; race settings' private 260; the fit cap below 1.0.

### 4.6 Garage (#cs-inner)
Width `min(100%, clamp(410, 100·vwz − 320px/ui, 420))` carsetup.css:65, look `pw` multiplies the cap :1974-1979;
`--pair-at 400; --compact-at 480; --pair-compact off` :1048-1089; `--fit-at` 340/240 :1092-1093; landscape play-shape
grid for compact-not-tall :365-377,448-510. In A–D: compact, pair off, play-shape, panel 420 (Bryce pw 135 → 488–532
own). **The 320 px car reserve is taken from the viewport, not the safe box**: with pw 135 the car keeps 186 px clear
of the notch in A. `density: roomy` re-enables the rail the file itself says starves the options at 852×393
(:1094-1096). Options pane **est.** A 195 own (3 part rows), C 114 (1.8 rows).
**The one layout:** car left, panel docked right: head and BACK/DONE share row 1, one pan-x category strip, the parts
list the only vertical scroller. *May scale:* panel width bounded by a car reserve measured from the safe box; type.
*Only nudges:* tab and foot heights. *Goes:* the viewport-based reserve; `roomy` → rail on a phone.

### 4.7 Career hub (#cr-inner)
`--sheet-w 1020; --fit-at 300/220; --compact-at 480` career.css:35-36; `--pair-at 620; --pair-compact off` :118-124;
header `@container` 640 / 660 :71-78,297-306; looks layout/side/split :186-231. Default: compact, pair off, one stacked
scroller (fits). **Bryce's `density: roomy` → `--compact-at: 1px` (overlays.css:1164) → normal density, and
`--pair-compact: off` no longer applies (sheet-shape.js:75-91) → pair ON at 658.7 ≥ 620: the desktop two-column split
with full-size chrome in every window.** career.css:233-235 already records the clip this causes at 852×393.
**The one layout:** thin head (title, team, three meters on one row); one scroller: next race → objective →
calendar; a one-row foot MAIN MENU / GARAGE / GO RACING. *May scale:* type, stills. *Only nudges:* meters, foot.
*Goes:* pair by density; `roomy` as a phone value; the 640/660 header straddle (by density only).

### 4.8 Season (#ss-inner, standings)
`--pair-at 620; --pair-compact wide; --compact-at 480` race-setup.css:28-29; pair + compact: head and foot share row 1,
pool 2-up :146-169. In A–D: compact, pair ON by design; panes **est.** A 265, C 184 own; both panes are lists.
**The one layout:** title left, BACK / APPLY right on one row; calendar list | circuit pool side by side, each its own
scroller. This is the one screen where two columns IS the phone answer, and it already is. Nothing goes.

### 4.9 Results and quali
`#results --sheet-w 760; --fit-at 300/220; --compact-at 480` dialogs.css:55,70,91-93; coarse foot to row 3
overlays.css:188-195; **PINNED PODIUM on body flags: four rows × 44 painted** overlays.css:1474-1487; quali two-column
`@container sheet (min-width: 500px)` career.css:987. In A: pane ≈ 243 own, 4 pins = 162 → ~2 scrolling rows; **in C:
pane ≈ 161 own, pins 162 → zero scrolling rows**; nothing in the fit cap counts the pins. Ceremony podium unzoomed with
a raw bottom inset only (overlays.css:1585). Inline px type in results-sheet.js:585,859,882,886 bypasses TEXT SIZE.
**The one layout:** one card as wide as the box, title row with the winner pill, ONE classification pane that keeps
"me vs the front" visible with ≥ 2 scrolling rows in the shortest window (pin count from pane height, not a constant
4), MENU / NEXT as a full-width foot. *May scale:* type inside a fixed row grammar. *Only nudges:* row height, pin
count. *Overflow:* the classification. *Goes:* the constant pin count; body flags as the key (use the sheet's).

### 4.10 Watch / replay transport
Unzoomed fixed bar in `@layer hud` watch-transport.css:2-12; `(max-height: 520px) and (min-width: 600px)` nowrap,
tower `100svh − 100px` :73-86; no `--ui-scale`, no flags. Bar **est.** 172 px closed, 225 open: 44 % of 393, **61 %
of 283 (80 % with chapters open)**; the tower cap assumes a 100 px bar.
**The one layout:** one bottom strip inside the safe area, controls + scrubber on one row, chapters as a popover,
≤ 35 % of the shortest window; the tower's cap from the bar's measured height. *May scale:* hit size. *Only nudges:*
gaps. *Goes:* the inline chapters row at short heights; the fixed 100 px tower assumption.

### 4.11 Data hub (.dh-card)
`.dh-card { zoom; --fit-at 260; width min(760, 100%) }` data.css:56-99; desktop card `body[data-width=wide]
[data-density=normal]` min=max height data.css:107,326,1337; compact chrome :211-236; **coarse "BOTTOM bar"
`.dh-tabs { order: 1 }` :1405-1412 targets tabs that js/data/hub.js:188-210 now builds inside `.sheet-head`** (two
parallel Oct 30 commits, neither an ancestor of the other): the head wraps to two rows (≈ 99 own of 327) and the tabs
stay on top. C caps at 1.03. In-game HIGH CONTRAST does not solidify the card (:1373 is `prefers-contrast`). The desktop
card is reachable on a phone at UI SIZE ≤ 65 %. Telemetry canvases size from raw `innerHeight` (js/data/telemetry-view.js:15-33).
**The one layout:** full-height card in the safe box; ONE chrome row (title, tab strip, ✕) one tap tall; one content
pane; list/detail splits only ≥ 600 own. *Goes:* the dead `order: 1` rule (decide: tabs in head, one row); the desktop
card by own-unit flags alone (gate on fine pointer or raw height ≥ 600); raw `innerHeight` in telemetry.

### 4.12 Photo studio
`#ps-panel` is a `.sheet` with `--fit-at 260`, `width: min(340px, 42·--vwz)` photo-studio.css:5; dock reservation
`--ps-dock-px: min(340px·--ui-scale, 42vw) + --safe-r` :101; the `(max-height: 430px) and (orientation: landscape)`
override `min(300px, 38vw)` :133 **drops the `--ui-scale` factor**: the panel is 300 own (327 painted) but the sticks
are placed from 300 painted → they sit 16–24 px under the panel on every touch device.
**The one layout:** scene left, a ≈ 38 % dock inside the safe area with fixed head/foot and a scrolling body; sticks
and altitude in the remaining strip, reserved from the dock's PAINTED width. *Goes:* the unscaled 300.

### 4.13 Loading, ios-install, rotate-device
`#ld-card` has no height cap and places `--ld-card-y` in `vh` loading.css:37-52; in C with a radio caption the card top
and hint can clip (**est.** 262–290 needed of 267). ios-install parks bottom-left of the safe box in Safari only
(touch-controls.css:234-281) — correct. rotate-device is portrait-only (overlays.css:104-107) — correct.
**The one layout:** a lower-third card ≤ 40 % of the window, map left / facts right, hint above, `svh` for y.

### 4.14 Race HUD and touch dock
Inputs §1. Bryce in A: taps column 236 intrinsic, `controlsRoom` 332 → `--hud-z-dock` **1.186**: pedals and
BOOST/OT/AERO paint ≈ 85 px; steer cap **est.** 1.38–1.65 → arrows 99–119 px; **the bottom cluster paints ≈ 1.0: HUD
SIZE 155 never reaches GEAR/SPEED/ENERGY in landscape**, because the steer cap budgets the cluster at `min(scale, 1)`
and "readouts adapt to controls" (hud.js:1418-1428; hud-feel.test.mjs:1142 pins only `zBot ≥ 1`). In C: the
`(max-height: 380px)` tier (64 px holds, floor 0.92) → cap 0.939 → pedals ≈ 60 px (smaller than the shipped default
paints at 393); steer **est.** 1.84 → ≈ 117 px, and its top (≈ 139) meets the compact 110 px minimap (≈ 140): the dock
caps never budget the top band (hud.js:1338, :1036-1050) and TYRES has no restack room (:1257-1259). Stored MOVE &
SIZE entries use the raw `--hud-scale !important` (hud.css:2585-2590), re-resolve as % of the new viewport (:1817)
and skip every clamp (hud-layout.js:371-372,421,761): a layout saved at 390 tall can land on a dock at 283. The
HUD's `body[data-density]` comes from the MENU slider (flips only at UI ≤ 65 %, so Bryce is compact; `hud.css:1287`
is right that body uses 600). No `__apex` probe returns HUD geometry; the survey matrix has no 852×393-with-insets
or 852×283 cell (tools/lib/hud-survey-matrix.mjs:36,58).
**The one layout:** one bottom bar inside the safe area — steer (or tilt pedals) hugging the left edge, taps + pedals
the right, both at ONE painted thumb size; the gear/speed/energy cluster centred between them at the HUD SIZE the
bar's spare width allows, never below shipped; one top band: map + gaps left, tower centre, CAM/PAUSE + sectors right;
REL/STRAT/INPUTS stacked in a side column that the dock caps budget for. *May scale:* HUD SIZE on readouts, BUTTON SIZE
on the dock, text boost on digits. *Only nudges:* FIT_AIR, dock insets. *Overflow:* none, ever.
*Goes:* the `min(scale,1)` cluster budget; width-only band caps; the `(max-height: 380px)` tier flip; unclamped stored
entries; density from the menu slider (own density from the ICB height, or none).

## 5. Switch census — rules that can give a phone-sized window a tablet, desktop, tall or two-column layout

| Rule | Fires in A / C / D? | Verdict |
|---|---|---|
| body `data-shape=tall` + `data-density=normal` from stale portrait `inner*` at Home Screen launch (index.html:579-598; sheet-shape.js:402-409) | **Aₛ: yes** — the wrong tier for every screen that reads body flags | **goes** (#5152: classify from the ICB) |
| `#pmsettings-inner[data-shape=wide] .pm-group` 2-col (settings-controls.css:318) | yes, always | goes (container width ≥ 52rem, or not compact) |
| appearance-studio `(max-height:500px) and (min-width:641px)` tablet split (:186); `[data-shape=wide]` 2-col (:240) | yes | goes (one container-width rule) |
| `@container sheet (min-width: 620px)` BESIDE (select.css:428) — masked by compact specificity only | condition true | goes (gate on fine pointer / ≥ 900 own) |
| `density: roomy` → `--compact-at: 1px` (overlays.css:1162-1166) on career / select / garage / race / popups | Bryce: career | goes as a phone value; pair decoupled from density |
| career `--pair-at 620` with pair-compact disabled by roomy (career.css:118-124; sheet-shape.js:75-91) | Bryce: yes | goes (pair by room height) |
| race settings `@container (min-width: 640px)` two columns (race-setup.css:501); career header 640/660 (career.css:71,297) | 17 own px from A | stays, moved off the phone band (≤ 560 / by density) |
| `html[data-layout="tablet"]` at 852 (scale.js:15-39) | yes; no consumer | **goes** (delete, or tier on short side + pointer) |
| HUD `(max-width: 700px), (max-height: 380px)` tier (touch-controls.css:589) | C only | goes (continuous `--tap`, let fitHud shrink) |
| data hub desktop card `body[data-width=wide][data-density=normal]` (data.css:107,326,1337) | UI ≤ 65 % | goes (gate on fine pointer or raw height ≥ 600) |
| title `(min-width:700px) and (min-height:720px)` (menu-destinations.css:208); `(min-height:1000px) and (min-aspect-ratio:1/1)` (:282) | only with a portrait layout viewport | stay (#5152 decides); harmless once the ICB classifies |
| title factory split gated `(min-width: 700px)` (menu-destinations.css:152) | 852 yes; 667 no | goes (#5152: key on compact+wide) |
| orientation media survivors: track-detail.css:119-188; dialogs.css:252,311; career-experience.css:93; tuner.css:1453,1542 | yes (viewport, zoom-blind) | stay as nudges; re-key on sheet density where they change geometry |
| HUD `body[data-density]` from the menu slider (hud.css:1289-1350) | compact for Bryce | goes (contract 7) |
| watch `(max-height: 520px) and (min-width: 600px)` nowrap (watch-transport.css:73) | yes | stays (it is the phone branch) |
| season pair ON by `--pair-compact: wide` (race-setup.css:28) | yes | stays by design |

## 6. Stale-launch audit — every `innerWidth/innerHeight/visualViewport` reader in `js/ui`

#5152 found that the Home Screen app can launch landscape with `innerWidth/innerHeight` still 393×852 and no resize
following, while CSS lays out 852×393. The two boot-time classifiers (inline boot, `classifyBody`) are #5152's. The
rest, classified by WHEN they read:

| Reader | When | Risk if `inner*` is stale at launch | Contract |
|---|---|---|---|
| js/ui/scale.js:37-39 `syncLayout` | DCL + resize | `data-layout` wrong; no consumer | delete with `data-layout` |
| js/ui/experience.js:395,404 Home resize signature | module eval, then resize | the first real resize is seen as a change (harmless) | read ICB |
| js/ui/hud.js:41 `vpSync` (`_vp.w/h`) | first race tick, re-read ~1 s after resize | a race started before any resize keeps the stale pair for `fitHud`'s bar width | read ICB |
| js/ui/hud.js:1008-1591 (12 sites), hud-layout.js:376-412,691,770, hud-arrange.js:163-544, hud-relative.js:222,322, hud-inputs.js:89 | per fit / drag / tick | same as above; dragging uses `clientX` consistently | route through one `GameHud.vp()` that reads the ICB |
| js/ui/dock-layout.js:94-96 `usablePad` (visualViewport first) | paint + vv resize | pad from the visual viewport; fine for a dock, wrong under pinch | ICB minus insets |
| js/ui/look-avail.js:186-189 | when Settings › Appearance opens | a stale read marks the wrong knobs DEAD | read ICB |
| js/ui/menu-nav.js:121,611 | wheel / D-pad | none (relative) | — |
| js/ui/select-screen.js:1540-1550 | map fit, prefers `clientWidth` | fallback only | — |
| js/ui/title-layout.js:451,511-512 | drag editor | editor-time; #5152's file | — |
| js/ui/sheet-shape.js:557-564 keyboard `--kb` | vv resize | by design (`inner* − vv.height`) | keep |
| js/data/telemetry-view.js:15-33 | popup open | raw px into a zoomed card | divide by zoom / card box |
| js/input/input.js:1185 `_viewLong = max(w, h)` | boot | orientation-free by construction | keep |

## 7. Ranked gaps — what Bryce sees first (title → settings → HUD → the rest)

Each row: file:line · mechanism · fix · test to add or re-bless. "(#5152)" rows belong to that lane and are listed
for the ranking only.

| # | file:line | Mechanism | Fix | Test |
|---|---|---|---|---|
| 1 | index.html:579-598; js/ui/sheet-shape.js:402-409 (#5152) | Home Screen landscape launch classifies body tall + normal from stale portrait `inner*`; every screen that reads body flags paints the wrong tier until a resize that never comes | classify from `documentElement.clientWidth/Height`; re-ask on `matchMedia("(orientation)")` change | spec boot cell with the stubbed viewport (#5152); then one body-flag assertion per screen in the matrix |
| 2 | js/ui/title-layout.js:99-133; css/responsive.css:255 (#5152) | stored `btns.width` 20 pins the cluster to ≈ 170 px and skips the factory phone block; the scroller is `#menu-buttons` | a stored value is a request clamped by the box (`fit()`) | PR #5152’s title-fit spec |
| 3 | css/settings-controls.css:318-335 | `[data-shape=wide]` (aspect only) → every phone settings page is a 2-column grid of half-width plates | columns by `@container sheet (min-width: 52rem)` and not compact | tests/unit/ui-fit-settings-a11y-r6.test.mjs:53 (pins the wide rule) → re-bless; matrix cell A/C/D × text large |
| 4 | css/appearance-studio.css:175,186,240,263 | three width rules fight; tablet split at 641 wins on a phone; preset names at .64em ≈ 11.9 painted px | one container-width rule; preview on top, one column; 2-up presets at `--fs-micro` | appearance-sunlight-chrome.test.mjs:45-55, ui-fit-settings-appearance-r6.test.mjs → re-bless |
| 5 | css/components.css:103-112; css/dialog-platform.css:18-27 | `dialog.screen` padding shorthand beats `.screen`'s `max(--safe-b, --kb)`: the iOS keyboard covers Settings search and share-code inputs (#5067; its fix #5097 was rolled back) | restate `padding-bottom: max(var(--safe-b), var(--kb))` in both blocks | ui-resize.spec.js:340 covers only `#carsetup` (a div) → add a `<dialog>` cell with a `--kb` override |
| 6 | js/ui/hud.js:1418-1428; tests/unit/hud-feel.test.mjs:1142 | steer cap budgets the cluster at `min(scale, 1)`; BUTTON 245 takes the bar and HUD 155 paints ≈ 100 % on GEAR/SPEED — the slider is dead in landscape | budget the cluster at `min(scale, cap)` first, split spare width between steer and cluster; label "HUD fits N %" | hud-feel.test.mjs `zBot ≥ 1` → `zBot = min(scale, cap)`; new `dockHarness` cell at 852×393 with the export |
| 7 | js/ui/hud.js:1338,1036-1050; css/touch-controls.css:589 | dock caps ignore the top band (steer ≈ 117 px meets the 110 px map at 852×283); the `(max-height: 380px)` tier flips with the Safari toolbar | vertical budget: steer top ≥ left-column bottom + FIT_AIR else cap `--hud-z-dock-l`; continuous `--tap`, no 380 tier | new cell 852×283 insets 59/0/59 export; phone-touch-surface.test.mjs:105-106 pins the `--tap` expression → re-bless |
| 8 | css/hud.css:2585-2590,1817; js/ui/hud-layout.js:371-372,421,761 | stored MOVE & SIZE entries skip every clamp and fit cap and re-resolve as % of a new viewport | apply `screenBounds` + `clearControls` at paint time (never saved); cap `--hud-z` at the band cap | hud-layout.test.mjs: a 844×390 layout opened at 852×283 stays on screen and off the docks |
| 9 | tools/lib/hud-survey-matrix.mjs:36,58; js/agent/ | no 852×393-with-insets or 852×283 survey cell; the export is a flag, not an axis; no `__apex` HUD-geometry probe | cells `phone-pro-852x393` and `phone-safari-852x283`, export by default; `__apex.hudFit()` returning the four `--hud-z-*`, dock/cluster/map rects and clash pairs | hud-survey.test.mjs matrix shape; agentHelp size ratchet |
| 10 | css/overlays.css:1109-1129; css/dialogs.css:276-299 | pause split card in Safari 283: cap 235.6 own vs ≈ 270 content (est.) → QUIT scrolls; a stored layout swaps in a different 420 card | one phone geometry: tray 6-up / ctx in RESUME when < 260 own; layouts rearrange doors only | pause-hud-layout.test.mjs:74,83; pause-opts.test.mjs → re-bless; cell C |
| 11 | css/overlays.css:1162-1166; js/ui/sheet-shape.js:75-91; css/career.css:118-124,233-235 | Bryce's career `density: roomy` → `--compact-at: 1px` → normal chrome AND pair ON → desktop split on every phone window | pair from room height (`--pair-min-h`), density never disables `--pair-compact`; mark roomy DEAD on a phone | screen-looks.test.mjs:439-470 (treats roomy as valid) → re-bless; career-hub.spec.js:606-612 cell with the export |
| 12 | css/overlays.css:1474-1487; css/dialogs.css:70 | pinned podium = constant 4 × 44 painted rows on BODY flags; at 283 the pane is all pins, 0 scrolling rows; `--fit-at 220` ignores the pins | pin count from pane height (P1 + YOU only under ~5 rows); key on the sheet's density | results-flow.spec.js (844×390, no insets) → add A and C with insets |
| 13 | css/select.css:461-499 (:471) | lower third floors hero + numbers at ≈ 170 own; chrome ≈ 202 → the hero section scrolls in every window (est.) | filters + search into the head row; numbers into the hero caption; section ≥ 170 at 245 own | ui-redesign.spec.js:106-124 → re-bless; `apex_ui_fit` row at A and C |
| 14 | js/ui/sheet-shape.js:155-193 | fit cap: no hysteresis, no floor at 1.0 (C: select 1.027, circuit detail 0.954); the toolbar re-zooms the sheet | ±0.03 band; never cap below 1.0 — scroll a list instead | ui-improve-pass.test.mjs:1563-1578 pins the formula → re-bless; ui-resize.spec.js:318-381 |
| 15 | css/data.css:1405-1412 vs js/data/hub.js:188-210 | coarse `order: 1` targets tabs that now live in the head → two-row head (≈ 99 own), tabs on top; contradictory comments | one chrome row: tabs `flex: 1 1 0; min-width: 0` scroll strip; drop the dead rule | data-hub-layout.test.mjs:16-96 → re-bless; cell A |
| 16 | css/race-setup.css:246-247,501; css/career.css:71,297 | race settings' private `--compact-at 260` + two columns at 640; career header 640/660: thresholds within 17 own px of the phone band | 480 like its siblings; two columns ≥ 560; header by density | ui-improve-pass.test.mjs:1628-1633 pins 640 / 260 → re-bless |
| 17 | css/carsetup.css:65,1974-1979 | car reserve 320 px of the VIEWPORT, not the safe box; pw 135 leaves the car 186 px clear of the notch | subtract `--safe-l + --safe-r` (own units) before the reserve | garage-panel-side.test.mjs:175 → add a formula row at 852/1.09 with 67 insets |
| 18 | css/photo-studio.css:133 | `--ps-dock-px: min(300px, 38vw)` painted vs a 300-OWN panel → sticks under the dock by 16–24 px on touch | `min(300px * var(--ui-scale), 38vw)` as :101 | photo-studio.spec.js at A: `.pc-look-wrap` right ≤ `#ps-panel` left |
| 19 | css/watch-transport.css:73-86,97-104 | bar ≈ 172 px (61 % of 283; 80 % with chapters open); tower cap assumes 100 px; UI SIZE ignored | chapters as a popover; seek on the controls row; tower cap from a measured `--wt-h` | watch-transport-layout.spec.js (932×430, 844×390, 62 %) → add C, closed-bar ≤ 35 % |
| 20 | js/ui/scale.js:15-39; css/tokens.css:288-293 | `html[data-layout="tablet"]` on 852/844 phones; no consumer | delete `data-layout` and `--bp-*` (or tier on short side + pointer) | layout-tokens.test.mjs pins the bps → re-bless |
| 21 | css/data.css:107,326,1337 | desktop hub card on own-unit body flags → fires on a phone at UI ≤ 65 % | gate on fine pointer or raw height ≥ 600 | unit for 393 px @ 0.6 |
| 22 | css/loading.css:37-52; js/ui/loading-card.js:178 | card uncapped, y in `vh`; at 283 with a caption the top clips (est.) | `max-height` from `--safe-h`, map shrinks first; `svh` | unit on computed card height at 852×283 |
| 23 | css/data.css:1373; css/overlays.css:1585; js/data/telemetry-view.js:15-33; js/ui/results-sheet.js:585,859,882,886 | HIGH CONTRAST leaves `.dh-card` translucent; ceremony podium raw bottom inset only; raw `innerHeight` into a zoomed card; inline px type | `data-ui-contrast` rule; `--safe-*` on four sides; divide by zoom; `--fs-*` classes | css-prefers-cascade.test.mjs; results-flow with insets; ui-improve-pass inline-type ban → extend |
| 24 | css/track-detail.css:119-188; css/dialogs.css:252,311; css/career-experience.css:93; css/tuner.css:1453,1542 | `@media (orientation)` / viewport max-height survivors are zoom-blind | re-key on sheet density where they change geometry | — |
| 25 | js/ui/settings-export.js:96; css/hud.css:1287 | SPEC row says BUTTON SIZE "follows hudScale" (independent since f185834d) | fix the string | settings-export unit |

## 8. Delivery — fix PRs in rank order, one per screen group

Each PR carries: the edits; the spec matrix cells for its screens (A with insets, C, D; textSize normal/large;
uiScale 100/130; BUTTON 100/245 for the HUD) seeded from the export; goldens re-blessed by name; a `__apex` probe of
the screen's measured layout. Stop at a red and report. Never re-land a rolled-back branch wholesale: #5097's
`--kb` line (gap 5) is the one cherry-pick this contract justifies, and §7 says so.

| PR | Group | Gaps | Depends on |
|---|---|---|---|
| A (this) | notes: history, contract, gaps | — | — |
| B | shared primitive + settings + dialogs: ICB readers (§6), `data-layout` removal, fit-cap hysteresis, settings columns, appearance studio, `dialog.screen --kb` | 3, 4, 5, 14, 20 | #5152 merged (it owns index.html's boot, sheet-shape.js, menus/menu-destinations/responsive/title.css) |
| C | race HUD + dock: cluster budget, vertical budget, tier, stored-entry clamp, cells, `__apex.hudFit()` | 6, 7, 8, 9, 25 | none (HUD files are free) |
| D | sheets: pause, results, career, select, race settings | 10, 11, 12, 13, 16 | B (shared primitive) |
| E | the rest: data hub, photo studio, watch, loading, garage, survivors | 15, 17, 18, 19, 21, 22, 23, 24 | B |

Shared tokens (`css/tokens.css`) are edited only after agreeing the order with the #5152 session by `send_message`
(AGENTS.md §Coordination); this note proposes no token change.
