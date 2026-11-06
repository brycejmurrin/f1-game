# Title WIDTH on the iPhone: stale-shell path and a length-only cluster (#5134)

Kind: design · Re-measure-by: 2026-12-06

Code-only analysis (Bryce, 2026-11-06: no more device sessions). Continues the hand-off on #5134
(comment 6677866119) and [TITLE-LAYERS-2026-11-05.md](TITLE-LAYERS-2026-11-05.md). Nothing here is measured on the
device; every claim below is read from the tree at c6fe5de8.

## What every failing round had in common

Bryce's four reports (#4862 after #4840, the #4862 reopen after #4865, #5126 after #4906, #5134 after #5127) describe
one thing: the cluster's WIDTH never changes on the phone, only its position does. The four generations placed the
cluster four different ways (centring margin, end margin, start margin, screen-% start margin), and each moved it on the
device. The one declaration they all share is `width: var(--_tl-bw)` on the zoomed `#menu-buttons`
(`css/responsive.css`, `--_tl-bw: max(16.5rem, calc(W * var(--vwz) / size))`). The margins react to `--_tl-bw` on the
device (the cluster moves with WIDTH), so the token resolves; the `width` declaration is what does not take there.
Chromium and Linux WebKit honour it at every geometry (TITLE-WIDTH-WEBKIT-2026-11-04.md, #5127's spec).

Rule-outs made here: no `display-mode`, `standalone`, `-webkit-` or `@supports` gate anywhere under `css/`; the only
media features that differ between the device and the emulated spec (`pointer: coarse`, `hover`) touch no title
width rule; `@layer reset, base, components, hud, overlays, responsive, layout` (tokens.css) puts the WIDTH rule in
`overlays` and the placement in `responsive`, above every `components` width (`menus.css` `width: auto`/`100%`). The
WebKit zoom lead is too small: Bryce's cluster zoom is 1.09 × 0.91 = 0.99, so a zoom-model bug moves edges by ~1 %,
not the 264 → 734 px a WIDTH sweep should produce. Safari 26.4 fixed zoom for width, margin and calc (webkit.org blog
17862); his UA is ≥ 26.6.

## Lead A: the Home-Screen shell can stay old

`sw.js` facts (lines cited at c6fe5de8):

1. A navigation is network-first with a 3 s race (`NAV_RACE_MS`, l.1152). The loser is `matchPreferCurrent(req)`,
   whose order is SETTLED generations first (l.166–183): on a slow link an installed PWA boots the OLD settled shell,
   with that shell's own `?v=` CSS served cache-first from the retained prior generation (#2194 keeps it while a
   window exists).
2. The shell's boot guard then fetches `version.json`, which the worker FAILS FAST at 3 s while `navigator.onLine`
   (l.1180–1189, `failFast`). On the same slow link that read fails, so the guard never reloads. `UpdateCheck`
   (js/ui/update-check.js) retries after 30 s with a 15 s deadline, but its fetch goes through the same 3 s fail-fast;
   only `controllerchange` or a fast moment can mark the update, and even then it is a CHIP (`#update-chip`) the player
   must tap. Nothing reloads a stale title screen by itself.
3. iOS resumes a Home-Screen web app without a navigation. A page that booted stale stays stale until iOS discards it;
   `onVisible` re-reads `version.json` at most every 10 min and, again, only paints the chip.
4. A `?b=` bust with no cached shell ≥ b fails fast at 3 s (l.1196): if the page reloads to `?b=<new>` before the new
   shell is cached (the navigation cache write waits on `currentCacheName()`, l.1121–1133), a slow link gets the
   browser's error page.

So a standalone launch can run an old shell and old CSS for a whole session, and the player sees the UPDATE READY chip
at best. This is consistent with four fixes "not working" in a row.

Fix (not yet written):

- `sw.js`: when a navigation lost the race and the late network shell carries a NEWER `apex-build` than the one
  served, finish the cache write first, then post `{ type: "apex-shell-newer", build }` to every window client
  (same channel as `swLog`). Only after the write, so the page's `?b=` reload is answerable from cache (`shellAtLeast`).
  Keep the version.json fail-fast: relaxing it would let the inline boot guard reload MID-RACE (it has no `inRace`).
