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
import { seedDom } from "../helpers/seed-dom.mjs";
import { makeDom } from "../helpers/mini-dom.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ctx = vm.createContext({});
seedLog(ctx);
seedDom(ctx);   // telemetry.js formats lap times through Dom.fmtLap
// js/core/mat4.js first — the shared scalar helpers (M4.clamp) telemetry.js binds at eval.
vm.runInContext(readFileSync("js/core/mat4.js", "utf8"), ctx, { filename: absSrc("js/core/mat4.js") });
for (const file of [
  "js/ui/track-maps.js", "js/data/tab-utils.js", "js/data/telemetry-model.js", "js/data/telemetry-render.js",
  "js/data/telemetry-player.js", "js/data/telemetry-context.js", "js/data/telemetry-replay.js", "js/data/telemetry-view.js", "js/data/telemetry.js",
  "learn/telemetry/model.js"
]) {
  vm.runInContext(readFileSync(file, "utf8"), ctx, { filename: absSrc(file) });
}
const T = vm.runInContext("DataTelemetry", ctx);

test("the map can locate a sampled start line without extending a partial trace", () => {
  const { clipLocations, locationAtDate } = vm.runInContext("DataTelemetryModel", ctx);
  const loc = [-250, 250, 500, 750, 1000, 6000, 6250].map((date) => ({ date, x: date, y: date / 2 }));
  const clipped = clipLocations(loc, 0, 1000);
  assert.equal(clipped[0].date, 0);
  assert.equal(clipped[0].x, 0);
  assert.equal(clipped.at(-1).date, 1000);
  assert.equal(locationAtDate(loc, 2000), null, "a timing mark cannot bridge a GPS outage");
  assert.equal(clipLocations(loc.slice(1), 0, 1000)[0].date, 250, "no observed sample brackets the start");
});

test("wide Track View rotates a tall circuit to increase its fitted scale", () => {
  const renderer = vm.runInContext("DataTelemetryRender", ctx).create({ cssColor: () => "" });
  const loc = [{ x: 0, y: 0, date: 0 }, { x: 100, y: 400, date: 100 }, { x: 0, y: 150, date: 200 }];
  const brush = new Proxy({}, { get: () => () => {} });
  const view = { primary: { loc, car: [] }, mw: 800, mh: 200, map: true, mapBase: { getContext: () => brush } };
  renderer.buildMapBase(view);
  const overview = view.mapT.sc;
  view.trackOnly = true;
  renderer.buildMapBase(view);
  assert.equal(view.mapT.rotate, true);
  assert.ok(view.mapT.sc > overview * 2);
});

test("comparison map closes only the lap boundary while preserving GPS gaps", () => {
  const renderer = vm.runInContext("DataTelemetryRender", ctx).create({ cssColor: () => "comparison" });
  for (const gapped of [false, true]) for (const complete of [false, true]) {
    const loc = Array.from({ length: 12 }, (_, i) => ({
      x: 100 * Math.cos(i / 11 * Math.PI * (complete ? 1.95 : 1.5)),
      y: 100 * Math.sin(i / 11 * Math.PI * (complete ? 1.95 : 1.5)),
      date: i * 250 + (gapped && i >= 6 ? 10000 : 0)
    }));
    let start, last, segments = [], comparison;
    const labels = [];
    const drawing = new Proxy({
      beginPath() { start = last = null; segments = []; },
      moveTo(x, y) { start = last = [x, y]; },
      lineTo(x, y) { const next = [x, y]; segments.push([last, next]); last = next; },
      closePath() { segments.push([last, start]); last = start; },
      fillText(label) { labels.push(label); },
      stroke() { if (this.strokeStyle === "comparison") comparison = segments.slice(); }
    }, { get: (target, key) => key in target ? target[key] : () => {} });
    const inert = new Proxy({}, { get: () => () => {} });
    const primary = { loc, car: [], lap: { dateStart: new Date(0).toISOString() } }, compare = { loc, car: [] };
    const view = {
      primary, compare, laps: [primary, compare], colC: [1, 0, 0],
      visible: {}, visibleC: {}, sectors: [0.5, 2], tMax: 13, speedMax: 1, rpmMax: 1,
      cw: 320, ch: 200, mw: 320, mh: 320, map: true,
      chartBase: { getContext: () => inert }, mapBase: { getContext: () => drawing }
    };
    renderer.buildBases(view);
    const point = (p) => {
      const m = view.mapT;
      return [m.ox + (p.x - m.minx) * m.sc, m.H - (m.oy + (p.y - m.miny) * m.sc)];
    };
    const expected = [];
    for (let i = 1; i < loc.length; i++) {
      if (!(gapped && i === 6)) expected.push([point(loc[i - 1]), point(loc[i])]);
    }
    if (complete) expected.push([point(loc.at(-1)), point(loc[0])]);
    assert.deepEqual(comparison, expected, `gapped=${gapped}, complete=${complete}`);
    assert.deepEqual(labels, gapped ? ["S/F", "S2"] : ["S/F", "S2", "S3"],
      "an observed timing boundary gets a label, and a boundary inside a GPS gap stays unmarked");
  }
});

test("the gear map leaves gaps neutral and uses observed gear colours", () => {
  const { mapGearColor } = vm.runInContext("DataTelemetryModel", ctx);
  const renderer = vm.runInContext("DataTelemetryRender", ctx).create({ cssColor: () => "comparison" });
  const speeds = new Map([[500, 2], [1000, 3], [1500, 4], [3500, 6], [4000, 7]]);
  const car = [...speeds].map(([date, gear]) => ({ date, gear }));
  const loc = Array.from({ length: 10 }, (_, i) => ({ date: i * 500, x: i * 15, y: i }));
  const inks = [];
  const brush = new Proxy({ stroke() { if (this.lineWidth === 3.5) inks.push(this.strokeStyle); } },
    { get: (target, key) => key in target ? target[key] : () => {} });
  renderer.buildMapBase({
    primary: { car, loc }, mapMode: "gears", mw: 320, mh: 320,
    map: true, mapBase: { getContext: () => brush },
  });
  assert.deepEqual(inks, [
    "#999", mapGearColor(2), mapGearColor(3), "#999", "#999", "#999", "#999", mapGearColor(6), "#999",
  ]);
});

