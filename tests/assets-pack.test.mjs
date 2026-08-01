// assets-pack.test.mjs — guards the baked asset pack (assets/pack/) and the
// contract between it, the bake tool and the shader.
//
// The three things that can silently rot here:
//   1. The bake tool's MAT table drifting from TrackGeom.MAT, which would
//      texture the wrong surfaces with nobody noticing (a stone wall shaded as
//      foliage still *renders*).
//   2. A licence or an untraceable source sneaking into a committed pack.
//   3. The pack quietly growing past the clone-time budget.
//
// Run: node --test tests/assets-pack.test.mjs   (npm run test:tooling)

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACK = path.join(ROOT, "assets", "pack");
const MANIFEST = path.join(PACK, "manifest.json");
const BUDGET_BYTES = 8 * 1024 * 1024;         // must match tools/assets.mjs
const ALLOWED = new Set(["CC0", "CC0-1.0", "Apex26-Procedural"]);

const TOOL_SRC = fs.readFileSync(path.join(ROOT, "tools", "assets.mjs"), "utf8");
const hasPack = fs.existsSync(MANIFEST);
const manifest = hasPack ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : null;

// TrackGeom.MAT, read out of the REAL module rather than a copy. geom.js is
// documented as loading under a bare VM sandbox (it is stateless and
// renderer-free), so this is the actual shipping table, not a transcription.
function realMAT() {
  const vm = require("node:vm");
  const src = fs.readFileSync(path.join(ROOT, "js", "track", "geom.js"), "utf8");
  const sandbox = { Math, Array, Float32Array, Object, JSON, console };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  // Top-level `const` is block-scoped inside a VM and never lands on the
  // sandbox — the same rewrite tools/verify-track.cjs uses.
  vm.runInContext(src.replace(/^const\b/gm, "var"), sandbox, { filename: "geom.js" });
  const G = sandbox.TrackGeom;
  assert.ok(G && G.MAT, "TrackGeom.MAT not reachable from the VM sandbox");
  // Copy into a THIS-realm object: a VM object carries the sandbox's
  // Object.prototype, which deepStrictEqual treats as a mismatch even when
  // every key and value is identical.
  return { ...G.MAT };
}

test("bake tool's MAT table matches TrackGeom.MAT exactly", () => {
  const real = realMAT();
  // The tool declares its own copy because it must run without the game's
  // load order; this is the assertion that keeps the copy honest.
  const block = TOOL_SRC.match(/const MAT = \{([\s\S]*?)\};/);
  assert.ok(block, "could not find the MAT table in tools/assets.mjs");
  const tool = {};
  for (const m of block[1].matchAll(/(\w+):\s*(\d+)/g)) tool[m[1]] = Number(m[2]);
  assert.deepEqual(tool, real, "tools/assets.mjs MAT has drifted from js/track/geom.js");
});

test("GLASS and FLAG are never given a baked layer", () => {
  const real = realMAT();
  const block = TOOL_SRC.match(/const SCALES = \{([\s\S]*?)\};/);
  assert.ok(block, "could not find the SCALES table in tools/assets.mjs");
  const ids = [...block[1].matchAll(/MAT\.(\w+)\]/g)].map((m) => m[1]);
  // GLASS: a baked albedo would blur the mirror reflection read.
  // FLAG: geometry is displaced in the vertex shader off fract(aMat).
  // FLAT: the "no material" id by definition.
  for (const forbidden of ["GLASS", "FLAG", "FLAT"])
    assert.ok(!ids.includes(forbidden), `MAT.${forbidden} must not have a baked layer`);
  assert.ok(ids.includes("ASPHALT"), "ASPHALT must have a baked layer — it is the surface on screen all race");
  assert.ok(ids.length >= 10, `expected >= 10 baked materials, got ${ids.length}`);
  assert.ok(real.ASPHALT === 16, "ASPHALT must stay above the FLAG 15.0..16.0 fractional window");
});

test("the shader's layer count matches the MAT table size", () => {
  const lit = fs.readFileSync(path.join(ROOT, "js", "render", "shaders", "lit.js"), "utf8");
  assert.match(lit, /uniform float uMatTexScale\[17\];/,
    "lit.js uMatTexScale must be sized for all 17 MAT ids (FLAT..ASPHALT)");
  const glx = fs.readFileSync(path.join(ROOT, "js", "render", "glx.js"), "utf8");
  assert.match(glx, /MAT_TEX_LAYERS = 17/, "glx.js MAT_TEX_LAYERS must be 17");
  const assets = fs.readFileSync(path.join(ROOT, "js", "render", "assets.js"), "utf8");
  assert.match(assets, /MAT_LAYERS = 17/, "assets.js MAT_LAYERS must be 17");
});

