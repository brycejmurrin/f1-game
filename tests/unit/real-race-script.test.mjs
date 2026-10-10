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
  { id: "bahrain", name: "BAHRAIN", country: "Bahrain" }, { id: "sepang", name: "SEPANG", country: "Malaysia", classic: true },
];

// The shipped calendar, evaluated from season-cal.js itself: a hand-copied window would pass while the real one drifts.
function realCalendar() {
  const src = fs.readFileSync(path.join(ROOT, "js/career/season-cal.js"), "utf8");
  const m = src.match(/const REAL_2026 = Object\.freeze\(\[[\s\S]*?\]\.map\([^\n]*\)\);/);
  assert.ok(m, "REAL_2026 is still a const in season-cal.js");
  return vm.runInContext(m[0] + "; REAL_2026", vm.createContext({ Object }));
}

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

test("WATCH downloads cannot launch a replaced view and keep the seat selected when requested", async () => {
  for (const detached of [true, false]) {
    let resolveLocation, open = true, closed = 0;
    const launches = [];
    const { D } = load({ F1API: { locationData: () => new Promise((resolve) => { resolveLocation = resolve; }) },
      RealRace: { launch: (script, options) => { launches.push({ script, options }); return {}; } } });
    const tab = D.create({ isOpen: () => open, close: () => { closed++; open = false; } });
    const slot = { isConnected: true }, script = { sessionKey: 1, t0: 100000, laps: 1, drivers: [{ num: 1, lapStart: [0], laps: [30] }] };
    tab.setSeat("AAA"); tab.watch(script, slot, 1, false);
    for (let i = 0; i < 6; i++) await Promise.resolve();
    assert.equal(typeof resolveLocation, "function");
    tab.setSeat("BBB");
    if (detached) { slot.isConnected = false; open = false; open = true; }
    resolveLocation([{ date: 100000, x: 0, y: 0 }, { date: 101000, x: 10, y: 10 }]);
    for (let i = 0; i < 30; i++) await Promise.resolve();
    assert.equal(closed, detached ? 0 : 1);
    assert.equal(launches.length, detached ? 0 : 1);
    if (!detached) assert.equal(launches[0].options.seat, "AAA");
  }
});

test("WATCH can start after the followed driver's retirement while JUMP IN still protects its seat", () => {
  const { ctx, Teams } = load({ Tracks: { LIST: TRACKS }, RealReplay: { create: () => ({ stop() {} }) } });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/core/mat4.js"), "utf8"), ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/race/real-race.js"), "utf8"), ctx);
  const R = vm.runInContext("RealRace", ctx);
  const seated = Teams.LIST.find((t) => !t.custom && !t.legends && t.drivers && t.drivers.length);
  const driver = { num: 1, code: seated.drivers[0].code, teamId: seated.id, dnf: true, lapsDone: 5 };
  const script = { trackId: "monza", laps: 50, drivers: [driver] };
  const director = R.create({});
  assert.equal(director.isWatch(), false, "ordinary solo has no recorded pose owner");
  assert.equal(director.stage(script, { watch: true, traces: {}, seat: driver.code, startLap: 40 }).startLap, 40);
  assert.equal(director.isWatch(), true, "WATCH reserves poses before the replay is armed");
  director.stop();
  assert.equal(director.isWatch(), false, "leaving WATCH releases pose ownership");
  assert.equal(director.stage(script, { seat: driver.code, startLap: 40 }).startLap, 5);
  assert.equal(director.isWatch(), false, "JUMP IN retains ordinary instant replay");
});

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
  // The 2026 Bahrain GP ran at Sepang: OpenF1 names it "Kuala Lumpur" in country "Bahrain". The date window
  // (SeasonCal.REAL_2026) gives the circuit; the country fallback alone would grid it on Sakhir.
  const moved = { country_name: "Bahrain", circuit_short_name: "Kuala Lumpur", date_start: "2026-10-04T07:00:00+00:00", gmt_offset: "08:00:00" };
  assert.equal(load({ SeasonCal: { REAL_2026: realCalendar() } }).D.trackIdFor(moved, TRACKS), "sepang", "by date window");
  assert.equal(D.trackIdFor(moved, TRACKS), "sepang", "no calendar loaded: the venue alias still says Sepang");
  assert.equal(D.trackIdFor({ country_name: "Bahrain", circuit_short_name: "Sakhir", date_start: "2026-02-20T09:00:00+00:00" }, TRACKS), "bahrain",
    "an ordinary Sakhir session stays on Sakhir");
  assert.equal(load({ SeasonCal: { REAL_2026: realCalendar() } }).D.trackIdFor({ country_name: "Italy", circuit_short_name: "Monza", date_start: "2026-10-03T09:00:00+00:00" }, TRACKS), "monza",
    "an exact circuit name beats the date window");
  assert.equal(D.todFor({ date_start: "2026-10-11T12:00:00+00:00", gmt_offset: "08:00:00" }), "night", "Singapore at 20:00 local");
  assert.equal(D.todFor({ date_start: "2026-03-01T15:00:00+00:00", gmt_offset: "03:00:00" }), "dusk", "Bahrain at 18:00 local");
  assert.equal(D.todFor({ date_start: "nope" }), "default");
  assert.equal(D.weatherFor([{ rainfall: 0 }, { rainfall: 0 }]), "dry");
  assert.equal(D.weatherFor([{ rainfall: 1 }, { rainfall: 0 }, { rainfall: 0 }]), "wet");
  assert.equal(D.weatherFor([{ rainfall: 1 }, { rainfall: 1 }, { rainfall: 0 }]), "rain");
  assert.deepEqual(host(D.gridFor([{ driver_number: 1, position: 5, date: "b" }, { driver_number: 1, position: 2, date: "a" }, { driver_number: 4, position: 1, date: "c" }])), { 1: 2, 4: 1 });
});

