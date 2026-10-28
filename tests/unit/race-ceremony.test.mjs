/* race-ceremony.test.mjs — RaceCeremony phase machine (js/race/ceremony.js).
 * Pure transitions, eligibility, seek/skip, data-ceremony-phase; no browser.
 * Run: node --test tests/unit/race-ceremony.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/^const\b/gm, "var");

function boot() {
  const results = {
    hidden: true,
    dataset: {},
  };
  const sb = {
    Math, console, Object, Array, Number, String, JSON,
    isFinite, parseFloat, parseInt,
    Log: { info() {}, debug() {}, warn() {}, enabled() { return false; } },
    document: {
      getElementById(id) { return id === "results" ? results : null; },
    },
    ResultsStory: {
      summary(order) {
        const podium = (order || []).filter((c) => c && !c.retired && !c.dsq && c.classified !== false)
          .slice(0, 3).map((c, i) => ({ car: c, pos: i + 1 }));
        return { podium, player: null };
      },
    },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(src("js/race/ceremony.js"), ctx, { filename: absSrc("js/race/ceremony.js") });
  return { R: vm.runInContext("RaceCeremony", ctx), results, sb };
}

function cars(n, extras = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(Object.assign({ code: "C" + i, retired: false, dsq: null, classified: true, finPos: i + 1 }, extras));
  }
  return out;
}

function Gbase(over = {}) {
  return Object.assign({
    session: "race",
    practice: false,
    player: { retired: false, dsq: null },
    cars: cars(5),
    els: { results: null },
    netPlay: { active: () => false },
  }, over);
}

test("eligible: GP on; TT / practice / duel / net / watch off", () => {
  const { R } = boot();
  assert.equal(R.eligible(Gbase()), true);
  assert.equal(R.eligible(Gbase({ session: "tt" })), false);
  assert.equal(R.eligible(Gbase({ session: "quali" })), false);
  assert.equal(R.eligible(Gbase({ practice: true })), false);
  assert.equal(R.eligible(Gbase(), { duel: true }), false);
  assert.equal(R.eligible(Gbase(), { watch: true }), false);
  assert.equal(R.eligible(Gbase({ netPlay: { active: () => true } })), false);
});

test("start → cooldown; seek chain → results shows sheet + data-ceremony-phase", () => {
  const { R, results } = boot();
  const els = { results };
  const G = Gbase({ els });
  const api = R.create(G, { duelOn: () => false, isWatch: () => false });
  assert.equal(api.start(G.cars, {}), true);
  assert.equal(api.status().phase, "cooldown");
  assert.equal(results.hidden, true);
  assert.equal(results.dataset.ceremonyPhase, "cooldown");

  assert.ok(api.seek("parcFerme"));
  assert.equal(api.status().phase, "parcFerme");
  assert.equal(api.status().skipped, true);
  assert.equal(results.dataset.ceremonyPhase, "parcFerme");

  assert.ok(api.seek("podium"));
  assert.equal(api.status().phase, "podium");

  assert.ok(api.seek("results"));
  assert.equal(api.status().phase, "results");
  assert.equal(results.hidden, false);
  assert.equal(results.dataset.ceremonyPhase, "results");
  assert.equal(api.status().live, false);
});

test("skip advances one phase; podium skipped when fewer than 3", () => {
  const { R, results } = boot();
  const G = Gbase({ els: { results }, cars: cars(2) });
  const api = R.create(G);
  assert.equal(api.start(G.cars, {}), true);
  assert.equal(api.status().phase, "cooldown");
  assert.ok(api.skip());
  assert.equal(api.status().phase, "parcFerme");
  assert.ok(api.skip());
  assert.equal(api.status().phase, "results", "no podium without three finishers");
  assert.equal(results.hidden, false);
});

test("retired player skips cooldown into parcFerme", () => {
  const { R, results } = boot();
  const G = Gbase({ els: { results }, player: { retired: true, dsq: null } });
  const api = R.create(G);
  assert.equal(api.start(G.cars, {}), true);
  assert.equal(api.status().phase, "parcFerme");
  assert.equal(api.status().skipped, true);
});

test("ineligible start returns false and leaves idle", () => {
  const { R, results } = boot();
  const G = Gbase({ els: { results }, practice: true });
  const api = R.create(G);
  assert.equal(api.start(G.cars, {}), false);
  assert.equal(api.status().phase, "idle");
  assert.equal(api.status().eligible, false);
  assert.equal(results.hidden, true);
  assert.equal(results.dataset.ceremonyPhase, undefined);
});

test("tick auto-advances parcFerme after DUR", () => {
  const { R, results } = boot();
  const G = Gbase({ els: { results } });
  const api = R.create(G);
  api.start(G.cars, {});
  api.seek("parcFerme");
  api.tick(R.DUR.parcFerme + 0.1);
  assert.equal(api.status().phase, "podium");
});

test("source: finishRace default stays instant; ceremony opt-in wired", () => {
  const apex = fs.readFileSync(path.join(ROOT, "js/agent/apex.js"), "utf8");
  assert.match(apex, /finishRace\(opts\)/);
  assert.match(apex, /ceremony\(arg\)/);
  assert.match(apex, /RaceCeremony\.finishThrough/);
  assert.match(apex, /RaceCeremony\.apexCall/);
});

test("want + afterClassify: armed eligible defers sheet; default shows it", () => {
  const { R, results } = boot();
  const G = Gbase({ els: { results } });
  R.create(G);
  R.want(true);
  assert.equal(R.afterClassify(G, G.cars, {}), true);
  assert.equal(results.hidden, true);
  assert.equal(R.get().status().phase, "cooldown");
  R.resetLive();
  R.want(false);
  assert.equal(R.afterClassify(G, G.cars, {}), false);
  assert.equal(results.hidden, false);
});
