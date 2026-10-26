// deploy-tool — tools/ci/deploy.mjs is the one deploy command. Offline checks
// only: the branch name agrees with pick-tests' DEPLOY_BRANCH (the single
// source pages.yml is asserted against), the circuit-touch detector reads a
// real diff, preflight refuses what the protocol refuses, and --help exits 0
// without touching git. plan()/main() need the network and are not run here.
import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import { GENERATED_PATHS } from "../../tools/lib/generated-paths.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEPLOY_BRANCH, touchedCircuits, preflight, ratchetMetrics, ratchetOverruns, cureableConflicts,
  REGEN_MESSAGE, mergeTreeConflicts, assertMergeable,
  sweepSuites, touchesGeometry, targetedFor, notCovered, anyGeometry, proseOnly, changedPaths, advisoryGet, run, CHILD_TIMEOUT_MS } from "../../tools/ci/deploy.mjs";
import { superviseDeployChild } from "../../tools/ci/deploy-child.mjs";
import { alive } from "../../tools/lib/process-tree.mjs";
import { DEPLOY_BRANCH as PICK_BRANCH } from "../../tools/ci/pick-tests.mjs";
import { GEOMETRY_ERE, GEOMETRY_PATHS, namedPaths, fleetFiles, TARGETED, targetedSuites, PARTS_ERE, partsFiles } from "../../tools/ci/geometry-paths.mjs";
import { createRequire } from "node:module";

// The throwaway repos' cleanup: `git commit` can leave a gc / maintenance
// child still writing .git/objects when the test's `finally` runs, and a bare
// rmSync then threw ENOTEMPTY out of a test whose every assertion had passed
// (PR #387's Structural guards job, runner at loadavg 4.25; again on #396).
// Stop maintenance first, then retry — node's docs recommend maxRetries for a
// busy directory; the stop covers the writer that outlives a single retry window.
const rmTemp = (dir) => {
  try {
    execFileSync("git", ["-C", dir, "maintenance", "unregister", "--force"], { stdio: "ignore", timeout: 3000 });
  } catch { /* not a git repo / no maintenance */ }
  try {
    execFileSync("git", ["-C", dir, "gc", "--quit"], { stdio: "ignore", timeout: 5000 });
  } catch { /* best-effort */ }
  for (let i = 0; i < 10; i++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
      return;
    } catch (err) {
      if (err && (err.code === "ENOTEMPTY" || err.code === "EBUSY") && i < 9) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200 * (i + 1));
        continue;
      }
      throw err;
    }
  }
};

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

test("touchedCircuits reads circuit and scenery ids out of a diff — exactly", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-touched-ids-"));
  const g = (...a) => execFileSync("git", a, { cwd: dir, stdio: "pipe" });
  try {
    g("init", "-q", "-b", "main");
    g("config", "user.email", "t@t"); g("config", "user.name", "t");
    const write = (rel, body) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), body); };
    // Paths are built, not spelled: the docs-integrity scan reads quoted paths in source.
    const circ = (id, ...sub) => ["js", "circuits", ...sub, id + ".js"].join("/");
    write(circ("keep"), "// base\n"); write("README.md", "x\n");
    g("add", "-A"); g("commit", "-qm", "base");
    write(circ("newtrack"), "// new\n");            // a circuit def
    write(circ("other_track", "scenery"), "// s\n");    // a scenery file, underscore id
    write(circ("Bad-Name"), "// no\n");              // not an id: must not match
    write(["js", "track", "engine.js"].join("/"), "// engine\n");               // not a circuit
    write("README.md", "y\n");
    g("add", "-A"); g("commit", "-qm", "edit");
    assert.deepEqual(touchedCircuits("HEAD~1", dir).sort(), ["newtrack", "other_track"],
      "only circuit and scenery files that match the id shape, each once");
    // A read that fails yields no ids (the callers treat [] as 'nothing to verify').
    assert.deepEqual(touchedCircuits("no-such-ref", dir), []);
  } finally {
    rmTemp(dir);
  }
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
    rmTemp(dir);
  }
});

test("merge-tree: clean, real conflicts, and an ERROR with no CONFLICT line (unrelated histories); a shallow clone is named up front", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-mergetree-"));
  const g = (...a) => execFileSync("git", a, { cwd: dir, stdio: "pipe", encoding: "utf8" });
  const mt = (a, b) => {
    const r = spawnSync("git", ["merge-tree", "--write-tree", a, b], { cwd: dir, encoding: "utf8" });
    return { code: r.status, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
  };
  try {
    g("init", "-q", "-b", "main");
    g("config", "user.email", "t@t"); g("config", "user.name", "t");
    fs.writeFileSync(path.join(dir, "f.txt"), "base\n"); g("add", "-A"); g("commit", "-qm", "base");
    g("checkout", "-q", "-b", "other");
    fs.writeFileSync(path.join(dir, "f.txt"), "other\n"); g("commit", "-qam", "other");
    g("checkout", "-q", "main");
    fs.writeFileSync(path.join(dir, "g.txt"), "clean\n"); g("add", "-A"); g("commit", "-qm", "clean");
    g("checkout", "-q", "-b", "clash", "main~0");
    fs.writeFileSync(path.join(dir, "f.txt"), "mine\n"); g("commit", "-qam", "clash");
    g("checkout", "-q", "--orphan", "alien");
    fs.writeFileSync(path.join(dir, "f.txt"), "alien\n"); g("add", "-A"); g("commit", "-qm", "alien");

    assert.deepEqual(mergeTreeConflicts(mt("main", "other")), [], "a clean merge has no conflicts");
    assert.equal(mergeTreeConflicts(mt("clash", "other")).length, 1, "a real conflict is listed");
    assert.throws(() => mergeTreeConflicts(mt("main", "alien")), /could not compute the merge/,
      "unrelated histories: non-zero with no CONFLICT line is an error, never clean");
    assert.throws(() => mergeTreeConflicts({ code: 1, out: "", err: "" }), /could not compute/);

    assert.doesNotThrow(() => assertMergeable("main", "other", dir), "related branches in a full clone pass");
    assert.throws(() => assertMergeable("main", "alien", dir), /share no history/, "unrelated, full clone: not a shallow problem");
    const shallow = path.join(dir, "shallow");
    execFileSync("git", ["clone", "-q", "--depth", "1", "--no-single-branch", "file://" + dir, shallow], { stdio: "pipe" });
    assert.throws(() => assertMergeable("origin/main", "origin/other", shallow), /SHALLOW[\s\S]*--unshallow/,
      "a depth that stops before the merge base is named, with the cure");
    assert.doesNotThrow(() => assertMergeable("origin/main", "origin/main", shallow), "shallow alone is fine when the base is reachable");
  } finally {
    rmTemp(dir);
  }
});

