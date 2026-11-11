// COCKPIT FINISHES (B·H33, docs/notes/LIVE-DEBUGGER-COCKPIT-FINISH-2026-10-21.md).
// 1. A livery FINISH reaches the cockpit / helmet view: those cameras draw the cockpit build
//    (Car3D.build cockpit:true, car-draw.js cockpitBodyMesh) with the exterior's paint opts, so every
//    painted vertex of it must carry the finish's surface id, as the exterior's do.
// 2. The steering wheel's FINISH (car-mesh.js WHEEL_FINISHES): a per-vertex surface remap of the same
//    geometry (no vertex added) plus draw opts that let the surfaces' own lobes through; the rig's
//    0.88-rough, no-clearcoat card flattened every part to one grey-black.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";
import { loadParts } from "../../tools/car/parts-sweep.mjs";
import { carDrawVm } from "../helpers/car-draw-vm.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

function loadMesh() {
  const made = [], freed = [];
  const ctx = { Log: { info() {}, warn() {}, error() {} }, GaragePrims: { block() {} } };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["js/core/mat4.js", "js/physics/consts.js"]) vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  vm.runInContext(read("js/car/car-materials.js") + "\n;this.CarMaterials = CarMaterials;", ctx, { filename: absSrc("js/car/car-materials.js") });
  vm.runInContext(read("js/car/cockpit-rig.js"), ctx, { filename: absSrc("js/car/cockpit-rig.js") });
  vm.runInContext(read("js/car/car-mesh.js") + "\n;this.CarMesh = CarMesh;", ctx, { filename: absSrc("js/car/car-mesh.js") });
  ctx.CarMesh.init({ createMesh(d) { const m = { d }; made.push(m); return m; }, freeMesh(m) { freed.push(m); } });
  return { CarMesh: ctx.CarMesh, made, freed, ctx };
}
function loadFinishes(disk = new Map()) {
  const ctx = vm.createContext({ GameStore: { store: { raw: (key) => disk.get(key), rawSet: (key, value) => disk.set(key, value) } } });
  for (const file of ["js/car/car-materials.js", "js/camera/cockpit-finishes.js"])
    vm.runInContext(read(file), ctx, { filename: absSrc(file) });
  return { finishes: vm.runInContext("CockpitFinishes", ctx), materials: vm.runInContext("CarMaterials", ctx), disk };
}
const LIV = { c1: [0.8, 0.1, 0.1], c2: [0.9, 0.9, 0.9], accent: [1, 0.8, 0] };
const hist = (mat) => { const h = {}; for (const m of mat) h[m] = (h[m] || 0) + 1; return h; };

test("a livery finish lands on every painted vertex of the cockpit/helmet build, as on the exterior", () => {
  const M = loadParts({ shade: true }), C = M.Car3D;
  for (const team of M.Teams.LIST.slice(0, 3)) {
    const parts = M.Parts.getVisualTiers(M.Parts.getFactorySetup(team.id), team);
    const base = Object.assign({ c1: team.color, c2: team.color2 }, team.livery || {}, { finish: undefined });
    const ck = (liv) => C.build(liv.c1, liv.c2, { livery: liv, teamId: team.id, num: 7, parts, noWheels: true, noDriver: true, cockpit: true, cockpitBody: "standard", halo: 2 });
    const gloss = hist(ck(base).mat)[C.SURFACES.paint] || 0;
    assert.ok(gloss > 500, team.id + ": the cockpit build has painted bodywork");
    for (const fin of ["matte", "satin", "brushed", "chrome"]) {
      const h = hist(ck(Object.assign({}, base, { finish: fin })).mat);
      assert.equal(h[C.SURFACES.paint] || 0, 0, `${team.id} ${fin}: no gloss paint left in the cockpit build`);
      assert.ok((h[C.FINISH_SURFACE[fin]] || 0) >= gloss, `${team.id} ${fin}: every painted vertex carries surface ${C.FINISH_SURFACE[fin]}`);
    }
  }
});

