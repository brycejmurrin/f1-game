// weather-arc-rain — the falling rain follows the road's wetness through a
// weather arc, not just the arc's stage flips.
//
// js/race/weather-arc.js walks a CHANGEABLE race from one weather to another;
// the wetness (TyreModel.wetness) ramps linearly over the arc, and the rain is
// meant to follow it: the streak field shows at isWetRoad (≥ 0.25), the storm
// tier and the rain loop start at isRaining (≥ 0.72), the DRIZZLE tier is in
// between. Until 2026-10-04 show and tier were decided only when a stage
// flipped, and the flips land off those lines: rain→dry flips "dry" at 0.333
// (still wet, so it showed), then game.js stopped updating the field below
// 0.25 and Particles kept drawing it, frozen, for the rest of the race;
// dry→rain flips "rain" at 0.667, so the storm ran on drizzle-tier drops.
//
// The real weather-arc.js, tyre-model.js and particles.js in one VM, with G's
// two predicates and initRainDrops copied from game.js (a source guard below
// pins them), driven the way game.js drives them: arc.tick on the physics
// step, then the render path's rainUpdate gate, Particles.update and draw.
// Each arc is sampled at 10 points of the race. No browser.
//
// Run: node --test tests/unit/weather-arc-rain.test.mjs  (npm run test:tooling-fast)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";
import { makeRng } from "../helpers/seeded-fuzz.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const WET = 0.25, STORM = 0.72;   // game.js isWetRoad / isRaining (guarded below)

function boot() {
  const rng = makeRng(0x7a1e);
  const ctx = vm.createContext({ Math: Object.assign(Object.create(Math), { random: () => rng.unit() }),
    Float32Array, Uint8Array, Array, Object, Number, JSON, WeakMap, Error });
  ctx.window = ctx;
  seedLog(ctx);
  // hash("dur") = 0.99 draws the raw 7-minute MIXED walk so the cap is visible.
  ctx.Career = { inCareer: () => false, hash: (_s, _r, _k, n) => n === "dur" ? 0.99 : 0.1 };
  for (const f of ["js/core/mat4.js", "js/physics/consts.js", "js/physics/tyre-model.js", "js/fx/particles.js", "js/race/weather-arc.js"])
    vm.runInContext(read(f).replace(/^const\b/gm, "var"), ctx, { filename: f });
  const P = ctx.Particles, TM = ctx.TyreModel;
  let drawn = 0;
  P.init({ drawParticles: (data, floats, additive) => { if (!additive) drawn += floats / 60; } });
  const audio = { on: false };
  ctx.GameAudio = { startRain() { audio.on = true; }, stopRain() { audio.on = false; } };
  let wa = null;
  const wetness = () => TM.wetness(G.raceWeather, wa && wa.arc);
  const G = {
    raceWeather: "dry", soundOn: true, track: null, announce() {}, applyRaceSettings() {},
    simSeed: () => 1, raceRound: 0, lapsTarget: 3, raceLaps: 3,
    isWetRoad: () => wetness() >= WET,
    isRaining: () => wetness() >= STORM,
    initRainDrops: () => P.rainSeed(G.isWetRoad() && !G.isRaining()),
  };
  wa = ctx.WeatherArc.create(G, { isTimeTrial: () => false, isQuali: () => false });
  const eye = [0, 1.2, 0];
  // One frame: the physics tick, then game.js render's rain gate, update, draw.
  function frame(dt) {
    wa.tick(dt);
    if (G.isWetRoad() && P.rainActive()) P.rainUpdate(dt, eye, G.isRaining());
    P.update(dt);
    drawn = 0;
    P.draw();
    return drawn;
  }
  return { G, wa, P, audio, frame, wetness };
}

// What the frame should show at wetness w: no rain, the drizzle tier
// (rainCount 360 × drizzleCount 0.3 = 108 seeded) or the storm (360).
const want = (w) => (w >= STORM ? "storm" : w >= WET ? "drizzle" : "none");
const saw = (drops) => (drops === 0 ? "none" : drops > 200 ? "storm" : drops >= 60 && drops <= 108 ? "drizzle" : `?${drops}`);

function walk(from, to) {
  const { G, wa, audio, frame, wetness } = boot();
  G.raceWeather = from;
  wa.setWeatherLive(from);        // the race starts on `from` (applyRaceSettings does the same)
  const DUR = 100, DT = 0.1;
  wa.startArc(from, to, DUR);
  const rows = [];
  let t = 0;
  for (const f of [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95, 1.1]) {
    let drops = 0;
    while (t < f * DUR - 1e-9) { drops = frame(DT); t += DT; }
    const w = wetness();
    rows.push({ f, w: +w.toFixed(3), weather: G.raceWeather, want: want(w), saw: saw(drops), audio: audio.on });
  }
  return rows;
}

