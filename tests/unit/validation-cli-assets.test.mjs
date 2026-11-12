// validation-cli-assets.test.mjs — bounded negative contracts: an invalid or uncovered
// request cannot report green. tools/gen/assets.mjs: the HDR sampler and PNG decoder reject damaged input, and the asset verifier checks material bytes, shape and licensing.
// Regrouped per tool out of validation-cli.test.mjs (#3043 T5-30), assertions unchanged.
// Run: node --test tests/unit/validation-cli-assets.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { encodePNG, decodePNG, sampleRadianceHdr } from "../../tools/gen/assets.mjs";
import { cli, fixture } from "../helpers/validation-cli.mjs";

test("HDR sampler preserves valid run/literal and flat scanlines", () => {
  const header = (w) => Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 2 +X ${w}\n`);
  const sky = [100, 50, 25, 129], ground = [10, 20, 30, 128];
  const run = [2, 2, 0, 8, ...sky.flatMap((v) => [136, v])];
  const literal = [2, 2, 0, 8, ...ground.flatMap((v) => [8, ...Array(8).fill(v)])];
  const rle = sampleRadianceHdr(Buffer.concat([header(8), Buffer.from([...run, ...literal])]));
  const flat = sampleRadianceHdr(Buffer.concat([header(2), Buffer.from([...sky, ...sky, ...ground, ...ground])]));
  for (const result of [rle, flat]) {
    for (let c = 0; c < 3; c++) {
      assert.ok(Math.abs(result.sky[c] - sky[c] * 2 / 255) < 1e-12);
      assert.ok(Math.abs(result.ground[c] - ground[c] / 255) < 1e-12);
    }
    assert.equal(result.height, 2);
  }
  assert.equal(rle.width, 8);
  assert.equal(flat.width, 2);
});

test("HDR sampler rejects zero, truncated and overrunning RLE packets", () => {
  const image = (data) => Buffer.concat([Buffer.from("#?RADIANCE\n\n-Y 1 +X 8\n"), Buffer.from(data)]);
  for (const [payload, error] of [
    [[2, 2, 0], /truncated HDR scanline/],
    [[2, 2, 0, 8], /truncated HDR RLE packet/],
    [[2, 2, 0, 8, 0], /zero HDR RLE packet/],
    [[2, 2, 0, 8, 136], /truncated HDR RLE payload/],
    [[2, 2, 0, 8, 8, 1, 2], /truncated HDR RLE payload/],
    [[2, 2, 0, 8, 137, 42], /overruns scanline/],
    [[2, 2, 0, 8, 9, ...Array(9).fill(42)], /overruns scanline/],
    [[2, 2, 0, 8, 135, 42, 130, 42], /overruns scanline/],
    [[100, 50, 25, 129], /truncated HDR scanline/],
  ]) assert.throws(() => sampleRadianceHdr(image(payload)), error);
});

test("material PNG decoder rejects damaged signature, CRC and truncated image data", () => {
  const png = encodePNG(2, 34, Buffer.alloc(2 * 34 * 4));
  assert.equal(decodePNG(png).h, 34);
  const signature = Buffer.from(png); signature[7] ^= 1;
  assert.throws(() => decodePNG(signature), /signature/);
  const crc = Buffer.from(png); crc[20] ^= 1;
  assert.throws(() => decodePNG(crc), /CRC/);
  assert.throws(() => decodePNG(png.subarray(0, png.length - 4)), /truncated|IEND/);
});

test("asset verifier checks material bytes, shape and low-tier licensing/identity", (t) => {
  const pack = fixture(t);
  const layer = { id: "concrete", mat: 1, scale: 5, licence: "CC0", source: "fixture" };
  const png = encodePNG(2, 34, Buffer.alloc(2 * 34 * 4));
  const lowPng = encodePNG(1, 17, Buffer.alloc(17 * 4));
  const md5 = (b) => crypto.createHash("md5").update(b).digest("hex");
  const manifest = { version: 1, materials: {
    size: 2, albedo: "a.png", normal: "n.png", layers: [layer],
    albedoMd5: md5(png), normalMd5: md5(png),
    low: { size: 1, albedo: "la.png", normal: "ln.png", layers: [{ ...layer }],
      albedoMd5: md5(lowPng), normalMd5: md5(lowPng) },
  }, models: {}, env: {} };
  for (const f of ["a.png", "n.png"]) fs.writeFileSync(path.join(pack, f), png);
  for (const f of ["la.png", "ln.png"]) fs.writeFileSync(path.join(pack, f), lowPng);
  const verify = () => { fs.writeFileSync(path.join(pack, "manifest.json"), JSON.stringify(manifest)); return cli("tools/gen/assets.mjs", ["verify"], { APEX_PACK_DIR: pack }); };
  assert.equal(verify().status, 0);
  const savedAlb = manifest.materials.albedoMd5;
  delete manifest.materials.albedoMd5;
  let bad = verify(); assert.equal(bad.status, 1);
  assert.ok(/md5 missing/.test(bad.stderr + bad.stdout), bad.stderr + bad.stdout);
  manifest.materials.albedoMd5 = savedAlb;
  manifest.materials.low.layers[0].licence = "CC-BY";
  bad = verify(); assert.equal(bad.status, 1); assert.equal(bad.stderr, "  ✗ materials.low material concrete: licence \"CC-BY\" is not in the allow-list (CC0, CC0-1.0, Apex26-Procedural)\n  ✗ materials.low: layer identity, scale, source and licence must match high tier\n");
  manifest.materials.low.layers[0].licence = "CC0";
  fs.writeFileSync(path.join(pack, "a.png"), Buffer.from("broken"));
  bad = verify(); assert.equal(bad.status, 1); assert.equal(bad.stderr, "  ✗ materials: a.png: not a PNG (bad signature)\n");
  fs.writeFileSync(path.join(pack, "a.png"), encodePNG(2, 33, Buffer.alloc(2 * 33 * 4)));
  bad = verify(); assert.equal(bad.status, 1); assert.equal(bad.stderr, "  ✗ materials: a.png shape 2x33 != 2x34\n  ✗ materials: a.png md5 mismatch\n");
  fs.writeFileSync(path.join(pack, "a.png"), png);
  manifest.materials.low.layers[0].scale = 6;
  bad = verify(); assert.equal(bad.status, 1); assert.equal(bad.stderr, "  ✗ materials.low: layer identity, scale, source and licence must match high tier\n");
});
