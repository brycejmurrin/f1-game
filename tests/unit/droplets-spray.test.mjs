// droplets-spray.test.mjs — onboard lens/visor rain (js/fx/droplets.js) and the
// wet-race spray (js/fx/particles.js sprayStr / sprayRate / sprayAdmit / spray
// layers), driven in a VM with DOM/canvas stubs. Visual-only modules: these pin
// the GATES and SCALING (rain rate, onboard-only, caps, reduced motion, LOW off,
// nearest-N, storm/wetness/speed), not pixels — a browser shot is the sign-off.
// Run: node --test tests/unit/droplets-spray.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";
import { makeRng } from "../helpers/seeded-fuzz.mjs";
import { gameSource } from "../helpers/game-source.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

function ctx2d(calls) {
  const grad = { addColorStop() {} };
  return {
    globalAlpha: 1, fillStyle: "",
    clearRect: () => { calls.clear++; if (calls.frameDraws) calls.frameDraws.length = 0; },
    drawImage(...args) {
      calls.draw++;
      if (calls.frameDraws) calls.frameDraws.push({ dest: args.slice(-4), alpha: this.globalAlpha });
    },
    save() {}, restore() {}, translate() {}, rotate: () => { calls.rotate++; },
    beginPath() {}, arc() {}, fill() {}, moveTo() {}, bezierCurveTo() {}, closePath() {}, stroke() {},
    createRadialGradient: () => grad, createLinearGradient: () => grad,
  };
}

function makeDroplets({ mobile = false, preset = "high", staticEl = true, helmet = false, rainAmount = "normal", runoff = "normal", recordDraws = false, seed = 0xd809 } = {}) {
  const calls = { clear: 0, draw: 0, rotate: 0, ...(recordDraws ? { frameDraws: [] } : {}) };
  const el = { id: "fx-droplets", hidden: true, width: 0, height: 0, getContext: () => ctx2d(calls), setAttribute() {} };
  const game = { parentNode: { insertBefore: (n) => { calls.inserted = n; } } };
  const document = {
    body: { hasAttribute: () => helmet },
    getElementById: (id) => (id === "fx-droplets" ? (staticEl ? el : null) : id === "game" ? game : null),
    createElement: () => ({ width: 0, height: 0, hidden: false, setAttribute() {}, getContext: () => ctx2d(calls) }),
  };
  const rng = makeRng(seed);
  const ctx = vm.createContext({
    Math: Object.assign(Object.create(Math), { random: () => rng.unit() }), Float32Array, Object,
    document, window: { innerWidth: 844, innerHeight: 390, devicePixelRatio: 3 },
    CockpitOpts: { visor: () => "clear", visorRain: () => rainAmount, visorRunoff: () => runoff, visorRefraction: () => "off", visorReflections: () => "light" },
    GLX: { isMobile: mobile }, GfxQuality: { current: () => preset },
  });
  seedLog(ctx);
  const D = vm.runInContext(read("js/fx/droplets.js") + ";Droplets", ctx, { filename: absSrc("js/fx/droplets.js") });
  return { D, el, calls };
}

// 5 s of 60 Hz frames.
function run(D, s, on, rain, storm, vs, reduced) {
  for (let i = 0; i < s * 60; i++) D.tick(1 / 60, on, rain, storm, vs, reduced);
}

test("droplets: spawn rate follows rain — none below falling rain, storm heavier", () => {
  const { D } = makeDroplets();
  assert.equal(D.rate(0, false, false), 0, "dry");
  assert.equal(D.rate(0.35, false, false), 0, "drizzle tier wets the road, not the lens");
  const half = D.rate(0.75, false, false), full = D.rate(1, false, false), storm = D.rate(1, true, false);
  assert.ok(half > 0 && full > half, `rate rises with rain (${half} < ${full})`);
  assert.ok(storm > full * 1.5, `storm is the heavier tier (${storm} vs ${full})`);
  assert.ok(D.rate(1, false, true) < full, "reduced motion spawns fewer");
});

