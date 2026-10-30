# Design pass #1 — 2026-10-30

Quality pass (not a defect hunt) on Bryce's cell, iPhone 13 landscape 844x390 touch. Question: does Apex 26
look and feel like a premium F1 game on a phone? Living gallery (republished each round, same URL):
https://claude.ai/artifact/SWhq5d3Ff4qkkQ6aJhkJsM

## Method
- Prior art: `prior-art-scout` (pause L1 deferred in `UI-HUNT-2026-10-29.md:28`; ledger items D and H at
  `DEFECT-LEDGER.md:1825,1829`). Token and component map by an `Explore` agent; web research by
  `deploy-research` (URLs below).
- Audit: `layout-audit.mjs --viewports=ios-iphone-landscape-844 --screens='*' --shots --dom` (61 cells, 53
  measured, 8 skipped by harness timeouts: customize, five Data Hub tabs, datatelemetry, photocontrols).
  Baseline kept as `artifacts/layout-audit/audit.before.json`.
- Token census: a script over `css/` counting raw colour, px and font-size literals against `var(--x)`.
- Variants: CSS (and for two results variants, JS) injected into the live page after the screen opens, shot
  at 844x390 at 2x (`scratch/design-pass/capture.mjs`). Pixel diff = pixels whose RGB moves more than 48.

## Scorecard (844x390, before)
1 = poor, 5 = premium. Contrast is measured where a number is given.

| screen | hierarchy | density | consistency | contrast | type | touch | copy | worst problem |
|---|---|---|---|---|---|---|---|---|
| title | 3 | 3 | 2 | 4 | 4 | 3 | 3 | 4+2 play grid leaves two empty cells; utility row 35 px; disclaimer drawn as a button-shaped plate |
| circuit picker | 4 | 4 | 4 | 4 | 4 | 4 | 4 | — (flag strip and preview read well) |
| garage | 4 | 3 | 4 | 4 | 4 | 4 | 4 | tab strip crowded; 1 tapSoft |
| career hub | 3 | 3 | 2 | 3 | 3 | 4 | 3 | Title Case tabs beside ALL CAPS chrome everywhere else; brand red used as header text |
| settings | 4 | 3 | 4 | 4 | 4 | 4 | 4 | — |
| pause | 2 | 2 | 3 | 4 | 4 | 3 | 3 | 54 % of the width used, PAUSED said twice, QUIT below the fold (y 500 in 390) |
| results | 2 | 2 | 3 | 4 | 4 | 4 | 3 | lands on your row with the podium scrolled away; every row doubled by a TYRE STINTS line |
| loading | 4 | 4 | 4 | 4 | 4 | n/a | 4 | — |
| HUD language | 4 | 4 | 3 | 4 | 4 | 4 | 4 | PB green and your-row lime 8° of hue apart; three unsynchronised pulses |

## Token census (before)
Raw colour literals 323 (123 hex, 200 rgb/hsl) against 5,265 `var()` uses: ~94 % adoption. Raw `font-size`
literals 68. Every `tokens.css` token is used somewhere. Literals that duplicate a token's value: `#fff` 32
(the HUD ink), `#f6d200` 2, `#aeea00` 2, `rgba(8,8,14,.78)` 2. The worst files by raw colour are `hud.css`
(72), `carsetup.css` (59), `data.css` (48), `touch-controls.css` (46).

## Decisions (Bryce delegates open decisions — recorded here)
- **Pause: A, split card.** All doors on screen with no scroll; RESUME a tall slab with QUIT under it. B
  (bottom dock) wrapped every label; C (side rail) still scrolled and duplicates the SIDEBAR layout.
- **Results: A, pinned podium.** P1–P3 stick, your row sticks under them, each driver one line. CSS only.
  B (ticker) is a caption, not a podium; C (split panes) squeezed names to three lines at 844.
- **Title: A, even lattice.** CAREER + DAILY share the hero row, six play doors on a 3-up grid, every door
  52 px, disclaimer a footnote. B clipped PRACTICE; C fell off the screen.
- **PB green vs your-row lime:** `--faster` moves from `#a3e635` (hue 83°) to `#5fe88a` (hue 139°, APCA Lc
  77.4 on `--bg`), 64° from `--you` `#aeea00`. Colour-vision palettes already separated them.
- **One blink clock:** every HUD `pulse` animation is aligned to the document timeline, so the 0.8 s pulses
  share a phase and the 0.4 s redline is their harmonic.

## Research (read 2026-10-30)
- Timing colours (purple session best, green personal best, yellow slower):
  https://www.formulaonehistory.com/purple-sector-in-f1/
- Formula1 Display is proprietary; open substitutes (Saira, Orbitron, Michroma): https://madegooddesigns.com/formula-1-font/
  The game keeps Titillium Web + Barlow Condensed (OFL, already shipped).
- WCAG 2.2 contrast minimum https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html, non-text
  contrast https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html, target size
  https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html, three flashes
  https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html, pause/stop/hide
  https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html
- APCA: https://github.com/Myndex/apca-w3 (the Lc numbers here come from `tests/unit/apca-timing.test.mjs`'s
  APCA 0.1.9 implementation).
- Material 3 tone-based surfaces: https://material.io/blog/tone-based-surface-color-m3
- Not reachable from this container (title-only fetches): m3.material.io motion pages, Apple HIG motion.
