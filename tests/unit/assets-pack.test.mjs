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
// Run: node --test tests/unit/assets-pack.test.mjs   (npm run test:tooling)

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { seedLog } from "../helpers/seed-log.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
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
  seedLog(sandbox);
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

test("the baked-material knob is wired, and ON so the pack can contribute", () => {
  // Default is non-zero so a loaded pack actually reaches the shader. Safety
  // (no pack / bad pack / no createTextureArray → procedural look) lives in
  // js/render/assets.js, not in the knob staying at 0.
  const lighting = fs.readFileSync(path.join(ROOT, "js", "game", "lighting.js"), "utf8");
  const def = lighting.match(/\{ id: "matTexMix",[^}]*\}/);
  assert.ok(def, "matTexMix must exist in TUNE_DEFS");
  assert.match(def[0], /u: "uMatTexMix"/, "matTexMix must be wired to the uMatTexMix uniform");
  const d = def[0].match(/def:\s*([\d.]+)/);
  assert.ok(d, "matTexMix must declare a default");
  const v = parseFloat(d[1]);
  assert.ok(v > 0 && v <= 1, `matTexMix default ${v} must be in (0, 1]`);
  assert.match(def[0], /min: 0,/, "0 must stay reachable — it is the revert path if tarmac crawls");
});

test("bake-synthetic produces a dual-tier Apex26-Procedural pack with no network", () => {
  // The no-download rebuild path. Must write BOTH tiers, stamp every layer
  // Apex26-Procedural, and leave models/env alone — otherwise a synthetic
  // rebake would orphan committed Kenney bins and HDRI ambients.
  const os = require("node:os"), cp = require("node:child_process");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-synth-"));
  try {
    // Seed a fake prior pack so we can prove models/env survive the rewrite.
    fs.mkdirSync(path.join(dir, "models"), { recursive: true });
    fs.writeFileSync(path.join(dir, "models", "keep.bin"), Buffer.from("AX26"));
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
      version: 1,
      materials: null,
      models: { keep: { file: "models/keep.bin", licence: "CC0", author: "t", source: "t" } },
      env: { "*|day": { ambientSky: [0.3, 0.3, 0.4], ambientGround: [0.1, 0.1, 0.1],
                        licence: "CC0", author: "t", source: "t" } },
      credits: [],
    }));
    const r = cp.spawnSync(process.execPath,
      [path.join(ROOT, "tools", "assets.mjs"), "bake-synthetic"],
      { env: { ...process.env, APEX_PACK_DIR: dir }, encoding: "utf8" });
    assert.equal(r.status, 0, `bake-synthetic failed:\n${r.stdout}\n${r.stderr}`);
    const m = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
    assert.equal(m.materials.size, 256);
    assert.ok(m.materials.low && m.materials.low.size === 128, "default bake must include low 128");
    assert.ok(fs.existsSync(path.join(dir, m.materials.albedo)));
    assert.ok(fs.existsSync(path.join(dir, m.materials.low.albedo)));
    assert.ok(m.materials.layers.length >= 10, "expected the SCALES table layers");
    for (const L of m.materials.layers) {
      assert.equal(L.licence, "Apex26-Procedural", `${L.id} must be procedural`);
      assert.match(L.source, /^procedural:/);
    }
    assert.ok(m.models.keep, "bake-synthetic must preserve models");
    assert.ok(m.env["*|day"], "bake-synthetic must preserve env");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
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

