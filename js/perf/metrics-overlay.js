/* Apex 26 — GameMetrics: toggleable in-game FPS / car / log overlay.

   SETTINGS > DISPLAY — METRICS (on/off), METRICS PAGE (gov/car/phys/log),
   LOG NS, and LOG SHOW, folded into one METRICS <details> submenu this file
   builds (see the bottom). Or ` (backtick) / F9 on the canvas. Persists as
   apex26.metrics. URL `?metrics=1` overrides for the session without writing
   storage, same shape as CockpitOpts.

   WHY ITS OWN FILE. This is not a quality tier. The overlay is DOM the
   player asked for, so it lives next to the other injected SETTINGS buttons
   (CockpitOpts) rather than growing js/game.js. The panel is created at
   runtime — no index.html node, no new CSS class (inline styles on a
   <pre id="game-metrics">).

   Tick is its own rAF at ~4 Hz. It never runs when OFF, and it never logs
   per frame. Turning ON raises the Log BUFFER to debug for the session so
   the overlay's tail actually fills; the console stays at shipped warn.

   Pages stay on the canvas (no clipboard). ` / F9 toggles. While ON,
   [ ] cycle GOV/CAR/PHYS/LOG; 1–4 jump to a page; on LOG, - = cycle
   namespace and ; cycles the display level. */
