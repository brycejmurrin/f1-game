/* Apex 26 — GameMetrics: toggleable in-game FPS / car / log overlay.

   SETTINGS > DISPLAY > METRICS, or ` (backtick) / F9. Persists as
   apex26.metrics. URL `?metrics=1` overrides for the session without writing
   storage, same shape as CockpitOpts / PerfTry.

   WHY ITS OWN FILE. This is not a perf experiment (those reload) and not a
   quality tier. The overlay is DOM the player asked for, so it lives next to
   the other injected SETTINGS buttons (CockpitOpts, PerfTry) rather than
   growing js/game.js. The panel is created at runtime — no index.html node,
   no new CSS class (inline styles on a <pre id="game-metrics">).

   Tick is its own rAF at ~4 Hz. It never runs when OFF, and it never logs
   per frame. Turning ON raises the Log BUFFER to debug for the session so
   the overlay's tail actually fills; the console stays at shipped warn. */
const GameMetrics = (function () {
  "use strict";

const KEY = "apex26.metrics";
const PAINT_MS = 250;

let _on = null;
let _raf = 0;
let _lastPaint = 0;
let _panel = null;
let _btn = null;
let _keysBound = false;
let _raisedBuffer = null;

// Below #pausebtn / #btn-cam (z 14, top-right) and #hud-sectors. Left/top-8
// sat on the minimap and the POS/LAP/TIME row. pointer-events:none so a
// collision with a later HUD chip still clicks through.
const PANEL_STYLE = "position:fixed;right:8px;top:140px;z-index:12;margin:0;padding:8px 10px;" +
  "font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;" +
  "color:#d8ffe0;background:rgba(6,10,8,.72);border:1px solid rgba(90,180,110,.35);" +
  "border-radius:6px;pointer-events:none;white-space:pre;text-align:left;" +
  "max-width:min(46ch,calc(100vw - 16px));max-height:min(70vh,28em);overflow:hidden;" +
  "text-shadow:0 1px 0 #000";

function read() {
  try {
    const q = /[?&]metrics=(1|0|on|off|true|false)/i.exec(location.search);
    if (q) return /^(1|on|true)$/i.test(q[1]);
  } catch (_) { /* no location (VM / node) */ }
  try { return localStorage.getItem(KEY) === "1"; } catch (_) { return false; }
}

function on() {
  if (_on === null) _on = read();
  return _on;
}

function snapshot() {
  const out = {
    on: on(),
    fps: null, ms: null, budget: null, scale: null, tier: null, backend: "",
    state: "", track: "", session: "",
    lap: null, pos: null, total: null,
    speedKph: null, gear: null, energy: null, s: null, x: null,
    logs: [],
  };
  try {
    if (typeof PerfGov !== "undefined") {
      const ema = PerfGov.fpsEMA && PerfGov.fpsEMA();
      if (ema > 0) { out.fps = +(1000 / ema).toFixed(1); out.ms = +ema.toFixed(1); }
      if (PerfGov.floorMs) out.budget = +PerfGov.floorMs().toFixed(1);
      if (PerfGov.tier) out.tier = PerfGov.tier();
    }
  } catch (_) { /* governor not booted */ }
  try {
    if (typeof __apex !== "undefined" && __apex.perf) {
      const p = __apex.perf();
      if (p && p.ok !== false) {
        if (p.fps != null) out.fps = p.fps;
        if (p.floorMs != null) out.budget = p.floorMs;
        if (p.scale != null) out.scale = p.scale;
        if (p.tier != null) out.tier = p.tier;
      }
    }
  } catch (_) { /* apex not live / player not spawned */ }
  try {
    if (typeof GfxQuality !== "undefined" && GfxQuality.readBackend)
      out.backend = GfxQuality.readBackend() || "";
  } catch (_) { /* quality module absent in a VM */ }
  try {
    if (!out.backend) out.backend = localStorage.getItem("apex26.gfxBackend") || "";
  } catch (_) { /* storage blocked */ }
  try {
    if (typeof __apex !== "undefined" && __apex.info) {
      const i = __apex.info();
      if (i && i.ok !== false) {
        out.state = i.state || "";
        out.track = i.track || "";
        out.session = i.session || i.flow || "";
      }
    }
  } catch (_) { /* info needs a live G */ }
  try {
    if (typeof __apex !== "undefined" && __apex.timing) {
      const t = __apex.timing();
      if (t) {
        out.lap = t.lap;
        out.pos = t.pos;
        out.total = t.total;
        out.gear = t.gear;
        out.energy = t.energy;
      }
    }
  } catch (_) { /* timing needs player.px */ }
  // probe() is one Tracks.sample. obs() adds walls, a 3-point lookahead,
  // field sort, and reward terms — too much for a 4 Hz overlay.
  try {
    if (typeof __apex !== "undefined" && __apex.probe) {
      const o = __apex.probe();
      if (o) {
        if (o.speed != null) out.speedKph = +(o.speed * 3.6).toFixed(1);
        if (o.s != null) out.s = o.s;
        if (o.x != null) out.x = o.x;
      }
    }
  } catch (_) { /* probe needs player + track */ }
  try {
    if (typeof Log !== "undefined")
      out.logs = Log.records({ limit: 8 }).map((r) => r.level[0] + " " + r.ns + " " + r.msg);
  } catch (_) { /* log module absent */ }
  return out;
}

function ensurePanel() {
  if (_panel || typeof document === "undefined") return _panel;
  const el = document.createElement("pre");
  el.id = "game-metrics";
  el.setAttribute("aria-live", "polite");
  el.setAttribute("aria-label", "Debug metrics");
  el.style.cssText = PANEL_STYLE;
  document.body.appendChild(el);
  _panel = el;
  return el;
}

function fmt(v, digits) {
  if (v == null || v === "") return "—";
  if (typeof v === "number" && digits != null) return v.toFixed(digits);
  return String(v);
}

function paintOverlay() {
  const el = ensurePanel();
  if (!el) return;
  if (!on()) { el.hidden = true; return; }
  el.hidden = false;
  const s = snapshot();
  const lines = [
    "METRICS   `  or  F9  or  SETTINGS",
    "fps " + fmt(s.fps) + "   frame " + fmt(s.ms) + " ms   budget " + fmt(s.budget) + " ms",
    "scale " + fmt(s.scale) + "   tier " + fmt(s.tier) + "   gfx " + fmt(s.backend || null),
    (s.track || "menu") + "  " + (s.session || s.state || "") +
      "  lap " + fmt(s.lap) + "  P" + fmt(s.pos) + (s.total != null ? "/" + s.total : ""),
    "v " + fmt(s.speedKph) + " km/h  g" + fmt(s.gear) +
      "  s " + fmt(s.s, 1) + "  x " + fmt(s.x, 2) +
      "  ers " + fmt(s.energy, 2),
    "— log —",
  ].concat(s.logs.length ? s.logs : ["(empty — buffer raised to debug while this is on)"]);
  el.textContent = lines.join("\n");
}

function loop(now) {
  _raf = 0;
  if (!on()) return;
  if (now - _lastPaint >= PAINT_MS) {
    _lastPaint = now;
    paintOverlay();
  }
  if (typeof requestAnimationFrame === "function")
    _raf = requestAnimationFrame(loop);
}

function startLoop() {
  if (typeof requestAnimationFrame !== "function") return;
  if (!_raf) _raf = requestAnimationFrame(loop);
}

function paintBtn(btn) {
  if (!btn) return;
  btn.textContent = "METRICS: " + (on() ? "ON" : "OFF");
  btn.setAttribute("aria-pressed", on() ? "true" : "false");
}

function set(v) {
  const next = !!v;
  _on = next;
  try { localStorage.setItem(KEY, next ? "1" : "0"); } catch (_) { /* private mode: session-only */ }
  try { Log.info("game", "metrics " + (next ? "on" : "off")); } catch (_) { /* Log not loaded */ }
  if (next) {
    try {
      if (typeof Log !== "undefined") {
        const cur = Log.level().buffer;
        if (Log.LEVELS[cur] < Log.DEBUG) {
          _raisedBuffer = cur;
          Log.level("buffer:debug");
        }
      }
    } catch (_) { /* keep shipped thresholds */ }
    paintOverlay();
    startLoop();
  } else {
    try {
      if (typeof Log !== "undefined" && _raisedBuffer)
        Log.level("buffer:" + _raisedBuffer);
    } catch (_) { /* leave whatever the player set */ }
    _raisedBuffer = null;
    paintOverlay();
  }
  paintBtn(_btn);
  return next;
}

function toggle() { return set(!on()); }

function initUI() {
  try { Log.info("game", "GameMetrics.initUI"); } catch (_) { /* Log not loaded */ }
  if (typeof document === "undefined") return;
  const anchor = document.getElementById("pm-hidehud");
  const host = anchor && anchor.parentNode;
  if (host && !document.getElementById("pm-metrics")) {
    const b = document.createElement("button");
    b.id = "pm-metrics";
    b.type = "button";
    b.title = "Live FPS, car state, and recent Log lines. Keyboard: ` (backtick) or F9.";
    paintBtn(b);
    b.onclick = () => {
      toggle();
      try { if (typeof GameAudio !== "undefined" && GameAudio.uiSelect) GameAudio.uiSelect(); }
      catch (_) { /* audio not up yet; the toggle still applies */ }
    };
    if (anchor.nextSibling) host.insertBefore(b, anchor.nextSibling);
    else host.appendChild(b);
    _btn = b;
  }

  if (typeof window !== "undefined" && !_keysBound) {
    _keysBound = true;
    window.addEventListener("keydown", function (e) {
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key !== "`" && e.code !== "Backquote" && e.key !== "F9") return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      toggle();
    });
  }

  if (on()) { paintOverlay(); startLoop(); }
}

if (typeof document !== "undefined") {
  if (document.readyState !== "complete") document.addEventListener("DOMContentLoaded", initUI, { once: true });
  else initUI();
}

return { KEY, on, set, toggle, snapshot, PANEL_STYLE };
})();
