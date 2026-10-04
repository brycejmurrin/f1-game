/* tlx-wheel-inst — FIELD WHEEL INSTANCING on TLX (queueInstanced/flushInstanced).
 *
 * WHY THIS EXISTS. Every rival's wheel layers (rotating wheel, fixed layer,
 * compound stripe, spin disc, brake ring) are SHARED meshes, but each was its
 * own TLX draw(): a pooled THREE.Mesh, a render object and a per-object uniform
 * update — ~84 rotating wheels alone with the field in view. car-draw.js now
 * hands a rival's layers to gfx.queueInstanced (TLX only) and flushDecals
 * calls gfx.flushInstanced, which emits one InstancedMesh draw per group.
 *
 * The failure modes are all ON SCREEN and invisible to a software probe that
 * only counts draws, so this pins them in Node:
 *   - grouping: mesh x material x winding x quantised emissive/alpha x layer,
 *     the group keeping its FIRST exact emissive/alpha (night wheels stay 0.12);
 *   - WINDING: a mirrored (det < 0) world matrix lands in an object whose own
 *     matrixWorld is mirrored, and object * instance reproduces the caller's
 *     world matrix exactly (three keys frontFace on the OBJECT's determinant);
 *   - flush order (layer, then first seen) so a spin disc blends under its ring;
 *   - the off-switch (apex26.tlxWheelInst=0) and software WebGPU (skipBatches)
 *     refuse the draw, and the caller then draw()s it;
 *   - car-draw routes RIVALS only (never the player, never the mirror's bare
 *     wheels), and GLX/WGX (no queueInstanced) keep the plain draw() path;
 *   - the field's draw count: 21 rivals in full detail collapse to a handful.
 * Lifts the REAL source out of js/render/three/tlx.js and runs it against
 * three r186's real InstancedMesh/Matrix4 from the vendored core build, and the
 * real js/car/car-draw.js through tests/helpers/car-draw-vm.mjs. No browser. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { carDrawVm } from "../helpers/car-draw-vm.mjs";

const read = (rel) => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");
const TLX = read("js/render/three/tlx.js");
const THREE = await import(new URL("../../vendor/three-0.186.0/three.core.min.js", import.meta.url).href);

function slice(src, a, b, what) {
  const i = src.indexOf(a);
  assert.notEqual(i, -1, what + ": start marker moved — update this test, do not delete it");
  const j = src.indexOf(b, i);
  assert.notEqual(j, -1, what + ": end marker moved — update this test");
  return src.slice(i, j);
}

/** The pure queue alone. */
function liftQueue() {
  const body = slice(TLX, "const INSTQ_BINS", "// ── end wheel-inst-queue ──", "createInstQueue");
  // eslint-disable-next-line no-new-func
  return new Function(`"use strict";${body};return createInstQueue;`)();
}

/** The queue + TLX's instancing glue, over three's real InstancedMesh. */
function liftTlx({ storage = {}, skip = false, mirror = false } = {}) {
  const body = slice(TLX, "const _instAlive = new Set();", "// the mesh pool is keyed on (geometry, material)", "TLX instancing glue");
  const recs = [];
  const scene = new THREE.Scene();
  const env = {
    THREE, scene, renderer: {}, window: {},
    localStorage: { getItem: (k) => (k in storage ? storage[k] : null) },
    pushRec: (geo, m, mat, em, al, lg, chunked, instanced) => recs.push({ geo, m, mat, em, al, instanced }),
    // materialFor stand-in: one object per (blend class, instanced) — the real
    // key (tlx-mat-key-memo.test.mjs) only has to separate what it separates.
    materialFor: (() => { const c = new Map(); return (o, ch, inst) => {
      const k = ((o && o.alpha < 1) ? "t" : "o") + (o && o.noAlphaWrite ? "na" : "") + (inst ? "|in" : "");
      if (!c.has(k)) c.set(k, { key: k }); return c.get(k); }; })(),
    drawEm: (o) => (o && o.emissive !== undefined ? o.emissive : 0),
    drawAl: (o) => (o && o.alpha !== undefined ? o.alpha : 1),
    skipBatches: () => skip, unlitMat: {},
    _mirActive: mirror, _envActive: false, _poolNow: 0, _warmPending: null,
    PRUNE_EVERY_MS: 5000, PRUNE_IDLE_MS: 20000,
  };
  const names = Object.keys(env);
  // eslint-disable-next-line no-new-func
  const api = new Function(...names, `"use strict";${body};
    return { queueInstanced, flushInstanced, dropInstGeo, instQ: _instQ, registry: _instRegistry,
             meshes: () => _instMeshes, on: _wheelInstOn, showInstanced: _showInstanced };`)(...names.map((k) => env[k]));
  return { ...api, recs, scene };
}

