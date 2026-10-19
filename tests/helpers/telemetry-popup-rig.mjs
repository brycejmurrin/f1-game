// Telemetry-specific mini DOM and deterministic scheduler, shared only by
// popup unit tests. Trace mutations, drawing assertions and expected outputs
// stay with the caller.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { seedDom } from "./seed-dom.mjs";
import { makeDom } from "./mini-dom.mjs";
import { absSrc } from "./abs-src.mjs";

export function driver(dur = 80, r = 1600, speedKmh = 200) {
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

export async function telemetryPopupRig({ trace, dpr, draw = (_key, _args) => {} }) {
  const dom = makeDom();
  const timers = new Map(), frames = new Map(), observers = [];
  let nextId = 0;
  const makeElement = dom.document.createElement;
  dom.document.createElement = (tag) => {
    const node = makeElement(tag);
    if (tag === "canvas") {
      const drawing = new Proxy({}, { get: (target, key) => target[key] || ((...args) => draw(key, args)) });
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
  const meta = { sessionKey: 7, meetingKey: 1, name: "Race", type: "Race" };
  const context = vm.createContext({
    document: dom.document,
    window: { innerHeight: 800, innerWidth: 600, devicePixelRatio: dpr },
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
    vm.runInContext(readFileSync(absSrc(file), "utf8"), context, { filename: absSrc(file) });
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
  // Opening is explicit so callers can inspect the loaded chips first. Expose
  // pending maps without draining playback/observer work behind the caller.
  const drainTimers = () => { for (const [id, fn] of timers) { timers.delete(id); fn(); } };
  const openPopup = async () => {
    chips.forEach((chip) => chip.click());
    body.querySelector(".dh-livebtn").click();
    for (let i = 0; i < 12; i++) await Promise.resolve();
    drainTimers();
  };
  return { api, dom, context, body, chips, timers, frames, observers, openPopup, drainTimers };
}
