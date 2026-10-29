// js/workers/bitmap-decode-worker.js + bitmap-decode-client.js: pack-strip
// lane only (apex26.packDecodeWorker). ImageBitmap "decode" port retired —
// no production caller (assets.js uses stripEnabled/strip only).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const CLIENT = "js/workers/bitmap-decode-client.js";
const WORKER = "js/workers/bitmap-decode-worker.js";

test("bitmap-decode-worker ignores a retired decode port (no reply)", async () => {
  const posted = [];
  const ctx = vm.createContext({
    createImageBitmap: async () => { throw new Error("decode port retired"); },
    postMessage: (m) => posted.push(m),
    DecompressionStream, DataView, Uint8Array, Promise,
  });
  ctx.self = ctx;
  vm.runInContext(read(WORKER), ctx, { filename: absSrc(WORKER) });
  await ctx.onmessage({ data: { type: "decode", seq: 1, blob: { size: 4 } } });
  assert.equal(posted.length, 0);
});

test("bitmap-decode-worker strip error does not throw out of onmessage", async () => {
  const posted = [];
  const ctx = vm.createContext({
    DecompressionStream, DataView, Uint8Array, Promise,
    postMessage: (m) => posted.push(m),
  });
  ctx.self = ctx;
  vm.runInContext(read(WORKER), ctx, { filename: absSrc(WORKER) });
  await ctx.onmessage({ data: { type: "strip", seq: 7, blob: null, size: 1, layers: 1 } });
  assert.equal(posted[0].type, "error");
  assert.equal(posted[0].seq, 7);
  assert.match(posted[0].message, /missing blob/);
});

test("BitmapDecode exports only strip / stripEnabled / drop", () => {
  const ctx = vm.createContext({
    URL, location: { href: "http://x/" }, window: {},
    localStorage: { getItem: () => null },
  });
  ctx.window = ctx;
  vm.runInContext(read(CLIENT), ctx, { filename: absSrc(CLIENT) });
  const keys = Object.keys(ctx.BitmapDecode).sort();
  assert.deepEqual(keys, ["drop", "strip", "stripEnabled"]);
  assert.equal("decode" in ctx.BitmapDecode, false);
  assert.equal("supported" in ctx.BitmapDecode, false);
  assert.equal("DEFAULT_OPTS" in ctx.BitmapDecode, false);
});

test("PngStrip exports only decode (unfilterRows stays internal)", () => {
  const ctx = vm.createContext({
    DecompressionStream, DataView, Uint8Array, Promise,
    postMessage() {},
  });
  ctx.self = ctx;
  vm.runInContext(read(WORKER), ctx, { filename: absSrc(WORKER) });
  assert.deepEqual(Object.keys(ctx.PngStrip).sort(), ["decode"]);
});

function stripClient({ flag = "1" } = {}) {
  let worker, timer, clears = 0;
  const ctx = vm.createContext({
    URL, location: { href: "http://x/" }, window: {}, Uint8Array,
    localStorage: { getItem: () => flag },
    setTimeout: (fn) => { timer = fn; return 1; }, clearTimeout: () => clears++,
    Worker: class { constructor() { worker = this; } postMessage(m) { this.request = m; } terminate() { this.dead = true; } },
  });
  ctx.window = ctx;
  vm.runInContext(read(CLIENT), ctx, { filename: absSrc(CLIENT) });
  return {
    api: ctx.BitmapDecode,
    get worker() { return worker; },
    fire: () => timer(),
    get clears() { return clears; },
  };
}

test("client strip deadline retires its worker and lets a later strip respawn", async () => {
  const h = stripClient();
  const pending = h.api.strip({}, 1, [1]);
  h.fire();
  assert.equal(await pending, null);
  assert.equal(h.worker.dead, true);
  assert.equal(h.clears, 1);
  const next = h.api.strip({}, 1, [1]);
  h.worker.onmessage({ data: { type: "strip", seq: h.worker.request.seq, pix: new Uint8Array([1, 2, 3, 4]), stride: 4 } });
  assert.deepEqual(Array.from((await next)[0]), [1, 2, 3, 4]);
});