test("droplets: drizzle does not open an empty lens overlay; public surface has no dead _reset/RAIN_MIN", () => {
  const { D, el } = makeDroplets();
  D.tick(1 / 60, true, 0.35, false, 10, false);
  assert.equal(el.hidden, true, "drizzle (0.35) must not unhide an empty overlay");
  assert.equal(D.stats().n, 0);
  assert.equal(D._reset, undefined, "Droplets._reset was never called — dropped from the export");
  assert.equal(D.RAIN_MIN, undefined, "RAIN_MIN stays module-private; rate() is the gate pin");
});

test("droplets: onboard-only — any other camera hides the overlay and drops every drop", () => {
  const { D, el } = makeDroplets();
  run(D, 2, true, 1, false, 10, false);
  assert.ok(D.stats().n > 0, "onboard in rain gathers drops");
  assert.equal(el.hidden, false, "overlay shown onboard");
  D.tick(1 / 60, false, 1, false, 10, false);   // chase cam / photo mode
  assert.equal(D.stats().n, 0, "off-board clears the glass");
  assert.equal(el.hidden, true, "overlay hidden off-board");
  D.tick(1 / 60, true, 0, false, 10, false);     // onboard but dry
  assert.equal(el.hidden, true, "dry onboard stays hidden");
});

test("droplets: capped — ≤ 40 on phones, ≤ 90 desktop, half under reduced motion", () => {
  for (const [mobile, capN] of [[true, 40], [false, 90]]) {
    const { D } = makeDroplets({ mobile });
    let peak = 0;
    for (let i = 0; i < 20 * 60; i++) { D.tick(1 / 60, true, 1, true, 0, false); peak = Math.max(peak, D.stats().n); }
    assert.ok(peak <= capN, `peak ${peak} ≤ ${capN} (mobile=${mobile})`);
    assert.ok(peak >= capN * 0.6, `a parked storm fills the glass toward the cap (${peak})`);
    assert.equal(D.cap(mobile, true), capN >> 1);
  }
});

test("droplets: blown off at speed — fewer live drops at 80 m/s than parked", () => {
  const a = makeDroplets(), b = makeDroplets();
  run(a.D, 6, true, 1, false, 0, false);
  run(b.D, 6, true, 1, false, 80, false);
  assert.ok(b.D.stats().n < a.D.stats().n, `fast ${b.D.stats().n} < parked ${a.D.stats().n}`);
  assert.ok(b.calls.rotate > 0, "moving drops are drawn as rotated streaks");
});

test("droplets: reduced motion — drops never move or streak", () => {
  const { D, calls } = makeDroplets();
  run(D, 3, true, 1, true, 80, true);
  assert.ok(D.stats().n > 0, "still shows water on the lens");
  assert.equal(calls.rotate, 0, "no streaks under reduced motion");
});

test("droplets: GRAPHICS LOW is off; pause freezes; a missing static element is built after #game", () => {
  const low = makeDroplets({ preset: "low" });
  run(low.D, 2, true, 1, true, 30, false);
  assert.equal(low.D.stats().n, 0, "LOW: no drops");
  assert.equal(low.el.hidden, true, "LOW: overlay hidden");

  const p = makeDroplets();
  run(p.D, 2, true, 1, false, 0, false);
  const n = p.D.stats().n, draws = p.calls.draw;
  for (let i = 0; i < 60; i++) p.D.tick(0, true, 1, false, 0, false);
  assert.equal(p.D.stats().n, n, "paused (dt 0): the glass is frozen");
  assert.equal(p.calls.draw, draws, "paused: no redraw");

  const dyn = makeDroplets({ staticEl: false });
  dyn.D.tick(1 / 60, true, 1, false, 0, false);
  assert.ok(dyn.calls.inserted && dyn.calls.inserted.id === "fx-droplets", "built #fx-droplets next to #game");
});

test("droplets: DPR capped (phones 1, desktop 1.5) and the canvas tracks the viewport", () => {
  const ph = makeDroplets({ mobile: true });
  ph.D.tick(1 / 60, true, 1, false, 0, false);
  assert.deepEqual([ph.el.width, ph.el.height], [844, 390], "phone: DPR 1 at 844×390");
  const dk = makeDroplets();
  dk.D.tick(1 / 60, true, 1, false, 0, false);
  assert.deepEqual([dk.el.width, dk.el.height], [1266, 585], "desktop: DPR capped at 1.5");
});

