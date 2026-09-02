#!/usr/bin/env node
// @doc Boots js/game.js + `__apex` in a Node VM (renderer/DOM stubbed); `createGame({track})` drives physics, no browser.
// @skill debug-state
// game-vm.cjs — boot the REAL js/game.js headless in a Node VM.
//
// The sibling of track-build-vm.cjs one level up: where that harness loads the
// track ENGINE (manifest TRACK_VM) with GLX stubbed, this one loads the FULL
// manifest order through js/game.js, plus the LAZY_AGENT surface (agentview*,
// apex.js) that game.js injects at boot, so the driving model — updateCar,
// collisions, race flow — and the `__apex` JSON hooks (race/go/step/reset/
// physState/obs/act/jump/cars/setInput) run with no browser at all.
//
// What is stubbed (every one a browser API the boot touches; see STUBS below):
//   document / window / elements   inert DOM: getElementById returns a stub
//                                  element for any id; canvas.getContext("2d")
//                                  is a no-op 2D context, "webgl2" is null
//   <script> injection             document.head.appendChild(script) runs the
//                                  file in the VM (loadBackendScripts, scenery,
//                                  LAZY_AGENT, js/net, light-presets)
//   localStorage / sessionStorage  Map-backed
//   requestAnimationFrame          captured, never pumped (tests drive
//                                  __apex.step, which calls update() directly)
//   setTimeout / setInterval       queued; flushTimers() fires them by hand
//   AudioContext                   absent — GameAudio degrades to silent
//   fetch                          rejects like an offline browser
//   Image / FileReader             never fire onload
//   navigator / location / screen  desktop, non-touch, localhost
//   matchMedia / *Observer         inert
//   GLX                            the renderer is NOT loaded: a stub records
//                                  createMesh counts and no-ops every draw
//
// Usage (API):
//   const { createGame } = require("./tools/game-vm.cjs");
//   const g = await createGame({ track: "monza" });
//   g.apex.setInput({ throttle: true }); g.step(60); g.apex.physState();
// Usage (CLI):
//   node tools/game-vm.cjs [trackId]      # boot, race, 60 throttle steps, JSON
//
// No browser, no GPU. Measured boot (this container, loadavg ~4): ~1.5 s to
// __apex, ~2.5 s more to a built monza.

"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { performance } = require("perf_hooks");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST = require("./manifest.cjs");

// The one FULL entry NOT loaded: the WebGL2 renderer. Everything it would have
// exported is served by the GLX stub below. The shader/glx-pass files before it
// are plain data (GLSL strings, tables) and load unchanged.
const SKIP = new Set(["js/render/glx.js"]);

const noop = () => {};

// ---------------------------------------------------------------------------
// DOM stubs
// ---------------------------------------------------------------------------

function makeClassList(el) {
  const set = new Set();
  return {
    add: (...c) => { c.forEach((x) => set.add(x)); el.className = [...set].join(" "); },
    remove: (...c) => { c.forEach((x) => set.delete(x)); el.className = [...set].join(" "); },
    toggle: (c, force) => {
      const on = force === undefined ? !set.has(c) : !!force;
      if (on) set.add(c); else set.delete(c);
      el.className = [...set].join(" ");
      return on;
    },
    contains: (c) => set.has(c),
    replace: (a, b) => { if (set.delete(a)) set.add(b); },
    get length() { return set.size; },
    item: (i) => [...set][i] || null,
    forEach: (fn) => set.forEach(fn),
    [Symbol.iterator]: () => set[Symbol.iterator](),
    toString: () => [...set].join(" "),
  };
}