// A car a lap down finishes one lap short: its crossing row ends at its own last lap. It is RUNNING, not out
// (R2-04); only a retirement stops. fmtLap rounds before it splits (R2-05).
test("a lapped finisher stays on the final lap board as '+N LAP'; a retirement stays OUT; fmtLap never prints :60", () => {
  const { D, ctx } = load();
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/core/mat4.js"), "utf8"), ctx, { filename: "mat4.js" });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/race/real-race.js"), "utf8"), ctx, { filename: "real-race.js" });
  const lap = (n, t) => Array.from({ length: n }, () => t);
  const script = { laps: 5, drivers: [
    { num: 1, code: "WIN", laps: lap(5, 90), pits: [], stints: [], dnf: false },
    { num: 2, code: "SEC", laps: lap(5, 91), pits: [], stints: [], dnf: false },
    { num: 3, code: "LAP", laps: lap(4, 100), pits: [], stints: [], dnf: false },
    { num: 4, code: "DNF", laps: lap(2, 95), lapsDone: 2, pits: [], stints: [], dnf: true } ] };
  const before = host(D.lapBoard(script, 4));
  assert.deepEqual(before.map((r) => r.code), ["WIN", "SEC", "LAP", "DNF"]);
  assert.equal(before.find((r) => r.code === "LAP").down, 0, "still on the lead lap at lap 4");
  const board = host(D.lapBoard(script, 5));
  const lapped = board.find((r) => r.code === "LAP");
  assert.equal(lapped.out, false, "a finisher a lap down is not OUT");
  assert.equal(lapped.down, 1);
  assert.equal(lapped.gap, null, "and its gap is not a time");
  assert.deepEqual(board.map((r) => r.code), ["WIN", "SEC", "LAP", "DNF"], "classified order: lead lap, lapped, then the retirement");
  assert.equal(board.find((r) => r.code === "DNF").out, true);
  assert.equal(host(D.raceBook(script))[4].leader, "WIN");
  assert.equal(D.fmtLap(119.9996), "2:00.000");
  assert.equal(D.fmtLap(59.9996), "1:00.000");
  assert.equal(D.fmtLap(112.263), "1:52.263");
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

