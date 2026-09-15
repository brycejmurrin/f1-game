# The HUD's tabular figures were inert, and the obvious fix did not fit

*Measured 2026-09-14. **RESOLVED the same day, on the third attempt** — see
"Third attempt" at the end, which is the one that shipped. The two failed
attempts above it are kept deliberately: both were correct fixes that the HUD
had no room for, and the reason the third one fits is the whole lesson. Read
this before touching the HUD face again; the measurements are here so nobody
repeats them.*

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

## Second attempt, 2026-09-14 — and what the obstacle actually is

The `--hud-scale` correction (1.24 -> 1) shrank every readout in that zoom group
by 24%, so the fix was re-applied on the theory that the room now existed. It was
reverted again, but the first write-up of WHY was wrong in a way worth recording,
because the wrong version is the one a frozen probe tells you.

### The overlap is TRANSIENT, not permanent — the correction

`.hud-top` and `.hud-gaps` do overlap at 667x375 once the readouts populate. They
do NOT stay that way. Sampled through a LIVE race, never frozen:

```
t=15.7-20.3  short=F drop=F  clash=F   topX=194.5 gapsR=130.7   "POS-/22 LAP1/3 TIME- BEST-"
t=21.3-26.3  short=F drop=F  clash=T   topX=173.0 gapsR=204.2   "POS22/22 LAP1/3 TIME0:00.33 BEST-"
t=27.3+      short=T drop=T  clash=F   topX=172.4 gapsR=169.8 gapsY=62
```

The band populates, the pair overlaps for ~4-6 s, then `gapShort` and `gapDrop`
latch, the strip moves to y=62 and it is clear for the rest of the race. **The
mechanism works.** Measured window across two runs: 3.8 s and 4.8 s.

WHY THE FIRST WRITE-UP SAID "ALREADY OVERLAP BY 27px" with no mention of it
clearing: that probe used `__apex.freeze(true)` to hold the strings still for a
clean A/B, and freeze parks the HUD inside the transient. A frozen HUD shows you
one instant and tells you nothing about whether it is on its way somewhere. The
A/B it produced (27.3px on Rajdhani, 31.5px with the digits face) is still
correct about the FONT — both configurations sit in the transient, and the face
costs ~4px of it — but "already overlap" implied permanence and that was wrong.

### The delay is the two-rung design, not a missed re-fit

The rungs are deliberately ordered — shorten (loses the driver code) before drop
(loses alignment with the map) — and `capShort` cannot be judged until the short
spelling has been rendered once, so convergence needs more than one forced pass.
`_fitWait` paces those passes at ~3 s. That is where the window comes from.

`fitHud`'s re-run key was given the top band's own `textContent.length` on the
theory that the band growing leftward was a missed re-fit, mirroring the gap
chip's length which is in the key for exactly that reason. **Measured A/B: it
changes nothing** — 3.8 s window without it, 4.8 s with (run-to-run noise, and
certainly no gain). It was reverted rather than left in as complexity carrying a
rationale the measurement does not support. Do not re-add it without a
measurement showing a shorter window.

### What would actually shorten it

Nothing here is free: shrinking `_fitWait` costs forced layout reads at 10 Hz,
and collapsing the two rungs into one reintroduces the oscillation the split was
built to stop (the code says so at length). The honest options are to accept a
few seconds of overlap at race start on a 667-wide phone, or to give the strip a
slot that cannot collide in the first place. Neither is a font problem.

### Still true about the font

The digits face costs ~4px on a pair that spends several seconds inside each
other at race start. That is why it is reverted a second time. Jitter 7.07px ->
0.00px and worst-case widths unchanged both still hold, and the recipe is above.

## Caveat on the surrounding spec run## Caveat on the surrounding spec run

`hud-layout.spec.js` is **16/32 red on this container regardless** — the same
16 test names fail on the base commit `93804f7`, with byte-identical overlap
payloads apart from the one pair above. Those 16 are not this change and were
not investigated. The `.hud-top+.hud-gaps` finding is a *differential* against
that same red baseline, which is why it is trustworthy and the absolute
pass/fail count is not.

