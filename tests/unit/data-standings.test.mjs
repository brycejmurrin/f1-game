/* data-standings.test.mjs — the data hub's STANDINGS tab (js/data/standings.js).
 *
 * The tab renders two columns from F1API.driverStandings() and
 * F1API.constructorStandings() (Jolpica, mapped in js/data/api.js to
 * { pos, points, wins, name, code, team }). It had no test of its own: this
 * loads the real IIFE and the real Dom.el into a Node VM over
 * tests/helpers/mini-dom.mjs, renders fixture JSON, and reads the tree back —
 * row order is the API's order, the gap is to the P1 row, the leader row is
 * marked, a team's two drivers get a head-to-head bar, a near-black team
 * colour falls back to its second colour, and an empty (or null) response
 * reads as the empty-state message instead of throwing or blanking the tab.
 *
 * Run: node --test tests/unit/data-standings.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";
import { seedDom } from "../helpers/seed-dom.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "js/data/standings.js"), "utf8").replace(/^const\b/m, "var");

// Two teams the way js/data/hub.js's findTeam resolves them: by a substring of
// the API's constructor name. BLACK is near-black with a light second colour.
const TEAMS = {
  mclaren: { short: "MCL", color: [1, 0.5, 0] },
  black: { short: "BLK", color: [0.02, 0.02, 0.02], color2: [0.9, 0.9, 0.9] },
};

function boot(drivers, cons, api = null) {
  const dom = makeDom();
  const sb = { Math, Array, Object, Number, String, Promise, console, document: dom.document,
    F1API: api || { driverStandings: () => Promise.resolve(drivers), constructorStandings: () => Promise.resolve(cons) } };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  seedDom(ctx);
  vm.runInContext(SRC, ctx, { filename: "js/data/standings.js" });
  const el = vm.runInContext("Dom.el", ctx);
  const findTeam = (name) => {
    if (!name) return null;
    const n = String(name).toLowerCase();
    return Object.keys(TEAMS).filter((k) => n.includes(k)).map((k) => TEAMS[k])[0] || null;
  };
  const deps = {
    el, findTeam,
    emptyMsg: (text) => el("div", "dh-empty", text),
    teamChip: (code, teamName) => el("span", "dh-codechip", code || "—"),
    cssColor: (c) => "rgb(" + c.map((v) => Math.round(v * 255)).join(",") + ")",
  };
  return vm.runInContext("DataStandings", ctx).create(deps);
}

function find(node, pred, out = []) {
  if (pred(node)) out.push(node);
  (node.children || []).forEach((c) => find(c, pred, out));
  return out;
}
const has = (cls) => (n) => n.classList && n.classList.contains(cls);
const textOf = (row, cls) => { const n = find(row, has(cls))[0]; return n ? n.textContent : null; };
const cols = (wrap) => wrap.children.filter(has("dh-standings-col"));
const rowsIn = (col) => col.children.filter(has("dh-row"));

const DRIVERS = [
  { pos: 1, points: 120, wins: 3, name: "Lando Norris", code: "NOR", team: "McLaren" },
  { pos: 2, points: 101, wins: 1, name: "Oscar Piastri", code: "PIA", team: "McLaren" },
  { pos: 3, points: 88, wins: 0, name: "Test Driver", code: "TST", team: "Black Racing" },
  { pos: 4, points: 40, wins: 0, name: null, code: null, team: "Black Racing" },
];
const CONS = [
  { pos: 1, points: 221, wins: 4, name: "McLaren" },
  { pos: 2, points: 128, wins: 0, name: "Black Racing" },
];

test("driver and constructor rows keep the API's order, gaps read to P1, and the leader row is marked", async () => {
  const wrap = await boot(DRIVERS, CONS).loadStandings();
  assert.ok(has("dh-standings")(wrap), "the tab body is the standings wrapper");
  const [dcol, ccol] = cols(wrap);
  assert.equal(textOf(dcol, "dh-section"), "DRIVERS");
  assert.equal(textOf(ccol, "dh-section"), "CONSTRUCTORS");

  const drows = rowsIn(dcol);
  assert.deepEqual(drows.map((r) => textOf(r, "dh-pos")), ["1", "2", "3", "4"]);
  assert.deepEqual(drows.map((r) => textOf(r, "dh-codechip")), ["NOR", "PIA", "TST", "—"]);
  assert.deepEqual(drows.map((r) => textOf(r, "dh-name")), ["Lando Norris", "Oscar Piastri", "Test Driver", "—"],
    "a nameless entry reads — rather than throwing");
  assert.deepEqual(drows.map((r) => textOf(r, "dh-pts")), ["120", "101", "88", "40"]);
  assert.deepEqual(drows.map((r) => textOf(r, "dh-gap")), [null, "−19", "−32", "−80"], "no gap on the leader");
  assert.deepEqual(drows.map((r) => textOf(r, "dh-wins")), ["3W", "1W", null, null], "zero wins shows no badge");
  assert.deepEqual(drows.map((r) => r.classList.contains("dh-row-lead")), [true, false, false, false]);

  const crows = rowsIn(ccol);
  assert.deepEqual(crows.map((r) => textOf(r, "dh-name")), ["McLaren", "Black Racing"]);
  assert.deepEqual(crows.map((r) => textOf(r, "dh-codechip")), ["MCL", "BLK"], "chip is the resolved team's short name");
  assert.deepEqual(crows.map((r) => textOf(r, "dh-gap")), [null, "−93"]);
  assert.ok(crows.every((r) => r.classList.contains("dh-row-cons")));
});

test("team colour: --row-team from findTeam, a near-black team falls back to color2", async () => {
  const wrap = await boot(DRIVERS, CONS).loadStandings();
  const drows = rowsIn(cols(wrap)[0]);
  assert.equal(drows[0].style.getPropertyValue("--row-team"), "rgb(255,128,0)");
  assert.equal(drows[2].style.getPropertyValue("--row-team"), "rgb(230,230,230)", "near-black uses color2");
  const lone = await boot([{ pos: 1, points: 5, wins: 0, name: "X", code: "XXX", team: "Nobody" }], []).loadStandings();
  assert.equal(rowsIn(cols(lone)[0])[0].style.getPropertyValue("--row-team"), "", "an unknown team sets no colour");
});

test("a team with two drivers gets a head-to-head bar ordered by points", async () => {
  // Hand the drivers in reverse points order: the bar must still put the leader first.
  const wrap = await boot([DRIVERS[3], DRIVERS[2], DRIVERS[1], DRIVERS[0]], CONS).loadStandings();
  const crows = rowsIn(cols(wrap)[1]);
  const labels = (row) => find(row, has("dh-h2h-labels"))[0].children.map((c) => c.textContent);
  assert.deepEqual(labels(crows[0]), ["NOR", "PIA"]);
  assert.deepEqual(labels(crows[1]), ["TST", "—"], "a nameless, codeless driver abbreviates to —");
  const fills = find(crows[0], has("dh-h2h-fill")).map((f) => f.style.width);
  assert.equal(fills.length, 2);
  assert.ok(Math.abs(parseFloat(fills[0]) - 120 / 221 * 100) < 1e-9, fills[0]);
});

test("empty standings read as the empty-state messages, not a blank tab", async () => {
  for (const [d, c] of [[[], []], [null, null]]) {
    const wrap = await boot(d, c).loadStandings();
    const [dcol, ccol] = cols(wrap);
    assert.equal(rowsIn(dcol).length, 0);
    assert.equal(textOf(dcol, "dh-empty"), "No driver standings yet — season hasn't started.");
    assert.equal(textOf(ccol, "dh-empty"), "No constructor standings yet.");
  }
  // Drivers published before constructors: each column decides on its own.
  const half = await boot(DRIVERS.slice(0, 1), []).loadStandings();
  assert.equal(rowsIn(cols(half)[0]).length, 1);
  assert.equal(textOf(cols(half)[1], "dh-empty"), "No constructor standings yet.");
});

// review-race-career-data #17: api.js reads the year off the clock, so from
// January to the opener the tab said "season hasn't started" for ten weeks.
test("an empty current year falls back to last season's FINAL table, labelled as such", async () => {
  const asked = [];
  const byYear = (table) => (year) => { asked.push(year); return Promise.resolve(year === 2026 ? table : []); };
  const api = { season: () => "2027", driverStandings: byYear(DRIVERS), constructorStandings: byYear(CONS) };
  const wrap = await boot(null, null, api).loadStandings();
  const [dcol, ccol] = cols(wrap);
  assert.deepEqual(asked, [undefined, undefined, 2026, 2026], "current year first, then the one before");
  assert.equal(rowsIn(dcol).length, 4);
  assert.equal(rowsIn(ccol).length, 2);
  assert.equal(textOf(dcol, "dh-section"), "DRIVERS — LAST SEASON · 2026 FINAL");
  assert.equal(textOf(ccol, "dh-section"), "CONSTRUCTORS — LAST SEASON · 2026 FINAL");

  // A current table, however short, is never replaced; its headings stay plain.
  asked.length = 0;
  const live = { season: () => "2026", driverStandings: (y) => { asked.push(y); return Promise.resolve(DRIVERS.slice(0, 1)); },
    constructorStandings: () => Promise.resolve([]) };
  const cur = await boot(null, null, live).loadStandings();
  assert.deepEqual(asked, [undefined]);
  assert.equal(textOf(cols(cur)[0], "dh-section"), "DRIVERS");

  // Both years empty, or the fallback fetch failing: the empty-state messages, unlabelled.
  for (const prev of [() => Promise.resolve([]), () => Promise.reject(new Error("offline"))]) {
    const none = { season: () => "2027", driverStandings: (y) => (y == null ? Promise.resolve([]) : prev()),
      constructorStandings: (y) => (y == null ? Promise.resolve([]) : prev()) };
    const w = await boot(null, null, none).loadStandings();
    assert.equal(textOf(cols(w)[0], "dh-section"), "DRIVERS");
    assert.equal(textOf(cols(w)[0], "dh-empty"), "No driver standings yet — season hasn't started.");
  }
});

test("a rival tied on points with the leader shows no gap, not \"−0\"", async () => {
  const tied = [
    { pos: 1, points: 120, wins: 3, name: "Lando Norris", code: "NOR", team: "McLaren" },
    { pos: 2, points: 120, wins: 1, name: "Oscar Piastri", code: "PIA", team: "McLaren" },
    { pos: 3, points: 118, wins: 0, name: "Test Driver", code: "TST", team: "Black Racing" },
  ];
  const wrap = await boot(tied, [
    { pos: 1, points: 221, wins: 4, name: "McLaren" }, { pos: 2, points: 221, wins: 0, name: "Black Racing" },
  ]).loadStandings();
  const [dcol, ccol] = cols(wrap);
  assert.deepEqual(rowsIn(dcol).map((r) => textOf(r, "dh-gap")), [null, null, "−2"]);
  assert.deepEqual(rowsIn(ccol).map((r) => textOf(r, "dh-gap")), [null, null]);
});