// THE RIG, RUN (tests/helpers/car-draw-vm.mjs, as cockpit-wheels.test.mjs): the real drawCockpitRig, every
// gfx.draw recorded with its opts, so what reaches the body and the wheel is read from what it DRAWS.
function rigDraws({ finishes, livery } = {}) {
  const v = carDrawVm({ cam: "cockpit", livery }), { ctx, G } = v, rigOpts = [];
  if (finishes) ctx.CockpitFinishes = finishes;
  ctx.CockpitOpts = { wheel: () => "f1", interior: () => "carbon", haloSize: () => 2, body: () => "standard",
    layout: () => ({ wheelS: 0.8, wheelY: 0.63, wheelZ: 0.26 }), wheelHasScreen: () => false };
  ctx.Car3D.cockpitMirrorGlass = () => [];
  const WHEEL_OPTS = { wheelFinishOpts: true };
  ctx.CarMesh = new Proxy({}, { get: (_o, k) => k === "WHEEL_ROLL_LAMBDA" ? 12 : k === "cockpitWheelRoll" ? (x) => x
    : k === "cockpitWheelOpts" ? (o) => (rigOpts.push(o), WHEEL_OPTS) : () => ({ carMesh: String(k) }) });
  Object.assign(G, { raceTimeOfDay: "day", track: { total: 5000, def: {} }, dashKph: (sp) => sp * 3.6, raceT: 0 });
  v.field(() => 1000);
  const drawn = [];
  G.gfx.draw = (mesh, _m, opt) => drawn.push({ name: mesh && mesh.carMesh, opt });
  const PAINT = { carFinish: true, clearcoat: 0.8 };
  v.carDraw.drawCockpitRig(Object.assign(G.player, { gear: 3, speed: 50 }), new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]), 1 / 60, PAINT, false);
  return { drawn, PAINT, WHEEL_OPTS, rigOpts, flaps: v.rec.flaps };
}

test("the cockpit and helmet cameras draw the body with the frame's paint opts (carFinish), as the exterior", () => {
  const { drawn, PAINT } = rigDraws();
  assert.equal(drawn[0].opt, PAINT, "drawCockpitRig's first draw, the cockpit body, takes the paint opts it was handed");
});

test("drawCockpitRig draws the steering wheel with CarMesh.cockpitWheelOpts(rig opts)", () => {
  const { drawn, WHEEL_OPTS, rigOpts } = rigDraws();
  const w = drawn.find((d) => d.name === "getCockpitWheel");
  assert.ok(w, "the wheel draws");
  assert.equal(w.opt, WHEEL_OPTS, "with the finish's opts");
  assert.equal(rigOpts.length, 1);
  assert.equal(rigOpts[0].roughness, 0.88, "built from the rig's card (its night emissive rides along)");
});

test("drawCockpitRig supplies its body finish to the active front flaps without rewriting fitted paint", () => {
  const { finishes } = loadFinishes(); finishes.set("body", "matte");
  const livery = Object.freeze({ ...LIV, finish: "satin", wingFinish: "chrome" });
  const { flaps } = rigDraws({ finishes, livery });
  assert.equal(flaps.length, 1);
  assert.equal(flaps[0].only, "front");
  assert.equal(flaps[0].viewLivery, finishes.view(livery).livery, "the real rig passes its cached cockpit paint override");
  assert.equal(flaps[0].viewLivery.wingFinish, "matte");
  assert.equal(livery.wingFinish, "chrome");
  assert.equal(livery.finish, "satin");
});

test("the shipped wheel is Bryce's pick A: lacquered carbon, black rubber grips, bright alloy, glass LCD", () => {
  const { CarMesh } = loadMesh();
  assert.equal(CarMesh.WHEEL_DEFAULT, "carbon");
  const d = CarMesh.getCockpitWheel(LIV, "f1").d, h = hist(d.mat);
  for (const s of [21, 22, 24, 29]) assert.ok(h[s] > 0, "default wheel carries surface " + s);
  const alloy = d.mat.findIndex((m) => m === 29);
  assert.deepEqual(Array.from(d.col.slice(alloy * 3, alloy * 3 + 3), (v) => +v.toFixed(2)), [0.62, 0.63, 0.66], "alloy reads bright, not the old dark fasteners");
  assert.notEqual(CarMesh.cockpitWheelOpts({ roughness: 0.88 }).roughness, 0.88, "drawn with the finish opts, not the rig's card");
});