const GameMetrics = (function () {
  "use strict";

const KEY = "apex26.metrics";
const PAGE_KEY = "apex26.metricsPage";
const LOG_NS_KEY = "apex26.metricsLogNs";
const LOG_LVL_KEY = "apex26.metricsLogLvl";
const PAINT_MS = 250;
const PAGES = ["gov", "car", "phys", "log"];
const LOG_NS = ["*", "track", "gfx", "game", "scenery", "car", "ui", "input", "net", "data", "audio", "assets"];
const LOG_LVLS = ["warn", "info", "debug"];

let _on = null;
let _page = null;
let _logNs = null;
let _logLvl = null;
let _raf = 0;
let _lastPaint = 0;
let _panel = null;
let _btn = null;
let _pageBtn = null;
let _logNsBtn = null;
let _logLvlBtn = null;
let _keysBound = false;
let _raisedBuffer = null;

// Mirrors the HUD gap-form pattern (js/ui/hud.js): innerWidth / hudScale
// is the slot proxy. Two display densities:
//   WIDE  (ratio >= 480): label column + value, full rows, up to 12 rows
//   NARROW (ratio < 480): compact, two values per line, fewer rows
// Position: right-anchored, below the sector strip (top = tap + sat + hud
// offset), above the bottom HUD dock. The 80px * hud-scale term is clamped
// to 120px so at 150% HUD the panel doesn't descend into the mid-screen.
// Safe-area aware: fixed (not under zoom) — raw env insets, same as #pausebtn.
// House height unit is svh, not dvh (toolbar jitter). Bottom = dock + --sab.
// (Was a one-string sibling file, metrics-panel-style.js, loaded before this
// one; the overlay's layout is its own concern.)
const HUD_TOP_OFFSET = "min(120px, calc(80px * var(--hud-scale, 1)))";
const PANEL_STYLE =
  "position:fixed;" +
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
  return GameStore.store.raw(KEY) === "1";
}

function pinned(re) { return !!qFlag(re); }

function readPage() {
  const q = qFlag(/[?&]metricsPage=(gov|car|phys|log)/i);
  if (q) return q[1].toLowerCase();
  const v = GameStore.store.raw(PAGE_KEY);
  if (PAGES.indexOf(v) >= 0) return v;
  return "gov";
}

function readLogNs() {
  const q = qFlag(/[?&]metricsLog=([A-Za-z*]+)/i);
  if (q) {
    const v = q[1].toLowerCase();
    if (LOG_NS.indexOf(v) >= 0) return v;
  }
  const v = GameStore.store.raw(LOG_NS_KEY);
  if (LOG_NS.indexOf(v) >= 0) return v;
  return "*";
}

function readLogLvl() {
  const q = qFlag(/[?&]metricsLvl=(warn|info|debug)/i);
  if (q) return q[1].toLowerCase();
  const v = GameStore.store.raw(LOG_LVL_KEY);
  if (LOG_LVLS.indexOf(v) >= 0) return v;
  return "warn";
}

function on() {
  if (_on === null) _on = read();
  return _on;
}

function page() {
  if (_page === null) _page = readPage();
  return _page;
}

function logNs() {
  if (_logNs === null) _logNs = readLogNs();
  return _logNs;
}

function logLvl() {
  if (_logLvl === null) _logLvl = readLogLvl();
  return _logLvl;
}

function store(key, val, pinRe) {
  if (pinned(pinRe)) return;
  GameStore.store.rawSet(key, val);   // a blocked write is session-only, and store.broken says so
}

function snapshot() {
  const pg = page();
  const wantGov = pg === "gov";
  const wantCar = pg === "car";
  const wantPhys = pg === "phys";
  const wantLog = pg === "log";
  const out = {
    on: on(),
    page: page(),
    logNs: logNs(),
    logLvl: logLvl(),
    fps: null, ms: null, budget: null, scale: null, tier: null, backend: "",
    auto: null, strikes: null, tierFloor: null, gpuMs: null,
    // What the BOUND backend says about the device: which API three/WGX
    // actually took, how many GPU/shader errors it has raised, and the first
    // one. A phone screenshot of this panel is the evidence a "see-through
    // car on THREE.JS" report never carried (the pick label alone cannot tell
    // WebGPU from WebGL2, or a rejected pipeline from a healthy one).
    gfxApi: "", gpuErr: null, gpuFirst: "", tlx: "",
    state: "", track: "", session: "", flow: "",
    lapsTarget: null, quali: null, career: null, turns: null,
    lap: null, pos: null, total: null,
    lapTime: null, best: null, lastLap: null, raceT: null,
    gapAhead: null, gapBehind: null, aeroX: null, sector: null,
    speedKph: null, speedIsDash: false, dashKph: null, gndKph: null,
    gear: null, energy: null, s: null, x: null,
    angle: null, k: null, hw: null,
    cam: "", caution: "", buildDone: "",
    slipDeg: null, vLat: null, yawRate: null, slipFactor: null,
    axEstSm: null, axFrac: null, slope: null, wrongWay: null, rescueT: null,
    head: null, vmaxNow: null, aeroGrip: null, aeroDf: null,
    xOn: null, xArmed: null, aeroLoad: null,
    logConsole: "", logBuffer: "", logN: 0, logShown: 0,
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
        if (p.auto != null) out.auto = p.auto;
        if (p.crashStrikes != null) out.strikes = p.crashStrikes;
        if (p.tierFloor != null) out.tierFloor = p.tierFloor;
      }
    }
  } catch (_) { /* apex not live / player not spawned */ }
  try {
    if (wantGov && typeof __apex !== "undefined" && __apex.gpuTimer) {
      const g = __apex.gpuTimer();
      if (g && g.ms != null && g.ms >= 0) out.gpuMs = +g.ms.toFixed(2);
    }
  } catch (_) { /* SwiftShader / no EXT */ }
  try {
    if (typeof RendererPicker !== "undefined" && RendererPicker.readBackend)
      out.backend = RendererPicker.readBackend() || "";
  } catch (_) { /* quality module absent in a VM */ }
  try {
    if (!out.backend) out.backend = GameStore.store.raw("apex26.gfxBackend") || "";
    try {
      if (typeof GLX !== "undefined") {
        if (typeof GLX.gpuErrors === "function") out.gpuErr = GLX.gpuErrors() | 0;
        if (typeof GLX.backendState === "function") {
          const bs = GLX.backendState();
          if (bs) {
            if (bs.api) out.gfxApi = String(bs.api);
            if (bs.gpuFirstError) out.gpuFirst = String(bs.gpuFirstError).slice(0, 72);
            if (bs.gpuErrors != null) out.gpuErr = bs.gpuErrors | 0;
            // TLX only: the presentation path, the readback counters, the pack
            // and the debug switches — the fields a phone A/B needs to see.
            if (bs.softRead) {
              out.tlx = "blit " + (bs.softBlit ? "on" : "—") +
                "  read g" + (bs.softRead.gen | 0) + "/f" + (bs.softRead.fails | 0) +
                "  pack " + (bs.packLive ? "ok" : "—") +
                "  heal " + (bs.healed ? "yes" : "—") +
                (bs.calls != null ? "  dc " + (bs.calls | 0) : "") +
                (bs.arrayNearest ? "  ARRAYNEAREST" : "") + (bs.noMrt ? "  NOMRT" : "") +
                (bs.drawMatMode ? "  matMode " + bs.drawMatMode : "");
            }
          }
        }
      }
    } catch (_) { /* backend not bound yet */ }
  } catch (_) { /* storage blocked */ }
  try {
    if (typeof __apex !== "undefined" && __apex.info) {
      const i = __apex.info();
      if (i && i.ok !== false) {
        out.state = i.state || "";
        out.track = i.track || "";
        out.session = i.session || i.flow || "";
        out.flow = i.flow || "";
        if (i.lapsTarget != null) out.lapsTarget = i.lapsTarget;
        if (i.raceQuali != null) out.quali = i.raceQuali;
        if (i.career != null) out.career = i.career;
        if (i.turns != null) out.turns = i.turns;
      }
    }
  } catch (_) { /* info needs a live G */ }
  try {
    if (wantCar && typeof __apex !== "undefined" && __apex.timing) {
      const t = __apex.timing();
      if (t) {
        out.lap = t.lap;
        out.pos = t.pos;
        out.total = t.total;
        out.gear = t.gear;
        out.energy = t.energy;
        if (t.lapTime != null) out.lapTime = t.lapTime;
        if (t.best != null) out.best = t.best;
        if (t.lastLap != null) out.lastLap = t.lastLap;
        if (t.raceT != null) out.raceT = t.raceT;
        if (t.gapAhead != null) out.gapAhead = t.gapAhead;
        if (t.gapBehind != null) out.gapBehind = t.gapBehind;
        if (t.aeroX != null) out.aeroX = t.aeroX;
        if (t.sector != null) out.sector = t.sector;
      }
    }
  } catch (_) { /* timing needs player.px */ }
  // HUD km/h is dashKph (vStd*3.6), not raw ground*3.6. Keep both: a painted
  // 0 is a real parked reading, and headless leaves the digit at 0.
  try {
    if (wantCar && typeof document !== "undefined") {
      const n = document.getElementById("hud-speed-n");
      const v = n && parseFloat(n.textContent);
      if (isFinite(v)) { out.dashKph = v; out.speedKph = v; out.speedIsDash = true; }
    }
  } catch (_) { /* no HUD (VM / menu) */ }
  // probe() is one Tracks.sample. obs() adds walls, a 3-point lookahead,
  // field sort, and reward terms — too much for a 4 Hz overlay.
  try {
    if (wantCar && typeof __apex !== "undefined" && __apex.probe) {
      const o = __apex.probe();
      if (o) {
        if (o.speed != null) out.gndKph = +(o.speed * 3.6).toFixed(1);
        if (out.speedKph == null && out.gndKph != null) out.speedKph = out.gndKph;
        if (o.s != null) out.s = o.s;
        if (o.x != null) out.x = o.x;
        if (o.angle != null) out.angle = o.angle;
        if (o.k != null) out.k = o.k;
        if (o.hw != null) out.hw = o.hw;
      }
    }
  } catch (_) { /* probe needs player + track */ }
  try {
    if (wantPhys && typeof __apex !== "undefined" && __apex.physState) {
      const p = __apex.physState();
      if (p && p.ok !== false) {
        if (p.slipDeg != null) out.slipDeg = p.slipDeg;
        if (p.vLat != null) out.vLat = p.vLat;
        if (p.yawRate != null) out.yawRate = p.yawRate;
        if (p.slipFactor != null) out.slipFactor = p.slipFactor;
        if (p.axEstSm != null) out.axEstSm = p.axEstSm;
        if (p.axFrac != null) out.axFrac = p.axFrac;
        if (p.slope != null) out.slope = p.slope;
        if (p.wrongWay != null) out.wrongWay = p.wrongWay;
        if (p.rescueT != null) out.rescueT = p.rescueT;
        if (p.head != null) out.head = p.head;
        if (p.vmaxNow != null) out.vmaxNow = p.vmaxNow;
        if (p.aeroGrip != null) out.aeroGrip = p.aeroGrip;
        if (p.aeroDf != null) out.aeroDf = p.aeroDf;
        if (p.xOn != null) out.xOn = p.xOn;
        if (p.xArmed != null) out.xArmed = p.xArmed;
        if (p.aeroLoad != null) out.aeroLoad = p.aeroLoad;
        if (out.aeroX == null && p.aeroX != null) out.aeroX = p.aeroX;
      }
    }
  } catch (_) { /* physState needs player.px */ }
  try {
    if (typeof __apex !== "undefined" && __apex.camera) {
      const c = __apex.camera();
      if (c && c.mode) out.cam = c.mode;
    }
  } catch (_) { /* camera hook needs CAM_MODES */ }
  try {
    if (typeof __apex !== "undefined" && __apex.caution) {
      const c = __apex.caution();
      if (c && c.label) out.caution = c.label;
    }
  } catch (_) { /* caution layer absent */ }
  try {
    if (typeof Log !== "undefined") {
      const lv = Log.level();
      out.logConsole = lv.console || "";
      out.logBuffer = lv.buffer || "";
      if (wantLog) {
        const rec = Log.records();
        out.logN = rec.length;
        const ns = logNs();
        const filt = { level: logLvl(), limit: 12 };
        if (ns && ns !== "*") filt.ns = ns;
        const shown = Log.records(filt);
        out.logShown = shown.length;
        out.logs = shown.map((r) => r.level[0] + " " + r.ns + " " + r.msg);
      }
      if (wantGov && out.track) {
        const tr = Log.records({ ns: "track", level: "info" });
        for (let i = tr.length - 1; i >= 0; i--) {
          if (/^build done /.test(tr[i].msg) && tr[i].msg.indexOf(out.track) >= 0) {
            out.buildDone = tr[i].msg;
            break;
          }
        }
      }
    }
  } catch (_) { /* log module absent */ }
  return out;
}