function makeStyle() {
  const decl = {};
  return new Proxy(decl, {
    get(t, k) {
      if (k === "setProperty") return (n, v) => { t[n] = String(v); };
      if (k === "getPropertyValue") return (n) => (t[n] !== undefined ? t[n] : "");
      if (k === "removeProperty") return (n) => { delete t[n]; };
      if (k === "cssText") return "";
      return t[k] !== undefined ? t[k] : "";
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function make2d(canvas) {
  const target = {
    canvas,
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(0, w * h * 4)), width: w, height: h }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(0, (w.width || w) * (w.height || h) * 4)), width: w.width || w, height: w.height || h }),
    measureText: (s) => ({ width: String(s || "").length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createConicGradient: () => ({ addColorStop: noop }),
    createPattern: () => ({ setTransform: noop }),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    isPointInPath: () => false,
    getLineDash: () => [],
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === "symbol") return undefined;
      return noop;               // fillRect, drawImage, save, restore, …
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function makeListeners() {
  const map = new Map();
  return {
    add: (type, fn) => { if (!map.has(type)) map.set(type, new Set()); map.get(type).add(fn); },
    remove: (type, fn) => { const s = map.get(type); if (s) s.delete(fn); },
    fire: (target, ev) => {
      const s = map.get(ev.type);
      if (!s) return;
      for (const fn of [...s]) { if (typeof fn === "function") fn.call(target, ev); else if (fn && fn.handleEvent) fn.handleEvent(ev); }
    },
  };
}

function createDom(sandbox, runScriptFile) {
  const byId = new Map();
  const rect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 });

  function makeElement(tag, id) {
    tag = String(tag || "div").toLowerCase();
    const ls = makeListeners();
    const el = {
      tagName: tag.toUpperCase(), nodeName: tag.toUpperCase(), nodeType: 1, localName: tag,
      id: id || "", hidden: false, disabled: false, open: false, checked: false, selected: false,
      textContent: "", innerHTML: "", innerText: "", value: "", className: "", title: "", href: "",
      src: "", type: "", name: "", placeholder: "", tabIndex: -1, inert: false, draggable: false,
      dataset: {}, children: [], childNodes: [], attributes: [],
      parentNode: null, parentElement: null, firstChild: null, lastChild: null,
      nextSibling: null, previousSibling: null, firstElementChild: null, lastElementChild: null,
      nextElementSibling: null, previousElementSibling: null,
      offsetWidth: 0, offsetHeight: 0, offsetTop: 0, offsetLeft: 0, offsetParent: null,
      clientWidth: tag === "canvas" ? 1280 : 0, clientHeight: tag === "canvas" ? 720 : 0,
      clientLeft: 0, clientTop: 0, scrollTop: 0, scrollLeft: 0, scrollHeight: 0, scrollWidth: 0,
      width: tag === "canvas" ? 1280 : 300, height: tag === "canvas" ? 720 : 150,
      naturalWidth: 0, naturalHeight: 0, complete: false, readyState: 0, duration: 0, volume: 1,
      currentTime: 0, paused: true, muted: false, loop: false, files: [],
      style: makeStyle(), isConnected: true,
    };
    el.classList = makeClassList(el);
    el.addEventListener = (t, fn) => ls.add(t, fn);
    el.removeEventListener = (t, fn) => ls.remove(t, fn);
    el.dispatchEvent = (ev) => { if (ev && !ev.target) ev.target = el; ls.fire(el, ev); const h = el["on" + (ev && ev.type)]; if (typeof h === "function") h.call(el, ev); return true; };
    el.querySelector = () => makeElement("div");
    el.querySelectorAll = () => [];
    el.getElementsByClassName = () => [];
    el.getElementsByTagName = () => [];
    el.closest = () => makeElement("div");
    el.matches = () => false;
    el.contains = (n) => n === el;
    el.appendChild = (c) => {
      if (c && c.nodeType === 1) { el.children.push(c); c.parentNode = c.parentElement = el; }
      el.childNodes.push(c);
      if (c && c.tagName === "SCRIPT" && c.src) runScriptFile(c);
      return c;
    };
    el.append = (...cs) => cs.forEach((c) => { if (c && typeof c === "object") el.appendChild(c); });
    el.prepend = el.append;
    el.insertBefore = (c) => el.appendChild(c);
    el.insertAdjacentElement = (_, c) => el.appendChild(c);
    el.insertAdjacentHTML = noop; el.insertAdjacentText = noop;
    el.removeChild = (c) => { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); const j = el.childNodes.indexOf(c); if (j >= 0) el.childNodes.splice(j, 1); return c; };
    el.replaceChildren = (...cs) => { el.children.length = 0; el.childNodes.length = 0; el.append(...cs); };
    el.replaceChild = (n, o) => { el.removeChild(o); return el.appendChild(n); };
    el.replaceWith = noop; el.remove = () => { if (el.parentNode) el.parentNode.removeChild(el); };
    el.cloneNode = () => makeElement(tag);
    el.setAttribute = (k, v) => { el.attributes[k] = String(v); if (k === "id") el.id = v; };
    el.getAttribute = (k) => (k in el.attributes ? el.attributes[k] : null);
    el.hasAttribute = (k) => k in el.attributes;
    el.removeAttribute = (k) => { delete el.attributes[k]; };
    el.toggleAttribute = (k, f) => { const on = f === undefined ? !(k in el.attributes) : !!f; if (on) el.attributes[k] = ""; else delete el.attributes[k]; return on; };
    el.focus = noop; el.blur = noop; el.click = () => el.dispatchEvent({ type: "click" }); el.select = noop;
    el.scrollIntoView = noop; el.scrollTo = noop; el.scrollBy = noop;
    el.getBoundingClientRect = rect; el.getClientRects = () => [];
    el.requestFullscreen = () => Promise.reject(new Error("fullscreen unavailable"));
    el.requestPointerLock = noop; el.setPointerCapture = noop; el.releasePointerCapture = noop;
    el.hasPointerCapture = () => false;
    el.showModal = () => { el.open = true; }; el.show = () => { el.open = true; }; el.close = () => { el.open = false; };
    el.animate = () => ({ cancel: noop, finish: noop, play: noop, pause: noop, finished: Promise.resolve(), onfinish: null });
    el.getAnimations = () => [];
    el.play = () => Promise.resolve(); el.pause = noop; el.load = noop; el.canPlayType = () => "";
    el.captureStream = () => ({ getTracks: () => [] });
    if (tag === "canvas") {
      el.getContext = (kind) => (kind === "2d" ? make2d(el) : null);
      el.toDataURL = () => "data:,";
      el.toBlob = (cb) => { if (cb) cb(null); };
      el.transferControlToOffscreen = () => { throw new Error("no offscreen canvas"); };
    }
    if (tag === "template") el.content = makeElement("div");
    return el;
  }

  const documentElement = makeElement("html");
  const head = makeElement("head");
  const body = makeElement("body");
  documentElement.children.push(head, body);
  const docLs = makeListeners();
  const document = {
    nodeType: 9, documentElement, head, body, defaultView: sandbox,
    hidden: false, visibilityState: "visible", readyState: "complete", title: "Apex 26",
    cookie: "", referrer: "", URL: "http://localhost:3456/", domain: "localhost",
    activeElement: body, fullscreenElement: null, pointerLockElement: null, currentScript: null,
    scrollingElement: documentElement, styleSheets: [], fonts: { ready: Promise.resolve(), status: "loaded", load: () => Promise.resolve([]), check: () => true, add: noop, addEventListener: noop },
    getElementById: (id) => {
      if (!byId.has(id)) byId.set(id, makeElement(id === "game" || id === "minimap" ? "canvas" : "div", id));
      return byId.get(id);
    },
    createElement: (tag) => makeElement(tag),
    createElementNS: (_, tag) => makeElement(tag),
    createTextNode: (t) => ({ nodeType: 3, textContent: String(t), nodeValue: String(t), data: String(t) }),
    createDocumentFragment: () => makeElement("fragment"),
    createEvent: () => ({ initEvent: noop, initCustomEvent: noop, preventDefault: noop }),
    querySelector: () => makeElement("div"),
    querySelectorAll: () => [],
    getElementsByTagName: () => [],
    getElementsByClassName: () => [],
    elementFromPoint: () => null,
    hasFocus: () => true,
    contains: () => true,
    exitFullscreen: () => Promise.resolve(),
    exitPointerLock: noop,
    addEventListener: (t, fn) => docLs.add(t, fn),
    removeEventListener: (t, fn) => docLs.remove(t, fn),
    dispatchEvent: (ev) => { docLs.fire(document, ev); return true; },
    _fire: (ev) => docLs.fire(document, ev),
  };
  return { document, makeElement, byId };
}

