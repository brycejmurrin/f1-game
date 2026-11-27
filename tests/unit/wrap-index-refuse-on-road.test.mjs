// wrap-index-refuse-on-road.test.mjs — #6640 C6 + C7: the two shared helpers that replaced nine hand-rolled node wraps
// (M4.wrapIndex) and sixteen copies of the "on the road? note it and drop the prop" guard (SceneryGuards.refuseOnRoad).
// The per-kind SUPPRESSED counts of three real builds are pinned: the refactor must not move one of them.
//
// Run: node --test tests/unit/wrap-index-refuse-on-road.test.mjs   (npm run test:tooling-fast)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => readFileSync(join(ROOT, f), "utf8");

const ctx = vm.createContext({ Log: { info() {}, debug() {}, enabled: () => false } });
for (const f of ["js/core/mat4.js", "js/track/scenery/guards.js"])
  vm.runInContext(read(f), ctx, { filename: absSrc(f) });
const M4 = vm.runInContext("M4", ctx);
const SceneryGuards = vm.runInContext("SceneryGuards", ctx);

test("M4.wrapIndex: round to the nearest node, then wrap into [0, n)", () => {
  const n = 10;
  const table = [
    [0, 0], [3, 3], [9, 9], [10, 0], [20, 0], [25, 5],      // exact multiples
    [-1, 9], [-10, 0], [-11, 9], [-0.4, 0], [-0.5, 0],      // negatives
    [9.5, 0], [n - 0.5, 0], [9.4, 9], [0.5, 1], [2.49, 2],  // n-0.5 rounds up to n, which wraps to 0
    [-9.5, 1], [-9.6, 0],   // Math.round ties go toward +Infinity
  ];
  for (const [x, want] of table) assert.equal(M4.wrapIndex(x, n) + 0, want, `wrapIndex(${x}, ${n})`);
  assert.equal(M4.wrapIndex(7, 1), 0);
});

test("SceneryGuards.refuseOnRoad: refuses, notes once with the thunk's text, and forwards the pit margin", () => {
  const notes = [], seen = [];
  const api = {
    onTrack: (x, z, m, pm) => { seen.push([x, z, m, pm]); return x < 0; },
    noteSuppressed: (kind, msg) => notes.push([kind, msg]),
  };
  let built = 0;
  const msg = () => { built++; return "pine SUPPRESSED at k=1"; };
  assert.equal(SceneryGuards.refuseOnRoad(api, "pine", 5, 0, 3, msg), false);
  assert.equal(built, 0, "a pass builds no string");
  assert.equal(notes.length, 0);
  assert.equal(SceneryGuards.refuseOnRoad(api, "pine", -5, 2, 3, msg, 0.7), true);
  assert.deepEqual(notes, [["pine", "pine SUPPRESSED at k=1"]]);
  assert.deepEqual(seen, [[5, 0, 3, undefined], [-5, 2, 3, 0.7]]);
});

test("per-kind SUPPRESSED counts of three real builds are unchanged by the refactor", () => {
  const { buildContext } = require("../../tools/track/verify-track.cjs");
  const Tracks = buildContext(null, { quiet: true });
  const expect = {
    monaco: { building: 5, cypress: 1, palm: 72, place: 1, plane: 1, stonePine: 3 },
    redbull: { tree: 61 },
    zolder: { building: 1, grandstand: 1, pine: 5, tree: 5 },
  };
  for (const [id, want] of Object.entries(expect)) {
    const track = Tracks.build(Tracks.LIST.find((d) => d.id === id));
    assert.deepEqual({ ...track.modelDiagnostics.suppressedCounts }, want, id);
  }
});
