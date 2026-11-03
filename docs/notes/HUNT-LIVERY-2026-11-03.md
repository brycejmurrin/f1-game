# Bug hunt: livery pipeline (2026-11-03)

Kind: measurement · Re-measure-by: 2027-02-01

Lane 14 of HALF:front (cursor). Slice: `js/car/livery*.js`, `js/car/liverytex.js`,
`js/car/custom-liveries.js`, `js/car/crest-*.js`, `tests/unit/livery*`. `car-draw.js`
held by #4523 — not edited. Correctness / edge cases / visual defects; not a perf pass.

Method: Board claim on #1780 → open-PR OWNED scan (clear) → prior-art skim (DEFECT-LEDGER
livery/crest rows; recent fixes `#4477` null customs, `#3609` atlas dispose, W13b contrast)
→ apex-lsp outlines → code-hunter on the OWNED slice → finding-verifier on the top six
(all CONFIRMED). No browser.

## Ranked findings (player impact ÷ fix risk)

| # | Where | Verdict | What | Action |
|---|-------|---------|------|--------|
| 1 | `js/car/custom-liveries.js:30-31` `normalizeImported` | CONFIRMED (throws) | `.map((liv) => liv.id)` has no null/object guard. Share-code keeps null slots (`!l \|\| l.id !== replaceId`), so an import of a hole-y custom list throws and aborts the apply. `getCustomLiveries` already filters; this door did not. | **Fixed:** filter `liv && typeof liv === "object"` before map. Test: `livery-paint-zones.test.mjs` ("normalizeImported drops…"). |
| 2 | `js/car/liverytex.js:1086` `driverCode` | CONFIRMED | `x.num === num` is strict. `resolveRaceNumber` returns `numberOverride` as-is, so a string `"63"` misses the driver row and the cockpit/fin "code" badge falls back to the team short name. | **Fixed:** loose `==`. Test: `livery-stations.test.mjs` string num. |
| 3 | `js/car/livery-graphics.js:335-344` `drawTailTop` streaks | CONFIRMED | Crown streaks stroke an ink edge (`T.a` / `T.lw`); the tail continuation fills only. On a pale cover the crown still reads and the tail fades. Same class as the carbon keyline parity already pinned in `fin-design.test.mjs`. | **Fixed:** mirror crown ink strokes on the tail arm. Test: `livery-cover-graphics.test.mjs` streaks parity. |
| 4 | `js/car/liverytex.js:1819-1944,2114` `tricolour` dual id | CONFIRMED | `"tricolour"` is in both `SPINE_LOGO_IDS` and `LiveryDesign.PATTERNS`. Picking it sets `paintDesign` **and** runs `drawSpineTop` (airbox flash bands), so two arts stack on `REGIONS.crest`. The editor comment at `livery-design-editor.js:184` already notes the dual id (pill dedupe only). | **Not fixed this PR:** `livery-contrast.test.mjs` "the tricolour is two colours…" asserts the `0.97` band fills from `drawSpineTop`; skipping the band path when `paintDesign` is set would red that gate. Needs a deliberate product call (rename design id vs. exclusive painters) + contrast re-baseline. |
| 5 | `js/car/custom-liveries.js:169` `pickLivery` | CONFIRMED | `v[k] = l[k] \|\| null` coerces `""` to `null`. An imported `sponsors: ""` becomes team-default sponsor wordmarks; `finHandoff: ""` becomes `"match"` via `finHandoffOf`. | Listed — `\|\|` → `??` (or `!= null`) is a wide contract change across every `LIVERY_FIELDS` key; needs its own PR with a field-by-field check. |
| 6 | `js/car/livery-design.js:76-88` `designPair` | CONFIRMED | `DESIGN_FLOOR` 2.0:1 applies only when `patternTint` / `patternSecond` are **absent**. Authored same-RGB (or cover-matching) picks still land below floor for lightning / twoTone / keylineSplit. | Listed — authored-pick policy (floor vs. honour the pick) is the same debate as the contrast "a colour you PICK" test; do not silently clamp. |
| 7 | `js/car/livery-design.js:334-335` `deckSplit` | CONFIRMED | Primary `fillRect` width is `offset + 1.2` with no clamp. `patternOffset: -40` (legal range) yields width ≤ 0 → Canvas no-op → one-colour deck. | Listed — clamp width / split at `offset` with a min band. |
| 8 | `js/car/livery-stations.js:12` `on()` | CONFIRMED (by design today) | Missing `colors` treats every station as on. Call sites that omit `colors` paint nose/cockpit/pod/halo. | Listed — only change if a caller is proven to omit `colors` by mistake; the stations unit test pins "on by default". |
| 9 | `js/car/custom-liveries.js:50-51` orphan `selectedId` | CONFIRMED | After remap, an unknown `selectedId` can survive until a later `coherentImportedSelection`. Share-code and garage import both call coherent afterward; a future caller of normalize alone would not. | Listed — fold coherent into normalize, or document the two-step contract in the module header. |
| 10 | `js/car/liverytex.js:1648-1668` mobile scratch canvas | PLAUSIBLE | Module-level `scratchCanvas` reused on mobile atlas builds. Safe if builds stay sequential; overlapping builds would share one bitmap. | Listed — confirm no async overlap before per-build canvas. |

## Covered and cleared

`custom-liveries.js` (normalize / coherent / pick / resolve / wingColor), `livery-design.js`
(PATTERNS / designPair / paint / drawAtlas / history), `livery-stations.js` (paint / emit /
haloOf / toggles), `crest-paths.js` (all eight traced teams), `crest-draw.js` (tracePath guard,
CRESTS, EMBLEMS, dressEmblem), `livery-graphics.js` (spine/tail arms skim + streaks parity fix),
`liverytex.js` (driverCode, resolveRaceNumber, paintDesign / spineLogo branch, finHandoffOf,
atlas build order around design wrap).

## Not covered (next hunt)

Lower `liverytex.js` wordmark / number / spine-side arms (~800 lines), full emblem raster
legibility at badge size, `Liveries` catalog data (`liveries.js` is outside `livery*.js`),
garage editor UX outside OWNED (`setup-sheet.js` / `livery-design-editor.js`).
