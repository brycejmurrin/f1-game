/* career-round2.test.mjs — the round-2 career/season-logic fixes (C1–C5, C9, D6, goal-type hardening,
 * null-team slot), in a VM with the REAL teams.js / driver-ratings.js / career.js / season-cal.js.
 *
 *  C1  the season stamps its calendar (season.calIds): a deploy that adds, drops or reorders circuits
 *      mid-career neither skips nor repeats one.
 *  C2  a beatRival offer names the rival the contract signs (and never the offered team's own driver).
 *  C3  accepting a move displaces the weaker seat of the NEW team whichever seat the player left.
 *  C4  hireDriver(<the sitting hire>) cannot dodge the renewal figure.
 *  C5  the contract goal's reputation counts in THIS winter's market value.
 *  C9  a p:0 result is not a podium.
 *
 * Run: node --test tests/unit/career-round2.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { makeDom } from "../helpers/mini-dom.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const IDS = ["albert_park", "shanghai", "suzuka", "miami", "montreal", "monaco", "catalunya", "redbull", "silverstone", "spa",
  "hungaroring", "zandvoort", "monza", "madrid", "baku", "sepang", "singapore", "cota", "mexico", "interlagos", "vegas",
  "qatar", "abudhabi", "x1"];

function load(n = 24) {
  const stored = new Map();
  const ctx = vm.createContext({ Math, JSON, Object, Array, String, Number, Date, isNaN, isFinite, console, Set, Map, WeakSet, Infinity, Error });
  ctx.GameStore = {
    CAREER_V: 1,
    store: {
      get: (k, d) => (stored.has(k) ? JSON.parse(JSON.stringify(stored.get(k))) : d),
      set: (k, v) => { stored.set(k, JSON.parse(JSON.stringify(v))); return true; },
    },
    seasonDriverId: (t, i) => t + ":" + i,
    migrateCareer: (c) => c,
  };
  ctx.Parts = { getFactorySetup: () => ({}), setLegality() {}, getCost: () => 1000, CATALOG: [], legalityKey: () => "" };
  const list = IDS.slice(0, n).map((id) => ({ id, name: id }));
  // SEASON is its own array (tracks.js filters LIST), so a test can change the calendar without the catalogue.
  ctx.Tracks = { LIST: list, SEASON: list.slice(), seasonIndex(i) { return this.LIST.indexOf(this.SEASON[i]); } };
  for (const f of ["js/core/log.js", "js/core/mat4.js", "js/core/hash32.js", "js/data/teams.js", "js/data/driver-ratings.js",
    "js/career/save-migrate.js", "js/career/regulations.js", "js/career/career.js", "js/career/season-cal.js"]) {
    vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: f });
  }
  vm.runInContext('Teams.LIST.push({ id:"custom", name:"MY TEAM", short:"MY", tier:2, custom:true, color:[1,0,0], drivers:[{name:"You",code:"YOU",num:99}], stats:{speed:50,accel:50,cornering:50,braking:50} })', ctx);
  const run = (s) => vm.runInContext(s, ctx);
  return { ctx, run, stored, Career: run("Career"), SeasonCal: run("SeasonCal"), Teams: run("Teams"), DriverRatings: run("DriverRatings") };
}
const started = (opts = {}) => {
  const h = load(opts.n);
  h.Career.start(Object.assign({ flavour: "driver", teamId: "haas", seed: 9 }, opts.start));
  h.Career.engage(true);
  return h;
};
const raced = (h) => h.run("Tracks.LIST")[h.Career.trackIndex()].id;

// ---- C1 ---------------------------------------------------------------------------------------
test("C1: start() stamps the calendar by id", () => {
  const h = started();
  assert.deepEqual(Array.from(h.Career.data().season.calIds), IDS);
});

test("C1: a circuit dropped from Tracks.SEASON mid-career does not skip the next race or shorten the season", () => {
  const h = started();
  h.Career.data().season.round = 12;
  assert.equal(raced(h), "monza");
  h.run("Tracks.SEASON.splice(5,1)");               // a deploy flips Monaco to `classic`
  assert.equal(raced(h), "monza", "the next race is still Monza");
  assert.equal(h.Career.roundsTotal(), 24);
  assert.equal(h.Career.seasonDone(), false);
  assert.equal(h.Career.state().rounds, 24);
});

test("C1: circuits inserted earlier in Tracks.SEASON do not repeat the one just raced", () => {
  const h = started();
  h.Career.data().season.round = 12;
  h.run("Tracks.SEASON.splice(5,0,{id:'n1',name:'n1'},{id:'n2',name:'n2'})");
  assert.equal(raced(h), "monza");
  assert.equal(h.Career.roundsTotal(), 24);
  h.Career.data().season.round = 24;
  assert.equal(h.Career.seasonDone(), true, "the finale is where the season began, not where the build ends");
});

test("C1: SeasonCal.list() in the career flow follows the stamped calendar", () => {
  const h = started();
  h.SeasonCal.engage("career");
  h.run("Tracks.SEASON.splice(0,3)");
  assert.equal(h.SeasonCal.rounds(), 24);
  assert.equal(h.SeasonCal.track(0).id, "albert_park");
});

test("C1: a save without a stamp adopts the current calendar on load; rollover re-stamps", () => {
  const h = started();
  const c = h.Career.data();
  delete c.season.calIds;
  h.Career.save();
  h.Career.load();
  assert.deepEqual(Array.from(h.Career.data().season.calIds), IDS);
  h.run("Tracks.SEASON.splice(5,1)");
  h.Career.data().season.round = 24;
  h.Career.rollover();
  assert.equal(h.Career.data().season.calIds.length, 23, "next season runs this build's calendar");
  assert.equal(h.Career.roundsTotal(), 23);
});

test("C1: a stamped circuit this build no longer knows is dropped and the round remapped like SeasonCal.resume", () => {
  const h = started();
  const c = h.Career.data();
  c.season.round = 8;                                // 8 raced: albert_park .. redbull
  c.season.roundPts = { "haas:0": [1, 2, 3, 4, 5, 6, 7, 8] };
  c.results = [{ r: 5, p: 3, pts: 15 }, { r: 7, p: 1, pts: 25 }];
  h.Career.save();
  h.run("Tracks.LIST.splice(5,1); Tracks.SEASON.splice(5,1)");   // Monaco is gone entirely
  h.Career.load();
  const s = h.Career.data().season;
  assert.equal(s.calIds.length, 23);
  assert.equal(s.calIds.includes("monaco"), false);
  assert.equal(s.round, 7, "one of the eight raced rounds no longer exists");
  assert.deepEqual(Array.from(s.roundPts["haas:0"]), [1, 2, 3, 4, 5, 7, 8]);
  assert.deepEqual(Array.from(h.Career.data().results, (r) => r.r), [6], "the Monaco row goes, Red Bull Ring's index follows");
  assert.equal(raced(h), "silverstone", "the next race is still the circuit after the last one raced");
});

test("C1: the hub's NEXT RACE card names the circuit Career.trackIndex() will load, after the calendar changed", () => {
  const h = started();
  h.Career.data().season.round = 12;
  h.run("Tracks.SEASON.splice(5,1)");
  h.ctx.document = makeDom().document;
  for (const f of ["js/ui/dom.js", "js/career/experience.js"]) vm.runInContext(readFileSync(join(ROOT, f), "utf8"), h.ctx, { filename: f });
  const card = vm.runInContext("CareerExperience", h.ctx).raceBrief({ cssCol: () => "#fff" }, h.Career.data(), { rounds: h.Career.roundsTotal(), obj: null }, null);
  const named = card.querySelector(".cr-nr-name").textContent;
  assert.equal(named, raced(h));
  assert.equal(named, "monza");
});

// ---- C2 ---------------------------------------------------------------------------------------
test("C2: a beatRival move offer signs the rival it printed, and never names the offered team's own driver", () => {
  let tested = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const h = started({ start: { seed } });
    const c = h.Career.data();
    c.rep = 95; c.season.round = 24;
    h.Career.rollover();
    for (const o of c.offers) {
      if (o.goal.type !== "beatRival") continue;
      assert.notEqual(o.goal.value.split(":")[0], o.teamId, "seed " + seed + ": the rival is not the offered team's driver");
    }
    const i = c.offers.findIndex((o) => o.teamId !== c.team && o.goal.type === "beatRival");
    if (i < 0) continue;
    tested++;
    const printed = c.offers[i].goal.value;
    assert.equal(h.Career.acceptOffer(i).goal.value, printed, "seed " + seed);
  }
  assert.ok(tested >= 10, "the sweep must exercise move offers (" + tested + ")");
});

test("C2: a hostile offer goal type is stored as champPos, not as 'constructor'", () => {
  const h = started();
  const c = h.Career.data();
  c.offers = [{ teamId: "alpine", years: 1, salary: 50, goal: { type: "constructor", value: 3 } },
              { teamId: "williams", years: 1, salary: 50, goal: { type: "__proto__", value: 3 } }];
  assert.doesNotThrow(() => h.Career.setAmbition(2));
  assert.equal(c.offers[0].goal.type, "champPos");
  const deal = h.Career.acceptOffer(0);
  assert.equal(deal.goal.type, "champPos");
});

// ---- C3 ---------------------------------------------------------------------------------------
test("C3: the player takes the weaker seat of the new team whichever seat they left", () => {
  for (const target of ["alpine", "williams", "cadillac", "mercedes", "ferrari"]) {
    const took = [];
    for (const oldSeat of [0, 1]) {
      const h = started({ start: { seed: 11, seat: oldSeat } });
      const c = h.Career.data();
      const t = h.Teams.LIST.find((x) => x.id === target);
      c.offers = [{ teamId: target, years: 1, salary: 100, goal: { type: "champPos", value: 5 } }];
      h.Career.acceptOffer(0);
      const r = (i) => h.DriverRatings.overall(h.DriverRatings.get(t.drivers[i].code, t.tier, null));
      assert.equal(c.seat, r(0) <= r(1) ? 0 : 1, target + " from seat " + oldSeat);
      took.push(c.seat);
    }
    assert.equal(took[0], took[1], target);
  }
});

// ---- C4 ---------------------------------------------------------------------------------------
test("C4: hireDriver(the sitting hire) is refused, so renewal cannot be dodged and development survives", () => {
  const h = started({ start: { flavour: "myteam", teamId: "custom", hire: "FER2" } });
  const c = h.Career.data();
  assert.equal(c.roster[0].code, "FER2");
  c.roster[0].pending = { kind: "renew", ask: 138 };
  c.dev["custom:1"] = { pace: 3 };
  assert.equal(h.Career.hireDriver("FER2", 1), false);
  assert.deepEqual(Object.assign({}, c.dev["custom:1"]), { pace: 3 });
  assert.equal(c.roster[0].pending.ask, 138);
  assert.equal(h.Career.hireDriver("LNQ", 1), true, "a different free agent is still hireable");
});

// ---- C5 ---------------------------------------------------------------------------------------
test("C5: a met contract goal's reputation counts in this winter's market value", () => {
  // Player last on points at rep 74: mv = 37 before the goal, 39.5 after +5. A tier-3 team's bar is 38.
  let tier3Offers = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const h = started({ start: { seed } });
    const c = h.Career.data();
    c.rep = 74;
    c.deal.left = 1;
    c.deal.goal = { type: "champPos", value: 22 };
    c.deal.ambition = 1;
    for (const s of h.run("Teams.LIST").flatMap((t) => (t.drivers || []).map((d, i) => t.id + ":" + i))) c.season.pts[s] = 100;
    c.season.pts["haas:0"] = 0;
    c.season.round = 24;
    h.Career.rollover();
    tier3Offers += c.offers.filter((o) => o.teamId !== "haas" && h.Teams.LIST.find((t) => t.id === o.teamId).tier === 3).length;
  }
  assert.ok(tier3Offers > 0, "the +rep from the met goal must reach this winter's offers");
});

// ---- C9 ---------------------------------------------------------------------------------------
test("C9: a p:0 result row is not a podium", () => {
  const h = started();
  const c = h.Career.data();
  c.results = [{ r: 0, p: 0, pts: 0 }, { r: 1, p: 2, pts: 18 }, { r: 2, p: 4, pts: 12 }];
  c.season.round = 24;
  h.Career.rollover();
  assert.equal(c.history[c.history.length - 1].podiums, 1);
});

// ---- D6 / slot card ---------------------------------------------------------------------------
test("D6: NEW CAREER accepts number 1 (0 and blank stay 99)", () => {
  for (const [num, want] of [[1, 1], [2, 2], [0, 99], [100, 99], [undefined, 99]]) {
    const h = load();
    h.Career.start({ flavour: "driver", teamId: "haas", seed: 3, num });
    assert.equal(h.Career.data().driver.num, want, "num " + num);
  }
});

test("a slot whose team is null still describes itself with strings (the CAREER MODES card upper-cases it)", () => {
  const h = started();
  const c = JSON.parse(JSON.stringify(h.Career.data()));
  c.team = null;
  h.ctx.GameStore.store.set("career.driver.1", c);
  const row = h.Career.slots("driver").find((s) => s.i === 1);
  assert.equal(row.used, true);
  assert.equal(typeof row.teamName, "string");
  assert.doesNotThrow(() => String(row.teamName).toUpperCase());
});
