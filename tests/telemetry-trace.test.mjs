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

const ctx = vm.createContext({});
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
    console,
  });
  api.window = api;
  vm.runInContext(readFileSync("js/data/api.js", "utf8"), api, { filename: "api.js" });
  const F1API = vm.runInContext("F1API", api);
  const out = await F1API.locationData(9999, 4, null, null);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((p) => p.x), [3000, 3200]);
  assert.ok(out.every((p) => isFinite(p.date)));
});
