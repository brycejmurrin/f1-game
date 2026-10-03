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

test("the section is flat-topped (a real nose), rounder underneath, and sink() says where its top has fallen", () => {
  const f = { z: 1, y: 0.4, w: 0.20, h: 0.12, t: 0.7 }, hh = 0.06, topSide = 0.1 * 0.7;
  const fine = CarShade.ring(f, 4000);
  const yAt = (x, upper) => fine.filter((p) => (upper ? p[1] > f.y : p[1] < f.y))
    .reduce((m, p) => (Math.abs(p[0] - x) < Math.abs(m[0] - x) ? p : m))[1];
  const k = 0.8, dropTop = f.y + hh - yAt(k * topSide, true), riseBottom = yAt(k * 0.1, false) - (f.y - hh);
  assert.ok(dropTop / hh < 0.12, `flat top: ${(dropTop * 1000).toFixed(1)} mm down at 80 % of the top width`);
  assert.ok(riseBottom > 2 * dropTop, "the underside stays rounder than the top");
  const st = { top: f.y + hh, bottom: f.y - hh, topSide };
  assert.ok(Math.abs(CarShade.sink(st, k * topSide) - dropTop) < 0.0015, "sink() matches the section within 1.5 mm");
  assert.equal(CarShade.sink(st, 0), 0, "nothing to sink at the centre line");
});

test("a livery nose cap wraps the rounded nose: every point a few mm proud, none poking out", () => {
  const nose = { top: 0.36, bottom: 0.25, side: 0.075, topSide: 0.052 };   // a car3d nose anchor
  const body = { z: 2.5, y: (nose.top + nose.bottom) / 2, w: nose.side * 2, h: nose.top - nose.bottom, t: nose.topSide / nose.side };
  const capSt = { z: 2.5, y: body.y, w: body.w + 0.010, h: body.h + 0.010, t: 0.70 };   // car3d's cap station (its own t is for the flat cap)
  const out = { pos: [] };
  CarShade.capLoft(out, capSt, Object.assign({}, capSt, { z: 2.1 }), nose, nose, [1, 0, 0], (o, a, b, c) => o.pos.push(a, b, c));
  const ring = CarShade.ring(body), capRing = CarShade.ring(Object.assign({}, capSt, { t: body.t }));
  for (let i = 0; i < ring.length; i++) {
    const d = Math.hypot(capRing[i][0] - ring[i][0], capRing[i][1] - ring[i][1]);
    const out_ = Math.hypot(capRing[i][0], capRing[i][1] - body.y) > Math.hypot(ring[i][0], ring[i][1] - body.y);
    assert.ok(out_ && d > 0 && d <= 0.008, `cap point ${i} is ${(d * 1000).toFixed(1)} mm proud`);
  }
  assert.ok(out.pos.some((p) => p[2] === 2.5) && out.pos.some((p) => p[2] === 2.1), "the cap lofts end to end");
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
  // Only the parts CarShade reshapes change; every other part is vertex-for-vertex the same.
  // Body sections (nose/tub, deck, sidepods) first; then (2026-10-02, batch 3) the small
  // parts hung off them: floor and cockpit tub (chassis), bolsters, airbox (engineCover),
  // headrest (cockpit), mirrors, the driver's arms (every beam is a rod), halo, exhaust
  // core, nose pylons (frontWing), endplates/pylon/diffuser (rearAssembly), brake ducts
  // and wishbones (suspension). Paint, decal substrates, helmet and wheels stay as built.
  const ROUNDED = new Set(["chassis", "hood", "sidepods", "bolsters", "engineCover", "cockpit", "mirrors", "driver",
                           "halo", "exhaust", "frontWing", "rearAssembly", "brakeDucts", "suspension"]);
  const byName = (m) => Object.fromEntries(m.parts.map((p) => [p.name, p]));
  const pOn = byName(on), pRef = byName(ref);
  for (const name of Object.keys(pRef)) {
    if (ROUNDED.has(name)) continue;
    assert.equal(pOn[name].vertices, pRef[name].vertices, name + " untouched");
  }
  for (const name of ["livery", "helmet", "sharkFin", "sponsorBoard", "bodyDetail", "wheels"]) assert.ok(pRef[name], name + " is still a part");
  assert.ok(ms < 1500, `a smoothed build stays cheap enough for a garage pick (${ms} ms)`);
  // The cockpit (first-person) build never rounds or smooths its body; only the
  // tyres it shows follow the page's switch (shaded shoulders, no vertex moved).
  const ck = Car3D.build([0.9, 0.5, 0.1], [0.1, 0.1, 0.1], { teamId: "mclaren", smooth: true, cockpit: true, measure: true });
  const ck0 = Plain.build([0.9, 0.5, 0.1], [0.1, 0.1, 0.1], { teamId: "mclaren", cockpit: true, measure: true });
  const cw = ck.parts.find((p) => p.name === "wheels"), ckBody = ck.pos.length / 3 - (cw ? cw.vertices : 0);
  assert.deepEqual(A(ck.pos), A(ck0.pos), "cockpit pos");
  assert.deepEqual(A(ck.nrm).slice(0, ckBody * 3), A(ck0.nrm).slice(0, ckBody * 3), "cockpit body normals");
});

