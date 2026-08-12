# Handoff — Apex 26 scenery/quality work (continue in a fresh session)

You're continuing work on **Apex 26**, an unofficial WebGL2 F1 fan game (no build
step, IIFE modules, deployed to GitHub Pages). **Read `CLAUDE.md` first** — it's
the engineering reference. Below is exactly where the previous session left off.

## Branches & deploy
- **Work branch:** `claude/project-cleanup-reorganize-rrztv6` (HEAD `8e6d3d61`). Do all work here.
- **Deploy branch:** `claude/f1-game-project-26h3ng` (was `3095bf56` at handoff — it
  churns constantly; multiple agents push to it). Ship by: fetch deploy →
  `git merge origin/<deploy>` into work → bump cache → push work →
  `git push origin HEAD:<deploy>` (fast-forward). Deploy CI (`pages.yml`, gated by
  the node groups + smoke) publishes.
- Tree is **clean**, work branch is **pushed** at handoff.

## What's already SHIPPED to deploy (all in history via `a247f329`)
- **Batch-1 model detail** (marshal huts, billboards, marquees, conifers, hedges).
- **Batch-2 detail:** `wall` coping rail, `tower` glazing bands + observation deck,
  `ridge` rotated sub-crest, `peak` off-axis sub-peak (all `js/track/scenery-*.js`,
  coplanar-safe).
- **Grounding-defect fixes:** monza/catalunya/istanbul over-track slabs
  (`groundedSegments` arc-subdivision in `js/track/models.js` + catalunya terrace
  run up-slope in `js/circuits/catalunya.js`).
- **⚠️ A regression I introduced AND fixed:** the subdivision interpolated node
  index `k` straight between wall points; on long circuits a wall wrapping the
  start line sent the sub-chord midpoint to the far side of the track → a box
  spanning the whole circuit, 5 m over the racing line (hungaroring pit trim).
  **Fixed** with wrap-safe `dk` (walk `k` the short way via `ctx.n`, added to the
  models ctx at `tracks.js:784`) + per-pair extrusion. Verified on all 10
  `groundedSegments` circuits: hungaroring, monza, catalunya, istanbul, madrid,
  monaco, mexico, indianapolis, silverstone, portimao.
- **Singapore float:** resolved to a baseline raise (37) — the Marina Bay
  supertrees are grounded decor the float heuristic over-flags (verified in-engine
  via scene query + aerial render); the other agent independently agreed. Deploy
  later made `tools/float-audit.cjs` **deterministic** (total geometric sort);
  baselines are re-verified against it and green.