test("BitmapDecode prefers ScriptLoader.url for the worker cache key (audit4 I3 B6)", async () => {
  let keyed = null;
  const main = vm.createContext({
    location: { href: "http://x/" },
    window: { __APEX_BUILD: 99 },
    localStorage: { getItem: () => "1" },
    ScriptLoader: { url: (f) => { keyed = f + "?v=abcdef123456"; return keyed; } },
    URL, setTimeout, clearTimeout, Uint8Array,
    Worker: class {
      constructor(src) { this.src = src; this.onmessage = null; }
      postMessage(m) {
        queueMicrotask(() => {
          if (this.onmessage) {
            this.onmessage({ data: { type: "strip", seq: m.seq, pix: new Uint8Array(4), stride: 4 } });
          }
        });
      }
      terminate() {}
    },
  });
  main.window = main;
  vm.runInContext(read(CLIENT), main, { filename: absSrc(CLIENT) });
  const out = await main.BitmapDecode.strip(new Blob([new Uint8Array(4)]), 1, [1]);
  assert.ok(out && out[0]);
  assert.equal(keyed, "js/workers/bitmap-decode-worker.js?v=abcdef123456");
  assert.match(keyed, /bitmap-decode-worker/);
});

test("crossed / error replies to strip answer null and close any ImageBitmap", async () => {
  const h = stripClient();
  let closed = 0;
  const stripPending = h.api.strip(new Blob([new Uint8Array(4)]), 1, [1]);
  const stripSeq = h.worker.request.seq;
  h.worker.onmessage({
    data: { type: "decoded", seq: stripSeq, bmp: { width: 1, height: 1, close() { closed++; } } },
  });
  assert.equal(await stripPending, null);
  assert.equal(closed, 1, "crossed ImageBitmap is closed, not leaked");

  const errPending = h.api.strip(new Blob([new Uint8Array(4)]), 1, [1]);
  h.worker.onmessage({ data: { type: "error", seq: h.worker.request.seq, message: "boom" } });
  assert.equal(await errPending, null);
});

test("stale strip replies after drop+respawn do not settle the new request", async () => {
  const workers = [];
  const ctx = vm.createContext({
    URL, location: { href: "http://x/" }, window: {}, Uint8Array,
    localStorage: { getItem: () => "1" },
    setTimeout: () => 1, clearTimeout() {},
    Worker: class {
      constructor() { workers.push(this); this.onmessage = null; }
      postMessage(m) { this.request = m; }
      terminate() {}
    },
  });
  ctx.window = ctx;
  vm.runInContext(read(CLIENT), ctx, { filename: absSrc(CLIENT) });
  const pending = ctx.BitmapDecode.strip({}, 1, [1]);
  const old = workers[0];
  const seq = old.request.seq;
  ctx.BitmapDecode.drop();
  assert.equal(await pending, null);
  const next = ctx.BitmapDecode.strip({}, 1, [1]);
  assert.equal(workers.length, 2);
  old.onmessage({ data: { type: "strip", seq, pix: new Uint8Array([9, 9, 9, 9]), stride: 4 } });
  workers[1].onmessage({ data: { type: "strip", seq: workers[1].request.seq, pix: new Uint8Array([1, 2, 3, 4]), stride: 4 } });
  assert.deepEqual(Array.from((await next)[0]), [1, 2, 3, 4]);
});

test("corpse postMessage failure clears _w so the next strip can respawn", async () => {
  let workers = 0, last;
  const ctx = vm.createContext({
    URL, location: { href: "http://x/" }, window: {}, Uint8Array,
    localStorage: { getItem: () => "1" },
    setTimeout: () => 1, clearTimeout() {},
    Worker: class {
      constructor() {
        workers++;
        last = this;
        this.dead = false;
      }
      postMessage(m) {
        if (this.dead) throw Object.assign(new Error("InvalidStateError"), { name: "InvalidStateError" });
        this.request = m;
      }
      terminate() { this.dead = true; }
    },
  });
  ctx.window = ctx;
  vm.runInContext(read(CLIENT), ctx, { filename: absSrc(CLIENT) });
  // Attach a worker, then terminate it WITHOUT drop() so `_w` still points at the corpse.
  const stale = ctx.BitmapDecode.strip({}, 1, [1]);
  assert.equal(workers, 1);
  last.terminate();
  // This postMessage throws → drop() clears `_w` (and rejects `stale`) → strip answers null.
  const cleared = ctx.BitmapDecode.strip({}, 1, [1]);
  assert.equal(await stale, null);
  assert.equal(await cleared, null);
  assert.equal(workers, 1, "null answer does not spawn; corpse must be cleared");
  const next = ctx.BitmapDecode.strip({}, 1, [1]);
  assert.equal(workers, 2, "respawn after corpse postMessage failure");
  last.onmessage({ data: { type: "strip", seq: last.request.seq, pix: new Uint8Array(4), stride: 4 } });
  assert.ok(await next);
});