test("helmet rain: amount scales accumulation and OFF clears only the optional shield", () => {
  const light = makeDroplets({helmet:true,rainAmount:"light"}), heavy = makeDroplets({helmet:true,rainAmount:"heavy"});
  run(light.D, 2, true, 1, false, 0, false); run(heavy.D, 2, true, 1, false, 0, false);
  assert.ok(heavy.D.stats().n > light.D.stats().n * 2);
  const off = makeDroplets({helmet:true,rainAmount:"off"}); run(off.D, 2, true, 1, true, 0, false);
  assert.equal(off.D.stats().n, 0);
  const other = makeDroplets({rainAmount:"off"}); run(other.D, 2, true, 1, false, 0, false);
  assert.ok(other.D.stats().n > 0, "other onboard cameras retain their rain");
});

test("helmet rain: a stopped shower drains gradually; runoff controls retention", () => {
  const slow = makeDroplets({helmet:true,runoff:"slow"}), fast = makeDroplets({helmet:true,runoff:"fast"});
  for (const {D} of [slow,fast]) run(D, 1, true, 1, false, 0, false);
  slow.D.tick(1/60,true,0,false,0,false);
  assert.ok(slow.D.stats().n > 0, "ending rain does not erase collected water");
  run(slow.D, 3, true, 0, false, 0, false); run(fast.D, 3, true, 0, false, 0, false);
  assert.ok(slow.D.stats().n > fast.D.stats().n, "fast runoff clears sooner");
  run(slow.D, 55, true, 0, false, 0, false);
  assert.equal(slow.D.stats().n, 0); assert.equal(slow.el.hidden, true);
});

test("helmet rain: stopped water falls vertically; speed bends it into sideways streaks", () => {
  let previousSideways = 0;
  for (const speed of [0, 30, 80]) {
    // A central initial bead survives this interval at every speed; an edge
    // bead can leave the shield and swap a different newborn into stats.first.
    const {D} = makeDroplets({helmet:true,seed:1}); run(D, 0.5, true, 1, false, speed, false);
    const start = D.stats().first;
    D.tick(0,true,1,false,speed,false); assert.deepEqual(D.stats().first, start);
    run(D, 0.2, true, 0, false, speed, false); const end = D.stats().first;
    assert.ok(Math.abs(end.hitAge-start.hitAge-0.2)<1e-6,"the same drop survived the measured runoff interval");
    if (!speed) { assert.equal(end.x,start.x); assert.ok(end.y>start.y); }
    else {
      assert.ok(Math.abs(end.vx)>previousSideways, `lateral airflow increases with speed (${speed}: ${end.vx}, previous ${previousSideways}; x ${start.x}→${end.x})`);
      if (speed===80) assert.ok(Math.abs(end.vx)>Math.abs(end.vy)*3, "fast streaks are predominantly sideways");
    }
    previousSideways=Math.abs(end.vx);
  }
  const {D,calls} = makeDroplets({helmet:true,runoff:"fast"});
  run(D, 0.5, true, 1, false, 80, true); const start = D.stats().first;
  run(D, 0.2, true, 0, false, 80, true); const end = D.stats().first;
  assert.equal(end.x,start.x); assert.equal(end.y,start.y); assert.equal(calls.rotate,0);
});

test("helmet impact: newborn water is visible with small satellites in its arrival frame", () => {
  const {D, calls} = makeDroplets({helmet:true, recordDraws:true});
  D.tick(0.06, true, 1, false, 80, false); // one arrival, before any simulation step of that drop
  const first = D.stats().first, draws = calls.frameDraws;
  assert.equal(D.stats().n, 1);
  assert.equal(first.hitAge, 0);
  assert.ok(draws.length > 1 && draws.every(d => d.alpha > 0), "arrival paints both the main bead and satellites");
  const widths = draws.map(d => d.dest[2]);
  assert.ok(Math.min(...widths) < Math.max(...widths) * 0.5, "satellites remain smaller than the main impact");
  assert.equal(calls.rotate, 0, "the impact has not become a runoff streak");
});

