# In-race HUD code audit — ship `5ab09b4` (2026-10-10)

Read-only audit of the in-race HUD as it stands on `claude/f1-game-project-26h3ng`
at `5ab09b4` (#1345). Phone landscape (844×390, touch) first. No source edits and no
browser runs: screenshot surveys belong to another session. This complements
`HUD-PHONE-LAYOUT-PLAN-2026-10-10.md` (the phased allocator plan); a finding that plan
already names is cited, not re-derived.

Scope: `js/ui/hud.js` (2245 lines), `hud-layout.js`, `hud-relative.js`, `hud-strategy.js`,
`hud-readouts.js`, `hud-inputs.js`, `dock-layout.js`, `live-region.js`, `css/hud.css`
(2108 lines) plus the HUD rules in `overlays.css` / `touch-controls.css` / `tokens.css`,
and the HUD unit tests / specs.

Evidence: the twenty `tests/unit/hud-*`, `dock-layout`, `pause-hud-layout`, `css-layers` and
`uilayers-modal-order` unit files, each run once in the foreground, all pass (0.1–5.9 s each).
One harness experiment (F-01, recipe below). Every other line is file:line reading.
"PLAUSIBLE" means the code path is real but no browser has reproduced it on a phone.

## Findings

Severity: **P0** wrong for most phone players · **P1** wrong for a real phone cohort or
silently breaks the layout contract · **P2** visible defect or cost on a phone in some
settings · **P3** hygiene. Effort: S < ½ day, M ≈ 1–2 days, L > 2 days. "PR" = open work
that already touches the line (see §Open PRs).

| id | sev | file:line | what | why it matters on a phone | fix sketch | eff | PR |
|---|---|---|---|---|---|---|---|
| F-01 | **P1** (P0 if the owner's iPhone is on iOS < 26.4) | `js/ui/hud.js:841` `zoomDiv` | When the element has no `currentCSSZoom`, `zoomDiv` divides by **1** (the comment says this is meant for mini-dom fixtures). Real Safari applies CSS `zoom` to rects (supported since Safari 3) but ships `Element.currentCSSZoom` only from **iOS Safari 26.4** (BCD 8.1.5, `api.Element.currentCSSZoom.__compat.support.safari_ios`; MDN marks it "Baseline 2026"). So every intrinsic size is measured at the painted size, and each cap becomes `room / (w·z)`. | Harness, compact short-landscape at HUD 200 %: with `currentCSSZoom` the top band holds at **1.374** for 8 fits; without it the band swings **1.928 → 0.72 → 1.862 → 0.745 …**. In practice that is the whole top band (tower, map, sectors, REL, STRAT) jumping between about 2× and 0.7× at every full fit, which is every key change and every 3 s backoff. The same divisor feeds `--hud-top-h`, `--hud-sec-h`, the dock cap and `insetFor`. | Decide the divisor once: `const HAS_CZ = "currentCSSZoom" in Element.prototype`. Without it, divide by the zoom **published** for that band (`pub`), which is exactly what the browser painted. Make mini-dom paint scaled rects (or set a test-only flag) so the fixtures match a real browser. Pin it with a variant of `hud-fit-idempotent.test.mjs` that deletes `currentCSSZoom` (recipe below). Check one capped cell on an iOS 18 / 26.0–26.3 device or WebKit before closing. | S | none |
| F-02 | **P1** | `hud.js:47-48` `hStyle` vs `:563-566` | `hStyle` caches the last value it wrote per element and property. `announceLane` clears `--announce-lane-x/-shift/-w` with a bare `removeProperty`, which leaves the cache holding the old strings. If the next publish has the same value (same geometry after a pause, a menu or a dock-less frame), `hStyle` skips the write and the lane stays unpublished. The card then falls back to `left: 50%`, the centred slot over the road. | The radio card returns to the middle of the view after something hides the docks and brings them back, and stays there until the geometry changes by 0.1 px. | `hUnset(el, prop)` that deletes the cache entry and then removes the property. The allocator branch already adds exactly this (`cursor/hud-band-allocator-5e2c`). Lint: no `removeProperty` on a property that `hStyle` writes. | S | allocator (fixes it); **#1316 adds the same bug** for `--hud-limits-h` / `--hud-inputs-w` |
| F-03 | **P1** (process) | `hud.js:880-890`, `:1390-1420` | **#1316 and #1366 both implement Phase 0 in different ways.** Both add `radioPaintedCollapse`. #1316 rewrites `sarM` to `--sar` only, gates `right` on `sectorsInTowerRow`, and adds a 10/14 touch floor. #1366 reads `--sar` with a measured fallback, adds `capRow` (a vertical limit) and `data-gap-drop`. Both are ready (not draft). | Whichever merges second conflicts in `fitHud`, and a hand merge that keeps both runs two different zoom models. The allocator branch is stacked on #1366. | Keep **#1366**, since the allocator series builds on it. Close #1316 or cut it down to what #1366 lacks: the survey flags and `--hud-limits-h`, written with `hUnset`. | S | #1316, #1366 |
| F-04 | **P1** | `--dock-r-w` writers: `hud.js:690` (`bumpDock`), `:1314`, `:1327`, `:1373`; `zPaint` `:1258-1263` | Four writers. Each takes `min(published zoom, live currentCSSZoom)`, so the result depends on whether the browser has applied last frame's zoom yet, and the fit is **not idempotent** under load. The comments record six separate 1–2 px CI misses at this spot. `bumpDock` (in the per-tick `phoneFitStampSync`) skips the `mapClear` guard that fitHud's third writer has (`:1369`), so it can push S3 left into the minimap. | The sector plate and BOOST either touch, or S3 slides over the map. The result changes from tick to tick on a loaded phone. | Plan Phase 5: one pure `rightDockInset(left, zPub, sar)` using **published** zoom only (with F-01's divisor), written once after the caps. `bumpDock` calls the same function. | M | allocator (`08fa5cc` "rightDockInset is the one --dock-r-w formula") |
| F-05 | P1 (known) | `hud.js:885-890` `sarM` | The top band shrinks to 8 px text at `--hud-z-top` 0.575 on 844×390 because `sarM` reads the dock stand-off as a notch inset. | The phone HUD is unreadable. | Plan Phase 0 "Fix A". | S | #1366 / #1316 |
| F-06 | P2 | `hud.js:1836` vs `:1392-1418` | **The painted guarantee does not last.** fitHud ends by collapsing the lane if the card still overlaps S3 or the tower. In the same tick `updateHud` calls `announceLane` again (after the gap strings), which re-derives and **re-opens** the lane from its own obstacle list (it checks the tower only through `y0`). The frame that paints is the re-opened one. The next same-key tick finds the clash again and runs the full fit again, up to `FIT_CLASH_TRIES` = 5. | The radio card can sit on S3 or the tower and re-trigger full layout passes every tick for half a second. | Have the collapse set a flag that `announceLane` respects until the fit key changes, or (plan Phase 2) one `placeRadio()` that both call sites share. | S | allocator `60ebe65` (placeRadio) |
| F-07 | P2 | `hud.js:798-814`, `:503-545`, `:664-716`; `hud-relative.js:184-235`; `hud-inputs.js:80` | **2–4 forced layouts per 10 Hz tick on touch** while the fit itself is backing off. Each tick runs: the same-key clash check (about 4 rects plus `phonePaintedClash`, about 8); `announceLane` (about 12 rects and an **uncached** `getComputedStyle(root)` for `--sal`/`--sar`) after `hText` writes; `phoneFitStampSync` (calls `HudRelative.fitRows`, which removes `left`/`max-height` and then re-reads rects, then up to 8 clash passes with `offsetHeight` flushes); `HudInputs` reading `currentCSSZoom`. `fitRows` runs twice per tick when REL is on. | About 20–40 synchronous style+layout passes per second compete with the WebGL frame on exactly the weakest devices. | Read all rects at the start of the tick, before any writes. Cache `--sal/--sar/--sat/--sab` on the `syncComputedRootVars` key. Run `announceLane` / clash / stamp only when the fit key or a text length changed. Call `fitRows` once. | M | allocator (obstacle list per stage) partially |
| F-08 | P2 | `js/ui/dock-layout.js:84-98`, `:287-290` | A dragged dock is a `translate()` in pad px divided by the dock's `currentCSSZoom` **at paint time**. Paint re-runs only on resize, orientation change or a store change. When fitHud later caps `--hud-z-dock`, the saved offset lands at `offset × newZ/oldZ`. DockLayout also never calls `GameHud.invalidateFit()`, so the fit (dock cap, `--dock-r-w`, lane) keeps the pre-drag rects for up to 3 s. | After a REPOSITION the pedals stop short of where the player put them, and the sector plate and radio lane clear the dock's old position until the next refit. | `DockLayout.apply` → `GameHud.invalidateFit()`. Re-apply the docks when `--hud-z-dock` changes (fitHud already knows when it writes it), or express the offset with CSS `calc(... / var(--hud-z-dock))`. | S | none |
| F-09 | P2 | `hud.js:1077-1085` `limLeft`; `css/hud.css` ~:1994, ~:1868 | The track-limits slot is always reserved, and `limLeft` ignores the LIMITS toggle (plan "anchors" items 2–3). | STRATEGY, RELATIVE and DAMAGE hang 2.6 em + 8 px lower than they need to. | Plan Phase 3/4 (measure the chip; reserve space only while it shows and is enabled). | S | allocator `132f034`/`ac519f3`; #1366 (INPUTS under limits) |
| F-10 | P2 | `css/overlays.css:874-884`, `css/touch-controls.css:374/636/713` vs `css/hud.css:227` | TEXT SIZE Large/Larger sets `--hud-text-boost`, but only `#hud-speed` in `hud.css` reads it. The `@layer overlays` overrides (≥1200 px, and the touch tiers) set fixed px sizes and win the layer order (`tokens.css:12`). | The speed readout ignores TEXT SIZE on landscape phones. | Multiply each override by `--hud-text-boost`, or one `--hud-speed-fs` token per tier. | S | none |
| F-11 | P2 | `hud.js:1227-1230` floor 0.4 × `touch-controls.css:490-497` | `--hud-z-dock` can be capped down to 0.4, which paints `--tap` 54 px at **21.6 px**. The comment there says this is deliberate (better than BRAKE off-screen). | BRAKE/GAS fall under 24 px (WCAG 2.5.8) on short phones at high BUTTON SIZE with many groups. | Floor the dock at 44/54 and drop or stack a group (OT/AERO) instead of shrinking the pedals. At minimum floor at 24/54. | S | none |
| F-12 | P2 | `css/hud.css:1786`, `:1808` | Broadcast tower rows are buttons with `min-height: 17px` inside `zoom: var(--hud-z)` (can be < 1). | In WATCH on a phone, tapping a row selects the wrong driver. | `min-height: max(24px, calc(24px / var(--hud-z)))`, or a taller `::before` hit area. | S | none |
| F-13 | P2 | `css/hud.css` (50 `!important`), `overlays.css` (15); 16 `:has()` rules, e.g. `hud.css:887-891`, `:1104-1105`, `:1487`, `:2017` | HUD geometry is split over three files in two layers, with `overlays` winning, so hide rules in `@layer hud` need `!important`. `:has()`/`:not()` chains make layout decisions (mirror chip → announce/flag, caution step) that `fitHud` also publishes as measured vars: two sources of truth. | Every phone fix has to win a specificity fight. A JS-measured var and a CSS chain can disagree for a frame or for good (the plan's "floating" radio card). | Move all HUD geometry into `@layer hud`. Replace the layout `:has()` chains with a resolver attribute (`body[data-radio-slot]`, plan Phase 2). | M | allocator removes some |
| F-14 | P2 | `css/hud.css:165`, `:218`, `:1034`, `:1070`, `:1102-1105`, `:968`, `:1180`; `overlays.css:878-882` | Hard-coded numbers that should be layout tokens. `146px` = 10 + 128 + 8 (minimap); `178px` = 10 + 160 + 8; `+15px`/`+12px` under the sectors; caution steps `+38px`/`+34px` (one 4-part chain repeated just to change 38 to 34); a `54px` `--hud-top-h` fallback about 10 times; the STRATEGY `168px` sidestep (plan item 1). | Toggling one piece does not move its neighbours. Pieces "float" at offsets computed for another size. | Tokens `--mm-w`, `--hud-edge`, `--hud-air`, `--flag-h`, `--flag-step`; declare `--hud-top-h: 54px` once on `:root`. | S–M | allocator (168 px, rcol/lcol) |
| F-15 | P3 | `hud.js:1420` and `:1373` | `mirrorClear(root)` runs twice per full fit (`:1373` and `:1420`), each a rect read. | — | Keep the last call. | S | — |
| F-16 | P3 | `hud.js:277`, `:948-949` | `_gapW` (the measured width of each gap spelling) is never reset: not on a new race, not on a TEXT SIZE change, not when the late `fonts-hud.css` (loaded `media="print"`, `index.html:124`) swaps Barlow Condensed in. The fit key has no font signal, so the first fit is measured with the fallback font until the 3 s backoff. | Wrong gap-strip rung (short/drop) for up to 3 s at race start, and stale after a TEXT SIZE change. | Clear `_gapW` in `resetRace` and on `_cssRootKey` change; `document.fonts.ready.then(invalidateFit)`. | S | — |
| F-17 | P3 | `hud.js:1037-1041` `CHIP_H = 26`, `CHIP_DROP = 15` | The LIMITS chip box is reconstructed from constants because the chip is `hidden` until a strike. These duplicate the CSS `+15px`. | They drift apart the first time the CSS changes. | Measure once with `visibility:hidden` (the mirror-pass pattern), or publish one token both sides read. | S | allocator (measured) |
| F-18 | P3 | `index.html:615-618`; `hud.js:1608`, `:1743`, `:1786` | `aria-label` written every tick on `#hud-ot/#hud-aero/#hud-bb`, which are role-less `div`s (prohibited by ARIA 1.2, so ignored). | Screen-reader users get nothing from these. | `role="img"` like `#hud-energy`, or visually hidden text. | S | — |
| F-19 | P3 | `hud.js:198-200`, `:1810-1812` | Delta sign is chosen before rounding: −0.0004 reads `-0.000` and is coloured "fast". | Visual noise on the delta. | Round, then sign. | S | — |
| F-20 | P3 | `hud.js:1880`; `broadcast.js:168`; `hud.js:350` | Sectors over 60 s print as `75.123`, not m:ss. The broadcast tower calls `fmtGapSec(v)` without a profile (1 dp where the chip shows 2). A non-finite long gap reads `▲ VER --s`. | Inconsistent numbers between the chip and the tower. | Pass the profile; m:ss for ≥ 60 s; append `s` only when finite. | S | — |
| F-21 | P3 | `hud-relative.js:152` vs `hud-strategy.js:107`; `hud-relative.js:239` | REL counts PIT as `lane`/`box`; STRATEGY counts any `pitState !== "none"` (including `out`). Screen-reader rows read "99+ seconds", "-- seconds", "2 lap up". | The two panels disagree for a car on the out-lap. | One shared `inPit(car)` predicate; fix the plural and the non-finite wording. | S | — |
| F-22 | P3 | `hud.js:1474-1500` `skinAccent` | Picks the better of `--text`/`--bg` for a custom team colour but never checks that it reaches 4.5:1 (text) or 3:1 (plate). | A mid-grey MY TEAM colour gives a radio number plate around 4.3:1. | If neither reaches 4.5:1, darken or lighten the plate until it does. | S | — |
| F-23 | P3 | `index.html:614`, `:634`, `:734-735` | Focus order: up to 22 broadcast tower rows and `#hud-work` come before `#btn-cam`/`#pausebtn`; PAUSE is the last tab stop. | Keyboard or switch users must tab through the field to pause. | Move `#pausebtn` earlier in the DOM, or roving `tabindex` on the tower. | S | — |
| F-24 | P3 | `css/hud.css:46`, `:204`, `:146` | Comments that no longer match the code: a `hud.js` under `js/game/` (it lives in `js/ui/`); `.hud-gaps` "rides `zoom: var(--hud-scale)`" (it rides the capped `--hud-z`). | Misleads the next agent. | Fix the text. | S | — |
| F-25 | P3 | `css/hud.css:1779/1836`, `:1781/1981`; `watch-transport.css:48` | Broadcast `bc-on` hide lists are duplicated three times. | — | One shared selector list. | S | — |

### Tests (Q6)

| id | sev | where | what | fix |
|---|---|---|---|---|
| T-1 | P1 | `hud-control-clearance.test.mjs:43-84`, `hud-metrics-layout.test.mjs:90-138` (about 70 regex matches), `hud-portrait-cluster`, `hud-helmet-placement`, `hud-inputs.test:133`, `damage.test:185`, `pause-hud-layout:34` | Dock clearance, gap-drop and limits offsets, the ordering of fitHud's radio steps, portrait TYRES, helmet ENERGY and DAMAGE zoom are pinned **only by source regex** on exact `calc()`/call-order text. A behaviour-preserving refactor (the allocator) breaks them, and a regression with the same text passes. This is the main blocker for the refactor. | Move each to a rect assertion in `hud-layout.spec.js` or an `apex_hud_survey` cell. Delete the regex when the rect test lands. |
| T-2 | P1 | (no spec) | Never shown in any spec or survey cell: `#hud-damage`, `#hud-flag` (caution) **together with** the radio card, rotation **mid-race** (`ui-resize.spec:228` rotates in the garage), a dragged dock followed by a fit, a one-car field, race → replay → results teardown, an iOS-like no-`currentCSSZoom` browser (F-01), and the shipped default with the opt-ins off (the plan's gap table). | Add fixtures: `--damage 0.5`, `--flag yellow`, `--mirror chip` (plan Phase 0 item 2); a mid-race `setViewportSize` swap; a dock-drag-then-probe case. |
| T-3 | P2 | `hud-layout.spec.js:519` (400 ms), `ui-resize.spec.js:241-243` (6 × 250 ms), `:458` (500 ms), `hud-audit.spec.js:18/33` | Sleep, then assert. Every `waitForFunction` does pass `polling`. | Wait on a `--hud-fit-stamp` change, or on `SheetShape`. |
| T-4 | P2 | `hud-fit-idempotent.test.mjs:147` | The harness always defines `currentCSSZoom`, so F-01 cannot fail it. | Add the no-`currentCSSZoom` variant below. |

F-01 recipe (scratch only, nothing committed). Copy `tests/unit/hud-fit-idempotent.test.mjs` to
`scratch/`, fix the two relative paths, guard its `Object.defineProperty(el, "currentCSSZoom", …)`
with `if (!globalThis.__NOZ)`, then add:

```js
test("no currentCSSZoom", () => { globalThis.__NOZ = true; const h = bootFlipHarness(), caps = [];
  for (let i = 0; i < 8; i++) { h.paintAt(h.pub()); h.invalidate(); h.tick(); caps.push(+h.pub().toFixed(3)); }
  console.log(caps); });   // [1.928,0.72,1.862,0.745,1.805,0.769,1.753,0.792]; with the property: 1.374 ×8
```

### Fit engine verdict (Q1)

`fitHud` is **not a single layout contract**. It is one budgeted cap solver (gap-strip rungs,
`capFor`, `capChrome`, the dock ROW/STACK cap), which is sound and already written to be
state-independent. On top of it sit **seven order-dependent repair passes**: the
`--dock-r-w` publish plus one painted correction, `HudLayout.fit`, a 4-pass sector
`max-width` shrink, a third `--dock-r-w` widen, `radioTopSlot`, `announceLane`, the painted
radio collapse, and outside the fit the per-tick `phoneFitStampSync` (up to 8 passes of
`bumpDock` + `shrinkSectors` + `fitRows`).

- **Rect intersection.** The repair passes do real 2-D tests (`_hudRectsHit`, the 0.5 px slack shared with the spec). The budget is x-only by design, and the vertical clash (tower vs sector row) is missing on ship. That missing check is the F-05 bug; #1366 adds `capRow`.
- **Idempotency.** It holds for the cap solver when `currentCSSZoom` is present (the unit test pins it). It does not hold for the repair passes (F-04, F-06), and not for the solver on iOS < 26.4 (F-01).
- **Zoom.** CSS `zoom` is used consistently (about 40 anchors divide by `--hud-z`); taps use size, not zoom. The weak points are the live-vs-published divisor (F-01, F-04) and that no lint checks the division.
- **Safe area.** There are three sources. `--sal/--sar` are read from computed style (`announceLane`, `insetFor`, `bumpDock`, the collapse), inferred from element offsets (`salM`/`sarM`, which is the F-05 bug), and used directly in CSS. Use one: the computed tokens, cached per `_cssRootKey`.
- **Orientation and resize.** Width × height is in the fit key, `DockLayout` repaints on resize, and `fitRows` re-derives. The gaps are F-08 (dock zoom and drag) and F-16 (`_gapW`). The mirror's `side()` runs on its own 500 ms clock and is independent of the fit (plan Phase 2).
- **`invalidateFit` coverage.** It is called by `HudLayout.apply`, `HudElements.apply` and the survey, and #1349 verified the `data-hud-hide` toggles. It is missing from `DockLayout.apply` (F-08) and from font load (F-16). The steer-mode, profile and camera toggles are covered through `body.className` in the key. On ship `invalidateFit` still re-runs `radioTopSlot` without the painted-clash check (plan Phase 0 item 1; fixed in both #1316 and #1366).

### State and races (Q2)

- There are no ResizeObserver or MutationObserver loops in the HUD (`js/ui/hud*.js` installs none).
- `hud.js` adds no listeners per mode. `hud-layout.js` adds its build-time listeners once.
- Per-tick allocation is about 40–60 short strings, all compared through the `hText`/`hAttr` cache. That is not a GC risk at 10 Hz. `hAttr` reads the attribute on every call, and `G.cautionInfo()` is called twice per tick (`:1715`, `:1913`).
- The real cost is layout thrash (F-07).

### Verified correct (no action)

- Gap hundredths (#1211, `hud-readouts.js:33-55`): 2 dp under 9.95 s, 1 dp above it except in broadcast. Lapped cars read `+NL`, a non-finite gap reads `--`, and REL caps at `99+`.
- `fmtTime` rounds before splitting.
- POS reads TT/Q/PRAC/DNF instead of `1/1`, and retired cars leave the ranking.
- One MPH/KPH spelling is shared by the wheel and the HUD.
- `LiveRegion` uses one polite region with a priority queue, supersede, a 4 s stale drop and a 1.2 s hold. The flag is spoken once per text change.
- Reduced motion is backstopped globally and for `#hud`; redline pulses at 2.5 Hz (< 3 flashes per second).
- `--tap-hud` and the HUD buttons are floored at a zoom of 1 or more.
- No dead `#id` selectors were found in `hud.css`.

## Open PRs and branches (recorded, not re-reviewed)

| PR / branch | touches | interaction with the findings |
|---|---|---|
| #1366 `cursor/hud-topband-zoom-fit-3b7a` (ready) | `fitHud` sarM + `capRow`, `radioPaintedCollapse`, `gapForm` `data-gap-drop`, INPUTS width | Fixes F-05 and the invalidateFit relight. The allocator branch is built on it. **Duplicates #1316 (F-03).** |
| #1316 `cursor/hud-phase0-zoom-59af` (ready) | the same Phase 0, done differently, plus a 10/14 touch floor and `--hud-limits-h`/`--hud-inputs-w` | Conflicts with #1366. Its new `removeProperty` calls repeat F-02. |
| #1351 `fix/hud-overlap-clearance` (ready) | `announceLane` `data-announce-lane`; a portrait `capBot`; `hud.css` and `touch-controls.css` | Adds another portrait cap pass, another repair to fold into the allocator. Overlaps `hud.css` with all three branches above. |
| #1346 `cursor/sheet-geometry-cap-6ea8` | `css/menus.css` only | Not the HUD. No interaction. |
| #1360 `cursor/bh2-ui` | `hud-layout.js` chip clamp, `live-region.js` trim | Small. The `hud-layout.js` change touches the same `HudLayout.fit` the allocator moves. |
| `cursor/hud-band-allocator-5e2c` (branch, no PR yet; +735/−297 in `hud.js`) | plan Phases 1–5: obstacle list, `rightDockInset`, `placeRadio`, `--rcol-y-*`, `--lcol-y-*`, `hUnset` | Addresses F-02, F-04, F-06, F-09 and part of F-07/F-13/F-14. **It does not touch F-01**, which applies to its formulas too. |
| merged #1301, #1349, #1367, #1344, #1345 | lane rows, invalidateFit stale-clearance verify, survey capture cap, minimap slot note, survey B1–B5 | Already in `5ab09b4`; audited as shipped. |

## The HUD only grows: a net-lines rule (owner decision, 2026-10-10)

Every open HUD change makes the code larger, including the one meant to simplify it
(`git diff --numstat` against ship, `js/ui/hud.js` + `css/hud.css`):

| branch | added | removed | net |
|---|---|---|---|
| `cursor/hud-band-allocator-5e2c` (the "one contract" refactor) | +793 | −319 | **+474** |
| #1316 Phase 0 | +118 | −42 | +76 |
| #1351 overlap clearance | +78 | −22 | +56 |
| #1366 top-band fit | +89 | −34 | +55 |

`hud.js` (2246 lines, 1330 code lines) and `css/hud.css` (2109 lines, 1917 code lines)
have no entry in `tests/data/ratchets.json`, so nothing makes a HUD PR pay for what it
adds. Most of this audit's findings share one cause: each phone bug got its own repair
pass, layered on top of the passes before it.

The rule the owner asked for:

1. **Ratchet both files at ship's values**: `js/ui/hud.js` `{ codeLines: 1330, lines: 2246 }`,
   `css/hud.css` `{ codeLines: 1917, lines: 2109 }`. The commit hook absorbs ≤ 40 lines.
   A larger raise needs a stated reason in the PR, as `game.js` already requires.
   **Added in this PR** (`tests/data/ratchets.json`, recorded in `CEILING-HISTORY.md`).
2. **A replacement must delete what it replaces, in the same PR.** Each allocator phase
   removes the passes it supersedes: the sector `max-width` shrink loops, three of the
   four `--dock-r-w` writers, the painted-collapse block, `phoneFitStampSync`'s 8-pass
   loop, and the `:has()`/fixed-offset CSS for that column. It also retires the regex
   pins (T-1) that only hold those passes in place. **A phase that is not net-negative
   in `hud.js` + `hud.css` is not a replacement yet** and should not merge as one.
3. **Prefer fixes that subtract.** F-01 and F-02 are a few lines each. F-15, F-24, F-25
   and the F-14 token work remove lines. New features (a new readout, a new slot) carry
   their own deletions or a written raise.

In-flight PRs (#1366, #1316, #1351) are each over the 40-line absorb. Once the ratchet
lands they need either a raise with a reason or a matching deletion. That is the point:
decide which repair each one retires.

## Safest order to change things

0. **The ratchet above** (this PR): land it before anything else merges.
1. **Land one Phase 0**: #1366. Close or shrink #1316 (F-03) before either merges.
2. **F-01 divisor** (S, isolated, pinned by a new unit variant). Land it before the allocator so that every later phone measurement is taken at the right zoom on iOS.
3. **F-02 `hUnset`**, either cherry-picked from the allocator branch or landing with it, plus a lint so it cannot come back.
4. **Behaviour pins before the refactor** (T-1, T-2): rect probes for dock clearance, LIMITS, DAMAGE and the caution card in `hud-layout.spec.js`. Retire the regex pins as the allocator changes the text.
5. **Allocator series** in its own order (obstacle list → `placeRadio` → right column → left column → `rightDockInset`), one PR per phase, each with the phone survey cell before and after. F-04, F-06, F-09 and F-14 close here.
6. **F-07 per-tick reads** after the allocator: batch reads once there is one obstacle list.
7. Independent and safe at any time: F-08, F-10, F-11, F-12, F-16, and the P3s.

## Recommended target architecture

```
updateHud tick (10 Hz)
  1. WRITE text/classes (hText/hToggle, no reads)
  2. if fitKey changed (incl. fonts, text-size, dock offsets) OR 3 s:
       READ   one snapshot: rects of every piece + docks + safe-area tokens,
              each divided by its band's PUBLISHED zoom (never live currentCSSZoom)
       SOLVE  pure function layout(snapshot, settings) -> {
                zTop, zBot, zDock,                 // budget caps (today's solver)
                rightInset,                        // one rightDockInset()
                columns: { left:[...], right:[...], centre:[...] }  // y per piece
                radioSlot: top|side|lane|collapsed, laneRect,
                hidden: [{id, reason}]             // drop, never overlap
              }
       WRITE  one publish: CSS vars + body[data-radio-slot] via hStyle/hUnset
  3. no per-tick repair passes; the only post-write read is a debug assert
     (overlap → Log.warn + survey finding), not a second solver.
```

- `layout()` is pure and lives in its own new module (a `hud-fit` IIFE next to `hud.js`), so it is unit-testable with plain rects and has no mini-dom zoom model. Idempotency is `layout(s) === layout(s)`.
- Column membership, priority and drop order are metadata in `HudLayout.ELEMENTS` (plan Phase 7). CSS anchors read `--lcol-y-*` / `--rcol-y-*` and keep today's formulas only as first-paint fallbacks.
- MOVE & SIZE pieces (`data-hl`) are excluded from the allocator and clamped after it, as today.
- One CSS layer owns HUD geometry. `:has()`/`:not()` chains that decide layout are replaced by resolver attributes.
- Tests: the pure-solver unit tests replace the regex pins. `hud-layout.spec.js` plus the phone survey cells (shipped default, every piece on, caution + radio, damage) are the behaviour gate.

---
Audit by a read-only cloud session at ship `5ab09b4`; the F-01 harness numbers come from
`scratch/` (not committed). Browser confirmation of F-01, F-02, F-06 and F-08 on a phone is
still to do (owner of screenshot surveys: the parallel survey session).
