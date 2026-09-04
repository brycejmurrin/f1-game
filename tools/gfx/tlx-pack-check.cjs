#!/usr/bin/env node
/* Apex 26 — does TLX's vertex-attribute packing change what the SHADER reads?
 * @doc Decodes packed TLX attributes and asserts no shader DECISION changed (material layer, flag branch, MAT id). No browser.
 *
 * tlx-chunked's packAttr quantises normals to Int16, and colours / MAT ids to
 * half-float, to cut the CPU copies three retains forever (measured 50 -> 28.6
 * MB on montreal; docs/PERF-FINDINGS.md 2m/2n). A screenshot is a poor gate for
 * that: cameras drift, countdowns advance, and two frames differ for a dozen
 * reasons that are not the change under test.
 *
 * So decode instead. This lifts the REAL packer out of the shipping file — not
 * a reimplementation, which would drift — feeds it the REAL attribute arrays
 * from a real track build, decodes what the GPU would read back, and checks the
 * three things tsl-lit actually DOES with `mat`:
 *
 *   line  989   surfaceId = floor(matA + 0.5)        material layer
 *   line 1526   isFlag    = matA >= 15 && matA < 16  flag branch
 *   line 1527   fw        = fract(matA) * 2.5        flag wave phase (real data)
 *
 * Zero error is the WRONG gate — MAT ids are not whole numbers (measured max
 * 15.4, the flag material carrying its wave phase in the fraction). "Same
 * decision" is the right one, and it is what fails here.
 *
 *   node tools/gfx/tlx-pack-check.cjs [track|--all]
 *
 * ANSWER (2026-09-02, all 40 circuits): 60.6 M normal/colour values and 20.2 M
 * MAT values decoded — 0 material layers changed, 0 flag branches flipped, 0
 * integer ids inexact. Normal max error 1.526e-5, colour 1.961e-3 (under the
 * 1/255 an 8-bit channel already quantises to), flag phase 1.563e-3.
 */
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = process.cwd();
const MANIFEST = require(path.join(ROOT, "tools/manifest.cjs"));

// --- the real packer, lifted out of the shipping file (not a reimplementation)
const chunkSrc = fs.readFileSync(path.join(ROOT, "js/render/three/tlx-chunked.js"), "utf8");
const grab = (re, what) => { const m = chunkSrc.match(re); if (!m) throw new Error("could not lift " + what); return m[0]; };
const packerSrc = [
  grab(/  const _fb = new Float32Array\(1\)[\s\S]*?\n  \}/, "_toHalf"),
  grab(/  let _zeroBuf = new Float32Array\(0\);[\s\S]*?\n  \}/, "_zeros"),
  grab(/  function packAttr\(THREE, src, len, itemSize, kind\) \{[\s\S]*?\n  \}/, "packAttr"),
  grab(/  function packIndex\(THREE, idx, vCount\) \{[\s\S]*?\n  \}/, "packIndex"),
].join("\n");
const packStats = { on: true, small: 0, wide: 0, zero: 0, savedMB: 0, half: 0,
                    wideBy: {}, wideMax: {}, wideLen: {} };
class BufferAttribute {
  constructor(array, itemSize, normalized) { this.array = array; this.itemSize = itemSize; this.normalized = !!normalized; }
}
class Float16BufferAttribute extends BufferAttribute {
  constructor(array, itemSize) { super(new Uint16Array(array), itemSize); this.isFloat16BufferAttribute = true; }
}
const THREE = { BufferAttribute, Float16BufferAttribute };
const packOn = true;
const sbx = { Float32Array, Uint16Array, Uint8Array, Int16Array, Uint32Array, Math, Infinity,
              packStats, packOn, THREE, module: {}, console };
vm.createContext(sbx);
vm.runInContext(packerSrc + "\n; this.packAttr = packAttr; this.packIndex = packIndex;", sbx);
const packAttr = sbx.packAttr, packIndex = sbx.packIndex;

// --- decode exactly what the GPU would read back
function decodeHalf(h) {
  const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff;
  if (e === 0) return s * m * Math.pow(2, -24);
  if (e === 31) return m ? NaN : s * Infinity;
  return s * (1 + m / 1024) * Math.pow(2, e - 15);
}
function decode(attr, i) {
  const a = attr.array;
  if (attr.isFloat16BufferAttribute) return decodeHalf(a[i]);
  if (a instanceof Int16Array) return attr.normalized ? Math.max(a[i] / 32767, -1) : a[i];
  if (a instanceof Uint8Array) return attr.normalized ? a[i] / 255 : a[i];
  return a[i];
}

// --- real geometry from a real build
const captured = [];
const GLX = {
  createMesh: (b) => cap("mesh", b), createTexMesh: (b) => cap("tex", b),
  createChunkedMesh: (b) => cap("chunked", b),
  createInstancedBatch: (g, m) => ({ verts: 0, instances: m ? m.length / 16 : 0, idxCount: 0 }),
  freeInstancedBatch: () => {},
};
function cap(kind, b) {
  if (b && b.pos) captured.push({ kind, verts: b.pos.length / 3, nrm: b.nrm, col: b.col, mat: b.mat, idx: b.idx });
  return { verts: b && b.pos ? b.pos.length / 3 : 0, idxCount: b && b.idx ? b.idx.length : 0 };
}
const sandbox = { Math, Array, Float32Array, Float64Array, Uint16Array, Uint32Array, Object, JSON,
  isNaN, isFinite, parseInt, parseFloat, GLX, console: new Proxy({}, { get: () => () => {} }) };