test("preflight returns a list of refusals, never throws", () => {
  const problems = preflight();
  assert.ok(Array.isArray(problems));
  for (const p of problems) assert.equal(typeof p, "string");
});

test("preflight(cwd) judges the fixture repo's tree, not the checkout's", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-preflight-"));
  try {
    const g = (...a) => execFileSync("git", ["-C", dir, ...a], { stdio: "ignore" });
    g("init", "-q");
    g("config", "user.email", "t@t"); g("config", "user.name", "t");
    fs.writeFileSync(path.join(dir, "a.txt"), "x");
    g("add", "-A"); g("commit", "-q", "-m", "init");
    const dirty = (cwd) => preflight(cwd).some((p) => p.startsWith("working tree is dirty"));
    assert.equal(dirty(dir), false, "clean fixture repo is not dirty");
    fs.writeFileSync(path.join(dir, "b.txt"), "y");
    assert.equal(dirty(dir), true, "an untracked file in the fixture is dirty");
  } finally { rmTemp(dir); }
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
    // waitForTimeout is stored as a BARE number in the real file; it is a ceiling too.
    tree: { shellNodes: { ceiling: 100, slack: 25 }, other: { slack: 3 }, waitForTimeout: 148 },
  });
  assert.deepEqual(m, { "js/game.js/lines": 10, "js/game.js/codeLines": 5, "(tree)/shellNodes": 100, "(tree)/waitForTimeout": 148 });
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

  // The agent output catalog is derived (gen-output-surface.mjs); its policy source is not.
  assert.equal(cure(["docs/agent-output/catalog.json", "tools/README.md"]), true, "two tool indexes regenerate together");
  assert.deepEqual(cureableConflicts(["docs/agent-output/catalog.json"]).catalogF, ["docs/agent-output/catalog.json"]);
  assert.equal(cure(["docs/agent-output/catalog.json", "docs/agent-output/policies.json"]), false, "policies.json is hand-written");

  // System audit 2026-10-26: the merge-conflict hot spots that are generated —
  // gen-agent-index's three outputs, the coverage table, and the scenery survey
  // cache (75 conflicts in 7 days) — cure; their sources still do not.
  const derived = ["docs/agent-index.json", "tests/data/impact-map.json", "docs/AGENT-HOOKS.md", "docs/TESTING-COVERAGE.md"];
  assert.equal(cure(derived), true);
  assert.deepEqual(cureableConflicts(derived).derivedF, derived);
  assert.equal(cure(["tools/shot/scenery-locations.json"]), true, "the scenery cache regenerates");
  assert.deepEqual(cureableConflicts(["tools/shot/scenery-locations.json", "package.json"]).sceneryF, ["tools/shot/scenery-locations.json"]);
  assert.equal(cure(["tools/shot/scenery-locations.json", "js/circuits/spa.js"]), false, "a circuit conflict is authored");
  // docs/agent-index.json is derived (gen-agent-index.mjs) too.
  assert.deepEqual(cureableConflicts(["docs/agent-index.json"]).derivedF, ["docs/agent-index.json"]);
  assert.equal(cure(["docs/agent-index.json", "package.json"]), true, "agent index cures with other derived files");
  assert.equal(cure(["docs/agent-index.json", "AGENTS.md"]), false, "prose still stops");
});

test("prose docs are never cured: no doc carries generated ladder digits any more", () => {
  // Until 2026-09-30 a conflict in AGENTS.md / TESTING.md / the ladder note was
  // cured when every hunk differed in digits alone (the "N of M unit files"
  // figures). Those figures left the tree (gen-ladder-figures.mjs only reports),
  // so a conflict in any of these docs is prose someone wrote, and stops.
  for (const doc of ["AGENTS.md", "docs/TESTING.md", "docs/notes/PREPUSH-GATE-LADDER.md", ".claude/agents/verify-agent.md", "README.md"])
    assert.equal(cureableConflicts([doc]).cureable, false, `${doc} is a real conflict`);
  assert.equal(cureableConflicts(["AGENTS.md", "package.json"]).cureable, false, "one prose doc stops the merge");
});

/* TWO PRs THAT EACH ADD A UNIT FILE (2026-09-30). This used to be the
 * clean-but-stale merge: both sides rewrote the committed ladder figures to the
 * same "N of M+1", git merged the identical hunks, and the union was a file
 * short until mergeDeployTip() re-ran the generators. The ladder figures are
 * not committed any more. The coverage page is: it lists every unit file, so
 * the union's only follow-up is docs/TESTING-COVERAGE.md. Built in a throwaway
 * copy of the tree (text files only) and merged with the REAL mergeDeployTip()
 * from the copy's own deploy.mjs.
 *
 * Freshen generated files on the copy BEFORE the base commit: a ship tip that
 * already carried a stale ARCHITECTURE.md count (#697+#740, 2026-10-02) made
 * regenerateDerived write a follow-up commit for a reason that has nothing to
 * do with the unit-file merge under test, and this assertion went red. */
