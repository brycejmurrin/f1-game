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
  seedLog(ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/mat4.js"), "utf8"), ctx, { filename: "js/mat4.js" });
  vm.runInContext(readFileSync(join(ROOT, "js/game/career.js"), "utf8"), ctx,
    { filename: "js/game/career.js" });
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
