# Cota tecpro wall: SwiftShader vs llvmpipe (2026-10-10)

- The yellow T12 wall (`tyre-stack|tecpro|...0.95,0.85,0.1`, x70) is built, culled (52 drawn), submitted
  (`renderer.info.render` triangles rise with its layer on) and casts shadows on SwiftShader, yet is not
  visible in the lit pass there. Mesh state matches the batches that do draw: same material uuid as the
  cap and the other stacks, tint all 1, emissive 0, alpha 1, frustumCulled false, all instance
  determinants positive.
- The same frame (orbit 0.635, az 90, dist 40) through Mesa llvmpipe (`--use-gl=angle --use-angle=gl
  --ignore-gpu-blocklist` under xvfb-run) DRAWS the wall: dark caps on yellow bodies
  (session_01Dxhx4KVdkaugd3GjPg3T4c).
- Reading: a SwiftShader instanced-draw artefact, not (yet) a product bug. Hardware is unmeasured.
- Rule: verify instanced-batch visibility on llvmpipe or hardware, never SwiftShader. Tool:
  `node tools/gfx/batch-visible-probe.mjs cota [--hw]`; its `= batch` line names the GL renderer and
  prints `SOFTWARE-not-hardware` for software ones. Its pixel check returns null on a single-colour canvas.
- `renderer.info` totals swing by a constant ~18090 triangles frame to frame with the sim frozen, so
  per-mesh triangle deltas count only when `stable` is true in the `--dump` output.
