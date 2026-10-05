// The pit-stop kit mesh (CarMesh.getCrewMesh) is cached per team COLOUR, and
// a livery editor or custom team mints a new colour per edit. The cache had
// no cap and no free, so every colour ever shown kept its GPU buffers for the
// page's life. It is now FIFO-capped like getAeroFlap, and an evicted mesh is
// handed to gfx.freeMesh. Runs the real js/car/car-mesh.js in a node vm with
// a counting gfx stub and a minimal GaragePrims.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/car/car-mesh.js"), "utf8");

function load() {
  const made = [], freed = [];
  const ctx = {
    Log: { info() {}, warn() {}, error() {} },
    GaragePrims: { block(out) { out.pos.push(0, 0, 0); out.idx.push(out.idx.length); } },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC + "\n;this.CarMesh = CarMesh;", ctx, { filename: "car-mesh.js" });
  const gfx = {
    createMesh(d) { const m = { id: made.length, verts: d.pos.length / 3, d }; made.push(m); return m; },
    freeMesh(m) { freed.push(m); },
  };
  ctx.CarMesh.init(gfx);
  return { CarMesh: ctx.CarMesh, made, freed };
}
const colour = (i) => [(i % 100) / 100, Math.floor(i / 100) / 100, 0.5];

test("a colour is built once and reused", () => {
  const { CarMesh, made, freed } = load();
  const a = CarMesh.getCrewMesh([0.1, 0.2, 0.3]);
  assert.ok(a && a.verts > 0);
  assert.equal(a._crewPeople, CarMesh.CREW_PEOPLE, "people count is stamped on the mesh");
  assert.equal(CarMesh.CREW_PEOPLE, 6, "six figures: four gunmen + two jack ops");
  assert.equal(CarMesh.getCrewMesh([0.1, 0.2, 0.3]), a);
  // Same 0.01 key resolution as before the cap.
  assert.equal(CarMesh.getCrewMesh([0.101, 0.2, 0.3]), a);
  assert.equal(made.length, 1);
  assert.equal(freed.length, 0);
});

test("the cache is capped and frees the OLDEST colour's mesh", () => {
  const { CarMesh, made, freed } = load();
  const N = 200;
  for (let i = 0; i < N; i++) CarMesh.getCrewMesh(colour(i));
  assert.equal(made.length, N);
  const live = made.length - freed.length;
  assert.ok(live > 0 && live <= 64, `live crew meshes ${live} — the cache is not capped`);
  assert.equal(freed[0], made[0], "FIFO: the first colour is freed first");
  assert.equal(new Set(freed).size, freed.length, "a mesh was freed twice");
  // The newest colour is still resident (no rebuild).
  CarMesh.getCrewMesh(colour(N - 1));
  assert.equal(made.length, N);
  // An evicted colour is rebuilt, not returned freed.
  const again = CarMesh.getCrewMesh(colour(0));
  assert.equal(made.length, N + 1);
  assert.ok(!freed.includes(again));
});

test("no GaragePrims: nothing is built or cached", () => {
  const ctx = { Log: { info() {} } };
  vm.createContext(ctx);
  vm.runInContext(SRC + "\n;this.CarMesh = CarMesh;", ctx);
  let n = 0;
  ctx.CarMesh.init({ createMesh() { n++; return {}; }, freeMesh() {} });
  assert.equal(ctx.CarMesh.getCrewMesh([0.1, 0.1, 0.1]), null);
  assert.equal(n, 0);
});

