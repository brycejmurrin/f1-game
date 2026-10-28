// js/workers/bitmap-decode-worker.js + bitmap-decode-client.js: decode a Blob
// to a transferable ImageBitmap off the page thread; fall back on the main
// thread when Worker is missing or the worker errors.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

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
  vm.runInContext(read("js/workers/bitmap-decode-worker.js"), ctx, { filename: absSrc("js/workers/bitmap-decode-worker.js") });
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
  vm.runInContext(read("js/workers/bitmap-decode-worker.js"), ctx, { filename: absSrc("js/workers/bitmap-decode-worker.js") });
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
      vm.runInContext(read("js/workers/bitmap-decode-worker.js"), ctx, { filename: absSrc("js/workers/bitmap-decode-worker.js") });
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
  vm.runInContext(read("js/workers/bitmap-decode-client.js").replace(/^const\b/gm, "var"), main, { filename: absSrc("js/workers/bitmap-decode-client.js") });
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
  vm.runInContext(read("js/workers/bitmap-decode-client.js").replace(/^const\b/gm, "var"), main, { filename: absSrc("js/workers/bitmap-decode-client.js") });
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
  vm.runInContext(read("js/workers/bitmap-decode-client.js") + ";window.api = BitmapDecode", ctx, { filename: absSrc("js/workers/bitmap-decode-client.js") });
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
    ctx.self = ctx; vm.runInContext(read("js/workers/bitmap-decode-worker.js"), ctx, { filename: absSrc("js/workers/bitmap-decode-worker.js") });
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
  vm.runInContext(read("js/workers/bitmap-decode-client.js").replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/workers/bitmap-decode-client.js") });
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
  vm.runInContext(read("js/workers/bitmap-decode-client.js").replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/workers/bitmap-decode-client.js") });
  const controller = new AbortController();
  const pending = ctx.BitmapDecode.decode({}, null, null, controller.signal);
  controller.abort(); finish({ close() { closed++; } });
  await assert.rejects(pending, { name: "AbortError" }); assert.equal(closed, 1);
});

test("bitmap worker swallows a failed error postMessage (no unhandled rejection)", async () => {
  const bmp = { width: 2, height: 2, closed: 0, close() { this.closed++; } };
  const ctx = vm.createContext({
    createImageBitmap: async () => bmp,
    postMessage: (m) => {
      if (m.type === "decoded") throw Object.assign(new Error("DataCloneError"), { name: "DataCloneError" });
      throw Object.assign(new Error("InvalidStateError"), { name: "InvalidStateError" });
    },
  });
  ctx.self = ctx;
  vm.runInContext(read("js/workers/bitmap-decode-worker.js"), ctx, { filename: absSrc("js/workers/bitmap-decode-worker.js") });
  // Before the fix, the second postMessage throw rejected this async handler.
  await ctx.onmessage({ data: { type: "decode", seq: 9, blob: { size: 1 } } });
  assert.equal(bmp.closed, 1);
});

