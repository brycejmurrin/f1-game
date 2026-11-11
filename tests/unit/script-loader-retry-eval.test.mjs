/* script-loader-retry-eval.test.mjs — #3295: a strict load that evaluates the
 * first classic script then fails the second must not re-append the first on a
 * fresh ScriptLoader retry (empty opts.loaded). Re-inserting redeclares
 * top-level const and leaves the career door on could-not-load until reload.
 *
 * Run: node --test tests/unit/script-loader-retry-eval.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import * as espree from "espree";
import * as eslintScope from "eslint-scope";
import { fnSource } from "../helpers/fn-source.mjs";
import { readFileSync } from "node:fs";
import { absSrc } from "../helpers/abs-src.mjs";

const loader = readFileSync(new URL("../../js/core/script-loader.js", import.meta.url), "utf8");

function rig({ failOn } = {}) {
  const appended = [];
  const ctx = vm.createContext({
    ApexRoster: { DEFERRED_EDGES: [] },
    window: { __APEX_BUILD: "t", setTimeout, clearTimeout },
    Log: { warn() {} },
    UpdateCheck: { prepareLazyLoad: async () => true, blocksLazyLoad: () => false },
    document: {
      createElement: () => ({ dataset: {}, remove() {} }),
      head: {
        appendChild(el) {
          appended.push(el);
          queueMicrotask(() => {
            if (failOn && el.src && el.src.indexOf(failOn) !== -1) el.onerror();
            else el.onload();
          });
        },
      },
    },
  });
  vm.runInContext(loader + "\nthis.ScriptLoader = ScriptLoader;", ctx, { filename: absSrc("js/core/script-loader.js") });
  const flush = () => new Promise((r) => setImmediate(r));
  return { ctx, appended, flush };
}

test("retry after a sibling failure does not re-inject a script that already evaluated", async () => {
  // Career UI: create().load → fail → _load = null → create().load again with
  // no opts.loaded. First file already ran; only the failed sibling is fetched.
  const r = rig({ failOn: "b.js" });
  const first = r.ctx.ScriptLoader.create().load(["a.js", "b.js"], [], { strict: true });
  assert.equal(await first, false, "first attempt fails on b.js");
  await r.flush();
  const afterFail = r.appended.map((el) => el.src);
  assert.deepEqual(afterFail, ["a.js?v=t", "b.js?v=t"], "both files were attempted once");

  const second = r.ctx.ScriptLoader.create().load(["a.js", "b.js"], [], { strict: true });
  assert.equal(await second, false, "retry still fails while b.js errors");
  await r.flush();
  const srcs = r.appended.map((el) => el.src);
  assert.deepEqual(srcs, ["a.js?v=t", "b.js?v=t", "b.js?v=t"],
    "a.js is not appended again; only b.js is re-fetched");
});

test("a healthy retry after the failed sibling recovers still skips the evaluated file", async () => {
  const appended = [];
  let failB = true;
  const ctx = vm.createContext({
    ApexRoster: { DEFERRED_EDGES: [] },
    window: { __APEX_BUILD: "t", setTimeout, clearTimeout },
    Log: { warn() {} },
    UpdateCheck: { prepareLazyLoad: async () => true, blocksLazyLoad: () => false },
    document: {
      createElement: () => ({ dataset: {}, remove() {} }),
      head: {
        appendChild(el) {
          appended.push(el);
          queueMicrotask(() => {
            if (failB && el.src && el.src.indexOf("b.js") !== -1) el.onerror();
            else el.onload();
          });
        },
      },
    },
  });
  vm.runInContext(loader + "\nthis.ScriptLoader = ScriptLoader;", ctx, { filename: absSrc("js/core/script-loader.js") });
  assert.equal(await ctx.ScriptLoader.create().load(["a.js", "b.js"], [], { strict: true }), false);
  failB = false;
  assert.equal(await ctx.ScriptLoader.create().load(["a.js", "b.js"], [], { strict: true }), true);
  assert.deepEqual(appended.map((el) => el.src), ["a.js?v=t", "b.js?v=t", "b.js?v=t"],
    "recovery injects only the file that had not evaluated");
});

test("concurrent strict loads insert one classic script and both await it", async () => {
  const appended = [];
  let finish;
  const ctx = vm.createContext({
    ApexRoster: { DEFERRED_EDGES: [] },
    window: { __APEX_BUILD: "t", setTimeout, clearTimeout },
    UpdateCheck: { prepareLazyLoad: async () => true, blocksLazyLoad: () => false },
    document: {
      createElement: () => ({ dataset: {}, remove() {} }),
      head: { appendChild(el) { appended.push(el); finish = () => el.onload(); } },
    },
  });
  vm.runInContext(loader + "\nthis.ScriptLoader = ScriptLoader;", ctx, { filename: absSrc("js/core/script-loader.js") });
  const first = ctx.ScriptLoader.create().load(["js/net/qr.js"], [], { strict: true });
  const second = ctx.ScriptLoader.create().load(["js/net/qr.js"], [], { strict: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(appended.length, 1, "a second strict caller must not redeclare NetQr");
  finish();
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(appended.length, 1);
});

// Manually dispatched browser events make policy/event ordering observable without
// wall-clock sleeps. Each rig owns one tab's evaluation registry.
function lifecycleRig() {
  const scripts = [], links = [], timers = new Map();
  let nextTimer = 0;
  const ctx = vm.createContext({
    ApexRoster: { DEFERRED_EDGES: [] }, Log: { warn() {} },
    window: { __APEX_BUILD: 'life', setTimeout(fn) { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout(id) { timers.delete(id); } },
    document: {
      createElement: tag => ({ tag, dataset: {}, remove() {} }),
      head: { appendChild(el) { (el.tag === 'script' ? scripts : links).push(el); } },
    },
  });
  vm.runInContext(loader + '\nthis.ScriptLoader = ScriptLoader;', ctx);
  return { api: ctx.ScriptLoader, scripts, links, timers, flush: () => new Promise(r => setImmediate(r)) };
}

test('shared strict insertion retains each caller readiness and partial-success ownership', async () => {
  const r = lifecycleRig(), accepted = new Set(), refused = new Set(), ready = [];
  const a = r.api.create().load(['shared.js'], [], { strict: true, loaded: accepted, ready: src => { ready.push('owner:' + src); return true; } });
  const b = r.api.create().load(['shared.js'], [], { strict: true, loaded: refused, ready: src => { ready.push('waiter:' + src); return false; } });
  await r.flush();
  assert.equal(r.scripts.length, 1);
  r.scripts[0].onload();
  assert.deepEqual(ready, ['owner:shared.js'], 'insertion owner checks readiness inside the load event');
  assert.deepEqual(await Promise.all([a, b]), [true, false]);
  assert.deepEqual(ready, ['owner:shared.js', 'waiter:shared.js']);
  assert.deepEqual([...accepted], ['shared.js']); assert.equal(refused.size, 0);
  assert.equal(r.timers.size, 0, 'shared insertion releases both responsive timers');
});

test('strict failure drains started siblings, retains their success and does not start successors', async () => {
  const r = lifecycleRig(), loaded = new Set(), settled = [];
  let finished = false;
  const p = r.api.create().load(['bad.js', 'good.js', 'dependent.js'], [['good.js', 'dependent.js']],
    { strict: true, loaded, onSettled: src => settled.push(src) }).then(ok => { finished = true; return ok; });
  await r.flush();
  assert.deepEqual(r.scripts.map(s => s.src), ['bad.js?v=life', 'good.js?v=life']);
  r.scripts[0].onerror(); await r.flush();
  assert.equal(finished, false, 'failure waits for already-started sibling');
  r.scripts[1].onload(); assert.equal(await p, false);
  assert.deepEqual([...loaded], ['good.js']); assert.deepEqual(settled, ['good.js']);
  assert.equal(r.scripts.length, 2); assert.equal(r.timers.size, 0);
  const retry = r.api.create().load(['bad.js', 'good.js', 'dependent.js'], [['good.js', 'dependent.js']], { strict: true, loaded });
  await r.flush();
  assert.deepEqual(r.scripts.slice(2).map(s => s.src), ['bad.js?v=life', 'dependent.js?v=life']);
  r.scripts[2].onload(); r.scripts[3].onload(); assert.equal(await retry, true);
  assert.equal(r.timers.size, 0);
});

test('non-strict failed predecessor permits successor while readiness failure does not transient-retry', async () => {
  const r = lifecycleRig(), loaded = new Set(), events = [];
  const p = r.api.create().load(['not-ready.js', 'after.js'], [['not-ready.js', 'after.js']], {
    loaded, ready: src => { events.push(src); return src !== 'not-ready.js'; },
  });
  await r.flush(); r.scripts[0].onload();
  assert.deepEqual(events, ['not-ready.js']);
  assert.equal(r.scripts.length, 1, 'successor is scheduled after the event settles');
  await r.flush();
  assert.deepEqual(r.scripts.map(s => s.src), ['not-ready.js?v=life', 'after.js?v=life']);
  r.scripts[1].onload(); assert.equal(await p, false);
  assert.deepEqual([...loaded], ['after.js']); assert.equal(r.timers.size, 0);
});

// Check lexical authority, not source layout: the graph may call its injected
// attempt function, but cannot quietly reach into the browser or page registry.
function ambientReads(source) {
  const ast = espree.parse(source, { ecmaVersion: 2022, range: true });
  return [...new Set(eslintScope.analyze(ast, { ecmaVersion: 2022 }).globalScope.through.map(ref => ref.identifier.name))];
}

test('graph and browser attempt retain separate lexical authority', () => {
  const graphAllowed = new Set(['Promise', 'Log']);
  const browserAllowed = new Set(['Promise', 'document', 'window', 'SLOW_MS', 'DEADLINE_MS', 'Math', 'Date', 'Log']);
  const denied = (source, allowed) => ambientReads(source).filter(name => !allowed.has(name));
  assert.deepEqual(denied(fnSource(loader, 'function runLoadGraph('), graphAllowed), []);
  assert.deepEqual(denied(fnSource(loader, 'function browserAttempt('), browserAllowed), []);
  assert.deepEqual(denied('function graph() { document.head.appendChild(script); }', graphAllowed), ['document', 'script']);
  assert.deepEqual(denied('function attempt() { evaluated.add(src); }', browserAllowed), ['evaluated', 'src']);
});