test("the pack carries a mobile LOW variant", { skip: !hasPack && "no pack installed" }, () => {
  // js/render/assets.js picks materials.low on a phone and SILENTLY falls back
  // to the full-size strips when it is absent — no error, no warning, mobile
  // just quietly pays the desktop cost. That failure is invisible from the
  // desktop the pack was baked on, so it needs a test rather than a comment.
  const mats = manifest.materials;
  assert.ok(mats.low, "materials.low missing — mobile would load the full-size pack");
  assert.ok(mats.low.size < mats.size,
    `low size ${mats.low.size} must be smaller than ${mats.size}`);
  assert.ok(mats.low.albedo && mats.low.albedo !== mats.albedo, "low.albedo must be its own file");
  assert.deepEqual(
    (mats.low.layers || []).map((l) => l.mat).sort((a, b) => a - b),
    mats.layers.map((l) => l.mat).sort((a, b) => a - b),
    "low variant must cover the same MAT slots as the full one");
  const big = fs.statSync(path.join(PACK, mats.albedo)).size;
  const small = fs.statSync(path.join(PACK, mats.low.albedo)).size;
  assert.ok(small < big, `low albedo (${small}) should be smaller than full (${big})`);
});

test("every referenced file exists and the strip is the right height",
  { skip: !hasPack && "no pack installed" }, () => {
  const mats = manifest.materials;
  for (const f of [mats.albedo, mats.normal,
                   mats.low && mats.low.albedo, mats.low && mats.low.normal].filter(Boolean)) {
    const p = path.join(PACK, f);
    assert.ok(fs.existsSync(p), `missing ${f}`);
    // PNG signature + IHDR width/height, so a truncated or wrong-shaped
    // filmstrip fails here rather than as a silently-black layer in game.
    const b = fs.readFileSync(p);
    assert.deepEqual([...b.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], `${f} is not a PNG`);
    const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    // Each variant declares its own size; a strip must be square-per-layer and
    // exactly 17 layers tall whichever tier it belongs to.
    const expect = (mats.low && (f === mats.low.albedo || f === mats.low.normal)) ? mats.low.size : mats.size;
    assert.equal(w, expect, `${f} width ${w} != declared size ${expect}`);
    assert.equal(h, expect * 17,
      `${f} height ${h} != size*17 (${expect * 17}) — the filmstrip must have one slot per MAT id`);
  }
  for (const [id, rec] of Object.entries(manifest.models || {}))
    assert.ok(fs.existsSync(path.join(PACK, rec.file)), `model ${id}: missing ${rec.file}`);
});

test("pack stays inside the clone-time budget", { skip: !hasPack && "no pack installed" }, () => {
  let bytes = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      // `src/` is the author-time fetch cache (gitignored) — verify() already
      // ignores it; counting it here would fail every local bake-material run.
      if (e.name === "src") continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else bytes += fs.statSync(p).size;
    }
  };
  walk(PACK);
  assert.ok(bytes <= BUDGET_BYTES,
    `pack is ${(bytes / 1048576).toFixed(2)} MB, budget is ${(BUDGET_BYTES / 1048576).toFixed(0)} MB`);
});

test("bake-synthetic-models replaces Kenney bins with Apex26-Procedural AX26", () => {
  const os = require("node:os"), cp = require("node:child_process");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-synth-mdl-"));
  try {
    fs.mkdirSync(path.join(dir, "models"), { recursive: true });
    // Seed a fake Kenney bin that must be overwritten / removed if not in catalog.
    fs.writeFileSync(path.join(dir, "models", "kenney_construction-cone.bin"), Buffer.from("OLD"));
    fs.writeFileSync(path.join(dir, "models", "orphan_old.bin"), Buffer.from("ORPHAN"));
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
      version: 1, materials: null,
      models: {
        "kenney_construction-cone": {
          file: "models/kenney_construction-cone.bin", licence: "CC0",
          author: "Kenney", source: "kenney:x",
        },
        orphan_old: { file: "models/orphan_old.bin", licence: "CC0", author: "x", source: "x" },
      },
      env: {}, credits: [],
    }));
    const r = cp.spawnSync(process.execPath,
      [path.join(ROOT, "tools", "assets.mjs"), "bake-synthetic-models"],
      { env: { ...process.env, APEX_PACK_DIR: dir }, encoding: "utf8" });
    assert.equal(r.status, 0, `bake-synthetic-models failed:\n${r.stdout}\n${r.stderr}`);
    const m = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
    assert.ok(!m.models.orphan_old, "non-catalog models must be dropped");
    const cone = m.models["kenney_construction-cone"];
    assert.ok(cone, "catalog id must be present");
    assert.equal(cone.licence, "Apex26-Procedural");
    assert.match(cone.source, /^procedural:/);
    assert.ok(cone.verts >= 8, "cone must have geometry");
    const bin = fs.readFileSync(path.join(dir, cone.file));
    assert.equal(bin.toString("ascii", 0, 4), "AX26");
    assert.ok(!fs.existsSync(path.join(dir, "models", "orphan_old.bin")));
    // Spot-check a building id circuits actually place.
    assert.ok(m.models["kenney_ind_building-a"].verts > 50);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
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