test("shader sources parse as JS (no stray backticks in GLSL comments)", () => {
  // The GLSL lives inside JS template literals, so a backtick anywhere in a
  // shader comment silently terminates the string. The failure mode is brutal
  // and completely non-obvious: the program fails to link, GLX.init() returns
  // false, the page shows "needs WebGL2", and every browser test dies on
  // `waitForFunction(() => !!window.__apex)` with a bare 30 s timeout that says
  // nothing about shaders. One cheap parse catches it in milliseconds.
  const cp = require("node:child_process");
  for (const f of ["js/render/shaders/lit.js", "js/render/shaders/chunks.js",
                   "js/render/shaders/sky.js", "js/render/shaders/fx.js",
                   "js/render/shaders/post.js"]) {
    const r = cp.spawnSync(process.execPath, ["--check", path.join(ROOT, f)], { encoding: "utf8" });
    assert.equal(r.status, 0, `${f} does not parse as JS:\n${r.stderr}`);
  }
});

test("the baked-material knob ships OFF", () => {
  const lighting = fs.readFileSync(path.join(ROOT, "js", "game", "lighting.js"), "utf8");
  const def = lighting.match(/\{ id: "matTexMix",[^}]*\}/);
  assert.ok(def, "matTexMix must exist in TUNE_DEFS");
  assert.match(def[0], /def: 0(\.0)?\s*,/,
    "matTexMix must ship at 0 — a pack must never change the render until asked");
  assert.match(def[0], /u: "uMatTexMix"/, "matTexMix must be wired to the uMatTexMix uniform");
});

test("pack manifest is well-formed", { skip: !hasPack && "no pack installed" }, () => {
  assert.equal(manifest.version, 1);
  const mats = manifest.materials;
  assert.ok(mats, "manifest has no materials block");
  assert.ok(mats.size >= 8 && (mats.size & (mats.size - 1)) === 0,
    `material size ${mats.size} must be a power of two >= 8`);
  assert.ok(mats.albedo, "materials.albedo is required");

  const seen = new Set();
  for (const L of mats.layers) {
    assert.ok(L.mat >= 1 && L.mat <= 16, `layer ${L.id}: mat ${L.mat} outside 1..16`);
    assert.ok(!seen.has(L.mat), `layer ${L.id}: duplicate mat id ${L.mat}`);
    seen.add(L.mat);
    assert.ok(L.scale > 0, `layer ${L.id}: scale must be > 0`);
    assert.ok(ALLOWED.has(L.licence), `layer ${L.id}: licence "${L.licence}" not allow-listed`);
    assert.ok(L.source, `layer ${L.id}: every asset must record a source`);
  }
});

test("every referenced file exists and the strip is the right height",
  { skip: !hasPack && "no pack installed" }, () => {
  const mats = manifest.materials;
  for (const f of [mats.albedo, mats.normal].filter(Boolean)) {
    const p = path.join(PACK, f);
    assert.ok(fs.existsSync(p), `missing ${f}`);
    // PNG signature + IHDR width/height, so a truncated or wrong-shaped
    // filmstrip fails here rather than as a silently-black layer in game.
    const b = fs.readFileSync(p);
    assert.deepEqual([...b.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], `${f} is not a PNG`);
    const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    assert.equal(w, mats.size, `${f} width ${w} != manifest size ${mats.size}`);
    assert.equal(h, mats.size * 17,
      `${f} height ${h} != size*17 (${mats.size * 17}) — the filmstrip must have one slot per MAT id`);
  }
  for (const [id, rec] of Object.entries(manifest.models || {}))
    assert.ok(fs.existsSync(path.join(PACK, rec.file)), `model ${id}: missing ${rec.file}`);
});

test("pack stays inside the clone-time budget", { skip: !hasPack && "no pack installed" }, () => {
  let bytes = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else bytes += fs.statSync(p).size;
    }
  };
  walk(PACK);
  assert.ok(bytes <= BUDGET_BYTES,
    `pack is ${(bytes / 1048576).toFixed(2)} MB, budget is ${(BUDGET_BYTES / 1048576).toFixed(0)} MB`);
});