test("helmet impact: physical hit clock ignores runoff and speed, pins the hit, then releases water", () => {
  const cases = [{runoff:"slow",speed:0}, {runoff:"fast",speed:80}];
  for (const {runoff,speed} of cases) {
    const {D} = makeDroplets({helmet:true,runoff});
    D.tick(0.06, true, 1, false, speed, false);
    const start = D.stats().first;
    for (const dt of [0.1,0.03]) D.tick(dt, true, 0, false, speed, false);
    const pinned = D.stats().first;
    assert.ok(Math.abs(pinned.hitAge - 0.13) < 1e-6, `${runoff}: impact advances in physical seconds`);
    assert.deepEqual([pinned.x,pinned.y,pinned.vx,pinned.vy], [start.x,start.y,0,0], "adhesion pins the newborn for its first 0.14 seconds");
    D.tick(0.06, true, 0, false, speed, false);
    const released = D.stats().first;
    assert.ok(Math.abs(released.x-start.x) + Math.abs(released.y-start.y) > 0, `${runoff}: runoff resumes after impact`);
  }
});

test("helmet impact: spread peaks at 0.09 seconds and settles to bead size at 0.18", () => {
  const {D,calls} = makeDroplets({helmet:true,runoff:"slow",recordDraws:true});
  D.tick(0.06, true, 1, false, 0, false);
  // Slow runoff isolates the spread before the bead becomes a stretched streak.
  const scale = () => Math.sqrt(Math.max(...calls.frameDraws.map(d => d.dest[2]*d.dest[3]))) / (D.stats().first.radius * 2 * Math.min(D.stats().w,D.stats().h));
  const arrival = scale();
  D.tick(0.09, true, 0, false, 0, false); const peak = scale();
  D.tick(0.09, true, 0, false, 0, false); const settled = scale();
  assert.ok(Math.abs(arrival-1)<1e-5 && Math.abs(peak-1.65)<1e-5 && Math.abs(settled-1)<1e-5, `spread ${arrival} → ${peak} → ${settled}`);
  assert.equal(calls.frameDraws.length,1,"satellites end when the impact settles");
});

test("helmet impact: pause freezes the hit clock; clear and camera exit discard it", () => {
  const {D,calls} = makeDroplets({helmet:true});
  const spawn = () => D.tick(0.06,true,1,false,80,false);
  spawn(); D.tick(0.05,true,0,false,80,false);
  const before = D.stats().first, draws = calls.draw;
  for (let i=0;i<10;i++) D.tick(0,true,1,false,80,false);
  assert.deepEqual(D.stats().first,before,"pause preserves the impact's age and position");
  assert.equal(calls.draw,draws,"pause does not redraw or spawn impacts");
  D.clear(); assert.equal(D.stats().first,null);
  spawn(); assert.equal(D.stats().first.hitAge,0,"new race water has a fresh hit clock");
  D.tick(0.01,false,1,false,80,false); assert.equal(D.stats().first,null);
  spawn(); assert.equal(D.stats().first.hitAge,0,"camera exit discarded the old impact");
});

test("helmet impact: reduced motion and other onboard cameras keep the bead-only path", () => {
  for (const [helmet,reduced] of [[true,true],[false,false]]) {
    const {D,calls} = makeDroplets({helmet,recordDraws:true});
    run(D,0.2,true,1,false,0,reduced);
    assert.ok(D.stats().n>0);
    assert.equal(calls.frameDraws.length,D.stats().n,"one sprite per bead, without impact satellites");
    if (reduced) {
      const before = D.stats().first;
      run(D,0.1,true,0,false,80,true);
      const after = D.stats().first;
      assert.deepEqual([after.x,after.y,calls.rotate],[before.x,before.y,0],"reduced water stays still without streaks");
    }
  }
});

// ── spray ────────────────────────────────────────────────────────────────────
function makeParticles(mobile = false) {
  const rng = makeRng(0x5b7a);
  const ctx = vm.createContext({
    Float32Array, Uint8Array, Array, Object, Math: Object.assign(Object.create(Math), { random: () => rng.unit() }),
    LightTune: { LT: { particleMul: 1, rainCount: 8, rainStreak: 1, rainWind: 0, windDir: 0, rainSpeed: 1, rainOpacity: 1 } },
    PerfGov: { autoShed: () => 0 },
  });
  seedLog(ctx);
  const P = vm.runInContext(read("js/fx/particles.js") + ";Particles", ctx, { filename: absSrc("js/fx/particles.js") });
  P.init({ mobileTier: mobile, drawParticles() {} });
  return P;
}