test("BitmapDecode clears a terminated corpse so the next decode can respawn", async () => {
  let workers = 0, last;
  const bmp = { width: 1, height: 1, close() {} };
  const ctx = vm.createContext({
    URL, location: { href: "http://x/" }, window: {},
    setTimeout: () => 1, clearTimeout() {},
    createImageBitmap: async () => bmp,
    Worker: class {
      constructor() {
        workers++;
        last = this;
        this.dead = false;
        this.onmessage = null;
        this.onerror = null;
        this.onmessageerror = null;
      }
      postMessage(m) {
        if (this.dead) throw Object.assign(new Error("InvalidStateError"), { name: "InvalidStateError" });
        this.request = m;
      }
      terminate() { this.dead = true; }
    },
  });
  vm.runInContext(read("js/workers/bitmap-decode-client.js").replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/workers/bitmap-decode-client.js") });
  // Attach a worker, then terminate it WITHOUT drop() (onerror did not fire) so `_w`
  // still points at the corpse.
  ctx.BitmapDecode.decode({ size: 1 });
  assert.equal(workers, 1);
  last.terminate();
  // This postMessage throws → drop() clears `_w` → main-thread fallback.
  assert.equal(await ctx.BitmapDecode.decode({ size: 1 }), bmp);
  assert.equal(workers, 1, "fallback does not spawn; corpse must be cleared");
  // Next decode must spawn a fresh Worker instead of posting at the corpse forever.
  const revived = ctx.BitmapDecode.decode({ size: 1 });
  assert.equal(workers, 2, "respawn after corpse postMessage failure");
  last.onmessage({ data: { type: "decoded", seq: last.request.seq, bmp } });
  assert.equal(await revived, bmp);
});

test("stale worker replies after drop+respawn close their bitmap and do not settle", async () => {
  let workers = [];
  const ctx = vm.createContext({
    URL, location: { href: "http://x/" }, window: {},
    setTimeout: () => 1, clearTimeout() {},
    createImageBitmap: async () => { throw new Error("must use worker"); },
    Worker: class {
      constructor() {
        workers.push(this);
        this.onmessage = null;
        this.onerror = null;
        this.onmessageerror = null;
      }
      postMessage(m) { this.request = m; }
      terminate() {}
    },
  });
  vm.runInContext(read("js/workers/bitmap-decode-client.js").replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/workers/bitmap-decode-client.js") });
  const pending = ctx.BitmapDecode.decode({ size: 1 });
  const old = workers[0];
  const seq = old.request.seq;
  ctx.BitmapDecode.drop(); // rejects pending → fallback would run, but createImageBitmap throws
  await assert.rejects(pending, /must use worker|bitmap worker dropped/);
  // New decode on a fresh worker.
  const bmp = { width: 2, height: 2, close() {} };
  const next = ctx.BitmapDecode.decode({ size: 1 });
  assert.equal(workers.length, 2);
  let closed = 0;
  old.onmessage({ data: { type: "decoded", seq, bmp: { width: 1, height: 1, close() { closed++; } } } });
  assert.equal(closed, 1, "orphan bitmap from the terminated worker is closed");
  workers[1].onmessage({ data: { type: "decoded", seq: workers[1].request.seq, bmp } });
  assert.equal(await next, bmp);
});


test("bitmap deadline retires the stalled worker before a later request", async () => {
  const h = controlledClient();
  const first = h.api.decode({ size: 1 });
  const old = h.worker;
  h.fire();
  assert.equal(await first, h.bmp);
  const next = h.api.decode({ size: 1 });
  assert.notEqual(h.worker, old, "a deadline must retire the unresponsive worker");
  h.worker.onmessage({ data: { type: "decoded", seq: h.worker.request.seq, bmp: h.bmp } });
  assert.equal(await next, h.bmp);
});


test("client strip deadline retires its worker and lets a later strip respawn", async () => {
  const CLIENT = "js/workers/bitmap-decode-client.js";
  const workers = [], timers = [];
  const ctx = vm.createContext({ URL, Uint8Array,
    location: { href: "http://x/" }, localStorage: { getItem: () => "1" },
    setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {},
    Worker: class { constructor() { workers.push(this); } postMessage(m) { this.request = m; } terminate() { this.dead = true; } },
  });
  ctx.window = ctx;
  vm.runInContext(read(CLIENT), ctx, { filename: absSrc(CLIENT) });
  const pending = ctx.BitmapDecode.strip({}, 1, [1]);
  timers[0]();
  assert.equal(await pending, null);
  assert.equal(workers[0].dead, true);
  const next = ctx.BitmapDecode.strip({}, 1, [1]);
  assert.equal(workers.length, 2);
  workers[1].onmessage({ data: { type: "strip", seq: workers[1].request.seq, pix: new Uint8Array([1,2,3,4]), stride: 4 } });
  assert.deepEqual(Array.from((await next)[0]), [1,2,3,4]);
});

test("BitmapDecode prefers ScriptLoader.url for the worker cache key (audit4 I3 B6)", async () => {
  let keyed = null;
  const bmp = { width: 1, height: 1, close() {} };
  const main = vm.createContext({
    createImageBitmap: async () => { throw new Error("must use worker"); },
    location: { href: "http://x/" },
    window: { __APEX_BUILD: 99 },
    ScriptLoader: { url: (f) => { keyed = f + "?v=abcdef123456"; return keyed; } },
    URL, setTimeout, clearTimeout,
    Worker: class {
      constructor(src) { this.src = src; this.onmessage = null; }
      postMessage(m) {
        queueMicrotask(() => {
          if (this.onmessage) this.onmessage({ data: { type: "decoded", seq: m.seq, bmp } });
        });
      }
      terminate() {}
    },
  });
  vm.runInContext(read("js/workers/bitmap-decode-client.js").replace(/^const\b/gm, "var"), main, { filename: absSrc("js/workers/bitmap-decode-client.js") });
  assert.equal(await main.BitmapDecode.decode({ size: 1 }), bmp);
  assert.equal(keyed, "js/workers/bitmap-decode-worker.js?v=abcdef123456");
});

test("crossed strip/decode replies do not settle the wrong request shape", async () => {
  let worker;
  const ctx = vm.createContext({
    URL, location: { href: "http://x/" }, window: {},
    localStorage: { getItem: () => "1" },
    setTimeout: () => 1, clearTimeout() {}, Uint8Array,
    createImageBitmap: async () => ({ width: 2, height: 2, close() {} }),
    Worker: class {
      constructor() { worker = this; this.onmessage = null; }
      postMessage(m) { this.request = m; }
      terminate() {}
    },
  });
  ctx.window = ctx;
  vm.runInContext(read("js/workers/bitmap-decode-client.js").replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/workers/bitmap-decode-client.js") });

  // A strip reply must not resolve a decode as {pix,stride} — fall back instead.
  const decodePending = ctx.BitmapDecode.decode({ size: 1 });
  const decodeSeq = worker.request.seq;
  worker.onmessage({ data: { type: "strip", seq: decodeSeq, pix: new Uint8Array(4), stride: 4 } });
  const decodeOut = await decodePending;
  assert.equal(decodeOut.width, 2, "decode falls back to main-thread bitmap");
  assert.equal(decodeOut.pix, undefined);

  // A decoded reply for a strip request must close the bitmap and answer null.
  let closed = 0;
  const stripPending = ctx.BitmapDecode.strip(new Blob([new Uint8Array(4)]), 1, [1]);
  const stripSeq = worker.request.seq;
  worker.onmessage({
    data: { type: "decoded", seq: stripSeq, bmp: { width: 1, height: 1, close() { closed++; } } },
  });
  assert.equal(await stripPending, null);
  assert.equal(closed, 1, "crossed ImageBitmap is closed, not leaked");

  // A strip lane error reply answers null (no throw out of strip()).
  const errPending = ctx.BitmapDecode.strip(new Blob([new Uint8Array(4)]), 1, [1]);
  worker.onmessage({ data: { type: "error", seq: worker.request.seq, message: "boom" } });
  assert.equal(await errPending, null);
});
