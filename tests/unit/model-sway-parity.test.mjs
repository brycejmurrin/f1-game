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
