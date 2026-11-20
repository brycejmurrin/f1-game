// Builds the setup-screen garage room and the bay crew in a node VM with a
// recording Gfx, with GfxQuality's EXTREME seam stubbed (or absent), and
// summarises every uploaded buffer: a sha256 over its columns and its triangle
// count. tests/unit/garage-hi-detail.test.mjs pins the summaries in
// tests/data/garage-hi-detail.json; `read` lets a caller build from another
// tree (the HEAD baseline the pin was taken from).
import crypto from "node:crypto";
import vm from "node:vm";
import { absSrc } from "./abs-src.mjs";

export const TEAM = { id: "mclaren", name: "Team", short: "TMA", drivers: [{ name: "A", code: "AAA", num: 4 }, { name: "B", code: "BBB", num: 81 }] };
export const LIV = { c1: [0.95, 0.45, 0.05], c2: [0.05, 0.05, 0.06], accent: [0.1, 0.7, 0.9] };
const ROOM = ["js/core/mat4.js", "js/track/core/geom.js", "js/track/core/pit.js", "js/garage/scene-prims.js", "js/garage/scene-equipment.js",
  "js/garage/scene-live.js", "js/garage/scene-dress.js", "js/garage/experience.js", "js/garage/scene.js",
  "js/garage/crew-draw.js", "js/garage/crew-motion.js", "js/garage/crew-service.js", "js/garage/scene-crew.js", "js/garage/arrival.js"];

/** features: null = no GfxQuality global (node default); else { name: bool }. hi: also load js/garage/hi-prims.js. */
export function load(read, { features = null, hi = false } = {}) {
  const meshes = [];
  const gfx = {
    createMesh(data) { meshes.push(data); return { id: meshes.length }; },
    createTexMesh(data) { meshes.push(data); return { id: meshes.length, tex: true }; },
    freeMesh() {}, freeTexture() {}, createTexture() { return { id: 1 }; },
    draw() {}, drawDecal() {}, drawGlow() {},
  };
  const warns = [];
  const ctx = vm.createContext({
    console, Math, Object, Array, Number, String, JSON, Float32Array, Uint16Array, Uint32Array, isFinite, parseFloat, parseInt, Date, Map, Set,
    Log: { info() {}, warn(_c, m) { warns.push(m); }, error() {}, debug() {}, enabled: () => false },
  });
  if (features) ctx.GfxQuality = { feature: (n) => !!features[n] };
  const files = hi ? [...ROOM.slice(0, 4), "js/garage/hi-prims.js", ...ROOM.slice(4)] : ROOM;
  for (const f of files) vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  const get = (n) => vm.runInContext(n, ctx);
  return { ctx, gfx, meshes, warns, get };
}

function summary(list) {
  const h = crypto.createHash("sha256");
  let tris = 0, verts = 0;
  for (const d of list) {
    for (const k of ["pos", "nrm", "col", "mat", "idx"]) h.update(k + ":" + JSON.stringify(Array.from(d[k] || [])) + ";");
    tris += d.idx.length / 3; verts += d.pos.length / 3;
  }
  return { sha256: h.digest("hex"), meshes: list.length, verts, tris };
}

/** The room (GarageScene.draw's first-frame rebuild) and every crew look's meshes. */
export function buildAll(read, opts) {
  const H = load(read, opts);
  const Scene = H.get("GarageScene"), Crew = H.get("GarageCrew"), Arrival = H.get("GarageArrival");
  Scene.init(H.gfx);
  const r0 = H.meshes.length;
  Scene.draw(TEAM, LIV, [0, 1.6, 0], null, 0);
  const room = H.meshes.slice(r0);
  Crew.init(H.gfx);
  const crew = {};
  for (const id of Crew.LOOKS) {
    Crew.setLook(id);
    const c0 = H.meshes.length;
    Crew.draw(LIV, [-3, 2, -4], Arrival.poseOut(2.5, Arrival.settings({}), true));
    crew[id] = H.meshes.slice(c0);
  }
  return { H, room, crew, summary: { room: summary(room), crew: Object.fromEntries(Object.entries(crew).map(([k, v]) => [k, summary(v)])) } };
}

/** Every triangle finite and of non-zero area; returns the first failure or null. */
export function badTriangle(list, minArea2 = 1e-14) {
  for (let m = 0; m < list.length; m++) {
    const { pos, idx, nrm } = list[m];
    for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i]) || !Number.isFinite(nrm[i])) return `mesh ${m}: non-finite vertex value at ${i}`;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const u = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]], v = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
      const x = u[1] * v[2] - u[2] * v[1], y = u[2] * v[0] - u[0] * v[2], z = u[0] * v[1] - u[1] * v[0];
      if (x * x + y * y + z * z < minArea2) return `mesh ${m}: degenerate triangle ${t / 3}`;
    }
  }
  return null;
}