function ensurePanel() {
  if (_panel || typeof document === "undefined") return _panel;
  const el = document.createElement("pre");
  el.id = "game-metrics";
  el.setAttribute("aria-label", "Debug metrics");
  el.style.cssText = PANEL_STYLE;
  document.body.appendChild(el);
  _panel = el;
  return el;
}

function fmt(v, digits) {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number" && digits != null) return v.toFixed(digits);
  return String(v);
}

function fmtTime(t) {
  if (t == null || !isFinite(t)) return "—";
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return m + ":" + (s < 10 ? "0" : "") + s.toFixed(3);
}

function pageTabs(cur) {
  return PAGES.map((p) => (p === cur ? "▸" + p.toUpperCase() : p)).join("  ");
}

// Two-column row: label (padded to L chars) then value.
const L = 8;
function row(label, value) { return (label + ":").padEnd(L) + " " + value; }
function sep() { return "─".repeat(24); }

// Compact two-value pair for narrow screens.
function pair(l1, v1, l2, v2) { return l1 + " " + v1 + "   " + l2 + " " + v2; }

function paintOverlay() {
  const el = ensurePanel();
  if (!el) return;
  if (!on()) { el.hidden = true; return; }
  el.hidden = false;
  const s = snapshot();
  const narrow = metricsRatio() < 480;
  const hdr = "● " + pageTabs(s.page) + "  ] [  1-4";
  let lines;

  if (s.page === "car") {
    if (narrow) {
      lines = [
        hdr,
        pair("spd", fmt(s.dashKph) + "km/h", "g", fmt(s.gear)),
        pair("ERS", fmt(s.energy, 2), "aero", fmt(s.aeroX, 2)),
        pair("P",   fmt(s.pos), "lap", fmt(s.lap) + (s.lapsTarget != null ? "/" + s.lapsTarget : "")),
        "t   " + fmtTime(s.lapTime) + "  best " + fmtTime(s.best),
        pair("gap", fmt(s.gapAhead, 1) + "/" + fmt(s.gapBehind, 1), "S", fmt(s.sector)),
      ];
    } else {
      lines = [
        hdr,
        sep(),
        row("speed",  fmt(s.dashKph) + " km/h   gnd " + fmt(s.gndKph) + " km/h"),
        row("gear",   fmt(s.gear) + "   ERS " + fmt(s.energy, 2) + "   aero " + fmt(s.aeroX, 2)),
        row("pos",    "P" + fmt(s.pos) + (s.total != null ? "/" + s.total : "") +
                      "   lap " + fmt(s.lap) + (s.lapsTarget != null ? "/" + s.lapsTarget : "") +
                      "   S" + fmt(s.sector)),
        row("time",   fmtTime(s.lapTime) + "   best " + fmtTime(s.best)),
        row("last",   fmtTime(s.lastLap)),
        row("gap",    fmt(s.gapAhead, 1) + " / " + fmt(s.gapBehind, 1) + " m"),
        row("s  x",   fmt(s.s, 1) + "   " + fmt(s.x, 2) + "   k " + fmt(s.k, 4)),
      ];
    }
  } else if (s.page === "phys") {
    if (narrow) {
      lines = [
        hdr,
        pair("slip", fmt(s.slipDeg, 1) + "°", "slipF", fmt(s.slipFactor, 2)),
        pair("vLat", fmt(s.vLat, 2), "yaw", fmt(s.yawRate, 2)),
        pair("ax",   fmt(s.axEstSm, 2), "slope", fmt(s.slope, 3)),
        pair("vmax", fmt(s.vmaxNow, 1), "ww", fmt(s.wrongWay)),
        pair("grip", fmt(s.aeroGrip, 3), "xOn", fmt(s.xOn)),
      ];
    } else {
      lines = [
        hdr,
        sep(),
        row("slip",   fmt(s.slipDeg, 1) + "°   vLat " + fmt(s.vLat, 2) + "   slipF " + fmt(s.slipFactor, 2)),
        row("yaw",    fmt(s.yawRate, 2) + " rad/s   ax " + fmt(s.axEstSm, 2) + "   axFrac " + fmt(s.axFrac, 2)),
        row("slope",  fmt(s.slope, 3) + "   wrongWay " + fmt(s.wrongWay) + "   rescue " + fmt(s.rescueT, 1) + "s"),
        row("vmax",   fmt(s.vmaxNow, 1) + " m/s   head " + fmt(s.head, 2)),
        row("aero",   "grip " + fmt(s.aeroGrip, 3) + "   df " + fmt(s.aeroDf, 2) + "   load " + fmt(s.aeroLoad, 2)),
        row("DRS",    "on " + fmt(s.xOn) + "   armed " + fmt(s.xArmed) + "   aeroX " + fmt(s.aeroX, 2)),
      ];
    }
  } else if (s.page === "log") {
    const filterRow = fmt(s.logLvl) + "  ns:" + fmt(s.logNs) + "  " + fmt(s.logShown) + "/" + fmt(s.logN);
    const logMax = narrow ? 36 : 50;
    const trimLog = (str) => str.length > logMax ? str.slice(0, logMax - 1) + "\u2026" : str;
    lines = [
      hdr + "  = ns  ; lvl",
      sep(),
      row("level",  fmt(s.logConsole || null) + " / buf:" + fmt(s.logBuffer || null)),
      row("show",   filterRow),
      sep(),
    ].concat(s.logs.length ? s.logs.map(trimLog) : ["(empty — raise level with ;",
                                                     " or cycle ns with =)"]);
  } else {
    // GOV — most critical: fps + frame time front, then context
    if (narrow) {
      lines = [
        hdr,
        pair("fps", fmt(s.fps), "ms", fmt(s.ms)),
        pair("tier", fmt(s.tier), "auto", fmt(s.auto)),
        pair("gfx", fmt(s.backend || null) + (s.gfxApi ? "/" + s.gfxApi : ""), "err", fmt(s.gpuErr)),
        (s.track || "menu") + "  " + (s.caution || "GREEN"),
      ].concat(s.gpuFirst ? [s.gpuFirst.slice(0, 40)] : []).concat(s.tlx ? [s.tlx.slice(0, 44)] : []);
    } else {
      lines = [
        hdr,
        sep(),
        row("fps",    fmt(s.fps) + "   frame " + fmt(s.ms) + " ms" +
                      (s.gpuMs != null ? "   gpu " + s.gpuMs + " ms" : "")),
        row("budget", fmt(s.budget) + " ms   tier " + fmt(s.tier) +
                      (s.tierFloor != null ? " (fl " + s.tierFloor + ")" : "") +
                      "   auto " + fmt(s.auto)),
        // err FIRST: on a phone the row's tail is what clips, and the error
        // count is the one number a "nothing renders" screenshot must carry.
        row("gfx",    fmt(s.backend || null) + (s.gfxApi ? "/" + s.gfxApi : "") +
                      "   err " + fmt(s.gpuErr) + "   strikes " + fmt(s.strikes) +
                      (s.scale != null ? "   scale " + fmt(s.scale) : "")),
      ].concat(s.gpuFirst ? [row("gpu", s.gpuFirst)] : [])
       .concat(s.tlx ? [row("tlx", s.tlx)] : []).concat([
        sep(),
        row("session", (s.track || "menu") + "  " + (s.flow || s.session || s.state || "") +
                       "  " + (s.caution || "GREEN") + "  cam " + fmt(s.cam || null) +
                       (s.quali ? "  quali" : "") + (s.career ? "  career" : "")),
        row("build",  s.buildDone ? s.buildDone.replace(/^build done /, "") : "—"),
      ]);
    }
  }
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

function paintPageBtn(btn) {
  if (!btn) return;
  btn.textContent = "METRICS PAGE: " + page().toUpperCase();
  btn.setAttribute("aria-pressed", on() ? "true" : "false");
}

function paintLogNsBtn(btn) {
  if (!btn) return;
  btn.textContent = "LOG NS: " + logNs().toUpperCase();
}

function paintLogLvlBtn(btn) {
  if (!btn) return;
  btn.textContent = "LOG SHOW: " + logLvl().toUpperCase();
}

function paintSettingBtns() {
  paintBtn(_btn);
  paintPageBtn(_pageBtn);
  paintLogNsBtn(_logNsBtn);
  paintLogLvlBtn(_logLvlBtn);
}

function raiseBuffer() {
  try {
    const cur = Log.level();
    if (Log.LEVELS[cur.buffer] >= Log.DEBUG) return;
    _raisedBuffer = { buffer: cur.buffer, bufferNs: cur.bufferNs };
    Log.level("buffer:debug");
    const ns = _raisedBuffer.bufferNs;
    for (const k in ns) Log.level("buffer:" + k + ":" + ns[k]);
  } catch (_) { /* keep shipped thresholds */ }
}

function restoreBuffer() {
  if (!_raisedBuffer) return;
  try {
    Log.level("buffer:" + _raisedBuffer.buffer);
    const ns = _raisedBuffer.bufferNs;
    for (const k in ns) Log.level("buffer:" + k + ":" + ns[k]);
  } catch (_) { /* leave whatever the player set */ }
  _raisedBuffer = null;
}

function set(v) {
  const next = !!v;
  _on = next;
  store(KEY, next ? "1" : "0", /[?&]metrics=/i);
  try { Log.info("game", "metrics " + (next ? "on " + page() : "off")); } catch (_) { /* Log not loaded */ }
  if (next) {
    raiseBuffer();
    paintOverlay();
    startLoop();
  } else {
    restoreBuffer();
    paintOverlay();
  }
  paintSettingBtns();
  return next;
}

function toggle() { return set(!on()); }

function setPage(name) {
  const next = String(name || "").toLowerCase();
  if (PAGES.indexOf(next) < 0) return page();
  _page = next;
  store(PAGE_KEY, next, /[?&]metricsPage=/i);
  try { if (on()) Log.info("game", "metrics page " + next); } catch (_) { /* Log not loaded */ }
  if (on()) paintOverlay();
  paintSettingBtns();
  return _page;
}

function nextPage(dir) {
  const i = PAGES.indexOf(page());
  const d = dir < 0 ? -1 : 1;
  return setPage(PAGES[(i + d + PAGES.length) % PAGES.length]);
}

function setLogNs(name) {
  const next = String(name || "").toLowerCase();
  if (LOG_NS.indexOf(next) < 0) return logNs();
  _logNs = next;
  store(LOG_NS_KEY, next, /[?&]metricsLog=/i);
  if (on()) paintOverlay();
  paintSettingBtns();
  return _logNs;
}

function nextLogNs(dir) {
  const i = LOG_NS.indexOf(logNs());
  const d = dir < 0 ? -1 : 1;
  return setLogNs(LOG_NS[(Math.max(0, i) + d + LOG_NS.length) % LOG_NS.length]);
}

function setLogLvl(name) {
  const next = String(name || "").toLowerCase();
  if (LOG_LVLS.indexOf(next) < 0) return logLvl();
  _logLvl = next;
  store(LOG_LVL_KEY, next, /[?&]metricsLvl=/i);
  if (on()) paintOverlay();
  paintSettingBtns();
  return _logLvl;
}

function nextLogLvl(dir) {
  const i = LOG_LVLS.indexOf(logLvl());
  const d = dir < 0 ? -1 : 1;
  return setLogLvl(LOG_LVLS[(Math.max(0, i) + d + LOG_LVLS.length) % LOG_LVLS.length]);
}

function typingTarget(t) {
  return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" ||
    t.tagName === "SELECT" || t.tagName === "BUTTON" || t.isContentEditable);
}

