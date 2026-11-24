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
import { absSrc } from "../helpers/abs-src.mjs";

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

async function openPopup(drs = 12, s1 = 25, gear = 7, circuitOverlay = false, gapped = false) {
  const dom = makeDom();
  const timers = new Map(), frames = new Map(), observers = [];
  let nextId = 0;
  const makeElement = dom.document.createElement;
  dom.document.createElement = (tag) => {
    const node = makeElement(tag);
    node.ownerDocument = dom.document;
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
  trace.car.forEach((sample) => Object.assign(sample, { gear, throttle: 80, brake: 0, rpm: 10000, drs }));
  if (gapped) trace.loc = trace.loc.filter((point) => point.date < 1e12 + 24000 || point.date > 1e12 + 32000);
  const meta = { sessionKey: 7, meetingKey: 1, name: "Race", type: "Race", circuit: circuitOverlay ? "Montreal" : "" };
  const context = vm.createContext({
    document: dom.document,
    Tracks: { LIST: [{ id: "montreal", _metaOnly: circuitOverlay }] },
    window: { innerHeight: 800, innerWidth: 600, devicePixelRatio: 1 },
    setTimeout(fn) { const id = ++nextId; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame(fn) { const id = ++nextId; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    ResizeObserver: class {
      constructor(cb) { this.cb = cb; this.disconnected = false; observers.push(this); }
      observe(node) { (this.targets ||= new Set()).add(node); }
      disconnect() { this.disconnected = true; }
    },
    F1API: {
      sessionDrivers: async () => drivers,
      fastestLap: async () => ({ dateStart: new Date(1e12).toISOString(), lapDuration: 80, lapNumber: 3, s1, s2: 25, s3: 30 }),
      carData: async (_session, num) => num === 2 ? [] : trace.car,
      locationData: async (_session, num) => num === 2 ? [] : trace.loc,
      stints: async () => [], pits: async () => []
    }
  });
  seedDom(context);
  for (const file of [
    "js/core/mat4.js", "js/ui/cvd-palette.js", "js/ui/track-maps.js", "js/data/tab-utils.js",
    "js/data/telemetry-model.js", "js/data/telemetry-render.js",
    "js/data/telemetry-player.js", "js/data/telemetry-context.js", "js/data/telemetry-replay.js",
    "js/data/telemetry-view.js", "js/data/telemetry.js", "js/data/real-race-script.js"
  ]) {
    let src = readFileSync(file, "utf8");
    if (circuitOverlay && file === "js/ui/track-maps.js") src = src.replace("const TrackMaps", "let TrackMaps");
    vm.runInContext(src, context, { filename: absSrc(file) });
  }
  if (circuitOverlay) vm.runInContext(`
    TrackMaps = { ...TrackMaps,
      drsZones: (track) => track._metaOnly ? [] : [{ a: 0.2, b: 0.3 }],
      corners: (track) => track._metaOnly ? [] : [{ entry: 0.95, exit: 1.1 }],
      cornerSpeed: () => 122,
    };
  `, context);
  const api = vm.runInContext("DataTelemetry", context).create({
    el, clear: (node) => node.replaceChildren(), emptyMsg: (text) => el("div", "dh-empty", text),
    spinner: () => el("div", "dh-spinner"), sel: { sessionKey: 7, meta },
    ensureSession: async () => {}, buildPicker: () => el("div"), invalidateOther() {},
    loadCircuit: async (index) => { context.Tracks.LIST[index]._metaOnly = false; },
    findTeam: () => null, cssColor: (color) => JSON.stringify(color), textColorOn: () => "white", COMPOUND: {}, NO_TELEM_MSG: "No data"
  });
  const body = await api.loadTelemetry();
  dom.byId("datahub").appendChild(body);
  const chips = body.querySelectorAll(".dh-dchip");
  chips.forEach((chip) => chip.click());
  body.querySelector(".dh-livebtn").click();
  for (let i = 0; i < 12; i++) await Promise.resolve();
  for (const [id, fn] of timers) { timers.delete(id); fn(); }
  await Promise.resolve();

  return { popup: dom.document.querySelector(".dh-tpopup"), observers, frames, context };
}

test("a DPR change under unchanged boxes refits the map canvas as well as the chart", async () => {
  const { popup, observers, frames, context } = await openPopup();
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

// W23 #6: 2026 car_data has `drs: null` on every sample (no DRS in the 2026
// rules): the popup built a DRS legend toggle, gauge pill and channel anyway.
test("a lap with no DRS values gets no DRS gauge or legend toggle; a lap with them keeps both", async () => {
  // One toggle per channel (compare mode: the both-drivers label button), named by its title.
  const labels = (popup) => popup.querySelectorAll(".dh-legend-item").map((b) => b.title)
    .filter((t) => / for both drivers$/.test(t)).map((t) => t.slice("Show / hide ".length, -" for both drivers".length));
  const none = (await openPopup(null)).popup;
  assert.equal(none.querySelector(".dh-gdrscell"), null, "no DRS pill for 2026");
  assert.equal(labels(none).filter((t) => t === "DRS").length, 0, "no DRS legend toggle");
  assert.ok(labels(none).length > 0, "the other channel toggles are still built");
  const some = (await openPopup(12)).popup;
  assert.ok(some.querySelector(".dh-gdrscell"), "a 2025 lap keeps the pill");
  assert.equal(labels(some).filter((t) => t === "DRS").length, 1);
});

test("column-only resizing refits the telemetry map", async () => {
  const { popup, observers, frames } = await openPopup();
  const main = popup.querySelector(".dh-telem-main"), side = popup.querySelector(".dh-telem-side");
  const observer = observers.find(item => item.targets.has(side));
  assert.ok(observer && observer.targets.has(main));
  const map = popup.querySelector(".dh-map");
  main._rect = { width: 392, height: 400, left: 0, top: 0 };
  side._rect = { width: 180, height: 400, left: 0, top: 0 };
  observer.cb([{ target: side }]);
  for (const [id, fn] of frames) { frames.delete(id); fn(); }
  assert.equal(map.width, (180 - 24) * 2);
  assert.equal(map.height, map.width);
  assert.equal(popup.open, true, "arranging playback leaves its native dialog open");
});

test("one map button cycles speed, sector colors and recorded gear", async () => {
  const { popup, context } = await openPopup();
  const [button, ...extra] = popup.querySelectorAll("[data-map-mode]");
  const key = popup.querySelector("[data-map-scale]");
  const map = popup.querySelector(".dh-map");
  assert.equal(extra.length, 0);
  assert.equal(button.textContent, "Map · Speed ↻");
  assert.equal(button.title, "Switch to Sectors");
  assert.equal(key.children[0].children.at(-1).textContent, "200 km/h");
  assert.ok(popup.querySelector(".dh-mapdot[data-reference]"), "the reference dot has a distinct ring");
  vm.runInContext('CvdPalette.set("deutan")', context);

  button.click();
  assert.equal(button.textContent, "Map · Sectors ↻");
  assert.match(map.getAttribute("aria-label"), /sectors/);
  assert.deepEqual([...key.children].map((item) => item.children[0].style.background),
    ["#4aa3ff", "#ddcc77", "#ff9ec8"]);

  button.click();
  assert.equal(button.textContent, "Map · Gears ↻");
  assert.equal(map.getAttribute("aria-label"), "Telemetry track map with driver positions and reference lap recorded gears.");
  assert.deepEqual([...key.children].map((item) => item.children.at(-1).textContent), ["G7"]);

  button.click();
  assert.equal(button.textContent, "Map · Speed ↻");
  assert.match(map.getAttribute("aria-label"), /speed/);
  assert.equal(key.children[0].children[0].textContent, "0 km/h");
  const partial = await openPopup(12, null, null);
  assert.equal(partial.popup.querySelector("[data-map-mode]").hidden, true);
});

test("the map button skips circuit overlays when the GPS lap has a gap", async () => {
  const { popup } = await openPopup(12, 25, 7, true);
  const button = popup.querySelector("[data-map-mode]");
  const map = popup.querySelector(".dh-map");
  const cycle = (control, steps) => Array.from({ length: steps }, () => {
    control.click();
    return control.textContent;
  });

  assert.deepEqual(cycle(button, 3), ["Map · Sectors ↻", "Map · Gears ↻", "Map · Active Aero ↻"]);
  assert.equal(map.getAttribute("aria-label"), "Telemetry track map with driver positions and reference lap game circuit aero zones.");
  button.click();
  assert.equal(button.textContent, "Map · Corner Speed ↻");
  assert.equal(map.getAttribute("aria-label"), "Telemetry track map with driver positions and reference lap estimated corner speed.");
  button.click();
  assert.equal(button.textContent, "Map · Speed ↻");

  const partial = await openPopup(12, 25, 7, true, true);
  assert.deepEqual(cycle(partial.popup.querySelector("[data-map-mode]"), 3), ["Map · Sectors ↻", "Map · Gears ↻", "Map · Speed ↻"]);
});

test("Track View uses the map viewport and keeps playback position through map zoom", async () => {
  const { popup, observers, frames } = await openPopup();
  const toggle = popup.querySelector("[data-track-toggle]");
  const seek = popup.querySelector('input[aria-label="Track playback time"]');
  const map = popup.querySelector(".dh-map");
  const mapFrame = popup.querySelector("[data-track-map-frame]");
  const zoom = popup.querySelector("[data-map-zoom-controls]");
  const reset = zoom.children[1];
  seek.value = "24";
  seek.dispatchEvent({ type: "input" });

  toggle.click();
  assert.equal(toggle.getAttribute("aria-pressed"), "true");
  mapFrame._rect = { width: 760, height: 220, left: 0, top: 0 };
  popup.querySelector(".dh-telem-main")._rect = { width: 760, height: 90, left: 0, top: 0 };
  const observer = observers.find(item => item.targets.has(mapFrame));
  assert.ok(observer);
  observer.cb();
  for (const [id, fn] of frames) { frames.delete(id); fn(); }
  assert.deepEqual([map.width, map.height], [1520, 440]);

  zoom.children[2].onclick();
  assert.equal(reset.textContent, "125%");
  assert.equal(mapFrame.hasAttribute("data-map-panned"), true);
  popup.querySelector("[data-map-mode]").click();
  assert.equal(reset.textContent, "125%");
  assert.equal(Number(seek.value), 24);

  toggle.click();
  assert.equal(map.style.transform, "");
  assert.equal(popup.querySelector(".dh-map"), map);
  assert.equal(toggle.getAttribute("aria-pressed"), "false");
  assert.equal(Number(seek.value), 24);
  assert.equal(popup.open, true);
});
