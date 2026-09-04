/* rival-audio.test.mjs — the field around you, in the player's track frame.
 *
 * Apex 26 shipped with NO opponent audio and no panner anywhere in the graph:
 * a car alongside was silent, and the mirror was the only cue you had for it.
 * This covers the half that knows about the track — js/audio/rivals.js — where
 * the bugs actually live, because every one of them is a SIGN: left/right,
 * ahead/behind, closing/opening. Get one backwards and the feature is worse
 * than silence, because it lies about where a car is.
 *
 * Run: node --test tests/unit/rival-audio.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const LAP = 1000;

function load() {
  const sb = { Math, Array, Object, Number, console };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/core/mat4.js"), "utf8"), ctx, { filename: "mat4.js" });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/physics/consts.js"), "utf8"), ctx, { filename: "consts.js" });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/audio/rivals.js"), "utf8"), ctx, { filename: "rivals.js" });
  return vm.runInContext("RivalAudio", ctx);
}

const IDLE = 5000, MAX = 15000;
function car(o) { return { s: 0, x: 0, speed: 50, rpm: IDLE, retired: false, ...o }; }
function make(cars) {
  const G = { track: { total: LAP }, cars };
  const R = load().create(G);
  // collect() returns an array built INSIDE the vm realm, whose Array.prototype
  // is not this one — and node:assert/strict makes deepEqual prototype-strict,
  // so a correct result would fail on the realm alone. Copy across the boundary.
  return { collect: (p) => [...R.collect(p)] };
}

test("a car alongside on your LEFT reads negative lateral, and on your right positive", () => {
  const me = car({ s: 500, x: 0 });
  const left = car({ s: 500, x: -3 });
  const right = car({ s: 500, x: 4 });
  const got = make([me, left, right]).collect(me);
  assert.equal(got.length, 2, "both cars are within range");
  const lats = got.map((r) => r.lat).sort((a, b) => a - b);
  assert.deepEqual(lats, [-3, 4], "lateral is metres to the RIGHT of you, signed");
  for (const r of got) assert.equal(r.arc, 0, "side by side is zero arc gap");
});

test("ahead is positive arc, behind is negative — across the start/finish wrap", () => {
  // The wrap is where an arc-frame bug hides: a car 10 m up the road from you
  // at s=995 is at s=5, and a naive subtraction calls that 990 m BEHIND.
  const me = car({ s: 995 });
  const ahead = car({ s: 5 });      // 10 m in front, over the line
  const behind = car({ s: 985 });   // 10 m back
  const got = make([me, ahead, behind]).collect(me);
  const byArc = got.slice().sort((a, b) => a.arc - b.arc);
  assert.equal(byArc.length, 2);
  assert.equal(byArc[0].arc, -10, "the car behind is 10 m behind, not 990 ahead");
  assert.equal(byArc[1].arc, 10, "the car ahead is 10 m ahead, not -990");
});

test("approach is positive only when the gap is actually CLOSING", () => {
  const me = car({ s: 500, speed: 60 });
  // A car AHEAD going slower than you: you are closing.
  let got = make([me, car({ s: 520, speed: 40 })]).collect(me);
  assert.ok(got[0].approach > 0, "catching a slower car ahead must read as approaching");
  // A car AHEAD pulling away: opening.
  got = make([me, car({ s: 520, speed: 80 })]).collect(me);
  assert.ok(got[0].approach < 0, "a car ahead pulling away must read as opening");
  // A car BEHIND going faster: closing on you.
  got = make([me, car({ s: 480, speed: 80 })]).collect(me);
  assert.ok(got[0].approach > 0, "a faster car behind must read as approaching");
  // A car BEHIND dropping back: opening.
  got = make([me, car({ s: 480, speed: 40 })]).collect(me);
  assert.ok(got[0].approach < 0, "a car behind dropping back must read as opening");
});

test("only the nearest few survive, nearest first, and the far field is dropped", () => {
  const me = car({ s: 500 });
  const field = [me];
  for (let i = 1; i <= 12; i++) field.push(car({ s: 500 + i * 5 }));   // 5..60 m ahead
  field.push(car({ s: 800 }));                                        // 300 m away
  const got = make(field).collect(me);
  assert.equal(got.length, 4, "the pool is four voices, so four rivals");
  for (let i = 1; i < got.length; i++)
    assert.ok(got[i].dist >= got[i - 1].dist, "nearest first");
  assert.deepEqual(got.map((r) => r.arc), [5, 10, 15, 20], "and they are the four nearest");
  assert.ok(got.every((r) => r.dist <= 70), "nothing beyond the audible range is returned");
});

test("retired cars and the player are never in the field", () => {
  const me = car({ s: 500 });
  const ghost = car({ s: 505, retired: true });
  const real = car({ s: 510 });
  const got = make([me, ghost, real]).collect(me);
  assert.equal(got.length, 1, "a retired car makes no noise, and you are not your own rival");
  assert.equal(got[0].arc, 10);
});

test("rev is normalised from their own rpm", () => {
  const me = car({ s: 500 });
  const idling = car({ s: 505, rpm: IDLE });
  const flat = car({ s: 510, rpm: MAX });
  const got = make([me, idling, flat]).collect(me);
  assert.equal(got[0].rev, 0, "idle is 0");
  assert.equal(got[1].rev, 1, "redline is 1");
});

test("the returned rows are reused, so a caller must read them before the next call", () => {
  // Not a wart to fix — a contract to state. This runs beside setEngine every
  // frame, and allocating a row per car would hand the GC 21 objects a frame to
  // keep four. The test exists so the reuse is deliberate and known.
  const me = car({ s: 500 });
  const R = load().create({ track: { total: LAP }, cars: [me, car({ s: 510 })] });
  const first = R.collect(me);
  const rowA = first[0];
  const second = R.collect(me);
  assert.equal(second[0], rowA, "the same row objects come back");
});

test("an empty or impossible field is quiet, not a crash", () => {
  const me = car({ s: 500 });
  assert.deepEqual(make([me]).collect(me), [], "alone on track is silence");
  assert.deepEqual(make([me]).collect(null), [], "no player yet");
  const noTrack = load().create({ track: null, cars: [me] });
  assert.deepEqual([...noTrack.collect(me)], [], "no track yet");
  const noS = load().create({ track: { total: LAP }, cars: [me, car({ s: null })] });
  assert.deepEqual([...noS.collect(me)], [], "a car with no arc position is skipped");
});
