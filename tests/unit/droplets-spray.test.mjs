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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

function ctx2d(calls) {
  const grad = { addColorStop() {} };
  return {
    globalAlpha: 1, fillStyle: "",
    clearRect: () => { calls.clear++; }, drawImage: () => { calls.draw++; },
    save() {}, restore() {}, translate() {}, rotate: () => { calls.rotate++; },
    beginPath() {}, arc() {}, fill() {},
    createRadialGradient: () => grad, createLinearGradient: () => grad,
  };
}

function makeDroplets({ mobile = false, preset = "high", staticEl = true } = {}) {
  const calls = { clear: 0, draw: 0, rotate: 0 };
  const el = { id: "fx-droplets", hidden: true, width: 0, height: 0, getContext: () => ctx2d(calls), setAttribute() {} };
  const game = { parentNode: { insertBefore: (n) => { calls.inserted = n; } } };
  const document = {
    getElementById: (id) => (id === "fx-droplets" ? (staticEl ? el : null) : id === "game" ? game : null),
    createElement: () => ({ width: 0, height: 0, hidden: false, setAttribute() {}, getContext: () => ctx2d(calls) }),
  };
  const rng = makeRng(0xd809);
  const ctx = vm.createContext({
    Math: Object.assign(Object.create(Math), { random: () => rng.unit() }), Float32Array, Object,
    document, window: { innerWidth: 844, innerHeight: 390, devicePixelRatio: 3 },
    GLX: { isMobile: mobile }, GfxQuality: { current: () => preset },
  });
  seedLog(ctx);
  const D = vm.runInContext(read("js/fx/droplets.js") + ";Droplets", ctx);
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

// ── spray ────────────────────────────────────────────────────────────────────
function makeParticles(mobile = false) {
  const rng = makeRng(0x5b7a);
  const ctx = vm.createContext({
    Float32Array, Uint8Array, Array, Object, Math: Object.assign(Object.create(Math), { random: () => rng.unit() }),
    LightTune: { LT: { particleMul: 1, rainCount: 8, rainStreak: 1, rainWind: 0, windDir: 0, rainSpeed: 1, rainOpacity: 1 } },
    PerfGov: { autoShed: () => 0 },
  });
  seedLog(ctx);
  const P = vm.runInContext(read("js/fx/particles.js") + ";Particles", ctx);
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

test("game.js wires the nearest-N gate, sprayStr/sprayRate and the Droplets tick", () => {
  const g = gameSource();
  assert.match(g, /Particles\.sprayAdmit\(_sdx \* _sdx \+ _sdz \* _sdz\)/);
  assert.match(g, /Particles\.sprayStr\(vStd\(c\.speed\), Storm\.sprayK\(raceWeather\), frame\.wetness\)/);
  assert.match(g, /Droplets\.tick\(paused \? 0 : dt, onboard && !photoMode, frame\.rain \|\| 0, Storm\.is\(raceWeather\)/);
});
