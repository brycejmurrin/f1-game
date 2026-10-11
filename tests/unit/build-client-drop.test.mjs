/* build-client-drop.test.mjs — TrackBuildClient must never leave a build waiting on a
 * worker that is gone or wedged.
 *
 * drop() never settled the spawn() readiness promise, so BUILD IN BACKGROUND turned
 * off while the worker was still parsing left post() awaiting it forever:
 * loadTrackStepped never completed and busy() (the in-flight count) blocked every
 * synchronous build. A worker that came up but never answered did the same.
 * Run: node --test tests/unit/build-client-drop.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../../js/track/build-client.js", import.meta.url), "utf8");

function page(globals = {}) {
  const workers = [], timers = [], warns = [];
  const store = new Map([["apex26.buildWorker", "1"]]);
  class FakeWorker {
    constructor() { this.posts = []; this.terminated = false; workers.push(this); }
    postMessage(m) { this.posts.push(m); }
    terminate() { this.terminated = true; }
  }
  const ctx = vm.createContext({
    console, URL, Promise,
    Worker: FakeWorker,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) },
    location: { href: "https://example.test/index.html" },
    document: { readyState: "complete", getElementById: () => null, querySelectorAll: () => [] },
    ApexRoster: { TRACK_VM: ["fixture-track-a.js"], TRACK_WORKER_EXTRA: [] },
    Log: { warn: (_ns, m) => warns.push(m), info() {} },
    // Manual clock: the 30 s answer cap is fired by the test, not waited for.
    setTimeout: (fn, ms) => { timers.push({ fn, ms, live: true }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].live = false; },
    ...globals,
  });
  ctx.window = ctx;
  vm.runInContext(src, ctx, { filename: "js/track/build-client.js" });
  const fire = () => { for (const t of timers) if (t.live) { t.live = false; t.fn(); } };
  return { client: ctx.TrackBuildClient, workers, warns, fire };
}

const def = { id: "monza" }, opts = { night: false, gridSlots: 20 }, gfx = {};
const settle = () => new Promise((r) => setImmediate(r));

test("turning BUILD IN BACKGROUND off while the worker is still loading settles the build with null", async () => {
  const { client, workers } = page();
  client.spawn();
  assert.equal(workers.length, 1);
  const built = client.build(0, def, opts, gfx, null);   // awaiting the worker's "ready"
  await settle();
  assert.equal(client.busy(), true, "a build is out at the worker");
  client.set(false);
  assert.equal(await built, null, "no worker: the caller builds in steps");
  assert.equal(client.busy(), false, "nothing blocks a synchronous build any more");
  assert.equal(workers[0].terminated, true);
});

test("a worker that is up but never answers is dropped after the answer cap", async () => {
  const { client, workers, fire, warns } = page();
  client.spawn();
  workers[0].onmessage({ data: { type: "ready" } });
  const built = client.build(0, def, opts, gfx, null);
  await settle();
  assert.equal(workers[0].posts.at(-1).type, "build", "the build was posted");
  assert.equal(client.busy(), true);
  fire();
  assert.equal(await built, null);
  assert.equal(client.busy(), false);
  assert.equal(workers[0].terminated, true);
  assert.ok(warns.some((m) => /no answer/.test(m)));
});

test("a worker that never reports ready is dropped after the same cap", async () => {
  const { client, workers, fire } = page();
  const built = client.build(0, def, opts, gfx, null);
  await settle();
  fire();
  assert.equal(await built, null);
  assert.equal(client.busy(), false);
  assert.equal(workers[0].terminated, true);
});

test("a prompt answer is unaffected and clears its timer", async () => {
  const { client, workers, fire } = page();
  client.spawn();
  workers[0].onmessage({ data: { type: "ready" } });
  const built = client.build(0, def, opts, gfx, null);
  await settle();
  const seq = workers[0].posts.at(-1).seq;
  workers[0].onmessage({ data: { type: "built", seq, id: "monza", models: [] } });
  const m = await built;
  assert.equal(m.type, "built");
  fire();   // the answered build's timer is cleared: firing the clock changes nothing
  assert.equal(workers[0].terminated, false);
});

test("a reply whose model comparison throws still settles the build with null and clears busy()", async () => {
  // missingModels runs AFTER the entry left _pending, so neither drop() nor the answer
  // timer can reach it: the handler itself has to settle it.
  const { client, workers, warns, fire } = page({
    Assets: { modelIds() { throw new Error("model table unreadable"); }, modelSync: () => true },
  });
  client.spawn();
  workers[0].onmessage({ data: { type: "ready" } });
  const built = client.build(0, def, opts, gfx, null);
  await settle();
  const seq = workers[0].posts.at(-1).seq;
  workers[0].onmessage({ data: { type: "built", seq, id: "monza", models: [] } });
  assert.equal(await built, null, "the caller builds in steps");
  assert.equal(client.busy(), false);
  assert.ok(warns.some((m) => /model table unreadable/.test(m)), "logged, not swallowed");
  assert.equal(workers[0].terminated, false, "one bad reply does not cost the worker");
  fire();   // the answer timer was cleared by the settle: nothing left to drop
  assert.equal(workers[0].terminated, false);
});
