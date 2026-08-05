# `zoom` as a scaling mechanism — what it costs, measured

Research behind the UI SIZE / HUD SIZE sliders and the component restructure
(`docs/` plan, stages B0–B4). Everything below was **measured**, in Chromium
141 via the DevTools MCP against the real page, or cited to a vendor source.
Dated August 2026.

The short version: `zoom` is a legitimate, standardised mechanism and the right
retrofit for a UI that is 58 % raw px. It has **exactly two sharp edges**, both
found here, both now fixed or registered. Neither is a reason to abandon it —
but the second one is the strongest argument for eventually retiring it.

---

## 1. Which CSS units survive `zoom`

Measured on a purpose-built page: a 844×390 viewport, one subtree at
`zoom: 1.3`, one outside it, same declarations in both.

| declaration | inside `zoom: 1.3` | outside | verdict |
|---|---|---|---|
| `width: 340px` | 442.0px | 340px | **scales**, as intended (340 × 1.3) |
| `width: 5.2em` @13px | 87.9px | 67.6px | **scales**, as intended |
| `width: 78%` | 658.3px | 658.3px | **safe** — a share of an already-scaled parent |
| `width: 78vw` | **855.8px** | 658.3px | **OVERFLOWS** a 844px viewport |
| `height: 40svh` | 202.8px | 156px | same hazard as `vw` |

**Viewport units are the one unit family `zoom` gets wrong.** A viewport unit
resolves against the *unzoomed* viewport and is then multiplied by the zoom, so
`78vw` inside `zoom: 1.3` renders as `101.4vw`. Percentages, px and em are all
fine, because each is relative to something that has already been scaled.

This is not a Chromium quirk — it follows directly from `zoom` being a
multiplier on used values while `vw` is defined against the initial containing
block.

### What it cost here

`#menu-hero, #menu-primary, #menu-secondary { width: min(78vw, 340px) }` sits
inside `#menu-buttons`, which is `#overlay > *` and therefore zoomed. The `vw`
branch only wins when `78vw < 340px`, i.e. below a 436px-wide window — **portrait
and nothing else**. Measured on the title screen at 393×852:

| UI SIZE | CSS width | rendered | right edge (viewport 393) | horizontal overflow |
|---|---|---|---|---|
| 100 % | 306.5px | 306.5px | 349.8 | 0 |
| 115 % | 306.5px | 352.5px | 372.8 | 0 |
| **130 %** | 306.5px | 398.5px | **410.5** | **30px** |
| **150 %** | 306.5px | 459.8px | **471.8** | **91px** |

Note the CSS width never moves. That is why this does not read as a sizing bug
when you look at the stylesheet — the number you wrote is the number that is
computed, and the damage happens after.

**Fix:** `--vwz` / `--svhz` in `css/tokens.css` — `calc(1vw / var(--ui-scale))`.
`min(calc(78 * var(--vwz)), 340px)` renders at exactly 78vw at every setting,
while the px cap still scales. Verified after: rendered width pinned at 306.5px
and horizontal overflow 0 at 80/100/115/130/150 %, in both orientations.

Both tokens divide by `--ui-scale` because every viewport-unit site inside a
zoomed subtree today is in the **menu** layer. A HUD-layer one would need a
`--hud-scale` twin — add it then, not now.

### The general rule

> Inside `.sheet`, `#overlay > *`, a HUD cluster or `.dock`, a viewport unit
> must be divided by the scale that zooms it. Outside them, use the bare unit —
> it is correct and cheaper.

`css/hud.css` already did this by hand for the safe-area insets
(`var(--sat) / var(--hud-scale)`). Same correction, same reason; `--vwz` is the
generalisation.

---

## 2. `getBoundingClientRect()` inside a zoomed subtree — the Safari trap

