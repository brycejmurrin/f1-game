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

## Decisions
<!-- filled after the variant round -->