// ---------------------------------------------------------------------------
// Storage / timers / misc browser globals
// ---------------------------------------------------------------------------

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null),
    setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: (k) => { m.delete(String(k)); },
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] || null,
    get length() { return m.size; },
    _map: m,
  };
}

function makeTimers() {
  let seq = 1;
  const pending = new Map();   // id -> { fn, args, at, every }
  const now = () => performance.now();
  const api = {
    setTimeout: (fn, ms, ...args) => { const id = seq++; pending.set(id, { fn, args, at: now() + (+ms || 0), every: 0 }); return id; },
    setInterval: (fn, ms, ...args) => { const id = seq++; pending.set(id, { fn, args, at: now() + (+ms || 0), every: Math.max(1, +ms || 0) }); return id; },
    clearTimeout: (id) => { pending.delete(id); },
    clearInterval: (id) => { pending.delete(id); },
    // Fire every queued timer (due or not, in due order); intervals fire once
    // and re-arm. Returns how many ran. Nothing fires unless this is called.
    flush: (onlyDue) => {
      const t = now();
      const due = [...pending.entries()].filter(([, r]) => !onlyDue || r.at <= t).sort((a, b) => a[1].at - b[1].at);
      let n = 0;
      for (const [id, r] of due) {
        if (!pending.has(id)) continue;
        if (r.every) r.at = t + r.every; else pending.delete(id);
        if (typeof r.fn === "function") r.fn(...r.args);
        n++;
      }
      return n;
    },
    pending: () => pending.size,
  };
  return api;
}

