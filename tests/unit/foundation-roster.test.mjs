// foundation-roster.test.mjs — tests/specs/circuit-foundation.spec.js registers the
// right circuits' cases (TK2-17, #3039), and the static billers see what it registers.
// Run: node --test tests/unit/foundation-roster.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { foundationScope } from "../helpers/foundation-roster.js";
import { caseModules, caseModuleIds, declaredTests, declaredTestsIn } from "../../tools/ci/select-budget.mjs";
import { FOUNDATION_REGISTRY, maxDeclaredTimeout, circuitsOf } from "../../tools/ci/select-specs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const IDS = caseModuleIds(FOUNDATION_REGISTRY);

test("foundationScope: empty = all, a match narrows, a miss FAILS CLOSED to all", () => {
  const roster = ["monza", "spa", "vegas"];
  assert.deepEqual(foundationScope(roster, ""), roster);
  assert.deepEqual(foundationScope(roster, undefined), roster);
  assert.deepEqual(foundationScope(roster, "spa"), ["spa"]);
  assert.deepEqual(foundationScope(roster, " monza , madrid "), ["monza"], "ids are trimmed; unknown ids are ignored");
  assert.deepEqual(foundationScope(roster, "vegas,monza"), ["monza", "vegas"], "roster order, not scope order");
  assert.deepEqual(foundationScope(roster, "madrid"), roster, "a scope naming none of the roster runs every circuit, never nothing");
});

test("the registry imports exactly tests/specs/foundation/*.js, one per circuit, and registers each", () => {
  const onDisk = fs.readdirSync(path.join(ROOT, "tests/specs/foundation")).filter((f) => f.endsWith(".js"))
    .map((f) => `tests/specs/foundation/${f}`).sort();
  assert.deepEqual([...caseModules(FOUNDATION_REGISTRY)].sort(), onDisk, "a case module the registry does not import runs nowhere");
  const { CIRCUITS } = createRequire(import.meta.url)("../../tools/manifest.cjs");
  for (const id of IDS) {
    assert.ok(CIRCUITS.includes(id), `tests/specs/foundation/${id}.js: the file name must be a circuit id`);
    assert.ok(!fs.existsSync(path.join(ROOT, `tests/specs/${id.replace(/_/g, "-")}-foundation.spec.js`)),
      `${id} has a case module AND its own foundation spec — one home per circuit`);
    const src = fs.readFileSync(path.join(ROOT, `tests/specs/foundation/${id}.js`), "utf8");
    assert.match(src, /^export default function register\(\) \{$/m, `${id}: a case module exports default register()`);
    // circuitsOf reads the circuits a module builds from its literals: a module must build its own id only,
    // or APEX_CIRCUITS=<id> would skip a circuit the cases also exercise.
    assert.deepEqual([...circuitsOf(`tests/specs/foundation/${id}.js`)], [id], `${id}: builds only its own circuit`);
  }
  const spec = fs.readFileSync(path.join(ROOT, FOUNDATION_REGISTRY), "utf8");
  assert.match(spec, /foundationScope\(Object\.keys\(REGISTER\), process\.env\.APEX_CIRCUITS\)/);
  for (const id of IDS) assert.match(spec, new RegExp(`const REGISTER = \\{[^}]*\\b${id}\\b`), `${id} is imported but not registered`);
});

test("the billers count the cases the registry will run (whole, and under a scope)", () => {
  const per = Object.fromEntries(IDS.map((id) => [id, declaredTests(`tests/specs/foundation/${id}.js`)]));
  const total = Object.values(per).reduce((a, n) => a + n, 0);
  assert.ok(IDS.every((id) => per[id] >= 1), JSON.stringify(per));
  assert.equal(declaredTests(FOUNDATION_REGISTRY), total, "unscoped: every module's tests");
  assert.equal(declaredTestsIn(FOUNDATION_REGISTRY, ["spa"]), per.spa);
  assert.equal(declaredTestsIn(FOUNDATION_REGISTRY, ["monza", "spa"]), per.monza + per.spa);
  assert.equal(declaredTestsIn(FOUNDATION_REGISTRY, ["madrid"]), total, "a scope matching nothing bills everything (fail closed)");
  assert.equal(declaredTestsIn(FOUNDATION_REGISTRY, null), total);
  assert.equal(declaredTestsIn("tests/specs/smoke.spec.js", ["spa"]), declaredTests("tests/specs/smoke.spec.js"), "other specs ignore the scope");
  const max = Math.max(...IDS.map((id) => maxDeclaredTimeout(`tests/specs/foundation/${id}.js`)));
  assert.equal(maxDeclaredTimeout(FOUNDATION_REGISTRY), max, "the job's kill timer clears the slowest case module");
  assert.equal(maxDeclaredTimeout(FOUNDATION_REGISTRY, ["monza"]), maxDeclaredTimeout("tests/specs/foundation/monza.js"));
  assert.deepEqual([...circuitsOf(FOUNDATION_REGISTRY)].sort(), [...IDS].sort(), "circuitsOf follows the case modules");
});
