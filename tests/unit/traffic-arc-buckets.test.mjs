/* traffic-arc-buckets.test.mjs — wrap-aware arc buckets vs the full-field
 * updateCar traffic / slipstream / OT-ahead walks. The O(n) ranked scan had
 * to stay wrap-aware (a lapped car is a lap away in rank and beside you on
 * the road); collide.js already buckets that topology. This file is the
 * old-vs-new characterization: same roomL/R, nearbyN, sep, blocker, towCar,
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
  return cars;
}

function scanTrafficFull(c, ranked, L, BACK, MIN_GAP, street) {
  let roomL = 12 + c.x, roomR = 12 - c.x;
  let blocker = null, blockerGap = Infinity;
  let towCar = null, towGap = Infinity;
  let chaser = null, chaserGap = Infinity;
  let nearbyN = 0, sep = 0;
  let alongO = null, alongDx = 0, alongDprog = 0, alongAdx = Infinity;
  const REJ = Math.max(34.1, BACK + 0.1);
  for (let i = 0; i < ranked.length; i++) {
    const o = ranked[i];
    if (o === c || o.finished) continue;
    let dprog = o._snapProg - c.prog;
    if (!Number.isFinite(dprog)) continue;
    const ad = dprog < 0 ? -dprog : dprog;
    if (ad > REJ && ad < L - REJ) continue;
    dprog = ((dprog + L / 2) % L + L) % L - L / 2;
    if (dprog < -BACK || dprog > 34) continue;
    const dx = o._snapX != null ? o._snapX - c.x : o.x - c.x;
    const adp = dprog < 0 ? -dprog : dprog;
    if (adp < 5.5) {
      if (dx >= 0) roomR = Math.min(roomR, Math.abs(dx) - 1.0);
      else roomL = Math.min(roomL, Math.abs(dx) - 1.0);
      const adx = dx < 0 ? -dx : dx;
      if (adx < alongAdx) { alongO = o; alongDx = dx; alongDprog = dprog; alongAdx = adx; }
    }
    if (adp < 6.5) {
      nearbyN++;
      const deficit = MIN_GAP - (dx < 0 ? -dx : dx);
      if (deficit > 0) sep += (dx <= 0 ? 1 : -1) * deficit * (1 - adp / 6.5);
    }
    if (dprog > 0.5 && dprog < blockerGap && Math.abs(dx) < (o === c.passFailOf && c.passFailT > 0 && !street ? 6 : BLOCKER_HALF_W)) {
      blocker = o; blockerGap = dprog;
    }
    if (dprog > 0.5 && dprog < towGap && Math.abs(dx) < TOW_HALF_W) { towCar = o; towGap = dprog; }
    if (dprog < -0.5 && -dprog < chaserGap && Math.abs(dx) < (!street && -dprog < 0.5 * Math.max(c.speed || 0, 10) ? 5.5 : 3)) {
      chaser = o; chaserGap = -dprog;
    }
  }
  roomL = Math.max(0, roomL); roomR = Math.max(0, roomR);
  return { roomL, roomR, nearbyN, sep, blocker, blockerGap, towCar, towGap, chaser, chaserGap, alongO, alongDx, alongDprog };
}

function scanTrafficBuckets(Collide, c, ranked, L, BACK, MIN_GAP, street) {
  const REJ = Math.max(34.1, BACK + 0.1);
  let roomL = 12 + c.x, roomR = 12 - c.x;
  let blocker = null, blockerGap = Infinity;
  let towCar = null, towGap = Infinity;
  let chaser = null, chaserGap = Infinity;
  let nearbyN = 0, sep = 0;
  let alongO = null, alongDx = 0, alongDprog = 0, alongAdx = Infinity;
  Collide.forArcNear(c, L, REJ, function (o) {
    if (o.finished) return;
    let dprog = o._snapProg - c.prog;
    if (!Number.isFinite(dprog)) return;
    const ad = dprog < 0 ? -dprog : dprog;
    if (ad > REJ && ad < L - REJ) return;
    dprog = ((dprog + L / 2) % L + L) % L - L / 2;
    if (dprog < -BACK || dprog > 34) return;
    const dx = o._snapX != null ? o._snapX - c.x : o.x - c.x;
    const adp = dprog < 0 ? -dprog : dprog;
    if (adp < 5.5) {
      if (dx >= 0) roomR = Math.min(roomR, Math.abs(dx) - 1.0);
      else roomL = Math.min(roomL, Math.abs(dx) - 1.0);
      const adx = dx < 0 ? -dx : dx;
      if (adx < alongAdx) { alongO = o; alongDx = dx; alongDprog = dprog; alongAdx = adx; }
    }
    if (adp < 6.5) {
      nearbyN++;
      const deficit = MIN_GAP - (dx < 0 ? -dx : dx);
      if (deficit > 0) sep += (dx <= 0 ? 1 : -1) * deficit * (1 - adp / 6.5);
    }
    if (dprog > 0.5 && dprog < blockerGap && Math.abs(dx) < (o === c.passFailOf && c.passFailT > 0 && !street ? 6 : BLOCKER_HALF_W)) {
      blocker = o; blockerGap = dprog;
    }
    if (dprog > 0.5 && dprog < towGap && Math.abs(dx) < TOW_HALF_W) { towCar = o; towGap = dprog; }
    if (dprog < -0.5 && -dprog < chaserGap && Math.abs(dx) < (!street && -dprog < 0.5 * Math.max(c.speed || 0, 10) ? 5.5 : 3)) {
      chaser = o; chaserGap = -dprog;
    }
  }, function (car) { return car.prog; });
  roomL = Math.max(0, roomL); roomR = Math.max(0, roomR);
  return { roomL, roomR, nearbyN, sep, blocker, blockerGap, towCar, towGap, chaser, chaserGap, alongO, alongDx, alongDprog };
}

function scanTowFull(c, ranked, L) {
  let tc = null, tg = Infinity;
  for (let i = 0; i < ranked.length; i++) {
    const o = ranked[i];
    if (o === c || o.finished || o.retired) continue;
    let dprog = o._snapProg - c.prog;
    if (!Number.isFinite(dprog)) continue;
    const ad = dprog < 0 ? -dprog : dprog;
    if (ad > TOW_RANGE + 0.1 && ad < L - TOW_RANGE - 0.1) continue;
    dprog = ((dprog + L / 2) % L + L) % L - L / 2;
    const dx = (o._snapX != null ? o._snapX : o.x) - c.x;
    if (dprog > 0.5 && dprog < tg && Math.abs(dx) < TOW_HALF_W) { tc = o; tg = dprog; }
  }
  return { tc, tg };
}

function scanTowBuckets(Collide, c, L) {
  let tc = null, tg = Infinity;
  const reach = TOW_RANGE + 0.1;
  Collide.forArcNear(c, L, reach, function (o) {
    if (o.finished || o.retired) return;
    let dprog = o._snapProg - c.prog;
    if (!Number.isFinite(dprog)) return;
    const ad = dprog < 0 ? -dprog : dprog;
    if (ad > reach && ad < L - reach) return;
    dprog = ((dprog + L / 2) % L + L) % L - L / 2;
    const dx = (o._snapX != null ? o._snapX : o.x) - c.x;
    if (dprog > 0.5 && dprog < tg && Math.abs(dx) < TOW_HALF_W) { tc = o; tg = dprog; }
  }, function (car) { return car.prog; });
  return { tc, tg };
}

function scanOtFull(c, ranked, L, otW) {
  let ahead = null, gapAhead = Infinity;
  for (let i = 0; i < ranked.length; i++) {
    const o = ranked[i];
    if (o === c || o.finished || o.retired) continue;
    const dp = o._snapProg - c.prog, adp = dp < 0 ? -dp : dp;
    if (adp > otW && adp < L - otW) continue;
    const d = ((dp + L / 2) % L + L) % L - L / 2;
    if (d > 0.5 && d < gapAhead) { ahead = o; gapAhead = d; }
  }
  return { ahead, gapAhead };
}

function scanOtBuckets(Collide, c, L, otW) {
  let ahead = null, gapAhead = Infinity;
  Collide.forArcNear(c, L, otW, function (o) {
    if (o.finished || o.retired) return;
    const dp = o._snapProg - c.prog, adp = dp < 0 ? -dp : dp;
    if (adp > otW && adp < L - otW) return;
    const d = ((dp + L / 2) % L + L) % L - L / 2;
    if (d > 0.5 && d < gapAhead) { ahead = o; gapAhead = d; }
  }, function (car) { return car.prog; });
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
  assert.ok(src.includes("if (arr) arr.length = 0"), "bucket clear must reuse arrays");
  assert.match(src, /function fillArcBuckets/);
  assert.match(src, /function forArcNear/);
});

test("seeded 22-car run: bucket scan matches full-field (wrap, lapped, chaser)", () => {
  const Collide = loadCollide();
  const L = 6200, BACK = 72, MIN_GAP = 2.8, street = false;
  const ranked = makeField(20261006, L);
  for (const c of ranked) c.speed = 55;
  Collide.fillArcBuckets(ranked, L, TRAFFIC_BUCKET_M, (c) => c._snapProg);
  const keys = ["roomL", "roomR", "nearbyN", "sep", "blocker", "blockerGap", "towCar", "towGap", "chaser", "chaserGap", "alongO"];
  for (const c of ranked) {
    if (c.finished) continue;
    const oldS = scanTrafficFull(c, ranked, L, BACK, MIN_GAP, street);
    const newS = scanTrafficBuckets(Collide, c, ranked, L, BACK, MIN_GAP, street);
    snapEq(oldS, newS, keys);
    const otW = 1.0 * 55 + 1;
    const otOld = scanOtFull(c, ranked, L, otW);
    const otNew = scanOtBuckets(Collide, c, L, otW);
    assert.equal(otOld.ahead, otNew.ahead, "ot ahead " + c.id);
    assert.ok(otOld.gapAhead === otNew.gapAhead || Math.abs(otOld.gapAhead - otNew.gapAhead) < 1e-9, "ot gap " + c.id);
    const towOld = scanTowFull(c, ranked, L);
    const towNew = scanTowBuckets(Collide, c, L);
    assert.equal(towOld.tc, towNew.tc, "tow " + c.id);
    assert.ok(towOld.tg === towNew.tg || Math.abs(towOld.tg - towNew.tg) < 1e-9, "tow gap " + c.id);
  }
  const ego = ranked[0];
  const egoNew = scanTrafficBuckets(Collide, ego, ranked, L, BACK, MIN_GAP, street);
  assert.equal(egoNew.alongO, ranked[1], "wrap neighbour beside ego");
  assert.ok(egoNew.nearbyN >= 2, "lapped car beside ego counts as nearby");
  assert.equal(egoNew.chaser, ranked[1], "nearest wrap chaser (5 m behind at S/F)");
  const only = [ranked[0], ranked[3]];
  Collide.fillArcBuckets(only, L, TRAFFIC_BUCKET_M, (c) => c._snapProg);
  const far = scanTrafficBuckets(Collide, ranked[0], only, L, BACK, MIN_GAP, street);
  const farOld = scanTrafficFull(ranked[0], only, L, BACK, MIN_GAP, street);
  assert.equal(far.chaser, ranked[3], "70 m chaser still seen");
  assert.equal(farOld.chaser, ranked[3]);
  const withAhead = ranked.filter((c) => !c.finished && scanOtFull(c, ranked, L, 1.0 * 55 + 1).ahead);
  assert.ok(withAhead.length > 0, "seed must place at least one OT-ahead pair");
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
