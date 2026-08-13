/* career-settle.test.mjs — settleRound()'s sponsor "double" fact, in a VM.
 *
 * career.js is pure rules with no DOM, so like race-control.test.mjs it loads
 * whole into a VM with stub GameStore / Teams / Parts and the round is settled
 * directly. The rule under test: a "double" is BOTH cars home in the points,
 * and a car that RETIRED scores nothing even when enough of the field DNFs for
 * its classified position to land inside the top ten. The base code read the
 * mate's position alone (`Teams.POINTS[order.indexOf(mate)]`), so a retired
 * mate classified P5 banked half of a "double" it never drove — the same
 * retirement rule `pts` applies to the player six lines above.
 *
 * Run: node --test tests/unit/career-settle.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// `const Career` lands in the context's global LEXICAL scope, not on the global
// object — read it back by evaluating its name (same shape as race-control).
function load() {
  const stored = new Map();
  const ctx = vm.createContext({
    Math, JSON, Object, Array, String, Number, Date, isNaN, isFinite, console,
    GameStore: {
      CAREER_V: 3,
      store: {
        get: (k, d) => (stored.has(k) ? stored.get(k) : d),
        set: (k, v) => stored.set(k, v),
      },
      seasonDriverId: (teamId, i) => teamId + ":" + i,
      migrateCareer: (c) => c,
    },
    Teams: {
      POINTS: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
      LIST: [
        { id: "custom", tier: 2, custom: true, color: 0xff2222,
          drivers: [{ name: "You", code: "YOU", num: 99 }] },
        { id: "haas", tier: 4, color: 0xffffff,
          drivers: [{ name: "A", code: "AAA", num: 1 }, { name: "B", code: "BBB", num: 2 }] },
      ],
    },
    Parts: { getFactorySetup: () => ({}) },
    Tracks: { LIST: [] },
  });
  vm.runInContext(readFileSync(join(ROOT, "js/game/career.js"), "utf8"), ctx,
    { filename: "js/game/career.js" });
  return vm.runInContext("Career", ctx);
}

/** Start a MY TEAM career, advance the calendar past round 0, settle `order`:
 *  P1,P2 rivals; the player P3 (15 pts); a P4 rival; the mate P5 — classified
 *  in the points either way, `mateRetired` decides whether it got there. */
function settle(mateRetired) {
  const Career = load();
  Career.start({ flavour: "myteam", teamId: "custom", seed: 7 });
  Career.engage(true);
  const career = Career.data();
  career.season.round = 1;                       // endRace() advances BEFORE settleRound()

  const mk = (id, retired) => ({ team: { id }, retired, cuts: 0, penalty: 0, gridPos: 5 });
  const player = mk("custom", false);
  const mate = mk("custom", mateRetired);
  const order = [mk("haas", false), mk("haas", false), player, mk("haas", false), mate];
  for (let i = 0; i < 15; i++) order.push(mk("haas", i < 5)); // pad the field

  const res = Career.settleRound(order, player);
  const row = career.results[career.results.length - 1];
  return { res, row };
}

test("mate FINISHED P5: both cars in the points, so the double is recorded", () => {
  const { res, row } = settle(false);
  assert.equal(res.pos, 3);
  assert.equal(res.pts, 15, "player P3 scores 15");
  assert.equal(row.double, true, "mate finished P5: double must be recorded");
});

test("mate classified P5 but RETIRED: a retired car scores nothing — no double", () => {
  // Classification inside the top ten is possible for a retiree when enough of
  // the field DNFs; the points rule still pays only cars that finished.
  const { res, row } = settle(true);
  assert.equal(res.pts, 15, "player's own points unaffected by the mate");
  assert.equal(row.double, false,
    "mate retired: a retired car scores nothing, so this is NOT a double");
});

test("the retired flag is the ONLY discriminator between the two rounds", () => {
  // The base code failed exactly this: both rounds classify the mate P5, and a
  // position-only read (`Teams.POINTS[order.indexOf(mate)]`) returns 10 points
  // in both, recording a double either way. Current code must discriminate.
  const finished = settle(false);
  const retired = settle(true);
  assert.equal(finished.res.pts, retired.res.pts, "identical player result in both rounds");
  assert.notEqual(finished.row.double, retired.row.double,
    "same classified order, different retired flag — the double facts must differ");
});
