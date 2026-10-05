# Scene-graph instancing (folded from the scene-graph-instancing skill)

`js/track/scenery/graph.js` (`TrackGraph`) is the scenery **model library + node
graph**. Migrated emitters call `graph.instance(key, place, build, meta)`
instead of emitting inline triangles. Replay goes through **GUARDED** emitters
from `buildProps`. **UNGUARDED** `raw` emitters are only for canonical mesh
baking. Plan + reuse numbers: `docs/research/SCENE-GRAPH-PLAN.md`.

## Contents
- When to Use
- When NOT to Use
- Quick Reference
- Migration workflow and mistakes

## When to Use

- Converting a composite emitter to `instance(...)`.
- Verifying a migration did not change shipped geometry.
- Inspecting `stats().byKind` or `batches()` → `{ batches, bakeOnly }`.
- Reading live graph state via `__apex.trackGraph()`.

## When NOT to Use

- First-time dressing → the scenery-dress index (`SKILL.md`). Track spline/elevation →
  **agent-view**. Shader/GL errors → **webgl-debug**. Treating a pine
  re-param mismatch vs old HEAD as a regression — that look change is the
  worklist (SCENE-GRAPH-PLAN §6).

## Quick Reference

| API | Role |
|---|---|
| `TrackGraph.create({ raw })` | `raw` = UNGUARDED emitters for canonical bake |
| `graph.instance(key, place, build, meta)` | Define-once + place |
| `ctx.instance(...)` | buildProps wrapper — use this in `js/track/scenery/*.js` |
| `graph.bake` / `batches` / `stats` | Replay / instanced handoff / reuse |
| `TrackGraph.NODE_COLOR` (`"@node"`) | Per-node tint; canonical mesh bakes white |

```sh
./tools/mcp/apex-tools-mcp.sh call apex_graph_parity '{"base":"HEAD~1","id":"monza"}'
node tools/track/graph-parity.cjs <id>            # or --all
BASE=<ref> node tools/track/graph-parity.cjs --all
npm run test:tooling-fast
node tools/ci/test-bg.mjs gfx                # instanced-draw.spec.js
node tools/track/verify-track.cjs <id>
```

Related: **webgl-debug**, **agent-view**.

## Migration workflow and mistakes

Load this when converting an emitter to `instance()`, reading `bakeOnly`, or
judging a `graph-parity` mismatch.

### Workflow

1. **Read the plan** — `docs/research/SCENE-GRAPH-PLAN.md` for emitter status,
   measured reuse, and S2/S3 draw-path notes. If §6 already lists the emitter
   as landed, skip migration and run parity/reuse only.

2. **Migrate one emitter** in `js/track/scenery/*.js` (`structures`, `city`,
   `nature`, `build-props`). `ctx.instance` is engine-internal, NOT on the
   circuit `api` (`docs/SCENERY-API.md` §Scene graph): a circuit's inline
   `addBox`/`addCyl` runs (Monaco's `js/circuits/scenery/monaco.js` has 100+ `addBox`/`addCyl` calls, zero `instance(`) cannot migrate
   in place — lift them into an engine emitter first:
   - Record ops in `build(rec)` (`rec.box`, `rec.cyl`, …).
   - Call `ctx.instance(key, place, build, meta)` — the buildProps wrapper,
     not `graph.instance` directly — with a stable `key` and `meta.kind`
     matching the emitter name.
   - Use `place.s` for size jitter instead of minting near-duplicate models.
   - Use `NODE_COLOR` (`"@node"`) + `place.col` for per-placement tint.

3. **Parity gate** — geometry must match exactly:
   ```sh
   node tools/track/graph-parity.cjs <id>
   BASE=<pre-migration-ref> node tools/track/graph-parity.cjs --all
   ```
   Default `BASE=HEAD` only checks working-tree drift; on a clean `js/track`+`js/circuits` it refuses (exit 2, verified: prints "nothing to compare"; the MCP tool requires `base`).
   Tolerance is 1e-6 m on positions; indices and `mat` must match exactly.

   Pine now uses canonical geometry and uniform placement scale. Its historical remesh was a
   documented **look change** (SCENE-GRAPH-PLAN §6/S4). Parity vs a
   pre-re-param `HEAD` is *expected* to fail for pine — move `BASE` forward
   before judging, and accept the look change behind regenerated visual
   baselines.

4. **Reuse check** after build (browser-only; node substitute: the parity tool's own
   `by emitter` table + `instanced handoff: N batches, M instances (+K un-instanceable -> bake)`
   line — K is the `bakeOnly` count; Monaco at HEAD~1: 20 batches, 4286 inst, +5 bake, ~20 s for one id):
   ```js
   __apex.race("spa"); __apex.trackGraph().stats().byKind
   ```
   Target reuse ≫ 1. `reuse ≈ 1` means every placement minted a distinct
   model — re-parameterise (factor height into `place.s`, split variants into
   discrete keys) before expecting instancing savings. Pine already batches: canonical 12 m geometry is uniformly scaled per placement.
   Discrete sparse/tier/lean/jitter keys determine the remaining variants.

5. **Fast contract** (`node --test tests/unit/track-graph.test.mjs`, 25 tests, <1 s) **then GL wiring** (browser):
   ```sh
   npm run test:tooling-fast
   node tools/ci/test-bg.mjs gfx    # instanced-draw.spec.js — background
   ```

6. **Ship** — `node tools/gen/gen-shell.mjs --check` ([shell/cache](../../check-changes/references/bump.md): `?v=dev`, no bump) if you edited `js/`. Visual spot-check:
   **playwright-probe** on a dense track (Spa, Vegas).

`batches()` routing: instanced when `node.full` and no radial op under
non-uniform XZ scale; otherwise the node lands in `bakeOnly` (caller must
`bake()`). `batches({instancedOnly:true})` skips nodes not marked `inst`.

**Hand-off record** (PR body): emitter + `meta.kind`, `BASE=<ref>` used and its
`parity exact` line, the `+K -> bake` count before/after, `track-graph.test.mjs`
result; Not run: `gfx` group / `instanced-draw.spec.js` (browser).

### Common mistakes

- **Skipping `BASE=<ref>`** — `npm run test:graph-parity` (no `BASE`) diffs
  HEAD vs the working tree, so it says nothing about a committed migration
  (a clean tree exits 2); name the pre-migration ref.
- **Replay through UNGUARDED emitters** — bypasses on-track rejection.
- **Unique `key` per placement** — defeats define-once.
- **Ignoring `bakeOnly`** — partially suppressed nodes or radial ops with
  non-uniform XZ scale cannot instanced-draw; omitting `bake()` puts geometry
  back on tarmac.
- **Assuming height keys still prevent pine batching.** Pine already uses canonical 12 m geometry with uniform placement scale; discrete sparse/tier/lean/jitter variants still control reuse.
- **Forgetting `meta.kind`** — `stats().byKind` becomes `"(unkeyed)"`.
- **Editing `js/` during a Playwright run** — use a worktree.
