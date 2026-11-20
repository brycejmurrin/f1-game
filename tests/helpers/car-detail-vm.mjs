/* car-detail-vm.mjs — the Car3D build chain in a node VM, WITH car-shade.js (the shipped rounded car), for the
 * desktop-detail suite (tests/unit/car-detail-tiers.test.mjs). GfxQuality is deliberately absent: in node that
 * means detail 0, and the suite passes opts.detail / opts.hero explicitly. The lazy EXTREME kit js/car/car-hero.js
 * (CarHero) loads last, as RendererBoot has it resident at detail >= 2; `omit: ["js/car/car-hero.js"]` is the ULTRA
 * path without it.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "./seed-log.mjs";
import { absSrc } from "./abs-src.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILES = ["js/core/mat4.js", "js/data/teams.js", "js/car/parts.js", "js/car/helmets.js", "js/car/car-geometry.js",
  "js/car/car-wheels.js", "js/car/car-material-shade.js", "js/car/car-materials.js", "js/car/car-shade.js",
  "js/car/car-body-geom.js", "js/car/car3d.js",
  // the lazy EXTREME kit (LAZY_GFX_HI): resident at detail 2; opts.omit drops it to check the ULTRA path without it
  "js/car/car-hero.js"];

export function loadCarDetail(extra, opts) {
  const ctx = vm.createContext(Object.assign({ Math, console, Object, Array, Number, isFinite }, extra || {}));
  seedLog(ctx);
  const omit = new Set((opts && opts.omit) || []);
  // opts.meshDetail: the lazy MeshDetail kit loaded first, as a race (LAZY_TRACK_BUILD) has it by the car builds.
  const files = (opts && opts.meshDetail ? ["js/render/shared/mesh-detail.js"] : []).concat(FILES, opts && opts.rig ? ["js/car/cockpit-rig.js"] : []);
  for (const f of files) if (!omit.has(f)) vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: absSrc(f) });
  if (opts && opts.rig) vm.runInContext("CockpitRig.init({ createMesh: (d) => d, freeMesh() {} })", ctx);
  return vm.runInContext("({ Car3D, Parts, Teams, CarGeometry, Helmets, CarHero: typeof CarHero === 'undefined' ? undefined : CarHero" + (opts && opts.rig ? ", CockpitRig" : "") + (opts && opts.meshDetail ? ", MeshDetail" : "") + " })", ctx);
}

// The mesh health the suite pins: finite numbers, indices in range, zero-area triangles counted, unit normals,
// uv (when present) in 0..1, and the bounding box.
export function meshHealth(m) {
  const n = m.pos.length / 3, bad = [];
  let degenerate = 0, x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const k of ["pos", "nrm", "col"]) if (m[k].some((v) => !Number.isFinite(v))) bad.push(k + " not finite");
  if (m.nrm.length !== n * 3 || m.col.length !== n * 3 || (m.mat && m.mat.length !== n)) bad.push("attribute lengths");
  if (m.uv && m.uv.some((v) => v < -1e-6 || v > 1 + 1e-6)) bad.push("uv outside 0..1");
  for (let i = 0; i < n; i++) {
    const l = Math.hypot(m.nrm[i * 3], m.nrm[i * 3 + 1], m.nrm[i * 3 + 2]);
    if (Math.abs(l - 1) > 1e-3) { bad.push("normal " + i + " length " + l); break; }
    const x = m.pos[i * 3], y = m.pos[i * 3 + 1], z = m.pos[i * 3 + 2];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  for (let t = 0; t < m.idx.length; t += 3) {
    const a = m.idx[t], b = m.idx[t + 1], c = m.idx[t + 2];
    if (![a, b, c].every((v) => Number.isInteger(v) && v >= 0 && v < n)) { bad.push("index out of range at " + t); break; }
    const P = (v, k) => m.pos[v * 3 + k];
    const ux = P(b, 0) - P(a, 0), uy = P(b, 1) - P(a, 1), uz = P(b, 2) - P(a, 2);
    const vx = P(c, 0) - P(a, 0), vy = P(c, 1) - P(a, 1), vz = P(c, 2) - P(a, 2);
    if (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) < 1e-12) degenerate++;
  }
  return { bad, degenerate, tris: m.idx.length / 3, verts: n, box: [x0, y0, z0, x1, y1, z1] };
}
