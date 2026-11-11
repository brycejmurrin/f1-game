# PR D (sheets) — measured truth and the fix plan (2026-11-06)

Kind: measurement · Re-measure-by: 2027-02-01 · Lane: #5153 PR D (the UI contract note, PR #5154 — `UI-CONTRACT-2026-11-06.md` once it lands: §7 gaps 10, 11, 12, 13, 16; §4.3, §4.5, §4.7, §4.9).
Tree: deploy tip `94fb81c2`. Tool: `tools/ui/probe-sheets-contract.mjs` (Chromium, `npx serve -l 3456 .`), one boot per window
seeded with `tests/data/settings-defaults-export.json` (`SettingsExport.applySettings`, reload), insets injected on `:root`
(`--sal/--sar/--sat/--sab`). Raw JSON: `artifacts/pr-d-probe-before.json` (regenerable). Figures are OWN px (painted ÷ the
sheet's `currentCSSZoom`) unless marked painted. Cells: `large/exp` = the export as stored (TEXT large, UI 109 %); then
TEXT normal/large × UI 100/130. Windows: A 852×393 insets 59/21/59; C 852×283 insets 59/0/59; D 844×390 no insets.

## What the measurement says (every est. in the contract checked)

### Select (#sel-inner) — gap 13 CONFIRMED, bigger than estimated
| cell | sheet h | fit | head · shelf · foot | hero section h / content / SCROLLS | hero · numbers |
|---|---|---|---|---|---|
| A large/exp | 327 | off | 31 · 120 · 69 | 96 / 170 / **74** | 101 · 65 |
| A normal/100 | 356 | off | 27 · 130 · 65 | 123 / 183 / **60** | 109 · 70 |
| A large/130 | 285 | off | 31 · 120 · 69 | 54 / 170 / **116** | 101 · 65 |
| C large/exp | 260 | **on 1.027** | 31 · 121 · 69 | 30 / 170 / **141** | 101 · 65 |
| C large/100 | 267 | off | 30 · 130 · 68 | 28 / 183 / **155** | 109 · 70 |
| D large/exp | 343 | off | 31 · 120 · 69 | 112 / 170 / **58** | 101 · 65 |
| D large/130 | 299 | off | 31 · 120 · 69 | 69 / 170 / **101** | 101 · 65 |
The shelf is 120 own because the export's TILE SIZE 160 makes the strip ≈ 70 (filter row 48 + strip). The contract's "section ≥ 170
at 245 own" is unreachable arithmetic: head + strip + foot alone are ≥ 126 own at any knob. The REAL target: the hero never scrolls
(numbers into the caption, filter row shares the head row) and the section ≥ the hero floor (`--chip-h × 2.1` ≈ 101) in A and D;
in C the hero gets what is left (≈ 60–90 own) unless TILE SIZE is clamped by the box (contract rule 3).

### Race settings (#race-settings > .sheet) — gap 16 CONFIRMED (and C is worse: GO under the fold)
| cell | sheet h | density (`--compact-at` 260) | columns | body h / content | GO visible |
|---|---|---|---|---|---|
| A large/exp | 274 | normal | 1 (own w 552 < 640) | 174 / 592 | yes |
| A large/100 | 356 | normal | 2 | 257 / 524 | yes |
| C large/exp | 205 | compact (sheet is the scroller, `display: block`) | 1 | 581 | **no** |
| C large/100 | 267 | compact | 2 | 513 | **no** |
| D large/exp | 288 | normal | 1 | 188 / 592 | yes |
The export's UI 109 puts A/D at 552 own wide → ONE column (the contract said two); at UI 100 (657/757) two. Threshold 640 straddles
the band at 109 % and 560 would straddle it at 130 % (A 552 / D 564). Pick **500** (the quali two-column threshold, career.css:987):
two columns on both phones at 100–130 %, one column only under 500 own. Compact (C) turns the whole sheet into one scroller and the
foot (START RACE) scrolls away — contract rule 3 broken; with `--compact-at: 480` every phone window is compact, so the compact
branch must keep head/foot fixed and scroll `#rs-body` only.

### Career hub (#cr-inner, export: density roomy) — gap 11 CONFIRMED
| cell | sheet h | density · pair | head h | left pane h / content | right h / content | foot h | clipped past the sheet |
|---|---|---|---|---|---|---|---|
| A large/exp | 285 | normal · off | 164 | 2191 (no scroller) | 1529 | 61 | 8 (next-race still +422) |
| A large/100 | 356 | normal · **on** | 118 | **115** / 2530 | 236 / 2212 | **121** (wrapped) | 8 |
| C large/exp | 220 | normal · off | 165 | 2202 | 1523 | 61 | 8 (+498) |
| D large/exp | 299 | normal · **on** | 114 | **73** / 2510 | 183 / 2237 | 111 | 8 |
| A AUTO (roomy removed) | 285 | compact · off | 117 | one body scroller 119 / 3610 | — | 47 | 8* |
Roomy → `--compact-at: 1px` → normal; pair ON at 657/757 own (D, A@100) = the desktop split with a 73–115 own left pane; pair OFF at
552 (A@109, C) leaves NO scroller at all (normal + stacked: #cr-body is not the scroller) — 2191 own of content in a 285 sheet.
*The 8 "clipped" rows in AUTO are the stacked scroller's own content below the fold (expected: one body scroller); the hub fits.
The compact head is 87–117 own (title + team + 3 meters + nav chips): the 660 broadcast line never fires (A is 657 own).

### Pause (#pausemenu, export: btn 115, w 130, GRID) — gap 10 REFUTED for the default card, CONFIRMED for stored layouts
| cell | sheet h (cap) | body h / content / SCROLLS | QUIT past sheet | tray rows × tiles | ctx h | door h |
|---|---|---|---|---|---|---|
| A large/exp | 285 (290) | 283 / 452 / **169** | −10 | 4 × 10 | 32 | 60 |
| A large/100 | 328 (369) | 326 / 521 / **195** | −8 | 4 × 10 | 33 | 60 |
| C large/exp | 202 (202) | 201 / 323 / **122** | −10 | 4 × 10 | 32 | 60 |
| D large/exp | 288 (288) | 286 / 457 / **171** | −10 | 4 × 10 | 32 | 60 |
| A L:list / compact / wide / sidebar | 285 | 187 / 436–513 / **250–327** | **+221…+317** | 5 × 10 | 35 | 55–60 |
| C L:list / compact / wide / sidebar | 202 | 104 / 436–513 / **332–409** | **+324…+420** | 5 × 10 | 35 | 55–60 |
NOTE the body `scrollHeight` (452 in A) is inflated by the RESUME slab spanning rows 2–3 (`align-items: stretch` + the tray's 1fr row
measured 154 in the first owner run): QUIT's bottom edge is INSIDE the sheet in A/C/D (−8…−10) in the default card, so the default
split card does NOT scroll QUIT in C — the contract's "QUIT scrolls ≈ 35 own in C" is refuted at the owner's knobs (the body is
`overflow-y: auto`, so the inflated scrollHeight is a scroll of empty slab, not of a door). The STORED layouts are the real gap:
every one of list/compact/wide/sidebar puts QUIT 221–420 own past the sheet in every window, with the thumb-reach RESUME bar.
Tray: 10 tiles visible in a Monza race (STRATEGY, REVIEW, PHOTO, HOW TO PLAY, REWIND & RETRY, REPLAY, RECOVER CAR, LINE, RACE
MESSAGES, REVIEW INPUTS) → 4 rows at 3-up.

### Results (#results, pinned podium) — gap 12 CONFIRMED exactly
| cell | sheet h | density (sheet) | classification pane h (own) | row painted | pinned | scrolling rows |
|---|---|---|---|---|---|---|
| A large/exp | 285 | compact | 198 | 42.3 | p1 p2 p3 you | **1.85** |
| A large/100 | 356 | compact | 269 | 44 | 4 | 2.11 |
| C large/exp | 220 | compact | 133 | 44 | 4 | **−0.33** |
| C large/100 | 267 | compact | 180 | 44 | 4 | **0.09** |
| D large/exp | 299 | compact | 212 | 42.3 | 4 | 2.27 |
In C the pins are taller than the pane: zero scrolling rows, the list cannot be read. (The `--rr-h` 44 painted holds; 42.3 at 109 % is
the zoom rounding.)
**Correction (2026-11-07, PR D gap 12):** the probe's results cells (and the pause cells after the first) ran at the LAST knob of the
previous sheet's loop — `knob(…, null)` only removed the stored UI SIZE and left the live scale at 130 %, so every "large/exp" row above
for results is really UI 130 (sheet zoom 1.25, fit-capped). At the export's true 109 % the panes are A 240 / C 158 / D 256 own px
(5.95 / 3.91 / 6.34 rows of 40.4 own). The probe now re-applies the export's own UI SIZE for `exp`. After the fix (pins from the pane:
4 at ≥ 6.25 rows, 2 at ≥ 4.25, else 1): A pins 2 → 3.95 scrolling rows, C pins 1 → 2.91, D pins 4 → 2.34; at the leftover 130 % cells
A 3.85, C 2.67, D 2.27 (`artifacts/pr-d-probe-gap12.json`).

## The fix plan (file · mechanism · fix · test) — decided from the numbers above

1. **Gap 10 pause** css/overlays.css:1109-1129, css/dialogs.css:276-325,372-449. ONE phone card for every `data-pause-layout`: drop
   the `:root:not([data-pause-layout])` gate on the split-card block (body compact+wide is the key), areas
   `"ctx restart settings" / "resume tools tools" / "quit tools tools"`, rows `auto minmax(0,1fr) auto`, tray `--tray-cols: 4`
   (3 rows of 10 tiles = 106 own; the tools track is ≥ 136 own in the shortest cell C@130 — computed: body 201 − 2×60 − 10 = 71 →
   71 + 5 + 60). The context plate sits above RESUME in column 1 (`align-content: center`). Layouts rearrange doors only:
   `wide` → `"ctx ctx ctx ctx" / "tools ×4" / "resume restart settings quit"`; `side=right` / sidebar mirror the columns;
   `list`/`compact` → doors at the chip floor in column 1 (`max(var(--tap-paint), var(--chip-h))`) so four rows fit 201 own.
   Neutralise on compact+wide: the thumb-reach bar (dialogs.css:310-325 — add a body gate to the `:root[data-pause-layout]` arm),
   sidebar `height: 100%` / `--sheet-w 320`, wide `--sheet-w 1020` (overlays layer beats components layer). Keep `overflow-y: auto`
   as the last resort. Re-bless pause-hud-layout.test.mjs:74,83 (the `--tray-cols: 2` ≤400 rule becomes the phone card's 4) and
   pause-opts.test.mjs if it pins the per-layout grid; spec cells A/C/D × text × UI on hud-layout? NO — `tests/specs/ui-resize.spec.js`
   or `pause`-owning spec; `__apex` probe: QUIT bottom ≤ sheet bottom and body scroll 0 for all five layouts.
2. **Gap 11 career** css/overlays.css:1162-1166, css/career.css:118-124,233-235, js/ui/look-avail.js:130-160. Pair never on a
   phone-sized window: `@media (pointer: fine), ((min-width: 600px) and (min-height: 600px))` gates `#cr-inner { --pair-at: 620px }`
   (else 99999px, and the `layout=split` look's `--pair-at: 1px` too — a stored value is a request clamped by the box, rule 3); the
   roomy `--compact-at: 1px` block gets the same gate (roomy is DEAD on a phone for select/race/career/garage/popups);
   `LookAvail.env()` gains `phone: Math.min(vw, vh) < 600` and `why()` returns "A short landscape window keeps the compact layout."
   for density=roomy and career layout=split on a phone. Re-bless screen-looks.test.mjs:439-470 rows (`[P, id, "density", "roomy"]`
   and `[P, "career", "layout", "split"]` now carry a reason). Cell: career-hub.spec.js — A/C/D with the export (density roomy):
   `#cr-inner` density compact, pair off, `#cr-body` the one scroller, no child past the sheet, foot ≤ 60 own.
   No sheet-shape.js change needed (PR B untouched).
3. **Gap 12 results** css/overlays.css:1474-1487, js/ui/results-sheet.js (+ dialogs.css:70 unchanged). Key the pin rules on the
   SHEET (`#results .sheet[data-density="compact"]:not([data-shape="tall"]) #results-table`), not body flags. Pin count from the
   pane: results-sheet.js observes `#results-table` (ResizeObserver, also on open) and writes `data-pins` = 4 when
   `clientHeight / 44 ≥ 6`, 2 (P1 + YOU) when ≥ 4, else 1 (YOU), hysteresis 0.25 rows; CSS unpins p2/p3 at `data-pins="2"` and
   p1 too at `"1"`, `you` top = pins−1 × `--rr-h`. results-flow.spec.js: add A and C cells with insets + the export, assertion
   scrolling rows ≥ 2 (pane − pins×44) / 44. (results-sheet.js is also PR E's gap-23 file: say so in the PR; E is not open.)
4. **Gap 13 select** css/select.css:75-145,387-499,600-725. On compact+wide: `#sel-body` and `#sel-shelf` `display: contents`, the
   sheet grid `grid-template-columns: auto minmax(0,1fr); grid-template-rows: auto auto minmax(0,1fr) auto` with head (col 1 row 1),
   `#sel-track-filter` (col 2 row 1, pan-x), `#sel-tracks` (row 2 span), `#sel-track-section` (row 3 span, `overflow: hidden`, no
   scroller), foot (row 4 span) — saves 31 own; the numbers (`#sel-preview-info`: 2 key numbers + CIRCUIT DETAIL) move INTO
   `#sel-hero-cap`'s row via `grid-template-rows: minmax(0,1fr)` on `#sel-track-preview` and absolute placement over the still's
   bottom edge (saves 65 own) → A hero ≈ 192, D ≈ 208, C ≈ 95 own at the export. TILE SIZE on compact+wide clamps to
   `min(request, 1.25)` so C keeps ≥ 90 own of hero (rule 3). Re-bless ui-redesign.spec.js:106-124 (`stripAboveHero` stays; add
   `sectionScroll === 0`); `apex_ui_fit` rows at A and C. Gate the BESIDE rule (select.css:428) on `(pointer: fine)` (contract §4.5).
5. **Gap 16 race settings + career header** css/race-setup.css:246-247,501; css/career.css:71,297. `--compact-at: 480px` (sibling
   value); compact keeps the sheet grid (head/foot fixed) and `#rs-body` scrolls — drop the `display: block` compact branch for
   compact+wide (keep it for tall); two columns `@container sheet (min-width: 500px)` (and `LookAvail.FIT.race.twoColAt` 500,
   `compactAt` 480); career header: the 660 broadcast line keys on `[data-density="compact"]:not([data-shape="tall"])` with no
   container query, the 640 `max-width` stacking rule → `(max-width: 480px)`. Re-bless ui-improve-pass.test.mjs:1628-1633
   (`--compact-at` "260px" → "480px"; the 640 two-column assertion → 500) and screen-looks.test.mjs's `[P, "race", "cols", "two"]`
   row (two columns are now AUTO on the phone at 100–130 → "already two columns"; at the export's 109 % too).

Spec cells (contract rule 8): one registered spec per screen gets A (insets) / C / D × text normal/large × UI 100/130 cells seeded
from the export with a `__apex`/DOM probe as the assertion; `tests/groups.json` is #5152's — register nothing new, extend
`ui-redesign.spec.js` (select, race settings), `career-hub.spec.js`, `results-flow.spec.js`, and the pause cells in
`ui-resize.spec.js` (check `pick-tests` for the group each lands in). After the edits re-run
`node tools/ui/probe-sheets-contract.mjs A,C,D full artifacts/pr-d-probe-after.json` and put before/after in the PR body.

## After (2026-11-07, the PR D tree at the re-bless commit — `artifacts/pr-d-probe-after.json`, regenerable)

Same probe, same windows, same export seed (`node tools/ui/probe-sheets-contract.mjs A,C,D full artifacts/pr-d-probe-after.json`
on a quiet box). `exp` = the export's own UI SIZE (109 %) re-applied per cell (the first run's results/pause cells had leaked a
130 % — see the PR body). Figures are OWN px unless marked painted.

| gap | measure | before (A / C / D, large/exp) | after (A / C / D, large/exp) | at UI 130 (A / C / D) |
|---|---|---|---|---|
| 10 pause | sheet h · body scroll · QUIT past the sheet | stored layouts: QUIT +221…+420 | 192 · 0 · −4.5 for grid, list, compact, wide, sidebar | 192 · 0 · −5.1 |
| 11 career | density · pair · `--pair-at` · head h | normal · ON at 657/757 · 620 · A 116 stacked | compact · off · 99999 · **87** with cols `181 441` (D `181 542`) | compact · off · head 105/105/84 (C capped 1.214) |
| 12 results | pane h / rows → pins → scrolling rows | 1.85 / **−0.33** / 2.27 | 240/5.95 → 2 → **3.95** · 158/3.91 → 1 → **2.91** · 256/6.34 → 4 → **2.34** | 3.85 · 2.67 · 2.27 |
| 13 select | hero h · section scroll · filter row | section scrolls 74 / 141 / 58 | hero **140.8 / 73.9 / 157.3** · scroll **0** · filter in the title row (head 48) | hero 99 / 74 / 114 · scroll 0 |
| 16 race | density · display · body h / content · cols · GO | normal/normal/compact-block · 1 col · C GO **under the fold** | compact · grid · **236/492 · 154/492 · 253/492** · 2 cols · GO on screen | 184/542 · one page (C 218 own, `data-page="on"`) · 198/542 · 2 cols |

Notes. (a) `careerAuto.clipped` lists `#cr-body`'s own content past the pane (cr-nextrace+272 …): that is the one scroller's
content, not a child past the sheet — the sheet bottom equals the foot bottom in A/C/D. (b) Race settings never shrinks the requested UI SIZE (`--fit-at: 0`, zoom straight from `--ui-scale`; ui-scale.spec.js
"Race setup adaptive task" pins `appliedZoom` = the requested scale in every cell). Measured 667×320 at UI 200 %, TEXT large
(cell 4, 2026-11-07): the compact wide grid had 152 own px of room, head 56 + foot 58 left `#rs-body` **36 own px** (71 painted) —
the spec's 32 half-box swipes could not reach half of a 1724 own scroll range. db5f8a89 tried the siblings' fit floor (`--fit-at:
220px`): the sheet painted 1.382 and CI (run 42332248373) was red on the pin; at 844×390 @ 200 the same floor would have painted
1.0. The fix keeps the pin: `--page-at: 220px` (css/race-setup.css) — `SheetShape.classifyPage` reads the host's room in the sheet's
own units (as `--compact-at`, ±12 band) and writes `data-page`; under 220 own px the sheet re-flows as ONE page like a TALL sheet
(head, settings and START RACE scroll together, `#rs-body` overflow visible), exactly the layout the spec was green on before gap 16.
In the owner's windows at 109 % the room is 250+ own px (A ~350, C ~268, D ~367), so the grid with the fixed foot stays; at UI 130
in C (218 own) the sheet is one page where career and results cap to 1.214. (c) `classifyFit` never caps under 1.0 (its floor);
the race sheet declares no cap at all.
