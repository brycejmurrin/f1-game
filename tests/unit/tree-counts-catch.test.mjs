// tree-counts-catch.test.mjs — the bareCatches ratchet sees `catch {}` too (ledger M36, 2026-10-09).
//
// tools/check/tree-counts.mjs counts the swallowed errors under js/. Its regex
// required parentheses, so an optional catch binding (`catch {}`, ES2019, already
// used all over tools/) was invisible to the ratchet the day it appeared in js/.
//
// Run: node --test tests/unit/tree-counts-catch.test.mjs   (npm run test:tooling-fast)
import { test } from "node:test";
import assert from "node:assert/strict";
import { bareCatchSites } from "../../tools/check/tree-counts.mjs";

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
