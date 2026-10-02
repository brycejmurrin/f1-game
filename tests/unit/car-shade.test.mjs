/* car-shade.test.mjs — CAR SHADE (js/car/car-shade.js): rounded body sections
 * and smooth shading for the procedural car, ON by default since 2026-10-02
 * (apex26.carSmooth / ?carsmooth=0 opts out).
 *
 * What has to hold for it to be safe as the default:
 *   - the rounded section keeps the trapezoid's ENVELOPE (top and bottom
 *     centres, flank at mid-height), so a stripe, number or light placed on a
 *     panel centre still sits on the skin;
 *   - the loft is closed and faces OUT;
 *   - smoothing merges shallow facets and leaves a real edge (90 degrees) sharp,
 *     never moves a vertex, and leaves lights flat;
 *   - OFF (an opt-out) is byte-identical to a build that has never heard of
 *     CarShade, and ON builds a finite, unit-normal mesh in the same bounds.
 *
 * Run: node --test tests/unit/car-shade.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(import.meta.dirname, "../..");
function load(withShade, storage, search) {
  const ctx = { console, Math, Object, Array, Float32Array, Uint16Array, Uint32Array, JSON, Number, String,
                Boolean, isFinite, isNaN, Map, Set, WeakMap, URLSearchParams };
  if (storage) ctx.localStorage = storage;
  if (search) ctx.location = { search };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  const files = ["js/core/log.js", "js/core/mat4.js", "js/data/teams.js", "js/car/parts.js", "js/car/helmets.js"]
    .concat(withShade ? ["js/car/car-shade.js"] : [], ["js/car/car3d.js"]);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
  const grab = (n) => vm.runInContext(n, ctx);
  return { Car3D: grab("Car3D"), CarShade: withShade ? grab("CarShade") : null };
}
const { Car3D, CarShade } = load(true);

test("the rounded section keeps the trapezoid's envelope: top, bottom and mid-flank are where the flat faces were", () => {
  const f = { z: 1, y: 0.4, w: 0.30, h: 0.12, t: 0.7, x: 0.05 };
  const r = CarShade.ring(f);
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const n = r.length;
  assert.equal(n % 4, 0, "a ring with a point at every compass station");
  const right = r[0], top = r[n / 4], left = r[n / 2], bottom = r[3 * n / 4];
  assert.ok(near(top[0], 0.05) && near(top[1], 0.46), "top centre on the flat top");
  assert.ok(near(bottom[0], 0.05) && near(bottom[1], 0.34), "bottom centre on the flat bottom");
  const midHalf = 0.15 * (1 + 0.7) / 2;   // frame(): w/2 at the bottom, t*w/2 at the top
  assert.ok(near(right[0], 0.05 + midHalf) && near(right[1], 0.4), "right flank at mid-height");
  assert.ok(near(left[0], 0.05 - midHalf), "left flank at mid-height");
  for (const p of r) {
    assert.equal(p[2], 1);
    const v = (p[1] - 0.4) / 0.06, half = 0.15 * (1 + (0.7 - 1) * (v + 1) / 2);
    assert.ok(Math.abs(p[0] - 0.05) <= half + 1e-9, "never outside the trapezoid it replaces");
  }
});

test("the loft is closed and every face points out", () => {
  const out = { pos: [], nrm: [], col: [], mat: [], idx: [] };
  const tri = (o, a, b, c) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    o.pos.push(...a, ...b, ...c); o.tris = (o.tris || []).concat([[a, b, c, n]]);
  };
  const F = { z: 1, y: 0.4, w: 0.3, h: 0.12, t: 0.8 }, R = { z: 0.2, y: 0.42, w: 0.4, h: 0.16, t: 0.75 };
  CarShade.loft(out, F, R, [1, 0, 0], tri);
  const cz = 0.6, cy = 0.41;
  for (const [a, b, c, n] of out.tris) {
    const m = [(a[0] + b[0] + c[0]) / 3 - 0, (a[1] + b[1] + c[1]) / 3 - cy, (a[2] + b[2] + c[2]) / 3 - cz];
    assert.ok(n[0] * m[0] + n[1] * m[1] + n[2] * m[2] > 0, "outward");
  }
  // Closed: every edge is shared by exactly two triangles.
  const key = (p) => p.map((v) => v.toFixed(6)).join(",");
  const edges = new Map();
  for (const [a, b, c] of out.tris) for (const [p, q] of [[a, b], [b, c], [c, a]]) {
    const k = [key(p), key(q)].sort().join("|");
    edges.set(k, (edges.get(k) || 0) + 1);
  }
  for (const [k, n] of edges) assert.equal(n, 2, "open edge " + k);
});

test("the rounded sidepod is closed, faces out, and keeps the flank flat where the sponsor decal sits", () => {
  const st = [
    { z: 0.62, inner: 0.30, outer: 0.66, innerBottom: 0.235, outerBottom: 0.258, innerTop: 0.45, outerTop: 0.46 },
    { z: 0.22, inner: 0.29, outer: 0.70, innerBottom: 0.20, outerBottom: 0.208, innerTop: 0.49, outerTop: 0.475 },
    { z: -1.48, inner: 0.23, outer: 0.38, innerBottom: 0.13, outerBottom: 0.134, innerTop: 0.30, outerTop: 0.27 },
  ];
  for (const side of [-1, 1]) {
    for (const p of st) {
      const ring = CarShade.podRing(p, side);
      let area = 0;
      for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; area += a[0] * b[1] - b[0] * a[1]; }
      assert.ok(area > 0, "counter-clockwise from +Z on either side");
      // The flank between 10 % and 88 % of its height is the straight outer
      // edge, x = outer: the decal (32-80 %) and flank details stay on it.
      const h = p.outerTop - p.outerBottom;
      const flank = ring.filter((q) => Math.abs(Math.abs(q[0]) - p.outer) < 1e-9);
      assert.ok(flank.length >= 2, "a straight flank survives");
      const ys = flank.map((q) => q[1]);
      assert.ok(Math.min(...ys) <= p.outerBottom + 0.10 * h + 1e-9 && Math.max(...ys) >= p.outerTop - 0.12 * h - 1e-9);
      for (const q of ring) assert.ok(Math.abs(q[0]) <= p.outer + 1e-9 && q[1] <= Math.max(p.innerTop, p.outerTop) + 1e-9, "inside the old section");
    }
  }
  const out = { tris: [] };
  CarShade.podLoft(out, st, [1, 0, 0], [0, 0, 0], (o, a, b, c) => o.tris.push([a, b, c]));
  const key = (p) => p.map((v) => v.toFixed(6)).join(",");
  const edges = new Map();
  for (const [a, b, c] of out.tris) for (const [p, q] of [[a, b], [b, c], [c, a]]) {
    const k = [key(p), key(q)].sort().join("|");
    edges.set(k, (edges.get(k) || 0) + 1);
  }
  for (const [k, n] of edges) assert.equal(n, 2, "open edge " + k);
  // Outward: every face points away from its own pod's centre line.
  for (const [a, b, c] of out.tris) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const m = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    const s = Math.sign(m[0]), cx = s * 0.45, cy = 0.30;
    const d = [m[0] - cx, m[1] - cy, 0];
    if (Math.abs(n[2]) > Math.hypot(n[0], n[1])) continue;   // the end caps
    assert.ok(n[0] * d[0] + n[1] * d[1] > 0, "outward");
  }
});

function meshOf(tris, mat = 20) {
  const out = { pos: [], nrm: [], col: [], mat: [], idx: [] };
  for (const [a, b, c] of tris) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const l = Math.hypot(...n); n = n.map((v) => v / l);
    const base = out.pos.length / 3;
    out.pos.push(...a, ...b, ...c); out.nrm.push(...n, ...n, ...n);
    out.col.push(1, 1, 1, 1, 1, 1, 1, 1, 1); out.mat.push(mat, mat, mat); out.idx.push(base, base + 1, base + 2);
  }
  return out;
}

test("smoothing merges a shallow facet, keeps a 90 degree edge sharp, moves no vertex and leaves lights flat", () => {
  // Two faces meeting at 20 degrees along the x axis, and a third at 90.
  const s = Math.sin(20 * Math.PI / 180), c = Math.cos(20 * Math.PI / 180);
  const shallow = meshOf([[[0, 0, 0], [1, 0, 0], [0, 0, -1]], [[0, 0, 0], [0, s, c], [1, 0, 0]]]);
  const pos0 = shallow.pos.slice();
  CarShade.smooth(shallow);
  assert.deepEqual(shallow.pos, pos0, "no vertex moves");
  const n0 = shallow.nrm.slice(0, 3), n1 = shallow.nrm.slice(9, 12);   // vertex (0,0,0) in each face
  assert.ok(Math.abs(n0[0] - n1[0]) + Math.abs(n0[1] - n1[1]) + Math.abs(n0[2] - n1[2]) < 1e-9, "shared vertex, one normal");
  assert.ok(Math.abs(Math.hypot(...n0) - 1) < 1e-9, "unit length");
  const corner = meshOf([[[0, 0, 0], [1, 0, 0], [0, 0, -1]], [[0, 0, 0], [0, 1, 0], [1, 0, 0]]]);
  const before = corner.nrm.slice();
  CarShade.smooth(corner);
  assert.deepEqual(corner.nrm, before, "a 90 degree edge stays sharp");
  const lamp = meshOf([[[0, 0, 0], [1, 0, 0], [0, 0, -1]], [[0, 0, 0], [0, s, c], [1, 0, 0]]], 25);
  const lit = lamp.nrm.slice();
  CarShade.smooth(lamp, { skip: [25] });
  assert.deepEqual(lamp.nrm, lit, "an emissive surface is left flat");
});

test("the switch: ON by default; storage or URL picks every car, one team, or none, and an opt-out sticks", () => {
  const norm = CarShade._norm;
  assert.equal(norm(null), "*", "nothing chosen: the default, every car"); assert.equal(norm(""), "*");
  assert.equal(norm("1"), "*"); assert.equal(norm("all"), "*"); assert.equal(norm("ON"), "*");
  assert.equal(norm("0"), null); assert.equal(norm("off"), null); assert.equal(norm("false"), null);
  assert.equal(norm("mclaren"), "mclaren");
  assert.equal(norm("<script>"), "*", "not a team id: the default");
  const store = new Map();
  const ls = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const { CarShade: S } = load(true, ls);
  assert.equal(S.on("mclaren"), true, "on by default"); assert.equal(S.any(), true);
  S.set("mclaren");
  assert.equal(store.get(S.KEY), "mclaren");
  assert.equal(S.on("mclaren"), true); assert.equal(S.on("ferrari"), false, "one team only");
  S.set("1");
  assert.equal(S.on("ferrari"), true);
  S.set("off");
  assert.equal(store.get(S.KEY), "0", "an opt-out is STORED: removing the key would mean the default (on)");
  assert.equal(S.on("mclaren"), false); assert.equal(S.any(), false);
  const { CarShade: Reloaded } = load(true, ls);
  assert.equal(Reloaded.on("mclaren"), false, "the opt-out survives a reload");
  const { CarShade: Url } = load(true, ls, "?carsmooth=1");
  assert.equal(Url.on("mclaren"), true, "the URL wins for that page load");
  assert.equal(load(true, null, "?carsmooth=0").CarShade.any(), false, "?carsmooth=0 turns it off with nothing stored");
  Reloaded.set(null);
  assert.equal(store.has(Reloaded.KEY), false, "set(null) clears the choice"); assert.equal(Reloaded.on("ferrari"), true, "back to the default");
});

test("Car3D: OFF is the build that never heard of CarShade; ON (the default) is finite, unit-normal and in the same bounds", () => {
  const { Car3D: Plain } = load(false);
  const opts = { teamId: "mclaren", num: 4, measure: true };
  const ref = Plain.build([0.9, 0.5, 0.1], [0.1, 0.1, 0.1], opts);
  const off = Car3D.build([0.9, 0.5, 0.1], [0.1, 0.1, 0.1], Object.assign({ smooth: false }, opts));
  const A = (x) => Array.from(x);   // two vm realms: compare values, not prototypes
  // `smooth: false` is a per-BUILD override of the body; the tyres follow the
  // page's switch (wheels are cached apart from teams), so only they may differ.
  const wheels = off.parts.find((p) => p.name === "wheels"), wv = off.pos.length / 3 - wheels.vertices;
  assert.equal(wv, off.parts.slice(0, -1).reduce((n, p) => n + p.vertices, 0), "wheels are the last part");
  assert.deepEqual(A(off.pos), A(ref.pos)); assert.deepEqual(A(off.mat), A(ref.mat));
  assert.deepEqual(A(off.nrm).slice(0, wv * 3), A(ref.nrm).slice(0, wv * 3));
  // A player who opted out ("0" stored) gets exactly the car that never heard of CarShade, tyres included.
  const optOut = new Map([["apex26.carSmooth", "0"]]);
  const { Car3D: Opted } = load(true, { getItem: (k) => (optOut.has(k) ? optOut.get(k) : null), setItem() {}, removeItem() {} });
  const opted = Opted.build([0.9, 0.5, 0.1], [0.1, 0.1, 0.1], opts);
  assert.deepEqual(A(opted.pos), A(ref.pos), "opt-out pos"); assert.deepEqual(A(opted.nrm), A(ref.nrm), "opt-out nrm");
  const t0 = Date.now();
  const on = Car3D.build([0.9, 0.5, 0.1], [0.1, 0.1, 0.1], Object.assign({ smooth: true }, opts));
  const ms = Date.now() - t0;
  const dflt = Car3D.build([0.9, 0.5, 0.1], [0.1, 0.1, 0.1], opts);
  assert.deepEqual(A(dflt.pos), A(on.pos), "nothing chosen builds the rounded car"); assert.deepEqual(A(dflt.nrm), A(on.nrm));
  assert.equal(on.pos.length, on.nrm.length);
  assert.equal(on.idx.length % 3, 0, "whole triangles");
  for (let i = 0; i < on.nrm.length; i += 3) {
    const l = Math.hypot(on.nrm[i], on.nrm[i + 1], on.nrm[i + 2]);
    assert.ok(Number.isFinite(l) && Math.abs(l - 1) < 1e-4, "unit normal at vertex " + i / 3);
  }
  const bounds = (m) => { const b = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
    for (let i = 0; i < m.pos.length; i += 3) for (let a = 0; a < 3; a++) {
      b[a * 2] = Math.min(b[a * 2], m.pos[i + a]); b[a * 2 + 1] = Math.max(b[a * 2 + 1], m.pos[i + a]); }
    return b; };
  const bOn = bounds(on), bRef = bounds(ref);
  for (let k = 0; k < 6; k++) assert.ok(Math.abs(bOn[k] - bRef[k]) < 1e-6, "same overall bounds: the round section stays inside the trapezoid");
  // Only the body sections (nose/tub, deck, sidepods) change; every other part is vertex-for-vertex the same.
  const byName = (m) => Object.fromEntries(m.parts.map((p) => [p.name, p]));
  const pOn = byName(on), pRef = byName(ref);
  for (const name of Object.keys(pRef)) {
    if (name === "chassis" || name === "hood" || name === "sidepods") continue;
    assert.equal(pOn[name].vertices, pRef[name].vertices, name + " untouched");
  }
  assert.ok(ms < 1500, `a smoothed build stays cheap enough for a garage pick (${ms} ms)`);
  // The cockpit (first-person) build never rounds or smooths its body; only the
  // tyres it shows follow the page's switch (shaded shoulders, no vertex moved).
  const ck = Car3D.build([0.9, 0.5, 0.1], [0.1, 0.1, 0.1], { teamId: "mclaren", smooth: true, cockpit: true, measure: true });
  const ck0 = Plain.build([0.9, 0.5, 0.1], [0.1, 0.1, 0.1], { teamId: "mclaren", cockpit: true, measure: true });
  const cw = ck.parts.find((p) => p.name === "wheels"), ckBody = ck.pos.length / 3 - (cw ? cw.vertices : 0);
  assert.deepEqual(A(ck.pos), A(ck0.pos), "cockpit pos");
  assert.deepEqual(A(ck.nrm).slice(0, ckBody * 3), A(ck0.nrm).slice(0, ckBody * 3), "cockpit body normals");
});

test("tyres, with the switch on for any car: the tread shoulder is shaded from its real shape, same geometry, unit normals", () => {
  const store = new Map([["apex26.carSmooth", "mclaren"]]);
  const ls = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem() {}, removeItem() {} };
  const { Car3D: On } = load(true, ls), { Car3D: Off } = load(false);
  const a = Off.buildWheel(0.34, [0.9, 0.9, 0.9]), b = On.buildWheel(0.34, [0.9, 0.9, 0.9]);
  assert.notDeepEqual(Array.from(b.nrm), Array.from(a.nrm), "the wheel changes");
  for (let i = 0; i < b.nrm.length; i += 3) {
    const l = Math.hypot(b.nrm[i], b.nrm[i + 1], b.nrm[i + 2]);
    assert.ok(Math.abs(l - 1) < 1e-4, "unit normal");
  }
  assert.deepEqual(Array.from(b.pos), Array.from(a.pos), "no vertex moves: the compound band and lettering stay where they were");
  // The tread shoulder now leans out along the axle: a radial-only normal has x = 0.
  assert.ok(b.nrm.some((v, i) => i % 3 === 0 && Math.abs(v) > 0.05 && b.mat[i / 3] === On.SURFACES.rubber), "shoulder normals tilt");
  const layers = On.buildWheelLayers(0.34, [0.9, 0.9, 0.9]);
  assert.ok(layers.rotating.pos.length > 0 && layers.fixed.pos.length > 0, "the layered wheel builds too");
});