test("bake-atlas slices a 4x4 sheet onto the named MAT layer", () => {
  const os = require("node:os");
  const cp = require("node:child_process");
  const zlib = require("node:zlib");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-atlas-"));
  try {
    const grid = 4, tile = 8, size = grid * tile;
    const rgba = Buffer.alloc(size * size * 4, 255);
    // Unique mid-grey-ish colour per cell so mean-normalise keeps the hue.
    for (let row = 0; row < grid; row++) {
      for (let col = 0; col < grid; col++) {
        const r = 80 + col * 24, g = 80 + row * 24, b = 140;
        for (let y = 0; y < tile; y++) {
          for (let x = 0; x < tile; x++) {
            const o = ((row * tile + y) * size + col * tile + x) * 4;
            rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255;
          }
        }
      }
    }
    const crcTable = (() => {
      const t = new Int32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c;
      }
      return t;
    })();
    const crc32 = (buf) => {
      let c = -1;
      for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
      return (c ^ -1) >>> 0;
    };
    const chunk = (type, data) => {
      const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
      const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
      const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
      return Buffer.concat([len, body, crc]);
    };
    const raw = Buffer.alloc((size * 4 + 1) * size);
    for (let y = 0; y < size; y++) {
      raw[y * (size * 4 + 1)] = 0;
      rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8; ihdr[9] = 6;
    const atlas = path.join(dir, "atlas.png");
    fs.writeFileSync(atlas, Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
      chunk("IEND", Buffer.alloc(0)),
    ]));

    const r = cp.spawnSync(process.execPath, [
      path.join(ROOT, "tools", "assets.mjs"), "bake-atlas",
      "--albedo", atlas, "--grid", "4", "--inset", "0",
      "--size", "8", "--low", "0", "--map", "BRICK=1,0",
    ], { env: { ...process.env, APEX_PACK_DIR: dir }, encoding: "utf8" });
    assert.equal(r.status, 0, `bake-atlas failed:\n${r.stdout}\n${r.stderr}`);

    const png = fs.readFileSync(path.join(dir, "mat-albedo-8.png"));
    assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
    const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
    assert.equal(w, 8);
    assert.equal(h, 8 * 17);
    const man = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
    const brick = man.materials.layers.find((L) => L.id === "brick");
    assert.ok(brick, "BRICK layer missing from manifest");
    assert.equal(brick.mat, 2);
    assert.equal(brick.licence, "Apex26-Procedural");
    assert.match(brick.source, /generated:.*#1,0/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("TrackGeom.addMesh transforms a baked model correctly", () => {
  // The placement maths for baked props. Getting the yaw sign or the normal
  // rotation wrong produces geometry that is *present and finite* — so
  // verify-track passes and nothing complains — while every model faces the
  // wrong way. Pin it with an exact 90 degree case.
  const vm = require("node:vm");
  const sandbox = { Math, Array, Float32Array, Object, JSON, console };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  seedLog(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "track", "geom.js"), "utf8")
    .replace(/^const\b/gm, "var"), sandbox, { filename: "geom.js" });
  const G = sandbox.TrackGeom;
  assert.equal(typeof G.addMesh, "function");

  const mesh = {
    pos: [1, 0, 0, 0, 0, 1, 0, 2, 0],
    nrm: [1, 0, 0, 0, 0, 1, 0, 1, 0],
    col: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    mat: [16, 16, 16],
    idx: [0, 1, 2],
  };
  const out = { pos: [], nrm: [], col: [], mat: [], idx: [], _mat: 0 };
  // Seed one existing vertex so the index rebase is actually exercised.
  out.pos.push(0, 0, 0); out.nrm.push(0, 1, 0); out.col.push(1, 1, 1); out.mat.push(0);

  assert.equal(G.addMesh(out, mesh, { x: 10, y: 5, z: -2, rotY: Math.PI / 2, scale: 2 }), true);
  // rotY = +90 deg maps local +X to world -Z (x*cos + z*sin, -x*sin + z*cos).
  const p0 = out.pos.slice(3, 6);
  assert.ok(Math.abs(p0[0] - 10) < 1e-6, `x: ${p0[0]}`);
  assert.ok(Math.abs(p0[1] - 5) < 1e-6, `y: ${p0[1]}`);
  assert.ok(Math.abs(p0[2] - (-4)) < 1e-6, `z: ${p0[2]} (local +X*2 should land at -2 relative)`);
  // Normals rotate but must NOT pick up the scale or the translation.
  const n0 = out.nrm.slice(3, 6);
  assert.ok(Math.abs(Math.hypot(n0[0], n0[1], n0[2]) - 1) < 1e-6, "normal must stay unit length");
  // Indices rebased past the pre-existing vertex.
  assert.deepEqual(out.idx, [1, 2, 3]);
  // Baked per-vertex MAT ids survive.
  assert.deepEqual(out.mat.slice(1), [16, 16, 16]);

  // opts.mat overrides the baked ids; opts.tint multiplies the baked colour.
  const out2 = { pos: [], nrm: [], col: [], mat: [], idx: [], _mat: 0 };
  G.addMesh(out2, mesh, { mat: 1, tint: [2, 1, 0] });
  assert.deepEqual(out2.mat, [1, 1, 1]);
  assert.deepEqual(out2.col.slice(0, 3), [1, 0.5, 0]);

  // Junk in, nothing out — never a partially-written accumulator.
  const out3 = { pos: [], nrm: [], col: [], mat: [], idx: [], _mat: 0 };
  assert.equal(G.addMesh(out3, mesh, { x: NaN }), false);
  assert.equal(G.addMesh(out3, null, {}), false);
  assert.equal(out3.pos.length, 0, "a rejected placement must emit no vertices");
});

