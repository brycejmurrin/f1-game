// No sign in the garage may have a prop mounted in front of it.
//
// Twice in one week a wall sign shipped partly hidden, and only a screenshot
// caught it: the side-wall service gantry ran its shelf and clips through the
// wordmark band (top third of every wordmark gone, the middle one notched),
// and before that the hose booms hung a reel drum across the middle wordmark.
// A third defect had never been seen at all — the live telemetry traces were
// quads at the wall plane BEHIND the 0.19 m monitor bank, so the animation
// they carried was drawn into a block and never reached a pixel.
//
// The rule: for every wall-mounted dress or live quad (the floor decals are
// exempt — things stand on them by design), rasterise the quad into a grid
// and count the cells behind any opaque triangle that lies within HALF A METRE
// in front of the quad's plane. Half a metre is the "mounted on the same
// wall" band: a bracket, shelf, bezel or rail there hides the sign from every
// eye in the bay, so the check needs no camera. Props further out hide a sign
// only from some presets, and that is a screenshot's job.
//
// The scene is built in a VM with a recording Gfx, exactly as
// garage-mesh.test.mjs does, plus a 2D canvas and a LiveryTex that accept any
// call and never throw — the atlas paint is not the subject, the quads are.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const NEAR = 0.5;      // metres in front of the sign's plane that count as "mounted over it"
const MAX_PCT = 5;     // the coverage a sign may lose before it reads as cut
const GX = 60, GY = 12;

function harness() {
  const meshes = [];
  const gfx = {
    createMesh(d) { meshes.push({ ...d, tex: false }); return { id: meshes.length }; },
    createTexMesh(d) { meshes.push({ ...d, tex: true }); return { id: meshes.length }; },
    freeMesh() {}, freeTexture() {}, createTexture() { return { id: 1 }; },
    draw() {}, drawDecal() {}, drawGlow() {},
  };
  // Stubs that accept anything and never leak a Proxy into a string.
  const prim = { [Symbol.toPrimitive]: () => "", toString: () => "", valueOf: () => 0, then: undefined };
  const anyFn = () => new Proxy(function () {}, {
    get: (t, k) => (k in prim ? prim[k] : k === "length" ? 0 : anyFn()), apply: () => undefined });
  const ctx2d = () => new Proxy({}, { get: (t, k) => {
    if (k in prim) return prim[k];
    if (k === "measureText") return () => ({ width: 10 });
    if (k === "createLinearGradient" || k === "createRadialGradient") return () => ({ addColorStop() {} });
    if (k === "getImageData") return () => ({ data: new Uint8ClampedArray(4) });
    if (k === "canvas") return { width: 1024, height: 1024 };
    return () => undefined; }, set: () => true });
  const document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d(), toDataURL: () => "" }) };
  const LiveryTex = new Proxy({}, { get: (t, k) => (k in prim ? prim[k] : k === "onMarkChange" ? undefined : anyFn()) });
  const warnings = [];
  const ctx = vm.createContext({
    document, LiveryTex, console, Math, Object, Array, Number, String, JSON, Float32Array, Uint16Array,
    Uint32Array, isFinite, parseFloat, parseInt, Date,
    Log: { info() {}, warn: (...a) => warnings.push(a.join(" ")), error: (...a) => warnings.push(a.join(" ")), debug() {}, enabled: () => false },
  });
  for (const f of ["js/track/core/geom.js", "js/garage/scene-prims.js", "js/garage/scene-equipment.js",
                   "js/garage/scene-live.js", "js/garage/scene.js"])
    vm.runInContext(read(f), ctx, { filename: f });
  const GarageScene = vm.runInContext("GarageScene", ctx);
  GarageScene.init(gfx);
  return { GarageScene, meshes, warnings };
}

const TEAM = { id: "mclaren", name: "McLaren", short: "MCL",
               drivers: [{ name: "A", code: "AAA", num: 4 }, { name: "B", code: "BBB", num: 81 }] };
const LIV = { c1: [0.95, 0.45, 0.05], c2: [0.05, 0.05, 0.06] };

