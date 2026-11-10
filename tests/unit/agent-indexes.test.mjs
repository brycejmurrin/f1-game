/* agent-indexes.test.mjs — generated hook index, coverage page, impact map, per-hook help.
 *
 * Both generators are deterministic: a fresh render of the index matches the
 * committed file, and a one-byte drift is not "identical". The coverage page is
 * built on demand into artifacts/ (never committed since 2026-11-10), so it is
 * pinned by determinism and by its write path, not against a committed copy. `help <hook>` prints one
 * index row and does not boot. Hook names are a bijection with a live
 * agentHelp() from the game VM.
 *
 * Run: node --test tests/unit/agent-indexes.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { firstDiff } from "../../tools/gen/gen-lib.mjs";
import { renderCoverage } from "../../tools/docs/gen-coverage-table.mjs";
import {
  agentHelpFromSource, flattenHooks, renderIndex, renderHookPage, renderImpact, buildIndex, buildImpactMap,
} from "../../tools/docs/gen-agent-index.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const node = process.execPath;

test("coverage page renders the same twice, and the agent index matches a fresh render", () => {
  assert.equal(firstDiff(renderCoverage(), renderCoverage()), "identical");
  const index = buildIndex();
  assert.equal(firstDiff(read("docs/agent-index.json"), renderIndex(index)), "identical");
  assert.equal(firstDiff(read("docs/AGENT-HOOKS.md"), renderHookPage(index)), "identical");
  assert.equal(firstDiff(read("tests/data/impact-map.json"), renderImpact()), "identical");
});

test("a drifted generated page fails the staleness comparison", () => {
  const fresh = renderCoverage();
  const drifted = fresh.replace("## Playwright specs", "## Playwright specs DRIFT");
  assert.notEqual(firstDiff(drifted, fresh), "identical");
  const impact = renderImpact();
  assert.notEqual(firstDiff(impact.replace('"narrowOnly": true', '"narrowOnly": false'), impact), "identical");
});

test("agent-index --check is clean; the coverage page builds into artifacts/ only, and an unknown flag writes nothing", () => {
  const ok = spawnSync(node, [path.join(ROOT, "tools/docs/gen-agent-index.mjs"), "--check"], { cwd: ROOT, encoding: "utf8", timeout: 120000 });
  assert.equal(ok.status, 0, `gen-agent-index --check\n${ok.stdout}${ok.stderr}`);
  const cov = path.join(ROOT, "tools/docs/gen-coverage-table.mjs");
  const built = spawnSync(node, [cov], { cwd: ROOT, encoding: "utf8", timeout: 120000 });
  assert.equal(built.status, 0, built.stdout + built.stderr);
  const page = path.join(ROOT, "artifacts/TESTING-COVERAGE.md");
  assert.equal(firstDiff(fs.readFileSync(page, "utf8"), renderCoverage()), "identical");
  assert.equal(spawnSync("git", ["ls-files", "--", "docs/TESTING-COVERAGE.md"], { cwd: ROOT, encoding: "utf8" }).stdout.trim(), "",
    "the retired committed copy must not come back");
  const before = fs.readFileSync(page);
  for (const flag of ["--chek", "--check"]) {
    const bad = spawnSync(node, [cov, flag], { cwd: ROOT, encoding: "utf8" });
    assert.equal(bad.status, 2, `${flag}: a built page has nothing to check against`);
  }
  assert.deepEqual(fs.readFileSync(page), before);
});

test("help physState prints that hook and no other", () => {
  const r = spawnSync(node, [path.join(ROOT, "tools/shot/agent.mjs"), "help", "physState"], { cwd: ROOT, encoding: "utf8", timeout: 20000 });
  assert.equal(r.status, 0, r.stderr);
  const row = JSON.parse(r.stdout);
  assert.equal(row.name, "physState");
  assert.equal(row.group, "read");
  assert.match(row.signature, /^physState\(/);
  assert.doesNotMatch(r.stdout, /"apiVersion"/);
  assert.doesNotMatch(r.stdout, /"perceive"/);
  const missing = spawnSync(node, [path.join(ROOT, "tools/shot/agent.mjs"), "help", "notARealHook"], { cwd: ROOT, encoding: "utf8", timeout: 20000 });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /no hook named/);
});

test("index hook rows are a bijection with agentHelp()", async () => {
  const { createGame } = createRequire(path.join(ROOT, "package.json"))("./tools/lib/game-vm.cjs");
  const g = await createGame({});
  try {
    const live = flattenHooks(g.apex.agentHelp());
    const fromSource = flattenHooks(agentHelpFromSource());
    assert.deepEqual(fromSource, live, "source evaluation drifted from the live manifest");
    const index = JSON.parse(read("docs/agent-index.json"));
    assert.deepEqual(index.hooks, live);
    const names = new Set(live.map((h) => h.name));
    assert.equal(names.size, new Set(index.hooks.map((h) => h.name)).size);
    assert.ok(names.has("physState"));
    assert.ok(names.has("world"));
  } finally { g.close(); }
});

test("impact map carries garage livery narrow pins for GLX readback witnesses (#3601)", () => {
  const witness = [
    "tests/specs/garage-livery-churn.spec.js",
    "tests/specs/parts-livery-zones.spec.js",
    "tests/specs/parts-livery-designs.spec.js",
  ];
  const map = buildImpactMap().map;
  for (const file of ["js/render/glx/soft.js", "js/render/glx/glx.js", "js/render/shared/assets.js"]) {
    assert.deepEqual([...(map[file]?.narrow || [])].sort(), witness.sort(), file);
  }
});

test("impact map is a narrow file to function to specs table", () => {
  const impact = JSON.parse(read("tests/data/impact-map.json"));
  assert.equal(impact.kind, "static-reference");
  assert.equal(impact.narrowOnly, true);
  const files = Object.keys(impact.map);
  assert.ok(files.length > 10, `impact map has ${files.length} files`);
  assert.ok(files.every((f) => f.startsWith("js/") && f.endsWith(".js")));
  const sample = files.find((f) => Object.values(impact.map[f]).some((specs) => specs.length));
  assert.ok(sample, "a mapped file lists at least one spec");
  for (const specs of Object.values(impact.map[sample])) {
    assert.ok(specs.every((s) => s.startsWith("tests/")));
  }
});

test("agent index carries no volatile test counts (#2808)", () => {
  const index = JSON.parse(read("docs/agent-index.json"));
  assert.ok(index.groups.length > 10);
  for (const g of index.groups) assert.ok(!("declaredTests" in g), `${g.id} carries a declaredTests count`);
});
