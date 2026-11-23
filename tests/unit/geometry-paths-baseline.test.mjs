// geometry-paths-baseline.test.mjs — a baseline-only diff runs the sweep that reads it (ledger M36, 2026-10-09).
//
// tests/data/scenery-audit-baseline.json is the ratchet tests/unit/scenery-ground-audit.test.mjs
// (a test:sweeps suite) loads through tools/track/ground-audit.cjs. Neither the
// fleet pattern nor a TARGETED rule named it, so a PR that only moved a cap ran
// no sweep and the first run of the suite landed on an unrelated later diff.
// Also (2026-11-10): the inputs a sweep suite loads through tests/helpers/
// (editor-vm's js/editor/ files) route that suite — the derived tier.
//
// Run: node --test tests/unit/geometry-paths-baseline.test.mjs   (npm run test:tooling-fast)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { targetedSuites, sweepOrder, suiteReads, derivedTargeted, TARGETED, GEOMETRY_PATHS } from "../../tools/ci/geometry-paths.mjs";
import { mkTmpDir } from "../helpers/tmp-dir.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASELINE = "tests/data/scenery-audit-baseline.json";
const SUITE = "tests/unit/scenery-ground-audit.test.mjs";

test("the scenery audit baseline routes the targeted sweep that reads it", () => {
  assert.deepEqual(targetedSuites([BASELINE]), [SUITE]);
  assert.deepEqual(targetedSuites(["docs/PHYSICS.md", BASELINE]), [SUITE], "alongside other paths");
});

test("the routed suite is a real test:sweeps member and really reads the baseline", () => {
  assert.ok(sweepOrder().includes(SUITE), `${SUITE} must be in test:sweeps`);
  assert.ok(fs.existsSync(path.join(ROOT, BASELINE)));
  assert.match(fs.readFileSync(path.join(ROOT, "tools/track/ground-audit.cjs"), "utf8"), /scenery-audit-baseline\.json/);
});

test("an unrelated data file still routes no sweep", () => {
  assert.deepEqual(targetedSuites(["tests/data/ratchets.json", "tests/data/flaky-quarantine.json"]), []);
});

/* THE HELPER BLIND SPOT (2026-11-10). Both the fleet trigger and the no-drift
 * scan in deploy-tool.test.mjs read a sweep suite's OWN source, so the inputs
 * a suite loads through tests/helpers/ ran no sweep: `--targeted` printed
 * nothing for js/editor/validate.js, which tests/helpers/editor-vm.mjs runs
 * into the VM track-validate-fleet and kerb-berm-surface measure. The derived
 * tier (geometry-paths.mjs suiteReads/derivedTargeted) follows the helpers. */
const EDITOR_SUITES = ["tests/unit/kerb-berm-surface.test.mjs", "tests/unit/track-validate-fleet.test.mjs"];

test("an editor-only edit routes the sweeps that boot the editor through editor-vm", () => {
  assert.deepEqual(targetedSuites(["js/editor/validate.js"]), EDITOR_SUITES,
    "js/editor/validate.js alone must run the suites whose VM loads it");
  for (const f of ["js/core/hash32.js", "js/ui/track-maps.js", "tests/helpers/editor-vm.mjs"]) {
    assert.deepEqual(targetedSuites([f]), EDITOR_SUITES, `${f} is loaded by editor-vm`);
  }
  assert.ok(sweepOrder().includes(EDITOR_SUITES[0]) && sweepOrder().includes(EDITOR_SUITES[1]), "premise: both are test:sweeps suites");
});

