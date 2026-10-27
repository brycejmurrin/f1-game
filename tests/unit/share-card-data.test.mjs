/* share-card-data.test.mjs — pure, privacy-bounded card models. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";
import { seedLog } from "../helpers/seed-log.mjs";
import { seedHash32 } from "../helpers/seed-hash32.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function load() {
  const ctx = vm.createContext({ Object, Array, String, Number, JSON, Math, isFinite });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/share/share-card-data.js"), "utf8"), ctx, { filename: absSrc("js/share/share-card-data.js") });
  return vm.runInContext("ShareCardData", ctx);
}

test("fromDaily returns a frozen JSON-safe model with only the card schema", () => {
  const data = load();
  const model = data.fromDaily(
    { day: "2026-10-17", trackId: "spa", trackName: "Spa\u0000-Francorchamps", weather: "wet", tod: "dusk" },
    { best: 81.345, secret: "drop me" },
    "gold",
    4,
    { link: "https://example.test/#share=APXD1.x", displayName: "  DRIVER 7\u0007  " },
  );
  assert.deepEqual(Object.keys(model), Array.from(data.MODEL_KEYS));
  assert.equal(model.kind, "daily");
  assert.equal(model.trackName, "Spa -Francorchamps");
  assert.equal(model.hero.value, "1:21.345");
  assert.equal(model.hero.medal, "GOLD");
  assert.equal(model.hero.streak, 4);
  assert.equal(model.display.name, "DRIVER 7");
  assert.equal(model.secret, undefined);
  assert.ok(Object.isFrozen(model) && Object.isFrozen(model.hero) && Object.isFrozen(model.display));
  assert.deepEqual(JSON.parse(JSON.stringify(model)), JSON.parse(JSON.stringify(model)));
});

test("fromDaily defaults to anonymous DRIVER and rejects dishonest values", () => {
  const data = load();
  const model = data.fromDaily(
    { day: "bad", trackId: "x".repeat(100), trackName: "FORMULA 1", weather: "rain", tod: "night" },
    { best: -1 },
    "platinum",
    -5,
  );
  assert.equal(model.dayKey, null);
  assert.equal(model.trackId.length, 48);
  assert.equal(model.hero.value, "NO LAP");
  assert.equal(model.hero.medal, null);
  assert.equal(model.hero.streak, null);
  assert.equal(model.display.name, "DRIVER");
  assert.doesNotMatch(JSON.stringify(model), /FORMULA 1/i);
});

const car = (code, extra) => Object.assign({ code, name: code + " Driver", driverId: code.toLowerCase(),
  team: { name: "Team " + code, color: [1, 0, 0] } }, extra);
const plain = (v) => JSON.parse(JSON.stringify(v));
const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

test("fromRace keeps the classified podium and adds the player's row from outside it", () => {
  const data = load();
  const order = ["AAA", "BBB", "CCC", "DDD", "EEE", "YOU"].map((c) => car(c, { isPlayer: c === "YOU" }));
  const model = data.fromRace(order, { points: POINTS, trackId: "spa", trackName: "Spa", fastestLap: "bbb",
    color: () => "rgb(255,0,0)", title: "Formula 1 race" });
  assert.deepEqual(Object.keys(model), Array.from(data.MODEL_KEYS));
  assert.equal(model.kind, "race");
  assert.deepEqual(plain(model.rows.map((r) => [r.pos, r.code, r.value, r.you])),
    [[1, "AAA", "+25 PTS", false], [2, "BBB", "+19 PTS", false], [3, "CCC", "+15 PTS", false], [6, "YOU", "+8 PTS", true]]);
  assert.equal(model.rows[0].teamColor, "rgb(255,0,0)");
  assert.match(model.subtitle, /FASTEST LAP BBB/);
  assert.doesNotMatch(JSON.stringify(model), /FORMULA\s*1/i);
  assert.ok(Object.isFrozen(model.rows) && Object.isFrozen(model.rows[0]));
});

test("fromRace drops a DNF/DSQ car from the podium and labels an out player row", () => {
  const data = load();
  const order = [car("AAA"), car("BBB", { dsq: "one dry compound" }), car("CCC"), car("DDD"),
    car("YOU", { isPlayer: true, retired: true, dnf: "engine" })];
  const dnfOf = (c) => c.retired ? c.dnf : c.dsq ? "DSQ — " + c.dsq : null;
  const model = data.fromRace(order, { dnfOf, points: POINTS, color: () => "javascript:alert(1)" });
  assert.deepEqual(plain(model.rows.map((r) => [r.pos, r.code, r.value])), [[1, "AAA", "+25 PTS"], [3, "CCC", "+15 PTS"], [5, "YOU", "DNF"]]);
  assert.equal(model.rows[0].teamColor, null, "only hex or rgb() colours reach the canvas");
  const dsq = data.fromRace([car("YOU", { isPlayer: true, dsq: "x" })], { dnfOf });
  assert.equal(dsq.rows[0].value, "DSQ");
  const nc = data.fromRace([car("AAA"), car("YOU", { isPlayer: true, classified: false })]);
  assert.equal(nc.rows.at(-1).value, "NC");
  assert.equal(data.fromRace(null).rows.length, 0);
});

test("fromSeason clamps to ten rows and keeps a lower-ranked player as the tenth", () => {
  const data = load();
  const standings = Array.from({ length: 14 }, (_, i) => ({ code: "D" + i, name: "Driver " + i,
    teamColor: "#123456", value: (200 - i * 10) + " pts", you: i === 12 }));
  const model = data.fromSeason(standings, { round: 6, rounds: 24 });
  assert.equal(model.rows.length, data.MAX_ROWS);
  assert.equal(model.rows[9].code, "D12");
  assert.equal(model.rows[9].pos, 13);
  assert.equal(model.rows[9].you, true);
  assert.equal(model.rows[0].value, "200 PTS");
  assert.equal(model.subtitle, "AFTER ROUND 6 / 24");
  const top = data.fromSeason(standings.map((r, i) => ({ ...r, you: i === 2 })), { round: 24, rounds: 24 });
  assert.equal(top.rows[9].code, "D9");
  assert.equal(top.title, "FINAL CHAMPIONSHIP");
});

function loadCareer() {
  const stored = new Map();
  const ctx = vm.createContext({
    Math, JSON, Object, Array, String, Number, Date, isNaN, isFinite, console,
    GameStore: { CAREER_V: 3, store: { get: (k, d) => (stored.has(k) ? stored.get(k) : d), set: (k, v) => stored.set(k, v) },
      seasonDriverId: (teamId, i) => teamId + ":" + i, migrateCareer: (c) => c },
    Teams: { POINTS, isReal: (t) => !!t && !t.custom && !t.legends,
      LIST: [{ id: "custom", tier: 2, custom: true, color: 0xff2222, drivers: [{ name: "You", code: "YOU", num: 99 }] },
        { id: "haas", tier: 4, color: 0xffffff, drivers: [{ name: "A", code: "AAA", num: 1 }, { name: "B", code: "BBB", num: 2 }] }] },
    Parts: { getFactorySetup: () => ({}), getCost: () => 1000, CATALOG: [] },
    Tracks: { LIST: [], SEASON: [] },
    DriverRatings: { get: (code) => ({ code, pace: 80, craft: 75, awareness: 75, consistency: 75, experience: 50 }),
      overall: () => 80, AXES: ["pace", "craft", "awareness", "consistency", "experience"] },
  });
  seedLog(ctx);
  seedHash32(ctx);
  for (const file of ["js/core/mat4.js", "js/career/career.js", "js/career/season-cal.js"]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), ctx, { filename: absSrc(file) });
  }
  return vm.runInContext("Career", ctx);
}

test("fromCareerYear reads a real rollover() history entry", () => {
  const Career = loadCareer();
  Career.start({ flavour: "driver", teamId: "haas", seed: 5, seat: 0, slot: 0 });
  Career.engage(true);
  const c = Career.data();
  c.season.pts["haas:0"] = 120;
  c.season.teamPts = { haas: 140 };
  c.results.push({ p: 1 }, { p: 3 }, { p: 7 });
  c.season.round = 24;
  Career.rollover();
  const entry = c.history.at(-1);
  const model = load().fromCareerYear(entry, { teamName: "Haas", teamColor: "rgb(255,255,255)" });
  assert.equal(model.kind, "career");
  assert.equal(model.title, "CAREER · SEASON " + entry.year);
  assert.equal(model.trackName, "HAAS");
  assert.equal(model.hero.value, "P" + entry.pos + " · " + entry.pts + " PTS");
  assert.deepEqual(plain(model.rows.map((r) => r.name)), ["WORLD CHAMPION", "CONSTRUCTORS", "WINS / PODIUMS"]);
  assert.equal(model.rows[2].value, "1 / 2");
  assert.equal(model.rows[1].value, "P" + entry.cPos + " · " + entry.cPts + " PTS");
  assert.equal(model.subtitle, entry.pos === 1 ? "WORLD CHAMPION" : "");
  const empty = load().fromCareerYear(null);
  assert.equal(empty.hero.value, "—");
  assert.equal(empty.display.name, "DRIVER");
});
