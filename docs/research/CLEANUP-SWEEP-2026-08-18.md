# Cleanup sweep — 2026-08-18

Six read-only explore agents tagged the tree for **bugs**, **removals**,
**splits**, and **stale docs**. A second pass then verified the high-confidence
deletes before they landed. This file is the consolidation, not a licence to
rewrite working systems.

The shipped game tree is already tight: 166/166 `js/` files match
`tools/manifest.cjs`, 11/11 CSS files match the shell, 0 dead CSS classes,
232/232 test files reach a `test:*` group, `check-gctx` and `scan-globals`
are clean. Cleanup here is subtractive hygiene plus a next-extraction map.

---

## Landed in this change

| Tag | Path | Why |
|---|---|---|
| **REMOVE** | `tests/helpers/seed-log.cjs` | Duplicate of `seed-log.mjs`. Zero imports. |
| **REMOVE** | `artifacts/cleanup-survey/*` | Incomplete survey (2 of 11 files) tracked despite `artifacts/` being gitignored. |
| **CONSOLIDATE** | `js/track/core/mesh.js` `bankingProfile` | Local `wrap01` now aliases `TrackSpace.wrap01` (space.js already precedes mesh.js). |
| **STALE** | `js/agent/agentview.js` | `curvatureRaw` no longer claims `+ = right`. |
| **STALE** | `.claude/skills/pwa-cache-service-worker/SKILL.md` | `test-bg.mjs` has no `service-worker` group; the gate is `npm run test:service-worker`. |
| **STALE** | `README.md` `test:fast` | Not a ~3 min subset on SwiftShader. |
| **STALE** | `docs/COMPONENTS.md` | Class count 508 → 505 (inventory method). |
| **STALE** | `tests/specs/props-over-road.spec.js` header | Dropped the frozen "15 circuits fully clean (incl. cota)" claim. |
| **STALE** | `docs/ARCHITECTURE-REVIEW.md` §7 | Curvature sign settled; throttle never-fail and coplanar roster floor marked fixed; 08-17 survey items that have landed are no longer listed as open. hud-layout "FIXED" no longer followed by a current-tense 6/6-fail narrative. |
| **STALE** | `docs/TESTING.md` fixture adoption | 60 of 111 → 61 of 113; `tools/fixture-consumer-audit.mjs` `FLOOR` raised to 61. |
| **STALE** | `tests/unit/css-token-adoption.test.mjs` | `CEILING.rawSpacing` 467 → 473 — already red on deploy tip after the menu-color restore. |

Second-round verify (6 agents): all landing claims **PASS**. `SceneryThemes.variant`
and the ATM/COL packs stay. Cache 1433 (mesh.js / agentview.js hashes applied).

---

## Tagged, then **kept** (false or load-bearing)

| First-pass tag | Path | Why it stays |
|---|---|---|
| REMOVE | `SceneryThemes.variant` | **False dead.** `tests/unit/scenery-kits.test.mjs` calls `Themes.variant`. |
| REMOVE | `ATM.coolNight` / `warmNight` / `rivieraDay`, `COL.desertSand` | Documented authoring packs in `docs/SCENERY-API.md`. Unused by current circuits, still part of the scenery `api`. |
| REMOVE | scenery API `house`, `gridshellCanopy`, `underpassPortal`, `bakedModels` | Frozen 111-member contract (`scenery-api-contract.test.mjs`). |
| REMOVE | entire `spike/` | Adoption provenance; cited from `docs/README.md`, `debrisworld.js`, `tlx.js`. |
| REMOVE | `docs/archive/`, `docs/superpowers/` | Provenance. Research/archive exemption is intentional. |
| REMOVE | `vendor/three-…/BloomNode.js` | Spike + optional SW precache. Production TLX uses a custom bloom. |
| SPLIT | `index.html` | Formal UPHOLD: tag-derived `sw.js` precache; stay under the ~1,400 Lighthouse band. |
| CONSOLIDATE | GLX / WGX / TLX shader stacks | Intentional parity. Mock tests cannot replace live GPU validation. |
| REMOVE | unused circuit `segs` | Documented fallback when `CircuitPaths` is missing. |

---

## Open defects — landed in the follow-up pass

| Tag | Where | What landed |
|---|---|---|
| **BUG** | COTA amphitheater | Emit from the declared origin (`a.c + 8r`), so the stage is no longer 8 m closer to the racing line than the preflight box. |
| **BUG** | Indianapolis oval wall | More / shorter grandstand and colour-band bays so the chord no longer covers the infield at racing 0.33. |
| **BUG** | Montreal casino footbridge pier | `foundation()` falls back to `Tracks.terrainY` when the 30 m build grid misses a flatTerrain shelf; overheadSpan auto-legs disabled (`supports: false`). |
| **BUG** | `IncidentSim` wall-clamp skip | `postStep` clamps `tf.x` to `Tracks.wallAt` and writes world pose from the clamped `(s,x)`. Product: the wall stays an outer bound during R2. |
| **BUG** | `modelGroup` preflight | Re-runs the road footprint test on the **emitted** oriented box. Declared-box escape stays a diagnostic (vertical slack). |
| **BUG** | `__apex.scene()` behind-camera | `behindCamera` is `|bearingDeg| > 90` (look-direction). Spec matches. |
| **TECH-DEBT** | Vegas prop verts | `verify-track.cjs` fails `vegas` above 1 850 000 verts. |
| **TECH-DEBT** | Banked probes | Zandvoort's prop-clearance samples add `Tracks.banking().dy`. Durable `__apex.groundY` `overRoad` is still open. |

## Still open (not this pass)

| Tag | Where | Notes |
|---|---|---|
| **BUG** | Singapore / Silverstone / Shanghai / Abu Dhabi raw `TrackGeom.*` | Remaining `TrackGeom.addBox` calls on `out` are the **overhead escape hatch** (gantry lights that must span tarmac). modelGroup-internal raw emits now go through emitted-footprint preflight. Do not wrap `TrackGeom` globally — that would delete start lights. |
| **TECH-DEBT** | `__apex.groundY` banked `overRoad` | Specs still have to add `Tracks.banking().dy` themselves. |

---

## Next extractions (do not do without a dedicated pass)

`js/game.js` is **8599 / 8600**. Rank by **boundary crossings**, not line count
(`docs/ARCHITECTURE.md`). New files are hyphenated IIFEs + manifest + script
tag + cache bump.

| Action | New file | ~LOC | Risk | Why wait |
|---|---|---|---|---|
| **SPLIT** | `js/game/race-setup.js` | ~200–650 | low–med | Pre-race / quali / garage DOM. Cleanest ratchet relief. Needs `test:modes` + menu specs. |
| **SPLIT** | `js/game/garage-preview.js` | ~530 | med | Turntable render path; shares `gfx` / mesh caches. |
| **CONSOLIDATE** | photo-mode state → `photomode.js` | ~240 | low | Leftover after the first photo extraction. |
| **LEAVE** | `updateCar`, `render()`, `G` façade, `apex.js` | — | extreme | Hot path / ratchet-as-drift-alarm. |

Do **not** extract collisions or `updateCar` unless physics work is the task.

---

## Agent-surface / tools (no deletes)

Forwarders (`ui-mcp-survey.mjs`, `.claude/skills/playwright-probe/shot.mjs`)
and the official/wrapper MCP pairs stay: `agent-surface.test.mjs` locksteps them.
WGX probe variants (`validate` / `capture` / `shot` / `gfx-probe`) each caught
a distinct boot defect — collapsing them is not cleanup.