// One script per watched session (~45 KB) with no eviction filled the 5 MB origin
// quota after ~115 sessions and starved every save: the cache keeps the newest
// CACHE_MAX, most recently used first, and prunes any written before the index.
test("the script cache keeps only the newest CACHE_MAX sessions, LRU by use", () => {
  const store = new Map();
  const localStorage = { get length() { return store.size; }, key: (i) => [...store.keys()][i] ?? null,
    getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const { D, findTeam } = load({ localStorage });
  const base = host(D.build(rawBaku(), findTeam, TRACKS));
  for (let i = 0; i < 5; i++) store.set(D.CACHE_KEY + "legacy" + i, JSON.stringify(base));   // written before the index existed
  store.set("apex26.settings", "{}");
  const scripts = () => [...store.keys()].filter((k) => k.startsWith(D.CACHE_KEY));
  for (let i = 0; i < 200; i++) {
    D.remember({ ...base, sessionKey: 1000 + i });
    assert.ok(scripts().length <= D.CACHE_MAX, "at most CACHE_MAX scripts after write " + i);
  }
  assert.equal(scripts().length, D.CACHE_MAX);
  assert.ok(!scripts().some((k) => k.includes("legacy")), "pre-index scripts are pruned");
  assert.ok(store.has(D.CACHE_KEY + "1199") && !store.has(D.CACHE_KEY + "1191"));
  // a cache hit is a use: the oldest kept session survives the next write, the next-oldest goes
  assert.equal(host(D.cached(1192)).laps, 51);
  D.remember({ ...base, sessionKey: 2000 });
  assert.ok(store.has(D.CACHE_KEY + "1192"), "the session just read is kept");
  assert.ok(!store.has(D.CACHE_KEY + "1193"), "the least recently used one is evicted");
  assert.equal(store.get("apex26.settings"), "{}", "other keys are untouched");
});

// A DOM stand-in with the surface the tab touches (the data-results.test.mjs shape).
function makeDom() {
  function el(tag, cls, text) {
    const node = {
      tag, cls: cls || null, text: text == null ? null : String(text), children: [], type: null, listeners: {},
      appendChild(c) { node.children.push(c); c.parent = node; return c; },
      insertBefore(c, ref) { const i = node.children.indexOf(ref); node.children.splice(i < 0 ? node.children.length : i, 0, c); c.parent = node; return c; },
      get nextSibling() { const p = node.parent; if (!p) return null; const i = p.children.indexOf(node); return i >= 0 ? p.children[i + 1] || null : null; },
      addEventListener(ev, fn) { (node.listeners[ev] = node.listeners[ev] || []).push(fn); },
      setAttribute(k, v) { node[k] = v; },
      fire(ev) { (node.listeners[ev] || []).forEach((fn) => fn()); },
    };
    return node;
  }
  return { el, clear: (n) => { n.children.length = 0; } };
}

function pendingWatchHarness() {
  const requests = [], launches = [];
  let opened = true;
  const { D } = load({
    // cancelAll: cancel() drops a download's queued requests (a no-op here, so
    // the stale completions below still arrive and must be discarded).
    F1API: { locationData: () => new Promise((resolve) => requests.push(resolve)), cancelAll() {} },
    RealRace: { launch: (script, opts) => { launches.push({ script, opts }); return true; } },
  });
  const dom = makeDom();
  const tab = D.create({ el: dom.el, clear: dom.clear, sel: {},
    ensureSession: () => new Promise(() => {}), isOpen: () => opened,
    close: () => { opened = false; tab.cancel(); } });
  const script = (sessionKey) => ({ sessionKey, laps: 2, t0: Date.parse("2026-01-01T00:00:00Z"),
    drivers: [{ num: 1, lapStart: [null, 0, 60], laps: [null, 60, 60] }] });
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  return { tab, requests, launches, script, flush, reopen: () => { opened = true; } };
}

test("pending WATCH snapshots its seat, camera, session and lap before positions arrive", async () => {
  const h = pendingWatchHarness(), script = h.script(10);
  h.tab.setSeat("AAA"); h.tab.setWatchCamera("heli");
  assert.equal(h.tab.watch(script, null, 2, true), true);
  await h.flush();
  assert.equal(h.requests.length, 1);
  h.tab.setSeat("BBB"); h.tab.setWatchCamera("chase"); h.tab.setStartLap(1);
  h.requests[0]([]);
  await h.flush();
  assert.equal(h.launches.length, 1);
  const launch = h.launches[0];
  assert.equal(launch.script.sessionKey, 10);
  assert.equal(launch.opts.seat, "AAA");
  assert.equal(launch.opts.camera, "heli");
  assert.equal(launch.opts.startLap, 2);
  assert.equal(launch.opts.reel, true);
});

test("cancel/reopen and session replacement discard stale WATCH completions", async () => {
  const h = pendingWatchHarness();
  h.tab.watch(h.script(10), null, 1, false);
  await h.flush();
  h.tab.cancel(); h.reopen();
  h.tab.watch(h.script(11), null, 2, false);
  await h.flush();
  assert.equal(h.requests.length, 2);
  h.requests[0]([]); await h.flush();
  assert.equal(h.launches.length, 0);
  assert.equal(h.tab.traces(), null, "stale positions must not replace current state");
  h.requests[1]([]); await h.flush();
  assert.equal(h.launches.length, 1);
  assert.equal(h.launches[0].script.sessionKey, 11);
  const second = pendingWatchHarness();
  second.tab.watch(second.script(20), null, 1, false);
  await second.flush();
  second.tab.loadRealRace(); // a newly selected session invalidates in-flight work
  second.requests[0]([]); await second.flush();
  assert.equal(second.launches.length, 0);
});

test("the hub cancels pending WATCH immediately when year or Grand Prix changes", () => {
  const dom = makeDom();
  let deps, cancellations = 0, repaints = 0;
  const ctx = vm.createContext({
    Dom: { el: (...args) => { const node = dom.el(...args); node.classList = { toggle() {} }; return node; } },
    F1API: { meetings: () => new Promise(() => {}), sessionsForMeeting: () => new Promise(() => {}) },
    DataSchedule: { create: () => ({}) }, DataStandings: { create: () => ({}) },
    DataResults: { create: () => ({}) }, DataLive: { create: () => ({}) },
    DataTelemetry: { create: () => ({}) }, DataExport: { create: () => ({}) },
    DataRealRace: { create: (d) => { deps = d; return { cancel: () => { cancellations++; } }; } },
  });
  vm.runInContext(fs.readFileSync(new URL("../../js/data/hub.js", import.meta.url), "utf8"), ctx);
  const picker = deps.buildPicker(() => { repaints++; });
  const years = picker.children[0].children;
  const otherYear = years.find((button) => Number(button.text) !== deps.sel.year);
  assert.ok(otherYear);
  otherYear.fire("click");
  assert.equal(cancellations, 1, "cancel occurs before the pending meetings request answers");
  const grandPrix = picker.children[1].children[0].children[1];
  grandPrix.value = "42";
  grandPrix.fire("change");
  assert.equal(cancellations, 2, "cancel occurs before the pending sessions request answers");
  assert.equal(repaints, 0, "new session metadata has not arrived yet");
});
function find(node, pred, out = []) { if (pred(node)) out.push(node); node.children.forEach((c) => find(c, pred, out)); return out; }

// Execute the hub's public open/tab-click path, including its rendered-node
// cache, with deferred WATCH loads rather than asserting source strings.
function hubWatchHarness() {
  const dom = makeDom(), requests = [];
  let cancellations = 0, scheduleLoads = 0;
  function el(...args) {
    const node = dom.el(...args);
    node.classList = { add() {}, toggle() {} };
    node.style = {}; node.dataset = {};
    node.focus = () => {}; node.scrollIntoView = () => {};
    node.querySelector = () => null;
    Object.defineProperty(node, "firstChild", { get: () => node.children[0] || null });
    node.removeChild = (child) => {
      const i = node.children.indexOf(child);
      if (i >= 0) node.children.splice(i, 1);
      child.parent = null;
      return child;
    };
    return node;
  }
  const schedule = el("div", "schedule-result"), root = el("div");
  const ctx = vm.createContext({
    Dom: { el }, navigator: { onLine: true }, queueMicrotask,
    document: { activeElement: null, getElementById: () => null, addEventListener() {} },
    DataSchedule: { create: () => ({ loadSchedule: () => { scheduleLoads++; return Promise.resolve(schedule); } }) },
    DataStandings: { create: () => ({}) }, DataResults: { create: () => ({}) },
    DataLive: { create: () => ({ stopLiveAuto() {}, disarmLiveAuto() {} }) },
    DataTelemetry: { create: () => ({ closeTelemPopup() {} }) },
    DataExport: { create: () => ({}) },
    DataRealRace: { create: () => ({
      cancel: () => { cancellations++; },
      loadRealRace: () => new Promise((resolve) => requests.push(resolve)),
    }) },
  });
  seedLog(ctx);
  vm.runInContext(fs.readFileSync(new URL("../../js/data/hub.js", import.meta.url), "utf8"), ctx);
  const hub = vm.runInContext("DataHub", ctx);
  hub.init(root);
  const panel = find(root, (node) => node.id === "dh-panel")[0];
  const click = (id) => find(root, (node) => node.id === "dh-tab-" + id)[0].fire("click");
  return { hub, panel, requests, click, el, schedule,
    flush: () => new Promise((resolve) => setImmediate(resolve)),
    cancellations: () => cancellations, scheduleLoads: () => scheduleLoads };
}

test("leaving and returning to WATCH rebuilds its cancelled controller while other tabs stay cached", async () => {
  const h = hubWatchHarness();
  h.hub.open("race");
  assert.equal(h.requests.length, 1);
  const first = h.el("div", "first-watch");
  h.requests[0](first); await h.flush();
  assert.equal(h.panel.children[0], first);
  h.click("schedule"); await h.flush();
  assert.ok(h.cancellations() > 0, "leaving WATCH cancels its controller");
  assert.equal(h.panel.children[0], h.schedule);
  h.click("race");
  assert.equal(h.requests.length, 2, "return builds a fresh WATCH controller, not its cancelled cached DOM");
  const fresh = h.el("div", "fresh-watch");
  h.requests[1](fresh); await h.flush();
  assert.equal(h.panel.children[0], fresh);
  h.click("schedule"); await h.flush();
  assert.equal(h.panel.children[0], h.schedule);
  assert.equal(h.scheduleLoads(), 1, "the schedule still uses its normal rendered-node cache");
});

test("a WATCH load completing after leaving cannot repopulate its invalidated tab cache", async () => {
  const h = hubWatchHarness();
  h.hub.open("race");
  h.click("schedule"); await h.flush();
  const stale = h.el("div", "cancelled-watch");
  h.requests[0](stale); await h.flush();
  assert.equal(h.panel.children[0], h.schedule, "the cancelled load cannot replace the active tab");
  h.click("race");
  assert.equal(h.requests.length, 2, "late completion must not become a reusable cached WATCH node");
  assert.notEqual(h.panel.children[0], stale);
  const fresh = h.el("div", "current-watch");
  h.requests[1](fresh); await h.flush();
  assert.equal(h.panel.children[0], fresh);
});

test("the RACE IT tab: the entry list, DRIVE AS, the race lap by lap, and JUMP IN at any lap in any seat", async () => {
  const launches = [];
  const store = new Map();
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  const raw = rawBaku();
  const bodyFor = (url) => {
    if (url.includes("/sessions?")) return [raw.session];
    if (url.includes("/drivers?")) return raw.drivers;
    if (url.includes("/laps?")) return raw.laps;
    if (url.includes("/stints?")) return raw.stints;
    if (url.includes("/pit?")) return raw.pits;
    if (url.includes("/overtakes?")) return raw.overtakes;
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
  const RealRace = { replay: () => null, launch: (script, opts) => { launches.push({ script, opts }); return { ok: true }; },
    // Two seats for the test: Russell and Leclerc; every other driver has no roster seat.
    mapField: (script) => script.drivers.filter((d) => d.num === 63 || d.num === 16).map((d) => ({ driverId: d.teamId + ":0", num: d.num, teamId: d.teamId, di: 0 })) };
  const Teams = { LIST: [] };
  const Tracks = { LIST: TRACKS };
  const { D, findTeam, ctx } = load({ localStorage, F1API, RealRace, Teams, Tracks });
  // The lap board needs the director's cumulative table: the real module, in the same realm.
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/core/mat4.js"), "utf8"), ctx, { filename: "mat4.js" });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/race/real-race.js"), "utf8").replace("const RealRace = (function", "const RealRaceReal = (function").replace("Object.freeze(RealRace);", "RealRace.cumTable = RealRaceReal.cumTable;"), ctx, { filename: "real-race.js" });
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
  for (let i = 0; i < 20; i++) await Promise.resolve();
  const laps = requested.find((r) => r.url.includes("/laps?"));
  assert.ok(laps && laps.opts && laps.opts.cache === false, "the 480 KB laps body is fetched uncached");
  assert.ok(requested.some((r) => r.url.includes("/overtakes?")), "the passes are fetched");
  assert.ok(requested.every((r) => r.url.includes("session_key=11377")), "the RACE session, not the qualifying the picker held");
  const tables = find(tree, (n) => n.tag === "table");
  // The ENTRY LIST (the last table): 22 rows, JUMP IN only on the seated drivers.
  const entry = tables[tables.length - 1];
  const rows = find(entry, (n) => n.tag === "tr" && n.children.some((c) => c.tag === "td"));
  assert.equal(rows.length, 22);
  assert.equal(rows[0].children[0].text, "P1");
  assert.equal(rows[0].children[4].text, "P1");
  assert.equal(rows[21].children[4].text, "DNF L7");
  const pills = find(tree, (n) => n.tag === "button" && /LAPS/.test(n.text || ""));
  assert.deepEqual(pills.map((p) => p.text), ["51 LAPS (FULL)", "26 LAPS", "10 LAPS", "5 LAPS"]);
  const buttons = find(entry, (n) => n.tag === "button" && n.text === "JUMP IN");
  assert.equal(buttons.length, 2, "only the drivers with a roster seat can be raced");
  const noSeat = find(entry, (n) => n.tag === "button" && n.disabled === true);
  assert.equal(noSeat.length, 20);
  assert.equal(noSeat[0].text, "no seat in this roster");
  assert.equal(buttons[1]["aria-label"], "Race as Charles LECLERC");
  // DRIVE AS: the seated drivers, grid order.
  const picker = find(tree, (n) => n.tag === "select")[0];
  assert.deepEqual(picker.children.map((o) => o.text), ["P1 · RUS · George RUSSELL", "P2 · LEC · Charles LECLERC"]);
  const camera = find(tree, (n) => n.tag === "select" && n["aria-label"] === "WATCH CAMERA")[0];
  assert.ok(camera, "WATCH camera has an accessible label");
  assert.deepEqual(camera.children.map((o) => o.value), ["auto", "side", "heli", "tcam", "chase"]);
  assert.equal(camera.children.find((o) => o.selected).value, "auto", "the TV director is the opening WATCH shot (js/race/broadcast.js)");
  // LAP BY LAP (the first table): 51 rows naming the leader, what happened, the fastest, with a JUMP IN (START on lap 1).
  const lapTable = tables[0];
  const lapRows = find(lapTable, (n) => n.tag === "tr" && n.children.some((c) => c.tag === "td"));
  assert.equal(lapRows.length, 51);
  assert.equal(lapRows[0].children[0].text, "L1");
  assert.equal(lapRows[0].children[1].text, "RUS");
  assert.ok(/PIA passed LEC for P2/.test(lapRows[0].children[2].text), lapRows[0].children[2].text);
  assert.ok(/^[A-Z]{3} 1:\d\d\.\d{3}$/.test(lapRows[0].children[3].text), lapRows[0].children[3].text);
  assert.equal(find(lapRows[0], (n) => n.tag === "button")[0].text, "START");
  assert.ok(/STR OUT/.test(lapRows[7].children[2].text), "lap 8: " + lapRows[7].children[2].text);
  assert.ok(/^SAFETY CAR/.test(lapRows[30].children[2].text), "lap 31: " + lapRows[30].children[2].text);
  assert.ok(/pit: /.test(lapRows[30].children[2].text), "the stops under the safety car");
  assert.ok(/NOR OUT/.test(lapRows[35].children[2].text) && /GAS OUT/.test(lapRows[35].children[2].text), "lap 36: " + lapRows[35].children[2].text);
  // Opening a lap builds its classification on demand: gaps, intervals, lap times, sets, the cars out.
  const nested = () => find(lapTable, (n) => n.tag === "table" && n !== lapTable);
  assert.equal(nested().length, 0);
  lapRows[30].fire("click");
  const board = nested()[0];
  assert.ok(board, "the lap-31 board");
  assert.equal(lapRows[30]["aria-expanded"], "true");
  const boardRows = find(board, (n) => n.tag === "tr" && n.children.some((c) => c.tag === "td"));
  assert.equal(boardRows.length, 22);
  assert.equal(boardRows[0].children[0].text, "P1"); assert.equal(boardRows[0].children[1].text, "RUS"); assert.equal(boardRows[0].children[2].text, "");
  assert.ok(/^\+\d+\.\d{3}$/.test(boardRows[1].children[2].text), "P2 carries a gap: " + boardRows[1].children[2].text);
  assert.equal(boardRows[0].children[5].text, "M");
  assert.equal(boardRows[0].children[6].text, "IN", "Russell's in-lap");
  assert.equal(boardRows[21].children[0].text, "OUT");
  assert.equal(boardRows[21].children[1].text, "STR");
  assert.equal(boardRows[21].children[2].text, "L7");
  // JUMP IN on lap 31 as the DRIVE AS pick (Leclerc); the row click does not fire from the button.
  tab.setSeat("LEC");
  find(lapRows[30], (n) => n.tag === "button")[0].fire("click");
  assert.equal(closed, 1, "the hub closes before the race starts");
  assert.equal(launches.length, 1);
  assert.equal(launches[0].opts.seat, "LEC");
  assert.equal(launches[0].opts.laps, 51);
  assert.equal(launches[0].opts.startLap, 31);
  assert.equal(launches[0].script.trackId, "baku");
  assert.ok(store.has(D.CACHE_KEY + "11377"), "the compact script is remembered");
  // An entry-list JUMP IN starts from the grid in that driver's seat; a condensed distance changes only the lap count.
  tab.setDistance(0.2);
  tab.setStartLap(1);
  buttons[0].fire("click");
  assert.equal(launches[1].opts.laps, 10);
  assert.equal(launches[1].opts.startLap, 1);
  assert.equal(launches[1].opts.seat, "RUS");
});

