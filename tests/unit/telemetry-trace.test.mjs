// Data hub TELEMETRY — GPS trace sanity (js/data/telemetry.js + js/data/api.js).
//
// The track map is FITTED to the samples that come back, so a single bad sample
// is not a local blemish: it rescales and re-centres the whole circuit, and the
// same track then reads as a different shape in one session than another (the
// reported "Hungary race map doesn't match the qualifying map"). These assert
// the two defences — stray rejection and gap detection — on synthetic laps,
// with no DOM, canvas or network in sight.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const ctx = vm.createContext({});
seedLog(ctx);
// js/core/mat4.js first — the shared scalar helpers (M4.clamp) telemetry.js binds at eval.
vm.runInContext(readFileSync("js/core/mat4.js", "utf8"), ctx, { filename: "mat4.js" });
vm.runInContext(readFileSync("js/data/telemetry.js", "utf8"), ctx, { filename: "telemetry.js" });
const T = vm.runInContext("DataTelemetry", ctx);

// A closed, oval-ish lap in track-local units at ~3.7 Hz, like the real feed.
function lap(n = 400, dtMs = 270) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    out.push({ x: 3000 + 1800 * Math.cos(a), y: 4000 + 1500 * Math.sin(a), date: 1e12 + i * dtMs });
  }
  return out;
}
const bounds = (l) => T._locBounds(T._dropStrays(l));

test("a stray sample does not move the fitted bounds", () => {
  const clean = bounds(lap());
  for (const stray of [{ x: 0, y: 0 }, { x: -9000, y: 12000 }, { x: 3000, y: -20000 }]) {
    const withStray = bounds(lap().concat([{ ...stray, date: 1e12 + 401 * 270 }]));
    assert.ok(Math.abs(withStray.spanx - clean.spanx) < 1, `spanx moved for ${JSON.stringify(stray)}`);
    assert.ok(Math.abs(withStray.spany - clean.spany) < 1, `spany moved for ${JSON.stringify(stray)}`);
  }
});

test("the lap's own extremities survive — only outliers go", () => {
  const l = lap();
  const kept = T._dropStrays(l);
  assert.equal(kept.length, l.length);
  // the four cardinal extremes of the oval are all still there
  const b = T._locBounds(kept);
  assert.ok(Math.abs(b.spanx - 3600) < 1 && Math.abs(b.spany - 3000) < 1);
});

test("a real excursion is kept rather than truncated", () => {
  // A quarter of the lap displaced (a long pit-lane spur, a spun car) is not a
  // stray — dropping that much would draw a lap the driver never did.
  const l = lap();
  for (let i = 0; i < 100; i++) l[i].y += 4000;
  assert.equal(T._dropStrays(l).length, l.length);
});

test("too few samples to judge a distribution are passed through", () => {
  const short = lap(10);
  assert.equal(T._dropStrays(short).length, 10);
  // (length, not deepEqual: these arrays are built inside the vm realm, so they
  // are not reference-equal to a test-realm [] however identical they look)
  assert.equal(T._dropStrays([]).length, 0);
  assert.equal(T._dropStrays(null).length, 0);
});

test("coverage gaps are detected, ordinary cadence is not", () => {
  const l = lap();
  const limit = T._gapLimitMs(l);
  assert.ok(limit >= 1500, "limit floors at 1.5 s");
  for (let i = 1; i < l.length; i++) assert.equal(T._isGap(l, i, limit), false);

  // drop 5 s of positioning mid-lap: the samples either side are a corner apart
  const holed = lap();
  for (let i = 200; i < holed.length; i++) holed[i].date += 5000;
  assert.equal(T._isGap(holed, 200, T._gapLimitMs(holed)), true);
  assert.equal(T._isGap(holed, 201, T._gapLimitMs(holed)), false);
});

test("locBounds never returns a degenerate transform", () => {
  for (const l of [[], [{ x: 5, y: 5, date: 1 }]]) {
    const b = T._locBounds(l);
    assert.ok(isFinite(b.minx) && isFinite(b.miny));
    assert.ok(b.spanx > 0 && b.spany > 0, "a zero span would divide by zero in the fit");
  }
});

// The feed's own dropout rows (x:0, y:0, z:0) must never reach the map at all —
// num(0) is 0, not null, so the old `!== null` filter passed them through.
test("F1API.locationData drops origin rows and unparseable timestamps", async () => {
  const rows = [
    { x: 3000, y: 4000, date: "2026-07-26T13:00:00.000Z" },
    { x: 0, y: 0, date: "2026-07-26T13:00:00.270Z" },          // positioning dropout
    { x: 3100, y: 4100, date: "not a date" },                   // unorderable
    { x: null, y: 4200, date: "2026-07-26T13:00:00.810Z" },     // missing axis
    { x: 3200, y: 4200, date: "2026-07-26T13:00:01.080Z" },
  ];
  const api = vm.createContext({
    window: {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: async () => ({ ok: true, json: async () => rows }),
    setTimeout, clearTimeout, AbortController,
    console,
  });
  api.window = api;
  seedLog(api);
  vm.runInContext(readFileSync("js/data/api.js", "utf8"), api, { filename: "api.js" });
  const F1API = vm.runInContext("F1API", api);
  const out = await F1API.locationData(9999, 4, null, null);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((p) => p.x), [3000, 3200]);
  assert.ok(out.every((p) => isFinite(p.date)));
});

