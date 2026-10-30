# Design pass 3E — motion and feel (2026-10-30)

Lane E of design pass #3 (#4284; coordinator index `DESIGN-PASS-3-2026-10-30.md`). Bryce's cell: iPhone
landscape 844x390, touch, TLX/WebGPU. Question: do screen changes, presses and the results reveal feel like a
premium F1 game, and do Barlow Condensed numbers hold still? Builds on pass 2c (`DESIGN-PASS-2C-MOTION-2026-10-30.md`),
whose motion inventory stands; this lane does not redo it. Living gallery (republished each round, same URL): https://claude.ai/artifact/8fz3d4TpY9k6MBRrPY1CJk

## Method
- **Baseline before any edit:** `layout-audit.mjs --viewports=ios-iphone-landscape-844 --shots --dom` for
  title, select, garage, career, settings, season-setup (6 cells) and results, pause (2 cells): 0 findings.
  Kept as `artifacts/layout-audit/audit.before-3e.json` and `audit.before-3e-rp.json`.
- **Filmstrips:** `scratch/design-pass-3e/capture.mjs` (rebuilt from DESIGN-PASS-1 §Method) injects each
  variant's CSS live, then PAUSES and SEEKS every animation through the Web Animations API, so each frame lands
  at an exact millisecond even on SwiftShader. 844x390 @2x, `isMobile`, `hasTouch` (so `(pointer: coarse)`
  matches and `select-screen.js` skips the View Transition, as on the phone). Press states are held with CDP
  `CSS.forcePseudoState` and framed close-up. Pixel diff = pixels whose max RGB channel moves > 48, against
  the shipped (base) frame at the same time.
- **Tabular audit:** the same script walks every visible element whose computed font is Barlow and whose own
  text has a digit, on title, select, career, HUD, pause and results, and lists those not on `tabular-nums`.

## Findings (before)
| topic | what the phone shows | measured |
|---|---|---|
| press | tabs (garage ENGINE) and chips (picker ALL) look the same pressed and at rest; a secondary door's plate lightens one step, under the thumb | tab/chip pressed vs rest < 1 % of pixels; door 4.6 % |
| results | the sheet opens on the story + three podium tiles; the tiles arrive P1 first, 55 ms apart, from opacity 0.7, so the reveal does not read | — |
| transitions | title → picker is a hard cut on a coarse pointer (`select-screen.js` skips View Transitions there) | — |
| root View Transition | the LEAVING snapshot fades on `ease-out`, the ARRIVING one on `ease-in`: the reverse of decelerate-in / accelerate-out | `css/tokens.css` |
| numerals | one visible Barlow number not tabular in the live walk (`#res-winner`, "P1 RUS"); 26 `--font-hud` rules without `tabular-nums` (pit / work timers, limits, damage, plan stints, pit loss, podium) | live walk + stylesheet scan |

## Variants (filmstrips in the gallery; diff = max over frames vs shipped)
- **Results:** A countdown (P3 → P2 → P1, spring, 160 ms apart) 3.5 % · B rule-draw (top rule draws, text follows) 4.5 % · C slam (1.3x stamp, accelerating) 9.1 %. Diffs on the podium crop.
- **Press:** A sink (scale 0.96, darker) 7.1 % · B red edge (ring + base rule + red-tinted plate) 29.6 % · C white flash 42.4 %.
- **Transitions (data for #4283):** A 120 ms fade 33.5 % at 0 ms, 0 % by 40 ms · B 320 ms rise 29.2 / 18.7 / 12.2 / 3.7 % at 40 / 80 / 120 / 200 ms · C 320 ms wipe, black for 40 ms.

## Decisions (Bryce delegates open decisions)
- **Results: A, countdown.** It is the order a podium is called, so the winner lands last (~0.64 s) and the eye ends on P1. B left P1 and P2 as bare text (only a team-coloured tile has a rule to draw); C overflowed its tiles at 80–160 ms. `--dur-3` on `--ease-spring`, in place of the old rule in `css/career-experience.css`; off under both reduced-motion gates. RACE AGAIN is outside the tiles and was hit-testable at t = 0 in every variant.
- **Press: B, red edge.** The thumb covers the face it presses, so A's darkening is invisible exactly when it matters; C's white plate reads as the selected/focus state. The ring and base rule show around the thumb and use the brand red the doors already wear. In at once (`transition-duration: 0s`), out on each control's own 0.14 s fade. Applied to `.bigbtn.alt`, every `button[role="tab"]`, the chip family and the title's dark play doors (`menus.css`, whose ID rules outrank the shared one; they keep their red wash too); the red CAREER hero keeps its key-travel press. One token, `--press-lit`, in the MOTION block (step 1 there is press feedback). Re-captured after the build: chip and tab match the pick (chip 0.8 % from B). Sound: unchanged (the existing UI sound).
- **Transitions: not built here.** PR #4283 (issue #4275) was already building the touch screen-enter fade when this lane started; this lane sent it the filmstrip numbers above instead of a second rule.
- **Exit easing:** `--ease-in: cubic-bezier(0.55, 0, 1, 0.45)` in the MOTION block; first use is the root View Transition (old snapshot `--ease-in`, new `--ease-out`).
- **Numerals:** `body { font-variant-numeric: tabular-nums }` in `css/fonts-hud.css`, the sheet that ships Barlow. Inherited, so the 26 rules and every future `--font-hud` rule are tabular; Titillium's digits are already uniform (560 each), so menu text does not change. `.res-settle-v`'s deliberate `normal` still wins. Guarded in `tests/unit/font-digits.test.mjs`.
- **Placement:** the brief's "~50 B blocking headroom" was stale: the six title-critical sheets measured 216,248 B against the 239,000 B ceiling on tip 7c6d11c6. The press state still went into `components.css` on purpose (it owns the existing `:active` block for these chips, a press must exist at first paint, and a second file would add cross-file class coupling `component-inventory` tracks); the reveal and the tnum rule are in deferred sheets.

## Research (read 2026-10-30)
- Pass #1 / research note §3 rules 7 and 9 (state changes 100–200 ms, sheets 250–400 ms, decelerate in and accelerate out; press states visual and audible on iOS): `UI-DESIGN-RESEARCH-2026-10-30.md`.
- `font-variant-numeric` is inherited and `tabular-nums` selects the OpenType `tnum` feature:
  https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-numeric
- Not verified here: whether iOS Safari paints `:active` on every tapped control (the frames hold `:active`
  through CDP). A real-iPhone check of the press state is the open item for this lane.

## Verification (844x390, this container)
- `layout-audit --diff`: 0 new findings on title, select, garage, career, settings, season-setup, results, pause,
  and on the HUD / HUD-pause cells (before audited from a worktree at 7c6d11c6), so the wider tabular digits
  crowd nothing measured.
- Specs: `menu-baseline` 6/6 (no golden moved, nothing re-blessed); `ui-scale` 45/45.
- Unit: font-digits, css-tokens, css-critical-path, component-inventory, apca-timing, ui-journey-session /
  race / career.
- Not verified: a real iPhone painting `:active` on tap (frames hold it through CDP), and the TLX/WebGPU path
  (these are DOM/CSS changes; the scene renderer is untouched).
