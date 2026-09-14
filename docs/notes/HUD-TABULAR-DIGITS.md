# The HUD's tabular figures are inert, and the obvious fix does not fit

*Measured 2026-09-14. Investigated, fixed, measured again, and then **not
shipped** — the fix works and the HUD has no room for it. This note exists so
the next attempt starts from the measurements instead of repeating them.*

## The defect

`font-variant-numeric: tabular-nums` appears ~36 times on `--font-hud` across
`hud/data/career/components`. **Every one of them is inert**, and the reason is
narrower and more interesting than "the font has no features".

Rajdhani's full TTF is NOT feature-empty: v1.201 ships 11 GSUB features
(`abvs akhn blwf blws half haln nukt pres psts rphf vatu`) and 2 GPOS
(`abvm blwm`) — **all registered under script `deva` only.** There is no `latn`
script entry at all, so for Latin text there is no `tnum` and no kerning
either. The upstream feature files (`itfoundry/rajdhani`, `family.fea`) declare
`languagesystem DFLT/dev2/deva` and contain no figure feature — no `tnum`,
`lnum`, `pnum` or `zero` — anywhere in 1712 lines. What Google's subsetter then
serves for the Latin range is a font whose feature list is **literally empty**:
it dropped the Devanagari features and there was nothing Latin to keep.

So the shipped face genuinely has nothing to apply, but a maintainer reading
the source TTF would see 13 features and conclude the opposite. Verified with
fontTools against both the upstream TTF and the served woff2.

