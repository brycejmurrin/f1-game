// Landed-placement bookkeeping (#7243 member 3, hunt #7213 rows 4+5): an
// emitter records, blocks and claims only what ships.
//   3a marshalPost / billboard read ctx.instance's landed count: a dropped
//      instance leaves no note, no blockAt and (marshalPost) no panel or lamp;
//   3c building(): a refused section after the plinth still blocks and claims
//      the footprint the plinth stands on; with nothing standing the note goes;
//   3d wall(): `alt` is part of the dedupe key, so two runs that differ only
//      in it both emit.
// (3b, tree()'s check-then-reserve, is pinned in scenery-engine-order.test.mjs.)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function sandbox(files, globals = {}) {
  const sb = { Math, Map, Set, Object, Array, JSON, Number, Infinity, isFinite, Float32Array, Float64Array, Uint8Array, ...globals };
  sb.window = sb;
  vm.createContext(sb);
  seedLog(sb);
  for (const f of ["js/core/mat4.js", "js/track/core/geom.js", "js/track/scenery/guards.js", ...files])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8").replace(/^const\b/gm, "var"), sb, { filename: absSrc(f) });
  return sb;
}

function harness(over = {}) {
  const rec = { notes: [], unnoted: [], blocks: [], masses: [], instances: [] };
  const base = (TG) => ({
    out: { pos: [], nrm: [], col: [], idx: [], mat: [], _mat: 0 },
    glassBuf: { pos: [], nrm: [], col: [], idx: [], mat: [], _mat: 0 },
    track: {}, def: { id: "stub", street: false }, theme: "neutral", n: 100, ds: 4,
    hw: new Float32Array(100).fill(6), px: new Float32Array(100), py: new Float32Array(100),
    pz: Float32Array.from({ length: 100 }, (_, k) => k * 4),
    NIGHT: false, MAT: TG.MAT, lod: (x) => x, seat: { prism: () => {} },
    addBox: TG.addBox, addCyl: TG.addCyl, addCone: TG.addCone, addFrustum: TG.addFrustum,
    addPrism: TG.addPrism, addPyramid: TG.addPyramid, RAW: TG,
    post() {}, recordBarrier() {}, indexBarrier() {},
    groundYAt: () => 0, terrainYAt: () => 0, onTrack: () => false, overheadSpan: () => true, rejBox: () => false,
    massBlocked: () => false, treeInFootprint: () => false,
    hash: () => 0.5, cross: TG.cross, norm: TG.norm, vadd: TG.vadd,
    anchor: (k, side, gap) => ({ c: [side * (6 + gap), 0, k * 4], r: [1, 0, 0], u: [0, 1, 0], t: [0, 0, 1] }),
    kitOf: (_key, def) => def, noteSuppressed() {}, noteSpan() {},
    note: (kind, c, sz, meta) => { const r = { kind, c, sz, meta }; rec.notes.push(r); return r; },
    unnote: (r) => rec.unnoted.push(r),
    blockAt: (...a) => rec.blocks.push(a),
    massAdd: (...a) => rec.masses.push(a),
    instance: (key, _place, build, meta) => {
      rec.instances.push({ key, meta });
      build({ mat() {}, box() {}, prism() {}, cyl() {}, frustum() {}, cone() {} });
      return 1;
    },
  });
  return { rec, ctx: (TG) => Object.assign(base(TG), typeof over === "function" ? over(rec, TG) : over) };
}

function structures(over) {
  const sb = sandbox(["js/track/scenery/data.js", "js/track/scenery/stands.js", "js/track/scenery/structures.js"]);
  const h = harness(over), ctx = h.ctx(sb.TrackGeom);
  return { S: sb.SceneryStructures.create(ctx), ctx, ...h.rec };
}

function city(over) {
  const sb = sandbox(["js/track/scenery/models.js", "js/track/scenery/facade.js", "js/track/scenery/city.js"],
    { TrackSceneryData: {}, TrackGraph: { NODE_COLOR: [1, 1, 1] } });
  const h = harness(over), ctx = h.ctx(sb.TrackGeom);
  return { C: sb.SceneryCity.create(ctx), ctx, ...h.rec };
}

