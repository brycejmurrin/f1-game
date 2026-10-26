/* workflow-lint.test.mjs — tools/check/workflow-lint.mjs (actionlint + zizmor over .github/workflows).
 *
 * The tree must be clean, and the check must FAIL on a planted bad workflow (tests/fixtures/workflow-lint/bad)
 * while passing a good one — otherwise a green run could mean "the linter never ran".
 *
 * The binaries come from tools/env/install-lint-bins.sh. Absent: this test SKIPS and says so on stderr; under
 * APEX_REQUIRE_LINT_BINS=1 (the CI `lints` job) an absent binary is a FAILURE, never a silent pass.
 *
 * Run: node --test tests/unit/workflow-lint.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { lintWorkflows } from "../../tools/check/workflow-lint.mjs";
import { ROOT, requireBins, resolveBin } from "../../tools/lib/lint-bins.mjs";

const FIX = "tests/fixtures/workflow-lint";
const need = (tool) => {
  if (resolveBin(tool)) return false;
  const msg = `${tool} not installed - NOT CHECKED (bash tools/env/install-lint-bins.sh ${tool})`;
  if (requireBins([])) assert.fail(msg);
  console.error(`SKIP workflow-lint.test: ${msg}`);
  return msg;
};
const row = (rows, tool) => rows.find((r) => r.tool === tool);

test("the tree's workflows are clean under actionlint", { skip: need("actionlint") }, () => {
  const r = row(lintWorkflows(), "actionlint");
  assert.equal(r.status, "clean", r.output);
});

test("the tree's workflows are clean under zizmor (offline)", { skip: need("zizmor") }, () => {
  const r = row(lintWorkflows(), "zizmor");
  assert.equal(r.status, "clean", r.output);
});

test("actionlint FAILS the planted bad workflow and passes the good one", { skip: need("actionlint") }, () => {
  const bad = row(lintWorkflows({ dir: `${FIX}/bad/.github/workflows`, useRepoConfig: false }), "actionlint");
  assert.equal(bad.status, "findings");
  assert.match(bad.output, /evnet/, "names the planted unknown context property");
  const good = row(lintWorkflows({ dir: `${FIX}/good/.github/workflows`, useRepoConfig: false }), "actionlint");
  assert.equal(good.status, "clean", good.output);
});

test("zizmor FAILS the planted bad workflow and passes the good one", { skip: need("zizmor") }, () => {
  const bad = row(lintWorkflows({ dir: `${FIX}/bad/.github/workflows`, useRepoConfig: false }), "zizmor");
  assert.equal(bad.status, "findings");
  assert.match(bad.output, /template-injection/);
  assert.match(bad.output, /unpinned-uses/);
  const good = row(lintWorkflows({ dir: `${FIX}/good/.github/workflows`, useRepoConfig: false }), "zizmor");
  assert.equal(good.status, "clean", good.output);
});

test("the suppression configs stay narrow and reasoned (no blanket off)", () => {
  const al = fs.readFileSync(path.join(ROOT, ".github/actionlint.yaml"), "utf8");
  for (const m of al.matchAll(/ignore:\s*\[?([^\n]*)/g)) assert.doesNotMatch(m[1], /['"]\.\*['"]/, "no catch-all actionlint ignore");
  const ignores = [...al.matchAll(/^\s+- '(.+)'/gm)].map((m) => m[1]);
  assert.ok(ignores.length >= 1 && ignores.every((p) => p.length > 8), `ignore patterns are specific messages: ${ignores}`);
  const zz = fs.readFileSync(path.join(ROOT, ".github/zizmor.yml"), "utf8");
  const disabled = [...zz.matchAll(/^  ([a-z-]+):\n\s+disable: true/gm)].map((m) => m[1]);
  assert.deepEqual(disabled, ["self-repository"], "only the reviewed audit is disabled");
  assert.match(zz, /#.*(actionlint|\$\/)/, "the disable carries its reason");
  // Inline `zizmor: ignore[...]` always names the audit and gives a reason after it.
  for (const f of fs.readdirSync(path.join(ROOT, ".github/workflows"))) {
    const text = fs.readFileSync(path.join(ROOT, ".github/workflows", f), "utf8");
    for (const m of text.matchAll(/zizmor: ignore(\[[^\]]*\])?(.*)$/gm)) {
      assert.match(m[1] || "", /^\[[a-z-]+\]$/, `${f}: a zizmor ignore names one audit`);
      assert.ok(m[2].trim().length >= 12, `${f}: a zizmor ignore says why`);
    }
  }
});

// These executable fixtures exercise the real CLI with shellcheck outside
// PATH. They need no installed linter and cannot start any browser workload.
function lintFixture(t) {
  const parent = path.join(ROOT, "artifacts", "workflow-lint-tests");
  fs.mkdirSync(parent, { recursive: true });
  const dir = fs.mkdtempSync(path.join(parent, "override-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, "clean.yml"), "name: fixture\non: push\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n");
  const executable = (name, body) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, `#!${process.execPath}\nif(process.argv.includes('--version')) { console.log('fixture 1.0.0'); process.exit(0); }\n${body}\n`, { mode: 0o755 });
    return file;
  };
  const shellcheck = executable("custom shellcheck.cjs", `require('node:fs').appendFileSync(process.env.SC_CALLS, 'shellcheck\\n');
    if(process.env.SC_FINDING === '1') { console.error('SC2086: Double quote to prevent globbing'); process.exit(1); }`);
  const actionlint = executable("actionlint.cjs", `const fs = require('node:fs'), args = process.argv.slice(2);
    fs.writeFileSync(process.env.AL_ARGS, JSON.stringify(args));
    const index = args.indexOf('-shellcheck');
    const sc = index < 0 ? undefined : args[index + 1];
    if(sc) {
      const r = require('node:child_process').spawnSync(sc, ['--format=json', '-'], { encoding:'utf8', input:'echo $unquoted' });
      process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
      process.exit(r.error ? 3 : r.status === 0 ? 0 : 1);
    }`);
  const zizmor = executable("zizmor.cjs", "");
  const argsLog = path.join(dir, "args.json"), callsLog = path.join(dir, "calls.txt");
  const env = { ...process.env, PATH: dir, APEX_ACTIONLINT: actionlint, APEX_SHELLCHECK: shellcheck,
    APEX_ZIZMOR: zizmor, AL_ARGS: argsLog, SC_CALLS: callsLog, SC_FINDING: "0" };
  return { dir, shellcheck, argsLog, callsLog, env,
    run: (extraEnv = {}) => spawnSync(process.execPath,
      [path.join(ROOT, "tools/check/workflow-lint.mjs"), "--dir", dir, "--require", "--json"],
      { cwd: ROOT, env: { ...env, ...extraEnv }, encoding: "utf8", timeout: 10000 }) };
}

test("actionlint receives the resolved PATH-external shellcheck and propagates its finding", (t) => {
  const fixture = lintFixture(t);
  const clean = fixture.run();
  assert.equal(clean.status, 0, clean.stderr);
  const args = JSON.parse(fs.readFileSync(fixture.argsLog, "utf8"));
  assert.equal(args[args.indexOf("-shellcheck") + 1], fixture.shellcheck, "forward the exact executable, including spaces");
  assert.equal(fs.readFileSync(fixture.callsLog, "utf8"), "shellcheck\n", "actionlint invoked the reported executable");
  const bad = fixture.run({ SC_FINDING: "1" });
  assert.equal(bad.status, 1, bad.stderr);
  const results = JSON.parse(bad.stdout);
  assert.equal(row(results, "actionlint").status, "findings");
  assert.match(row(results, "actionlint").output, /SC2086/);
});

test("an unavailable authoritative shellcheck override is skipped and explicitly disabled", (t) => {
  const fixture = lintFixture(t);
  const result = fixture.run({ APEX_SHELLCHECK: path.join(fixture.dir, "does-not-exist") });
  assert.equal(result.status, 1, "--require fails when shellcheck is unavailable");
  const results = JSON.parse(result.stdout);
  assert.equal(row(results, "shellcheck").status, "skipped");
  assert.match(result.stderr, /SKIP workflow-lint: shellcheck.*NOT CHECKED/);
  const args = JSON.parse(fs.readFileSync(fixture.argsLog, "utf8"));
  assert.ok(args.includes("-shellcheck"));
  assert.equal(args[args.indexOf("-shellcheck") + 1], "", "do not let actionlint discover an unrelated binary");
  assert.equal(fs.existsSync(fixture.callsLog), false);
});
