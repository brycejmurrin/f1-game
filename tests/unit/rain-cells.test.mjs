// rain-cells — LOCALIZED RAIN: a shower over a window of the lap that drifts
// along it (js/race/rain-cells.js), read through the real WeatherArc
// (js/race/weather-arc.js) on a stub G. The road is a grid of segments, each
// with WeatherArc's exact closed-form lag; the lap mean stays trackWetness().
//
// Research: Spa's microclimate leaves part of the lap wet and part dry
// (grandprix247 preview), F1's forecaster misses a cell by ~500 m
// (formula1.com 2016); docs/notes/WEATHER-ROADMAP-2026-10-14.md.
//
// Run: node --test tests/unit/rain-cells.test.mjs  (npm run test:tooling-fast)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";
import { gameSource } from "../helpers/game-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const TOTAL = 7004;          // Spa-sized lap
const TAU_WET = 8, TAU_DRY = 36;

function boot() {
  const ctx = vm.createContext({ Math, Float64Array, Float32Array, Array, Object, Number, JSON, WeakMap, Error });
  ctx.window = ctx;
  seedLog(ctx);
  ctx.Career = { inCareer: () => false, hash: () => 0.5 };
  ctx.Particles = { rainShow() {}, rainSeed() {}, rainIntensity() {} };
  ctx.GameAudio = { startRain() {}, stopRain() {} };
  for (const f of ["js/core/mat4.js", "js/physics/consts.js", "js/physics/tyre-model.js", "js/race/rain-cells.js", "js/race/weather-arc.js"])
    vm.runInContext(read(f).replace(/^const\b/gm, "var"), ctx, { filename: f });
  let wa = null;
  const G = {
    raceWeather: "dry", soundOn: false, state: "race", raceT: 0, headlessMode: false,
    track: { total: TOTAL, def: { sectors: [0.3, 0.7] } }, player: { s: 0 },
    announce() {}, applyRaceSettings() {}, simSeed: () => 1, raceRound: 0, lapsTarget: 10, raceLaps: 10,
    trackWetness: () => wa.wetness(),
    isWetRoad: () => wa.wetness() >= 0.25, isRaining: () => wa.wetness() >= 0.72, initRainDrops() {},
    frame: { wetness: 0 },
  };
  wa = ctx.WeatherArc.create(G, { isTimeTrial: () => false, isQuali: () => false });
  const at = (t) => { G.raceT = t; wa.tick(0); };
  return { G, wa, RC: ctx.RainCells, TM: ctx.TyreModel, at };
}

/** Arm dry→rain over `dur` at raceT 0 with `cell` (null = global). */
function arm(b, dur, cell) {
  b.G.raceT = 0;
  const a = b.wa.startArc("dry", "rain", dur);
  if (cell) { a.cell = Object.assign({ total: TOTAL }, cell); a.wetIn = undefined; }
  return a;
}
const fracIn = (c, fr, t) => { let d = fr - (c.c0 + c.v * t / TOTAL); d -= Math.round(d); return Math.abs(d) <= c.h; };

test("a local cell wets only its window", () => {
  const b = boot();
  const cell = { c0: 0.5, h: 0.1, v: 0, life: 1e9 };
  arm(b, 120, cell);
  b.at(400);
  let inside = 0, outside = 0;
  for (let i = 0; i < 200; i++) {
    const fr = (i + 0.5) / 200, w = b.wa.wetnessAt(fr * TOTAL);
    if (Math.abs(fr - 0.5) < 0.06) { assert.ok(w > 0.99, `inside the shower at ${fr.toFixed(3)}: ${w}`); inside++; }
    if (Math.abs(fr - 0.5) > 0.16) { assert.equal(w, 0, `outside the shower at ${fr.toFixed(3)}`); outside++; }
  }
  assert.ok(inside > 10 && outside > 100);
  const m = b.wa.wetness();
  assert.ok(m > 0.15 && m < 0.3, `the lap mean is the covered share: ${m}`);
  const rs = b.wa.rainSectors();
  assert.deepEqual([...rs].map((o) => o.raining), [false, true, false], "the shower is over sector 2 only");
});