function insertAfter(host, anchor, el) {
  if (anchor.nextSibling) host.insertBefore(el, anchor.nextSibling);
  else host.appendChild(el);
  return anchor = el;
}

function makeMetricsBtn(id, title, paint, onClick) {
  const b = document.createElement("button");
  b.id = id;
  b.type = "button";
  b.title = title;
  paint(b);
  b.onclick = () => {
    onClick();
    try { if (typeof GameAudio !== "undefined" && GameAudio.uiSelect) GameAudio.uiSelect(); }
    catch (_) { /* audio not up yet; the toggle still applies */ }
  };
  return b;
}

function initUI() {
  try { Log.info("game", "GameMetrics.initUI"); } catch (_) { /* Log not loaded */ }
  if (typeof document === "undefined") return;
  const anchor = document.getElementById("pm-hidehud");
  const host = anchor && anchor.parentNode;
  if (host && !document.getElementById("pm-metrics")) {
    let ins = anchor;
    _btn = makeMetricsBtn(
      "pm-metrics",
      "Show the live metrics overlay on the canvas. ` or F9 also toggles it. " +
        "Each page shows different data: GOV = perf/session, CAR = timing/speed, " +
        "PHYS = grip/forces, LOG = filtered log tail.",
      paintBtn,
      () => { toggle(); },
    );
    ins = insertAfter(host, ins, _btn);

    _pageBtn = makeMetricsBtn(
      "pm-metrics-page",
      "Which overlay page is shown while METRICS is ON. Pick a page before turning on, or use [ ] / 1–4 in-game.",
      paintPageBtn,
      () => { nextPage(1); },
    );
    ins = insertAfter(host, ins, _pageBtn);

    _logNsBtn = makeMetricsBtn(
      "pm-metrics-logns",
      "Filter the LOG overlay tail to one namespace (* = all). = / - cycle while the overlay is up.",
      paintLogNsBtn,
      () => { nextLogNs(1); },
    );
    ins = insertAfter(host, ins, _logNsBtn);

    _logLvlBtn = makeMetricsBtn(
      "pm-metrics-loglvl",
      "How verbose the LOG overlay tail is (warn / info / debug). ; cycles while the overlay is up.",
      paintLogLvlBtn,
      () => { nextLogLvl(1); },
    );
    insertAfter(host, ins, _logLvlBtn);
  }

  if (typeof window !== "undefined" && !_keysBound) {
    _keysBound = true;
    window.addEventListener("keydown", function (e) {
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      if (typingTarget(e.target)) return;
      if (e.key === "`" || e.code === "Backquote" || e.key === "F9") {
        e.preventDefault();
        toggle();
        return;
      }
      if (!on()) return;
      try {
        if (typeof UiLayers !== "undefined" && UiLayers.anyOpen && UiLayers.anyOpen()) return;
      } catch (_) { /* menus not booted */ }
      if (e.key === "]" || e.key === "[") {
        e.preventDefault();
        nextPage(e.key === "]" ? 1 : -1);
        return;
      }
      const jump = { "1": "gov", "2": "car", "3": "phys", "4": "log" };
      if (jump[e.key]) {
        e.preventDefault();
        setPage(jump[e.key]);
        return;
      }
      if (e.key === "=" || e.key === "-") {
        e.preventDefault();
        if (page() !== "log") setPage("log");
        nextLogNs(e.key === "=" ? 1 : -1);
        return;
      }
      if (e.key === ";") {
        e.preventDefault();
        if (page() !== "log") setPage("log");
        nextLogLvl(1);
      }
    });
  }

  if (on()) { raiseBuffer(); paintOverlay(); startLoop(); }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", initUI, { once: true });
  else initUI();
}

