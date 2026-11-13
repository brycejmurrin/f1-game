/* Apex 26 — GameMetrics: toggleable in-game FPS / car / log overlay.

   SETTINGS > DISPLAY — METRICS (on/off), PAGE (gov/car/phys/log),
   SIDE (auto/left/right), SIZE (s/m/l), LOG NS, and LOG SHOW, folded
   into one METRICS <details> submenu this file builds (see the bottom).
   Log filters stay hidden unless PAGE is LOG. Or ` (backtick) / F9 on
   the canvas. Persists as apex26.metrics. URL `?metrics=1` overrides
   for the session without writing storage, same shape as CockpitOpts.

   WHY ITS OWN FILE. This is not a quality tier. The overlay is DOM the
   player asked for, so it lives next to the other injected SETTINGS buttons
   (CockpitOpts) rather than growing js/game.js. The panel is created at
   runtime — no index.html node — by js/perf/metrics-panel.js, which loads
   with LAZY_PERF the first time the overlay is ON. Layout lives in css/hud.css (#game-metrics
   + #game-metrics-bar). AUTO side is left on a short/narrow viewport so
   the panel cannot cover the right dock. SIZE defaults to S; the bar's
   S/M/L chip and the SETTINGS row cycle it.

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
const POS_KEY = "apex26.metricsPos";
const SIZE_KEY = "apex26.metricsSize";
const LOG_NS_KEY = "apex26.metricsLogNs";
const LOG_LVL_KEY = "apex26.metricsLogLvl";
const PAINT_MS = 250;
const PAGES = ["gov", "car", "phys", "log"];
const POSITIONS = ["auto", "left", "right"];
const SIZES = ["s", "m", "l"];
const LOG_NS = ["*", "track", "gfx", "game", "scenery", "car", "ui", "input", "net", "data", "audio", "assets"];
const LOG_LVLS = ["warn", "info", "debug"];

let _on = null;
let _page = null;
let _pos = null;
let _size = null;
let _logNs = null;
let _logLvl = null;
let _raf = 0;
let _lastPaint = 0;
let _btn = null;
let _pageBtn = null;
let _posBtn = null;
let _sizeBtn = null;
let _logNsBtn = null;
let _logLvlBtn = null;
let _keysBound = false;
let _raisedBuffer = null;

function qFlag(re) {
  try { return re.exec(location.search); } catch (_) { return null; }
}

function read() {
  if (typeof DevFlags !== "undefined") return !!DevFlags.get("metrics");
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

function readPos() {
  const q = qFlag(/[?&]metricsPos=(auto|left|right)/i);
  if (q) return q[1].toLowerCase();
  const v = GameStore.store.raw(POS_KEY);
  if (POSITIONS.indexOf(v) >= 0) return v;
  return "auto";
}

function pos() {
  if (_pos === null) _pos = readPos();
  return _pos;
}

function readSize() {
  const q = qFlag(/[?&]metricsSize=(s|m|l)/i);
  if (q) return q[1].toLowerCase();
  const v = GameStore.store.raw(SIZE_KEY);
  if (SIZES.indexOf(v) >= 0) return v;
  return "s";
}

function size() {
  if (_size === null) _size = readSize();
  return _size;
}

function applySize(el) {
  if (!el) return size();
  el.dataset.size = size();
  return size();
}

function resolvePos() {
  const want = pos();
  if (want === "left" || want === "right") return want;
  try {
    if (window.innerHeight <= 520 || window.innerWidth < 900) return "left";
  } catch (_) { /* no window */ }
  return "right";
}

