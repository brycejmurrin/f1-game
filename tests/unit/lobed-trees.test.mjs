import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function makeFixture(options = {}) {
  const sandbox = { Math, Number, Array, Object, Map, Set, Infinity,
    Log: { info() {}, warn() {} }, TrackSceneryData: { CROWD_DAY: [] } };
  vm.createContext(sandbox);
  for (const [file, name] of [
    ['js/core/mat4.js', 'M4'], ['js/track/scenery/guards.js', 'SceneryGuards'], ['js/track/core/geom.js', 'TrackGeom'], ['js/track/scenery/graph.js', 'TrackGraph'],
    ['js/track/scenery/landforms.js', 'SceneryLandforms'],
    ['js/track/scenery/nature.js', 'SceneryNature'], ['js/track/scenery/models.js', 'TrackModels'],
    ['js/track/scenery/circuit-kit.js', 'CircuitKit'],
  ]) vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8') + '\nthis.' + name + '=' + name, sandbox);
  const geom = sandbox.TrackGeom;
  const graph = sandbox.TrackGraph.create({ raw: geom });
  const out = { pos: [], nrm: [], col: [], mat: [], idx: [] };
  const notes = [], calls = [];
  const track = { n: 16, total: 64,
    rx: Array(16).fill(1), ry: Array(16).fill(0), rz: Array(16).fill(0),
    tx: Array(16).fill(0), ty: Array(16).fill(0), tz: Array(16).fill(1) };
  const emit = {};
  for (const name of ['addBox', 'addCyl', 'addCone', 'addFrustum', 'addPrism', 'addPyramid']) {
    emit[name] = (buffer, ...args) => {
      calls.push({ name, dry: !!buffer._dryRun, args });
      if (options.rejectPrimitive && options.rejectPrimitive(name, args)) return false;
      if (buffer._dryRun) return true;
      geom[name](buffer, ...args);
      return true;
    };
  }
  const ctx = { ...geom, ...emit, out, track, n: 16, ds: 4,
    hw: Array(16).fill(8), px: Array.from({ length: 16 }, (_, i) => i * 40),
    py: Array(16).fill(0), pz: Array(16).fill(0),
    def: { id: 'fixture', furniture: options.furniture }, theme: 'green', terrainYAt: options.ground || (() => 0),
    groundYAt: () => 0, onTrack: () => false, rejBox: options.rejectBox || (() => false),
    massBlocked: () => false, barrierClear: () => true, hash: () => 0.2,
    upOf: () => [0, 1, 0], bankOffsetAt: () => 0,
    lod: (n, floor) => Math.max(floor, Math.round(n * (options.mobile ? 0.72 : 1))),
    note: (...args) => { notes.push(args); return args; },
    unnote: (rec) => { const i = notes.lastIndexOf(rec); if (i >= 0) notes.splice(i, 1); },
    noteSuppressed: (...args) => notes.push(args),
    bakedModel: options.bakedModel,
    clearTreeDist: (k, side, dist) => dist,
    instance: (key, placement, build, metadata, opts) => {
      if (options.instanceResult !== undefined) return options.instanceResult;
      const replay = opts && opts.roundNormals ? { ...emit, roundNormals: geom.roundNormals } : emit;
      return graph.instance(key, placement, build, metadata, replay, out);
    },
  };
  const nature = sandbox.SceneryNature.create(ctx);
  return { ctx, nature, graph, out, notes, calls, sandbox };
}

test("opt-in baked pines share explicit/deferred planting occupancy", () => {
  const stamps = [];
  const f = makeFixture({ furniture: { bakedPines: true },
    bakedModel: (...args) => { stamps.push(args); return true; } });
  const dist = 24 + f.nature.canopyR("pine", 12);
  f.nature.pine(0, 1, dist, 12, [.2, .35, .18]);
  f.ctx.along = (s0, s1, step, visit) => visit(0);
  f.nature.forestEdgeNow(0, 1, 1, 24, { hMin: 12, hMax: 12, pineFrac: 1, spacing: 40, density: .1 });
  f.nature.pine(0, 1, dist, 12, [.2, .35, .18]);
  assert.equal(stamps.length, 1, "overlapping ranks must not stamp the same trunk twice");
  assert.equal(stamps[0][0], "pine_lod0");
  assert.equal(stamps[0][4].height, 12);
  assert.equal(f.graph.stats().nodes, 0, "successful pack placement must not also emit a procedural pine");
  assert.equal(f.out._mat, 0);
});

