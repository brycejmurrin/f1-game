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
  sweepSuites, touchesGeometry, targetedFor, notCovered, anyGeometry, proseOnly } from "../../tools/ci/deploy.mjs";
import { DEPLOY_BRANCH as PICK_BRANCH } from "../../tools/ci/pick-tests.mjs";
import { GEOMETRY_ERE, GEOMETRY_PATHS, namedPaths, fleetFiles, TARGETED, targetedSuites } from "../../tools/ci/geometry-paths.mjs";
import { createRequire } from "node:module";

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

/* THE CITATION TEST (2026-09-19). The geometry pattern matched debris-world at
 * its PRE-RENAME location under js/game/ — tools/manifest.cjs's MOVED map has
 * the rename to js/physics/debris-world.js, which is what ci.yml's copy named.
 * So the LOCAL gate skipped test:sweeps on exactly the edit CI runs them for,
 * and the "verified" line said sweeps were covered.
 *
 * A regex over paths is unfalsifiable by construction: a path that no longer
 * resolves simply never matches, and nothing anywhere says so — which is also
 * why the rename sweep could not have caught it. These three tests make it
 * falsifiable — every path the pattern names must be a path on disk, and the
 * two consumers must read the ONE copy rather than each keeping their own. */
test("every path the geometry pattern names EXISTS (the debrisworld guard)", () => {
  const { files, dirs, other } = namedPaths();
  assert.deepEqual(other, [],
    "an alternative this test cannot classify is an alternative it cannot check — " +
    "extend namedPaths() rather than leaving it unproven");
  assert.ok(files.length && dirs.length, "the pattern names no paths at all");

  for (const f of files) {
    assert.ok(fs.existsSync(path.join(ROOT, f)) && fs.statSync(path.join(ROOT, f)).isFile(),
      `the geometry pattern names ${f}, which is not a file in this tree — ` +
      "a path that cannot match is a sweep that never runs");
    assert.equal(GEOMETRY_PATHS.test(f), true, `${f} does not match the pattern that names it`);
  }
  for (const d of dirs) {
    assert.ok(fs.existsSync(path.join(ROOT, d)) && fs.statSync(path.join(ROOT, d)).isDirectory(),
      `the geometry pattern names the directory ${d}, which does not exist`);
    assert.equal(GEOMETRY_PATHS.test(d + "x.js"), true, `${d} does not match the pattern that names it`);
  }
});

test("ci.yml READS the geometry pattern instead of keeping a second copy", () => {
  const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");
  assert.match(yml, /node tools\/ci\/geometry-paths\.mjs --ere/,
    "ci.yml's sweeps filter must derive the path pattern, not retype it");
  // The exact shape that drifted: the GEOMETRY alternation written inline in
  // the yaml. Scoped to js/track/|js/circuits/ on purpose — ci.yml carries
  // other, unrelated inline path filters (the render/lighting spec selector),
  // and this test is about the one pattern that now has a single source.
  const inline = yml.split("\n").filter((l) => /grep -qE '\^\([^']*js\/(track|circuits)\//.test(l));
  assert.deepEqual(inline, [],
    "a hand-written geometry alternation is back in ci.yml — the last time there were " +
    "two copies, one kept matching debris-world at its pre-rename path for a day");
});

/* THE RETRY'S "FULL GATE" WAS NOT THE GATE (2026-09-19).
 * main() gates on tooling-fast + gateNodeSuites() + verify-track. The push
 * retry's shipped-code leg ran tooling-fast ALONE and logged "full gate" — so
 * a lost push silently downgraded the deploy to the subset, on the one leg
 * that carries another session's just-merged code. Asserted on the source
 * because reverifyUnion() needs a real rejected push to exercise. */
test("the push retry's full-gate leg runs the SAME gate main() runs", () => {
  const src = fs.readFileSync(path.join(ROOT, "tools/ci/deploy.mjs"), "utf8");
  const fn = src.slice(src.indexOf("function reverifyUnion"));
  // COMMENTS STRIPPED FIRST. Without this the test passed on a leg whose code
  // no longer called gateNodeSuites() — the comment explaining why it must
  // matched instead. A source assertion that a comment can satisfy measures
  // nothing; verified by deleting the call and watching this fail.
  const leg = fn.slice(0, fn.indexOf("} else {"))
    .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  assert.ok(leg.includes("gateNodeSuites()"),
    "the re-verify leg must run the Pages gate's node suites — tooling-fast does not");
  assert.ok(leg.includes("verify-track.cjs"),
    "the re-verify leg must verify the circuits the re-merge brought");
  assert.ok(/label = "full gate \(/.test(leg),
    "if the leg claims a full gate its label must name what it ran");
});

