# HUD text writes re-ran root `:has()` every frame (perf P2, 2026-10-18)

Lane: perf worker P2. Full round log: the P2 note in PR #2804.

**Evidence.** Phone shape (852x393 touch, GLX, `race("monaco")`, `go()`, `headless(true)`, full throttle), DevTools
trace with `disabled-by-default-devtools.timeline.invalidationTracking`: about 175 `:has()` invalidations a second each
on `<html>` and `<body>`, ~3 a frame. The stack: `hText` (`js/ui/hud.js`) → `paintInstruments` → `updateHud`, i.e.
`el.textContent = v` on the speed digits every frame.

**Cause.** `textContent = v` removes the old text node and inserts a new one, so the element passes through `:empty`
and Blink re-checks the `:has()` rules up to the root. A one-page CSSOM bisect (rules deleted cumulatively, 4 s
windows): style recalc 2.84 ms/frame and 195 root invalidations/s with every rule; 1.56 and 82 without the 12 `:empty`
rules; 0.25 and 0 without any `:has()`. A document-wide `childList` MutationObserver (`js/ui/sheet-shape.js`) also
received every swap.

**Fix.** `hText` writes `firstChild.data = v` when the element holds exactly one text node: a character-data change,
no child-list mutation, same text and accessible name. The first write, an empty string and a non-string fall back to
`textContent`. `#hud` is `aria-live="off"`, and `js/ui/aria-state.js` already observes `characterData`.

**Measured** (`scratch/p2/trace.mjs`, 12 s window, interleaved base/new; `hud.js` swapped by `page.route`):

| arm | style recalc ms/frame | JS ms/frame | style + JS | fps |
|---|---|---|---|---|
| base | 1.64, 1.64, 1.60 | 2.06, 1.95, 2.11 | 3.70, 3.59, 3.71 | 55.6, 56.4, 54.4 |
| data write | 0.99, 1.03, 1.02 | 2.18, 2.22, 2.34 | 3.17, 3.25, 3.36 | 55.6, 55.5, 51.9 |

One pair with invalidation tracking on (6 s): root `:has()` invalidations 180 → 48 a second on `<html>`, 179 → 47 on
`<body>`, body ":has()" restyles 90 → 23, text-node insertions 31 → 0. What is left is the `fitHud` root-variable
writes (#2797) and the 10 Hz writers outside `hText` (`hud-relative.js`, `hud-strategy.js`), which still assign
`textContent`.

Pinned by `tests/specs/smoke.spec.js` "speed readout updates after jump() at speed": the text node is reused, the
digits change, and the accessibility tree reads the new value.