test("webbake toGLB re-packs .gltf + .bin into something gltf.js accepts", () => {
  // The browser baker's one genuinely novel piece. js/render/gltf.js is GLB-only
  // and refuses external .bin URIs, while Poly Haven ships .gltf with a sidecar
  // .bin — so toGLB() bridges them. A bug here surfaces at runtime as an opaque
  // "malformed GLB", far from its cause, so it is pinned by round-tripping a
  // real pair through the game's OWN loader.
  const vm = require("node:vm");
  const load = (rel, sandbox) => {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/^const\b/gm, "var");
    vm.runInContext(src, sandbox, { filename: rel });
  };
  const sandbox = {
    Math, Array, Object, JSON, Uint8Array, Uint16Array, Uint32Array, Int16Array,
    Float32Array, DataView, ArrayBuffer, TextEncoder, TextDecoder, Promise, Error, console,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  seedLog(sandbox);
  load("js/render/gltf.js", sandbox);
  load("assets/pack/webbake.js", sandbox);
  assert.equal(typeof sandbox.WebBake.toGLB, "function");

  // A .gltf + sidecar .bin in Poly Haven's shape: external buffer uri, a
  // texture reference that cannot survive, and a baseColorFactor that must.
  const pos = new Float32Array([0, 0, 0, 2, 0, 0, 0, 3, 0]);
  const idx = new Uint16Array([0, 1, 2, 0]);            // padded to 4 bytes
  const bin = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(idx.buffer)]);
  const gltf = {
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    images: [{ uri: "textures/diff.jpg" }],
    textures: [{ source: 0 }],
    materials: [{ pbrMetallicRoughness: {
      baseColorFactor: [0.25, 0.5, 0.75, 1], baseColorTexture: { index: 0 } } }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [2, 3, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 6 },
    ],
    buffers: [{ uri: "model.bin", byteLength: bin.length }],
  };

  const glb = sandbox.WebBake.toGLB(gltf, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
  const dv = new DataView(glb);
  assert.equal(dv.getUint32(0, true), 0x46546c67, "GLB magic");
  assert.equal(dv.getUint32(4, true), 2, "GLB version");
  assert.equal(dv.getUint32(8, true), glb.byteLength, "declared length matches actual");
  assert.equal(glb.byteLength % 4, 0, "GLB must stay 4-byte aligned");

  // The real proof: the game's own loader accepts it and produces usable geometry.
  const mesh = sandbox.GLTF.toMesh(glb, { scale: 1 });
  assert.equal(mesh.pos.length / 3, 3, "three vertices survived");
  assert.deepEqual([...mesh.idx], [0, 1, 2]);
  assert.deepEqual([...mesh.pos].slice(0, 6), [0, 0, 0, 2, 0, 0]);
  // baseColorFactor must survive the texture strip — it is all the colour an
  // imported model has once its textures are dropped.
  assert.ok(Math.abs(mesh.col[0] - 0.25) < 0.01 && Math.abs(mesh.col[1] - 0.5) < 0.01,
    `baseColorFactor lost: ${[...mesh.col].slice(0, 3)}`);
});

