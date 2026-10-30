# Design pass #2a — race HUD visual language at 844x390 — 2026-10-30

Lane 2a of design pass #2 (#4238). Question: does the in-race HUD read like a premium F1 broadcast/game HUD on
Bryce's phone (844x390 landscape, touch, TLX)? Pass #1's method and research: `DESIGN-PASS-1-2026-10-30.md`.

## Method
- Baseline: `hud-survey.mjs --matrix scratch/design-2a/matrix.json` (5 cells at 844x390, buttons steering:
  Bryce's HELMET/visor profile at HUD 155 / BUTTON 245 / text large, day and night; chase at HUD 100 and 150,
  day and night). 0 geometric findings — the HUD is collision-clean, so this pass is about the picture.
- Variants: CSS injected into a live race (GLX backend so the 3D frame is in the capture), 844x390 at 2x,
  `scratch/design-2a/capture.mjs`; pixel diff over each element's crop = pixels whose RGB moves more than 48.

(in progress)