for (const [from, to] of [["rain", "dry"], ["dry", "rain"], ["overcast", "rain"], ["rain", "overcast"], ["fog", "rain"], ["rain", "fog"]]) {
  test(`${from} → ${to}: the rain shown, its tier and the rain loop follow wetness at every point of the race`, () => {
    const rows = walk(from, to);
    for (const r of rows) {
      assert.equal(r.saw, r.want, `f=${r.f} (${r.weather}, wetness ${r.w}): drew ${r.saw}, wetness says ${r.want}\n${JSON.stringify(rows, null, 1)}`);
      assert.equal(r.audio, r.w >= STORM, `f=${r.f} wetness ${r.w}: the rain loop is ${r.audio ? "on" : "off"}`);
    }
    assert.equal(rows[rows.length - 1].weather, to, "the arc lands on its target");
    assert.ok(new Set(rows.map((r) => r.want)).size >= 2, "the walk crosses at least one line");
  });
}

test("a field nobody updates is not drawn: the frozen box a drying race left behind", () => {
  const { P } = boot();
  let drawn = 0;
  P.init({ drawParticles: (d, floats, additive) => { if (!additive) drawn += floats / 60; } });
  P.rainSeed(false);
  P.rainShow(true);
  P.rainUpdate(1 / 60, [0, 1, 0], true);
  P.draw();
  assert.ok(drawn > 200, `an updated storm draws (${drawn})`);
  drawn = 0;
  P.draw();   // game.js stopped calling rainUpdate (the road dried below 0.25)
  assert.equal(drawn, 0, "no rainUpdate this frame → no streaks at a stale eye");
});

test("source guard: the VM's predicates and drizzle seed are game.js's, and the render gate is unchanged", () => {
  const game = read("js/game.js");
  assert.match(game, /function isWetRoad\(\) \{ return trackWetness\(\) >= 0\.25; \}/);
  assert.match(game, /function isRaining\(\) \{ return trackWetness\(\) >= 0\.72; \}/);
  assert.match(game, /function trackWetness\(\) \{ return TyreModel\.wetness\(raceWeather, wxArc && wxArc\.arc\); \}/);
  assert.match(game, /Particles\.rainSeed\(isWetRoad\(\) && !isRaining\(\)\);/);
  assert.match(game, /if \(isWetRoad\(\) && Particles\.rainActive\(\)\) Particles\.rainUpdate\(dt, camEye, isRaining\(\)\);/);
});

test("MIXED plan duration finishes inside a short race; a host plan is not recapped", () => {
  const { G, wa } = boot();
  G.track = { total: 3300 };   // street-length 3-lap (~3.5 min at 48 m/s)
  const p = wa.planFor();
  const raw = 120 + Math.floor(0.99 * 300);   // 417 — the uncapped seed draw
  assert.equal(raw, 417);
  assert.ok(p.dur < raw, "3-lap MIXED must not keep a ~7 min walk, got " + p.dur);
  assert.ok(p.dur >= 90 && p.dur <= Math.floor(3 * (3300 / 48) * 0.72),
    "cap is 72 % of estimated race time, got " + p.dur);
  wa.changeable = true;
  wa.plan = { to: "rain", dur: 400 };
  const armed = wa.startChangeable();
  assert.equal(armed.dur, 400, "lobby/host seconds stay as agreed");
});

// G.endWeatherSession is the agent's race()/tt() pre-start call: it restores the
// chip's weather like endSession, but a plan set for the race about to start
// (a host's, a test's) survives it — a MIXED race() with wxArcPlan {to:"fog"}
// armed the seed's target instead (race-settings-vm on 2026-10-10).
test("endSession(true) restores the chip's weather but keeps the plan; endSession() drops it", () => {
  const { G, wa } = boot();
  G.track = { total: 5800 }; G.netPlay = { active: () => false };
  wa.changeable = true;
  wa.plan = { to: "fog", dur: 200 };
  assert.equal(wa.startChangeable().to, "fog");
  G.raceWeather = "wet";   // the arc walked off dry
  wa.endSession(true);
  assert.equal(G.raceWeather, "dry", "the chip's pick is back");
  assert.equal(wa.arc, null, "the half-walked arc is dropped");
  assert.deepEqual({ ...wa.plan }, { to: "fog", dur: 200 }, "the plan for the next start survives");
  assert.equal(wa.startChangeable().to, "fog", "and the next start arms it");
  wa.endSession();
  assert.equal(wa.plan, null, "the flag / a quit to the menu still forgets a solo plan");
});

test("source guard: MIXED plans go through capPlanDur; host wxArc.dur does not", () => {
  const src = read("js/race/weather-arc.js");
  assert.match(src, /function capPlanDur\(dur\)/);
  assert.match(src, /const dur = capPlanDur\(120 \+ Math\.floor\(r\("dur"\) \* 300\)\);/);
  assert.match(src, /never recapped/);
});