// #7313 R9: speedAtDate rescanned car from index 0 for every loc segment, so the
// speed map read O(loc × car) dates. It now walks a cursor, reset only by the
// closing segment's step back to loc[0].
test("the speed map walks the car trace once and keeps the reference colours", () => {
  const { mapSpeedColor, mapSpeedMax } = vm.runInContext("DataTelemetryModel", ctx);
  const renderer = vm.runInContext("DataTelemetryRender", ctx).create({ cssColor: () => "comparison" });
  let dateReads = 0;
  const car = Array.from({ length: 400 }, (_, i) => {
    const date = i * 50, speed = 100 + (i * 37) % 200;
    return { get date() { dateReads++; return date; }, speed };
  });
  const N = 200;
  const loc = Array.from({ length: N }, (_, i) => {
    const a = (i / N) * Math.PI * 2;
    return { date: i * 100 + 25, x: 1000 * Math.cos(a), y: 1000 * Math.sin(a) };
  });
  const plain = car.map((c, i) => ({ date: i * 50, speed: c.speed }));
  const vMax = mapSpeedMax(plain);
  const ref = (date) => {
    let ci = 0;
    while (ci < plain.length - 1 && plain[ci].date < date) ci++;
    return mapSpeedColor(Math.min(1, Math.max(0, plain[ci].speed / vMax)));
  };
  const want = [];
  for (let i = 1; i <= N; i++) want.push(ref(loc[i % N].date));
  const inks = [];
  const brush = new Proxy({ stroke() { if (this.lineWidth === 3.5) inks.push(this.strokeStyle); } },
    { get: (target, key) => key in target ? target[key] : () => {} });
  dateReads = 0;
  renderer.buildMapBase({
    primary: { car, loc }, mapMode: "speed", mw: 320, mh: 320,
    map: true, mapBase: { getContext: () => brush },
  });
  assert.equal(inks.length, N, "the lap closes, so every segment is inked");
  assert.deepEqual(inks, want);
  assert.ok(dateReads < 4 * (car.length + N), `car dates read ${dateReads} times`);
});

test("braking duel aligns distance and refuses clamped or missing feed intervals", () => {
  const model = vm.runInContext("DataTelemetryModel", ctx);
  function lane(speed) {
    const car = Array.from({ length: 41 }, (_, i) => ({ t: i / 4, speed, brake: i < 10 ? 0 : i < 22 ? 50 : 0, throttle: i < 10 ? 100 : i < 28 ? 20 : 100 }));
    return { car, cum: model.cumDist(car) };
  }
  const a = lane(36), b = lane(45), r = model.brakingDuel(a, b, 0, 90);
  assert.equal(r.available, true); assert.ok(r.lanes[0].brake); assert.ok(r.lanes[0].throttle);
  assert.ok(r.lanes[0].brake.distance < r.lanes[1].brake.distance);
  assert.ok(Math.abs(r.change + 1.8) < 1e-9);
  assert.equal(model.brakingDuel(a, b, 0, 110).available, false);
  const missing = lane(36); missing.car[12].brake = null;
  assert.equal(model.brakingDuel(missing, b, 0, 90).available, false);
  const gap = lane(36); gap.car.splice(10, 10); gap.cum = model.cumDist(gap.car);
  assert.match(model.brakingDuel(gap, b, 0, 90).reason, /gap/);
  for (const lastSpeed of [null, 0]) {
    const afterZone = lane(36);
    afterZone.car[40].speed = lastSpeed;
    afterZone.cum = model.cumDist(afterZone.car);
    assert.equal(model.brakingDuel(afterZone, b, 0, 90).available, true,
      "a later stop or missing speed cannot invalidate an observed braking zone");
  }
  const boundaryGap = lane(36);
  boundaryGap.car.splice(21, 10);
  boundaryGap.cum = model.cumDist(boundaryGap.car);
  assert.equal(model.brakingDuel(boundaryGap, b, 0, 50).available, true,
    "an outage starting at the observed final sample is outside the zone");
  const flat = lane(36); flat.car.forEach((c) => { c.brake = 0; c.throttle = 100; });
  const absent = model.brakingDuel(flat, b, 0, 90);
  assert.equal(absent.available, true); assert.equal(absent.lanes[0].brake, null); assert.equal(absent.lanes[0].throttle, null);
  flat.car[12].brake = 50;
  assert.equal(model.brakingDuel(flat, b, 0, 90).lanes[0].brake, null, "one noisy feed sample must not become two grid hits");
});

const lesson = vm.runInContext("TelemetryLesson", ctx);

test("Telemetry Detective compares the same distance and flips the delta with the reference", () => {
  const { lanes, from, to } = lesson.fixture;
  const result = lesson.analyze(lanes, from, to);
  assert.equal(result.available, true);
  assert.equal(result.deltaBefore, 0);
  assert.ok(Math.abs(result.change - 2 / 15) < 1e-9);
  assert.equal(lesson.analyze(lanes, from, to, 1).change, -result.change);
  assert.equal(result.lanes[0].brake.distance, 21.875);
  assert.equal(result.lanes[1].brake.distance, 36.25);
  assert.equal(result.lanes[0].minSpeed.value, 144);
  assert.equal(result.lanes[1].minSpeed.value, 126);
  assert.equal(result.lanes[0].throttle.distance, 55.625);
  assert.equal(result.lanes[1].throttle.distance, 65);

  const atTime = lesson.readAt(lanes, 0.5, "time");
  assert.equal(atTime.lanes[0].distance, 28.75);
  assert.equal(atTime.lanes[1].distance, 30);
  assert.equal(atTime.delta, null);
  assert.ok(lesson.readAt(lanes, 30).delta < 0);
  const alignedLesson = lesson.readAt(lanes, 0.75, "time");
  assert.deepEqual([alignedLesson.lanes[0].distance, alignedLesson.lanes[1].distance], [40, 42.5]);
  const samePlace = lesson.readAt(lanes, alignedLesson.lanes[0].distance, "distance");
  assert.ok(Math.abs(samePlace.delta + 0.05) < 1e-9);
  const atExit = lesson.readAt(lanes, to);
  assert.equal(atExit.lanes[0].distance, to);
  assert.equal(atExit.lanes[1].distance, to);
  assert.ok(Math.abs(atExit.lanes[0].t - 1.7916666667) < 1e-9);
  assert.equal(atExit.lanes[1].t, 1.925);
  assert.equal(atExit.delta, result.deltaAfter);
  const series = lesson.series(lanes, from, to, 1);
  assert.equal(series.length, 129);
  assert.equal(series.at(-1).delta, -atExit.delta);
});

