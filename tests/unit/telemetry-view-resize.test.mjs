// Telemetry popup ResizeObserver: the chart branch overwrote view.ratio BEFORE the map branch compared it,
// so a DPR / zoom change under unchanged boxes refit the trace charts but left the map canvas at the old
// ratio (soft, or oversized buffers). The ratio change is now read once, first, and both branches use it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { seedDom } from "../helpers/seed-dom.mjs";
import { makeDom } from "../helpers/mini-dom.mjs";

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

test("a DPR change under unchanged boxes refits the map canvas as well as the chart", async () => {
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
    window: { innerHeight: 800, innerWidth: 600, devicePixelRatio: 1 },
    setTimeout(fn) { const id = ++nextId; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame(fn) { const id = ++nextId; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    ResizeObserver: class {
      constructor(cb) { this.cb = cb; this.disconnected = false; observers.push(this); }
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
  chips.forEach((chip) => chip.click());
  body.querySelector(".dh-livebtn").click();
  for (let i = 0; i < 12; i++) await Promise.resolve();
  for (const [id, fn] of timers) { timers.delete(id); fn(); }

  const popup = dom.document.querySelector(".dh-tpopup");
  assert.ok(popup && popup.open);
  const chart = popup.querySelector(".dh-canvas"), map = popup.querySelector(".dh-canvas.dh-map");
  assert.ok(chart && map);
  assert.notEqual(chart, map, "the popup has a chart and a map canvas");
  const ratio0 = 2;   // zoom 2 x DPR 1
  assert.equal(map.width % ratio0, 0);
  const mw = map.width / ratio0, cw = chart.width / ratio0;
  // Keep both boxes exactly as built so only the ratio differs.
  const mainArea = popup.querySelector(".dh-telem-main"), sideArea = popup.querySelector(".dh-telem-side");
  mainArea._rect = { left: 0, top: 0, width: cw + 32, height: 400 };
  sideArea._rect = { left: 0, top: 0, width: mw + 24, height: 400 };
  assert.ok(observers.length >= 1 && observers[0].cb, "the popup observes its size");
  context.window.devicePixelRatio = 1.5;   // zoom 2 x 1.5 = ratio 3
  observers[0].cb();
  for (const [id, fn] of frames) { frames.delete(id); fn(); }
  assert.equal(chart.width, cw * 3, "the chart refits to the new ratio");
  assert.equal(map.width, mw * 3, "and so does the map canvas");
});