sandbox.window = sandbox;
const ctx = vm.createContext(sandbox);
const run = (rel) => { const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) throw new Error("missing VM file: " + rel);
  vm.runInContext(fs.readFileSync(p, "utf8").replace(/^const\b/gm, "var"), ctx, { filename: rel }); };
for (const f of MANIFEST.TRACK_VM) { if (f === "@circuits") { for (const c of MANIFEST.CIRCUITS) run(MANIFEST.circuitPath(c)); } else run(f); }
let scn = 0;
for (const c of MANIFEST.CIRCUITS) { const rel = MANIFEST.sceneryPath(c);
  if (fs.existsSync(path.join(ROOT, rel))) { run(rel); scn++; } }
if (!scn) { console.error("NO SCENERY — would measure a bare track"); process.exit(1); }
const Tracks = ctx.Tracks;
const arg = process.argv[2] || "montreal";
const ids = arg === "--all" ? (Tracks.LIST || []).map((d) => d.id) : [arg];
for (const one of ids) {
  const def = (Tracks.LIST || []).find((d) => d.id === one);
  if (!def) { console.error("no such track " + one); process.exit(1); }
  Tracks.build(def);
}
const id = ids.length > 1 ? ids.length + " circuits" : ids[0];
if (!captured.length) { console.error("BUILD PRODUCED NO MESHES"); process.exit(1); }

// --- worst-case error per attribute kind
const worst = {};
let checked = 0;
function check(name, kind, src, len) {
  if (!src || src.length !== len) return;
  const a = packAttr(THREE, src, len, 1, kind);
  const w = worst[name] || (worst[name] = { maxErr: 0, n: 0, quantised: 0, kept32: 0, at: null });
  w.n += len;
  const q = !(a.array instanceof Float32Array);
  if (q) w.quantised++; else { w.kept32++; return; }
  for (let i = 0; i < len; i++) {
    const e = Math.abs(decode(a, i) - src[i]);
    if (e > w.maxErr) { w.maxErr = e; w.at = src[i]; }
  }
  checked++;
}
for (const m of captured) {
  check("normal", "unit", m.nrm, m.verts * 3);
  check("color", "unorm", m.col, m.verts * 3);
  check("mat", "id", m.mat, m.verts);
}
console.log("track " + id + " — " + captured.length + " meshes, " + checked + " attribute arrays decoded\n");
console.log("attribute   arrays quantised / kept f32      values        max abs error   at value");
for (const k of Object.keys(worst)) {
  const w = worst[k];
  console.log(k.padEnd(11) + String(w.quantised).padStart(8) + " /" + String(w.kept32).padStart(9) +
    String(w.n).padStart(16) + "   " + w.maxErr.toExponential(3).padStart(12) +
    "   " + (w.at === null ? "-" : String(w.at).slice(0, 12)));
}
// MAT is not a plain integer index — tsl-lit reads it three ways, and each is
// a DECISION the packing must not change:
//   line  989  surfaceId = floor(matA + 0.5)      material layer
//   line 1526  isFlag    = matA >= 15 && matA < 16 flag branch
//   line 1527  fw        = fract(matA) * 2.5       flag wave phase (real data)
// So the gate is not "zero error", it is "same decision". Any flipped branch or
// changed layer is a fail; a shifted wave phase is reported as a magnitude.
let flips = 0, layerChanges = 0, maxPhase = 0, intInexact = 0;
for (const m of captured) {
  const len = m.verts, src = m.mat;
  if (!src || src.length !== len) continue;
  const a = packAttr(THREE, src, len, 1, "id");
  if (a.array instanceof Float32Array) continue;
  for (let i = 0; i < len; i++) {
    const o = src[i], d = decode(a, i);
    if (Math.floor(o + 0.5) !== Math.floor(d + 0.5)) layerChanges++;
    if (((o >= 15 && o < 16) ? 1 : 0) !== ((d >= 15 && d < 16) ? 1 : 0)) flips++;
    if ((o | 0) === o && d !== o) intInexact++;
    const ph = Math.abs((d - Math.floor(d)) - (o - Math.floor(o)));
    if (ph < 0.5 && ph > maxPhase) maxPhase = ph;
  }
}
console.log("\nMAT — what the SHADER decides, not what the bytes say:");
console.log("  material layer  floor(mat+0.5) changed : " + layerChanges);
console.log("  flag branch     15<=mat<16 flipped     : " + flips);
console.log("  integer ids     not exact after decode : " + intInexact);
console.log("  flag wave phase max shift              : " + maxPhase.toExponential(3));
if (layerChanges || flips || intInexact) {
  console.log("\nFAIL: packing changed a shader decision");
  process.exit(1);
}
// Indices narrow to Uint16 below 65536 verts. That is lossless only if the
// vertex count actually bounds every index — a wrapped index does not warn,
// it draws the wrong triangle. Check it rather than assert it.
let idxBad = 0, idxNarrowed = 0, idxVals = 0;
for (const m of captured) {
  if (!m.idx || !m.idx.length) continue;
  const a = packIndex(THREE, m.idx, m.verts);
  if (a.array instanceof Uint16Array) idxNarrowed++;
  idxVals += m.idx.length;
  for (let i = 0; i < m.idx.length; i++) if (a.array[i] !== m.idx[i]) { idxBad++; break; }
}
console.log("  index narrowed to Uint16               : " + idxNarrowed + " of " + captured.length +
            " meshes, " + idxVals + " values, " + idxBad + " altered");
if (idxBad) { console.log("\nFAIL: an index changed value when narrowed — geometry would draw wrong"); process.exit(1); }
console.log("\nPASS: every material layer, flag branch, integer id and index survives the round trip.");