test("a shadow caster (silhouette build) keeps the rounded shape but skips the smoothing pass: depth never reads normals", () => {
  const { Car3D: Plain } = load(false);
  const c1 = [0.9, 0.5, 0.1], c2 = [0.1, 0.1, 0.1], opts = { teamId: "mclaren", silhouette: true };
  // Triangles whose three normals differ: only a smoothing pass (or a tube) makes one.
  // A tube's ring vertices are SHARED (indexed) and smooth as built — and the rounded
  // car's halo is a finer tube than the plain one (12 sides along a spline), so tubes
  // are left out by that mark: a triangle of unshared vertices with differing normals
  // can only have come from the smoothing pass.
  const soft = (m) => { let n = 0; const N = m.nrm, I = m.idx, uses = new Uint32Array(N.length / 3);
    for (const v of I) uses[v]++;
    for (let t = 0; t < I.length; t += 3) { if (uses[I[t]] > 1 || uses[I[t + 1]] > 1 || uses[I[t + 2]] > 1) continue;
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      if (N[a] !== N[b] || N[a + 1] !== N[b + 1] || N[a + 2] !== N[b + 2] || N[a] !== N[c] || N[a + 1] !== N[c + 1] || N[a + 2] !== N[c + 2]) n++; }
    return n; };
  const caster = Car3D.build(c1, c2, opts), plainCaster = Plain.build(c1, c2, opts);
  const painted = Car3D.build(c1, c2, { teamId: "mclaren" }), plainPainted = Plain.build(c1, c2, { teamId: "mclaren" });
  assert.notDeepEqual(Array.from(caster.pos), Array.from(plainCaster.pos), "the caster is the ROUNDED shape (its shadow matches the body)");
  assert.equal(soft(caster), soft(plainCaster), "no smoothed triangles beyond what a plain caster already has");
  assert.ok(soft(painted) > soft(plainPainted) + 1000, "the painted car IS smoothed (its caster is the only build that skips it)");
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

// ---- Small parts (2026-10-02, batch 3): struts, rounded blocks, shaped plates ----
function collect() {   // positions only
  const out = { tris: [] };
  out.tri = (o, a, b, c) => o.tris.push([a, b, c]);
  return out;
}
const key6 = (p) => p.map((v) => v.toFixed(6)).join(",");
// Closed and consistently wound: every DIRECTED edge once and its reverse once;
// and wound OUT, so the signed volume is positive.
function assertClosedOut(tris, what) {
  const dir = new Map();
  let vol = 0;
  for (const [a, b, c] of tris) {
    for (const [p, q] of [[a, b], [b, c], [c, a]]) { const k = key6(p) + ">" + key6(q); dir.set(k, (dir.get(k) || 0) + 1); }
    vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  for (const [k, n] of dir) {
    assert.equal(n, 1, `${what}: edge ${k} used ${n} times one way`);
    const [p, q] = k.split(">");
    assert.equal(dir.get(q + ">" + p), 1, `${what}: open edge ${k}`);
  }
  assert.ok(vol > 0, `${what} faces out (signed volume ${vol})`);
}

test("small-part primitives are closed solids that face out: strut, bent pipe, rounded block, C tub, plate, tunnel, floor", () => {
  const C = [1, 0, 0];
  const cases = {
    strut: (o) => CarShade.strut(o, [0.1, 0.2, 1.0], [0.6, 0.3, 1.1], 0.05, 0.016, C, o.tri, null, { n: 6, taper: 0.7 }),
    "vertical strut": (o) => CarShade.strut(o, [0.1, 0.09, 2.46], [0.1, 0.29, 2.46], 0.17, 0.055, C, o.tri, null, { n: 10 }),
    "strut along z": (o) => CarShade.strut(o, [0, 0.4, -2.17], [0, 0.4, -2.20], 0.05, 0.05, C, o.tri),
    "headrest (a U: its ends side by side)": (o) => CarShade.headrest(o, C, o.tri),
    "rounded block": (o) => CarShade.block(o, [[0.24, 0.42, 0.14], [0.40, 0.42, 0.14], [0.40, 0.60, 0.10], [0.24, 0.58, 0.10],
      [0.24, 0.44, -0.42], [0.40, 0.44, -0.42], [0.40, 0.62, -0.44], [0.24, 0.60, -0.44]], C, o.tri, null, { r: [0, 0.03, 0.07, 0.02] }),
    "round box": (o) => CarShade.box(o, 0, 0.4, -2.185, 0.05, 0.05, 0.03, C, o.tri),
    "C tub": (o) => CarShade.cTub(o, [{ z: 0.28, y: 0.386, w: 0.572, h: 0.457, t: 0.86, open: 0.2, rail: 0.534 },
      { z: 0.05, y: 0.395, w: 0.60, h: 0.48, t: 0.86, open: 0.2, rail: 0.585 }], 0.47, C, o.tri),
    "endplate plate": (o) => CarShade.endplate(o, Car3D.endplate(2), -1, C, C, null, o.tri),
    tunnel: (o) => CarShade.tunnel(o, 1, 0.12, 0.46, 0.57, 0.105, 0.25, 0.405, C, C, o.tri),
    floor: (o) => CarShade.floor(o, Car3D.CHASSIS.floor, 0.07, (z) => (z > 0.78 ? 0.70 : 0.62), C, o.tri),
  };
  for (const [what, make] of Object.entries(cases)) {
    const o = collect();
    make(o);
    assert.ok(o.tris.length > 8, what + " built");
    // The endplate is two solids, plate then crown strip: the plate is every triangle up to the crown's first.
    const tris = what === "endplate plate" ? o.tris.slice(0, o.tris.findIndex((t) => t.some((p) => Math.abs(Math.abs(p[0]) - 0.5045) > 0.0166))) : o.tris;
    assertClosedOut(tris, what);
  }
});

test("a block rounded all the way runs through its faces' centre lines; fine() keeps the points it was given", () => {
  const q = [[0, 0, 1], [0.2, 0, 1], [0.2, 0.1, 1], [0, 0.1, 1], [0, 0, 0], [0.2, 0, 0], [0.2, 0.1, 0], [0, 0.1, 0]];
  const o = collect();
  CarShade.block(o, q, [1, 0, 0], o.tri);
  const pts = new Set(o.tris.flat().map(key6));
  for (const m of [[0.1, 0, 1], [0.2, 0.05, 1], [0.1, 0.1, 1], [0, 0.05, 1]]) assert.ok(pts.has(key6(m)), "edge midpoint " + m + " is on the skin");
  for (const p of o.tris.flat()) assert.ok(p[0] >= -1e-12 && p[0] <= 0.2 + 1e-12 && p[1] >= -1e-12 && p[1] <= 0.1 + 1e-12, "inside the box it replaces");
  const path = [[0, 0, 0], [0.3, 0.1, 0], [0.5, 0.4, 0.1], [0.6, 0.9, 0.3]];
  const f = CarShade.fine(path, 3);
  assert.equal(f.length, 3 * (path.length - 1) + 1);
  path.forEach((p, i) => assert.ok(f[3 * i].every((v, k) => Math.abs(v - p[k]) < 1e-12), "point " + i + " kept"));
  assert.equal(JSON.stringify(CarShade.fine(path, 3, 1, 3)), JSON.stringify(f.slice(3, 7)), "a run of the curve is the same curve");
});

test("earcut covers a non-convex polygon exactly once", () => {
  // The cockpit C: an arc under the opening and the notch of the opening itself.
  const C = [[-0.3, 0.6, 0], [-0.32, 0.3, 0], [0, 0.1, 0], [0.32, 0.3, 0], [0.3, 0.6, 0], [0.2, 0.6, 0], [0.2, 0.47, 0], [-0.2, 0.47, 0], [-0.2, 0.6, 0]];
  const area = (r) => r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
  const T = CarShade.earcut(C);
  assert.equal(T.length, C.length - 2);
  let sum = 0;
  for (const t of T) { const a = area(t.map((i) => C[i])); assert.ok(a > 0, "wound like the polygon"); sum += a; }
  assert.ok(Math.abs(sum - area(C)) < 1e-12, "the triangles tile the polygon");
});

test("the rounded car keeps what is placed against its small parts: endplate board, light and crown; mirror light; floor clear of the rear tyre; headrest clear of the helmet", () => {
  for (let lvl = 0; lvl <= 4; lvl++) {
    const ep = Car3D.endplate(lvl), nb = Car3D.numberBoard(lvl), o = collect();
    CarShade.endplate(o, ep, 1, [0, 0, 0], [1, 1, 1], null, o.tri);
    // The plate's outer face (x 0.521) holds the number board's footprint (car3d part
    // "sponsorBoard": z -2.27..-2.57) and its rear edge the endplate light (car-mesh.js
    // drawRearLights: y 0.62 +- 0.017 at z -2.69).
    const outer = o.tris.filter((t) => t.every((p) => Math.abs(p[0] - 0.521) < 1e-9));
    const inside = (z, y) => outer.some(([a, b, c]) => {
      const s = (p, q) => (q[2] - p[2]) * (y - p[1]) - (q[1] - p[1]) * (z - p[2]);
      const d1 = s(a, b), d2 = s(b, c), d3 = s(c, a);
      return (d1 >= -1e-12 && d2 >= -1e-12 && d3 >= -1e-12) || (d1 <= 1e-12 && d2 <= 1e-12 && d3 <= 1e-12);
    });
    // Every board corner the flat plate held (at level 0 the board's top already rose
    // past the plate's sloped top edge at its front end, z -2.27) is still held.
    const flat = (z, y) => { const u = (z - ep.front.z) / (ep.rear.z - ep.front.z);
      return u >= 0 && u <= 1 && y >= ep.front.bottom + (ep.rear.bottom - ep.front.bottom) * u && y <= ep.front.top + (ep.rear.top - ep.front.top) * u; };
    let held = 0;
    for (const z of [-2.27, -2.57]) for (const y of [nb.cy - nb.h / 2, nb.cy + nb.h / 2]) if (flat(z, y)) {
      held++;
      assert.ok(inside(z, y), `level ${lvl}: board corner z ${z} y ${y.toFixed(3)} on the plate`);
    }
    assert.ok(held >= 3, `level ${lvl}: the flat plate held the board`);
    for (const y of [0.603, 0.637]) assert.ok(inside(ep.rear.z + 1e-6, y), `level ${lvl}: the rear edge carries the light at y ${y}`);
    const all = o.tris.flat();
    assert.ok(Math.max(...all.map((p) => p[1])) <= ep.rear.top + 0.009 + 1e-9, `level ${lvl}: the crown stays where the flat strip was`);
    assert.ok(Math.min(...all.map((p) => p[2])) >= ep.rear.z - 1e-9, `level ${lvl}: nothing behind the plate's rear face`);
  }
  for (const teamId of ["mclaren", "mercedes", "audi", "williams"]) {
    const m = Car3D.build([0.9, 0.5, 0.1], [0.1, 0.1, 0.1], { teamId, measure: true });
    const part = (name) => {
      const i = m.parts.findIndex((q) => q.name === name), from = m.parts.slice(0, i).reduce((n, q) => n + q.vertices, 0), pts = [];
      for (let v = from; v < from + m.parts[i].vertices; v++) pts.push([m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]]);
      return pts;
    };
    // Mirror light (car-mesh.js) anchors 4 mm off the housing's outboard tip at mid-height.
    const [, R] = Car3D.mirrorLightAnchors(teamId, 1), mir = part("mirrors");
    const xMax = Math.max(...mir.map((p) => p[0])), tip = mir.filter((p) => Math.abs(p[0] - xMax) < 1e-9);
    assert.ok(Math.abs(xMax - (R.x - 0.004)) < 1e-9, `${teamId}: the housing's outboard end is where the light anchors`);
    assert.ok(Math.min(...tip.map((p) => p[1])) < R.y - 0.02 && Math.max(...tip.map((p) => p[1])) > R.y + 0.02, `${teamId}: the tip spans the light's height`);
    // Floor: nothing low in the chassis inside the rear tyre (inner face x 0.57, z -1.94..-1.26).
    for (const p of part("chassis")) if (p[1] < 0.11 && p[2] < -1.30 && p[2] > -1.94)
      assert.ok(Math.abs(p[0]) <= 0.556, `${teamId}: floor at x ${p[0].toFixed(3)} z ${p[2].toFixed(3)} is in the rear tyre`);
    // Headrest (part "cockpit") wraps the helmet (centre (0, 0.715, -0.075), r 0.145) without cutting it.
    for (const p of part("cockpit")) assert.ok(Math.hypot(p[0], p[1] - 0.715, p[2] + 0.075) > 0.15, `${teamId}: the headrest cuts the helmet`);
  }
});

// A COLOURED livery halo is paint, a grey one metal. Since the metal surface
// (23) mirrors the environment (car materials, #798), Alpine's pink hoop drew
// as a white sky reflection; a painted hoop keeps the team colour, while
// Cadillac's chrome and the untinted titanium hoop stay metal.
test("a coloured livery halo is painted; a grey or untinted one stays metal", () => {
  const { Car3D: C } = load(true);
  const haloMats = (teamId, livery) => {
    const out = C.build([0.0, 0.576, 0.8], [1.0, 0.529, 0.737], { teamId, livery, measure: true, noWheels: true });
    let from = 0;
    for (const p of out.parts) { if (p.name === "halo") break; from += p.vertices; }
    const halo = out.parts.find((p) => p.name === "halo");
    assert.ok(halo, "the build has a halo part");
    return new Set(out.mat.slice(from, from + halo.vertices));
  };
  const PAINT = 20, METAL = 23;
  const pink = haloMats("alpine", { halo: [1.0, 0.529, 0.737] });
  assert.ok(pink.has(PAINT) && !pink.has(METAL), "Alpine's pink hoop is paint: " + [...pink]);
  const chrome = haloMats("cadillac", { halo: [0.86, 0.88, 0.92] });
  assert.ok(chrome.has(METAL) && !chrome.has(PAINT), "Cadillac's chrome hoop stays metal: " + [...chrome]);
  const plain = haloMats("mclaren", {});
  assert.ok(plain.has(METAL) && !plain.has(PAINT), "an untinted hoop is titanium metal: " + [...plain]);
});