test("spray: strength scales with speed, wetness and the storm tier", () => {
  const P = makeParticles();
  assert.equal(P.sprayStr(10, 1, 1), 0, "below ~21 % of the envelope: none");
  assert.ok(P.sprayStr(40, 1, 1) < P.sprayStr(60, 1, 1), "faster → more");
  assert.ok(P.sprayStr(60, 1, 0.3) < P.sprayStr(60, 1, 0.9), "wetter → more");
  assert.ok(Math.abs(P.sprayStr(60, 1.35, 1) / P.sprayStr(60, 1, 1) - 1.35) < 1e-9, "storm ×1.35 (Storm.sprayK)");
  assert.ok(P.sprayRate(1.35) > P.sprayRate(1) && P.sprayRate(1) > 9 + 21, "denser than the old 9 + 21·str");
});

test("spray: never takes the pool's last quarter, and leaves mist hanging past the old 1.9 s plume", () => {
  const P = makeParticles();
  for (let i = 0; i < 240; i++) { P.spray(0, 0.3, 0, 0, -20, 1.35, 20); P.update(1 / 60); }
  assert.ok(P.count() <= P.capacity() * 0.75 + 1, `spray ≤ 75 % of the pool (${P.count()}/${P.capacity()})`);
  for (let i = 0; i < 150; i++) P.update(1 / 60);   // 2.5 s with no emission
  assert.ok(P.count() > 0, "mist clouds (3-4.5 s) still hang in the air");
});

test("spray: only the nearest N cars emit (desktop 6, phone 3)", () => {
  for (const [mobile, N] of [[false, 6], [true, 3]]) {
    const P = makeParticles(mobile);
    assert.equal(P.sprayCars(), N);
    const d2 = Array.from({ length: 12 }, (_, i) => (10 + i * 10) ** 2);
    d2.forEach((d) => P.sprayAdmit(d));   // frame 1: everyone (no threshold yet)
    P.update(1 / 60);
    const ok = d2.map((d) => P.sprayAdmit(d));
    assert.equal(ok.filter(Boolean).length, N, `frame 2 admits the nearest ${N}`);
    assert.deepEqual(ok.slice(0, N), Array(N).fill(true), "the nearest ones");
  }
});

test("spray: shuffled Float32 distances preserve the capped nearest-N threshold and hysteresis", () => {
  let seed = 0x73509;
  const rnd = () => { seed = Math.imul(seed ^ seed >>> 15, 0x85ebca6b) >>> 0; return seed / 4294967296; };
  for (const mobile of [false, true]) {
    const P = makeParticles(mobile), N = P.sprayCars();
    for (let run = 0; run < 150; run++) {
      const distances = Array.from({ length: run % 41 }, (_, i) => i % 7 ? rnd() * 40000 : i % 2 ? Infinity : 0);
      P.clear();
      distances.forEach(d => P.sprayAdmit(d));
      P.update(0);   // pause must not consume the current candidate set
      P.update(1 / 60);
      const stored = distances.slice(0, 32).map(Math.fround).sort((a, b) => a - b);
      const threshold = stored.length <= N ? Infinity : stored[N - 1] * 1.05;
      for (const d of distances.concat([0, 1, 40000, Infinity, threshold, threshold + .001]))
        assert.equal(P.sprayAdmit(d), d <= threshold, `mobile=${mobile}, run=${run}, d=${d}`);
    }
  }
});

test("game.js wires the nearest-N gate, sprayStr/sprayRate and the Droplets tick", () => {
  const g = gameSource();
  assert.match(g, /Particles\.sprayAdmit\(_sdx \* _sdx \+ _sdz \* _sdz\)/);
  assert.match(g, /Particles\.sprayStr\(vStd\(c\.speed\), Storm\.sprayK\(raceWeather\), frame\.wetness\)/);
  assert.match(g, /Droplets\.tick\(paused \? 0 : dt, onboard && !photoMode, frame\.rain \|\| 0, Storm\.is\(raceWeather\)/);
});
