/* #6752 (#6506 rows 3 and 4 (row 5 is held)): per-frame allocation in spotter, race-facts and HUD tyres; output unchanged. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { absSrc } from "../helpers/abs-src.mjs";
import vm from "node:vm";

const load = (file, expr, pre = "") => {
  const ctx = vm.createContext({ console });
  vm.runInContext(pre + fs.readFileSync(new URL("../../" + file, import.meta.url), "utf8") + `;this.M=${expr};`, ctx, { filename: absSrc(file) });
  return ctx;
};

test("spotter: update() builds no closures on the quiet path, state resets as before", () => {
  const ctx = load("js/race/spotter.js", "Spotter");
  let stops = 0;
  const player = { s: 0, x: 0, speed: 50 };
  const G = { state: "race", soundOn: true, player, cars: [player, { s: 1, x: 2 }], track: { total: 1000 }, store: { get: () => false },
    vTop: () => 100, radio: { pack: { stop() { stops++; } }, volume: () => 1 } };
  const sp = ctx.M.create(G);
  // The source holds exactly one arrow per hoisted helper, outside update().
  const src = fs.readFileSync(new URL("../../js/race/spotter.js", import.meta.url), "utf8");
  const upd = src.slice(src.indexOf("function update("), src.indexOf("const key = step("));
  assert.doesNotMatch(upd, /const (dirty|reset) = /);
  for (let i = 0; i < 10000; i++) sp.update(0.016, i % 2 === 0);
  assert.equal(stops, 0);               // nothing ever spoke: nothing to stop
  assert.equal(sp.side(), 0 | sp.side());
});

test("race-facts: with nobody flagged, rank() gives exactly Array.prototype.sort(byRace)'s order (ties, within-1 m progs, retired cars)", () => {
  // The REAL distOf / clockOf / byRace / rank source, cut out of race-facts.js and run over fuzzed fields.
  const src = fs.readFileSync(new URL("../../js/race/race-facts.js", import.meta.url), "utf8");
  const a = src.indexOf("    const distOf = "), b = src.indexOf("      return order;\n    }", src.indexOf("function rank(list)"));
  assert.ok(a > 0 && b > a);
  const body = src.slice(a, b) + "return order; }";
  const mk = new Function("st", "order", "orderedStates", body + "\n;return {byRace, rank};");
  let seed = 11; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  const pick = (n) => Math.floor(rnd() * n);
  let diffs = 0, trials = 0;
  for (let t = 0; t < 3000; t++) {
    const st = new Map(), n = 2 + pick(22), cars = [];
    for (let i = 0; i < n; i++) {
      const finished = false, base = pick(4) * 1000 + pick(4) * 0.5;   // equal and within-1 m progs
      const c = { id: i, prog: base + (rnd() < 0.5 ? 0 : rnd()), lap: 1 + pick(2), finished, retired: rnd() < 0.1,
        finishT: finished && rnd() < 0.5 ? 100 + pick(5) : 0, penalty: rnd() < 0.2 ? pick(3) : 0 };
      st.set(c, { finT: finished ? 100 + pick(5) : 0, finProg: finished && rnd() < 0.5 ? base + pick(2) : null });
      cars.push(c);
    }
    const { byRace, rank } = mk(st, [], []);
    const want = cars.filter((c) => !c.retired).sort(byRace);
    const got = rank(cars).slice();
    trials++;
    if (got.length !== want.length || got.some((c, i) => c !== want[i])) diffs++;
  }
  assert.equal(diffs, 0, diffs + " of " + trials + " fuzzed fields ordered differently");
});

test("race-facts: once a car has finished, rank() still calls the built-in sort", () => {
  const src = fs.readFileSync(new URL("../../js/race/race-facts.js", import.meta.url), "utf8");
  assert.match(src, /if \(anyFin\) order\.sort\(byRace\);/);
});
