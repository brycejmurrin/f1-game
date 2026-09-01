# Scene-graph migration workflow and mistakes

Load this when converting an emitter to `instance()`, reading `bakeOnly`, or
judging a `graph-parity` mismatch.

## Workflow

1. **Read the plan** — `docs/research/SCENE-GRAPH-PLAN.md` for emitter status,
   measured reuse, and S2/S3 draw-path notes. If §6 already lists the emitter
   as landed, skip migration and run parity/reuse only.

2. **Migrate one emitter** in `js/track/scenery-*.js` (or a circuit callback if
   inline):
   - Record ops in `build(rec)` (`rec.box`, `rec.cyl`, …).
   - Call `ctx.instance(key, place, build, meta)` — the buildProps wrapper,
     not `graph.instance` directly — with a stable `key` and `meta.kind`
     matching the emitter name.
   - Use `place.s` for size jitter instead of minting near-duplicate models.
   - Use `NODE_COLOR` (`"@node"`) + `place.col` for per-placement tint.

3. **Parity gate** — geometry must match exactly:
   ```sh
   node tools/graph-parity.cjs <id>
   BASE=<pre-migration-ref> node tools/graph-parity.cjs --all
   ```
   Default `BASE=HEAD` on a clean tree only checks working-tree drift.
   Tolerance is 1e-6 m on positions; indices and `mat` must match exactly.

   Re-parameterising `pine` so geometry is linear (not affine) in scale is a
   documented **look change** (SCENE-GRAPH-PLAN §6/S4). Parity vs a
   pre-re-param `HEAD` is *expected* to fail for pine — move `BASE` forward
   before judging, and accept the look change behind regenerated visual
   baselines.

4. **Reuse check** after build:
   ```js
   await __apex.race("spa"); __apex.trackGraph().stats().byKind
   ```
   Target reuse ≫ 1. `reuse ≈ 1` means every placement minted a distinct
   model — re-parameterise (factor height into `place.s`, split variants into
   discrete keys) before expecting instancing savings. Pine reuse sits at
   ~1.00× today because dimensions are affine in height.

5. **Fast contract then GL wiring**:
   ```sh
   npm run test:tooling-fast
   node tools/test-bg.mjs webgl    # instanced-draw.spec.js — background
   ```

6. **Ship** — bump-cache if you edited `js/`. Visual spot-check:
   **playwright-probe** on a dense track (Spa, Vegas).

`batches()` routing: instanced when `node.full` and no radial op under
non-uniform XZ scale; otherwise the node lands in `bakeOnly` (caller must
`bake()`).

## Common mistakes

- **Skipping `BASE=<ref>`** — `npm run test:graph-parity` with default `HEAD`
  passes on a committed tree even when geometry changed vs the pre-migration
  branch.
- **Replay through UNGUARDED emitters** — bypasses on-track rejection.
- **Unique `key` per placement** — defeats define-once.
- **Ignoring `bakeOnly`** — partially suppressed nodes or radial ops with
  non-uniform XZ scale cannot instanced-draw; omitting `bake()` puts geometry
  back on tarmac.
- **Expecting pine to batch** without re-param.
- **Forgetting `meta.kind`** — `stats().byKind` becomes `"(unkeyed)"`.
- **Editing `js/` during a Playwright run** — use a worktree.
