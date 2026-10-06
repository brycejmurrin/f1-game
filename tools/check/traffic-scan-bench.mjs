#!/usr/bin/env node
/**
 * @doc Microbench: old full-field traffic/tow/OT scans vs collide arc buckets (22 and 40 cars).
 *
 * Not a test. Both paths run in the same Node VM as Collide, so the comparison
 * is the scan. Total tick = fillArcBuckets (new only) + scanTraffic per AI +
 * scanTow for the player + scanOtAhead per car. Also reports fill-only and
 * each scan with fill excluded (static field). Median of 5, ns/tick.
 *
 *   node tools/check/traffic-scan-bench.mjs
 *   node tools/check/traffic-scan-bench.mjs --json
 */
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { exitIfHelp } from "../lib/cli-args.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
exitIfHelp(process.argv.slice(2), `usage: node tools/check/traffic-scan-bench.mjs [--json]
  Times old full-field traffic/tow/OT scans vs Collide.scanTraffic/scanTow/scanOtAhead.
  Includes fillArcBuckets on the new path. 22/40/80 cars, median of 5, ns/tick.`);

const WANT_JSON = process.argv.includes("--json");

const ctx = vm.createContext({
  Math, Number, Object, WeakMap, performance,
  Log: { info() {}, enabled() { return false; } },
  IncidentSim: { owns: () => false, notifyCar() {} },
  DebrisWorld: { active: () => false },
  Tracks: { wallAt: () => 100 },
});
for (const path of [
  "js/core/mat4.js", "js/physics/ai-drive.js",
  "js/physics/contact-geometry.js", "js/physics/collide.js",
]) vm.runInContext(readFileSync(join(ROOT, path), "utf8"), ctx);