const geo = () => {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
  g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(9).fill(0.5), 3));
  g.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2]), 1));
  return g;
};
const mesh = () => ({ __tlx: true, geo: geo() });
/** A world matrix: translation t, optionally mirrored like the car basis (right = -X). */
function world(t, mirrored = true, yaw = 0.3) {
  const m = new THREE.Matrix4().makeRotationY(yaw);
  if (mirrored) m.premultiply(new THREE.Matrix4().makeScale(-1, 1, 1));
  m.setPosition(t[0], t[1], t[2]);
  return Float32Array.from(m.elements);
}

test("one group per mesh x material x winding x quantised emissive/alpha x layer", () => {
  const Q = liftQueue()();
  const gA = {}, gB = {}, matO = {}, matT = {};
  const W = world([1, 0, 2]), P = world([1, 0, 2], false);
  for (let i = 0; i < 4; i++) Q.push(gA, matO, 0.12, 1, 0, W);
  Q.push(gB, matO, 0.12, 1, 0, W);              // another mesh
  Q.push(gA, matT, 0.12, 0.5, 0, W);            // another material
  Q.push(gA, matO, 0.12, 1, 0, P);              // the other winding
  Q.push(gA, matO, 0.12 + 0.01, 1, 0, W);       // same 1/32 bin as 0.12
  Q.push(gA, matO, 0.50, 1, 0, W);              // another emissive bin
  Q.push(gA, matO, 0.12, 1, 1, W);              // another layer
  const seen = [];
  const n = Q.flush((g) => seen.push({ geo: g.geo, mat: g.mat, neg: g.neg, em: g.em, al: g.al, layer: g.layer, n: g.n }));
  assert.equal(n, 6);
  assert.equal(Q.stat.queued, 10);
  const first = seen.find((g) => g.geo === gA && g.mat === matO && g.neg && g.layer === 0 && g.em < 0.2);
  assert.equal(first.n, 5, "the four wheels plus the same-bin draw share one instanced draw");
  assert.equal(first.em, 0.12, "the group keeps its FIRST exact emissive — the night wheels are not drawn at a bin centre");
  assert.ok(seen.some((g) => g.geo === gA && !g.neg), "the un-mirrored draw has its own group");
  assert.equal(Q.pending(), 0, "flush empties the queue");
});

test("flush order is (layer, first seen): every disc blends before every ring", () => {
  const Q = liftQueue()();
  const disc = {}, ring = {}, wheel = {}, mat = {};
  const W = world([0, 0, 0]);
  Q.push(ring, mat, 0.9, 0.8, 4, W);            // car 1: a ring, no disc
  Q.push(wheel, mat, 0, 1, 0, W);
  Q.push(disc, mat, 0, 0.5, 3, W);              // car 2: disc then ring
  Q.push(ring, mat, 0.4, 0.4, 4, W);
  const order = [];
  Q.flush((g) => order.push([g.geo === disc ? "disc" : g.geo === ring ? "ring" : "wheel", g.layer]));
  assert.deepEqual(order, [["wheel", 0], ["disc", 3], ["ring", 4], ["ring", 4]]);
});

test("reset discards an unflushed frame; drop() empties a freed geometry's queued groups", () => {
  const Q = liftQueue()();
  const g = {}, h = {}, mat = {};
  Q.push(g, mat, 0, 1, 0, world([0, 0, 0]));
  Q.reset();
  assert.equal(Q.flush(() => assert.fail("a reset queue must not emit")), 0);
  Q.push(g, mat, 0, 1, 0, world([0, 0, 0]));
  Q.push(h, mat, 0, 1, 0, world([0, 0, 0]));
  Q.drop(g);   // an LRU eviction mid-loop (putBoundedMesh) freed it
  const out = [];
  Q.flush((x) => out.push(x.geo));
  assert.deepEqual(out, [h]);
});