// Wall quads (4 verts each, a shared normal) and every opaque triangle.
function collect(meshes) {
  const quads = [], tris = [];
  for (const m of meshes) {
    if (m.tex) {
      for (let v = 0; v + 3 < m.pos.length / 3; v += 4) {
        const n = [m.nrm[v * 3], m.nrm[v * 3 + 1], m.nrm[v * 3 + 2]];
        if (Math.abs(n[1]) > 0.5) continue;
        const P = [];
        for (let k = 0; k < 4; k++) P.push([m.pos[(v + k) * 3], m.pos[(v + k) * 3 + 1], m.pos[(v + k) * 3 + 2]]);
        quads.push({ n, P });
      }
    } else if (m.idx) {
      for (let i = 0; i + 2 < m.idx.length; i += 3)
        tris.push([0, 1, 2].map((k) => { const j = m.idx[i + k]; return [m.pos[j * 3], m.pos[j * 3 + 1], m.pos[j * 3 + 2]]; }));
    }
  }
  return { quads, tris };
}

const inTri = (px, py, A, B, C) => {
  // An edge-on face projects to a line: a degenerate triangle covers nothing.
  if (Math.abs((B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0])) < 1e-7) return false;
  const s1 = (B[0] - A[0]) * (py - A[1]) - (B[1] - A[1]) * (px - A[0]);
  const s2 = (C[0] - B[0]) * (py - B[1]) - (C[1] - B[1]) * (px - B[0]);
  const s3 = (A[0] - C[0]) * (py - C[1]) - (A[1] - C[1]) * (px - C[0]);
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
};

// Percentage of the quad's cells that sit behind near geometry.
function coverage(q, tris) {
  const a = q.n[0] ? 0 : 2, sgn = q.n[a] > 0 ? 1 : -1, plane = q.P[0][a];
  const b = a === 0 ? 2 : 0, c = 1;
  const lo = [Math.min(...q.P.map((p) => p[b])), Math.min(...q.P.map((p) => p[c]))];
  const hi = [Math.max(...q.P.map((p) => p[b])), Math.max(...q.P.map((p) => p[c]))];
  const near = [];
  for (const T of tris) {
    const d = T.map((p) => (p[a] - plane) * sgn);
    if (Math.min(...d) < 0.012 || Math.max(...d) > NEAR) continue;   // coplanar bezels; far props
    const t2 = T.map((p) => [p[b], p[c]]);
    if (Math.max(...t2.map((p) => p[0])) < lo[0] || Math.min(...t2.map((p) => p[0])) > hi[0] ||
        Math.max(...t2.map((p) => p[1])) < lo[1] || Math.min(...t2.map((p) => p[1])) > hi[1]) continue;
    near.push(t2);
  }
  let cov = 0;
  for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
    const px = lo[0] + (hi[0] - lo[0]) * (i + 0.5) / GX, py = lo[1] + (hi[1] - lo[1]) * (j + 0.5) / GY;
    if (near.some((T) => inTri(px, py, T[0], T[1], T[2]))) cov++;
  }
  return { pct: 100 * cov / (GX * GY), size: [hi[0] - lo[0], hi[1] - lo[1]] };
}

test("the harness builds the dress and live quads, not just the shell", () => {
  const { GarageScene, meshes, warnings } = harness();
  GarageScene.draw(TEAM, LIV, [0, 1.6, 0], null, 0, { wins: 3, night: false });
  assert.deepEqual(warnings, [], "the atlas paint threw in the VM — the stubs no longer cover it");
  const { quads } = collect(meshes);
  assert.ok(quads.length >= 15, `only ${quads.length} wall quads — the dress or live group did not build`);
});

test("no wall sign has opaque geometry mounted over it within half a metre", () => {
  const { GarageScene, meshes } = harness();
  GarageScene.draw(TEAM, LIV, [0, 1.6, 0], null, 0, { wins: 3, night: false });
  const { quads, tris } = collect(meshes);
  const cut = [];
  for (const q of quads) {
    const { pct, size } = coverage(q, tris);
    if (pct > MAX_PCT)
      cut.push(`quad n=[${q.n}] at (${q.P[0].map((x) => x.toFixed(2))}) ${size[0].toFixed(2)}x${size[1].toFixed(2)} m: ${pct.toFixed(1)}% behind near geometry`);
  }
  assert.deepEqual(cut, [], "signs with something mounted in front of them:\n" + cut.join("\n"));
});
