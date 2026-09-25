/* badges.test.mjs — LICENCE BADGES (js/career/badges.js) in a VM.
 *
 * The module is pure rules over facts the game already computed (a classified
 * result, a driven pole, a daily streak) plus one store key. Loaded whole over
 * the REAL GameStore (tests/helpers/seed-store.mjs) and a fake localStorage, so
 * "corrupt storage is safe" is tested against the real read path, not a stub.
 *
 * Run: node --test tests/unit/badges.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { seedStore } from "../helpers/seed-store.mjs";
import { seedHash32 } from "../helpers/seed-hash32.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const host = (v) => JSON.parse(JSON.stringify(v));
const VENUES = ["albert_park", "shanghai", "monza"];

function fakeStorage(init) {
  const m = new Map(Object.entries(init || {}));
  let writes = 0;
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { writes++; m.set(k, String(v)); },
    removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
    map: m,
    writes: () => writes,
  };
}

function load(init, { throwing = false } = {}) {
  const ls = fakeStorage(init);
  const storage = throwing ? { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("SecurityError"); } } : ls;
  const ctx = vm.createContext({
    Math, JSON, Object, Array, String, Number, Date, Map, Set, isNaN, isFinite, parseInt, console,
    localStorage: storage,
    SeasonCal: { REAL_2026: VENUES.map((id) => ({ id })) },
    Tracks: { LIST: VENUES.map((id) => ({ id, name: id.toUpperCase() })) },
  });
  seedLog(ctx);
  seedStore(ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/career/badges.js"), "utf8"), ctx);
  const B = vm.runInContext("Badges", ctx);
  const toasts = [];
  B.setNotifier((labels) => toasts.push([...labels]));
  return { B, ls, toasts, ctx };
}

const win = (over) => Object.assign({ pos: 1, retired: false, finished: true, cuts: 0, penalty: 0, trackId: "monza", fastest: false }, over);

test("the unlock rules read the player's classified result and nothing else", () => {
  const { B } = load();
  assert.deepEqual(host(B.forRace(win())), ["first_win", "podium", "clean_race", "win_monza"]);
  assert.deepEqual(host(B.forRace(win({ pos: 3, cuts: 2 }))), ["podium"], "P3 with cuts: podium, no clean sheet");
  assert.deepEqual(host(B.forRace(win({ pos: 7, fastest: true }))), ["fastest_lap", "clean_race"]);
  assert.deepEqual(host(B.forRace(win({ pos: 1, retired: true }))), [], "a retirement earns nothing");
  assert.deepEqual(host(B.forRace(win({ pos: 9, penalty: 5 }))), [], "a penalty is not a clean sheet");
  assert.deepEqual(host(B.forRace(win({ pos: 12, finished: false, fastest: true }))), [],
    "still running at the flag: classified, but no fastest lap and no clean sheet");
  assert.deepEqual(host(B.forRace(win({ trackId: "kyalami" }))), ["first_win", "podium", "clean_race"],
    "a win off the 2026 calendar is not a venue badge");
  assert.deepEqual(host(B.forRace(null)), []);
  assert.deepEqual(host(B.forStreak(6)), []);
  assert.deepEqual(host(B.forStreak(7)), ["daily_streak"]);
});

test("unlocks persist under apex26.badges and never repeat — no second write, no second toast", () => {
  const { B, ls, toasts } = load();
  assert.deepEqual(host(B.onRace(win(), 1000)), ["first_win", "podium", "clean_race", "win_monza"]);
  const saved = JSON.parse(ls.map.get("apex26.badges"));
  assert.deepEqual(Object.keys(saved.got).sort(), ["clean_race", "first_win", "podium", "win_monza"]);
  assert.equal(saved.got.first_win, 1000);
  assert.deepEqual(toasts, [["FIRST WIN", "PODIUM", "CLEAN SHEET", "MONZA WINNER"]]);
  const writes = ls.writes();
  assert.deepEqual(host(B.onRace(win(), 2000)), [], "the same result again unlocks nothing");
  assert.equal(ls.writes(), writes, "and writes nothing");
  assert.equal(toasts.length, 1, "and toasts nothing");
  assert.equal(JSON.parse(ls.map.get("apex26.badges")).got.first_win, 1000, "the first unlock time is kept");
  assert.deepEqual(host(B.onPole(3000)), ["pole"]);
  assert.deepEqual(host(B.onPole(4000)), []);
  assert.deepEqual(host(B.unlock(["pole", "pole", "fastest_lap", "fastest_lap"], 5000)), ["fastest_lap"], "duplicates in one call count once");
});

test("winning at every 2026 venue unlocks the WORLD TOUR once", () => {
  const { B, toasts } = load();
  B.onRace(win({ trackId: "albert_park" }), 1);
  B.onRace(win({ trackId: "shanghai" }), 2);
  assert.equal(B.summary().venues.count, 2);
  assert.deepEqual(host(B.onRace(win({ trackId: "monza" }), 3)), ["win_monza", "tour_2026"]);
  assert.deepEqual(toasts.at(-1), ["MONZA WINNER", "2026 WORLD TOUR"]);
  const s = B.summary();
  assert.equal(s.venues.count, 3);
  assert.equal(s.venues.total, 3);
  assert.ok(s.rows.find((r) => r.id === "tour_2026").got);
});

test("missing, corrupt or wrong-shape storage reads as no badges and never throws", () => {
  for (const raw of [undefined, "{not json", "null", "[1,2]", "42", '{"got":[1]}', '{"got":{"first_win":"yes","podium":-4,"pole":1}}']) {
    const { B } = load(raw === undefined ? {} : { "apex26.badges": raw });
    const got = host(B.read().got);
    if (raw && raw.includes('"pole":1')) assert.deepEqual(got, { pole: 1 }, "only finite positive timestamps survive");
    else assert.deepEqual(got, {}, String(raw));
    assert.equal(B.summary().held, raw && raw.includes('"pole":1') ? 1 : 0);
    assert.deepEqual(host(B.onRace(win({ pos: 2, trackId: null }), 9)), ["podium", "clean_race"], "and unlocking still works: " + raw);
  }
  // Storage that throws on every access (private mode, blocked site data).
  const { B, toasts } = load({}, { throwing: true });
  assert.deepEqual(host(B.onRace(win({ pos: 3, cuts: 1, trackId: null }))), ["podium"]);
  assert.deepEqual(toasts, [["PODIUM"]]);
  assert.deepEqual(host(B.onRace(win({ pos: 3, cuts: 1, trackId: null }))), [], "the session cache still remembers it");
});

test("a throwing notifier cannot lose the unlock", () => {
  const { B, ls } = load();
  B.setNotifier(() => { throw new Error("banner gone"); });
  assert.deepEqual(host(B.onPole(7)), ["pole"]);
  assert.equal(JSON.parse(ls.map.get("apex26.badges")).got.pole, 7);
});

test("the panel lists every badge with its state", () => {
  const { B } = load();
  B.onPole(1);
  const nodes = {};
  const mk = (tag) => {
    const n = { tag, children: [], attrs: {}, textContent: "", appendChild(c) { this.children.push(c); }, setAttribute(k, v) { this.attrs[k] = v; } };
    Object.defineProperty(n, "textContent", {
      get() { return this._t || ""; },
      set(v) { this._t = v; if (v === "") this.children = []; },
    });
    return n;
  };
  nodes["pm-badges-summary"] = mk("p");
  nodes["pm-badges-list"] = mk("ol");
  const doc = { getElementById: (id) => nodes[id] || null, createElement: mk };
  B.render(doc);
  assert.match(nodes["pm-badges-summary"].textContent, /^1 of 7 badges\. 2026 venues won: 0 of 3\.$/);
  const items = nodes["pm-badges-list"].children;
  assert.equal(items.length, B.DEFS.length);
  assert.equal(items.find((li) => /POLE/.test(li.textContent)).attrs["aria-label"].includes("unlocked"), true);
  assert.equal(items.find((li) => /FIRST WIN/.test(li.textContent)).attrs["aria-label"].includes("locked"), true);
  B.render(doc);
  assert.equal(nodes["pm-badges-list"].children.length, B.DEFS.length, "a repaint replaces, never appends");
});

test("seven consecutive daily-challenge days unlock DAILY DEVOTION through DailyChallenge.record", () => {
  const { B, ctx, toasts } = load();
  seedHash32(ctx);
  ctx.Tracks.SEASON = ctx.Tracks.LIST;
  vm.runInContext(readFileSync(join(ROOT, "js/race/daily-challenge.js"), "utf8"), ctx);
  const D = vm.runInContext("DailyChallenge", ctx);
  const stored = new Map();
  const G = {
    store: { get: (k, d) => (stored.has(k) ? JSON.parse(stored.get(k)) : d), set: (k, v) => stored.set(k, JSON.stringify(v)) },
    ttDistance: 4, flow: "gp", timeTrial: false, startRace() {},
  };
  const d = D.create(G);
  for (let i = 1; i <= 7; i++) {
    const day = "2026-09-0" + i;
    d.select(day, "open");
    d.record(80 + i);
    assert.equal(!!B.read().got.daily_streak, i === 7, "day " + i);
  }
  assert.deepEqual(toasts, [["DAILY DEVOTION"]]);
});
