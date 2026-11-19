// Scenery ENGINE ordering pins (audit W21, 2026-11-10): reserve / record only
// what lands. Each case is "a fix applied to one helper and not its siblings":
//   - pine() reserves its spot, coplanar facets and note only once it lands
//     (tree() / lobedTree() already did), and un-notes a dropped pine;
//   - cypress / stonePine / broadleafFall / acacia / plane take their record
//     back when the trunk is refused (tree()'s refuseTree, H26b);
//   - grandstandEx records its barrier and solid only after both suppression
//     exits (a suppressed stand left an invisible wall, bahrain T1);
//   - ledFacadeBands anchors each frustum at its band's BASE and keeps one taper;
//   - overheadSpan seats its legs with `side` (pit flattening, berm lift).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function load(file, name, globals = {}) {
  const sandbox = { Math, Array, Object, JSON, Number, Infinity, isFinite, Set, Map, Float64Array, Float32Array, Uint8Array, ...globals };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  seedLog(ctx);
  const src = fs.readFileSync(path.join(ROOT, file), "utf8").replace(/^const\b/gm, "var");
  vm.runInContext(src, ctx, { filename: absSrc(file) });
  return ctx[name];
}

const Geom = load("js/track/core/geom.js", "TrackGeom");

function natureHarness(over = {}) {
  const Nature = load("js/track/scenery/nature.js", "SceneryNature", {
    TrackGeom: Geom, TrackSceneryData: { CROWD_DAY: [[0.5, 0.5, 0.5]], STAND_LIVERIES: {} },
    TrackGraph: { NODE_COLOR: [1, 1, 1] },
    SceneryLandforms: { create: () => ({ peak: () => {}, mountain: () => {}, ridge: () => {} }) },
  });
  const N = 200;
  const out = { pos: [], nrm: [], col: [], idx: [], mat: [], _mat: 0 };
  const notes = [], unnoted = [], suppressed = [], barriers = [], solids = [], instances = [];
  const track = { total: N * 4, rx: Array(N).fill(1), ry: Array(N).fill(0), rz: Array(N).fill(0),
    tx: Array(N).fill(0), ty: Array(N).fill(0), tz: Array(N).fill(1),
    barL: Array(N).fill(12), barR: Array(N).fill(12) };
  const ctx = Object.assign({
    out, track, def: { id: "fixture" }, n: N, ds: 4, hw: Array(N).fill(6),
    px: Array(N).fill(0), py: Array(N).fill(0), pz: Array.from({ length: N }, (_, i) => i * 4),
    MAT: Geom.MAT, NIGHT: false, vadd: Geom.vadd, norm: Geom.norm, upOf: () => [0, 1, 0],
    bankOffsetAt: () => 0, hash: () => 0.3, terrainYAt: () => 0, groundYAt: () => 0,
    onTrack: () => false, rejBox: () => false, barrierClear: () => true, massBlocked: () => false,
    note: (kind, c, sz, meta) => { const rec = { kind, c, sz, meta }; notes.push(rec); return rec; },
    unnote: (rec) => unnoted.push(rec),
    noteSuppressed: (kind) => suppressed.push(kind),
    recordBarrier: (...a) => barriers.push(a), indexSolid: (...a) => solids.push(a),
    instance: (key, place, build, meta) => { instances.push({ key, meta }); return 1; },
    addBox: Geom.addBox, addCyl: Geom.addCyl, addCone: Geom.addCone, addFrustum: Geom.addFrustum,
    addPrism: Geom.addPrism, addPyramid: Geom.addPyramid, emit: Geom.emit,
  }, over);
  return { nature: Nature.create(ctx), ctx, out, notes, unnoted, suppressed, barriers, solids, instances };
}

