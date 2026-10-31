# css/tokens.css — the rationale comments (moved 2026-10-30)

These were comments in `css/tokens.css`, moved here verbatim by design pass #2d (issue #4241) because that
file is in the blocking CSS set (`tests/unit/css-critical-path.test.mjs`) and every comment byte there is
downloaded before first paint. Each block in the CSS now reads `/* Why: …§Rn. */` at the spot it came from.
Keep new long rationale here, not in the stylesheet.

## R1. Section-label and secondary-plate ink — the role d02d19bd4 standardise

Above `--steel: var(--dim);` in `css/tokens.css`.

Section-label and secondary-plate ink — the role d02d19bd4 standardised
  here when "leftover idle ink and leftover-red headlines" moved onto one
  name. That pass picked the token; it did not measure it. #8a8a96 is APCA
  Lc 39.8 on --bg (39.3 on --surf-1, 37.7 on --surf-3), carried at
  --fs-micro/--fs-2 — the two smallest sizes — on settings labels, section
  headings and #howtoplay dt. Those are read, not scanned past.

  IT IS NOT LIGHTENED TO SOME NEW VALUE, because there is no room for one.
  --dim does this job at Lc 48.0 (#9a9aa8; lifted to #bdbdca, Lc 67.2, by #4258), and the two are the SAME INK: identical
  OKLab hue angle (-74.1deg), chroma 0.0178 vs 0.0203, differing only in
  lightness (0.637 vs 0.691). Sweeping this token's lightness with a and b
  held fixed, every value that clears a defensible floor on the worst ground
  is at or past --dim's own lightness. The "cool steel chrome" hierarchy was
  a lightness step dressed as a hue, and one end of it had fallen out of
  readability — so the step goes and the NAME stays, because the role is
  real and the call sites say which ink they mean.

  Kept as an alias rather than inlined at ~30 call sites: section chrome is
  a thing you may want to tune apart from body-secondary later, and the
  alias is where that tuning would happen. tests/unit/steel-role.test.mjs
  holds both halves. Never a red substitute.

## R2. --tap-paint: THE FLOOR A COMPACT CONTROL PAINTS AT, in actual px. A

Above `--tap-paint-at: 24px;` in `css/tokens.css`.

--tap-paint: THE FLOOR A COMPACT CONTROL PAINTS AT, in actual px. A
  compact sheet (data-density="compact") cannot afford --tap in LOCAL px —
  52 inside zoom 1.09 paints 56.7, and at UI SIZE 200% it paints 104 — so the
  compact rules sat on --tap-min instead, which paints 24 x 1.09 = 26.
  MEASURED 2026-10-05, ios-iphone-landscape 734x343: QUALIFYING's BACK /
  DRIVE MY LAP / SIMULATE 285x26, the career hub's MAIN MENU 187x26, the
  data hub ✕ 26x26 and all seven tabs 26 tall — every one a primary action
  on a touch screen, under the 52 the touch ladder promises. Dividing by the
  scale (the --slider precedent) holds the PAINTED size: on a coarse
  pointer it paints 52 at every UI SIZE (the touch ladder below) — 52, not
  --tap's 56.7, at the default, and 52, not 104, at 200%. With a mouse it
  IS --tap-min, so desktop compact layouts do not move.
  --tap-paint-at is the PAINTED target it divides (24 with a mouse, 52 on
  touch, below), published on its own so a fit-capped sheet can divide it by
  the zoom it ACTUALLY paints at: css/components.css (.sheet) and
  css/data.css (.dh-card) re-derive --tap-paint against --sheet-scale, the
  same way they re-derive --slider. Divided by the requested slider instead,
  a capped sheet painted under the floor — MEASURED 2026-10-05 (layout-audit,
  ios-iphone-landscape 734x343 @130/@150): the data hub ✕ and all seven
  tabs 47 / 41 tall, QUALIFYING's three doors and the career hub's MAIN MENU
  48 at 150 %, because the hub's --sheet-scale capped at ~1.18 and 52 / 1.3
  x 1.18 is 47.

## R3. ---- TYPE SCALE — seven steps, menus/HUD-adjacent body text only ----

Above `--fs-1: var(--fs-micro);` in `css/tokens.css`.

---- TYPE SCALE — seven steps, menus/HUD-adjacent body text only ----
  No type system existed: 294 raw `font-size: Npx` declarations across the
  eight menu stylesheets, measured by counting every one of them, sorted:
    8:3  9:10  10:58  10.5:2  11:57  12:59  12.5:1  13:37  14:18  15:12
    16:12  17:3  18:5  19:1  20:5  22:3   ...then one-off 23-68px sites.
  Below ~22px the values are a near-continuous ramp, not the clean gaps the
  radius tokens had — so each step below is anchored on whichever value is
  ALREADY most common in its band, same rule the radius tokens used, and a
  few adjacent sizes move by a single pixel onto the nearest step. That is a
  deliberate, logged consolidation each time a file migrates onto these —
  never a silent one.
  Above ~22px every remaining size (23-68px) is a ONE-OFF: a HUD digit
  readout or a hero title, not a repeated body size. Those stay off this
  scale entirely, the same exclusion css/hud.css already documents above.
    --fs-1  micro labels, badges, uppercase tags        = --fs-micro (14px)
    --fs-2  body base — the single most common size      (15px; was 13)
    --fs-3  body emphasis / secondary label               (16px; was 14)
    --fs-4  control label / subhead                       (17px; was 15)
    --fs-5  larger subhead / button text                  (18px; was 16)
    --fs-6  section heading                                (20px)
    --fs-7  large heading — the ceiling of this scale       (22px)
  2026-08-12 readability pass (MCP survey × TinyFish research): the phone-
  first rule in docs/research/UI-DESIGN-PRINCIPLES.md says the smallest rung
  must stay legible at arm's length under UI SIZE zoom. Raising micro/body
  to ≥14px CSS keeps painted type ≥12px visual at the 90% UI SIZE floor
  without redesigning every screen.
  Migrate ONE FILE PER COMMIT with a before/after font-size dump, per
  docs/notes/PARALLEL-WORK.md's B1 stage — a commit that changes rendering here
  is only acceptable when that dump says so on purpose.
  ONLY THE STEPS WITH A REAL CONSUMER ARE DECLARED BELOW.
  tests/unit/css-tokens.test.mjs fails a defined-but-unread custom property, on
  purpose ("an unread token is an invitation to use a value nobody has been
  maintaining") — so --fs-7 stays in the table above only, and gets its
  `--fs-N: …;` line added by whichever future file's migration is its
  first real consumer, not pre-declared here.
  --fs-1/--fs-3/--fs-4 joined this list with css/data.css's migration.

## R4. SESSION BEST WAS THE HARDEST OF THE THREE TO READ, which is the wrong 

Above `--sec-best: #dfa3ff;` in `css/tokens.css`.

SESSION BEST WAS THE HARDEST OF THE THREE TO READ, which is the wrong way
  round: it marks the best lap you can set, on a 14px readout, at 300 km/h.
  Measured in APCA (the contrast model that actually works on dark UI — WCAG
  2 contrast "overstates contrast for dark colors to the point that 4.5:1 can
  be functionally unreadable" and ignores font weight entirely):

    --faster    #a3e635   Lc 79.4
    --sec-slow  #f6d200   Lc 80.4
    --sec-best  #c084fc   Lc 50.4   <- 30 Lc below its own siblings

  APCA's ladder asks Lc 75 for 14px/700 body and Lc 60 for non-body, so the
  two siblings clear the bar and the purple sat under both.

  Lifted to Lc 65.1 with the HUE AND CHROMA DIRECTION UNTOUCHED — the OKLab
  a and b are byte-identical, only L moves (0.722 -> 0.795), so it is the
  same purple, lighter. It deliberately does NOT go all the way to its
  siblings' ~79: that costs 38 % of the chroma (#fbbeff) and starts reading
  PINK, and purple-means-session-best is a motorsport convention worth more
  than the last 14 Lc. At 65 it keeps 80 % of the chroma.

  CAVEAT ON THE NUMBERS: .sec-val carries the --hud-halo shadow declared just
  above, and a dark halo raises effective contrast for light ink,
  so these Lc values are a FLOOR rather than what the eye gets. All three
  colours carry the same halo, which is why the 30 Lc gap between them is the
  robust part and the absolute figures are not. tests/unit/apca-timing.test.mjs
  pins the family relationship for that reason, not an absolute threshold.

## R5. 48, not 46: --chip-h is LOCAL px inside the sheets' zoom (--ui-scale

Above `--chip-h: max(48px, min(calc(52px / var(--ui-scale)), calc(52px * var(` in `css/tokens.css`.

48, not 46: --chip-h is LOCAL px inside the sheets' zoom (--ui-scale
  1.09 on a coarse pointer), and 46 x 1.09 painted 50 — two short of the
  52 floor this ladder sets. MEASURED 2026-10-05, ios-iphone-landscape
  734x343: the circuit picker's ALL / SEASON / CLASSICS, search and detail
  chips, all 95 SEASON SETUP chips, the circuit card's favourite, the
  garage's FREE BUILD / INSPECT chips and the pause tool tray at 50x50.
  48 x 1.09 paints 52.3. Still one rung under --tap: a chip is secondary.
  ...EXCEPT AT UI SIZE 100 %, where 48 local px paints 48. MEASURED
  2026-10-05 (layout-audit, ios-iphone-landscape 734x343 @100): the circuit
  picker's five toolbar chips, all 95 SEASON SETUP chips and the garage's
  FREE BUILD at 48 tall, four under the floor. The middle arm is
  min(52/s, 52 x s): it is exactly 52 at s = 1 and falls away on both sides
  — 52/s reaches 48 at s = 1.083 (the 48 arm takes over and paints >= 52),
  52 x s reaches 48 at s = 0.923 (under 100 % the player asked for a SMALLER
  UI and --tap itself paints under 52, so the chip keeps its rung). So the
  chip meets the floor at every s >= 1 and nothing moves outside 92-108 %;
  at exactly 100 % it is as tall as --tap, which is the price of the floor.
  The 24/s arm is the WCAG floor at small scales.

## R6. --ui-scale — HOW BIG THE UI IS, as one number, consumed as a zoom by t

Above `:root` in `css/tokens.css`.

--ui-scale — HOW BIG THE UI IS, as one number, consumed as a `zoom` by the
menu sheets and the in-race clusters (css/components.css, css/hud.css).

ZOOM IS THE ONLY LEVER, AND THE TOKENS ABOVE DELIBERATELY DO NOT USE IT.
Scaling the tokens as well would DOUBLE-COUNT: every token above is consumed
inside a sheet, and a zoomed subtree already scales the lengths it inherits —
--tap: 52px inside zoom 1.15 paints at 59.8px on its own. Multiply first and
it paints at 68.8px. Nor can it be neutralised locally, because a token's
calc() is substituted where it is DECLARED (up here), not where it is used.
One mechanism per layer, and for anything inside a sheet the mechanism is
zoom.

ON :root, so the `zoom` declarations and js/game.js agree on one element.
`(pointer: coarse)` is the same question Input.touchControlsNeeded() asks, so
the CSS default and the JS default cannot disagree — and unlike the
`.desktop` class, which is added at boot, it is right on the FIRST paint.

1.0 is the shipped default on every pointer. Touch used to ship at 1.15, and
UI SIZE's floor briefly sat at 90% then 80% — players still pegged the
slider left and wanted more "zoom out". Floor is 40%; default stays 100%.
SETTINGS ▸ DISPLAY ▸ UI SIZE still goes up to 200%.

SHORT/NARROW VIEWPORTS NEED TWO ANSWERS. Scaling every gap, inset and target
all the way to 200% leaves a phone showing one enormous button; refusing the
setting would make the accessibility control dishonest. The title screen
therefore caps only its compact GEOMETRY at 125%, then multiplies its text by
the residual ratio. At 200%, chrome paints at 1.25x while type still paints at
1.25 * 1.6 = 2x. Wide/tall screens continue to consume --ui-scale directly.

## R7. THE TOUCH-ONLY DEFAULT this block was reserved for. Filled in 2026-09-

Above `@media (pointer: coarse)` in `css/tokens.css`.

THE TOUCH-ONLY DEFAULT this block was reserved for. Filled in 2026-09-08 from
the owner's own phone — HUD 1.24 and buttons 1.4536x that, i.e. 1.80 — and
CORRECTED 2026-09-14, because those numbers put the driving controls on top of
the readouts on every phone.

WHAT WENT WRONG. The pedals rendered 130px = ~34mm: 2.3x Microsoft's suggested
MINIMUM touch target for phones (15mm) and past their minimum for TABLETS
(24mm), with the stacked column eating 58% of a 393px short edge. #btn-brake
covered 119x53px of #minimap and #btn-boost covered 59x84px of #hud-sectors,
at both 852x393 and 667x375. tests/specs/hud-layout.spec.js had been red on
those cases ever since, unnoticed because test:ui is not in the fast tier.

WHY A SINGLE BRANCH WAS THE MISTAKE. The standards treat two things as
SEPARATE requirements with different justifications: interactive TARGET SIZE
has a physical floor (~15mm phone / 24mm tablet per XAG 107; 0.96cm per the
Game Accessibility Guidelines; 48dp per Android), while READOUT size has a
legibility floor expressed in px-at-DPI (XAG 101). One `(pointer: coarse)`
rule raised both, so the controls grew into the readouts.

Note also what XAG's mobile numbers actually are: 18px @100 DPI, 36px @200,
72px @400, "scale linearly as DPI increases". That is a DPI correction holding
PHYSICAL size constant — not a "touch devices get a bigger UI" rule. No
published guidance prescribes a numeric coarse-pointer scale multiplier at
all; 1.24/1.80 had no standard behind it.

THE RULE NOW: the DEFAULT is a floor, the RANGE is generous. XAG 101 calls its
sizes "the minimum default size ... upon game launch" and asks for scaling
"larger or smaller at the player's discretion"; the Game Accessibility
Guidelines say "ensuring a good default size should always be the first port
of call". So --hud-scale sits at 1 and the readouts are DPI-correct rather
than bumped, while the buttons keep a modest ratio over it that satisfies the
physical floor: 1.25 renders the pedals at ~90px (~24mm, the GAG ideal) and
the secondary column at ~68px (~18mm, over the 15mm floor). 1.80 is still
reachable — it is a slider, and a player who wants the old size has it.

--ui-scale stays 1.09. It is menus only, nothing there overlaps at any scale
this ships, and moving it would be a look change with no defect behind it.

BUTTON SIZE has its own fixed touch default; HUD SIZE never moves it.
scaleDefault()/scaleDefaultFor() in js/ui/scale.js mirror these numbers under
the same query, so first paint and the first JS write agree (the note above);
tests/unit/scale-defaults.test.mjs holds the two in lockstep.

## R8. VIEWPORT UNITS ARE THE ONE UNIT FAMILY zoom GETS WRONG, so inside a zo

Above `:root` in `css/tokens.css`.

VIEWPORT UNITS ARE THE ONE UNIT FAMILY `zoom` GETS WRONG, so inside a zoomed
subtree they need dividing by the same scale. Everything else behaves —
measured in Chromium 141 at 844x390 under `zoom: 1.3`:

  width: 340px  -> 442.0px   scales, as intended
  width: 5.2em  -> 87.9px    scales, as intended
  width: 78%    -> 658.3px   safe (a share of an already-scaled parent)
  width: 78vw   -> 855.8px   OVERFLOWS an 844px viewport

A viewport unit resolves against the UNZOOMED viewport and is then multiplied
by the zoom, so `78vw` renders as 101vw. Shipped consequence, measured on the
title screen in portrait at 393x852: `min(78vw, 340px)` takes its vw branch
(306px), and at UI SIZE 130 % the button column rendered 398.5px wide with its
right edge 17.5px off screen; at 150 %, 78.8px off. The CSS width never
changed — 306.5px at every setting — which is exactly why it does not read as
a sizing bug when you look at the stylesheet.

THE SECOND TRAP IS IN JAVASCRIPT, and it has no CSS symptom at all. The
standardised `zoom` (CSS Viewport L1) says getBoundingClientRect and friends
"must return rects with SCALED lengths", while computed-style APIs report
non-auto, non-percentage lengths UNSCALED. So inside a zoomed subtree a
rect's width and the same element's computed width are two different
coordinate spaces, and any code that compares one to the other is wrong by
exactly the zoom factor — silently, and only for players who moved the
slider off 100 %.
Audited 2026-09-14: six files read both, but every computed read is a
NON-LENGTH (visibility, z-index, overflow-y, display, a custom property) and
the one site that does compare lengths — metrics-overlay.js's fitsWide(),
which measures a ch probe with a rect and compares it against the computed
width and padding of its panel — lives on #game-metrics,
which is not in any zoom group. Correct today by luck of placement rather than
by construction, so: if you ever put a length comparison inside `.sheet`,
`#overlay > *`, a HUD cluster or `.dock`, measure BOTH sides with rects.
(Chrome 128 also widened what `zoom` inherits into — it now applies to every
inherited length property, not just font-size — so a layout tuned before it
can render differently now. caniuse's support cells do not distinguish the
legacy implementation from the standardised one.)

`100 * var(--vwz)` is "100vw, as rendered". Use it for ANY viewport-unit
length inside a `.sheet`, `#overlay > *`, a HUD cluster or `.dock`; use the
bare unit everywhere else, where it is correct and cheaper. The safe-area
insets in hud.css already do this by hand (`var(--sat) / var(--hud-scale)`) —
same correction, same reason.

There are TWO PAIRS because there are two scales. The `z` pair is the MENU
layer (--ui-scale: .sheet, #overlay > *); the `zh` pair is the DRIVING layer
(--hud-scale: the HUD clusters, .dock). Using the wrong one is worse than
using none — it divides by a number the player can move independently.
The audit that found this turned up exactly one HUD-layer site, #announce's
font-size in hud.css, whose `top` on the line above was already divided by
--hud-scale by hand while its 8vw was not.

## R9. COLOUR VISION (js/ui/appearance-opts.js): remap semantic ink used by t

Above `:root[data-cvd="deutan"],` in `css/tokens.css`.

COLOUR VISION (js/ui/appearance-opts.js): remap semantic ink used by the HUD
and menus. Same hues as the Tol/IBM-safe triples (matches the driving-line
COLOUR-BLIND palette intent without filtering the 3D canvas), LIGHTENED for
the always-dark HUD plate: the published values (#0077bb, #cc3311) are a
white-paper palette and measured ~3:1 on rgb(8 8 14 / .72) over a mid-grey
scene. Every ink here clears 4.5:1 there (tests/unit/apca-timing.test.mjs).
--red stays the dark accent: it is never HUD ink (see that test).
WARN IS NOT HIT: --sec-slow (a warning, a penalty WARN, damage level 1) and
--slower (a penalty HIT, damage level 3) once shared #ee7733 under deutan /
protan, which merged penalty-warn with penalty-hit on the radio card and
turned damage level 2 — a 50/50 mix of the two — into the same colour as
both. Tol's sand #ddcc77 keeps the yellow "caution" meaning and sits well
above either red in LIGHTNESS, the one channel every dichromacy keeps
(tritan's #ff6a4d / #ee7733 were ~0.01 apart in OKLab L).
--you and --sec-best were retuned so they stay apart from --slower under the Machado simulation.

## R10. THE RACE CHROME IS DARK IN EVERY THEME. Its plates are dark — literal

Above `:is(#hud, #announce, #game-metrics)` in `css/tokens.css`.

THE RACE CHROME IS DARK IN EVERY THEME. Its plates are dark — literal
rgb(8 8 14 / …) in css/hud.css, or --plate-opaque — so LIGHT's ink tokens
(a white --hud-halo, a mid-grey --dim, dark hairlines, a light --bg used as
ink on --you) and LIGHT's plates (--plate-opaque at #fbfbfc) must never
reach it. Custom properties resolve where they are DECLARED, so a light
--plate-opaque arrives at #hud already computed from the light --carbon:
restating --text alone (the first cut of this block) left RELATIVE,
STRATEGY, INPUTS, the MIRROR chip, the blue flag and the broadcast tower at
~1.05:1 on a near-white plate, and #announce / #game-metrics (siblings of
#hud, not children) got no restatement at all.
So ONE scope, unconditional: every token the light block re-points is
restated here with its :root (dark) value, on every in-race overlay root.
In the dark theme this is a no-op; tests/unit/nontext-contrast.test.mjs
pins that each value equals the :root one and resolves every overlay's ink
on its plate under LIGHT, SYSTEM-light and LIGHT + HIGH CONTRAST. Same move
as .touchbtn in css/touch-controls.css.

## R11. ---- KEYBOARD FOCUS RING (WCAG 2.4.7 Focus Visible) ------------------

Above `:focus-visible` in `css/tokens.css`.

---- KEYBOARD FOCUS RING (WCAG 2.4.7 Focus Visible) --------------------
Two decisions here, both learned the hard way.

INSET, not outset. Every focusable control in this UI sits inside at least
one clipping box — a .pane scroll region, #sel-tracks, #cs-options, .sheet,
.dh-card, and finally body/html, all of which are overflow:hidden. A ring
drawn 2px OUTSIDE the border box lands outside that clip and gets sliced:
an audit of every control on every menu screen found the left side of the
track rows' ring, the top of the team tiles', and the bottom edge of the
last row in half a dozen panes all cut off. Chasing that with a per-
container override is endless — a negative offset draws the ring just
inside the box instead, where nothing can ever clip it, in any layout.

BASE LAYER, not overlays. This rule used to live in css/responsive.css,
which is @layer overlays — a HIGHER layer than @layer components, so it
beat every per-component focus override in the codebase on layer order
alone, regardless of specificity. `.track-row:focus-visible` losing to
`button:focus-visible` is not a cascade you can debug by reading
specificity. The generic default belongs in base, where a component can
still override it.

## R12. THE density switch. A landscape phone is ~390-430px tall and that is t

Above `@media (orientation: landscape) and (max-height: 560px)` in `css/tokens.css`.

THE density switch. A landscape phone is ~390-430px tall and that is the
whole constraint: the same menus, tighter. Nothing here changes layout —
only how much room each part takes.

FOUR OF THESE WERE DEAD, AND HAD BEEN SINCE THE TOUCH LADDER LANDED.
This block declared --tap/--chip-h/--tap-sm/--label on :root while the touch
ladder declares --ui-scale (and previously those same four) on body. A
declaration on the element ITSELF always beats one inherited from an
ancestor, so on every touch device in landscape — which is this game's
primary orientation, i.e. exactly the case the block was written for — the
body value won and these four never applied. Only --pad/--gap/--gut ever
landed. Nothing said so, and the numbers read like a working ladder.

They are gone rather than moved to body. Shrinking the tap ladder on the one
device that aims with a thumb is what the whole "everything is too small"
thread was about; the size question now has one answer, --ui-scale, and a
setting behind it. What stays is the SPACING, which is the real constraint on
a 393px-tall screen and is orthogonal to how big a control is.

## R13. THE SAME TIGHTENING, DECIDED IN THE SHEET'S OWN UNITS.

Above `.sheet[data-density="compact"]` in `css/tokens.css`.

THE SAME TIGHTENING, DECIDED IN THE SHEET'S OWN UNITS.
The query above reads the VIEWPORT, and every `.sheet` carries
`zoom: var(--ui-scale)` — so the two are measuring in different spaces and
disagree exactly when it matters. At UI SIZE 150% on a 1000x600 screen the
query reads 600, declines to tighten, and hands roomy 22px padding to a sheet
whose own height is 400px. That is the same coordinate-space fault that put
the lighting tuner's action bar off the bottom of a phone
(docs/archive/research/ZOOM-ORIENTATION-STRUCTURE-2026-08.md has the full inventory).

`data-density` is the answer that can see both: js/ui/sheet-shape.js divides
the measured height by the element's own zoom, against a per-sheet
`--compact-at`. A sheet that is short in the units its CSS is written in gets
the tighter spacing whatever the viewport says. "Short" is the ROOM the sheet
has (its host's content box, floored by its own height), not its content —
a content-sized sheet's compact layout is shorter than its normal one, and
measuring the content kept RACE SETTINGS compact on an 800px desktop.

THE VIEWPORT QUERY STAYS, and is not redundant. It also serves `#overlay`,
which is one of the two screens outside `.sheet` and therefore carries no
`data-density` — deleting it would leave the title screen roomy on a landscape
phone. The two overlap harmlessly: where both apply they set the same three
numbers. Bringing #overlay under the attribute is the next step in that doc's
migration order, not this one.