if (on()) raiseBuffer();

/* ── SETTINGS > DISPLAY — the METRICS submenu ──────────────────────────
 Folds #pm-metrics / PAGE / LOG NS / LOG SHOW into one <details> under HIDE
 HUD, compact on short/high-scale viewports. Used to be a second IIFE in
 js/camera/cockpit-opts.js; it is this overlay's own settings row. */
function injectCss() {
  if (document.getElementById("pm-metrics-sub-css")) return;
  var s = document.createElement("style");
  s.id = "pm-metrics-sub-css";
  s.textContent = [
    "#pm-metrics-details.pm-metrics-sub { margin: 6px 0 0; }",
    "#pm-metrics-details.pm-metrics-sub > summary.adv-more-btn { cursor: pointer; }",
    "#pm-metrics-details .pm-metrics-sub-body {",
    "  display: flex; flex-direction: column; gap: 4px;",
    "  padding: 6px 0 2px;",
    /* --svhz, not raw svh: this list lives inside the #pausemenu sheet's
       zoom, where 100svh of LOCAL px paints zoom× that on screen — at 130%
       the submenu took 324 of a 393px-tall phone. The zoom-compensated
       token collapses the per-scale html[style*=…] hack this block used to
       carry for exactly three slider values. */
    "  max-height: min(280px, calc(100 * var(--svhz, 1svh) - 9rem));",
    "  overflow-y: auto;",
    "}",
    "#pm-metrics-details .pm-metrics-sub-body > button {",
    "  width: 100%; margin: 0;",
    "}",
    "#pm-metrics-details .pm-metrics-hint {",
    "  margin: 4px 0 0; opacity: .7; font-size: 11px; line-height: 1.3;",
    "}",
    "@media (max-height: 420px) {",
    "  #pm-metrics-details .pm-metrics-sub-body {",
    "    display: grid; grid-template-columns: 1fr 1fr; gap: 4px 6px;",
    "    max-height: min(160px, calc(100 * var(--svhz, 1svh) - 7rem));",
    "  }",
    "  #pm-metrics-details .pm-metrics-sub-body > button { width: auto; }",
    "  #pm-metrics-details .pm-metrics-hint {",
    "    grid-column: 1 / -1; font-size: 10px; margin: 2px 0 0;",
    "  }",
    "}",
  ].join("\n");
  (document.head || document.documentElement).appendChild(s);
}