test("the printed pattern is the pattern deploy.mjs matches with", () => {
  const out = execFileSync(process.execPath, ["tools/ci/geometry-paths.mjs", "--ere"],
    { cwd: ROOT, encoding: "utf8" });
  assert.equal(out, GEOMETRY_ERE, "--ere must print the module's own pattern, unmodified");
  assert.equal(new RegExp(out).source, GEOMETRY_PATHS.source,
    "what ci.yml greps with and what deploy.mjs tests with must be one pattern");
  // Importing must not print: deploy.mjs --json writes a machine verdict to stdout.
  const quiet = execFileSync(process.execPath,
    ["-e", 'import("./tools/ci/geometry-paths.mjs").then(()=>{})', "--", "--ere"],
    { cwd: ROOT, encoding: "utf8" });
  assert.equal(quiet, "", "the --ere print must be guarded on being the entry module");
});

/* THE OTHER HALF OF THE RE-VERIFY QUESTION (2026-09-18).
 * reverifyUnion asked only "did the INCOMING delta ship code?" and never "does
 * OURS?" — so a deploy carrying three .md files re-ran the full gate plus a
 * 10-minute sweep on every lost race, re-proving the other session's code for
 * it. Measured that morning: six landings in 30 minutes against a re-verify of
 * ~14, so a prose-only deploy lost three races and stopped with nothing wrong
 * with it. proseOnly() is the predicate that ends that, and it is NARROW on
 * purpose — the interaction it claims does not exist has to actually not exist. */
test("proseOnly is true for prose and false for anything that can interact", () => {
  assert.equal(proseOnly(["docs/notes/SHARED-BRANCH-COORDINATION.md", "AGENTS.md"]), true);
  assert.equal(proseOnly(["docs/TESTING.md"]), true);

  // TESTS AND TOOLS ARE NOT PROSE. A guard this session added really can be
  // broken by code another session landed — prepush-gate-coverage fails on a
  // unit file added anywhere in the tree — and that is an interaction the full
  // gate is for.
  assert.equal(proseOnly(["tests/unit/prepush-gate-coverage.test.mjs"]), false,
    "a test we added can be broken by code they landed");
  assert.equal(proseOnly(["tools/ci/deploy.mjs"]), false, "tooling runs against their tree");
  assert.equal(proseOnly(["js/game.js"]), false);
  assert.equal(proseOnly(["docs/README.md", "js/game.js"]), false, "one shipped file is enough");

  // An EMPTY delta is not prose: nothing to reason about means take the gate.
  assert.equal(proseOnly([]), false, "an empty or unresolvable diff must not buy the shortcut");
});


/* TWO TIERS (2026-09-22). Ten of the fourteen sweep suites rebuild every
 * circuit; the trigger used to name js/game.js, js/car/ and debris-world as
 * geometry "because four sweep suites load them", and no FLEET suite executes
 * any of those — so nearly every session's game.js edit paid ten fleet
 * rebuilds (Pages #2526: 67 files since live, one match, a 28-line game.js
 * latch, 14 minutes of gate). The fleet pattern is now DERIVED from the
 * manifest's TRACK_VM (what the build actually loads) and the cheap suites
 * carry their own trigger. These pin both halves and the no-drift rule. */
test("a game.js-only union routes NO sweep: not the fleet, and no targeted suite reads it", () => {
  const r = geomRepo();
  try {
    r.write("js/game.js", "// the start-race latch\n"); r.g("add", "-A"); r.g("commit", "-qm", "game");
    assert.equal(touchesGeometry("base", r.dir), false,
      "no fleet suite executes js/game.js — its edit must not rebuild 52 circuits ten times");
    assert.deepEqual(targetedFor("base", r.dir), [],
      "and no sweep suite reads game.js either (grid-boxes measures the TRACK build's paint)");
  } finally { r.rm(); }
});

test("the fleet trigger is the fleet build's own module list (the garage/scene gap)", () => {
  const vm = createRequire(import.meta.url)(path.join(ROOT, "tools/manifest.cjs")).TRACK_VM;
  const mods = vm.filter((e) => typeof e === "string" && !e.startsWith("@"));
  assert.ok(mods.length > 20, "premise: TRACK_VM is the real load list");
  for (const m of mods) {
    assert.equal(GEOMETRY_PATHS.test(m), true,
      `${m} is executed by every fleet build but the trigger does not watch it — a sweep that never runs`);
  }
  // The four the hand-written list missed for weeks: not under js/track/ but
  // loaded by the pit complex's garage build.
  assert.ok(fleetFiles().includes("js/garage/scene.js"), "js/garage/scene.js is a TRACK_VM module outside js/track/");
  const r = geomRepo();
  try {
    r.write("js/garage/scene.js", "// a re-shaped garage bay\n"); r.g("add", "-A"); r.g("commit", "-qm", "garage");
    assert.equal(touchesGeometry("base", r.dir), true,
      "an edit to a TRACK_VM module re-shapes what the fleet builds: the fleet must run");
  } finally { r.rm(); }
  assert.equal(GEOMETRY_PATHS.test("tools/manifest.cjs"), true, "the manifest IS the load list: editing it changes every build");
  // What was REMOVED, and must stay out: none of these is a fleet input.
  for (const gone of ["js/game.js", "js/car/parts.js", "js/physics/debris-world.js"]) {
    assert.equal(GEOMETRY_PATHS.test(gone), false, `${gone} is not a fleet input; it belongs to the targeted tier or to nothing`);
  }
});