const BODY = String.raw`
(function () {
  const BLOCKER_HALF_W = 2.2, TOW_HALF_W = 4, TOW_RANGE = 34;
  const TRAFFIC_BUCKET_M = TOW_RANGE;
  const L = 6200, BACK = 72, MIN_GAP = 2.8, STREET = false;
  const REJ = Math.max(34.1, BACK + 0.1);
  const OT_W = 1.0 * 55 + 1;
  const RUNS = 5, WARM = 500, TICKS = 8000;
  function snapProgOf(c) { return c._snapProg; }

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function makeField(n, seed) {
    const rnd = mulberry32(seed);
    const cars = [];
    for (let i = 0; i < n; i++) {
      const prog = rnd() * L, x = (rnd() - 0.5) * 8;
      cars.push({
        id: i, human: i === 0, prog, _snapProg: prog, x, _snapX: x, speed: 50 + rnd() * 20,
        finished: false, retired: false, passFailOf: null, passFailT: 0,
      });
    }
    cars[0].prog = cars[0]._snapProg = 2; cars[0].x = cars[0]._snapX = 0; cars[0].speed = 55;
    if (n > 1) { cars[1].prog = cars[1]._snapProg = L - 3; cars[1].x = cars[1]._snapX = 0.4; }
    if (n > 2) { cars[2].prog = cars[2]._snapProg = 2 + L; cars[2].x = cars[2]._snapX = -1.1; }
    if (n > 3) { cars[3].prog = cars[3]._snapProg = 2 - 70; cars[3].x = cars[3]._snapX = 0.15; }
    for (let i = 4; i < n; i++) {
      const p = 800 + (i - 4) * 8;
      cars[i].prog = cars[i]._snapProg = p;
      cars[i].x = cars[i]._snapX = ((i % 3) - 1) * 1.2;
    }
    return cars;
  }
  function trafficOld(c, ranked) {
    let roomL = 12 + c.x, roomR = 12 - c.x;
    let blocker = null, blockerGap = Infinity, towCar = null, towGap = Infinity;
    let chaser = null, chaserGap = Infinity, nearbyN = 0, sep = 0;
    for (let i = 0, n = ranked.length; i < n; i++) {
      const o = ranked[i];
      if (o === c || o.finished) continue;
      let dprog = o._snapProg - c.prog;
      if (!Number.isFinite(dprog)) continue;
      const ad = dprog < 0 ? -dprog : dprog;
      if (ad > REJ && ad < L - REJ) continue;
      dprog = ((dprog + L / 2) % L + L) % L - L / 2;
      if (dprog < -BACK || dprog > 34) continue;
      const dx = o._snapX - c.x, adp = dprog < 0 ? -dprog : dprog;
      if (adp < 5.5) {
        if (dx >= 0) roomR = Math.min(roomR, Math.abs(dx) - 1.0);
        else roomL = Math.min(roomL, Math.abs(dx) - 1.0);
      }
      if (adp < 6.5) {
        nearbyN++;
        const deficit = MIN_GAP - (dx < 0 ? -dx : dx);
        if (deficit > 0) sep += (dx <= 0 ? 1 : -1) * deficit * (1 - adp / 6.5);
      }
      if (dprog > 0.5 && dprog < blockerGap && Math.abs(dx) < (o === c.passFailOf && c.passFailT > 0 && !STREET ? 6 : BLOCKER_HALF_W)) {
        blocker = o; blockerGap = dprog;
      }
      if (dprog > 0.5 && dprog < towGap && Math.abs(dx) < TOW_HALF_W) { towCar = o; towGap = dprog; }
      if (dprog < -0.5 && -dprog < chaserGap && Math.abs(dx) < (!STREET && -dprog < 0.5 * Math.max(c.speed, 10) ? 5.5 : 3)) {
        chaser = o; chaserGap = -dprog;
      }
    }
    return nearbyN + sep + (blocker ? 1 : 0) + (towCar ? 1 : 0) + (chaser ? 1 : 0) + roomL + roomR;
  }
  function towOld(c, ranked) {
    let tc = null, tg = Infinity;
    for (let i = 0, n = ranked.length; i < n; i++) {
      const o = ranked[i];
      if (o === c || o.finished || o.retired) continue;
      let dprog = o._snapProg - c.prog;
      if (!Number.isFinite(dprog)) continue;
      const ad = dprog < 0 ? -dprog : dprog;
      if (ad > TOW_RANGE + 0.1 && ad < L - TOW_RANGE - 0.1) continue;
      dprog = ((dprog + L / 2) % L + L) % L - L / 2;
      if (dprog > 0.5 && dprog < tg && Math.abs(o._snapX - c.x) < TOW_HALF_W) { tc = o; tg = dprog; }
    }
    return tc ? tg : 0;
  }
  function otOld(c, ranked) {
    let ahead = null, gapAhead = Infinity;
    for (let i = 0, n = ranked.length; i < n; i++) {
      const o = ranked[i];
      if (o === c || o.finished || o.retired) continue;
      const dp = o._snapProg - c.prog, adp = dp < 0 ? -dp : dp;
      if (adp > OT_W && adp < L - OT_W) continue;
      const d = ((dp + L / 2) % L + L) % L - L / 2;
      if (d > 0.5 && d < gapAhead) { ahead = o; gapAhead = d; }
    }
    return ahead ? gapAhead : 0;
  }
  function sumTraf(ts) {
    return ts.nearbyN + ts.sep + (ts.blocker ? 1 : 0) + (ts.towCar ? 1 : 0) + (ts.chaser ? 1 : 0);
  }
  function tickOld(ranked) {
    let acc = 0;
    for (let i = 0, n = ranked.length; i < n; i++) {
      const c = ranked[i];
      if (!c.human) acc += trafficOld(c, ranked);
      else acc += towOld(c, ranked);
      acc += otOld(c, ranked);
    }
    return acc;
  }
  function tickNew(ranked) {
    let acc = 0;
    Collide.fillArcBuckets(ranked, L, TRAFFIC_BUCKET_M, snapProgOf);
    for (let i = 0, n = ranked.length; i < n; i++) {
      const c = ranked[i];
      if (!c.human) acc += sumTraf(Collide.scanTraffic(c, L, BACK, REJ, MIN_GAP, STREET, 12 + c.x, 12 - c.x));
      else {
        const tw = Collide.scanTow(c, L);
        acc += tw.tc ? tw.tg : 0;
      }
      const ot = Collide.scanOtAhead(c, L, OT_W, null);
      acc += ot.ahead ? ot.gapAhead : 0;
    }
    return acc;
  }
  function tickFill(ranked) {
    return Collide.fillArcBuckets(ranked, L, TRAFFIC_BUCKET_M, snapProgOf);
  }
  function tickTrafficOld(ranked) {
    let acc = 0;
    for (let i = 0, n = ranked.length; i < n; i++) {
      if (!ranked[i].human) acc += trafficOld(ranked[i], ranked);
    }
    return acc;
  }
  function tickTrafficNew(ranked) {
    let acc = 0;
    for (let i = 0, n = ranked.length; i < n; i++) {
      const c = ranked[i];
      if (!c.human) acc += sumTraf(Collide.scanTraffic(c, L, BACK, REJ, MIN_GAP, STREET, 12 + c.x, 12 - c.x));
    }
    return acc;
  }
  function tickTowOld(ranked) {
    return towOld(ranked[0], ranked);
  }
  function tickTowNew(ranked) {
    const tw = Collide.scanTow(ranked[0], L);
    return tw.tc ? tw.tg : 0;
  }
  function tickOtOld(ranked) {
    let acc = 0;
    for (let i = 0, n = ranked.length; i < n; i++) acc += otOld(ranked[i], ranked);
    return acc;
  }
  function tickOtNew(ranked) {
    let acc = 0;
    for (let i = 0, n = ranked.length; i < n; i++) {
      const ot = Collide.scanOtAhead(ranked[i], L, OT_W, null);
      acc += ot.ahead ? ot.gapAhead : 0;
    }
    return acc;
  }
  function nsPerTick(fn) {
    for (let i = 0; i < WARM; i++) fn();
    const t0 = performance.now();
    let acc = 0;
    for (let i = 0; i < TICKS; i++) acc += fn();
    const t1 = performance.now();
    if (!Number.isFinite(acc)) throw new Error("scan produced non-finite checksum");
    return (t1 - t0) * 1e6 / TICKS;
  }
  function median(xs) {
    const a = xs.slice().sort(function (x, y) { return x - y; });
    return a[(a.length - 1) >> 1];
  }
  function pair(oldFn, newFn) {
    const oldNs = [], newNs = [];
    for (let r = 0; r < RUNS; r++) {
      oldNs.push(nsPerTick(oldFn));
      newNs.push(nsPerTick(newFn));
    }
    const oldM = median(oldNs), newM = median(newNs);
    return { oldNs: oldM, newNs: newM, deltaPct: (oldM - newM) / oldM * 100, oldRuns: oldNs, newRuns: newNs };
  }
  function solo(fn) {
    const xs = [];
    for (let r = 0; r < RUNS; r++) xs.push(nsPerTick(fn));
    return { ns: median(xs), runs: xs };
  }
  function benchN(n, seed) {
    const ranked = makeField(n, seed);
    Collide.fillArcBuckets(ranked, L, TRAFFIC_BUCKET_M, snapProgOf);
    const total = pair(function () { return tickOld(ranked); }, function () { return tickNew(ranked); });
    const fill = solo(function () { return tickFill(ranked); });
    // Scans below assume buckets are already filled (field is static). Total
    // new includes one fill; fill + traffic.new + tow.new + ot.new ~= total.new.
    Collide.fillArcBuckets(ranked, L, TRAFFIC_BUCKET_M, snapProgOf);
    const traffic = pair(function () { return tickTrafficOld(ranked); }, function () { return tickTrafficNew(ranked); });
    const tow = pair(function () { return tickTowOld(ranked); }, function () { return tickTowNew(ranked); });
    const ot = pair(function () { return tickOtOld(ranked); }, function () { return tickOtNew(ranked); });
    return { n, total: total, fill: fill, traffic: traffic, tow: tow, ot: ot };
  }
  return {
    L: L, BACK: BACK, ticks: TICKS, runs: RUNS,
    rows: [benchN(22, 20261006), benchN(40, 20261006), benchN(80, 20261006)],
  };
})()
`;