test("TLX: one InstancedMesh per group, and object * instance reproduces each world matrix (winding preserved)", () => {
  const T = liftTlx();
  assert.equal(T.on, true, "default ON");
  const wheel = mesh(), opts = { emissive: 0.12, roughness: 0.55, doubleSided: true };
  const Ws = [world([1, 0, 5]), world([-1, 0, 5]), world([1, 0, 1.7]), world([-1, 0, 1.7])];
  const Wp = world([3, 0, 9], false);
  for (const W of Ws) assert.equal(T.queueInstanced(wheel, W, opts, 0), true);
  assert.equal(T.queueInstanced(wheel, Wp, opts, 0), true);
  assert.equal(T.flushInstanced(), 2);
  assert.equal(T.recs.length, 2, "five draws became two instanced draw records");
  assert.equal(T.meshes(), 2);
  for (const r of T.recs) {
    assert.ok(r.instanced && r.instanced.imesh.isInstancedMesh);
    assert.equal(r.em, 0.12);
    T.showInstanced(r, 0);
    const im = r.instanced.imesh;
    assert.equal(im.frustumCulled, false, "as every pooled draw() mesh: TLX never frustum-culls a per-car draw");
    const objDet = im.matrixWorld.determinant();
    const want = im.count === 4 ? Ws : [Wp];
    assert.equal(objDet < 0, want[0] === Ws[0], "the mirrored group's OBJECT carries the reflection (frontFace)");
    assert.ok(im.geometry.getAttribute("instanceTint"), "the instanced lit graph reads instanceTint");
    assert.notEqual(im.geometry, wheel.geo, "a clone: the source geometry gains no instance attribute");
    assert.equal(im.geometry.getAttribute("position"), wheel.geo.getAttribute("position"), "the clone SHARES the vertex buffers");
    for (let i = 0; i < im.count; i++) {
      const inst = new THREE.Matrix4().fromArray(im.instanceMatrix.array, i * 16);
      const got = im.matrixWorld.clone().multiply(inst).elements;
      for (let k = 0; k < 16; k++) assert.ok(Math.abs(got[k] - want[i][k]) < 1e-6, `instance ${i} element ${k}`);
      assert.ok(inst.determinant() > 0, "the instance matrix itself is a proper rotation");
    }
  }
});

test("TLX: steady state reuses the same InstancedMesh; freeMesh's dropInstGeo retires it", () => {
  const T = liftTlx();
  const wheel = mesh(), W = world([0, 0, 0]);
  T.queueInstanced(wheel, W, {}, 0); T.flushInstanced();
  const im = T.recs[0].instanced.imesh;
  for (let f = 0; f < 5; f++) { T.queueInstanced(wheel, W, {}, 0); T.flushInstanced(); }
  assert.equal(T.meshes(), 1);
  assert.equal(T.recs[5].instanced.imesh, im, "three's render-object cache stays bounded by the distinct groups");
  T.dropInstGeo(wheel.geo);
  assert.equal(T.meshes(), 0);
  assert.equal(T.registry.length, 0);
  assert.ok(!im.parent, "removed from the scene");
});

test("TLX refuses the draw (caller draw()s it): off-switch, software WebGPU, a mirror pass", () => {
  for (const [why, o] of [["apex26.tlxWheelInst=0", { storage: { "apex26.tlxWheelInst": "0" } }],
    ["skipBatches", { skip: true }], ["mirror pass", { mirror: true }]]) {
    const T = liftTlx(o);
    assert.equal(T.queueInstanced(mesh(), world([0, 0, 0]), {}, 0), false, why);
    assert.equal(T.flushInstanced(), 0, why);
    assert.equal(T.recs.length, 0, why);
  }
});

