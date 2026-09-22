// The nightly rotation's contract. The hole this closes was a SILENT one —
// 114 of 118 browser specs had no scheduled coverage — so the test's job is to
// make a future hole loud: a new browser group must either join the rotation
// or say why it does not.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { ROTATION, EXCLUDED, UNSCHEDULED, groupForDay, dayIndex, bare } from "../../tools/ci/nightly-group.mjs";

const GROUPS = JSON.parse(fs.readFileSync(new URL("../../tests/groups.json", import.meta.url), "utf8")).groups;
const PKG = JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

test("every browser group either rotates or states why it does not", () => {
  const browser = Object.keys(GROUPS).filter((k) => GROUPS[k].kind === "browser");
  for (const g of browser) {
    const placed = ROTATION.includes(g) || g in EXCLUDED;
    assert.ok(placed, `browser group ${g} is in neither the rotation nor EXCLUDED — ` +
      "add it, or exclude it with a reason (an unexplained gap is how the last one hid)");
  }
  for (const [g, why] of Object.entries(EXCLUDED)) {
    assert.ok(why && why.length > 10, `EXCLUDED[${g}] needs a real reason, not "${why}"`);
    assert.ok(!ROTATION.includes(g), `${g} cannot be both excluded and rotated`);
  }
});

const ROOT = new URL("../../", import.meta.url);
const WORKFLOWS = path.join(ROOT.pathname, ".github/workflows");

/** Every place a group can have a home: the workflows, the deploy protocol,
 *  the edit-loop gate, and verify-change's routing table. Read as ONE blob and
 *  matched on the whole group name, because that is how a reader would look
 *  for it — a substring match on `test:float` would also be satisfied by
 *  `test:float-something`, so the boundary is anchored. */
const HOMES = () => [
  ...fs.readdirSync(WORKFLOWS).map((f) => fs.readFileSync(path.join(WORKFLOWS, f), "utf8")),
  ...["tools/ci/deploy.mjs", "tools/ci/tooling-fast.mjs", "tools/ci/verify-change.mjs", "tools/ci/pick-tests.mjs"]
    .map((f) => fs.readFileSync(new URL(f, ROOT), "utf8")),
].join("\n");

test("EVERY group has a home: a workflow, a local gate, the rotation, or a stated reason", () => {
  /* THE ROTATION GUARD ABOVE ONLY EVER ASKED THIS OF BROWSER GROUPS, so the
     same hole it exists to close stayed open one category over: a census on
     2026-09-22 found five groups running in no workflow, no rotation and no
     local gate. None of them was broken. They were invisible, and invisible is
     the state the rotation was built to end.

     ci.yml runs a group either as `npm run test:<g>` or via the nightly's
     `npm run "test:$GROUP"` indirection, so a rotated group need not appear by
     name anywhere — ROTATION is its home. Everything else must be findable by
     name in a workflow or a local gate, or carry a reason in UNSCHEDULED. */
  const blob = HOMES();
  const orphans = [];
  for (const g of Object.keys(GROUPS)) {
    if (ROTATION.includes(g) || g in EXCLUDED || g in UNSCHEDULED) continue;
    // `test:sweeps` must not be matched by a search for `test:sweeps-parts`
    // and vice versa: anchor on a non-name character (or the end).
    const named = new RegExp(`${g.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`).test(blob);
    if (!named) orphans.push(g);
  }
  assert.deepEqual(orphans, [],
    `these groups run in no workflow, no local gate and no rotation, and say nothing about it: ` +
    `${orphans.join(", ")}. Wire one up, or add it to UNSCHEDULED in tools/ci/nightly-group.mjs ` +
    "with the reason — a group nobody runs and nobody explains is dead weight that reads as coverage.");
});

test("UNSCHEDULED states a real reason and does not overlap the other two homes", () => {
  for (const [g, why] of Object.entries(UNSCHEDULED)) {
    assert.ok(GROUPS[g], `UNSCHEDULED names ${g}, which is not a group in tests/groups.json`);
    assert.ok(why && why.length > 20, `UNSCHEDULED[${g}] needs a real reason, not "${why}"`);
    assert.ok(!ROTATION.includes(g), `${g} cannot be both unscheduled and rotated`);
    assert.ok(!(g in EXCLUDED), `${g} cannot be in both EXCLUDED and UNSCHEDULED — pick one`);
  }
  // ANTI-VACUITY: if this ever empties, the test above is passing because the
  // census found nothing, not because the map is doing work. Five is what the
  // census found; lowering it means a group got a real home, which is good and
  // should be a deliberate edit here.
  assert.ok(Object.keys(UNSCHEDULED).length >= 1, "UNSCHEDULED emptied — did the census stop running?");
});

test("the two un-ratcheted audit aliases still point at a suite that DOES gate them", () => {
  // The reason test:float and test:clip may sit unscheduled is that the same
  // audit runs, ratcheted, inside test:sweeps. If that stopped being true the
  // reason would be false and the group really would be uncovered.
  const sweeps = String(PKG.scripts["test:sweeps"] || "");
  for (const [group, suite] of [["test:float", "tests/unit/scenery-grounding.test.mjs"],
                                ["test:clip", "tests/unit/prop-clipping.test.mjs"]]) {
    assert.ok(group in UNSCHEDULED, `${group} left UNSCHEDULED — re-check this pair`);
    assert.ok(sweeps.includes(suite), `${group} is excused because ${suite} gates the same audit in test:sweeps, and it is no longer there`);
    const cli = String(GROUPS[group].cmd || "").match(/tools\/track\/[\w-]+\.cjs/)?.[0];
    assert.ok(cli, `${group} no longer names an audit CLI`);
    assert.ok(fs.readFileSync(new URL(suite, ROOT), "utf8").includes(cli),
      `${suite} no longer spawns ${cli}, so ${group} is not covered by it after all`);
  }
});

test("the rotation covers every one of its groups within one cycle", () => {
  const seen = new Set();
  const start = dayIndex();
  for (let i = 0; i < ROTATION.length; i++) seen.add(groupForDay(start + i));
  assert.deepEqual([...seen].sort(), [...ROTATION].sort(),
    "a full cycle must touch every rotated group exactly once");
});

test("the pick is deterministic, and stable across a negative or huge day index", () => {
  assert.equal(groupForDay(7), groupForDay(7));
  assert.ok(ROTATION.includes(groupForDay(-1)), "a negative index must still land in range");
  assert.ok(ROTATION.includes(groupForDay(10 ** 9)));
});

test("every rotated group is a runnable npm script", () => {
  for (const g of ROTATION) {
    assert.ok(PKG.scripts[g], `${g} rotates but package.json has no "${g}" script — ` +
      "the nightly would fail on an unrunnable group");
  }
});

test("the CLI prints GROUP=<bare name>, which is what ci.yml's `npm run test:$GROUP` wants", () => {
  const out = execFileSync(process.execPath, ["tools/ci/nightly-group.mjs"], { encoding: "utf8" }).trim();
  const m = /^GROUP=(.+)$/.exec(out);
  assert.ok(m, `expected GROUP=<name>, got ${JSON.stringify(out)}`);
  assert.ok(!m[1].startsWith("test:"), `ci.yml prefixes test: itself, so the CLI must not — got ${m[1]}`);
  assert.ok(ROTATION.map(bare).includes(m[1]), `${m[1]} is not in the rotation`);
});
