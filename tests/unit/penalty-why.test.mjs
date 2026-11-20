// #5882: the safety-car-overtake and blue-flag penalties must record a reason
// (penaltyWhy) for the results sheet, accumulating without duplicates like
// track limits. Runs game.js's own scPassCall / blueFlagCall in a VM.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { gameSource, symbolSource, GAME_REL } from "../helpers/game-source.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

function load() {
  const helper = (/^function notePenaltyWhy\(.*$/m.exec(gameSource()) || [""])[0];
  const src = [helper, symbolSource("function scPassCall("), symbolSource("function blueFlagCall(")].join("\n");
  const ctx = {
    player: { penalty: 0, penaltyWhy: null, lap: 3 }, resultT: 9, soundOn: false,
    Log: { info() {} }, announce() {}, raceCtl: { level: 3 }, scWatch: { info: () => ({ owed: 0 }) },
  };
  vm.createContext(ctx);
  vm.runInContext(src + "\nthis.sc = scPassCall; this.blue = blueFlagCall;", ctx, { filename: absSrc(GAME_REL) });
  return ctx;
}

test("a caution-pass penalty records 'overtaking under caution'", () => {
  const g = load();
  g.sc({ type: "pen", sec: 10 });
  assert.equal(g.player.penalty, 10);
  assert.equal(g.player.penaltyWhy, "overtaking under caution");
});

test("a blue-flag penalty records 'ignoring blue flags'", () => {
  const g = load();
  g.blue({ type: "pen", sec: 5 });
  assert.equal(g.player.penaltyWhy, "ignoring blue flags");
});

test("reasons accumulate once each, after an existing reason", () => {
  const g = load();
  g.player.penaltyWhy = "track limits";
  g.sc({ type: "pen", sec: 10 }); g.sc({ type: "pen", sec: 10 }); g.blue({ type: "pen", sec: 5 });
  assert.equal(g.player.penalty, 25);
  assert.equal(g.player.penaltyWhy, "track limits; overtaking under caution; ignoring blue flags");
});
