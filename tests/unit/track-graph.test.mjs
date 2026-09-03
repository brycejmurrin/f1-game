/* TrackGraph unit tests — the scenery model library + node graph.
 *
 * Run: node --test tests/unit/track-graph.test.mjs   (also in `npm run test:tooling`)
 *
 * The whole-track parity gate lives in tools/track/graph-parity.cjs (it needs a
 * baseline checkout to diff against). This file pins the contract that gate
 * assumes: that a model is recorded once and replayed faithfully, that replay
 * goes through the caller's GUARDED emitters, and that bake() reconstructs the
 * scene from the graph alone.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// graph.js and geom.js are bare IIFEs assigning one global each — load them the
// same way tools/track/verify-track.cjs does, so this test exercises the shipped file.
function load() {
  const sandbox = { Math, Array, Object, JSON, Number, Infinity, isFinite, console };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  seedLog(ctx);
  for (const rel of ["js/track/core/geom.js", "js/track/scenery/graph.js"]) {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/^const\b/gm, "var");
    vm.runInContext(src, ctx, { filename: rel });
  }
  return ctx;
}

const { TrackGraph, TrackGeom } = load();
// Arrays built inside the VM realm are not reference-equal to host literals, so
// deepEqual against a literal needs the value copied back across the boundary.
const plain = (v) => JSON.parse(JSON.stringify(v));
const RAW = TrackGeom;
const buf = () => ({ pos: [], nrm: [], col: [], idx: [], mat: [], _mat: 0 });
// Identity placement: origin at world zero, axes the world axes.
const AT = (o) => ({ o, r: [1, 0, 0], u: [0, 1, 0], t: [0, 0, 1] });
// A guarded-emitter stand-in that accepts everything and records what it saw.
// Honours out._dryRun / out._absorbOnly the way tracks.js GUARDED emitters do
// for the S3 prefer-instance path (dry = no write; absorbOnly = no write here
// since this stand-in has no terrain absorb).
function emitter(log) {
  const wrap = (name, fn) => (out, ...args) => {
    if (log) log.push([name, ...args]);
    if (out && (out._dryRun || out._absorbOnly)) return true;
    fn(out, ...args); return true;
  };
  return {
    addBox: wrap("box", RAW.addBox), addPrism: wrap("prism", RAW.addPrism),
    addPyramid: wrap("pyramid", RAW.addPyramid), addCyl: wrap("cyl", RAW.addCyl),
    addCone: wrap("cone", RAW.addCone), addFrustum: wrap("frustum", RAW.addFrustum),
  };
}

test("a model is recorded once and reused by every node placing it", () => {
  const g = TrackGraph.create({ raw: RAW });
  const out = buf();
  let builds = 0;
  const build = (rec) => { builds++; rec.box([0, 1, 0], [2, 2, 2], [1, 1, 1]); };
  for (let i = 0; i < 5; i++) g.instance("hut", AT([i * 10, 0, 0]), build, { kind: "hut" }, emitter(), out);

  assert.equal(builds, 1, "build() must run once per KEY, not once per placement");
  const s = g.stats();
  assert.equal(s.nodes, 5);
  assert.equal(s.models, 1);
  assert.equal(s.reuse, 5);
  assert.equal(s.fusedVerts, s.uniqueVerts * 5);
  // and the soup still got all five
  assert.equal(out.pos.length / 3, 24 * 5);
});

test("nodes carry the placement, so the same model lands in different places", () => {
  const g = TrackGraph.create({ raw: RAW });
  const out = buf();
  const build = (rec) => rec.box([0, 0, 0], [1, 1, 1], [1, 1, 1]);
  g.instance("b", AT([10, 0, 0]), build, null, emitter(), out);
  g.instance("b", AT([-4, 2, 7]), build, null, emitter(), out);

  const xs = [], ys = [], zs = [];
  for (let i = 0; i < out.pos.length; i += 3) { xs.push(out.pos[i]); ys.push(out.pos[i + 1]); zs.push(out.pos[i + 2]); }
  assert.equal(Math.min(...xs), -4.5);
  assert.equal(Math.max(...xs), 10.5);
  assert.equal(Math.max(...zs), 7.5);
  assert.deepEqual(plain(g.nodes.map((n) => n.o)), [[10, 0, 0], [-4, 2, 7]]);
});

test("replay goes through the caller's guarded emitters, so suppression still applies", () => {
  const g = TrackGraph.create({ raw: RAW });
  const out = buf();
  // A guard that rejects everything — stands in for a prop over the racing line.
  const rejectAll = {
    addBox: () => false, addPrism: () => false, addPyramid: () => false,
    addCyl: () => false, addCone: () => false, addFrustum: () => false,
  };
  const landed = g.instance("t", AT([0, 0, 0]), (rec) => {
    rec.cyl([0, 0, 0], 1, 3, [1, 1, 1], 6);
    rec.cone([0, 3, 0], 2, 2, [0, 1, 0], 7);
  }, { kind: "tree" }, rejectAll, out);

  assert.equal(landed, 0, "a fully suppressed placement reports zero primitives");
  assert.equal(out.pos.length, 0, "and emits no geometry");
  assert.equal(g.stats().nodes, 0, "a suppressed placement is NOT recorded as a node");
});

test("out._mat is stamped when the model sets it and inherited when it does not", () => {
  const g = TrackGraph.create({ raw: RAW });
  const out = buf();
  out._mat = 9;   // a material left in the register by an earlier emitter
  g.instance("untagged", AT([0, 0, 0]), (rec) => rec.box([0, 0, 0], [1, 1, 1], [1, 1, 1]),
             null, emitter(), out);
  assert.ok(out.mat.every((m) => m === 9), "an untagged model must inherit the live register");

  const out2 = buf();
  out2._mat = 9;
  g.instance("tagged", AT([0, 0, 0]), (rec) => { rec.mat(4); rec.box([0, 0, 0], [1, 1, 1], [1, 1, 1]); },
             null, emitter(), out2);
  assert.ok(out2.mat.every((m) => m === 4), "a tagged model stamps its own material");
});

test("per-node scale sizes a shared model without minting a new one", () => {
  const g = TrackGraph.create({ raw: RAW });
  const out = buf();
  const build = (rec) => rec.box([0, 1, 0], [2, 2, 2], [1, 1, 1]);
  const place = Object.assign(AT([0, 0, 0]), { s: [1, 3, 1] });
  g.instance("post", place, build, null, emitter(), out);

  let maxY = -Infinity;
  for (let i = 1; i < out.pos.length; i += 3) maxY = Math.max(maxY, out.pos[i]);
  assert.equal(maxY, 6, "local centre y=1 and height 2 scale to centre 3, top 6");
  assert.equal(g.stats().models, 1);
});

test("radial ops take the larger XZ scale so a guard footprint is never under-estimated", () => {
  const g = TrackGraph.create({ raw: RAW });
  const seen = [];
  g.instance("mast", Object.assign(AT([0, 0, 0]), { s: [1, 1, 4] }),
             (rec) => rec.cyl([0, 0, 0], 1, 2, [1, 1, 1], 6), null, emitter(seen), buf());
  const [, , rad] = seen[0];
  assert.equal(rad, 4, "radius follows max(|sx|,|sz|), not sx");
});

test("bake() rebuilds the scene from the graph alone", () => {
  const g = TrackGraph.create({ raw: RAW });
  const live = buf();
  const build = (rec) => { rec.mat(2); rec.box([0, 1, 0], [2, 3, 2], [0.5, 0.5, 0.5]); rec.cyl([1, 0, 0], 0.4, 5, [1, 0, 0], 6); };
  for (let i = 0; i < 3; i++) g.instance("kit", AT([i * 7, 0, i]), build, { kind: "kit" }, emitter(), live);

  const rebuilt = buf();
  g.bake(emitter(), rebuilt);

  assert.equal(rebuilt.pos.length, live.pos.length);
  assert.deepEqual(rebuilt.pos, live.pos, "positions must match the live emission exactly");
  assert.deepEqual(rebuilt.idx, live.idx);
  assert.deepEqual(rebuilt.mat, live.mat);
});

test("the canonical mesh is the model at origin — what an instanced renderer uploads", () => {
  const g = TrackGraph.create({ raw: RAW });
  g.instance("b", AT([100, 0, 100]), (rec) => rec.box([0, 0, 0], [2, 2, 2], [1, 1, 1]),
             null, emitter(), buf());
  const m = g.models.get("b");
  assert.equal(m.verts, 24);
  assert.deepEqual(plain(m.aabb.mn), [-1, -1, -1], "canonical geometry is at the ORIGIN, not the placement");
  assert.deepEqual(plain(m.aabb.mx), [1, 1, 1]);
});

test("stats().byKind separates instanceable emitters from continuous ones", () => {
  const g = TrackGraph.create({ raw: RAW });
  const out = buf();
  // fixed dimensions -> one model serves every placement
  for (let i = 0; i < 4; i++)
    g.instance("post|1", AT([i, 0, 0]), (rec) => rec.box([0, 0, 0], [1, 1, 1], [1, 1, 1]),
               { kind: "post" }, emitter(), out);
  // continuous height -> a model per placement
  for (let i = 0; i < 4; i++) {
    const h = 3 + i * 0.137;
    g.instance(`tree|${h}`, AT([i, 0, 9]), (rec) => rec.cyl([0, 0, 0], 0.5, h, [1, 1, 1], 6),
               { kind: "tree" }, emitter(), out);
  }
  const { byKind } = g.stats();
  assert.equal(byKind.post.models, 1);
  assert.equal(byKind.post.reuse, 4);
  assert.equal(byKind.tree.models, 4);
  assert.equal(byKind.tree.reuse, 1);
});

test("NODE_COLOR takes the tint from the node, so tint-only variants share a model", () => {
  const g = TrackGraph.create({ raw: RAW });
  const out = buf();
  const build = (rec) => rec.box([0, 0, 0], [1, 1, 1], TrackGraph.NODE_COLOR);
  const tints = [[1, 0, 0], [0, 1, 0], [0.25, 0.5, 0.75]];
  tints.forEach((col, i) => g.instance("pane", Object.assign(AT([i * 3, 0, 0]), { col }),
                                      build, { kind: "pane" }, emitter(), out));

  assert.equal(g.stats().models, 1, "three tints must NOT mint three models");
  assert.equal(g.stats().byKind.pane.reuse, 3);
  // 24 verts per box, each carrying its own node's colour
  tints.forEach((col, i) => {
    const base = i * 24 * 3;
    assert.deepEqual(plain(out.col.slice(base, base + 3)), col);
    assert.deepEqual(plain(out.col.slice(base + 69, base + 72)), col, "…on the last vertex too");
  });
});

test("the canonical mesh bakes NODE_COLOR as white — colour lives on the node", () => {
  const g = TrackGraph.create({ raw: RAW });
  g.instance("pane", Object.assign(AT([0, 0, 0]), { col: [1, 0, 0] }),
             (rec) => rec.box([0, 0, 0], [1, 1, 1], TrackGraph.NODE_COLOR), null, emitter(), buf());
  const m = g.models.get("pane");
  assert.ok(m.geo.col.every((c) => c === 1), "the shared model carries no tint of its own");
});

test("a node without a colour falls back to white rather than emitting NaN", () => {
  const g = TrackGraph.create({ raw: RAW });
  const out = buf();
  g.instance("pane", AT([0, 0, 0]),
             (rec) => rec.box([0, 0, 0], [1, 1, 1], TrackGraph.NODE_COLOR), null, emitter(), out);
  assert.ok(out.col.every((c) => c === 1));
  assert.ok(out.pos.every(Number.isFinite));
});

// --- batches(): the instanced-draw handoff -------------------------------
// The contract that matters is EQUIVALENCE: transforming a model's canonical
// mesh by its instance matrix must land where replay() put the geometry. If
// that ever drifts, an instanced backend renders a different world from the
// baked one and no parity gate would catch it.
const applyMat4 = (m, i, p) => {
  const b = i * 16;
  return [
    m[b] * p[0] + m[b + 4] * p[1] + m[b + 8] * p[2] + m[b + 12],
    m[b + 1] * p[0] + m[b + 5] * p[1] + m[b + 9] * p[2] + m[b + 13],
    m[b + 2] * p[0] + m[b + 6] * p[1] + m[b + 10] * p[2] + m[b + 14],
  ];
};

test("an instance matrix reproduces exactly what replay() emitted", () => {
  const g = TrackGraph.create({ raw: RAW });
  const live = buf();
  const build = (rec) => { rec.box([0, 1, 0], [2, 3, 2], [0.4, 0.5, 0.6]); };
  // A rotated, translated, non-uniformly scaled basis — nothing axis-aligned.
  const r = [0.6, 0, 0.8], u = [0, 1, 0], t = [-0.8, 0, 0.6];
  const places = [
    { o: [10, 2, -4], r, u, t },
    { o: [-30, 0, 12], r, u, t, s: [1, 2.5, 1] },
  ];
  for (const p of places) g.instance("kit", p, build, { kind: "kit" }, emitter(), live);

  const { batches, bakeOnly } = g.batches();
  assert.equal(bakeOnly.length, 0, "nothing here should be un-instanceable");
  assert.equal(batches.length, 1);
  const [batch] = batches;
  assert.equal(batch.count, 2);

  // Transform the canonical mesh by each instance matrix and compare against
  // the vertices replay() actually wrote, in emission order.
  const canon = batch.geo.pos;
  for (let i = 0; i < batch.count; i++) {
    for (let v = 0; v < canon.length / 3; v++) {
      const p = applyMat4(batch.matrices, i, [canon[v * 3], canon[v * 3 + 1], canon[v * 3 + 2]]);
      const base = (i * canon.length / 3 + v) * 3;
      for (let a = 0; a < 3; a++)
        assert.ok(Math.abs(p[a] - live.pos[base + a]) < 1e-6,
          `instance ${i} vertex ${v} axis ${a}: ${p[a]} vs replayed ${live.pos[base + a]}`);
    }
  }
});

test("a partially suppressed placement is NOT instanced", () => {
  const g = TrackGraph.create({ raw: RAW });
  const out = buf();
  // Reject only the second primitive: the placement ships half a model, so the
  // whole-mesh instance would put the dropped half back.
  let seen = 0;
  const half = Object.assign({}, emitter(), {
    addBox: (o, ...a) => { seen++; if (seen === 2) return false; RAW.addBox(o, ...a); return true; },
  });
  g.instance("two", AT([0, 0, 0]), (rec) => {
    rec.box([0, 0, 0], [1, 1, 1], [1, 1, 1]);
    rec.box([5, 0, 0], [1, 1, 1], [1, 1, 1]);
  }, { kind: "two" }, half, out);

  const { batches, bakeOnly } = g.batches();
  assert.equal(batches.length, 0, "a partial placement must not become an instance");
  assert.equal(bakeOnly.length, 1, "it must be handed back for baking instead");
});

test("radial geometry under a non-uniform XZ scale is NOT instanced", () => {
  const g = TrackGraph.create({ raw: RAW });
  const out = buf();
  const mast = (rec) => rec.cyl([0, 0, 0], 1, 4, [1, 1, 1], 6);
  // sx !== sz: replay makes this round via max(|sx|,|sz|); an instance matrix
  // would make it elliptical, so the two paths would disagree.
  g.instance("mast", Object.assign(AT([0, 0, 0]), { s: [1, 1, 3] }), mast, { kind: "m" }, emitter(), out);
  // sx === sz is fine — uniform in the round plane.
  g.instance("mast", Object.assign(AT([9, 0, 0]), { s: [2, 5, 2] }), mast, { kind: "m" }, emitter(), out);

  const { batches, bakeOnly } = g.batches();
  assert.equal(bakeOnly.length, 1, "the elliptical case must fall back to baking");
  assert.equal(batches.length, 1);
  assert.equal(batches[0].count, 1, "only the uniformly-scaled placement instances");
});

test("per-instance colours ride the batch, and only when the model needs them", () => {
  const g = TrackGraph.create({ raw: RAW });
  const out = buf();
  const tints = [[1, 0, 0], [0, 0.5, 1]];
  tints.forEach((col, i) => g.instance("pane", Object.assign(AT([i * 4, 0, 0]), { col }),
    (rec) => rec.box([0, 0, 0], [1, 1, 1], TrackGraph.NODE_COLOR), null, emitter(), out));
  g.instance("solid", AT([0, 0, 9]), (rec) => rec.box([0, 0, 0], [1, 1, 1], [0.2, 0.2, 0.2]),
    null, emitter(), out);

  const { batches } = g.batches();
  const pane = batches.find((b) => b.model === "pane");
  const solid = batches.find((b) => b.model === "solid");
  assert.deepEqual(Array.from(pane.colors), [1, 0, 0, 0, 0.5, 1]);
  assert.equal(solid.colors, null, "a model with its own colours needs no per-instance array");
});

test("batch order is deterministic", () => {
  const mk = () => {
    const g = TrackGraph.create({ raw: RAW });
    const out = buf();
    for (const key of ["zebra", "alpha", "mid"])
      g.instance(key, AT([0, 0, 0]), (rec) => rec.box([0, 0, 0], [1, 1, 1], [1, 1, 1]),
        null, emitter(), out);
    return g.batches().batches.map((b) => b.model);
  };
  assert.deepEqual(plain(mk()), plain(mk()));
  assert.deepEqual(plain(mk()), ["alpha", "mid", "zebra"]);
});

// S3 skip-fuse: when out._preferInstance is set, full nodes leave no soup verts
// (the GPU batch draws them). bakeOnly / partials still fuse.
test("_preferInstance skips fuse for full instancable nodes", () => {
  const g = TrackGraph.create({ raw: RAW });
  const out = buf();
  out._preferInstance = true;
  const emit = emitter();
  // Two full placements of the same box model — should skip fuse entirely.
  g.instance("box", AT([0, 0, 0]), (rec) => rec.box([0, 0.5, 0], [1, 1, 1], [1, 1, 1]),
    { kind: "box" }, emit, out);
  g.instance("box", AT([4, 0, 0]), (rec) => rec.box([0, 0.5, 0], [1, 1, 1], [1, 1, 1]),
    { kind: "box" }, emit, out);
  assert.equal(out.pos.length, 0, "full nodes must not write the props soup");
  const { batches, bakeOnly } = g.batches();
  assert.equal(bakeOnly.length, 0);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].count, 2);
});

test("a malformed placement is dropped, not emitted as NaN geometry", () => {
  const g = TrackGraph.create({ raw: RAW });
  const out = buf();
  const landed = g.instance("x", { o: [NaN, 0, 0], r: [1, 0, 0], u: [0, 1, 0], t: [0, 0, 1] },
                            (rec) => rec.box([0, 0, 0], [1, 1, 1], [1, 1, 1]), null, emitter(), out);
  assert.equal(landed, 0);
  assert.equal(out.pos.length, 0);
  assert.equal(g.stats().dropped, 1);
});