test("the passes, the lap board and the race book read straight off the real timing", () => {
  const { D, findTeam, ctx } = load();
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/core/mat4.js"), "utf8"), ctx, { filename: "mat4.js" });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/race/real-race.js"), "utf8"), ctx, { filename: "real-race.js" });
  const s = D.build(rawBaku(), findTeam, TRACKS);
  assert.equal(s.passes.length, 128, "OpenF1's 160 overtakes dated onto laps, minus the 32 on either side of a car retiring that lap");
  assert.ok(!s.passes.some((p) => p.lap === 36 && (p.over === 4 || p.over === 10)), "the field streaming past Norris and Gasly as they stopped is not passing them");
  const l1 = s.passes.filter((p) => p.lap === 1);
  assert.equal(l1.length, 18, "eighteen passes on the opening lap");
  assert.deepEqual([l1[0].lap, l1[0].by, l1[0].over, l1[0].pos], [1, 81, 16, 2]);
  assert.ok(l1[0].t > 10 && l1[0].t < 20 && l1[0].frac > 0.1 && l1[0].frac < 0.15, "Piastri took P2 thirteen seconds after the lights, an eighth of the way round: " + JSON.stringify(l1[0]));
  assert.equal(s.passes.filter((p) => p.lap === 36).length, 26, "the restart lap after the second safety car, without the two stopped cars");
  const board = host(D.lapBoard(s, 51));
  assert.equal(board[0].code, "RUS"); assert.equal(board[0].pos, 1); assert.equal(board[0].gap, 0);
  assert.equal(board[1].code, "VER");
  const sum = (num) => s.drivers.find((d) => d.num === num).laps.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(board[1].gap - (sum(3) - sum(63))) < 1e-6, "the gap is the difference of the crossing times");
  assert.equal(board.filter((r) => r.out).length, 7);
  assert.equal(board[board.length - 1].code, "STR");
  assert.ok(host(D.lapBoard(s, 31)).find((r) => r.code === "RUS").pitIn, "Russell's in-lap");
  assert.ok(host(D.lapBoard(s, 32)).find((r) => r.code === "RUS").pitOut, "his out-lap");
  const book = host(D.raceBook(s));
  assert.equal(book.length, 51);
  assert.equal(book[30].flag, "SAFETY CAR"); assert.equal(book[29].flag, "");
  assert.deepEqual(book[7].out, ["STR"]);
  assert.equal(book[0].leader, "RUS");
  assert.ok(book[0].fastest && book[0].fastest.t > 100);
  assert.ok(book.every((b) => b.rain === false));
  assert.equal(D.fmtLap(112.263), "1:52.263");
  assert.equal(D.fmtLap(null), "—");
  // forgetRaw drops the ten cached bodies of an unfinished race and leaves other sessions' alone.
  const store = new Map();
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  const { D: D2 } = load({ localStorage });
  store.set("apex26.api.https://api.openf1.org/v1/session_result?session_key=11377", "{}");
  store.set("apex26.api.https://api.openf1.org/v1/laps?session_key=11377", "{}");
  store.set("apex26.api.https://api.openf1.org/v1/weather?session_key=11373", "{}");
  D2.forgetRaw(11377);
  assert.deepEqual([...store.keys()], ["apex26.api.https://api.openf1.org/v1/weather?session_key=11373"]);
});

