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

const ctx = vm.createContext({});
seedLog(ctx);
seedDom(ctx);   // telemetry.js formats lap times through Dom.fmtLap
// js/core/mat4.js first — the shared scalar helpers (M4.clamp) telemetry.js binds at eval.
vm.runInContext(readFileSync("js/core/mat4.js", "utf8"), ctx, { filename: "mat4.js" });
for (const file of [
  "js/data/tab-utils.js", "js/data/telemetry-model.js", "js/data/telemetry-render.js",
  "js/data/telemetry-player.js", "js/data/telemetry-view.js", "js/data/telemetry.js"
]) {
  vm.runInContext(readFileSync(file, "utf8"), ctx, { filename: file });
}
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
  for (const name of ["api-transport", "api"]) {
    vm.runInContext(readFileSync(`js/data/${name}.js`, "utf8"), api, { filename: `${name}.js` });
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

// Exercise the real controller -> view -> player -> renderer wiring with a
// synthetic feed. Canvas methods are inert: this checks state and lifecycle,
// while the browser telemetry-compare spec owns layout and visible pixels.
test("telemetry lanes retain their colors and scrub/playback teardown survives a popup close", async () => {
  const dom = makeDom();
  const timers = new Map(), frames = new Map(), observers = [];
  let nextId = 0;
  const makeElement = dom.document.createElement;
  dom.document.createElement = (tag) => {
    const node = makeElement(tag);
    if (tag === "canvas") {
      const drawing = new Proxy({}, { get: (target, key) => target[key] || (() => {}) });
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
      carData: async (_session, num) => num === 2 ? [] : trace.car,
      locationData: async (_session, num) => num === 2 ? [] : trace.loc,
      stints: async () => [], pits: async () => []
    }
  });
  seedDom(context);
  for (const file of [
    "js/core/mat4.js", "js/data/tab-utils.js", "js/data/telemetry-model.js", "js/data/telemetry-render.js",
    "js/data/telemetry-player.js", "js/data/telemetry-view.js", "js/data/telemetry.js"
  ]) {
    vm.runInContext(readFileSync(file, "utf8"), context, { filename: file });
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

  const play = popup.querySelector(".dh-tplay");
  play.click();
  assert.equal(frames.size, 1);
  const tick = (ts) => {
    const [id, fn] = frames.entries().next().value;
    frames.delete(id); fn(ts);
  };
  tick(100); tick(1100);
  assert.equal(popup.querySelector(".dh-gspeed").querySelector(".dh-gval").textContent, 200);
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
