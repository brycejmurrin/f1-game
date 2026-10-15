/* forecast.test.mjs — the weather FORECAST (js/race/forecast.js) and the engineer calls it drives.
 *
 * What is pinned, and why:
 *  1. The TIMELINE is the weather's own: the event times come off the same closed-form road lag WeatherArc
 *     walks (a drift guard runs the real weather-arc.js beside it), and the rain onset is the arc's `wetIn`.
 *  2. The UNCERTAINTY is honest: the stated time is inside ±max(20 s, 10 % of lead) (never more than half the
 *     lead), never the exact answer far out, converging on the truth monotonically as the event nears, with a
 *     confidence that falls with lead (iRacing's Tempest: uncertainty grows with lead —
 *     https://www.iracing.com/?p=272386; F1's forecaster speaks in timed statements —
 *     https://www.formula1.com/en/latest/features/2016/9/how-weather-forecasting-works-in-f1.html).
 *  3. DETERMINISM: one seed + one arc = one forecast (a replay); the pre-race plan forecast is the green's arc
 *     forecast (friend peers share the host's plan and seed 0).
 *  4. A stable-weather race has NO forecast.
 *  5. The ENGINEER says it at the right distances — an early call, ~2 laps, ~1 lap, "rain is here", "drying —
 *     slicks in ~N laps" — with tread advice matching TyreModel.treadFor, and never twice per bucket.
 *
 * Real js/physics/tyre-model.js, js/race/weather-arc.js, js/race/forecast.js and js/race/engineer.js in a VM.
 * Run: node --test tests/unit/forecast.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => readFileSync(join(ROOT, f), "utf8");

function load() {
  const ctx = vm.createContext({ Math, Object, Array, Number, JSON, isFinite, WeakMap, Error, String });
  ctx.window = ctx;
  seedLog(ctx);
  ctx.Particles = { rainShow() {} };
  ctx.GameAudio = { startRain() {}, stopRain() {} };
  for (const f of ["js/core/mat4.js", "js/physics/consts.js", "js/data/teams.js", "js/car/parts.js",
                   "js/physics/tyre-model.js", "js/race/weather-arc.js", "js/race/forecast.js", "js/race/engineer.js"])
    vm.runInContext(read(f).replace(/^const\b/gm, "var"), ctx, { filename: f });
  return ctx;
}
const ctx = load();
const F = ctx.Forecast, T = ctx.TyreModel, E = ctx.RaceEngineer;
const plain = (v) => JSON.parse(JSON.stringify(v));   // VM-realm arrays/objects → this realm's, for deepEqual

// A WeatherArc on a stub G with a shared race clock — the way game.js ticks it.
function weatherArc(G) {
  Object.assign(G, {
    raceWeather: G.raceWeather || "dry", soundOn: false, state: "race", raceT: 0,
    applyRaceSettings() {}, initRainDrops() {}, announce: G.announce || (() => true),
    isWetRoad: () => wa.wetness() >= 0.25, isRaining: () => wa.wetness() >= 0.72,
  });
  const wa = ctx.WeatherArc.create(G, { isTimeTrial: () => false, isQuali: () => false });
  return wa;
}

// ── 1. the timeline ─────────────────────────────────────────────────────────

test("the timeline is the arc's: dry→rain gives rain then heavy, rain→dry easing then drying, at the tread crossings", () => {
  const G = {};
  const wa = weatherArc(G);
  const a = wa.startArc("dry", "rain", 259);
  const tl = F.timeline(a);
  assert.deepEqual(plain(tl.map((e) => e.kind)), ["rain", "heavy"]);
  assert.equal(tl[0].T, a.wetIn, "rain onset IS WeatherArc's own wetIn");
  // Brute force: the first second the tread changes, sampled on the closed form.
  const firstTread = (arc, pred) => { for (let t = 0; t < 2000; t += 0.25) if (pred(T.treadFor(null, F.wetAt(arc, t)))) return t; return null; };
  assert.ok(Math.abs(tl[1].T - firstTread(a, (x) => x >= 2)) <= 0.25, `heavy at ${tl[1].T}`);
  const d = { from: "rain", to: "dry", dur: 240, t: 0 };
  const dl = F.timeline(d);
  assert.deepEqual(plain(dl.map((e) => e.kind)), ["easing", "drying"]);
  assert.ok(Math.abs(dl[0].T - firstTread(d, (x) => x <= 1)) <= 0.25);
  assert.ok(Math.abs(dl[1].T - firstTread(d, (x) => x <= 0)) <= 0.25);
  // The ramp's own 0.25 is 180 s in; standing water lags it by ~τ_dry (36 s) — the forecast carries the lag.
  assert.ok(dl[1].T > 180 + 30, `the slick crossover ignores the drying lag: ${dl[1].T}`);
  assert.deepEqual(plain(F.timeline({ from: "dry", to: "wet", dur: 200, t: 0 }).map((e) => e.kind)), ["rain"], "a drizzle never turns heavy");
  assert.deepEqual(plain(F.timeline({ from: "dry", to: "fog", dur: 200, t: 0 })), [], "a lateral walk moves no water");
  // A future "storm" stage is heavy rain for the road, and named so.
  const s = F.compute({ arc: { from: "dry", to: "storm", dur: 200, t: 0 }, lapS: 90 });
  assert.deepEqual(plain(s.events.map((e) => e.what)), ["rain starts", "heavy rain/storm"]);
});

test("drift guard: Forecast's road model is WeatherArc's — the real weather-arc.js, sampled through four arcs", () => {
  for (const [from, to, dur] of [["dry", "rain", 259], ["rain", "dry", 180], ["wet", "dry", 130], ["dry", "wet", 300], ["wet", "rain", 150]]) {
    const G = { raceWeather: from };
    const wa = weatherArc(G);
    const a = wa.startArc(from, to, dur);
    for (let t = 0; t <= dur + 200 && wa.arc; t += 7) {
      G.raceT = t; wa.tick(7);
      if (!wa.arc) break;
      assert.ok(Math.abs(wa.wetness() - F.wetAt(a, a.t)) < 1e-9, `${from}→${to} at ${a.t}: ${wa.wetness()} vs ${F.wetAt(a, a.t)}`);
    }
  }
  // …and the constants are WeatherArc's.
  assert.match(read("js/race/weather-arc.js"), new RegExp(`TAU_WET = ${F.TAU_WET}, TAU_DRY = ${F.TAU_DRY}`));
});

// ── 2. uncertainty ──────────────────────────────────────────────────────────

test("the stated time is inside a bound that grows with lead, never exact far out, and converges monotonically", () => {
  const arc = { from: "dry", to: "rain", dur: 420, t: 0 };
  const truth = F.timeline(arc);
  for (let seed = 1; seed <= 60; seed++) {
    let prev = {};
    for (let t = 0; t < truth[1].T; t += 3) {
      arc.t = t;
      const f = F.compute({ arc, lapS: 90, seed, raceT: t });
      for (const e of f.events) {
        const T0 = truth.find((x) => x.kind === e.kind).T, lead = T0 - t, err = e.in - lead;
        const bound = Math.min(0.5 * lead, Math.max(20, 0.1 * lead));
        assert.ok(Math.abs(err) <= bound + 1, `seed ${seed} ${e.kind} lead ${lead}: err ${err} > ±${bound}`);
        if (lead >= 100) assert.ok(Math.abs(err) >= 0.25 * bound - 1, `seed ${seed}: exact answer revealed ${lead} s out`);
        if (prev[e.kind]) {
          assert.ok(e.in <= prev[e.kind].in, `seed ${seed}: the stated lead went UP (${prev[e.kind].in} → ${e.in})`);
          assert.ok(e.confidence >= prev[e.kind].confidence, "confidence rose as the event neared");
        }
        prev[e.kind] = e;
      }
    }
  }
  assert.equal(F.errBound(600), 60);
  assert.equal(F.errBound(100), 20);
  assert.equal(F.errBound(10), 5);
  assert.ok(F.confidenceFor(30) > F.confidenceFor(240) && F.confidenceFor(240) > F.confidenceFor(900));
});

// ── 3. determinism ──────────────────────────────────────────────────────────

test("one seed + one arc = one forecast; seeds differ; the pre-race plan forecast IS the green's", () => {
  const arc = { from: "dry", to: "rain", dur: 300, t: 20 };
  const a = JSON.stringify(F.compute({ arc, lapS: 100, seed: 7, raceT: 20, lap: 1 }));
  assert.equal(JSON.stringify(F.compute({ arc: { ...arc }, lapS: 100, seed: 7, raceT: 20, lap: 1 })), a);
  const ins = new Set();
  for (let s = 0; s < 12; s++) ins.add(F.compute({ arc, lapS: 100, seed: s }).events[0].in);
  assert.ok(ins.size > 3, `the error does not depend on the seed: ${[...ins]}`);
  // Friend race: both peers pass seed 0 and the host's {to, dur}; before the green the plan reads the same.
  const plan = F.compute({ plan: { to: "rain", dur: 300 }, from: "dry", lapS: 100, seed: 0 });
  const green = F.compute({ arc: { from: "dry", to: "rain", dur: 300, t: 0 }, lapS: 100, seed: 0 });
  assert.deepEqual(plain(plan.events), plain(green.events));
  assert.match(plan.text, /^Rain expected in ~[\d.]+ (min|s) \(lap \d+\), heavy from ~lap \d+ — \d+%$/);
});

// ── 4. stable weather ───────────────────────────────────────────────────────

test("no forecast in a stable-weather race; a lateral walk says no rain", () => {
  assert.equal(F.compute({}), null);
  assert.equal(F.compute({ arc: null, plan: null, lapS: 90 }), null);
  const fog = F.compute({ arc: { from: "dry", to: "overcast", dur: 200, t: 10 }, lapS: 90 });
  assert.deepEqual(plain(fog.events), []);
  assert.equal(fog.text, "No rain expected");
  // …and the engineer publishes nothing without an arc.
  const r = race({ arc: null });
  r.run(400);
  assert.equal(r.eng.forecast(), null);
  assert.equal(r.calls.length, 0, r.calls.join(" | "));
});

// ── 5. the engineer ─────────────────────────────────────────────────────────

// One local car lapping in LAP_S on a real WeatherArc + TyreModel, the engineer ticked each second.
const LAP_S = 90, LEN = 4050;
function race({ from = "dry", to = "rain", dur = 420, tread = 0, arc = true, seed = 3, laps = 20 } = {}) {
  const calls = [];
  const G = { raceWeather: from, lapsTarget: laps, track: { total: LEN, def: {} }, cautionLevel: () => 0,
    simSeed: () => seed, netPlay: { active: () => false } };
  G.announce = (msg, d, kind) => { if (!/^WEATHER:/.test(msg)) calls.push({ t: G.raceT, lap: c.lap, msg, kind }); return true; };
  const wa = weatherArc(G);
  Object.defineProperty(G, "weatherArc", { get: () => wa.arc });
  G.trackWetness = () => wa.wetness();
  G.tyres = T.create({ lapsTarget: laps, track: G.track, LAT_MAX: 22, aTop: () => 7, vTop: () => 60, raceWeather: from });
  G.tyres.setLevel("real");
  const eng = E.create(G);
  const c = { human: true, local: true, speed: LEN / LAP_S, lap: 1, consistency: 0.75, accSm: 0, lastLap: 0, prog: 0 };
  G.tyres.fit(c, { id: "t", code: "M", life: 0.88, off: 0, tread, colour: [1, 1, 1] });
  c.lap = 4; c.tyreLap0 = 1; c.tyreTs = T.optTemp(0.88); c.tyreTb = T.optTemp(0.88);
  if (arc) wa.startArc(from, to, dur);
  function run(secs) {
    for (let i = 0; i < secs; i++) {
      G.raceT += 1; c.prog += LEN / LAP_S;
      if (c.prog >= (c.lap - 3) * LEN) { c.lap++; c.lastLap = LAP_S; }
      wa.tick(1);
      c.tyreWear = 0; c.tyreWearF = 0; c.tyreWearR = 0;   // a fresh set: the forecast is the only news
      eng.update(c, 1);
    }
  }
  return { G, wa, eng, c, calls, run, said: () => calls.map((x) => `${x.t}s L${x.lap} ${x.msg}`) };
}

test("dry→rain: an early call, ~2 laps, ~1 lap, then RAIN IS HERE — BOX FOR INTERS; never twice per bucket", () => {
  const r = race({ dur: 1500 });
  const wetIn = r.wa.arc.wetIn;
  r.run(Math.ceil(wetIn) + 30);
  const rain = r.calls.filter((x) => /^RAIN IN/.test(x.msg));
  const n = rain.map((x) => +/^RAIN IN (\d+)/.exec(x.msg)[1]);
  assert.ok(n[0] >= 3, `the first call is the early one: ${r.said().join(" | ")}`);
  assert.equal(rain[0].t, 1, "said at the green");
  assert.match(rain[0].msg, /\(~\d+ MIN, \d+%, HEAVY BY LAP \d+\) — BE READY$/, "the early call carries time, confidence and the heavy phase");
  assert.deepEqual(n.slice(1), [2, 1], `refreshes at ~2 and ~1 lap only: ${r.said().join(" | ")}`);
  // Each refresh lands within its lap of the truth (the stated time is fuzzy, the call is not wrong by a lap).
  for (let i = 1; i < rain.length; i++) assert.ok(Math.abs((wetIn - rain[i].t) / LAP_S - n[i]) <= 1, `${rain[i].msg} at ${rain[i].t}, wet at ${wetIn}`);
  const here = r.calls.find((x) => /^RAIN IS HERE/.test(x.msg));
  assert.ok(here, `no RAIN IS HERE: ${r.said().join(" | ")}`);
  assert.ok(here.t >= wetIn && here.t <= wetIn + 10, `RAIN IS HERE at ${here.t}, the road turned at ${wetIn}`);
  assert.equal(here.msg, "RAIN IS HERE — BOX FOR " + ["SLICKS", "INTERS", "WETS"][T.treadFor(null, r.wa.wetness())], "the tread treadFor wants");
  assert.equal(here.kind, "box");
  assert.equal(r.calls.length, new Set(r.calls.map((x) => x.msg)).size, `a line said twice: ${r.said().join(" | ")}`);
  assert.ok(r.calls.length <= 5, `spam: ${r.said().join(" | ")}`);
  // The accessor: the published forecast is the engineer's, and it is the forecast object.
  const f = r.eng.forecast();
  assert.ok(f && Array.isArray(f.events) && typeof f.text === "string");
  assert.equal(f, F.current());
});

test("a car already on inters hears RAIN IS HERE as confirmation, not a box call", () => {
  const r = race({ to: "wet", dur: 300, tread: 1 });
  r.run(Math.ceil(r.wa.arc.wetIn) + 20);
  const here = r.calls.find((x) => /^RAIN IS HERE/.test(x.msg));
  assert.ok(here, r.said().join(" | "));
  assert.equal(here.msg, "RAIN IS HERE — INTERS ARE RIGHT, KEEP IT ON THE ROAD");
  assert.equal(here.kind, "info");
});

test("rain→dry on full wets: RAIN EASING — INTERS, then IT'S DRYING — SLICKS IN ~N LAPS, then the box call", () => {
  const r = race({ from: "rain", to: "dry", dur: 600, tread: 2 });
  const truth = F.timeline(r.wa.arc);
  r.run(Math.ceil(truth[0].T) + 5);
  const ease = r.calls.filter((x) => /^RAIN EASING — INTERS IN ~\d+ LAPS?/.test(x.msg));
  assert.ok(ease.length >= 1 && ease.length <= 3, r.said().join(" | "));
  // Swap to inters at the easing (what the crew would fit); the slick call follows.
  r.G.tyres.fit(r.c, { id: "i", code: "I", life: 0.88, off: 0, tread: 1, colour: [1, 1, 1] });
  r.c.tyreLap0 = r.c.lap - 3;
  r.c.tyreTs = T.optTemp(0.88); r.c.tyreTb = T.optTemp(0.88);
  r.run(Math.ceil(truth[1].T - truth[0].T) + 20);
  const dry = r.calls.filter((x) => /^IT'S DRYING — SLICKS IN ~\d+ LAPS?/.test(x.msg));
  assert.ok(dry.length >= 1 && dry.length <= 3, `drying calls: ${r.said().join(" | ")}`);
  assert.ok(dry.every((x) => x.t < truth[1].T), "every drying call comes before the crossover");
  assert.ok(r.calls.some((x) => x.msg === "TRACK IS DRY — BOX FOR SLICKS" && x.t >= truth[1].T), `no slick box call: ${r.said().join(" | ")}`);
});

test("wet→rain on inters: HEAVY RAIN IN ~N LAPS — FULL WETS NEXT, then the box call for wets", () => {
  const r = race({ from: "wet", to: "rain", dur: 600, tread: 1 });
  const heavyT = F.timeline(r.wa.arc)[0].T;
  r.run(Math.ceil(heavyT) + 10);
  const h = r.calls.filter((x) => /^HEAVY RAIN IN ~\d+ LAPS? \(.*\) — FULL WETS NEXT$/.test(x.msg));
  assert.ok(h.length >= 1 && h.length <= 3, r.said().join(" | "));
  assert.ok(r.calls.some((x) => x.msg === "RAIN — BOX FOR WETS" && x.t >= heavyT - 1), `no wets call: ${r.said().join(" | ")}`);
});

test("rain before the planned stop names the box lap and the tread treadFor wants, once per bucket", () => {
  const r = race({ dur: 1500 });
  r.c.pitPlan = { lapsAt: [r.c.lap + 12], seq: ["M", "H"] };
  r.run(Math.ceil(r.wa.arc.wetIn) - 2);
  const plan = r.calls.filter((x) => /^RAIN BEFORE THE STOP/.test(x.msg));
  assert.ok(plan.length >= 2 && plan.length <= 3, r.said().join(" | "));
  assert.ok(plan.every((x) => / FOR INTERS \(/.test(x.msg)), "the onset wants inters (treadFor 0.25)");
  // The box lap is the forecast's onset lap: within a lap of the truth from the first call, and it does not
  // wander as the estimate converges (three calls — early, ~2, ~1 — not one per lap).
  const trueLap = 4 + Math.floor(r.wa.arc.wetIn / LAP_S);   // the car starts lap 4 at the line, LAP_S laps
  for (const x of plan) assert.ok(Math.abs(+/BOX LAP (\d+)/.exec(x.msg)[1] - trueLap) <= 1, `${x.msg} vs lap ${trueLap}`);
  assert.match(plan[0].msg, /HEAVY BY LAP \d+\)$/, "the early call carries the heavy phase");
});

test("source: the engineer reads Forecast through a typeof guard, and the lap-count lines key on buckets", () => {
  const src = read("js/race/engineer.js");
  assert.match(src, /typeof Forecast === "undefined"/);
  assert.match(src, /case "rain": case "rainplan": return lapBucket/);
  assert.match(read("tools/manifest.cjs"), /"js\/race\/forecast\.js"/);
});