test("every wheel finish is a surface remap of the same geometry; stock is today's wheel", () => {
  const { CarMesh } = loadMesh();
  assert.equal(CarMesh.wheelFinish(), CarMesh.WHEEL_DEFAULT, "boots on the shipped default");
  CarMesh.wheelFinish("stock");
  const stock = CarMesh.getCockpitWheel(LIV, "f1").d;
  assert.deepEqual(Object.keys(hist(stock.mat)).map(Number).sort((a, b) => a - b), [21, 22, 26], "stock: carbon, rubber, panel only");
  for (const name of Object.keys(CarMesh.WHEEL_FINISHES).filter((n) => n !== "stock")) {
    CarMesh.wheelFinish(name);
    const d = CarMesh.getCockpitWheel(LIV, "f1").d, f = CarMesh.WHEEL_FINISHES[name], h = hist(d.mat);
    assert.notEqual(d, stock, name + ": a finish change rebuilds the wheel");
    assert.equal(d.pos.length, stock.pos.length, name + ": no geometry added");
    assert.deepEqual(d.idx, stock.idx, name + ": same triangles");
    for (const k of ["grip", "structure", "hardware", "screen"]) assert.ok(h[f[k]] > 0, `${name}: ${k} -> surface ${f[k]}`);
    // The gloves are the driver's, not the wheel's: same count of rubber verts as stock's gloves.
    const gloves = stock.mat.reduce((n, m, v) => n + (m === 22 && d.mat[v] === 22 ? 1 : 0), 0);
    assert.ok(gloves > 100, name + ": the gloves keep their suit-fabric surface");
  }
});

test("the wheel draws with lit opts that let its surfaces' lobes through; stock keeps the rig's", () => {
  const { CarMesh } = loadMesh();
  const rig = { doubleSided: true, roughness: 0.88, metalness: 0.04, specular: 0.14, emissive: 0.2 };
  CarMesh.wheelFinish("stock");
  assert.equal(CarMesh.cockpitWheelOpts(rig), rig);
  for (const name of Object.keys(CarMesh.WHEEL_FINISHES).filter((n) => n !== "stock")) {
    CarMesh.wheelFinish(name);
    const o = CarMesh.cockpitWheelOpts(rig);
    assert.ok(o.clearcoat > 0.42 && o.roughness < 0.6, name + ": lacquer + a roughness the per-surface clamps can work with");
    assert.equal(o.emissive, rig.emissive, name + ": the night lift follows the rig");
  }
});

test("cockpit finish preferences validate raw storage, persist each choice and notify only on changes", () => {
  const disk = new Map([["apex26.cockpitWheelFinish", "invalid"], ["apex26.cockpitBodyFinish", "invalid"], ["apex26.cockpitHaloFinish", "invalid"]]);
  const { finishes: f } = loadFinishes(disk), events = [];
  assert.equal(f.get("wheel"), "carbon"); assert.equal(f.get("body"), "livery"); assert.equal(f.get("halo"), "livery");
  f.onChange((name, value) => events.push([name, value]));
  for (const [name, choice] of Object.entries(f.CHOICES)) {
    for (const value of choice.values) {
      const before = f.stamp(), old = f.get(name), count = events.length;
      assert.equal(f.set(name, value), value);
      assert.equal(f.stamp(), before + Number(old !== value && name !== "wheel"), "wheel choices do not invalidate the body mesh");
      assert.equal(events.length, count + Number(old !== value));
      if (old !== value) assert.equal(disk.get(choice.key), value);
      assert.equal(loadFinishes(disk).finishes.get(name), value, name + " survives a fresh module load");
    }
    f.set(name, "not-a-finish");
    assert.equal(f.get(name), choice.values[0], name + " rejects invalid writes");
    assert.equal(loadFinishes(disk).finishes.get(name), choice.values[0]);
  }
});

test("body and halo finish overrides cache stable views and preserve the fitted livery independently", () => {
  const { finishes: f, materials: m } = loadFinishes();
  const liv = Object.freeze({ ...LIV, finish: "pearl", noseFinish: "chrome", wingFinish: "brushed", cockpitFinish: "satin", haloFinish: "matte", halo: "#cc2200", rimFinish: "goldplate" });
  const original = JSON.stringify(liv), inherited = f.view(liv);
  assert.equal(inherited.livery, liv, "following livery needs no clone");
  assert.equal(f.view(liv), inherited, "repeat frames reuse the resolved view");
  assert.equal(inherited.halo.surface, m.FINISH_SURFACE.matte);
  f.set("body", "carbon");
  const carbon = f.view(liv);
  assert.notEqual(carbon.livery, liv);
  assert.equal(f.view(liv), carbon);
  for (const field of ["finish", "noseFinish", "wingFinish", "cockpitFinish"])
    assert.equal(carbon.livery[field], "carbon", field + " follows the explicit body finish");
  assert.equal(carbon.livery.rimFinish, "goldplate", "road wheels are not body finish");
  assert.equal(carbon.halo.surface, m.FINISH_SURFACE.matte, "halo follows original livery, not the overridden body");
  f.set("halo", "chrome");
  const chromeHalo = f.view(liv);
  assert.equal(chromeHalo.livery.finish, "carbon");
  assert.equal(chromeHalo.halo.surface, m.FINISH_SURFACE.chrome);
  f.set("body", "livery");
  assert.equal(f.view(liv).livery, liv);
  assert.equal(f.view(liv).halo.surface, m.FINISH_SURFACE.chrome, "resetting body does not reset halo");
  f.set("halo", "livery");
  assert.equal(f.view(liv).halo.surface, m.FINISH_SURFACE.matte);
  assert.equal(JSON.stringify(liv), original, "the fitted exterior paint is untouched");
  const other = Object.assign({}, liv, { finish: "gloss", haloFinish: "inherit" });
  assert.equal(f.view(other).livery, other);
  assert.equal(f.view(other).halo.surface, m.SURFACES.paint, "another livery resolves its own inherited halo");
});

