// assets-verify-material-md5.test.mjs — #3296: material filmstrip PNGs must
// carry albedoMd5/normalMd5, the way every model carries md5. A same-size
// rewrite with no hash recorded used to pass verify.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { encodePNG } from "../../tools/gen/assets.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MAT_LAYERS = 17;
const md5 = (b) => crypto.createHash("md5").update(b).digest("hex");

function runVerify(dir) {
  return spawnSync(process.execPath, [path.join(ROOT, "tools", "gen", "assets.mjs"), "verify"], {
    env: { ...process.env, APEX_PACK_DIR: dir },
    encoding: "utf8",
  });
}

function materialFixture({ albedoMd5, normalMd5, albedoBytes, normalBytes } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-mat-md5-"));
  const size = 2;
  const png = encodePNG(size, size * MAT_LAYERS, Buffer.alloc(size * size * MAT_LAYERS * 4));
  const alb = albedoBytes || png;
  const nor = normalBytes || png;
  fs.writeFileSync(path.join(dir, "a.png"), alb);
  fs.writeFileSync(path.join(dir, "n.png"), nor);
  const mats = {
    size,
    albedo: "a.png",
    normal: "n.png",
    layers: [{ id: "concrete", mat: 1, scale: 5, licence: "CC0", source: "fixture", author: "t" }],
  };
  if (albedoMd5 !== undefined) mats.albedoMd5 = albedoMd5;
  if (normalMd5 !== undefined) mats.normalMd5 = normalMd5;
  if (albedoMd5 === true) mats.albedoMd5 = md5(alb);
  if (normalMd5 === true) mats.normalMd5 = md5(nor);
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
    version: 1, materials: mats, models: {}, env: {}, credits: [],
  }));
  return dir;
}

test("verify refuses material strips with no albedoMd5/normalMd5 (#3296)", () => {
  const dir = materialFixture({});
  try {
    const r = runVerify(dir);
    const out = r.stdout + r.stderr;
    assert.equal(r.status, 1, `must fail without hashes\n${out}`);
    assert.ok(out.includes("md5 missing"), out);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("verify refuses a same-size material PNG rewrite when the recorded md5 differs (#3296)", () => {
  const size = 2;
  const h = size * MAT_LAYERS;
  const a = Buffer.alloc(size * h * 4, 10);
  const b = Buffer.alloc(size * h * 4, 200);
  for (let i = 3; i < a.length; i += 4) { a[i] = 255; b[i] = 255; }
  const pngA = encodePNG(size, h, a);
  const pngB = encodePNG(size, h, b);
  const dir = materialFixture({
    albedoBytes: pngB,
    normalBytes: pngA,
    albedoMd5: md5(pngA),
    normalMd5: md5(pngA),
  });
  try {
    const r = runVerify(dir);
    const out = r.stdout + r.stderr;
    assert.equal(r.status, 1, `must fail on mismatch\n${out}`);
    assert.ok(out.includes("md5 mismatch"), out);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("verify accepts material strips whose albedoMd5/normalMd5 match the files", () => {
  const dir = materialFixture({ albedoMd5: true, normalMd5: true });
  try {
    const r = runVerify(dir);
    assert.equal(r.status, 0, `hashed pack must pass\n${r.stdout}\n${r.stderr}`);
    assert.ok(r.stdout.includes("verify: OK"), r.stdout);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
