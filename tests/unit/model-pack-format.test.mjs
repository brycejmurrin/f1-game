/* model-pack-format.test.mjs — the AX26 v2 packed model layout.
 *
 * Every model in assets/pack/models is fetched at boot (Assets.loadModels(),
 * called from js/game.js), so their total IS first-load latency. v2 packs a
 * vertex into 22 bytes against v1's 40 and an index into 2 against 4, taking
 * the shipped catalogue from 2.95 MB to 1.60 MB.
 *
 * That is only safe because of what the models actually contain, so this suite
 * checks the claim rather than the arithmetic:
 *
 *   1. the shipped pack really is v2 — a silent fall back to v1 would give the
 *      bytes back and nothing else would notice;
 *   2. what MUST be exact is exact: positions, indices, material ids;
 *   3. what is quantised stays inside the stated bound: colour within one
 *      8-bit display step, normals within a hundredth of a degree;
 *   4. the writer FALLS BACK to v1 for a mesh v2 cannot hold, instead of
 *      wrapping an emissive colour or truncating a material id;
 *   5. the reader still reads v1, so an older pack is not bricked.
 *
 * Everything is read back through the game's own reader (tests/helpers/ax26.mjs)
 * — a second parser here would only prove itself.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import crypto from "node:crypto";
import { readAX26, ax26Version } from "../helpers/ax26.mjs";
import { writeAX26 } from "../../tools/gen/assets.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PACK = path.join(ROOT, "assets", "pack");
const MANIFEST = path.join(PACK, "manifest.json");
const hasPack = fs.existsSync(MANIFEST);
const manifest = hasPack ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : { models: {} };
const modelIds = Object.keys(manifest.models || {});

// A mesh the packed layout can hold: unit normals, colour in [0,1], whole
// material ids, few enough vertices for a u16 index.
function tidyMesh(n = 4) {
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
  const col = new Float32Array(n * 3), mat = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = i * 1.5; pos[i * 3 + 1] = i * 0.25; pos[i * 3 + 2] = -i;
    nrm[i * 3 + 1] = 1;
    col[i * 3] = 0.8; col[i * 3 + 1] = 0.3; col[i * 3 + 2] = 0.1;
    mat[i] = 1 + (i % 5);
  }
  return { pos, nrm, col, mat, idx: new Uint32Array([0, 1, 2, 0, 2, 3].slice(0, Math.max(3, (n - 2) * 3))) };
}

async function roundTrip(mesh, matName) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-ax26-"));
  try {
    const p = path.join(dir, "m.bin");
    fs.writeFileSync(p, writeAX26(mesh, matName === undefined ? "CONCRETE" : matName));
    return { head: ax26Version(p), geo: await readAX26(p) };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("every shipped model is written in the packed v2 layout",
  { skip: !hasPack && "no pack installed" }, () => {
    assert.ok(modelIds.length > 0, "the manifest lists no models");
    const v1 = [];
    for (const id of modelIds) {
      const h = ax26Version(path.join(PACK, manifest.models[id].file));
      if (h.version !== 2) v1.push(`${id} (v${h.version}, ${h.verts} verts)`);
    }
    // A fall back is legitimate for a mesh v2 cannot hold — but no model in the
    // procedural catalogue is one, so a v1 file here means the writer regressed.
    assert.deepEqual(v1, [], "these shipped models fell back to the fat v1 layout");
  });

test("the packed pack is materially smaller than the layout it replaced",
  { skip: !hasPack && "no pack installed" }, () => {
    let bytes = 0, verts = 0, indices = 0;
    for (const id of modelIds) {
      bytes += fs.statSync(path.join(PACK, manifest.models[id].file)).size;
      const h = ax26Version(path.join(PACK, manifest.models[id].file));
      verts += h.verts; indices += h.indices;
    }
    const v1Bytes = modelIds.length * 20 + verts * 40 + indices * 4;
    assert.ok(bytes < v1Bytes * 0.6,
      `packed pack is ${bytes} B against ${v1Bytes} B unpacked — expected under 60 %`);
  });

test("positions, indices and material ids survive the pack bit-exactly",
  { skip: !hasPack && "no pack installed" }, async () => {
    // Against the shipped files, not a fixture: this is the pack players load.
    for (const id of modelIds) {
      const file = path.join(PACK, manifest.models[id].file);
      const geo = await readAX26(file);
      assert.ok(geo, `the shipped reader rejected ${id}`);
      const h = ax26Version(file);
      assert.equal(geo.pos.length, h.verts * 3, `${id}: vertex count`);
      assert.equal(geo.idx.length, h.indices, `${id}: index count`);
      for (let i = 0; i < geo.mat.length; i++) {
        assert.equal(geo.mat[i], Math.floor(geo.mat[i]),
          `${id}: material id ${geo.mat[i]} is not whole after the round trip`);
      }
      for (let i = 0; i < geo.idx.length; i++) {
        assert.ok(geo.idx[i] < h.verts, `${id}: index ${geo.idx[i]} is out of range`);
      }
    }
  });

test("quantised channels stay inside the bounds the format claims", async () => {
  const mesh = tidyMesh(64);
  // Spread normals over the sphere and colours over [0,1] so the worst case is
  // actually exercised rather than a handful of axis-aligned faces.
  for (let i = 0; i < 64; i++) {
    const a = i * 0.7919, b = (i * 0.3313) % 1.5 - 0.75;
    mesh.nrm[i * 3] = Math.cos(b) * Math.cos(a);
    mesh.nrm[i * 3 + 1] = Math.sin(b);
    mesh.nrm[i * 3 + 2] = Math.cos(b) * Math.sin(a);
    mesh.col[i * 3] = i / 63; mesh.col[i * 3 + 1] = 1 - i / 63; mesh.col[i * 3 + 2] = (i % 7) / 6;
  }
  const { head, geo } = await roundTrip(mesh);
  assert.equal(head.version, 2);
  for (let i = 0; i < mesh.pos.length; i++) {
    assert.equal(geo.pos[i], mesh.pos[i], "position must stay exact float32");
  }
  let worstCol = 0, worstDeg = 0;
  for (let i = 0; i < mesh.col.length; i++) worstCol = Math.max(worstCol, Math.abs(geo.col[i] - mesh.col[i]));
  for (let i = 0; i < mesh.nrm.length; i += 3) {
    const d = mesh.nrm[i] * geo.nrm[i] + mesh.nrm[i + 1] * geo.nrm[i + 1] + mesh.nrm[i + 2] * geo.nrm[i + 2];
    // Divide by BOTH lengths. The source lives in a Float32Array and so is only
    // unit to ~6e-8; normalising just the decoded side folds that into the
    // answer and reports ~0.014°, an order of magnitude above what the signed
    // short actually costs. Measuring the wrong thing this way would have set
    // the bound ten times too loose.
    const Ls = Math.hypot(mesh.nrm[i], mesh.nrm[i + 1], mesh.nrm[i + 2]);
    const Lg = Math.hypot(geo.nrm[i], geo.nrm[i + 1], geo.nrm[i + 2]);
    if (Ls < 1e-6 || Lg < 1e-6) continue;
    worstDeg = Math.max(worstDeg, Math.acos(Math.min(1, d / (Ls * Lg))) * 180 / Math.PI);
  }
  // One 8-bit display step is 1/255 = 3.9e-3; half of that is the most a byte
  // colour can be wrong by, and it is below what a screen can show.
  assert.ok(worstCol <= 0.5 / 255 + 1e-6, `colour drift ${worstCol} exceeds half a display step`);
  assert.ok(worstDeg < 0.01, `normal drift ${worstDeg.toFixed(5)}° is too coarse`);
});

test("a mesh the packed layout cannot hold falls back to v1 instead of wrapping", async () => {
  // Emissive colour past 1.0 — a byte would clamp it to white.
  const hot = tidyMesh(4); hot.col[0] = 2.75;
  const a = await roundTrip(hot);
  assert.equal(a.head.version, 1, "an over-bright colour must force the wide layout");
  assert.equal(a.geo.col[0], 2.75, "and the value must come back untouched");

  // A fractional material id — LIT_VS reads the fraction as the FLAG wave weight.
  const flag = tidyMesh(4); flag.mat[1] = 15.4;
  const b = await roundTrip(flag);
  assert.equal(b.head.version, 1, "a fractional material id must force the wide layout");
  assert.ok(Math.abs(b.geo.mat[1] - 15.4) < 1e-5);

  // A material id past a byte.
  const big = tidyMesh(4); big.mat[2] = 300;
  const c = await roundTrip(big);
  assert.equal(c.head.version, 1, "a material id past 255 must force the wide layout");
  assert.equal(c.geo.mat[2], 300);
});

test("the reader still reads a v1 file, so an older pack is not bricked", async () => {
  const mesh = tidyMesh(4);
  mesh.col[0] = 2.0;                       // forces v1 out of the shared writer
  const { head, geo } = await roundTrip(mesh);
  assert.equal(head.version, 1);
  assert.ok(geo, "v1 must still parse");
  for (let i = 0; i < mesh.pos.length; i++) assert.equal(geo.pos[i], mesh.pos[i]);
  for (let i = 0; i < mesh.mat.length; i++) assert.equal(geo.mat[i], mesh.mat[i]);
  for (let i = 0; i < mesh.idx.length; i++) assert.equal(geo.idx[i], mesh.idx[i]);
});

test("the manifest's md5 matches the bytes on disk",
  { skip: !hasPack && "no pack installed" }, () => {
    // Guards the regeneration this format change required: a manifest that
    // still described the old bytes would pass `verify` and ship a pack whose
    // credits and checksums referred to files that no longer exist.
    for (const id of modelIds) {
      const rec = manifest.models[id];
      if (!rec.md5) continue;
      const buf = fs.readFileSync(path.join(PACK, rec.file));
      const md5 = crypto.createHash("md5").update(buf).digest("hex");
      assert.equal(md5, rec.md5, `${id}: manifest md5 is stale`);
    }
  });
