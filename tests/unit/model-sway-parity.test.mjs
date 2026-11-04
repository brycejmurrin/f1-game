/* model-sway-parity.test.mjs — AX26 v3 sway stream matches procedural FOLIAGE weights.
 *
 * Procedural crowns store wind as mat = FOLIAGE + w×SWAY_FRAC (TrackGeom.swayMatAt).
 * AX26 v2 drops the fraction (u8 mat). v3 keeps a trailing u8 sway stream and
 * rebuilds the same mat in _parseModel / pack-assets.parseModel.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { readAX26, ax26Version } from "../helpers/ax26.mjs";

const require = createRequire(import.meta.url);
const { writeAX26v3, parseModel, SWAY_FRAC } = require("../../tools/lib/pack-assets.cjs");

const MAT_FOLIAGE = 6;

function crownMesh() {
  // Four verts spanning the sway range the way nature.js crowns do.
  const pos = new Float32Array([
    0, 0, 0,
    0, 2, 0,
    0, 4, 0,
    0, 6, 0,
  ]);
  const nrm = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
  const col = new Float32Array([0.2, 0.5, 0.2, 0.2, 0.5, 0.2, 0.2, 0.5, 0.2, 0.2, 0.5, 0.2]);
  const weights = [0, 0.33, 0.67, 1];
  const mat = new Float32Array(weights.map((w) => MAT_FOLIAGE + w * SWAY_FRAC));
  const sway = new Float32Array(weights);
  const idx = new Uint32Array([0, 1, 2, 0, 2, 3]);
  return { pos, nrm, col, mat, sway, idx, weights };
}

test("TrackGeom SWAY_FRAC matches the pack-assets / reader constant", () => {
  // Load the game constant the same way track-build-vm does — via the IIFE.
  const geomSrc = fs.readFileSync(new URL("../../js/track/core/geom.js", import.meta.url), "utf8");
  const m = geomSrc.match(/const SWAY_FRAC = ([0-9.]+)/);
  assert.ok(m, "TrackGeom.SWAY_FRAC literal");
  assert.equal(Number(m[1]), SWAY_FRAC);
});

test("v3 round-trip restores procedural crown sway weights", async () => {
  const mesh = crownMesh();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-sway-"));
  try {
    const p = path.join(dir, "crown.bin");
    const buf = writeAX26v3(mesh);
    fs.writeFileSync(p, buf);
    const head = ax26Version(p);
    assert.equal(head.version, 3);
    assert.equal(head.verts, 4);

    const viaGame = await readAX26(p);
    assert.ok(viaGame, "game reader rejected v3");
    const viaNode = parseModel(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    assert.ok(viaNode);

    for (let i = 0; i < 4; i++) {
      const expected = MAT_FOLIAGE + mesh.weights[i] * SWAY_FRAC;
      // u8 sway quantisation: at most half a step in weight space.
      const tol = (0.5 / 255) * SWAY_FRAC + 1e-9;
      assert.ok(Math.abs(viaGame.mat[i] - expected) <= tol,
        `game mat[${i}]=${viaGame.mat[i]} expected ~${expected}`);
      assert.ok(Math.abs(viaNode.mat[i] - expected) <= tol,
        `node mat[${i}]=${viaNode.mat[i]} expected ~${expected}`);
      assert.equal(Math.floor(viaGame.mat[i] + 1e-6), MAT_FOLIAGE);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("v2 files still decode without a sway stream", async () => {
  // A minimal v2 buffer: header + 3 verts + 3 indices, no sway bytes.
  const nv = 3, ni = 3;
  const head = Buffer.alloc(20);
  head.write("AX26", 0, "ascii");
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(nv, 8);
  head.writeUInt32LE(ni, 12);
  const pos = Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
  const qn = Buffer.from(new Int16Array([0, 32767, 0, 0, 32767, 0, 0, 32767, 0]).buffer);
  const qc = Buffer.from(new Uint8Array([200, 200, 200, 200, 200, 200, 200, 200, 200]));
  const qm = Buffer.from(new Uint8Array([1, 1, 1]));
  const idx = Buffer.from(new Uint16Array([0, 1, 2]).buffer);
  const buf = Buffer.concat([head, pos, qn, qc, qm, idx]);
  const geo = parseModel(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  assert.ok(geo);
  assert.equal(geo.mat[0], 1);
  assert.equal(geo.idx.length, 3);
});

// ── Per-vertex wind detail (#1620): stiffness / branch phase / leaf flutter ──
// The three shaders carry the same constants; pin them textually, then prove
// the reference maths varies across a crown (the issue's "done when").
const read = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8");
const GLX = read("js/render/glx/shaders/glsl-lit.js");
const TLX = read("js/render/three/tsl-lit.js");
const WGX = read("js/render/webgpu/wgsl-chunks.js");

test("wind detail constants are identical on GLX, TLX and WGX", () => {
  assert.match(GLX, /\(aCol\.g - aCol\.r\) \* 5\.0/);
  assert.match(TLX, /colA\.g\.sub\(colA\.r\)\.mul\(5\.0\)/);
  assert.match(WGX, /\(aCol\.g - aCol\.r\) \* 5\.0/);
  for (const [name, src] of [["GLX", GLX], ["WGX", WGX]]) {
    assert.match(src, /sin\(wp\.y \* 1\.9 \+ wp\.x \* 0\.8\) \+ sin\(wp\.z \* 1\.4 - wp\.y \* 1\.1\)/, name + " branch phase");
    assert.match(src, /0\.55 \+ 0\.45 \* leaf/, name + " stiffness");
    assert.match(src, /bph \* 0\.9 \* w/, name + " gust phase");
    assert.match(src, /bph \* 2\.0/, name + " flutter phase");
  }
  assert.match(TLX, /p\.y\.mul\(1\.9\)\.add\(p\.x\.mul\(0\.8\)\)/);
  assert.match(TLX, /leaf\.mul\(0\.45\)\.add\(0\.55\)/);
  assert.match(TLX, /bph\.mul\(0\.9\)\.mul\(w\)/);
  assert.match(TLX, /bph\.mul\(2\.0\)/);
  assert.match(WGX, /wind\s*:\s*vec4<f32>/);
});

function sway(det, x, y, z, col, w, t = 1.7, spd = 1) {
  const leaf = Math.min(1, Math.max(0, (col[1] - col[0]) * 5));
  const bph = (Math.sin(y * 1.9 + x * 0.8) + Math.sin(z * 1.4 - y * 1.1)) * 0.5;
  const stiff = 1 + (0.55 + 0.45 * leaf - 1) * det;
  const wx = 0.819, wz = 0.574;
  const along = x * wx + z * wz;
  const gust = t * (spd * 1.1 + 0.6) - along * 0.07 + bph * 0.9 * w * det;
  const bend = Math.sin(gust) * 0.55 + Math.sin(gust * 2.31 + along * 0.19 + 1.7) * 0.25 + 0.45;
  return bend * spd * 0.32 * w * w * stiff;
}

test("detail on: sway amplitude varies across a crown at equal height; off: it does not", () => {
  const bark = [0.35, 0.22, 0.12], leaf = [0.18, 0.42, 0.16];
  const spread = (det) => {
    const a = [];
    for (let i = 0; i < 24; i++) a.push(sway(det, i * 0.9, 5, i * 0.7, i % 2 ? leaf : bark, 0.8));
    return Math.max(...a) - Math.min(...a);
  };
  assert.ok(spread(1) > 0.03, "detail on varies per vertex");
  // legacy path: the offset differs only through the world-x/z gust term, never through colour
  assert.equal(sway(0, 3, 5, 2, bark, 0.8), sway(0, 3, 5, 2, leaf, 0.8), "legacy ignores colour");
  assert.notEqual(sway(1, 3, 5, 2, bark, 0.8), sway(1, 3, 5, 2, leaf, 0.8), "detail sees stiffness");
  assert.equal(sway(1, 3, 0, 2, leaf, 0), 0, "the foot (w=0) stays planted");
});
