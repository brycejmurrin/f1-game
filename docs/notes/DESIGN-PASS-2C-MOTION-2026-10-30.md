# Design pass 2c — motion, the first 30 seconds, title and loading (2026-10-30)

Lane 2c of design pass #2 (#4240; pass #1 is `DESIGN-PASS-1-2026-10-30.md`). Bryce's cell: iPhone landscape
844x390, touch, TLX/WebGPU. Question: what does a new player see in the first 30 s on the live site with 4G
throttling, and do the screen transitions feel premium? Living gallery: see the PR body.

## Method
- **Live, cold:** chrome-devtools MCP, isolated context (no cache, no service worker), `Slow 4G` + 4x CPU,
  844x390x2 mobile/touch. A performance trace recorded through the navigation; its `Screenshot` events are the
  filmstrip (`scratch/design-pass-2c/trace-frames.py`). Live was `apex-sha 6ce8a0bf` (before #4213).
- **Tip, local:** `scratch/design-pass-2c/filmstrip.mjs` — Playwright screencast, CDP throttle 150 ms RTT, 4x CPU.
  The static server sends no gzip (5.7 MB for what Pages ships as 608 KB), so the bandwidth is raised to 15 Mbps
  to keep the transfer TIME of live Slow 4G; with 1.6 Mbps the title did not even finish booting in 30 s.
- **Pre-boot variants:** `scratch/design-pass-2c/variants.mjs` holds `js/game.js` (a route that never answers), so
  the page stays in the state a 4G player sees for ~12 s, then injects each variant's CSS. Pixel diff = pixels
  whose RGB moves more than 48, at 2x.
- **Motion inventory:** an `Explore` agent read every transition / animation on the five paths and the reduced
  motion backstops (findings below).

## First 30 s, live (cold, Slow 4G, 4x CPU)
| t | what the player sees |
|---|---|
| 0 – 2.4 s | the browser's white page (HTML + blocking CSS in flight) |
| 2.4 s | FCP: dark ground, one stray icon top-left |
| 2.6 – 3.0 s | wordmark, line-art car and doors stagger in (intro); LCP 2.99 s (`#title`) |
| 3 – 13.6 s | **the doors look ready and are dead** — every handler is wired by `js/game.js`, a `defer` script |
| 13.6 s | **the grid reshuffles**: `TitleMenu.organize()` regroups the doors and adds VISUAL STUDIO, SAVES & DATA, USE AS CONTROLLER |
| 14.2 s / 15.6 s | DOMContentLoaded / load |
| ~17.5 s | the home backdrop swaps from the line-art car to a photo |
| ~20 s (tip) | the iOS "Add to Home Screen" tip lands over the disclaimer |

Tip (with #4213) is the same story: doors at 2.5 s, `organized` at 14.8 s.

## Worst moment and the variants
Eleven seconds of buttons that look live and do nothing, ended by the whole menu moving under the thumb.
- **Shipped after the static fix:** the shell now carries organize()'s end state, so the grid never moves.
- **A — dimmed doors + progress rule (PICK).** Until `html[data-booted]` the doors sit at 40 %, greyscale and
  inert; the wordmark's red rule fills with `--boot-p`, the share of script tags downloaded. Diff 9.1 %.
- **B — start lights.** Doors hidden behind five lights that fill with progress. Diff 12.7 %. Most F1, but it
  hides a readable menu for ~12 s and needs new drawing.
- **C — skeleton plates.** The final grid as empty shimmering plates. Diff 8.2 %. Hides labels the page already
  has: the opposite lie.

Why A: the player can read and plan the first tap, the wait is honest and determinate, and it costs ~330 B of
blocking CSS (paid for, below). The doors fade to full over `--dur-3` when they come alive.

## Decisions (Bryce delegates open decisions)
- **Static destinations.** `index.html` ships the five groups (`role=group` + `aria-label`), VISUAL STUDIO and
  SAVES & DATA; `organize()` keeps its build path for `repairDestinations()` and only wires the two shortcuts on a
  pre-organized shell. The five `h2.menu-destination-label` are not in the shell: they are `display: none`
  (menu-destinations.css), so they were never in the accessibility tree. USE AS CONTROLLER unhides on
  `(pointer: coarse)` inline — the same query as `Input.touchControlsNeeded()`.
- **Boot readiness.** `TitleMenu.create` sets `html[data-booted]`; game.js wires the door handlers in that same
  task. Progress: an inline `PerformanceObserver` counts `initiatorType === "script"` resource entries against
  `script[src]`, disconnecting at 100 %.
- **Disclaimer:** plate kept (it is what keeps it legible over the live home scene), visible hairline dropped —
  `border: 1px solid transparent`, so forced colours still draws an edge.
- **Motion tokens:** dialog `scrim-in` 0.16 s → `--dur-1`, `sheet-in` 0.19 s → `--dur-3` (a sheet entering is
  step 3 in tokens.css), loading card 0.4 s → `--dur-3`, its hint 0.6 s → `--dur-4`, the brand intro's private
  cubic-bezier → `--ease-out`.
- **Blocking CSS budget:** headroom 49 B → 912 B by tightening two title.css comments (the ASPECT note and the
  intro timeline), facts kept, so lanes 2a/2b/2d keep room under the 239,000 B ceiling.

## Motion inventory (Explore agent, path:line in the PR)
| path | motion |
|---|---|
| title → picker / garage / career | root View Transition 0.10 s out + 0.14 s in (tokens.css), **skipped on a coarse pointer** (`select-screen.js` `vt`), so on a phone it is a hard cut |
| garage → race | `#loading` phases; card fade `--dur-3` (was 0.4 s), letterbox, wipe 0.9 s; hide is instant |
| race → results | `.screen.dim` scrim + sheet (now tokens), rows `row-in` 0.22 s with an 18 ms stagger |
| reduced motion | OS backstop zeroes animation duration but not delays or transitions; the in-game backstop zeroes both durations, not delays |

## Proposals for other owners (not built: outside lane 2c)
- tokens.css (lane 2d): name the View Transition durations (`0.10s` / `0.14s` → `--dur-1`), and add
  `animation-delay: 0s` to the OS reduced-motion backstop — `.res-row`'s stagger still holds rows invisible for
  up to 216 ms after the duration is zeroed. The loading hint's 3 s delay is the one deliberate delay; exempt it.
- select-screen.js: the coarse-pointer View Transition skip makes every phone screen change a cut; a 120 ms
  opacity crossfade on the incoming `.screen` is cheap and reads as one product.
- The white first 2.4 s is network (HTML + ~239 KB blocking CSS); the stray icon at FCP is painted ~0.2 s before
  the title.
- The iOS install tip arriving at ~20 s over the disclaimer.

## Research (read 2026-10-30)
- web.dev, Optimize INP — input delay while scripts load; pages look ready before they work:
  https://web.dev/articles/optimize-inp
- Material progress indicators (determinate when completion is measurable):
  https://m2.material.io/go/design-progress-indicators
- Pass #1's WCAG / APCA / timing-colour sources stand (DESIGN-PASS-1-2026-10-30.md §Research).
