/* game-m33-m35-m42.test.mjs — exclusive pins for the game loop backlog rows
 * docs/BUGS.md M33 (mistake zone key wrap past S/F), M35 (gridUp raceIndex vs
 * armReliability), and M42's RECOVER pit-lane guard (loop half; extract to a
 * module is #3978).
 *
 * Source pins only here (tooling-fast). M33/M42 behaviour already lives in
 * race-flow-fixes-vm.test.mjs; M35 behaviour is game-m35-race-index-vm.test.mjs.
 *
 * Run: node --test tests/unit/game-m33-m35-m42.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { gameSource } from "../helpers/game-source.mjs";

const src = gameSource();

function startRaceBody() {
  const start = src.indexOf("async function startRaceBody()");
  assert.ok(start >= 0, "startRaceBody is declared");
  // Bound the body tightly: the next top-level async function after it.
  const next = src.indexOf("\nasync function ", start + 1);
  return src.slice(start, next > start ? next : start + 12000);
}

test("M33: AI mistake/attack zone key wraps past S/F (not a raw Math.round(c.s + toTurnIn))", () => {
  // The roll key must be on THIS lap; an unwrapped s+toTurnIn past the line
  // made the first corner fire twice per lap (docs/BUGS.md M33).
  assert.match(src, /const zk = Math\.round\(wrapS\(c\.s \+ _atk\.toTurnIn\)\);/);
  assert.doesNotMatch(src, /zoneKey[\s\S]{0,200}Math\.round\(c\.s \+ [^w]/);
  assert.match(src, /attemptRoll\(c\.raceHash, c\.lap, Math\.round\(wrapS\(c\.s \+ _atk\.toTurnIn\)\)\)/);
});

test("M35: startRaceBody bumps raceIndex before gridUp so launch hashes share armReliability's round", () => {
  const body = startRaceBody();
  const bump = body.search(/if \(session === "race"\) \{? ?raceIndex\+\+/);
  const grid = body.indexOf("gridUp(");
  const arm = body.search(/if \(session === "race"\) armReliability\(cars\)/);
  assert.ok(bump >= 0, "race session still bumps raceIndex once");
  assert.ok(grid >= 0, "gridUp still lays the grid");
  assert.ok(arm >= 0, "armReliability still arms after the grid");
  assert.ok(bump < grid, "M35: raceIndex++ must precede gridUp (launch/tyre/phase hashes)");
  assert.ok(grid < arm, "armReliability still follows gridUp");
  // No second bump after the grid — that was the one-off disagreement with B6.
  assert.equal(body.slice(grid).includes("raceIndex++"), false, "raceIndex++ must not run again after gridUp");
});

test("M42: manual RECOVER refuses pit lane / box (loop guard; auto-rescue parity)", () => {
  // rescuePlayer at x = 0 would strand a lane/box car on the racing surface.
  assert.match(
    src,
    /if \(!coach\.retry\(\) && !\(pits\.inLane\(player\) \|\| player\.pitState === "box"\)\) rescuePlayer\(player\);/,
  );
});