function buildSubmenu() {
  if (typeof document === "undefined") return;
  injectCss();
  var onBtn = document.getElementById("pm-metrics");   // the button — a local named like the module's on() shadowed it
  var page = document.getElementById("pm-metrics-page");
  var ns = document.getElementById("pm-metrics-logns");
  var lvl = document.getElementById("pm-metrics-loglvl");
  if (!onBtn || document.getElementById("pm-metrics-details")) return;
  var host = onBtn.parentNode;
  if (!host) return;

  var det = document.createElement("details");
  det.id = "pm-metrics-details";
  det.className = "pm-metrics-sub";

  var sum = document.createElement("summary");
  sum.className = "adv-more-btn";
  sum.textContent = "METRICS";
  sum.title = "Live FPS / car / phys / log overlay controls";
  det.appendChild(sum);

  var body = document.createElement("div");
  body.className = "pm-metrics-sub-body";
  body.setAttribute("role", "group");
  body.setAttribute("aria-label", "Metrics controls");

  [onBtn, page, ns, lvl].forEach(function (btn) {
    if (!btn) return;
    btn.addEventListener("click", function (e) { e.stopPropagation(); });
    body.appendChild(btn);
  });

  var hint = document.createElement("p");
  hint.className = "pm-metrics-hint as-note";
  hint.textContent = "Live ~4×/sec while ON. ` / F9 toggle · [ ] page · 1–4 jump";
  body.appendChild(hint);
  det.appendChild(body);

  var hide = document.getElementById("pm-hidehud");
  if (hide && hide.parentNode === host) {
    if (hide.nextSibling) host.insertBefore(det, hide.nextSibling);
    else host.appendChild(det);
  } else {
    host.appendChild(det);
  }

  try {
    if (on()) det.open = true;
  } catch (_) { /* not ready */ }

  onBtn.addEventListener("click", function () {
    try {
      if (on()) det.open = true;
    } catch (_) { /* ignore */ }
  });
}

function scheduleSubmenu() {
  // A VM harness may hand this file a document with no timers (the metrics
  // unit test does): the submenu is DOM sugar, so it simply does not build there.
  if (typeof document === "undefined" || typeof setTimeout !== "function") return;
  var run = function () { setTimeout(buildSubmenu, 0); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true });
  else run();
  setTimeout(buildSubmenu, 250);
  setTimeout(buildSubmenu, 1000);
}
scheduleSubmenu();

return {
  KEY, PAGE_KEY, LOG_NS_KEY, LOG_LVL_KEY, PAGES, LOG_NS, LOG_LVLS,
  on, set, toggle, page, setPage, nextPage,
  logNs, setLogNs, nextLogNs, logLvl, setLogLvl, nextLogLvl,
  snapshot, PANEL_STYLE,
};
})();
