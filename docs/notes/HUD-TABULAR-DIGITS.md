# The HUD's tabular figures are inert, and the obvious fix does not fit

*Measured 2026-09-14. Investigated, fixed, measured again, and then **not
shipped** — the fix works and the HUD has no room for it. This note exists so
the next attempt starts from the measurements instead of repeating them.*

## The defect

`font-variant-numeric: tabular-nums` appears ~36 times on `--font-hud` across
`hud/data/career/components`. **Every one of them is inert.** Rajdhani — the
first family in that stack — ships no OpenType features at all (empty
GSUB/GPOS) and proportional digit advances (upem 1000; "1" is 0.334em, "4" is
0.541em). CSS cannot synthesise a feature a font does not contain, and the
failure is silent: the declaration reads as working.

Measured in Chromium at `#hud-speed`'s 34px/700:

| string | Rajdhani |
|---|---|
| per-digit advance | 11.36 – 18.43px (**7.07px of jitter**) |
| `"111"` / `"888"` | 34.07 / 55.28 |
| `"1:23.456"` / `"8:88.888"` | 112.74 / 124.44 |
| `"+0.123"` / `"+8.888"` | 89.79 / 99.86 |

So every changed digit shifts the readout by up to 7px, per frame, on the
number you read while driving. `min-width: 3ch` on `#hud-speed-n` does not save
it: `1ch` is the advance of "0" (536 units), so the slot is 1608 while `"888"`
needs 1626 and `"111"` needs 1002.

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

## What the next attempt needs

Fixed slots before the font, not after. `.hud-top` and `.hud-gaps` are
content-sized and sit at the same `top` with no `z-index`; give each readout a
slot sized for its worst-case string and `.hud-top` stops growing at all —
at which point tabular digits are free, and are in fact what makes fixed slots
honest. Sizing those slots needs a look at the real screen, which is why it was
not bolted onto this pass.

Do **not** re-derive the font metrics: they are in the tables above, measured
with `document.fonts.load()` + `check()` first (a first reading was taken
before Rajdhani had loaded and showed a 3.75px spread — wrong by 2x).

## Caveat on the surrounding spec run

`hud-layout.spec.js` is **16/32 red on this container regardless** — the same
16 test names fail on the base commit `93804f7`, with byte-identical overlap
payloads apart from the one pair above. Those 16 are not this change and were
not investigated. The `.hud-top+.hud-gaps` finding is a *differential* against
that same red baseline, which is why it is trustworthy and the absolute
pass/fail count is not.
