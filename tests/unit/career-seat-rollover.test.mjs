/* career-seat-rollover.test.mjs — two career facts that are cheap in a VM and
 * were expensive to lose in a save.
 *
 * career.js is pure rules with no DOM, so it loads whole into a VM with stub
 * GameStore / Teams / Parts, exactly as career-settle.test.mjs does.
 *
 * 1. MY TEAM IS SEAT 0. driverOverride() maps a custom team's seat 0 to
 *    career.driver (you) and seat 1 to the hire, and docs/CAREER.md says the
 *    same. The NEW CAREER draft starts at seat 1 — right for a DRIVER career,
 *    where you are the newcomer — and the MY TEAM path overrode only flavour,
 *    slot and teamId while the seat picker rendered for "driver" alone. So every
 *    MY TEAM save was created in seat 1 and the player's own car raced under the
 *    HIRED driver's name, code and number, while the AI ran the driver they had
 *    just named. Every career spec created MY TEAM through __apex.career(), which
 *    omits seat and lands on 0, so nothing caught it.
 *
 * 2. THE COUNTBACK HISTOGRAM SURVIVES A SEASON. SeasonCal.rank breaks a points
 *    tie on season.finishes; empty, it falls through to a string compare on
 *    driver id and crowns whoever is alphabetically first.
 *
 * Run: node --test tests/unit/career-seat-rollover.test.mjs   (test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { seedHash32 } from "../helpers/seed-hash32.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

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
      // Mirrors js/data/teams.js. Needed since a contract goal can draw
      // beatRival, which ranks the real grid through gridSeats().
      isReal: (t) => !!t && !t.custom && !t.legends,
      LIST: [
        { id: "custom", tier: 2, custom: true, color: 0xff2222,
          drivers: [{ name: "You", code: "YOU", num: 99 }] },
        { id: "haas", tier: 4, color: 0xffffff,
          drivers: [{ name: "A", code: "AAA", num: 1 }, { name: "B", code: "BBB", num: 2 }] },
      ],
    },
    Parts: { getFactorySetup: () => ({}), getCost: () => 1000, CATALOG: [] },
    Tracks: { LIST: [], SEASON: [] },
    // Flat, so the rival pick is deterministic and the market stays parked.
    DriverRatings: {
      get: (code) => ({ code, pace: 80, craft: 75, awareness: 75, consistency: 75, experience: 50 }),
      overall: () => 80,
      AXES: ["pace", "craft", "awareness", "consistency", "experience"],
    },
  });
  seedLog(ctx);
  seedHash32(ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/core/mat4.js"), "utf8"), ctx, { filename: "js/core/mat4.js" });
  vm.runInContext(readFileSync(join(ROOT, "js/career/career.js"), "utf8"), ctx,
    { filename: "js/career/career.js" });
  vm.runInContext(readFileSync(join(ROOT, "js/career/season-cal.js"), "utf8"), ctx,
    { filename: "js/career/season-cal.js" });
  return vm.runInContext("Career", ctx);
}

test("a MY TEAM career is created in seat 0, so the player drives their OWN identity", () => {
  const Career = load();
  // seat 1 is what the NEW CAREER draft carries in. It is correct for a driver
  // career and must not survive into a custom team.
  Career.start({ flavour: "myteam", teamId: "custom", seed: 7, seat: 1,
                 name: "Real Player", code: "RPL", num: 44 });
  Career.engage(true);
  const c = Career.data();
  assert.equal(c.seat, 0,
    "MY TEAM is always seat 0 — driverOverride maps seat 1 to the hire");

  // The fact that seat number stands for: seat 0 IS the player.
  const mine = Career.driverOverride("custom", 0);
  assert.equal(mine && mine.code, "RPL",
    "seat 0 of a custom team is the driver the player named");
  const mate = Career.driverOverride("custom", 1);
  assert.notEqual(mate && mate.code, "RPL",
    "seat 1 is the hire, not a second copy of the player");
});

test("a DRIVER career still honours the seat the player picked", () => {
  const Career = load();
  Career.start({ flavour: "driver", teamId: "haas", seed: 7, seat: 1 });
  Career.engage(true);
  assert.equal(Career.data().seat, 1,
    "the junior-seat choice is real for a driver career — only MY TEAM is pinned");
});


test("constructor ties use the same tier policy in standings and winter history", () => {
  const Career = load();
  Career.start({ flavour: "myteam", teamId: "custom", seed: 7 });
  Career.engage(true);
  const c = Career.data();
  c.season.teamPts = { haas: 25, custom: 25 }; // reverse of the expected tie order
  c.season.round = 24;
  assert.deepEqual(Array.from(Career.teamStandings(), (r) => r.id), ["custom", "haas"]);
  Career.rollover();
  assert.equal(c.history[0].cPos, 1);
  assert.equal(c.history[0].cPts, 25);
});

test("a driver poached in winter cannot be immediately signed back", () => {
  const Career = load();
  Career.start({ flavour: "myteam", teamId: "custom", seed: 2, hire: "DVL" });
  Career.engage(true);
  const c = Career.data();
  c.season.pts["custom:1"] = 100;
  c.season.round = 24;
  Career.rollover();
  const pending = Career.hirePending();
  assert.equal(pending.kind, "left", "seed 2 poaches an outperforming DVL");
  c.dev["custom:1"] = { pace: 3 };
  const before = JSON.stringify(c);
  assert.equal(Career.hireDriver(pending.code, 1), false);
  assert.equal(JSON.stringify(c), before, "refusal preserves contract, money and development");
  assert.equal(Career.renewHire(1), false);
  const replacement = Career.freeAgents().find((a) => a.code !== pending.code);
  assert.equal(Career.hireDriver(replacement.code, 1), true);
  assert.equal(c.roster[0].code, replacement.code);
  assert.equal(Career.hirePending(), null);
});

test("an ordinary expiring hire can still accept the renewal offer", () => {
  const Career = load();
  Career.start({ flavour: "myteam", teamId: "custom", seed: 1, hire: "DVL" });
  Career.engage(true);
  const c = Career.data();
  c.season.round = 24;
  Career.rollover();
  const pending = Career.hirePending();
  assert.equal(pending.kind, "renew");
  assert.equal(Career.renewHire(1), true);
  assert.equal(c.roster[0].code, pending.code);
  assert.equal(c.roster[0].salary, pending.ask);
  assert.equal(Career.hirePending(), null);
});

test("the career record outlives the HISTORY_MAX archive (12 titles stay 12 titles)", () => {
  const Career = load();
  Career.start({ flavour: "driver", teamId: "haas", seed: 5, seat: 0, slot: 0 });
  Career.engage(true);
  const c = Career.data();
  const me = c.team + ":" + c.seat;
  const YEARS = Career.HISTORY_MAX + 2;
  for (let y = 0; y < YEARS; y++) {
    c.season.round = 24;
    c.season.pts[me] = 9999;                       // champion every year
    c.results = [{ r: 0, p: 1, pts: 25 }, { r: 1, p: 2, pts: 18 }];
    c.deal.left = 3;                               // no winter offers to answer
    Career.rollover();
  }
  assert.equal(c.history.length, Career.HISTORY_MAX, "the screen's archive is still trimmed");
  const slot = Career.slots("driver")[0];
  assert.equal(slot.seasons, YEARS + 1, "the slot card counts every year, plus the one in progress");
  assert.equal(slot.titles, YEARS);
  assert.equal(slot.wins, YEARS, "one win a season, none of them lost to the trim");
  assert.equal(Career.state().seasons, YEARS, "state() reports closed seasons");
  assert.equal(Career.tallyOf(c).podiums, YEARS * 2);
});

test("a career saved before the tally existed counts from the history it still has", () => {
  const Career = load();
  Career.start({ flavour: "driver", teamId: "haas", seed: 5, seat: 0, slot: 0 });
  Career.engage(true);
  const c = Career.data();
  delete c.tally;                                  // the pre-tally shape (identity migrate in this harness)
  c.history = [{ year: 2026, pos: 1, wins: 3, podiums: 5 }, { year: 2027, pos: 4, wins: 0, podiums: 1 }];
  assert.equal(Career.slots("driver")[0].seasons, 3);
  assert.equal(Career.slots("driver")[0].titles, 1);
  c.season.round = 24;
  Career.rollover();
  assert.equal(c.tally.seasons, 3, "rollover derives from the history it has, then adds the closing year");
});
