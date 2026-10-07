// js/workers/bitmap-decode-worker.js + bitmap-decode-client.js: decode a Blob
// to a transferable ImageBitmap off the page thread; fall back on the main
// thread when Worker is missing or the worker errors.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

test("bitmap-decode-worker posts a transferred ImageBitmap for a Blob", async () => {
  const posted = [];
  const fakeBmp = { width: 2, height: 2, close() {} };
  const ctx = vm.createContext({
    createImageBitmap: async (blob, ...rest) => {
      assert.ok(blob && blob.size >= 0);
      if (rest.length >= 4 && typeof rest[0] === "number") {
        assert.equal(rest.length, 5, "crop overload includes opts");
      }
      return fakeBmp;
    },
    postMessage: (m, transfer) => {
      posted.push({ m, transfer });
    },
  });
  ctx.self = ctx;
  vm.runInContext(read("js/workers/bitmap-decode-worker.js"), ctx, { filename: "bitmap-decode-worker.js" });
  const blob = { size: 4, type: "image/png" };
  await ctx.onmessage({ data: { type: "decode", seq: 1, blob, opts: { premultiplyAlpha: "none" } } });
  assert.equal(posted.length, 1);
  assert.equal(posted[0].m.type, "decoded");
  assert.equal(posted[0].m.seq, 1);
  assert.equal(posted[0].m.bmp, fakeBmp);
  assert.ok(Array.isArray(posted[0].transfer));
  assert.equal(posted[0].transfer.length, 1);
  assert.equal(posted[0].transfer[0], fakeBmp);
});

test("bitmap-decode-worker answers error without throwing", async () => {
  const posted = [];
  const ctx = vm.createContext({
    createImageBitmap: async () => { throw new Error("bad png"); },
    postMessage: (m) => posted.push(m),
  });
  ctx.self = ctx;
  vm.runInContext(read("js/workers/bitmap-decode-worker.js"), ctx, { filename: "bitmap-decode-worker.js" });
  await ctx.onmessage({ data: { type: "decode", seq: 7, blob: { size: 1 } } });
  assert.equal(posted[0].type, "error");
  assert.equal(posted[0].seq, 7);
  assert.match(posted[0].message, /bad png/);
});

test("BitmapDecode client falls back to main-thread createImageBitmap without Worker", async () => {
  const calls = [];
  const bmp = { width: 1, height: 1, close() {} };
  const main = vm.createContext({
    createImageBitmap: async (blob, opts) => {
      calls.push({ blob, opts });
      return bmp;
    },
    location: { href: "http://x/" },
    window: { __APEX_BUILD: 1 },
    URL,
  });
  // No Worker on purpose.
  vm.runInContext(read("js/workers/bitmap-decode-client.js").replace(/^const\b/gm, "var"), main);
  const out = await main.BitmapDecode.decode({ size: 8, type: "image/png" });
  assert.equal(out, bmp);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].opts.premultiplyAlpha, "none");
  assert.equal(calls[0].opts.imageOrientation, "none");
});

test("BitmapDecode client posts to a Worker and resolves the transferred bitmap", async () => {
  const bmp = { width: 4, height: 4, close() {} };
  let worker = null;
  const main = vm.createContext({
    createImageBitmap: async () => { throw new Error("must use worker"); },
    location: { href: "http://x/" },
    window: { __APEX_BUILD: 1 },
    URL,
    Worker: class {
      constructor(src) {
        this.src = src;
        this.onmessage = null;
        worker = this;
      }
      postMessage(m) {
        queueMicrotask(() => {
          if (this.onmessage) this.onmessage({ data: { type: "decoded", seq: m.seq, bmp } });
        });
      }
      terminate() {}
    },
  });
  vm.runInContext(read("js/workers/bitmap-decode-client.js").replace(/^const\b/gm, "var"), main);
  const out = await main.BitmapDecode.decode({ size: 2 });
  assert.equal(out, bmp);
  assert.match(worker.src, /bitmap-decode-worker\.js/);
});
