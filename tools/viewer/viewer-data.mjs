// @doc Viewer payloads: Tracks.build circuits as compact JSON, and the js/car sources the page builds cars from.
// @skill playwright-probe
//
// Offline, no browser. The circuit side reuses verify-track's buildContext.
// Cars are NOT baked: the page embeds the js/car roster (the files
// tools/car/parts-sweep.mjs loads, plus legends + liveries) and calls
// Car3D.buildComplete itself, so every livery, finish and part option the
// garage offers can be picked live. Livery DECALS (sponsors, numbers) are a
// canvas atlas and stay out: the page shows the mesh and its vertex paint.
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);

// Manifest order (tools/manifest.cjs): legends ahead of liveries, which reads it at call time.
export const CAR_FILES = ["js/core/log.js", "js/core/mat4.js", "js/data/teams.js", "js/data/legends.js", "js/car/parts.js",
  "js/car/livery-design.js", "js/car/livery-graphics.js", "js/car/crest-draw.js", "js/car/liverytex.js",
  "js/car/helmets.js", "js/car/liveries.js",
  "js/car/car-geometry.js", "js/car/car-wheels.js", "js/car/car-material-shade.js", "js/car/car-materials.js",
  "js/car/car-body-geom.js", "js/car/car3d.js"];

let _tracks = null, _car = null;
function tracks() {
  if (!_tracks) _tracks = require("../track/verify-track.cjs").buildContext(null, { quiet: true });
  return _tracks;
}
/** The car roster as ONE classic script. "</script" cannot occur inside it. */
export function carBundle() {
  return CAR_FILES.map((f) => `// ── ${f}\n` + fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n")
    .replace(/<\/script/gi, "<\\/script");
}
function car() {
  if (_car) return _car;
  const ctx = { console, Math, Object, Array, Float32Array, Uint16Array, Uint32Array,
    JSON, Number, String, Boolean, isFinite, isNaN, Map, Set, WeakMap };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(carBundle(), ctx, { filename: "viewer-car-bundle.js" });
  // Script-level `const X = (function(){})()` is lexical: read it by name.
  const grab = (n) => vm.runInContext(n, ctx);
  _car = { Teams: grab("Teams") };
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

/** The self-contained viewer page for the given circuits and cars. */
export function viewerHtml({ circuits = [], cars = [] } = {}) {
  const data = { circuits: {}, cars };
  for (const id of circuits) data.circuits[id] = circuitData(id);
  const tpl = fs.readFileSync(path.join(ROOT, "tools/viewer/viewer.html"), "utf8");
  // JSON is safe inside <script> once "</" cannot close it.
  const json = JSON.stringify(data).replace(/<\//g, "<\\/");
  return tpl.replace("/*@DATA*/null", () => json)
    .replace("/*@CARS*/", () => (cars.length ? carBundle() : ""));
}
