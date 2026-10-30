# Design pass #2d — Data Hub, overlays, tokens, audit coverage (2026-10-30)

Lane 2d of design pass #2 (issue #4241; pass #1: `DESIGN-PASS-1-2026-10-30.md`, PR #4213). Cell: iPhone 13
landscape 844x390, touch, TLX/WebGPU. Question: do the Data Hub, the dialogs/overlays and track detail look
like a premium F1 game on a phone, and can every layout-audit cell be measured?

## Method
- Pass #1's method reused: `layout-audit.mjs --viewports=ios-iphone-landscape-844 --screens='*' --shots --dom`
  before any CSS edit (`artifacts/layout-audit/audit.before.json`), the same run plus `--diff` after.
- Token census: `scratch/design-pass-2d/census.mjs` (raw colour literals outside `tokens.css`, `var(--`
  uses, literals that equal a token value).

## Token census (before)
Raw colour literals 322, `var(--` uses 5,571, raw `font-size` literals 65. Worst files: `hud.css` 73,
`carsetup.css` 59, `data.css` 48, `touch-controls.css` 47, `overlays.css` 22.
