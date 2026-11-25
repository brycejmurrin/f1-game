// Guards #5560: one run-playwright invocation runs several Playwright processes on one port (the shared process,
// then each mega-sweep spec solo), and a group shard's end record must claim every process's green specs — and
// never a spec that failed or that no process ran. Files only: no browser, no network.
// Run: node --test tests/unit/group-junit-per-process.test.mjs   (npm run test:tooling-fast)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stashJunit, clearJunitStash } from "../../tools/ci/run-playwright.mjs";
import { claimedUnits, readJunits } from "../../tools/ci/remote-group.mjs";
import { mkTmpDir } from "../helpers/tmp-dir.mjs";

const HUB = "tests/specs/career-hub.spec.js", DESIGNER = "tests/specs/track-designer.spec.js", QUALI = "tests/specs/quali.spec.js";
const PORT = "41234";
const pass = (file) => `<testcase classname="${file.replace(/^tests\//, "")}" name="a"/>`;
const fail = (file) => `<testcase classname="${file.replace(/^tests\//, "")}" name="b"><failure message="m"/></testcase>`;

/** One invocation as run-playwright runs it: each process REWRITES test-results-<port>/ (Playwright clears its
 *  outputDir), and the finished process's junit is stashed before the next one starts. `null` = wrote no junit. */
function invocation(processes, { stash = true } = {}) {
  const dir = mkTmpDir("apex-junit-");
  const out = path.join(dir, `test-results-${PORT}`);
  clearJunitStash(dir, PORT);
  processes.forEach((cases, i) => {
    if (i > 0 && stash) stashJunit(dir, PORT, i);
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });
    if (cases) fs.writeFileSync(path.join(out, "junit.xml"), `<testsuites><testsuite>${cases.join("")}</testsuite></testsuites>`);
  });
  return dir;
}
const UNITS = [HUB, DESIGNER, QUALI];

test("three green processes in one invocation: the end record claims all three (job 132124379574 claimed quali alone)", () => {
  const dir = invocation([[pass(HUB)], [pass(DESIGNER)], [pass(QUALI)]]);
  assert.deepEqual(claimedUnits(UNITS, 0, readJunits(dir)), [HUB, DESIGNER, QUALI]);
  assert.deepEqual(fs.readdirSync(dir).sort(), [`test-results-${PORT}`, `test-results-${PORT}-p1`, `test-results-${PORT}-p2`]);
  // The defect, reproduced: without the stash only the last process's file is left.
  assert.deepEqual(claimedUnits(UNITS, 0, readJunits(invocation([[pass(HUB)], [pass(DESIGNER)], [pass(QUALI)]], { stash: false }))), [QUALI]);
});

test("one green, one red: a red invocation claims nothing, and a failed spec is not claimed even on exit 0", () => {
  const dir = invocation([[pass(HUB)], [pass(QUALI), fail(QUALI)]]);
  assert.deepEqual(claimedUnits(UNITS, 1, readJunits(dir)), []);
  assert.deepEqual(claimedUnits(UNITS, 0, readJunits(dir)), [HUB]);
  // Red FIRST, green last: the earlier process's failure still reaches the reader.
  assert.deepEqual(claimedUnits(UNITS, 0, readJunits(invocation([[fail(HUB)], [pass(QUALI)]]))), [QUALI]);
});

test("a process that wrote no junit: its spec is not claimed, and it inherits no earlier process's file", () => {
  const mid = invocation([[pass(HUB)], null, [pass(QUALI)]]);
  assert.deepEqual(claimedUnits(UNITS, 0, readJunits(mid)), [HUB, QUALI]);
  const last = invocation([[pass(HUB)], null]);
  assert.deepEqual(claimedUnits(UNITS, 0, readJunits(last)), [HUB]);
  assert.equal(fs.existsSync(path.join(last, `test-results-${PORT}`, "junit.xml")), false, "the stash is a move");
  assert.equal(stashJunit(last, PORT, 2), null, "nothing to stash, no empty directory made");
  assert.deepEqual(claimedUnits(UNITS, 0, readJunits(invocation([null, null]))), []);
});

test("a re-used port drops the earlier invocation's stashes, and pieces are claimed by their file", () => {
  const dir = invocation([[pass(HUB)], [pass(QUALI)]]);
  clearJunitStash(dir, PORT);   // the next invocation on this port starts here
  assert.deepEqual(fs.readdirSync(dir), [`test-results-${PORT}`]);
  assert.deepEqual(claimedUnits(UNITS, 0, readJunits(dir)), [QUALI]);
  fs.mkdirSync(path.join(dir, "test-results-412345-p1"));   // another port's stash is not this port's to drop
  clearJunitStash(dir, "4123");
  assert.equal(fs.existsSync(path.join(dir, "test-results-412345-p1")), true);
  assert.deepEqual(claimedUnits([`${QUALI}#2/3`, `${HUB}#1/3`], 0, readJunits(dir)), [`${QUALI}#2/3`]);
  assert.deepEqual(claimedUnits(undefined, 0, readJunits(dir)), []);
});
