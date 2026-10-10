// tools/track/audit-circuit.cjs — the float check's verdict is the COUNT against
// the baseline cap, not float-audit's exit code.
//
// float-audit exits 1 on ANY floating cluster, so `ok: r.status === 0 && n <= cap`
// could never pass for a circuit whose cap is non-zero: madrid, donington and
// mexico (cap 2, measured 2) printed `float:FAIL 2 unsupported floating
// cluster(s), cap 2` and the circuit's overall `ok:false` (hunt F10,
// 2026-10-10). A genuine tool failure (spawn error, usage exit 2, a crash with
// no JSON) must still fail.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const AC = require("../../tools/track/audit-circuit.cjs");

test("float verdict: floaters equal to the cap pass despite float-audit exiting 1", () => {
  assert.equal(AC.floatOk({ status: 1, error: null }, 2, 2), true);
  assert.equal(AC.floatOk({ status: 1, error: null }, 1, 2), true);
  assert.equal(AC.floatOk({ status: 0, error: null }, 0, 0), true);
});

test("float verdict: over the cap, or no cap, still fails", () => {
  assert.equal(AC.floatOk({ status: 1, error: null }, 3, 2), false);
  assert.equal(AC.floatOk({ status: 1, error: null }, 1, 0), false, "a circuit missing from the baseline reads as cap 0");
});

test("float verdict: a real tool error fails whatever the count says", () => {
  assert.equal(AC.floatOk({ status: 2, error: null }, 0, 2), false, "usage exit");
  assert.equal(AC.floatOk({ status: null, error: "spawn ENOENT" }, 0, 2), false, "spawn error");
  assert.equal(AC.floatOk({ status: 1, error: null }, null, 2), false, "exit 1 with no JSON is a crash, not a floater count");
});

test("CHECKS.float on a real circuit: ok is exactly count <= cap", () => {
  // A circuit with a non-zero cap is the case the exit-code verdict got wrong.
  const caps = JSON.parse(fs.readFileSync(new URL("../../tools/track/float-baseline.json", import.meta.url), "utf8"));
  const id = caps.mexico > 0 ? "mexico" : Object.keys(caps).find((k) => caps[k] > 0);
  assert.ok(id, "float-baseline.json carries at least one non-zero cap");
  const res = AC.CHECKS.float(id);
  assert.notEqual(res.floating, null, "float-audit produced JSON");
  assert.equal(res.ok, res.floating <= res.cap, `${id}: ${res.summary}`);
});
