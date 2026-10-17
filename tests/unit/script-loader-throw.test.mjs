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
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const loader = readFileSync(new URL("../../js/core/script-loader.js", import.meta.url), "utf8");

function load(files, opts, prepare) {
  const warns = [];
  const ctx = vm.createContext({
    ApexRoster: { DEFERRED_EDGES: [] },
    window: { __APEX_BUILD: "t", setTimeout, clearTimeout },
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

// Model the browser's SRI boundary: a successful generation check cannot
// authorize bytes published later at the same query-keyed Pages URL.
function integrityLoad(body, published, block, tagName = "SCRIPT") {
  const expected = "sha256-" + createHash("sha256").update(body).digest("base64");
  const appended = [];
  let executed = false;
  const ctx = vm.createContext({
    ApexRoster: { DEFERRED_EDGES: [] }, window: { __APEX_BUILD: 15717 }, setTimeout, clearTimeout,
    UpdateCheck: { prepareLazyLoad: async () => true, blocksLazyLoad: () => false },
    document: {
      getElementById(id) {
        if (id === "apex-lazy-v") return { textContent: JSON.stringify({ "audio.js": "dc460e50ab8e" }) };
        if (id === "apex-lazy-integrity" && block !== null) return { tagName, type: "application/json", textContent: block === undefined ? JSON.stringify({ "audio.js": expected }) : block };
        return null;
      },
      createElement: () => ({ dataset: {}, remove() {} }),
      head: { appendChild(el) {
        appended.push(el);
        queueMicrotask(() => {
          const actual = "sha256-" + createHash("sha256").update(published).digest("base64");
          if (el.integrity && el.integrity !== actual) el.onerror();
          else { executed = true; el.onload(); }
        });
      } },
    },
  });
  vm.runInContext(loader + "\nthis.ScriptLoader = ScriptLoader;", ctx);
  return ctx.ScriptLoader.create().load(["audio.js"], [], { strict: true }).then(ok => ({ ok, executed, appended, expected }));
}

test("full SRI rejects new deployment bytes after a successful version check", async () => {
  const result = await integrityLoad("old audio", "new audio");
  assert.equal(result.ok, false);
  assert.equal(result.executed, false);
  assert.equal(result.appended[0].src, "audio.js?v=dc460e50ab8e");
  assert.equal(result.appended[0].integrity, result.expected);
  assert.equal(result.appended[0].crossOrigin, "anonymous");
});

test("matching bytes load and old shells without an integrity block stay compatible", async () => {
  assert.equal((await integrityLoad("old", "old")).ok, true);
  assert.equal((await integrityLoad("old", "new", null)).ok, true);
});

for (const block of ["{", "{}", '{"audio.js":"sha256-dc460e50ab8e"}', '[]']) {
  test(`invalid or missing full digest refuses injection: ${block}`, async () => {
    const result = await integrityLoad("old", "new", block);
    assert.equal(result.ok, false);
    assert.equal(result.appended.length, 0);
  });
}

test("an unrelated DOM element is not deployment integrity metadata", async () => {
  const result = await integrityLoad("old", "new", "", "DIV");
  assert.equal(result.ok, true);
  assert.equal(result.appended[0].integrity, undefined);
});

// #2582: a file that never fires load/error must fail at the deadline (and
// signal "slow" first) instead of hanging the load forever.
test("a hung lazy file fails at the deadline after signalling slow", async () => {
  const removed = [], slow = [], warns = [];
  const ctx = vm.createContext({
    ApexRoster: { DEFERRED_EDGES: [] }, window: { __APEX_BUILD: "t", setTimeout, clearTimeout },
    Log: { warn: (_n, m) => warns.push(m) },
    UpdateCheck: { prepareLazyLoad: async () => true, blocksLazyLoad: () => false },
    document: {
      createElement: () => ({ dataset: {}, remove() { removed.push(1); } }),
      head: { appendChild() { /* never loads, never errors */ } },
    },
  });
  vm.runInContext(loader + "\nthis.ScriptLoader = ScriptLoader;", ctx);
  const t0 = Date.now();
  const ok = await ctx.ScriptLoader.create().load(["pit-lane.js"], [], { strict: true, slowMs: 30, deadlineMs: 120, onSlow: (s) => slow.push(s) });
  assert.equal(ok, false);
  assert.deepEqual(slow, ["pit-lane.js"]);
  assert.equal(removed.length, 1, "the stalled tag is removed so a retry re-injects");
  assert.ok(Date.now() - t0 < 2000);
  assert.ok(warns.some((m) => /timed out/.test(m)));
});

test("a file that loads in time never fires slow or the deadline", async () => {
  const slow = [];
  const { v } = await load(["a.js"], { slowMs: 30, deadlineMs: 60, onSlow: (s) => slow.push(s) }, async () => true);
  assert.equal(v, true);
  await new Promise((r) => setTimeout(r, 120));
  assert.deepEqual(slow, []);
});
