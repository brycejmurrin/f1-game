/* team-parts-conflict.test.mjs — #5044: fitting a part in a save-conflicted career
 * mutated the live fitted build (getTeamParts returned c.fitted itself) while the save
 * was refused, so the garage showed a part that was never saved.
 * Run: node --test tests/unit/team-parts-conflict.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { symbolSource, GAME_REL } from "../helpers/game-source.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

function load(conflicted) {
  const bag = { fitted: { aero: "a1", ers: "e1" } };
  let saves = 0;
  const ctx = vm.createContext({ bag, careerFitted: () => bag, store: { get: () => ({}), set() {} },
    Career: { conflicted: () => conflicted, save: () => { saves++; } } });
  vm.runInContext(symbolSource("function getTeamParts(teamId)") + "\n" + symbolSource("function saveTeamParts(teamId, parts)")
    + "\nglobalThis.get = getTeamParts; globalThis.save = saveTeamParts;", ctx, { filename: absSrc(GAME_REL) });
  return { ctx, bag, saves: () => saves };
}

test("#5044: a conflicted career refuses the fit and the live build is untouched", () => {
  const h = load(true);
  const p = h.ctx.get("custom");
  p.aero = "a2";   // what js/garage/setup-sheet.js does before it saves
  assert.equal(h.bag.fitted.aero, "a1", "the edit is on a copy");
  assert.equal(h.ctx.save("custom", p), false, "the refusal is reported, so the sheet plays reject, not the fit blip");
  assert.equal(h.bag.fitted.aero, "a1");
  assert.equal(h.saves(), 0);
});

test("#5044: an ordinary career fit still saves", () => {
  const h = load(false);
  const p = h.ctx.get("custom"); p.aero = "a2";
  assert.equal(h.ctx.save("custom", p), true);
  assert.equal(h.bag.fitted.aero, "a2");
  assert.equal(h.saves(), 1);
});
