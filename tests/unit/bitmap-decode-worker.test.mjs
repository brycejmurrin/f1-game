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

test("bitmap-decode-worker closes only its own bitmap when transfer fails", async () => {
  for (const crop of [null, [0, 0, 2, 2]]) {
    for (const mode of ["success", "transfer-fails", "close-fails", "decode-fails"]) {
      let closes = 0;
      const posted = [];
      const bmp = { width: 2, height: 2, close() {
        closes++;
        if (mode === "close-fails") throw new Error("close failed");
      } };
      const ctx = vm.createContext({
        createImageBitmap: async (...args) => {
          assert.equal(args.length, crop ? 6 : 2, "preserve cropped and full-image overloads");
          if (mode === "decode-fails") throw new Error("bad png");
          return bmp;
        },
        postMessage: (m, transfer) => {
          if (m.type === "decoded") {
            assert.equal(m.bmp, bmp);
            assert.equal(transfer.length, 1);
            assert.equal(transfer[0], bmp);
            if (mode !== "success") {
              const error = new Error("transfer failed");
              error.name = "DataCloneError";
              throw error;
            }
          }
          posted.push(m);
        },
      });
      ctx.self = ctx;
      vm.runInContext(read("js/workers/bitmap-decode-worker.js"), ctx);
      await ctx.onmessage({ data: { type: "decode", seq: 13, blob: { size: 4 }, crop } });
      assert.equal(closes, mode === "transfer-fails" || mode === "close-fails" ? 1 : 0, mode);
      assert.equal(posted.length, 1, mode);
      assert.equal(posted[0].seq, 13);
      assert.equal(posted[0].type, mode === "success" ? "decoded" : "error");
      if (mode !== "success") assert.equal(posted[0].message, mode === "decode-fails" ? "bad png" : "transfer failed");
    }
  }
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
    URL, setTimeout, clearTimeout,
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
    URL, setTimeout, clearTimeout,
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

function controlledClient() {
  let worker, timer, clears = 0, fallbacks = 0;
  const bmp = { width: 2, height: 2, close() {} };
  const ctx = vm.createContext({ URL, location: { href: "http://x/" }, window: {},
    setTimeout: (fn) => { timer = fn; return 1; }, clearTimeout: () => clears++,
    createImageBitmap: async () => { fallbacks++; return bmp; },
    Worker: class { constructor() { worker = this; } postMessage(m) { this.request = m; } terminate() {} },
  });
  vm.runInContext(read("js/workers/bitmap-decode-client.js") + ";window.api = BitmapDecode", ctx);
  return { api: ctx.window.api, get worker() { return worker; }, fire: () => timer(),
    get clears() { return clears; }, get fallbacks() { return fallbacks; }, bmp };
}

test("bitmap deadline and messageerror fallback settle once and close late replies", async () => {
  for (const mode of ["timeout", "messageerror", "drop"]) {
    const h = controlledClient(), result = h.api.decode({ size: 1 });
    const seq = h.worker.request.seq;
    if (mode === "timeout") h.fire();
    else if (mode === "drop") h.api.drop();
    else h.worker.onmessageerror();
    assert.equal(await result, h.bmp); assert.equal(h.fallbacks, 1); assert.equal(h.clears, 1);
    let closed = 0;
    h.worker.onmessage({ data: { type: "decoded", seq, bmp: { width: 1, height: 1, close() { closed++; } } } });
    assert.equal(closed, 1); assert.equal(h.fallbacks, 1);
  }
});

test("matched bitmap ownership is transferred and duplicate replies close", async () => {
  const h = controlledClient(), result = h.api.decode({ size: 1 });
  let closed = 0;
  const bmp = { width: 1, height: 1, close() { closed++; } };
  const reply = { data: { type: "decoded", seq: h.worker.request.seq, bmp } };
  h.worker.onmessage(reply); assert.equal(await result, bmp); assert.equal(closed, 0);
  h.worker.onmessage(reply); assert.equal(closed, 1); assert.equal(h.clears, 1);
});

test("malformed bitmap replies fallback and malformed crops reject before dispatch", async () => {
  for (const type of ["decoded", "unknown"]) {
    const h = controlledClient(), result = h.api.decode({ size: 1 });
    h.worker.onmessage({ data: { type, seq: h.worker.request.seq } });
    assert.equal(await result, h.bmp); assert.equal(h.fallbacks, 1);
  }
  for (const crop of [[], [0, 0, 2], [0, 0, 0, 2], [0, 0, 2, -1], [0, NaN, 2, 2]]) {
    const h = controlledClient();
    await assert.rejects(h.api.decode({ size: 1 }, null, crop), /invalid crop/);
    assert.equal(h.worker, undefined); assert.equal(h.fallbacks, 0);
    const posted = [], ctx = vm.createContext({ createImageBitmap: () => { throw new Error("must not decode"); }, postMessage: (m) => posted.push(m) });
    ctx.self = ctx; vm.runInContext(read("js/workers/bitmap-decode-worker.js"), ctx);
    await ctx.onmessage({ data: { type: "decode", seq: 2, blob: {}, crop } });
    assert.match(posted[0].message, /invalid crop/);
  }
});

test("explicit bitmap abort skips fallback and closes a late worker reply", async () => {
  let worker, fallbacks = 0, closed = 0;
  const ctx = vm.createContext({ URL, setTimeout, clearTimeout,
    location: { href: "http://x/" }, window: {},
    createImageBitmap: async () => { fallbacks++; return {}; },
    Worker: class { constructor() { worker = this; } postMessage(m) { this.request = m; } terminate() {} },
  });
  vm.runInContext(read("js/workers/bitmap-decode-client.js").replace(/^const\b/gm, "var"), ctx);
  const controller = new AbortController();
  const pending = ctx.BitmapDecode.decode({}, null, null, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  worker.onmessage({ data: { type: "decoded", seq: worker.request.seq,
    bmp: { width: 1, height: 1, close() { closed++; } } } });
  assert.equal(fallbacks, 0); assert.equal(closed, 1);
  await assert.rejects(ctx.BitmapDecode.decode({}, null, null, controller.signal), { name: "AbortError" });
});

test("aborted page decode disposes its completed bitmap", async () => {
  let finish, closed = 0;
  const ctx = vm.createContext({ URL, setTimeout, clearTimeout,
    createImageBitmap: () => new Promise(r => { finish = r; }) });
  vm.runInContext(read("js/workers/bitmap-decode-client.js").replace(/^const\b/gm, "var"), ctx);
  const controller = new AbortController();
  const pending = ctx.BitmapDecode.decode({}, null, null, controller.signal);
  controller.abort(); finish({ close() { closed++; } });
  await assert.rejects(pending, { name: "AbortError" }); assert.equal(closed, 1);
});
