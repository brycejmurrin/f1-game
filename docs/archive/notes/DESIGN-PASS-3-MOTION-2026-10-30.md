# Design pass 3 — motion and the first 30 s, round 3 (2026-10-30)

Follow-up to lane 2c (`DESIGN-PASS-2C-MOTION-2026-10-30.md`, PR #4254). Issue #4275, PR #4283. Bryce's cell:
iPhone landscape 844x390, touch, TLX/WebGPU. Living gallery (round 3 section):
https://claude.ai/artifact/9t4BfcNew9SmWdWNGZvVyb

## Method
- **Live, cold:** Playwright + CDP against github.io (`apex-sha 8714fe18`), 150 ms RTT, 1.6 Mbps down,
  750 kbps up — LIGHTER than DevTools' own Slow 4G (562.5 ms, 1.44 Mbps, 675 kbps: `Slow4GConditions` in the
  DevTools frontend bundled with chrome-devtools-mcp), so a real Slow 4G load is later still — 4x CPU, cache off, service workers blocked, iPhone UA, 844x390x1 touch;
  a JPEG every ~0.5 s for 30 s. Not a chrome-devtools trace (the 2c recipe was not in the tree); same throttle,
  frame cadence coarser.
- **Variants, local:** stills at 844x390x2 touch after `html[data-booted]`; the 3D canvases are hidden so a capture
  takes seconds on SwiftShader (a garage capture with the 3D running took ~30 s per frame). An enter animation is
  paused with the Web Animations API at a fixed time. Diff = share of pixels whose largest RGB channel moves more
  than 8 (and 48) against the base frame.

## First 30 s, live today
| t | what the player sees |
|---|---|
| 0.8 s | dark ground and a lone eye icon top-left (`#hud-restore`, unstyled until deferred `touch-controls.css`) |
| 2.7 s | wordmark, line-art car, doors at 40 % grey; the boot rule fills under the wordmark |
| 2.7 – 22 s | doors dimmed and inert — and see-through: the line-art car crosses PHOTO STUDIO and SETTINGS |
| ~19 s | the eye icon goes (its sheet arrived) |
| ~22 s | boot: doors come alive in place (no reshuffle — 2c's static fix holds) |
| ~24 s | the iOS install tip lands on the disclaimer |

The home-backdrop swap 2c saw at ~17.5 s did not happen within 30 s: with this throttle boot itself is at ~22 s.

## Worst moments, variants, picks
| moment | A | B | C | pick, why |
|---|---|---|---|---|
| phone screen change is a hard cut | opacity 120 ms (9.0 % / 1.5 % at 20 ms, ease-out) | fade + 12 px rise 320 ms (13.6 / 3.8) | slide from right + fade 320 ms (10.8 / 3.9) | **A**: nothing under the thumb moves; B and C move tap targets for a third of a second |
| garage sheet empty ~1.3 s | static ghosts of the compact layout (32.7 / 0.0) | same, pulsing (0.0 at trough) | "PREPARING YOUR CAR" plate (0.7 / 0.3) | **A**: shows the structure where it will land; a wait is not motion |
| pre-boot doors see-through | today, opacity .4 | filter grayscale + brightness .45 (38.2 / 2.2 vs today) | brightness .6 + contrast .7 (40.8 / 1.4) | **B**: plates stay solid, labels stay readable for planning the first tap |
| install tip over the disclaimer | dock at the column foot (11.8 / 5.7) | hide the disclaimer while it shows (2.2 / 0.4) | top-right (18.3 / 5.0) | **A**: over the backdrop only, points at Share; B drops the legal line, C covers CAREER MODES |

## Shipped (PR #4283)
- **Reduced motion.** `tokens.css`'s OS backstop zeroes `animation-delay`; the loading hint pins
  `animation-delay: 3s !important` in its `overlays` layer — a layered important outranks the unlayered backstop
  and the later `layout` layer, so the wait survives both gates. `responsive.css`'s `data-motion` backstop zeroes
  delays too. `tokens.css` was not edited.
- **Touch enter** (`experience.css`): `body:not(.desktop) .screen:not(.dim, #loading)` gets `screen-in`
  (opacity, `--dur-1`, LINEAR), gated on both reduce settings. Linear because lane 3E's filmstrip (#4299)
  measured the ease-out version at 0 % diff by 40 ms: it read as the cut it replaces. Deferred sheet: no screen change happens before it loads.
- **Garage skeleton** (`experience.css`): `#carsetup[aria-busy="true"] #cs-options:empty` PAINTS ghost chips and
  rows (theme ink at 7 %); `aria-busy` is set and cleared by `SetupUI.openSetup` (js/garage/setup-sheet.js), so no
  JS change. Paint only: the first cut gave the empty panes a `min-height`, the sheet's shape pass measured it and
  the portrait tab strip stopped scrolling (`ui-button-touch.spec`, 3/3 red; deploy tip 4/4 green; paint-only
  green 5/5). `--panel` was too faint on the plate (0 % diff), and `#cs-body` is `display: contents` once the
  title prebuild has set compact density.
- **Pre-boot doors** (`title.css`): filter-only dim; the transition is `filter` alone (fewer blocking bytes).
- **Stray icon** (`responsive.css`, blocking): `body:not(.hud-hidden) #hud-restore { display: none }`.
- **Install tip** (`experience.css`): on the landscape title `#ios-install` docks at `bottom: var(--safe-b)`.
- **Backdrop swap** (`experience.css`): `#title-car` fades its opacity over `--dur-4`, both reduce gates off.

## Not done
- **Race → results black frame:** unconfirmed on a real GPU. `gpu-census.yml` has no results leg, and a
  SwiftShader frame is late anyway; fixing it blind could mask a real TLX present gap. Needs a census leg or a
  device check.
- **Proposal for tokens.css (parent):** name the View Transition `0.10s` / `0.14s` as tokens, and note in the OS
  backstop that the loading hint is the one exempt delay (it is now pinned at its own rule).

## Sources
- MDN, cascade layers and `!important` (layered important beats unlayered important):
  https://developer.mozilla.org/en-US/docs/Web/CSS/@layer
- NN/g, skeleton screens (show the layout while content loads; avoid motion where it adds nothing):
  https://www.nngroup.com/articles/skeleton-screens/
