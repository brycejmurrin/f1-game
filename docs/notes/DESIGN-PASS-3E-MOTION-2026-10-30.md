# Design pass 3E — motion and feel (2026-10-30)

Lane E of design pass #3 (#4284; coordinator index `DESIGN-PASS-3-2026-10-30.md`). Bryce's cell: iPhone
landscape 844x390, touch, TLX/WebGPU. Question: do screen changes, presses and the results reveal feel like a
premium F1 game, and do Barlow Condensed numbers hold still? Builds on pass 2c (`DESIGN-PASS-2C-MOTION-2026-10-30.md`),
whose motion inventory stands; this lane does not redo it. Living gallery: see the PR body.

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

(Findings, decisions and research follow as the lane progresses.)