On top of that, Rajdhani's digits are proportional (upem 1000; "1" is 0.334em,
"8" is 0.542em — the widest, not "4"). CSS cannot synthesise a feature a font
does not contain ([CSS Fonts 4 §7.2](https://drafts.csswg.org/css-fonts-4/):
"text is simply rendered as if that font feature was not enabled; font fallback
does not occur"), and the failure is silent. `@supports` cannot catch it — it
tests the PROPERTY, which is supported; it is the FONT that is missing.

Measured in Chromium at `#hud-speed`'s 34px/700:

| string | Rajdhani |
|---|---|
| per-digit advance | 11.36 – 18.43px (**7.07px of jitter**) |
| `"111"` / `"888"` | 34.07 / 55.28 |
| `"1:23.456"` / `"8:88.888"` | 112.74 / 124.44 |
| `"+0.123"` / `"+8.888"` | 89.79 / 99.86 |

So every changed digit shifts the readout by up to 7px, per frame, on the
number you read while driving.

**`min-width: 3ch` is not the culprit, and an earlier draft of this note said
it was.** `1ch` is normatively the advance of "0" alone (536 units here), so
`3ch` = 1.608em = 54.67px against `"888"`'s 1.626em = 55.30px — short by
**0.63px, 1.1%**. The box was very nearly pinned. The 7px comes from the STRING
shrinking inside that box: `"888"` is 55.3px of glyphs and `"111"` is 34.1px,
so with any alignment but a hard edge every digit slides within a box that is
itself barely moving. This is an intra-string problem, not a box-width problem,
and a fix aimed at the box will not touch it.

## The fix that works

A digits-only `@font-face` — `unicode-range: U+0030-0039` — pulling the
numerals from Titillium Web, which is natively uniform-width, while every
letter still comes from Rajdhani. Titillium is already the next entry in
`--font-hud`, so these are the digit shapes the HUD renders today whenever
Rajdhani fails to load; it is not a new typeface in the game.

Two corrections were needed on top of the naive version, both about width:

1. **Separators stay on Rajdhani.** The first draft put `. : + -` on the new
   face too. They are fixed characters — they cannot jitter — so it bought
   nothing and cost their extra width.
2. **`size-adjust: 96.79%`** (18.428 / 19.040). Titillium's digit is 3.3% wider
   than Rajdhani's *widest*, and this HUD is sized for Rajdhani's worst case.

With both, re-measured: jitter **7.07px → 0.00px**, and every worst-case string
is at or *under* today's — `"888"` 55.28 → 55.26, `"8:88.888"` 124.44 → 124.38,
`"+8.888"` 99.86 → 99.82.

## Why it is not shipped

**Tabular figures make every string as wide as its worst case. That is the
point, and it is also the problem.** Holding the worst case constant is not
enough when the boxes are content-sized: a readout full of narrow digits
("POS22/22 LAP1/3 TIME0:00.08" — 1s, 2s and 0s) is *typically* much narrower
than its worst case in Rajdhani, and tabular figures give up that slack.

`tests/specs/hud-layout.spec.js` caught it. Against the base commit the fix
added one clash, `.hud-top+.hud-gaps`, in all six `small-landscape` cases
(667×375) and nowhere else. A/B'd on one frozen page (`__apex.freeze(true)`,
identical strings in both readings — an earlier attempt compared across a
running clock and measured the content, not the font):

| | Apex Digits | Rajdhani | delta |
|---|---|---|---|
| `.hud-top` | x 196.8, w 273.3 | x 199.3, w 268.3 | **+5.0px wider** |
| `.hud-gaps` | x 114, right 200.4 | x 114, right 202.6 | −2.2px narrower |
| overlap? | yes | **yes** | ~0.3px worse |

Read that last row carefully: **the pair already overlaps on the base.** The
gap strip is even slightly *narrower* with the digit face. `.hud-top` is
centred, so its 5px of growth moves its left edge 2.5px toward the strip, and
that is enough to tip six knife-edge cases from just-passing to just-failing.

This pair is in that spec because it shipped broken once before, painting the
gap strip over the POS/LAP/TIME/BEST plates. It has no slack at 667×375.

## A better option than the composite face: just change the font

Measured with fontTools across the condensed/display faces in the same register
as Rajdhani (wght 600 Latin subsets). `tnum` means the feature exists AND
resolves to uniform advances:

| family | tabular digits? |
|---|---|
| **Rajdhani** | no — 8 distinct widths, no `latn` features |
| Oswald, Saira Condensed, Chakra Petch, Teko | no — no `tnum`, 9–10 distinct widths |
| **Barlow Condensed** | **yes** — `tnum` → all 475 |
| **Fira Sans Condensed** | **yes** — `tnum` → all 504 |
| **Encode Sans Condensed** | **yes** — `tnum` → all 1109/2000 |
| **Archivo Narrow** | **yes** — already all 456 |
| **Roboto Condensed** | **yes** — already all 1030/2048 |
| Titillium Web, IBM Plex Sans Condensed | no `tnum`, but digits are ALREADY uniform |
| Exo 2 | `tnum` present but BROKEN — "4" is 616, the other nine are 620 |

Swapping the HUD display face for one that has real tabular figures removes the
composite-font machinery, the `size-adjust` constant, and the Safari-17 floor in
one move. That was not considered on the first pass and should be considered
first on the next.

Two cautions the measurements turned up:

- **`size-adjust: 96.79%` rested on an assumption that is not a law.** It was
  derived from "the tabular width should equal Rajdhani's widest digit". Encode
  Sans Condensed is a counter-example: its `tnum` width (1109) is NARROWER than
  its widest proportional digit (1137). The constant is a design choice, not a
  derivation, and it needs re-measuring against whatever face is chosen.
- **The composite face would have moved `ch` underneath us.** A digits-only face
  excludes U+0020, so it is not the "first available font" and `ex`/`line-height`
  stay Rajdhani — but `ch` is defined as the advance of "0" *in the font used to
  render it*, so `1ch` would have become Titillium's zero times `size-adjust`,
  silently resizing every `ch`-sized box on the page. Spec-derived, NOT measured
  (CSS Values 4 §6.1.1 + the CSS Fonts 4 changelog line "stop claiming that `ch`
  uses the first available font"); implementations may disagree. Measure before
  relying on it either way.

## A guard that would have caught this

The bug class is "a declaration that reads as working and is not", which is the
same class as the vacuously-green test noted below. A `tools/check/` guard can
close it: for every font the shell ships, assert EITHER `tnum` is present and
its substituted advances are uniform, OR the default digit advances are already
uniform. fontkit's `availableFeatures` or fontTools' `GSUB.table.FeatureList`
both answer it in a few lines (guard for `FeatureList is None` — Rajdhani's
subset is exactly the input that crashes naive code). Tag presence alone is not
enough: Exo 2 above has the tag and still fails. This mechanises the same check
fontspector proposes in its issue #896.

## What the next attempt needs

Fixed slots before the font, not after. `.hud-top` and `.hud-gaps` are
content-sized and sit at the same `top` with no `z-index`; give each readout a
slot sized for its worst-case string and `.hud-top` stops growing at all —
at which point tabular digits are free, and are in fact what makes fixed slots
honest. Sizing those slots needs a look at the real screen, which is why it was
not bolted onto this pass.

Two ways to size a slot that do not repeat the `ch` mistake:

1. **Per-digit slots.** One inline-block per digit at the WIDEST digit's advance
   (`0.542em` for Rajdhani Bold, not `1ch`), digit centred inside. Fixes the box
   AND the intra-string slide in one move, with no font change and no download.
2. **Grid-stack a hidden worst case.** Put the live value and a
   `visibility: hidden` `"888"` in the same grid cell so the cell always sizes to
   the larger. Font-agnostic — it survives a future font swap without a magic
   em constant in the CSS.

Keep the ~36 `tabular-nums` declarations either way. They cost nothing and
become correct the day the face changes.

Do **not** re-derive the font metrics: they are in the tables above, measured
with `document.fonts.load()` + `check()` first (a first reading was taken
before Rajdhani had loaded and showed a 3.75px spread — wrong by 2x).

## Second attempt, 2026-09-14 — and the real obstacle, now measured

The `--hud-scale` correction (1.24 -> 1, see the `(pointer: coarse)` note in
css/tokens.css) shrank every readout in that zoom group by 24%, so the fix was
re-applied on the theory that the room now existed. It does not, and the reason
is sharper than "no slack":

**`.hud-top` vs `.hud-gaps` already overlap by 27px at 667x375, without any font
change at all** — but only once the readouts POPULATE. A/B'd on one frozen page
(`__apex.freeze(true)`, both readings carrying byte-identical strings):

| | `.hud-top` left | `.hud-gaps` right | overlap |
|---|---|---|---|
| Apex Digits | 168.9 | 200.4 | 31.5px |
| Rajdhani only | 175.5 | 202.8 | **27.3px** |

So the digits face costs 4.2px on a pair that is already 27px into each other.
That is why it is reverted a second time: it is not the cause, and it is not
free either.

### Why hud-layout.spec.js is green anyway

It measures ~300ms after `go()`, while the band still reads
`POS-/22 LAP1/3 TIME- BEST-`. Populated it reads `POS22/22 LAP1/3 TIME0:00.08
BEST-` and, being CENTRED, grows LEFTWARD into the strip. The spec never sees
the wide state. **Its green is a timing artefact on this pair.** Anyone working
here should freeze a populated race rather than trust the suite.

### What was fixed, and what is still open

`fitHud`'s re-run key gained the top band's own `textContent.length`. The key
already carried the GAP chip's length for precisely this reason — a recorded
bug where "a mid-window growth overlapped the POS tile until the next forced
read" — and the same argument applies symmetrically to the band that grows
toward it. That is correct by construction and is kept.

**It is not sufficient, and the remaining cause is not yet found.** With the key
fix in place, `data-gap-drop` and `data-gap-short` both still read false in the
populated state, so `capFor()` is concluding the strip fits when the measured
boxes say it does not. `capFor(l) = min((half - sal) / (l + top/2), ...)`; at
667x375 with `top` = 329.1 and `l` ~= 208 that evaluates to ~0.89, which is
below `scale` and SHOULD have set `_gapTight`. Either `top` is not the width
measured above when the comparison runs, or the rung is being computed from a
spelling that is not on screen. The next session should instrument `capLong` /
`capShort` / `top` directly rather than infer them.

Note the strings here are a backmarker's: `+84.3s` at P22. A normal racing gap
(`+0.3s`) is much narrower, which is why this is content-dependent and why it
has survived unreported.

## Caveat on the surrounding spec run

`hud-layout.spec.js` is **16/32 red on this container regardless** — the same
16 test names fail on the base commit `93804f7`, with byte-identical overlap
payloads apart from the one pair above. Those 16 are not this change and were
not investigated. The `.hud-top+.hud-gaps` finding is a *differential* against
that same red baseline, which is why it is trustworthy and the absolute
pass/fail count is not.
