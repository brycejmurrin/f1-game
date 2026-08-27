/* test-groups.test.mjs — keep the test TAXONOMY honest.
 *
 * The suite is navigated by npm `test:<group>` scripts, not by directory: the
 * specs (115 at the 2026-08 census; the count test below holds the live number,
 * now under tests/specs/) and the groups are what say which ones matter for a
 * given change. That only works while three things agree — package.json, the
 * routing rules in tools/pick-tests.mjs, and docs/TESTING.md. Nothing forces
 * them to, and each has drifted: TESTING.md advertised 69 specs against 98 on
 * disk and listed `tooling` twice while omitting a dozen groups outright.
 *
 * These are mechanical checks only. Whether a group is a GOOD grouping is a
 * judgement call and stays with the reader.
 *
 * Run: node --test tests/unit/test-groups.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RULES } from "../../tools/pick-tests.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const pkg = JSON.parse(read("package.json"));

const GROUPS = Object.keys(pkg.scripts)
  .filter((k) => k.startsWith("test:"))
  .map((k) => k.slice(5));

// Partition/meta scripts: they run a project or a tool rather than naming a
// topical set of specs, so the coverage audit and the docs table treat them
// differently from the rest.
const META = new Set(["headless", "render", "update", "pick", "bg"]);

test("every group tools/pick-tests.mjs routes to exists in package.json", () => {
  const missing = [];
  for (const [re, groups] of RULES)
    for (const g of groups)
      if (!pkg.scripts[`test:${g}`]) missing.push(`${re} -> test:${g}`);
  assert.deepEqual(missing, [],
    "a pick-tests rule points at a script that does not exist — rename the rule with the script");
});

test("test:tooling-fast is the sequential runner (not a parallel node --test dump)", () => {
  assert.match(pkg.scripts["test:tooling-fast"], /^node tools\/tooling-fast\.mjs\b/,
    "bunched `node --test file1 file2…` parallelises by default — use tools/tooling-fast.mjs");
  assert.ok(fs.existsSync(path.join(ROOT, "tools/tooling-fast.mjs")),
    "tools/tooling-fast.mjs must exist (per-file logging + --test-concurrency=1)");
});

test("pick-tests routes every source directory somewhere", () => {
  // A source tree no rule matches is a change nobody is told to test. Checked
  // at DIRECTORY granularity: individual files fall through to their dir's rule.
  const dirs = ["js", "js/render", "js/track", "js/circuits", "js/car", "js/game",
                "js/data", "js/net", "css", "tools", "tests", "docs"];
  const unrouted = dirs.filter((d) => {
    const probe = `${d}/probe.js`;
    return !RULES.some(([re]) => re.test(probe));
  });
  assert.deepEqual(unrouted, [],
    "a source directory matches no pick-tests rule — a change there would be told to run nothing");
});

/* Pull one "## N. Heading" section out of the doc, so a table elsewhere in the
   file cannot be mistaken for the one being checked. */
function section(doc, heading) {
  const start = doc.indexOf(`## ${heading}`);
  assert.ok(start >= 0, `docs/TESTING.md has no "## ${heading}" section`);
  const next = doc.indexOf("\n## ", start + 1);
  return doc.slice(start, next < 0 ? doc.length : next);
}

test("docs/TESTING.md documents every test group, and no group that is gone", () => {
  const doc = section(read("docs/TESTING.md"), "2. Test groups");
  // The group tables' first column is `| \`<name>\` |`.
  const listed = new Set([...doc.matchAll(/^\|\s*`([a-z-]+)`\s*\|/gm)].map((m) => m[1]));
  const undocumented = GROUPS.filter((g) => !META.has(g) && !listed.has(g));
  const stale = [...listed].filter((g) => !GROUPS.includes(g));
  assert.deepEqual(undocumented, [], "an npm test:* group is missing from the docs/TESTING.md group table");
  assert.deepEqual(stale, [], "docs/TESTING.md lists a group that no longer exists in package.json");
});

test("docs/TESTING.md's coverage table names every root spec and unit suite", () => {
  const doc = section(read("docs/TESTING.md"), "5. Coverage table");
  // A row may name a FAMILY with a glob — the 16 per-circuit foundation specs
  // differ only by circuit and 16 identical rows would document nothing. A new
  // KIND of spec still has to earn its own row.
  const globs = [...doc.matchAll(/`([a-z0-9_-]*\*[a-z0-9_*-]*\.(?:spec\.js|test\.mjs))`/g)]
    .map((m) => new RegExp("^" + m[1].replace(/[.]/g, "\\.").replace(/\*/g, "[a-z0-9_-]*") + "$"));
  const files = ["specs", "unit"].flatMap((d) => fs.readdirSync(path.join(ROOT, "tests", d)))
    .filter((f) => /\.(spec\.js|test\.(mjs|cjs))$/.test(f));
  const missing = files.filter((f) => !doc.includes(f) && !globs.some((re) => re.test(f)));
  assert.deepEqual(missing, [],
    "a test file exists but is not described in the docs/TESTING.md coverage table — say what it covers");
});

