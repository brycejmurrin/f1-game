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

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

function loadMesh() {
  const made = [], freed = [];
  const ctx = { Log: { info() {}, warn() {}, error() {} }, GaragePrims: { block() {} } };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["js/core/mat4.js", "js/physics/consts.js"]) vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  vm.runInContext(read("js/car/car-mesh.js") + "\n;this.CarMesh = CarMesh;", ctx, { filename: absSrc("js/car/car-mesh.js") });
  ctx.CarMesh.init({ createMesh(d) { const m = { d }; made.push(m); return m; }, freeMesh(m) { freed.push(m); } });
  return { CarMesh: ctx.CarMesh, made, freed };
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

test("the cockpit and helmet cameras draw the body with the exterior's paint opts (carFinish)", () => {
  const draw = read("js/car/car-draw.js"), game = read("js/game.js");
  assert.match(draw, /G\.gfx\.draw\(cockpitBodyMesh\(c\.team, c\), base, paint\)/, "drawCockpitRig: body with the paint opts");
  assert.match(game, /drawCockpitRig\(c, _cockMat, dt, paint, /, "game.js hands the frame's carPaintMat to the rig");
  assert.match(read("js/fx/grade-tint.js"), /m\.carFinish = true/, "carPaintMat carries carFinish (the 60-85 finish block)");
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
  assert.match(read("js/car/car-draw.js"), /getCockpitWheel\(deps\.resolveLivery\(c\.team\), wheelStyle\), _rigB, CarMesh\.cockpitWheelOpts\(opt\)\)/,
    "drawCockpitRig draws the wheel with its finish opts");
});