test("two sides that each add a unit file merge clean and refresh only the coverage page", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-regen-"));
  const g = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: "pipe" }).trim();
  const genCheck = () => spawnSync("npm", ["run", "-s", "gen:check"], { cwd: dir, encoding: "utf8" });
  try {
    const listed = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" })
      .split("\n").filter(Boolean)
      .filter((f) => !/^(assets|vendor|spike|artifacts|scratch)\//.test(f));
    for (const f of listed) {
      const src = path.join(ROOT, f);
      let st;
      try { st = fs.lstatSync(src); } catch { continue; }       // deleted in the working tree
      // Binaries and symlinks: no generator reads them (docs/ alone is ~100 MB of images).
      if (!st.isFile() || /\.(png|jpe?g|webp|gif|avif|glb|gltf|bin|ktx2|basis|hdr|exr|wasm|mp3|ogg|wav|m4a|mp4|webm|gz|zip|pdf|ttf|woff2?)$/i.test(f)) continue;
      fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      fs.copyFileSync(src, path.join(dir, f));
    }
    fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    g("init", "-q", "-b", "base");
    g("config", "user.email", "t@t"); g("config", "user.name", "t");
    const freshen = spawnSync("npm", ["run", "-s", "gen"], { cwd: dir, encoding: "utf8" });
    assert.equal(freshen.status, 0, "freshen generated files on the throwaway copy:\n" + freshen.stdout + freshen.stderr);
    g("add", "-A"); g("commit", "-qm", "base");

    const addUnit = (name) => {
      fs.writeFileSync(path.join(dir, "tests/unit", name), "// placeholder\n");
      g("add", "-A"); g("commit", "-qm", `add ${name}`);
    };
    g("checkout", "-q", "-b", "tip"); addUnit("zz-regen-theirs.test.mjs");
    g("update-ref", `refs/remotes/origin/${DEPLOY_BRANCH}`, "tip");
    g("checkout", "-q", "-b", "ours", "base"); addUnit("zz-regen-ours.test.mjs");

    const out = execFileSync(process.execPath, ["--input-type=module", "-e",
      `const m = await import(${JSON.stringify(path.join(dir, "tools/ci/deploy.mjs"))}); console.log(await m.mergeDeployTip());`],
      { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    assert.doesNotMatch(out, /AGENTS\.md|TESTING\.md|PREPUSH-GATE-LADDER/, "no ladder doc needed re-deriving: " + out);
    assert.match(out, /TESTING-COVERAGE\.md/, "a new unit file is a coverage row: " + out);
    assert.equal(g("log", "-1", "--format=%s"), REGEN_MESSAGE, "the coverage page is the derived follow-up");
    assert.deepEqual(g("diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD").split("\n").filter(Boolean), ["docs/TESTING-COVERAGE.md"]);
    assert.equal(g("log", "-1", "--skip=1", "--format=%P").split(" ").length, 2, "the commit under the follow-up is the merge");
    const check = genCheck();
    assert.equal(check.status, 0, "every generated file is fresh on the bare merge:\n" + check.stdout + check.stderr);
    assert.equal(g("status", "--porcelain"), "");
  } finally {
    rmTemp(dir);
  }
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
  return { dir, g, write, rm: () => rmTemp(dir) };
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

/* THE UNCOMMITTED EDIT. --gate-only waives the dirty-tree refusal because it is
 * the check you run with the edit still in your working tree — and every suite
 * it runs reads that tree. But change detection read `base...HEAD`, commits
 * only: on 2026-09-22 an uncommitted Portimão def + scenery edit (three
 * baselines moved) got "test:sweeps (nothing in this union can move geometry)"
 * and no verify-track. Staged, unstaged and untracked-not-ignored all count. */
test("the working tree is part of the union: unstaged, staged and untracked edits route the gate", () => {
  const r = geomRepo();
  try {
    r.write("js/circuits/portimao.js", "// def\n");
    r.write(".gitignore", "artifacts/\n");
    r.g("add", "-A"); r.g("commit", "-qm", "def"); r.g("branch", "-qf", "base");
    assert.equal(touchesGeometry("base", r.dir), false, "premise: a clean tree at base moves nothing");

    r.write("artifacts/js/circuits/ignored.js", "// ignored\n");
    assert.deepEqual(changedPaths("base", r.dir), [], "an ignored file is not a change");

    r.write("js/circuits/portimao.js", "// unstaged edit\n");
    assert.equal(touchesGeometry("base", r.dir), true, "an UNSTAGED circuit edit must run the sweeps");
    assert.deepEqual(touchedCircuits("base", r.dir), ["portimao"], "…and verify-track for it");

    r.g("add", "-A");
    assert.equal(touchesGeometry("base", r.dir), true, "a STAGED circuit edit must run the sweeps");

    r.g("reset", "-q", "--hard");
    r.write("js/circuits/scenery/estoril.js", "// new file\n");
    assert.deepEqual(touchedCircuits("base", r.dir), ["estoril"], "an UNTRACKED scenery file is a touched circuit");

    r.g("clean", "-qfd", "js");
    r.write("js/car/parts.js", "// car\n");
    assert.equal(touchesGeometry("base", r.dir), false, "an untracked car file moves no circuit");
    assert.deepEqual(targetedFor("base", r.dir), ["tests/unit/car-front-wing-width.test.mjs"],
      "…but still routes the targeted sweep that reads it");
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

test("the parts census derives its trigger, and every fail-safe branch RUNS it", () => {
  /* sweeps-parts ran on every push, PR and train — 106 s of runner before any
     path was examined, docs-only diffs included. It now has a filter, and a
     filter is only as good as its fail-safe: the one thing it may never do is
     guess "nothing changed" when it cannot tell. Each branch is pinned by the
     string it prints, because that string is what a reader sees in the log. */
  const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");
  const job = yml.slice(yml.indexOf("\n  sweeps-parts:"), yml.indexOf("\n  sweeps:"));
  assert.ok(job.includes("node tools/ci/geometry-paths.mjs --parts-ere"),
    "the parts filter must DERIVE its pattern from parts-sweep.mjs's load list, not retype it");
  assert.match(job, /fetch-depth: 0/, "the filter diffs against an arbitrary base; a depth-1 clone has no base");
  // FAIL SAFE, never fail open: five ways to not know, five run_all calls.
  for (const branch of [/not a push, a PR or a Pages call/, /no comparison base/,
                        /unreachable \(force push\?\)/, /git diff failed/,
                        /could not read the parts path pattern/, /printed an EMPTY parts pattern/]) {
    assert.match(job, branch, `the parts filter lost a fail-safe branch: ${branch}`);
  }
  // A pull_request base, which the sweeps filter beside it went without for a
  // year. Without this the `*)` arm catches PRs and the census runs on all of them.
  assert.match(job, /pull_request\) BEFORE="\$\{PR_BASE:-\}" ;;/,
    "a pull_request has a base; use it rather than fail-safing every PR into the census");
  // STEP-LEVEL, never a job `if:` — poke-train has `needs: sweeps-parts` and
  // pages.yml has `needs: ci`, and both read the AGGREGATE of the jobs that ran.
  assert.ok(!/^    if: \$\{\{ inputs\.fast_tier_run == '' && /m.test(job),
    "the census must stay a job that runs and skips a step, not a job that skips");
  // NOT skipped by a reused fast tier (2026-09-24): its filter diffs a base, so
  // the last push's green census says nothing about the train's live..tip diff.
  assert.ok(!/^    if: .*fast_tier_run/m.test(job),
    "the train must census live..tip itself; a reused fast run only covered the last push's diff");
  assert.match(job, /- if: (steps\.reuse\.outputs\.reuse != 'true' && )?steps\.filter\.outputs\.parts == 'true'\n\s+run: npm run test:sweeps-parts/,
    "the expensive step is what the filter gates");
});

test("the parts pattern covers every module the sweep actually loads", () => {
  // DERIVED, so the test's job is to prove the derivation is COMPLETE rather
  // than to restate it: every file parts-sweep.mjs runs into its VM, plus the
  // tool and the suite, must match; a path outside the census must not.
  const re = new RegExp(PARTS_ERE());
  for (const f of [...partsFiles(), "tools/car/parts-sweep.mjs",
                   "tests/unit/parts-visual-distinctness.test.mjs"]) {
    assert.ok(re.test(f), `the parts pattern misses ${f}, which the census reads`);
    assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} does not exist — the load list has drifted`);
  }
  for (const f of ["docs/README.md", "js/track/tracks.js", "js/circuits/monza.js", "tests/specs/smoke.spec.js"])
    assert.ok(!re.test(f), `the parts pattern matches ${f}, which the census never reads`);
  // ANTI-VACUITY on the parse: a partial read must THROW, not return a short
  // list that quietly stops matching the modules it dropped.
  assert.ok(partsFiles().length >= 4, `parsed only ${partsFiles().length} modules out of parts-sweep.mjs`);
});

/* A PULL REQUEST HAS A BASE, AND THE SWEEPS FILTER IGNORED IT (2026-09-22).
 * The filter's event `case` listed `push` only, so every pull_request hit the
 * fail-safe and ran the whole fleet BEFORE examining one path — ~8m30s of
 * sweeps plus verify-track on a runner for a CSS-only or tools-only PR, on
 * every push to the branch. renderer-filter had been diffing
 * pull_request.base.sha all along, and its comment claimed this filter had no
 * base to diff. Fail-safe is the rule here and is untouched: an empty,
 * unreachable or undiffable base still runs everything. This test pins the two
 * halves of the fix together, because either alone is a silent regression —
 * the env without the case fail-safes anyway, the case without the env diffs
 * against an empty BEFORE and fail-safes too. */
test("the sweeps filter diffs a pull request against its own base", () => {
  const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");
  const step = yml.split("- name: Does this diff touch the geometry?")[1];
  assert.ok(step, "ci.yml still has the sweeps geometry filter step");
  const body = step.split("- name:")[0];

  assert.match(body, /github\.event\.pull_request\.base\.sha/,
    "the sweeps filter must read a pull request's base sha, not fall through to the fleet");
  assert.ok(body.includes("push|pull_request) ;;"),
    "…and must accept the pull_request event, or the env above is dead code");

  // FAIL SAFE, STILL. Every one of these lines is what makes an unresolvable
  // diff run everything; the fix must not have removed any of them.
  for (const [re, why] of [
    [/0{40}\) run_all "no before-sha/, "an empty base still runs the fleet"],
    [/git cat-file -e "\$\{BEFORE\}\^\{commit\}".*\|\| run_all/, "an unreachable base still runs the fleet"],
    [/CHANGED=\$\(git diff --name-only "\$BEFORE" "\$GITHUB_SHA"\) \|\| run_all/, "a failed diff still runs the fleet"],
    [/\[ "\$CALLED" = "true" \] \|\| run_all/, "a Pages call is still checked before any event verdict"],
  ]) assert.match(body, re, `the fail-safe is gone: ${why}`);

  // The claim renderer-filter used to make about this filter must be gone with it.
  assert.equal(/where the sweeps filter has none/.test(yml), false,
    "renderer-filter's comment still says the sweeps filter has no PR base; it has one now");
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

test("worker-only manifest dependencies route the worker sweep without rebuilding the fleet", () => {
  const extras = createRequire(import.meta.url)(path.join(ROOT, "tools/manifest.cjs")).TRACK_WORKER_EXTRA;
  assert.ok(extras.includes("js/render/shared/frustum.js"), "premise: chunk dependencies are worker extras");
  for (const dep of extras) {
    assert.equal(GEOMETRY_PATHS.test(dep), false, `${dep} is a worker input, not a fleet input`);
    assert.deepEqual(targetedSuites([dep]), ["tests/unit/build-worker.test.mjs"],
      `${dep} must run the sweep that imports the worker's full manifest`);
    assert.deepEqual(targetedSuites([dep + ".bak"]), [], "worker paths are exact files");
  }
  assert.equal(GEOMETRY_PATHS.test("tools/gfx/gpu-game-check.mjs"), false, "the profile probe builds no fleet geometry");
  assert.deepEqual(targetedSuites(["tools/gfx/gpu-game-check.mjs"]), ["tests/unit/build-worker.test.mjs"]);
  assert.deepEqual(targetedSuites(extras), ["tests/unit/build-worker.test.mjs"], "worker dependencies deduplicate");
  assert.deepEqual(targetedSuites(["js/render/three/tlx.js"]), [], "unrelated renderer files stay outside the worker sweep");
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
  } finally { rmTemp(dir); }
  const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");
  assert.match(yml, /node tools\/ci\/geometry-paths\.mjs --targeted "\$CHANGED_FILE"/,
    "ci.yml's sweeps filter must read the targeted table, not retype it");
  assert.match(yml, /- name: Targeted sweeps \(the suites that read this diff, no fleet rebuild\)\n\s+if: needs\.select\.outputs\.geometry == 'false' && needs\.select\.outputs\.geometry_targeted != ''/,
    "the targeted step runs exactly when the fleet does not and a suite was named");
  assert.equal(notCovered(false, ["tests/unit/car-front-wing-width.test.mjs"])[1],
    "test:sweeps (nothing in this union can move geometry; the targeted sweeps that read it ran: car-front-wing-width.test.mjs)");
  assert.equal(notCovered(false)[1], "test:sweeps (nothing in this union can move geometry)");
});

/* THE NIGHTLY ROTA REPORTER. select-specs excludes any spec whose declared
 * budget exceeds the gate's 180 s per-test cap, so 61 of 119 specs were never
 * selected in the 30-day window spec-staleness measures; nightly-group.mjs
 * rotates one browser group a night to reach them. That makes the nightly the
 * ONLY scheduled verdict on those specs — and trainHealth's `per_page=1` on
 * ci.yml can never show it, because the newest ci.yml run on the deploy branch
 * is always a push.
 *
 * Both pins below exist because 2026-09-22 failed in exactly the way they
 * forbid. That night's rota ran group `input`; Smoke shard 1 FAILED on
 * steering.spec.js "steering has authority to fight the curvature drift", both
 * attempts. The RUN reported `cancelled`, because two unrelated jobs were
 * cancelled eight minutes later and `cancelled` outranks `failure` in GitHub's
 * rollup precedence — and AGENTS.md rule 8 tells every session to read a
 * `cancelled` as a timeout until proven otherwise. The rota's one finding was
 * filed by the tooling as "the box was busy" and sat unread all day.
 * So: query the SCHEDULE event, and believe the JOB list, not the rollup. */
test("--train reports the nightly rota, and reads its jobs rather than the rollup", () => {
  const src = fs.readFileSync(path.join(ROOT, "tools/ci/deploy.mjs"), "utf8");
  const fn = src.slice(src.indexOf("function nightlyHealth("));
  assert.ok(fn.startsWith("function nightlyHealth("), "deploy.mjs has no nightlyHealth()");

  // A push run is not the nightly: without event=schedule this reports the same
  // run trainHealth already printed, and the rota stays invisible.
  assert.match(fn, /event=schedule/,
    "nightlyHealth must select the SCHEDULE event — per_page=1 on ci.yml otherwise returns a push run");
  // The rollup lied once and will again: `cancelled` hides a FAILED job inside it.
  assert.match(fn, /\/jobs\?/,
    "nightlyHealth must read the run's job list — the run-level conclusion is not the verdict");
  assert.match(fn, /conclusion === "failure"/,
    "nightlyHealth must name the jobs that actually FAILED, whatever the rollup says");
});

test("--train answers without Git planning or preflight, and names both signals offline", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-train-offline-"));
  const gitCalls = path.join(dir, "git-calls");
  try {
    // Fail every Git operation, including fetch/merge-tree. The real command
    // must still report health; stub only external transports, never main().
    fs.writeFileSync(path.join(dir, "git"), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$APEX_TRAIN_GIT_CALLS"\nexit 97\n', { mode: 0o755 });
    for (const cmd of ["curl", "gh"]) fs.writeFileSync(path.join(dir, cmd), "#!/bin/sh\nexit 7\n", { mode: 0o755 });
    const r = spawnSync(process.execPath, ["tools/ci/deploy.mjs", "--train"], {
      cwd: ROOT, encoding: "utf8", timeout: 15000,
      env: { ...process.env, PATH: dir, APEX_TRAIN_GIT_CALLS: gitCalls },
    });
    assert.equal(r.status, 0, r.stderr);
    const out = r.stdout + r.stderr;
    // No "train ci:" row since 2026-10-16: the deploy branch's push starts pages.yml, the one train signal.
    for (const label of ["train pages:", "train nightly:"]) {
      assert.ok(out.includes(label + " unknown"), `--train printed no offline "${label}" line:\n${out}`);
    }
    assert.equal(fs.existsSync(gitCalls), false, "advisory health must not invoke Git planning");
    assert.ok(!/REFUSED:/.test(out), `--train must not run preflight:\n${out}`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/* trainHealth / nightlyHealth used three bare curls, drawing on the 60/h
 * UNAUTHENTICATED limit shared by every session behind the proxy's egress IP
 * (docs/notes/ACTIONS-AUDIT-2026-10-14.md finding 8). advisoryGet sends the
 * token when one resolves — on curl's stdin, never argv — and stays advisory:
 * any failure is null, so the line prints "unknown" and the deploy goes on. */
test("advisoryGet: token on stdin when present, unauthenticated without, null on any failure", () => {
  const url = "https://api.github.com/repos/brycejmurrin/f1-game/actions/workflows/ci.yml/runs?per_page=1";
  let seen;
  const fake = (stdout, status = 0) => (cmd, args, opts) => { seen = { cmd, args, opts }; return { status, stdout }; };
  assert.deepEqual(advisoryGet(url, { token: "fixture-tok", run: fake('{"workflow_runs":[{"id":1}]}\n200') }), { workflow_runs: [{ id: 1 }] });
  assert.equal(seen.cmd, "curl");
  assert.ok(seen.args.includes("-K") && seen.args.at(-1) === url);
  assert.ok(!seen.args.some((a) => a.includes("fixture-tok")), "the token never reaches argv");
  assert.match(seen.opts.input, /Authorization: Bearer fixture-tok/);
  assert.ok(seen.opts.maxBuffer >= 16 << 20, "a list response must not hit spawnSync's 1 MB default (#1733)");
  advisoryGet(url, { token: null, run: fake("{}\n200") });
  assert.ok(!seen.args.includes("-K") && seen.opts.input === undefined, "no token: the same unauthenticated GET as before");
  for (const [stdout, status] of [['{"message":"API rate limit exceeded"}\n403', 0], ["not json\n200", 0], ["", 7]]) {
    assert.equal(advisoryGet(url, { token: "t", run: fake(stdout, status) }), null, `${status} ${stdout}`);
  }
  assert.equal(advisoryGet(url, { token: "t", run: () => { throw new Error("spawn"); } }), null);
  const src = fs.readFileSync(path.join(ROOT, "tools/ci/deploy.mjs"), "utf8");
  const health = src.slice(src.indexOf("function trainHealth("), src.indexOf("export async function main("));
  assert.doesNotMatch(health, /spawnSync\("curl"/, "train/nightly health GETs go through advisoryGet");
});

test("deploy JSON child retains complete large stdout and late failure while stderr stays live", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-deploy-output-"));
  try {
    const moduleUrl = new URL('../../tools/ci/deploy.mjs', import.meta.url).href;
    const chunk = 'λ evidence\n'.repeat(8192);
    const tail = 'not ok 999 - late exact TAP cause\n';
    const producer = `const fs=require('node:fs');for(let i=0;i<40;i++)fs.writeSync(1,${JSON.stringify(chunk)});fs.writeSync(1,${JSON.stringify(tail)});fs.writeSync(2,'LIVE STDERR CAUSE\\n');process.exit(23);`;
    const entry = `import {run} from ${JSON.stringify(moduleUrl)};
try {await run(process.execPath,['-e',${JSON.stringify(producer)}],'fixture',{root:${JSON.stringify(dir)},json:true});process.exitCode=0;}
catch(e){console.log(JSON.stringify({status:'failed',error:e.message,stdoutArtifact:e.stdoutArtifact}));process.exitCode=1;}`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', entry], { cwd: ROOT, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    assert.equal(result.status, 1, result.stderr);
    const verdict = JSON.parse(result.stdout);
    assert.equal(verdict.status, 'failed');assert.match(verdict.error, /exit 23/);
    const artifact = verdict.stdoutArtifact;
    assert.match(verdict.error, new RegExp(artifact.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    const retained = path.join(dir, artifact.path);
    const expected = Buffer.from(chunk.repeat(40) + tail);
    assert.ok(expected.length > 1024 * 1024, 'exceeds spawnSync default maxBuffer');
    assert.deepEqual(fs.readFileSync(retained), expected);
    assert.equal(artifact.bytes, expected.length);
    assert.equal(fs.statSync(retained).mode & 0o777, 0o600);
    assert.match(result.stderr, /LIVE STDERR CAUSE/);
    assert.ok(result.stderr.indexOf('child stdout: ') < result.stderr.indexOf('\nLIVE STDERR CAUSE\n'), 'identity is announced before action');
    assert.equal(result.stdout.trim().split('\n').length, 1, 'child output cannot corrupt final JSON');
  } finally { fs.rmSync(dir, {recursive:true,force:true}); }
});

test("deploy child keeps default native streams and JSON launch errors identify retained evidence", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-deploy-output-"));
  try {
    const moduleUrl = new URL('../../tools/ci/deploy.mjs', import.meta.url).href;
    const entry = `import {run} from ${JSON.stringify(moduleUrl)};await run(process.execPath,['-e',"process.stdout.write('native stdout');process.stderr.write('native stderr')"],'fixture',{json:false});`;
    const native = spawnSync(process.execPath, ['--input-type=module','-e',entry], {encoding:'utf8'});
    assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,'native stdout');assert.match(native.stderr,/native stderr/);assert.doesNotMatch(native.stderr,/child stdout:/);
    const missing = `import {run} from ${JSON.stringify(moduleUrl)};try {await run('/definitely-missing-apex-command',[],'launch',{json:true,root:${JSON.stringify(dir)}});}catch(e){console.log(JSON.stringify({error:e.message,stdoutArtifact:e.stdoutArtifact}));}`;
    const failed = spawnSync(process.execPath, ['--input-type=module','-e',missing], {encoding:'utf8'});
    assert.equal(failed.status,0,failed.stderr);const out=JSON.parse(failed.stdout);
    assert.match(out.error,/ENOENT/);assert.equal(fs.statSync(path.join(dir,out.stdoutArtifact.path)).size,0);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test("a hung gate child stops at its ceiling and run() names the timeout instead of hanging", async () => {
  // Before: spawnSync had no timeout, so one test file that never ended held --gate-only until the
  // 30-minute background ceiling killed it without a verdict line.
  if (process.env.APEX_DEPLOY_CHILD_TIMEOUT_MIN) {
    assert.equal(CHILD_TIMEOUT_MS, Number(process.env.APEX_DEPLOY_CHILD_TIMEOUT_MIN) * 60e3,
      "the configured ceiling is honored");
  } else {
    assert.ok(CHILD_TIMEOUT_MS >= 60e3 && CHILD_TIMEOUT_MS < 30 * 60e3,
      "the default ceiling sits inside the 30-minute task limit");
  }
  const t0 = Date.now();
  let err = null;
  try { await run(process.execPath, ["-e", "setInterval(() => {}, 1000)"], "hung child", { timeoutMs: 700, json: false }); } catch (e) { err = e; }
  assert.ok(err, "run() throws for a child that never exits");
  assert.ok(err.message.includes("hung child failed") && err.message.includes("timed out"), err.message);
  assert.ok(Date.now() - t0 < 10000, "…and returns promptly");
});

test("deploy timeout fails even when a SIGTERM handler exits successfully", async () => {
  await assert.rejects(run(process.execPath, ["-e", "process.on('SIGTERM',()=>process.exit(0));setTimeout(()=>process.exit(0),2000)"],
    "over-deadline success", { timeoutMs: 300, json: false }), /over-deadline success failed.*timed out/);
  await run(process.execPath, ["-e", ""], "ordinary success", { timeoutMs: 1000, json: false });
  await assert.rejects(run(process.execPath, ["-e", "process.exit(9)"], "ordinary failure", { timeoutMs: 1000, json: false }), /exit 9/);
});

test("deploy escalates resistant children and reaps finite descendants before returning", async () => {
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "deploy-tree-"));
  const pidFile = path.join(dir, "pids.json"), marker = path.join(dir, "late.txt");
  const descendant = `const fs=require('node:fs');process.on('SIGTERM',()=>{});setTimeout(()=>fs.writeFileSync(${JSON.stringify(marker)},'leaked'),2200);`;
  const parent = `const {spawn}=require('node:child_process');const fs=require('node:fs');process.on('SIGTERM',()=>{});const c=spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{detached:true,stdio:'ignore'});fs.writeFileSync(${JSON.stringify(pidFile)},JSON.stringify([process.pid,c.pid]));setTimeout(()=>process.exit(0),2500);`;
  let pids = [];
  try {
    const started = Date.now();
    const result = await superviseDeployChild(process.execPath, ["-e", parent], { cwd: ROOT, env: process.env,
      stdio: "ignore", timeoutMs: 500, graceMs: 100, cleanupMs: 1000 });
    pids = JSON.parse(fs.readFileSync(pidFile, "utf8"));
    assert.equal(result.error?.code, "ETIMEDOUT");
    assert.ok(Date.now() - started < 1800, "escalation returns before the resistant fixtures naturally finish");
    assert.deepEqual(result.survivors, []);
    assert.ok(pids.every(pid => !alive(pid)), "both the resistant leader and detached descendant are stopped at return");
    assert.equal(fs.existsSync(marker), false, "the descendant never reaches its finite late work");
  } finally {
    // Fixtures also self-end; a failing assertion must not leave active work.
    for (const pid of pids) { if (alive(pid)) { try { process.kill(pid, "SIGKILL"); } catch { /* exited */ } } }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("deploy interruption waits for owned child cleanup and remains a failure", () => {
  const moduleUrl = new URL("../../tools/ci/deploy-child.mjs", import.meta.url).href;
  const entry = `import {superviseDeployChild} from ${JSON.stringify(moduleUrl)};
setTimeout(()=>process.kill(process.pid,'SIGTERM'),300);
const r=await superviseDeployChild(process.execPath,['-e',"process.on('SIGTERM',()=>process.exit(0));setTimeout(()=>{},2000)"],{stdio:'ignore',timeoutMs:3000,graceMs:100});
console.log(JSON.stringify({error:r.error?.code,survivors:r.survivors}));`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", entry], { encoding: "utf8", timeout: 5000 });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), { error: "SIGTERM", survivors: [] });
});

test("every path tools/lib/generated-paths.mjs calls generated is one deploy.mjs's conflict cure regenerates (fleet-owner relies on it)", () => {
  for (const p of GENERATED_PATHS) assert.equal(cureableConflicts([p]).cureable, true, `${p} is listed as generated but deploy.mjs cannot cure a conflict in it`);
});

/* ---- W1 (2026-10-26): node-half dedupe, fast prefix, receipts/--resume, --detach, autoJobs, --wait-load, baselines ---- */
import * as W1 from "../../tools/ci/deploy.mjs";
import { GATE_RECEIPTS, DETACH_RECEIPT, DETACH_LOG, resumeVerdict, stagePassed, readStatus } from "../../tools/lib/deploy-status.mjs";
import { commandFor as w1CommandFor } from "../../tools/gen/gen-test-groups.mjs";

const w1Doc = {
  isolatedFiles: [],
  groups: {
    "test:a": { kind: "node", files: ["t/a1.test.mjs", "t/a2.test.mjs", "t/a3.test.mjs"] },
    "test:b": { kind: "node", flags: ["--test-concurrency=1"], files: ["t/b1.test.mjs"] },
    "test:c": { kind: "command", cmd: "APEX_X=1 node --test t/c.test.mjs", files: ["t/c.test.mjs"] },
    "test:d": { kind: "node", flags: ["--experimental-vm-modules"], files: ["t/a1.test.mjs"] },
    "test:e": { kind: "node", files: ["t/a2.test.mjs"] },
  },
};
const w1Pkg = Object.fromEntries(Object.entries(w1Doc.groups).map(([k, d]) => [k, w1CommandFor(d, [], k)]));

test("W1 nodeHalfPlan: node groups run only files tooling-fast did not; command / odd-flag / hand-edited scripts run whole", () => {
  const ran = new Set(["t/a1.test.mjs", "t/a2.test.mjs", "t/b1.test.mjs", "t/c.test.mjs"]);
  const plan = Object.fromEntries(W1.nodeHalfPlan(Object.keys(w1Doc.groups), { ran, doc: w1Doc, pkgScripts: { ...w1Pkg, "test:e": "node --test --foo t/a2.test.mjs" } }).map((p) => [p.script, p]));
  assert.deepEqual([plan["test:a"].mode, plan["test:a"].files, plan["test:a"].skipped], ["remainder", ["t/a3.test.mjs"], ["t/a1.test.mjs", "t/a2.test.mjs"]]);
  assert.equal(plan["test:b"].mode, "skip", "--test-concurrency=1 is a flag tooling-fast's own child sets");
  assert.equal(plan["test:c"].mode, "npm", "a command group's cmd may set env: run as written");
  assert.equal(plan["test:d"].mode, "npm", "a flag tooling-fast does not set: run as written");
  assert.equal(plan["test:e"].mode, "npm", "a script that is not the generated command runs as written");
  for (const p of Object.values(plan)) assert.deepEqual([...p.files, ...p.skipped].sort(), [...w1Doc.groups[p.script].files].sort(), `${p.script}: no file lost`);
});

test("W1 runNodeHalf: one verdict per script, and the dedupe it reports", async () => {
  const calls = [];
  const ran = new Set(["t/a1.test.mjs", "t/a2.test.mjs", "t/b1.test.mjs"]);
  const doc = { isolatedFiles: [], groups: { "test:a": w1Doc.groups["test:a"], "test:b": w1Doc.groups["test:b"] } };
  // stage() records instead of spawning (run() itself is covered by the child-supervision tests above).
  const r = await W1.runNodeHalf(["test:a", "test:b"], ran, { doc, pkgScripts: w1Pkg, stage: async (name) => { calls.push(name); } });
  assert.deepEqual(r.verified, ["test:a", "test:b"]);
  assert.deepEqual(calls, ["test:a", "test:b"]);
  assert.deepEqual(r.plan.map((p) => p.mode), ["remainder", "skip"]);
  assert.deepEqual(r.dedupe, { skippedFiles: 3, scripts: { "test:a": { ran: 1, skipped: 2 }, "test:b": { ran: 0, skipped: 1 } } });
  // Against the real package.json (no test:a there) the same group is never thinned.
  const real = await W1.runNodeHalf(["test:a"], ran, { doc, stage: async () => {} });
  assert.equal(real.plan[0].mode, "npm");
});

test("W1 test:guards counts as prefix evidence only while its runner is guards-verdict's plain `node --test`", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.equal(pkg.scripts["test:guards"], W1.GUARDS_COMMAND);
  assert.ok(W1.guardsEquivalentFiles().length > 0, "today's guards-verdict spawns a plain `node --test <files>`: its files count");
  assert.deepEqual(W1.guardsEquivalentFiles({ pkgScripts: { "test:guards": "node --test --other x" } }), [], "a different command keeps every guard file in the full pass");
  assert.deepEqual(W1.guardsEquivalentFiles({ guardsSource: "spawnSync(process.execPath, [\"--test\", \"--import=x\", ...args]" }), [], "a runner with its own flags keeps them too");
});

test("W1 remainderFiles: the full pass is the floor minus what the prefix passed", () => {
  assert.deepEqual(W1.remainderFiles(["a", "b", "c"], new Set(["b", "z"])), ["a", "c"]);
});

test("W1 gateOnly's stage order: guards, the --changed prefix, the remainder, the node half, sweeps-parts", async () => {
  const names = [];
  // A recording stager runs no stage; tip() throws, so nothing touches the network (the gaps path).
  const stager = () => ({ tree: null, head: "0".repeat(40), skipped: [], file: path.join(ROOT, "artifacts/logs/never.json"),
    stage: async (name) => { names.push(name); return { verdict: "passed", files: [] }; } });
  const v = await W1.gateOnly({ stager, tip: () => { throw new Error("offline"); } });
  assert.deepEqual(names, ["test:guards", "tooling-fast:changed", "tooling-fast", ...W1.gateNodeSuites(), "test:sweeps-parts"]);
  assert.deepEqual(v.verified, names, "one verdict name per stage");
  assert.ok(Number.isInteger(v.jobs) && v.jobs >= 1, "the width comes from gateJobs()");
  assert.equal(v.notCovered.length, 1, "an unreachable tip is named, not read as nothing touched");
});

test("W1 gateJobs: tooling-fast autoJobs decides (2 quiet, 1 busy or loaded); APEX_GATE_JOBS overrides", async () => {
  assert.equal((await W1.gateJobs({ env: { APEX_GATE_JOBS: "3" } })).jobs, 3);
  assert.equal((await W1.gateJobs({ env: {}, ps: () => "  PID ARGS\n", load1: 0.5 })).jobs, 2);
  assert.equal((await W1.gateJobs({ env: {}, ps: () => "  PID ARGS\n", load1: 2.5 })).jobs, 1);
  assert.equal((await W1.gateJobs({ env: {}, ps: () => { throw new Error("no ps"); }, load1: 0.1 })).jobs, 1, "unknown occupancy is busy");
});

test("W1 receipts: resumeVerdict refuses a moved tree, stagePassed needs a pass on the same tree", () => {
  const A = "a".repeat(40), B = "b".repeat(40);
  const doc = { tree: A, head: "h", stages: { x: { tree: A, verdict: "passed" }, y: { tree: A, verdict: "failed" } } };
  assert.equal(resumeVerdict(doc, A).ok, true);
  const moved = resumeVerdict(doc, B);
  assert.equal(moved.ok, false);
  assert.equal(resumeVerdict(null, A).ok, true);
  assert.equal(resumeVerdict(doc, null).ok, false);
  assert.equal(stagePassed(doc, "x", A), true);
  assert.equal(stagePassed(doc, "y", A), false);
  assert.equal(stagePassed(doc, "x", B), false);
  assert.equal(GATE_RECEIPTS, path.join("artifacts", "logs", "gate-receipts.json"));
});

test("W1 gateStager: records each stage, --resume skips passed stages on the same tree and refuses a moved one", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-receipts-"));
  try {
    const file = path.join(dir, "r.json");
    let tree = "a".repeat(40);
    const mk = (resume) => W1.gateStager({ resume, file, treeId: () => tree, head: () => "f".repeat(40), announce() {} });
    const g = mk(false);
    let runs = 0;
    await g.stage("one", async () => { runs++; return { files: ["x"] }; });
    await assert.rejects(g.stage("two", async () => { throw new Error("red"); }), /red/);
    let doc = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(doc.stages.one.verdict, "passed"); assert.deepEqual(doc.stages.one.files, ["x"]);
    assert.equal(doc.stages.two.verdict, "failed");
    assert.equal(typeof doc.stages.one.seconds, "number");
    const r = mk(true);
    const one = await r.stage("one", async () => { runs++; });
    assert.equal(runs, 1, "a passed stage on the same tree is skipped"); assert.deepEqual(one.files, ["x"]);
    await r.stage("two", async () => { runs++; });
    assert.equal(runs, 2, "a failed stage re-runs");
    assert.deepEqual(r.skipped, ["one"]);
    // The tree moves DURING a stage: the stage records tree-moved and the gate stops.
    await assert.rejects(r.stage("three", async () => { tree = "b".repeat(40); }), /changed while three ran/);
    doc = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(doc.stages.three.verdict, "tree-moved");
    // A resume on the moved tree refuses with a GateRefusal (main() turns it into exit 3).
    assert.throws(() => mk(true), (e) => e instanceof W1.GateRefusal && /moved/.test(e.message));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("W1 --detach: a detached child without --detach, the status log stamped with its pid, a receipt", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-detach-"));
  try {
    const seen = {};
    const spawnFn = (cmd, args, opts) => { Object.assign(seen, { cmd, args, opts }); return { pid: 4242, unref() { seen.unref = true; } }; };
    const statusLog = path.join(dir, "artifacts/logs/deploy.log");
    const r = W1.detachGate(["--gate-only", "--detach", "--resume"], { statusLog, root: dir, spawnFn, tree: () => "t" });
    assert.equal(seen.cmd, process.execPath);
    assert.deepEqual(seen.args.slice(1), ["--gate-only", "--resume", "--log", "artifacts/logs/deploy.log"], "the child re-runs the gate without --detach");
    assert.equal(seen.opts.detached, true); assert.equal(seen.opts.stdio[0], "ignore"); assert.equal(seen.unref, true);
    // What --status reads right after the parent returns: the child's pid, running.
    const s = readStatus(statusLog, (pid) => pid === 4242);
    assert.deepEqual([s.state, s.pid, s.mode, s.code], ["running", 4242, "--gate-only,--resume", 124]);
    const receipt = JSON.parse(fs.readFileSync(path.join(dir, DETACH_RECEIPT), "utf8"));
    assert.deepEqual([receipt.pid, receipt.log, receipt.tree], [4242, DETACH_LOG, "t"]);
    assert.equal(r.pid, 4242);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("W1 `--gate-only --resume` on a moved tree refuses (exit 3) before any wait or stage", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-resume-"));
  try {
    const receipts = path.join(dir, "r.json");
    fs.writeFileSync(receipts, JSON.stringify({ tree: "0".repeat(40), head: "1".repeat(40), stages: { "test:guards": { tree: "0".repeat(40), verdict: "passed" } } }));
    const r = spawnSync("node", ["tools/ci/deploy.mjs", "--gate-only", "--resume", "--log", path.join(dir, "deploy.log")],
      { cwd: ROOT, encoding: "utf8", env: { ...process.env, APEX_GATE_RECEIPTS: receipts }, timeout: 60_000 });
    assert.equal(r.status, 3, r.stderr);
    // Exit 3 is also preflight's (a loaded box): the refusal line itself says which refused.
    const refused = r.stderr.split("\n").filter((l) => l.startsWith("[deploy] REFUSED"));
    assert.deepEqual(refused.map((l) => l.slice(0, 47)), ["[deploy] REFUSED: --resume: the work tree moved"], r.stderr);
    assert.doesNotMatch(r.stderr, /guard suite|waiting up to/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("W1 --detach outside --gate-only exits 2 before stamping anything", () => {
  const log = "artifacts/logs/deploy-detach-refused-never.log";
  const r = spawnSync("node", ["tools/ci/deploy.mjs", "--detach", "--log", log], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 2, r.stderr);
  assert.equal(r.stderr.trim(), "[deploy] --detach applies to --gate-only only (a deploy that pushes stays attached)");
  assert.ok(!fs.existsSync(path.join(ROOT, log)));
});

test("W1 --wait-load: default 10 min, =0 refuses at once, waits only at loadavg >= 2.8", () => {
  assert.equal(W1.waitLoadMinutes([]), 10);
  assert.equal(W1.waitLoadMinutes(["--wait-load=0"]), 0);
  assert.equal(W1.waitLoadMinutes(["--wait-load=3"]), 3);
  const waits = [];
  assert.equal(W1.waitForLoad(5, { load1: () => 1.0, wait: (m) => waits.push(m) }), false);
  assert.equal(W1.waitForLoad(0, { load1: () => 9, wait: (m) => waits.push(m) }), false);
  assert.equal(W1.waitForLoad(5, { load1: () => 3.5, wait: (m) => waits.push(m) }), true);
  assert.deepEqual(waits, [5]);
});

test("W1 the per-circuit ratchet baselines cure by a three-way merge by circuit, never a regeneration", () => {
  for (const f of W1.BASELINES) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} moved — update BASELINES`);
    assert.equal(W1.cureableConflicts([f]).cureable, true);
  }
  assert.deepEqual(W1.cureableConflicts(["tools/track/clip-baseline.json", "package.json"]).baselineF, ["tools/track/clip-baseline.json"]);
  const base = JSON.stringify({ monza: 3, spa: 1, baku: 2 });
  const ok = W1.mergeBaseline(base, JSON.stringify({ monza: 2, spa: 1, baku: 2 }), JSON.stringify({ monza: 3, spa: 1, baku: 2, imola: 0 }));
  assert.deepEqual([JSON.parse(ok.text), ok.conflicts], [{ monza: 2, spa: 1, baku: 2, imola: 0 }, []]);
  const clash = W1.mergeBaseline(base, JSON.stringify({ monza: 2, spa: 1, baku: 2 }), JSON.stringify({ monza: 4, spa: 1, baku: 2 }));
  assert.deepEqual(clash.conflicts, ["monza"], "the same circuit raised and lowered stops the merge");
});

test("W1 flags reach strictFlags' KNOWN_FLAGS once that list exists (mega train 3)", () => {
  // Before the train lands deploy.mjs has no KNOWN_FLAGS; after it, a missing entry makes strictFlags exit 2 on --resume.
  if (!W1.KNOWN_FLAGS) return;
  assert.deepEqual(W1.GATE_FLAGS.filter((f) => !W1.KNOWN_FLAGS.includes(f)), [], "add the W1 flags to deploy.mjs KNOWN_FLAGS");
});
