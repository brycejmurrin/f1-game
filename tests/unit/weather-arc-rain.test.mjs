// Falling rain, audio and particle density follow atmospheric intensity.
// Surface wetness remains lagged for grip, spray and tyre strategy.
// Real weather-arc, tyre-model and particles modules run together in a VM.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";
import { makeRng } from "../helpers/seeded-fuzz.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");
const WET = 0.25, STORM = 0.72;   // component-fixture contract; real game coverage below

function boot() {
  const rng = makeRng(0x7a1e);
  const ctx = vm.createContext({ Math: Object.assign(Object.create(Math), { random: () => rng.unit() }),
    Float32Array, Uint8Array, Array, Object, Number, JSON, WeakMap, Error });
  ctx.window = ctx;
  seedLog(ctx);
  // hash("dur") = 0.99 draws the raw 7-minute MIXED walk so the cap is visible.
  ctx.Career = { inCareer: () => false, hash: (_s, _r, _k, n) => n === "dur" ? 0.99 : 0.1 };
  for (const f of ["js/core/mat4.js", "js/physics/consts.js", "js/physics/tyre-model.js", "js/fx/particles.js", "js/race/wx-hash.js", "js/race/rain-cells.js", "js/race/weather-arc.js"])
    vm.runInContext(read(f).replace(/^const\b/gm, "var"), ctx, { filename: absSrc(f) });
  const P = ctx.Particles, TM = ctx.TyreModel;
  let drawn = 0;
  P.init({ drawParticles: (data, floats, additive) => { if (!additive) drawn += floats / 60; } });
  const audio = { on: false };
  ctx.GameAudio = { startRain() { audio.on = true; }, stopRain() { audio.on = false; } };
  let wa = null;
  const wetness = () => wa.wetness ? wa.wetness() : TM.wetness(G.raceWeather, wa && wa.arc);   // game.js trackWetness (guarded below); the fallback is the pre-2026-10-14 lerp
  const G = {
    raceWeather: "dry", soundOn: true, track: null, announce() {}, applyRaceSettings() {},
    simSeed: () => 1, raceRound: 0, lapsTarget: 3, raceLaps: 3,
    isWetRoad: () => wetness() >= WET,
    isRaining: () => wetness() >= STORM,
    initRainDrops: () => P.rainSeed(!(wa && wa.arc) && G.isWetRoad() && !G.isRaining()),
  };
  wa = ctx.WeatherArc.create(G, { isTimeTrial: () => false, isQuali: () => false });
  const eye = [0, 1.2, 0];
  // One frame: the physics tick, then game.js render's rain gate, update, draw.
  function frame(dt) {
    wa.tick(dt);
    const rain = wa.viewRainfall();
    if (P.rainActive()) P.rainUpdate(dt, eye, rain);
    P.update(dt);
    drawn = 0;
    P.draw();
    return drawn;
  }
  return { G, wa, P, TM, audio, frame, wetness };
}

// What the frame should show at wetness w: no rain, the drizzle tier
// (rainCount 360 × drizzleCount 0.3 = 108 seeded) or the storm (360).
const want = (rain) => rain > 0.01;

function walk(from, to) {
  const { G, wa, audio, frame, wetness } = boot();
  G.raceWeather = from;
  wa.setWeatherLive(from);        // the race starts on `from` (applyRaceSettings does the same)
  const DUR = 100, DT = 0.1;
  wa.startArc(from, to, DUR);
  const rows = [];
  let t = 0;
  for (const f of [0.001, 0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95, 1.1, 1.5, 2, 3, 4]) {   // past dur: a drying road settles laps later
    let drops = 0;
    while (t < f * DUR - 1e-9) { drops = frame(DT); t += DT; }
    const w = wetness();
    const rain = wa.viewRainfall();
    rows.push({ f, w: +w.toFixed(3), rain, weather: G.raceWeather, want: want(rain), saw: drops > 0, audio: audio.on });
  }
  return { rows, wa };
}