test("real position retries retain successful cars, report partial failures, and never mix race sessions", async () => {
  const requested = [], progress = [];
  let rejectSecond = true;
  const t0 = Date.parse("2026-09-20T11:00:00Z");
  const F1API = { locationData: async (session, num) => {
    requested.push([session, num]);
    if (num === 2 && rejectSecond) throw new Error("network interrupted");
    return [{ date: t0, x: 100, y: 200 }, { date: t0 + 1000, x: 200, y: 300 }];
  } };
  const { D } = load({ F1API });
  const script = { sessionKey: 7, t0, drivers: [{ num: 1, lapStart: [0], laps: [30] }, { num: 2, lapStart: [0], laps: [30] }] };
  const partial = await D.fetchTraces(script, (done, total) => progress.push([done, total]));
  assert.deepEqual(host(partial.failed), [2]);
  assert.equal(partial.cars[1].length, 6); assert.equal(partial.cars[2].length, 0);
  assert.deepEqual(progress, [[1, 2], [2, 2]], "progress reports stable totals despite a failed car request");
  rejectSecond = false;
  const ready = await D.fetchTraces(script, null, partial);
  assert.deepEqual(requested, [[7, 1], [7, 2], [7, 2]], "retry downloads only the failed driver");
  assert.equal(ready.cars[1], partial.cars[1], "the successful car's positions are retained");
  assert.equal(ready.cars[2].length, 6); assert.deepEqual(host(ready.failed), []);
  await D.fetchTraces({ ...script, sessionKey: 8 }, null, ready);
  assert.deepEqual(requested.slice(-2), [[8, 1], [8, 2]], "another race gets its own positions");
  rejectSecond = true;
  await assert.rejects(D.fetchTraces({ ...script, drivers: [script.drivers[1]] }), /positions did not load/, "a completely failed load cannot masquerade as cached positions");
});

