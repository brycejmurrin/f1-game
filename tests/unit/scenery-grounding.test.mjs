// Regression ratchet: floating scenery must not grow.
//
// docs/SCENERY-GROUNDING.md §1 is the reason this file exists. The engine has
// strong HORIZONTAL guards on scenery — onTrack, rejBox, blockAt, recordBarrier
// all answer "is this thing on the racing line?" — and had no vertical one at
// all, so "is this thing standing on anything?" was left to each caller's
// arithmetic. Every defect that audit found was vertical: roofs floating over
// their buildings, crowds left behind when their riser was rejected, lamp heads
// cantilevered off poles with no arm.
//
// tools/track/float-audit.cjs answers the vertical question mechanically. It has
// existed and been correct for a while; what was missing is anybody running it.
// `npm run test:float` was in package.json but in no CI job and behind no test,
// and it could not have been wired up as-is: it exits 1 on any floater, and 37
// of 40 circuits have some. So this gates it the way the horizontal-clipping
// axis is already gated — per-circuit caps that ratchet down — rather than on a
// fleet-wide zero that is not reachable in one pass.
//
// Semantics are copied from tests/unit/prop-clipping.test.mjs deliberately, so
// the two axes behave identically:
//   * a circuit NOT in BASELINE must read 0 — that is what makes a NEW defect,
//     or a newly added circuit, fail,
//   * a circuit IN BASELINE fails when its count GROWS,
//   * no ALLOW escape hatch,
//   * a cap sitting above the measured count is itself a failure, because the
//     slack silently permits regressions up to it.
//
// Pure Node — float-audit runs the real track build in a VM with no browser, so
// this belongs in `npm run test:sweeps`, not the Playwright projects.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// What is counted: UNSUPPORTED clusters, i.e. what survives the audit's support
// pass. A tree canopy, a grandstand roof and a gantry beam are all legitimately
// elevated because something beneath them reaches the ground, and the audit
// propagates support to a fixed point before reporting — a single bottom-up
// pass gets cantilevers wrong, because a lamp head hangs BELOW the arm carrying
// it. `elevated` is therefore the wrong number to gate on; `floating` is the
// defect list.
//
// Known-legitimate flags that the caps still carry (docs/SCENERY-GROUNDING.md
// §4): suspended rides (Abu Dhabi's coasterLoop, Ferris wheel rims) and
// AIRCRAFT IN FLIGHT — madrid's Barajas airliner on final approach (alt 90 m,
// 632 m off-track) and mexico's equivalent. The gap the audit reports for
// those IS the altitude; a plane in flight rests on nothing, and grounding it
// would delete the model's whole point. They are the reason madrid and mexico
// are the last non-zero entries here, and the caps are the mechanism for them
// precisely because this file has no ALLOW escape hatch.
//
// Two entries that USED to be on this list are not defects-by-nature and have
// been fixed rather than carried:
//   * Monaco's yachts and Jeddah's dhows were never floating "on water the
//     ground model ignores" — water is now a valid footing in the audit's
//     support test, and with that in place the hulls turned out to be authored
//     ~1.55 m ABOVE their own sea (the surface sits at pyMin - 0.8, not pyMin).
//     A real defect that the missing water term had been hiding.
//   * Wide overhead spans read as unsupported because overheadSpan emitted a
//     deck and no legs, despite `supportGap`/`supportWidth` being in its spec
//     and its footprint already validated. It now raises them.
//
// 2026-08-17 pine S4 remesh: nurburgring 0→8 and hockenheim 0→2 are upper
// foliage cones on 20–40 m forestEdge pines. clip-audit/--why names
// pine() → graph.instance replay. The wood trunk still seats; the support
// chain (0.6 m vertical slack) does not join the top cones once uniform
// scale stretches a 12 m reference mesh. Silverstone stayed 0 (the Y-only
// scale attempt that floated it was not this remesh).
const BASELINE = JSON.parse(
  readFileSync(path.join(ROOT, "tools", "track", "float-baseline.json"), "utf8"),
);

// The sweep rebuilds every circuit, so run it ONCE and share it across tests.
//
// `--all` exits 1 whenever ANY circuit floats, which is the normal state here —
// that exit code is the tool's own fleet-wide gate, not this test's. The caps
// below are the failure signal. execFileSync throws on a non-zero exit, so read
// the JSON off the thrown error's stdout and only treat an EMPTY stdout as a
// real crash; swallowing the error outright would turn a broken sweep into a
// silent pass, which is the failure mode this whole file exists to prevent.
let cached = null;
function runSweep() {
  const args = [path.join(ROOT, "tools", "track", "float-audit.cjs"), "--all", "--json"];
  const opts = { cwd: ROOT, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 };
  let stdout;
  try {
    stdout = execFileSync(process.execPath, args, opts);
  } catch (e) {
    stdout = e.stdout;
    if (!stdout || !stdout.trim()) {
      throw new Error(`float-audit --all produced no JSON (status ${e.status}): ${e.stderr || e.message}`);
    }
  }
  return JSON.parse(stdout);
}
const sweep = () => (cached ||= runSweep());

test("floating scenery stays within the per-circuit baseline", () => {
  const results = sweep();
  // The floor is the ROSTER, not a number typed once — prop-clipping learned
  // this the hard way: its `>= 24` kept passing after the roster reached 40, so
  // the sweep could have silently dropped 16 circuits and still gone green.
  const roster = createRequire(import.meta.url)("../../tools/manifest.cjs").CIRCUITS.length;
  assert.equal(results.length, roster, `expected ${roster} circuits, got ${results.length}`);

  const grown = [];
  for (const r of results) {
    const n = r.floating.length;
    const cap = Object.prototype.hasOwnProperty.call(BASELINE, r.id) ? BASELINE[r.id] : 0;
    if (n > cap) grown.push(`${r.id}: ${n} floating clusters > baseline ${cap}`);
  }
  assert.deepEqual(grown, [], "floating scenery grew:\n  " + grown.join("\n  ") +
    "\n\nRun `node tools/track/float-audit.cjs <id> --why` — it names each floater's SOURCE LINE.");
});

test("baseline has no stale entries — a cap below the measured count is a lie", () => {
  const measured = new Map(sweep().map((r) => [r.id, r.floating.length]));
  const slack = [];
  for (const [id, cap] of Object.entries(BASELINE)) {
    const now = measured.get(id);
    assert.notEqual(now, undefined, `BASELINE names unknown circuit "${id}"`);
    if (now < cap) slack.push(`${id}: baseline ${cap} but measured ${now} — lower it`);
  }
  assert.deepEqual(slack, [], "stale baseline entries:\n  " + slack.join("\n  "));
});
