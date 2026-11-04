/* byte-budget.test.mjs — the race-entry golden file list and the download-byte ratchets' contract.
 * A file that joins a monza race entry without an index.html tag changes tests/data/race-entry-files.json: a reviewed
 * diff (regenerate: node tools/check/byte-budget.mjs --golden). The gzip caps themselves are `tree` rows in
 * tests/data/ratchets.json, checked by tests/unit/ratchets.test.mjs; a later PR raises one on purpose by editing
 * its ceiling (or a ratchets.d fragment) and saying why in the PR, the way every ratchet raise goes.
 * Run: node --test tests/unit/byte-budget.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { raceEntryFiles, goldenFiles, eagerGzip, eagerCss, lazyCircuitGzipMax } from "../../tools/check/byte-budget.mjs";

// A quoted path literal: tooling-fast --changed's pin index selects THIS file (not the full suite) when the golden list moves.
const GOLDEN_REL = "tests/data/race-entry-files.json";

test("the race-entry lazy file set matches the committed golden list", async () => {
  assert.ok(fs.existsSync(new URL("../../" + GOLDEN_REL, import.meta.url)), "golden list is committed");
  const live = await raceEntryFiles();
  const gold = goldenFiles();
  assert.deepEqual(live.filter((f) => !gold.includes(f)), [], "new file(s) on the race-entry path — review, then node tools/check/byte-budget.mjs --golden");
  assert.deepEqual(gold.filter((f) => !live.includes(f)), [], "golden file(s) no longer loaded on race entry — node tools/check/byte-budget.mjs --golden");
});

test("the byte measures read the real shell", () => {
  assert.ok(eagerCss().length > 20, "eager stylesheet links were read");
  assert.ok(eagerGzip() > 1_000_000);
  assert.ok(lazyCircuitGzipMax().n > 10_000);
});