test("position caches refresh when race coverage grows, and never persist unfinished timing", async () => {
  const records = new Map(), requested = [];
  const indexedDB = { open() {
    const rq = {};
    queueMicrotask(() => {
      rq.result = { transaction() {
        const tx = { objectStore: () => ({
          get(key) { const read = {}; queueMicrotask(() => { read.result = records.get(key); read.onsuccess(); }); return read; },
          put(value, key) { records.set(key, value); queueMicrotask(() => tx.oncomplete()); },
        }) }; return tx;
      } }; rq.onsuccess();
    }); return rq;
  } };
  const t0 = Date.parse("2026-10-04T12:00:00Z");
  const script = (laps, complete) => ({ sessionKey: 123, t0, complete,
    drivers: [{ num: 1, lapStart: Array.from({ length: laps }, (_, i) => i * 60), laps: Array(laps).fill(60) }] });
  const { D } = load({ indexedDB, F1API: { locationData: async (_key, num, start, end, options) => {
    requested.push({ num, start, end, options });
    return [{ date: t0, x: 100, y: 200 }, { date: Date.parse(end), x: 200, y: 300 }];
  } } });
  const early = await D.fetchTraces(script(1, false));
  assert.equal(early.cars[1][3], 150);
  assert.equal(records.size, 0, "an unfinished race remains usable but is not persisted");
  // A legacy IndexedDB record is what existing players already have installed.
  records.set("123", { v: D.TRACE_V, sessionKey: 123, t0, cars: early.cars });
  const fullScript = script(10, true), full = await D.fetchTraces(fullScript, null, early);
  assert.equal(requested.length, 2, "neither the legacy DB record nor incomplete in-memory retry wins");
  assert.equal(full.cars[1][3], 690, "the complete race has its complete request window");
  assert.ok(requested.every((r) => r.options.cache === false), "raw HTTP cache cannot reintroduce truncated positions");
  await D.fetchTraces(fullScript);
  assert.equal(requested.length, 2, "a completed matching cache avoids another download");
  await D.fetchTraces(script(11, true));
  assert.equal(requested.length, 3, "a longer window invalidates even a formerly complete record");
  await D.fetchTraces({ ...script(11, true), t0: t0 + 1000 });
  assert.equal(requested.length, 4, "a corrected lights-out timestamp invalidates the old trace clock");
  const withDriver = { ...script(11, true), t0: t0 + 1000 };
  withDriver.drivers.push({ ...withDriver.drivers[0], num: 2 });
  await D.fetchTraces(withDriver);
  assert.deepEqual(requested.slice(-2).map((r) => r.num), [1, 2], "a newly published driver invalidates the old roster");
});

