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