// ── wheel spin blur (2026-10-01) ─────────────────────────────────────────────
test("the spin-blur disc is one shared two-sided annulus, built once, hub dark and lip light", () => {
  const { CarMesh, made } = load();
  const a = CarMesh.getSpinDisc();
  assert.equal(CarMesh.getSpinDisc(), a, "built once and reused");
  assert.equal(made.filter((m) => m === a).length, 1);
  // 24 segments x 4 vertices, in the wheel plane (x = 0), both windings so it
  // reads from either side of the wheel; inner ring darker than the outer.
  assert.equal(a.verts, 24 * 4);
  assert.equal(a.d.idx.length, 24 * 12);
  let inner = 0, outer = 0, nIn = 0, nOut = 0;
  for (let i = 0; i < a.verts; i++) {
    assert.equal(a.d.pos[i * 3], 0, "the disc lies in the wheel plane");
    const r = Math.hypot(a.d.pos[i * 3 + 1], a.d.pos[i * 3 + 2]);
    const lum = a.d.col[i * 3] + a.d.col[i * 3 + 1] + a.d.col[i * 3 + 2];
    if (r < 0.1) { inner += lum; nIn++; } else { outer += lum; nOut++; assert.ok(r < 0.34 * 0.68 + 1e-6, "inside the rim lip"); }
  }
  assert.ok(nIn > 0 && nOut > 0 && inner / nIn < outer / nOut, "hub darker than lip");
});

// ── per-frame key memos (2026-10-03, docs/plans perf §4b C-1/C-3) ────────────
// The colour / decal / flap / cockpit keys are memoised on objects that do not
// change; the string-keyed caches stay the backing store. Each memo must give
// the SAME mesh the string path gives, and a new or edited object must fall
// back to that path rather than hand out a stale mesh.
test("colour keys: a hit per array, the same mesh for an equal new array, a rebuild when the array is edited in place", () => {
  const { CarMesh, made } = load();
  const col = [0.1, 0.2, 0.3];
  const a = CarMesh.getCompoundRing(col);
  assert.equal(CarMesh.getCompoundRing(col), a, "memoised hit");
  assert.equal(CarMesh.getCompoundRing([0.1, 0.2, 0.3]), a, "a new array with the same numbers takes the string path to the same mesh");
  assert.equal(CarMesh.getCompoundRing([0.104, 0.2, 0.3]), a, "same 0.01 resolution as the toFixed key");
  assert.equal(made.length, 1);
  col[0] = 0.9;   // edited in place: the memo must notice, not return the 0.1 ring
  const b = CarMesh.getCompoundRing(col);
  assert.notEqual(b, a);
  assert.equal(b, CarMesh.getCompoundRing([0.9, 0.2, 0.3]));
  col[0] = 0.1;
  assert.equal(CarMesh.getCompoundRing(col), a, "back to the first colour: the first mesh");
  assert.equal(made.length, 2);
  // The crew kit shares the helper and its key.
  assert.equal(CarMesh.getCrewMesh(col), CarMesh.getCrewMesh([0.1, 0.2, 0.3]));
});

function loadReal(opts) {
  const P = loadParts(opts);
  const made = [], tex = [], freed = [];
  P.CarMesh.init({
    createMesh(d) { const m = { id: made.length, d }; made.push(m); return m; },
    createTexMesh(d) { const m = { tex: tex.length, d }; tex.push(m); return m; },
    freeMesh(m) { freed.push(m); },
  });
  return { ...P, made, tex, freed };
}
const factoryParts = (P, i = 0) => { const team = P.Teams.LIST[i]; return { team, parts: P.Parts.getVisualTiers(P.Parts.getFactorySetup(team), team) }; };

test("decal mesh: memoised per parts object, invalidated by every other input, and equal to the string path", () => {
  const P = loadReal({ shade: true });
  const { team, parts } = factoryParts(P);
  const lvl = P.Car3D.aeroLevelOf(parts);
  const a = P.CarMesh.getCarDecalMesh(lvl, parts, false, team.id, "standard", "standard");
  assert.ok(a && P.tex.length === 1);
  assert.equal(P.CarMesh.getCarDecalMesh(lvl, parts, false, team.id, "standard", "standard"), a, "memoised hit");
  // A fresh parts object with the same content has no memo: the string path must land on the same key.
  assert.equal(P.CarMesh.getCarDecalMesh(lvl, factoryParts(P).parts, false, team.id, "standard", "standard"), a, "memo key === string key");
  assert.equal(P.tex.length, 1);
  // Each input the memo compares moves the key (a livery's finShape, a GLB swap, the rounded-car switch).
  const fin = P.CarMesh.getCarDecalMesh(lvl, parts, false, team.id, "shark", "standard");
  assert.notEqual(fin, a, "finShape is in the key");
  const legacy = P.CarMesh.getCarDecalMesh(lvl, parts, true, team.id, "standard", "standard");
  assert.notEqual(legacy, a, "legacyBody is in the key");
  P.CarShade.set("0");
  const flat = P.CarMesh.getCarDecalMesh(lvl, parts, false, team.id, "standard", "standard");
  assert.notEqual(flat, a, "the CarShade switch (round) is in the key");
  P.CarShade.set("1");
  const built = P.tex.length;
  assert.equal(P.CarMesh.getCarDecalMesh(lvl, parts, false, team.id, "standard", "standard"), a, "back: the original mesh, from the string cache");
  assert.equal(P.CarMesh.getCarDecalMesh(lvl, parts, false, team.id, "shark", "standard"), fin);
  assert.equal(P.tex.length, built, "nothing rebuilt on the way back");
});

