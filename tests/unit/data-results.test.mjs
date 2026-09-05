/* data-results.test.mjs — the RESULTS tab renders a session, not a race.
 *
 * The data hub could only ever show the LAST GRAND PRIX: Jolpica's
 * /last/results is the only thing the old tab called, so "how did FP2 at Monza
 * go" had no answer anywhere in the app. RESULTS reads OpenF1's session_result
 * instead, and that endpoint changes SHAPE with the session — `duration` and
 * `gap_to_leader` are scalars for practice, sprint and race and [Q1,Q2,Q3]
 * arrays for qualifying. Every bug in this module is a shape bug, so this
 * drives the real render path with each of the three shapes and reads the
 * cells back out.
 *
 * Run: node --test tests/unit/data-results.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function loadModule(api) {
  const sb = { Math, Array, Object, Number, String, Boolean, isFinite, console, Promise, F1API: api };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/data/results.js"), "utf8"), ctx, { filename: "results.js" });
  return vm.runInContext("DataResults", ctx);
}

// A DOM stand-in with exactly the surface results.js touches. Deliberately not
// jsdom: the assertions are about which text lands in which cell, and a plain
// tree makes that a direct read instead of a query-selector hunt.
function makeDom() {
  function el(tag, cls, text) {
    const node = {
      tag, cls: cls || null, id: null,
      text: text === undefined || text === null ? null : String(text),
      children: [],
      classList: { add(c) { node.cls = node.cls ? node.cls + " " + c : c; } },
      appendChild(c) { node.children.push(c); return c; },
      listeners: {},
      addEventListener(ev, fn) { (node.listeners[ev] = node.listeners[ev] || []).push(fn); },
      setAttribute(k, v) { node[k] = v; },
      fire(ev) { (node.listeners[ev] || []).forEach((fn) => fn()); }
    };
    return node;
  }
  return { el, clear: (n) => { n.children.length = 0; } };
}

function find(node, pred, out = []) {
  if (pred(node)) out.push(node);
  node.children.forEach((c) => find(c, pred, out));
  return out;
}
const hasCls = (n, c) => (n.cls || "").split(" ").indexOf(c) !== -1;
// el() writes textContent, so every cell reads back as a STRING — the
// expectations below quote the numeric columns for that reason.
// Cut bands (one full-width cell) are EXCLUDED here and asserted separately by
// cuts(); folding them into rows() would let a band land in the wrong place
// without any assertion noticing.
function rows(tree) {
  return find(tree, (n) => n.tag === "tr" && n.children.some((c) => c.tag === "td") && !hasCls(n, "dh-cut"))
    .map((tr) => tr.children.map((td) => (td.tag === "td" && td.children.length
      ? td.children.map((c) => c.text).filter(Boolean).join(" ")
      : td.text)));
}
// Each band's text plus the position of the row directly above it, so "the cut
// fell in the right PLACE" is assertable and not just "a band exists".
function cuts(tree) {
  const trs = find(tree, (n) => n.tag === "tr" && n.children.some((c) => c.tag === "td"));
  const out = [];
  trs.forEach((tr, i) => {
    if (!hasCls(tr, "dh-cut")) return;
    const above = trs[i - 1];
    out.push([above ? above.children[0].text : null, tr.children[0].text]);
  });
  return out;
}
function pills(tree) {
  return find(tree, (n) => hasCls(n, "dh-pill")).map((b) => b.text);
}
function clickPill(tree, label) {
  const b = find(tree, (n) => hasCls(n, "dh-pill") && n.text === label)[0];
  assert.ok(b, `no pill labelled ${label}`);
  b.fire("click");
}
function headers(tree) {
  const hr = find(tree, (n) => n.tag === "tr" && n.children.some((c) => c.tag === "th"))[0];
  return hr ? hr.children.map((th) => th.text) : [];
}

const DRIVERS = [
  { num: 63, code: "RUS", name: "George Russell", team: "Mercedes" },
  { num: 16, code: "LEC", name: "Charles Leclerc", team: "Ferrari" },
  { num: 1, code: "NOR", name: "Lando Norris", team: "McLaren" }
];

async function render(meta, results, drivers = DRIVERS) {
  const api = {
    sessionResult: () => Promise.resolve(results),
    sessionDrivers: () => Promise.resolve(drivers)
  };
  const dom = makeDom();
  const mod = loadModule(api);
  const sel = { sessionKey: meta.sessionKey, meta };
  const { loadResults } = mod.create({
    el: dom.el, clear: dom.clear,
    emptyMsg: (t) => dom.el("div", "dh-empty", t),
    spinner: () => dom.el("div", "dh-loading"),
    sel,
    ensureSession: () => Promise.resolve(meta),
    buildPicker: () => dom.el("div", "dh-picker"),
    invalidateOther: () => {},
    teamChip: (code) => dom.el("span", "dh-codechip", code),
    fmtDateTime: (iso) => iso,
    NO_RESULT_MSG: "NOTHING YET"
  });
  const tree = await loadResults();
  // renderBody's fetch settles a microtask later than loadResults resolves.
  await new Promise((r) => setTimeout(r, 0));
  return tree;
}

test("a practice session classifies on best lap, with no points column", async () => {
  const tree = await render(
    { sessionKey: 11355, name: "Practice 2", type: "Practice", circuit: "Monza", country: "Italy", dateStart: "2026-09-04T14:00:00+00:00" },
    [
      { pos: 1, num: 63, laps: 31, points: null, dnf: false, dns: false, dsq: false, duration: 82.559, gap: 0 },
      { pos: 2, num: 16, laps: 29, points: null, dnf: false, dns: false, dsq: false, duration: 82.679, gap: 0.12 }
    ]
  );
  assert.deepEqual(headers(tree), ["POS", "DRIVER", "TEAM", "LAPS", "BEST", "GAP"]);
  const r = rows(tree);
  assert.deepEqual(r[0], ["1", "RUS George Russell", "Mercedes", "31", "1:22.559", "—"]);
  assert.deepEqual(r[1], ["2", "LEC Charles Leclerc", "Ferrari", "29", "1:22.679", "+0.120"]);
});

test("qualifying spreads the [Q1,Q2,Q3] array across three columns", async () => {
  const tree = await render(
    { sessionKey: 11349, name: "Qualifying", type: "Qualifying" },
    [
      { pos: 1, num: 1, laps: 21, points: null, dnf: false, dns: false, dsq: false,
        duration: [72.695, 71.628, 71.163], gap: [0.085, 0, 0] },
      { pos: 2, num: 16, laps: 14, points: null, dnf: false, dns: false, dsq: false,
        duration: [73.4, null, null], gap: [0.7, null, null] }
    ]
  );
  assert.deepEqual(headers(tree), ["POS", "DRIVER", "TEAM", "Q1", "Q2", "Q3"]);
  const r = rows(tree);
  assert.deepEqual(r[0].slice(3), ["1:12.695", "1:11.628", "1:11.163"]);
  // Knocked out in Q1: the empty slots read as dashes, not as "0.000".
  assert.deepEqual(r[1].slice(3), ["1:13.400", "—", "—"]);
});

// The real Zandvoort 2026 qualifying, trimmed to eight cars but keeping every
// property that matters: Q1's order is NOT the classification's order (car 81
// set the fastest Q1 lap and finished 4th), the per-round gap is to THAT
// round's leader, and the field thinned 8 -> 6 -> 5 rather than by any fixed
// count — 2026 keeps 16 through Q1 where 2025 kept 15, which is exactly why
// nothing here may be derived from a cutoff.
const ZANDVOORT = [
  { pos: 1, num: 1,  laps: 21, points: null, dnf: false, dns: false, dsq: false, duration: [72.695, 71.628, 71.163], gap: [0.085, 0.0,   0.0] },
  { pos: 2, num: 63, laps: 20, points: null, dnf: false, dns: false, dsq: false, duration: [72.924, 71.959, 71.265], gap: [0.314, 0.331, 0.102] },
  { pos: 3, num: 12, laps: 21, points: null, dnf: false, dns: false, dsq: false, duration: [73.022, 71.915, 71.296], gap: [0.412, 0.287, 0.133] },
  { pos: 4, num: 81, laps: 19, points: null, dnf: false, dns: false, dsq: false, duration: [72.610, 71.641, 71.305], gap: [0.0,   0.013, 0.142] },
  { pos: 5, num: 44, laps: 18, points: null, dnf: false, dns: false, dsq: false, duration: [72.673, 71.970, 71.494], gap: [0.063, 0.342, 0.331] },
  { pos: 6, num: 10, laps: 17, points: null, dnf: false, dns: false, dsq: false, duration: [73.115, 72.616, null],   gap: [0.505, 0.988, null] },
  { pos: 7, num: 55, laps: 16, points: null, dnf: false, dns: false, dsq: false, duration: [73.574, null,   null],   gap: [0.964, null,  null] },
  { pos: 8, num: 77, laps: 15, points: null, dnf: false, dns: false, dsq: false, duration: [74.371, null,   null],   gap: [1.761, null,  null] }
];
const Z_DRIVERS = [
  { num: 1,  code: "VER", name: "Max Verstappen",  team: "Red Bull Racing" },
  { num: 63, code: "RUS", name: "George Russell",  team: "Mercedes" },
  { num: 12, code: "ANT", name: "Kimi Antonelli",  team: "Mercedes" },
  { num: 81, code: "PIA", name: "Oscar Piastri",   team: "McLaren" },
  { num: 44, code: "HAM", name: "Lewis Hamilton",  team: "Ferrari" },
  { num: 10, code: "GAS", name: "Pierre Gasly",    team: "Alpine" },
  { num: 55, code: "SAI", name: "Carlos Sainz",    team: "Williams" },
  { num: 77, code: "BOT", name: "Valtteri Bottas", team: "Cadillac" }
];
const QUALI_META = { sessionKey: 11349, name: "Qualifying", type: "Qualifying" };

test("the overall qualifying table bands the field where each cut fell", async () => {
  const tree = await render(QUALI_META, ZANDVOORT, Z_DRIVERS);
  assert.deepEqual(pills(tree), ["OVERALL", "Q1", "Q2", "Q3"]);
  // Under P5 (last of the Q3 runners) and under P6 (the only Q2 casualty here),
  // each naming the round the group BELOW it went out in — not the round it
  // never reached, which is the plausible-looking way to get this wrong.
  assert.deepEqual(cuts(tree), [["5", "ELIMINATED IN Q2"], ["6", "ELIMINATED IN Q1"]]);
});

test("a round view re-sorts on THAT round's time, not the classification", async () => {
  const tree = await render(QUALI_META, ZANDVOORT, Z_DRIVERS);
  clickPill(tree, "Q1");
  assert.deepEqual(headers(tree), ["POS", "DRIVER", "TEAM", "Q1", "GAP"]);
  const r = rows(tree);
  // Piastri set the fastest Q1 lap and finished P4; Verstappen took pole from
  // third in Q1. Those two orders differing is the whole point of this view.
  assert.deepEqual(r.map((x) => x[1]), [
    "PIA Oscar Piastri", "HAM Lewis Hamilton", "VER Max Verstappen", "RUS George Russell",
    "ANT Kimi Antonelli", "GAS Pierre Gasly", "SAI Carlos Sainz", "BOT Valtteri Bottas"
  ]);
  // Gap is to THIS round's leader, so the pole-sitter reads +0.085 here.
  assert.deepEqual(r[0].slice(3), ["1:12.610", "—"]);
  assert.deepEqual(r[2].slice(3), ["1:12.695", "+0.085"]);
  assert.deepEqual(cuts(tree), [["6", "ELIMINATED IN Q1"]]);
});

test("a round view lists only the cars that ran that round", async () => {
  const tree = await render(QUALI_META, ZANDVOORT, Z_DRIVERS);
  clickPill(tree, "Q2");
  const r = rows(tree);
  assert.equal(r.length, 6, "the two knocked out in Q1 are not in Q2");
  assert.deepEqual(r.map((x) => x[1]), [
    "VER Max Verstappen", "PIA Oscar Piastri", "ANT Kimi Antonelli",
    "RUS George Russell", "HAM Lewis Hamilton", "GAS Pierre Gasly"
  ]);
  assert.deepEqual(cuts(tree), [["5", "ELIMINATED IN Q2"]]);
});

test("the final round has no cut band and can be left again", async () => {
  const tree = await render(QUALI_META, ZANDVOORT, Z_DRIVERS);
  clickPill(tree, "Q3");
  assert.equal(rows(tree).length, 5);
  assert.deepEqual(cuts(tree), [], "nobody is eliminated in the last round");
  clickPill(tree, "OVERALL");
  assert.deepEqual(headers(tree), ["POS", "DRIVER", "TEAM", "Q1", "Q2", "Q3"]);
  assert.equal(rows(tree).length, 8);
});

// A red-flagged session that never reached Q3 must offer the rounds it RAN.
// Offering an empty Q3 pill is the same class of bug as assuming how many cars
// each round keeps.
test("only the rounds that ran get a pill", async () => {
  const tree = await render(QUALI_META, ZANDVOORT.map((r) => ({
    ...r, duration: [r.duration[0], r.duration[1], null], gap: [r.gap[0], r.gap[1], null]
  })), Z_DRIVERS);
  assert.deepEqual(pills(tree), ["OVERALL", "Q1", "Q2"]);
});

test("a race shows points and formats the winner's distance as a clock", async () => {
  const tree = await render(
    { sessionKey: 11353, name: "Race", type: "Race" },
    [
      { pos: 1, num: 1, laps: 72, points: 25, dnf: false, dns: false, dsq: false, duration: 7484.859, gap: 0 },
      { pos: 2, num: 16, laps: 72, points: 18, dnf: false, dns: false, dsq: false, duration: 7496.395, gap: 11.536 }
    ]
  );
  assert.deepEqual(headers(tree), ["POS", "DRIVER", "TEAM", "LAPS", "TIME", "GAP", "PTS"]);
  const r = rows(tree);
  assert.equal(r[0][4], "2:04:44.859");
  assert.deepEqual(r[0].slice(5), ["—", "25"]);
  assert.deepEqual(r[1].slice(4), ["2:04:56.395", "+11.536", "18"]);
});

// A sprint arrives as session_name "Sprint" with session_type "Race". Reading
// the TYPE alone is right here by luck; reading the NAME alone puts it in the
// practice branch and loses the points column, which is the whole reason a
// sprint result is interesting.
test("a sprint keeps the points column", async () => {
  const tree = await render(
    { sessionKey: 11348, name: "Sprint", type: "Race" },
    [{ pos: 1, num: 63, laps: 24, points: 8, dnf: false, dns: false, dsq: false, duration: 1825.318, gap: 0 }]
  );
  assert.deepEqual(headers(tree), ["POS", "DRIVER", "TEAM", "LAPS", "TIME", "GAP", "PTS"]);
  assert.equal(rows(tree)[0][4], "30:25.318");   // under the hour: no leading "0:"
});

// "Sprint Qualifying" is a THREE-PART session like any other qualifying, so it
// must take the Q1/Q2/Q3 branch even though its name starts with "Sprint" —
// and its rounds are SQ1-SQ3, which is what the session actually ran.
test("sprint qualifying is a qualifying, and its rounds are named SQ", async () => {
  const tree = await render(
    { sessionKey: 11344, name: "Sprint Qualifying", type: "Qualifying" },
    [{ pos: 1, num: 1, laps: 9, points: null, dnf: false, dns: false, dsq: false,
       duration: [70.1, 69.9, 69.5], gap: [0, 0, 0] },
     { pos: 2, num: 63, laps: 8, points: null, dnf: false, dns: false, dsq: false,
       duration: [70.4, 70.2, null], gap: [0.3, 0.3, null] }]
  );
  assert.deepEqual(headers(tree), ["POS", "DRIVER", "TEAM", "SQ1", "SQ2", "SQ3"]);
  assert.deepEqual(pills(tree), ["OVERALL", "SQ1", "SQ2", "SQ3"]);
  assert.deepEqual(cuts(tree), [["1", "ELIMINATED IN SQ2"]]);
});

test("retirements sort last and say why in the time column", async () => {
  const tree = await render(
    { sessionKey: 11353, name: "Race", type: "Race" },
    [
      { pos: null, num: 16, laps: 45, points: 0, dnf: true, dns: false, dsq: false, duration: null, gap: null },
      { pos: 1, num: 63, laps: 72, points: 25, dnf: false, dns: false, dsq: false, duration: 5400, gap: 0 },
      { pos: null, num: 1, laps: 0, points: 0, dnf: false, dns: true, dsq: false, duration: null, gap: null }
    ]
  );
  const r = rows(tree);
  assert.equal(r[0][0], "1", "the classified finisher leads the table");
  assert.deepEqual(r.slice(1).map((x) => x[0]), ["—", "—"]);
  assert.deepEqual(r[1].slice(4, 6), ["DNF", "—"]);
  assert.deepEqual(r[2].slice(4, 6), ["DNS", "—"]);
});

// OpenF1 answers a 200 with {detail:"No results found."} for a session that has
// not published — api.js flattens that to []. It is the ORDINARY state for a
// session that just finished, so it must read as "not yet", never as an error.
test("an unpublished session shows the empty-tab copy, not an error", async () => {
  const tree = await render({ sessionKey: 11361, name: "Race", type: "Race" }, []);
  assert.equal(find(tree, (n) => hasCls(n, "dh-empty")).length, 1);
  assert.equal(find(tree, (n) => hasCls(n, "dh-empty"))[0].text, "NOTHING YET");
});

// api.js resolves the unpublished case with an empty list, so a REJECTED
// session_result can only be the fetch failing. Saying "no results yet" there
// tells the player to stop trying, which is the opposite of the truth.
test("a failed fetch does not read as an unpublished session", async () => {
  const dom = makeDom();
  const meta = { sessionKey: 7, name: "Race", type: "Race" };
  const { loadResults } = loadModule({
    sessionResult: () => Promise.reject(new Error("429")),
    sessionDrivers: () => Promise.resolve(DRIVERS)
  }).create({
    el: dom.el, clear: dom.clear,
    emptyMsg: (t) => dom.el("div", "dh-empty", t),
    spinner: () => dom.el("div", "dh-loading"),
    sel: { sessionKey: 7, meta },
    ensureSession: () => Promise.resolve(meta),
    buildPicker: () => dom.el("div", "dh-picker"),
    invalidateOther: () => {},
    teamChip: (code) => dom.el("span", "dh-codechip", code),
    fmtDateTime: (iso) => iso,
    NO_RESULT_MSG: "NOTHING YET"
  });
  const tree = await loadResults();
  await new Promise((r) => setTimeout(r, 0));
  const msg = find(tree, (n) => hasCls(n, "dh-empty"));
  assert.equal(msg.length, 1);
  assert.notEqual(msg[0].text, "NOTHING YET");
  assert.match(msg[0].text, /Couldn't load/);
});

// /drivers is a separate request and a separate failure. Losing it must cost
// names and colours, not the classification itself.
test("a missing driver list still classifies by car number", async () => {
  const api = {
    sessionResult: () => Promise.resolve([{ pos: 1, num: 44, laps: 20, points: null, dnf: false, dns: false, dsq: false, duration: 80.5, gap: 0 }]),
    sessionDrivers: () => Promise.reject(new Error("429"))
  };
  const dom = makeDom();
  const meta = { sessionKey: 5, name: "Practice 1", type: "Practice" };
  const { loadResults } = loadModule(api).create({
    el: dom.el, clear: dom.clear,
    emptyMsg: (t) => dom.el("div", "dh-empty", t),
    spinner: () => dom.el("div", "dh-loading"),
    sel: { sessionKey: 5, meta },
    ensureSession: () => Promise.resolve(meta),
    buildPicker: () => dom.el("div", "dh-picker"),
    invalidateOther: () => {},
    teamChip: (code) => dom.el("span", "dh-codechip", code),
    fmtDateTime: (iso) => iso,
    NO_RESULT_MSG: "NOTHING YET"
  });
  const tree = await loadResults();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(rows(tree)[0], ["1", "#44 Car 44", "—", "20", "1:20.500", "—"]);
});