## COMMITTED but NOT yet shipped — DO THIS FIRST
**`8e6d3d61` — #41 throttle-stuck fix.** In BUTTONS steer mode the throttle stuck
ON after an off-track rescue (iOS ghost pointer — a pointerup that never fires;
the zero-touch purge doesn't fire while a steer finger is still down). Fix:
exposed `Input.releaseHolds()` (`js/game/input.js`, wraps `holdReleaseAll`) and
call it in `rescuePlayer()` (`js/game.js`, under `c.local`); raised game.js
module-size ceiling 7944→7951 in `tests/unit/module-size.test.mjs`.
- **Node-verified** (tooling-fast 373/373, module-size green) but the **steering +
  tiny browser groups were STOPPED mid-run** (was 34/97, 0 failed).
- **Next:** `node tools/test-bg.mjs steering tiny` (background + watcher on
  `= run <status>`), confirm green, then merge latest deploy, cache-bump, and
  fast-forward to ship it.

## Pending backlog (user said "do all", in this order)
1. **Batch-3 scenery detail** (prepped; all `ctx.instance`-baked so each addition
   is +1 primitive in the baked model — cheap):
   - `guardrail` default armco → add the wArmco centre rib (`scenery-structures.js`
     default branch ~line 192; the rib is at ~line 178).
   - `fence` default mesh → top rail box (`scenery-structures.js` ~line 134).
   - `sponsorHoarding` default panel → top frame rail.
   - `acacia` crown → shallow frustum instead of box (`scenery-nature.js` ~408);
     `bush` grass → fanned cones (~1001); `sailCanopy`, `neonSign`.
   - Conservative on `tyreWall` (~204) / `gantry` (~255) — both carry explicit
     budget notes (142×/38 circuits); at most a minimal addition, or defer.
   - Crude **kit builders** (only spa/hungaroring/abudhabi use them): `roof`
     fascia+parapet, `cameraCrane` counterweight+head, `marshalShelter`
     post+parapet, `trackSigns` posts; route `raceControl` through the
     tapered/drum tower styles. **Delete 3 dead builders** returned but never
     called: `facade`, `stadiumSection`, `arch` (`landmark-kit.js`).
   - Verify: node geometry sweep (`node --test tests/unit/prop-clipping.test.mjs
     tests/unit/coplanar-faces.test.mjs tests/unit/scenery-grounding.test.mjs
     tests/unit/terrain-normals.test.mjs`) → re-baseline growth → scenery browser
     group (`node tools/test-bg.mjs scenery`, props-over-road all-circuits ~25 min)
     → cache bump → ship.
2. **#49 LIVE gap bars** (dead feature): `js/data/live.js:283` renders a bar from
   `p.timeDiff`, but `positions()` never sets it. Add `intervals(sessionKey)` to
   `js/data/api.js` (model on `positions()` ~line 359; hit OpenF1
   `/intervals?session_key=`, keep latest per driver, return
   `[{num, gapToLeader: gap_to_leader}]`), and merge into each live row as
   `timeDiff` in `live.js` ~line 144 (add to the `Promise.all`).
3. **Perf pass:** action `docs/PERF-FINDINGS.md` (came via merge) + a
   chrome-devtools `performance_start_trace` on a heavy circuit.
4. Housekeeping: #36 (archive spent campaign records — widen the link check
   first), #40 (PACE literals in tests/ — needs design, both naive guards
   rejected).

## CRITICAL process rules (these bit the previous session repeatedly)
- **ONE Playwright process at a time.** Two groups (4 workers) oversubscribe the
  4-core box → **timeouts that are box measurements, not failures** — re-run the
  spec SOLO before believing a timeout. The props-over-road **all-circuits** spec
  takes ~24 min and sits right at its 1500000 ms limit; give it the box alone
  (contention pushed it to 1513 s → false timeout once).
- **Watchers:** anchor ONLY on `= run (passed|failed|timedout|interrupted)`, never
  on heartbeat `N/M done` lines (they contain `N failed` and misfire).
- **Never edit `js/`/`css/` while a browser run reads the working tree** (mixed
  build → false results). For isolation/bisect runs use a git worktree
  (`git worktree add -f /home/user/f1-iso <ref>`; `ln -s
  /home/user/f1-game/node_modules /home/user/f1-iso/node_modules`; run there).
- **Deploy churns fast** — always re-fetch + re-merge right before shipping; expect
  cache-version + baseline auto-merges. `git merge-base --is-ancestor
  origin/<deploy> HEAD` tells you if it's still fast-forwardable.
- **Geometry ratchets** (`tools/{clip,coplanar,float}-baseline.json`): RAISE when
  detail grows, LOWER when a fix shrinks a count (the stale-check fails otherwise —
  it goes both ways). Re-run the node sweep after ANY `js/track` change.
- **`groundedSegments` lessons:** (a) when stacking scenery primitives, give each
  its own heading + base-Y so no same-facing coplanar pair forms (the coplanar
  test gates dot(nA,nB) ≥ 0.999); (b) any subdivision over node index MUST handle
  the start-line wrap (`|b.k - a.k| > n/2` → step `dk` by ∓n).
- **Cache bump** (`?v=N` in index.html + `version.json` to max+1) is the LAST edit
  before each ship commit; never mid-run.
- **chrome-devtools MCP browser** respawns on next `navigate`; the idle one was
  killed for resources. It CAN reach `localhost:3456` (start a server first) and
  the deployed site. A live game page holds ~20% CPU — park it to `about:blank`
  and never render while a Playwright run is going.
- **Commit footer** (every commit): `Co-Authored-By: Claude Opus 4.8
  <noreply@anthropic.com>` + `Claude-Session:` line.

## Immediate next action
Re-run `steering tiny` for the throttle fix `8e6d3d61`; on green, ship it to
deploy; then start batch-3 scenery.