test("Telemetry Detective leaves gaps unknown and keeps valid earlier comparisons", () => {
  const { lanes: [a, b], from, to } = lesson.fixture;
  assert.deepEqual({ ...lesson.analyze([a, b], from, 95) }, {
    available: false, reason: "Both lanes must cover the whole interval."
  });
  assert.equal(lesson.readAt([a, b], 95).delta, null);
  assert.equal(lesson.readAt([a, b], 95).lanes[1].speed, null);
  assert.equal(lesson.series([a, b], 90, 95, 0, 1).at(-1).delta, null);
  assert.deepEqual({ ...lesson.analyze([a, { car: b.car.slice(1) }], from, to) }, {
    available: false, reason: "Both lanes need a sample at the alignment origin."
  });

  const car = b.car.map((row, i) => ({ ...row, t: row.t + (i >= 3 ? 2 : 0) }));
  assert.deepEqual({ ...lesson.analyze([a, { car }], 10, to) }, {
    available: false, reason: "Unavailable: telemetry gap after the alignment origin."
  });
  assert.deepEqual({ ...lesson.analyze([a, { car }], 60, to) }, {
    available: false, reason: "Unavailable: telemetry gap after the alignment origin."
  });
  assert.equal(lesson.readAt([a, { car }], 60).delta, null);
  assert.equal(lesson.analyze([a, { car }], 10, 25).available, true);

  const missing = b.car.map((row, i) => ({ ...row, brake: i === 4 ? null : row.brake }));
  assert.deepEqual({ ...lesson.analyze([a, { car: missing }], from, to) }, {
    available: false, reason: "Unavailable: missing telemetry channels."
  });
  assert.equal(lesson.readAt([a, { car: missing }], 1, "time").lanes[1].brake, null);
  const noBrake = b.car.map(row => ({ ...row, brake: 0 }));
  const result = lesson.analyze([a, { car: noBrake }], from, to);
  assert.equal(result.available, true);
  assert.equal(result.lanes[1].brake, null);
  assert.equal(result.lanes[1].throttle, null);
  assert.ok(Math.abs(result.change - 2 / 15) < 1e-9);
});

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
  for (const name of ["api-transport", "api"]) {
    vm.runInContext(readFileSync(`js/data/${name}.js`, "utf8"), api, { filename: absSrc(`${name}.js`) });
  }
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

test("GPS dots keep measured fixes and disappear inside a map coverage gap", () => {
  const p = driver(80);
  p.loc = p.loc.filter((_, i) => i <= 20 || i >= 40);
  const view = { primary: p, tMax: 80 };
  assert.equal(T._locAt(view, p, 8), null);
  assert.equal(T._locAt(view, p, 5.4).x, p.loc[20].x);
  assert.equal(T._locAt(view, p, 10.8).x, p.loc[21].x);
});

test("the onboard map falls back to the full map while the cursor sits in a GPS gap", () => {
  const renderer = vm.runInContext("DataTelemetryRender", ctx).create({ cssColor: () => "lane" });
  const p = driver(80);
  p.loc = p.loc.filter((_, i) => i <= 20 || i >= 40);
  const calls = {};
  const inert = new Proxy({}, { get: () => () => {} });
  const map = new Proxy({}, { get: (_, key) => () => { calls[key] = (calls[key] || 0) + 1; } });
  const view = {
    primary: p, compare: null, laps: [p], laneCols: [[1, 1, 1]], onboard: true, cursorT: 8,
    visible: {}, visibleC: {}, tMax: 80, speedMax: 1, rpmMax: 1, ratio: 1,
    cw: 320, ch: 200, mw: 320, mh: 320,
    chart: { getContext: () => inert }, map: { getContext: () => map },
    chartBase: { getContext: () => inert }, mapBase: { getContext: () => inert }
  };
  renderer.buildBases(view);
  assert.doesNotThrow(() => renderer.paintFrame(view));
  assert.deepEqual([calls.drawImage > 0, calls.rotate || 0], [true, 0],
    "a gap leaves no heading to rotate by, so the unrotated map is drawn");
  for (const k of Object.keys(calls)) delete calls[k];
  view.cursorT = 3;
  renderer.paintFrame(view);
  assert.equal(calls.rotate, 1, "a measured fix keeps the heading-up onboard zoom");
});

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

test("compare gaps stay at the reference finish while a slower lap keeps playing", () => {
  const player = vm.runInContext("DataTelemetryPlayer", ctx).create({}, { paintFrame() {} });
  const cell = () => ({ textContent: "", style: {}, classList: { toggle() {} } });
  const lane = (finish) => ({
    car: [{ t: 0, speed: 180, gear: 6, throttle: 100, brake: 0, rpm: 10000 },
      { t: finish, speed: 180, gear: 6, throttle: 100, brake: 0, rpm: 10000 }],
    cum: { t: [0, finish], d: [0, 1000] },
  });
  const primary = lane(80), compare = lane(82), third = lane(84);
  const view = {
    cursorT: 80, primary, compare, laps: [primary, compare, third], rpmMax: 12000,
    g: {
      speed: [cell(), cell()], gear: [cell(), cell()], thr: [cell(), cell()],
      brk: [cell(), cell()], rpm: [cell(), cell()], drs: [cell(), cell()],
      delta: cell(), board: [{ spd: cell(), ref: true },
        { spd: cell(), dl: cell() }, { spd: cell(), dl: cell() }],
    },
  };
  for (const t of [79, 80, 81, 82, 83]) {
    view.cursorT = t;
    player.paintFrame(view);
    const expected = t < 80 ? "+1.98s" : "+2.00s";
    assert.equal(view.g.delta.textContent, expected, `compare gauge at ${t}s`);
    assert.equal(view.g.board[1].dl.textContent, expected.slice(0, -1), `compare board at ${t}s`);
    assert.equal(view.g.board[2].dl.textContent, t < 80 ? "+3.95" : "+4.00", `third lane at ${t}s`);
  }
  const model = vm.runInContext("DataTelemetryModel", ctx);
  const missing = Array.from({ length: 81 }, (_, t) => ({ t, speed: t >= 20 && t < 40 ? null : 180 }));
  primary.cum = model.cumDist(primary.car);
  compare.car = missing; compare.cum = model.cumDist(missing);
  third.car = missing; third.cum = model.cumDist(missing);
  view.cursorT = 55;
  player.paintFrame(view);
  assert.equal(view.g.delta.textContent, "—", "unknown travel must not fabricate a gap");
  assert.equal(view.g.board[1].dl.textContent, "—");
  assert.equal(view.g.board[2].dl.textContent, "—");
});