// ---------------------------------------------------------------------------
// GLX stub — the renderer surface game.js / tracks.js / car3d reach at BUILD
// time. Everything render-only is a recorded no-op; feature-detected optionals
// (drawParticles, createTextureArray, softPresent, …) are ABSENT so each
// subsystem takes its documented degrade path exactly as on a backend without
// the feature.
// ---------------------------------------------------------------------------

function makeGlx(record) {
  const ABSENT = new Set([
    "createTextureArray", "setMaterialMaps", "drawParticles", "gpuTimer", "gpuMs",
    "softPresent", "awaitSoftPresent", "invalidateSoftPresent", "capturePixels",
    "__tlx", "shadowCullVP", "lampShadowBegin", "lampShadowEnd", "carShadowBegin",
    "carShadowEnd", "envFaceBegin", "envFaceEnd", "hasPerChunkLights", "then",
    "roadLutReady",   // WGX-only marker: tracks.js adds the GLX ground slab when it is absent
  ]);
  const meshOf = (buf, extra) => {
    const verts = buf && buf.pos ? buf.pos.length / 3 : 0;
    record.meshes++;
    return Object.assign({ verts, idxCount: buf && buf.idx ? buf.idx.length : 0 }, extra || {});
  };
  const base = {
    init: () => true,
    resize: noop,
    setRenderScale: () => false,
    getRenderScale: () => 1,
    get width() { return 1280; }, get height() { return 720; }, get aspect() { return 1280 / 720; },
    hdrMode: () => false, msaa: () => 1, pcss: () => false,
    isMobile: false, mobileTier: false,
    createMesh: (buf) => meshOf(buf),
    createTexMesh: (buf) => meshOf(buf),
    createChunkedMesh: (buf) => meshOf(buf, { chunked: true }),
    createTexture: () => ({ tex: true }),
    freeMesh: noop, freeChunkedMesh: noop, freeTexture: noop,
    createInstancedBatch: (geo, matrices) => ({
      verts: geo && geo.pos ? geo.pos.length / 3 : 0,
      instances: matrices && matrices.length ? matrices.length / 16 : 0, idxCount: 0, visible: 0,
    }),
    updateInstances: noop, cullInstances: noop, drawInstanced: noop, castShadowInstanced: noop, freeInstancedBatch: noop,
    makeFrustumPlanes: () => [],
    aabbInFrustum: () => true,
    envProbeReady: () => false, envProbeReset: noop,
    gpuErrors: () => 0,
    chunkedTrackCoords: noop,
  };
  return new Proxy(base, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === "symbol" || ABSENT.has(k)) return undefined;
      record.gfxUnknown.add(k);
      return noop;
    },
    has(t, k) { return (k in t) || !(typeof k === "symbol" || ABSENT.has(k)); },
    set(t, k, v) { t[k] = v; return true; },
    defineProperty(t, k, d) { Object.defineProperty(t, k, d); return true; },
  });
}

