/* Build one circuit headlessly to verify its js/tracks/<id>.js scenery() runs
 * without throwing (the failure mode that silently strands the game on the menu).
 * Loads ONLY that track's data file + the engine, so it never races other files.
 *   node tools/verify-track.cjs suzuka
 * Exit 0 + "OK ..." on success; exit 1 + the error otherwise. */
const fs = require("fs"), vm = require("vm"), path = require("path");
const id = process.argv[2];
if (!id) { console.log("usage: node tools/verify-track.cjs <id>"); process.exit(1); }
const root = path.join(__dirname, "..");
const rd = (p) => fs.readFileSync(path.join(root, p), "utf8");
const GLX = { createMesh: (d) => ({ verts: (d.pos || []).length / 3 }) };
const ctx = { window: {}, console, Math, Float32Array, Uint8Array, Uint16Array, Object, Array, JSON, isFinite, performance: { now: () => 0 }, GLX };
vm.createContext(ctx);
try {
  vm.runInContext(rd(`js/tracks/${id}.js`) + "\n" + rd("js/circuits.js") + "\n" + rd("js/tracks.js") + "\nwindow.__T=Tracks;", ctx);
} catch (e) { console.log(`LOAD FAIL ${id}: ${e.message}`); process.exit(1); }
const def = (ctx.window.__T.LIST || []).find((d) => d.id === id);
if (!def) { console.log(`NO DEF for ${id}`); process.exit(1); }
try {
  const tr = ctx.window.__T.build(def);
  console.log(`OK ${id}: props ${tr.meshes.props.verts} verts (road ${tr.meshes.road.verts}, terrain ${tr.meshes.terrain.verts})`);
} catch (e) { console.log(`BUILD FAIL ${id}: ${e.message}`); process.exit(1); }
