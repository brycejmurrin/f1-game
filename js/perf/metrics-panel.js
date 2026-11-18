/* Apex 26 — GameMetricsPanel: the METRICS overlay panel (snapshot + painter).

   LAZY_PERF (tools/manifest.cjs, #4978 row 3). js/perf/metrics-overlay.js keeps
   everything a booting player can reach — the six SETTINGS rows, the METRICS
   fold, the hotkeys, the stored picks and the log buffer — and creates this
   painter the first time the overlay is ON and LAZY_PERF has landed. The panel
   paints at 4 Hz, so the bundle landing a tick after METRICS is turned on is
   inside its own cadence. GameMetrics.create(api) hands in the state readers. */
const GameMetricsPanel = (function () {
  "use strict";

function create(api) {
const { PAGES, on, page, size, logNs, logLvl, applyPos, applySize, setPage, nextSize } = api;
const LITE = Object.freeze({ lite: true });   // __apex.perf / physState without the fields this panel never reads
let _panel = null;
let _body = null;
let _bar = null;

// Mirrors the HUD gap-form pattern (js/ui/hud.js): innerWidth / hudScale
// is the slot proxy. Two display densities:
//   WIDE  (ratio >= 480): label column + value, full rows, up to 12 rows
//   NARROW (ratio < 480): compact, two values per line, fewer rows
// Live layout is css/hud.css (#game-metrics[data-pos]). An inline style string
// here fought the stylesheet (side, size, the tap bar), so it is gone.

// Adaptive density: same proxy as HUD gap — innerWidth / hudScale.
// At < 480 use the compact (narrow) layout with 2 values per line.
function metricsRatio() {
  try {
    const root = document.documentElement;
    const s = +root.style.getPropertyValue("--hud-z-top")
      || +root.style.getPropertyValue("--hud-scale") || 1;
    return window.innerWidth / s;
  } catch (_) { return 800; }
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
    auto: null, strikes: null, tierFloor: null, gpuMs: null, loopStopped: null, loopFrames: null,
    stallSlow: null, stallWorst: null, stallAct: "",
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
    // physState() already RETURNS these every paint and the panel dropped them
    // on the floor. No new data path, no sim work — the PHYS page simply never
    // rendered eight of the fields it was already fetching. Field names match
    // the __apex hook on purpose: a player's screenshot then maps straight onto
    // physState() when they report something.
    towing: null, xVmaxGain: null, xDfLoss: null,
    drain: null, regen: null, brakeBias: null, otTime: null, otMJ: null,
    logConsole: "", logBuffer: "", logN: 0, logShown: 0,
    logs: [],
  };
  try {
    if (wantGov && typeof LoopHealth !== "undefined") {
      const h = LoopHealth.state();
      out.loopStopped = h.stopped; out.loopFrames = h.frames;
      if (h.stall) {
        out.stallSlow = h.stall.slowRun | 0;
        out.stallWorst = h.stall.worstMs | 0;
        out.stallAct = h.stall.act || "";
      }
    }
  } catch (_) { /* loop health not booted */ }
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
      const p = __apex.perf(LITE);
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
    // liveBackend(), not readBackend(): the panel answers "what am I running",
    // and a pick whose files left the tree is not what is running.
    if (typeof RendererPicker !== "undefined" && RendererPicker.liveBackend)
      out.backend = RendererPicker.liveBackend() || "";
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
                (bs.arrayNearest ? "  ARRAYNEAREST" : "") +
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
      const p = __apex.physState(LITE);
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
        if (p.towing != null) out.towing = p.towing;
        if (p.xVmaxGain != null) out.xVmaxGain = p.xVmaxGain;
        if (p.xDfLoss != null) out.xDfLoss = p.xDfLoss;
        if (p.drain != null) out.drain = p.drain;
        if (p.regen != null) out.regen = p.regen;
        if (p.brakeBias != null) out.brakeBias = p.brakeBias;
        if (p.otTime != null) out.otTime = p.otTime;
        if (p.otMJ != null) out.otMJ = p.otMJ;
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
  const el = document.createElement("div");
  el.id = "game-metrics";
  el.setAttribute("aria-label", "Debug metrics");
  const bar = document.createElement("div");
  bar.id = "game-metrics-bar";
  if (typeof bar.setAttribute === "function") bar.setAttribute("role", "toolbar");
  PAGES.forEach((p) => {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.page = p;
    b.textContent = p.toUpperCase();
    bar.appendChild(b);
  });
  const sizeChip = document.createElement("button");
  sizeChip.type = "button";
  sizeChip.dataset.sizeCycle = "1";
  sizeChip.setAttribute("aria-label", "Overlay size");
  sizeChip.textContent = size().toUpperCase();
  bar.appendChild(sizeChip);
  bar.addEventListener("click", (e) => {
    const t = e.target;
    if (!t || !t.dataset) return;
    e.preventDefault();
    e.stopPropagation();
    if (t.dataset.sizeCycle) { nextSize(1); return; }
    if (t.dataset.page) setPage(t.dataset.page);
  });
  const body = document.createElement("pre");
  body.id = "game-metrics-body";
  el.appendChild(bar);
  el.appendChild(body);
  try {
    const prof = GameStore.store.get("hudProfile", "standard");
    if (prof === "minimal") el.dataset.compact = "1";
  } catch (_) { /* store absent in isolated harness */ }
  applyPos(el);
  applySize(el);
  document.body.appendChild(el);
  _panel = el;
  _bar = bar;
  _body = body;
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
  const ms = Math.round(t * 1000);   // round first: never "1:60.000"
  const m = Math.floor(ms / 60000);
  const s = (ms - m * 60000) / 1000;
  return m + ":" + (s < 10 ? "0" : "") + s.toFixed(3);
}

// Two-column row: label (padded to L chars) then value.
const L = 8;
function row(label, value) { return (label + ":").padEnd(L) + " " + value; }
// A slow WebGPU present does not throw, so the loop row stays "frames N".
// The stall watchdog's own counters are the visible signal. Quiet when nothing
// has been slow: a healthy phone does not spend a line on zeros.
function stallRow(s, narrow) {
  if (!(s.stallSlow > 0) && !(s.stallWorst > 0) && !s.stallAct) return "";
  const slow = s.stallSlow | 0, worst = s.stallWorst | 0, act = s.stallAct || "";
  if (narrow) return "stall " + slow + "  " + worst + (act ? " " + act : "");
  return row("stall", "slow " + slow + "  worst " + worst + (act ? "  " + act : ""));
}
// CAN THE BOX ACTUALLY HOLD THE WIDE LAYOUT? A VIEWPORT proxy
// (`metricsRatio() < 480`) disagrees with the width's vw cap in css/hud.css,
// so it picks the wide layout for boxes that cannot hold it and the tail is
// CUT (white-space:pre inside overflow:hidden — lost, not scrolled).
// MEASURED with a 20-character probe in the body's own font, both viewports:
//   narrow longest 25 ch, wide longest 52 ch (GOV is the widest page)
//   desktop boxes 170/221/322 px at ch 8.57 -> 19/25/37 fit
//   phone   boxes 111/134/189 px at ch 7.35 -> 15/18/25 fit
// Under the proxy seven of nine desktop cases and nine of nine phone cases cut.
// WIDE_CH is that measured 52 plus one, and the CSS steps are sized in the same units.
// The measurement forces layout, so it is cached on (font-size, box width) —
// this runs at 4 Hz and must not reflow every paint.
const WIDE_CH = 53;
let _chW = 0, _chKey = "";
function chWidth() {
  if (!_body || typeof document === "undefined") return 0;
  const cs = (typeof getComputedStyle === "function") ? getComputedStyle(_body) : null;
  const key = (cs && cs.fontSize) || "";
  if (_chW && key === _chKey) return _chW;
  try {
    const probe = document.createElement("span");
    probe.textContent = "00000000000000000000";           // 20, so rounding is 1/20th
    probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre";
    _body.appendChild(probe);
    const w = probe.getBoundingClientRect().width / 20;
    _body.removeChild(probe);
    if (w > 0) { _chW = w; _chKey = key; }
  } catch (_) { /* detached / no layout: fall through to the proxy below */ }
  return _chW;
}
function fitsWide() {
  const ch = chWidth();
  // The GRANTED width, never the PAINTED one. Reading _body.clientWidth here
  // latched: the panel sizes to its content, so narrow content gave a small box,
  // a small box failed this test, and the layout could never climb back to wide
  // — a one-way door that measured its own output. The panel's resolved width
  // comes from the CSS step and does not depend on what was painted into it.
  if (!ch || !_panel || typeof getComputedStyle !== "function") return metricsRatio() >= 480;
  const cs = getComputedStyle(_panel);
  const granted = parseFloat(cs.width) || 0;
  if (!granted) return metricsRatio() >= 480;   // unmeasurable is UNKNOWN, not small
  // The step is the border box; the text lives inside the padding and border.
  const chrome = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) +
                 (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
  return Math.floor(Math.max(0, granted - chrome) / ch) >= WIDE_CH;
}
function sep() { return "─".repeat(24); }

// Compact two-value pair for narrow screens.
function pair(l1, v1, l2, v2) { return l1 + " " + v1 + "   " + l2 + " " + v2; }

function paintOverlay() {
  const el = ensurePanel();
  if (!el) return;
  if (!on()) { el.hidden = true; return; }
  el.hidden = false;
  const s = snapshot();
  applyPos(el);
  applySize(el);
  if (_bar) {
    const kids = _bar.children || [];
    for (let i = 0; i < kids.length; i++) {
      const b = kids[i];
      if (b.dataset && b.dataset.sizeCycle) {
        b.textContent = size().toUpperCase();
        continue;
      }
      const onPage = !!(b.dataset && b.dataset.page === s.page);
      if (b.setAttribute) b.setAttribute("aria-pressed", onPage ? "true" : "false");
    }
  }
  const narrow = size() === "s" || !fitsWide();
  const hdr = "";
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
        // Eight more physState() fields. Kept
        // inside the 25-char narrow budget the width work measured — a longer
        // line here is CUT, not scrolled.
        pair("tow", fmt(s.towing, 2), "bb", fmt(s.brakeBias, 2)),
        pair("xdv", fmt(s.xVmaxGain, 3), "xdf", fmt(s.xDfLoss, 3)),
        pair("drn", fmt(s.drain, 3), "rgn", fmt(s.regen, 3)),
        pair("ot", fmt(s.otTime, 1), "mj", fmt(s.otMJ, 2)),
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
        // X-MODE'S PRICE, not just its state. xVmaxGain / xDfLoss are what the
        // open wing actually buys and costs; every F1 game shows DRS as a lit
        // letter and never what it is worth. Both already come back from
        // physState().
        row("x cost", "vmax +" + fmt(s.xVmaxGain, 3) + "   df -" + fmt(s.xDfLoss, 3)),
        // TOW is the slipstream the player is sitting in (0..1, folded into
        // vmaxNow). No F1 title surfaces it; on a phone, where the aero cannot
        // be felt, it is the difference between "hold station" and "pull out".
        row("tow",    fmt(s.towing, 2) + "   brakeBias " + fmt(s.brakeBias, 3)),
        // ERS FLOW rather than the level the HUD bar already shows.
        row("ers",    "drain " + fmt(s.drain, 3) + "   regen " + fmt(s.regen, 3)),
        row("ot",     fmt(s.otTime, 1) + " s   left " + fmt(s.otMJ, 2) + " MJ"),
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
        pair("fps", s.loopStopped ? "STOPPED" : fmt(s.fps), "ms", fmt(s.ms)),
        pair("loop", s.loopStopped ? "STOPPED" : "frames", "n", fmt(s.loopFrames)),
        stallRow(s, true),
        pair("tier", fmt(s.tier), "auto", fmt(s.auto)),
        pair("gfx", fmt(s.backend || null) + (s.gfxApi ? "/" + s.gfxApi : ""), "err", fmt(s.gpuErr)),
        (s.track || "menu") + "  " + (s.caution || "GREEN"),
      ].concat(s.gpuFirst ? [s.gpuFirst.slice(0, 40)] : []).concat(s.tlx ? [s.tlx.slice(0, 44)] : []);
    } else {
      lines = [
        hdr,
        sep(),
        row("fps",    (s.loopStopped ? "STOPPED" : fmt(s.fps)) + "   frame " + fmt(s.ms) + " ms" +
                      (s.gpuMs != null ? "   gpu " + s.gpuMs + " ms" : "")),
        row("loop", (s.loopStopped ? "STOPPED" : "frames") + " " + fmt(s.loopFrames)),
        stallRow(s, false),
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
  const out = _body || el;
  out.textContent = lines.filter(Boolean).join("\n");
}

return { snapshot, paint: paintOverlay, el: () => _panel };
}

return { create };
})();
Object.freeze(GameMetricsPanel);
