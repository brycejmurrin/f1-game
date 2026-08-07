---
name: scene-graph-instancing
description: Use when migrating scenery emitters to TrackGraph.instance, checking graph parity or instancing reuse, debugging batches()/bakeOnly, wiring instanced GLX draws, or interpreting __apex.trackGraph() stats on a circuit build.
---

## Overview

`js/track/graph.js` (`TrackGraph`) is the scenery **model library + node graph**.
Each model is a list of primitive ops in canonical space; each placement is a
**node** `{ model, o, r, u, t, s?, col?, meta }`. Migrated emitters call
`graph.instance(key, place, build, meta)` instead of emitting inline triangles.

Replay goes through **GUARDED** emitters from `buildProps` (on-track rejection,
absorb*, same geometry as before). **UNGUARDED** `raw` emitters are only for
canonical mesh baking — never for replay unless intentional.

The migration goal is draw-call reduction: one canonical mesh per model, one
transform per node. Full plan and measured reuse numbers:
`docs/research/SCENE-GRAPH-PLAN.md`.

## When to Use

- Converting a composite emitter (`pine`, `tree`, `building`, …) to
  `instance(key, place, build, meta)`.
- Verifying a migration did not change shipped geometry.
- Inspecting instancing reuse (`stats().byKind`) or the GLX handoff
  (`batches()` → `{ batches, bakeOnly }`).
- Debugging why a prop kind is not batching (partial guard suppression,
  non-uniform XZ scale on radial ops).
- Reading live graph state after a track build via `__apex.trackGraph()`.

## When NOT to Use

- **First-time circuit dressing** with no migration — use **scenery-dress**
  and `docs/SCENERY-API.md`.
- **Track layout / spline / elevation** — use **debug-tracks** or edit
  `js/circuits/<id>.js` geometry, not the graph layer.
- **Renderer bugs** (shader compile, GL errors, shadow pass) — use
  **webgl-debug**; this skill covers the data path into GLX, not the lit shader.
- Expecting **pine** to instancing-win without re-parameterisation — dimensions
  are affine in height (`0.35 + h*0.02`, …), so reuse sits at ~1.00× today
  (see SCENE-GRAPH-PLAN §6).
- **Running `graph-parity` against old HEAD after re-parameterising pine and
  treating a mismatch as a regression.** Re-parameterising `pine` so its
  geometry is purely *linear* (not affine) in its scale parameters is a
  deliberate, documented **look change** — it moves vertices on purpose so a
  per-node scale can finally express it, and SCENE-GRAPH-PLAN §6/S4 says so
  explicitly ("not a bug and not a blocker; it is the actual worklist"). Parity
  vs a **pre-re-param** baseline (old `HEAD`) is *expected* to fail for pine —
  that failure is the point, not a bug to chase. Move `BASE` forward to the ref
  that includes the re-param before judging parity, and expect/accept the look
  change (behind regenerated visual baselines) rather than reverting it.

## Quick Reference

| API | Role |
|---|---|
| `TrackGraph.create({ raw })` | `raw` = UNGUARDED emitters for canonical bake |
| `graph.instance(key, place, build, meta)` | Define-once + place; `place` = `{ o, r, u, t, s?, col? }` |
| `ctx.instance(...)` | Scenery-module wrapper in `tracks.js` buildProps — use this in `scenery-*.js` |
| `graph.bake(emit, out)` | Replay every node through guarded emitters |
| `graph.batches()` | `{ batches, bakeOnly }` — instanced-draw handoff |
| `graph.stats()` | `{ models, nodes, reuse, byKind }` — reuse per `meta.kind` |
| `TrackGraph.NODE_COLOR` (`"@node"`) | Per-node tint; canonical mesh bakes white |
| `TrackGraph.xform(place, local)` | World point from node transform |

