/* script-loader-throw.test.mjs — a throw while preparing a lazy inject must fail
 * the FILE, not stall the whole group.
 *
 * inject() is async: a throw in UpdateCheck.prepareLazyLoad (or its Promise
 * executor) rejects it. pump() had no rejection handler, so `inflight` never
 * drained and loadBackendScripts (and every ensure* / the backend boot) awaited
 * forever. Run: node --test tests/unit/script-loader-throw.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const loader = readFileSync(new URL("../../js/core/script-loader.js", import.meta.url), "utf8");

function load(files, opts, prepare) {
  const warns = [];
  const ctx = vm.createContext({
    ApexRoster: { DEFERRED_EDGES: [] },
    window: { __APEX_BUILD: "t" },
    Log: { warn: (_ns, m) => warns.push(m) },
    UpdateCheck: { prepareLazyLoad: prepare, blocksLazyLoad: () => false },
    document: {
      createElement: () => ({ dataset: {}, remove() {} }),
      head: { appendChild(el) { queueMicrotask(() => el.onload()); } },
    },
  });
  vm.runInContext(loader + "\nthis.ScriptLoader = ScriptLoader;", ctx);
  const done = ctx.ScriptLoader.create().load(files, [], opts);
  const hang = new Promise((r) => setTimeout(() => r("HUNG"), 500));
  return Promise.race([done, hang]).then((v) => ({ v, warns }));
}

for (const strict of [false, true]) {
  test(`prepareLazyLoad throwing settles the load as failed (strict=${strict})`, async () => {
    let calls = 0;
    const { v, warns } = await load(["a.js", "b.js"], { strict }, async () => {
      if (++calls === 1) throw new Error("update check blew up");
      return true;
    });
    assert.equal(v, false, "settled false instead of never settling");
    assert.ok(warns.some((m) => /a\.js/.test(m)), "the failure is logged against its file");
  });
}

test("a healthy prepareLazyLoad still loads everything", async () => {
  const { v } = await load(["a.js", "b.js"], {}, async () => true);
  assert.equal(v, true);
});