// ---------------------------------------------------------------------------
// The moving dot. It is placed by locAt(view, tel, t): the lap clock -> that
// driver's own car-data timestamp -> a point interpolated between the two GPS
// fixes that bracket it. What has to hold is that it goes ROUND: forwards, once,
// all the way, at the lap's real pace — and that in comparison mode each dot
// runs on its OWN lap, not on the other driver's.
// ---------------------------------------------------------------------------

// A driver: a circular lap of `dur` seconds, GPS at ~3.7 Hz, car data at 10 Hz,
// constant speed. `phase` offsets where on the circle they start.
function driver(dur = 80, r = 1600, speedKmh = 200) {
  const t0 = 1e12;
  const loc = [], car = [];
  for (let i = 0; i * 0.27 <= dur; i++) {
    const t = i * 0.27, a = (t / dur) * 2 * Math.PI;
    loc.push({ x: 3000 + r * Math.cos(a), y: 4000 + r * Math.sin(a), date: t0 + t * 1000 });
  }
  for (let i = 0; i * 0.1 <= dur; i++) {
    const t = i * 0.1;
    car.push({ t, date: t0 + t * 1000, speed: speedKmh });
  }
  return { loc, car };
}
const angleOf = (p) => Math.atan2(p.y - 4000, p.x - 3000);
// total signed angle swept by the dot over the playback, and the largest single
// step — one full forward lap is +2π with no big jumps
function sweep(view, tel, tEnd, steps = 600) {
  let prev = angleOf(T._locAt(view, tel, 0)), total = 0, maxStep = 0;
  for (let i = 1; i <= steps; i++) {
    const p = T._locAt(view, tel, (i / steps) * tEnd);
    let d = angleOf(p) - prev;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    total += d; maxStep = Math.max(maxStep, Math.abs(d));
    prev = angleOf(p);
  }
  return { total, maxStep };
}

test("the dot completes exactly one forward lap over the lap's duration", () => {
  const p = driver(80);
  const view = { primary: p, tMax: 80, compare: null };
  const s = sweep(view, p, 80);
  assert.ok(Math.abs(s.total - 2 * Math.PI) < 0.05, `swept ${s.total.toFixed(3)} rad, want 2pi`);
  assert.ok(s.maxStep < 0.1, `dot jumped ${s.maxStep.toFixed(3)} rad in one frame`);
});

test("the dot tracks the lap clock in real time, not just at the ends", () => {
  const p = driver(80);
  const view = { primary: p, tMax: 80, compare: null };
  // at a constant 200 km/h the dot must be a quarter of the way round at t/4
  for (const f of [0.25, 0.5, 0.75]) {
    const a = angleOf(T._locAt(view, p, 80 * f));
    const want = f * 2 * Math.PI;
    const err = Math.abs(((a + 2 * Math.PI) % (2 * Math.PI)) - want);
    assert.ok(err < 0.06, `at ${f * 100}% of the lap the dot was ${err.toFixed(3)} rad out`);
  }
});

test("comparison mode: each dot runs on its OWN lap length", () => {
  // The compare driver is 4 s faster. The shared playback clock runs to the
  // SLOWER lap, so at t = 76 the compare has finished and the primary has not.
  const slow = driver(80), fast = driver(76);
  const view = { primary: slow, tMax: 80, compare: fast };
  const sSlow = sweep(view, slow, 80), sFast = sweep(view, fast, 80);
  assert.ok(Math.abs(sSlow.total - 2 * Math.PI) < 0.05, "primary lap incomplete");
  assert.ok(Math.abs(sFast.total - 2 * Math.PI) < 0.05, "compare lap incomplete");
  // and the faster driver is genuinely AHEAD on the road at mid-lap. Compare
  // swept angle, not raw atan2: past the half-lap the two wrap onto opposite
  // ends of (-pi, pi] and the faster dot reads as the smaller number.
  const aSlow = sweep(view, slow, 40).total, aFast = sweep(view, fast, 40).total;
  assert.ok(aFast > aSlow, `faster lap swept ${aFast.toFixed(3)}, slower ${aSlow.toFixed(3)}`);
  assert.ok(sFast.maxStep < 0.1 && sSlow.maxStep < 0.1, "a dot jumped");
});

test("a driver with no GPS of their own rides the path on THEIR lap, not the other's", () => {
  // Regression: this branch scaled by view.tMax (the SLOWER driver's lap), so a
  // borrowed-path dot never reached the line — it was still short of the lap
  // when its own lap had ended, permanently lagging where the driver was.
  const slow = driver(80), fast = { loc: [], car: driver(60).car };
  const view = { primary: slow, tMax: 80, compare: fast };
  const s = sweep(view, fast, 60);   // over ITS OWN 60 s lap
  assert.ok(Math.abs(s.total - 2 * Math.PI) < 0.12,
    `borrowed-path dot swept ${s.total.toFixed(3)} rad over its own lap, want 2pi`);
});