test("3a: a marshalPost whose instance lands 0 leaves no note, block or panel vertices", () => {
  const dropped = structures({ instance: () => 0 });
  dropped.S.marshalPost(10, 1, 4);
  assert.equal(dropped.notes.length, 1, "noted before the instance");
  assert.deepEqual(dropped.unnoted, dropped.notes, "the dropped post's note is taken back");
  assert.equal(dropped.blocks.length, 0, "no blockAt in front of empty ground");
  assert.equal(dropped.ctx.out.pos.length, 0, "no flag panel or lamp vertices");

  const landed = structures();
  landed.S.marshalPost(10, 1, 4);
  assert.equal(landed.unnoted.length, 0, "a landed post keeps its note");
  assert.equal(landed.blocks.length, 1, "and blocks the car");
  assert.ok(landed.ctx.out.pos.length > 0, "and emits its panel");
});

test("3a: a billboard with nothing landed leaves no note or block", () => {
  const dropped = city({ instance: () => 0 });
  dropped.C.billboard(10, 1, 4, 8, 3, [0.9, 0.8, 0.2], { style: "panel" });
  assert.equal(dropped.notes.length, 1);
  assert.deepEqual(dropped.unnoted, dropped.notes, "the dropped board's note is taken back");
  assert.equal(dropped.blocks.length, 0, "no blockAt for a board that is not there");

  const landed = city();
  landed.C.billboard(10, 1, 4, 8, 3, [0.9, 0.8, 0.2], { style: "panel" });
  assert.equal(landed.unnoted.length, 0);
  assert.equal(landed.blocks.length, 1);
});

test("3c: a refused first section still blocks and claims the plinth that ships", () => {
  const massOnly = (land) => () => ({
    instance: (_key, _place, build, meta) => (meta && meta.kind === "buildingMass" ? land : 1),
  });
  const plinth = city(massOnly(0)());
  plinth.C.building(10, 1, 20, 12, 24, 10, { arch: "flat" });
  assert.ok(plinth.ctx.out.pos.length > 0, "the plinth shipped");
  assert.equal(plinth.blocks.length, 1, "a car stops at the plinth");
  assert.equal(plinth.masses.length, 1, "later masses yield to its footprint");
  assert.equal(plinth.unnoted.length, 0, "the building record stays: something stands");

  const nothing = city({ instance: () => 0, addBox: () => false });
  nothing.C.building(10, 1, 20, 12, 24, 10, { arch: "flat" });
  assert.equal(nothing.blocks.length + nothing.masses.length, 0, "nothing stands, nothing blocks");
  assert.deepEqual(nothing.unnoted, nothing.notes, "and the record goes back");

  // setback: the lower storey landed, the upper one refused → still solid.
  let calls = 0;
  const upper = city({ instance: (_k, _p, _b, meta) => (meta && meta.kind === "buildingMass" ? (calls++ ? 0 : 1) : 1) });
  upper.C.building(10, 1, 20, 12, 60, 10, { arch: "setback" });
  assert.equal(upper.blocks.length, 1, "a landed lower storey blocks");
  assert.equal(upper.masses.length, 1);

  const whole = city();
  whole.C.building(10, 1, 20, 12, 24, 10, { arch: "flat" });
  assert.equal(whole.blocks.length, 1, "a standing building blocks once");
  assert.equal(whole.masses.length, 1);
});

test("3d: two wall() runs that differ only in alt both emit", () => {
  const h = structures();
  h.S.wall(0.1, 0.2, 1, 3, 1, null, 0.5);
  const first = h.instances.length;
  assert.ok(first > 0, "the first wall emits");
  h.S.wall(0.1, 0.2, 1, 3, 1, null, 0.5);
  assert.equal(h.instances.length, first, "an identical re-cover is still dropped");
  h.S.wall(0.1, 0.2, 1, 3, 1, null, 0.5, 0.06);
  assert.ok(h.instances.length > first, "the alt run is a different wall and emits");
  assert.ok(h.instances.slice(first).some((i) => i.key.startsWith("wall|0.56|")), "with its thicker alternate slabs");
});
