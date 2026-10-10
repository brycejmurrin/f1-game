// js/track/build-client.js — the build Worker's lifecycle on the page side
// (R3-ASYNC-2): no title-idle spawn for players, and a drop settles every
// waiter. The worker side and world parity are tests/unit/build-worker.test.mjs.
// Run: node --test tests/unit/build-client-drop.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/track/build-client.js"), "utf8");

// answer: "never" (init hangs, a lie-fi importScripts) | "ok" (ready, then a build error answer)
function client({ answer = "never", lazyV = null } = {}) {
  const mem = new Map([["apex26.buildWorker", "1"]]);
  const made = [], idles = [];
  const ctx = vm.createContext({ Promise, Map, Set, URL, setTimeout, clearTimeout,
    Log: { info() {}, warn() {}, debug() {} }, window: { __APEX_BUILD: 7 }, location: { href: "http://x/index.html" },
    document: { querySelectorAll: () => [], readyState: "loading", addEventListener() {},
      getElementById: (id) => (id === "apex-lazy-v" && lazyV ? { textContent: JSON.stringify(lazyV) } : null) },
    localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) },
    requestIdleCallback: (fn) => { idles.push(fn); return idles.length; },
    ApexRoster: { TRACK_VM: ["js/track/core/geom.js"], TRACK_WORKER_EXTRA: [] },
    Worker: class {
      constructor(u) { this.url = u; this.posted = []; this.messages = []; this.terminated = 0; made.push(this); }
      postMessage(m) {
        this.posted.push(m.type); this.messages.push(m);
        if (answer !== "ok") return;
        const reply = m.type === "init" ? { type: "ready" } : { type: "error", seq: m.seq, message: "stub" };
        setTimeout(() => this.onmessage && this.onmessage({ data: reply }), 0);
      }
      terminate() { this.terminated++; }
    } });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/core/script-loader.js"), "utf8"), ctx, { filename: "script-loader.js" });
  vm.runInContext(SRC, ctx, { filename: "build-client.js" });
  return { C: vm.runInContext("TrackBuildClient", ctx), made, idles, mem };
}
const DEF = { id: "monza" }, OPTS = { night: false, gridSlots: 20 }, GFX = { mobileTier: false };
const within = (p, ms) => Promise.race([p.then((v) => ({ v })), new Promise((r) => setTimeout(() => r("PENDING"), ms))]);

test("a build waiting on the worker's init resolves null when the worker is dropped", async () => {
  const { C, made } = client({ answer: "never" });
  const waiting = C.build(0, DEF, OPTS, GFX, null);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(made.length, 1, "the posted build spawned the worker");
  C.set(false);   // BUILD IN BACKGROUND off mid-init
  assert.deepEqual(await within(waiting, 200), { v: null }, "the waiter is settled, not hung for the session");
});

test("after a drop a same-key build is not deduped onto the dead request", async () => {
  const { C, made, mem } = client({ answer: "never" });
  const first = C.build(0, DEF, OPTS, GFX, null);
  await new Promise((r) => setTimeout(r, 0));
  C.set(false);
  await within(first, 200);
  mem.set("apex26.buildWorker", "1");
  const second = C.build(0, DEF, OPTS, GFX, null);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(made.length, 2, "a fresh worker for the new request");
  assert.equal(made[0].terminated, 1);
  C.set(false);
  assert.deepEqual(await within(second, 200), { v: null });
});

test("idleWarm spawns nothing for a player; the first posted build does", async () => {
  const { C, made, idles } = client({ answer: "ok" });
  assert.equal(C.idleWarm(false), null, "nothing to report yet");
  assert.equal(C.idleWarm(), null, "a bare call is safe and inert");
  assert.equal(idles.length, 0, "no idle spawn queued");
  assert.equal(made.length, 0, "no worker at the title");
  assert.equal(await C.build(0, DEF, OPTS, GFX, null), null, "the stub answers an error: null, build in steps");
  assert.equal(made.length, 1, "spawned by the posted build");
  assert.deepEqual(made[0].posted, ["init", "build"]);
});

test("idleWarm still warms the worker for the agent surface", async () => {
  const { C, made, idles } = client({ answer: "ok" });
  C.idleWarm(true);
  assert.equal(idles.length, 1);
  idles[0]();
  assert.equal(made.length, 1);
  assert.equal(await C.spawn(), true, "ready before any build is posted");
});

test("the worker and its scenery import use the deploy's content-hash key (R3-PHONE-8)", async () => {
  const lazyV = { "js/track/build-worker.js": "0123456789ab", "js/circuits/scenery/monza.js": "ba9876543210" };
  const { C, made } = client({ answer: "ok", lazyV });
  await C.build(0, DEF, OPTS, GFX, "js/circuits/scenery/monza.js");
  assert.equal(made[0].url, "http://x/js/track/build-worker.js?v=0123456789ab");
  assert.equal(made[0].messages[1].scenery, "http://x/js/circuits/scenery/monza.js?v=ba9876543210");
  const bare = client({ answer: "ok" });
  bare.C.spawn();
  assert.equal(bare.made[0].url, "http://x/js/track/build-worker.js?v=7", "no map (dev shell): the build, as before");
});
