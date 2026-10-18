// @doc Viewer payloads: Tracks.build circuits and Car3D.buildComplete team cars as compact JSON for viewer.html.
// @skill playwright-probe
//
// Offline, no browser. The circuit side reuses verify-track's buildContext; the
// car side loads the same js/car roster tools/car/parts-sweep.mjs loads, plus
// js/car/liveries.js, and builds each team the way car-draw.js buildCarData
// does (team default livery, factory setup, first driver's number). Livery
// DECALS (sponsors, numbers) are a canvas atlas and stay out: this is the mesh
// and its vertex paint only.
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);

const CAR_FILES = ["js/core/log.js", "js/core/mat4.js", "js/data/teams.js", "js/car/parts.js",
  "js/car/livery-design.js", "js/car/livery-graphics.js", "js/car/crest-draw.js", "js/car/liverytex.js",
  "js/car/helmets.js", "js/car/liveries.js",
  "js/car/car-geometry.js", "js/car/car-wheels.js", "js/car/car-material-shade.js", "js/car/car-materials.js",
  "js/car/car-body-geom.js", "js/car/car3d.js"];

let _tracks = null, _car = null;
function tracks() {
  if (!_tracks) _tracks = require("../track/verify-track.cjs").buildContext(null, { quiet: true });
  return _tracks;
}
function car() {
  if (_car) return _car;
  const ctx = { console, Math, Object, Array, Float32Array, Uint16Array, Uint32Array,
    JSON, Number, String, Boolean, isFinite, isNaN, Map, Set, WeakMap };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of CAR_FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
  // Script-level `const X = (function(){})()` is lexical: read it by name.
  const grab = (n) => vm.runInContext(n, ctx);
  _car = { Car3D: grab("Car3D"), Parts: grab("Parts"), Teams: grab("Teams"), Liveries: grab("Liveries"), Log: grab("Log") };
  _car.Log.level("warn");
  return _car;
}

export function circuitIds() { return tracks().LIST.map((d) => d.id); }
export function teamIds() { return car().Teams.LIST.map((t) => t.id); }

const r1 = (v) => Math.round(v * 10) / 10, r3 = (v) => Math.round(v * 1000) / 1000;

/** ~500 evenly strided nodes of the built circuit: centre, right vector, half-width, curvature, racing line. */
export function circuitData(id, { maxNodes = 500 } = {}) {
  const T = tracks();
  const def = T.LIST.find((d) => d.id === id);
  if (!def) throw new Error(`unknown circuit "${id}" (one of: ${circuitIds().join(", ")})`);
  const t = T.build(def);
  const step = Math.max(1, Math.round(t.n / maxNodes));
  const o = { id, name: def.name || id, total: Math.round(t.total), nodes: t.n,
    x: [], y: [], z: [], rx: [], rz: [], hw: [], k: [], l: [] };
  for (let i = 0; i < t.n; i += step) {
    o.x.push(r1(t.px[i])); o.y.push(r1(t.py[i])); o.z.push(r1(t.pz[i]));
    o.rx.push(r3(t.rx[i])); o.rz.push(r3(t.rz[i])); o.hw.push(r1(t.hw[i]));
    o.k.push(Math.round(t.curv[i] * 1e4) / 1e4); o.l.push(r1(t.line[i]));
  }
  return o;
}

/** One team's factory car. Positions in millimetres (Int16), colours as 0-255 bytes, indices Uint16 (Uint32 past 65535 verts); all base64. */
export function carData(teamId) {
  const M = car();
  const team = M.Teams.LIST.find((t) => t.id === teamId);
  if (!team) throw new Error(`unknown team "${teamId}" (one of: ${teamIds().join(", ")})`);
  const liv = M.Liveries.forTeam(team)[0];
  const num = team.drivers && team.drivers[0] ? team.drivers[0].num : 0;
  const d = M.Car3D.buildComplete(liv.c1, liv.c2, {
    livery: liv, teamId: team.id, num,
    parts: M.Parts.getVisualTiers(M.Parts.getFactorySetup(team), team),
  });
  // Weld vertices that share a millimetre position and a byte colour. Car3D
  // emits per-face vertices; the viewer shades flat from screen derivatives,
  // so normals are not needed and welding costs nothing visible.
  const key = new Map(), pos = [], col = [], remap = new Uint32Array(d.pos.length / 3);
  for (let v = 0; v < remap.length; v++) {
    const p = [0, 1, 2].map((a) => Math.round(d.pos[v * 3 + a] * 1000));
    const c = [0, 1, 2].map((a) => Math.max(0, Math.min(255, Math.round(d.col[v * 3 + a] * 255))));
    const k = p.join(",") + "/" + c.join(",");
    let w = key.get(k);
    if (w === undefined) { w = pos.length / 3; key.set(k, w); pos.push(...p); col.push(...c); }
    remap[v] = w;
  }
  const nV = pos.length / 3;
  const idxArr = d.idx.map((i) => remap[i]);
  const idx = nV < 65536 ? new Uint16Array(idxArr) : new Uint32Array(idxArr);
  const posA = new Int16Array(pos), colA = new Uint8Array(col);
  const b64 = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString("base64");
  return { id: team.id, name: team.name, short: team.short, num, verts: nV, tris: idx.length / 3,
    idx32: idx instanceof Uint32Array, pos: b64(posA), col: b64(colA), idx: b64(idx) };
}

/** The self-contained viewer page for the given circuits and cars. */
export function viewerHtml({ circuits = [], cars = [] } = {}) {
  const data = { circuits: {}, cars: {} };
  for (const id of circuits) data.circuits[id] = circuitData(id);
  for (const id of cars) data.cars[id] = carData(id);
  const tpl = fs.readFileSync(path.join(ROOT, "tools/viewer/viewer.html"), "utf8");
  // JSON is safe inside <script> once "</" cannot close it.
  const json = JSON.stringify(data).replace(/<\//g, "<\\/");
  return tpl.replace("/*@DATA*/null", () => json);
}
