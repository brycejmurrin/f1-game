// @doc Loads named browser-free car source profiles for audits, viewers and mesh tests.
// Browser-free car sources only. Browser CARVIEW/post assets stay in manifest.cjs.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = ["js/core/log.js", "js/core/mat4.js", "js/data/teams.js"];
const DECALS = ["js/car/livery-design.js", "js/car/livery-graphics.js", "js/car/crest-draw.js", "js/car/liverytex.js"];
const GEOMETRY = ["js/car/car-geometry.js", "js/car/car-wheels.js", "js/car/car-material-shade.js", "js/car/car-materials.js"];
const BODY = ["js/car/car-body-geom.js", "js/car/car3d.js"];
const SHADE = "js/car/car-shade.js", LIVERIES = "js/car/liveries.js";

/** Named profiles preserve intentional source order and shading differences. */
export function carSourceFiles(profile, { shade = false, liveries = false } = {}) {
  if (profile === "parts") return [
    ...BASE, "js/car/parts.js", ...(liveries ? [LIVERIES] : []), ...DECALS, "js/car/helmets.js",
    ...GEOMETRY, ...(shade ? [SHADE] : []), ...BODY, "js/car/car-mesh.js",
  ];
  if (profile === "cockpit") return [
    ...BASE, "js/car/parts.js", LIVERIES, "js/car/helmets.js", ...GEOMETRY, SHADE, ...BODY,
  ];
  // Manifest order: legends ahead of liveries, which reads it at call time.
  if (profile === "viewer") return [
    ...BASE, "js/data/legends.js", "js/car/parts.js", ...DECALS, "js/car/helmets.js", LIVERIES,
    ...GEOMETRY, ...BODY,
  ];
  throw new Error(`unknown car source profile: ${profile}`);
}

/** One classic script; its source cannot close an embedding script tag. */
export function carSourceBundle(profile, options) {
  return carSourceFiles(profile, options)
    .map((f) => `// ── ${f}\n` + fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n")
    .replace(/<\/script/gi, "<\\/script");
}

/** Every call creates a fresh realm; no mesh state or caches cross callers. */
export function loadCarSourceProfile(profile, options) {
  const ctx = { console, Math, Object, Array, Float32Array, Uint16Array, Uint32Array,
    JSON, Number, String, Boolean, isFinite, isNaN };
  // Cockpit historically uses realm-native collections; parts/viewer expose
  // host collections alongside the other explicitly injected builtins.
  if (profile !== "cockpit") Object.assign(ctx, { Map, Set, WeakMap });
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of carSourceFiles(profile, options)) {
    const filename = path.join(ROOT, f);
    vm.runInContext(fs.readFileSync(filename, "utf8"), ctx, { filename });
  }
  // Script-level consts are lexical bindings, not properties of the VM global.
  return (name) => vm.runInContext(name, ctx);
}
