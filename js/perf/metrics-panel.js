const GameMetricsPanel = (function () {
  "use strict";

function create(api) {
const { PAGES, on, page, size, logNs, logLvl, applyPos, applySize, setPage, nextSize } = api;
const LITE = Object.freeze({ lite: true });
let _panel = null;
let _body = null;
let _bar = null;


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
  } catch (_) {  }
  try {
    if (typeof PerfGov !== "undefined") {
      const ema = PerfGov.fpsEMA && PerfGov.fpsEMA();
      if (ema > 0) { out.fps = +(1000 / ema).toFixed(1); out.ms = +ema.toFixed(1); }
      if (PerfGov.floorMs) out.budget = +PerfGov.floorMs().toFixed(1);
      if (PerfGov.tier) out.tier = PerfGov.tier();
    }
  } catch (_) {  }
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
  } catch (_) {  }
  try {
    if (wantGov && typeof __apex !== "undefined" && __apex.gpuTimer) {
      const g = __apex.gpuTimer();
      if (g && g.ms != null && g.ms >= 0) out.gpuMs = +g.ms.toFixed(2);
    }
  } catch (_) {  }
  try {
    if (typeof RendererPicker !== "undefined" && RendererPicker.liveBackend)
      out.backend = RendererPicker.liveBackend() || "";
  } catch (_) {  }
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
    } catch (_) {  }
  } catch (_) {  }
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
  } catch (_) {  }
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
  } catch (_) {  }
  try {
    if (wantCar && typeof document !== "undefined") {
      const n = document.getElementById("hud-speed-n");
      const v = n && parseFloat(n.textContent);
      if (isFinite(v)) { out.dashKph = v; out.speedKph = v; out.speedIsDash = true; }
    }
  } catch (_) {  }
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
  } catch (_) {  }
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
  } catch (_) {  }
  try {
    if (typeof __apex !== "undefined" && __apex.camera) {
      const c = __apex.camera();
      if (c && c.mode) out.cam = c.mode;
    }
  } catch (_) {  }
  try {
    if (typeof __apex !== "undefined" && __apex.caution) {
      const c = __apex.caution();
      if (c && c.label) out.caution = c.label;
    }
  } catch (_) {  }
  try {
    if (typeof Log !== "undefined") {
      const lv = Log.level();
      out.logConsole = lv.console || "";
      out.logBuffer = lv.buffer || "";
      if (wantLog) {
        const all = Log.records();
        out.logN = all.length;
        const ns = logNs();
        const min = (Log.LEVELS && Log.LEVELS[logLvl()]) || 2;
        const levels = Log.LEVELS || { warn: 2, info: 3, debug: 4, error: 1 };
        const matched = [];
        for (let i = 0; i < all.length; i++) {
          const r = all[i];
          if (ns && ns !== "*" && r.ns !== ns) continue;
          if (!((levels[r.level] || 0) <= min)) continue;
          matched.push(r);
        }
        const tail = matched.length > 12 ? matched.slice(-12) : matched;
        out.logShown = tail.length;
        out.logs = tail.map((r) => r.level[0] + " " + r.ns + " " + r.msg);
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
  } catch (_) {  }
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
  } catch (_) {  }
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
  const ms = Math.round(t * 1000);
  const m = Math.floor(ms / 60000);
  const s = (ms - m * 60000) / 1000;
  return m + ":" + (s < 10 ? "0" : "") + s.toFixed(3);
}

const L = 8;
function row(label, value) { return (label + ":").padEnd(L) + " " + value; }
function stallRow(s, narrow) {
  if (!(s.stallSlow > 0) && !(s.stallWorst > 0) && !s.stallAct) return "";
  const slow = s.stallSlow | 0, worst = s.stallWorst | 0, act = s.stallAct || "";
  if (narrow) return "stall " + slow + "  " + worst + (act ? " " + act : "");
  return row("stall", "slow " + slow + "  worst " + worst + (act ? "  " + act : ""));
}
const WIDE_CH = 53;
let _chW = 0, _chKey = "";
function chWidth() {
  if (!_body || typeof document === "undefined") return 0;
  const cs = (typeof getComputedStyle === "function") ? getComputedStyle(_body) : null;
  const key = (cs && cs.fontSize) || "";
  if (_chW && key === _chKey) return _chW;
  try {
    const probe = document.createElement("span");
    probe.textContent = "00000000000000000000";
    probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre";
    _body.appendChild(probe);
    const w = probe.getBoundingClientRect().width / 20;
    _body.removeChild(probe);
    if (w > 0) { _chW = w; _chKey = key; }
  } catch (_) {  }
  return _chW;
}
function fitsWide() {
  const ch = chWidth();
  if (!ch || !_panel || typeof getComputedStyle !== "function") return metricsRatio() >= 480;
  const cs = getComputedStyle(_panel);
  const granted = parseFloat(cs.width) || 0;
  if (!granted) return metricsRatio() >= 480;
  const chrome = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) +
                 (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
  return Math.floor(Math.max(0, granted - chrome) / ch) >= WIDE_CH;
}
function sep() { return "─".repeat(24); }

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
        row("x cost", "vmax +" + fmt(s.xVmaxGain, 3) + "   df -" + fmt(s.xDfLoss, 3)),
        row("tow",    fmt(s.towing, 2) + "   brakeBias " + fmt(s.brakeBias, 3)),
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