test("aero flap mesh: the memoised key per record is the string key, and colour / finish edits rebuild", () => {
  const P = loadReal();
  const { parts } = factoryParts(P);
  const st = P.Car3D.aeroStyleOf(parts), lvl = P.Car3D.aeroLevelOf(parts);
  const flaps = P.Car3D.aeroFlaps(lvl, st);
  assert.ok(flaps.length > 0 && flaps[0].cacheKey, "records carry their cacheKey");
  assert.equal(P.Car3D.aeroFlaps(lvl, st), flaps, "per-style front cache: the same records");
  assert.equal(P.Car3D.aeroFlaps(lvl, Object.assign({}, st)), flaps, "an equal recipe object reaches the same solve through the string key");
  const col = [0.3, 0.4, 0.5];
  const a = P.CarMesh.getAeroFlap(lvl, col, 0, st, flaps[0], null);
  assert.equal(P.CarMesh.getAeroFlap(lvl, col, 0, st, flaps[0], null), a);
  assert.equal(P.CarMesh.getAeroFlap(lvl, [0.3, 0.4, 0.5], 0, st, flaps[0], ""), a, "an equal colour array and a null/'' finish share the key");
  assert.equal(P.CarMesh.getAeroFlap(lvl, col, 0, st), a, "no el: the same record from the solve");
  const n = P.made.length;
  assert.notEqual(P.CarMesh.getAeroFlap(lvl, col, 0, st, flaps[0], "chrome"), a, "finish is in the key");
  col[1] = 0.9;
  assert.notEqual(P.CarMesh.getAeroFlap(lvl, col, 0, st, flaps[0], null), a, "an in-place colour edit is noticed");
  assert.equal(P.made.length, n + 2);
});

test("cockpit wheel and cabin: the same livery object is an early hit; a new object takes the string path", () => {
  const P = loadReal();
  const liv = { c1: [0.8, 0.1, 0.1], c2: [0.9, 0.9, 0.9], accent: [0.1, 0.1, 0.8] };
  const w = P.CarMesh.getCockpitWheel(liv, "f1"), c = P.CarMesh.getCockpitCabin("team", liv);
  const n = P.made.length;
  assert.equal(P.CarMesh.getCockpitWheel(liv, "f1"), w);
  assert.equal(P.CarMesh.getCockpitCabin("team", liv), c);
  // A copy (a store rev, a draft) has the same colours: same key, no rebuild.
  const copy = JSON.parse(JSON.stringify(liv));
  assert.equal(P.CarMesh.getCockpitWheel(copy, "f1"), w);
  assert.equal(P.CarMesh.getCockpitCabin("team", copy), c);
  assert.equal(P.made.length, n, "nothing rebuilt for an equal livery");
  // A real edit is a new object: the string path frees and rebuilds.
  const edit = { ...liv, c1: [0.1, 0.8, 0.1] };
  assert.notEqual(P.CarMesh.getCockpitWheel(edit, "f1"), w);
  assert.notEqual(P.CarMesh.getCockpitCabin("team", edit), c);
  assert.ok(P.freed.includes(w) && P.freed.includes(c), "the old rig meshes are freed");
  assert.notEqual(P.CarMesh.getCockpitWheel(edit, "round"), P.CarMesh.getCockpitWheel(edit, "f1"), "style is in the key");
});
