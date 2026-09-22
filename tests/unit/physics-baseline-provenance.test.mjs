/* physics-baseline-provenance.test.mjs — the committed physics baseline must
 * say where it came from.
 *
 * tests/data/physics-baseline.json is the one live gate on the driving model
 * (tests/specs/physics-characterization.spec.js in a browser, its VM twin on
 * every node gate). Regenerating it is how a physics change is DECLARED
 * intentional, and the failure mode is a regen — or a hand edit — that lands
 * as if it were a measurement. So the writer stamps `_blessed` and this suite
 * holds it to four things on the fast gate:
 *
 *   reason  a non-empty sentence (APEX_BASELINE_REASON; the writer refuses an
 *           empty one)
 *   hash    sha256 of the scenario data as serialised — a number edited by
 *           hand no longer matches, so the edit has to be a regen
 *   sha     a full commit id; when this checkout can see that commit (not a
 *           shallow CI clone) it must be an ancestor of HEAD — a baseline
 *           blessed on some other branch is not this tree's measurement
 *   at      an ISO timestamp
 *
 * Neither reader of the file looks at the key: the spec and the twin iterate
 * SCENARIOS by name, which the last case pins.
 *
 * Run: node --test tests/unit/physics-baseline-provenance.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import cp from "node:child_process";
import { fileURLToPath } from "node:url";
import { BLESSED_KEY, dataHash, blessing } from "../helpers/baseline-blessing.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASELINE = path.join(ROOT, "tests/data/physics-baseline.json");
const baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
const b = baseline[BLESSED_KEY];

test("the baseline carries a _blessed stamp with a stated reason", () => {
  assert.ok(b && typeof b === "object", `${BLESSED_KEY} missing — regenerate with APEX_UPDATE_BASELINE=1 APEX_BASELINE_REASON="…"`);
  assert.equal(typeof b.reason, "string");
  assert.ok(b.reason.trim().length >= 8, `reason "${b.reason}" is not a sentence`);
  assert.ok(!Number.isNaN(Date.parse(b.at)), `at "${b.at}" is not a timestamp`);
});

test("the data hash matches — the numbers were written by the spec, not by hand", () => {
  assert.equal(b.hash, dataHash(baseline),
    "tests/data/physics-baseline.json's scenario data does not hash to its _blessed.hash: a number was edited " +
    "without regenerating. Run the spec with APEX_UPDATE_BASELINE=1 and READ THE DIFF.");
});

test("the blessing sha is a commit this tree descends from (when the checkout can see it)", () => {
  assert.match(b.sha || "", /^[0-9a-f]{40}$/, "sha must be a full commit id");
  let known = false;
  try {
    cp.execSync(`git cat-file -e ${b.sha}^{commit}`, { cwd: ROOT, stdio: "ignore" });
    known = true;
  } catch (_) { /* shallow clone or no git: the ancestry half cannot be checked here */ }
  if (!known) return;
  let ancestor = false;
  try {
    cp.execSync(`git merge-base --is-ancestor ${b.sha} HEAD`, { cwd: ROOT, stdio: "ignore" });
    ancestor = true;
  } catch (_) {}
  assert.ok(ancestor, `baseline was blessed at ${b.sha}, which is not an ancestor of HEAD — it was measured on another branch`);
});

test("blessing() is what the writer stamps: hash over data only, reason verbatim", () => {
  const data = { a: [[1, 2]], b: [[3]] };
  const s = blessing(data, "  because  ", { sha: "x".repeat(40), at: "2026-01-01T00:00:00.000Z" });
  assert.deepEqual(Object.keys(s).sort(), ["at", "hash", "reason", "sha"]);
  assert.equal(s.hash, dataHash({ ...data, [BLESSED_KEY]: { anything: 1 } }), "the stamp itself is never hashed");
  assert.notEqual(s.hash, dataHash({ ...data, a: [[1, 3]] }), "one changed number changes the hash");
});

test("neither reader of the baseline depends on the stamp: both iterate SCENARIOS by name", () => {
  const spec = fs.readFileSync(path.join(ROOT, "tests/specs/physics-characterization.spec.js"), "utf8");
  const twin = fs.readFileSync(path.join(ROOT, "tests/unit/physics-characterization-vm.test.mjs"), "utf8");
  assert.match(spec, /for \(const sc of SCENARIOS\) \{\s*expect\(rounded\[sc\.name\]/, "the spec compares per scenario");
  assert.match(twin, /for \(const s of SCENARIOS\) \{[\s\S]*want\[s\.name\]/, "the twin reads per scenario");
  assert.ok(!/Object\.keys\(want\)/.test(spec) && !/Object\.keys\(want\)/.test(twin),
    "a reader that walks every key of the file would trip over _blessed");
});
