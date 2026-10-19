# LIVERY `#cs-options` vs `#cs-body` — NOT-A-BUG (issue #2950)

Measured 2026-10-19 on the working tree at the deploy tip, touch profile
(`hasTouch`, `isMobile`), garage → LIVERY tab, by
`tests/specs/garage-livery-fit.spec.js` (kept as a regression guard).

| viewport | `#cs-body` box (l,t,r,b) | `#cs-options` box | body display | x-overflow (scrollW−clientW) | descendants past options l/r edge |
|---|---|---|---|---|---|
| 390×844 portrait | 13,240,377,585 | 37,311,353,573 | flex, overflow hidden | 0 | none |
| 844×390 landscape | none (`display: contents`) | 379,188,835,381 | contents | 0 | none |

- Portrait: the options box lies fully inside the body box (24 px inset left/right,
  71 px below the body top, 12 px above its bottom). Nothing is clipped.
- Landscape: `#cs-body` has no box of its own (`display: contents`, css/carsetup.css:372),
  so it cannot clip; the earlier 5 px `scrollWidth` overshoot (UI-LANE-A A4, UI-LANE-B B3)
  does not reproduce on this tree (0 px).
- `scrollY` is 4270 / 2773 px by design: `#cs-options` is the dominant vertical scroller.

The report that raised #2950 most likely came from the menu-mock "clipped" heuristic
flagging an intended scroll container. No CSS change.
