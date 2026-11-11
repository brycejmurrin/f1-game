# Design pass #2a — race HUD visual language at 844x390 — 2026-10-30

Lane 2a of design pass #2 (#4238, PR #4245). Question: does the in-race HUD read like a premium F1
broadcast/game HUD on Bryce's phone (844x390 landscape, touch, TLX)? Pass #1's method and research:
`DESIGN-PASS-1-2026-10-30.md`. Living gallery (same URL each round):
https://claude.ai/artifact/FjoUgW8Aj5uYWocTuThr88

## Method
- Baseline: `hud-survey.mjs --matrix scratch/design-2a/matrix.json`, 5 cells at 844x390 with button steering:
  Bryce's cell from `tests/data/settings-defaults-export.json` (HELMET/visor, HUD 155, BUTTON 245, text large)
  by day and night, and chase at HUD 100 / 150 by day plus HUD 100 by night. **0 findings** before and after:
  the HUD is collision-clean, so this pass is about the picture.
- Variants: CSS injected into a live race, 844x390 at 2x, GLX backend (the survey's TLX shots on SwiftShader
  come back with a black scene: no `#game-soft` to read, `lit -1`), `scratch/design-2a/capture.mjs`. Pixel
  diff over each element's crop = pixels whose RGB moves more than 48 against the live build.
- The hud-survey's own shots are at DPR 1 and its TLX frame is black here; for contrast over a real scene use
  the GLX capture.

## Scorecard (844x390, before)
1 = poor, 5 = premium.

| element | hierarchy | consistency | contrast | type | worst problem |
|---|---|---|---|---|---|
| timing tower | 2 | 2 | 4 | 4 | four plates, four team stripes, POS weighs the same as LAP |
| instrument cluster | 2 | 2 | 4 | 3 | five plates of three styles; speed smaller than gear; the empty tach reads as a loading bar |
| sectors, gaps, flag | 4 | 3 | 4 | 4 | — (ledger F re-checked, clear) |
| mid-screen cards (coach, strategy, relative) | 3 | 2 | 4 | 4 | deferred: three card styles in the middle of the road (below) |
| touch buttons | 4 | 4 | 3 | 4 | OT idle label grey on a translucent grey disc (by design: unavailable on lap 1) |

## Decisions (Bryce delegates open decisions — recorded here)
- **Timing tower: fused strip + hero POS** (B + A). One plate, hairline dividers (`--plate-line`), the team
  stripe once, on POS; POS is the one light cell (`--hud-ink-light` with `--hud-ink-dark` ink, 18.1:1).
  A rank change keeps its `--faster` / `--slower` hue (pinned by `hud-feel`) on a dark pill for its 600 ms
  flash, because those inks do not read on the light cell. Broadcast keeps its own tower (it was already
  fused). Rivals: A alone (light POS, four plates) fixed hierarchy but kept the clutter; B alone was clean but
  flat; C (ribbon, label beside value) was 18 px shorter but 119 px wider and ran into the map at 844.
- **Instrument cluster: one plate + speed hero** (A + B), landscape phones only. One plate holds gear, speed,
  ERS and the OT / AERO chips with the team stripe on top; speed 40 px upright (was 28 italic), gear 34 px
  (was 48) over a 54 px tach (was 96). A player-placed gear or speed (`data-hl-user`) keeps its own plate.
  The chips keep their idle keylines: those carry the button's hue (OT yellow, AERO blue). Rival C (tach rail
  across the cluster) lost: an empty rail reads as a loading bar.
- **Plates via tokens, not literals:** both plates are `--look-hud-bg` scaled by PANEL OPACITY
  (`--hud-strip-bg`), so HIGH CONTRAST turns them solid with no rule of its own, and the tree's raw-colour
  and raw-spacing ratchets did not move.
- **`--accent` stays ornament:** the two new reads (the POS stripe, the cluster's top stripe) are listed in
  `tests/unit/nontext-contrast.test.mjs` ACCENT_DECOR; neither carries state.
- **Ledger F (`#hud-flag` vs the dropped `.hud-gaps` at HUD ≥ 150 %): closed, no change.** Measured live in
  Bryce's cell with a yellow flag forced: flag top 109, gap strip bottom 93 — 16 px clear, before and after.

## Measured, before → after (CSS px at 844x390)
| cell | box | before | after |
|---|---|---|---|
| chase, HUD 100 | `.hud-top` | 376×50 | 367×50 |
| chase, HUD 100 | `.hud-bottom` | 243×100 | 225×107 |
| Bryce (HUD 155, BUTTON 245) | `.hud-top` | 432×59 | 423×59 |
| Bryce | `.hud-bottom` | 176×75 | 170×86 |
Pixel diff of the picks against the live build: tower 23.4 % day / 15.4 % night, cluster 15.8 % / 14.3 %.

## Deferred findings
- The middle of the road carries three card styles at once (coach radio card with a yellow number plate,
  the strategy card, the relative strip) plus the delta trace; a later pass should give them the strip's
  plate and hairlines.
- OT idle label on its disc is low contrast (by design while OT is unavailable); worth an APCA check on the
  real frame next pass.

## Against the pass-2 research note (`UI-DESIGN-RESEARCH-2026-10-30.md`, relayed by the parent)
- Tabular digits: every HUD figure already sets `font-variant-numeric: tabular-nums`, and `css/fonts-hud.css`
  pins the digit advances; the new speed size keeps both.
- Red and dim as TEXT on the HUD (APCA Lc 40 and 48 on `--bg`, under the Lc 60 / 75 bars): `--slower` inks the
  POS loss flash (now on the dark pill), the slow DELTA, `#hud-limits.limits-hot` and the hot tyre letter;
  `--dim` inks the idle OT / AERO chips. Not changed here (tokens are lane 2d's); proposal below.
- Gaps: the on-track readout keeps its adaptive decimals (`gapDecimals`, EMA-smoothed); a one-decimal glance
  readout is a fair follow-up but changes a pinned behaviour (`hud-gap-decimals.test.mjs`), so not in this pass.
- Toggles: `HudElements` already switches 18 readouts (POS, LAP, TIME, BEST, DELTA, sectors, speed, gear, energy,
  tyre, OT, aero, BB, limits, damage, relative, strategy, inputs).

## Token proposals for lane 2d (`css/tokens.css` is theirs)
- Promote `--hud-strip-bg` (`color-mix(in srgb, var(--look-hud-bg) calc(100% * var(--hud-panel-a-eff)), transparent)`)
  to `tokens.css` as the HUD's one panel token; `.hud-box`, `#hud-sectors`, `#hud-limits`, `#hud-gearbox` and
  `.hud-gaps` still each spell their own `rgb(8 8 14 / calc(0.9x * …))`.
- A `--hud-divider` alias for `--plate-line` inside the HUD scope, so a hairline means one thing (or 2d's
  `--hairline` once #4244 lands, if its 8 % reads on the HUD plate).
- A HUD-scope `--slower-ink` lifted to Lc ≥ 60 on the HUD plate for red-as-text (POS loss, slow DELTA, limits),
  keeping `--slower` for fills; and the idle chips' `--dim` raised to the same floor.

## Research
Reused from pass #1 (timing colours, contrast and target-size criteria, APCA). No new sources this lane.
