# Test-semantics audit — dated record (2026-08)

Dated record: output of the 11-agent test-semantics-audit workflow (8 batch
auditors reading all 162 test files in full; one taxonomy+CI designer; one
feasibility skeptic). This is an EXECUTION PLAN feeding the W2 restructure
(tests/ split + change-aware CI); items are worked off against it and it
archives when spent. The per-file verdict appendix is the evidence base; the
uncompressed result (verdicts with weakSpots and overlap fields the table
drops) is [raw/2026-08-test-audit.json](raw/2026-08-test-audit.json).

---

Everything below is grounded in the files read this session: `package.json` test scripts, `docs/TESTING.md` §1–2, `tools/pick-tests.mjs` (RULES + `--since`), `.github/workflows/ci.yml` (full header), `tests/unit/test-groups.test.mjs`, `tests/unit/test-coverage-audit.test.mjs`, `playwright.config.js`, and `docs/research/AUDIT-SYNTHESIS-2026-08.md` §R2.

# Test taxonomy, tests/ split map, and change-aware CI design

## 1. Group taxonomy

Group **names stay stable** (19 docs cite them; `tests/unit/test-groups.test.mjs:66-74` asserts the docs table ↔ `package.json` in lockstep, and `RULES` in `tools/pick-tests.mjs` must keep resolving — its own guard at test-groups:35-42 enforces that). Two new groups are added: `foundation` and `gallery`. Every membership change below is a coordinated 3-file edit: `package.json` + `docs/TESTING.md` §2 table + (where routing changes) `tools/pick-tests.mjs` RULES.

### 1a. Files that move groups (regroup verdicts)

**The 16 circuit-foundation specs leave `test:physics`.** They contain zero driving-model physics; the `physics-` filename prefix exists only to be caught by `test:physics`'s `tests/physics-*.spec.js` glob (package.json:15), so today every driving-model edit pays ~16 circuit builds it cannot break, while `js/circuits/` edits (routed by pick-tests to `circuit`+`scenery`, RULES line 56) never run them — misgrouped in **both** directions.

- Rename `physics-<circuit>-foundation.spec.js` → `<circuit>-foundation.spec.js` (abudhabi, albert-park, bahrain, cota, hungaroring, imola, monaco, montreal, monza, qatar, redbull, spa, suzuka, vegas, zandvoort) and `physics-interlagos-migration.spec.js` → `interlagos-foundation.spec.js`.
- New group: `"test:foundation": "node tools/run-playwright.mjs tests/*-foundation.spec.js"` (after the tests/ split: `tests/specs/*-foundation.spec.js`). All 16 land here and nowhere else.
- `test:physics`'s glob now matches exactly `physics-characterization` + `physics-fixes` — the two genuine physics files — so the glob can stay.
- pick-tests RULES: add `foundation` to the `js/circuits/` rule (line 56 → `["circuit", "scenery", "foundation"]`) and to the track-engine rule (line 52-53 → `["circuit", "physics", "sweeps", "foundation"]`). Remove nothing — RULES are deliberately over-wide by design (header lines 16-18).
- `docs/TESTING.md` §2 gains a `foundation` row under "Track & scenery"; the §5 family glob row (`physics-*` per test-groups:81-82) is re-pointed at `*-foundation.spec.js`.