function applyPos(el) {
  if (!el) return resolvePos();
  const side = resolvePos();
  el.dataset.pos = side;
  return side;
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

// THE PANEL lives in js/perf/metrics-panel.js (GameMetricsPanel, LAZY_PERF,
// #4978 row 3): snapshot() and the painter are ~25 KB a player who never turns
// METRICS on never needs at boot. Everything a booting player can reach stays
// here. The first paint that finds the overlay ON asks LazyBundles for the
// perf rig (precached by sw.js, so offline too); the 4 Hz loop keeps asking
// paintOverlay, so the panel shows on the first tick after the bundle lands.
// One ask per ON: a failed fetch leaves the overlay off-screen, never a retry loop.
let _impl = null;
let _panelAsked = false;
function panel() {
  if (!_impl && typeof GameMetricsPanel !== "undefined")
    _impl = GameMetricsPanel.create({ PAGES, on, page, size, logNs, logLvl, applyPos, applySize, setPage, nextSize });
  return _impl;
}
function panelEl() { return _impl ? _impl.el() : null; }
function askPanel() {
  if (_panelAsked || typeof LazyBundles === "undefined" || !LazyBundles.ensurePerfRig) return;
  _panelAsked = true;
  Promise.resolve(LazyBundles.ensurePerfRig()).then(() => { if (on()) paintOverlay(); }, () => { /* offline: no panel */ });
}
function paintOverlay() {
  const p = panel();
  if (p) { p.paint(); return; }
  if (on()) askPanel();   // OFF with no panel yet: nothing on screen to hide
}
// Before the panel lands: the two fields the eager half owns.
function snapshot() { const p = panel(); return p ? p.snapshot() : { on: on(), page: page() }; }

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

/* The six SETTINGS rows are setting rows (js/ui/setting-row.js) — the same
   LABEL ‹ VALUE › control as every other Settings pick. A harness that loads
   this file without SettingRow (tests/unit/metrics.test.mjs) gets the old
   one-button cycle, painted as `LABEL: VALUE`, so its stubs still drive it. */
function isRow(el) { return !!(el && el.classList && typeof el.classList.contains === "function" && el.classList.contains("set-row")); }
function paintRow(el, label, value) {
  if (!el) return;
  if (isRow(el)) { SettingRow.paint(el, value); return; }
  el.textContent = label + ": " + String(value).toUpperCase();
}
function paintBtn(btn) { paintRow(btn, "OVERLAY", on() ? "on" : "off"); }
function paintPageBtn(btn) { paintRow(btn, "PAGE", page()); }
function paintLogNsBtn(btn) { paintRow(btn, "LOG NS", logNs()); }
function paintLogLvlBtn(btn) { paintRow(btn, "LOG SHOW", logLvl()); }

function paintSummary() {
  const det = typeof document !== "undefined" ? document.getElementById("pm-metrics-details") : null;
  const sum = det && det.querySelector ? det.querySelector("summary") : null;
  if (!sum) return;
  sum.innerHTML = '<span data-fold="k">METRICS</span><span data-fold="sep"> · </span>' +
    (on()
      ? '<span data-fold="on">ON</span><span data-fold="sep"> · </span><span data-fold="val">' + page().toUpperCase() + "</span>"
      : '<span data-fold="off">OFF</span>');
}

function paintLogVisibility() {
  const show = page() === "log";
  if (_logNsBtn) _logNsBtn.hidden = !show;
  if (_logLvlBtn) _logLvlBtn.hidden = !show;
}

function paintPosBtn(btn) { paintRow(btn, "SIDE", pos()); }
function paintSizeBtn(btn) { paintRow(btn, "METRICS SIZE", size()); }

function paintSettingBtns() {
  paintBtn(_btn);
  paintPageBtn(_pageBtn);
  paintPosBtn(_posBtn);
  paintSizeBtn(_sizeBtn);
  paintLogNsBtn(_logNsBtn);
  paintLogLvlBtn(_logLvlBtn);
  paintLogVisibility();
  paintSummary();
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

// THE PANEL IS PLAYER-FACING; ITS DATA SOURCE WAS NOT. Everything on CAR and
// PHYS comes from window.__apex, which is LAZY_AGENT: wantAgentSurface() in
// js/game.js gates it to tests, localhost and ?apex=1 and NEVER admits a
// player on github.io — bootAgentSurface() returns at its first line — so on the only
// build that matters PHYS painted "—" in every row and CAR kept just the speed
// digit it scrapes out of the HUD. MEASURED on the shipped tree, snapshot()
// field lists with the surface present vs nulled:
//   GOV   loses scale auto strikes tierFloor gpuMs track state flow cam
//         caution build
//   CAR   loses lap pos total gear energy times gaps sector s x angle k hw
//   PHYS  loses ALL SEVENTEEN — slipDeg vLat yawRate slipFactor axEstSm
//         axFrac slope wrongWay rescueT head vmaxNow aeroGrip aeroDf xOn
//         xArmed aeroLoad aeroX
// Every read sits in a try/catch against a NULL __apex, so the failure is
// silent by construction and tests/unit/metrics.test.mjs pinned the graceful
// degradation without anyone noticing the degradation IS the shipped panel.
//
// So ASK for the surface when the player opens the panel, rather than moving
// it onto the boot wall. game.js hands us the memoised loader; a player who
// never opens METRICS still downloads nothing, which is the one constraint
// LAZY_AGENT exists to protect. Requested once — a refused or failed inject
// leaves the panel exactly as degraded as it is today, never a retry loop.
let _telemetryLoad = null;    // game.js's memoised loadAgentSurface, or null
let _telemetryAsked = false;
// Installed by game.js AFTER its boot await chain, which is later than the
// DOMContentLoaded initUI that handles a player booting with METRICS already
// on — so that path reaches ensureTelemetry() with no loader yet and correctly
// declines WITHOUT burning the one-shot latch. Ask again here, or a panel that
// was already on would stay degraded until it was toggled off and back on.
function setTelemetryLoader(fn) {
  _telemetryLoad = typeof fn === "function" ? fn : null;
  if (_telemetryLoad && on()) ensureTelemetry();
}
function ensureTelemetry() {
  if (_telemetryAsked || !_telemetryLoad) return;
  // Already live (localhost, ?apex=1, a spec): nothing to fetch.
  if (typeof window !== "undefined" && window.__apex) return;
  _telemetryAsked = true;
  try {
    Promise.resolve(_telemetryLoad()).then(() => { paintOverlay(); }, () => { /* offline: stay degraded */ });
  } catch (_) { /* loader threw synchronously: stay degraded */ }
}

function set(v) {
  const next = !!v;
  _on = next;
  store(KEY, next ? "1" : "0", /[?&]metrics=/i);
  try { Log.info("game", "metrics " + (next ? "on " + page() : "off")); } catch (_) { /* Log not loaded */ }
  if (next) {
    if (!panel()) _panelAsked = false;   // a fresh ON may ask again after a failed fetch
    raiseBuffer();
    ensureTelemetry();
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

function setPos(name) {
  const next = String(name || "").toLowerCase();
  if (POSITIONS.indexOf(next) < 0) return pos();
  _pos = next;
  store(POS_KEY, next, /[?&]metricsPos=/i);
  const el = panelEl(); if (el) applyPos(el);
  paintSettingBtns();
  return _pos;
}

function nextPos(dir) {
  const i = POSITIONS.indexOf(pos());
  const d = dir < 0 ? -1 : 1;
  return setPos(POSITIONS[(Math.max(0, i) + d + POSITIONS.length) % POSITIONS.length]);
}

function setSize(name) {
  const next = String(name || "").toLowerCase();
  if (SIZES.indexOf(next) < 0) return size();
  _size = next;
  store(SIZE_KEY, next, /[?&]metricsSize=/i);
  const el = panelEl(); if (el) applySize(el);
  if (on()) paintOverlay();
  paintSettingBtns();
  return _size;
}

function nextSize(dir) {
  const i = SIZES.indexOf(size());
  const d = dir < 0 ? -1 : 1;
  return setSize(SIZES[(Math.max(0, i) + d + SIZES.length) % SIZES.length]);
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

function uiSelect() {
  try { if (typeof GameAudio !== "undefined" && GameAudio.uiSelect) GameAudio.uiSelect(); }
  catch (_) { /* audio not up yet; the pick still applies */ }
}
// values: [[v, label], …]; read(): v; write(v). Falls back to a cycle button
// where SettingRow is absent (see paintRow).
function makeMetricsRow(id, label, title, values, read, write, paint) {
  if (typeof SettingRow === "undefined") {
    const b = document.createElement("button");
    b.id = id;
    b.type = "button";
    b.title = title;
    paint(b);
    b.onclick = () => {
      const vs = values.map((p) => p[0]);
      write(vs[(vs.indexOf(String(read())) + 1) % vs.length]);
      uiSelect();
    };
    return b;
  }
  const r = SettingRow.build(id, label, values);
  r.row.title = title;
  SettingRow.wire(r.row, { values, read, write: (v) => { write(v); uiSelect(); } });
  return r.row;
}
const up = (list) => list.map((v) => [v, String(v).toUpperCase()]);

function initUI() {
  try { Log.info("game", "GameMetrics.initUI"); } catch (_) { /* Log not loaded */ }
  if (typeof document === "undefined") return;
  const anchor = document.getElementById("pm-hud-details")
    || document.getElementById("pm-hidehud");
  const host = anchor && anchor.parentNode;
  if (host && !document.getElementById("pm-metrics")) {
    let ins = anchor;
    _btn = makeMetricsRow(
      "pm-metrics", "OVERLAY",
      "Show the live metrics overlay on the canvas. ` or F9 also toggles it. " +
        "Each page shows different data: GOV = perf/session, CAR = timing/speed, " +
        "PHYS = grip/forces, LOG = filtered log tail.",
      up(["on", "off"]), () => (on() ? "on" : "off"), (v) => { set(v === "on"); }, paintBtn,
    );
    ins = insertAfter(host, ins, _btn);

    _pageBtn = makeMetricsRow(
      "pm-metrics-page", "PAGE",
      "Which overlay page is shown while METRICS is ON. Pick a page before turning on, or use [ ] / 1–4 in-game.",
      up(PAGES), page, setPage, paintPageBtn,
    );
    ins = insertAfter(host, ins, _pageBtn);

    _posBtn = makeMetricsRow(
      "pm-metrics-pos", "SIDE",
      "Which side the metrics overlay docks on. AUTO is left on a short or narrow viewport so the panel cannot cover GAS/BRAKE.",
      up(POSITIONS), pos, setPos, paintPosBtn,
    );
    ins = insertAfter(host, ins, _posBtn);

    _sizeBtn = makeMetricsRow(
      "pm-metrics-size", "METRICS SIZE",
      "How large the metrics overlay is. S is the phone default. The S/M/L chip on the overlay also cycles this.",
      up(SIZES), size, setSize, paintSizeBtn,
    );
    ins = insertAfter(host, ins, _sizeBtn);

    _logNsBtn = makeMetricsRow(
      "pm-metrics-logns", "LOG NS",
      "Filter the LOG overlay tail to one namespace (* = all). = / - cycle while the overlay is up.",
      up(LOG_NS), logNs, setLogNs, paintLogNsBtn,
    );
    ins = insertAfter(host, ins, _logNsBtn);

    _logLvlBtn = makeMetricsRow(
      "pm-metrics-loglvl", "LOG SHOW",
      "How verbose the LOG overlay tail is (warn / info / debug). ; cycles while the overlay is up.",
      up(LOG_LVLS), logLvl, setLogLvl, paintLogLvlBtn,
    );
    insertAfter(host, ins, _logLvlBtn);
  }

  if (typeof window !== "undefined" && !_keysBound) {
    _keysBound = true;
    window.addEventListener("keydown", (e) => {
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
    window.addEventListener("resize", () => {
      const el = panelEl(); if (el) { applyPos(el); applySize(el); }
    });
  }

  if (on()) { raiseBuffer(); ensureTelemetry(); paintOverlay(); startLoop(); }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", initUI, { once: true });
  else initUI();
}

if (on()) raiseBuffer();

// SETTINGS > DISPLAY — the METRICS submenu. Folds #pm-metrics / PAGE / SIDE /
// SIZE / LOG NS / LOG SHOW into one <details> after the HUD fold. Layout
// lives in css/components.css. Closed summary carries ON/page state so the
// fold does not have to open to be read. LOG filters hide unless PAGE is LOG.
function buildSubmenu() {
  if (typeof document === "undefined") return;
  const onBtn = document.getElementById("pm-metrics");   // the button — a local named like the module's on() shadowed it
  const pageBtn = document.getElementById("pm-metrics-page");
  const posBtn = document.getElementById("pm-metrics-pos");
  const sizeBtn = document.getElementById("pm-metrics-size");
  const ns = document.getElementById("pm-metrics-logns");
  const lvl = document.getElementById("pm-metrics-loglvl");
  if (!onBtn || document.getElementById("pm-metrics-details")) return;
  const host = onBtn.parentNode;
  if (!host) return;

  const det = document.createElement("details");
  det.id = "pm-metrics-details";
  det.className = "pm-metrics-sub";

  const sum = document.createElement("summary");
  sum.className = "adv-more-btn";
  sum.innerHTML = '<span data-fold="k">METRICS</span><span data-fold="sep"> · </span><span data-fold="off">OFF</span>';
  sum.title = "Live FPS / car / phys / log overlay controls";
  det.appendChild(sum);

  const body = document.createElement("div");
  body.className = "pm-metrics-sub-body";
  body.setAttribute("role", "group");
  body.setAttribute("aria-label", "Metrics controls");
  // The rows' own explanations are hover-only titles; this line is the one a
  // phone can read.
  const help = document.createElement("p");
  help.className = "adv-help";
  help.textContent = "A live readout over the race for testing and tuning. OVERLAY turns it on (` or F9 in a race); PAGE picks GOV for performance, CAR for timing and speed, PHYS for grip and forces, LOG for the event log; SIDE and SIZE place it.";
  body.appendChild(help);

  [onBtn, pageBtn, posBtn, sizeBtn, ns, lvl].forEach((btn) => {
    if (!btn) return;
    btn.addEventListener("click", (e) => { e.stopPropagation(); });
    body.appendChild(btn);
  });
  det.appendChild(body);

  const fold = document.getElementById("pm-hud-details");
  const hide = document.getElementById("pm-hidehud");
  const place = (fold && fold.parentNode === host) ? fold
    : (hide && hide.parentNode === host) ? hide : null;
  if (place) {
    if (place.nextSibling) host.insertBefore(det, place.nextSibling);
    else host.appendChild(det);
  } else {
    host.appendChild(det);
  }

  paintSettingBtns();
}

function scheduleSubmenu() {
  // A VM harness may hand this file a document with no timers (the metrics
  // unit test does): the submenu is DOM sugar, so it simply does not build there.
  if (typeof document === "undefined" || typeof setTimeout !== "function") return;
  const run = () => setTimeout(buildSubmenu, 0);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true });
  else run();
  setTimeout(buildSubmenu, 250);
  setTimeout(buildSubmenu, 1000);
}
scheduleSubmenu();

// Read-only Playwright seam: PerfGov.frameStats() + a longtask ring for
// tests/specs/perf-frametime.spec.js. Does not touch gameplay; reset only
// clears the governor's diagnostic history.
let _ftLt = 0;
let _ftObs = null;

function frametimeBenchReset() {
  try {
    if (typeof PerfGov !== "undefined" && PerfGov.resetFrameStats) PerfGov.resetFrameStats();
  } catch (_) { /* pre-boot harness */ }
  _ftLt = 0;
  if (_ftObs) {
    try { _ftObs.disconnect(); } catch (_) { /* gone */ }
    _ftObs = null;
  }
  if (typeof PerformanceObserver !== "function") return;
  try {
    const types = PerformanceObserver.supportedEntryTypes;
    if (!types || types.indexOf("longtask") < 0) return;
    const start = performance.now();
    const observer = new PerformanceObserver((list) => {
      if (_ftObs !== observer) return;
      // Entries use the same performance time origin as now(). A task that
      // began before reset belongs to the previous window, even if delivered late.
      for (const e of list.getEntries()) if (e.startTime >= start) _ftLt++;
    });
    _ftObs = observer;
    observer.observe({ type: "longtask" });
  } catch (_) {
    _ftObs = null;
  }
}

function frametimeBenchSnapshot() {
  const ft = (typeof PerfGov !== "undefined" && PerfGov.frameStats)
    ? PerfGov.frameStats()
    : { frames: 0, p50: 0, p95: 0, p99: 0, maxMs: 0 };
  let heapUsedMB = null;
  let heapTotalMB = null;
  try {
    const m = performance.memory;
    if (m) {
      heapUsedMB = +(m.usedJSHeapSize / (1024 * 1024)).toFixed(2);
      heapTotalMB = +(m.totalJSHeapSize / (1024 * 1024)).toFixed(2);
    }
  } catch (_) { /* no performance.memory */ }
  return {
    p50: +(+ft.p50 || 0).toFixed(3),
    p95: +(+ft.p95 || 0).toFixed(3),
    p99: +(+ft.p99 || 0).toFixed(3),
    max: +(+ft.maxMs || 0).toFixed(3),
    frames: ft.frames || 0,
    longTasks: _ftLt,
    heapUsedMB,
    heapTotalMB,
  };
}

// KEY / POS_KEY / SIZE_KEY / POSITIONS / SIZES are unit-test seams for persistence pins.
// PAGE_KEY / LOG_* / PAGES / LOG_NS / LOG_LVLS stay module-local (overlay UI only).
return {
  KEY, POS_KEY, SIZE_KEY, POSITIONS, SIZES,
  on, set, toggle, page, setPage, nextPage,
  pos, setPos, nextPos, resolvePos,
  size, setSize, nextSize,
  logNs, setLogNs, nextLogNs, logLvl, setLogLvl, nextLogLvl,
  snapshot, setTelemetryLoader, ensureTelemetry, agentLoader: () => _telemetryLoad,   // OverlayPublisher asks for __apex the same way
  frametimeBenchReset, frametimeBenchSnapshot,
};
})();
Object.freeze(GameMetrics);