test("a dropped pine frees its spot and takes its note back; a landed one reserves", () => {
  let land = 0;
  const h = natureHarness({ instance: (key, place, build, meta) => { h.instances.push({ key, meta }); return land; } });
  h.nature.pine(20, 1, 15, 12, [0.2, 0.4, 0.2]);
  assert.equal(h.instances.length, 1, "the pine was attempted");
  assert.equal(h.unnoted.length, 1, "the dropped pine's note is taken back");
  assert.equal(h.unnoted[0], h.notes[0]);
  land = 5;
  h.nature.pine(20, 1, 15, 12, [0.2, 0.4, 0.2]);
  assert.equal(h.instances.length, 2, "the same spot is still free after a drop (it was reserved before the fix)");
  assert.equal(h.unnoted.length, 1, "a landed pine keeps its note");
  h.nature.pine(20, 1, 15, 12, [0.2, 0.4, 0.2]);
  assert.equal(h.instances.length, 2, "a landed pine reserves its spot");
});

test("a refused trunk takes back the tree's record for every species with a note", () => {
  for (const [name, call] of [
    ["cypress", (n) => n.cypress(20, 1, 15, 10, [0.2, 0.4, 0.2])],
    ["stonePine", (n) => n.stonePine(20, 1, 15, 10, [0.2, 0.4, 0.2])],
    ["broadleafFall", (n) => n.broadleafFall(20, 1, 15, 10, [0.6, 0.4, 0.2])],
    ["acacia", (n) => n.acacia(20, 1, 15, 10, [0.4, 0.5, 0.2])],
    ["plane", (n) => n.plane(20, 1, 15, 10, [0.3, 0.5, 0.2])],
  ]) {
    const refused = natureHarness({ addCyl: () => false });
    call(refused.nature);
    assert.equal(refused.notes.length, 1, `${name}: noted before the trunk`);
    assert.equal(refused.unnoted.length, 1, `${name}: refused trunk un-notes`);
    assert.equal(refused.out.pos.length, 0, `${name}: no crown without a trunk`);
    assert.equal(refused.out._mat, 0, `${name}: register reset`);
    const ok = natureHarness();
    call(ok.nature);
    assert.equal(ok.unnoted.length, 0, `${name}: a standing tree keeps its record`);
    assert.ok(ok.out.pos.length > 0, `${name}: emits`);
  }
});

test("grandstandEx records its barrier and solid only when the stand ships", () => {
  const sup = natureHarness({ rejBox: () => true });          // every riser refused: bankPlaced === 0
  sup.nature.grandstandEx(0.5, 1, 10, 40, null, null, {});
  assert.deepEqual(sup.suppressed, ["grandstand"]);
  assert.equal(sup.barriers.length, 0, "a suppressed stand leaves no driving wall");
  assert.equal(sup.solids.length, 0, "and no solid footprint");
  assert.equal(sup.unnoted.length, 1, "and no registry record");
  const onRoad = natureHarness({ onTrack: () => true });      // inner face on track
  onRoad.nature.grandstandEx(0.5, 1, 10, 40, null, null, {});
  assert.equal(onRoad.barriers.length + onRoad.solids.length, 0);
  const ok = natureHarness();
  ok.nature.grandstandEx(0.5, 1, 10, 40, null, null, {});
  ok.nature.grandstandEx(0.5, 1, 10, 40, null, null, {});     // second stand: geometry gap gets +MIN_SEP
  assert.equal(ok.barriers.length, 2);
  assert.equal(ok.solids.length, 2);
  for (const b of ok.barriers) assert.equal(b[3], 10, "barrier keeps the AUTHORED gap, not the MIN_SEP-nudged one");
  for (const s of ok.solids) assert.equal(s[3], 10);
});