test("missing baked pine restores the exact procedural fallback", () => {
  const plain = makeFixture(), missing = makeFixture({ furniture: { bakedPines: true }, bakedModel: () => false });
  for (const f of [plain, missing]) f.nature.pine(0, 1, 24, 12, [.2, .35, .18]);
  for (const key of ["pos", "nrm", "col", "mat", "idx"])
    assert.deepEqual(missing.out[key], plain.out[key], key);
  missing.nature.pine(0, 1, 24, 12, [.2, .35, .18]);
  assert.equal(missing.graph.stats().nodes, 1, "fallback also reserves one shared spot");
});

test("circuits without the pine opt-in do not query the baked pack", () => {
  const f = makeFixture({ bakedModel: () => { throw new Error("unexpected pack lookup"); } });
  f.nature.pine(0, 1, 24, 12, [.2, .35, .18]);
  assert.equal(f.graph.stats().nodes, 1);
  assert.ok(f.out.pos.length > 0);
});

test("lobed crowns preserve canonical/fused normals, sway and finite recipe budgets", () => {
  for (const mobile of [false, true]) for (let variant = 0; variant < 3; variant++) {
    const f = makeFixture({ mobile });
    const height = 17.6;
    assert.equal(f.nature.tree(variant, 1, 24, height, [.2,.35,.18], { crown:"lobed",variant }), true);
    const batches = f.graph.batches().batches;
    // #7385 S4: the brown trunk is its own untinted batch, the crown keeps the tint.
    assert.equal(batches.length, 2);
    const trunk = batches.find((b) => b.model.startsWith("tree-lobed|fixed|")), crown = batches.find((b) => b !== trunk);
    assert.ok(trunk && trunk.colors === null && crown.colors, "trunk untinted, crown tinted");
    assert.equal(f.graph.stats().nodes, 1);
    assert.equal((trunk.geo.idx.length + crown.geo.idx.length) / 3, mobile ? 39 : 51);
    // fused order is trunk then crown, the recipe's op order
    const nrm = [...trunk.geo.nrm, ...crown.geo.nrm];
    assert.equal(f.out.nrm.length, nrm.length);
    for (let i = 0; i < nrm.length; i++)
      assert.ok(Math.abs(f.out.nrm[i] - nrm[i]) < 1e-9, `normal ${i}`);
    assert.ok(f.out.pos.every(Number.isFinite));
    assert.ok(f.out.mat.some(m => m > 6 && m < 6.5), "foliage retains per-vertex wind weight");
    for (let i = 0; i < f.out.nrm.length; i += 3)
      assert.ok(Math.abs(Math.hypot(...f.out.nrm.slice(i,i+3)) - 1) < 1e-9);
  }
});

test("a rejected lobed instance leaves the legacy planting site available", () => {
  const f = makeFixture({ instanceResult:0 });
  assert.equal(f.nature.tree(0,1,24,12,[.2,.35,.18],{crown:"lobed",variant:0}), false);
  assert.equal(f.out.pos.length,0);
  assert.equal(f.graph.stats().nodes,0);
  f.nature.tree(0,1,24,12,[.2,.35,.18]);
  assert.ok(f.out.pos.length > 0, "failed instance must not reserve a phantom trunk");
});

test("an obstructed radial crown is rejected before any graph or geometry emission", () => {
  const f = makeFixture({ rejectPrimitive:name=>name === "addCone" });
  assert.equal(f.nature.tree(0,1,24,12,[.2,.35,.18],{crown:"lobed",variant:0}), false);
  assert.equal(f.out.pos.length,0);
  // The whole-tree dry run lives in graph.instance (#2178): the recipe is
  // cached, as a rejected pine's is, but nothing is planted.
  assert.equal(f.graph.stats().nodes,0);
  assert.equal(f.graph.stats().dropped,1);
  assert.ok(f.calls.every(call=>call.dry));
});

test("invalid new crown options fail without geometry or occupancy", () => {
  for (const options of [{variant:3},{variant:NaN},{spread:1.1},{spread:0},{variant:"0"}]) {
    const f = makeFixture();
    assert.equal(f.nature.tree(0,1,24,12,[.2,.35,.18],{crown:"lobed",...options}),false);
    assert.equal(f.out.pos.length,0);
    f.nature.tree(0,1,24,12,[.2,.35,.18]);
    assert.ok(f.out.pos.length>0);
  }
});