test("docs/TESTING.md's file counts match the files on disk", () => {
  const doc = read("docs/TESTING.md");
  const specs = fs.readdirSync(path.join(ROOT, "tests", "specs")).filter((f) => f.endsWith(".spec.js")).length;
  const units = fs.readdirSync(path.join(ROOT, "tests", "unit")).filter((f) => f.endsWith(".test.mjs")).length;

  for (const [re, actual, what] of [
    [/(\d+)\s+root Playwright spec/gi, specs, "root Playwright specs"],
    [/(\d+)\s+`?node --test`? unit suites/gi, units, "node --test unit suites"],
  ]) {
    const claimed = [...doc.matchAll(re)].map((m) => Number(m[1]));
    assert.ok(claimed.length, `docs/TESTING.md no longer states a count of ${what}`);
    for (const n of claimed)
      assert.equal(n, actual, `docs/TESTING.md claims ${n} ${what}; tests/ holds ${actual}`);
  }
});

test("the manual suites stay out of default discovery", () => {
  // tests/manual/ renders hundreds of SwiftShader frames and emits review
  // images. Letting it into the default run would take a 3-minute group to an
  // hour, silently — the failure mode is a timeout nobody attributes.
  const cfg = read("playwright.config.js");
  assert.match(cfg, /testIgnore:\s*\[[^\]]*manual/,
    "playwright.config.js must keep **/manual/** out of default discovery");
  assert.ok(fs.existsSync(path.join(ROOT, "tests/manual/README.md")),
    "tests/manual/ needs a README saying what is in it and how to run it");
});

test("RENDER_SPECS partitions the root specs — every spec lands in exactly one project", () => {
  // The headless project is "everything NOT in RENDER_SPECS", so a name that
  // matches nothing silently leaves a GL spec running with headless-level
  // concurrency, which is how SwiftShader thrash gets reintroduced.
  const cfg = read("playwright.config.js");
  const body = cfg.match(/const RENDER_SPECS = \[([\s\S]*?)\]\s*\.map/);
  assert.ok(body, "could not find RENDER_SPECS in playwright.config.js");
  const named = [...body[1].matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]);
  const onDisk = new Set(fs.readdirSync(path.join(ROOT, "tests", "specs"))
    .filter((f) => f.endsWith(".spec.js")).map((f) => f.replace(/\.spec\.js$/, "")));
  const dangling = named.filter((n) => !onDisk.has(n));
  assert.deepEqual(dangling, [],
    "RENDER_SPECS names a spec that no longer exists — it would silently run in the headless project");
});

test("no test:* group pins a --project that excludes one of the specs it names", () => {
  // The other direction of the partition, and the one that bites hardest.
  // `test:tiny` used to pass tests/specs/logging.spec.js together with
  // --project=render while "logging" was NOT in RENDER_SPECS: the render
  // project is testMatch: RENDER_SPECS, so the spec matched no project and
  // simply never ran. Playwright reports that as a pass — it has nothing to
  // say about a file it was never asked to run — so the command AGENTS.md
  // tells every agent to run after ANY edit was quietly a third smaller than
  // it looked. The test above only catches a RENDER_SPECS name with no file;
  // nothing caught a file with no matching project.
  const cfg = read("playwright.config.js");
  const body = cfg.match(/const RENDER_SPECS = \[([\s\S]*?)\]\s*\.map/);
  assert.ok(body, "could not find RENDER_SPECS in playwright.config.js");
  const render = new Set([...body[1].matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]));

  const scripts = JSON.parse(read("package.json")).scripts || {};
  const offenders = [];
  // The path pattern admits SUBDIRECTORIES. It used to be `tests/([a-z0-9-]+)`,
  // which the tests/ split (AUDIT-SYNTHESIS §R2) would have stopped matching
  // entirely — the loop body would never run, `offenders` would stay empty, and
  // this test would have gone on passing while checking nothing. `matched`
  // below is the part that makes that impossible to repeat: a pattern that
  // finds nothing is a broken pattern, not a clean repo.
  const SPEC_REF = /tests\/(?:[a-z0-9-]+\/)*([a-z0-9-]+)\.spec\.js/g;
  let matched = 0;
  for (const [name, cmd] of Object.entries(scripts)) {
    const proj = cmd.match(/--project=(\w+)/);
    if (!proj) continue;                       // no pin, both projects are eligible
    const wants = proj[1];
    if (wants !== "render" && wants !== "headless") continue;
    for (const m of cmd.matchAll(SPEC_REF)) {
      matched++;
      const spec = m[1];
      const inRender = render.has(spec);
      if (wants === "render" && !inRender) offenders.push(`${name}: ${spec} is not in RENDER_SPECS`);
      if (wants === "headless" && inRender) offenders.push(`${name}: ${spec} IS in RENDER_SPECS`);
    }
  }
  // WHY the input set is empty matters more than the output set being empty.
  //
  // This guard is DORMANT today, measured: the only scripts carrying
  // `--project=` are test:render and test:headless, and both run a whole
  // project without naming a single spec, so `matched` is 0. That is the RIGHT
  // reason to find nothing — the bug in the header was fixed by removing
  // test:tiny's pin, and the guard is here for the shape's return.
  //
  // It is one character away from the WRONG reason. The old pattern was
  // `tests/([a-z0-9-]+)`, which the tests/ split stops matching entirely, and
  // this test would have gone on passing on the strength of a broken regex.
  // So: if nothing matched, prove that nothing was there to match.
  if (matched === 0) {
    for (const [name, cmd] of Object.entries(scripts)) {
      if (!/--project=(render|headless)\b/.test(cmd)) continue;
      assert.ok(!/tests\//.test(cmd),
        `${name} pins a --project AND names paths under tests/, but the spec pattern ` +
        `matched none of them — the pattern is stale, not the repo clean`);
    }
  }

  assert.deepEqual(offenders, [],
    "a test:* group names a spec its pinned --project cannot match, so that spec never runs");
});
