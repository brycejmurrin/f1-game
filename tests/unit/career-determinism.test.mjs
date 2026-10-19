// Career draws go through the stateless Career.rnd(...parts) hash (js/career/career.js).
// Consuming the physics simRnd() stream from career code makes a career's existence
// change seeded race results; Math.random makes a save unreproducible. This pins the
// rule the career-mode skill states (references/workflow.md step 6) instead of
// leaving it as prose. Source scan only, no VM, < 50 ms.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIR = path.join(ROOT, "js/career");

// Math.random sites that are NOT career draws. A new entry needs the same kind of reason.
const MATH_RANDOM_OK = {
  // shuffled(): the standalone Season calendar shuffle with no seed; a seeded call never reaches it.
  "season-cal.js": 1,
  // restore-point id suffix: uniqueness only, never feeds a game outcome.
  "restore-points.js": 1,
};

// Drop /* */ blocks and // line comments so a comment that NAMES the rule is not a hit.
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const count = (src, re) => (src.match(re) || []).length;
const files = () => fs.readdirSync(DIR).filter((f) => f.endsWith(".js")).sort();
const src = (f) => code(fs.readFileSync(path.join(DIR, f), "utf8"));

test("js/career/ never consumes the physics simRnd() stream", () => {
  assert.ok(files().length >= 5, "js/career/*.js found");
  for (const f of files()) {
    const n = count(src(f), /\bsimRnd\b/g);
    assert.equal(n, 0, `js/career/${f}: ${n} simRnd reference(s) — use Career.rnd(...parts), a stateless hash`);
  }
});

test("js/career/ calls Math.random only at the allowlisted non-draw sites", () => {
  for (const f of files()) {
    const n = count(src(f), /\bMath\.random\s*\(/g);
    const ok = MATH_RANDOM_OK[f] || 0;
    assert.ok(n <= ok, `js/career/${f}: ${n} Math.random() call(s), allowed ${ok} — a career draw uses Career.rnd(...parts)`);
  }
  for (const f of Object.keys(MATH_RANDOM_OK)) {
    assert.ok(fs.existsSync(path.join(DIR, f)), `stale allowlist entry js/career/${f}`);
  }
});

// Dynamic twin of the source scans above: those can be evaded (Math['random'], an alias, a file outside
// js/career) and cannot see a call that is only reached at run time. Here the real Career runs three
// seasons twice with Math.random and simRnd poisoned; the saves must come out identical.
import vm from "node:vm";

function simulate(seed) {
  const stored = new Map();
  const poisoned = Object.assign(Object.create(Math), { random: () => { throw new Error("Math.random called by career code"); } });
  const ctx = vm.createContext({ Math: poisoned, JSON, Object, Array, String, Number, Date, Set, Map, isNaN, isFinite, console });
  ctx.window = ctx;
  ctx.simRnd = () => { throw new Error("simRnd called by career code"); };
  ctx.GameStore = {
    CAREER_V: 2,
    store: { get: (k, d) => (stored.has(k) ? JSON.parse(JSON.stringify(stored.get(k))) : d),
             set: (k, v) => { stored.set(k, JSON.parse(JSON.stringify(v))); return true; } },
    seasonDriverId: (t, i) => t + ":" + i, migrateCareer: (c) => c,
  };
  const ids = ["albert_park", "shanghai", "suzuka", "miami"];
  const list = ids.map((id) => ({ id, name: id }));
  ctx.Tracks = { LIST: list, SEASON: list.slice(), seasonIndex(i) { return this.LIST.indexOf(this.SEASON[i]); } };
  for (const f of ["js/core/log.js", "js/core/mat4.js", "js/core/hash32.js", "js/data/teams.js", "js/data/driver-ratings.js",
    "js/physics/consts.js", "js/car/parts.js", "js/career/save-migrate.js", "js/career/regulations.js",
    "js/career/career-planning.js", "js/career/career.js"]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
  }
  const Career = vm.runInContext("Career", ctx);
  Career.start({ flavour: "driver", teamId: "haas", seed });
  Career.engage(true);
  const snapshots = [];
  for (let year = 0; year < 3; year++) {
    const c = Career.data();
    c.rep = 60;
    for (let r = 0; r < ids.length; r++) {
      c.season.round = r + 1;                            // endRace() advances BEFORE settleRound()
      const mk = (id, retired) => ({ team: { id }, retired, cuts: 0, penalty: 0, gridPos: 5 });
      const player = mk(c.team, false);
      const order = [mk("ferrari", false), mk("mclaren", false), mk("mercedes", false), mk("redbull", r === 2), player];
      for (let k = 0; k < 15; k++) order.push(mk("haas", false));
      order.splice(r % 5, 0, order.splice(order.indexOf(player), 1)[0]);
      assert.ok(Career.settleRound(order, player), `year ${year} round ${r} settled`);
    }
    assert.equal(c.results.length, ids.length, "every round left a result row, so the sim really ran");
    Career.rollover();
    snapshots.push(JSON.stringify(Career.data()));
  }
  return snapshots;
}

test("a career played through three rollovers is byte-identical twice, with Math.random and simRnd poisoned", () => {
  const a = simulate(31), b = simulate(31), other = simulate(32);
  assert.equal(a.length, 3);
  assert.deepEqual(a, b, "same seed, same saves");
  assert.notDeepEqual(a, other, "another seed plays another career (the comparison is not vacuous)");
});
