/* Apex 26 — GameMetrics: toggleable in-game FPS / car / log overlay.

   SETTINGS > DISPLAY — METRICS (on/off), METRICS PAGE (gov/car/phys/log),
   LOG NS, and LOG SHOW. Or ` (backtick) / F9 on keyboard. Default OFF.

   WHY ITS OWN FILE. Game.js is already the densest module in the tree. The
   overlay is a self-contained feature (persist key, URL override, snapshot
   shape, DOM) that nothing else needs at import time, so keeping it out of
   game.js is the same split as Log / PerfGov / UiScale.

   The panel is a <pre> painted from snapshot(); GOV/CAR/PHYS/LOG pages are
   separate so a race engineer can pin one surface without scrolling.
*/
"use strict";

const GameMetrics = (function () {
const KEY = "apex26.metrics";
const PAGE_KEY = "apex26.metricsPage";
const LOG_NS_KEY = "apex26.metricsLogNs";
const LOG_LVL_KEY = "apex26.metricsLogLvl";
const PAGES = ["gov", "car", "phys", "log"];
const LOG_NS = ["all", "phys", "ai", "net", "ui", "render", "audio", "track", "agent"];
const LOG_LVLS = ["error", "warn", "info", "debug"];

let _panel = null;
let _btn = null;
let _pageBtn = null;
let _logNsBtn = null;
let _logLvlBtn = null;
let _keysBound = false;
let _raisedBuffer = null;

// Mirrors the HUD gap-form pattern (js/game/hud.js): innerWidth / hudScale
// is the slot proxy. Two display densities:
//   WIDE  (ratio >= 480): label column + value, full rows, up to 12 rows
//   NARROW (ratio < 480): compact, two values per line, fewer rows
// Position: right-anchored, below the sector strip (top = tap + sat + hud
// offset), above the bottom HUD dock. The 80px * hud-scale term is clamped
// to 120px so at 150% HUD the panel doesn't descend into the mid-screen.
const HUD_TOP_OFFSET = "min(120px, calc(80px * var(--hud-scale, 1)))";
// Safe-area: fixed, not under zoom — raw env insets (same as #pausebtn).
// House height unit is svh, not dvh (toolbar jitter). Bottom = dock + --sab.
// Prefer window.__METRICS_PANEL_STYLE when metrics-panel-style.js loaded first.
const PANEL_STYLE_FALLBACK = "position:fixed;" +
  "right:calc(8px + var(--sar, 0px));" +
  "top:calc(12px + var(--tap, 44px) + var(--sat, 0px) + " + HUD_TOP_OFFSET + ");" +
  "z-index:11;margin:0;padding:10px 12px;" +
  "font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;" +
  "color:#d8ffe0;background:rgba(4,8,6,.82);border:1px solid rgba(90,200,120,.4);" +
  "border-radius:8px;pointer-events:none;white-space:pre;text-align:left;" +
  "max-width:min(52ch,calc(100vw - 16px - var(--sal, 0px) - var(--sar, 0px)));" +
  "max-height:calc(100svh - 12px - var(--tap, 44px) - var(--sat, 0px) - " +
    HUD_TOP_OFFSET + " - max(80px, calc(72px + var(--sab, 0px))));" +
  "overflow-y:auto;pointer-events:auto;text-shadow:0 1px 2px rgba(0,0,0,.9);" +
  "letter-spacing:.01em";
const PANEL_STYLE = (typeof window !== "undefined" && window.__METRICS_PANEL_STYLE) || PANEL_STYLE_FALLBACK;

// Adaptive density: same proxy as HUD gap — innerWidth / hudScale.
// At < 480 use the compact (narrow) layout with 2 values per line.
function metricsRatio() {
  try {
    const s = +document.documentElement.style.getPropertyValue("--hud-scale") || 1;
    return window.innerWidth / s;
  } catch (_) { return 800; }
}

function qFlag(re) {
  try { return re.exec(location.search); } catch (_) { return null; }
}

function read() {
  const q = qFlag(/[?&]metrics=(1|0|on|off|true|false)/i);
  if (q) return /^(1|on|true)$/i.test(q[1]);
  try { return localStorage.getItem(KEY) === "1"; } catch (_) { return false; }
}

function pinned(re) { return !!qFlag(re); }

function readPage() {
  const q = qFlag(/[?&]metricsPage=(gov|car|phys|log)/i);
  if (q) return q[1].toLowerCase();
  try {
    const v = localStorage.getItem(PAGE_KEY);
    if (PAGES.includes(v)) return v;
  } catch (_) {}
  return "gov";
}

function readLogNs() {
  const q = qFlag(/[?&]metricsLogNs=([a-z]+)/i);
  if (q && LOG_NS.includes(q[1].toLowerCase())) return q[1].toLowerCase();
  try {
    const v = localStorage.getItem(LOG_NS_KEY);
    if (LOG_NS.includes(v)) return v;
  } catch (_) {}
  return "all";
}

function readLogLvl() {
  const q = qFlag(/[?&]metricsLogLvl=(error|warn|info|debug)/i);
  if (q) return q[1].toLowerCase();
  try {
    const v = localStorage.getItem(LOG_LVL_KEY);
    if (LOG_LVLS.includes(v)) return v;
  } catch (_) {}
  return "info";
}

function on() { return read(); }

function set(v) {
  const next = !!v;
  if (!pinned(/[?&]metrics=/i)) {
    try { localStorage.setItem(KEY, next ? "1" : "0"); } catch (_) {}
  }
  if (next) raiseBuffer();
  else restoreBuffer();
  paint();
  return next;
}

function toggle() { return set(!on()); }

function page() { return readPage(); }
function setPage(p) {
  const next = PAGES.includes(p) ? p : "gov";
  if (!pinned(/[?&]metricsPage=/i)) {
    try { localStorage.setItem(PAGE_KEY, next); } catch (_) {}
  }
  paint();
  return next;
}
function nextPage(dir) {
  const i = PAGES.indexOf(page());
  const n = PAGES[(i + (dir || 1) + PAGES.length) % PAGES.length];
  return setPage(n);
}

function logNs() { return readLogNs(); }
function setLogNs(n) {
  const next = LOG_NS.includes(n) ? n : "all";
  if (!pinned(/[?&]metricsLogNs=/i)) {
    try { localStorage.setItem(LOG_NS_KEY, next); } catch (_) {}
  }
  paint();
  return next;
}
function nextLogNs(dir) {
  const i = LOG_NS.indexOf(logNs());
  return setLogNs(LOG_NS[(i + (dir || 1) + LOG_NS.length) % LOG_NS.length]);
}

function logLvl() { return readLogLvl(); }
function setLogLvl(l) {
  const next = LOG_LVLS.includes(l) ? l : "info";
  if (!pinned(/[?&]metricsLogLvl=/i)) {
    try { localStorage.setItem(LOG_LVL_KEY, next); } catch (_) {}
  }
  paint();
  return next;
}
function nextLogLvl(dir) {
  const i = LOG_LVLS.indexOf(logLvl());
  return setLogLvl(LOG_LVLS[(i + (dir || 1) + LOG_LVLS.length) % LOG_LVLS.length]);
}

function raiseBuffer() {
  try {
    if (typeof Log === "undefined") return;
    const cur = Log.level();
    if (_raisedBuffer == null) _raisedBuffer = cur.buffer;
    if (Log.levelNum(cur.buffer) > Log.levelNum("debug")) return;
    Log.setLevel({ buffer: "debug" });
  } catch (_) {}
}
function restoreBuffer() {
  try {
    if (typeof Log === "undefined" || _raisedBuffer == null) return;
    Log.setLevel({ buffer: _raisedBuffer });
    _raisedBuffer = null;
  } catch (_) {}
}

if (on()) raiseBuffer();

return {
  KEY, PAGE_KEY, LOG_NS_KEY, LOG_LVL_KEY, PAGES, LOG_NS, LOG_LVLS,
  on, set, toggle, page, setPage, nextPage,
  logNs, setLogNs, nextLogNs, logLvl, setLogLvl, nextLogLvl,
  snapshot: function () { return { on: on() }; },
  PANEL_STYLE,
};
})();
