/* script-loader-starved.test.mjs — #3157: a lazy file that ARRIVED during a
 * main-thread stall must not be counted failed by the deadline.
 *
 * Virtual clock + scheduler: stall(ms) jumps time and runs each due timer once
 * (the starved thread skips its intermediate beats), then the queued load event
 * fires. Run: node --test tests/unit/script-loader-starved.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const loader = readFileSync(new URL("../../js/core/script-loader.js", import.meta.url), "utf8");

function rig() {
  let now = 0, seq = 0;
  const timers = new Map();
  const warns = [];
  const els = [];
  const FakeDate = { now: () => now };
  const ctx = vm.createContext({
    ApexRoster: { DEFERRED_EDGES: [] }, Date: FakeDate,
    window: {
      __APEX_BUILD: "t",
      setTimeout: (fn, ms) => { timers.set(++seq, { fn, due: now + ms }); return seq; },
      clearTimeout: (id) => timers.delete(id),
    },
    Log: { warn: (_n, m) => warns.push(m) },
    UpdateCheck: { prepareLazyLoad: async () => true, blocksLazyLoad: () => false },
    document: { createElement: () => ({ dataset: {}, remove() {} }), head: { appendChild(el) { els.push(el); } } },
  });
  vm.runInContext(loader + "\nthis.ScriptLoader = ScriptLoader;", ctx);
  const stall = (ms) => {
    now += ms;
    const due = [...timers].filter(([, t]) => t.due <= now).sort((a, b) => a[1].due - b[1].due);
    for (const [id, t] of due) { if (timers.delete(id)) t.fn(); }
  };
  const flush = () => new Promise((r) => setImmediate(r));
  return { ctx, stall, flush, els, warns };
}

test("a stall far past the deadline does not fail a file whose load event is queued", async () => {
  const r = rig();
  const p = r.ctx.ScriptLoader.create().load(["monaco.js"], [], { strict: true });
  await r.flush();
  r.stall(60000);               // main thread starved for 60 s, deadline is 25 s
  r.els[0].onload();            // the fetched script's load task finally runs
  assert.equal(await p, true);
  assert.deepEqual(r.warns, []);
});

test("a file that never loads still fails after the deadline of responsive time", async () => {
  const r = rig();
  const p = r.ctx.ScriptLoader.create().load(["hung.js"], [], { strict: true });
  await r.flush();
  for (let i = 0; i < 40; i++) r.stall(1000);   // healthy 1 s beats, no load event
  assert.equal(await p, false);
  assert.ok(r.warns.some((m) => /timed out after 25000 ms: hung\.js/.test(m)));
});