test("telemetry gauges preserve stable text, update rounded/null values and repair external edits", () => {
  const player = vm.runInContext("DataTelemetryPlayer", ctx).create({}, { paintFrame() {} });
  let writes = 0;
  const cell = () => {
    let text = "";
    const classes = new Set();
    return { get textContent() { return text; }, set textContent(v) { text = String(v); writes++; },
      style: {}, classList: { toggle(k, on) { if (on) classes.add(k); else classes.delete(k); }, contains: (k) => classes.has(k) } };
  };
  const lane = (finish) => ({
    car: [0, finish].map((t) => ({ t, speed: 180.1, gear: 6, throttle: 100, brake: 0, rpm: 10000, drs: 12 })),
    cum: { t: [0, finish], d: [0, 1000] },
  });
  const laps = [lane(80), lane(60), lane(84), lane(88)];
  const view = { cursorT: 40, primary: laps[0], compare: laps[1], laps, rpmMax: 12000,
    g: { speed: [cell(), cell()], gear: [cell(), cell()], thr: [cell(), cell()], brk: [cell(), cell()],
      rpm: [cell(), cell()], drs: [cell(), cell()], delta: cell(),
      board: laps.map((_, i) => ({ spd: cell(), dl: cell(), ref: i === 0 })) } };
  player.paintFrame(view);
  assert.equal(view.g.delta.textContent, "-10.00s");
  assert.equal(view.g.delta.classList.contains("dh-neg"), true);
  assert.equal(view.g.board[1].dl.textContent, "-10.00");
  const stableWrites = writes;
  for (let i = 0; i < 60; i++) player.paintFrame(view);
  assert.equal(writes, stableWrites, "unchanged four-lane frames never replace gauge text nodes");
  for (const sample of laps[0].car) sample.speed = 180.4;
  player.paintFrame(view);
  assert.equal(writes, stableWrites, "a changed sample with the same rounded display needs no text write");
  for (const sample of laps[0].car) Object.assign(sample, { speed: 180.6, gear: 0, drs: 0 });
  player.paintFrame(view);
  assert.equal(view.g.speed[0].textContent, "181");
  assert.equal(view.g.board[0].spd.textContent, "181");
  assert.equal(view.g.gear[0].textContent, "N");
  assert.equal(view.g.drs[0].textContent, "—");
  assert.equal(view.g.drs[0].classList.contains("dh-on"), false);
  for (const sample of laps[0].car) Object.assign(sample, { speed: null, gear: null, drs: null });
  player.paintFrame(view);
  assert.equal(view.g.speed[0].textContent, "—");
  assert.equal(view.g.board[0].spd.textContent, "—");
  assert.equal(view.g.gear[0].textContent, "—");
  view.g.speed[1].textContent = "external edit";
  player.paintFrame(view);
  assert.equal(view.g.speed[1].textContent, "180", "DOM equality repairs outside edits on the next frame");
  view.cursorT = 0; player.paintFrame(view);
  assert.equal(view.g.delta.textContent, "+0.00s", "rewinding updates the gap");
  assert.equal(view.g.delta.classList.contains("dh-neg"), false);
});

test("integrated distance retains unknown intervals and legitimate stops", () => {
  const model = vm.runInContext("DataTelemetryModel", ctx);
  for (const speed of [null, undefined, NaN, Infinity]) {
    const cum = model.cumDist([{ t: 0, speed: 180 }, { t: 1, speed: 180 },
      { t: 2, speed }, { t: 3, speed: 180 }]);
    assert.equal(model.distAtT(cum, 1), 50);
    assert.ok(Number.isNaN(model.distAtT(cum, 1.5)));
    assert.ok(Number.isNaN(model.distAtT(cum, 3)));
    assert.equal(model.timeAtDist(cum, 25), 0.5);
    assert.ok(Number.isNaN(model.timeAtDist(cum, 75)));
    assert.ok(Number.isNaN(model.timeAtDist(cum, NaN)));
  }
  const stopped = model.cumDist([{ t: 0, speed: 180 }, { t: 1, speed: 0 }, { t: 2, speed: 180 }]);
  assert.equal(model.distAtT(stopped, 1), 0);
  assert.equal(model.distAtT(stopped, 2), 50);
});

test("distance inversion respects every finite-prefix boundary and complete-lap clamping", () => {
  const model = vm.runInContext("DataTelemetryModel", ctx);
  for (const n of [0, 1, 2, 3, 4, 7, 8, 9, 63, 64, 65]) {
    for (const missing of [-1, 0, 1, Math.floor(n / 2), n - 1]) {
      const car = Array.from({ length: n }, (_, t) => ({ t, speed: t === missing ? null : 180 }));
      const cum = model.cumDist(car);
      const end = missing < 0 ? n : Math.min(n, Math.max(1, missing));
      const label = `${n} samples, missing speed at ${missing}`;
      if (!n) { assert.ok(Number.isNaN(model.timeAtDist(cum, 0)), label); continue; }
      assert.equal(model.timeAtDist(cum, -1), 0, label);
      assert.equal(model.timeAtDist(cum, 0), 0, label);
      assert.equal(model.timeAtDist(cum, (end - 1) * 25), (end - 1) / 2, label);
      assert.equal(model.timeAtDist(cum, (end - 1) * 50), end - 1, label);
      if (end < n) assert.ok(Number.isNaN(model.timeAtDist(cum, (end - 1) * 50 + .01)), label);
      else assert.equal(model.timeAtDist(cum, n * 50), n - 1, label);
      for (const invalid of [NaN, Infinity, -Infinity]) assert.ok(Number.isNaN(model.timeAtDist(cum, invalid)), label);
    }
  }
  const stopped = model.cumDist([{ t: 0, speed: 180 }, { t: 1, speed: 0 },
    { t: 2, speed: 0 }, { t: 3, speed: 180 }, { t: 4, speed: null }]);
  assert.equal(model.timeAtDist(stopped, 0), 0, "the first timestamp owns a stationary plateau");
  assert.equal(model.timeAtDist(stopped, 25), 2.5);
  assert.equal(model.timeAtDist(stopped, 50), 3);
  assert.ok(Number.isNaN(model.timeAtDist(stopped, 51)));
});

test("distance inversion reads current arrays when a finite prefix is replaced or extended", () => {
  const model = vm.runInContext("DataTelemetryModel", ctx);
  const cum = model.cumDist([{ t: 0, speed: 180 }, { t: 1, speed: 180 },
    { t: 2, speed: null }, { t: 3, speed: 180 }]);
  assert.ok(Number.isNaN(model.timeAtDist(cum, 75)));
  cum.d[2] = 100; cum.d[3] = 150;
  assert.equal(model.timeAtDist(cum, 75), 1.5, "repairing the suffix cannot reuse a stale prefix boundary");
  cum.d.push(200); cum.t.push(4);
  assert.equal(model.timeAtDist(cum, 175), 3.5, "appending a sample is visible without rebuilding the object");
  cum.d.splice(1, 4, NaN, NaN, NaN, NaN);
  assert.ok(Number.isNaN(model.timeAtDist(cum, 25)), "a newly unknown suffix invalidates the old domain");
  cum.d = [0, 100, 200]; cum.t = [0, 2, 4];
  assert.equal(model.timeAtDist(cum, 50), 1, "replacing both channels changes the interpolation clock");
  cum.d.length = cum.t.length = 0;
  assert.ok(Number.isNaN(model.timeAtDist(cum, 0)));
});

