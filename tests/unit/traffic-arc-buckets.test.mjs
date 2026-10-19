/* traffic-arc-buckets.test.mjs — wrap-aware arc buckets vs the full-field
 * updateCar traffic / slipstream / OT-ahead walks. The O(n) ranked scan had
 * to stay wrap-aware (a lapped car is a lap away in rank and beside you on
 * the road); collide.js already buckets that topology. This file is the
 * production-vs-brute-force check: same roomL/R, nearbyN, sep, blocker, towCar,
 * chaser, player tow, OT ahead. Zero per-tick allocation is a source pin.
 *
 * Run: node --test tests/unit/traffic-arc-buckets.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BLOCKER_HALF_W = 2.2, TOW_HALF_W = 4, TOW_RANGE = 34;
const TRAFFIC_BUCKET_M = TOW_RANGE;

function loadCollide() {
  const ctx = vm.createContext({
    Math, Number, Object, WeakMap,
    Log: { info() {}, enabled() { return false; } },
    IncidentSim: { owns: () => false, notifyCar() {} },
    DebrisWorld: { active: () => false },
    Tracks: { wallAt: () => 100 },
  });
  for (const path of [
    "js/core/mat4.js",
    "js/physics/ai-drive.js",
    "js/physics/contact-geometry.js",
    "js/physics/collide.js",
  ]) {
    vm.runInContext(readFileSync(join(ROOT, path), "utf8"), ctx);
  }
  return vm.runInContext("Collide", ctx);
}

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function makeField(seed, L) {
  const rnd = mulberry32(seed);
  const cars = [];
  for (let i = 0; i < 22; i++) {
    const prog = rnd() * L;
    cars.push({
      id: i, prog, _snapProg: prog, x: (rnd() - 0.5) * 14, _snapX: 0,
      finished: false, retired: false, passFailOf: null, passFailT: 0,
    });
    cars[i]._snapX = cars[i].x;
  }
  // S/F wrap pair — beside on the road, far in unwrapped metres.
  cars[0].prog = 2; cars[0]._snapProg = 2; cars[0].x = 0; cars[0]._snapX = 0;
  cars[1].prog = L - 3; cars[1]._snapProg = L - 3; cars[1].x = 0.4; cars[1]._snapX = 0.4;
  cars[2].prog = 2 + L; cars[2]._snapProg = 2 + L; cars[2].x = -1.1; cars[2]._snapX = -1.1;
  cars[3].prog = 2 - 70; cars[3]._snapProg = 2 - 70; cars[3].x = 0.15; cars[3]._snapX = 0.15;
  cars[4].prog = 8; cars[4]._snapProg = 8; cars[4].x = 0.2; cars[4]._snapX = 0.2; cars[4].finished = true;
  // Park the random remainder far from ego's 72 m window so wrap/lapped/chaser
  // are the only traffic ego can see.
  for (let i = 5; i < 22; i++) {
    const p = 400 + i * 200;
    cars[i].prog = cars[i]._snapProg = p;
    cars[i].x = cars[i]._snapX = (i % 3) - 1;
  }
  cars[6].prog = cars[6]._snapProg = cars[5].prog + 20;
  cars[6].retired = true;   // traffic still sees it; tow / OT skip it
  // A slow car 90 m ahead of ego: only the closing-speed BLOCKER reach (#2565) sees it.
  cars[7].prog = cars[7]._snapProg = 92; cars[7].x = cars[7]._snapX = 0.5;
  for (const o of cars) { o.speed = 55; o._snapSpeed = o === cars[7] ? 0 : 55; }
  return cars;
}

// One brute-force reference with the CURRENT production semantics, walking every
// car (no buckets). Finishers are still cars on the road: they block, take room
// and sit alongside, but give no tow and chase nobody. Retired cars are NOT
// skipped by the traffic scan (they are by tow / OT). The BLOCKER reaches past
// 34 m by closing speed (#2565); that reach also widens the cheap-reject window.
const BRAKE_PLAN = 0.5 * 22;
const blockerReach = (closing) => (closing > 0 ? Math.min(160, 10 + closing * closing / (2 * BRAKE_PLAN)) : 0);
const wrapD = (d, L) => ((d + L / 2) % L + L) % L - L / 2;

function refTraffic(c, ranked, L, BACK, REJ0, MIN_GAP, street) {
  let roomL = 12 + c.x, roomR = 12 - c.x;
  let blocker = null, blockerGap = Infinity, towCar = null, towGap = Infinity;
  let chaser = null, chaserGap = Infinity, nearbyN = 0, sep = 0;
  let alongO = null, alongAdx = Infinity;
  const REJ = Math.max(REJ0, blockerReach(c.speed));
  for (const o of ranked) {
    if (o === c) continue;
    const raw = o._snapProg - c.prog;
    if (Math.abs(raw) > REJ && Math.abs(raw) < L - REJ) continue;
    const dprog = wrapD(raw, L);
    if (dprog < -BACK) continue;
    if (dprog > TOW_RANGE) {
      if (dprog < blockerGap && dprog < blockerReach(c.speed - (o._snapSpeed || 0)) &&
          Math.abs(o._snapX - c.x) < BLOCKER_HALF_W) { blocker = o; blockerGap = dprog; }
      continue;
    }
    const dx = o._snapX - c.x, adp = Math.abs(dprog);
    if (adp < 5.5) {
      if (dx >= 0) roomR = Math.min(roomR, Math.abs(dx) - 1.0);
      else roomL = Math.min(roomL, Math.abs(dx) - 1.0);
      if (Math.abs(dx) < alongAdx) { alongO = o; alongAdx = Math.abs(dx); }
    }
    if (adp < 6.5) {
      nearbyN++;
      const deficit = MIN_GAP - Math.abs(dx);
      if (deficit > 0) sep += (dx <= 0 ? 1 : -1) * deficit * (1 - adp / 6.5);
    }
    const blockW = o === c.passFailOf && c.passFailT > 0 && !street ? 6 : BLOCKER_HALF_W;
    if (dprog > 0.5 && dprog < blockerGap && Math.abs(dx) < blockW) { blocker = o; blockerGap = dprog; }
    if (o.finished) continue;
    if (dprog > 0.5 && dprog < towGap && Math.abs(dx) < TOW_HALF_W) { towCar = o; towGap = dprog; }
    const chaseW = !street && -dprog < 0.5 * Math.max(c.speed, 10) ? 5.5 : 3;
    if (dprog < -0.5 && -dprog < chaserGap && Math.abs(dx) < chaseW) { chaser = o; chaserGap = -dprog; }
  }
  return { roomL: Math.max(0, roomL), roomR: Math.max(0, roomR), nearbyN, sep, blocker, blockerGap, towCar, towGap, chaser, chaserGap, alongO };
}

function refTow(c, ranked, L) {
  let tc = null, tg = Infinity;
  for (const o of ranked) {
    if (o === c || o.finished || o.retired) continue;
    const raw = o._snapProg - c.prog;
    if (Math.abs(raw) > TOW_RANGE + 0.1 && Math.abs(raw) < L - TOW_RANGE - 0.1) continue;
    const dprog = wrapD(raw, L);
    if (dprog > 0.5 && dprog < tg && Math.abs(o._snapX - c.x) < TOW_HALF_W) { tc = o; tg = dprog; }
  }
  return { tc, tg };
}

function refOt(c, ranked, L, otW) {
  let ahead = null, gapAhead = Infinity;
  for (const o of ranked) {
    if (o === c || o.finished || o.retired) continue;
    const dp = o._snapProg - c.prog;
    if (Math.abs(dp) > otW && Math.abs(dp) < L - otW) continue;
    const d = wrapD(dp, L);
    if (d > 0.5 && d < gapAhead) { ahead = o; gapAhead = d; }
  }
  return { ahead, gapAhead };
}

function snapEq(a, b, keys) {
  for (const k of keys) {
    const va = a[k], vb = b[k];
    if (va === vb) continue;
    if (typeof va === "number" && typeof vb === "number") {
      assert.ok(Number.isFinite(va) && Number.isFinite(vb) && Math.abs(va - vb) < 1e-9, `${k}: ${va} vs ${vb}`);
    } else {
      assert.equal(va, vb, k);
    }
  }
}

test("fillArcBuckets / forArcNear are on Collide and allocation-free after warmup", () => {
  const Collide = loadCollide();
  assert.equal(typeof Collide.fillArcBuckets, "function");
  assert.equal(typeof Collide.forArcNear, "function");
  const L = 6200;
  const ranked = makeField(20261006, L);
  const nB = Collide.fillArcBuckets(ranked, L, TRAFFIC_BUCKET_M, (c) => c._snapProg);
  assert.ok(nB > 10);
  let first = 0;
  Collide.forArcNear(ranked[0], L, 72, () => { first++; }, (c) => c.prog);
  assert.ok(first >= 2, "wrap + lapped neighbours must be visited");
  const src = readFileSync(join(ROOT, "js/physics/collide.js"), "utf8");
  // `arr.length = 0` drops V8's backing store, so every refill regrew it (measured: ~5 KB/frame at 22 cars).
  assert.ok(src.includes("_arcN[id] = 0") && !src.includes("arr.length = 0"), "bucket clear must keep the arrays and reset a count");
  assert.match(src, /function fillArcBuckets/);
  assert.match(src, /function forArcNear/);
});

test("seeded 22-car run: production scanTraffic/scanTow/scanOtAhead match a brute-force reference", () => {
  const Collide = loadCollide();
  const L = 6200, BACK = 72, REJ = 72.1, MIN_GAP = 2.8, street = false;
  const keys = ["roomL", "roomR", "nearbyN", "sep", "blocker", "blockerGap", "towCar", "towGap", "chaser", "chaserGap", "alongO"];
  const ranked = makeField(20261006, L);
  Collide.fillArcBuckets(ranked, L, TRAFFIC_BUCKET_M, (c) => c._snapProg);
  let ots = 0;
  for (const c of ranked) {
    const want = refTraffic(c, ranked, L, BACK, REJ, MIN_GAP, street);
    const got = Collide.scanTraffic(c, L, BACK, REJ, MIN_GAP, street, 12 + c.x, 12 - c.x);
    snapEq(want, got, keys);
    const otW = 1.0 * c.speed + 1;
    const otWant = refOt(c, ranked, L, otW);
    const otGot = Collide.scanOtAhead(c, L, otW);
    assert.equal(otGot.ahead, otWant.ahead, "ot ahead " + c.id);
    assert.ok(otGot.gapAhead === otWant.gapAhead || Math.abs(otGot.gapAhead - otWant.gapAhead) < 1e-9, "ot gap " + c.id);
    if (otWant.ahead) ots++;
    const towWant = refTow(c, ranked, L);
    const towGot = Collide.scanTow(c, L);
    assert.equal(towGot.tc, towWant.tc, "tow " + c.id);
    assert.ok(towGot.tg === towWant.tg || Math.abs(towGot.tg - towWant.tg) < 1e-9, "tow gap " + c.id);
  }
  assert.ok(ots > 0, "seed must place at least one OT-ahead pair");
  // Pin the scenarios the reference is meant to exercise, so it cannot go vacuous.
  const ego = ranked[0];
  const e = Collide.scanTraffic(ego, L, BACK, REJ, MIN_GAP, street, 12 + ego.x, 12 - ego.x);
  assert.equal(e.alongO, ranked[1], "wrap neighbour beside ego");
  assert.ok(e.nearbyN >= 2, "lapped car beside ego counts as nearby");
  assert.equal(e.chaser, ranked[1], "nearest wrap chaser (5 m behind at S/F)");
  assert.equal(e.blocker, ranked[4], "a FINISHED car 6 m ahead still blocks (collide.js keeps finishers)");
  assert.equal(e.towCar, null, "a finisher gives no tow");
  const tow = Collide.scanTow(ranked[5], L);
  assert.equal(tow.tc, null, "a retired car gives no tow");
  const far = Collide.scanTraffic(ranked[5], L, BACK, REJ, MIN_GAP, street, 12, 12);
  assert.equal(far.blocker, ranked[6], "a retired car still blocks the traffic scan");
  const only = [ranked[0], ranked[3]];
  Collide.fillArcBuckets(only, L, TRAFFIC_BUCKET_M, (c) => c._snapProg);
  const lone = Collide.scanTraffic(ranked[0], L, BACK, REJ, MIN_GAP, street, 12, 12);
  assert.equal(lone.chaser, ranked[3], "70 m chaser still seen");
});

test("game.js traffic / slipstream / OT-ahead use forArcNear, not a ranked walk", () => {
  const src = readFileSync(join(ROOT, "js/game.js"), "utf8");
  const start = src.indexOf("AI traffic awareness");
  const end = src.indexOf("// --- braking / target speed ---");
  assert.ok(start > 0 && end > start);
  const region = src.slice(start, end);
  assert.ok(src.includes("Collide.fillArcBuckets(ranked"));
  assert.ok(region.includes("Collide.scanTraffic"));
  assert.ok(!/for\s*\(\s*let\s+i\s*=\s*0;\s*i\s*<\s*ranked\.length/.test(region),
    "AI traffic region must not walk ranked[]");
  const slip = src.slice(src.indexOf("PLAYER SLIPSTREAM"), src.indexOf("// AI: multi-sample brake target"));
  assert.ok(slip.includes("Collide.scanTow"));
  assert.ok(!/for\s*\(\s*let\s+i\s*=\s*0;\s*i\s*<\s*ranked\.length/.test(slip));
  const ot = src.slice(src.indexOf("overtake mode"), src.indexOf("PLAYER SLIPSTREAM"));
  assert.ok(ot.includes("Collide.scanOtAhead"));
});

// #2565: scanTraffic never reported a BLOCKER beyond 34 m, whatever the closing
// speed, so an AI at 50 m/s learned of a parked car only inside its stopping
// distance. The BLOCKER reach now grows with closing speed (stop distance at half
// braking + margin); tow, chaser and along stay at 34 and pack racing is unchanged.
test("scanTraffic: a parked car 80 m ahead is a BLOCKER at 50 m/s closing, not at pack speeds", () => {
  const Collide = loadCollide();
  const L = 6200;
  const mk = (id, prog, x, speed) => ({ id, prog, _snapProg: prog, x, _snapX: x, speed, _snapSpeed: speed, finished: false, retired: false, passFailOf: null, passFailT: 0 });
  const scan = (egoSpeed, gap, otherSpeed) => {
    const ego = mk(0, 1000, 0, egoSpeed), other = mk(1, 1000 + gap, 0.3, otherSpeed);
    const ranked = [ego, other];
    Collide.fillArcBuckets(ranked, L, TRAFFIC_BUCKET_M, (c) => c._snapProg);
    return Collide.scanTraffic(ego, L, 13, 34.1, 2.8, false, 12, 12);
  };
  const fast = scan(50, 80, 0);
  assert.equal(fast.blocker && fast.blocker.id, 1, "parked car at 80 m, AI at 50 m/s: reported");
  assert.equal(fast.blockerGap, 80);
  assert.equal(fast.towCar, null, "tow stays inside 34 m");
  assert.equal(fast.chaser, null);
  assert.equal(scan(50, 200, 0).blocker, null, "beyond the reach cap it is still unseen");
  // Pack racing: 0 and 10 m/s closing see nothing beyond 34 m, exactly as before.
  assert.equal(scan(55, 60, 55).blocker, null, "0 closing at 60 m: no blocker");
  assert.equal(scan(55, 60, 45).blocker, null, "10 m/s closing at 60 m: no blocker");
  assert.equal(scan(55, 30, 55).blocker && scan(55, 30, 55).blocker.id, 1, "inside 34 m is unchanged");
});