test("segment wetness lags with the same τ — closed form vs a fine numeric integration through a DRIFTING cell", () => {
  const b = boot();
  const cell = { c0: 0.2, h: 0.12, v: 11, life: 420 };
  const dur = 150;
  arm(b, dur, cell);
  const n = b.RC.SEGS;
  // Euler at 1 ms of dw/dt = (target − w)/τ: under the cell the ramp (wetting τ while it ramps), the
  // destination after it, the dry base outside it and after the shower's life — τ 8 s wetting, 36 s drying.
  // Read through the real arc at segment CENTRES (wetnessAt there is the segment's own value).
  for (const i of [1, 7, 11, 18]) {
    const fr = (i + 0.5) / n;
    let w = 0, t = 0;
    const step = 0.001;
    for (let k = 1; k <= 600000; k++) {
      const cov = t < cell.life && fracIn(cell, fr, t);
      const T = cov ? Math.min(1, t / dur) : 0;
      const tau = cov && t < dur ? TAU_WET : (T >= w ? TAU_WET : TAU_DRY);
      w += (T - w) / tau * step;
      t = k * step;
      if (k % 25000 === 0) {
        b.at(t);
        const got = b.wa.wetnessAt(fr * TOTAL);
        assert.ok(Math.abs(got - w) < 2e-3, `segment ${i} t ${t.toFixed(0)}: closed ${got} vs numeric ${w}`);
      }
    }
  }
  // After a shower passes, a segment it covered dries on TAU_DRY exactly…
  const p = { rs: 0, w1: 1, dur, wOut: 0, cell: { c0: 0.5, h: 0.1, v: 0, life: 300, total: TOTAL }, tauW: TAU_WET, tauD: TAU_DRY };
  const w0 = b.RC.segWet(p, 0.5, 300), w1 = b.RC.segWet(p, 0.5, 330);
  assert.ok(w0 > 0.99, `the shower wet it: ${w0}`);
  assert.ok(Math.abs(w1 - w0 * Math.exp(-30 / TAU_DRY)) < 1e-12, "dries with τ 36 s");
  // …and wets on TAU_WET: a segment under a stationary cell IS the global wetAt ramp.
  const g = boot();
  arm(g, dur, null);
  for (const t of [10, 60, 149, 151, 160]) {   // before the global arc settles and lets go
    g.at(t);
    assert.ok(Math.abs(b.RC.segWet(p, 0.5, t) - g.wa.wetness()) < 1e-12, `covered segment = global ramp at t ${t}`);
  }
});

test("a cell over the WHOLE lap reproduces the old global wetness (lap mean = wetAt)", () => {
  const g = boot(), l = boot();
  arm(g, 200, null);
  arm(l, 200, { c0: 0.3, h: 0.5, v: 7, life: 1e9 });
  for (const t of [0, 1, 5, 20, 77, 150, 199, 200, 201, 230, 260, 400]) {
    g.at(t); l.at(t);
    const gw = g.wa.wetness(), lw = l.wa.wetness();
    // While the global arc lives the two are the same closed form; once it settles (|w − 1| < SETTLE 0.005)
    // it lets go and reads the weather's own 1, so past that the gap is the settle tolerance.
    const tol = g.wa.arc ? 1e-12 : 0.005;
    assert.ok(Math.abs(gw - lw) < tol, `t ${t}: global ${gw} vs whole-lap cell ${lw}`);
    assert.ok(Math.abs(l.wa.wetnessAt(1234) - lw) < 1e-12, "every position reads the lap value");
  }
  // …and with no cell, wetnessAt IS wetness() (the default stays the blanket).
  g.at(90);
  assert.equal(g.wa.wetnessAt(4321), g.wa.wetness());
  assert.equal(g.wa.rainSectors(), null);
});

