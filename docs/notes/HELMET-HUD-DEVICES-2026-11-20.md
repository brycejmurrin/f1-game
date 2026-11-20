# Helmet cam HUD on Bryce's devices (2026-11-20)

Kind: plan + survey · Re-measure-by: 2027-01-20

Ask (Bryce, 2026-11-20): make the race HUD under the helmet camera look good on his two real devices, with
before/after screenshots. The devices come from `tests/data/phone-windows.json` (#5977 adds them as presets):

| Cell | CSS px | DPR | Insets | hud-survey `--device` |
| --- | --- | --- | --- | --- |
| iPhone 15, Home Screen app (where he plays) | 852 × 393 | 3 | L59 R59 B21 | `ios-iphone-landscape` (shipped) / `bryce-852x393` (his export) |
| iPhone 15, Safari tab | 852 × 368 | 3 | same, assumed | `ios-iphone-landscape-safari` / `bryce-852x368` |
| MacBook Pro 16″ (2024, M4), full display | 1728 × 1117 | 2 | none | `desktop-macbook-pro-16-m4` |

844 × 390 is not his phone; existing specs pin it and it must not break.

## Survey method

`node tools/shot/hud-survey.mjs --cam helmet --device <cell>`, one cell at a time. His profile uses the new
`--as-seeded` flag with `--settings tests/data/settings-live-export-2026-11-10.json`. Without that flag every
cell resets HUD style, sizes, element toggles and MOVE & SIZE, which wiped his own helmet layout (speed, gear
and ERS off; sectors, tyres, gaps and others placed). The earlier "his profile" cells were therefore not his
HUD. BEFORE shots come from a worktree at the base tip (`2b9d91ce`) carrying only the two tool files.

## Findings (before)

1. MacBook: the HUD paints at its 1280 × 720 size (14 px text). The desktop helmet strip offsets are a share
   of the screen, so GEAR, SPEED, ERS, TYRES, BB and the OT and AERO chips sit far apart.
2. His phone layout: S1–S3 (placed) paints at x 789–839 under the 59 px right notch, because placed chips
   skipped every bound, safe-area included (`HudLayout.fit`).
3. His phone layout: TYRES overlaps the left steer button (by 4–9 px), and the gap chip overlaps POS by 10 px.
   On the Safari tab the COACH radio card also covers TYRES. All of these are his own placements.
4. Shipped phone layout: no overlaps and nothing in the insets. The opt-in RELATIVE and STRATEGY panels crowd
   the middle of the 368 px Safari tab.
5. The contrast checker reads the RELATIVE "you" row at 2.77:1 because it measures the tint without the plate.

## Fixes

- `css/tokens.css` and `js/ui/scale.js`: a big desktop (fine pointer, viewport ≥ 1600 × 960) ships HUD SIZE
  125 %. The CSS block owns first paint and `BIG_HUD_MQ` / `BIG_HUD_DEFAULT` mirror it; a stored size wins.
  `tests/unit/scale-defaults.test.mjs` pins the pair.
- `js/ui/hud-layout.js` `fit()`: a placed chip keeps the player's position and spacing, but is clamped out of
  the hardware safe-area insets (no extra margin). Overlaps between chips stay the player's choice.
- Bryce's calls (D-037, 2026-11-20 ~10:02Z): both fixes above, as made. The further step, nudging placed chips
  off tap targets and other readouts, is declined: those overlaps in his layout stay his to move. The broader
  paint-time clamp of #5155 stays reverted (#5165).

## Round 2 → 3 (D-038)

Round 2 showed two leftovers. First, the clamp pulled his S1–S3 out of the notch and onto PAUSE (852 × 393:
40 × 16 px; MacBook: under PAUSE and HELMET). Second, at 125 % the desktop helmet strip was readable but still
scattered. Bryce picked both fixes (D-038, ~10:32Z):

- `fit()`: a block the clamp moved steps down past `#pausebtn`, `#btn-cam` or a `.touchbtn` it now covers. A
  chip the clamp did not move keeps its spot, so the general nudge he declined stays off.
- `HELMET_STRIP`: GEAR and SPEED take the ENERGY / TYRES offset (-30, -4), so `.hud-bottom`'s column (GEAR,
  SPEED, ERS, TYRES) moves as one stack left of the wheel. At 1280 the column is about 123–388 against a wheel
  edge near 431; at 1728 at 125 % it is about 181–511 against 540.

Gallery: the living Artifact linked from the PR, republished each round.
