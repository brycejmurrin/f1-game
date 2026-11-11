// tree-counts-catch.test.mjs — the bareCatches ratchet sees `catch {}` too (ledger M36, 2026-10-09).
//
// tools/check/tree-counts.mjs counts the swallowed errors under js/. Its regex
// required parentheses, so an optional catch binding (`catch {}`, ES2019, already
// used all over tools/) was invisible to the ratchet the day it appeared in js/.
//
// Run: node --test tests/unit/tree-counts-catch.test.mjs   (npm run test:tooling-fast)
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { bareCatchSites, manifestModules, zeroRefModulesReport } from "../../tools/check/tree-counts.mjs";

test("bareCatchSites counts an empty catch with and without a binding", () => {
  assert.equal(bareCatchSites("try { a(); } catch (e) {}").length, 1);
  assert.equal(bareCatchSites("try { a(); } catch {}").length, 1, "optional catch binding");
  assert.equal(bareCatchSites("try { a(); } catch { }\ntry { b(); } catch (_) { }").length, 2);
  assert.equal(bareCatchSites("try { a(); } catch\n{\n}").length, 1, "brace on the next line");
});

test("a catch that handles, or says why it swallows, is not bare", () => {
  assert.equal(bareCatchSites("try { a(); } catch (e) { Log.warn(e); }").length, 0);
  assert.equal(bareCatchSites("try { a(); } catch { fallback(); }").length, 0);
  assert.equal(bareCatchSites("try { a(); } catch { /* storage may be blocked */ }").length, 0, "a comment inside is allowed");
  assert.equal(bareCatchSites("try { a(); } catch (e) { // private mode\n}").length, 0);
});

// zeroRefModules read a hand-copied roster that had dropped six lazy lists (66 modules, all of js/race/*), so a
// js/race module nothing tests was invisible to the ratchet. The roster is derived from the manifest now.
test("zeroRefModules' roster is every manifest file list: FULL, DEFERRED and every LAZY_* (js/race/* included)", () => {
  const manifest = createRequire(import.meta.url)("../../tools/manifest.cjs");
  const roster = new Set(manifestModules());
  const race = [...manifest.FULL, ...Object.values(manifest).filter(Array.isArray).flat()]
    .filter((f) => typeof f === "string" && /^js\/race\/[^/]+\.js$/.test(f));
  assert.ok(race.length > 10, `js/race/* is in the manifest (${race.length})`);
  assert.deepEqual(race.filter((f) => !roster.has(f)), []);
  for (const [k, v] of Object.entries(manifest)) {
    if (/^LAZY_/.test(k) && Array.isArray(v) && v.every((f) => typeof f === "string")) for (const f of v) assert.ok(roster.has(f), `${k}: ${f}`);
  }
  assert.deepEqual(manifestModules({ FULL: ["a.js"], DEFERRED: { x: ["b.js"] }, LAZY_NEW: ["c.js", "a.js"], LAZY_NEW_EDGES: [["c.js", "a.js"]] }),
    ["a.js", "b.js", "c.js"]);
  // an empty test corpus names nothing, so every rostered js/race module must surface as zero-ref
  const zero = new Set(zeroRefModulesReport("").map((r) => r.file));
  assert.deepEqual(race.filter((f) => !zero.has(f)), []);
});
