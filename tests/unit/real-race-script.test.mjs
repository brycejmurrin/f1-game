/* real-race-script.test.mjs — one real Grand Prix's OpenF1 timing becomes a race SCRIPT, in a VM.
 *
 * js/data/real-race-tab.js turns nine OpenF1 bodies into the compact script
 * js/race/real-race.js replays. The fixture is the 2026 Azerbaijan GP as
 * OpenF1 published it (tests/fixtures/openf1-baku-2026-race.json, trimmed to
 * the fields the builder reads): 22 drivers, 51 laps, two safety-car windows,
 * seven retirements. The things that matter, in order:
 *
 *  1. THE GRID IS THE PRE-START SNAPSHOT, not the classification — OpenF1 has
 *     no starting_grid endpoint, so the first /position row per driver is it.
 *  2. A SAFETY CAR IS A WINDOW ON THE LEADER'S LAP: "DEPLOYED" opens it,
 *     "IN THIS LAP" closes it; two in a row are two windows, not one.
 *  3. THE CIRCUIT IS RESOLVED BY NAME FIRST, then country — Italy has two.
 *  4. The tab's JUMP IN hands RealRace the script, the seat and the distance.
 *
 * Run: node --test tests/unit/real-race-script.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURE = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/openf1-baku-2026-race.json"), "utf8"));
const host = (v) => JSON.parse(JSON.stringify(v));

const TRACKS = [
  { id: "monza", name: "MONZA", country: "Italy" }, { id: "imola", name: "IMOLA", country: "Italy", classic: true },
  { id: "baku", name: "BAKU", country: "Azerbaijan" }, { id: "cota", name: "COTA", country: "USA" },
  { id: "miami", name: "MIAMI", country: "USA" }, { id: "singapore", name: "SINGAPORE", country: "Singapore" },
];

function load(extra = {}) {
  const sb = { Math, Array, Object, Number, String, Boolean, Date, isFinite, isNaN, console, Promise, JSON, Set, Map, RegExp, ...extra };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  seedLog(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/data/teams.js"), "utf8"), ctx, { filename: "teams.js" });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/data/real-race-tab.js"), "utf8"), ctx, { filename: "real-race-tab.js" });
  const Teams = vm.runInContext("Teams", ctx);
  // js/data/hub.js's team matcher, reduced to what the fixture's names need.
  const KEYS = [["racing bulls", "RB"], ["red bull", "RBR"], ["mercedes", "MER"], ["ferrari", "FER"], ["mclaren", "MCL"], ["alpine", "ALP"],
    ["haas", "HAA"], ["williams", "WIL"], ["audi", "AUD"], ["aston", "AMR"], ["cadillac", "CAD"]];
  const findTeam = (name) => {
    const n = String(name || "").toLowerCase();
    const k = KEYS.find((p) => n.indexOf(p[0]) !== -1);
    return k ? Teams.LIST.find((t) => t.short === k[1]) || null : null;
  };
  return { D: vm.runInContext("DataRealRace", ctx), ctx, Teams, findTeam };
}

function rawBaku() {
  const raw = host(FIXTURE);
  raw.session.meeting_name = FIXTURE.meeting_name;
  return raw;
}

test("the 2026 Baku race builds into a 22-driver, 51-lap script with the pre-start grid", () => {
  const { D, findTeam } = load();
  const s = host(D.build(rawBaku(), findTeam, TRACKS));
  assert.equal(s.v, D.SCRIPT_V);
  assert.equal(s.laps, 51);
  assert.equal(s.sessionKey, 11377);
  assert.equal(s.name, "Azerbaijan Grand Prix");
  assert.equal(s.trackId, "baku");
  assert.equal(s.tod, "day", "11:00 UTC + 04:00 is mid-afternoon");
  assert.equal(s.weather, "dry");
  assert.equal(s.drivers.length, 22);
  // Grid order first — the snapshot taken on the grid, not the finishing order.
  assert.deepEqual(s.drivers.slice(0, 3).map((d) => d.code), ["RUS", "LEC", "PIA"]);
  assert.equal(s.drivers[s.drivers.length - 1].code, "STR");
  assert.equal(s.drivers[0].grid, 1);
  assert.equal(s.drivers[21].grid, 22);
  const rus = s.drivers.find((d) => d.code === "RUS");
  assert.equal(rus.num, 63);
  assert.equal(rus.teamId, "mercedes");
  assert.equal(rus.pos, 1);
  assert.equal(rus.dnf, false);
  assert.equal(rus.laps.length, 51);
  assert.equal(rus.laps[0], 112.263);
  assert.deepEqual(rus.stints, [{ c: "MEDIUM", from: 1, to: 31, age: 2 }, { c: "SOFT", from: 32, to: 36, age: 0 }, { c: "SOFT", from: 37, to: 51, age: 0 }], "the mediums were two laps old from qualifying");
  assert.equal(s.complete, true, "a classified race with every lap in");
  assert.equal(s.rain.length, 52, "rain flag per real lap");
  assert.ok(s.rain.every((r) => r === false), "Baku 2026 was dry throughout");
  assert.deepEqual(rus.pits, [31, 36]);
  // Every real team lands on a roster team — the 2026 grid is the game's grid.
  assert.ok(s.drivers.every((d) => d.teamId), "every driver has a roster team");
  assert.equal(new Set(s.drivers.map((d) => d.teamId)).size, 11);
});

test("retirements carry the lap they stopped on; a missing lap time ends the row", () => {
  const { D, findTeam } = load();
  const s = host(D.build(rawBaku(), findTeam, TRACKS));
  const str = s.drivers.find((d) => d.code === "STR");
  assert.equal(str.dnf, true);
  assert.equal(str.lapsDone, 7);
  assert.equal(str.pos, null);
  assert.equal(str.laps[7], null, "lap 8 (the retirement lap) has no duration");
  assert.equal(s.drivers.filter((d) => d.dnf).length, 7);
});

test("the race-control feed becomes safety-car windows on the leader's lap", () => {
  const { D } = load();
  const s = host(D.cautionsFor(FIXTURE.raceControl));
  assert.deepEqual(s, [
    { level: 3, from: 31, to: 35, cause: "SAFETY CAR" },
    { level: 3, from: 36, to: 38, cause: "SAFETY CAR" },
  ]);
  // A VSC pairs DEPLOYED with ENDING; a red flag is a one-lap marker; an unclosed window ends where it opened.
  const mixed = D.cautionsFor([
    { lap_number: 3, category: "SafetyCar", message: "VIRTUAL SAFETY CAR DEPLOYED" },
    { lap_number: 4, category: "SafetyCar", message: "VIRTUAL SAFETY CAR ENDING" },
    { lap_number: 10, category: "Flag", flag: "RED", message: "RED FLAG" },
    { lap_number: 20, category: "SafetyCar", message: "SAFETY CAR DEPLOYED" },
    { lap_number: 21, category: "Other", message: "LAPPED CARS MAY NOW OVERTAKE THE SAFETY CAR: 77" },
  ]);
  assert.deepEqual(host(mixed), [
    { level: 2, from: 3, to: 4, cause: "VSC" },
    { level: 4, from: 10, to: 10, cause: "RED FLAG" },
    { level: 3, from: 20, to: 20, cause: "SAFETY CAR" },
  ]);
});

test("the circuit resolves by name before country, and the weather and hour read off the session", () => {
  const { D } = load();
  assert.equal(D.trackIdFor({ country_name: "Italy", circuit_short_name: "Monza" }, TRACKS), "monza");
  assert.equal(D.trackIdFor({ country_name: "Italy", circuit_short_name: "Imola" }, TRACKS), "imola");
  assert.equal(D.trackIdFor({ country_name: "Italy", circuit_short_name: "Nowhere" }, TRACKS), "monza", "the country's current circuit, not the classic");
  assert.equal(D.trackIdFor({ country_name: "United States", circuit_short_name: "Austin" }, TRACKS), "cota");
  assert.equal(D.trackIdFor({ country_name: "Azerbaijan", circuit_short_name: "Baku" }, TRACKS), "baku");
  assert.equal(D.trackIdFor({ country_name: "Nowhere", circuit_short_name: "X" }, TRACKS), null);
  assert.equal(D.todFor({ date_start: "2026-10-11T12:00:00+00:00", gmt_offset: "08:00:00" }), "night", "Singapore at 20:00 local");
  assert.equal(D.todFor({ date_start: "2026-03-01T15:00:00+00:00", gmt_offset: "03:00:00" }), "dusk", "Bahrain at 18:00 local");
  assert.equal(D.todFor({ date_start: "nope" }), "default");
  assert.equal(D.weatherFor([{ rainfall: 0 }, { rainfall: 0 }]), "dry");
  assert.equal(D.weatherFor([{ rainfall: 1 }, { rainfall: 0 }, { rainfall: 0 }]), "wet");
  assert.equal(D.weatherFor([{ rainfall: 1 }, { rainfall: 1 }, { rainfall: 0 }]), "rain");
  assert.deepEqual(host(D.gridFor([{ driver_number: 1, position: 5, date: "b" }, { driver_number: 1, position: 2, date: "a" }, { driver_number: 4, position: 1, date: "c" }])), { 1: 2, 4: 1 });
});

test("rain by lap aligns the weather samples to the leader's lap windows; an unfinished race is not complete", () => {
  const { D, findTeam } = load();
  const laps = [
    { driver_number: 1, lap_number: 1, date_start: "2026-01-01T10:00:00Z" }, { driver_number: 1, lap_number: 2, date_start: "2026-01-01T10:02:00Z" },
    { driver_number: 1, lap_number: 3, date_start: "2026-01-01T10:04:00Z" }, { driver_number: 2, lap_number: 3, date_start: "2026-01-01T10:04:30Z" },
  ];
  const wx = [{ date: "2026-01-01T09:50:00Z", rainfall: 1 }, { date: "2026-01-01T10:02:30Z", rainfall: 1 }, { date: "2026-01-01T10:05:00Z", rainfall: 0 }, { date: "bad", rainfall: 1 }];
  assert.deepEqual(host(D.rainByLap(laps, wx, 4)), [false, false, true, false, false], "only lap 2's window saw rain (the pre-race sample is before lap 1)");
  assert.equal(D.rainByLap([{ driver_number: 1, lap_number: 1 }], wx, 4), null, "no lap timestamps: no alignment");
  // A race still running: laps partial, no classification -> plays as far as it goes, never cached.
  const raw = rawBaku();
  raw.result = [];
  raw.laps = raw.laps.filter((l) => l.lap_number <= 20);
  const s = host(D.build(raw, findTeam, TRACKS));
  assert.equal(s.laps, 20);
  assert.equal(s.complete, false);
  const store = new Map();
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
  const { D: D2 } = load({ localStorage });
  store.set(D2.CACHE_KEY + "11377", JSON.stringify(s));
  assert.equal(D2.cached(11377), null, "an incomplete script is never served from the cache");
});

test("the script cache round-trips through localStorage and rejects a stale shape", () => {
  const store = new Map();
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
  const { D, findTeam } = load({ localStorage });
  assert.equal(D.cached(11377), null);
  const s = D.build(rawBaku(), findTeam, TRACKS);
  store.set(D.CACHE_KEY + "11377", JSON.stringify(s));
  assert.equal(host(D.cached(11377)).laps, 51);
  store.set(D.CACHE_KEY + "11377", JSON.stringify({ v: 1, laps: 51, drivers: [], complete: true }));
  assert.equal(D.cached(11377), null, "an older script version is refetched");
  store.set(D.CACHE_KEY + "11377", "{not json");
  assert.equal(D.cached(11377), null);
});

// A DOM stand-in with the surface the tab touches (the data-results.test.mjs shape).
function makeDom() {
  function el(tag, cls, text) {
    const node = {
      tag, cls: cls || null, text: text == null ? null : String(text), children: [], type: null, listeners: {},
      appendChild(c) { node.children.push(c); return c; },
      addEventListener(ev, fn) { (node.listeners[ev] = node.listeners[ev] || []).push(fn); },
      setAttribute(k, v) { node[k] = v; },
      fire(ev) { (node.listeners[ev] || []).forEach((fn) => fn()); },
    };
    return node;
  }
  return { el, clear: (n) => { n.children.length = 0; } };
}
function find(node, pred, out = []) { if (pred(node)) out.push(node); node.children.forEach((c) => find(c, pred, out)); return out; }

test("the RACE IT tab lists every seat and JUMP IN hands RealRace the script, the seat and the distance", async () => {
  const launches = [];
  const store = new Map();
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
  const raw = rawBaku();
  const bodyFor = (url) => {
    if (url.includes("/sessions?")) return [raw.session];
    if (url.includes("/drivers?")) return raw.drivers;
    if (url.includes("/laps?")) return raw.laps;
    if (url.includes("/stints?")) return raw.stints;
    if (url.includes("/pit?")) return raw.pits;
    if (url.includes("/race_control?")) return raw.raceControl;
    if (url.includes("/weather?")) return raw.weather;
    if (url.includes("/session_result?")) return raw.result;
    if (url.includes("/position?")) return raw.positions;
    return [];
  };
  const requested = [];
  const F1API = {
    request: (url, ttl, opts) => { requested.push({ url, ttl, opts }); return Promise.resolve(bodyFor(url)); },
    meetings: () => Promise.resolve([{ meetingKey: 1295, name: "Azerbaijan Grand Prix" }]),
    sessionsForMeeting: () => Promise.resolve([{ sessionKey: 11373, meetingKey: 1295, name: "Qualifying", type: "Qualifying" }, { sessionKey: 11377, meetingKey: 1295, name: "Race", type: "Race" }]),
  };
  const RealRace = { launch: (script, opts) => { launches.push({ script, opts }); return { ok: true }; },
    // Two seats for the test: Russell and Leclerc; every other driver has no roster seat.
    mapField: (script) => script.drivers.filter((d) => d.num === 63 || d.num === 16).map((d) => ({ driverId: d.teamId + ":0", num: d.num, teamId: d.teamId, di: 0 })) };
  const Teams = { LIST: [] };
  const Tracks = { LIST: TRACKS };
  const { D, findTeam } = load({ localStorage, F1API, RealRace, Teams, Tracks });
  const dom = makeDom();
  let closed = 0;
  const deps = {
    el: dom.el, clear: dom.clear, emptyMsg: (t) => dom.el("div", "dh-empty", t), spinner: () => dom.el("div", "dh-loading"),
    sel: { meetingKey: 1295, sessionKey: 11373, meta: { sessionKey: 11373, meetingKey: 1295, name: "Qualifying", type: "Qualifying" } },
    ensureSession: () => Promise.resolve(), buildPicker: () => dom.el("div", "dh-picker"),
    teamChip: (code) => dom.el("span", "dh-codechip", code), fmtDateTime: (iso) => iso, findTeam, close: () => { closed++; },
  };
  const tab = D.create(deps);
  const tree = await tab.loadRealRace();
  // The render is async (nine fetches, then the meeting name): drain the microtasks.
  for (let i = 0; i < 20; i++) await Promise.resolve();
  const laps = requested.find((r) => r.url.includes("/laps?"));
  assert.ok(laps && laps.opts && laps.opts.cache === false, "the 480 KB laps body is fetched uncached");
  assert.ok(requested.every((r) => r.url.includes("session_key=11377")), "the RACE session, not the qualifying the picker held");
  const rows = find(tree, (n) => n.tag === "tr" && n.children.some((c) => c.tag === "td"));
  assert.equal(rows.length, 22);
  assert.equal(rows[0].children[0].text, "P1");
  assert.equal(rows[0].children[4].text, "P1");
  assert.equal(rows[21].children[4].text, "DNF L7");
  const pills = find(tree, (n) => n.tag === "button" && /LAPS/.test(n.text || ""));
  assert.deepEqual(pills.map((p) => p.text), ["51 LAPS (FULL)", "26 LAPS", "10 LAPS", "5 LAPS"]);
  const buttons = find(tree, (n) => n.tag === "button" && n.text === "JUMP IN");
  assert.equal(buttons.length, 2, "only the drivers with a roster seat can be raced");
  const noSeat = find(tree, (n) => n.tag === "button" && n.disabled === true);
  assert.equal(noSeat.length, 20);
  assert.equal(noSeat[0].text, "no seat in this roster");
  assert.equal(buttons[1]["aria-label"], "Race as Charles LECLERC");
  // The JUMP IN AT picker: every lap, the eventful ones labelled.
  const picker = find(tree, (n) => n.tag === "select")[0];
  assert.equal(picker.children.length, 51);
  assert.equal(picker.children[0].text, "Lap 1 · the grid");
  assert.equal(picker.children[7].text, "Lap 8 · STR out");
  assert.equal(picker.children[30].text, "Lap 31 · SAFETY CAR");
  assert.equal(picker.children[35].text, "Lap 36 · SAFETY CAR, NOR out, GAS out");
  buttons[1].fire("click");
  assert.equal(closed, 1, "the hub closes before the race starts");
  assert.equal(launches.length, 1);
  assert.equal(launches[0].opts.seat, "LEC");
  assert.equal(launches[0].opts.laps, 51);
  assert.equal(launches[0].opts.startLap, 1);
  assert.equal(launches[0].script.trackId, "baku");
  assert.ok(store.has(D.CACHE_KEY + "11377"), "the compact script is remembered");
  // A condensed distance and a later lap keep the script and change only the numbers handed over.
  tab.setDistance(0.2);
  tab.setStartLap(31);
  const buttons2 = find(tree, (n) => n.tag === "button" && n.text === "JUMP IN");
  buttons2[0].fire("click");
  assert.equal(launches[1].opts.laps, 10);
  assert.equal(launches[1].opts.startLap, 31);
  assert.equal(launches[1].opts.seat, "RUS");
});
