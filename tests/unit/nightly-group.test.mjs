// The nightly rotation's contract. The hole this closes was a SILENT one —
// 114 of 118 browser specs had no scheduled coverage — so the test's job is to
// make a future hole loud: a new browser group must either join the rotation
// or say why it does not.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { ROTATION, EXCLUDED, groupForDay, dayIndex, bare } from "../../tools/ci/nightly-group.mjs";

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
