// weather-arc-sector-wetness — #6909 phase 1: the road's wetness per arc segment.
//
// frame.wetness is one value (the view car's road), so under a local shower a
// soaked sector ahead read dry until the camera drove in. js/race/weather-arc.js
// now writes frame.wetnessSegs beside it: WeatherArc.WET_SEGS slots along the
// lap, each the along-lap wetness of that segment, lagged at the same 0.8/s as
// frame.wetness. TLX's road reads it (phase 2: tests/unit/tlx-sector-wetness.test.mjs).
//
// The real weather-arc, rain-cells and tyre-model modules in a VM. No browser.
//
// Run: node --test tests/unit/weather-arc-sector-wetness.test.mjs  (npm run test:tooling-fast)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

function boot() {
  const ctx = vm.createContext({ Math, Float32Array, Float64Array, Uint8Array, Array, Object, Number, JSON, WeakMap, Error });
  ctx.window = ctx;
  seedLog(ctx);
  ctx.Career = { inCareer: () => false, hash: (_s, _r, _k, n) => n === "dur" ? 0.99 : 0.1 };
  for (const f of ["js/core/mat4.js", "js/physics/consts.js", "js/physics/tyre-model.js", "js/fx/particles.js", "js/race/rain-cells.js", "js/race/weather-arc.js"])
    vm.runInContext(read(f).replace(/^const\b/gm, "var"), ctx, { filename: absSrc(f) });
  ctx.Particles.init({ drawParticles() {} });
  ctx.GameAudio = { startRain() {}, stopRain() {} };
  const G = {
    raceWeather: "dry", soundOn: false, track: { total: 5800 }, announce() {}, applyRaceSettings() {},
    simSeed: () => 1, raceRound: 0, lapsTarget: 3, raceLaps: 3, state: "race", raceT: 0,
    isWetRoad: () => false, isRaining: () => false, initRainDrops() {},
    netPlay: { active: () => false }, player: { s: 1000, x: 0 }, frame: {},
  };
  const wa = ctx.WeatherArc.create(G, { isTimeTrial: () => false, isQuali: () => false });
  G.trackWetness = () => wa.wetness();
  return { ctx, G, wa };
}

function armLocal(G, wa) {
  for (let dur = 120; dur <= 400 && !(wa.arc && wa.arc.cell); dur += 10) {
    wa.endSession(); G.raceWeather = "dry"; wa.changeable = true;
    wa.plan = { to: "rain", dur };
    wa.startChangeable();
  }
  assert.ok(wa.arc && wa.arc.cell, "fixture: a MIXED plan that draws a local shower");
}

/** Advance the shared race clock to `t`, one physics tick, then the render-side sync, snapped (dt 0 alone holds, #7011). */
function at(G, wa, t) { G.raceT = t; wa.tick(0); wa.syncWetness(0, true); return G.frame.wetnessSegs; }

test("fixed length: WET_SEGS slots, a Float32Array reused frame to frame", () => {
  const { ctx, G, wa } = boot();
  assert.equal(ctx.WeatherArc.WET_SEGS, 24);
  wa.syncWetness(1 / 60);
  const a = G.frame.wetnessSegs;
  assert.ok(a instanceof ctx.Float32Array);
  assert.equal(a.length, ctx.WeatherArc.WET_SEGS);
  wa.syncWetness(1 / 60);
  assert.equal(G.frame.wetnessSegs, a, "no per-frame allocation");
});

test("lap-wide weather fills every segment with the lap value", () => {
  const { G, wa } = boot();
  G.raceWeather = "rain";
  const segs = at(G, wa, 0);
  for (const w of segs) assert.equal(w, Math.fround(wa.wetness()));
  assert.equal(wa.wetness(), 1);
});

test("local shower: a segment ahead reads its own weather, not the view car's (#6909 Done-when)", () => {
  const { G, wa } = boot();
  armLocal(G, wa);
  const len = G.track.total, n = wa.sectorWetness().length;
  // Walk the shower's life; find a moment where some segment is soaked while the view car's road is not.
  let found = null;
  for (let t = 5; t < wa.arc.cell.life && !found; t += 5) {
    const segs = at(G, wa, t);
    const view = G.frame.wetness;
    for (let i = 0; i < n; i++) if (segs[i] > view + 0.3) { found = { t, i, segs, view }; break; }
    if (!found) {
      // Move the camera car around the lap so the shower is somewhere the view is not.
      G.player.s = (G.player.s + len / 7) % len;
    }
  }
  assert.ok(found, "the shower soaks some segment the view car is not on");
  const { i, segs, view } = found;
  // The slot is the surface wetness at that arc position: the same closed-form grid grip reads.
  const s = (i + 0.5) / n * len;
  assert.ok(Math.abs(segs[i] - wa.wetnessAt(s)) < 1e-6, `seg ${i}: ${segs[i]} vs wetnessAt ${wa.wetnessAt(s)}`);
  assert.ok(Math.abs(view - wa.viewWetness()) < 1e-6, "frame.wetness still the view car's road");
  // Not flat: the lap is half-wet, not one uniform value.
  assert.ok(Math.max(...segs) - Math.min(...segs) > 0.3, "segments differ along the lap");
});

test("the segments ramp at the same 0.8/s as frame.wetness", () => {
  const { G, wa } = boot();
  wa.syncWetness(0, true);   // dry, snapped
  G.raceWeather = "rain";
  wa.syncWetness(0.5);    // step = 0.4
  const segs = G.frame.wetnessSegs;
  for (const w of segs) assert.ok(Math.abs(w - 0.4) < 1e-6, `got ${w}`);
  assert.ok(Math.abs(G.frame.wetness - 0.4) < 1e-6);
});

test("a tuner wetness pin pins every segment too", () => {
  const { ctx, G, wa } = boot();
  ctx.LightKnobs = { LT: { wetness: 0.8 } };
  armLocal(G, wa);
  at(G, wa, 30);
  for (const w of G.frame.wetnessSegs) assert.equal(w, Math.fround(0.8));
  assert.equal(G.frame.wetness, 0.8);
});

test("sectorWetness is pure of the arc clock: same t, same values", () => {
  const { G, wa } = boot();
  armLocal(G, wa);
  G.raceT = 40; wa.tick(0);
  const a = Array.from(wa.sectorWetness());
  G.raceT = 80; wa.tick(0);
  G.raceT = 40; wa.tick(0);
  assert.deepEqual(Array.from(wa.sectorWetness()), a);
});