test("ledFacadeBands: base-anchored bands inside [c, c+h] on one continuous taper", () => {
  const Identity = load("js/track/scenery/identity.js", "SceneryIdentity", { TrackGeom: Geom });
  const calls = [];
  const id = Identity.create({
    out: {}, track: {}, n: 1, hw: [6], px: [0], py: [0], pz: [0], NIGHT: true,
    addBox: () => true, addCyl: () => true, rejRad: () => false, rejBox: () => false,
    addFrustum: (o, c, rB, rT, h) => { calls.push({ c: Array.from(c), rB, rT, h }); return true; },
    vadd: Geom.vadd, hash: () => 0.5, upOf: () => [0, 1, 0], noteSuppressed: () => {},
  });
  const base = [3, 10, -2], H = 34, r0 = 4, bands = 10;
  id.ledFacadeBands(base, H, { r: r0, bands, basis: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] });
  assert.equal(calls.length, bands);
  const bh = H / bands, rAt = (y) => r0 * (1 - 0.55 * y / H);
  calls.forEach((f, i) => {
    assert.ok(Math.abs(f.c[1] - (base[1] + i * bh)) < 1e-9, `band ${i} anchored at its base`);
    assert.ok(Math.abs(f.rB - rAt(i * bh)) < 1e-9 && Math.abs(f.rT - rAt(i * bh + f.h)) < 1e-9, `band ${i} on the taper`);
    if (i) assert.ok(f.rB < calls[i - 1].rB && f.rB <= calls[i - 1].rT + 1e-9, `band ${i} narrower than the one below`);
  });
  const top = calls[bands - 1].c[1] + calls[bands - 1].h;
  assert.ok(top <= base[1] + H + 1e-9, `stack top ${top} stays within the core (${base[1] + H})`);
  // A tilted basis stacks along its up axis, not world Y.
  calls.length = 0;
  const u = [0, Math.cos(0.1), Math.sin(0.1)];
  id.ledFacadeBands([0, 0, 0], 10, { r: 3, bands: 2, basis: [[1, 0, 0], u, [0, -u[2], u[1]]] });
  assert.ok(Math.abs(calls[1].c[2] - u[2] * 5) < 1e-9, "second band offset along the basis up");
});

test("overheadSpan seats its legs with the side (pit flattening / berm lift)", () => {
  const Models = load("js/track/scenery/models.js", "TrackModels", { TrackGeom: Geom });
  const heights = [];
  const diag = { emitted: [], suppressed: [], invalid: [], unsafe: [] };
  const m = Models.create({
    out: Models.scratch(8), water: Models.scratch(4), diagnostics: diag,
    frameAt: () => ({ k: 3, c: [0, 0, 0], r: [1, 0, 0], u: [0, 1, 0], t: [0, 0, 1], hw: 6 }),
    groundHeight: (k, dist, side) => { heights.push(side); return side === 1 ? 0.1 : 0; },
    groundPoint: (k, side, dist, y) => [side * (6 + dist), y, 0],
    preflight: () => true, emitBox: Geom.addBox,
  });
  assert.equal(m.overheadSpan({ id: "g", frac: 0, clearance: 6 }), true);
  assert.deepEqual(heights.slice().sort(), [-1, 1], "each leg asks the ground for its own side");
});

test("a wrong-shape seat.prism / foundation call warns once and emits nothing", async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const { buildContext } = require("../../tools/track/verify-track.cjs");
  const Tracks = buildContext(null, { quiet: true });
  const vmCtx = Tracks._vmContext, warns = [], warn0 = vmCtx.Log.warn;
  vmCtx.Log.warn = (ns, msg) => { warns.push(String(msg)); };
  const results = [];
  try {
    const def = Object.assign(Object.create(Object.getPrototypeOf(Tracks.LIST[0])), Tracks.LIST[0], {
      scenery: (api) => {
        for (let i = 0; i < 2; i++) {
          results.push(api.seat.prism(api.out, { on: 2, at: [10, 10], size: [2, 2, 2] }));
          results.push(api.foundation(api.out, { footprint: [4, 4], at: [10, 10], top: 3 }));
        }
      },
    });
    Tracks.build(def, {});
  } finally { vmCtx.Log.warn = warn0; }
  assert.deepEqual(results, [false, false, false, false], "nothing emitted");
  assert.equal(warns.filter((w) => /seat\.prism\(\) called with the wrong shape/.test(w)).length, 1, "seat.prism warns once");
  assert.equal(warns.filter((w) => /foundation\(\) called with the wrong shape/.test(w)).length, 1, "foundation warns once");
});
