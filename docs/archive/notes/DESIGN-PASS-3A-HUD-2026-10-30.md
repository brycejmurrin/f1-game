# Design pass #3a — race HUD, round 2 — 2026-10-30

Continues lane 2a (`DESIGN-PASS-2A-HUD-2026-10-30.md`, PR #4245). Issue #4285. Cell: Bryce's iPhone landscape
844x390, touch, button steering, from `tests/data/settings-defaults-export.json`: HELMET, HUD 155, BUTTON 245,
text large, **contrast HIGH**, PANEL OPACITY 65, RELATIVE / STRATEGY / INPUTS on. Gallery (same URL as 2a):
https://claude.ai/artifact/FjoUgW8Aj5uYWocTuThr88

## Method
- `hud-survey.mjs --matrix scratch/design-3a/matrix.json`: five 844x390 button-steer cells. They are Bryce's
  cell (above) by day and by night, chase at HUD 100 and at HUD 150 by day, and chase at HUD 100 by night.
  Before (tip 7c6d11c6): 5/5 measured, 0 findings.
- Variants: `scratch/design-3a/capture.mjs` uses GLX, `applyCell` from hud-survey, an injected `<style>`, and
  CDP `Page.captureScreenshot` at clip scale 2. The red-text, idle-chip and radio-card states are forced on, so
  every crop shows what changed. `scratch/design-3a/diff.mjs` reports the share of crop pixels whose summed
  |ΔRGB| > 48.
- APCA: the implementation in `tests/unit/apca-timing.test.mjs`. The plate is `--look-hud-bg`
  (rgb 8 8 14 / .78) over a mid-grey scene (rgb 34 34 39). The text halo only adds to these numbers.

## Split with design pass #3 lane A (#4300)
The coordinated pass #3 (#4286) launched lane A (#4258, PR #4300) at 17:14Z, after this lane had checked open
PRs at about 17:05Z. Lane A covers this brief's item 2, and covers it wider. It lifts `--dim` to #bdbdca
everywhere and adds `--slower-ink` (`--slower` mixed 55 % toward `--text`, so it follows the CVD remaps and the
LIGHT theme). It also fixes the HIGH CONTRAST POS cell, which this lane found too: an `:is(.hud-box, #announce)`
rule took the id's specificity and painted the light POS cell black, so the dark "POS" label disappeared in
Bryce's own setting. This lane had built the same fix as HUD-only `--hud-ink-slow` (#ff9d8a, Lc 61.1) and
`--hud-ink-dim` (#bdbdca, Lc 64.9) tokens. Those land the same picture as lane A's tokens (#ff9c8f / #bdbdca),
so this lane dropped its copy. `css/tokens.css` and the red/grey TEXT sites in `css/hud.css` are #4300's, and
`css/touch-controls.css` belongs to the coordinator's race-interface lane.

## 1. One panel token — waits on #4305
Measured: 12 HUD plates spell their own `rgb(8 8 14 / calc(0.86–0.94 × …))`, `rgba(8, 8, 14, .78/.82)`,
`black 72 %` or `--look-hud-bg 77 %`. They are `.hud-box`, `.hud-gaps`, `#hud-gearbox`, `#hud-tach`, the tyre
plate, `#minimap`, `#hud-sectors`, `#hud-limits`, `#announce`, `#bc-tower`, the PiP label and the damage chip.
Moving them onto `--hud-strip-bg` takes the tree's `rawColor` from 334 to 322. A topic branch cannot lower that
slack-0 ceiling until #4305 (the fix for #4257) lands, so the swap is staged in
`scratch/design-3a/hud.full.css` and follows in this PR. When it lands, `scale-defaults.test.mjs`'s PANEL
OPACITY pin moves from the per-plate literals to the token. Three stay as they are: the OT / AERO idle plate
(a signal, outside PANEL OPACITY), the caption strip (its own CAPTION BACKGROUND setting) and the PiP frame
outline.

## 2. The middle of the road — pick A
| variant | what | px moved vs the same frame (announce / rel / strat / inputs), Bryce day · chase HUD 100 |
|---|---|---|
| **A keyline** | strip plate, neutral 3 px `--plate-line` keyline, hairline row rules, card outlined in `--plate-line` | 10.7 / 50.2 / 25.0 / 22.1 · 14.7 / 6.6 / 3.1 / 0.8 |
| B top stripe | strip plate, the team `--accent` on top of each card (as the cluster) | 10.6 / 41.3 / 70.8 / 30.3 · 14.3 / 39.9 / 22.4 / 14.1 |
| C labelled | strip plate, a RELATIVE / STRATEGY caption row with a rule under it | 14.6 / 74.3 / 45.8 / 20.6 · 19.6 / 69.9 / 60.9 / 0.4 |

**A wins.** It changes no geometry, so the fit and every pinned anchor stay. The team colour stays on exactly
three surfaces (POS, the cluster's top, the radio number), as 2a decided. B's 2 px of top padding pushed the
column fit into compacting STRATEGY to one row at HUD 155, and it would add three `--accent` reads to
ACCENT_DECOR. C's caption row cost RELATIVE a car at HUD 155 (three rows down to two). The INPUTS keyline is an
inset shadow, not a border, so the trace keeps its width.

RELATIVE / STRATEGY / INPUTS used `--plate-opaque`, a MENU token that turns light under the LIGHT theme. Their
plate is now `--hud-strip-bg`, which is fixed like every other HUD plate. `nontext-contrast.test.mjs` resolves
the token: it sees `hud.css`'s `:root`, and an sRGB mix with `transparent` scales the alpha. Its LIGHT
anti-vacuity row for RELATIVE is retired, because no theme can lighten that plate any more.

## Not done (optional)
- OT label on its touch disc (the Codex race-interface lane's file), one-decimal on-track gap
  (`hud-gap-decimals.test.mjs` pins today's adaptive decimals), portrait phone check: not reached.