**Gallery specs leave `test:ui`.** `ui-audit.spec.js` (63 shots, 0 expects, 13–108 s each — it dominates test:ui's wall time) moves to a new on-demand `test:gallery` group, absorbing `ui-desktop.spec.js` (see merges). `test:ui` becomes: `ui-button-touch`, `ui-scale`, `hud-layout`, `menu-keyboard`, `menu-survey` (menu-survey stays only because its verdict is strengthen, not regroup — see 1c#8). `test:gallery` names explicit files, so `test:audit` / `test-coverage-audit.test.mjs` still sees topical coverage and nothing goes orphan. `test:gallery` is **not** added to any pick-tests rule — galleries are run on purpose, like `tests/manual/`.

**De-duplication of double-billed specs** (each currently executes twice when its two groups co-run, which pick-tests makes routine — `js/game.js` selects `behaviour`+`api`+`circuit`+`physics` at RULES:72):

| Spec | Today | After |
|---|---|---|
| `world-physics.spec.js` | physics + behaviour | **behaviour** only |
| `active-aero.spec.js` | physics + behaviour | **behaviour** only (pairs with aero-zones, whose trade tests it partially duplicates) |
| `physics-fixes.spec.js` | physics glob + behaviour | **physics** only (glob keeps it) |
| `elevation-tracks.spec.js` (heaviest file in the batch, ~24 s × 40 circuits) | physics + circuit | **circuit** only |
| `new-hooks.spec.js` | api + hooks | **hooks** only (post-split, see 1b) |
| `collision-ai-fixes.spec.js` | collision glob + behaviour glob + barriers | collision + barriers only — `test:behaviour` drops its `collision*.spec.js`/drift/offtrack members entirely |

Resulting `test:behaviour` = `world-physics, physics-fixes→(no, physics), active-aero, aero-zones` → final: `world-physics.spec.js active-aero.spec.js aero-zones.spec.js`. Coverage is unchanged for every pick-tests selection: game.js edits still select behaviour **and** physics **and** circuit, so the union is identical — each spec just runs once. `test:barriers` keeps `tracks-walls + collision-ai-fixes` unchanged (no pick-tests rule routes to it; it is a manual convenience group).

### 1b. Splits

1. **`agent-view.spec.js`** (1857 lines, ~90 tests, 30+ min monolith) → 4 files, all staying in `test:agent`: `agent-view-contract.spec.js` (world/trackInfo/agentHelp + size budgets), `agent-view-render.spec.js` (rasters), `agent-view-scene.spec.js` (scene/describe/query/carView), `agent-view-survey.spec.js` (survey/rollout/atmosphere).
2. **`career.spec.js`** (2049 lines, ~80 tests, documented 120 s-budget fights) → `career-core.spec.js` (save versioning/migration, GP↔career isolation, slots), `career-economy.spec.js` (garage/R&D/objectives/rollover/sponsors/reliability/settlement), `career-ui.spec.js` (hub, MY TEAM roster, modes screen, guides). All three in `test:career` and `test:modes`.
3. **`new-hooks.spec.js`** lines 509-877 (the Silverstone/COTA/Miami/Jeddah/Singapore/Madrid/Shanghai foundation-diagnostics half) → `track-foundation-diagnostics.spec.js`, into **`test:foundation`**. The remaining hooks-contract half stays as `new-hooks.spec.js` in `test:hooks` only (dropped from `test:api`, closing the api+hooks double-run). Both new files switch their import from `@playwright/test` to `./fixtures.js` while being touched.
4. **`parts-physics.spec.js`** (1481 lines, ~70% geometry under a "physics" name that misleads pick-tests) → `parts-geometry.spec.js` (Car3D/CarMesh geometry contracts, visual recipes, shader-parity strings); the final ERS-battery test (lines 1415-1481, 3 monza rebuilds) moves into `parts-ers.spec.js`; catalog/getMods/getCost/resolveSetup/statMult stay in `parts-physics.spec.js`. The `parts-*` glob (package.json:20) absorbs the new name automatically; `test:fast`'s explicit `parts-physics.spec.js` reference still resolves.
5. **`steering.spec.js`** lines 292-405 (keyboard/pedal input-latch block — `js/game/input.js` territory, no race build needed) → moved into `touch-steer.spec.js` (its verdicted natural home: same module, same page-boot-only cost, same fixtures import). No group change; both are in `test:steering`.

### 1c. Strengthen list (weak/vacuous asserts, file:line + one-line fix)

**STATUS 2026-08-07: 14 of these 21 landed** in the W1.5 batch (commits
`46b999e8`, `89f6889d`, `6112fb74`, `f9bbf479`) — items 6, 7, 8, 9, 12, 13, 14,
15, 16, 17, 18, 19, 20, 21. **Still open: 1, 2, 3, 4, 5, 10, 11**, tracked as
design tickets in CAMPAIGN-2026-08.md (items 3-5 and 10 were deferred only
because the camera group was running at the time, so they are mechanical, not
decisions). Item 9's premise is now historical: `FLOOR` is 54 with a
`FLOOR_SLACK` of 5, and the ratchet runs against the real tree inside
`tooling-fast`. Landing item 14 also flushed out a genuinely stale pin — the
Mexico terrain test had been asserting a flatness the circuit stopped having.

Fixes 1–2 are flagged DEFER in AUDIT-SYNTHESIS ("per-test design decision, not a mechanical fix") — carry them as design tickets, not batch edits:

1. `tests/specs/camera-driving-hooks.spec.js:191-193` — spin computes before/after headings, asserts neither: assert `after !== before` and sign against the spin argument.
2. `tests/specs/headless-api.spec.js:290-303` — "obs() returns false when player not initialised" accepts both outcomes: pick one contract and assert it.
3. `tests/specs/camera-driving-hooks.spec.js:209-217` — title claims "zeroes vLat and yawRate", only vLat asserted: add the yawRate expect.
4. `tests/specs/camera-driving-hooks.spec.js:12-17` (and camera-hooks:9-16, camera-tuner:11-16) — fixed 3 s sleeps: replace with `waitForFunction` on `__apex.info().track`; also import `./fixtures.js` instead of `@playwright/test`.
5. `tests/specs/camera-hooks.spec.js:19-33` — dolly never checks the eye landed at the requested (frac, lateral, height): assert eye position against `Tracks`-projected expectation within a band.
6. `tests/specs/collision-ai-fixes.spec.js:131` — "speed is scrubbed against Monza barrier" passes on coasting drag alone: add a no-wall control run and assert scrubbed < control − margin.
7. `tests/unit/css-layers.test.mjs:63` — a file that loses its opening `@layer` wrapper is silently skipped: add a roster test that every `css/` file except `tokens.css` opens with `@layer`.
8. `tests/specs/menu-survey.spec.js:57-165` — tests 30/33-36/40-43 have zero expects: one-line DOM assert per captured state (cycleTo landed on TILT/MANUAL, sound/music toggles reflect state), and delete the `.catch(() => {})` at :162 that green-lights a broken campicker.
9. `tests/unit/fixture-consumer-audit.test.mjs:5-19` — the FLOOR=31 adoption ratchet is dead code from CI's perspective: add `assert.deepEqual(fixtureImportViolations(readSpecs()), [])` and `adoption(readSpecs()).uses >= FLOOR` so the guarantee actually runs in `test:tooling-fast`.
10. `tests/specs/map-hooks.spec.js:32-33, 43` — north-up claimed but only span asserted, and `orbit()` has no assertion after it: pin a known-frac landmark's normalized map position; assert `camState` changed after orbit.
11. `tests/specs/parts-livery-contrast.spec.js:29-51, 240-254` — the ink half tests its own inline mirror of buildAtlas: export the atlas's real lum/ink helpers and assert against those.
12. `tests/specs/props-over-road.spec.js:57-59` — "Shanghai uses the default baseline" asserts a literal in the same file: delete it (the real check runs inline at :144-145).
13. `tests/specs/scenery-kits.spec.js:82-88` — "emits validated street kit facilities" never asserts the theme: return the resolved theme from the evaluate and assert it; make the vertex bound fail on a missing `vertices` field.
14. `tests/specs/terrain-over-road.spec.js:246` — road faces >1.5 m over the line pass everywhere: gate the exemption on `CROSSOVER_TRACKS` (the :203 frac-distance filter already handles the three known tracks).
15. `tests/specs/tracks-walls.spec.js:37-53, 89` — test 2 builds all ~40 circuits to assert 5 street circuits: build just those 5; and make `if (r.skip) continue` a failure — a track whose `race()` failed must not vanish.
16. `tests/specs/webgl-probes.spec.js:27-34, 79-98` — typeof-only `hdrMode()`/`lightState()` shape tests: fold into the adjacent behavioural tests (night>day, shadow-transform).
17. `tests/unit/coplanar-faces.test.mjs:58` — the `>= 24` roster floor against 40 circuits: assert against the `js/circuits/` file count (the fix `prop-clipping.test.mjs:65-67` already made).
18. `tests/specs/parts-budget.spec.js:40-41` — duplicated `toContain("600")`: make the second assert spent-vs-remaining.
19. `tests/specs/smoke.spec.js:212-219` — minimap "content" is a width>0 check: sample pixels via getImageData (copy telemetry-compare:88-93's pattern).
20. `tests/unit/race-control.test.mjs:116-126` — the 90 s cap it names is never exercised: add the cap-expiry test (flag drops after the cap once the picture clears).
21. `tests/specs/carview-parts.spec.js:5` — stale "eight parts categories" title vs the twelve asserted: fix the title.

**Five more found by RUNNING the suite, not by reading it** (landed `75ae72f9`,
`85a91f40`). Both are the audit's own weak-assertion class, and neither was
visible to a reader — which is the argument for running a converted spec at its
known-good count rather than trusting a review:

22. `tests/specs/agent-view.spec.js` — "full paginates the raw object list" asserted
    that page 2's first object differs from page 1's last, as a proxy for "pages
    do not repeat". Not a property the data model has: the `detail:"full"`
    projection drops `k`, `measured` and rotation, so genuinely distinct props at
    one point serialise identically (monza has 20 such adjacent pairs in 2690,
    verified headlessly through `verify-track.cjs`'s VM harness). It held only
    while no pair straddled the 50-boundary, and `89ce4f2f`'s corner-board side
    fix reordered the list. **LANDED**: each page must BE the corresponding slice
    of the whole list, plus the offset/total bookkeeping.
23. `tests/specs/camera-driving-hooks.spec.js` — "setSpeed sets player speed" set the
    value in one `evaluate` and read `probe()` in the next. `headless(true)` only
    skips RENDERING (`js/game/apex.js:1513`), so the physics loop coasts the car
    across the round-trip: measured 54.498 against a `toBeCloseTo(…, 1)`
    tolerance of 0.05, latent until load stretched the gap. **LANDED**: both
    values sampled in one `evaluate`.
24. `tests/specs/audit.spec.js` — "crossing the line, reversing back over it and
    re-crossing counts ONE lap" shipped using `step(90)/step(120)/step(150)`
    while its OWN commit (`7e3bafd3`) says both lap tests "step until the counter
    moves rather than guessing frame counts — a fixed budget either stops short
    of the line or sails 100 m past it". The fix was written once, claimed for
    both, applied to one; the unfixed one then failed exactly as predicted,
    46 m short. **LANDED** `afd546ed`: the stepping loop is installed into the
    page once and shared, so the two cannot diverge again, plus the sibling's
    anti-vacuity check.
25. `tests/specs/elevation-tracks.spec.js` — the `flatMax` "flat-out reference" was
    measuring **the length of the start straight**, not a top speed. It holds
    `steer: 0` for three seconds, which drives straight while the road turns, so
    on most circuits the car is in the runoff within a second and its speed
    collapses to ~9 m/s (probed: monza 41.8→22.9 at x=-7.9; paul_ricard
    38.8→9.1; cota 40.8→9.1; monaco 41.9→10.1; only spa and hungaroring stayed
    on). That is why cota/paul_ricard "failed" and spa "passed", and it poisoned
    everything downstream — the descent check compares `maxV` against
    `flatMax * 1.35`, a reference set by a car in the gravel. **PARTIAL** —
    `58614db2` + `0f458925`: sampling stops when `|x|` exceeds the road
    half-width, and that half works: monaco, monza and spa all ran off the road
    in the probe and all pass now. The accompanying minimum on-road dwell does
    NOT: I picked `> 30` steps out of the air on a single data point, and cota
    lands on exactly 30 — the same "threshold with no basis" the original `> 41`
    was criticised for, one layer down. cota's start-line straight is simply too
    short to yield half a second on the road, so no dwell number fixes it; the
    reference has to be taken on the STRAIGHTEST stretch of the lap (lowest mean
    `|k|` over a window, via `trackProfile`) rather than at frac 0.0. OPEN.
26. `tests/specs/elevation-tracks.spec.js` — the climb assertion contradicted its own
    comment: the prose says "just require the car is still moving", the code
    said `climbGain > 0.5`, which demands ACCELERATION. **LANDED** `2b2ab54c`.
27. `tests/specs/tracks-walls.spec.js` — two tests each rebuild all 40 circuits inside
    ONE test case. `test.slow()` (360 s) was still not enough: measured 378 s
    with the box idle. No timeout value is the right fix — **split per circuit**,
    which also turns "the walls are broken" into "the walls are broken at Baku".
    OPEN.
28. **A whole CLASS, not one test**: a `page.evaluate()` callback that closes
    over a Node-side binding. Playwright does not CALL that callback — it
    serialises it, ships it to the browser and evaluates it there, so a module
    `const` read inside is a `ReferenceError` in the page, not a closure, and
    the test fails for a reason unrelated to what it asserts. Self-inflicted:
    `58614db2` did this with two launch constants and killed all 47 elevation
    tracks, four of which had been green, and it presented as a physics
    regression. **LANDED** `466ba98a` — `tools/evaluate-scope-lint.mjs`
    (eslint-scope, the same free-reference analysis `extract-module.mjs`
    already uses) across `evaluate`/`evaluateHandle`/`waitForFunction`/`$eval`/
    `$$eval`. Its load-bearing test runs the analysis over the REAL broken file
    (`git show 58614db2:…`) and asserts both sites are still found, so the lint
    cannot quietly stop detecting while its synthetic cases keep passing.
29. **The environment class**: a guard that only runs on ONE MACHINE. Three
    added on 2026-08-07 passed locally and could not execute in CI at all —
    `pick-tests`' `--since HEAD~1` and `evaluate-scope-lint`'s `git show <sha>`
    both need history the guards job's depth-1 checkout does not have, and
    `test-observed`'s observed-half needs `artifacts/logs`, which is gitignored
    and absent there. All three turned the guards job red for environment facts
    rather than defects. **LANDED** `9cd75f1e` + `0d4cf538`: same properties
    pinned against things that exist everywhere, and only the half that needs
    the missing input is skipped. The practice that follows is in
    docs/TESTING.md — verify an environment-sensitive guard in a
    `git clone --depth 1` with no `artifacts/` BEFORE landing it.
30. **The CI-BUDGET class**: an assertion that is right and a MECHANISM that is
    too expensive for the runner. `smoke`'s "minimap canvas has content" polled
    `getImageData` over the WHOLE canvas on every tick waiting for first paint.
    Locally that is free; on GitHub's software renderer it contributed to two
    240 s timeouts (328 s, 356 s on retry) that never reached an assertion at
    all, and Chromium logged the reason both times — "Multiple readback
    operations using getImageData are faster with the willReadFrequently
    attribute set to true". The context belongs to the game, so a test cannot
    set that attribute; what it can do is stop asking for every pixel merely to
    learn whether ANY pixel is painted. **LANDED** `b7a636d3`: five 1-pixel
    strips (~5/height of a full readback) plus `test.slow()`, with the exact
    count that follows unchanged — CI smoke now passes in 14m16s.
    Item 19's strengthening was NOT the error: rewriting `width > 0` into real
    pixel sampling was right, and only the polling needed to be cheap. The
    general rule: when strengthening an assertion, cost the POLL separately from
    the CHECK — the runner is 20-40x slower at rendering than a dev box.

### 1d. Merges (merge verdicts + merge candidates)

**Do now (merge BEFORE the tests/ move — see §2):**
- `hud-audit.spec.js` → **into `hud-layout.spec.js`**: its assertHud (:39-45) is a strict subset of hud-layout's real geometry checks; keep the 8 screenshots as an extra shot per existing mode/orientation combo. File deleted; leaves test:ui shorter.
- `ui-desktop.spec.js` → **into `ui-audit.spec.js`** as two more viewport rows (strict subset of ui-audit's screens; 0 expects). File deleted; rides along into `test:gallery`.
- `tests/manual/inspect.spec.js` → **into `tests/manual/blank-scan.spec.js`**: byte-identical capture loop; one pass asserts blanks AND writes the contact sheet, halving the 40-circuit run. Update `tests/manual/README.md`.

**Merge candidates (flagged, not scheduled):**
- `active-aero.spec.js:214-261` trade tests vs `aero-zones.spec.js`'s "downforce traded for top speed" block — same trade against the same constants; collapse into aero-zones when either is next touched.
- `physics-monaco-foundation` test 2 (:140-220) — hand-copied `props-over-road` scan with an identical 1.4 cap to props-over-road:52; **drop it** in the foundation rename commit (one of the two is dead weight, per verdict).
- `physics-spa-foundation` test 3 (:52-147) and `physics-zandvoort-foundation`'s ~170-line `propClearance` helper — third and fourth hand copies of the shared corridor scan: extract to `track-helpers.js` or drop in favour of the all-circuit audit.
- `albert-park-foundation.test.mjs` + `baku-migration.test.mjs` — parameterise into one shared circuit-characterization suite when a third circuit joins the pattern (verdict: two files don't yet justify churn).
- `parts-ers.spec.js` absorbing parts-physics's ERS test is already scheduled under splits (1b#4); the four ERS sweeps in parts-ers should share one page load while touched.

## 2. tests/ split map

Base plan is AUDIT-SYNTHESIS §R2 verbatim — `tests/specs/` + `tests/unit/` + `tests/helpers/`; `tests/data/`, `tests/manual/` stay; **one commit via `git mv`, never with a background run in flight, no ?v bump** — including all 13 R2 lockstep items (package.json paths; playwright.config globalSetup/reporter; the 66 `./fixtures.js` imports; the ⚠ output-paths/qr-camera symmetric-drift pair; the ⚠ `tools/fit-audit.mjs:27`/`menu-fit.mjs:32` swallowed dynamic imports; ⚠ `f1-track-accuracy.spec.js:18` `./data/`; ⚠ manual/ imports + README; the test-groups:154 + docs-integrity:343 regex widenings and flat-readdir walks; test-coverage-audit tool+test scans and fixture-consumer-audit readSpecs; ⚠ ci.yml sweeps filter; span-kinds:46/docs-integrity:217 hardcoded reads; the TESTING.md/CLAUDE.md/README count-phrase triple). Nothing here contradicts R2; the ordering rule and per-file additions below **extend** it.

**Ordering (audit feed-in): merge → regroup-rename → move → split.** The three merges in 1d delete `hud-audit.spec.js`, `ui-desktop.spec.js`, and `manual/inspect.spec.js` *before* the move (a merged file must never be moved and then deleted — it would churn the R2 lockstep edits twice), so the move relocates **109** specs, not 111. The 16 foundation renames also land before the move for the same reason (one path rewrite per file, not two). The splits (1b) land *after* the move, inside `tests/specs/`, so their new filenames never exist at the old paths.

Per-file mapping:

| Destination | Files |
|---|---|
| `tests/specs/` | All `*.spec.js` (109 post-merge): the 16 renamed `*-foundation.spec.js`, and every other root spec named in the package.json groups — smoke, dev-tools, logging, headless-api, obs-act-edge, new-hooks, data-lifecycle, telemetry-compare, assets-api, persistence, wake-lock, camera{,-hooks,-driving-hooks,-tuner}, map-hooks, world-physics, longitudinal, elevation-tracks, projection, active-aero, understeer-cue, physics-characterization, physics-fixes, collision{s,-deep,-ai-fixes}, drift, offtrack, debris, race-control, aero-zones, tracks-walls, autopilot, audit, parts-* (all), car-effects, carview-parts, custom-team, garage-aero, presets, sliders, steering, gamepad, touch-steer, tilt-pipeline, steer-migration, ui-audit, ui-button-touch, ui-scale, hud-layout, menu-survey, menu-keyboard, menu-baseline, tracks-visual, props-over-road, terrain-over-road, f1-track-accuracy, scenery-kits, instanced-draw, webgl-probes, lighting-ab, image-grade-visual, lighting-tuner-grade, material-shimmer, tlx-probes, audio-smoke, music-library, season, time-trial, career, quali, agent-view, agent-drive-bench, agent-determinism, multiplayer-* (8), output-paths.spec.js |
| `tests/unit/` | All 48 `*.test.mjs` + `shared-track-foundation-characterization.test.cjs`: the 34 tooling-fast suites, 7 net-unit suites, 4 sweeps suites, service-worker, webgpu-lifecycle, agentview-api-contract (the breakdown sums to 48; "49" was a miscount in the original record) |
| `tests/helpers/` | The 7: `fixtures.js`, `track-helpers.js`, `qr-camera.js`, `f1-api-mock.js`, `output-paths.js`, `global-setup.js`, `live-reporter.js` |
| `tests/data/` | `f1-circuit-reference.geojson` (stays) |
| `tests/manual/` | stays: `README.md`, `blank-scan.spec.js` (post-merge), `circuits.js`, `galleries/` |

**Extensions the per-file audit adds to R2's lockstep list:**

14. **Snapshot dir moves with its spec**: `tests/specs/menu-baseline.spec.js-snapshots/` → `tests/specs/menu-baseline.spec.js-snapshots/` in the same `git mv` commit — Playwright resolves snapshot paths relative to the spec file, and these are the repo's ONLY golden baselines (CLAUDE.md); a missed move reads as "baseline missing", which `toHaveScreenshot` under `--update-snapshots` would silently re-bless. Same rule pre-arms `tests/specs/tracks-visual.spec.js-snapshots/` — the skip gate at tracks-visual:27-30 keys on that (spec-relative) dir existing, so the gate keeps skipping correctly after the move with no edit.
15. **`tests/physics-baseline.json`** sits flat in tests/ (verified on disk) and is in no R2 bucket: move to `tests/data/physics-baseline.json` and update `physics-characterization.spec.js`'s read plus whatever tool regenerates it (grep `physics-baseline` across tools/ in the same commit — the characterization gate being unable to find its committed baseline must fail loudly, and the spec's header says the baseline's presence is what makes the gate live).
16. **`tests/manual/` internals**: `manual/circuits.js` and `manual/galleries/` stay put, but R2 item 7's manual/ fix-ups shrink by one file (inspect.spec.js is deleted by the 1d merge before the move).
17. **Group-taxonomy lockstep**: the §1 package.json membership edits and the R2 path rewrites touch the same ~28 script lines — land §1's regroup/dedupe **before** the R2 move commit so the move is a pure path rewrite, and `test-groups.test.mjs` / `test-coverage-audit.test.mjs` adjudicate each step separately.
18. **New-group guards**: `test:foundation` and `test:gallery` each need a `docs/TESTING.md` §2 row (test-groups:66-74 fails otherwise) and their member files satisfy `test:audit` by being explicitly named/globbed.

## 3. Change-aware CI

Design constraints taken from `ci.yml` as read: guards ~25 s / sweeps 15m12s / smoke 14m24s are **measured** budgets (run 31023778264) and `timeout-minutes` must stay above them; a timed-out job reports `cancelled`, not `failed`, and that once hid a dead deploy behind "0 failures"; SwiftShader on a shared runner measured **90–115 s/test** (smoke-step comment), serial one-worker with `--timeout=240000` is the proven-stable shape; `concurrency` cancels **only** `pull_request` runs; pages.yml gates deploy via `workflow_call` + `needs: ci`, so jobs must always run and report (step-level conditions only, never job-level `if` — the sweeps filter comment states this explicitly).

### The `selected` job (additive, non-deploy branches)

```yaml
  selected:
    name: Change-selected groups (advisory on feature branches)
    # Never part of the deploy gate: pages.yml needs guards/sweeps/smoke, not this.
    # Skipped entirely when ci.yml runs via workflow_call from pages.yml.
    if: github.event_name != 'workflow_call'
    runs-on: ubuntu-latest
    # BUDGET (state and re-measure per the header's rule): setup ~4 min
    # (npm ci + playwright install chromium), node-only groups ~2 min,
    # browser step capped at 25 min below => 31 min worst case. 35 > 31.
    timeout-minutes: 35
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }   # --since needs the base commit reachable
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: npm }
      - run: npm ci
      - name: Resolve diff base + fallback check
        id: base
        ...
      - name: Node-only selected groups
        timeout-minutes: 5        # measured: tooling-fast ~30 s, net-unit <1 s
        ...
      - name: Browser selected groups (fixed budget)
        if: steps.base.outputs.fallback != 'true'
        timeout-minutes: 25       # 12 tests x 115 s = 23 min; cap above it
        env: { APEX_WORKERS: "1" }
        ...
```

**Diff refs (exact, per event):**
- `push`: base = `${{ github.event.before }}`, head = `${{ github.sha }}`. Copy the sweeps filter's fail-safe ladder verbatim (ci.yml:196-217): empty or all-zero `before` (new branch/first push), `git cat-file -e "$BEFORE^{commit}"` failing (force push), or `git diff` erroring each set `fallback=true`. **Fail safe, never fail open** — an unresolvable diff must not be read as "nothing changed".
- `pull_request`: base = `${{ github.event.pull_request.base.sha }}`; compute `MB=$(git merge-base "$BASE" HEAD)` (the checkout is the merge commit, so merge-base keeps unrelated base-branch churn out of the diff) and use `MB` as the ref. If merge-base fails → `fallback=true`.

**Selection**: run `node tools/pick-tests.mjs --since "$REF"`. `--since` does exactly `git diff --name-only <ref>` against the checked-out tree (pick-tests:120-121), which in a clean CI checkout is base→head. Parse the `test:<group>` lines from the "group(s) to run" block. Partition:
- **Node-only groups, run directly, uncapped** (their package.json commands are `node --test` or pure tools): `tooling-fast`, `net-unit`, `service-worker`, `webgpu-lifecycle`, `agent-contract`, `audit`. **Exclude `sweeps`/`tooling`** — the sweeps job already owns that work with its `NODE_OPTIONS: --max-old-space-size=6144` heap ceiling (job-level, to reach prop-clipping's execFileSync child); re-running it here without that env would reproduce the documented 4 GB SIGABRT-as-`cancelled` failure. Guards-job overlap (tooling-fast/audit run twice) costs ~30 s and is accepted for locality of failure.
- **Browser groups, fixed budget**: install Chromium only (`npx playwright install --with-deps chromium` — the smoke job's rationale). Budget rule, derived from the measured 90–115 s/test and the 35-min job cap: **at most 2 selected browser groups AND at most 12 total tests** (12 × 115 s ≈ 23 min, inside the 25-min step cap with margin; margin-that-thin-is-a-coin-flip is the header's own lesson). Count with `npx playwright test --list <group's spec paths> | tail -1` before running. Run serial: `APEX_WORKERS: 1` (playwright.config.js's documented override; CI default `workers: 2` is the proven oversubscription signature) with `-- --timeout=240000`. Take groups in pick-tests' sorted output order until the budget is hit.
- **Overflow**: if selection exceeds 2 groups / 12 tests, run what fits, and write the remainder to `$GITHUB_STEP_SUMMARY` as `run locally: node tools/test-bg.mjs <groups>` — do **not** fail. This job is advisory; the three-job gate below stays the authority.

### Fallback-to-full-gate rule

If the diff (or an unresolvable diff, per the fail-safe ladder) touches any **infra path**, the selected job sets `fallback=true`: the browser step is skipped with a printed reason and the node-only step runs only `tooling-fast` + `audit`. Coverage then rests entirely on the unconditional three-job gate, which is already running on the same push. Infra paths:

```
package.json  package-lock.json  tools/manifest.cjs  tools/pick-tests.mjs
tools/run-playwright.mjs  tools/test-bg.mjs  .github/**  playwright.config.js
tests/helpers/**          (pre-R2-move: tests/{fixtures,track-helpers,qr-camera,
                           f1-api-mock,output-paths,global-setup,live-reporter}.js)
index.html  sw.js  version.json      (index.html's script block IS the load
                                      order; a ?v/version.json bump invalidates
                                      every cached page — gate at file granularity)
```

Rationale: these files change what selection *means* (pick-tests RULES, group scripts, project partition, fixtures every spec loads, the shell the server serves), so a selector reading them to route its own validity would be circular. This list also matches R2 item 10's obligation to update ci.yml's sweeps filter regex to `tests/unit/(...)` when the move lands — do the selected-job path list and the sweeps filter in that same commit, or the sweeps filter fails open.

### Coexistence with guards / sweeps / smoke

Unchanged, byte-for-byte, as the deploy gate: `pages.yml` keeps `needs: ci`, ci.yml keeps `workflow_call`, and guards/sweeps/smoke keep their measured budgets (10/35/30 `timeout-minutes`) and step-level conditionality. `selected` is **additive on non-deploy branches only** — it is excluded from `workflow_call` runs so a slow advisory job can never delay or cancel a deploy, and it is deliberately *not* listed in any `needs:`. The sweeps job's geometry filter and the selected job share the pick-tests-derived worldview but stay independent implementations, per the sweeps comment's fail-safe doctrine.

### Failure-mode notes (the header's demands, restated as obligations on this design)

- **Every step states its `timeout-minutes` next to a measured figure**, and the header rule applies: change what a step runs → re-time it → change the number. The 25-min browser cap sits above the computed 23-min worst case for the same reason smoke's 30 sits above 14m24s: thin margins produced `cancelled` verdicts nobody read as failures.
- **No cancel-in-progress on push** — the existing `concurrency` block (`cancel-in-progress: ${{ github.event_name == 'pull_request' }}`) already encodes the fifteen-consecutive-cancelled-runs lesson; `selected` adds no concurrency group of its own and inherits it.
- **`cancelled` ≠ `failed`**: any step in `selected` that can exceed its cap must overflow-to-summary rather than run long; a budget overflow is a *reported decision*, never a timeout.
- **Step-level `if`, job always reports** — same pattern as the sweeps filter, so a future `needs:` consumer of `selected` (if it ever becomes gating) inherits working semantics.
- **Heap ceiling stays with the sweeps job**: `selected` must never run `test:sweeps`/`test:tooling`; the OOM story (road-under-floor SIGABRT at 4088 MB on run 31016070670, surfacing as `cancelled`) belongs to the job that carries `NODE_OPTIONS=--max-old-space-size=6144`.
- **Worker discipline**: browser steps pin `APEX_WORKERS=1` + `--timeout=240000` — the smoke step's own controlled experiment (125.2 s timeout contended → 110.6 s pass alone) is the evidence; two SwiftShader contexts on a shared runner measure the runner, not the code.

---

## REDESIGN 2026-08-07 — what the gaps resolve to, and what the tooling now supports

The gap list below stands as written. This section records how each is answered
and what has LANDED, because four of them were tooling problems, not YAML
problems — and one of those was a defect nobody had noticed.

**The prerequisite nobody checked: `pick-tests --since` had never worked.**
The whole design rests on `node tools/pick-tests.mjs --since "$REF"`.
`changedFiles()` filtered argv with `!a.startsWith("--")` to find explicit
paths, which swallowed the REF as a path — so `--since HEAD~3` reported the
literal string `"HEAD~3"` as the only changed file, matched no rule, and printed
"nothing to run". For any diff, since the flag was introduced. The skeptic found
14 gaps in the design and none of them, because it reviewed the design and not
the tool underneath it. **LANDED** `a8174e5a`, pinned by
`tests/unit/pick-tests.test.mjs`.

| Gap | Resolution |
|---|---|
| 1, 2 (blocking) | **`selected` moves to its own workflow file**, triggered on `push`/`pull_request` only and never `workflow_call`. A reusable-workflow caller aggregates EVERY job in the called workflow, so no `if:` and no absence from `needs:` can keep an in-`ci.yml` job off the deploy gate. A separate file makes it structurally impossible rather than conditionally unlikely. This also answers gap 3 by construction — the uncovered events are exactly the ones `pages.yml` triggers, and they no longer reach this job. **DESIGN SETTLED, YAML NOT LANDED.** |
| 5 | **LANDED** `a8174e5a`. `pick-tests` now merge-bases against the DEPLOY branch, not `main` — `main` is a stale diverged fork, so basing on it ballooned the changed set to most of the repo, which reads as "run everything" i.e. the tool giving up silently. `DEPLOY_BRANCH` is asserted against `pages.yml` so the two cannot drift. |
| 6 | **LANDED** `a8174e5a`. `--json` emits `{reason, files, groups[]}` and short-circuits before any prose path. `reason` separates the two cases prose renders identically and a selector must never confuse: `none` (nothing changed → run nothing) vs `unmatched` (files changed, nothing routed them → the selection is NOT trustworthy, run everything). The parsing traps the gap names — `test:fast` inside the zero-match sentence, `test-bg.mjs <groups>` in the batching lines — stop existing rather than being worked around. |
| 10 | **LANDED** `e81ccd29`. `tools/cache-bump-only.mjs` decides whether an `index.html` diff is purely a `?v=N` rewrite, so the bump commit that ends every shippable change no longer forces fallback. Pairs lines POSITIONALLY: `af05fa98` is +156/-156 and hides a real markup edit, so counts are not enough; a reordered script block has identical lines on both sides, so sets are not enough either. |
| 4, 12 | Accepted and RELABELLED rather than fixed. An advisory job running LESS when it knows less is a defensible trade; quoting "fail safe, never fail open" while doing the opposite is not. The fallback path is duplication of the guards job and should say so in its step summary instead of being framed as coverage. |
| 7, 8, 13 | **The design's headline capability does not survive its own budget** and needs re-deriving before any YAML lands. Real groups are 71–193 tests against a 12-test cap; `retries: 1` with `--timeout=240000` makes one timing-out test cost 8 minutes, not 115 s, so the cap fits only the all-pass case — the step dies exactly when the selection finds a real regression. Per-spec rather than per-group granularity is the only way this executes at all, and `visual`/`ab`/`tiny`/`baseline` still need classifying. |
| 9, 11, 14 | Mechanical; unchanged from the gap text. |

**Recommendation before landing any YAML**: gaps 7/8/13 mean the browser step as
specified would almost never run useful work, and the two most common triggers
(first push of a branch, and the `?v` bump commit) are only now unblocked. Land
the tooling — done — then re-derive the budget against measured per-spec counts,
and treat the workflow file as a separate, deliberate decision.

## Feasibility skeptic — gaps in the CI design (address before landing)

1. BROKEN workflow_call GUARD (blocking): `if: github.event_name != 'workflow_call'` never fires — in a reusable workflow, github.event_name is inherited from the CALLER's triggering event ('push' when pages.yml runs on the deploy branch, 'workflow_dispatch' on manual deploys); 'workflow_call' is a trigger name, not a runtime event_name value. The condition is always true, so `selected` runs inside every pages.yml-called CI run. Workable discriminators exist (github.ref == 'refs/heads/claude/f1-game-project-26h3ng', or a workflow_call input with a default) but the design names neither.
2. FALSE 'not in any needs:' SAFETY CLAIM (blocking, compounds gap 1): pages.yml's `ci` job (pages.yml:30-31, `uses: ./.github/workflows/ci.yml`) succeeds only if EVERY job in the called workflow succeeds — a reusable-workflow caller aggregates all jobs, so 'deliberately not listed in any needs:' protects nothing. With gap 1, a failing selected job blocks deploy, and a selected job that hits its 35-min cap reports `cancelled` — reproducing byte-for-byte the invisible-deploy-outage mode ci.yml's header documents (lines 42-47). (A job-level `if:` skip WOULD be safe — skipped counts as success — but the design's skip condition doesn't work, per gap 1.)
3. UNCOVERED EVENTS: the diff-ref table specifies push and pull_request only. Via pages.yml the workflow also runs under workflow_dispatch (pages.yml:6) and (per gap 1) push-to-deploy-branch; the sweeps ladder the design claims to copy 'verbatim' handles non-push events by RUNNING EVERYTHING (ci.yml:204 run_all), an action that has no analogue in selected — behavior for these events is simply unspecified.
4. FAIL-SAFE DOCTRINE INVERTED, AND MISLABELED: sweeps' fail-safe on an unresolvable diff is to RUN the expensive work (ci.yml:191-195); selected's fallback SKIPS the browser step and runs only tooling-fast+audit — i.e. it runs LESS when it knows less. Acceptable for an advisory job, but the design quotes the 'fail safe, never fail open' doctrine while doing the opposite, and the claim 'coverage then rests entirely on the unconditional three-job gate' overstates: guards/sweeps/smoke never covered career/parts/steering/ui/etc. groups in the first place, so on fallback those selections are covered by nothing.
5. FIRST-PUSH FALLBACK IS THE COMMON CASE: github.event.before is all-zeros on the first push of a branch (and the old, usually-unreachable sha on force-push — the ladder's cat-file rung catches that). In this repo every task lands on a fresh claude/<topic> branch, so the branch-creation push — often the push carrying the whole change — always takes fallback and the selected job degrades to duplicating guards. A better base exists and goes unused: pick-tests' own default mode (lines 124-128) merge-bases against origin/main (which exists on this remote), and the true default branch is the deploy branch claude/f1-game-project-26h3ng, reachable under fetch-depth: 0. The design never attempts either.
6. PICK-TESTS OUTPUT PARSING TRAPS: (a) the zero-match message 'no rule matched — run `npm run test:fast`' (pick-tests:146) contains the literal token test:fast — an unanchored grep for test:<group> selects test:fast for e.g. a spike/- or .claude/-only diff (neither is on the infra list, so fallback does not shield this); (b) 'no changed files — nothing to run' (line 137) and the batching lines (`node tools/test-bg.mjs api behaviour`, line 166) must also be excluded; (c) there is no --json/porcelain flag — lines 152-153 are a human-oriented, unversioned format (`test:${g.padEnd(14)} reason`) that no test asserts, so CI becomes a silent consumer of prose. The design says 'parse the test:<group> lines from the block' without pinning any of this.
7. BUDGET vs REAL GROUP SIZES MAKES THE BROWSER STEP VACUOUS: measured in artifacts/logs, test:api = 193 tests and test:agent = 126; test:tiny = 71 (ci.yml:249); career ~80 and agent-view ~90 by the design's own counts (pre-split). Nearly every browser group pick-tests emits exceeds the 12-test cap ALONE, and RULES route `tiny` (71 tests) on every js/css edit. For the flagship case — game.js → api, behaviour, circuit, physics, tiny — the alphabetically-sorted order (pick-tests:150) front-loads api's 193 tests, so under 'take groups until the budget is hit' the step runs nothing and dumps everything to the summary. The rule is also ambiguous: stop at first overflow, or skip-and-continue to a smaller group? Either way the design never states a minimum useful selection or any per-spec granularity, so the job's headline capability barely ever executes.
8. RETRY/TIMEOUT INFLATION BREAKS THE 23-MINUTE ARITHMETIC: playwright.config.js:88 pins retries:1 in CI, and the design sets --timeout=240000. A timing-out test therefore costs up to 240 s x 2 = 8 min, not the 115 s the budget uses; two-three such tests exceed the 25-min step cap with zero passing tests around them. The cap fits only the all-pass case, so precisely when the selection finds a real regression (or the runner degrades), the step dies on timeout-minutes and the job reports `cancelled` — violating the design's own obligation that 'a budget overflow is a reported decision, never a timeout'. Smoke survives the same exposure only because 30 min vs 9 specs leaves ~3 timeout-retries of headroom; 25 min vs 12 tests leaves ~1.
9. TEST-COUNT STEP AS WRITTEN DOESN'T RUN: 'npx playwright test --list <group's spec paths> | tail -1' needs the group's spec paths, which exist only inside package.json script strings (including globs like tests/physics-*.spec.js) — the design names no extraction mechanism. `npm run test:<group> -- --list` would inherit them through tools/run-playwright.mjs (which appends argv verbatim to `playwright test`), at the cost of pointlessly starting its static server; raw npx with hand-extracted paths is a second, unasserted package.json parser. Also `tail -1` on 'Total: N tests in M files' is plausible but unverified against this reporter config (three custom reporters, playwright.config.js:134-140), and the double-project concern is safe only because RENDER_SPECS/testIgnore are exactly complementary — an invariant the counting step now silently depends on.
10. INFRA GATING x BUMP-CACHE CONVENTION: index.html + version.json are on the infra list at file granularity, and the repo's hard rule (CLAUDE.md) is that every shippable change's LAST commit bumps ?v=N in index.html AND version.json. So the final push of essentially every change sets fallback=true — the browser step never runs on exactly the commits that get reviewed and merged; advisory coverage exists only on intermediate pushes.
11. THE 1a DEDUPE BREAKS ITS OWN 'UNION IDENTICAL' CLAIM (selection interaction): dropping collision*/drift/offtrack from test:behaviour removes those specs from every game.js / physics-consts.js selection — RULES route `collision` only from debrisworld/incidentsim (pick-tests:82), so after the change no selected group covers collisions, collision-deep, collision-ai-fixes, drift, or offtrack for driving-model edits (test:barriers has no rule at all, as the design itself notes). Likewise new-hooks leaving test:api removes it from js/render/assets.js (RULES:48) and js/data/ (RULES:89) selections, which route api-only. The CI selected job inherits these holes on its highest-value trigger.
12. FALLBACK PATH IS PURE DUPLICATION: on fallback the node-only step runs tooling-fast + audit — exactly what the guards job already runs unconditionally in the same workflow run (ci.yml:114-117), plus a second ~2-4 min npm ci to do it. Zero added coverage; the design frames it as a coverage story rather than the no-op it is. Minor, but it means the job's most common outcome (see gaps 5 and 10) is spend with no signal.
13. UNADDRESSED GROUPS IN THE BROWSER PARTITION: RULES emit `visual` for js/render/glx|gfx edits and `ab` for shaders/lighting — test:visual (tracks-visual) is deliberately skip-gated and would burn one of the 2 group slots plus --list-counted tests that will all skip at runtime (the gate is a runtime dir check, invisible to --list); lighting-ab.spec.js is double-billed inside test:webgl AND test:ab, so a shader edit (RULES:45 → webgl+ab) re-runs it — the design de-dupes six other double-billings but not this one, and its browser partition never classifies visual/ab/tiny/baseline at all.
14. MINOR ARITHMETIC/CLAIM NITS: (a) 'Node-only selected groups, run directly, uncapped' contradicts the same step's timeout-minutes: 5 two lines up; service-worker/webgpu-lifecycle/agent-contract/audit are unmeasured there (guards' 25 s total suggests it's fine, but the header rule the design invokes demands a stated measurement). (b) The 35 = 4+2+25 budget omits the diff-resolve, pick-tests, and per-group --list invocations (seconds each — fine, but the design's own doctrine is to state them). (c) On a branch with an open PR, push and pull_request runs both fire with different concurrency groups (ci-refs/heads/... vs ci-refs/pull/...), so selected's browser spend doubles per push — pre-existing for other jobs but selected adds up to 2x25 min of it. (d) A backward force-push whose old sha is still reachable passes the cat-file rung and yields a reversed diff (the reverted files) — conservative in direction, but worth knowing the ladder does not catch it.

---

## Appendix — per-file verdicts (162 files)

| File | Quality | Cost | Verdict | Detail |
|---|---|---|---|---|
| active-aero.spec.js | strong | heavy | keep | Exemplary relative assertions with anti-vacuity guards (asserts flap position before comparing runs, on-track checks); note it runs in BOTH test:physics and test:behaviour so it executes twice when both groups run. |
| aero-zones.spec.js | strong | heavy | keep | Every assertion is a real invariant (flicker-proof whole-trail overtake gate at L150, envelope derived from constants not literals); the 133s test.slow wing-sweep (L224-278) is expensive but self-justifying with anti-vacuity ordering checks. |
| agent-determinism.spec.js | strong | moderate | keep | Byte-identical digest comparison with both anti-vacuity halves (car actually drove >50m at L67; different seed differs at L78); exactly the guard the repo's seeded specs depend on. |
| agent-drive-bench.spec.js | strong | moderate | keep | The task-success bench (relational > 1.5x naive, >300m) is the one test that catches meaning-level regressions; recent logs show it actually failing on a live branch, i.e. it bites. |
| agent-view.spec.js | strong | heavy | split | 1857 lines and ~90 tests spanning at least five separable surfaces (world/trackInfo contract, render rasters, scene/describe/query drill-down, carView, survey/rollout) — splitting into 3-4 files would let pick-tests and test-bg schedule a fraction of it per edit instead of the whole 30+ minute monolith. |
| agentview-api-contract.test.mjs | strong | trivial | keep | Cheap VM-loaded freeze of CURRENT/REMOVED/CONSTS plus a re-coupling regex guard; complements (does not duplicate) the behavioural spec, and pins the removed aliases from both sides. |
| albert-park-foundation.test.mjs | mixed | trivial | keep | A legitimate per-circuit characterization pin in test:tooling-fast; same pattern as baku-migration, so if more circuits gain foundation tests a shared parameterised suite would be tidier, but two files does not yet justify the churn. |
| assets-api.spec.js | strong | moderate | keep | Runtime complement to the static pack test; the 'still renders' check honestly asserts the GL error channel (L127-128) instead of pretending pixels prove shader health. |
| assets-pack.test.mjs | strong | cheap | keep | Outstanding static guard: verifies against the real shipping modules in VM, the game's own GLB loader, and the system unzip rather than transcribed copies. |
| audio-smoke.spec.js | mixed | moderate | keep | Tests 2 and 3 are genuinely strong (stubbed startMusic asserting exact call args; centroidHz>50 proves audible synthesis); the boot smoke is weak by design and fine as the file's namesake. |
| audit.spec.js | strong | heavy | keep | Each test pins a documented historical bug with invariant-style assertions (lap given back and re-timed, L74-151, is a model regression test); worth its circuit-group cost. |
| autopilot.spec.js | mixed | heavy | keep | The asserted floor (finite, maxWall<1, distPct>40/30) is deliberately loose because completion is unachievable by the naive controller; it still catches the failures it exists for, and the rich metrics it computes are the tuning instrument even though only logged. |
| backend-surface-parity.test.mjs | strong | trivial | keep | Source-scanning is fragile in principle but the >=40-key floor (L82-91) is exactly the anti-vacuity tripwire that makes it trustworthy; superb failure message. |
| baku-migration.test.mjs | strong | cheap | keep | Builds the real track twice (day/night) in a VM and asserts derived invariants — trend-vs-envelope (L124-139) is a model of how to assert 'flat' in an undulating world; keep as-is. |
| camera-driving-hooks.spec.js | mixed | heavy | strengthen | Real substance exists (cinematic az-sign vs curvature L75-105, clamps, no-player guards) but several asserts are dead or under-claim their titles, and 24 tests each paying a full page load + fixed 3s sleep (~20-42s apiece, ~11 min total measured) is a lot of box time for hook plumbing — consolidate loads and fix the asserts. |
| camera-hooks.spec.js | mixed | heavy | keep | Most tests assert real semantics (tourShots lap-ordering and az magnitude L77-84, orbit-above-roadY L127-136, previewCam not moving the car L88-108); one weak test and the fixed-sleep load pattern keep it from 'strong'. |
| camera-tuner.spec.js | strong | heavy | keep | Exact-delta assertions (eye +2m, dist +3m, fov -5 at L89-95), cross-mode isolation (L119-136), and a full panel walkthrough — the isolation invariant is precisely what would rot silently without this. |
| camera.spec.js | strong | heavy | keep | The vantage-distinctness redesign (L71-98) is a well-reasoned honest trade — 13 distinct camState vantages plus one real pixel capture — documented with measured SwiftShader costs; keep exactly as written. |
| car-effects.spec.js | strong | moderate | keep | Drives real physics to each threshold (steps until brakeHeat crosses brakeGlowThreshold, flat-battery boost hold) rather than toggling renderer flags — precisely the grounded contract its header claims. |
| career.spec.js | strong | heavy | split | 2049 lines and ~80 tests, many staging a full weekend plus 24-round season sims — its own comments document repeated 120s-budget fights; splitting into career-core (save/mode/isolation), career-economy (garage/objectives/rollover/sponsors/reliability), and career-ui (hub/slots/modes screen/guide) would let pick-tests target a fraction and stop the budget churn. |
| carview-parts.spec.js | mixed | moderate | keep | Adequate guard for a dev tool — presence checks plus two real frame-advance/state-round-trip tests; cheap enough (no circuit build) to leave alone in test:parts. |
| circuit-def-fields.test.mjs | strong | cheap | keep | Exemplary guard: general hasOwnProperty sweep plus the five once-dropped fields pinned by value, with a justified ENGINE_ONLY escape hatch; cheap (VM buildContext, runs in test:tooling-fast). |
| collision-ai-fixes.spec.js | mixed | heavy | strengthen | Most tests are genuinely strong relative regressions (banking grip vs flat-straight reference is model quality), but the wall-scrub test proves nothing and the file is triple-billed (test:collision + test:behaviour globs plus explicit test:barriers), so its 10 race builds across 3 tracks run three times over. |
| collisions-deep.spec.js | strong | heavy | keep | 15 scenario tests each asserting a physically meaningful invariant (push direction, min-gap while alongside, per-frame displacement cap, monotonic prog across the line, maxWallOvershoot < 0.01) — the model of a behavior suite; uses fixtures.js for failure attachments; the cost (15 race builds, Monza+Monaco) is what it costs. |
| collisions.spec.js | strong | moderate | keep | Three tight tests; the peak-gap-while-alongside fix (documented at lines 28-36) shows the assertion was hardened against exactly the sampling bug that made the old version meaningless; the jam(5) dig-out overlaps collision-ai-fixes' jam(10) pack tests but asserts the extra pairwise non-overlap condition. |
| comment-citations.test.mjs | strong | trivial | keep | Existence check + growth ratchet + anti-slack ratchet is the complete idiom; overlaps docs-integrity's cited-line test but deliberately: this one covers css/ and carries the ratchet, docs-integrity sweeps tools/ and tests/ — the files document each other. |
| component-inventory.test.mjs | strong | cheap | keep | The fourth test (lines 91-102) closes the exact hole the file's own history documents — computing shared-class data and never asserting it — so all four directions of drift are now covered. |
| coplanar-faces.test.mjs | strong | heavy | keep | Correct ratchet semantics (unlisted circuit caps at 0, listed circuit fails on growth, no ALLOW hatch, stale-baseline check both directions); heavy because the sweep rebuilds all 40 circuits (part of the measured 14m20s test:sweeps), mitigated by the shared cached sweep. |
| css-comments.test.mjs | strong | trivial | keep | The prelude-length signature (real max 173 vs failures 275/759, gate at 220) separates cleanly and the rationale for why the gap cannot close is written down; brace-balance companion catches the unterminated-comment case. |
| css-layers.test.mjs | strong | trivial | strengthen | The assertions it makes are exact (depth balance, close-at-last-content, single cascade-order declaration), but its trigger has a hole: the fully-unlayered failure mode it exists to prevent is exempt if the wrapper is simply deleted — add a roster assertion that every css/ file except tokens.css opens with @layer. |
| css-tokens.test.mjs | strong | trivial | keep | No allow-list by design, comment-stripped definitions, JS setProperty consumers counted, and a scan-broke sanity floor (>30 tokens) so an empty result cannot pass vacuously. |
| custom-team.spec.js | strong | heavy | keep | Sophisticated instrumentation done right: atlases tagged by team (fixing the documented createdTextureIds[0] race), leak check scoped to the pre-save stale set rather than created-vs-freed, and an explicit guard-the-guard assertion (line 113) so the tagging cannot rot silently; measured 132 s for one test under SwiftShader (setTimeout 240s), so heavy is inherent. |
| data-lifecycle.spec.js | strong | moderate | keep | Deferred-promise injection resolving responses deliberately out of order is exactly how last-writer-wins races must be tested; loads only the data modules (no game boot), measured 0.6-12s per test in artifacts/logs, so it earns its place in test:api. |
| debris.spec.js | strong | heavy | keep | Each test pins a contract with teeth — rapierFetches === 0 and stepped === 0 for opt-out, maxD < 1e-9 for determinism, live === cap exactly for recycle-oldest — and load failures throw with the module's own error rather than timing out; 5 race builds plus WASM init makes it heavy. |
| deploy-staging.test.mjs | strong | trivial | keep | Parses the workflow rather than duplicating the list, covers tags, importmap, sw precache, and runtime-built vendor URLs, and checks both directions plus file-level importmap existence; if the workflow refactors away from `cp ... _site/`, staged() goes empty and the first test fails loudly rather than passing vacuously. |
| dev-tools.spec.js | mixed | heavy | keep | Shape-level typeof checks are the deliberate altitude for a contract file, and it also carries real behavior (finishRace uses live field order, slipFactor drops under braking, freeze round-trips); confirmed ~11-13s per test in artifacts/logs across ~37 tests, and it sits in test:tiny, test:api, and test:fast, so its heaviness is paid often — worth remembering before adding more tests here. |
| docs-integrity.test.mjs | strong | cheap | keep | Every check is anchored to a documented past failure and stays strictly in mechanically-verifiable territory; the cited-line check (lines 103-171) overlaps comment-citations' first assertion, but with different scope (tools/tests here, css + ratchet there) and both are trivial-cost, so consolidation would buy little. |
| drift.spec.js | strong | moderate | keep | Model relative-assertion physics testing — planted-vs-loose, slow-vs-fast, calm-vs-sharp comparisons with pace pinned so a PACE retune cannot silently change what is measured; lives in test:collision by documented design (docs/TESTING.md line 113) even though it is a tyre-model spec. |
| elevation-tracks.spec.js | strong | heavy | keep | The heaviest file in the batch (40 per-circuit tests each building a full circuit, self-documented ~24s each, deliberately sequential single-worker) but the assertions are the best kind — measured flat-out reference before the scan (with the Monaco traffic bug written up), a legibility pre-assertion at line 272 that fails where the cause is readable, and elevation-race-proofed startup wait; note it runs in BOTH test:physics and test:circuit, so its cost is paid twice when both groups run. |
| f1-track-accuracy.spec.js | strong | moderate | keep | One test covering all 40 circuits against a pinned fixture with explicit direction overrides and bidirectional set-equality on the mapping; no track build needed (reads CircuitPaths data), 120s budget; the SVG gallery and report.json are diagnostic side-effects after the real assertions, not instead of them. |
| fixture-consumer-audit.test.mjs | weak | trivial | strengthen | Two synthetic unit tests of fixtureImportViolations prove the regex on toy input and nothing about the repo — and I verified nothing runs the tool's CLI (no test:* script, no CI step; ci.yml runs test:tooling-fast and test:audit only), so the FLOOR=31 adoption ratchet and the four load-bearing FIXTURE_CONSUMERS that docs/TESTING.md claims are 'ratcheted so it cannot go backwards' are actually unenforced; add tests calling fixtureImportViolations(readSpecs()) === [] and adoption(readSpecs()).uses >= FLOOR so the guarantee runs in test:tooling-fast. |
| gamepad.spec.js | strong | moderate | keep | Mocked getGamepads + real Input.poll exercises the actual seam; the menu-nav half tests the exact non-obvious behaviors (untrusted-key Escape does not close a <dialog>, bumpers must not also shift gears) with a driving-unaffected regression guard; most tests need no race build so the file stays reasonably priced. |
| garage-aero.spec.js | strong | moderate | keep | Every assertion is behavioral and monotone (ease progression, close-faster-than-open, mm of leading-edge travel, camera dist/az), driven via __apex.garageStep because rAF never fires headlessly; 6 tests boot the page but never build a circuit. Grouped in test:parts. |
| headless-api.spec.js | mixed | heavy | keep | Core is strong and behavioral (throttle raises speed, brake lowers it, n=10 advances further than n=1, reset places within ±50m), but each of 25 tests re-boots and rebuilds monza — api.log shows 17-55s per test, several minutes wall; trimming the three trivial toggle tests into one would cut real cost. |
| hooks-documented.test.mjs | strong | trivial | keep | Textbook ratchet with both anti-rot directions asserted (stale entries at 72-77, ghost entries at 79-84); pure fs reads, milliseconds, in test:tooling-fast. |
| hud-audit.spec.js | weak | heavy | merge | Merge into tests/specs/hud-layout.spec.js (or fold the shots into the ui-audit gallery): its only assertions (assertHud, lines 39-45 — #hud visible plus one steering control visible) are a strict subset of what hud-layout proves per mode/orientation with real geometry, yet each of 8 tests pays a reload + bahrain build; the screenshots are the only unique value. |
| hud-layout.spec.js | strong | heavy | keep | Measures real geometry (circle-aware clash test for arc buttons, conservative rects for readouts, safe-area insets injected because headless Chromium reports them as 0) across 24 combos plus a desktop hide check; e-ui.log shows 27-48s per test so it is genuinely expensive, but every dollar buys a real assertion. |
| image-grade-shaders.test.mjs | mixed | cheap | keep | The behavioral tests (neutral preservation 115-127, all 65k min/max combos finite 129-151, channel isolation 153-165) run against a local JS reimplementation (hdrGrade, lines 39-55) and only bind to shipped code via the exact-source regex pins in tests 66-113 — brittle to harmless reformatting but genuinely enforcing GLSL/WGSL formula parity, and image-grade-visual covers the end-to-end pixels; keep as the fast half of that pair. |
| image-grade-visual.spec.js | strong | heavy | keep | Signed and relative pixel deltas with count floors (darkCount>1000) guard against vacuous blank captures, and the histogram gates on five real conditions are the only thing standing between a lighting retune and shipped black-crush; serial mode + 180s timeouts + 6 distinct circuit builds make it one of the most expensive files in test:webgl, justifiably. |
| import-models.test.mjs | strong | cheap | keep | Builds a hand-rolled PNG+glTF fixture, runs the real importer as a subprocess, and byte-parses the output exactly as the consumer does (magic, vert/index counts, height normalisation to 12m, red/green palette sampling, MAT id on every vertex); one spawn, sub-second, in test:tooling-fast. |
| instanced-draw.spec.js | strong | heavy | keep | Explicitly de-vacuoused (the line 53-57 comment converts what used to be a skip into a hard failure on zero batches), the culling test uses raw planes so it cannot drift with the projection, and the overlap with track-graph.test.mjs is a documented division of labour (maths vs wiring), but it pays 3 Monza builds with 180s waits. |
| light-presets.test.mjs | strong | trivial | keep | Guards a real silent-divergence failure mode between two files nothing else connects, with scan-broke floors (ids>100 at line 54, settings>500 at line 67) so a regex slip cannot go green; pure node, milliseconds, in test:tooling-fast. |
| lighting-ab.spec.js | strong | heavy | keep | The catalog-integrity test is a cheap exact-once pin including the silent-patch FREEZE_FLICKER trap, and the live tests each encode a named shipped bug (weather-changed-nothing, fog grey-wash) with waits on actual state rather than sleeps where it matters; Singapore/Qatar/Vegas night scenes under SwiftShader make it expensive (180s timeouts). |
| lighting-campaign.test.mjs | strong | cheap | keep | Genuine unit coverage of failure modes that matter for a long-running batch tool (retry pages closed, original preserved, blocked-after-3, duplicate/missing condition rejection), using clever data-URI config mutation to test validators; pure node with two ephemeral HTTP servers, seconds, in test:tooling-fast. |
| lighting-tuner-grade.spec.js | mixed | moderate | keep | The second test is real behavior (clamp 9 to 1 and 0.1 to 0.5, gainB survives reload, reset lands on LightPresets['*'] values, export JSON contains the value); two tests, one bahrain build plus a reload, sits reasonably in test:webgl alongside its image-grade siblings. |
| load-order.test.mjs | strong | trivial | keep | Every assertion is an exact structural equality against the manifest, including both anti-rot directions (missing files AND dead manifest entries, line 78-79) and the three-way DEFERRED agreement; pure fs, milliseconds, load-bearing for the whole no-build-step architecture. |
| logging.spec.js | strong | moderate | keep | Each test maps to a documented way the facility can fail without throwing, uses the consoleLines fixture to assert what actually printed, and the monaco-build test proves the ring explains a real build; 6 tests, one circuit build, measured 15-65s each in api.log, in test:api and test:tiny. |
| longitudinal.spec.js | strong | heavy | keep | Model relative-assertion practice: PACE pinned so bounds mean something, peak-before-corner instead of the old wrong final-speed read, measured flat top speed as the descent reference instead of a VMAX literal, and the lap-wrap test opts into roadFollow explicitly with the reasoning written down; 6 tests with monza boots plus a spa build carrying 600+ jump/step probes, in test:physics. |
| manual/blank-scan.spec.js | mixed | heavy | keep | The one real assert (blanks toEqual [], line 62) does catch its target failure, and the file is deliberately excluded from discovery (40 circuits x 25 SwiftShader frames); keep as the asserted manual scan, ideally absorbing inspect's sheet output (see that file). |
| manual/inspect.spec.js | vacuous | heavy | merge | Merge into tests/manual/blank-scan.spec.js: it contains zero expects by design (imports only test, not expect), and its capture loop (25 frames, jump+snapCam, ~230ms settle, lines 37-45) is byte-for-byte the same as blank-scan's — one pass could assert blanks AND write the sheet, halving a 40-circuit SwiftShader run whenever both are wanted. |
| map-hooks.spec.js | mixed | moderate | strengthen | Strengthen: the [0,1] bounds and span checks are real but the comment's north-up claim (lines 31-33) is asserted only as y-span > 0.5 — orientation itself is untested (a flipped map passes) — and the orbit() call (line 43) has no assertion after it, so 'usable with orbit' only fails on a throw; assert a known-frac landmark's map position and that camState changed after orbit. |
| material-shimmer.spec.js | mixed | moderate | keep | The measurement design is genuinely good (identical motion at matTex 0/1 so the ratio isolates the textures; anti-blank guard line 107 and motion floor line 108 prevent vacuous green) but the line 89 env-gate means it runs in no group by default and its own comment admits it has never completed — keep as the documented opt-in it is (same policy as tracks-visual), with the honest caveat that until someone runs it on real hardware once it proves nothing. |
| menu-baseline.spec.js | strong | moderate | keep | toHaveScreenshot against committed snapshots (the repo's only golden baselines, per CLAUDE.md) with the render loop stopped via headless(true) so the baseline can actually match; deliberately capped at six so review stays honest rather than rubber-stamped; no circuit builds but 1440x900 SwiftShader captures need the 60s timeout. |
| menu-keyboard.spec.js | strong | heavy | keep | Every test pins a documented real defect (z-index:auto modal ranking, div-dialog focus leak, Escape resuming races) with precise both-directions assertions; artifacts/logs/e-ui.log even shows the Tab-escape test catching a live failure (1 failed at 08:28:06), proving it is real signal. |
| menu-survey.spec.js | vacuous | heavy | strengthen | Deliberate screenshot companion to ui-audit (confirmed mostly screenshot-only), but one-line DOM asserts would make each captured state verifiable at near-zero cost instead of trusting the picture. |
| module-size.test.mjs | strong | trivial | keep | A two-sided ratchet (over-ceiling AND stale-slack both fail) that cannot be gamed silently; exactly what a line-count guard should be, and it runs in milliseconds in test:tooling-fast. |
| multiplayer-lobby.spec.js | strong | moderate | keep | The rtc()-constructs test closes a documented blind spot the fake-transport suite created, and the lobbyMods liar test is a genuine anti-cheat assertion; the deliberate delegation of code-format and QR correctness to the net-unit suites is documented per test, so the overlap is layering, not duplication. |
| multiplayer-npeer.spec.js | strong | heavy | keep | Asserts exactly the surface multiplayer-session cannot see (wire id == driverId, slotFallback === null proving the exact-seat arm fired, unknown-id drop) and its header explicitly defers behavioural coverage to that file, so the pairing is intentional and non-redundant. |
| multiplayer-roles.spec.js | strong | heavy | keep | The fed-vs-local equivalence test (toBeCloseTo at 3 decimals under identical seed) is the load-bearing Phase 0 invariant with no other coverage anywhere, and the local-stick isolation test uses opposite-lock inputs as a proper control. |
| multiplayer-room.spec.js | strong | heavy | keep | Every test asserts a rule with both a positive and negative half (settings arrive AND race did not start; ready toggles on AND off), and the lights-out test's empty-open-screens sweep is a strong whole-DOM invariant; the GO tests must build circuits, which is inherent, not waste. |
| multiplayer-scan-cancel.spec.js | strong | moderate | keep | Must stay a separate file from multiplayer-scan because the fake camera is a Chromium launch argument (blank feed here so mid-scan is a stable state, not a race) -- the header explains why merging would make the teardown-under-test unreachable. |
| multiplayer-scan.spec.js | strong | moderate | keep | A genuinely end-to-end pipeline test (real Y4M of a code produced by the shipped encoder, real decoder script fetch) covering a failure class the header correctly notes is always silent; only two tests, both necessary. |
| multiplayer-seats.spec.js | strong | moderate | keep | Covers both halves (garage prevention, room resolution) plus the solo-untouched property, with the awaitPeer poll correctly closing the loopback delivery race its own comment describes; the parts-setup-ids overlap (line 213) is a deliberate cross-reference asserting the solo behaviour did NOT change. |
| multiplayer-session.spec.js | strong | heavy | keep | Exemplary: virtual-clock driven, every negative assertion has a control (a stepped AI car proving the sim ran, lamp-dwell sample counts proving no backfill), and most tests cite the real field bug they pin; the net-unit overlaps are unit-vs-integration layering, not duplication. |
| music-library.spec.js | strong | moderate | keep | Real decodable WAVs, reload-based persistence proof, request-interception for the Spotify dormancy claim, and the token-drop-on-clientId-change regression are all behaviour-level assertions with pageErrors checked in every test. |
| net-qr.test.mjs | strong | cheap | keep | The independent-decoder design defeats the self-consistency trap the header names, and the quiet-zone negative test turns a rendering constraint into an executable fact; the lobby spec's QR test only checks which string is handed to the encoder, so the split of concerns is clean. |
| net-rendezvous.test.mjs | strong | cheap | keep | Runs the real module against a real in-process HTTP server implementing worker/rendezvous.js's contract, so status codes and JSON shapes are exercised for real, and every failure mode gets its own typed, message-asserted outcome; the GCM tamper and topic-leak tests are genuine security assertions. |
| net-sdp.test.mjs | strong | trivial | keep | Pinned against SDP captured verbatim from a real gathered RTCPeerConnection rather than invented, with the relay-survives-the-budget test documenting a measured field failure; the CRLF overlap with net-transport covers two different modules (pack/unpack vs normaliseSdp) that both shipped the same bug class. |
| net-session.test.mjs | strong | cheap | keep | Deterministic virtual-clock pair with deliberate 10 s skew and the RIVAL DISCONNECTED field bug pinned as its own test including the forgiveness-must-not-hide-real-death counter-assertion; the loss overlap with net-transport is layered (transport proves the loss model, session proves survival on top of it). |
| net-snapshot.test.mjs | strong | trivial | keep | The prog-monotonic-across-the-line walk and the reversing-loses-a-lap test close exactly the composite gap the file's own comment describes letting a real bug through, and the 13-byte size pin makes bandwidth growth a deliberate act; ms-fast and dense. |
| net-transport.test.mjs | strong | trivial | keep | The foundation the whole net stack's testability rests on, plus real regression pins (unknown-build 0===0 waved through, the retired Open Relay credentials, HMAC derivation checked against node:crypto independently); global fetch/localStorage stubbing is scoped with try/finally and fresh module loads where order-dependence threatened. |
| net-trystero-api.test.mjs | mixed | trivial | keep | Most of it is regex-over-source-text, which its own line-47 comment admits once passed while the code was broken -- but for a dynamic-imported vendored ESM island that no node harness can execute, shape-pinning both sides (vendor AND our usage) is the honest available check, and the relayUrls() test at line 217 does drive real code. |
| new-hooks.spec.js | mixed | heavy | split | Split lines 509-877 ('shared track foundation diagnostics' + 'Madrid track foundation migration' -- Silverstone/COTA/Miami/Jeddah/Singapore x2/Madrid-at-300s/Shanghai x2 builds) into a foundation spec under test:scenery or test:circuit, leaving the hooks contract here -- doubly urgent because new-hooks.spec.js is listed in BOTH test:api and test:hooks in package.json, so today the entire heavy foundation half runs twice per full sweep (api.log shows even trivial hook tests costing 15-77 s each). |
| obs-act-edge.spec.js | strong | heavy | keep | Genuine boundary coverage the happy-path headless-api.spec.js does not attempt (seam fractions to 0.9995, wrong-way done semantics, 20-position NaN sweep), and the seam bugs it hunts are exactly the silent-corruption class worth paying browser cost for; the monaco/suzuka/spa parametrised seam tests earn their builds. |
| offtrack.spec.js | strong | heavy | keep | Exemplary: pace pinned with a written rationale, relative assertions (onSpeed > offSpeed+2), both branches of the rescue contract tested (throttle held vs released); 8 tests each rebuild a circuit so it is heavy but every test earns it. |
| output-paths.spec.js | strong | trivial | keep | Pure-node logic inside the Playwright runner (no page), exact-path equality plus throw assertions; owns its own test:paths group and costs nothing. |
| parts-budget.spec.js | strong | moderate | keep | 14 real UI assertions (exact 440 remainder, over class, scaleX fill, persistence across reload) with screenshots as supplements, not substitutes; the cost math itself is double-covered by parts-physics getCost tests, which is acceptable layering. |
| parts-catalog.spec.js | strong | moderate | keep | Real visibility/class/count assertions incl. negative gating (manu_mercedes absent for Red Bull Ford, sig_mclaren_flex absent for Mercedes); the one vacuous test could be dropped into a gallery suite but does not justify churn. |
| parts-ers.spec.js | strong | heavy | keep | Pins both halves of a documented real bug with a 5-speed sweep and a no-boost control run; parts-physics's final ERS test covers per-part scaling, this covers the taper/drain invariant — complementary, not redundant, though co-locating them is a reasonable future merge target. |
| parts-factory-presets.spec.js | strong | moderate | keep | Instruments Car3D.build to capture what was actually rendered for all 11 teams and proves the saved extreme aero did NOT reach the AI mesh — tests the render path where parts-physics only tests the catalog side. |
| parts-liveries.spec.js | strong | moderate | keep | The remap tests are exactly right (only paint faces move, geometry/colours untouched, chrome->mirror with the rationale written down) and the creator UI round-trip lands in localStorage with the correct absent-finish encoding. |
| parts-livery-contrast.spec.js | mixed | moderate | strengthen | The geometry probe (decal->backing-surface via sentinel colours) is genuinely strong and catches region/paint drift, but the ink-choice half never calls buildAtlas — assert against the atlas's real lum/ink helpers (or export them) so a production linearisation regression fails here instead of only in a human's eyes. |
| parts-mesh-cache.spec.js | strong | heavy | keep | Instruments real GLX create/free and asserts oldest-evicted/newest-live plus no duplicate frees — exactly the leak class it exists for; the 240/360 s timeouts and 13 race start/quit cycles are the honest price of exercising the real eviction path. |
| parts-persistence.spec.js | strong | moderate | keep | Asserts the actual storage payload, the post-reload active class, and cross-team isolation — each a distinct failure mode; the 440-budget-after-reload test duplicates parts-budget's number but from the persistence side, tolerable. |
| parts-physics.spec.js | strong | heavy | split | The assertions are individually excellent (mesh-signature uniqueness, per-knob deform probes, exact endplate containment) but 1481 lines under a name that says 'physics' while ~70% is geometry/visual-recipe contracts: split the Car3D/CarMesh geometry tests into parts-geometry.spec.js, move the final ERS-battery test (lines 1415-1481, which reloads and rebuilds monza 3 times) into parts-ers.spec.js, and keep catalog/mods/cost/resolve here — each test does its own page.goto so 69 boots is also where the runtime goes. |
| parts-setup-ids.spec.js | strong | moderate | keep | Goes beyond attribute checks to hit-testing z-order (elementFromPoint) and full camera semantics (pan is not zoom, dolly perpendicular to strafe, clamps under a 70-click mash) — each assertion maps to a named shipped bug; the driver-chip test.skip on single-driver teams is a legitimate guard, not a wrapped expect. |
| perf-governor.test.mjs | strong | trivial | keep | Runs the REAL tick() via eval of js/game/perf.js against carefully distinguished dt signals (cap vs coupled GPU load vs jitter) and pins the mechanism (floorMs convergence) as well as the outcome; pure node, ms-cheap, correctly in test:tooling-fast. |
| perf-sentinel.test.mjs | strong | trivial | keep | Covers the full matrix — strike accrual, floor pinning, new-build expiry, mid-race update not a crash, same-build accumulation, manual clear, desktop exemption — each against real perf.js state transitions; in test:tooling-fast where it belongs. |
| persistence.spec.js | strong | moderate | keep | Injects the real failure mode via addInitScript before boot, asserts through the player-visible surface (real settings, the log ring, console dedup) rather than module internals, and explicitly guards the cache-write half that made the original bug silent; correctly in test:api. |
| physics-abudhabi-foundation.spec.js | strong | heavy | regroup | The tests are good, but this file (like its 14 siblings) contains zero driving-model physics — the physics- prefix exists only to be caught by test:physics's glob, so every driving-model change pays 15 circuit builds; rename to abudhabi-foundation.spec.js and give the foundations their own test:foundation group (TESTING.md documents today's grouping, so update both together). |
| physics-albert-park-foundation.spec.js | strong | moderate | regroup | Same regroup/rename as the other foundations (no physics here, glob-named); compact and complementary to its no-browser twin albert-park-foundation.test.mjs which covers the pure-node side. |
| physics-bahrain-foundation.spec.js | strong | heavy | regroup | Same regroup/rename as the other foundations; its exact (not subset) required-model list with the written justification is the pattern the other circuit specs should copy, and its cheap night recheck is the right way to cover the second tod. |
| physics-characterization.spec.js | strong | moderate | keep | The single most valuable spec for the extraction work game.js is undergoing: baseline is committed (verified present) so the gate is live, header documents the verified-non-vacuous check (LAT_MAX 22->27 fails by name), and one build + reset() keeps it ~25 s; the agent-determinism overlap is explicitly distinguished in the header (within-session vs across-commits). |
| physics-cota-foundation.spec.js | strong | heavy | regroup | Same regroup/rename as the other foundations; the double-bounded elevation range with peak location is exactly the shape-not-absence contract the abudhabi header argues for. |
| physics-fixes.spec.js | strong | moderate | keep | Textbook regression spec: worst-case geometry chosen deliberately (Monaco hairpins), seam-unwrapped continuous monitoring over ~25 s of driving, and a purely relative gentle-vs-hard comparison for the wall; correctly in both test:behaviour and the physics glob. |
| physics-hungaroring-foundation.spec.js | strong | heavy | regroup | Keep the content verbatim, but this proves scenery/terrain/barrier contracts, not the driving model — the physics-* name puts it in test:physics (run on driving-model edits that cannot break it) while pick-tests routes js/circuits/ edits to circuit+scenery, which never run it; a foundations/track group fixes both directions. |
| physics-imola-foundation.spec.js | strong | heavy | regroup | One of the best of the family (uses fixtures' racePage/pageErrors, asserts non-null via shoulderGaps filtering, named-corner elevations); same family-wide misgrouping — foundation contract living in test:physics via the filename glob. |
| physics-interlagos-migration.spec.js | strong | heavy | regroup | Same family regroup; also the only file split into 4 tests that each reload and rebuild the circuit — collapsing to one build (as the other circuits do) would roughly quarter its cost. |
| physics-monaco-foundation.spec.js | strong | heavy | regroup | Regroup with the family, and note the second test (L140-220) is a hand-copied duplicate of props-over-road.spec.js's scan whose 1.4 cap is identical to that file's BASELINE.monaco — redundant protection that could be dropped or kept only as fast per-circuit feedback. |
| physics-montreal-foundation.spec.js | strong | heavy | regroup | The support-pillar probe (L96-102) is a genuinely clever grounded-geometry assertion; same family-wide misgrouping out of test:physics. |
| physics-monza-foundation.spec.js | strong | heavy | regroup | The banking-corrected probe (L50-61, with explicit not-null at L99) is the model the null-tolerant siblings should copy; regroup with the family out of test:physics. |
| physics-qatar-foundation.spec.js | strong | heavy | regroup | Exemplary threshold hygiene (every number carries its measurement); same family regroup — and its own comments note the values were measured via the headless verify-track harness, evidence this spec could run browser-free like albert-park-foundation.test.mjs. |
| physics-redbull-foundation.spec.js | strong | heavy | regroup | Solid family member; regroup out of test:physics with the rest. |
| physics-spa-foundation.spec.js | strong | heavy | regroup | Regroup with the family; test 3 (L52-147) is a per-circuit copy of the all-circuit corridor scans — its own comment (L73-74) admits terrain-over-road.spec.js now does the same thing with the banking fix, so that test is a merge candidate into the shared audit. |
| physics-suzuka-foundation.spec.js | strong | heavy | regroup | The transform and relief checks are the real value; regroup with the family — and consider dropping the verbatim raw-def pins, which are change-detectors of authored data that already broke once on a deliberate retune (the L50-63 comment is the scar). |
| physics-vegas-foundation.spec.js | strong | heavy | regroup | The lake-rename comment (L65-74) is model documentation of why both new ids are pinned; regroup with the family out of test:physics. |
| physics-zandvoort-foundation.spec.js | strong | heavy | regroup | Regroup with the family; its propClearance helper (L16-183, ~170 lines) is a third hand-copied instance of the props-over-road scan (after Monaco's and Spa's) asserting the same TOL the all-circuit audit already enforces for Zandvoort — extract to track-helpers.js or drop. |
| presets.spec.js | strong | moderate | keep | Textbook relative assertions (the header documents the hardcoded-constants version this replaced); correctly grouped in test:steering. |
| projection.spec.js | strong | moderate | keep | Genuinely a physics-group spec (unlike the foundation family) with justified tolerances; the only nit is that all three tests stage a race through four UI clicks when __apex.race()+go() (or the loadTrack fixture) would do, and 84 sequential page.evaluate round-trips in test 1 could be one evaluate. |
| prop-clipping.test.mjs | strong | moderate | keep | Model ratchet: roster-derived count floor (L65-67 — explicitly fixing the frozen >=24 mistake coplanar-faces still has), shared baseline JSON with the tool's own --gate so they cannot disagree, and an anti-slack test; correctly in test:sweeps as pure Node (~90 s cached across both tests). |
| props-over-road.spec.js | strong | heavy | strengthen | The main audit is strong and irreplaceable (observed 616 s, budget raised to 1500 s for good reason), but the standalone 'Shanghai uses the default clean prop-clearance baseline' test (L57-59) only asserts a literal in this same file and can never catch a runtime regression — the real Shanghai check already runs inline at L144-145; delete the vacuous one. |
| quali.spec.js | strong | heavy | keep | Every test encodes a specific historical bug (orphaned car references, round-1 grid reuse, quali order leaking into GP) in its comments; correctly in test:modes/test:career, with test.slow() on the two double-circuit tests. |
| quick-validate.test.mjs | strong | trivial | keep | Small and correctly scoped (the tool lazily imports playwright precisely so this can stay pure-node in test:tooling-fast); coverage is narrow — the obs/light validity branches of evaluateLiveProbe are untested — but the cams-false case it does pin is the one that historically lies. |
| race-control.spec.js | strong | moderate | keep | A deliberate, documented complement to race-control.test.mjs (the header records why the injected-host-flag Playwright approach was wrong), keeping only what needs a real page; correctly in test:debris. |
| race-control.test.mjs | strong | trivial | keep | Exactly the extraction payoff its header describes — millisecond-fast, direct-drive hazard pictures; correctly in test:tooling-fast. |
| road-under-floor.test.mjs | strong | moderate | keep | Targets a defect class provably invisible to every other guard (documented L10-17), filters the downward skirt by face normal, and manages memory across the 40-circuit VM sweep with env.trim(); correctly in test:sweeps. |
| scenery-api-contract.test.mjs | strong | cheap | keep | Exactly the right shape for a contract freeze — sorted-list + count tripwire + real build diff of Object.keys, done headlessly in seconds; the landmarkKit/circuitKit membership overlap with scenery-kits.spec.js is one level up and harmless. |
| scenery-kits.spec.js | mixed | heavy | strengthen | The binding-contract half is good; make the per-track tests earn their titles by asserting the resolved theme name (one extra field in the evaluate return) and consider whether five full circuit builds are needed when the kit logic itself is unit-covered in scenery-kits.test.mjs. |
| scenery-kits.test.mjs | strong | trivial | keep | Dense, cheap, and every assertion maps to a real defect class (unbounded emission, NaN geometry, throwing on bad deps); the method-list overlap with the spec is the unit/integration split working as intended. |
| season.spec.js | strong | heavy | keep | The migration test alone (custom:0 gets 50 pts, NEW never appears in the store but does on the results table) justifies the file; trimming the 3-lap parameterization to one case would cut two full heavy boots for zero coverage loss. |
| service-worker.test.mjs | strong | trivial | keep | This is the only test of sw.js's actual behavior (load-order only checks the precache seed list), it tests race-condition ordering that a browser test could not do deterministically, and it costs milliseconds. |
| shared-track-foundation-characterization.test.cjs | strong | heavy | keep | Runs at node speed (~2m40s, no browser) yet covers every circuit; the roster assertions (LIST 40, SEASON 24, no classic in SEASON, lines 353-355) overlap coplanar-faces' >=24 floor but here they are exact, which is the version that catches a classic leaking into the championship. |
| silent-catch.test.mjs | strong | trivial | keep | A well-designed ratchet: two-sided (ceiling AND slack), aimed at the codebase's documented most-repeated defect shape, with an actionable failure message naming the worst files. |
| sliders.spec.js | strong | heavy | keep | One of the best-annotated specs in the suite — each behavior test names the exact bug it pins (traffic-pinned measurement, coast-drag decay, the 73.5 m/s manual clamp) and asserts through the real sim; the racing-line overlap with steering.spec.js is wiring-vs-physics, not duplication. |
| smoke.spec.js | strong | heavy | keep | This is test:tiny's backbone and per artifacts/logs runs 13-128 s per test under SwiftShader; strengthen the minimap test to sample pixels (the telemetry-compare spec already has the getImageData pattern) next time it is touched. |
| span-kinds.test.mjs | strong | trivial | keep | A deterministic, free guard replacing a probabilistic browser failure whose message pointed away from the cause — exactly the kind of meta-test that earns its file. |
| steer-migration.spec.js | strong | moderate | keep | Model migration testing: every direction of the ladder invariant is covered, the assertions distinguish store-level from physics-level effects, and the comments record why each case exists. |
| steering.spec.js | strong | heavy | split | Move the four keyboard/pedal latch tests (lines 292-405) into touch-steer.spec.js or an input.spec.js — they test js/game/input.js with no race needed, and splitting them off the heavy startLiveRace file lets them run at page-boot cost; the physics half stays as-is. |
| telemetry-compare.spec.js | strong | cheap | keep | Fast because it setContent's a bare hub instead of booting the game, and the assertions are all user-visible outcomes; the overlap with telemetry-trace is UI-vs-math and correct. |
| telemetry-trace.test.mjs | strong | trivial | keep | A model unit suite: real regressions, deterministic synthetic laps, milliseconds of cost, and it tests internals (_dropStrays, _locAt) the browser spec could only observe indirectly. |
| terrain-over-road.spec.js | mixed | heavy | strengthen | The terrain half genuinely catches its bug class, but restrict the >=1.5 m road exemption to CROSSOVER_TRACKS so a gross road-over-road defect on the other 37 circuits cannot hide behind the Suzuka figure-8 carve-out. |
| test-coverage-audit.test.mjs | strong | trivial | keep | The orphan-file guard belongs in the suite everyone runs, and the >100-file sanity floor (line 63) protects the scan itself; the adjacency with test-groups.test.mjs is two different invariants (group membership vs docs/config sync), not duplication. |
| test-groups.test.mjs | strong | trivial | keep | The --project/RENDER_SPECS partition checks (lines 117-163) guard a genuinely nasty silent-pass failure mode Playwright itself will never report; every assertion here has a documented drift incident behind it. |
| tilt-pipeline.spec.js | strong | moderate | keep | Model coverage of a previously untested default input mode; the final wall-clock test is the only non-deterministic member and it exists precisely to police the shared-helper contract that stops the two paths drifting again. |
| time-trial.spec.js | strong | heavy | keep | Eleven monza boots is real cost, but each test asserts a distinct behavior with a named failure mode (formation-lap S3 suppression, the ghost/leaderboard separation); the overlap with season.spec.js is only the shared finishRace/results plumbing. |
| tlx-probes.spec.js | strong | heavy | keep | Asserting exact expected-idle states (lamp arms === 0/idx -1 on a day race, gpuTimer {supported:false} on SwiftShader) rather than only expected-active ones is what makes this parity suite trustworthy; webgl-probes.spec.js is its designed GLX mirror, not an overlap. |
| touch-steer.spec.js | strong | moderate | keep | This is the natural home for steering.spec.js's input-latch describe block if that split happens — same module, same page-boot-only cost model, same fixtures import. |
| track-accuracy-validator.test.mjs | strong | trivial | keep | Four tight unit tests of the comparator (translation/scale invariance, reversal, distortion, mapping diffs) with exact expected outputs; only a square fixture, but sufficient for the invariants asserted. |
| track-foundation.test.mjs | strong | cheap | keep | Real invariants asserted exactly (permutation via Set size, atomic rollback via deepEqual of buffers, monotone rails); the Miami test pins curated data with a written regression rationale, which is deliberate rather than brittle. |
| track-graph.test.mjs | strong | cheap | keep | Exemplary unit suite: the instance-matrix-vs-replay equivalence test (lines 232-262) and the partial-suppression/non-uniform-scale fallbacks pin exactly the failure modes tools/graph-parity.cjs cannot see; every assertion is exact or 1e-6-bounded. |
| tracks-visual.spec.js | vacuous | trivial | keep | Deliberately skip-gated (known-already, confirmed at lines 27-30) with a self-documenting path to activation (--update-snapshots) and zero cost while dormant; the file body itself carries no assertions — all delegated to track-helpers.js describeTrack. |
| tracks-walls.spec.js | mixed | heavy | strengthen | The invariants are real and would catch genuine wall regressions, but test 2 (lines 37-53) rebuilds all ~40 circuits to assert on only 5 street circuits — fold it into test 1's loop or build just those 5, roughly halving the file's circuit-build cost. |
| ui-audit.spec.js | vacuous | heavy | regroup | Confirmed 0 expect() calls across ~63 executions at 13-108s each (e-ui.log) — it dominates test:ui's wall time while only failing on navigation timeouts already covered by asserted specs; move it to an on-demand gallery group so test:ui runs the specs that can actually fail on a UI regression. |
| ui-button-touch.spec.js | strong | heavy | keep | Every test pins a documented, once-real bug with an observable proof (nub transform, camState eye, getBoundingClientRect equality); note the known-already item is outdated on this branch — the throttle-button expect at line 461 is now unconditional, with the old count()-guard documented as the bug. |
| ui-desktop.spec.js | vacuous | heavy | merge | Merge into ui-audit.spec.js (or whatever gallery group it lands in) as two more viewport rows — it is a strict subset of ui-audit's screens (main menu, select, howtoplay, HUD, pause) at different sizes, costing 25-71s per shot (e-ui.log) for no assertable outcome. |
| ui-scale.spec.js | strong | moderate | keep | The clipping-ancestor-aware PROBE (lines 91-133) measures reachability rather than raw geometry, assertions are containment/relative by design, and both orientations are covered after a documented portrait-only escape; the one circuit build is deliberate and headless-optimized. |
| understeer-cue.spec.js | strong | heavy | keep | Model spec for behavioural testing: rig-verification before every silence assertion, positive controls in the same page, relative depth ordering instead of absolute thresholds, and a correctly-argued pace-invariance test that deliberately avoids pinning a bug. |
| vstd-invariant.test.mjs | strong | trivial | keep | A well-built ratchet: matcher unit tests, an allow-list keyed to the exact source line so refactors force re-justification, staleness detection both directions, a count pin against byte-identical duplicates, and a guard that the SUSPECT register cannot decay into a second allow-list. |
| wake-lock.spec.js | strong | heavy | keep | Exact-sequence toEqual assertions on the event log distinguish the two release paths and the re-acquire path; the defineProperty mock rationale (assignment silently fails on the getter-only accessor) is exactly the trap that would otherwise make these tests hang or pass vacuously. |
| webgl-probes.spec.js | mixed | heavy | strengthen | The shadow-transform interception and mobile-tier GL-error tests are strong and pin real bugs, but two tests are shape/typeof-only and the '32-light cap' reads lightState()'s report rather than what the shader received — fold the weak probes into the strong tests or read the actual upload if a hook exists. |
| webgpu-lifecycle.test.mjs | strong | cheap | keep | The fault-injection harness (failNextTexture/View/BindGroup) tests transactional cleanup the browser could never exercise deterministically, and the byte-lane assertions pin exact uniform offsets with correct f32-representability handling; worth keeping even though WGX is deferred/frozen — it guards exactly the kind of silent rot a frozen backend accumulates. |
| world-physics.spec.js | strong | heavy | keep | Relative assertions throughout (sign of drift vs sign of k, on<off, high>low*1.15), PACE pinned with a written reason, and the AI test's per-car-delta rewrite documents measured values against its 100 m floor — the thresholds that exist are all justified in-file; runs in both test:physics and test:behaviour, which is group-level duplication worth trimming when groups are reorganized. |