WebKit returned **pre-zoom** rects from `getBoundingClientRect()` and
`getClientRects()` for thirteen years
([bug 77998](https://bugs.webkit.org/show_bug.cgi?id=77998), filed 2012). It was
fixed only in **Safari 26.4, May 2026**
([release notes](https://webkit.org/blog/17862/webkit-features-for-safari-26-4/)),
aligning with the CSS Viewport spec. Chrome and Firefox have always returned
scaled values.

**Nothing in this repo's test suite can see this** — every spec runs Chromium.

Registered as **A13** in `docs/ARCHITECTURE-REVIEW.md`. Two call sites mix a
rect from inside a zoomed subtree with a coordinate from outside one, and are
therefore wrong on pre-26.4 iOS **by default**, because `--ui-scale` ships at
1.15 on a coarse pointer:

- `js/data/telemetry.js:942` — `attachScrub()` maps `ev.clientX` (real viewport
  px) through a canvas rect taken inside `.sheet`.
- `js/game.js:5139` — the garage lens shift divides `#cs-inner`'s rect width by
  the **unzoomed** canvas's `clientWidth`.

**`element.currentCSSZoom` is the clean fix** and is available (measured: 1.3
reports `1.2999999523162842` — note the float, so compare with a tolerance,
never `=== 1`). It gives the accumulated zoom on an element, so a shared
"rect in viewport space" helper is a few lines:

```js
// A rect in REAL viewport pixels, whatever zoom is between here and the root.
// Chrome/Firefox already return these; Safari before 26.4 returns pre-zoom
// values, and this is what makes the two agree.
function viewportRect(el) {
  const z = el.currentCSSZoom || 1;
  const r = el.getBoundingClientRect();
  return needsScaling() ? new DOMRect(r.x * z, r.y * z, r.width * z, r.height * z) : r;
}
```

The awkward part is `needsScaling()` — you cannot branch on user-agent
sniffing responsibly, so **feature-detect once at boot**: put a known-size box
inside a known zoom off-screen, measure it, and cache whether this engine
scales. That probe is the actual work, which is why A13 is deferred rather than
patched twice.

---

## 3. `align-content: safe center`

Used to fix the title screen losing both ends when its content outgrew the
window (`#overlay`, `overflow: hidden` + `align-content: center`). A grid that
centres content it cannot fit pushes it past **both** edges, and the start edge
of a scroll container cannot be scrolled to.

Supported in all three engines today; Safari from 17.3. Ship it as the
progressive pair, because an unsupported `safe center` invalidates the whole
declaration and would fall back to `normal` (stretch), not to `center`:

```css
align-content: center;
align-content: safe center;
```

**Watch for re-declarations.** Two later blocks re-declared `align-content` for
`#overlay` (the landscape-phone branch in `menus.css`, the large-landscape one
in `responsive.css`) and silently took the bug back. One of them is the branch a
landscape phone actually takes, so without fixing it too the fix did nothing.

---

## 4. Is `zoom` still the right mechanism?

Yes, for now.

- **Standardised and Baseline.** Widely available since May 2024, being
  specified in CSS Viewport, supported on iOS Safari for a decade
  ([MDN](https://developer.mozilla.org/docs/Web/CSS/zoom)).
- **It is layout, not paint.** Unlike `transform: scale()`, hit-testing,
  scrolling and container queries all follow it. That is the whole reason it was
  chosen: it reaches 314 hard-coded px font-sizes that nothing else would.
- **Firefox needs 126+**; below that it parsed and discarded the property. Not a
  concern for this project's audience, but it is why a `transform` fallback
  would be needed if that changed.

Arguments for retiring it in **B4**, in order of strength:

1. **A13.** A whole class of JS measurement bug that the test suite structurally
   cannot detect, because the suite is Chromium and the bug is WebKit.
2. **Every fixed-position anchor needs a hand-written compensation.** Nine in
   `hud.css`, three more that were missed in other files and were live for a
   while. Compensation lives on the *declaration*, not the element, so repointing
   one file is never enough — this cost real bugs twice in one session.
3. **Viewport units.** Section 1. Now mitigated by a token, but the token is a
   thing to remember rather than a thing enforced.
4. **Container queries × zoom is an open spec question**
   ([csswg-drafts#10268](https://github.com/w3c/csswg-drafts/issues/10268)), and
   this codebase uses `@container sheet` extensively.

Argument against: with type on tokens (B1), `--ui-scale` could drive the tokens
directly and none of the above applies — but only if the migration is
**complete**. A half-migrated scale is strictly worse than zoom, because zoom at
least catches the px that nobody got to. **So B1 must land fully before B4 is
even asked.**

---

## 5. `rem` vs `px`, for B1

The accessibility literature splits, and the split matters for a game:

- `rem` respects the user's browser font-size setting, which is a **global**
  preference, whereas zoom is per-site. Low-vision users often set font size
  rather than zoom
  ([Airbnb](https://medium.com/airbnb-engineering/rethinking-text-resizing-on-web-1047b12d2881)).
- `px` keeps authoring simple and is defensible now that the reference pixel is
  itself user-controllable via zoom
  ([matklad](https://matklad.github.io/2022/11/05/accessibility-px-or-rem.html)).

For this project the deciding fact is that **the game ships its own size slider**,
which is more discoverable than either browser mechanism and is the one users
will actually reach for. So the type scale should be tokenised first and the
`px`-vs-`rem` question decided separately — they are independent, and conflating
them would make B1 twice as large for no gain.

Recommended shape for B1: 7 rungs as custom properties, absorbing 291 of the 314
raw font-sizes, migrated **one file per commit** with a before/after size dump so
each commit is provably a no-op or a deliberate change.

---

## 6. Tooling notes

- `tools/ui-scale-axis.mjs` adds `--scale=` to `layout-audit`, `menu-fit` and
  `fit-audit`, turning screen × viewport into screen × viewport × scale.
- `tests/ui-scale.spec.js` is the cheap standing guard. It shipped
  **landscape-only** and that gap cost the section-1 bug within the hour — a
  portrait-only CSS branch cannot be seen by a landscape-only matrix. It now
  runs both orientations and asserts nothing scrolls sideways.
- The Chrome DevTools MCP was materially better than a Playwright probe for this
  work: `evaluate_script` against a live page, resize between measurements, no
  boot per question. The unit table in section 1 took one call.