test("a targeted edit routes ONLY the suite that reads it, in test:sweeps order", () => {
  assert.deepEqual(targetedSuites(["js/car/parts.js"]), ["tests/unit/car-front-wing-width.test.mjs"]);
  assert.deepEqual(targetedSuites(["js/lighting/track-lights.js"]), ["tests/unit/lamp-fixture-anchor.test.mjs"]);
  assert.deepEqual(targetedSuites(["js/physics/debris-world.js", "README.md"]), ["tests/unit/debris-hazard-hint.test.mjs"]);
  assert.deepEqual(targetedSuites(["js/ui/driving-line-opts.js", "js/car/car3d.js"]),
    ["tests/unit/car-front-wing-width.test.mjs", "tests/unit/driving-line-opts.test.mjs"],
    "deduplicated and in package.json's test:sweeps order, so the runner's output reads like the group's");
  const r = geomRepo();
  try {
    r.write("js/car/parts.js", "// a wider wing\n"); r.g("add", "-A"); r.g("commit", "-qm", "car");
    assert.equal(touchesGeometry("base", r.dir), false, "a car edit cannot move a circuit");
    assert.deepEqual(targetedFor("base", r.dir), ["tests/unit/car-front-wing-width.test.mjs"]);
  } finally { r.rm(); }
  const suites = sweepSuites();
  for (const rule of TARGETED) {
    for (const s of rule.suites) assert.ok(suites.includes(s), `${s} (a TARGETED rule) is not in package.json's test:sweeps — the fleet run would not include it`);
    assert.ok(rule.why, `the rule for ${rule.ere} must say what its suite reads`);
  }
});

/* THE NO-DRIFT RULE. A suite that starts reading a js/ or tools/ source no
 * tier names is a sweep the trigger silently stops running — the exact class
 * geometry-paths.mjs exists to close. Read from each suite's SOURCE (comments
 * stripped: pit-signs and grid-boxes cite game.js in prose), every string
 * path it loads must be a fleet input or named by a targeted rule that runs
 * THIS suite. */
test("every source a sweep suite reads is covered by a tier that runs that suite", () => {
  const stripped = (src) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  const reads = (src) => {
    const out = new Set();
    for (const m of src.matchAll(/["'`]((?:\.\.\/)*(?:js|tools)\/[\w./-]+\.(?:js|mjs|cjs))["'`]/g)) out.add(m[1].replace(/^(\.\.\/)+/, ""));
    for (const m of src.matchAll(/["'](js|tools)["']((?:\s*,\s*["'][\w.-]+["'])+)/g)) {
      out.add(m[1] + "/" + [...m[2].matchAll(/["']([\w.-]+)["']/g)].map((x) => x[1]).join("/"));
    }
    return [...out].filter((p) => /\.(js|mjs|cjs)$/.test(p));
  };
  let checked = 0;
  for (const suite of sweepSuites()) {
    const src = stripped(fs.readFileSync(path.join(ROOT, suite), "utf8"));
    for (const dep of reads(src)) {
      checked++;
      const fleet = GEOMETRY_PATHS.test(dep);
      const targeted = TARGETED.some((r) => new RegExp(r.ere).test(dep) && r.suites.includes(suite));
      assert.ok(fleet || targeted,
        `${suite} reads ${dep}, which neither the fleet trigger nor a TARGETED rule naming this suite covers — ` +
        "an edit there would run no sweep");
    }
  }
  assert.ok(checked >= 12, `premise: the scan found only ${checked} loads across the sweep suites — the extractor is blind`);
});

test("--targeted prints the suites for a change list, and nothing for a game.js-only one", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-targeted-"));
  try {
    const list = path.join(dir, "changed.txt");
    fs.writeFileSync(list, "js/game.js\njs/physics/debris-world.js\nREADME.md\n");
    const out = execFileSync(process.execPath, ["tools/ci/geometry-paths.mjs", "--targeted", list], { cwd: ROOT, encoding: "utf8" });
    assert.equal(out, "tests/unit/debris-hazard-hint.test.mjs");
    fs.writeFileSync(list, "js/game.js\n");
    assert.equal(execFileSync(process.execPath, ["tools/ci/geometry-paths.mjs", "--targeted", list], { cwd: ROOT, encoding: "utf8" }), "",
      "an empty print is ci.yml's 'no targeted sweep reads this diff'");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");
  assert.match(yml, /node tools\/ci\/geometry-paths\.mjs --targeted "\$CHANGED_FILE"/,
    "ci.yml's sweeps filter must read the targeted table, not retype it");
  assert.match(yml, /- name: Targeted sweeps \(the suites that read this diff, no fleet rebuild\)\n\s+if: steps\.filter\.outputs\.geometry != 'true' && steps\.filter\.outputs\.targeted != ''/,
    "the targeted step runs exactly when the fleet does not and a suite was named");
  assert.equal(notCovered(false, ["tests/unit/car-front-wing-width.test.mjs"])[1],
    "test:sweeps (nothing in this union can move geometry; the targeted sweeps that read it ran: car-front-wing-width.test.mjs)");
  assert.equal(notCovered(false)[1], "test:sweeps (nothing in this union can move geometry)");
});
