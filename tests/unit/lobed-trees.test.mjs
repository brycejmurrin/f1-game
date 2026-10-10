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
    ['js/track/core/geom.js', 'TrackGeom'], ['js/track/scenery/graph.js', 'TrackGraph'],
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
    def: { id: 'fixture' }, theme: 'green', terrainYAt: options.ground || (() => 0),
    groundYAt: () => 0, onTrack: () => false, rejBox: options.rejectBox || (() => false),
    massBlocked: () => false, barrierClear: () => true, hash: () => 0.2,
    upOf: () => [0, 1, 0], bankOffsetAt: () => 0,
    lod: (n, floor) => Math.max(floor, Math.round(n * (options.mobile ? 0.72 : 1))),
    note: (...args) => notes.push(args), noteSuppressed: (...args) => notes.push(args),
    instance: (key, placement, build, metadata, opts) => {
      if (options.instanceResult !== undefined) return options.instanceResult;
      const replay = opts && opts.roundNormals ? { ...emit, roundNormals: geom.roundNormals } : emit;
      return graph.instance(key, placement, build, metadata, replay, out);
    },
  };
  const nature = sandbox.SceneryNature.create(ctx);
  return { ctx, nature, graph, out, notes, calls, sandbox };
}

test("lobed crowns preserve canonical/fused normals, sway and finite recipe budgets", () => {
  for (const mobile of [false, true]) for (let variant = 0; variant < 3; variant++) {
    const f = makeFixture({ mobile });
    const height = 17.6;
    assert.equal(f.nature.tree(variant, 1, 24, height, [.2,.35,.18], { crown:"lobed",variant }), true);
    const batches = f.graph.batches().batches;
    assert.equal(batches.length, 1);
    assert.equal(f.graph.stats().nodes, 1);
    const geo = batches[0].geo;
    assert.equal(geo.idx.length / 3, mobile ? 39 : 51);
    assert.equal(f.out.nrm.length, geo.nrm.length);
    for (let i = 0; i < geo.nrm.length; i++)
      assert.ok(Math.abs(f.out.nrm[i] - geo.nrm[i]) < 1e-9, `normal ${i}`);
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
  assert.equal(f.graph.stats().models,0);
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

test("a tree whose trunk the pit guard rejects leaves no material, note or reserved spot behind", () => {
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
  assert.equal(f.notes.filter((n) => n[0] === "tree").length, 0, "a refused tree is not noted as standing");
  reject.on = false;
  f.nature.tree(0, 1, 24, 12, col);
  assert.ok(f.out.pos.length > 0, "the refused tree must not have taken the planting spot");
});