test("every file editor-vm boots routes both editor sweeps (from the helper's own exported lists)", async () => {
  // Independent of the parser: the helper's exported load lists, not a regex over its text.
  const { BOOT_FILES, EDITOR_FILES } = await import("../helpers/editor-vm.mjs");
  const boots = [...BOOT_FILES, ...EDITOR_FILES, "js/ui/track-maps.js"];
  assert.ok(boots.length >= 10, `premise: editor-vm boots ${boots.length} modules`);
  for (const f of boots) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} exists`);
    for (const s of EDITOR_SUITES) assert.ok(targetedSuites([f]).includes(s), `${f} (booted by editor-vm) must route ${s}`);
  }
});

test("a helper file itself routes every sweep suite that loads it", () => {
  assert.deepEqual(targetedSuites(["tests/helpers/barrier-runoff-probe.cjs"]), ["tests/unit/barrier-runoff-jumps.test.mjs"]);
  const absUsers = sweepOrder().filter((s) => /helpers\/abs-src\.mjs/.test(fs.readFileSync(path.join(ROOT, s), "utf8"))
    || suiteReads(s).helpers.includes("tests/helpers/abs-src.mjs"));
  assert.ok(absUsers.length >= 5, `premise: abs-src is used by ${absUsers.length} sweep suites`);
  assert.deepEqual(targetedSuites(["tests/helpers/abs-src.mjs"]), [...absUsers].sort((a, b) => sweepOrder().indexOf(a) - sweepOrder().indexOf(b)));
  assert.deepEqual(targetedSuites(["tests/helpers/fixtures.js"]), [], "a helper no sweep suite loads routes nothing");
  assert.deepEqual(targetedSuites(["js/game.js"]), [], "game.js still routes no sweep");
});

test("every path a sweep suite reads, through any helper, is covered by a tier that runs it", () => {
  let checked = 0, viaHelper = 0;
  for (const suite of sweepOrder()) {
    const { reads, helpers } = suiteReads(suite);
    if (helpers.length) viaHelper++;
    for (const dep of reads) {
      checked++;
      assert.ok(GEOMETRY_PATHS.test(dep) || TARGETED.some((r) => new RegExp(r.ere).test(dep) && r.suites.includes(suite)),
        `${suite} reads ${dep} but no tier that runs it watches that path`);
    }
  }
  assert.ok(checked >= 40 && viaHelper >= 5, `premise: ${checked} reads, ${viaHelper} suites with helpers`);
});

test("the derivation follows nested helpers and fails safe on one it cannot read", () => {
  // Fixture paths are spelled through J/H/U so docs-integrity's comment-path
  // scan does not read them as references to real repo files.
  const J = "js", H = "tests/" + "helpers", U = "tests/" + "unit";
  const dir = mkTmpDir("geo-helpers-");
  const w = (rel, s) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), s); };
  w(`${U}/a.test.mjs`, `import { x } from "../helpers/outer.mjs";\n// "${J}/commented/out.js"\n`);
  w(`${H}/outer.mjs`, `import "./inner.mjs";\nexport const F = ["${J}/editor/zz.js"];\n`);
  w(`${H}/inner.cjs`, "");
  w(`${H}/inner.mjs`, 'const p = path.join(ROOT, "js", "ui", "deep.js");\n');
  const { reads, helpers } = suiteReads(`${U}/a.test.mjs`, dir);
  assert.deepEqual(helpers, [`${H}/inner.mjs`, `${H}/outer.mjs`]);
  assert.deepEqual(reads, [`${J}/editor/zz.js`, `${J}/ui/deep.js`, `${H}/inner.mjs`, `${H}/outer.mjs`],
    "nested helpers and the split-segment spelling are followed; comments are not");
  const rules = derivedTargeted([`${U}/a.test.mjs`], dir, []);
  assert.equal(rules.length, 1);
  assert.ok(new RegExp(rules[0].ere).test(`${J}/ui/deep.js`) && !new RegExp(rules[0].ere).test(`${J}/ui/deep.js.bak`));
  w(`${U}/b.test.mjs`, 'import "../helpers/gone.mjs";\n');
  assert.throws(() => derivedTargeted([`${U}/b.test.mjs`], dir, []), /gone\.mjs.*cannot be read/,
    "a helper that cannot be read must throw (ci.yml turns that into run_all), never route nothing");
  assert.throws(() => derivedTargeted([], dir, []), /no test:sweeps suites/, "an empty suite list must not derive an empty tier");
});
