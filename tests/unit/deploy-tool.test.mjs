// deploy-tool — tools/ci/deploy.mjs is the one deploy command. Offline checks
// only: the branch name agrees with pick-tests' DEPLOY_BRANCH (the single
// source pages.yml is asserted against), the circuit-touch detector reads a
// real diff, preflight refuses what the protocol refuses, and --help exits 0
// without touching git. plan()/main() need the network and are not run here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEPLOY_BRANCH, touchedCircuits, preflight, ratchetMetrics, ratchetOverruns, cureableConflicts,
  sweepSuites, touchesGeometry, notCovered, anyGeometry } from "../../tools/ci/deploy.mjs";
import { DEPLOY_BRANCH as PICK_BRANCH } from "../../tools/ci/pick-tests.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("deploy.mjs and pick-tests name the same deploy branch", () => {
  assert.equal(DEPLOY_BRANCH, PICK_BRANCH);
});

test("--help prints the usage block and exits 0", () => {
  const r = spawnSync("node", ["tools/ci/deploy.mjs", "--help"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /--plan/);
  assert.match(r.stdout, /--pr/);
});

test("touchedCircuits reads circuit and scenery ids out of a diff", () => {
  const ids = touchedCircuits("HEAD~1");
  assert.ok(Array.isArray(ids));
  for (const id of ids) assert.match(id, /^[a-z_]+$/);
});

/* THE TWO-DOT TRAP. touchedCircuits() used `git diff base HEAD`, the two-way
 * difference — so on a DIVERGED branch it reported circuits the OTHER side had
 * touched as though they were ours. Measured 2026-09-15: a --plan promised
 * verify-track over 12 circuits our commits never went near, while the run
 * (which reads it after the merge, where the two forms agree) correctly
 * verified none. The shape assertion above cannot catch that, so this builds a
 * real diverged history and checks the semantics. */
test("touchedCircuits reports OUR side only on a diverged history", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-touched-"));
  const g = (...a) => execFileSync("git", a, { cwd: dir, stdio: "pipe" });
  try {
    g("init", "-q", "-b", "main");
    g("config", "user.email", "t@t"); g("config", "user.name", "t");
    fs.mkdirSync(path.join(dir, "js", "circuits"), { recursive: true });
    const write = (id, body) => fs.writeFileSync(path.join(dir, "js/circuits", id + ".js"), body);
    write("shared", "// base\n"); g("add", "-A"); g("commit", "-qm", "base");
    g("checkout", "-q", "-b", "theirs");
    write("theirside", "// theirs\n"); g("add", "-A"); g("commit", "-qm", "theirs");
    g("checkout", "-q", "main");
    write("ourside", "// ours\n"); g("add", "-A"); g("commit", "-qm", "ours");

    // git() pins cwd to the repo ROOT at module load, so chdir cannot reach it —
    // touchedCircuits takes an explicit cwd for exactly this.
    const ids = touchedCircuits("theirs", dir);
    assert.ok(ids.includes("ourside"), "our own circuit edit must be listed");
    assert.ok(!ids.includes("theirside"),
      "a circuit only the OTHER side touched must NOT be reported as ours — that is the two-dot bug");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("preflight returns a list of refusals, never throws", () => {
  const problems = preflight();
  assert.ok(Array.isArray(problems));
  for (const p of problems) assert.equal(typeof p, "string");
});

/* THE RATCHETS AUTO-CURE. tests/data/ratchets.json is derived, so a conflict in
 * it is arithmetic and not a disagreement — deploy.mjs takes theirs and re-runs
 * `ratchets.mjs --update` on the merged tree. What makes that safe to automate
 * is the budget: each side's raise against the MERGE BASE is a decision a human
 * made, and their SUM is the most the union can legitimately need. A merged
 * tree measuring more than that has duplicated something, and a bare --update
 * would ratchet the duplication in as the new floor. */
test("ratchetMetrics flattens both scopes and ignores non-numbers", () => {
  const m = ratchetMetrics({
    _doc: "prose, not a metric",
    files: { "js/game.js": { lines: 10, codeLines: 5, note: "skip me" } },
    tree: { shellNodes: { ceiling: 100, slack: 25 }, other: { slack: 3 } },
  });
  assert.deepEqual(m, { "js/game.js/lines": 10, "js/game.js/codeLines": 5, "(tree)/shellNodes": 100 });
});

test("the ratchet budget passes a real two-sided raise and refuses a duplicated merge", () => {
  // Today's actual numbers: base 10188, they raised to 10216 (+28), we raised
  // to 10206 (+18). The union measured 10234, which is exactly 10216 + 18.
  const base = { "js/game.js/lines": 10188 };
  const ours = { "js/game.js/lines": 10206 };
  const theirs = { "js/game.js/lines": 10216 };
  assert.deepEqual(ratchetOverruns(base, ours, theirs, { "js/game.js/lines": 10234 }), [],
    "the sum of two deliberate raises is exactly the budget, and is allowed");
  assert.deepEqual(ratchetOverruns(base, ours, theirs, { "js/game.js/lines": 10200 }), [],
    "under budget is fine too — a merge may drop lines");
  // One line more than both raises combined: a merge that duplicated something.
  const over = ratchetOverruns(base, ours, theirs, { "js/game.js/lines": 10235 });
  assert.equal(over.length, 1);
  assert.match(over[0], /js\/game\.js\/lines: union 10235 > 10216 \+ 18 = 10234/);

  // A metric only one side touched still gets its budget from that side.
  assert.deepEqual(ratchetOverruns({ a: 5 }, { a: 5 }, { a: 9 }, { a: 9 }), [], "their raise alone");
  assert.deepEqual(ratchetOverruns({ a: 5 }, { a: 8 }, { a: 5 }, { a: 8 }), [], "our raise alone");
  assert.equal(ratchetOverruns({ a: 5 }, { a: 8 }, { a: 5 }, { a: 9 }).length, 1, "one past ours");

  // A metric absent from any stage is skipped rather than guessed at: a NEW
  // ratchet added by one side has no base to measure a raise against.
  assert.deepEqual(ratchetOverruns({}, { b: 1 }, { b: 1 }, { b: 999 }), []);
});

test("only GENERATED files cure themselves, and only when their source merged clean", () => {
  // A deploy may re-derive a file whose content is a function of something
  // else; it may never pick a side in a disagreement. These three are derived:
  // index.html/version.json from the manifest, ratchets.json from measuring the
  // tree, package.json's scripts from tests/groups.json.
  const cure = (list) => cureableConflicts(list).cureable;
  assert.equal(cure(["package.json"]), true, "generated from tests/groups.json");
  assert.equal(cure(["index.html", "version.json"]), true);
  assert.equal(cure(["tests/data/ratchets.json", "package.json"]), true, "two derived files together");

  // The SOURCE being contested is what makes the derived file underivable —
  // this is the condition that keeps auto-curing from papering over a real
  // disagreement about which suites exist.
  assert.equal(cure(["package.json", "tests/groups.json"]), false,
    "groups.json conflicted: package.json cannot be derived from it");
  assert.equal(cure(["tests/groups.json"]), false);

  // Anything authored stops the deploy, alone or alongside a derived file.
  assert.equal(cure(["js/game.js"]), false);
  assert.equal(cure(["package.json", "js/car/liverytex.js"]), false,
    "one real conflict is still a real conflict");
  assert.equal(cure([]), false, "nothing conflicted is not a cure");

  const parts = cureableConflicts(["package.json", "index.html", "tests/data/ratchets.json"]);
  assert.deepEqual(parts.pkgF, ["package.json"]);
  assert.deepEqual(parts.shellF, ["index.html"]);
  assert.deepEqual(parts.ratchetF, ["tests/data/ratchets.json"]);
});

/* THE GATE THAT MEASURED NO GEOMETRY. deploy.mjs ran tooling-fast and every
 * "Pure-node unit suites" script and still knew nothing about circuit geometry,
 * because ci.yml runs the sweeps in a separate job AFTER the push. On
 * 2026-09-18 d9ae0ab moved Suzuka, debris-hazard-hint compared a computed float
 * with assert.equal, the two paths landed one ULP apart, and Pages failed for
 * hours — past a deploy that had reported green. These cover the filter that
 * closes it, and the fact that it stays conditional. */
function geomRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-geom-"));
  const g = (...a) => execFileSync("git", a, { cwd: dir, stdio: "pipe" });
  const write = (rel, body) => {
    const f = path.join(dir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, body);
  };
  g("init", "-q", "-b", "main");
  g("config", "user.email", "t@t"); g("config", "user.name", "t");
  write("README.md", "# base\n"); g("add", "-A"); g("commit", "-qm", "base");
  g("branch", "-q", "base");
  return { dir, g, write, rm: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test("a circuit edit routes the sweeps; a docs-only union does not", () => {
  const r = geomRepo();
  try {
    r.write("README.md", "# more prose\n"); r.g("add", "-A"); r.g("commit", "-qm", "docs");
    assert.equal(touchesGeometry("base", r.dir), false,
      "a docs-only union must NOT pay the 10 minutes — the cost is why this is conditional");
    r.write("js/circuits/suzuka.js", "// moved\n"); r.g("add", "-A"); r.g("commit", "-qm", "suzuka");
    assert.equal(touchesGeometry("base", r.dir), true,
      "the exact 2026-09-18 shape: a circuit edit MUST run the sweeps");
  } finally { r.rm(); }
});

/* The half ci.yml drifted on: its hand-written alternation omitted
 * scenery-grounding, so a diff touching only that suite's own file skipped the
 * sweep it belongs to. Neither copy owns a literal list now — both read
 * package.json's test:sweeps — and this is what holds that true. */
test("editing a sweep suite's OWN file routes the sweeps", () => {
  const suites = sweepSuites();
  assert.ok(suites.includes("tests/unit/debris-hazard-hint.test.mjs"),
    "premise: the suite list is really derived from package.json's test:sweeps");
  const r = geomRepo();
  try {
    r.write(suites[0], "// a moved baseline\n"); r.g("add", "-A"); r.g("commit", "-qm", "suite");
    assert.equal(touchesGeometry("base", r.dir), true,
      `editing ${suites[0]} must run the sweeps — a moved baseline changes what they measure`);
  } finally { r.rm(); }
});

/* FAIL SAFE, NEVER FAIL OPEN. Without this, a filter that silently returned
 * false on any error would pass every test above and gate nothing. */
test("an unresolvable diff runs the sweeps rather than skipping them", () => {
  const r = geomRepo();
  try {
    assert.equal(touchesGeometry("no-such-ref-anywhere", r.dir), true,
      "an unreachable base must FAIL SAFE into running them");
  } finally { r.rm(); }
});

/* The other half of the 2026-09-18 fix: tooling-fast reported 207/207 while
 * knowing nothing about test:sweeps or test:lifecycle-unit. A verdict that
 * lists only what ran is how that reads as success. */
test("the verdict names what it did NOT measure", () => {
  const withSweeps = notCovered(true);
  const without = notCovered(false);
  assert.ok(withSweeps.some((x) => /browser/i.test(x)),
    "the browser groups never run here, so they must be named even on the fullest gate");
  assert.ok(!withSweeps.some((x) => /test:sweeps/.test(x)),
    "sweeps that RAN must not be reported as uncovered");
  assert.ok(without.some((x) => /test:sweeps/.test(x)),
    "sweeps that were SKIPPED must be named — that silence is the whole defect");
});

/* THE RETRY PATH, which the gate forgot for its first hours. main() sweeps the
 * union it measured; a landing session then makes that union stale, and
 * deploy12 (2026-09-18) lost its push, re-merged six circuit scenery files and
 * pushed them WITHOUT a sweep — while its verdict still listed test:sweeps as
 * verified. anyGeometry() is the predicate both paths now share, so the answer
 * cannot differ between the union and the re-merge. */
test("anyGeometry answers for a file LIST, so the retry asks what the union asked", () => {
  // The exact set that slipped through deploy12.
  assert.equal(anyGeometry([
    "js/circuits/scenery/estoril.js", "js/circuits/scenery/fuji.js", "js/circuits/scenery/jerez.js",
  ]), true, "circuit scenery re-merged by a retry must route the sweeps");

  assert.equal(anyGeometry(["docs/README.md", "tools/ci/deploy.mjs", ".github/workflows/ci.yml"]), false,
    "a retry that brings no geometry must not pay the 10 minutes");

  // GEOMETRY WITHOUT SHIPPED CODE. reverifyUnion's older question was "did js/
  // or css/ arrive?"; a sweep suite's own baseline is neither, and moving it
  // changes what the sweeps measure — which is why the geometry question is
  // asked separately from the shipped-code one.
  assert.equal(anyGeometry([sweepSuites()[0]]), true,
    "a sweep suite's own file is geometry for this purpose, though it ships nothing");
});
