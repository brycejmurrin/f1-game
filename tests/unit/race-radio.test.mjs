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
    store: { get: (k, d) => (store.has(k) ? store.get(k) : d), set: (k, v) => store.set(k, v) },
    announce: (msg, dur, kind) => { said.push({ t: +G.raceT.toFixed(2), msg, kind }); return true; },
  };
  const radio = RR.create(G, { seed: 3 });
  function step(dt, n = 1) {
    for (let i = 0; i < n; i++) {
      G.raceT += dt;
      for (const c of cars) {
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
  const G = { state: "race", raceT: 0, cars: [a, b], player: b, track: { total: LAP }, cautionInfo: () => ({ level: 0 }) };
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
  const G = { state: "race", raceT: 0, cars: [a, b, p], player: p, track: { total: LAP }, cautionInfo: () => ({ level: 0 }) };
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

test("a car in the pit lane is not overtaken — that is a pit stop", () => {
  const f = RF.create();
  const a = car("AAA", 1000, 60), b = car("BBB", 950, 60), p = car("PLY", 500, 60, { isPlayer: true });
  const G = { state: "race", raceT: 0, cars: [a, b, p], player: p, track: { total: LAP }, cautionInfo: () => ({ level: 0 }) };
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
  const r = race({ laps: 2 });
  r.step(0.05, 40);
  const p = r.G.player;
  p.finished = true; p.finPos = 3;
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

test("RaceRadio reads and writes only its own two settings", () => {
  const r = race();
  assert.equal(r.radio.chat(), "normal");
  assert.equal(r.radio.comm(), "tv");
  r.radio.setChat("chatty"); r.radio.setComm("on");
  assert.equal(r.store.get("radioChat"), "chatty");
  assert.equal(r.store.get("commentary"), "on");
  assert.equal(r.radio.setChat("loud"), "chatty", "an unknown level is refused");
});