for (const [from, to] of [["rain", "dry"], ["dry", "rain"], ["overcast", "rain"], ["rain", "overcast"], ["fog", "rain"], ["rain", "fog"]]) {
  test(`${from} → ${to}: falling rain and audio follow the atmosphere independently of surface water`, () => {
    const { rows, wa } = walk(from, to);
    for (const r of rows) {
      assert.equal(r.saw, r.want, `f=${r.f} (${r.weather}, wetness ${r.w}): rain ${r.rain}\n${JSON.stringify(rows, null, 1)}`);
      assert.equal(r.audio, r.want, `f=${r.f} rain ${r.rain}: the rain loop is ${r.audio ? "on" : "off"}`);
    }
    assert.equal(rows[rows.length - 1].weather, to, "the arc lands on its target");
    assert.equal(wa.arc, null, "and ends once the road has settled");
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

test("real game: road thresholds, drizzle seeding and rendered rain retain separate weather owners", async (t) => {
  const g = await createGame({ track: "monza", carMeshes: false });
  const A = g.apex, G = g.G, P = vm.runInContext("Particles", g.ctx);
  // The physics harness's inert renderer returns [] here; real rendering
  // consumes six planes. Use the same shared math as all shipped backends.
  G.gfx.makeFrustumPlanes = vm.runInContext("Frustum", g.ctx).makeFrustumPlanes;
  let drawn = 0;
  // Capture the real particle renderer's output; do not replace rainSeed,
  // rainUpdate, weather predicates, WeatherArc or the game's render function.
  P.init({ drawParticles(_data, floats, additive) { if (!additive) drawn += floats / 60; } });
  let presents = 0;
  const present = G.gfx.present.bind(G.gfx);
  G.gfx.present = (...args) => { presents++; return present(...args); };
  const paint = () => {
    const before = presents;
    drawn = 0; A.snapCam(true);
    // snapCam's public paint path tolerates renderer errors; require a full
    // present so an aborted frame cannot pass the no-rain case accidentally.
    assert.equal(presents, before + 1, "the real render reaches present");
    return drawn;
  };
  const arc = (from, to, dur) => {
    A.weatherArc(null); A.weather(from); A.weatherArc(from, to, dur);
    return G.weatherArc;
  };
  // The facade deliberately permits seeking the shared weather clock. Locate
  // a surface state by observing the real model, not copying its lag equation.
  const surface = (target) => {
    const live = arc("dry", "rain", 120);
    let lo = 0, hi = 240;
    for (let i = 0; i < 45; i++) {
      live.t = (lo + hi) / 2;
      if (G.trackWetness() < target) lo = live.t; else hi = live.t;
    }
    live.t = (lo + hi) / 2;
    assert.ok(Math.abs(G.trackWetness() - target) < 1e-9, "the real surface reaches the requested boundary fixture");
  };
  try {
    await t.test("grip's wet-road predicate crosses 0.25 even while the weather chip remains dry", () => {
      for (const [wetness, wet] of [[0.249, false], [0.251, true]]) {
        surface(wetness);
        assert.equal(G.raceWeather, "dry", "the chip is deliberately not the wetness oracle");
        assert.equal(G.isWetRoad(), wet, `surface ${wetness}`);
      }
    });
    await t.test("the rendered lightning clock crosses the real 0.72 surface gate", () => {
      A.lightTune({ lightning: 1 });
      G.raceT = 100;
      for (const [wetness, raining] of [[0.719, false], [0.721, true]]) {
        surface(wetness);
        G._ltBase = { ambientSky: [0.2, 0.2, 0.2], ambientGround: [0.1, 0.1, 0.1], exposure: 1 };
        G._ltFlash = 0; G._ltNextT = 99;
        paint();
        assert.equal(G._ltNextT, raining ? 100 : 99,
          `surface ${wetness}: only an eligible rain frame advances the lightning window`);
      }
    });
    await t.test("initRainDrops keeps static wet drizzle sparse but reserves the full pool for live arcs", () => {
      const seeded = () => {
        A.lightTune({ rainCount: 100, drizzleCount: 0.3 });
        // Six random calls per drop: x/y/z, speed, length, alpha. Keep the
        // eye-relative offsets (4.5, 0, 4.5): dist=sqrt(40.5)>2, and a falling
        // streak cannot align with this horizontal ray. Alpha is 0.415 before
        // the real opacity multiplier. This counts the pool, not random culls.
        const gameMath = vm.runInContext("Math", g.ctx);
        g.ctx.Math = vm.runInContext(`(() => {
          const values = [0.75, 0.375, 0.75, 0.5, 0.5, 0.75];
          let i = 0;
          return Object.assign(Object.create(Math), { random: () => values[i++ % values.length] });
        })()`, g.ctx);
        try {
          G.initRainDrops(); P.rainShow(true);
          P.rainUpdate(0, [0, 1, 0], true); drawn = 0; P.draw();
          return drawn;
        } finally { g.ctx.Math = gameMath; }
      };
      A.weatherArc(null); A.weather("wet");
      assert.equal(seeded(), 30, "static wet uses the drizzle pool");
      A.weather("rain");
      assert.equal(seeded(), 100, "static rain uses the full pool");
      arc("wet", "rain", 120);
      assert.equal(seeded(), 100, "a live arc must have room to grow without a pool-size jump");
    });
    await t.test("real render draws incoming rain over dry asphalt and stops over standing water", () => {
      A.lightTune({ rainCount: 100, drizzleCount: 0.3 });
      const arriving = arc("dry", "rain", 120); arriving.t = 5;
      G.initRainDrops(); P.rainShow(true);
      assert.ok(G.trackWetness() < 0.25);
      assert.ok(G.viewRainfall() > 0.01);
      assert.ok(paint() > 0, "render must feed atmospheric rainfall even though the road is dry");
      const clearing = arc("rain", "dry", 10); clearing.t = 10;
      G.initRainDrops(); P.rainShow(true);
      assert.ok(G.trackWetness() > 0.72, "grip still sees standing water");
      assert.equal(G.viewRainfall(), 0);
      assert.equal(paint(), 0, "render must not feed wet-road predicates to falling rain");
    });
    assert.deepEqual(g.record.scripts.filter((s) => s.error), [], "no script failure may masquerade as absent rain");
    assert.deepEqual(g.record.rejections, [], "no asynchronous boot failure");
  } finally { g.close(); }
});

test("rain arrives before the road saturates, then stops while water remains", () => {
  const { G, wa, frame, wetness, audio } = raced("dry");
  wa.startArc("dry", "rain", 60);
  G.raceT = 5;
  assert.ok(frame(0.1) > 0, "drops appear on the initially dry road");
  assert.ok(wetness() < 0.25);
  G.raceT = 80; frame(0.1);
  assert.ok(wetness() > 0.9);
  wa.startArc(G.raceWeather, "dry", 10);
  G.raceT = 90;
  assert.equal(frame(0.1), 0, "no falling rain when the cloud clears");
  assert.equal(audio.on, false);
  assert.ok(wetness() > 0.72, "standing water persists for grip and spray");
});

test("drizzle to heavier rain changes particle density continuously across 0.72", () => {
  const { G, wa, frame } = raced("dry");
  wa.startArc("dry", "rain", 120);
  G.raceT = 120 * 0.71;
  const drizzle = frame(0.1);
  G.raceT = 120 * 0.72;
  const heavier = frame(0.1);
  assert.ok(drizzle > 0 && heavier > drizzle);
  assert.ok(heavier / drizzle < 1.08, `no pool-size jump: ${drizzle} → ${heavier}`);
});

test("cancelling an arriving cloud clears its early rain audio and particles", () => {
  const { G, wa, frame, audio } = raced("dry");
  wa.startArc("dry", "rain", 120);
  G.raceT = 10;
  assert.ok(frame(0.1) > 0);
  assert.equal(audio.on, true);
  wa.arc = null;
  assert.equal(audio.on, false);
  assert.equal(frame(0.1), 0);
});

test("MIXED plan duration finishes inside a short race; a host plan is not recapped", () => {
  const { G, wa } = boot();
  G.track = { total: 3300 };   // street-length 3-lap (~3.5 min at 48 m/s)
  const p = wa.planFor();
  // boot()'s hash draws the longest seed walk (dur 0.99 -> 417 s uncapped); the cap must bite
  assert.ok(p.dur < 417, "3-lap MIXED must not keep a ~7 min walk, got " + p.dur);
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

test("wetnessAt(s): a local shower wets the road unevenly, and the view reads the player's own spot", () => {
  const { G, wa } = boot();
  G.track = { total: 5800 }; G.netPlay = { active: () => false };
  assert.equal(wa.wetnessAt(1000), wa.wetness(), "no arc: every position reads the one scalar");
  wa.changeable = true;
  // RainCells.LOCAL_ODDS is a hash draw per plan: take the first duration whose draw is a local shower
  for (let dur = 120; dur <= 400 && !(wa.arc && wa.arc.cell); dur += 10) {
    wa.endSession(); G.raceWeather = "dry"; wa.changeable = true;
    wa.plan = { to: "rain", dur };
    wa.startChangeable();
  }
  assert.ok(wa.arc && wa.arc.cell, "a MIXED rain arc on a known circuit carries a rain cell for some plan");
  G.raceT = wa.arc.dur / 2; wa.tick(wa.arc.dur / 2);
  const samples = [];
  for (let s = 0; s < 5800; s += 100) samples.push(wa.wetnessAt(s));
  assert.ok(samples.every((w) => w >= 0 && w <= 1), "wetness stays in [0,1]");
  assert.ok(Math.max(...samples) - Math.min(...samples) > 0.02, "a shower is local: the road is not uniformly wet, spread " + (Math.max(...samples) - Math.min(...samples)));
  G.player = { s: 2500 };
  assert.equal(wa.viewWetness(), wa.wetnessAt(2500), "the view stands on the followed car's segment");
  assert.equal(wa.wetnessAt(NaN), wa.wetness(), "a non-finite position falls back to the scalar");
});

// ── 2026-10-14: the arc on the shared clock, the sky off the road, re-target, drying ──
// Each failed on the pre-fix weather-arc.js (arc.t summed sim dt, the stage
// flipped at fixed thirds of the arc, startArc refused from === to, and
// wetness was the arc's pure linear ramp — as fast drying as wetting).

/** A race-clocked boot: G.raceT is the shared clock game.js advances. */
function raced(from) {
  const b = boot();
  b.G.raceT = 0; b.G.state = "race";
  b.G.raceWeather = from; b.wa.setWeatherLive(from);
  return b;
}

test("fix 1 — two peers on one shared clock see the same wetness and stage, however many sim steps each ran", () => {
  const host = raced("dry"), guest = raced("dry");
  host.wa.startArc("dry", "rain", 120); guest.wa.startArc("dry", "rain", 120);
  // The host steps every 1/60 s. The guest's tab was backgrounded: it ran only
  // every 20th step (the 5-step cap dropped the rest) and game.js snapped its
  // raceT to the shared wall clock (netGreen).
  const rows = [];
  for (let i = 1; i <= 60 * 150; i++) {
    host.G.raceT = i / 60; host.wa.tick(1 / 60);
    if (i % 20 === 0) { guest.G.raceT = i / 60; guest.wa.tick(1 / 60); }
    if (i % 1200 === 0) rows.push({ t: i / 60, host: host.wetness(), guest: guest.wetness(), hw: host.G.raceWeather, gw: guest.G.raceWeather });
  }
  for (const r of rows) {
    assert.ok(Math.abs(r.host - r.guest) < 1e-9, `t=${r.t}: host wetness ${r.host} vs guest ${r.guest}`);
    assert.equal(r.gw, r.hw, `t=${r.t}: stage`);
  }
});

test("fix 2 — the sky never reads dry over an inter-wet road (stage = TyreModel.treadFor of wetness)", () => {
  const stageOf = ["dry", "wet", "rain"];
  for (const [from, to] of [["dry", "rain"], ["rain", "dry"], ["dry", "wet"], ["wet", "rain"]]) {
    const { G, wa, TM, wetness } = raced(from);
    wa.startArc(from, to, 90);
    for (let i = 1; i <= 60 * 400; i++) {
      G.raceT = i / 60; wa.tick(1 / 60);
      const w = wetness(), tread = TM.treadFor(null, w);
      assert.equal(G.raceWeather, stageOf[tread], `${from}→${to} t=${(i / 60).toFixed(2)}: wetness ${w.toFixed(3)} (tread ${tread}) under a "${G.raceWeather}" sky`);
    }
    assert.equal(G.raceWeather, to);
  }
});

test("fix 2 — the engineer's wetIn is the second the sky turns wet", () => {
  const { G, wa } = raced("dry");
  const arc = wa.startArc("dry", "rain", 120);
  assert.ok(arc.wetIn > 0 && arc.wetIn < 120, "wetIn " + arc.wetIn);
  let i = 0;
  while ((i + 1) / 100 < arc.wetIn - 0.02) { i++; G.raceT = i / 100; wa.tick(0.01); }
  assert.equal(G.raceWeather, "dry", "just before wetIn");
  while (i / 100 < arc.wetIn + 0.02) { i++; G.raceT = i / 100; wa.tick(0.01); }
  assert.equal(G.raceWeather, "wet", "just after wetIn");
});

test("fix 3 — a dry→rain arc sent back to dry while the sky still reads dry re-targets without a grip jump", () => {
  const { G, wa, wetness } = raced("dry");
  wa.startArc("dry", "rain", 100);
  for (let i = 1; i <= 60 * 20; i++) { G.raceT = i / 60; wa.tick(1 / 60); }
  assert.equal(G.raceWeather, "dry", "fixture: 20 s in, the sky still reads dry");
  const before = wetness();
  assert.ok(before > 0.05, "fixture: the road has started to wet (" + before + ")");
  wa.startArc(G.raceWeather, "dry", 60);   // what real-race.js tickWeather sends
  assert.ok(wa.arc && wa.arc.to === "dry", "the live arc now heads for dry, not the storm");
  assert.ok(Math.abs(wetness() - before) < 1e-9, `no jump: ${before} → ${wetness()}`);
  let peak = before;
  for (let i = 60 * 20 + 1; i <= 60 * 400; i++) { G.raceT = i / 60; wa.tick(1 / 60); peak = Math.max(peak, wetness()); }
  assert.ok(peak < 0.25, "the road never reached inter-wet (peak " + peak + ")");
  assert.equal(G.raceWeather, "dry");
  assert.equal(wa.arc, null);
});

test("fix 4 — the road dries slower than it wets, frame-rate independent, and resets", () => {
  const timeTo = (from, to, cross) => {
    const { G, wa, wetness } = raced(from);
    wa.startArc(from, to, 90);
    for (let i = 1; i <= 60 * 600; i++) { G.raceT = i / 60; wa.tick(1 / 60); if (cross(wetness())) return i / 60; }
    return Infinity;
  };
  const wetIn = timeTo("dry", "rain", (w) => w >= 0.72);   // bone dry → storm-wet
  const dryIn = timeTo("rain", "dry", (w) => w < 0.28);    // the same 0.72 swing back
  assert.ok(dryIn > 90 + 5, `a storm must not be dry when a 90 s arc ends (dry in ${dryIn} s)`);
  assert.ok(dryIn > wetIn * 1.3, `drying (${dryIn} s) is slower than wetting (${wetIn} s)`);
  // One clock, different step sizes → the same wetness.
  const at = (dt) => {
    const { G, wa, wetness } = raced("rain");
    wa.startArc("rain", "dry", 90);
    const n = Math.round(150 / dt);
    for (let i = 1; i <= n; i++) { G.raceT = i * dt; wa.tick(dt); }
    return wetness();
  };
  const ws = [1 / 240, 1 / 60, 0.25, 5, 150].map(at);
  for (const w of ws) assert.ok(Math.abs(w - ws[0]) < 1e-9, `step-size independent: ${ws.join(", ")}`);
  // endSession drops the lagged state with the arc.
  const { G, wa, wetness } = raced("dry");
  wa.startArc("dry", "rain", 60);
  for (let i = 1; i <= 60 * 50; i++) { G.raceT = i / 60; wa.tick(1 / 60); }
  assert.ok(wetness() > 0.25);
  G.netPlay = { active: () => false };
  wa.endSession();
  G.raceWeather = "dry";
  assert.equal(wetness(), 0, "endSession: no wet road leaks into the next race");
});

// ── #1627: the lateral drying line — one surface field read by grip, shaders and the view ──
test("drying line: on a drying road the groove is drier than off-line; soaked and dry roads have none", () => {
  const { G, wa } = raced("rain");
  G.track = { total: 5800 }; G.frame = {};
  wa.startArc("rain", "dry", 60);
  G.raceT = 70;   // past the ramp: the road is part-dry (τ 36 s)
  wa.tick(70);
  const s = 2000, len = 5800;
  // find the groove centre by scan, then compare against 8 m off it
  let best = -9, bv = 0;
  for (let x = -8; x <= 8; x += 0.25) { const v = wa.dryLine(s / len, x); if (v > bv) { bv = v; best = x; } }
  assert.ok(bv > 0.99, "the groove has a centre inside the road");
  const w = wa.wetness();
  assert.ok(w > 0.05 && w < 0.95, "part-dry road " + w);
  const on = wa.wetnessAt(s, best), off = wa.wetnessAt(s, best + 8);
  assert.ok(on < off - 0.05, `groove ${on} drier than off-line ${off}`);
  assert.equal(wa.wetnessAt(s), w, "no lateral offset = the lap value");
  assert.ok(Math.abs(off - w) < 0.01, "far off-line reads the unmodified wetness");
  G.player = { s, x: best };
  assert.equal(wa.viewWetness(), on, "the view and grip read the same field at (s, x)");
  wa.syncWetness(0);
  assert.equal(G.frame.wetness, on, "frame.wetness agrees with wetnessAt at the player's (s, x)");
  const stat = raced("wet"); stat.G.track = { total: 5800 };
  assert.equal(stat.wa.wetnessAt(s, best), stat.wa.wetness(), "no arc (static weather): no line");
  const dry = raced("dry"); dry.G.track = { total: 5800 };
  assert.equal(dry.wa.wetnessAt(s, best), 0, "bone dry: no line");
  const wet = raced("rain"); wet.G.track = { total: 5800 };
  assert.equal(wet.wa.wetnessAt(s, best), 1, "soaked: no line");
});

test("drying line: the tabled groove knots give exactly the per-call-hash groove over a full lap (perf hunt 7)", () => {
  const { wa } = raced("rain");
  // The pre-table grooveX, verbatim, against the real hash.
  const ref = vm.createContext({ Math, Number, JSON, Object, Array, Error });
  seedLog(ref);
  for (const f of ["js/race/wx-hash.js", "js/race/rain-cells.js"]) vm.runInContext(read(f).replace(/^const\b/gm, "var"), ref, { filename: absSrc(f) });
  const RC = ref.RainCells;
  const grooveRef = (frac) => {
    const n = 12, f = (frac - Math.floor(frac)) * n, i = Math.floor(f), u = f - i, k = u * u * (3 - 2 * u);
    const h = (j) => RC.h01("groove|" + (((j % n) + n) % n)) * 2 - 1;
    return 2.5 * (h(i) + (h(i + 1) - h(i)) * k);
  };
  let checked = 0;
  for (let fi = -24; fi <= 1200; fi++) {
    const frac = fi / 1000 + 0.0003;   // spans negative, every knot, the wrap at 1 and past it
    for (const x of [-6, -2.2, 0, 1.1, 4]) {
      const want = Math.exp(-(((x - grooveRef(frac)) / 2.2) ** 2));
      assert.equal(wa.dryLine(frac, x), want, `frac ${frac} x ${x}`);
      checked++;
    }
  }
  assert.ok(checked > 6000);
});
