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
- **Title: A, even lattice.** CAREER + DAILY share the hero row, six play doors on a 3-up grid, the utility
  row at the comfort floor. B clipped PRACTICE; C fell off the screen.
  - Built as three in-place value changes in `css/menu-destinations.css`, because the blocking set had 20 B of
    headroom (238,980 of 239,000 in `css-critical-path.test.mjs`): the 844 grid's `auto-fit` → `repeat(3, …)`,
    the compact hero stacks only while CONTINUE shows (`:has(#mb-continue:not([hidden]))`, otherwise a row),
    and the utility doors' `min-height: 32px` → `40px` (44 painted). 48px was tried first: with CONTINUE
    showing it overran `ui-scale.spec.js`'s 328px no-scroll budget at 852x393 (336), and the side-by-side
    hero squeezed CONTINUE's label out of its cell at 667x320. Blocking set after: 238,951 B. Title soft
    taps (under the 52px comfort floor) stay at 7, but none is under 44 painted px now (the utility row was
    35). The fixed three tracks drop the "fewer columns for enlarged text"
    behaviour: six doors divide evenly only by 3 or 2, and no single minimum gives both across 700–932 px
    widths, so enlarged labels wrap inside their tile instead.
  - Not built: the disclaimer as a footnote. Its plate is what keeps it legible over the live home scene
    (`css/experience.css` `#overlay[data-home-scene]`). Proposal for a later pass: drop only its border so
    it stops reading as a button.
- **PB green vs your-row lime:** `--faster` moves from `#a3e635` (hue 83°) to `#5fe88a` (hue 139°, APCA Lc
  77.4 on `--bg`), 64° from `--you` `#aeea00`. Colour-vision palettes already separated them.
- **One blink clock:** every HUD `pulse` animation is aligned to the document timeline, so the 0.8 s pulses
  share a phase and the 0.4 s redline is their harmonic (`js/ui/hud.js` `syncPulse`, one capture-phase
  `animationstart` listener). Measured live: two pulses started 330 ms apart both read phase 537.8 ms.
- **Type floor:** the PLAYER tag on a human's results row was 0.62rem (9.9 px) at 75 % opacity, the one menu
  text under `--touch-label-floor`; now `--fs-micro` at full ink.
- **Copy:** the career hub's jump chips (Race brief, Calendar, …) were the one Title Case row in an all-caps
  UI; set in capitals by CSS so screen readers still read words.
- **Scope:** pause and results use `body[data-density="compact"][data-shape="wide"]` (the zoom-correct
  short-landscape answer from `js/ui/sheet-shape.js`), not an orientation + max-height query, which
  `ui-journey-race` / `ui-journey-career` forbid in those layers.

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

## Contrast, before → after
| ink | ground | WCAG 2 | APCA Lc |
|---|---|---|---|
| `--faster` #a3e635 → #5fe88a | `--bg` #0c0c14 | 12.92 → 12.42 | 79.6 → 77.4 |
| same | HUD plate over mid-grey (#2a2a2e) | 9.48 → 9.12 | — |
| hue gap to `--you` #aeea00 | — | 8° → 64° | — |
The timing family (purple 65.2, green 77.4, yellow 80.6) stays inside the 20 Lc band `apca-timing` pins.
The disclaimer at `--dim` would have measured APCA Lc 48.2 at 14 px (WCAG 7.0:1), under APCA's Lc 60 for
non-body text, which is a second reason it kept its ink.

## Deferred findings
- Career hub header prints "YOU · HAAS" in brand red as text (the HUD rules forbid red ink; the menu sheet
  does not yet).
- Title disclaimer reads like a button (above).
- 8 layout-audit cells were skipped by harness timeouts (customize, Data Hub tabs, photocontrols); unmeasured.
- Dev tuners (lighting, camera, flyby) keep 14–27 soft taps each; they are developer surfaces, out of scope.
