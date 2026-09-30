/* replay-buf.test.mjs — instant-replay ring (js/camera/replay-buf.js).
 * Budget, wrap, interpolate, restore equality, solo/net scrub gates,
 * career-settle / endRace source pins. Run: node --test tests/unit/replay-buf.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/^const\b/gm, "var");

function boot() {
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Float32Array, Float64Array, Uint8Array,
    isFinite, parseFloat, parseInt,
    Log: { info() {}, debug() {}, warn() {}, enabled() { return false; } },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(src("js/camera/replay-buf.js"), ctx, { filename: "replay-buf.js" });
  return vm.runInContext("ReplayBuf", ctx);
}

function cars(n, base) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      s: (base || 0) + i, x: i * 0.1, head: 0.01 * i, speed: 50 + i,
      px: i, py: 1, pz: i * 2, steer: 0, retired: false, finished: false,
    });
  }
  return out;
}

test("budget stays under 0.7 MB for 22 cars / 20 s", () => {
  const R = boot();
  assert.ok(R.budgetOk(22, R.capacityFor(22)), "capacityFor must fit");
  assert.ok(R.frameBytes(22) * R.capacityFor(22) <= R.MAX_BYTES);
  assert.ok(R.capacityFor(22) >= R.HZ * 10, "at least 10 s at 22 cars");
});

test("sample wraps and at() interpolates; restore is bit-exact on captured fields", () => {
  const R = boot();
  const field = cars(4);
  const G = { cars: field, netPlay: { active: () => false }, paused: true };
  const api = R.create(G);
  api.reset(field);
  for (let i = 0; i < R.HZ * 3; i++) {
    for (const c of field) { c.s += 1; c.px += 0.5; }
    api.sample(i / R.HZ, field);
  }
  const w = api.window();
  assert.ok(w.frames >= R.HZ * 2, "frames=" + w.frames);
  assert.ok(w.bytes <= R.MAX_BYTES);

  const cap = R.capacityFor(4);
  for (let i = 0; i < cap + 50; i++) {
    for (const c of field) c.s += 0.5;
    api.sample(10 + i / R.HZ, field);
  }
  const w2 = api.window();
  assert.equal(w2.frames, cap, "ring never exceeds capacity");

  const mid = api.at((w2.t0 + w2.t1) / 2);
  assert.ok(mid && mid.cars.length === 4);
  assert.ok(Number.isFinite(mid.cars[0].s));

  const before = field.map((c) => ({ s: c.s, x: c.x, head: c.head, speed: c.speed, px: c.px, py: c.py, pz: c.pz, steer: c.steer }));
  assert.equal(api.beginScrub(), true);
  assert.equal(api.apply(w2.t0), true);
  assert.notEqual(field[0].s, before[0].s, "scrub moves the field");
  assert.equal(api.endScrub(), true);
  for (let i = 0; i < field.length; i++) {
    assert.equal(field[i].s, before[i].s);
    assert.equal(field[i].x, before[i].x);
    assert.equal(field[i].px, before[i].px);
    assert.equal(field[i].speed, before[i].speed);
  }
  assert.equal(api.isScrubbing(), false);
});

test("beginScrub is a no-op when netPlay is active", () => {
  const R = boot();
  const field = cars(2);
  const G = { cars: field, netPlay: { active: () => true } };
  const api = R.create(G);
  api.reset(field);
  for (let i = 0; i < R.HZ * 4; i++) api.sample(i / R.HZ, field);
  assert.equal(api.sample(1, field), false, "sampling off under netplay");
  assert.equal(api.beginScrub(), false);
});

test("module never writes Ghost storage and stays under the RAM budget constant", () => {
  const text = fs.readFileSync(path.join(ROOT, "js/camera/replay-buf.js"), "utf8");
  assert.doesNotMatch(text, /localStorage|GameStore|apex26\.ghost/);
  assert.match(text, /MAX_BYTES = 720 \* 1024/);
});

test("retirement edge auto-tags; jumpLastTag seeks; scrubbing blocks settle path in game.js", () => {
  const R = boot();
  const field = cars(2);
  const G = { cars: field, netPlay: { active: () => false } };
  const api = R.create(G);
  api.reset(field);
  for (let i = 0; i < R.HZ * 4; i++) api.sample(i / R.HZ, field);
  field[1].retired = true;
  api.sample(5, field);
  const tag = api.lastTag();
  assert.ok(tag && tag.kind === "retirement" && tag.car === 1);

  assert.equal(api.beginScrub(), true);
  assert.equal(api.jumpLastTag(), true);
  const st = api.status();
  assert.ok(Math.abs(st.scrubT - tag.t) < 1e-6);
  assert.equal(api.isScrubbing(), true);

  // Contract: endRace / career score must refuse while scrubbing (source pin —
  // a settle spy would need the full game boot; the call sites are the gate).
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  assert.match(game, /replayBuf\.isScrubbing\(\)/);
  assert.match(game, /replayBuf\.onRaceStart|replayBuf\.reset/);
  assert.match(game, /Career\.scoreRound/);
  // scoreRound must sit AFTER the scrubbing early-return in endRace.
  const scrubGate = game.indexOf("if (replayBuf.isScrubbing())");
  const score = game.indexOf("Career.scoreRound");
  assert.ok(scrubGate >= 0 && score > scrubGate, "scrub gate precedes career score");
  api.endScrub();
});
