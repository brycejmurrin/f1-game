// garage-live-glow.test.mjs — emissive gantry screens, night lamp pools, desk spill
// and floor reflection on the 512 LIVE atlas (Lane 7). No browser; node:vm only.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const sandbox = {
  console, Math, Object, Array, Number, String, JSON, Float32Array, Uint16Array, Uint32Array,
  isFinite, parseFloat, parseInt, Date,
  Log: { info() {}, warn() {}, error() {}, debug() {}, enabled: () => false },
  LiveryTex: {},
};
const vctx = vm.createContext(sandbox);
for (const f of ["js/track/core/geom.js", "js/track/core/pit.js", "js/garage/scene-prims.js",
                 "js/garage/scene-equipment.js", "js/garage/scene-live.js"])
  vm.runInContext(read(f), vctx, { filename: absSrc(f) });
const GarageLive = vm.runInContext("GarageLive", vctx);
const GarageEquipment = vm.runInContext("GarageEquipment", vctx);

/** Recording 2d context: tracks fillRect colours and radial gradients. */
function fakeCanvas() {
  const fills = [], radials = [], texts = [];
  const c2d = new Proxy({}, {
    get(t, k) {
      if (k === "fillRect") return (x, y, w, h) => fills.push({ x, y, w, h, style: t.fillStyle });
      if (k === "fillText") return (s) => texts.push(String(s));
      if (k === "createRadialGradient") return (x0, y0, r0, x1, y1, r1) => {
        const stops = [];
        const g = { addColorStop(o, c) { stops.push({ o, c }); }, stops };
        radials.push(g);
        return g;
      };
      if (k === "createLinearGradient") return () => ({ addColorStop() {} });
      return k in t ? t[k] : () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return { cv: { getContext: () => c2d }, fills, radials, texts };
}

const FIXTURES = [
  [0, 4.4, 0, 0, -1, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  [1, 4.4, 1, 0, -1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
  [-1, 4.4, 1, 0, -1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
  [2, 4.4, -1, 0, -1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
  [-2, 4.4, -1, 0, -1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
  [0, 4.4, 2, 0, -1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
];
const LIV = { c1: [0.95, 0.45, 0.05], c2: [0.05, 0.05, 0.06], accent: [0.1, 0.7, 0.9] };
const TEAM = { id: "mclaren", name: "McLaren", short: "MCL" };

test("LIVE stays 512 and exports paint/build without a new module", () => {
  assert.equal(GarageLive.LIVE, 512);
  assert.equal(typeof GarageLive.paintLive, "function");
  assert.equal(typeof GarageLive.paintTrace, "function");
  assert.equal(typeof GarageLive.build, "function");
});

test("GANTRY anchor is exported and lockstep with the hung-screen builder", () => {
  assert.ok(GarageEquipment.GANTRY, "GANTRY exported for the live atlas");
  assert.equal(GarageEquipment.GANTRY.x, -4.70);
  assert.equal(GarageEquipment.GANTRY.z, -1.85);
  assert.equal(GarageEquipment.GANTRY.dz.length, 3);
  assert.ok(GarageEquipment.GANTRY.dz.every((z, i) => Math.abs(z - [-1.15, 0, 1.15][i]) < 1e-9));
  assert.ok(GarageEquipment.LCD[0] > 1, "LCD albedo clears the glow gate");
});

test("paintLive night pools are cooler/brighter than day pools", () => {
  const day = fakeCanvas();
  GarageLive.paintLive(day.cv, TEAM, LIV, { night: false, weather: "dry" });
  const night = fakeCanvas();
  GarageLive.paintLive(night.cv, TEAM, LIV, { night: true, weather: "dry" });
  const dayPool = day.radials.map((g) => g.stops.map((s) => s.c).join("|")).join(";");
  const nightPool = night.radials.map((g) => g.stops.map((s) => s.c).join("|")).join(";");
  assert.notEqual(dayPool, nightPool, "night must retint the lamp-pool gradient");
  assert.match(nightPool, /190,\s*220,\s*255|170,\s*210,\s*255/, "night pool leans cool");
  // Gantry strip occupies y 448..512 — three status chips are fillRects there.
  const gantryFills = night.fills.filter((f) => f.y >= 448 && f.y < 512);
  assert.ok(gantryFills.length >= 4, `gantry strip painted (${gantryFills.length} fills)`);
});

test("buildLive places gantry LCDs, desk spill, work-lamp pools and reflection", () => {
  const g = GarageLive.build(FIXTURES);
  // Baseline before this lane: mid 4, floor 28 (shadow+6 pools), nx 8 (trace+banner), px 4, door 8.
  // Now: floor gains 2 work-lamp pools + 2 reflection quads; nx gains lower trace + 3 gantry + desk spill.
  assert.equal(g.mid.pos.length / 3, 4, "timing screen still one quad");
  assert.ok(g.floor.pos.length / 3 >= 28 + 16, `floor has lamp pools + reflection (${g.floor.pos.length / 3} verts)`);
  assert.ok(g.nx.pos.length / 3 >= 8 + 4 + 12 + 4, `nx has traces + gantry + spill (${g.nx.pos.length / 3} verts)`);
  // Gantry faces sit proud of the bay-facing LCD face (x + 0.126).
  const gx = GarageEquipment.GANTRY.x + 0.126;
  let gantryVerts = 0;
  for (let i = 0; i < g.nx.pos.length; i += 3) {
    if (Math.abs(g.nx.pos[i] - gx) < 1e-6) gantryVerts++;
  }
  assert.equal(gantryVerts, 12, "three gantry LCD quads (4 verts each)");
  // Desk spill at y ≈ 0.872
  let spill = 0;
  for (let i = 1; i < g.nx.pos.length; i += 3) {
    if (Math.abs(g.nx.pos[i] - 0.872) < 1e-6) spill++;
  }
  assert.equal(spill, 4, "desk spill is one quad on the worktop");
});

test("monitorGantry screen faces use above-white LCD albedo", () => {
  const mesh = { pos: [], nrm: [], col: [], idx: [], mat: [] };
  GarageEquipment.monitorGantry(mesh, GarageEquipment.GANTRY.x, GarageEquipment.GANTRY.z, LIV.c1);
  const lcd = GarageEquipment.LCD;
  let hits = 0;
  for (let i = 0; i < mesh.col.length; i += 3) {
    if (Math.abs(mesh.col[i] - lcd[0]) < 1e-9 && Math.abs(mesh.col[i + 1] - lcd[1]) < 1e-9)
      hits++;
  }
  assert.ok(hits >= 12, `LCD face vertices present (${hits})`);
});

test("buildEquipment keeps the timing-screen LCD lip without parking work lamps", () => {
  const empty = () => ({ pos: [], nrm: [], col: [], idx: [], mat: [] });
  const groups = { mid: empty(), back: empty(), nx: empty(), px: empty() };
  GarageEquipment.build(groups, LIV, { weather: "dry" });
  const lcd = GarageEquipment.LCD;
  let lips = 0;
  for (let i = 0; i < groups.mid.col.length; i += 3) {
    if (Math.abs(groups.mid.col[i] - lcd[0]) < 1e-9 && Math.abs(groups.mid.col[i + 1] - lcd[1]) < 1e-9)
      lips++;
  }
  assert.ok(lips >= 4, `timing-screen LCD lip present (${lips} verts)`);
  // workLamp stays an exported builder; parking two blows the 18k-tri bay budget.
  assert.equal(typeof GarageEquipment.workLamp, "function");
});