// Exercise the real controller -> view -> player -> renderer wiring with a
// synthetic feed. Canvas methods are inert: this checks state and lifecycle,
// while the browser telemetry-compare spec owns layout and visible pixels.
for (const sampleCount of [8, 9, 801]) test(`telemetry clipping, lane colors and playback teardown (${sampleCount} lap samples)`, async () => {
  const dom = makeDom();
  const timers = new Map(), frames = new Map(), observers = [];
  let nextId = 0;
  const makeElement = dom.document.createElement;
  dom.document.createElement = (tag) => {
    const node = makeElement(tag);
    if (tag === "canvas") {
      const drawing = new Proxy({}, { get: (target, key) => target[key] || ((...args) => {
        if (["moveTo", "lineTo", "arc"].includes(key)) {
          assert.ok(args.filter((v) => typeof v === "number").every(Number.isFinite), `${key} received an unknown coordinate`);
        }
      }) });
      node.getContext = () => drawing;
      node.currentCSSZoom = 2;
      node._rect = { left: 0, top: 0, width: 330, height: 100 };
    }
    if (tag === "dialog") {
      node.showModal = () => { node.open = true; };
      node.close = () => { node.open = false; dom.dispatch(node, { type: "close" }); };
    }
    return node;
  };
  dom.document.createTextNode = (text) => {
    const node = makeElement("text");
    node.nodeType = 3; node.textContent = text;
    return node;
  };
  const el = (tag, cls, text) => {
    const node = dom.document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = String(text);
    return node;
  };
  const drivers = [
    { num: 1, name: "Primary Driver", code: "PRI", color: "ff0000" },
    { num: 2, name: "Missing Driver", code: "MIS", color: "00ff00" },
    { num: 3, name: "Comparison Driver", code: "CMP", color: "0000ff" }
  ];
  const trace = driver(80);
  trace.car = Array.from({ length: sampleCount }, (_, i) => trace.car[Math.round(i * (trace.car.length - 1) / (sampleCount - 1))]);
  trace.car.push({ ...trace.car[trace.car.length - 1], t: 81.2, date: 1e12 + 81200 });
  trace.loc.push({ x: 1e6, y: 1e6, date: 1e12 + 81200 });
  // Exercise the delta renderer with a feed outage as well as a clipped tail.
  if (sampleCount === 801) trace.car.forEach((sample) => {
    if (sample.t >= 20 && sample.t < 40) sample.speed = null;
  });
  trace.car.forEach((sample) => Object.assign(sample, { gear: 7, throttle: 80, brake: 0, rpm: 10000, drs: 12 }));
  const meta = { sessionKey: 7, meetingKey: 1, name: "Race", type: "Race" };
  const context = vm.createContext({
    document: dom.document,
    window: { innerHeight: 800, innerWidth: 600, devicePixelRatio: 2 },
    setTimeout(fn) { const id = ++nextId; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame(fn) { const id = ++nextId; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    ResizeObserver: class {
      constructor() { this.disconnected = false; observers.push(this); }
      observe() {}
      disconnect() { this.disconnected = true; }
    },
    F1API: {
      sessionDrivers: async () => drivers,
      fastestLap: async () => ({ dateStart: new Date(1e12).toISOString(), lapDuration: 80, lapNumber: 3, s1: 25, s2: 25, s3: 30 }),
      carData: async (_session, num, start, _end, origin) => {
        assert.equal(Date.parse(origin) - Date.parse(start), 1500, "the controller requests a pre-lap boundary sample");
        return num === 2 ? [] : trace.car;
      },
      locationData: async (_session, num) => num === 2 ? [] : trace.loc,
      stints: async () => [], pits: async () => []
    }
  });
  seedDom(context);
  for (const file of [
    "js/core/mat4.js", "js/ui/track-maps.js", "js/data/tab-utils.js", "js/data/telemetry-model.js", "js/data/telemetry-render.js",
    "js/data/telemetry-player.js", "js/data/telemetry-context.js", "js/data/telemetry-replay.js", "js/data/telemetry-view.js", "js/data/telemetry.js"
  ]) {
    vm.runInContext(readFileSync(file, "utf8"), context, { filename: absSrc(file) });
  }
  const api = vm.runInContext("DataTelemetry", context).create({
    el, clear: (node) => node.replaceChildren(), emptyMsg: (text) => el("div", "dh-empty", text),
    spinner: () => el("div", "dh-spinner"), sel: { sessionKey: 7, meta },
    ensureSession: async () => {}, buildPicker: () => el("div"), invalidateOther() {},
    findTeam: () => null, cssColor: (color) => JSON.stringify(color), textColorOn: () => "white", COMPOUND: {}, NO_TELEM_MSG: "No data"
  });
  const body = await api.loadTelemetry();
  dom.byId("datahub").appendChild(body);
  const chips = body.querySelectorAll(".dh-dchip");
  assert.equal(chips.length, 3);
  chips.forEach((chip) => chip.click());
  body.querySelector(".dh-livebtn").click();
  for (let i = 0; i < 12; i++) await Promise.resolve();
  for (const [id, fn] of timers) { timers.delete(id); fn(); }

  const popup = dom.document.querySelector(".dh-tpopup");
  assert.ok(popup && popup.open);
  const chart = popup.querySelector(".dh-canvas");
  assert.equal(chart.width, 990, "DPR and CSS zoom are capped at a ratio of three");
  const summary = popup.querySelector("#dh-telem-summary");
  assert.match(summary.textContent, /PRI \(primary trace\), CMP \(comparison trace\)/);
  assert.match(summary.textContent, /speed 200 km\/h, gear G7/);
  const legend = popup.querySelector(".dh-legend").querySelectorAll(".dh-codechip");
  assert.equal(legend[0].style.background, "[1,0,0]");
  assert.equal(legend[1].style.background, "[0,0,1]", "a missing middle lane must not shift the following lane's color");

  dom.dispatch(chart, { type: "pointerdown", pointerId: 99, clientX: 330 });
  dom.dispatch(chart, { type: "pointerup", pointerId: 99 });
  assert.match(summary.textContent, /Time 1:20.00/, "next-lap samples must not extend even a sparse lap");
  const play = popup.querySelector(".dh-tplay");
  play.click();
  assert.equal(frames.size, 1);
  const tick = (ts) => {
    const [id, fn] = frames.entries().next().value;
    frames.delete(id); fn(ts);
  };
  tick(100); tick(1100);
  assert.equal(popup.querySelector(".dh-gspeed").querySelector(".dh-gval").textContent, "200");
  dom.dispatch(chart, { type: "pointerdown", pointerId: 1, clientX: 160 });
  assert.equal(frames.size, 0, "scrubbing cancels playback");
  dom.dispatch(chart, { type: "pointercancel", pointerId: 1 });
  const firstTime = summary.textContent;
  dom.dispatch(chart, { type: "pointerdown", pointerId: 2, clientX: 240 });
  dom.dispatch(chart, { type: "pointerup", pointerId: 2 });
  assert.notEqual(summary.textContent, firstTime, "a canceled pointer must release ownership for the next scrub");
  play.click();
  assert.equal(frames.size, 1);
  api.closeTelemPopup();
  assert.equal(frames.size, 0, "closing the popup cancels its active animation");
  assert.ok(observers.every((observer) => observer.disconnected));
  assert.equal(dom.document.querySelector(".dh-tpopup"), null);
  assert.equal(dom.document.activeElement, chips[0], "close restores focus to the selected driver");
});

test("windowed telemetry retains the lap clock and refuses unequal leading/trailing distance coverage", async () => {
  const epoch = Date.parse("2026-01-01T12:00:00Z");
  const source = readFileSync("js/data/api.js", "utf8");
  const modelSource = readFileSync("js/data/telemetry-model.js", "utf8");
  for (const sessionKey of [1, 2]) for (const leading of [0, 0.05, 2]) for (const trailing of [0, 2]) {
    const start = epoch + (sessionKey - 1) * 3600000;
    const iso = (t) => new Date(start + t * 1000).toISOString();
    const context = vm.createContext({ F1Transport: { create: () => ({ request: async () =>
      [leading, ...Array.from({ length: 100 }, (_, i) => i + 1)].filter((t, i, a) => t >= leading && t <= 100 - trailing && a.indexOf(t) === i)
        .map((t) => ({ date: iso(t), speed: 180, n_gear: 7 })) }) } });
    vm.runInContext(readFileSync("js/core/mat4.js", "utf8") + source + modelSource + readFileSync("js/data/telemetry-player.js", "utf8"), context, { filename: "vm-composite:mat4+api+telemetry-model+telemetry-player" });
    const api = vm.runInContext("F1API", context), model = vm.runInContext("DataTelemetryModel", context);
    const car = await api.carData(sessionKey, 2, iso(0), iso(100));
    assert.ok(Math.abs(car[0].t - leading) < 1e-9);
    assert.equal(car.at(-1).t, 100 - trailing);
    const noOrigin = await api.carData(sessionKey, 2);
    assert.equal(noOrigin[0].t, 0, "unwindowed consumers keep the first-sample origin");
    const control = driver(100, 1600, 180);
    control.loc = Array.from({ length: 101 }, (_, t) => ({ date: epoch + t * 1000, x: t * 50, y: 0 }));
    control.car.forEach((row) => { row.date = epoch + row.t * 1000; });
    const compare = { car, cum: model.cumDist(car, 100), lap: { lapDuration: 100 },
      loc: Array.from({ length: 101 }, (_, t) => ({ date: start + t * 1000, x: t * 50, y: 0 })) };
    control.cum = model.cumDist(control.car, 100); control.lap = { lapDuration: 100 };
    const cell = () => ({ textContent: "", style: {}, classList: { toggle() {} } });
    const g = Object.fromEntries(["speed", "gear", "thr", "brk", "rpm", "drs"].map((key) => [key, [cell(), cell()]]));
    g.delta = cell();
    const view = { primary: control, compare, laps: [control, compare], cursorT: 100, tMax: 100, g, rpmMax: 12000 };
    const player = vm.runInContext("DataTelemetryPlayer", context).create({}, { paintFrame() {} });
    player.paintFrame(view);
    assert.equal(g.delta.textContent, leading || trailing ? "—" : "+0.00s", `session ${sessionKey}, leading ${leading}, trailing ${trailing}`);
    for (const time of [0, 0.025, 5]) {
      const point = model.locAt(view, compare, time);
      assert.ok(Math.abs(point.x - time * 50) < 1e-6, `GPS stays on its own lap clock at ${time}s`);
    }
    if (leading) assert.equal(model.brakingDuel(control, compare, 0, 100).available, false);
  }
});

test("telemetry uses speed preferences in channels, gauges, axis and summary without changing canonical data", () => {
  const context = vm.createContext({ GameStore: { store: { get: (_key, fallback) => fallback, set() {} } } });
  for (const file of ["js/core/mat4.js", "js/ui/appearance-opts.js", "js/data/telemetry-model.js", "js/data/telemetry-player.js", "js/data/telemetry-render.js"])
    vm.runInContext(readFileSync(file, "utf8"), context, { filename: absSrc(file) });
  const opts = vm.runInContext("AppearanceOpts", context), model = vm.runInContext("DataTelemetryModel", context);
  const dom = makeDom();
  const el = (tag, cls, text) => {
    const node = dom.document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = String(text); return node;
  };
  const car = [{ t: 0, speed: 160.9344, gear: 4 }, { t: 1, speed: 160.9344, gear: 4 }];
  const distance = model.cumDist(car).d[1];
  for (const units of ["kmh", "mph", "kmh", "mph"]) {
    opts.setUnits(units);
    const value = units === "mph" ? "100" : "161", label = units === "mph" ? "mph" : "km/h";
    const texts = [];
    const drawing = new Proxy({ fillText: (text) => texts.push(String(text)) }, { get: (target, key) => target[key] || (() => {}) });
    const lane = { d: { code: "PRI", num: 1 }, car, cum: model.cumDist(car) };
    const view = { primary: lane, laps: [lane], cursorT: 0, rpmMax: 12000, speedMax: 200,
      chartBase: { getContext: () => drawing }, cw: 400, ch: 200, tMax: 1,
      visible: { speed: true }, a11ySummary: { textContent: "" } };
    const player = vm.runInContext("DataTelemetryPlayer", context).create({ el, cssColor: () => "white" }, { paintFrame() {} });
    const gauges = player.buildGauges(view); player.paintFrame(view); player.updateTextSummary(view);
    assert.equal(view.g.speed[0].textContent, value);
    assert.equal(gauges.querySelector(".dh-gspeed").querySelector(".dh-glabel").textContent, "SPEED " + label);
    assert.equal(model.CHANNELS[0].fmt(car[0].speed), value + " " + label);
    assert.ok(view.a11ySummary.textContent.includes("speed " + value + " " + label));
    vm.runInContext("DataTelemetryRender", context).create({ cssColor: () => "white" }).buildBases(view);
    assert.ok(texts.includes(label), "chart axis names the selected unit");
    assert.ok(texts.includes(units === "mph" ? "31" : "50"), "chart tick labels convert the canonical speed");
    assert.equal(car[0].speed, 160.9344); assert.equal(model.cumDist(car).d[1], distance);
  }
});

test("normal sub-sample boundary skew uses observed bracketing rows while a leading outage stays unknown", async () => {
  const epoch = Date.parse("2026-01-01T12:00:00Z"), iso = (t) => new Date(epoch + t * 1000).toISOString();
  for (const first of [0.05, 0.27, 2]) {
    let url;
    const context = vm.createContext({ F1Transport: { create: () => ({ request: async (requested) => {
      url = requested;
      return [-0.1, ...Array.from({ length: 100 }, (_, i) => first + i), 100.1]
        .map((t) => ({ date: iso(t), speed: 180, n_gear: 7 }));
    } }) } });
    for (const file of ["js/core/mat4.js", "js/data/api.js", "js/data/telemetry-model.js"])
      vm.runInContext(readFileSync(file, "utf8"), context, { filename: absSrc(file) });
    const api = vm.runInContext("F1API", context), model = vm.runInContext("DataTelemetryModel", context);
    const raw = await api.carData(1, 1, iso(-1.5), iso(101.5), iso(0));
    assert.ok(url.includes(encodeURIComponent(iso(-1.5))), "request includes the pre-lap bracketing interval");
    assert.equal(raw[0].t, -0.1, "the temporal origin remains the actual lap start");
    const clipped = model.clipCar(raw, 100), distance = model.cumDist(clipped, 100);
    assert.ok(clipped.every((c) => c.t >= 0 && c.t <= 100));
    assert.equal(clipped.at(-1).t, 100, "a bracketed final sample closes ordinary trailing skew");
    if (first < 1.5) {
      assert.equal(clipped[0].t, 0); assert.equal(clipped[0].date, epoch);
      assert.ok(Math.abs(model.distAtT(distance, 100) - 5000) < 1e-6);
      assert.ok(Math.abs(model.timeAtDist(distance, 2500) - 50) < 1e-6, "normal coverage remains available for distance comparison");
    } else {
      assert.equal(clipped[0].t, 2);
      assert.ok(Number.isNaN(model.distAtT(distance, 100)), "the missing leading travel is never invented");
    }
  }
});

// W23 #6: 2026 has no DRS, and OpenF1's car_data sends `drs: null` on every
// 2026 sample (session 11412, 2026-11-10). The DRS channel, its pill and the
// "DRS —" summary text exist only when some lane carries a value.
test("TELEMETRY shows no DRS channel, pill or summary when no sample has a value", () => {
  const model = vm.runInContext("DataTelemetryModel", ctx);
  const lane = (drs) => ({ d: { num: 1, code: "NOR" },
    car: [0, 1].map((t) => ({ t, speed: 200, gear: 6, throttle: 100, brake: 0, rpm: 11000, drs })),
    cum: { t: [0, 1], d: [0, 55] } });
  assert.equal(model.hasDrs([lane(null), lane(null)]), false, "2026: every sample null");
  assert.equal(model.hasDrs([lane(null), lane(12)]), true, "2025: one lane with DRS codes");
  assert.equal(model.hasDrs([]), false);
  const player = vm.runInContext("DataTelemetryPlayer", ctx).create({}, { paintFrame() {} });
  const cell = () => ({ textContent: "", style: {}, classList: { toggle() {} } });
  const laps = [lane(null)];
  const view = { cursorT: 0, primary: laps[0], compare: null, laps, rpmMax: 12000, hasDrs: false,
    a11ySummary: { textContent: "" },
    g: { speed: [cell()], gear: [cell()], thr: [cell()], brk: [cell()], rpm: [cell()], board: [] } };
  player.paintFrame(view);   // no g.drs: must not throw
  player.updateTextSummary(view);
  const lastBit = () => view.a11ySummary.textContent.split(": ").pop();
  assert.equal(lastBit().split(", ").pop(), "rpm 11000.", "no DRS clause: " + view.a11ySummary.textContent);
  view.hasDrs = true; laps[0] = lane(12); view.primary = laps[0];
  player.updateTextSummary(view);
  assert.equal(lastBit().split(", ").pop(), "DRS open.");
});

test("lap context preserves tyre joins, prior weather, late deletion and unknown fields", () => {
  const C = vm.runInContext("DataTelemetryContext", ctx);
  const start = Date.parse("2023-07-08T15:14:00Z");
  const tel = { d: { num: 1 }, lap: { dateStart: new Date(start).toISOString(), lapDuration: 90, lapNumber: 25, s1: 30, s2: 30, s3: 30 },
    nativeCar: [{ date: start - 100 }, { date: start + 90100 }], nativeLoc: [] };
  const source = (rows) => ({ status: "available", rows });
  const sources = { stints: source([{ driver_number: 1, lap_start: 24, lap_end: 26, compound: "SOFT", tyre_age_at_start: 0 }]),
    weather: source([{ date: new Date(start + 5000).toISOString(), track_temperature: 99 },
      { date: new Date(start - 20000).toISOString(), track_temperature: 27 }]),
    raceControl: source([{ date: new Date(start + 100000).toISOString(), driver_number: 1, lap_number: 25, message: "LAP TIME DELETED" }]), traffic: source([]) };
  const s = C.summarize(tel, sources);
  assert.equal(s.tyre.ageAtStintStart, 0); assert.equal(s.tyre.lapsSinceStintStart, 1);
  assert.equal(s.weatherAtStart.track_temperature, 27); assert.equal(s.weatherAgeSeconds, 20);
  assert.equal(s.weatherDuringLap.length, 1); assert.equal(s.deletionReported, true);
  assert.equal(s.eventsDuringLap.length, 0); assert.equal(s.sectorSumErrorSeconds, 0);
  assert.equal(s.carQuality.bracketsLap, true); assert.equal(s.locationQuality.maxGapSeconds, null);
  sources.weather = source([]); sources.stints = source([]); sources.raceControl = source([]);
  const missing = C.summarize(tel, sources);
  assert.equal(missing.weatherAtStart, null); assert.equal(missing.tyre, null); assert.equal(missing.deletionReported, null);
});

test("traffic matches native UTC with bounded sample skew and preserves source units", () => {
  const C = vm.runInContext("DataTelemetryContext", ctx), start = Date.parse("2023-07-08T15:14:00Z");
  const r = (driver, dt, x) => ({ driver_number: driver, date: new Date(start + dt).toISOString(), x, y: 10 });
  const got = C.traffic({ d: { num: 1 } }, [r(1, 0, 100), r(4, 200, 130), r(5, 600, 101), r(1, 2000, 150)], start, start + 3000);
  assert.equal(got.observations.length, 1); assert.equal(got.observations[0].driverNumber, 4);
  assert.equal(got.observations[0].distanceSourceUnits, 30); assert.equal(got.observations[0].timestampSkewSeconds, 0.2);
});

test("context endpoint failures remain explicit and do not reject usable sources", async () => {
  const c = vm.createContext({ Date, Promise, Number, F1API: { request: async (url) => {
    if (url.includes("/weather?")) throw new Error("offline");
    return [];
  } } });
  vm.runInContext(readFileSync("js/data/telemetry-context.js", "utf8"), c, { filename: absSrc("js/data/telemetry-context.js") });
  const C = vm.runInContext("DataTelemetryContext", c);
  const result = await C.load({ sessionKey: 9122, d: { num: 1 }, lap: { dateStart: "2023-07-08T15:14:00Z", lapDuration: 90, lapNumber: 25 } });
  assert.equal(result.sources.weather.status, "unavailable"); assert.equal(result.sources.laps.status, "available");
  assert.match(result.sources.traffic.url, /date%3E=/); assert.doesNotMatch(result.sources.traffic.url, /driver_number/);
  assert.equal(result.summary.weatherAtStart, null); assert.equal(result.summary.sectorSumErrorSeconds, null);
});

test("production replay preserves recorded sector anchors and rejects missing coverage", () => {
  const R = vm.runInContext("DataTelemetryReplay", ctx);
  const lap = { dateStart: "2023-07-08T15:14:00Z", lapDuration: 9, s1: 3, s2: 3, s3: 3 };
  const start = Date.parse(lap.dateStart);
  const lane = { circuit: "Silverstone", lap, nativeCar: Array.from({length: 21}, (_, i) => ({date: start + (i - 1) * 500, speed: 100 + i})) };
  const geometry = { anchors: [0, .3, .7, 1] };
  const path = R.motion(lane, geometry);
  assert.ok(path.every((p, i) => !i || p[1] >= path[i - 1][1]));
  [0,3,6,9].forEach((t, i) => assert.ok(Math.abs(R.interpolate(path,t)-geometry.anchors[i]) < 1e-9));
  assert.equal(R.motion({...lane, circuit: "Monaco"}, geometry), null);
  assert.equal(R.motion({...lane, nativeCar: lane.nativeCar.slice(3)}, geometry), null);
  assert.equal(R.motion({...lane, nativeCar: lane.nativeCar.filter((s,i)=>i<6 || i>10)}, geometry), null);
  assert.equal(R.motion({...lane, lap: {...lap,s3:4}}, geometry), null);
  assert.equal(R.motion({...lane, nativeCar: lane.nativeCar.slice(0,10)}, geometry), null);
});

test("production replay context follows each lap's UTC clock without future weather", () => {
  const R = vm.runInContext("DataTelemetryReplay", ctx), start = Date.parse("2023-07-08T15:14:00Z");
  const date = (seconds) => new Date(start + seconds * 1000).toISOString();
  const lane = {d:{num:1},lap:{dateStart:date(0)},context:{summary:{tyre:{compound:"SOFT"}},sources:{weather:{rows:[{date:date(10),track_temperature:30},{date:date(-2),track_temperature:27}]},raceControl:{rows:[{date:date(5),driver_number:4,message:"OTHER DRIVER"},{date:date(6),message:"YELLOW"},{date:date(20),message:"CHEQUERED"}]}}}};
  assert.equal(R.contextAt(lane,4).weather.track_temperature,27);
  assert.equal(R.contextAt(lane,5).event,null);
  assert.equal(R.contextAt(lane,11).weather.track_temperature,30);
  assert.equal(R.contextAt(lane,11).event.message,"YELLOW");
  assert.equal(R.contextAt({...lane,lap:{dateStart:date(30)}},0).event,null);
});

test("production geometry carries finite metre coordinates and rejects malformed payloads", () => {
  const R = vm.runInContext("DataTelemetryReplay", ctx);
  const geometry = JSON.parse(readFileSync("assets/telemetry/silverstone.json","utf8"));
  assert.equal(R.validGeometry(geometry),true);
  assert.equal(R.validGeometry({...geometry,units:"source units"}),false);
  assert.equal(R.validGeometry({...geometry,bounds:null}),false);
  assert.equal(R.validGeometry({...geometry,anchors:[0,.7,.3,1]}),false);
  assert.equal(R.validGeometry({...geometry,width:[null]}),false);
});

test("replay gauges reject future and stale telemetry while retaining recorded zero inputs", () => {
  const R = vm.runInContext("DataTelemetryReplay", ctx), start = Date.parse("2023-07-08T15:14:00Z");
  const lane = {lap:{dateStart:new Date(start).toISOString(),lapDuration:10},nativeCar:[{date:start+1000,gear:4,throttle:0,brake:0},{date:start+5000,gear:5,throttle:100,brake:1}]};
  assert.equal(R.sampleAt(lane,.5),null);
  assert.equal(R.sampleAt(lane,2).throttle,0);
  assert.equal(R.sampleAt(lane,3),null);
  assert.equal(R.sampleAt(lane,5).gear,5);
});

test("replay trails are bounded past history, preserve gaps and reset on rewind", () => {
  const R = vm.runInContext("DataTelemetryReplay", ctx), lane = {lap:{lapDuration:10}};
  const path = R.trailAt(lane,8,3,t=>t>6&&t<7?null:[t,t]);
  assert.equal(path[0][0],5);
  assert.equal(path.at(-1)[0],8);
  assert.ok(path.includes(null));
  assert.ok(path.length<=65);
  assert.equal(R.trailAt(lane,2,8,t=>[t,t])[0][0],0);
  assert.equal(R.trailAt(lane,20,3,t=>[t,t]).at(-1)[0],10);
  assert.equal(R.trailAt(lane,0,3,t=>[t,t]).length,0);
  assert.equal(R.trailAt(lane,8,0,t=>[t,t]).length,0);
});

test("the dot parks at a fix, not NaN, past the last car sample (#7315)", () => {
  const p = driver(90);
  p.car = p.car.filter((s) => s.t <= 80);                 // car data ends at 80 s, GPS runs to 90 s
  const tel = { loc: p.loc, car: p.car, cum: T._cumDist(p.car, 90) };   // as buildTelemetryView: lapDuration 90
  assert.equal(tel.cum.endCovered, false);
  const view = { primary: tel, tMax: 90, compare: null };
  const q = T._locAt(view, tel, 85);
  assert.ok(q && Number.isFinite(q.x) && Number.isFinite(q.y), `locAt(85) = ${JSON.stringify(q)}`);
});