---

## Third attempt, 2026-09-14 — SHIPPED. Change the whole face, not the digits

Both attempts above kept Rajdhani for the letters and swapped only the numerals
in. That is what made them too wide: the composite face bought uniform digits
and paid **+5.0px** on `.hud-top`, and the pair it collided with has no slack at
667×375. Holding Rajdhani's letters was never a requirement — it was an
assumption, carried from the first attempt into the second.

Dropping it is what fits. `--font-hud` now leads with **Barlow Condensed**,
`size-adjust: 91.9%`, and the ~36 `tabular-nums` declarations became correct.

### Why Barlow and not the other three

Measured with fontTools against Rajdhani on the two strings that decide it —
`.hud-top`'s populated worst case, which is the width the fit pass fights over,
and `"888"`:

| face | tnum | uniform | `.hud-top` | `"888"` |
|---|---|---|---|---|
| Rajdhani (was) | no | no | — | — |
| Archivo Narrow | yes | yes | −1.9% | −15.9% |
| **Barlow Condensed** | yes | yes | **−5.0%** | −8.1% |
| Fira Sans Condensed | yes | yes | **+3.1%** | −7.0% |
| Roboto Condensed | yes | yes | **+4.5%** | −6.8% |

**Two of the four are wider on `.hud-top`.** The table in "A better option than
the composite face" ranks these faces by whether they *have* tabular figures,
which is necessary and not sufficient — a wider face would have reproduced the
+5px failure by another route. Rank candidates on `.hud-top`, not on `tnum`.

### The size-adjust is derived, and it is CAP HEIGHT

`0.643 / 0.700 = 91.86%` — Rajdhani's cap height over Barlow's. At a shared
`font-size` Barlow renders 8.9% taller, and every HUD box measured against the
old face would be wrong. Chromium agrees: `"H"` at 700/34px is **21px in both**.

Cap height, not em and not x-height, because the HUD is uppercase and digits.
This is the re-derivation the earlier `size-adjust: 96.79%` note asked for, and
it lands on a different quantity for a different reason — that constant matched
digit WIDTH for a digits-only face; this one matches HEIGHT for a whole face.
The next swap should re-derive again rather than inherit either number.

Net effect on the pair that blocked attempt two: `.hud-top`'s populated string
goes **206.2 → 169.2px** at 14px, −18%. The fix that was too wide is now the fix
with the most slack anyone has measured here.

### The defect, before and after, in a browser

Three-digit strings at `#hud-speed`'s 34px, widest minus narrowest:

| | tnum off | tnum on |
|---|---|---|
| Rajdhani | 21.22px | **21.22px** — the declaration did nothing |
| Barlow Condensed | 20.94px | **0** |

And in the shipped HUD rather than a synthetic string: live Monza race, chase
camera, `#hud-speed` reading `257KM/H` at 28px/800 — all ten three-digit values
measure **38.4px exactly**.

**That probe was vacuous on its first run** and the trap is worth keeping: it
reported spread 0 with every width ALSO zero, because the default camera is
cockpit and `body.cockpit-cam` hides `#hud-speed`. A zero-width box trivially
has zero spread. Measure with `camera("chase")`, and refuse to measure a box
with no width — the same shape as the inert declaration this whole note is about.

### What is now guarded

`tests/unit/font-digits.test.mjs` was rewritten from pinning the defect to
enforcing the rule this note proposed: every shipped face must have uniform
digit advances either natively or after `tnum` substitution, checked on the
SUBSTITUTED advances rather than the tag — because the tag is not enough, and
Exo 2 above is the counter-example. It also pins `size-adjust` to its derivation.

### Still open, and deliberately not done

The fixed-slot work in "What the next attempt needs" was NOT done and is no
longer urgent: with the face 18% narrower the transient has room it never had.
Per-digit slots or the grid-stacked worst case remain the way to make
`.hud-top` stop resizing at all, if that ever matters again.