test("bake-model round-trips glTF into the game's own vertex format", () => {
  // Exercises the whole model path — the real js/render/gltf.js reader in a VM,
  // the MAT stamping, the AX26 writer — against a hand-built single-triangle
  // .glb. Without this the bake-model command is untested code that would only
  // fail the first time somebody reached for it.
  const os = require("node:os");
  const cp = require("node:child_process");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-pack-"));
  try {
    const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const nrm = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    const idx = new Uint16Array([0, 1, 2, 0]);           // padded to 4-byte alignment
    const bin = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(nrm.buffer), Buffer.from(idx.buffer)]);
    const json = {
      asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
      materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.8, 0.3, 0.2, 1] } }],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
        { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
        { bufferView: 2, componentType: 5123, count: 3, type: "SCALAR" },
      ],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 36 },
        { buffer: 0, byteOffset: 36, byteLength: 36 },
        { buffer: 0, byteOffset: 72, byteLength: 6 },
      ],
      buffers: [{ byteLength: bin.length }],
    };
    let jb = Buffer.from(JSON.stringify(json), "utf8");
    while (jb.length % 4) jb = Buffer.concat([jb, Buffer.from(" ")]);
    const chunk = (type, data) => {
      const h = Buffer.alloc(8);
      h.writeUInt32LE(data.length, 0); h.writeUInt32LE(type, 4);
      return Buffer.concat([h, data]);
    };
    const jc = chunk(0x4e4f534a, jb), bc = chunk(0x004e4942, bin);
    const head = Buffer.alloc(12);
    head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4);
    head.writeUInt32LE(12 + jc.length + bc.length, 8);
    const glb = path.join(dir, "tri.glb");
    fs.writeFileSync(glb, Buffer.concat([head, jc, bc]));

    const r = cp.spawnSync(process.execPath,
      [path.join(ROOT, "tools", "assets.mjs"), "bake-model", "tri", glb, "--mat", "CONCRETE"],
      { env: { ...process.env, APEX_PACK_DIR: dir }, encoding: "utf8" });
    assert.equal(r.status, 0, `bake-model failed: ${r.stderr || r.stdout}`);

    // Parse it exactly the way js/render/assets.js _parseModel does.
    const b = fs.readFileSync(path.join(dir, "models", "tri.bin"));
    const buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    const dv = new DataView(buf);
    assert.equal(String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)), "AX26");
    assert.equal(dv.getUint32(4, true), 1, "format version");
    const nv = dv.getUint32(8, true), ni = dv.getUint32(12, true);
    assert.equal(nv, 3); assert.equal(ni, 3);
    let o = 20;
    const outPos = new Float32Array(buf, o, nv * 3); o += nv * 12;
    o += nv * 12;                                            // normals
    const outCol = new Float32Array(buf, o, nv * 3); o += nv * 12;
    const outMat = new Float32Array(buf, o, nv); o += nv * 4;
    const outIdx = new Uint32Array(buf, o, ni);
    assert.deepEqual([...outPos], [0, 0, 0, 1, 0, 0, 0, 1, 0]);
    assert.deepEqual([...outIdx], [0, 1, 2]);
    // Every vertex carries the MAT id the author asked for — that is what makes
    // the baked material array reach imported geometry at all.
    assert.deepEqual([...outMat], [1, 1, 1], "MAT.CONCRETE stamped per vertex");
    // glTF baseColorFactor became vertex colour, since the lit path has no UVs.
    assert.ok(Math.abs(outCol[0] - 0.8) < 0.01 && Math.abs(outCol[1] - 0.3) < 0.01,
      `baseColorFactor lost: got ${[...outCol].slice(0, 3)}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("credits cover every asset in the pack", { skip: !hasPack && "no pack installed" }, () => {
  const credits = manifest.credits || [];
  const ids = new Set(credits.map((c) => `${c.kind}:${c.id}`));
  for (const L of manifest.materials.layers)
    assert.ok(ids.has(`material:${L.id}`), `no credit entry for material ${L.id}`);
  for (const id of Object.keys(manifest.models || {}))
    assert.ok(ids.has(`model:${id}`), `no credit entry for model ${id}`);
  for (const c of credits) {
    assert.ok(ALLOWED.has(c.licence), `credit ${c.id}: licence "${c.licence}" not allow-listed`);
    assert.ok(c.source, `credit ${c.id}: no source recorded`);
  }
  assert.ok(fs.existsSync(path.join(PACK, "CREDITS.md")),
    "assets/pack/CREDITS.md missing — run `node tools/assets.mjs credits`");
});