| Command / test | Role |
|---|---|
| `node tools/graph-parity.cjs <id>` / `--all` | Vertex-for-vertex prop geometry vs baseline |
| `BASE=<ref> node tools/graph-parity.cjs --all` | Real migration gate (pre-migration ref) |
| `npm run test:graph-parity` | Same as `--all` with default `BASE=HEAD` |
| `npm run test:tooling-fast` | Includes `tests/unit/track-graph.test.mjs` (math contract) |
| `npm run test:webgl` | Includes `tests/specs/instanced-draw.spec.js` (GLX wiring) |
| `node tools/verify-track.cjs <id>` | Catches scenery THROW before browser tests |

| Hook | Role |
|---|---|
| `__apex.trackGraph()` | Live graph after track build (`G.track.graph`) |

**`batches()` routing:** instanced when `node.full` and no radial op under
non-uniform XZ scale; otherwise node lands in `bakeOnly` (caller must `bake()`).

## Workflow

1. **Read the plan** — `docs/research/SCENE-GRAPH-PLAN.md` for emitter status,
   measured reuse, and S2/S3 draw-path notes. If §6 already lists the emitter as
   landed, skip migration and run parity/reuse checks only.

2. **Migrate one emitter** in the scenery module (`js/track/scenery-*.js` or
   circuit callback if inline):
   - Record ops in `build(rec)` using the recorder API (`rec.box`, `rec.cyl`, …).
   - Call `ctx.instance(key, place, build, meta)` (the buildProps wrapper — not
     `graph.instance` directly) with stable `key` and `meta.kind` matching the
     emitter name.
   - Use `place.s` for size jitter instead of minting near-duplicate models.
   - Use `NODE_COLOR` (`"@node"`) + `place.col` for per-placement tint.

3. **Parity gate** — geometry must match exactly:
   ```sh
   node tools/graph-parity.cjs <id>              # one circuit
   BASE=<pre-migration-ref> node tools/graph-parity.cjs --all   # real gate
   ```
   Default `BASE=HEAD` on a clean tree only checks working-tree drift, not a
   cross-ref migration. Tolerance is 1e-6 m on positions; indices and `mat`
   must match exactly.

4. **Reuse check** — after build, read stats:
   ```js
   __apex.race("spa"); __apex.trackGraph().stats().byKind
   ```
   Target reuse ≫ 1 for batching wins. `reuse ≈ 1` means every placement minted
   a distinct model — re-parameterise (factor height into `place.s`, split
   variants into discrete keys) before expecting instancing savings.

5. **Fast contract tests** then **GL wiring**:
   ```sh
   npm run test:tooling-fast    # track-graph.test.mjs
   npm run test:webgl           # instanced-draw.spec.js
   ```

6. **Ship** — bump cache if you edited `js/` (**bump-cache** skill). For a
   visual spot-check, **playwright-probe** on a dense track (Spa, Vegas).

## Common Mistakes

- **Skipping `BASE=<ref>`** — `npm run test:graph-parity` with default `HEAD`
  passes on a committed tree even when geometry changed vs the pre-migration
  branch; set `BASE` to the ref before the emitter move.
- **Replay through UNGUARDED emitters** — bypasses on-track rejection; parity
  may pass in isolation but shipped guard behaviour diverges.
- **Unique `key` per placement** — defeats define-once; one key per model shape
  (plus discrete variants), not per tree.
- **Ignoring `bakeOnly`** — partially suppressed nodes (`!node.full`) or radial
  ops with non-uniform XZ scale cannot instanced-draw; omitting their `bake()`
  path puts geometry back on tarmac.
- **Expecting pine to batch** — height-driven radii create one model per height;
  fix is re-param (scale in `place.s`, fixed canonical radii), not more nodes.
- **Forgetting `meta.kind`** — `stats().byKind` becomes `"(unkeyed)"`; you lose
  the per-emitter reuse signal that drives migration priority.
- **Editing `js/` during a Playwright run** — test server serves the working
  tree; use a worktree if a group is in flight (see `CLAUDE.md`).

## Related skills

- **scenery-dress** — authoring `scenery(api)` before/without graph migration.
- **webgl-debug** — GLX instanced attributes, shader regressions, draw errors.
- **debug-tracks** — track geometry, barriers, ground profile (not prop graph).