const out = vm.runInContext(BODY, ctx);

function fmtDelta(pct) {
  const sign = pct >= 0 ? "-" : "+";
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

if (WANT_JSON) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log(`traffic-scan-bench  L=${out.L}  BACK=${out.BACK}  ticks=${out.ticks}  median of ${out.runs}`);
  console.log("n    part       old ns/tick   new ns/tick   vs old");
  for (const r of out.rows) {
    console.log(
      `${String(r.n).padEnd(4)} total    ${r.total.oldNs.toFixed(0).padStart(12)} ${r.total.newNs.toFixed(0).padStart(13)}   ${fmtDelta(r.total.deltaPct)}`
    );
    console.log(
      `     fill      ${"—".padStart(12)} ${r.fill.ns.toFixed(0).padStart(13)}   (new only)`
    );
    console.log(
      `     traffic   ${r.traffic.oldNs.toFixed(0).padStart(12)} ${r.traffic.newNs.toFixed(0).padStart(13)}   ${fmtDelta(r.traffic.deltaPct)}  (fill excluded)`
    );
    console.log(
      `     tow       ${r.tow.oldNs.toFixed(0).padStart(12)} ${r.tow.newNs.toFixed(0).padStart(13)}   ${fmtDelta(r.tow.deltaPct)}  (fill excluded)`
    );
    console.log(
      `     ot        ${r.ot.oldNs.toFixed(0).padStart(12)} ${r.ot.newNs.toFixed(0).padStart(13)}   ${fmtDelta(r.ot.deltaPct)}  (fill excluded)`
    );
  }
  const r22 = out.rows[0];
  console.log(r22.total.deltaPct >= 30
    ? `22-car scan is ${r22.total.deltaPct.toFixed(1)}% faster (meets ~30% bar).`
    : `22-car scan is ${r22.total.deltaPct >= 0 ? r22.total.deltaPct.toFixed(1) + "% faster" : Math.abs(r22.total.deltaPct).toFixed(1) + "% slower"} — not ~30% faster.`);
}
