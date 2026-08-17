---
name: scene-graph-instancing
description: Use when migrating scenery emitters to TrackGraph.instance, checking graph parity or instancing reuse, debugging batches()/bakeOnly, wiring instanced GLX draws, or interpreting __apex.trackGraph() stats on a circuit build.
---

# Scene-graph instancing

`js/track/graph.js` (`TrackGraph`) is the scenery **model library + node
graph**. Migrated emitters call `graph.instance(key, place, build, meta)`
instead of emitting inline triangles. Replay goes through **GUARDED** emitters
from `buildProps`. **UNGUARDED** `raw` emitters are only for canonical mesh
baking. Plan + reuse numbers: `docs/research/SCENE-GRAPH-PLAN.md`.

## When to Use

- Converting a composite emitter to `instance(...)`.
- Verifying a migration did not change shipped geometry.
- Inspecting `stats().byKind` or `batches()` → `{ batches, bakeOnly }`.
- Reading live graph state via `__apex.trackGraph()`.

## When NOT to Use

- First-time dressing → **scenery-dress**. Track spline/elevation →
  **debug-tracks**. Shader/GL errors → **webgl-debug**. Treating a pine
  re-param mismatch vs old HEAD as a regression — that look change is the
  worklist (SCENE-GRAPH-PLAN §6).

## Quick Reference

| API | Role |
|---|---|
| `TrackGraph.create({ raw })` | `raw` = UNGUARDED emitters for canonical bake |
| `graph.instance(key, place, build, meta)` | Define-once + place |
| `ctx.instance(...)` | buildProps wrapper — use this in `scenery-*.js` |
| `graph.bake` / `batches` / `stats` | Replay / instanced handoff / reuse |
| `TrackGraph.NODE_COLOR` (`"@node"`) | Per-node tint; canonical mesh bakes white |

```sh
node tools/graph-parity.cjs <id>            # or --all
BASE=<ref> node tools/graph-parity.cjs --all
npm run test:tooling-fast
node tools/test-bg.mjs webgl                # instanced-draw.spec.js
node tools/verify-track.cjs <id>
```

Related: **scenery-dress**, **webgl-debug**, **debug-tracks**.

## Load on demand

- Migration steps, `BASE=` parity, `bakeOnly`, pine re-param, mistakes →
  [references/workflow.md](references/workflow.md).
