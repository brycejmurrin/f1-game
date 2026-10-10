# Phone-landscape HUD: from floating plates to allocated bands — plan (2026-10-10)

Owner report (iPhone Pro Max class, 932×430 CSS, cockpit cam, touch): "floating
elements in mobile horizontal". The screenshot showed the radio card mid-view
over the cars ahead, the sector plate beside BOOST, the HUD mirror frame under
the tower, the two cockpit mirror housings (live glass, 3D — the car's, not the
HUD's), and the opt-in STRATEGY readout mid-left.

What landed first (PR #1301, `cursor/hud-radio-lane-rows-9c2e`):

- `98ba35812` — `announceLane` clips the hanging radio lane only to chrome that
  shares the card's own rows (mirror / chip / flag / tower bottom + 8 px, 96 px
  tall). The steer buttons on the bottom edge no longer pin the card at their
  right edge; it drops to the left column under the map.
- `cc93b3fa0` — the band also clears the caution flag and the INPUTS trace;
  touch INPUTS stands off the dock up to the centre line (its flat 128 px cap
  was shorter than the dock at 100 %, so it painted over BOOST / OT).

Evidence: `tests/specs/hud-layout.spec.js` 39/39 on both commits;
`node tools/shot/hud-survey.mjs --cam cockpit --device phone-landscape-844x390`
with every piece on: 2 high overlaps before, 0 after (INPUTS x 437–542, BOOST
at 593). The survey still never measures the radio card (it stays hidden), and
reports 10 tinyText findings (tower / sectors / readouts at 8.05 px, gaps at
6.9 px) because `--hud-z-top` fits to 0.575 on a 390 px-tall phone.

## Why it reads as floating (the review's diagnosis)

Three independent pickers choose the radio card's slot and none knows what the
others decided: `radioTopSlot` (js/ui/hud.js, in the fit), `side()`
(js/render/shared/mirror-pass.js, on the mirror's own 500 ms measure clock) and
`announceLane` (hud.js, three times a tick). Which wins is encoded only in CSS
`:not()` chains (css/hud.css `#announce` rules). Each uses a different obstacle
list (`side()` ignores the map, flag and readouts; `radioTopSlot` ignores the
readouts). The side columns stack by fixed offsets (`--hud-sec-h + 15px` for
LIMITS, `+ 12px` for INPUTS, `+ 15px + 2.6em` for DAMAGE; RELATIVE and STRATEGY
both at `--hud-left-h + 8px`, STRATEGY sidestepping by a literal 168 px), so
toggling one piece does not move its neighbours. `--dock-r-w` is written in
four places. Latent bug: `invalidateFit` re-runs `radioTopSlot` without the
painted-clash check, so it can relight `hud-radio-top` after a collapse the fit
just made (the undo hud-metrics-layout.test forbids inside fitHud).

## Principle

One measured pass per fit allocates the TOP HALF of the screen — left column,
top strip, centre band, right column — to the visible pieces in priority order
and publishes one CSS var per piece. The bottom band and the touch docks keep
their zoom caps and anchor positioning (the fragile-in-CI part that already
works). CSS keeps today's formulas only as pre-fit fallbacks.

## Phases (each one PR, each verified the same way)

Verification for every phase: the three unit files that pin this code
(`tests/unit/hud-feel.test.mjs`, `hud-layout.test.mjs`,
`hud-metrics-layout.test.mjs`, plus `hud-control-clearance.test.mjs` and
`mirror-pass.test.mjs` where named), `npm test -- tests/specs/hud-layout.spec.js`
as ONE spec in the background, and the one-cell survey
`node tools/shot/hud-survey.mjs --cam cockpit --device phone-landscape-844x390`
before and after (zero `overlap` findings; attach the shot to the PR). Ratchets:
`js/game.js` is untouched; `hud.js` has no ratchet but the tree metric
`dynamicIdReads` counts non-literal `getElementById` calls (use `els.*` or
literal ids).

### Phase 0 — quick fixes riding PR #1301's follow-up (small, low risk)

1. `invalidateFit` (hud.js ~2207): route through the same painted-clash check
   fitHud uses, or call `announceLane` only. Pin: extend
   hud-metrics-layout.test's "no relight after collapse" to invalidateFit.
2. Survey coverage: a `--radio` flag (or `--hud announce`) for hud-survey /
   hud_shot that fills `#announce` the way hud-layout.spec does (VERSTAPPEN ·
   RADIO · 33 / CAUTION — CHEAPER STOP…) so the card is measured in every cell.
   Add `announce` to `tools/lib/hud-survey-matrix.mjs` expected-visible when the
   flag is on.
3. `docs/TESTING.md`: name the phone cells as the proof for HUD placement PRs.

### Phase 1 — obstacle list built once per fit

`fitHud` collects `{ id, rect, kind: control | readout | chrome, column }` for
every visible piece after the dock caps are written and refreshes it after any
write that moves a piece. `announceLane`, `radioTopSlot`, `mirrorClear`,
`phonePaintedClash`, `ceil()` and `HudLayout.clearControls` read from it. No
behaviour change; fewer forced reflows. Tests: indirect (hud-fit-idempotent,
hud-control-clearance) — add a unit test that the list names every visible
piece in the fit harness.

### Phase 2 — one radio-slot resolver

`placeRadio()` runs once at the end of fitHud and once after updateHud's gap
strings. It tries top strip → beside the mirror → hanging lane → collapsed →
centred, against the Phase 1 list, and publishes `data-radio-slot` on body plus
only that slot's vars (`--radio-top-*`, `--mir-side-*`, `--announce-lane-*`).
`MirrorPass.side()` stops toggling body classes and only exposes the frame rect
(keep `hud-mirror-side` / `hud-radio-top` as aliases for a release so the
widely-asserted class names survive). CSS keys off the attribute; the `:not()`
chains go. Keep `SIDE_ROWS` / `LANE_ROWS` = 96. Pins to update:
mirror-pass.test (exact `--mir-side-x/-w`), hud-feel.test (slot tests and CSS
regexes), hud-mirror.spec, hud-layout.spec's lane probes.

### Phase 3 — right column stacked by measurement

Pause / cam → sectors → LIMITS (height reserved while strikes > 0) → DAMAGE →
INPUTS, each published as `--rcol-y-<id>` in `--hud-z-top` units;
`--dock-r-w` becomes the column's single x. Fixed offsets stay as `var()`
fallbacks for the first paint. Pieces with `data-hl-user` are skipped. Add a
spec fixture with a track-limits strike showing (today LIMITS is hidden in
every fixture, so the LIMITS × INPUTS overlap is invisible to CI).

### Phase 4 — left column, same allocator

Map → gaps → metrics → LIMITS (when crossed left) → RELATIVE → STRATEGY, down
to `dockL.top` (already measured). A piece that does not fit moves to a second
sub-column or reports a `hiddenReason` instead of overlapping. Publish
`--lcol-y-*`. Risk: saved MOVE & SIZE offsets are relative to each piece's
shipped anchor (hud-layout.js), so changing anchors moves players' placements —
migrate the stored offsets or anchor the allocator at the shipped positions.

### Phase 5 — single `rightDockInset()` (last; highest risk)

Extract a pure `rightDockInset(leftEdge, z, sar)`, publish once after the zoom
caps, fit the sector width once. The comments in hud.js record repeated 1–2 px
CI misses from zoom lag here: pure extraction, behaviour-preserving, with the
`#hud-sectors+btn-boost` probes as the gate.

### Phase 6 — one measured centre-band top

fitHud publishes `--centre-band-top` (mirror frame, chip or tower, plus the
flag when showing); `#hud-flag`, `#announce` and the lane read it. The CSS
`--mir-bot` formula (which re-derives the mirror's size) stays only as the
pre-fit fallback, removing the duplicated caution `:has()` rules. Pins:
ui-improve-pass.test and hud-feel.test's `--mir-bot` regex.

### Phase 7 — column metadata in `HudLayout.ELEMENTS`

Add `column` (left / right / centre / bottom) per element; derive
transform-origins, `CLEAR_CTRL` membership and allocator membership from it
(today `CLEAR_CTRL` covers only rel / inputs / sectors, and RELATIVE's origin is
"top right" while its touch home is the left column).

## Open decisions for the owner

- **Three rear views in cockpit on a phone.** The two housings' glass is live
  while the HUD mirror pass draws; the frame top-centre is redundant there.
  Option A: HUD › MIRROR: OFF (loses the glass too — the pass feeds both).
  Option B: AUTO hides the frame in cockpit but keeps the pass running for the
  glass (mirror-pass renders with `g.mirrorRect(null)` so present() composites
  nothing; TLX / GLX / WGX all gate the composite on the rect, and
  `drawMirrorGlass` only needs the target). Needs a guard for framings where
  the glass is off-screen (`glassState().screen`), with hysteresis. Own PR.
- **8 px text at `--hud-z-top` 0.575.** Whether the top band should have a
  zoom floor on short phones (and let pieces drop instead), or the tower should
  shed BEST / DELTA first. Agent 2's section below names the file:line.
- **Sector plate home on touch.** Beside BOOST (today) vs. in the top strip
  right of the tower vs. the left column under the gaps chip. The top strip is
  where the radio card wants to be; the left column collides with the opt-in
  readouts. Decide with Phase 3/4, not before.

## Survey coverage and adaptability (second review)

Corrections to the evidence above:

- The survey DOES measure the radio card, but only in a forced "transient" pass
  that fills the text in one synchronous step: fitHud never ticks over it, so
  `radioTopSlot` and the painted-clash collapse never run, `fonts:true` is not
  set for it, and no expected-visible rule looks at it. The measured transient
  card sat at 203.8–354.6 × 101.2–127.7, 8 px clear of STRATEGY.
- The `speed` "missing" finding is a false positive: `css/track-detail.css`
  always hides `body.cockpit-cam #hud-speed`, while
  `tools/lib/hud-survey-matrix.mjs` (~:708) still expects it under 900×600.

### The 8 px text is a measuring bug, not a floor (do this FIRST)

`--hud-z-top` 0.575 on 844×390 is a FIT (`capTop`, hud.js ~:961 / :1214; the
floor in `set()` is 0.4). The binding term is `capFor`'s right half (~:915),
fed by `sarM = innerWidth - scR.right - 10*sz` (~:889): meant as the notch
inset, but on touch the sector box's right edge already includes the dock
stand-off (`body:not(.desktop) #hud-sectors { right: … + var(--dock-r-w) }`),
so `sar` reads ≈257 instead of 47 and (422−257)/(63+227.8) ≈ 0.57. The clash
it guards does not exist on touch: the plate starts at y ≈ 64 (`8px + tap-hud
+ 4px`) under a tower that ends ≈ 56 at zoom 1. Turning SECTORS off makes
`sarM` null and the whole band jumps to ≈ 1.0 — the "SECTORS toggles rescale
the tower, map, RELATIVE and STRATEGY by ~1.7×" adaptability gap is the same
bug.

Fix A (preferred): at hud.js ~:885-898 charge the right-hand term only when
`scR.top < tR.bottom + FIT_AIR`, and read the inset from `--sar` (as ~:1278
does), never from the sector box. Pins: hud-layout.spec's tower/sector overlap
checks and its MINIMAL rule (~:493-530, hiding a widget must not shrink the
band); `tests/unit/hud-fit-idempotent.test.mjs` ~:184 (no flip to 0.4).
Fallback B: a touch floor ≈ 10/14 in `set()` so `--fs-micro` 14 px stays ≥ 10
px, relying on the gap-strip drop and the sector `max-width` shrink to resolve
a real clash. (C, taking REL/STRAT off the top zoom, fixes two pieces only.)

This moves to **Phase 0** and should land before any allocator work: every
later measurement on a phone is taken at the wrong zoom until it does.

### Settings the matrices do not cover (phone landscape, cockpit / helmet)

`quick` has `phoneL-cockpit` only; `full` has one phone cockpit cell (minimal
+ compact + map off + gaps off + mirror off + protan + high contrast) and no
helmet; `exhaustive` varies one setting from a CHASE baseline; `steer` is not a
matrix dimension anywhere; HUD 130 appears nowhere; and every cell turns the
three opt-in readouts ON, so the shipped default is never measured.

Prefix: `node tools/shot/hud-survey.mjs --device phone-landscape-844x390
--cam cockpit` (or `--cam helmet`), plus `--name X --out artifacts/hud-survey/X`.

| Gap | Extra flags |
|---|---|
| Shipped default (opt-ins off) | `--off rel,strat,inputs` |
| RELATIVE alone | `--off strat,inputs` |
| STRATEGY alone | `--off rel,inputs` |
| INPUTS alone | `--off rel,strat` |
| Map off | `--map off --off rel,strat,inputs` |
| Gaps off | `--gaps off --off rel,strat,inputs` |
| HUD 70 / 130 / 150 | `--hud-scale 70` / `130` / `150` |
| Button size | `--btn-scale 70` / `150` / `300` |
| HUD 150 + button 150 | `--hud-scale 150 --btn-scale 150` |
| Steer modes | `--steer tilt` / `--steer buttons` / `--steer touch` (one boot each) |
| Worst case | `--steer buttons --hud-scale 150 --off strat,inputs` |
| Helmet | any row with `--cam helmet` |
| Radio card visible through fitHud ticks | no flag — Phase 0 item 2 |
| Mirror collapsed to its chip | no flag (a tap on `#hud-mirror`) — add `--mirror chip` |
| Caution flag up | no flag (the forced pass sets text only, not `G.cautionInfo`) — add `--flag yellow` |
| DAMAGE | never shown (hidden until damage > `SHOW=0.15`, js/race/damage.js) — add `--damage 0.5` |

### Anchors that do not move when a neighbour toggles

1. STRATEGY steps right by a literal 168 px when `#hud-rel:not([hidden])`
   (hud.css ~:1997): not RELATIVE's width (up to `min(240px, 46vw)`; at
   `--fs-micro` 18 px RELATIVE runs under STRATEGY), and a RELATIVE the player
   moved away still pushes it.
2. The TRACK LIMITS slot is always reserved: `:root[data-limits-left]
   #hud-strat, #hud-rel` add `2.6em + 8px` (~:1994) and `#hud-damage` adds
   `2.6em` (~:1868) while the chip is `[hidden]` until a strike and even with
   the LIMITS toggle off; `limLeft` (hud.js ~:1068) never checks the toggle.
3. DAMAGE stands off the full `--dock-r-w` with no centre-line cap (unlike
   INPUTS now) and shares the right column with INPUTS; estimated DAMAGE box
   ≈ 535–581 × 136–163 against INPUTS 437–542 × 141–177 — a likely overlap,
   unverified because DAMAGE is never shown in a cell.
4. INPUTS mixes two zooms: it rides `--hud-z-bot` (hud.css ~:1904) but adds
   `--hud-sec-h`, published in top-band units; with top 0.575 and bottom 1 the
   designed 12 px gap under S3 becomes 43 px (S3 ends 98.1, INPUTS starts
   141.2) — the most "floating" piece in the default cell.
5. SECTORS on/off rescales the whole top band (the Phase 0 bug above).
6. Portrait limits chip (css/track-detail.css ~:184) uses `4.8em + 15px`
   instead of `--hud-sec-h`: with MINIMAL or SECTORS off it floats ~77 px below
   an empty corner on a portrait tablet (the bug hud.css's comment says was
   fixed — landscape only).

Items 1–4 and 6 are Phase 3/4 inputs; the allocator replaces the literals.

## Quick-matrix survey, 2026-10-10 (after PR #1301's commits)

`node tools/shot/hud-survey.mjs --matrix quick` (13 cells, every HUD piece on,
monza @ 0.18): 56 findings — 21 overlap, 34 tinyText, 1 missing (the `speed`
false positive). Output `artifacts/hud-survey/quick-2026-10-10/`.

- **phoneL-cockpit: 0 overlaps** (the lane and INPUTS fixes hold); all its
  findings are the 7.9 px text from the top-band zoom fit (Phase 0) and the
  `speed` false positive.
- **LIMITS × INPUTS in 12 of 13 cells** (desktop 1280 chase / cockpit / visor
  / light / deutan / hud70 / hud150 / every preset, phone chase, portrait):
  both chips hang under the sector box at `--hud-sec-h + 12px` (INPUTS) and
  `+ 15px` (LIMITS), so the moment a track-limits strike shows they paint one
  over the other (2.7k px² at 1280×720, 5.7k at HUD 150). This is the first
  concrete item for Phase 3 and small enough to fix ahead of it: INPUTS steps
  below the limits chip while `#hud-limits` is visible (measured height, not
  `2.6em`), or the allocator publishes both tops.
- **flag × announce** on `phoneL-chase` and `chase-hud150`: the caution flag
  over the radio card in the survey's forced transient pass. The CSS caution
  step (`+ 38px`) depends on `:has(#hud-flag:not([hidden]))`, which should
  hold; the forced pass fills text without a fit tick, so treat as a survey
  blind spot until Phase 0 item 2 lets the card go through real ticks, then
  re-measure before changing CSS.
- **chase-preset-big: tower × gaps chip** (desktop 1280, MOVE & SIZE "big"):
  the enlarged tower reaches the gaps chip by 24×22 px — a preset clamp gap,
  Phase 7's column metadata (the chip belongs to the left column).
- **chase-preset-corners: sectors × INPUTS and LIMITS × INPUTS**: the
  "corners" preset moves the sector box onto the right column stack — Phase 3.
- `chase-hud70`: every readout at 9.8 px (the 70 % HUD size is the owner's
  choice; the floor question in Phase 0 B applies).

## Gap cells, 2026-10-10 (six one-cell runs the matrices never cover)

`node tools/shot/hud-survey.mjs --device phone-landscape-844x390 …`, output
`artifacts/hud-survey/gaps-2026-10-10/<cell>/`:

| cell | flags | overlaps | note |
|---|---|---|---|
| cockpit-shipped | `--cam cockpit --off rel,strat,inputs` | 0 | the shipped default (opt-ins off) is clean; 8 tinyText (zoom fit) |
| cockpit-hud130 | `--cam cockpit --hud-scale 130` | 0 | clean |
| cockpit-hud150-btn150 | `--cam cockpit --hud-scale 150 --btn-scale 150` | 1 | INPUTS [444,184 158×54] × OT by 9×54 px: the centre-line cap subtracts 120 px in zoomed units, but at HUD 150 the trace paints 158 px wide — the cap should subtract the trace's PAINTED width (its own box, or `120px * var(--hud-z)` in screen terms); Phase 3 input, or a one-line follow-up |
| cockpit-buttons | `--cam cockpit --steer buttons --off strat,inputs` | 0 | clean |
| cockpit-tilt | `--cam cockpit --steer tilt` | 5 | tower × gaps chip (59×18 px — the chip sits in the tower's row at tilt's dock zoom) and RELATIVE × STRATEGY (78×54 px — the literal 168 px sidestep is too small at this zoom; adaptability gap 1) |
| helmet-shipped | `--cam helmet --off rel,strat,inputs` | 1 | gearbox × energy (106×15 px) in the helmet touch bottom strip (HELMET_TOUCH offsets; bottom band — outside the allocator's scope, own fix) |

Takeaways: the two fixes in #1301 hold across sizes and steer modes; the
remaining phone clashes are the ones the plan already names (literal
sidesteps in the left column, the top-band zoom fit, the right-column stack)
plus two new small ones: the INPUTS cap in zoomed units and the helmet
gear/ERS strip.

## Order of work (revised)

0. Top-band zoom fix (Fix A) + `invalidateFit` relight fix + survey flags for
   the radio card, mirror chip, flag and damage + the `speed` false positive —
   one PR, measured on the phone cell before/after.
1. Obstacle list once per fit.  2. Radio-slot resolver.  3. Right column
   allocator (fixes INPUTS zoom mix, DAMAGE × INPUTS, reserved LIMITS slot).
4. Left column allocator (fixes the 168 px sidestep).  5. `rightDockInset()`.
6. Centre-band top.  7. Column metadata.

## What landed (branch `cursor/hud-band-allocator-5e2c`, on top of Phase 0)

Unit-verified only (no browser in the implementing worktree): every
`tests/unit/hud-*.test.mjs` file, `mirror-pass`, `ui-improve-pass`, `damage`,
`ui-journey-race`, the `css-*` files green after each commit; ratchets clean.
The browser gate (`npm test -- tests/specs/hud-layout.spec.js`, the phone survey
cells) is still to run.

| commit | phase | what |
|---|---|---|
| `08fa5cc1de` | 1 + 5 (extract) | `obsCollect()` — `{id, el, rect, kind, column}` for every visible piece, re-collected after each moving write; every slot / clash / inset consumer and `HudLayout.clearControls` (via `GameHud.obstacles()`) read it. `rightDockInset()` is the one `--dock-r-w` formula. |
| `60ebe652fb` | 2 | `placeRadio()`: top → side → lane → collapsed → centre against the list; `body[data-radio-slot]` + only that slot's vars (`hUnset` forgets the write cache); painted collapse latched per fit. `MirrorPass.side()` only records `frame()`. CSS keys the top / side / lane rules on the attribute. |
| `132f034e3d` | 3 | `placeRightColumn()`: LIMITS → DAMAGE → INPUTS (→ desktop RELATIVE, 38svh floor) as `--rcol-y-*` (screen px; each rule divides by its own zoom — no INPUTS zoom mix). Column pieces' `hidden` flags are in the fit key; a strike re-stacks on its tick. |
| `ac519f3159` | 4 | `placeLeftColumn()`: LIMITS (crossed) → RELATIVE → STRATEGY, main column → beside a placed piece → dropped (`data-col-drop`); `--lcol-y-*` / `--lcol-x-*`. The 168 px sidestep and the reserved limits-left 2.6em are gone. |
| `39f6d50c61` | 5 (size) | `--rcol-z` / `--lcol-z`: a column that does not fit scales its readouts to a 10 px `--fs-micro` floor before dropping; priority = stacking order, weighted so a lower piece never keeps a higher one's slot. |
| `c4215ef656` | 6 | `centreBandTop()` / `--centre-band-top` (tower, frame, chip as painted): `--mir-bot`'s floor in every state; the lane's rows start under it (+ the flag). |
| `b812d399ac` | 7 | `HudLayout.ELEMENTS[i][4]` column; origin derived; `columnOf()` live (touch RELATIVE = left); `CLEAR_CTRL` = every side-column piece. |
| `91a43606a4` | review | bottom cluster in the list; column factors skip placed pieces; a slid RELATIVE is judged where painted. |
| `c3a2951e14` | dock drag | the stand-off counts only dock groups that meet the column (x AND y); the plate narrows / drops at the centre chrome (start lights now listed, transient). New `hud-layout.spec` case "dragged touch docks". |

Not done: the four caution `:has()` steps for the card under the flag stay
(one is pinned by `ui-improve-pass.test.mjs`); they read the `hud-radio-top` /
`hud-mirror-side` aliases, which the resolver keeps in step with
`data-radio-slot`.
