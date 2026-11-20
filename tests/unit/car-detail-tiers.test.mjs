/* car-detail-tiers.test.mjs — the desktop car detail levels (docs/notes/DESKTOP-GRAPHICS-TIERS-2026-11-20.md):
 * meshHi (detail 1 ULTRA, 2 EXTREME: finer tyres, discs, helmet, wing foils, tubes), heroCar (EXTREME player body:
 * CarGeometry.refine) and liveryHi (rival atlas 1024x1280).
 *
 * Detail 0 is today's car byte for byte (tests/data/car-wing-foil-tris.json stays the exact budget); the counts at
 * every level are MEASURED into tests/data/car-detail-tris.json. Node has no GfxQuality, which must mean detail 0.
 *
 * Run: node --test tests/unit/car-detail-tiers.test.mjs
 * Re-measure after a deliberate change (review the diff): node tests/unit/car-detail-tiers.test.mjs --update
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCarDetail, meshHealth } from "../helpers/car-detail-vm.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = join(ROOT, "tests/data/car-detail-tris.json");
const { Car3D, Parts, CarGeometry, Helmets, CarHero } = loadCarDetail();
// The race has the lazy MeshDetail kit by the time the cars build (heroCar bevels, the hero-mesh rival LODs).
const MD = loadCarDetail(null, { meshDetail: true });
const C1 = [0.7, 0.05, 0.05], C2 = [0.95, 0.8, 0.1];
const TEAM = { id: "mclaren", engine: "Mercedes" };
const parts = Parts.getVisualTiers({}, TEAM);
const tris = (m) => m.idx.length / 3;
const body = (detail, hero, v = Car3D) => v.build(C1, C2, { noWheels: true, teamId: TEAM.id, parts, num: 4, detail, hero });
const cockpit = (detail, hero, v = Car3D) => v.build(C1, C2, { noWheels: true, noDriver: true, cockpit: true, teamId: TEAM.id, parts, detail, hero });
const wheel = (r, detail) => { const w = Car3D.buildWheelLayers(r, null, null, null, false, null, null, null, null, null, detail); return tris(w.rotating) + tris(w.fixed); };
const flaps = (detail) => CarGeometry.withDetail(detail, () => Car3D.aeroFlaps(2, null).reduce((n, el) => n + tris(Car3D.buildFlapGeom(el, C1)), 0));

// The cockpit camera's steering wheel and dash (CockpitRig): today's rig below EXTREME, the heroCar rig on it.
// rigX is boot-time, so each answer gets its own VM; GfxQuality is the only thing the stub decides.
const EXTREME_GQ = { detail: () => 2, feature: () => true };
function rigTris(gq) {
  const v = loadCarDetail(gq ? { GfxQuality: gq } : null, { rig: true });
  const liv = { c1: [0.7, 0.05, 0.05], c2: [0.95, 0.8, 0.1] };
  return { steeringWheel: tris(v.CockpitRig.getCockpitWheel(liv, "f1")), dash: tris(v.CockpitRig.getCockpitDash()) };
}
// What the race draws for the player: body (no wheels) + four wheels + the flap set; rivals at most detail 1.
function measure() {
  const rows = {}, rig0 = rigTris(null), rigX = rigTris(EXTREME_GQ);
  // extreme: the race path (MeshDetail loaded: the floor and endplate bevels); extremeNoMeshDetail: the same build
  // before the lazy kit arrives (the garage on a cold boot), which is PR #5951's hero body.
  for (const [name, d, hero, v] of [["detail0", 0, false, Car3D], ["ultra", 1, false, Car3D], ["extreme", 2, true, MD.Car3D]]) {
    const r = { body: tris(body(d, hero, v)), cockpit: tris(cockpit(d, hero, v)), frontWheel: wheel(0.32, d), rearWheel: wheel(0.38, d), flaps: flaps(d) };
    r.player = r.body + 2 * r.frontWheel + 2 * r.rearWheel + r.flaps;
    Object.assign(r, hero ? rigX : rig0);
    rows[name] = r;
  }
  rows.extremeNoMeshDetail = { body: tris(body(2, true)), cockpit: tris(cockpit(2, true)) };
  return rows;
}
if (process.argv.includes("--update")) {
  writeFileSync(DATA, JSON.stringify({ _note: "measured player-car triangle counts per desktop detail level (shipped rounded car, mclaren default parts); regenerate with: node tests/unit/car-detail-tiers.test.mjs --update", ...measure() }, null, 2) + "\n");
  console.log("wrote " + DATA);
  process.exit(0);
}
const BASE = JSON.parse(readFileSync(DATA, "utf8"));
const REMEASURE = "re-measure with: node tests/unit/car-detail-tiers.test.mjs --update (review the diff)";

test("detail 0 (and no GfxQuality) is today's mesh, number for number", () => {
  const plain = Car3D.build(C1, C2, { noWheels: true, teamId: TEAM.id, parts, num: 4 });
  const zero = body(0, false);
  for (const k of ["pos", "nrm", "col", "mat", "idx"]) assert.deepEqual(zero[k], plain[k], k);
  assert.equal(CarGeometry.detailFor(true), 0, "no GfxQuality in node means detail 0");
  assert.equal(CarGeometry.heroOn(), false);
  assert.equal(CarGeometry.level(), 0, "no build in progress leaves the level at 0");
  assert.equal(wheel(0.32), wheel(0.32, 0));
});

test("the flat-loft detail-0 car still matches the wing-foil baseline exactly", () => {
  const flat = loadCarDetail(null, { omit: ["js/car/car-shade.js"] });
  const B = JSON.parse(readFileSync(join(ROOT, "tests/data/car-wing-foil-tris.json"), "utf8"));
  assert.equal(tris(flat.Car3D.build(C1, C2, { noWheels: true, detail: 0 })), B.body);
  assert.equal(tris(flat.Car3D.buildWheel(0.32, undefined, undefined, undefined, false, undefined, undefined, undefined, undefined, undefined, 0)), B.frontWheel);
});

test("triangle counts per level match the measured file and sit in the planned ranges", () => {
  const pinned = Object.assign({}, BASE);
  delete pinned._note;
  assert.deepEqual(measure(), pinned, REMEASURE);
  assert.ok(BASE.extreme.body > BASE.extremeNoMeshDetail.body, "the bevels add the rounded rims");
  const { detail0: z, ultra: u, extreme: x } = BASE;
  for (const k of ["body", "cockpit", "frontWheel", "flaps"]) assert.ok(u[k] > z[k], `${k}: ULTRA ${u[k]} not above detail 0 ${z[k]}`);
  assert.ok(x.frontWheel > u.frontWheel, "EXTREME tyres (64) are finer than ULTRA's (48)");
  assert.ok(u.player < z.player * 2.5, `ULTRA player ${u.player} is a constants bump, not a new model`);
  assert.ok(x.player >= 60000 && x.player <= 150000, `EXTREME player car ${x.player} outside 60k..150k`);
  assert.ok(x.steeringWheel > z.steeringWheel && x.dash > z.dash, "the EXTREME cockpit rig is denser");
});

test("every level is a healthy mesh inside the detail-0 box (1 cm)", () => {
  const ref = meshHealth(body(0, false));
  for (const [d, hero, v] of [[1, false], [2, false], [2, true], [2, true, MD.Car3D]]) {
    const tag = `detail ${d}${hero ? " hero" : ""}${v ? " +MeshDetail" : ""}`;
    for (const m of [body(d, hero, v), cockpit(d, hero, v)]) {
      const h = meshHealth(m);
      assert.deepEqual(h.bad, [], `${tag}: ${h.bad.join("; ")}`);
      assert.ok(h.degenerate <= ref.degenerate, `${tag}: ${h.degenerate} zero-area triangles (detail 0 has ${ref.degenerate})`);
    }
    const box = meshHealth(body(d, hero, v)).box;
    box.forEach((x, i) => assert.ok(Math.abs(x - ref.box[i]) <= 0.01, `${tag} box[${i}] ${x} vs ${ref.box[i]}`));
  }
  for (const d of [1, 2]) for (const r of [0.32, 0.38]) {
    const w = Car3D.buildWheelLayers(r, null, null, null, false, null, null, null, null, null, d);
    const w0 = Car3D.buildWheelLayers(r, null, null, null, false, null, null, null, null, null, 0);
    for (const k of ["rotating", "fixed"]) {
      const h = meshHealth(w[k]), h0 = meshHealth(w0[k]);
      assert.deepEqual(h.bad, [], `wheel ${r} detail ${d} ${k}`);
      h.box.forEach((v, i) => assert.ok(Math.abs(v - h0.box[i]) <= 0.01, `wheel ${r} detail ${d} ${k} box[${i}]`));
    }
  }
});

// A closed unit sphere with smooth normals: 6 stacks x 12 slices (30 degree steps, under the crease angle),
// one vertex per position, the poles shared.
const STACKS = 6, SLICES = 12, SPHERE_TRIS = 2 * SLICES * (STACKS - 1);
function sphere() {
  const out = { pos: [], nrm: [], col: [], mat: [], idx: [] };
  const put = (x, y, z) => { out.pos.push(x, y, z); out.nrm.push(x, y, z); out.col.push(1, 1, 1); out.mat.push(20); return out.pos.length / 3 - 1; };
  const top = put(0, 1, 0), ring = [];
  for (let i = 1; i < STACKS; i++) {
    const th = Math.PI * i / STACKS, row = [];
    for (let j = 0; j < SLICES; j++) { const ph = 2 * Math.PI * j / SLICES; row.push(put(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph))); }
    ring.push(row);
  }
  const bot = put(0, -1, 0);
  for (let j = 0; j < SLICES; j++) {
    const j2 = (j + 1) % SLICES;
    out.idx.push(top, ring[0][j2], ring[0][j]);
    for (let i = 0; i < STACKS - 2; i++) out.idx.push(ring[i][j], ring[i][j2], ring[i + 1][j2], ring[i][j], ring[i + 1][j2], ring[i + 1][j]);
    out.idx.push(bot, ring[STACKS - 2][j], ring[STACKS - 2][j2]);
  }
  return out;
}
function edgeUse(m) {
  const key = (i) => m.pos.slice(i * 3, i * 3 + 3).map((v) => v.toFixed(6)).join(",");
  const use = new Map();
  for (let t = 0; t < m.idx.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = key(m.idx[t + e]), b = key(m.idx[t + (e + 1) % 3]), k = a < b ? a + "|" + b : b + "|" + a;
    use.set(k, (use.get(k) || 0) + 1);
  }
  return use;
}

test("heroCar modelled detail: bevelled boxes, round rods, aerofoil arms, thick webs, pitot and antenna", () => {
  const G = (hero, fn) => CarGeometry.withDetail(2, fn, hero);
  const geo = CarGeometry.create({ SURFACES: { paint: 20, carbon: 21, rubber: 22, metal: 23, glass: 24, panel: 25 }, CARBON: [0.1, 0.1, 0.1], DARK: [0, 0, 0], INTAKE: [0, 0, 0], TYRE: [0, 0, 0], RIM: [0, 0, 0], HUB: [0, 0, 0], HALO: [0, 0, 0], VISOR: [0, 0, 0], PANEL: [0, 0, 0] });
  const mk = () => ({ pos: [], nrm: [], col: [], mat: [], idx: [] });
  const red = [0.8, 0.1, 0.1];
  // a bevelled box keeps its exact extents and stays closed
  const bx = mk(); G(true, () => geo.addBox(bx, 1, 2, 3, 0.2, 0.1, 0.05, red));
  assert.equal(tris(bx), 44);
  const hb = meshHealth(bx);
  assert.deepEqual(hb.box.map((v) => +v.toFixed(9)), [0.9, 1.95, 2.975, 1.1, 2.05, 3.025]);
  for (const n of edgeUse(bx).values()) assert.equal(n, 2, "bevelled box is closed");
  const plain = mk(); G(false, () => geo.addBox(plain, 1, 2, 3, 0.2, 0.1, 0.05, red));
  assert.equal(tris(plain), 12, "not hero: today's box");
  // every face of the bevelled box faces outward (normal . (centroid - centre) > 0)
  for (let t = 0; t < bx.idx.length; t += 3) {
    const v = [0, 1, 2].map((k) => bx.idx[t + k]);
    const c = [0, 1, 2].map((a) => v.reduce((s, i) => s + bx.pos[i * 3 + a], 0) / 3);
    const n = [bx.nrm[v[0] * 3], bx.nrm[v[0] * 3 + 1], bx.nrm[v[0] * 3 + 2]];
    assert.ok(n[0] * (c[0] - 1) + n[1] * (c[1] - 2) + n[2] * (c[2] - 3) > 0, "inward face on the bevelled box");
  }
  // rods and arms: closed, and within 1 mm of the detail-0 member's own box (an aerofoil is fuller than the diamond
  // it replaces near 30 % chord: 0.04 mm on a 20 mm arm)
  for (const [name, fn] of [["beam", (o) => geo.addBeamBetween(o, [0, 0, 0], [0.3, 0.1, 0.05], 0.02, red)],
                            ["arm", (o) => geo.addFairedArm(o, [0, 0, 0], [0.3, 0.1, 0.05], 0.02, red)]]) {
    const h = mk(), z = mk(); G(true, () => fn(h)); G(false, () => fn(z));
    assert.ok(tris(h) > tris(z), name + " gained section");
    for (const n of edgeUse(h).values()) assert.equal(n, 2, name + " is closed");
    const bh = meshHealth(h).box, bz = meshHealth(z).box;
    bh.forEach((v, i) => assert.ok(i < 3 ? v >= bz[i] - 0.001 : v <= bz[i] + 0.001, `${name} box[${i}] ${v} outside ${bz[i]}`));
  }
  const web = mk(); G(true, () => geo.addWishboneWeb(web, [0, 0, 0], [0, 0, 0.3], [0.5, 0, 0.15], red));
  for (const n of edgeUse(web).values()) assert.equal(n, 2, "the web is a closed plate");
  const ys = web.pos.filter((_, i) => i % 3 === 1);
  assert.ok(Math.abs(Math.max(...ys) - Math.min(...ys) - 0.004) < 1e-9, "the web is 4 mm thick");
  // the car: hero adds the pitot (ahead of the nose tip) and the rear-duct throats, and only on the hero build
  const plainCar = CarGeometry.withDetail(2, () => Car3D.build(C1, C2, { noWheels: true, teamId: TEAM.id, parts, num: 4, noWeld: true }));
  const heroCar = CarGeometry.withDetail(2, () => Car3D.build(C1, C2, { noWheels: true, teamId: TEAM.id, parts, num: 4, noWeld: true }), true);
  assert.ok(tris(heroCar) > tris(plainCar) + 1000, `hero parts add geometry: ${tris(heroCar)} vs ${tris(plainCar)}`);
  const rival = Car3D.build(C1, C2, { noWheels: true, field: true, teamId: TEAM.id, parts, num: 4, detail: 1, hero: true });
  assert.equal(tris(rival), tris(Car3D.build(C1, C2, { noWheels: true, field: true, teamId: TEAM.id, parts, num: 4, detail: 1 })), "a field body never takes the hero pass");
});

test("refine: interpolating, watertight, bulge clamped, creases straight", () => {
  const s = sphere(), before = s.pos.slice();
  CarHero.refine(s, 2, 0);
  assert.equal(tris(s), SPHERE_TRIS * 16);
  assert.deepEqual(s.pos.slice(0, before.length), before, "original vertices never move");
  for (const n of edgeUse(s).values()) assert.equal(n, 2, "a closed mesh stays closed (no crack, no T-junction)");
  for (let i = 0; i < s.pos.length / 3; i++) {
    const r = Math.hypot(s.pos[i * 3], s.pos[i * 3 + 1], s.pos[i * 3 + 2]);
    assert.ok(r <= 1 + 1e-9, `point ${i} bulged past the sphere it approximates (${r})`);
  }
  // The first-round midpoint of the equator edge at 0..30 degrees bulged out from the chord toward the sphere,
  // by at most MAX_BULGE.
  const one = sphere();
  CarHero.refine(one, 1, 0);
  const t15 = Math.tan(Math.PI / 12);
  let m = -1;
  for (let i = 0; i < one.pos.length; i += 3) if (Math.abs(one.pos[i + 1]) < 1e-9 && one.pos[i] > 0 && Math.abs(one.pos[i + 2] / one.pos[i] - t15) < 1e-6) m = i;
  assert.ok(m >= 0, "equator midpoint not found");
  const chord = Math.cos(Math.PI / 12), r = Math.hypot(one.pos[m], one.pos[m + 2]);
  assert.ok(r > chord + 1e-6 && r <= chord + CarHero.MAX_BULGE + 1e-9, `midpoint radius ${r} vs chord ${chord}`);
  // A box built from addBox-style split corners: every edge is a crease, so refining adds points ON the faces only.
  const box = { pos: [], nrm: [], col: [], mat: [], idx: [] };
  const face = (n, u, v) => {
    const i = box.pos.length / 3;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      box.pos.push(n[0] + u[0] * a + v[0] * b, n[1] + u[1] * a + v[1] * b, n[2] + u[2] * a + v[2] * b);
      box.nrm.push(...n); box.col.push(1, 1, 1); box.mat.push(20);
    }
    box.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  };
  face([0, 0, 1], [1, 0, 0], [0, 1, 0]); face([0, 0, -1], [0, 1, 0], [1, 0, 0]);
  face([1, 0, 0], [0, 1, 0], [0, 0, 1]); face([-1, 0, 0], [0, 0, 1], [0, 1, 0]);
  face([0, 1, 0], [0, 0, 1], [1, 0, 0]); face([0, -1, 0], [1, 0, 0], [0, 0, 1]);
  CarHero.refine(box, 2, 0);
  for (let i = 0; i < box.pos.length; i += 3) {
    const big = Math.max(Math.abs(box.pos[i]), Math.abs(box.pos[i + 1]), Math.abs(box.pos[i + 2]));
    assert.ok(Math.abs(big - 1) < 1e-12, "a crease-only box stays exactly a box");
  }
  // minEdge: nothing under it splits.
  const small = sphere();
  CarHero.refine(small, 1, 5);
  assert.equal(tris(small), SPHERE_TRIS);
});

test("refine interpolates uv along the edge and keeps it in 0..1", () => {
  const s = sphere();
  s.uv = [];
  for (let i = 0; i < s.pos.length; i += 3) s.uv.push((s.pos[i] + 1) / 2, (s.pos[i + 1] + 1) / 2);
  CarHero.refine(s, 1, 0);
  assert.equal(s.uv.length, (s.pos.length / 3) * 2);
  // a new point's uv is its edge's mean: the planar map stays within the chord's own uv range
  const n0 = 2 + SLICES * (STACKS - 1);
  for (let i = n0; i < s.pos.length / 3; i++) assert.ok(s.uv[i * 2] >= 0 && s.uv[i * 2 + 1] <= 1);
  const h = meshHealth(s);
  assert.deepEqual(h.bad, []);
});

test("meshHi helmet: twice the rings and slices, every detail-0 ring line still on the grid", () => {
  for (let i = 0; i <= Helmets.RINGS; i++) {
    assert.ok(Math.abs(Math.pow((2 * i) / (2 * Helmets.RINGS), 1.25) - Helmets.ringT(i)) < 1e-15, `ring ${i} moved`);
  }
  const des = Helmets.designFor(4);
  const S = { paint: 20, glass: 21, aero: false, maxSplit: 0 };
  const lo = Helmets.build({ pos: [], nrm: [], col: [], mat: [], idx: [] }, 0, 0, 0, des, S);
  const hi = Helmets.build({ pos: [], nrm: [], col: [], mat: [], idx: [] }, 0, 0, 0, des, Object.assign({ hi: true }, S));
  assert.equal(tris(lo), Helmets.RINGS * Helmets.SLICES * 2);
  assert.equal(tris(hi), 4 * tris(lo));
  const field = Helmets.build({ pos: [], nrm: [], col: [], mat: [], idx: [] }, 0, 0, 0, des, Object.assign({ hi: true, simplePaint: true }, S));
  assert.equal(tris(field), Helmets.FIELD_RINGS * Helmets.FIELD_SLICES * 2, "field lids ignore meshHi");
});

test("detailFor / heroOn read GfxQuality, cap a rival at 1, and fall back to 0 on a throw", () => {
  const mk = (detail, feats) => ({ detail: () => detail, feature: (n) => !!feats[n] });
  for (const [gq, player, rival, hero] of [
    [mk(2, { meshHi: true, heroCar: true }), 2, 1, true],
    [mk(1, { meshHi: true }), 1, 1, false],
    [mk(2, { heroCar: true }), 0, 0, true],                    // meshHi forced off: tessellation stays today's
    [{ detail: () => { throw new Error("x"); }, feature: () => true }, 0, 0, true],
    [{ feature: () => { throw new Error("x"); } }, 0, 0, false],
  ]) {
    const v = loadCarDetail({ GfxQuality: gq });
    assert.equal(v.CarGeometry.detailFor(true), player);
    assert.equal(v.CarGeometry.detailFor(false), rival);
    assert.equal(v.CarGeometry.heroOn(), hero);
  }
});

test("liveryHi: a desktop rival atlas uploads at 1024x1280; phones and the player are unchanged", async () => {
  const { loadParts } = await import("../../tools/car/parts-sweep.mjs");
  const { LiveryTex } = loadParts();
  assert.equal(LiveryTex.atlasDiv(false, false, false, true), 2);
  assert.equal(LiveryTex.atlasDiv(false, false, false, false), 4);
  assert.equal(LiveryTex.atlasDiv(false, false, false), 4, "no flag: today's 512x640");
  assert.equal(LiveryTex.atlasDiv(false, true, false, true), 8, "mobile AI never grows");
  assert.equal(LiveryTex.atlasDiv(true, false, false, true), 2, "player preview unchanged");
  assert.equal(LiveryTex.atlasDiv(true, false, true, true), 1);
  assert.equal(LiveryTex.liveryHi(), false, "no GfxQuality in node: off");
});

test("loft UVs: the hero body's lofts carry (station, section arc, -1) on trk; nothing else moves", () => {
  const opt = (o) => Object.assign({ noWheels: true, teamId: TEAM.id, parts, num: 4 }, o);
  const plain = Car3D.build(C1, C2, opt({ detail: 2, hero: true }));
  const uv = Car3D.build(C1, C2, opt({ detail: 2, hero: true, loftUv: true }));
  assert.equal(plain.trk, undefined, "no TLXCarSurf in node: no loft UVs unless asked");
  assert.equal(tris(uv), tris(plain), "loft UVs add no triangle");
  for (const k of ["luv"]) assert.equal(uv[k], undefined, k + " handed on as trk");
  assert.equal(uv.trk.length, uv.pos.length);
  assert.ok(uv.trk.every(Number.isFinite), "loft UVs finite");
  const box = meshHealth(plain).box;
  let on = 0;
  for (let i = 0; i < uv.trk.length; i += 3) {
    const [s, t, f] = [uv.trk[i], uv.trk[i + 1], uv.trk[i + 2]];
    assert.ok(f === 0 ? s === 0 && t === 0 : f === -1, `vertex ${i / 3}: flag ${f}`);
    if (f !== -1) continue;
    on++;
    assert.ok(s >= box[2] - 0.5 && s <= box[5] + 0.5 && Math.abs(t) < 2, `vertex ${i / 3}: s ${s} t ${t}`);
  }
  assert.ok(on > 0.05 * uv.pos.length / 3, `only ${on} loft vertices`);
  // a triangle is wholly on a loft or wholly off it (no edge lerps a coordinate into a non-loft vertex)
  for (let k = 0; k < uv.idx.length; k += 3) {
    const f = [0, 1, 2].map((j) => uv.trk[uv.idx[k + j] * 3 + 2]);
    assert.ok(f[0] === f[1] && f[1] === f[2], `triangle ${k / 3} mixes loft and non-loft corners`);
  }
  // below EXTREME the flag never reaches a build
  for (const d of [0, 1]) assert.equal(Car3D.build(C1, C2, opt({ detail: d, loftUv: true })).trk, undefined, "detail " + d);
});

test("garage hero: garageDetail is {} in node; heroCopy refines a refinish build and leaves the kept one alone", () => {
  assert.deepEqual(Object.keys(Car3D.garageDetail()), []);
  const plainG = Car3D.build(C1, C2, { livery: {}, refinish: true, noWheels: true, teamId: TEAM.id, parts, num: 4 });
  assert.equal(Car3D.heroCopy(plainG), plainG, "not a hero build: the same object");
  const g = MD.Car3D.build(C1, C2, { livery: {}, refinish: true, noWheels: true, teamId: TEAM.id, parts, num: 4, detail: 2, hero: true });
  const before = g.pos.length, copy = MD.Car3D.heroCopy(g);
  assert.equal(g.pos.length, before, "the kept build is untouched");
  assert.equal(tris(copy), BASE.extreme.body, "the garage car is the race's EXTREME body");
  assert.equal(tris(MD.Car3D.heroCopy(MD.Car3D.refinish(g, {}))), BASE.extreme.body, "a finish tap too");
  assert.deepEqual(meshHealth(copy).bad, []);
});

// THE LAZY SPLIT (js/car/car-hero.js, LAZY_GFX_HI: loaded only at detail >= 2). Without it every detail-2 / hero ask
// builds ULTRA's arrays exactly and nothing throws; with it the race and garage builds are the pinned EXTREME counts.
test("CarHero absent: a detail-2 hero build is the detail-1 build, number for number; present: the pinned totals", () => {
  const NO = loadCarDetail(null, { omit: ["js/car/car-hero.js"] }), NOMD = loadCarDetail(null, { meshDetail: true, omit: ["js/car/car-hero.js"] });
  assert.equal(NO.CarHero, undefined);
  for (const v of [NO, NOMD]) {
    for (const mk of [(d, h) => body(d, h, v.Car3D), (d, h) => cockpit(d, h, v.Car3D),
                      (d, h) => v.Car3D.build(C1, C2, { noWheels: true, teamId: TEAM.id, parts, num: 4, detail: d, hero: h, loftUv: true }),
                      (d, h) => v.Car3D.heroCopy(v.Car3D.build(C1, C2, { livery: {}, refinish: true, noWheels: true, teamId: TEAM.id, parts, num: 4, detail: d, hero: h }))]) {
      const ultra = mk(1, false), hi = mk(2, true);
      for (const k of ["pos", "nrm", "col", "mat", "idx"]) assert.deepEqual(hi[k], ultra[k], k);
      assert.equal(hi.trk, undefined);
      assert.equal(hi._hero, undefined, "no hero mark without CarHero");
    }
    for (const r of [0.32, 0.38]) {
      const w2 = v.Car3D.buildWheelLayers(r, null, null, null, false, null, null, null, null, null, 2);
      const w1 = v.Car3D.buildWheelLayers(r, null, null, null, false, null, null, null, null, null, 1);
      for (const k of ["rotating", "fixed"]) assert.deepEqual(w2[k].idx, w1[k].idx, `wheel ${r} ${k}`);
    }
    assert.equal(v.CarGeometry.withDetail(2, () => v.CarGeometry.level(), true), 1, "level capped at ULTRA");
    assert.equal(v.CarGeometry.withDetail(2, () => v.CarGeometry.hero(), true), false, "never a hero build");
  }
  const gq = { detail: () => 2, feature: () => true };
  const R = loadCarDetail({ GfxQuality: gq }, { rig: true, omit: ["js/car/car-hero.js"] });
  assert.deepEqual([R.CarGeometry.detailFor(true), R.CarGeometry.detailFor(false), R.CarGeometry.heroOn()], [1, 1, false]);
  assert.deepEqual({ ...R.Car3D.garageDetail() }, { detail: 1, hero: false }, "the EXTREME garage without CarHero is ULTRA's");
  const liv = { c1: [0.7, 0.05, 0.05], c2: [0.95, 0.8, 0.1] };
  assert.deepEqual({ steeringWheel: tris(R.CockpitRig.getCockpitWheel(liv, "f1")), dash: tris(R.CockpitRig.getCockpitDash()) },
    { steeringWheel: BASE.ultra.steeringWheel, dash: BASE.ultra.dash }, "today's rig");
  // present (the race path: MeshDetail too): the pinned EXTREME counts
  assert.ok(MD.CarHero && CarHero, "the default VM loads car-hero.js");
  assert.equal(tris(body(2, true, MD.Car3D)), BASE.extreme.body);
  assert.equal(tris(cockpit(2, true, MD.Car3D)), BASE.extreme.cockpit);
  assert.equal(tris(body(2, true)), BASE.extremeNoMeshDetail.body);
  assert.equal(wheel(0.32, 2), BASE.extreme.frontWheel);
});
