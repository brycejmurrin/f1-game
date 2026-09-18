// The DUEL row's rules (js/race/race-settings.js). One control carries three
// meanings — OFF, ON (the fastest car bumped) and a named legend — and the risk
// is the round trip: a value painted into the row has to come back out of the
// two setters as the same thing, or picking Senna silently races the ordinary
// duel. The inert VM DOM does not build SettingRow children, so painting the
// row asserts nothing; these are the pure functions behind it.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
const HTML = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");

// Arrays built inside the vm realm have that realm's prototype, so a strict
// deepEqual against a literal here fails on identity alone. Compare the shape.
const flat = (opts) => Array.from(opts, (o) => o.join(":"));

function load(files, extra = {}) {
  const ctx = vm.createContext(Object.assign({ console, Object, Math }, extra));
  for (const f of files) vm.runInContext(fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8"), ctx, { filename: f });
  return (name) => vm.runInContext(name, ctx);
}
const withLegends = load(["js/core/mat4.js", "js/data/legends.js", "js/race/race-settings.js"]);
const RS = withLegends("RaceSettings");
const Legends = withLegends("Legends");
// The same module with js/data/legends.js absent — the degradation path.
const RSbare = load(["js/core/mat4.js", "js/race/race-settings.js"])("RaceSettings");

// The wire() handler as js/race/race-settings.js binds it, over a pair of cells.
function pick(RSmod, v) {
  const st = { duel: false, legend: "" };
  st.duel = v !== "off";
  st.legend = (v === "off" || v === "on") ? "" : v;
  return { st, shown: RSmod.duelValue(() => st.duel, () => st.legend) };
}

test("the row still offers OFF and ON, in that order, before any legend", () => {
  const opts = RS.duelOpts();
  assert.deepEqual(flat(opts).slice(0, 2), ["off:OFF", "on:FASTEST RIVAL"]);
  assert.equal(opts.length, 2 + Legends.LIST.length);
});

test("every legend reaches the row, labelled by name", () => {
  const opts = RS.duelOpts();
  for (const l of Legends.LIST) {
    const row = opts.find((o) => o[0] === l.id);
    assert.ok(row, `${l.id} is missing from the DUEL row`);
    assert.equal(row[1], l.name.toUpperCase());
  }
  assert.equal(new Set(opts.map((o) => o[0])).size, opts.length, "option ids collide");
});

test("no legend id can shadow OFF or ON", () => {
  for (const l of Legends.LIST) assert.ok(l.id !== "off" && l.id !== "on", `${l.id} shadows a row value`);
});

test("picking a value paints that same value back", () => {
  for (const [v] of RS.duelOpts()) assert.equal(pick(RS, v).shown, v, `${v} did not round-trip`);
});

test("OFF and ON clear the legend; a legend turns the duel on", () => {
  assert.deepEqual(pick(RS, "off").st, { duel: false, legend: "" });
  assert.deepEqual(pick(RS, "on").st, { duel: true, legend: "" });
  assert.deepEqual(pick(RS, "senna").st, { duel: true, legend: "senna" },
    "a legend must set BOTH cells — duelMode gates the trim, duelLegend picks the driver");
});

test("without the roster the row degrades to the OFF/ON it always was", () => {
  assert.deepEqual(flat(RSbare.duelOpts()), ["off:OFF", "on:FASTEST RIVAL"]);
  assert.equal(RSbare.duelValue(() => false, () => ""), "off");
  assert.equal(RSbare.duelValue(() => true, () => ""), "on");
});

test("a stale legend left in the store still reads as ON, never as OFF", () => {
  // The row is painted from state, not from the option list: a saved legend id
  // that no longer exists must not paint OFF while duelMode is still true.
  assert.equal(RS.duelValue(() => true, () => "nobody"), "nobody");
  assert.equal(RS.duelValue(() => true, null), "on", "no getter at all is the plain duel");
});

test("the duel control opens a searchable rival sheet instead of a mega select", () => {
  assert.doesNotMatch(HTML, /id="rs-duel-sel"/);
  assert.match(HTML, /id="rs-duel-open"[^>]*aria-haspopup="dialog"[^>]*aria-controls="duel-picker"/);
  assert.match(HTML, /<dialog id="duel-picker"[^>]*aria-labelledby="duel-picker-title"/);
  assert.match(HTML, /id="duel-search"[^>]*type="search"[^>]*aria-label="Search duel rivals"/);
  assert.match(HTML, /id="duel-list"[^>]*role="listbox"/);
});

test("duel search matches legends without dropping OFF or fastest-rival choices", () => {
  assert.deepEqual(flat(RS.duelMatches("")), flat(RS.duelOpts()));
  assert.deepEqual(flat(RS.duelMatches("senna")), ["senna:AYRTON SENNA"]);
  assert.deepEqual(flat(RS.duelMatches("fastest")), ["on:FASTEST RIVAL"]);
  assert.deepEqual(flat(RS.duelMatches("off")), ["off:OFF"]);
});

test("race presets are complete, distinct settings bundles", () => {
  const quick = RS.presetValues("quick", 57);
  const weekend = RS.presetValues("weekend", 57);
  const endurance = RS.presetValues("endurance", 57);
  assert.deepEqual({ ...quick }, {
    laps: 5, weather: "dry", mixed: false, time: "day",
    difficulty: "normal", grid: "tier", reliability: "off", tyres: "off",
  });
  assert.equal("caution" in quick, false, "presets leave the sticky caution preference unchanged");
  assert.equal(weekend.laps, 57);
  assert.equal(weekend.grid, "quali");
  assert.equal(weekend.reliability, "real");
  assert.equal(weekend.tyres, "real");
  assert.equal(endurance.laps, 25);
  assert.equal(endurance.mixed, true);
  assert.equal(endurance.difficulty, "hard");
  assert.equal(RS.presetValues("unknown", 57), null);
});

test("championship race settings hide Duel help with the absent Duel row", () => {
  const src = fs.readFileSync(new URL("../../js/race/race-settings.js", import.meta.url), "utf8");
  assert.match(src, /\$\("rs-duel-help"\)\.hidden\s*=\s*tt\s*\|\|\s*champ/,
    "career/season GRID=QUALIFYING must not leave standalone Duel copy visible");
});
