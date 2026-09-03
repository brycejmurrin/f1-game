/* daily-challenge.test.mjs — the DAILY CHALLENGE plan and record, in a VM.
 *
 * js/race/daily-challenge.js is pure rules over the date and a store: the plan
 * must be the same for every player on the same UTC day and different across
 * days; the streak counts consecutive UTC days with a lap; the share line has
 * one shape. Loaded whole with stub Tracks / Log, like season-cal.test.mjs.
 *
 * Run: node --test tests/unit/daily-challenge.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// VM objects carry the VM realm's prototypes: compare plain-data copies.
const host = (v) => JSON.parse(JSON.stringify(v));

function load() {
  const season = ["bahrain", "jeddah", "melbourne", "suzuka", "monaco", "montreal", "monza", "spa"]
    .map((id) => ({ id, name: id.toUpperCase() }));
  const ctx = vm.createContext({
    Math, JSON, Object, Array, String, Number, Date, isNaN, isFinite, console,
    Tracks: { LIST: season.concat([{ id: "kyalami", name: "KYALAMI" }]), SEASON: season },
  });
  seedLog(ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/race/daily-challenge.js"), "utf8"), ctx);
  const D = vm.runInContext("DailyChallenge", ctx);
  const stored = new Map();
  const calls = [];
  const G = {
    store: { get: (k, d) => (stored.has(k) ? JSON.parse(stored.get(k)) : d), set: (k, v) => stored.set(k, JSON.stringify(v)) },
    fmtTime: (t) => t.toFixed(3),
    ttDistance: 4, trackIdx: -1, raceWeather: "dry", raceTimeOfDay: "default", raceLaps: 3, seed: 1,
    flow: "gp", timeTrial: false,
    startRace: () => calls.push("startRace"),
  };
  return { D, d: D.create(G), G, stored, calls };
}

test("the plan is a pure function of the UTC day — same day, same plan; adjacent days differ", () => {
  const { D } = load();
  const a = D.plan("2026-09-03"), b = D.plan("2026-09-03");
  assert.deepEqual(a, b);
  const days = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07"];
  const plans = days.map((d) => D.plan(d));
  assert.ok(new Set(plans.map((p) => p.trackId + p.weather + p.tod)).size >= 5, "a week is not one plan");
  for (const p of plans) {
    assert.ok(["dry", "overcast", "wet", "rain", "fog"].includes(p.weather));
    assert.ok(["default", "dawn", "day", "dusk", "night"].includes(p.tod));
    assert.ok(p.seed > 0 && Number.isInteger(p.seed));
  }
  assert.equal(D.dayKey(new Date(Date.UTC(2026, 8, 3, 23, 59))), "2026-09-03", "UTC, not local");
  assert.equal(D.prevDay("2026-03-01"), "2026-02-28");
});

test("open() stages the day's time trial by circuit ID with the day's seed, then starts", () => {
  const { D, d, G, calls } = load();
  const p = d.open("2026-09-03");
  assert.equal(p.trackId, D.plan("2026-09-03").trackId);
  assert.equal(G.timeTrial, true);
  assert.equal(G.flow, "gp");
  assert.equal(G.trackIdx, ["bahrain", "jeddah", "melbourne", "suzuka", "monaco", "montreal", "monza", "spa"].indexOf(p.trackId));
  assert.equal(G.raceWeather, p.weather);
  assert.equal(G.raceTimeOfDay, p.tod);
  assert.equal(G.raceLaps, 4);
  assert.equal(G.seed, p.seed);
  assert.deepEqual(calls, ["startRace"]);
  assert.equal(d.isActive(), true);
  d.stop();
  assert.equal(d.isActive(), false);
});

test("record() keeps the day's best and counts a streak of consecutive UTC days", () => {
  const { d } = load();
  assert.equal(d.record(80), null, "no active session, nothing recorded");
  d.open("2026-09-03");
  d.record(90.1234); d.record(88.5); d.record(95);
  assert.equal(d.data().days["2026-09-03"].best, 88.5);
  assert.equal(d.data().days["2026-09-03"].laps, 3);
  assert.deepEqual(host(d.data().streak), { count: 1, last: "2026-09-03" });
  d.open("2026-09-04"); d.record(70);
  assert.deepEqual(host(d.data().streak), { count: 2, last: "2026-09-04" });
  d.open("2026-09-06"); d.record(70);   // a missed day resets the streak
  assert.deepEqual(host(d.data().streak), { count: 1, last: "2026-09-06" });
  assert.equal(d.data().days["2026-09-04"].best, 70, "earlier days are kept");
});

test("the share line names the day, circuit, best, medal and streak", () => {
  const { d } = load();
  d.open("2026-09-03"); d.record(81.345); d.record(81.1);
  const p = d.current();
  assert.equal(d.shareText("gold"), "APEX 26 DAILY 2026-09-03 · " + p.trackName + " · 81.100 · GOLD · STREAK 1");
  assert.equal(d.shareText(null), "APEX 26 DAILY 2026-09-03 · " + p.trackName + " · 81.100 · STREAK 1");
  const fresh = load();
  fresh.d.open("2026-09-03");
  assert.equal(fresh.d.shareText(null), "APEX 26 DAILY 2026-09-03 · " + p.trackName + " · NO LAP");
});

test("a damaged save normalises instead of throwing", () => {
  const { d, stored } = load();
  stored.set("daily.v1", JSON.stringify({ days: 5, streak: "x" }));
  assert.deepEqual(host(d.data()), { days: {}, streak: { count: 0, last: null } });
  stored.set("daily.v1", "[]");
  assert.deepEqual(host(d.data().streak), { count: 0, last: null });
});