test("the actual standard and faired cockpit halos take the selected surface without changing geometry or other materials", () => {
  const { Car3D: C, CarMaterials: M, Teams, Parts } = loadParts({ shade: true });
  const team = Teams.LIST[0], liv = { c1: team.color, c2: team.color2, finish: "gloss" };
  const parts = Parts.getVisualTiers(Parts.getFactorySetup(team.id), team);
  for (const halo of [2, 4]) {
    const build = (surface) => C.build(liv.c1, liv.c2, { livery: liv, teamId: team.id, parts, noDriver: true, noWheels: true,
      cockpit: true, cockpitBody: "standard", halo, measure: true, cockpitHalo: { color: [0.3, 0.2, 0.1], surface } });
    const base = build(M.SURFACES.carbon), selected = build(M.FINISH_SURFACE.chrome);
    assert.deepEqual(selected.pos, base.pos, "halo " + halo + ": no vertex moves");
    assert.deepEqual(selected.idx, base.idx, "halo " + halo + ": no triangle changes");
    assert.deepEqual(selected.col, base.col, "halo " + halo + ": the selected material retains its tint");
    const changed = selected.mat.map((surface, i) => surface !== base.mat[i] ? i : -1).filter(i => i >= 0);
    assert.ok(changed.length > 100, "halo " + halo + ": the actual hoop and stem changed");
    for (const i of changed) {
      assert.equal(base.mat[i], M.SURFACES.carbon);
      assert.equal(selected.mat[i], M.FINISH_SURFACE.chrome);
    }
  }
});

test("livery wheel finish follows paint material, preserves gloves and LCD, and keys equal-color finishes separately", () => {
  const { CarMesh: C, ctx, made, freed } = loadMesh(), M = ctx.CarMaterials;
  const matte = Object.assign({}, LIV, { finish: "matte" }), chrome = Object.assign({}, LIV, { finish: "chrome" });
  const carbon = C.getCockpitWheel(matte, "f1").d;
  C.wheelFinish("livery");
  const first = C.getCockpitWheel(matte, "f1"), d = first.d;
  assert.deepEqual(d.pos, carbon.pos); assert.deepEqual(d.idx, carbon.idx);
  const structure = carbon.mat.map((surface, i) => surface === M.SURFACES.carbon ? i : -1).filter(i => i >= 0);
  assert.ok(structure.length > 100, "the wheel has a structural faceplate to recolor");
  for (const i of structure) assert.equal(d.mat[i], M.FINISH_SURFACE.matte);
  let protectedVertices = 0;
  for (let i = 0; i < carbon.mat.length; i++) if (carbon.mat[i] === M.SURFACES.rubber || carbon.mat[i] === M.SURFACES.glass) {
    protectedVertices++;
    assert.equal(d.mat[i], carbon.mat[i]);
    assert.deepEqual(d.col.slice(i * 3, i * 3 + 3), carbon.col.slice(i * 3, i * 3 + 3));
  }
  assert.ok(protectedVertices > 100, "gloves, grips and LCD were exercised");
  const count = made.length;
  assert.equal(C.getCockpitWheel(matte, "f1"), first);
  assert.equal(made.length, count, "unchanged frames reuse the wheel");
  const second = C.getCockpitWheel(chrome, "f1");
  assert.notEqual(second, first, "a finish-only livery change replaces the wheel");
  assert.equal(made.length, count + 1);
  assert.ok(freed.includes(first), "the superseded GPU mesh is freed");
  for (const i of structure) assert.equal(second.d.mat[i], M.FINISH_SURFACE.chrome);
  assert.equal(C.getCockpitWheel(chrome, "f1"), second);
});
