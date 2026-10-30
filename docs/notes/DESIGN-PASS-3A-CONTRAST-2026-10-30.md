# Design pass #3A — contrast tokens (2026-10-30)

Lane A of design pass #3 (issue #4258; coordinator index `DESIGN-PASS-3-2026-10-30.md`). Cell: iPhone 13
landscape 844x390, touch, TLX/WebGPU. Question: secondary labels, red-as-text and the touch-label floor
sit under APCA / Apple minimums (`UI-DESIGN-RESEARCH-2026-10-30.md` §measured gaps); lift them without
breaking the timing family, the colour-vision palettes or any layout.

## Method
- Before any edit: `layout-audit.mjs --viewports=ios-iphone-landscape-844 --screens='*' --shots --dom`
  (`artifacts/layout-audit/audit.before.json`); after, the same run plus `--diff`.
- APCA 0.1.9 (the implementation `apca-timing.test.mjs` self-checks against the published anchors), OKLab
  `color-mix` resolved in the test. Grounds: `--bg` #0c0c14, `--panel` and `--plate` composited on `--bg`,
  `--surf-3`, and the HUD plate rgb(8 8 14 / .78) over a mid-grey scene (#222227), the worst dark case.
- Variants injected live after each screen opens, shot at 844x390 @2x (`scratch/dp3a/capture.mjs`, rebuilt
  from DESIGN-PASS-1 §Method); px moved = pixels whose summed RGB delta against the shipped shot exceeds 48.

## Measurements
`--dim` candidates (dark theme), APCA Lc / WCAG ratio:

| ink | --bg | --panel | --plate | --surf-3 | HUD plate |
|---|---|---|---|---|---|
| #9a9aa8 (shipped) | 48.0 / 7.0 | 46.5 | 47.6 | 45.9 | 45.8 / 5.7 |
| #adadbb | 58.2 | 56.7 | 57.8 | 56.1 | 56.0 |
| #b4b4c2 | 62.1 / 9.5 | 60.6 | 61.7 | 60.0 | **59.9** |
| **#bdbdca** | **67.2 / 10.5** | 65.6 | 66.8 | 65.1 | **65.0 / 8.5** |
| --text #f6f6f9 | 101.8 | 100.3 | 101.5 | 99.7 | 99.6 |

LIGHT `--dim` #5a5a68: Lc 74.7 on `--bg`, 79.9 on `--panel`, 70.6 on `--plate`, 60.2 on `--surf-3` — already
clears 60 everywhere; unchanged. HIGH CONTRAST derives `--dim` from `--text` (86 %), unchanged.

Red text ink = `color-mix(in oklab, var(--slower) N%, var(--text))`:

| N | dark ink | --bg | HUD plate | LIGHT ink | LIGHT --bg | LIGHT --surf-3 |
|---|---|---|---|---|---|---|
| 100 (`--slower` as text today) | #ff3b30 | 40.1 | 37.9 | #ff3b30 | 52.6 | 38.1 |
| 65 | #ff8a7c | 57.1 | 54.9 | #a63430 | 73.1 | 58.6 |
| 60 | #ff9385 | 60.0 | 57.8 | #99332f | 75.8 | 61.3 |
| **55** | **#ff9c8f** | **63.2** | **60.9** | **#8d312e** | **78.3** | **63.8** |
| 50 | #ffa599 | 66.5 | 64.2 | #812f2d | 80.7 | 66.3 |

CVD remaps at 55 %: deutan/protan (#ee7733) → #f7b393, Lc 69.8; tritan (#ff9eb0) → #fec6d0, Lc 80.5.
Timing family on `--bg`: `--sec-best` 65.1, `--faster` 77.2, `--sec-slow` 80.4, `--slower-ink` 63.2 —
spread 17.2, inside the 20 Lc band.

## Finding: HIGH CONTRAST is the shipped default
`AppearanceOpts` defaults `uiContrast` to `"high"`, and Bryce's own export
(`tests/data/settings-defaults-export.json`) has it on. Under HIGH CONTRAST `--dim` is
`color-mix(in oklab, var(--text) 86%, var(--bg))` ≈ #c9c9d4, Lc 74 on `--bg`. So the `--dim` lift
below changes only the STANDARD contrast setting; on Bryce's phone the visible changes of this lane
are the red text ink, the 11 px label floor and the POS fix. The first variant round ran in the
default and measured nothing for `--dim` (a `:root` variant loses to `:root[data-ui-contrast]`);
the round was re-shot with contrast off.

## Variants
Injected live after each screen opened, 844x390 @2x, STANDARD contrast; px moved vs shipped:

| variant | `--dim` | red ink mix | careerhub | settings | datatelemetry | hud (forced red states) |
|---|---|---|---|---|---|---|
| A | #b4b4c2 | 60 % | 0.34 % | 0.51 % | 1.86 % | 0.07 % |
| **B** | **#bdbdca** | **55 %** | 0.38 % | 0.51 % | 2.06 % | 0.07 % |
| C | #c8c8d4 | 50 % | 0.74 % | 1.69 % | 2.23 % | 0.07 % |

A single-ink lift is not a layout variant: every screen moves under 2.3 %, and part of that is the
animated circuit behind the sheets. The pick is on measurement, not on pixel delta.

## Decisions
- **`--dim` → #bdbdca** (B). The only candidate that clears Lc 60 on every dark ground including the
  HUD plate over a mid-grey scene (65.0); #b4b4c2 falls to 59.9 there. C (#c8c8d4) sits at HIGH
  CONTRAST's own value, which would erase the STANDARD/HIGH step. Hierarchy holds: `--text` Lc 102 vs
  `--dim` 67. Meaning-bearing `--dim` sites from 2b (career meter labels, garage comparison note,
  settings search hint and count) only gain. Disabled controls use opacity, not `--dim`, so they stay
  a step below. LIGHT `--dim` unchanged (already ≥ 60.2). The HUD scope restates the same value.
- **`--slower-ink: color-mix(in oklab, var(--slower) 55%, var(--text))`** (B). Lc 63.2 on `--bg`, 60.9
  on the HUD plate; timing family spread 17.2 (band 20). Mixing toward `--text` instead of a fixed
  hex keeps the hue, follows every CVD remap of `--slower` with no new `[data-cvd]` entries, and
  darkens under LIGHT (#8d312e, Lc 78.3). Applied only where red is TEXT: POS-loss flash, hot tyre
  letter, slow DELTA, limits-hot ink (its border keeps `--slower`), penalty WHO, tower rank loss,
  RELATIVE lapped row, strategy cover, the Data Hub deltas, the designer's red summary, the ghost gap
  (`js/ui/hud.js`) and the results gap (`js/ui/results-sheet.js`). Fills, gradients, damage and
  outlines keep `--slower`.
- **`--touch-label-floor` 10 → 11 px.** `css/touch-controls.css` belongs to the Codex race-interface
  lane (coordinator split, PR #4286), so its dock-scope `--dim: #9a9aa8` restatement is left to it.
- **POS cell under HIGH CONTRAST** (reported by the Codex lane on #4286): `:root[data-ui-contrast="high"]
  :is(.hud-box, #announce)` took `#announce`'s id weight through `:is()`, scored (1,2,0) and beat the
  POS light cell (1,1,1): dark ink on a dark plate, 1.08:1, in every race on Bryce's setting. Split
  into two selectors; split out as #4321 to land ahead of this PR. Its regression test's first version was
  vacuous: a running race animates colour and background, so a synchronous `getComputedStyle` read
  the transition's start value (18.05:1 everywhere, pass on the broken tip). The probe now freezes
  `#hud` transitions while it reads and asserts the rows differ; verified failing on the tip.

## Deferred (waits on #4257, fix in #4305)
Item 4 of #4258 and the HUD rawColor-lowering swaps: `--upgrade` for the garage's raw `#4df`;
`--hud-strip-bg` onto `.hud-box`, `#hud-sectors`, `#hud-limits`, `#hud-gearbox`, `.hud-gaps`; lane
2d's `--hairline` swaps in `css/data.css` (11 sites) and `#htp-contents`; `.dh-wins` `#f6d200` →
`var(--gold)`. Listed on #4258.