test("a tree whose trunk the pit guard rejects leaves no material behind", () => {
  // The trunk's guarded addCyl can refuse (the pit complex keeps footings out).
  // Every tree emitter stamped out._mat = WOOD first and returned past the reset,
  // so the NEXT untextured emitter drew wood; tree() also noted itself and took
  // the planting spot before the trunk existed, so a refused tree still blocked
  // its neighbours' site and left a phantom box in the guard registry.
  const reject = { on: true };
  const f = makeFixture({ rejectPrimitive: (name) => reject.on && name === "addCyl" });
  const col = [0.2, 0.35, 0.18];
  assert.ok(f.ctx.MAT && f.ctx.MAT.WOOD, "fixture exposes the material ids");
  const cases = {
    tree: () => f.nature.tree(0, 1, 24, 12, col),
    "dead tree": () => f.nature.tree(0, 1, 24, 12, col, { deadChance: 1 }),
    conifer: () => f.nature.conifer(0, 1, 24, 12, col),
    broadleafFall: () => f.nature.broadleafFall(0, 1, 24, 12, col),
    acacia: () => f.nature.acacia(0, 1, 24, 12, col),
    plane: () => f.nature.plane(0, 1, 24, 12, col),
  };
  for (const [name, run] of Object.entries(cases)) {
    f.out._mat = 0;
    run();
    assert.equal(f.out._mat, 0, `${name}: out._mat must be reset when the trunk is refused`);
  }
  reject.on = false;
  f.nature.tree(0, 1, 24, 12, col);
});

test("a tree whose trunk the guard refuses leaves no registry note (H26b)", () => {
  const reject = { on: true };
  const f = makeFixture({ rejectPrimitive: (name) => reject.on && name === "addCyl" });
  const col = [0.2, 0.35, 0.18];
  const treeNotes = () => f.notes.filter((n) => n[0] === "tree").length;
  f.nature.tree(0, 1, 24, 12, col);
  f.nature.tree(0, 1, 24, 12, col, { deadChance: 1 });
  assert.equal(treeNotes(), 0, "a refused trunk draws nothing, so it notes nothing");
  const g = makeFixture();
  g.nature.tree(0, 1, 24, 12, col);
  assert.equal(g.notes.filter((n) => n[0] === "tree").length, 1, "a landed trunk is noted once");
});

test("pines on both sides of the road share one handedness and one batch (#7385 S5)", () => {
  const f = makeFixture();
  f.nature.pine(2, 1, 24, 12, [.2, .35, .18]);
  f.nature.pine(10, -1, 24, 12, [.2, .35, .18]);
  assert.equal(f.graph.stats().nodes, 2);
  const batches = f.graph.batches().batches;
  const crowns = batches.filter((b) => b.model.startsWith("pine|") && !b.model.includes("|fixed|"));
  const trunks = batches.filter((b) => b.model.startsWith("pine|fixed|"));
  assert.equal(crowns.length, 1, `one crown batch, not a mirrored pair: ${batches.map((b) => `${b.model}@${b.variant}`)}`);
  assert.equal(crowns[0].count, 2);
  assert.equal(trunks.length, 1);
  assert.equal(trunks[0].count, 2);
  assert.equal(crowns[0].variant, trunks[0].variant);
  // the side -1 pine's frame is a half-turn of the track frame, never a mirror
  for (let i = 0; i < 2; i++) {
    const m = crowns[0].matrices, b = i * 16;
    const det = m[b] * (m[b + 5] * m[b + 10] - m[b + 6] * m[b + 9]) - m[b + 1] * (m[b + 4] * m[b + 10] - m[b + 6] * m[b + 8])
      + m[b + 2] * (m[b + 4] * m[b + 9] - m[b + 5] * m[b + 8]);
    assert.ok(Math.abs(det) > 1e-6);
    if (i) assert.equal(Math.sign(det), Math.sign(m[0] * (m[5] * m[10] - m[6] * m[9]) - m[1] * (m[4] * m[10] - m[6] * m[8]) + m[2] * (m[4] * m[9] - m[5] * m[8])));
  }
});
