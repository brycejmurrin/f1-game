// worker-pack-strip — the pack-strip lane of js/workers/bitmap-decode-worker.js
// (PARALLEL-HUNT-2026-10-24 P1, apex26.packDecodeWorker, default OFF).
//
// The worker inflates + unfilters a baked strip off the page thread and
// transfers the RGBA bytes back. They must be exactly the bytes the page-thread
// reader (assets.js _decodeStripBytes) hands the backends: sharp (libvips, an
// independent decoder) decodes the same shipped PNGs, and every layer must match
// it byte for byte. The client must answer null — and so leave the page's own
// decode in charge — when the flag is off, a PNG is refused, or the worker fails.
//
// Run: node --test tests/unit/worker-pack-strip.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { absSrc } from "../helpers/abs-src.mjs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PACK = path.join(ROOT, "assets", "pack");
const WORKER = "js/workers/bitmap-decode-worker.js";
const CLIENT = "js/workers/bitmap-decode-client.js";
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(PACK, "manifest.json"), "utf8"));

// The worker in its own context; post() delivers to it, replies land in `posted`.
function workerCtx(extra = {}) {
  const posted = [];
  const ctx = vm.createContext({
    DecompressionStream, DataView, Uint8Array, Promise,
    createImageBitmap: async () => { throw new Error("no bitmaps on the strip lane"); },
    postMessage: (m, transfer) => posted.push({ m, transfer }),
    ...extra,
  });
  ctx.self = ctx;
  vm.runInContext(read(WORKER), ctx, { filename: absSrc(WORKER) });
  return { ctx, posted };
}

const TIERS = [["high", manifest.materials], ["low", manifest.materials.low]];

for (const [tier, v] of TIERS) {
  for (const file of [v.albedo, v.normal].filter(Boolean)) {
    test(`worker strip: ${tier} ${file} matches sharp byte for byte and transfers its buffer`, async () => {
      const { ctx, posted } = workerCtx();
      const bytes = fs.readFileSync(path.join(PACK, file));
      const { data, info } = await sharp(path.join(PACK, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const layers = info.height / v.size;
      await ctx.onmessage({ data: { type: "strip", seq: 3, blob: new Blob([bytes]), size: v.size, layers } });
      assert.equal(posted.length, 1);
      const { m, transfer } = posted[0];
      assert.equal(m.type, "strip");
      assert.equal(m.seq, 3);
      assert.equal(m.stride, v.size * 4);
      assert.ok(transfer.length === 1 && transfer[0] === m.pix.buffer, "the pixel buffer is transferred, not cloned");
      assert.equal(m.pix.length, data.length);
      assert.ok(Buffer.from(m.pix.buffer, m.pix.byteOffset, m.pix.length).equals(data), "every layer equals sharp's decode");
    });
  }
}

test("worker strip: a PNG it does not take answers pix:null; garbage answers error, never a throw", async () => {
  const { ctx, posted } = workerCtx();
  const png = fs.readFileSync(path.join(PACK, manifest.materials.low.albedo));
  // An sRGB chunk right after IHDR: the browser would colour-manage it, so the reader refuses it.
  const ihdrEnd = 8 + 8 + 13 + 4;
  const srgb = Buffer.from([0, 0, 0, 1, 0x73, 0x52, 0x47, 0x42, 0, 0xae, 0xce, 0x1c, 0xe9]);
  const tagged = Buffer.concat([png.subarray(0, ihdrEnd), srgb, png.subarray(ihdrEnd)]);
  await ctx.onmessage({ data: { type: "strip", seq: 1, blob: new Blob([tagged]), size: 128, layers: 2 } });
  assert.equal(posted[0].m.type, "strip");
  assert.equal(posted[0].m.pix, null);
  await ctx.onmessage({ data: { type: "strip", seq: 2, blob: null, size: 128, layers: 1 } });
  assert.equal(posted[1].m.type, "error");
  assert.equal(posted[1].m.seq, 2);
});

// The client over a fake Worker that runs the real worker script in a VM.
function clientCtx({ flag = "1", worker = "real" } = {}) {
  const spawned = [];
  class FakeWorker {
    constructor(url) {
      spawned.push(url);
      if (worker === "throw") throw new Error("no workers here");
      const self = this;
      this.w = worker === "real" ? workerCtx({
        postMessage: (m) => queueMicrotask(() => self.onmessage && self.onmessage({ data: m })),
      }).ctx : null;
    }
    postMessage(m) {
      if (worker === "crash") return queueMicrotask(() => this.onerror && this.onerror(new Error("boom")));
      this.w.onmessage({ data: m });
    }
    terminate() {}
  }
  const store = flag == null ? {} : { "apex26.packDecodeWorker": flag };
  const ctx = vm.createContext({
    Worker: FakeWorker, URL, setTimeout, clearTimeout, queueMicrotask, Uint8Array, Promise,
    location: { href: "http://127.0.0.1/" },
    localStorage: { getItem: (k) => (k in store ? store[k] : null) },
    createImageBitmap: async () => ({ width: 1, height: 1, close() {} }),
  });
  ctx.window = ctx;
  vm.runInContext(read(CLIENT), ctx, { filename: absSrc(CLIENT) });
  return { BD: ctx.BitmapDecode, spawned };
}

test("client strip: OFF by default — null, and no worker is spawned", async () => {
  for (const flag of [null, "0", "true"]) {
    const { BD, spawned } = clientCtx({ flag });
    assert.equal(BD.stripEnabled(), false);
    assert.equal(await BD.strip(new Blob([new Uint8Array(4)]), 128, [0, 1]), null);
    assert.equal(spawned.length, 0, `flag ${flag}: nothing parsed or spawned`);
  }
});

test("client strip: ON returns per-layer views equal to sharp, undefined where the pack has no layer", async () => {
  const v = manifest.materials.low;
  const { BD, spawned } = clientCtx();
  const present = new Array(17).fill(0);
  present[1] = 1; present[4] = 1; present[9] = 1;
  const out = await BD.strip(new Blob([fs.readFileSync(path.join(PACK, v.albedo))]), v.size, present);
  assert.equal(spawned.length, 1);
  assert.match(spawned[0], /js\/workers\/bitmap-decode-worker\.js/);
  const { data } = await sharp(path.join(PACK, v.albedo)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const page = v.size * v.size * 4;
  for (let i = 0; i < 17; i++) {
    if (!present[i]) { assert.equal(out[i], undefined, `layer ${i} absent`); continue; }
    assert.equal(out[i].length, page);
    assert.ok(Buffer.from(out[i].buffer, out[i].byteOffset, page).equals(data.subarray(i * page, (i + 1) * page)), `layer ${i}`);
  }
});

test("client strip: a worker that cannot spawn or crashes answers null (the page decodes as before)", async () => {
  for (const worker of ["throw", "crash"]) {
    const { BD } = clientCtx({ worker });
    assert.equal(await BD.strip(new Blob([new Uint8Array(8)]), 128, [0, 1]), null, worker);
  }
  const { BD } = clientCtx();
  assert.equal(await BD.strip(new Blob([new Uint8Array(8)]), 128, [0, 0]), null, "no layer asked for");
});