// ---------------------------------------------------------------------------
// The context
// ---------------------------------------------------------------------------

function buildSandbox(opts) {
  const record = { meshes: 0, gfxUnknown: new Set(), console: [], scripts: [], rejections: [] };
  const timers = makeTimers();
  const rafQueue = [];
  const echo = !!opts.verbose;
  const con = {};
  for (const m of ["log", "warn", "error", "info", "debug", "trace", "assert", "group", "groupEnd", "groupCollapsed", "table", "dir", "count", "time", "timeEnd", "timeLog"]) {
    con[m] = (...a) => { record.console.push([m, a.map((x) => (typeof x === "string" ? x : safeStr(x))).join(" ")]); if (echo) console[m === "assert" ? "log" : m](...a); };
  }

  const sandbox = {
    console: con,
    performance,
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
    setInterval: timers.setInterval, clearInterval: timers.clearInterval,
    queueMicrotask, structuredClone,
    TextEncoder, TextDecoder, URL, URLSearchParams, Blob, AbortController, AbortSignal,
    Headers: globalThis.Headers, Request: globalThis.Request, Response: globalThis.Response,
    crypto: globalThis.crypto,
    requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
    cancelAnimationFrame: noop,
    requestIdleCallback: () => 0, cancelIdleCallback: noop,
    fetch: (url) => Promise.reject(new TypeError("Failed to fetch (game-vm: no network) " + url)),
    innerWidth: 1280, innerHeight: 720, outerWidth: 1280, outerHeight: 720, devicePixelRatio: 1,
    scrollX: 0, scrollY: 0, pageXOffset: 0, pageYOffset: 0, name: "", isSecureContext: true,
    origin: "http://localhost:3456",
    location: { href: "http://localhost:3456/", protocol: "http:", host: "localhost:3456", hostname: "localhost",
      port: "3456", pathname: "/", search: "", hash: "", origin: "http://localhost:3456",
      reload: noop, replace: noop, assign: noop, toString: () => "http://localhost:3456/" },
    history: { state: null, length: 1, pushState: noop, replaceState: noop, back: noop, forward: noop, go: noop, scrollRestoration: "auto" },
    navigator: {
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 apex-game-vm",
      platform: "Linux x86_64", language: "en-US", languages: ["en-US"], onLine: true, webdriver: false,
      hardwareConcurrency: 4, maxTouchPoints: 0, deviceMemory: 8, vendor: "", cookieEnabled: true,
      getGamepads: () => [], vibrate: () => false, sendBeacon: () => false,
      permissions: { query: () => Promise.reject(new Error("no permissions")) },
    },
    screen: { width: 1280, height: 720, availWidth: 1280, availHeight: 720, colorDepth: 24, pixelDepth: 24,
      orientation: { type: "landscape-primary", angle: 0, addEventListener: noop, removeEventListener: noop,
        lock: () => Promise.reject(new Error("no orientation lock")), unlock: noop } },
    visualViewport: { width: 1280, height: 720, offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1, addEventListener: noop, removeEventListener: noop },
    matchMedia: (q) => ({ matches: false, media: q, onchange: null, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop }),
    getComputedStyle: () => new Proxy({ getPropertyValue: () => "" }, { get: (t, k) => (k in t ? t[k] : "") }),
    getSelection: () => ({ removeAllRanges: noop, rangeCount: 0 }),
    scrollTo: noop, scrollBy: noop, scroll: noop, focus: noop, blur: noop, close: noop, stop: noop, print: noop,
    open: () => null, alert: noop, confirm: () => false, prompt: () => null,
    CSS: { supports: () => false, escape: (s) => String(s) },
    localStorage: makeStorage(), sessionStorage: makeStorage(),
    __TEST_MODE: true,
  };
  const winLs = makeListeners();
  sandbox.addEventListener = (t, fn) => winLs.add(t, fn);
  sandbox.removeEventListener = (t, fn) => winLs.remove(t, fn);
  sandbox.dispatchEvent = (ev) => { winLs.fire(sandbox, ev); const h = sandbox["on" + (ev && ev.type)]; if (typeof h === "function") h.call(sandbox, ev); return true; };
  sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
  sandbox.parent = sandbox; sandbox.top = sandbox; sandbox.frames = sandbox;

  const ctx = vm.createContext(sandbox);

  // Realm-native constructors (Event subclasses, Image, observers) so
  // `instanceof` and `new` inside the game see this context's own intrinsics.
  vm.runInContext(`
    class Event { constructor(type, init) { this.type = type; Object.assign(this, init || {}); this.defaultPrevented = false; this.target = null; this.currentTarget = null; this.timeStamp = 0; }
      preventDefault() { this.defaultPrevented = true; } stopPropagation() {} stopImmediatePropagation() {} composedPath() { return []; } }
    class CustomEvent extends Event { constructor(type, init) { super(type, init); this.detail = init && init.detail !== undefined ? init.detail : null; } }
    class UIEvent extends Event {}
    class KeyboardEvent extends UIEvent { constructor(t, i) { super(t, i); this.key = (i && i.key) || ""; this.code = (i && i.code) || ""; } }
    class MouseEvent extends UIEvent {}
    class PointerEvent extends MouseEvent {}
    class WheelEvent extends MouseEvent {}
    class TouchEvent extends UIEvent {}
    class FocusEvent extends UIEvent {}
    class InputEvent extends UIEvent {}
    class ErrorEvent extends Event {}
    class PromiseRejectionEvent extends Event {}
    class DeviceOrientationEvent extends Event {}
    class DeviceMotionEvent extends Event {}
    class EventTarget { constructor() { this._l = new Map(); }
      addEventListener(t, f) { if (!this._l.has(t)) this._l.set(t, new Set()); this._l.get(t).add(f); }
      removeEventListener(t, f) { const s = this._l.get(t); if (s) s.delete(f); }
      dispatchEvent(e) { const s = this._l.get(e.type); if (s) for (const f of [...s]) f.call(this, e); return true; } }
    class Image { constructor(w, h) { this.width = w || 0; this.height = h || 0; this.naturalWidth = 0; this.naturalHeight = 0; this.complete = false; this._src = ""; this.onload = null; this.onerror = null; this.crossOrigin = null; this.decoding = "auto"; }
      get src() { return this._src; } set src(v) { this._src = String(v); } decode() { return Promise.reject(new Error("no image decode")); }
      addEventListener() {} removeEventListener() {} }
    class Audio { constructor(src) { this.src = src || ""; this.volume = 1; this.paused = true; this.currentTime = 0; this.duration = 0; this.readyState = 0; }
      play() { return Promise.reject(new Error("no audio")); } pause() {} load() {} addEventListener() {} removeEventListener() {} canPlayType() { return ""; } }
    class FileReader extends EventTarget { constructor() { super(); this.result = null; this.onload = null; this.onerror = null; } readAsDataURL() {} readAsText() {} readAsArrayBuffer() {} abort() {} }
    class ResizeObserver { constructor(cb) { this.cb = cb; } observe() {} unobserve() {} disconnect() {} }
    class MutationObserver { constructor(cb) { this.cb = cb; } observe() {} disconnect() {} takeRecords() { return []; } }
    class IntersectionObserver { constructor(cb) { this.cb = cb; } observe() {} unobserve() {} disconnect() {} }
    class PerformanceObserver { constructor(cb) { this.cb = cb; } observe() {} disconnect() {} }
    class HTMLElement {} class HTMLCanvasElement {} class HTMLImageElement {} class Element {} class Node {}
    class DOMException extends Error { constructor(m, n) { super(m); this.name = n || "Error"; } }
    class MediaQueryList {}
    class Worker { constructor() { throw new Error("game-vm: no Worker"); } }
    var onerror = null, onunhandledrejection = null;
  `, ctx, { filename: "game-vm:prelude" });

  // <script src> injection: strip the ?v= and run the file in this context.
  const dom = createDom(sandbox, (el) => {
    const rel = String(el.src).replace(/\?.*$/, "").replace(/^\.\//, "");
    setImmediate(() => {
      try {
        if (!fs.existsSync(path.join(ROOT, rel))) throw new Error("missing " + rel);
        runFile(ctx, rel, record);
        if (opts.onScript) opts.onScript(rel, ctx);
        if (typeof el.onload === "function") el.onload({ type: "load" });
      } catch (e) {
        record.scripts.push({ file: rel, error: String(e && e.message || e) });
        if (typeof el.onerror === "function") el.onerror({ type: "error", error: e });
      }
    });
  });
  sandbox.document = dom.document;
  sandbox.GLX = makeGlx(record);

  return { ctx, sandbox, record, timers, rafQueue, dom };
}

function safeStr(x) { try { return typeof x === "object" ? JSON.stringify(x) : String(x); } catch (_) { return String(x); } }

function runFile(ctx, relPath, record) {
  const src = fs.readFileSync(path.join(ROOT, relPath), "utf8");
  const t0 = performance.now();
  const r = vm.runInContext(src.replace(/^const\b/gm, "var"), ctx, { filename: relPath });
  record.scripts.push({ file: relPath, ms: +(performance.now() - t0).toFixed(1) });
  return r;
}

// Yield to the host event loop until `pred()` holds (scripts inject on
// setImmediate, startRace awaits ensureScenery). Bounded by `maxTurns`.
async function settle(pred, maxTurns) {
  const n = maxTurns || 2000;
  for (let i = 0; i < n; i++) {
    if (pred()) return true;
    await new Promise((r) => setImmediate(r));
  }
  return pred();
}

/**
 * createGame({ track, tod, wx, verbose }) → Promise<handle>
 *   track   circuit id ("monza") — when given, race()+go() before returning
 *   storage { key: value } pre-seeded into localStorage (apex26. prefix optional)
 *   handle  { apex, G, ctx, sandbox, step(n, dt), race(id, tod, wx),
 *             settle(pred), flushTimers(), record, bootMs, trackMs }
 */
async function createGame(opts) {
  opts = opts || {};
  let G = null;
  const world = buildSandbox(Object.assign({}, opts, {
    onScript: (rel, ctx) => {
      // apex.js is injected by game.js's own loader; capture the façade the
      // moment ApexApi.create(G) is called so the harness can hand G back.
      if (rel === "js/game/apex.js" && ctx.ApexApi && typeof ctx.ApexApi.create === "function") {
        const orig = ctx.ApexApi.create;
        ctx.ApexApi.create = function (g) { G = g; return orig.apply(this, arguments); };
      }
    },
  }));
  const { ctx, sandbox, record, timers } = world;
  // Pre-seed persisted settings (keys with or without the apex26. prefix; values
  // JSON-encoded the way GameStore reads them). The circuit to race goes in as
  // apex26.trackId so boot's raceAssets() fetches ITS scenery and the first
  // wrapped __apex call (lazyTrackEnsure) builds that circuit once, dressed —
  // instead of a bare bahrain followed by the real build.
  const seed = Object.assign({}, opts.track ? { trackId: opts.track } : {}, opts.storage || {});
  for (const k of Object.keys(seed)) {
    sandbox.localStorage.setItem(k.startsWith("apex26.") ? k : "apex26." + k, JSON.stringify(seed[k]));
  }
  const onRej = (reason) => { record.rejections.push(String(reason && reason.message || reason)); };
  process.on("unhandledRejection", onRej);

  const t0 = performance.now();
  let bootPromise = null;
  for (const f of MANIFEST.FULL) {
    if (SKIP.has(f)) continue;
    const r = runFile(ctx, f, record);
    if (f === "js/game.js") bootPromise = r;
  }
  // The game IIFE is async: it resolves after bootAgentSurface() (LAZY_AGENT
  // + js/net through the script stub above) and raceAssets().
  if (bootPromise && typeof bootPromise.then === "function") {
    await Promise.race([bootPromise, settle(() => sandbox.__apex != null, 4000)]);
  }
  await settle(() => sandbox.__apex != null, 4000);
  // raceAssets() (not awaited by boot) injects the boot circuit's scenery
  // closure on the next turns. The FIRST __apex call builds that circuit
  // (lazyTrackEnsure), so give the closure its turns to land or the build is
  // bare — and a bare build is a different physics world: its collidable
  // props are gone (measured: "steady corner load" diverged at step 75).
  const bootId = seed.trackId || (sandbox.Tracks && sandbox.Tracks.LIST[0] && sandbox.Tracks.LIST[0].id);
  if (bootId) await settle(() => !!(sandbox.TrackScenery && sandbox.TrackScenery[bootId]), 200);
  const bootMs = performance.now() - t0;
  if (!sandbox.__apex) {
    process.off("unhandledRejection", onRej);
    const err = new Error("game-vm: __apex never appeared — boot did not reach bootAgentSurface()");
    err.record = record;
    throw err;
  }

  const apex = sandbox.__apex;
  const handle = {
    apex, ctx, sandbox, record, bootMs, trackMs: 0,
    get G() { return G; },
    // Same shape the specs use: race(id, tod, wx) → wait info().track → go().
    async race(id, tod, wx) {
      const t1 = performance.now();
      // startRace() is async (it awaits the circuit's scenery closure), and
      // apex.race() does not hand its promise back. The browser fixture polls
      // info().track != null, which is already true on a page that raced
      // before — here the field is the tell: makeCars() replaces G.cars, so a
      // new identity means startRace() ran to completion for THIS call.
      const carsBefore = G ? G.cars : null;
      const r = apex.race(id || "monza", tod || "day", wx || "dry");
      if (!r) throw new Error("game-vm: unknown circuit " + id);
      const ok = await settle(() => {
        const i = apex.info();
        if (!i || i.track !== r.track) return false;
        return !G || G.cars !== carsBefore;
      }, 4000);
      if (!ok) throw new Error("game-vm: track never built for " + id);
      apex.go();
      handle.trackMs = performance.now() - t1;
      return r;
    },
    step: (n, dt) => apex.step(dt != null ? dt : 1 / 60, n != null ? n : 1),
    settle,
    flushTimers: (onlyDue) => timers.flush(onlyDue),
    pumpFrame: (now) => { const q = world.rafQueue.splice(0); for (const fn of q) fn(now != null ? now : performance.now()); return q.length; },
    close: () => { process.off("unhandledRejection", onRej); },
  };
  if (opts.track) await handle.race(opts.track, opts.tod, opts.wx);
  return handle;
}

module.exports = { createGame, settle, ROOT, SKIP };

if (require.main === module) {
  (async () => {
    const id = process.argv[2] || "monza";
    const g = await createGame({ track: id, verbose: /--verbose/.test(process.argv.join(" ")) });
    g.apex.setInput({ throttle: true, steer: 0 });
    g.step(60);
    const p = g.apex.physState();
    console.log(JSON.stringify({
      track: id, bootMs: +g.bootMs.toFixed(0), trackMs: +g.trackMs.toFixed(0),
      meshes: g.record.meshes, gfxUnknown: [...g.record.gfxUnknown],
      scriptErrors: g.record.scripts.filter((s) => s.error),
      rejections: g.record.rejections,
      warnings: g.record.console.filter((c) => c[0] === "warn" || c[0] === "error").slice(0, 20),
      physState: { s: p.s, x: p.x, speed: p.speed, lap: p.lap, prog: p.prog, head: p.head },
    }, null, 2));
    g.close();
  })().catch((e) => {
    console.error("FAIL:", e && e.stack || e);
    if (e && e.record) {
      console.error("console:", JSON.stringify(e.record.console.slice(-20), null, 1));
      console.error("scripts:", JSON.stringify(e.record.scripts.filter((s) => s.error)));
    }
    process.exit(1);
  });
}
