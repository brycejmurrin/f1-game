// #7386 (hunt #7385 S2/S3): a scenery model key names GEOMETRY, not a tint. A single-colour model takes its colour
// from the node (TrackGraph.NODE_COLOR), and a billboard face takes its height from the place origin, so neither
// mints one instanced batch per colour or per height. VM build on the browser's instancing path, as
// tools/perf/lod-census.mjs measures it (detail 0, day).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const E = require("../../tools/lib/track-build-vm.cjs").buildContext({ compact: true });
E.sandbox.GLX.createInstancedBatch = (geo, matrices) => ({ tris: geo.idx.length / 3, count: matrices.length / 16 });

const built = new Map();
function batchesOf(id) {
  if (!built.has(id)) {
    const def = E.Tracks.LIST.find((d) => d.id === id);
    const tr = E.Tracks.build(def, { night: false, detail: 0 });
    built.set(id, { graph: tr.graph, batches: tr.graph.batches({ instancedOnly: true }).batches });
  }
  return built.get(id);
}
const family = (b) => String(b.model).split("|")[0];

test("monaco: one crowd-riser and one street-barrier batch per variant, whatever the colour", () => {
  const { batches } = batchesOf("monaco");
  for (const fam of ["crowd-riser", "street-barrier"]) {
    const rows = batches.filter((b) => family(b) === fam && b.model.split("|").length === 1);
    assert.ok(rows.length > 0, `${fam} is instanced at monaco`);
    const variants = rows.map((b) => b.variant);
    assert.equal(new Set(variants).size, variants.length, `${fam}: ${rows.map((b) => b.model + "#" + b.variant).join(", ")}`);
    assert.equal(batches.filter((b) => family(b) === fam).length, rows.length, `${fam}: no colour-keyed batch left`);
  }
});

test("singapore: billboard faces are keyed by style, never by height", () => {
  const { batches } = batchesOf("singapore");
  const faces = batches.filter((b) => family(b) === "billboard-face");
  assert.ok(faces.length > 0, "singapore has instanced billboard faces");
  const keyed = faces.filter((b) => /^-?\d+(\.\d+)?$/.test(b.model.split("|")[1]));
  assert.equal(keyed.length, 0, `no face model carries a height: ${keyed.map((b) => b.model).join(", ")}`);
  const styles = new Set(faces.map((b) => b.model.split("|")[1]));
  const variants = new Set(faces.map((b) => b.variant));
  // One face model per style (the panel also per side) and post colour: at most styles x variants here.
  assert.ok(faces.length <= styles.size * variants.size, `${faces.length} face batches for ${styles.size} styles`);
});

test("a merged single-colour model tints every instance with exactly its fused colour", () => {
  const NC = E.sandbox.TrackGraph.NODE_COLOR;
  const merged = ["crowd-riser", "street-barrier", "tyre-cap"];
  for (const id of ["monaco", "monza", "montreal"]) {
    const { graph, batches } = batchesOf(id);
    for (const b of batches) {
      if (!merged.includes(family(b)) && !/^guardrail-rail\|[^|]+$/.test(b.model)) continue;
      const m = graph.models.get(b.model);
      assert.ok(m.ops.every((o) => o.col === NC), `${id} ${b.model}: every op takes the node colour`);
      assert.ok(m.geo.col.every((c) => c === 1), `${id} ${b.model}: the canonical mesh is white`);
      const want = graph.nodes.filter((n) => n.model === b.model && n.inst);
      const tints = [];
      for (let i = 0; i < b.count; i++) tints.push(Array.from(b.colors.slice(i * 3, i * 3 + 3)).join(","));
      for (const n of want) assert.ok(n.col, `${id} ${b.model}: every placement names its colour`);
      const fused = new Set(want.map((n) => Float32Array.from(n.col).join(",")));
      for (const t of tints) assert.ok(fused.has(t), `${id} ${b.model}: tint ${t} is a fused colour`);
    }
  }
});
