# Shared Track Foundation Refactor

## Constraints
- Work in an isolated worktree from the remote default branch.
- Preserve current track-definition behavior unless fixing a confirmed shared defect.
- Keep pure IIFE globals and script-tag loading; add no dependencies or ES modules.
- Use TDD for behavioral changes. Do not commit or push unless requested.

## Architecture
- `js/track-space.js` owns source-lap/racing-lap conversion, node conversion, transformed sampling, and explicit scenery coordinate semantics.
- `js/track-surface.js` owns effective terrain width, strictly monotonic adaptive lateral rails, sag/drop, floor blending, and ground-height sampling.
- `js/track-models.js` provides `TrackModels.create(ctx)`, atomic `modelGroup`, `overheadSpan`, typed `waterSurface`, terrain-conforming `groundPatch`, and `groundedSegments`.
- `js/tracks.js` retains orchestration and compatibility wrappers.

## Required behavior
1. Characterize existing transforms, terrain/grounding, barrier wrapping, and suppression behavior; capture verification baselines.
2. Route elevation, bridge, point, node, and optional scenery transforms through `TrackSpace`, preserving legacy scenery unless a track opts into `sceneryCoordinates`.
3. Make terrain generation and prop grounding consume one `TrackSurface` profile. Subdivide long lateral spans, carve unsafe face interiors, blend edges to the floor, and avoid duplicate rails.
4. Preflight complete model groups atomically. Intentional overhead spans require safe underside clearance and support footprints. Water uses the water buffer; ground helpers sample terrain.
5. Treat `recordBarrier(0, 1, ...)` as a full lap. Allow optional per-sector, side-aware exclusions for generic city, foliage, lamps, and floodlights without changing defaults.
6. Reject non-finite mesh data, invalid indices/dimensions, unsafe required overhead spans, and incomplete required groups. Runtime skips malformed groups and records diagnostics.
7. Load the new globals before `tracks.js`, update the cache build once, document APIs/debug hooks/tests, and provide a per-track migration checklist.

## Verification
- Run pure Node tests for all three globals.
- Run `node tools/verify-track.cjs --all`.
- Run targeted Red Bull Ring and Hungaroring terrain regressions.
- Run full terrain-over-road, props-over-road, walls, elevation, circuit, smoke, and visual suites.
- Classify any failure against the captured baseline; accept no non-finite geometry, unintended terrain over road, inconsistent ground sampling, or new build failure.

## Handoff
After the foundation passes, migrate each circuit in an isolated, track-scoped change. Adopt explicit coordinate semantics and new model/surface helpers, address the circuit audit, run focused surveys/tests, and return a reviewable change set.
