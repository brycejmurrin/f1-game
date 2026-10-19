/* agent-indexes.test.mjs — generated hook index, coverage page, impact map, per-hook help.
 *
 * Both generators are deterministic: a fresh render matches the committed
 * file, and a one-byte drift is not "identical". `help <hook>` prints one
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
import { collectAgentSurface, render as renderHooksTable } from "../../tools/gen/gen-hooks-table.mjs";
import { agentHelpGroupsFromSource } from "../../tools/lib/agent-help-source.mjs";
import { renderCoverage } from "../../tools/docs/gen-coverage-table.mjs";
import {
  agentHelpFromSource, flattenHooks, renderIndex, renderHookPage, renderImpact, buildIndex,
} from "../../tools/docs/gen-agent-index.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const node = process.execPath;

test("coverage page and agent index match a fresh render", () => {
  assert.equal(firstDiff(read("docs/TESTING-COVERAGE.md"), renderCoverage()), "identical");
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

test("generator --check is clean, and an unknown flag does not write", () => {
  for (const tool of ["tools/docs/gen-coverage-table.mjs", "tools/docs/gen-agent-index.mjs"]) {
    const ok = spawnSync(node, [path.join(ROOT, tool), "--check"], { cwd: ROOT, encoding: "utf8", timeout: 120000 });
    assert.equal(ok.status, 0, `${tool} --check\n${ok.stdout}${ok.stderr}`);
  }
  const page = path.join(ROOT, "docs/TESTING-COVERAGE.md");
  const before = fs.readFileSync(page);
  const bad = spawnSync(node, [path.join(ROOT, "tools/docs/gen-coverage-table.mjs"), "--chek"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(bad.status, 2);
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


test("shared agentHelp index reader evaluates constants and its supported static grammar", () => {
  const src = `const version = 3; const prefix = "base";
    const calls = [prefix + " call", -2, null, undefined];
    function agentHelp() { return {
      apiVersion: version, perceive: { "thing()": prefix + " summary" },
      extra: { calls, missing: undefined }, label: \`literal\`, sum: 2 + 3
    }; }`;
  assert.deepEqual(agentHelpFromSource(src), {
    apiVersion: 3, perceive: { "thing()": "base summary" },
    extra: { calls: ["base call", -2, null, undefined], missing: undefined }, label: "literal", sum: 5,
  });
  for (const expr of ["unknown", "someCall()", "[unknown]", "{ [key]: 1 }", "[1,,2]", '"x" + 1', "`a${version}b`"]) {
    assert.throws(() => agentHelpFromSource(`const version = 3; function agentHelp() { return { perceive: { x: ${expr} } }; }`), /did not evaluate/);
  }
  assert.throws(() => agentHelpFromSource("function unrelated() { return {}; }"), /return object not found/);
});

test("shared agentHelp table reader retains its separate legacy string grammar and renderer escaping", () => {
  const src = `function agentHelp() { return {
    model: { ignored: arbitraryCall() },
    perceive: { "a|b()": "  first\\nline | " + "second", n: 2 + 3, t: \`a\${ignored}b\` },
    act: { ok: true }, perceive: { repeated: "last" }
  }; }`;
  assert.deepEqual(agentHelpGroupsFromSource(src), [
    { group: "perceive", calls: [
      { call: "a|b()", says: "  first\nline | second" }, { call: "n", says: "23" }, { call: "t", says: "ab" },
    ] },
    { group: "act", calls: [{ call: "ok", says: "true" }] },
    { group: "perceive", calls: [{ call: "repeated", says: "last" }] },
  ]);
  const table = collectAgentSurface(src);
  assert.equal(table[0].calls[0].call, "a\\|b()");
  assert.equal(table[0].calls[0].says, " first line \\| second");
  assert.throws(() => collectAgentSurface("function agentHelp() { return { act: { bad: SOME_CONSTANT } }; }"), /cannot fold Identifier at line 1/);
  assert.throws(() => collectAgentSurface("function unrelated() {}"), /could not find function agentHelp/);
  assert.throws(() => collectAgentSurface("function agentHelp() { return 1; }"), /no object return/);
  assert.throws(() => collectAgentSurface("function agentHelp() { return { model: {} }; }"), /no perceive\/detail\/know\/act groups/);
});

test("shared agentHelp readers preserve current generated hook reference bytes", () => {
  const doc = read("docs/DEBUG-HOOKS.md");
  assert.equal(firstDiff(doc, renderHooksTable(doc)), "identical");
  const table = collectAgentSurface();
  assert.deepEqual(table.map((g) => g.group), ["perceive", "detail", "know", "act"]);
  assert.ok(flattenHooks(agentHelpFromSource()).some((h) => h.group === "model"));
});
