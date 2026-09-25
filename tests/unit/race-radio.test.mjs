/* race-radio.test.mjs — the race radio: phrasebook, facts, and the brain.
 *
 * What this pins, in the order a line travels:
 *
 *  1. WORDS. Every template in the phrasebook can be SPOKEN inside its own card
 *     (RadioVoice.plan refuses a line it cannot finish — and a radio that drops
 *     its own lines is silent exactly when it has the most to say), and a pool
 *     is dealt like a deck: nothing repeats before the pool is used up.
 *  2. FACTS. Gaps come from the timing loop, not prog/speed; a swap only counts
 *     as a pass once it HOLDS; a car in the pit lane is never "overtaken".
 *  3. THE BRAIN. Lines wait for the straight (never while braking or loaded up
 *     in a corner), stale lines die when their situation ends, the chatter level
 *     is obeyed, and commentary only talks while the player is watching.
 *
 * Run: node --test tests/unit/race-radio.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function load() {
  const ctx = vm.createContext({ Math, console, Object, Array, Number, JSON, isFinite, Map, Set, String, RegExp,
    Float64Array, Int32Array });
  seedLog(ctx);
  ctx.window = ctx;
  ctx.CamModes = { CAM_MODES: [{ id: "chase" }, { id: "cockpit" }, { id: "heli" }] };
  for (const f of ["js/audio/radio-voice.js", "js/race/radio-lines.js", "js/race/race-facts.js", "js/race/race-radio.js"]) {
    vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: f });
  }
  const get = (n) => vm.runInContext(n, ctx);
  return { ctx, RV: get("RadioVoice"), RL: get("RadioLines"), RF: get("RaceFacts"), RR: get("RaceRadio") };
}
const { ctx, RV, RL, RF, RR } = load();

// ── 1. WORDS ────────────────────────────────────────────────────────────────

// The longest plausible value for every slot: a long surname, a double-digit
// gap, a lap time with minutes.
const LONG = { pos: 20, passed: "VERSTAPPEN", by: "VERSTAPPEN", n: 12, gap: "10.5", ahead: "VERSTAPPEN",
  behind: "VERSTAPPEN", rate: "0.8", laps: 12, gapA: "10.5", gapB: "10.5", time: "1:32.4", delta: "2.3",
  left: 10, grid: 20, name: "VERSTAPPEN", leader: "VERSTAPPEN", a: "VERSTAPPEN", b: "HULKENBERG",
  why: "MECHANICAL TROUBLE" };
const RADIO_LEAD_S = 0.43;   // js/audio/engine.js RADIO_CH.radio: 0.03 + the four-note courtesy figure

test("every phrasebook line can be spoken inside its own card", () => {
  const refused = [];
  let n = 0;
  for (const [key, pool] of Object.entries(RL.POOLS)) {
    const tv = key.startsWith("tv.");
    for (const tpl of pool) {
      const msg = RL.fill(tpl, LONG);
      assert.ok(msg, `${key}: "${tpl}" has a slot this test does not fill`);
      const dur = RR.durFor(msg);
      const life = Math.max(3, dur + 0.5);   // js/game.js showAnnounce
      const p = RV.plan({ msg, life, kind: tv ? "comm" : "info", lead: tv ? 0 : RADIO_LEAD_S,
        enabled: true, soundOn: true, api: true, state: "race" });
      n++;
      if (!p.speak) refused.push(`${key}: "${msg}" (${p.reason})`);
    }
  }
  assert.ok(n > 100, `expected the whole phrasebook, spoke ${n}`);
  assert.deepEqual(refused, []);
});

test("a pool is dealt like a deck: every variant once before any twice, never back to back", () => {
  const pools = { k: ["A", "B", "C", "D"] };
  const d = RL.create(7, pools);
  let prev = null;
  for (let round = 0; round < 25; round++) {
    const seen = new Set();
    for (let i = 0; i < 4; i++) {
      const s = d.pick("k", {});
      assert.notEqual(s, prev, "the same line twice in a row");
      seen.add(s); prev = s;
    }
    assert.equal(seen.size, 4, "a variant repeated before the pool was used up");
  }
});

test("a slot that cannot be filled skips the variant rather than saying half a line", () => {
  assert.equal(RL.fill("{gap} TO {ahead}", { gap: "1.2" }), "");
  const d = RL.create(1, { k: ["{missing} X", "PLAIN"] });
  for (let i = 0; i < 6; i++) assert.equal(d.pick("k", {}), "PLAIN");
  assert.equal(RL.gapText(1.234), "1.2");
  assert.equal(RL.gapText(12.6), "13");
  assert.equal(RL.timeText(92.44), "1:32.4");
  assert.equal(RL.surname({ name: "Lewis Hamilton", code: "HAM" }), "HAMILTON");
});

// ── a tiny race the facts and the brain can watch ──────────────────────────

const LAP = 3200;
function car(code, prog, speed, extra) {
  return Object.assign({ code, name: "Driver " + code, prog, speed, lap: 1, lastLap: 0, best: Infinity,
    retired: false, finished: false, pitState: "none", pitStops: 0, energy: 0.6 }, extra || {});
}
function race(opts = {}) {
  const said = [];
  const store = new Map(Object.entries(opts.store || {}));
  const cars = opts.cars || [car("AAA", 400, 60), car("BBB", 370, 60), car("PLY", 340, 60, { isPlayer: true, local: true })];
  const G = {
    state: "race", raceT: 0, cars, player: cars.find((c) => c.isPlayer), track: { total: LAP },
    lapsTarget: opts.laps || 20, timeTrial: false, practice: false, camMode: opts.cam || 0, hudProfile: "standard",
    LAT_MAX: 30, vTop: () => 80, raceRound: 0, announceBusy: false,
    cautionInfo: () => ({ level: G._caution || 0 }),
    cautionLevel: () => G._caution || 0,
    store: { get: (k, d) => (store.has(k) ? store.get(k) : d), set: (k, v) => store.set(k, v) },
    announce: (msg, dur, kind) => { said.push({ t: +G.raceT.toFixed(2), msg, kind }); return true; },
  };
  const radio = RR.create(G, { seed: 3 });
  function step(dt, n = 1) {
    for (let i = 0; i < n; i++) {
      G.raceT += dt;
      for (const c of G.cars) {
        if (c.retired || c.finished) continue;
        const was = Math.floor(c.prog / LAP);
        c.prog += c.speed * dt;
        const now = Math.floor(c.prog / LAP);
        if (now > was) { c.lastLap = LAP / c.speed; c.best = Math.min(c.best, c.lastLap); c.lap = now + 1; }
      }
      radio.update(dt);
    }
  }
  return { G, cars, radio, said, step, store };
}

// ── 2. FACTS ────────────────────────────────────────────────────────────────

test("the timing-loop gap is the time between two cars at the same line, not prog/speed", () => {
  const f = RF.create();
  const a = car("AAA", 1000, 80), b = car("BBB", 920, 80);
  const G = { state: "race", raceT: 0, cars: [a, b], player: b, track: { total: LAP }, cautionInfo: () => ({ level: 0 }), cautionLevel: () => 0 };
  let out;
  for (let i = 0; i < 600; i++) {
    G.raceT += 1 / 60;
    a.prog += a.speed / 60; b.prog += b.speed / 60;
    // B brakes hard for a moment: a prog/speed gap would read 4 s, the loop does not move.
    if (i === 595) b.speed = 20;
    out = f.observe(G, 1 / 60);
  }
  assert.ok(Math.abs(out.f.gapA - 1.0) < 0.05, `expected ~1.0 s, got ${out.f.gapA}`);
});

test("a pass counts only once the new order has HELD", () => {
  const f = RF.create();
  const a = car("AAA", 1000, 60), b = car("BBB", 999, 60), p = car("PLY", 500, 60, { isPlayer: true });
  const G = { state: "race", raceT: 0, cars: [a, b, p], player: p, track: { total: LAP }, cautionInfo: () => ({ level: 0 }), cautionLevel: () => 0 };
  const passes = [];
  const tick = () => { G.raceT += 0.1; for (const c of G.cars) c.prog += c.speed * 0.1; passes.push(...f.observe(G, 0.1).ev.filter((e) => e.type === "pass")); };
  for (let i = 0; i < 40; i++) tick();
  // Side by side: B pokes ahead for half a second, then drops back.
  b.prog = a.prog + 2; for (let i = 0; i < 5; i++) tick();
  b.prog = a.prog - 2; for (let i = 0; i < 20; i++) tick();
  assert.equal(passes.length, 0, "a half-second nose ahead is not a pass");
  b.prog = a.prog + 5; for (let i = 0; i < 20; i++) tick();
  assert.equal(passes.length, 1);
  assert.equal(passes[0].a, b);
  assert.equal(passes[0].pos, 1);
});

test("the caution edge reads the allocation-free cautionLevel() when the facade has it", () => {
  const f = RF.create();
  const a = car("AAA", 1000, 60), p = car("PLY", 900, 60, { isPlayer: true });
  let lvl = 0, infoCalls = 0;
  const G = { state: "race", raceT: 0, cars: [a, p], player: p, track: { total: LAP },
    cautionLevel: () => lvl, cautionInfo: () => { infoCalls++; return { level: lvl }; } };
  const evs = [];
  const tick = () => { G.raceT += 0.1; for (const c of G.cars) c.prog += c.speed * 0.1; evs.push(...f.observe(G, 0.1).ev); };
  for (let i = 0; i < 10; i++) tick();
  lvl = 2; tick();
  const c = evs.filter((e) => e.type === "caution");
  assert.equal(c.length, 1);
  assert.equal(c[0].level, 2);
  assert.equal(infoCalls, 0, "cautionInfo() allocates an object per call; the per-step path must not use it");
  // The ranking is one array reused in place, and order() still hands out a copy.
  const o1 = f.order(), o2 = f.order();
  assert.notEqual(o1, o2);
  assert.equal(o1.length, 2);
  assert.ok(o1[0] === a && o1[1] === p, "the leader first");
});

test("a car in the pit lane is not overtaken — that is a pit stop", () => {
  const f = RF.create();
  const a = car("AAA", 1000, 60), b = car("BBB", 950, 60), p = car("PLY", 500, 60, { isPlayer: true });
  const G = { state: "race", raceT: 0, cars: [a, b, p], player: p, track: { total: LAP }, cautionInfo: () => ({ level: 0 }), cautionLevel: () => 0 };
  const evs = [];
  const tick = () => { G.raceT += 0.1; for (const c of G.cars) c.prog += c.speed * 0.1; evs.push(...f.observe(G, 0.1).ev); };
  for (let i = 0; i < 40; i++) tick();
  a.pitState = "enter"; a.speed = 15;
  for (let i = 0; i < 80; i++) tick();
  assert.equal(evs.filter((e) => e.type === "pass").length, 0);
  assert.equal(evs.filter((e) => e.type === "pitIn").length, 1);
});

// ── 3. THE BRAIN ────────────────────────────────────────────────────────────

test("gaining a place is called, by name, once the pass holds", () => {
  const r = race();
  r.step(0.05, 100);
  r.cars[2].prog = r.cars[1].prog + 5;   // PLY past BBB
  r.step(0.05, 80);
  const line = r.said.find((s) => /P2/.test(s.msg));
  assert.ok(line, `expected a P2 call, heard ${JSON.stringify(r.said)}`);
  assert.equal(line.kind, "info");
});

test("a burst of lost places is ONE call with the net change, not one call per car", () => {
  const cars = [car("PLY", 1000, 60, { isPlayer: true, local: true })];
  for (let i = 0; i < 6; i++) cars.push(car("C" + i, 990 - i * 10, 60));
  const r = race({ cars });
  r.step(0.05, 300);
  // The player stops dead; the field streams past inside a few seconds.
  r.G.player.speed = 0;
  r.step(0.05, 200);
  const pos = r.said.filter((s) => /P\d/.test(s.msg) && s.kind === "info");
  assert.equal(pos.length, 1, JSON.stringify(r.said));
  assert.match(pos[0].msg, /P7/);
  assert.match(pos[0].msg, /6|DOWN|LOST/);
});

test("nothing below tier 5 is said while the driver is braking or loaded up in a corner", () => {
  const r = race();
  r.step(0.05, 100);
  r.G.player.brakeDemand = 0.8;
  r.cars[2].prog = r.cars[1].prog + 5;
  r.step(0.05, 60);
  assert.equal(r.said.filter((s) => s.kind === "info").length, 0, "spoke under braking");
  r.G.player.brakeDemand = 0;
  r.step(0.05, 20);
  assert.ok(r.said.some((s) => /P2/.test(s.msg)), "the held line is said on the straight");
});

test("a defend call for a car that has already dropped back is dropped, not said late", () => {
  const r = race({ cars: [car("AAA", 2000, 60), car("PLY", 1000, 60, { isPlayer: true, local: true }), car("BBB", 950, 60)] });
  r.G.announceBusy = true;               // the card is taken…
  r.step(0.05, 200);
  r.cars[2].speed = 40;                  // …and BBB falls away before it frees up
  r.step(0.05, 200);
  r.G.announceBusy = false;
  r.step(0.05, 40);
  assert.equal(r.said.filter((s) => /BBB/.test(s.msg) && /DEFEND|MIRRORS|CLOSING|TIGHT|INSIDE/.test(s.msg)).length, 0,
    `a stale defend call was said: ${JSON.stringify(r.said)}`);
});

test("chatter OFF silences the race engineer; flags still reach the card through race control", () => {
  const r = race({ store: { radioChat: "off" } });
  r.step(0.05, 100);
  r.cars[2].prog = r.cars[1].prog + 5;
  r.G._caution = 3;
  r.step(0.05, 100);
  assert.deepEqual(r.said, []);
});

test("a safety car is tier 5: it goes out even over a busy card and a loaded car", () => {
  const r = race();
  r.step(0.05, 40);
  r.G.announceBusy = true; r.G.player.brakeDemand = 1;
  r.G._caution = 3;
  r.step(0.05, 2);
  const sc = r.said.find((s) => /SAFETY CAR/.test(s.msg));
  assert.ok(sc, JSON.stringify(r.said));
  assert.equal(sc.kind, "race");
});

test("commentary talks only while the player is watching — a TV camera — unless set to ALWAYS", () => {
  const cockpit = race({ cam: 1 });
  cockpit.step(0.05, 200);
  assert.equal(cockpit.said.filter((s) => s.kind === "comm").length, 0, "commentary over a driving camera");
  const heli = race({ cam: 2 });
  heli.step(0.05, 200);
  assert.ok(heli.said.some((s) => s.kind === "comm" && /LIGHTS OUT/.test(s.msg)), JSON.stringify(heli.said));
  const always = race({ cam: 1, store: { commentary: "on" } });
  always.step(0.05, 200);
  assert.ok(always.said.some((s) => s.kind === "comm"));
});

test("the result is called with the position, after the flag", () => {
  // Four cars: P3 of a three-car field is last, not a podium.
  const r = race({ laps: 2, cars: [car("AAA", 400, 60), car("BBB", 370, 60), car("PLY", 340, 60, { isPlayer: true, local: true }), car("CCC", 300, 60)] });
  r.step(0.05, 40);
  const p = r.G.player;
  p.finished = true;
  r.step(0.05, 10);
  assert.ok(r.said.some((s) => /P3/.test(s.msg) && /PODIUM/.test(s.msg)), JSON.stringify(r.said));
});

test("RADIO CHECK answers on demand with the position and both gaps", () => {
  const r = race({ cars: [car("AAA", 2000, 60), car("PLY", 1900, 60, { isPlayer: true, local: true }), car("BBB", 1750, 60)] });
  let pressed = false;
  ctx.Input = { consumeRadio: () => { const v = pressed; pressed = false; return v; } };
  try {
    r.step(0.05, 200);
    const before = r.said.length;
    pressed = true;
    r.step(0.05, 1);
    const line = r.said[before];
    assert.ok(line && /P2/.test(line.msg) && /1\.7/.test(line.msg) && /2\.5/.test(line.msg), JSON.stringify(r.said.slice(before)));
    assert.equal(line.kind, "race");
  } finally { delete ctx.Input; }
});

// ── regressions from the post-merge bug hunt ─────────────────────────────────

test("a second race starts with a fresh radio — game.js never ticks it between races", () => {
  const field = () => [car("AAA", 400, 60), car("BBB", 370, 60), car("PLY", 340, 60, { isPlayer: true, local: true })];
  const r = race({ cars: field() });
  r.step(0.05, 4000);                          // race one: 200 s of memory and cooldowns
  const before = r.said.length;
  // The next race: makeCars builds a new array and the clock restarts. The
  // radio sees no "not racing" tick in between (game.js returns before it).
  r.G.cars = field(); r.G.player = r.G.cars[2]; r.G.raceT = 0;
  r.step(0.05, 100);
  r.G.cars[2].prog = r.G.cars[1].prog + 5;
  r.step(0.05, 200);
  assert.ok(r.said.slice(before).some((s) => /P2/.test(s.msg)), `race two was silent: ${JSON.stringify(r.said.slice(before))}`);
});

test("the result is the order the flag fell in, not the cars array (finPos is 0 until endRace)", () => {
  const P = car("PLY", 900, 60, { isPlayer: true, local: true }), W = car("WIN", 1000, 60), X = car("XXX", 800, 60), Y = car("YYY", 700, 60);
  const r = race({ cars: [P, W, X, Y] });      // the player is cars[0]
  r.step(0.05, 100);
  W.finished = true; r.step(0.05, 20);
  P.finished = true; r.step(0.05, 40);
  const result = r.said.filter((s) => s.kind === "race" && /P\d|WIN/.test(s.msg));
  assert.equal(result.length, 1, JSON.stringify(r.said));
  assert.doesNotMatch(result[0].msg, /WIN|RACE WINNER|WHAT A DRIVE/);
  assert.match(result[0].msg, /P2/);
});

test("a retirement ahead is told once, as the new place — never as a pass on the car behind", () => {
  const A = car("AAA", 1300, 60), B = car("BBB", 1200, 60), C = car("CCC", 1100, 60),
    P = car("PLY", 1000, 60, { isPlayer: true, local: true }), D = car("DDD", 900, 60);
  const r = race({ cars: [A, B, C, P, D] });
  r.step(0.05, 300);
  B.retired = true; B.dnf = "engine";
  r.step(0.05, 400);
  const after = r.said.filter((s) => s.t > 15);
  assert.deepEqual(after.map((s) => s.msg).filter((m) => /P\d/.test(m)).length, 1, JSON.stringify(after));
  assert.match(after[0].msg, /BBB.*P3/);
});

test("a red-flag restart does not read the bunched-up grid as the car ahead closing 6 s a lap", () => {
  const A = car("AAA", 2 * LAP + 480, 60), P = car("PLY", 2 * LAP, 60, { isPlayer: true, local: true }), B = car("BBB", 2 * LAP - 600, 60);
  const r = race({ cars: [A, P, B] });
  r.step(0.05, 2400);
  const before = r.said.length;
  for (const [c, s] of [[A, LAP - 100], [P, LAP - 190], [B, LAP - 280]]) c.prog = Math.floor(c.prog / LAP) * LAP - (LAP - s);
  r.step(0.05, 600);
  assert.equal(r.said.slice(before).filter((s) => /QUICKER|CLOSING/.test(s.msg)).length, 0, JSON.stringify(r.said.slice(before)));
});

test("a RADIO CHECK on the tick a safety car comes out does not swallow the safety car", () => {
  let pressed = false;
  ctx.Input = { consumeRadio: () => { const v = pressed; pressed = false; return v; } };
  try {
    const r = race({ cars: [car("AAA", 2000, 60), car("PLY", 1900, 60, { isPlayer: true, local: true }), car("BBB", 1750, 60)] });
    r.step(0.05, 200);
    r.G._caution = 3; pressed = true;
    r.step(0.05, 200);
    assert.ok(r.said.some((s) => /SAFETY CAR/.test(s.msg)), JSON.stringify(r.said));
  } finally { delete ctx.Input; }
});

test("RaceRadio reads and writes only its own two settings", () => {
  const r = race();
  assert.equal(r.radio.chat(), "normal");
  assert.equal(r.radio.comm(), "tv");
  r.radio.setChat("chatty"); r.radio.setComm("on");
  assert.equal(r.store.get("radioChat"), "chatty");
  assert.equal(r.store.get("commentary"), "on");
  assert.equal(r.radio.setChat("loud"), "chatty", "an unknown level is refused");
});

// ── Regressions from the 2026-09-24 radio review (a kinematic field, 1/60 s) ──
// Cars move at a set speed round a 3 km lap; laps, lap times and the flag are
// kept the way js/game.js keeps them. Enough to replay each reported case.
const SIM_L = 3000, SIM_DT = 1 / 60;
if (!ctx.CamModes) ctx.CamModes = { CAM_MODES: [{ id: "chase" }] };
const simCar = (code, prog, speed, extra) => Object.assign({ code, name: "Driver " + code, prog, speed,
  lap: prog >= 0 ? Math.floor(prog / SIM_L) + 1 : 0, lastLap: 0, best: Infinity, lapStart: 0, retired: false,
  finished: false, pitState: "none", pitStops: 0, energy: 0.6, finPos: 0, hits: 0, hitSev: 0 }, extra || {});
function sim(cars, laps = 20) {
  const said = [];
  let lvl = 0;
  const G = { state: "race", raceT: 0, cars, player: cars.find((c) => c.isPlayer), track: { total: SIM_L }, lapsTarget: laps,
    timeTrial: false, practice: false, camMode: 0, hudProfile: "standard", LAT_MAX: 30, vTop: () => 80, raceRound: 0,
    announceBusy: false, cautionInfo: () => ({ level: lvl }), cautionLevel: () => lvl, store: null,
    announce: (msg, dur, kind) => { said.push({ t: G.raceT, msg, kind }); return true; } };
  const radio = RR.create(G, { seed: 3 });
  const flagOut = () => G.cars.some((c) => c.finished && !c.retired);
  const step = (secs) => {
    for (let k = 0; k < Math.round(secs / SIM_DT); k++) {
      G.raceT += SIM_DT;
      for (const c of G.cars) {
        if (c.retired) continue;
        const before = c.prog; c.prog += c.speed * SIM_DT;
        if (c.finished) continue;
        if (Math.floor(c.prog / SIM_L) > Math.floor(before / SIM_L)) {
          const lt = G.raceT - c.lapStart; c.lapStart = G.raceT; c.lap += 1;
          if (c.lap > 1) { c.lastLap = lt; c.best = Math.min(c.best, lt); }
          if (c.lap > laps || (c.lap > 1 && flagOut())) c.finished = true;
        }
      }
      radio.update(SIM_DT);
    }
  };
  return { G, radio, said, step, caution: (v) => { lvl = v; }, lines: (from = 0) => said.filter((s) => s.t >= from).map((s) => s.msg) };
}

test("a car flagged second is never told it won, whatever it overshot the line by", () => {
  for (let o = 0; o < 40; o++) {
    const W = simCar("WIN", 3 * SIM_L - 20 - 0.03 * o, 85);
    const P = simCar("PLY", 3 * SIM_L - 20 - 85 * 20 - 0.041 * ((o * 7) % 40), 85, { isPlayer: true });
    const r = sim([W, P, simCar("XXX", 3 * SIM_L - 20 - 85 * 40, 85)], 3);
    r.step(30);
    assert.ok(!r.lines().some((m) => /YOU WIN|RACE WINNER|WHAT A DRIVE/.test(m)), `offset ${o}: ${r.lines().join(" | ")}`);
  }
});

test("after your own stop, the next place gained is called as a gain, not 'DOWN 4'", () => {
  const cs = ["AAA", "BBB"].map((c, i) => simCar(c, 1200 - i * 60, 60));
  const P = simCar("PLY", 1080, 60, { isPlayer: true });
  const rest = ["CCC", "DDD", "EEE", "FFF"].map((c, i) => simCar(c, 1020 - i * 40, 60));
  const r = sim([...cs, P, ...rest], 30);
  r.step(20);
  P.prog = cs[1].prog + 10; r.step(15);
  P.pitState = "entry"; P.speed = 25; r.step(12);
  P.pitState = "none"; P.speed = 60; r.step(20);
  const t0 = r.G.raceT;
  const ahead = r.G.cars.filter((c) => c !== P && c.prog > P.prog).sort((a, b) => a.prog - b.prog)[0];
  P.prog = ahead.prog + 8; r.step(20);
  const after = r.lines(t0);
  assert.ok(!after.some((m) => /DOWN \d|LOST \d|PAYBACK/.test(m)), after.join(" | "));
  assert.ok(after.some((m) => /P6/.test(m)), `the gain to P6 is called: ${after.join(" | ")}`);
});

test("a lapped player hears the last lap on the last lap, and nothing after the flag but the result", () => {
  const P = simCar("PLY", 30, 60, { isPlayer: true });
  const r = sim([simCar("LDR", 60, 90), P], 6);
  r.step(400);
  const log = r.radio.debug().log.filter((l) => l.ch === "eng");
  assert.equal(log.length ? log[log.length - 1].id : "", "result", `the result is the last word: ${r.lines().join(" | ")}`);
  assert.ok(r.lines().some((m) => /ONE TO GO|LAST LAP|ONE MORE/.test(m)), `the last lap is called: ${r.lines().join(" | ")}`);
});

test("gaps closed under the safety car are not called as pace after the restart", () => {
  const A = simCar("AAA", 1300, 60), P = simCar("PLY", 1000, 60, { isPlayer: true }), B = simCar("BBB", 820, 60);
  const r = sim([A, P, B], 30);
  r.step(120);
  r.caution(3); A.speed = P.speed = B.speed = 30; r.step(20);
  P.prog = A.prog - 45 * 1.5; B.prog = P.prog - 45 * 1.6; r.step(100);
  const t0 = r.G.raceT;
  r.caution(0); A.speed = P.speed = B.speed = 60; r.step(40);
  assert.ok(!r.lines(t0).some((m) => /QUICKER|CLOSING|PULLING|LOSING/.test(m)), r.lines(t0).join(" | "));
});

test("a car that dropped three places at once does not fire a stale pass when it meets them again", () => {
  const X = simCar("XXX", 1500, 60), A = simCar("AAA", 1480, 60), B = simCar("BBB", 1460, 60), C = simCar("CCC", 1440, 60);
  const r = sim([X, A, B, C, simCar("PLY", 1000, 60, { isPlayer: true })], 30);
  r.radio.setComm("on");
  r.step(30);
  X.prog = C.prog - 30; r.step(20);
  const t0 = r.G.raceT;
  X.prog = C.prog + 5; r.step(8);
  assert.ok(!r.lines(t0).some((m) => /CHANGE AT THE FRONT|LEADS/.test(m)), r.lines(t0).join(" | "));
});

test("lap times round before they split: 119.97 s is 2:00.0", () => {
  assert.equal(RL.timeText(119.97), "2:00.0");
  assert.equal(RL.timeText(92.44), "1:32.4");
});

test("two cars swapping the lead again and again get one lead-change call per 30 s, not one per swap", () => {
  const A = simCar("AAA", 2000, 60), B = simCar("BBB", 1990, 60);
  const r = sim([A, B, simCar("PLY", 1000, 60, { isPlayer: true })], 30);
  r.radio.setComm("on");
  r.step(12);
  const t0 = r.G.raceT;
  for (let k = 0; k < 12; k++) {                // a swap every 5 s for a minute
    const [lead, other] = A.prog > B.prog ? [A, B] : [B, A];
    other.prog = lead.prog + 6;
    r.step(5);
  }
  const leads = r.lines(t0).filter((m) => /LEAD|FRONT/.test(m));
  assert.ok(leads.length <= 3, `lead calls in 60 s: ${leads.length} — ${leads.join(" | ")}`);
  assert.ok(leads.length >= 1, "a lead change is still called");
});


test("'out of reach' is an end-of-race call: never on lap one of a short race", () => {
  const A = simCar("AAA", 1500, 70), P = simCar("PLY", 1000, 60, { isPlayer: true }), B = simCar("BBB", 900, 55);
  const r = sim([A, P, B], 3); r.radio.setChat("chatty");
  r.step(60);
  // eng.outOfReach: "{ahead} IS {gap} AHEAD. HOLD P{pos}" / "TOO FAR TO {ahead}. BRING HOME P{pos}"
  assert.ok(!r.lines().some((m) => /AHEAD\. HOLD P|TOO FAR TO/.test(m)), r.lines().join(" | "));
});

test("commentary leaves room: at least 10 s between ordinary lines, and one pass call per pair per 40 s", () => {
  const cars = [];
  for (let i = 0; i < 8; i++) cars.push(simCar("C" + i, 2000 - i * 12, 60));
  cars.push(simCar("PLY", 500, 60, { isPlayer: true }));
  const r = sim(cars, 30);
  r.radio.setComm("on");
  r.step(15);
  const t0 = r.G.raceT;
  for (let k = 0; k < 20; k++) {                 // pairs trading places every 3 s
    const i = 1 + (k % 5), a = cars[i], b = cars[i + 1];
    const [front, back] = a.prog > b.prog ? [a, b] : [b, a];
    back.prog = front.prog + 4;
    r.step(3);
  }
  const comm = r.said.filter((s) => s.kind === "comm" && s.t >= t0 && !/LEAD|FRONT/.test(s.msg));
  for (let i = 1; i < comm.length; i++) {
    assert.ok(comm[i].t - comm[i - 1].t >= 10 - 1e-6, `lines ${comm[i - 1].t.toFixed(1)} -> ${comm[i].t.toFixed(1)}: ${comm.map((c) => c.msg).join(" | ")}`);
  }
  assert.ok(comm.length >= 2, "commentary still talks");
});

test("a driver who has finished hears nothing more but their result — not a safety car for the others", () => {
  const P = simCar("PLY", 3 * SIM_L - 100, 60, { isPlayer: true });
  const r = sim([P, simCar("AAA", 3 * SIM_L - 400, 60), simCar("BBB", 3 * SIM_L - 700, 60)], 3);
  r.step(8);                                       // the player takes the flag
  assert.ok(P.finished, "precondition: flagged");
  const t0 = r.G.raceT;
  r.caution(3); r.step(10);
  // The COMMENTATOR may call it — a finished driver is watching the broadcast;
  // the ENGINEER may not.
  const eng = r.said.filter((x) => x.t >= t0 && x.kind !== "comm").map((x) => x.msg);
  assert.ok(!eng.some((m) => /SAFETY CAR/.test(m)), eng.join(" | "));
});

test("paused (a VS FRIEND race keeps running under the menu), the radio holds its lines", () => {
  const A = simCar("AAA", 1010, 60), P = simCar("PLY", 1000, 60, { isPlayer: true });
  const r = sim([A, P], 30);
  r.step(20);
  r.G.paused = true;
  const t0 = r.G.raceT;
  P.prog = A.prog + 8; r.step(15);
  assert.deepEqual(r.lines(t0), [], "nothing while paused");
  r.G.paused = false; r.step(3);
  assert.ok(r.lines(t0).length > 0, "and the queued line comes out after");
});

test("an urgent line refused by a full card queue is offered again, not lost", () => {
  const P = simCar("PLY", 2 * SIM_L - 300, 60, { isPlayer: true });
  const r = sim([P, simCar("AAA", 2 * SIM_L - 600, 60)], 3);
  let refuse = 0;
  const real = r.G.announce;
  r.G.announce = (msg, dur, kind) => { if (kind === "race" && refuse < 3) { refuse++; return false; } return real(msg, dur, kind); };
  r.step(12);                                      // crosses into the last lap
  assert.ok(refuse > 0, "precondition: the card refused it");
  assert.ok(r.lines().some((m) => /LAST LAP|ONE TO GO|ONE MORE/.test(m)), r.lines().join(" | "));
});


test("a player flagged first with a time penalty is not told they won when a rival crosses inside it", () => {
  const P = car("PLY", 1000, 60, { isPlayer: true, local: true, penalty: 5 }), R = car("RIV", 820, 60), X = car("XXX", 500, 60), Y = car("YYY", 400, 60);
  const r = race({ cars: [P, R, X, Y] });
  r.step(0.05, 100);
  P.finished = true; r.step(0.05, 60);         // 3 s: RIV is still running, inside the 5 s
  assert.ok(!r.said.some((s) => /WIN|RACE WINNER|WHAT A DRIVE/.test(s.msg)), "called the win before the penalty ran out: " + JSON.stringify(r.said));
  R.finished = true; r.step(0.05, 80);         // RIV crosses 3 s after: classified ahead on the corrected clock
  const result = r.said.filter((s) => s.kind === "race" && /P\d|WIN/.test(s.msg));
  assert.equal(result.length, 1, JSON.stringify(r.said));
  assert.match(result[0].msg, /P2/);
  assert.doesNotMatch(result[0].msg, /WIN|RACE WINNER|WHAT A DRIVE/);
});

test("a penalised player flagged last still hears the result before endRace (no one left running)", () => {
  // RaceControl.finishDelay waits out a penalty only while a car is running;
  // with none left, endRace comes 2.2 s after the flag and the radio stops.
  const R = car("RIV", 1400, 60), X = car("XXX", 1300, 60), P = car("PLY", 1000, 60, { isPlayer: true, local: true, penalty: 5 });
  const r = race({ cars: [R, X, P] });
  r.step(0.05, 100);
  R.finished = true; X.finished = true; r.step(0.05, 20);
  P.finished = true; r.step(0.05, 40);         // 2 s: inside the 2.2 s before results
  const result = r.said.filter((s) => s.kind === "race" && /P\d|WIN/.test(s.msg));
  assert.equal(result.length, 1, JSON.stringify(r.said));
  assert.match(result[0].msg, /P3/);
});

test("under a safety car a place changing is not called as a move", () => {
  const L = simCar("LLL", 2400, 60), A = simCar("AAA", 1300, 60), B = simCar("BBB", 1280, 60), P = simCar("PLY", 900, 60, { isPlayer: true });
  const r = sim([L, A, B, P], 30);
  r.radio.setComm("on");
  r.step(30);
  r.caution(3); for (const c of [L, A, B, P]) c.speed = 30;
  r.step(20); const t0 = r.G.raceT;
  B.prog = A.prog + 10; r.step(15);               // waved through, or A slowing with a problem
  assert.ok(!r.lines(t0).some((m) => /MOVE|PAST|THROUGH|FAVOUR|BACK FROM|GREAT/.test(m)), r.lines(t0).join(" | "));
});

test("a lap that ends green but ran under a VSC is not called slow", () => {
  const A = simCar("AAA", 1300, 60), P = simCar("PLY", 1000, 60, { isPlayer: true }), B = simCar("BBB", 700, 60);
  const r = sim([A, P, B], 30);
  const store = new Map([["radioChat", "chatty"]]);
  r.G.store = { get: (k, d) => (store.has(k) ? store.get(k) : d), set: (k, v) => store.set(k, v) };
  r.radio.setChat("chatty");
  r.step(250);                                     // five green laps: a best to compare with
  r.caution(2); for (const c of [A, P, B]) c.speed = 25;
  r.step(40);
  r.caution(0); for (const c of [A, P, B]) c.speed = 60;
  const t0 = r.G.raceT;
  r.step(60);                                      // the neutralised lap ends green
  assert.ok(!r.lines(t0).some((m) => /OFF\. RESET|LOST TIME|SLOW/.test(m)), r.lines(t0).join(" | "));
});


test("everyone in: a penalty-held finish is released before endRace, not lost", () => {
  const ctx = vm.createContext({ Math, console, Object, Array, Number, JSON, isFinite, Map, Set });
  seedLog(ctx); ctx.window = ctx;
  for (const f of ["js/race/race-facts.js", "js/race/race-control.js"]) vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: f });
  const RF = vm.runInContext("RaceFacts", ctx), RC = vm.runInContext("RaceControl", ctx);
  const facts = RF.create();
  const p = { isPlayer: true, human: true, name: "You", prog: 0, lap: 1, penalty: 0 };
  const ai = { name: "Rival", prog: 10, lap: 1, penalty: 0 };
  const G = { player: p, cars: [ai, p], track: { total: 5000 }, raceT: 0, state: "race", lapsTarget: 3, cautionLevel: () => 0 };
  let resultT = 0, ended = null; const evs = [];
  for (let i = 0; i < 4000 && ended == null; i++) {
    G.raceT += 0.05;
    for (const c of G.cars) if (!c.finished) { c.prog += 4; if (c.prog >= 15000) { c.finished = true; c.finishT = G.raceT; c.lap = 4; } }
    if (G.raceT > 1 && !p.penalty) p.penalty = 5;   // a +5 s track-limits penalty
    const { ev } = facts.observe(G, 0.05);
    for (const e of ev) if (e.type === "finish") evs.push({ car: e.car.name, pos: e.pos, t: +G.raceT.toFixed(2) });
    if (resultT === 0) resultT = RC.finishDelay(G.cars, G.raceT, G.lapsTarget);
    if (resultT > 0 && (resultT -= 0.05) <= 0) ended = +G.raceT.toFixed(2);
  }
  assert.ok(ended != null, "the race ended");
  assert.ok(evs.some((e) => e.car === "You"), "the last car home with a penalty still gets its finish (and its engineer line) before endRace");
});
