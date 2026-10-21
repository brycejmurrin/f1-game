// The helmet memo (js/car/helmets.js build, B·H13 2026-10-21) replays a lid it already painted. It is
// only correct while the replay is the same numbers in the same order as a fresh paint, so this builds
// a set of cars twice in one VM (the second pass is all memo hits) and compares every array, value for
// value, against the same cars built in a FRESH VM, where every lid is painted from scratch.
// Pure Node (tools/car/parts-sweep.mjs loadParts), ~3 s.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

const CASES = [
  { team: 0, num: 63, liv: {} },
  { team: 0, num: 12, liv: { helmetStyle: "flash", helmetBase: [0.1, 0.2, 0.9], helmetAccent: [1, 1, 1] } },
  { team: 1, num: 16, liv: { c1: [0.1, 0.1, 0.12] } },
  { team: 2, num: 99, liv: {}, field: true },
  { team: 3, num: 1, liv: { helmetStyle: "doodle" }, silhouette: true },
  // A finish is applied AFTER the lid is appended (finishPass), so it is not a memo input: the same lid
  // replays under another finish, and the finished arrays must still match a fresh paint.
  { team: 0, num: 63, liv: { finish: "matte" } },
  { team: 1, num: 16, liv: { c1: [0.1, 0.1, 0.12], finish: "chrome" } },
];

function builder(M) {
  return (c) => {
    const team = M.Teams.LIST[c.team];
    const liv = Object.assign({ c1: team.color || [0.8, 0.1, 0.1], c2: team.color2 || [1, 1, 1] }, c.liv);
    return M.Car3D.build(liv.c1, liv.c2, { livery: liv, teamId: team.id, num: c.num, field: !!c.field,
      silhouette: !!c.silhouette, noWeld: true, parts: M.Parts.getVisualTiers(M.Parts.DEFAULTS, team) });
  };
}
const ARR = ["pos", "nrm", "col", "mat", "idx"];

test("a memo-replayed helmet is value-identical to a freshly painted one", () => {
  const warm = builder(loadParts()), fresh = builder(loadParts());
  for (const c of CASES) warm(c);                   // fills the memo
  for (const c of CASES) {
    const a = warm(c), b = fresh(c);                // a: every lid replayed; b: every lid painted
    for (const k of ARR) {
      assert.equal(a[k].length, b[k].length, `${JSON.stringify(c)} ${k} length`);
      for (let i = 0; i < a[k].length; i++) if (!Object.is(a[k][i], b[k][i])) assert.fail(`${JSON.stringify(c)} ${k}[${i}]: ${a[k][i]} vs ${b[k][i]}`);
    }
  }
});

test("the memo keys on the design: another number or helmet style still paints its own lid", () => {
  const build = builder(loadParts());
  const col = (c) => build(c).col.join(",");
  const base = col(CASES[0]);
  assert.notEqual(col({ ...CASES[0], num: 44 }), base, "a different driver number is a different lid");
  assert.notEqual(col({ ...CASES[0], liv: { helmetStyle: "solid", helmetBase: [0, 1, 0] } }), base, "a helmet style repaints it");
  assert.equal(col(CASES[0]), base, "and the first lid replays unchanged");
});