test("webbake writes a ZIP that real unzip accepts", () => {
  // The browser baker hands its output back as a single archive, written by a
  // ~40-line STORE-method ZIP encoder with no library behind it. A wrong CRC or
  // a bad central-directory offset produces a file that *looks* fine and fails
  // only when someone tries to open it — so this checks it against the system
  // unzip rather than against my own reader.
  const os = require("node:os"), cp = require("node:child_process"), vm = require("node:vm");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-zip-"));
  try {
    const sandbox = {
      Math, Array, Object, JSON, Uint8Array, Uint16Array, Uint32Array, Int32Array,
      Float32Array, DataView, ArrayBuffer, TextEncoder, TextDecoder, Promise, Error, console, Blob,
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    seedLog(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, "assets", "pack", "webbake.js"), "utf8")
      .replace(/^const\b/gm, "var"), sandbox, { filename: "webbake.js" });

    const enc = new TextEncoder();
    const payload = '{"version":1,"materials":{"size":512}}\n';
    const blob = sandbox.WebBake.zip([
      { name: "manifest.json", data: enc.encode(payload) },
      { name: "CREDITS.md", data: enc.encode("# Asset credits\n\nPowered by Poly Haven.\n") },
      { name: "mat-albedo-512.png", data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 1, 2, 3]) },
    ]);
    const zipPath = path.join(dir, "pack.zip");
    return blob.arrayBuffer().then((ab) => {
      fs.writeFileSync(zipPath, Buffer.from(ab));
      const t = cp.spawnSync("unzip", ["-t", zipPath], { encoding: "utf8" });
      if (t.error && t.error.code === "ENOENT") return;          // no unzip on this box
      assert.equal(t.status, 0, `unzip -t rejected the archive:\n${t.stdout}${t.stderr}`);
      const got = cp.spawnSync("unzip", ["-p", zipPath, "manifest.json"], { encoding: "utf8" });
      assert.equal(got.status, 0, "could not extract manifest.json");
      assert.equal(got.stdout, payload, "extracted content does not match what went in");
    });
  } finally {
    // rmSync is safe to schedule now: the promise above only reads from `dir`
    // via a spawned process that has already exited by the time it resolves.
    process.on("exit", () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} });
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
