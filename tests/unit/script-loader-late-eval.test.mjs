/* script-loader-late-eval.test.mjs — a strict lazy <script> removed at the
 * deadline still evaluates when its fetch lands (HTML: removal does not cancel
 * "execute the script element"). A strict retry before that late evaluation
 * must not inject a second copy — its top-level const would throw a
 * redeclaration SyntaxError. The retry waits for the stranded copy; only a
 * fetch still silent after one more deadline gets a second tag.
 *
 * Run: node --test tests/unit/script-loader-late-eval.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { absSrc } from "../helpers/abs-src.mjs";

const loader = readFileSync(new URL("../../js/core/script-loader.js", import.meta.url), "utf8");

function rig() {
  const scripts = [];
  const ctx = vm.createContext({
    ApexRoster: { DEFERRED_EDGES: [] }, Log: { warn() {} },
    UpdateCheck: { prepareLazyLoad: async () => true, blocksLazyLoad: () => false },
    window: { __APEX_BUILD: "t", setTimeout, clearTimeout },
    document: {
      createElement: () => ({ dataset: {}, removed: false, remove() { this.removed = true; } }),
      head: { appendChild(el) { scripts.push(el); } },   // the fetch hangs until the test fires it
    },
  });
  vm.runInContext(loader + "\nthis.ScriptLoader = ScriptLoader;", ctx, { filename: absSrc("js/core/script-loader.js") });
  return { api: ctx.ScriptLoader, scripts };
}
const opts = { strict: true, deadlineMs: 40, slowMs: 1000 };

test("a strict retry waits for the timed-out copy instead of injecting a second one", async () => {
  const r = rig();
  assert.equal(await r.api.create().load(["late.js"], [], opts), false, "the first attempt hits its deadline");
  assert.equal(r.scripts.length, 1);
  assert.equal(r.scripts[0].removed, true);
  assert.equal(typeof r.scripts[0].onload, "function", "the removed tag keeps a late-load listener");
  const retry = r.api.create().load(["late.js"], [], opts);
  await new Promise((res) => setImmediate(res));
  assert.equal(r.scripts.length, 1, "no second <script> while the first can still evaluate");
  r.scripts[0].onload();   // the stalled fetch lands and the file evaluates
  assert.equal(await retry, true);
  assert.equal(r.scripts.length, 1);
  // A later strict load in the same tab sees the late evaluation.
  assert.equal(await r.api.create().load(["late.js"], [], opts), true);
  assert.equal(r.scripts.length, 1);
});

test("a late load that lands before the retry is already counted as evaluated", async () => {
  const r = rig();
  assert.equal(await r.api.create().load(["late.js"], [], opts), false);
  r.scripts[0].onload();
  assert.equal(await r.api.create().load(["late.js"], [], opts), true);
  assert.equal(r.scripts.length, 1);
});

test("a stranded fetch still silent after one more deadline gets a second tag", async () => {
  const r = rig();
  assert.equal(await r.api.create().load(["dead.js"], [], opts), false);
  const retry = r.api.create().load(["dead.js"], [], opts);
  await new Promise((res) => setTimeout(res, 70));
  assert.equal(r.scripts.length, 2, "the wait is bounded: a dead fetch does not block the door for good");
  r.scripts[1].onload();
  assert.equal(await retry, true);
});

test("a late error releases the retry at once", async () => {
  const r = rig();
  assert.equal(await r.api.create().load(["err.js"], [], opts), false);
  const retry = r.api.create().load(["err.js"], [], opts);
  await new Promise((res) => setImmediate(res));
  r.scripts[0].onerror();
  await new Promise((res) => setImmediate(res));
  assert.equal(r.scripts.length, 2);
  r.scripts[1].onload();
  assert.equal(await retry, true);
});