test("WATCH and JUMP IN reject stale in-memory coverage; reopening drops unfinished positions", async () => {
  const calls = [], launches = [], flush = () => new Promise((resolve) => setImmediate(resolve));
  const t0 = Date.parse("2026-10-04T12:00:00Z");
  const { D } = load({ F1API: { locationData: async (_key, _num, _start, end) => {
    calls.push(end); return [{ date: t0, x: 100, y: 200 }, { date: Date.parse(end), x: 200, y: 300 }];
  } }, RealRace: { launch: (_script, options) => { launches.push(options); return true; } } });
  const earlyScript = { sessionKey: 42, t0, complete: false, laps: 1, drivers: [{ num: 1, lapStart: [0], laps: [60] }] };
  const fullScript = { ...earlyScript, complete: true, laps: 10, drivers: [{ num: 1, lapStart: [0], laps: [600] }] };
  const early = await D.fetchTraces(earlyScript);
  const tab = D.create({ isOpen: () => true, close: () => tab.cancel() });
  tab.setTraces(early); tab.jumpIn(fullScript, "AAA");
  assert.equal(launches.at(-1).traces, null, "JUMP IN never seeds cars from the earlier race window");
  tab.watch(fullScript, null, 1, false); await flush();
  assert.equal(calls.length, 2, "WATCH refetches instead of immediately launching stale memory");
  assert.equal(launches.at(-1).traces.cars[1][3], 690);
  tab.watch(fullScript, null, 1, false); await flush();
  assert.equal(calls.length, 2, "matching completed memory still reuses positions");
  tab.setTraces(early); tab.jumpIn(earlyScript, "AAA");
  assert.equal(launches.at(-1).traces, early, "JUMP IN captures usable incomplete positions before closing their view");
  assert.equal(tab.traces(), null, "close/picker lifecycle cannot retain unfinished positions forever");
});


test("race scripts read lane_duration after OpenF1 removes pit_duration", () => {
  const { D, findTeam } = load();
  const raw = rawBaku();
  raw.pits = [{ driver_number: 63, lap_number: 31, lane_duration: 22.2, pit_duration: 99 },
    { driver_number: 63, lap_number: 36, pit_duration: 23.4 }];
  const script = host(D.build(raw, findTeam, TRACKS));
  assert.deepEqual(script.drivers.find((d) => d.num === 63).pitDur, [22.2, 23.4]);
});
