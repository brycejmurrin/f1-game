# HUD PR review and merge order (2026-10-10)

Read-only review of every open or just-merged HUD change, done before squash
auto-merge lands them in whatever order CI finishes. Phone landscape
(844×390, touch) is the first target. Ship tip at review time: `5ab09b4`
(#1345 merged 11:20Z). No browser runs. Evidence comes from `git merge-tree`
against ship and pairwise, the diffs, `node --test` on the HUD unit files
at #1351's head, CI read with `tools/ci/ci-watch.mjs --once`, and the job log
for #1346.

| change | head | vs ship | CI on head | verdict |
|---|---|---|---|---|
| #1316 `cursor/hud-phase0-zoom-59af` | `7e710a7` | 33 behind, **CONFLICT** (hud.css, hud.js, hud-survey.test) | green (36 jobs) | **SUPERSEDED-BY #1366**: close it |
| #1366 `cursor/hud-topband-zoom-fit-3b7a` | `abafc38` | 22 behind, **CONFLICT** (hud.css, hud-fit-idempotent.test) | green (27 jobs) | **FIX-FIRST**: sync with ship and resolve as below; then SAFE |
| #1351 `fix/hud-overlap-clearance` | `3582adb` | 21 behind, **CONFLICT** (hud.css) | **red**: Structural guards (2 unit tests) | **FIX-FIRST**: push the test rewrites, drop the INPUTS and portrait-radio hunks; then **SAFE-AFTER #1366** |
| #1346 `cursor/sheet-geometry-cap-6ea8` | `e1b54b8` | clean | **red**: `ui-resize.spec.js` keyboard-inset test | **FIX-FIRST**: real regression, see below |
| #1360 `cursor/bh2-ui` | `359f542` | clean | running | **SAFE** once CI is green |
| `cursor/hud-band-allocator-5e2c` (no PR) | `ac519f3` | 15 behind, **CONFLICT** (hud.css, hud.js, hud-fit-idempotent.test) | none | **SAFE-AFTER #1366 and #1351** (contains #1366; open as a draft PR after #1366 lands) |
| #1345 (merged `5ab09b4`) | — | baseline | — | baseline; collides semantically with #1316/#1366/#1351 (below) |
| #1349, #1367, #1344 (merged) | — | baseline | — | test-only, survey tool, docs. #1349's idempotence tests are the hud-fit-idempotent conflict #1366 has to keep |
| #1343 (merged), #1347 (open draft) | — | garage | — | out of the HUD paths; no overlap with any change in scope |

Auto-merge cannot land the four CONFLICTING heads until somebody syncs them.
The risk is in how each sync is resolved, so the asks below say exactly how.

## Per-change review

### #1316 and #1366: two implementations of Phase 0

The two branches agree on the part that matters most:

- **The 8 px tower bug** (the right inset was read off `#hud-sectors`' right
  edge, which on touch includes `--dock-r-w`, so `--hud-z-top` fitted to 0.575).
  Both read `--sar` instead.
- **`invalidateFit`'s relight.** Both extract the painted-clash check into a
  function with the same name, `radioPaintedCollapse(root)`, and call it after
  `radioTopSlot` in `invalidateFit`.

They split on the follow-on problem: at full zoom, the tower's bottom now
reaches the sector plate's top on touch.

- **#1316 moves the plate.** It puts a `max(pause stack, tower bottom + 4px)` on
  `#hud-sectors`, `#hud-limits`, `#hud-damage` and both `#hud-inputs` homes, and
  drops the right-half charge entirely while the plate sits in a lower row
  (`sectorsInTowerRow`). It also raises the touch `--hud-z-top` floor from
  0.4 to 10/14.
  - The floor trades overlap for type size. When the band really does not fit
    (narrow phone, HUD 150%), the fit can no longer shrink it, and the tower
    paints into the clusters it was capped to clear.
  - `sarEnv` falls back to `0`, not to the measured edge, when `--sar` does
    not parse (unit fixtures, `env()` strings).
  - Adds measured `--hud-limits-h` and `--hud-inputs-w`. These are sound ideas,
    but the allocator subsumes them.
- **#1366 shrinks the tower to the plate's row** (`capRow`). It is solved from
  the tower's unzoomed offset and height plus the plate's screen top, so it
  converges in one step. It is gated to touch, a non-broadcast profile, and a
  plate that starts below the tower's top.
  - The shrink is small: the PR measures 2.2 px of clip at z = 1, and its test
    pins z inside (0.85, 1) and stable over ten ticks.
  - It keeps the measured-edge fallback when `--sar` does not parse.
  - Its tests are behavioural: the fitHud harness `PHONE` fixture, a
    "hiding the plate never needs more room" check, and the level-plate case.

**Decision: #1366 is the correct Phase 0.**

- It keeps the zoom floor where the overlap guarantees need it.
- It leaves the right column's geometry alone, so the allocator can own it.
- The allocator branch is already built on it (`35b6e78` merges #1366).

#1316 is 33 commits behind ship and conflicts with #1366 in four files, so it
is unsafe in either order. Close it as superseded. There is nothing to port:
the allocator measures the column (`--rcol-y-*`), which replaces
`--hud-limits-h` / `--hud-inputs-w`.

**#1366 against ship (#1345).** #1345 shipped two of the same fixes in
different words:

1. **Caution step under a dropped flag.** Ship has `--flag-slot-top`, raised by
   `:root[data-gap-drop] #announce`. #1366 has `body[data-gap-drop] …
   #announce` rules plus a `<body>` mirror of the attribute in `gapForm()`.
   The two compute the same value.
2. **INPUTS under limits.** Ship always parks INPUTS under the limits slot
   (`+ 15px + 1.75em + 8px`, no zoom conversion). #1366 converts `--hud-sec-h`
   by `--hud-z-top / --hud-z` and steps `2.6em + 3px` only while the chip
   shows.

**Sync resolution for #1366:**

- **For (1), keep ship's `--flag-slot-top`.** Delete #1366's two
  `body[data-gap-drop]` announce rules and the `<body>` mirror in `gapForm`;
  ship's single source covers it.
- **For (2), take #1366's line.** The zoom conversion is right:
  `--hud-sec-h` is in top-band units and the trace zooms by `--hud-z`. #1351
  independently diagnosed the same bug at 852×393 extras (zBot 1.4) and
  1280×720 @150%. Keep `--inputs-below-limits`. The allocator's `--rcol-y-inputs`
  falls back to exactly this formula, so the interim and the destination agree.
  Then delete ship's unconditional `+ 1.75em + 8px` line, and re-run #1345's
  `phoneL-chase` cell to confirm 0 findings.
- **In `hud-fit-idempotent.test.mjs`, keep both sides.** #1349's tests and
  #1366's PHONE tests are additive. In the `bootFlipHarness` return, keep
  `sb` from #1366.

### #1351: overlap clearance (speed, inputs, radio, portrait)

What it fixes:

- **ERS through SPEED on chase / HUD 200%.** It drops the helmet `-6svh`
  translate off the visor, adds `.hud-bottom *` to the reduced-motion
  transition list, and switches the grid tracks to `max-content`.
- **Helmet ERS anchor.** It removes the anchor to TYRES.
- **Portrait HUD 200% height cap.** It caps `--hud-z-bot` from the CAM/PAUSE
  ceiling.
- **Portrait radio recentre.** It adds `data-announce-lane`.
- **INPUTS zoom conversion.**

Findings:

- **Red head, and the test rewrites are not pushed.** At `3582adb` two source
  regexes fail. The other 26 unit files that read hud.css, touch-controls.css
  or hud.js pass (464/464). The two failures:
  - **`hud-helmet-placement.test.mjs` "touch helmet ENERGY anchors above
    TYRES".** Rewriting it is **correct**. `#hud-tyre` is `position: absolute`
    on touch landscape (anchored to `#dock-left`) and comes *after*
    `#hud-energy` in `index.html` (lines 596 / 601). Per CSS Anchor Positioning
    §"acceptable anchor element", an absolutely positioned anchor in the same
    containing block must occur earlier in flat-tree order than the positioned
    element, so the anchor never resolves. The test pinned a rule that cannot
    work (https://drafts.csswg.org/css-anchor-position-1/). The replacement
    should pin intent, not the new CSS: either a `hud-layout.spec` rect check
    (energy × gearbox = 0 on 852×393 helmet) or a structural check that
    `#hud-energy` has no `position-anchor` to a later sibling.
  - **`hud-inputs.test.mjs` "touch INPUTS home clears PAUSE/CAM".** Rewriting
    it is **correct**. The new formula still contains the pause stack; it has
    only moved inside the single `/ var(--hud-z)`. Pin the intent
    numerically, as #1366's `hud-control-clearance` change does, rather than
    swapping one literal regex for another.
  - The owner reported three rewritten guards; only these two fail at the
    pushed head. Whatever the third is, it is not on the branch.
- **Two hunks are owned elsewhere. Drop them from #1351:**
  - **The INPUTS `top` rewrite** (both homes plus the `:root:has(#hud-limits…)`
    step). It is the fifth formula for the same property; #1366 (then the
    allocator) owns it. Its `(15px + 2.6em) * z-top` also resolves `em` in
    INPUTS' font, not the chip's.
  - **The `data-announce-lane` portrait recentre.** The allocator replaces
    `announceLane` with `placeRadio`, keys the lane rule on
    `body[data-radio-slot="lane"|"collapsed"]`, and leaves a centred card on
    the base `left: 50%` rule, so the portrait bug is gone there. If #1351
    lands this hunk, the allocator has to delete it again in a conflicting
    `hud.js` hunk.
- **Keep:**
  - the translate / reduced-motion fixes;
  - the helmet anchor removal;
  - the touch-controls grid change;
  - the portrait `capBot` height cap.

  None of these collide with #1366. The height cap complements the existing
  portrait width cap in fitHud. One note on that: #1351's comment says the
  dock block never runs in portrait (dockH = 0). If that is right, the
  existing portrait width cap sits behind the same `dockH` gate and is
  equally dead. Worth one look, outside this PR.
- **Risk to measure before it lands.** `grid-template-columns: max-content …`
  removes the cluster's ability to shrink (`min-width: 0` on the grid no
  longer helps once every track is `max-content`). Check 667×375 with STEER
  BUTTONS at HUD 150% and 360×740 portrait for the cluster pushing a dock or
  overflowing. The PR only measured 852×393 and 393×852.

### #1346: sheet zoom cap on short viewports

A real regression, not a flake. The new
`:where(body[data-density="compact"]) .sheet { zoom: min(var(--sheet-scale, …),
var(--ui-compact-scale)) }` makes the painted zoom differ from `--sheet-scale`
whenever the compact cap binds.

`ui-resize.spec.js` "the software-keyboard inset pads the screen and tightens
the fit cap" (734×343, UI 200%) waits for `|zoom − --sheet-scale| < 0.001` and
times out after 5 s (run 38045895732, job 114198097182). It is also a design
problem: classifyFit already derives `--sheet-scale` from the room it
measures, so a second CSS cap means the fit no longer controls the sheet's
painted size.

**Ask:** put the cap inside the fit (clamp `--sheet-scale` where SheetShape
writes it) so style and paint agree. Do not loosen the spec. It has no HUD
overlap and can land in any order relative to the HUD PRs.

### #1360: bug-hunt 2 UI

- `HudLayout.clearControls` seeds its nudge from the painted `--hl-x/--hl-y`
  (H17). Its new unit test is behavioural.
- The `LiveRegion` trim, the deferred `#ghost=` link and the theme-ink cache
  are outside the HUD.
- `dock-layout.js` already carries the zoom division on ship; this PR adds
  only its test.

Its `clearControls` hunk auto-merges with the allocator's (the allocator
changes how the list is collected; #1360 changes the loop seed), and the two
are semantically independent. Its pairwise "conflicts" with the HUD branches
are base drift. Landing #1360 and #1346 on ship leaves every other branch's
conflict set unchanged (simulated merge). **SAFE.**

### `cursor/hud-band-allocator-5e2c` (Phases 1–4, not yet a PR)

It contains #1366 and adds four things:

- one obstacle list per fit stage (`obsCollect` / `GameHud.obstacles`);
- `placeRadio` with `body[data-radio-slot]`, replacing the three radio pickers;
- measured right / left columns (`--rcol-y-*`, `--lcol-y-*`, `--lcol-x-*`),
  which retire the 168 px STRATEGY sidestep;
- `data-col-drop` as a HudLayout hide reason.

Notes:

- Most of its new tests are fitHud-harness behaviour. "Exactly one
  `--dock-r-w` function" is a source check, which is fine for a structural
  invariant.
- It edits `js/render/shared/mirror-pass.js`, so the renderer path rules in
  `.claude/rules/` apply to that file.
- Its `ratchets.json` change (rawColor 337 → 336) is the same edit as #1368;
  identical hunks merge cleanly.

## Conflict matrix

T = textual conflict from `git merge-tree` (a cell marked *drift* conflicts
only through ship drift). S = semantic overlap. O = order dependence.

| | #1366 | #1351 | #1346 | #1360 | allocator | ship (#1345) |
|---|---|---|---|---|---|---|
| **#1316** | T hud.css, hud.js, 2 tests; S: same Phase 0, two tower/plate answers; **unsafe either order** | T hud.css; S: INPUTS top | — | T hud.js (*drift*) | T 4 files; S: allocator re-does the column | T 3 files; S: INPUTS top, caution step |
| **#1366** | | T hud.css; S: INPUTS top (both convert zoom, different steps) | — | T idempotent.test (*drift*) | contained (clean) | T hud.css, idempotent.test; S: duplicate caution-step rules, INPUTS top |
| **#1351** | | | — | T hud.css (*drift*) | T hud.css, hud.js; S: INPUTS top, portrait radio (`announceLane` removed); O: trim #1351 first | T hud.css; S: INPUTS top |
| **#1346** | | | | — | — | — |
| **#1360** | | | | | T hud.js (*drift*); hud-layout.js auto-merges | — |

## Recommended merge order

1. **#1360**, when its CI is green. It is independent of every HUD branch and
   fixes HUD chip clamping.
2. **#1346**, after its fix. It is independent; its red is its own.
3. **#1366**, synced with ship using the resolution above. It is the Phase 0
   everything else builds on, and it un-shrinks the tower on the player's
   phone.
4. **Close #1316** at any point: it is superseded and must never land after
   #1366.
5. **#1351**, trimmed (no INPUTS top, no `data-announce-lane`), with the
   test rewrites pushed, synced after #1366. It fixes ERS through SPEED, and
   landing it before the allocator leaves the allocator one conflict to
   resolve instead of two.
6. **The allocator**, opened as a DRAFT PR after steps 3 and 5. Sync it with
   `sync-pr.mjs`; the gate is `hud-layout.spec.js` plus the phone survey
   cells.

## Asks per owner

- **#1316 (owner not listed).** Close as superseded by #1366; nothing to port.
- **#1366 (session_01623JMaqdrkxzceVWuZCknx).**
  - Sync with ship. Keep ship's `--flag-slot-top`; delete your
    `body[data-gap-drop]` announce rules and the body mirror in `gapForm`.
  - Take your converted INPUTS `top` with `--inputs-below-limits` over ship's
    `+1.75em + 8px`.
  - Keep both sides of `hud-fit-idempotent.test.mjs`.
  - Re-run the `phoneL-chase` and `phoneL-cockpit` survey cells; attach them
    to the PR.
- **#1351 and #1346 (session_01YGZnYLe9ukMtbnhEYSSqNd).**
  - #1351:
    - Push the two test rewrites as intent checks (rect or numeric), not new
      literal regexes.
    - Drop the INPUTS `top` hunks and the `data-announce-lane` hunk.
    - Measure 667×375 steer-buttons @150% and 360×740 portrait for the
      `max-content` grid.
    - Sync after #1366 lands.
  - #1346: move the compact cap into the fit's `--sheet-scale` so the
    `ui-resize` keyboard test's `zoom == --sheet-scale` holds; do not edit the
    spec.
- **#1360 (session_01EvZXBc3HPomXFBoWtPSTDL).** None; land on green.
- **Allocator branch owner.** Wait for #1366 and #1351, then open a draft PR.
  Confirm that the centred-card portrait case (no lane vars) paints centred,
  using the 393×852 radio cell #1351 measured. Note the `mirror-pass.js`
  render-rule check in the PR body.
- **#1345 (merged; session_014eQTGG1xiP85ngiYNdj9jL).** None. Its INPUTS line
  is replaced by #1366's during the sync; re-check phoneL-chase after.

## Addendum: re-check against ship `107d232`

- **#1360 has merged** (`05a7375`), which completes step 1. The other branches
  conflict with ship on exactly the same files as before.
- **#1351 is now at `aaf2f84`.** It merged a ship snapshot from before #1345
  and rewrote the three guards: hud-inputs, hud-helmet-placement and the
  cssClasses ratchet.
  - **The guard rewrites are justified.** The helmet test now pins that ERS has
    no `position-anchor` to the tyre, which is the right intent. The hud-inputs
    test now pins the whole new `top:` string with an anchored regex: a
    literal pin again, not a check of intent.
  - **The asks are not done.** The INPUTS `top` hunks and the
    `data-announce-lane` hunk are still in the branch.
  - **It still conflicts with ship** in css/hud.css, on #1345's INPUTS line.
    GitHub builds no merge ref for a conflicting PR, so this push started no CI
    run (`ci-watch`: "no workflow run yet"). The guards have not been proven
    green on CI.
  - The order in the main table stands: sync after #1366 and drop the two
    hunks.
- **#1346 is now at `7ab5147`.** It fixed the red by changing the spec rather
  than the CSS. The keyboard-inset wait now expects
  `min(--sheet-scale, min(--ui-scale, 1.25))` when the page is compact and the
  short media query matches.
  - This restates the CSS inside the test. The 1.25 literal and the
    media-query string are copies of `tokens.css` / `menus.css`, so the test
    goes stale if either file changes.
  - It also accepts a painted zoom below the scale classifyFit chose.
  - It is not a wider tolerance (the 0.001 check is unchanged), so the PR can
    go green. Still, putting the cap in SheetShape (where `--sheet-scale` is
    written) remains the better fix: then the fit, the paint and the test agree
    without the test copying CSS.
  - **Verdict:** SAFE to land once CI is green; it is independent of the HUD
    PRs. Moving the cap into SheetShape is now a follow-up, not a blocker.
- **#1366 is unchanged** at `abafc38` and still CONFLICTING with ship. The sync
  asks above still apply.
- **The allocator has moved to `d7d394d`.** The new commits add side-column
  zoom (`--rcol-z` / `--lcol-z`), `--centre-band-top`, column metadata in
  `HudLayout.ELEMENTS`, and an edit to `hud-layout.spec.js`. It still
  conflicts with ship on the same three files. The order stands: it lands
  after #1366 and #1351.

## Addendum 2: ship `184507f`

- **#1366 (`7e8cf4a`) synced as asked.**
  - It keeps ship's `--flag-slot-top`.
  - Its `body[data-gap-drop]` rules and the `gapForm` body mirror are gone.
  - The converted `#hud-inputs` top with `--inputs-below-limits` is kept, and
    #1345's `+1.75em + 8px` line is gone.
  - It merges cleanly with ship. CI is running.
  - **Verdict: SAFE** once CI is green.
- **#1351 (`bdf4cff`) is trimmed.**
  - The INPUTS-top hunks, the `data-announce-lane` hunk and the hud-inputs
    test change are gone. What remains is the translate / reduced-motion fixes,
    the helmet anchor removal, the grid tracks and the portrait `capBot`.
  - It merges cleanly with ship and with #1366, in either order.
  - In a simulated merge of ship + #1366 + #1351 (`20fc2c4`), `#hud-inputs`
    has one `top` formula (the touch and desktop homes, both #1366's), and
    693/693 HUD and CSS unit tests pass (`hud-*.test.mjs` plus every unit file
    that reads hud.css, touch-controls.css or hud.js).
  - The helmet guard pins the intent (no `position-anchor` on helmet ERS) plus
    the one rule that replaces it.
  - **Verdict: SAFE** once CI is green; it no longer depends on #1366's order.
  - Still open, as a non-blocking follow-up: measure the `max-content` grid
    at 667×375 with steer buttons @150%, and at 360×740.
- **#1346 (`7ab5147`) is red again, on a phone-landscape screenshot.**
  - `menu-baseline.spec.js` "menu identity — phone-landscape › garage looks
    like itself" differs from `garage-phone-landscape.png` by 16,983 px (6%).
    The desktop garage cell passes (run 38049517942, job 114207292353).
  - The cap is on `.sheet` under compact density, so this is the visible
    effect of the cap on the phone garage. It is not a flake.
  - The owner has to show the new look is intended and re-baseline it, or fix
    the cap so the phone garage paints as before.
  - **Verdict: FIX-FIRST.** It is still independent of the HUD PRs.

**Correction to addendum 2 on #1346:** I blamed the cap for the red, and that
was wrong.
- The `menu-baseline` phone-landscape garage diff is 16,983 px, exactly what
  ship's own Pages run 38045606891 measured without #1346.
- The cause is the golden: it shows `BUDGET: -525 / 780 cr remaining`, but free
  play now renders `FREE BUILD: ON`.
- #1391 (`184507f`, merged 12:19Z) pins FREE BUILD off in the spec. #1346's head
  `7ab5147` does not contain `184507f`, so this red is inherited from ship.
- **Verdict back to SAFE once CI is green.** The check: once #1346 has ship
  merged in, `menu-baseline.spec.js` must pass. A different pixel count there
  would mean the cap really does change the phone garage.

## Addendum 3: #1375 (size ratchets) and #1394 (hud-pins)

These are simulated merges on ship `184507f` plus #1375 `63130b8` and #1394
`d4840ef`, measured with `tools/check/ratchets.mjs` and
`node --test` on #1394's hud-pins unit test (which exists only on that
branch). Both PRs merge cleanly with ship.

| on top of ship + #1375 + #1394 | hud.js codeLines / lines | hud.css codeLines / lines | ratchets | hud-pins |
|---|---|---|---|---|
| nothing else | under the 1330 / 2246 ceilings | under the 1917 / 2109 ceilings | pass | 2 pass, 3 todo |
| + #1366 | 1345 / 2281 (+15 / +35) | 1926 / 2120 (+9 / +11) | **OVER** | 2 pass, 3 todo |
| + #1351 | 1348 / 2268 (+18 / +22) | 1924 / 2117 (+7 / +8) | **OVER** | 2 pass, 3 todo |
| + #1366 + #1351 | 1363 / 2303 (+33 / +57) | 1933 / 2128 (+16 / +19) | **OVER** | 2 pass, 3 todo |

**New unsafe pairs: #1375×#1366 and #1375×#1351, in either order.**

- **If #1375 lands first,** each HUD PR's merge ref goes over its ceiling
  and fails Structural guards.
- **If either HUD PR lands first,** #1375's ceilings sit below the merged
  tree, so #1375 itself goes red.
- **Cheapest order:** land #1366 and #1351 first. Then re-measure #1375's
  ceilings on that tree (`node tools/check/ratchets.mjs --update`, with the
  reason in the commit) and land #1375 last.
  - The alternative makes each HUD PR delete 15–33 code lines that the
    allocator then rewrites anyway.
  - If #1375 must land first, each HUD PR needs a stated raise in its own
    diff instead.
- **#1394 is safe in any order.** The two live pins pass on every combination,
  including both HUD PRs. The three `todo` pins (F-01, F-02, F-06) name the
  allocator branch and post-#1366 work as their fixes. When those land, each
  `todo` must flip to a real assertion in the same PR.
- **`physics-baseline-provenance.test.mjs` is not a ship red** (corrected by
  the audit session). It fails only in a shallow clone, where `b4df4321d` is
  missing. After `git fetch --unshallow` it passes 5/5. Do not re-bless
  `tests/data/physics-baseline.json`.

**Merge order, revised:** #1346, #1366 and #1351 (any order once each is
green) → #1394 (any time) → #1375, re-measured on the merged tree → close
#1316 → the allocator, as a draft PR against #1375's ceilings, paying for its
growth or raising them with a stated reason.

## Addendum 4: #1366 merged (`325100c`, 12:40Z)

- **#1375 is FIX-FIRST.** On ship + #1375 it is now over its own ceilings,
  exactly as predicted: hud.js +15 code lines / +35 lines, hud.css +9 / +11.
  Re-measure the ceilings on ship (`ratchets.mjs --update`, with the reason)
  before it lands. #1351 then adds hud.js +18 / +22 and hud.css +7 / +8, so
  land #1351 first or the re-measure has to happen again.
- **#1351 (`bdf4cff`):** still merges cleanly. SAFE once CI is green.
- **#1346 (`5a2ded8`):** merges cleanly. SAFE once CI is green.
- **#1316:** conflicts in five files, and its Phase 0 has now shipped as #1366.
  Close it.
- **Allocator (`868a050`):** conflicts with ship in hud.css, hud.js and three
  HUD unit tests. It must sync onto #1366's merge before it opens as a PR.
