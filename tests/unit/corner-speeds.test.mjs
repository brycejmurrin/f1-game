/* corner-speeds.test.mjs — tools/check/corner-speeds.mjs (#6563 R1a) and its refs file.
 * The refs file validates and every cited turn resolves to a game corner; the pure
 * halves join samples to corners and refs to rows; one VM lap runs end to end. No
 * assert pins a measured speed: the tool is an instrument, its numbers move with physics.
 *
 * Run: node --test tests/unit/corner-speeds.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  inWindow, turnNumbers, cornerSpeeds, rowsForRef, compareRefs, validateRefs, loadRefs, measure,
} from "../../tools/check/corner-speeds.mjs";

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const REFS = loadRefs(path.join(ROOT, "tests/data/corner-speed-refs.json"));

test("refs file validates: cited sources, Tn turns, spans in order, plausible km/h", () => {
  assert.deepEqual(validateRefs(REFS), []);
  const bad = { sources: { openf1: "no url" }, circuits: { x: { session: 1, driver: 1, corners: [
    { name: "a", turn: "T5", to: "T2", minKph: 999, source: "nope" }] } } };
  assert.equal(validateRefs(bad).length, 4);
});

test("inWindow wraps the line; turnNumbers expands merged labels", () => {
  assert.equal(inWindow(5, 0, 10), true);
  assert.equal(inWindow(11, 0, 10), false);
  assert.equal(inWindow(2, 5700, 30), true);
  assert.equal(inWindow(100, 5700, 30), false);
  assert.deepEqual(turnNumbers("T7-T9"), [7, 8, 9]);
  assert.deepEqual(turnNumbers("T12"), [12]);
  assert.deepEqual(turnNumbers("pit"), []);
});

test("cornerSpeeds takes the window minimum and the nearest-apex sample; refs join spans and merged turns", () => {
  const corners = [
    { turn: "T1", s: 50, entryS: 40, exitS: 60, radiusM: 30, severity: "slow" },
    { turn: "T2-T3", s: 150, entryS: 140, exitS: 160, radiusM: 90, severity: "medium" },
  ];
  const samples = [{ s: 30, v: 10 }, { s: 45, v: 5 }, { s: 51, v: 6 }, { s: 145, v: 20 }, { s: 149, v: 25 }];
  const rows = cornerSpeeds(samples, corners, (v) => v * 2);
  assert.deepEqual(rows.map((r) => [r.minKph, r.apexKph, r.rawMinKph]), [[36, 43.2, 18], [144, 180, 72]]);
  assert.deepEqual(rowsForRef({ turn: "T3" }, rows).map((r) => r.turn), ["T2-T3"]);
  assert.deepEqual(rowsForRef({ turn: "T1", to: "T2" }, rows).map((r) => r.turn), ["T1", "T2-T3"]);
  const cmp = compareRefs([{ name: "x", turn: "T1", to: "T3", minKph: 72 }], rows);
  assert.deepEqual([cmp[0].oursKph, cmp[0].ratio, cmp[0].turn], [36, 0.5, "T1..T3"]);
});

test("every cited turn resolves to a corner on its circuit", async () => {
  const { createGame } = require("../../tools/lib/game-vm.cjs");
  const refs = REFS;
  for (const [track, c] of Object.entries(refs.circuits)) {
    const h = await createGame({ track });
    try {
      const rows = h.apex.trackInfo({ what: "corners" }).corners;
      for (const ref of c.corners) assert.ok(rowsForRef(ref, rows).length, `${track} ${ref.name} (${ref.turn}) matches no corner`);
    } finally { h.close(); }
  }
});

test("one headless Monaco lap runs end to end and fills every ref row", async () => {
  const r = await measure({ track: "monaco", laps: 1, pace: 1, refs: REFS });
  assert.ok(r.lapS > 0 && r.corners.length > 0);
  assert.ok(r.corners.every((x) => Number.isFinite(x.minKph) && x.minKph <= x.apexKph));
  assert.equal(r.refs.length, REFS.circuits.monaco.corners.length);
  assert.ok(r.refs.every((x) => Number.isFinite(x.ratio)));
});