- `js/ui/update-check.js`: a `staleShell(build)` entry (and the same policy for `newerActive` and a successful `check`)
  that AUTO-APPLIES — `apply()`: flush, `?b=` reload, the sessionStorage one-shot — when the player is idle: not in a
  race, `#overlay` visible, no `dialog[open]`, and within 90 s of boot or of the page becoming visible again (the iOS
  resume). Otherwise the chip, as today. `js/ui/platform-session.js` wires the SW `message` listener and the idle
  predicate (`UiLayers.inRace()` exists; add the overlay/dialog check there).
- Pins: `tests/unit/service-worker.test.mjs` (harness `createHarness({ posted, immediateTimeoutMs: 3000 })`): a slow
  navigate serves the precached shell, then the late 322 shell is cached under `apex26-322` and ONE
  `apex-shell-newer` post reaches each window; an equal build posts nothing; a shell whose build does not match
  `version.json` is neither cached nor announced. `tests/unit/followup-update-check.test.mjs` harness: `staleShell`
  inside the window and idle → `location.replace` with `?b=`; in a race or past the window → chip only.

## Lead B: a cluster placed with lengths only

Required by the dispatcher: no `%` calc inside the zoomed element's margins. The design keeps the two mechanisms the
device demonstrably honours (margins move the cluster; `stretch`/`width: 100%` fills the shipped column) and drops the
one it ignores (`width: <length>`):

```
z     = --ui-scale × --tl-btns-size                 the cluster's zoom; every length below is divided by it once
ovw   = (100svw − --ov-pl − --ov-pr) / z            the overlay's CONTENT width as a length (tokens.css --safe-w shape)
bw    = max(16.5rem, W × 1vw / z)                   unchanged (--_tl-bw, responsive.css)
free  = max(0px, ovw − bw)
home  = free (SIDE AUTO) | 0px (SWAPPED)
start = clamp(0px, home + bx, free)                 bx = --_tl-bx, already X × 1vw / z
end   = free − start
```

`#menu-buttons` in landscape with a WIDTH: `grid-column: 1 / -1; justify-self: stretch; width: auto; min-width: 0;
max-width: none; margin-inline: start end; translate: 0 Y`. The stretched width is the grid area minus both margins =
bw, with no `width` declaration and no `%`. `--ov-pl`/`--ov-pr` are new tokens set where `#overlay` sets its padding
(`css/title.css` `#overlay { padding: var(--safe-t) var(--safe-r) var(--safe-b) var(--safe-l) }` and the ≥ 1680 px rule
in `css/menu-destinations.css`, `padding-inline: max(var(--safe-l), 3rem) …`), so the content width mirrors the padding
by construction. `html, body { overflow: hidden }` (tokens.css) means `100svw` is the fixed overlay's width.

`tests/unit/title-menu-even.test.mjs` l.553–575 asserts the CURRENT text (`width: var(--_tl-bw)`, the `clamp(0%, …)`
start margin); update those assertions with the rule.

Pins to add to `tests/specs/title-cluster.spec.js` (Chromium on CI, WebKit by hand): viewports 852×393 and 852×283
with CDP insets 59 and 67 px, 844×390 and 932×430 with 59 px, Bryce's export, SIDE auto and swap, and BOTH densities
(force `normal` by setting `--compact-at: 0px` on `body` before SheetShape measures, or `9999px` for `compact`; see
`js/ui/sheet-shape.js` l.245). At each cell: WIDTH 20..100 grows the box from the anchored edge only; X ±100 reaches
both content edges; X 0 is the anchored edge; `#menu-brand` and `#title-car` boxes hold to 0.5 px. One `test()` per
viewport keeps each under the fixture timeout.

## Not done

No source edit was made in this session (context cap). The claim on #5134 moved to the draft PR's `needs-owner`.