test("the cell is deterministic per plan (and so per seed); a third of wetting plans go local", () => {
  const { RC, TM } = boot();
  const wetOf = (w) => TM.wetness(w === "storm" ? "rain" : w, null);
  const a = RC.forPlan("dry", "rain", 233, TOTAL, wetOf), b = RC.forPlan("dry", "rain", 233, TOTAL, wetOf);
  assert.deepEqual(a, b, "same plan → same cell");
  let local = 0, n = 0, differ = 0, prev = null;
  for (let dur = 120; dur < 420; dur++) {
    const c = RC.forPlan("dry", "rain", dur, TOTAL, wetOf);
    n++;
    if (c) {
      local++;
      assert.ok(c.h > 0.1 && c.h < 0.22 && Math.abs(c.v) >= 5 && Math.abs(c.v) <= 13 && c.life > dur && c.c0 >= 0 && c.c0 < 1, JSON.stringify(c));
      if (prev && prev.c0 !== c.c0) differ++;
      prev = c;
    }
  }
  const share = local / n;
  assert.ok(share > 0.25 && share < 0.45, `local share ${share.toFixed(2)} ≈ LOCAL_ODDS 0.35`);
  assert.ok(differ > 10, "different plans place different cells");
  assert.equal(RC.forPlan("rain", "dry", 233, TOTAL, wetOf), null, "a drying arc stays global");
  assert.equal(RC.forPlan("dry", "overcast", 233, TOTAL, wetOf), null, "no rain, no cell");
});

test("startChangeable arms the plan's cell, a shower ends and the arc lets go", () => {
  const b = boot();
  const wetOf = (w) => b.TM.wetness(w, null);
  let dur = 120;
  while (!b.RC.forPlan("dry", "rain", dur, TOTAL, wetOf)) dur++;
  b.wa.changeable = true; b.wa.plan = { to: "rain", dur };
  b.G.raceT = 0;
  const a = b.wa.startChangeable();
  assert.ok(a && a.cell, "a local plan arms a cell");
  assert.deepEqual(a.cell, b.RC.forPlan("dry", "rain", dur, TOTAL, wetOf));
  let t = 0, maxSeen = 0;
  while (b.wa.arc && t < 5000) { t += 5; b.at(t); maxSeen = Math.max(maxSeen, b.wa.arc ? b.wa.wetness() : 0); }
  assert.equal(b.wa.arc, null, "the arc ends once the shower has passed and the road dried");
  assert.ok(t > a.cell.life, "not before the shower's life");
  assert.equal(b.G.raceWeather, "dry", "back to the start weather");
  assert.ok(maxSeen > 0.05);
});

test("frame.wetness follows the CAMERA's position under a local shower", () => {
  const b = boot();
  arm(b, 60, { c0: 0.5, h: 0.1, v: 0, life: 1e9 });
  b.at(300);
  b.G.player.s = 0.5 * TOTAL;
  for (let i = 0; i < 200; i++) b.wa.syncWetness(0.1);
  assert.ok(b.G.frame.wetness > 0.95, `in the shower: ${b.G.frame.wetness}`);
  b.G.player.s = 0.05 * TOTAL;
  for (let i = 0; i < 200; i++) b.wa.syncWetness(0.1);
  assert.ok(b.G.frame.wetness < 0.01, `out of it: ${b.G.frame.wetness}`);
  assert.equal(b.wa.viewWetness(), 0);
});

test("source guards: gripMult reads the surface at the car, tread advice the lap mean; manifest order", () => {
  const game = gameSource();
  assert.match(game, /function gripMult\(c\) \{ return TyreModel\.weatherGrip\(c \? \(c\.tread == null \? TyreModel\.treadFor\(raceWeather, trackWetness\(\)\) : c\.tread\) : 0, c && wxArc \? wxArc\.wetnessAt\(c\.s\) : trackWetness\(\)\); \}/);
  assert.match(game, /function trackWetness\(\) \{ return wxArc \? wxArc\.wetness\(\)/);
  const man = read("tools/manifest.cjs");
  assert.ok(man.indexOf('"js/race/rain-cells.js"') >= 0 && man.indexOf('"js/race/rain-cells.js"') < man.indexOf('"js/race/weather-arc.js"'));
  assert.match(read("docs/PHYSICS.md"), /rain-cells\.js/, "PHYSICS.md classifies the per-position wetness read");
});
