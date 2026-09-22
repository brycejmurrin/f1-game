/* adapted-specs.test.mjs — the browser specs that run AS THEMSELVES in node.
 *
 * tools/ci/twinned-specs.mjs `ADAPTED` names browser specs whose every call
 * tests/helpers/vm-page.js serves, and which ran green under it. This file is
 * their node gate: `npm run test:vm-page`, in ci.yml's "Pure-node unit suites"
 * step, which the Pages gate runs unconditionally — the same guarantee the
 * hand-written `*-vm.test.mjs` twins have, and what lets partitionArgs drop
 * the browser copy from every local group run and select-specs skip it on
 * the blocking gate.
 *
 * ONE CHILD PROCESS PER SPEC, not one `import()` per spec. fixtures.js reads
 * APEX_VM_PAGE once at module load, and its `sharedTest` keeps one VmPage per
 * process; importing thirty specs into one runner would share that page and
 * that module state across files that were written to own it. A child is what
 * `node --test` gives every file anyway, and it is what makes one spec's
 * hang or crash a red row here rather than a dead runner.
 *
 * A PASS MUST HAVE RUN SOMETHING — the rule tools/ci/run-playwright.mjs
 * learned the hard way. A child whose TAP summary cannot be read fails; a
 * child that declares zero tests fails. Both are the shape of the bug where
 * a runner reports green having executed nothing.
 *
 * Run: node --test tests/unit/adapted-specs.test.mjs   (npm run test:vm-page)
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ADAPTED } from "../../tools/ci/twinned-specs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const specs = Object.keys(ADAPTED).sort();
// Two at a time: a VM boot is CPU-bound and the box has four cores; CI's
// runners have two. APEX_VM_PAGE_JOBS overrides.
const JOBS = Math.max(1, Number.parseInt(process.env.APEX_VM_PAGE_JOBS || "2", 10) || 2);

describe("browser specs under the vm-page adapter", { concurrency: JOBS }, () => {
  test("the ADAPTED map is not empty (an empty gate is not a gate)", () => {
    assert.ok(specs.length > 0, "tools/ci/twinned-specs.mjs ADAPTED names no spec — drop test:vm-page or fill it");
  });
  for (const spec of specs) {
    test(spec, { timeout: 900_000 }, () => {
      const env = { ...process.env, APEX_VM_PAGE: "1" };
      // NODE_TEST_CONTEXT would switch the child to the v8-serialized reporter
      // and the `# pass` summary would be absent (tools/ci/run-playwright.mjs
      // hit exactly this).
      delete env.NODE_TEST_CONTEXT;
      const r = spawnSync(process.execPath, ["--test", "--test-reporter=tap", spec],
        { cwd: ROOT, encoding: "utf8", env, timeout: 880_000, maxBuffer: 1 << 26 });
      const out = `${r.stdout || ""}${r.stderr || ""}`;
      const num = (re) => { const m = re.exec(r.stdout || ""); return m ? +m[1] : null; };
      const passed = num(/^# pass (\d+)$/m), failed = num(/^# fail (\d+)$/m);
      const tail = out.split("\n").filter((l) => /^(not ok|# |\s+error:|\s+message:|\s+at )/.test(l)).slice(-40).join("\n");
      assert.ok(passed !== null && failed !== null, `${spec}: no TAP summary (exit ${r.status}, ${r.signal || "no signal"}) — an unreadable run is not a pass\n${tail}`);
      assert.equal(failed, 0, `${spec}: ${failed} failed under the adapter (it passed in a browser when it was ADAPTED — either the spec grew a browser dependency, or the model moved: run it as \`APEX_VM_PAGE=1 node --test ${spec}\`)\n${tail}`);
      assert.ok(passed > 0, `${spec}: declared no tests — an empty run must never read as a pass`);
      assert.equal(r.status, 0, `${spec}: exit ${r.status} with ${passed} passed and 0 failed — the child died after its summary\n${tail}`);
    });
  }
});