// ── car-draw.js routing, through the real seam ──────────────────────────────
function rigField(gfxExtra, near = true) {
  const v = carDrawVm();
  Object.assign(v.G.gfx, gfxExtra);
  const cars = v.field((c, i) => (near ? 5 + i * 1.5 : 60 + i * 30));
  for (const c of cars) Object.assign(c, { speed: 70, brakeHeat: c.isPlayer ? 0 : 0.6, tyre: { colour: [1, 0, 0] } });
  v.G.camEye = [0, 1, 0];
  return { v, cars };
}
function drawField(v, cars) {
  const base = Float32Array.from(world([0, 0, 0]));
  const opt = { roughness: 0.55, metalness: 0.3, specular: 0.45, emissive: 0, doubleSided: true };
  v.carDraw.beginDecals();
  for (const c of cars) { base[14] = c.s; v.carDraw.drawPlayerWheels(c, base, 1 / 60, opt); }
  v.carDraw.flushDecals(false);
}

test("car-draw: rivals queue by layer, the player and the mirror's bare wheels draw(), flushDecals flushes", () => {
  const q = [], flushes = [];
  const { v, cars } = rigField({
    queueInstanced: (m, mat, o, layer) => { q.push(layer); return true; },
    flushInstanced: () => flushes.push(q.length),
  });
  drawField(v, cars);
  const rivals = cars.filter((c) => !c.isPlayer).length;
  assert.equal(rivals, 21);
  const count = (L) => q.filter((x) => x === L).length;
  assert.equal(count(0), rivals * 4, "every rival's 4 rotating wheels");
  assert.equal(count(1), rivals * 4, "fixed layers (rivals inside WHEEL_EXTRAS_M)");
  assert.ok(count(4) > 0, "hot brake rings queue as layer 4");
  assert.deepEqual(flushes, [q.length], "flushDecals flushes the queue exactly once, after the loop");
  assert.ok(v.rec.draws.length > 0 && v.rec.draws.length <= 4 * 5, "only the PLAYER's layers went through draw()");
  // The mirror's bare wheels never queue.
  q.length = 0; v.rec.draws.length = 0;
  v.carDraw.drawMirrorCar(cars.find((c) => !c.isPlayer), Float32Array.from(world([0, 0, 0])), {}, false);
  assert.equal(q.length, 0);
});

test("car-draw: a refused draw (and GLX/WGX, which declare no queue) goes through draw() unchanged", () => {
  const plain = rigField({});
  drawField(plain.v, plain.cars);
  const refused = rigField({ queueInstanced: () => false, flushInstanced: () => 0 });
  drawField(refused.v, refused.cars);
  assert.equal(refused.v.rec.draws.length, plain.v.rec.draws.length);
  assert.ok(plain.v.rec.draws.length > 21 * 8, "the field's wheel draws all reach draw() without the capability");
});

// The VM's meshes are plain build descriptors; give each a stable TLX handle
// (one BufferGeometry per distinct mesh object), as createMesh would.
// The VM's CarMesh stub mints a fresh {carMesh: name} per call where the real
// getBrakeRing/getSpinDisc/getCompoundRing return one cached mesh: key those by name.
function asTlx(T) {
  const h = new Map();
  const tlx = (m) => { const k = (m && m.carMesh) || m; let x = h.get(k); if (!x) { x = mesh(); h.set(k, x); } return x; };
  return { queueInstanced: (m, mat, o, L) => T.queueInstanced(tlx(m), mat, o, L), flushInstanced: T.flushInstanced };
}
test("the field's draw count: 21 rivals collapse from one draw per layer to one per group (real TLX queue)", () => {
  const T = liftTlx();
  const off = rigField({});
  drawField(off.v, off.cars);
  const on = rigField(asTlx(T));
  drawField(on.v, on.cars);
  const before = off.v.rec.draws.length, after = on.v.rec.draws.length + T.recs.length;
  // VM numbers (2026-10-04): 22-car field within 60 m, brakes hot, spinning.
  assert.ok(after * 5 < before, `instancing should cut the field's wheel draws > 5x (before ${before}, after ${after})`);
  // Far field (the lite path: rotating wheels only).
  const T2 = liftTlx();
  const far = rigField(asTlx(T2), false);
  drawField(far.v, far.cars);
  assert.ok(T2.recs.length <= 2, `far rivals' rotating wheels: a handful of instanced draws (${T2.recs.length})`);
  console.log(`# field wheel draws: ${before} plain -> ${after} with instancing (${on.v.rec.draws.length} player draw() + ${T.recs.length} instanced); far field ${T2.recs.length} instanced`);
});
