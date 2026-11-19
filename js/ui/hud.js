const GameHud = (function () {
  "use strict";

const { IDLE_RPM, MAX_RPM } = PhysicsConsts;
const clamp = M4.clamp;
const _rmq = (typeof window !== "undefined" && window.matchMedia)
  ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
function motionReduced() { return typeof TitleFx !== "undefined" && typeof TitleFx.mode === "function" ? TitleFx.mode() === "reduce" : !!(_rmq && _rmq.matches)
  || (typeof document !== "undefined" && !!document.documentElement && document.documentElement.dataset.motion === "reduce"); }
const _noCssZoom = typeof Element === "function" && !("currentCSSZoom" in Element.prototype);
const VP_SETTLE_MS = 2000;
const _vpNow = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
const _vp = { w: 0, h: 0, stale: true, live: true, until: 0 };
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  _vp.live = false;
  const stale = () => { _vp.stale = true; _vp.until = _vpNow() + VP_SETTLE_MS; };
  window.addEventListener("resize", stale, { passive: true });
  window.addEventListener("orientationchange", stale, { passive: true });
  const vv = window.visualViewport;
  if (vv && typeof vv.addEventListener === "function") vv.addEventListener("resize", stale, { passive: true });
}
function vpSync() {
  if (!_vp.stale) return;
  const r = typeof document !== "undefined" && document.documentElement, w = r ? r.clientWidth : 0, h = r ? r.clientHeight : 0, icb = w > 0 && h > 0;
  if (icb) { _vp.w = w; _vp.h = h; } else { _vp.w = window.innerWidth; _vp.h = window.innerHeight; }
  _vp.stale = _vp.live || _vpNow() < _vp.until;
}
const vpW = () => { vpSync(); return _vp.w; };
const vpH = () => { vpSync(); return _vp.h; };

function syncPulse(e) {
  const el = e.target;
  if (e.animationName !== "pulse" || !el || typeof el.getAnimations !== "function") return;
  for (const a of el.getAnimations()) if (a.animationName === "pulse" && a.startTime !== 0) a.startTime = 0;
}
if (typeof document !== "undefined" && typeof document.addEventListener === "function") document.addEventListener("animationstart", syncPulse, true);

let _invalidateFit = null, _syncPhoneFit = null;
function create(G) {
Log.info("ui", "GameHud.create");

const els = G.els;
let hudT = 0;
const HUD_TICK_MS = 100;
let _flagShown = false;
let _flagSaid = "";
let _teamSkin = null;
let _teamSkinRev = -1;
let _redline = false;
const TYRE_WARN = 0.70;

const _hudTxt = new WeakMap();
const _hudSty = new WeakMap();
const _hudCls = new WeakMap();
const _hudTog = new WeakMap();
function hText(el, v) { if (!el) return; if (_hudTxt.get(el) !== v) { _hudTxt.set(el, v); const t = el.firstChild; if (t && t.nodeType === 3 && !t.nextSibling && typeof v === "string" && v !== "") t.data = v; else el.textContent = v; } }
function hStyle(el, prop, v) { if (!el) return; let m = _hudSty.get(el); if (!m) { m = {}; _hudSty.set(el, m); }
  if (m[prop] !== v) { m[prop] = v; if (prop.charCodeAt(0) === 45) el.style.setProperty(prop, v); else el.style[prop] = v; } }
function hUnstyle(el, prop) { if (!el) return; const m = _hudSty.get(el); if (m) delete m[prop]; if (el.style && el.style.removeProperty) el.style.removeProperty(prop); }
function hClass(el, v) { if (!el) return; if (_hudCls.get(el) !== v) { _hudCls.set(el, v); el.className = v; } }
function hToggle(el, cls, on) { if (!el) return; let m = _hudTog.get(el); if (!m) { m = {}; _hudTog.set(el, m); } if (m[cls] !== on) { m[cls] = on; el.classList.toggle(cls, on); } }
function hAttr(el, name, value) { if (!el) return; const v = String(value); if (el.getAttribute(name) !== v) el.setAttribute(name, v); }
function hT(key, vars, def) {
  if (typeof I18n !== "undefined") return I18n.t(key, vars, def);
  return String(def).replace(/\{(\w+)\}/g, (m, n) => (vars && vars[n] != null ? String(vars[n]) : m));
}
function hHidden(el, on) { if (el && el.hidden !== !!on) el.hidden = !!on; }
function hData(el, name, value) {
  if (!el || !el.dataset) return;
  if (value === null) { if (name in el.dataset) delete el.dataset[name]; }
  else { const v = String(value); if (el.dataset[name] !== v) el.dataset[name] = v; }
}
function replayGhost() { return GhostShare.hasGuest() ? GhostShare : Ghost; }
let _lastRank = 0, _posFlashT = 0;
const teamCss = (c) => {
  const t = c.team;
  if (!t) return "";
  const rev = G.store ? G.store.rev : 0;
  if (t._cssColor == null || t._cssRev !== rev) { t._cssColor = G.cssCol(t.color); t._cssRev = rev; }
  return t._cssColor;
};
const _minimap = HudMinimap.create(G, { vpW, vpH, teamCss, replayGhost, motionReduced, fitKey: () => _fitKey });
let _secRows = null;
let _secFlash = [0, 0, 0];
const SPLIT_DELTA_MS = 3000;
let _secPrevBest = [Infinity, Infinity, Infinity], _secDelta = [0, 0, 0], _secDeltaT = [0, 0, 0];
let _holdLap = 0, _holdPrev = 0, _holdOn = false;
let _limitsDots = null;
let _hudCamMode = null, _hudCamProf = null;
const _ro = typeof HudReadouts !== "undefined" ? HudReadouts : null;
const _skin = typeof HudSkin !== "undefined" ? HudSkin : null;
const _trace = _ro ? _ro.lapTrace() : null;
const _speak = _ro ? _ro.speaker(els.announceLive) : null;
const _doc = typeof document !== "undefined" ? document : null;
const _rx = _doc ? { delta: _doc.getElementById("hud-delta"), deltaN: _doc.getElementById("hud-delta-n"),
  energyBox: _doc.getElementById("hud-energy"), energyN: _doc.getElementById("hud-energy-n"),
  bb: _doc.getElementById("hud-bb") } : {};
let _ePrev = NaN, _blue = false, _blueSaid = null, _blueLaps = 0;
const BCAM_IDS = { heli: 1, side: 1, cinematic: 1, low: 1, overhead: 1, rival: 1, pitwall: 1, drone: 1 };
const ONBOARD_IDS = typeof CamGroups !== "undefined" ? CamGroups.ONBOARD : {};
const MET_LAYOUTS = ["full", "timing", "driver", "compact"];
function resolveMetricsLayout() {
  const want = G.hudMetricsLayout || "auto";
  if (want !== "auto") return want;
  return "full";
}
let _hudLayoutKey = "";
function resolveHudVis(want, autoHide) {
  want = want || "auto";
  if (want === "on") return false;
  if (want === "off") return true;
  return !!autoHide;
}
const _hudVis = { map: null, gaps: null, mode: null, prof: null, hideMap: null, hideGaps: null, mapLow: null };
function syncHudVisClasses(modeId) {
  const onboard = !!ONBOARD_IDS[modeId];
  const prof = G.hudProfile || "standard";
  const hideMap = resolveHudVis(G.hudMapVis, onboard || prof === "minimal");
  const hideGaps = resolveHudVis(G.hudGapsVis, prof === "minimal");
  const mapLow = !hideMap && prof === "broadcast";
  const gapsLow = !hideGaps && prof === "broadcast";
  const v = _hudVis, mapVis = G.hudMapVis || "auto", gapsVis = G.hudGapsVis || "auto";
  if (v.map === mapVis && v.gaps === gapsVis && v.mode === modeId && v.prof === prof
    && v.hideMap === hideMap && v.hideGaps === hideGaps && v.mapLow === mapLow) return;
  v.map = mapVis; v.gaps = gapsVis; v.mode = modeId; v.prof = prof; v.hideMap = hideMap; v.hideGaps = hideGaps; v.mapLow = mapLow;
  _fitKey = ""; _cssRootKey = "";
  const body = document.body;
  body.classList.toggle("hud-hide-map", hideMap);
  body.classList.toggle("hud-hide-gaps", hideGaps);
  body.classList.toggle("hud-map-low", mapLow);
  body.classList.toggle("hud-gaps-low", gapsLow);
}
function syncHudLayoutClasses() {
  const resolved = resolveMetricsLayout();
  const want = G.hudMetricsLayout || "auto";
  const key = resolved + "|" + want;
  if (key === _hudLayoutKey) return;
  _hudLayoutKey = key;
  _fitKey = ""; _cssRootKey = "";
  const body = document.body;
  for (let i = 0; i < MET_LAYOUTS.length; i++) {
    body.classList.toggle("hud-met-" + MET_LAYOUTS[i], resolved === MET_LAYOUTS[i]);
  }
}
function syncHudCamClasses() {
  const modes = typeof CamModes !== "undefined" ? CamModes.CAM_MODES : null;
  const modeId = (modes && modes[G.camMode]) ? modes[G.camMode].id : "chase";
  const prof = G.hudProfile || "standard";
  if (modeId !== _hudCamMode || prof !== _hudCamProf) {
    _hudCamMode = modeId; _hudCamProf = prof;
    const body = document.body;
    body.classList.toggle("hud-bcam", !!BCAM_IDS[modeId]);
    body.classList.toggle("hud-prof-minimal", prof === "minimal");
    body.classList.toggle("hud-prof-broadcast", prof === "broadcast");
    if (typeof HudLayout !== "undefined") HudLayout.setCam(modeId);
  }
  syncHudVisClasses(modeId);
}
function flashSector(i) {
  if (!(i >= 0 && i < 3)) return;
  _secFlash[i] = 0.35;
  const t = G.sectorLast && G.sectorLast[i];
  const ok = t != null && isFinite(_secPrevBest[i]);
  _secDelta[i] = ok ? t - _secPrevBest[i] : 0;
  _secDeltaT[i] = ok ? SPLIT_DELTA_MS : 0;
}
function sessionOf(timeTrial) {
  return timeTrial ? "tt" : G.session === "quali" ? "quali" : G.practice ? "practice" : "race";
}

function paintHudDelta(player, timeTrial) {
  const box = _rx.delta;
  if (!box) return;
  const n = _rx.deltaN || box;
  const ghost = typeof GhostShare !== "undefined" && GhostShare.hasGuest()
    ? GhostShare
    : (typeof Ghost !== "undefined" && Ghost.hasGhost() ? Ghost : null);
  const ref = ghost || (_trace && _trace.has() && (player.lap | 0) >= 1 ? _trace : null);
  hData(box, "ref", ghost ? "ghost" : ref ? "best" : null);
  hHidden(box, false);
  const ghostT = ref && (!ghost || (player.lap | 0) >= 1) ? ref.timeAt(player.s) : null;
  if (ghostT == null || !(player.lapTime >= 0)) {
    hData(box, "pending", "");
    if (_deltaShown && _invalidateFit && !document.body.classList.contains("desktop")) _invalidateFit();
    _deltaShown = false;
    return;
  }
  _deltaShown = true;
  const wasPending = box.dataset ? box.dataset.pending != null : box.hasAttribute && box.hasAttribute("data-pending");
  hData(box, "pending", null);
  if (wasPending && _invalidateFit && !document.body.classList.contains("desktop")) _invalidateFit();
  const delta = player.lapTime - ghostT;
  const deltaTxt = signedFixed(delta);
  hText(n, deltaTxt);
  hData(box, "sign", deltaTxt[0] === "-" || +deltaTxt === 0 ? "fast" : "slow");
  void timeTrial;
}
function signedFixed(v) {
  const t = v.toFixed(3);
  return +t === 0 ? "+0.000" : (v > 0 ? "+" : "") + t;
}
function buildSecRows() {
  const labels = ["S1", "S2", "S3"];
  els.hudSectors.textContent = "";
  _secRows = [];
  for (let i = 0; i < 3; i++) {
    const row = document.createElement("div"); row.className = "sec-row";
    const lbl = document.createElement("span"); lbl.className = "sec-lbl"; lbl.textContent = labels[i];
    const val = document.createElement("span"); val.className = "sec-val"; val.textContent = "--";
    row.appendChild(lbl); row.appendChild(val); els.hudSectors.appendChild(row);
    _secRows.push(val);
  }
  if (els.hudLimits) _limitsDots = els.hudLimits.querySelector("span");
}

const GAP_SHORT_AT = { narrow: 640, wide: 800 };
const GAP_DROP_AT  = { narrow: 550, wide: 800 };
let _gapTight = null, _gapDrop = null;
const _gapW = [0, 0];
const _gapSm = [NaN, NaN], _gapWho = [null, null];
function gapDecimals(sec) {
  if (_ro && typeof _ro.gapDecimals === "function") return _ro.gapDecimals(G.hudProfile, sec);
  return (G.hudProfile || "standard") === "broadcast" ? 2 : (Number.isFinite(sec) && Math.abs(sec) < 9.995 ? 2 : 1);
}
function gapSec(slot, who, raw) {
  if (who !== _gapWho[slot] || !isFinite(_gapSm[slot])) { _gapWho[slot] = who; _gapSm[slot] = raw; }
  else _gapSm[slot] += (raw - _gapSm[slot]) * 0.3;
  const v = _gapSm[slot];
  if (_ro && typeof _ro.fmtGapSec === "function") return _ro.fmtGapSec(v, G.hudProfile);
  return v.toFixed(gapDecimals(v));
}
function gapForm() {
  const root = document.documentElement;
  const s = +root.style.getPropertyValue("--hud-z-top") ||
            +root.style.getPropertyValue("--hud-scale") || 1;
  const ratio = vpW() / s;
  const k = vpW() >= 1200 ? "wide" : "narrow";
  const short = _gapTight != null ? _gapTight : ratio <= GAP_SHORT_AT[k];
  const drop = _gapDrop != null ? _gapDrop : ratio <= GAP_DROP_AT[k];
  if (short !== ("gapShort" in root.dataset)) {
    if (short) root.dataset.gapShort = "1";
    else delete root.dataset.gapShort;
  }
  if (drop !== ("gapDrop" in root.dataset)) {
    if (drop) root.dataset.gapDrop = "1";
    else delete root.dataset.gapDrop;
  }
  return short ? _gapFormShort : _gapFormLong;
}
function gapText(slot, gap, arrow, o, dist, vFloor) {
  const n = _ro && G.track ? _ro.lapsApart(dist, G.track.total) : 0;
  if (n) { _gapWho[slot] = null; return _ro.lapGapText(arrow, o.code, slot ? -n : n, gap === _gapFormShort); }
  const rough = dist / vFloor;
  const timed = _ro && _ro.gaps ? (slot ? _ro.gaps.between(G.player, o, G.raceT || 0, rough) : _ro.gaps.between(o, G.player, G.raceT || 0, rough)) : rough;
  return gap(arrow, o.code, gapSec(slot, o, timed));
}
const _gapFormShort = (arrow, code, t) => arrow + " " + t;
function gapsEmptySync() {
  const plate = els.gapA && els.gapA.parentNode;
  if (!plate || !plate.dataset) return;
  hData(plate, "empty", (els.gapA.textContent || (els.gapB && els.gapB.textContent)) ? null : "");
}
const _gapFormLong = (arrow, code, t) => arrow + " " + code + " " + t + (/\d/.test(t) ? "s" : "");

const FIT_AIR = 10;
const ROW_AIR = 2;
let _fitTrace = "", _fitKey = "", _fitWait = 0, _fitRetry = 0, _fitClearSeq = 0, _hlEls = [];
const _rotMq = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(orientation: portrait)") : null, refitRot = () => { _fitRetry = 0; _fitKey = ""; _fitWait = 0; _fitPending = true; };
if (_rotMq && typeof _rotMq.addEventListener === "function") _rotMq.addEventListener("change", () => { refitRot(); setTimeout(refitRot, VP_SETTLE_MS); });
const FIT_SETTLE_MS = 400, FIT_SKIP_MAX = 9, _fitSeen = new WeakSet(), _fitSize = new WeakMap();
let _fitObs = null, _fitObsDirty = true, _fitAt = 0, _fitSkips = 0;
const _fitNow = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
function fitWatch() {
  if (typeof ResizeObserver !== "function" || !document.querySelectorAll) return;
  if (!_fitObs) _fitObs = new ResizeObserver((entries) => {
    const settling = _fitNow() - _fitAt < FIT_SETTLE_MS;
    for (const e of entries) {
      const b = e.borderBoxSize && e.borderBoxSize[0], s = b ? b.inlineSize + "x" + b.blockSize : e.contentRect.width + "x" + e.contentRect.height;
      if (!settling && _fitSize.has(e.target) && _fitSize.get(e.target) !== s) _fitObsDirty = true;
      _fitSize.set(e.target, s);
    }
  });
  for (const el of document.querySelectorAll("#hud > *, #hud-dock > *, .dock > *, [data-hl]")) if (!_fitSeen.has(el)) { _fitSeen.add(el); _fitObs.observe(el); }
}
function fitBoxesSettled() { return !!_fitObs && !_fitObsDirty && ++_fitSkips <= FIT_SKIP_MAX; }
let _fitPending = false;
let _fitStamped = false, _fitClashRun = 0;
let _stampKey = "", _stampWait = 0;
const FIT_CLASH_TRIES = 5;
const _HL_CSS_HID = new Set(["hud-energy", "hud-tyre", "hud-ot", "hud-aero", "hud-bb"]);
let _blueHeld = null;
function hlKey() {
  const b = typeof document !== "undefined" ? document.body : null;
  const strip = !!b && !!b.dataset && b.dataset.hlSet === "cockpit" && !(b.classList && b.classList.contains("desktop"));
  let k = "";
  for (let i = 0; i < _hlEls.length; i++) {
    const el = _hlEls[i];
    const cssHid = strip && _HL_CSS_HID.has(el.id) && !(el.hasAttribute && el.hasAttribute("data-hl-user"));
    k += el.hidden || cssHid ? "h" : "v" + (el.textContent || "").length + ",";
  }
  return k;
}
let _cssRootKey = "", _cssScale = 1, _cssMult = 1;
function syncComputedRootVars() {
  const rs = document.documentElement.style;
  const k = vpW() + "x" + vpH() + "|" + document.body.className + "|" + rs.getPropertyValue("--hud-scale") + "|" + rs.getPropertyValue("--hud-btn-scale");
  if (k === _cssRootKey) return;
  _cssRootKey = k;
  if (typeof getComputedStyle !== "function") { _cssScale = 1; _cssMult = 1; return; }
  const cs = getComputedStyle(document.documentElement);
  _cssScale = +cs.getPropertyValue("--hud-scale") || 1;
  _cssMult = +cs.getPropertyValue("--hud-btn-mult") || 1;
}
let _hudTop = null, _hudBottom = null, _dockL = null, _dockR = null;
let _dockMir = null, _deltaShown = false;
function pickDocks() { const m = document.body.classList.contains("mirror-controls"); if (_dockL && m === _dockMir) return; _dockMir = m; const a = document.getElementById("dock-left"), b = document.getElementById("dock-right"); _dockL = m ? b : a; _dockR = m ? a : b; }
let _dockBtns = null, _dockKids = [];
function dockKidsSame() {
  let i = 0;
  for (const d of [_dockL, _dockR]) {
    if (_dockKids[i++] !== d) return false;
    if (d) for (let j = 0; j < d.children.length; j++) if (_dockKids[i++] !== d.children[j]) return false;
  }
  return i === _dockKids.length;
}
function dockButtons() {
  if (_dockBtns && dockKidsSame()) return _dockBtns;
  _dockBtns = []; _dockKids = [];
  for (const d of [_dockL, _dockR]) if (_dockKids.push(d) && d) { _dockKids.push(...d.children); _dockBtns.push(...d.querySelectorAll(".touchbtn, .shiftbtn, .steerbtn")); }
  return _dockBtns;
}
const _HL_O = { left: 0, right: 1, top: 0, bottom: 1 };
function layoutRect(el) {
  const r = el.getBoundingClientRect();
  const clearX = parseFloat(el.style.getPropertyValue("--hud-clear-x")) || 0;
  const clearY = parseFloat(el.style.getPropertyValue("--hud-clear-y")) || 0;
  if (!r.width || !el.hasAttribute || !el.hasAttribute("data-hl")) return clearX || clearY
    ? { ...r, left: r.left - clearX, right: r.right - clearX, top: r.top - clearY, bottom: r.bottom - clearY, width: r.width, height: r.height } : r;
  const st = el.style, s = +st.getPropertyValue("--hl-s") || 1;
  const w = r.width / s, h = r.height / s;
  let left = r.left - clearX - (+st.getPropertyValue("--hl-x") || 0) * vpW() / 100;
  let top = r.top - clearY - (+st.getPropertyValue("--hl-y") || 0) * vpH() / 100;
  if (s !== 1) {
    let fx = 0.5, fy = 0.5, dx = 0, dy = 0;
    for (const k of String(st.getPropertyValue("--hl-o") || "").trim().split(/\s+/)) {
      if (k === "left" || k === "right") fx = _HL_O[k]; else if (k === "top" || k === "bottom") fy = _HL_O[k];
    }
    const m = typeof getComputedStyle === "function" ? /matrix\(([^)]*)\)/.exec(getComputedStyle(el).transform || "") : null;
    if (m) {
      const v = m[1].split(",").map(Number);
      if (el.offsetWidth) dx = v[4] / el.offsetWidth * w;
      if (el.offsetHeight) dy = v[5] / el.offsetHeight * h;
    }
    left += (fx * w - dx) * (s - 1); top += (fy * h - dy) * (s - 1);
  }
  return { left, top, right: left + w, bottom: top + h, width: w, height: h };
}
const { invalidateLaneRects, dropLaneRects, announceLane, announceLaneTick, radioTopSlot, radioPaintedCollapse, radioPaintedKey,
  radioPaintedCollapseTick, laneRectMisses, resetLaneRectMisses } = HudRadioLane.create(G, {
  vpW, vpH, hStyle, hUnstyle, hToggle, fitKey: () => _fitKey, top: () => _hudTop, docks: () => [_dockL, _dockR],
});
const MIR_COL = 230;
function setDockRW(root, v) { hStyle(root, "--dock-r-w", (v > 0 ? v : 0).toFixed(1) + "px"); }
let _mirEl;
function mirrorClear(root) {
  if (_mirEl === undefined) _mirEl = document.getElementById("hud-mirror");
  const on = _mirEl && !_mirEl.hidden && document.body.classList.contains("hud-mirror-on");
  const r = on ? _mirEl.getBoundingClientRect() : null, cx = vpW() / 2;
  const b = r && r.width && r.left < cx + MIR_COL && r.right > cx - MIR_COL ? r.bottom : 0;
  hStyle(root, "--mir-paint-b", b.toFixed(1) + "px");
}
const manualHud = (el) => !!(el && el.hasAttribute && el.hasAttribute("data-hl-user"));
function _hudRectsHit(a, b) {
  return !!(a && b && a.width > 0 && b.width > 0
    && a.left < b.right - 0.5 && b.left < a.right - 0.5
    && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5);
}
function _boostOnRightHalf() {
  const boost = typeof document !== "undefined" ? document.getElementById("btn-boost") : null;
  if (!boost || boost.hidden) return null;
  const br = boost.getBoundingClientRect();
  if (!(br.width && br.height)) return null;
  if ((br.left + br.right) / 2 < vpW() / 2) return null;
  return boost;
}
let _hudGaps = null;
function towerGapsPaintedClash() {
  if (document.body.classList.contains("desktop")) return false;
  if (document.documentElement.dataset.gapDrop) return false;
  const tower = _hudTop || (typeof document !== "undefined" ? document.querySelector(".hud-top") : null);
  if (!_hudGaps || !_hudGaps.isConnected) _hudGaps = document.querySelector(".hud-gaps");
  const gaps = _hudGaps, bc = document.body.classList;
  if (!tower || !gaps || manualHud(tower) || manualHud(gaps) || gaps.hidden || bc.contains("hud-hide-gaps") || bc.contains("bc-on")) return false;
  try {
    const gs = getComputedStyle(gaps);
    if (gs.display === "none" || gs.visibility === "hidden") return false;
  } catch (_) { return false; }
  const gr = gaps.getBoundingClientRect();
  if (!(gr.width && gr.height)) return false;
  const tr = tower.getBoundingClientRect();
  if (!(tr.width && tr.height)) return false;
  return _hudRectsHit(tr, gr);
}
function gapPaintedDrop() {
  if (!towerGapsPaintedClash()) return false;
  _gapDrop = true;
  document.documentElement.dataset.gapDrop = "1";
  const gaps = document.querySelector(".hud-gaps");
  if (gaps) void gaps.offsetHeight;
  return true;
}
function gapsMirrorPaintedClash() {
  if (document.body.classList.contains("desktop") || !_mirEl || _mirEl.hidden || !document.body.classList.contains("hud-mirror-on")) return false;
  const gaps = document.querySelector(".hud-gaps");
  if (!gaps || gaps.hidden || manualHud(gaps) || manualHud(_mirEl) || document.body.classList.contains("hud-hide-gaps")) return false;
  return _hudRectsHit(gaps.getBoundingClientRect(), _mirEl.getBoundingClientRect());
}
function gapMirrorDrop() {
  if (document.documentElement.dataset.gapMir || !gapsMirrorPaintedClash()) return false;
  document.documentElement.dataset.gapMir = "1";
  void document.documentElement.offsetHeight;
  return true;
}
const _PEDAL_STEER = () => [els.btnBrake, els.btnThrottle, els.btnSteerLeft, els.btnSteerRight];
const _hitPedalSteer = (rr) => _PEDAL_STEER().some((el) => el && !el.hidden && _hudRectsHit(rr, el.getBoundingClientRect()));
function nudgeAero(z) {
  const aero = els.aero, ar = aero && !manualHud(aero) && !aero.hidden ? aero.getBoundingClientRect() : null;
  if (!ar || !ar.width) return;
  let need = 0, limit = Infinity;
  for (const el of _PEDAL_STEER()) {
    const b = el && !el.hidden ? el.getBoundingClientRect() : null;
    if (!b || !_hudRectsHit(ar, b)) continue;
    if (b.left + b.right < ar.left + ar.right) need = Math.max(need, b.right + 8 - ar.left);
    else limit = Math.min(limit, b.left - 8 - ar.right);
  }
  if (need <= 0.5 || need > limit) return;
  aero.style.position = "relative";
  aero.style.left = ((parseFloat(aero.style.left) || 0) + need / z).toFixed(1) + "px";
}
function phonePaintedClash(boostIn) {
  if (document.body.classList.contains("desktop")) return false;
  if (towerGapsPaintedClash() || gapsMirrorPaintedClash()) return true;
  const sectors = els.hudSectors;
  const boost = boostIn !== undefined ? boostIn : _boostOnRightHalf();
  if (sectors && !manualHud(sectors) && !sectors.hidden && boost && _hudRectsHit(sectors.getBoundingClientRect(), boost.getBoundingClientRect())) return true;
  const rel = typeof document !== "undefined" ? document.getElementById("hud-rel") : null;
  if (rel && !manualHud(rel) && !rel.hidden) {
    const rr = rel.getBoundingClientRect();
    if (_dockL) {
      for (const g of _dockL.children) {
        if (g.hidden) continue;
        const box = g.getBoundingClientRect();
        if (box.width && box.height && _hudRectsHit(rr, box)) return true;
      }
    }
    if (_hitPedalSteer(rr)) return true;
  }
  if (els.aero && !manualHud(els.aero) && !els.aero.hidden && _hitPedalSteer(els.aero.getBoundingClientRect())) return true;
  return false;
}
function phoneFitStampSync(scale, force) {
  if (document.body.classList.contains("desktop")) return;
  const root = document.documentElement;
  const DOCK_AIR = 12;
  if (!_hudTop) {
    _hudTop = document.querySelector(".hud-top");
    _hudBottom = document.querySelector(".hud-bottom");
  }
  pickDocks();
  const bumpDock = () => {
    const boost = _boostOnRightHalf();
    if (!boost) return false;
    const br = boost.getBoundingClientRect();
    if (!(br.width && br.height)) return false;
    const probe = els.hudSectors || _hudTop || els.minimap;
    const zTop = (+root.style.getPropertyValue("--hud-z-top") || scale || 1);
    const live = probe && probe.currentCSSZoom > 0 ? probe.currentCSSZoom : zTop;
    const z = Math.min(zTop, live) || 1;
    let sarPx = 0;
    try { sarPx = parseFloat(getComputedStyle(root).getPropertyValue("--sar")) || 0; } catch (_) {  }
    const midCap = Math.max(0, (vpW() / 2) / z - 10 - sarPx / z);
    const need = Math.min(
      Math.max(0, (vpW() - br.left) / z - 10 - sarPx / z + DOCK_AIR / z),
      midCap
    );
    setDockRW(root, need);
    if (els.hudSectors) void els.hudSectors.offsetHeight;
    if (_dockR) void _dockR.offsetHeight;
    return true;
  };
  const shrinkSectors = () => {
    const secEl = els.hudSectors;
    const boost = _boostOnRightHalf();
    if (!secEl || manualHud(secEl) || secEl.hidden || !boost) return false;
    const br = boost.getBoundingClientRect();
    const secR = secEl.getBoundingClientRect();
    if (!secR.width || !_hudRectsHit(secR, br)) return false;
    const zTop = (+root.style.getPropertyValue("--hud-z-top") || scale || 1);
    const live = secEl.currentCSSZoom > 0 ? secEl.currentCSSZoom : zTop;
    const z = Math.min(zTop, live) || 1;
    const worst = secR.right - (br.left - DOCK_AIR);
    if (!(worst > 0.5)) return false;
    const curW = secR.width / z;
    secEl.style.maxWidth = Math.max(48, curW - worst / z).toFixed(1) + "px";
    void secEl.offsetHeight;
    return true;
  };
  if (typeof HudRelative !== "undefined") { if (HudRelative.refit) HudRelative.refit(force); else if (HudRelative.fitRows) HudRelative.fitRows(); }
  const sk = radioPaintedKey(root) + "|" + _fitKey + "|" + (typeof HudRelative !== "undefined" && HudRelative.fitKey ? HudRelative.fitKey() : "")
    + "|" + (els.hudSectors ? (els.hudSectors.hidden ? "h" : "v") : "-");
  if (!force && _fitStamped && !_fitPending && sk === _stampKey && --_stampWait > 0) return;
  if (els.aero && els.aero.style.left) { els.aero.style.left = ""; els.aero.style.position = ""; }
  if (root.dataset && "gapMir" in root.dataset) delete root.dataset.gapMir;
  let clash = phonePaintedClash();
  for (let pass = 0; pass < 8 && clash; pass++, clash = phonePaintedClash()) {
    if (gapPaintedDrop() || gapMirrorDrop()) continue;
    if (typeof HudRelative !== "undefined" && HudRelative.fitRows) HudRelative.fitRows();
    bumpDock();
    shrinkSectors();
    nudgeAero((els.aero && els.aero.currentCSSZoom) || scale || 1);
  }
  if (!clash && !_fitPending) {
    if (force || !_fitStamped) {
      _fitClearSeq = (_fitClearSeq + 1) | 0;
      hStyle(root, "--hud-fit-stamp", String(_fitClearSeq));
      _fitStamped = true;
    }
  } else { hStyle(root, "--hud-fit-stamp", ""); _fitStamped = false; }
  _stampKey = clash ? "" : sk; _stampWait = 30;
}
function fitHud() {
  if (document.body.classList.contains("hud-hidden")) return;
  const root = document.documentElement;
  syncComputedRootVars();
  const scale = +root.style.getPropertyValue("--hud-scale") || _cssScale;
  const gapLen = (els.gapA ? els.gapA.textContent.length : 0) * 100 +
    (els.gapB ? els.gapB.textContent.length : 0);
  const secRows = els.hudSectors ? els.hudSectors.childElementCount : 0;
  const placedSectors = manualHud(els.hudSectors);
  const mult = _cssMult;
  const btnScale = +root.style.getPropertyValue("--hud-btn-scale") || mult;
  let dockSig = "";
  for (const b of dockButtons()) dockSig += b.hidden ? "0" : "1";
  const head = vpW() + "x" + vpH() + "@" + scale + "+" + btnScale + "|" + gapLen + "." + secRows + "." + dockSig + (_rx.delta && !_rx.delta.hidden ? "d" : "") + "|";
  const tail = "|" + document.body.className;
  const sameKey = head + hlKey() + tail === _fitKey;
  if (sameKey && _fitWait === 1 && fitBoxesSettled()) _fitWait = 31;
  if (sameKey && --_fitWait > 0) { if (_fitObs && !_fitObsDirty) { _fitClashRun = 0; return; }
    let clash = false, boost;
    if (!placedSectors && !document.body.classList.contains("desktop") && els.hudSectors && !els.hudSectors.hidden) {
      const s = els.hudSectors.getBoundingClientRect();
      boost = _boostOnRightHalf();
      const b = boost ? boost.getBoundingClientRect() : null;
      if (b && b.width && s.width && s.right > b.left - 8 && s.left < b.right + 8
          && s.top < b.bottom && b.top < s.bottom) clash = true;
      else {
        const ann = typeof document !== "undefined" ? document.getElementById("announce") : null;
        if (ann && !manualHud(ann) && !ann.hidden && !ann.hasAttribute("data-lane-collapsed")) {
          const a = ann.getBoundingClientRect();
          if (a.width > 0 && s.width && s.left < a.right - 0.5 && a.left < s.right - 0.5
              && s.top < a.bottom - 0.5 && a.top < s.bottom - 0.5) clash = true;
        }
      }
    }
    if (!clash && phonePaintedClash(boost)) clash = true;
    if (!clash) { _fitClashRun = 0; return; }
    if (++_fitClashRun > FIT_CLASH_TRIES) return;
    _fitWait = 0;
  }
  _hlEls = document.querySelectorAll ? document.querySelectorAll("[data-hl]") : [];
  const key = head + hlKey() + tail;
  if (key !== _fitKey) _fitClashRun = 0;
  _fitKey = key; _fitWait = 30; _stampKey = "";
  _fitPending = false;
  fitWatch(); _fitObsDirty = false; _fitAt = _fitNow(); _fitSkips = 0;
  const zWas = [root.style.getPropertyValue("--hud-z-top"), root.style.getPropertyValue("--hud-z-bot")];
  _fitCanon = null;
  if (fitPass(true, scale, btnScale, placedSectors)) fitPass(false, scale, btnScale, placedSectors);
  else ["--hud-z-top", "--hud-z-bot"].forEach((p, i) => (zWas[i] ? root.style.setProperty(p, zWas[i]) : root.style.removeProperty(p)));
}
let _fitCanon = null;
let _tyreRestack = null;
function fitPass(canon, scale, btnScale, placedSectors) {
  const root = document.documentElement;
  if (canon) for (const p of ["--hud-z-top", "--hud-z-bot"]) if ((+root.style.getPropertyValue(p) || scale) !== 1) root.style.setProperty(p, "1");
  if (els.hudSectors && els.hudSectors.style) els.hudSectors.style.removeProperty("max-width");
  let btnFloor = 1;
  const zTopPub = +root.style.getPropertyValue("--hud-z-top") || scale;
  const zBotPub = +root.style.getPropertyValue("--hud-z-bot") || scale;
  let zDockPub = Math.min(+root.style.getPropertyValue("--hud-z-dock") || Infinity, Math.max(btnFloor, btnScale));
  let zDockPubS = Math.min(+root.style.getPropertyValue("--hud-z-dock-l") || zDockPub, Math.max(btnFloor, btnScale));
  const zoomDiv = (el, pub) => (el && (el.currentCSSZoom > 0 || _noCssZoom) ? (pub || 1) : 1);
  const wide = (el, pub) => {
    if (!el || manualHud(el)) return 0;
    const r = layoutRect(el);
    if (!r.width) return 0;
    return r.width / zoomDiv(el, pub);
  };
  const outOfFlow = (c) => { try { const p = getComputedStyle(c).position; return p === "absolute" || p === "fixed"; } catch (_) { return false; } };
  const span = (el, pub) => {
    if (!el) return 0;
    let lo = Infinity, hi = -Infinity;
    for (const c of el.children) {
      if (manualHud(c) || (c.id === "hud-tyre" && outOfFlow(c))) continue;
      const r = layoutRect(c);
      if (!r.width) continue;
      if (r.left < lo) lo = r.left;
      if (r.right > hi) hi = r.right;
    }
    return hi > lo ? (hi - lo) / zoomDiv(el, pub) : 0;
  };
  if (!_hudTop) { _hudTop = document.querySelector(".hud-top"); _hudBottom = document.querySelector(".hud-bottom"); }
  pickDocks();
  const top = wide(_hudTop, zTopPub);
  let retry = !top;
  if (!top && !wide(els.minimap, zTopPub) && !wide(els.hudSectors, zTopPub) && !span(_hudBottom, zBotPub) && !wide(_dockL, zDockPub) && !wide(_dockR, zDockPub)) {
    if (++_fitRetry <= 30) { _fitKey = ""; _fitPending = true; }
    return false;
  }
  try { const v = parseFloat(getComputedStyle(root).getPropertyValue("--hud-btn-floor")); if (Number.isFinite(v) && v > 0 && v <= 1) btnFloor = v; } catch (_) {  }
  zDockPub = Math.min(+root.style.getPropertyValue("--hud-z-dock") || Infinity, Math.max(btnFloor, btnScale));
  zDockPubS = Math.min(+root.style.getPropertyValue("--hud-z-dock-l") || zDockPub, Math.max(btnFloor, btnScale));
  const half = vpW() / 2;
  const map = wide(els.minimap, zTopPub), gaps = wide(els.gapA && els.gapA.parentNode, zTopPub);
  const mmR = els.minimap && !manualHud(els.minimap) ? layoutRect(els.minimap) : null;
  const scR = els.hudSectors && !manualHud(els.hudSectors) ? layoutRect(els.hudSectors) : null;
  const mz = zoomDiv(els.minimap, zTopPub), sz = zoomDiv(els.hudSectors, zTopPub);
  const salM = mmR && mmR.width ? Math.max(0, mmR.left - 10 * mz) : null;
  let sarTok = null;
  try { const v = parseFloat(getComputedStyle(root).getPropertyValue("--sar")); if (Number.isFinite(v) && v >= 0) sarTok = v; } catch (_) {  }
  const sarM = sarTok != null ? sarTok : (scR && scR.width ? Math.max(0, vpW() - scR.right - 10 * sz) : null);
  const sal = salM != null ? salM : (sarM != null ? sarM : 0);
  const sar = sarM != null ? sarM : (salM != null ? salM : 0);
  const leftN = (map ? 10 + map : 0) + FIT_AIR;
  const right = wide(els.hudSectors, zTopPub) + 10 + FIT_AIR;
  const bcast = document.body.classList.contains("hud-prof-broadcast");
  const portraitPhone = !document.body.classList.contains("desktop")
    && typeof window !== "undefined" && window.matchMedia
    && window.matchMedia("(orientation: portrait) and (max-width: 500px)").matches;
  const capFor = (l) => (bcast
    ? (vpW() - sal - sar) / Math.max(Math.max(top, l) + right, 1)
    : portraitPhone
      ? Math.min((vpW() - sal - sar - 2 * FIT_AIR) / Math.max(top, 1),
                 (vpW() - sar - FIT_AIR) / Math.max(right, 1))
      : Math.min((half - sal) / Math.max(l + top / 2, 1),
                 (half - sar) / Math.max(right + top / 2, 1)));
  if (gaps && canon) _gapW["gapShort" in root.dataset ? 0 : 1] = gaps;
  const wShort = _gapW[0] || gaps, wLong = _gapW[1] || gaps;
  const leftFor = (w) => (map ? 10 + map + 8 + w : 0) + FIT_AIR;
  const capLong = capFor(leftFor(wLong)), capShort = capFor(leftFor(wShort));
  const capNo = capFor(leftN);
  if (canon) { _gapTight = capLong < scale; _gapDrop = _gapTight && capShort < scale; }
  let satPx = 0;
  try { satPx = parseFloat(getComputedStyle(root).getPropertyValue("--sat")) || 0; } catch (_) {  }
  let capChrome = Infinity;
  if (!bcast && top) {
    const tR = layoutRect(_hudTop), botInt = (tR.bottom - satPx) / zoomDiv(_hudTop, zTopPub);
    const bz = Math.min(1.5, Math.max(1, Math.min(+root.style.getPropertyValue("--hud-z-dock") || 99, btnScale)));
    const pR = els.pausebtn && !els.pausebtn.hidden ? els.pausebtn.getBoundingClientRect() : null, pauseL = pR && pR.width ? pR.right - 44 * bz : Infinity;
    for (const el of [els.btnCam, els.pausebtn]) {
      const r = el && !el.hidden ? layoutRect(el) : null;
      if (!(r && r.width && r.left > half)) continue;
      const left = Math.min(r.left, el === els.pausebtn ? pauseL : pauseL - 4 - Math.max(76, r.width) * bz);
      const zSide = (left - FIT_AIR - half) / (top / 2);
      const zAbove = botInt > 0 ? (r.top - FIT_AIR - satPx) / botInt : -Infinity;
      capChrome = Math.min(capChrome, Math.max(zSide, zAbove));
    }
  }
  let capRow = Infinity;
  if (!placedSectors && !bcast && top && scR && scR.width && !document.body.classList.contains("desktop")) {
    const tR = layoutRect(_hudTop), zd = zoomDiv(_hudTop, zTopPub);
    const y0 = (tR.top - satPx) / zd, hInt = tR.height / zd;
    if (hInt > 0 && y0 + hInt > 0 && scR.top > tR.top + ROW_AIR) capRow = (scR.top - ROW_AIR - satPx) / (y0 + hInt);
  }
  let capTop = Math.min(capChrome, capRow, Math.max(_gapDrop ? 0 : (_gapTight ? capShort : capLong), Math.min(scale, capNo)));
  const bottom = span(_hudBottom, zBotPub);
  let capBot = bottom ? (vpW() - 2 * FIT_AIR) / bottom : Infinity;
  const tall = (el, pub) => {
    if (!el) return 0;
    const r = layoutRect(el);
    if (!r.height) return 0;
    return r.height / zoomDiv(el, pub);
  };
  const topHPub = tall(_hudTop, zTopPub);
  const phone = !document.body.classList.contains("desktop");
  const gapsEl = els.gapA ? els.gapA.parentNode : null;
  if (!canon) {
    hStyle(root, "--hud-top-h", topHPub.toFixed(1) + "px");
    const secH = tall(els.hudSectors, zTopPub);
    hStyle(root, "--hud-sec-h", secH.toFixed(1) + "px");
    const chromeZ = zoomDiv(_hudTop || els.minimap, zTopPub) || scale || 1;
    const CHIP_H = 26, CHIP_DROP = 15;
    const pauseR = els.pausebtn ? els.pausebtn.getBoundingClientRect() : null;
    const colTop = scR && scR.height ? scR.top : (pauseR && pauseR.height ? pauseR.bottom + 4 : 0);
    const limBot = colTop + (secH + CHIP_DROP + CHIP_H) * chromeZ;
    const dockR = _dockR ? _dockR.getBoundingClientRect() : null;
    const hitsRight = !!(dockR && dockR.width && limBot > dockR.top);
    const gapsR = gapsEl ? layoutRect(gapsEl) : null;
    let leftBot = bcast && _hudTop ? layoutRect(_hudTop).bottom : 0;
    if (mmR && mmR.width) leftBot = Math.max(leftBot, mmR.bottom);
    if (gapsR && gapsR.width) leftBot = Math.max(leftBot, gapsR.bottom);
    hStyle(root, "--hud-gaps-b", ((gapsR && gapsR.width ? gapsR.bottom : 0) / chromeZ).toFixed(1) + "px");
    const dockL = _dockL ? _dockL.getBoundingClientRect() : null;
    const tyreEl = els.tyre;
    const colBot = leftBot;
    const tyreZ = zBotPub || scale || 1;
    let tyreStack = false, limLeft = false, metricsB = "", restacked = false;
    const tyreFree = phone && tyreEl && !tyreEl.hidden && !(tyreEl.hasAttribute && tyreEl.hasAttribute("data-hl-user"));
    const gmEl = typeof document !== "undefined" ? document.getElementById("game-metrics") : null;
    const readRestackKey = (tR = tyreEl.getBoundingClientRect(), gR = gmEl && !gmEl.hidden ? gmEl.getBoundingClientRect() : null) => [colBot, tR.left, tR.top, tR.height,
      dockL ? dockL.top + "," + dockL.width : "-", hitsRight, gR && gR.width ? gR.top + "," + gR.bottom + gmEl.dataset.pos : "-", chromeZ, tyreZ].join("|");
    const restackKey = tyreFree && _tyreRestack ? readRestackKey() : "";
    if (restackKey && restackKey === _tyreRestack.key) {
      ({ leftBot, metricsB } = _tyreRestack); tyreStack = limLeft = true;
      document.body.classList.toggle("hud-tyre-stack", true); hStyle(root, "--hud-metrics-b", metricsB);
      hStyle(root, "--hud-left-h", (leftBot / chromeZ).toFixed(1) + "px"); hStyle(root, "--hud-left-px", leftBot.toFixed(1) + "px");
    } else {
      const stackTyre = (force) => {
        const tHpx = Math.max(tyreEl.getBoundingClientRect().height, 36), minTopPx = colBot + 2;
        const dockTopPx = dockL && dockL.height ? dockL.top : vpH(), roomPx = Math.max(0, dockTopPx - minTopPx - 2);
        if (!(roomPx >= 12 && (force || dockTopPx - tHpx - 8 < minTopPx - 0.5))) return false;
        hStyle(root, "--hud-tyre-top", (minTopPx / tyreZ).toFixed(1) + "px");
        if (roomPx < tHpx - 0.5) hStyle(root, "--hud-tyre-max-h", (roomPx / tyreZ).toFixed(1) + "px");
        else hUnstyle(root, "--hud-tyre-max-h");
        if (tyreEl.dataset) {
          if (roomPx < 48) tyreEl.dataset.tyreCompact = "1";
          else delete tyreEl.dataset.tyreCompact;
        }
        leftBot = Math.max(leftBot, minTopPx + Math.min(tHpx, roomPx));
        return true;
      };
      if (!(tyreFree && (tyreStack = stackTyre(false)))) {
        hUnstyle(root, "--hud-tyre-top"); hUnstyle(root, "--hud-tyre-max-h");
        if (tyreEl && tyreEl.dataset) delete tyreEl.dataset.tyreCompact;
      }
      if (document.body.classList) document.body.classList.toggle("hud-tyre-stack", tyreStack);
      hStyle(root, "--hud-left-h", (leftBot / chromeZ).toFixed(1) + "px");
      hStyle(root, "--hud-left-px", leftBot.toFixed(1) + "px");
      const gmR = gmEl && !gmEl.hidden ? gmEl.getBoundingClientRect() : null;
      const gmBot = gmR && gmR.width ? gmR.bottom : 0;
      hStyle(root, "--hud-metrics-b", metricsB = (gmBot / chromeZ).toFixed(1) + "px");
      const leftFilled = Math.max(leftBot, gmBot);
      const leftRoom = !(dockL && dockL.width && leftFilled + (8 + CHIP_H) * chromeZ > dockL.top);
      limLeft = hitsRight && leftRoom && (typeof HudElements === "undefined" || HudElements.isOn("limits"));
      if (limLeft && tyreFree && !tyreStack && stackTyre(true)) {
        tyreStack = restacked = true;
        document.body.classList.toggle("hud-tyre-stack", true);
        hStyle(root, "--hud-left-h", (leftBot / chromeZ).toFixed(1) + "px");
        hStyle(root, "--hud-left-px", leftBot.toFixed(1) + "px");
      }
      _tyreRestack = restacked ? { key: readRestackKey(), leftBot, metricsB } : null;
    }
    if (limLeft !== ("limitsLeft" in root.dataset)) {
      if (limLeft) root.dataset.limitsLeft = "1";
      else delete root.dataset.limitsLeft;
    }
  }
  const hudDockEl = _dockL ? _dockL.parentNode : null;
  const steerDock = _dockMir ? _dockR : _dockL;
  const groups = (d) => {
    if (!d) return { h: 0, w: 0, stack: 0 };
    const z = zoomDiv(d, d === steerDock ? zDockPubS : zDockPub);
    let h = 0, w = 0, stack = 0, n = 0;
    for (const g of d.children) {
      const r = g.getBoundingClientRect();
      if (!r.width) continue;
      h = Math.max(h, r.height / z); w += r.width / z; stack += r.height / z; n++;
    }
    const cs = getComputedStyle(d);
    const gx = parseFloat(cs.columnGap) || 0, gy = parseFloat(cs.rowGap) || 0;
    return { h, w: w + Math.max(0, n - 1) * gx, stack: stack + Math.max(0, n - 1) * gy };
  };
  const gL = groups(_dockL), gR = groups(_dockR);
  const dockH = Math.max(gL.h, gR.h);
  let capDock = Infinity, capDockS = Infinity, capKeepS = Infinity;
  const DOCK_MIN_Z = 24 / 48;
  const READABLE_Z = 10 / 14;
  if (dockH) {
    const barR = hudDockEl ? hudDockEl.getBoundingClientRect() : null;
    let sat = 0, sab = 0;
    try { const cs = getComputedStyle(root); sat = parseFloat(cs.getPropertyValue("--sat")) || 0; sab = parseFloat(cs.getPropertyValue("--sab")) || 0; } catch (_) {  }
    const controlsRoom = vpH() - sat - sab - 4 * FIT_AIR;
    const heightCap = (height, topMax = 1.5) => {
      if (!height) return Infinity;
      if (controlsRoom <= height + 44) return (controlsRoom - 44) / height;
      if (controlsRoom <= topMax * (height + 44)) return controlsRoom / (height + 44);
      return (controlsRoom - 44 * topMax) / height;
    };
    if (!document.body.classList.contains("desktop") && _hudBottom && _hudBottom.children) {
      const zNow = zoomDiv(_hudBottom, zBotPub);
      let lo = Infinity, hi = -Infinity;
      const kids = _hudBottom.children;
      for (let i = 0; i < kids.length; i++) {
        const c = kids[i];
        if (!c || manualHud(c) || c.id === "hud-tyre") continue;
        const r = layoutRect(c);
        if (!r.width) continue;
        if (r.left < lo) lo = r.left;
        if (r.right > hi) hi = r.right;
      }
      const tyreEl = document.getElementById("hud-tyre");
      const tyreR = tyreEl && !manualHud(tyreEl) && !tyreEl.hidden ? layoutRect(tyreEl) : null;
      if (hi > lo && tyreR && tyreR.width && zNow) {
        const cW = (hi - lo) / zNow, tW = tyreR.width / zNow, cMid = (lo + hi) / 2;
        const denom = cW / 2 + tW;
        if (denom > 0 && cMid > tyreR.left) {
          const zClear = (cMid - tyreR.left - FIT_AIR) / denom;
          if (zClear > 0) capBot = Math.min(capBot, zClear);
        }
      }
    }
    const barW = barR && barR.width ? barR.width : vpW();
    const barGap = hudDockEl ? parseFloat(getComputedStyle(hudDockEl).columnGap) || 0 : 0;
    const controlsW = gL.w + gR.w;
    capDock = Math.min(heightCap(gL.h), heightCap(gR.h, 2),
      controlsW ? (barW - 2 * barGap - 2 * FIT_AIR) / controlsW : Infinity);
    const want = Math.max(btnFloor, btnScale), dockZ = Math.min(want, Math.max(DOCK_MIN_Z, capDock));
    if (vpW() > vpH()) {
      const left = steerDock === _dockL, gS = left ? gL : gR, gO = left ? gR : gL;
      const zO = Math.min(3, Math.max(DOCK_MIN_Z, capDock)), topZ = Math.min(left ? 1.5 : 2, Math.max(1, capDock));
      const roomS = barW - gO.w * zO - 2 * barGap - 2 * FIT_AIR - bottom, hS = gS.h ? (controlsRoom - 44 * topZ) / gS.h : Infinity;
      capDockS = Math.max(capDock, Math.min(hS, gS.w ? roomS / gS.w : Infinity));
      capKeepS = Math.max(capDock, Math.min(hS, gS.w ? (roomS - FIT_AIR - bottom * (Math.max(1, Math.min(scale, capBot)) - 1)) / gS.w : Infinity));
    } else capDockS = capKeepS = capDock;
    const zS = Math.min(want, Math.max(DOCK_MIN_Z, capDockS)), zDL = steerDock === _dockL ? zS : dockZ, zDR = zS + dockZ - zDL;
    const roomL = controlsRoom - 44 * Math.min(1.5, Math.max(1, dockZ));
    const roomW = barW - gL.w * zDL - gR.w * zDR - 2 * barGap - 2 * FIT_AIR;
    if (bottom && roomW > 0) capBot = Math.min(capBot, roomW / bottom);
    if (bcast && phone && vpW() > vpH()) {
      const stack = [_hudTop, els.minimap, gapsEl, els.flag, els.announce, els.tyre];
      const height = stack.reduce((sum, el) => {
        if (!el || manualHud(el) || el.hidden) return sum;
        const r = layoutRect(el);
        return sum + r.height / zoomDiv(el, el === els.tyre ? zBotPub : zTopPub);
      }, 6 * FIT_AIR);
      const cap = Math.max(11 / 14, (roomL - gL.h * zDL) / Math.max(1, height));
      capTop = Math.min(capTop, cap); capBot = Math.min(capBot, cap);
    }

  }
  if (!dockH && !document.body.classList.contains("desktop")) retry = true;
  let capPortrait = Infinity;
  if (!document.body.classList.contains("desktop") && _hudBottom
      && window.matchMedia && window.matchMedia("(orientation: portrait)").matches) {
    const zNowP = zoomDiv(_hudBottom, zBotPub) || 1;
    const stackR = _hudBottom.getBoundingClientRect();
    if (stackR.height) {
      let ceilY = FIT_AIR;
      for (const el of [els.btnCam, els.pausebtn, els.hudSectors, els.hudLimits, els.flag]) {
        if (!el || el.hidden) continue;
        const r = el.getBoundingClientRect();
        if (r.width && r.height) ceilY = Math.max(ceilY, r.bottom + FIT_AIR);
      }
      let sabPx = 0;
      try { sabPx = parseFloat(getComputedStyle(root).getPropertyValue("--sab")) || 0; } catch (_) {  }
      const mid = vpW() / 2, phoneBtns = document.body.classList.contains("steer-buttons") && vpW() < 744;
      let lo = mid, hi = mid, row = 0, capSide = Infinity;
      for (const c of _hudBottom.children) {
        const r = c && !c.hidden && !manualHud(c) ? layoutRect(c) : null;
        if (r && r.width) { lo = Math.min(lo, r.left); hi = Math.max(hi, r.right); }
      }
      for (const el of dockButtons()) {
        const r = el && !el.hidden ? el.getBoundingClientRect() : null;
        if (!r || !r.width) continue;
        if (phoneBtns && el.classList.contains("steerbtn")) row = Math.max(row, vpH() - sabPx - r.top + 12);
        if (r.top >= stackR.bottom - 1) continue;
        if (r.left > mid) { if (hi > mid) capSide = Math.min(capSide, (r.left - mid - 1) * zNowP / (hi - mid)); }
        else if (lo < mid) capSide = Math.min(capSide, (mid - r.right - 1) * zNowP / (mid - lo));
      }
      const avail = vpH() - sabPx - ceilY, stackH = stackR.height / zNowP;
      if (avail > 0) capPortrait = Math.min(avail / (112 + stackH + 48), row ? (avail - row) / (stackH + 48) : Infinity);
      if (capSide > 0) capPortrait = Math.min(capPortrait, capSide);
    }
  }
  capBot = Math.min(capBot, capPortrait);
  const set = (prop, cap, base) => {
    if (cap >= base) root.style.removeProperty(prop);
    else {
      const floor = prop === "--hud-z-dock" ? DOCK_MIN_Z : (portraitPhone && prop === "--hud-z-top") ? READABLE_Z : 0.4;
      let q = Math.round(cap * 1000) / 1000;
      if (prop === "--hud-z-top" || prop === "--hud-z-bot") {
        q = Math.ceil(cap * 100 - 1e-9) / 100;
        if (q >= base) { root.style.removeProperty(prop); return; }
      }
      root.style.setProperty(prop, String(Math.max(floor, q)));
    }
  };
  if (canon) { set("--hud-z-top", capTop, scale); set("--hud-z-bot", capBot, scale); _fitCanon = { top: capTop, bot: capBot }; return true; }
  capTop = _fitCanon.top; capBot = Math.min(_fitCanon.bot, capPortrait);
  if (retry) { if (++_fitRetry <= 30) { _fitKey = ""; _fitPending = true; } } else _fitRetry = 0;
  set("--hud-z-top", capTop, scale);
  set("--hud-z-bot", capBot, scale);
  hStyle(root, "--hud-cap", [capTop, capBot, capDock, capDockS, capKeepS, btnFloor].map((n) => (n < 9 ? Math.round(n * 1000) / 1000 : 9)).join(" "));
  if (_hudTop) void _hudTop.offsetHeight;
  if (els.minimap) void els.minimap.offsetHeight;
  hStyle(root, "--hud-top-h", topHPub.toFixed(1) + "px");
  const wantDock = Math.max(btnFloor, btnScale), zSteer = Math.round(Math.min(wantDock, Math.max(DOCK_MIN_Z, capDockS)) * 1000) / 1000;
  if (capDock < wantDock) root.style.setProperty("--hud-z-dock-l", String(zSteer));
  else root.style.removeProperty("--hud-z-dock-l");
  if (Math.abs(zSteer - zDockPubS) > 1e-6 && capDock < wantDock) { _fitKey = ""; _fitWait = 0; _fitPending = true; }
  set("--hud-z-dock", capDock, Math.max(btnFloor, btnScale));
  const dockAfter = Math.min(+root.style.getPropertyValue("--hud-z-dock") || Infinity, Math.max(btnFloor, btnScale));
  if (Math.abs(Math.min(2, Math.max(1, zDockPub)) - Math.min(2, Math.max(1, dockAfter))) > 1e-6) {
    _fitKey = ""; _fitWait = 0; _fitPending = true;
  }
  if (_dockR) void _dockR.offsetHeight;
  if (els.hudSectors) void els.hudSectors.offsetHeight;
  const zPaint = () => {
    const pub = +root.style.getPropertyValue("--hud-z-top") || scale || 1;
    const probe = _hudTop || els.minimap || els.hudSectors;
    const live = probe && probe.currentCSSZoom > 0 ? probe.currentCSSZoom : pub;
    return Math.min(pub, live);
  };
  const boostRightLeft = () => {
    const boost = typeof document !== "undefined" ? document.getElementById("btn-boost") : null;
    if (!boost || boost.hidden) return NaN;
    const br = boost.getBoundingClientRect();
    if (!(br.width && br.height)) return NaN;
    if ((br.left + br.right) / 2 < vpW() / 2) return NaN;
    return br.left;
  };
  const dockLeftOf = () => {
    let left = Infinity;
    if (_dockR) {
      for (const g of _dockR.children) {
        if (g.hidden) continue;
        const r = g.getBoundingClientRect();
        if (r.width && r.height) left = Math.min(left, r.left);
      }
    }
    const brLeft = boostRightLeft();
    if (Number.isFinite(brLeft)) left = Math.min(left, brLeft);
    if (!Number.isFinite(left) && _dockR) {
      const dr = _dockR.getBoundingClientRect();
      if (dr.width) left = dr.left;
    }
    return left;
  };
  let sarPx = 0;
  try { sarPx = parseFloat(getComputedStyle(root).getPropertyValue("--sar")) || 0; } catch (_) {  }
  const DOCK_AIR = 12;
  const insetFor = (left, z) => {
    if (!Number.isFinite(left) || !(z > 0)) return 0;
    const midCap = Math.max(0, (vpW() / 2) / z - 10 - sarPx / z);
    const need = Math.max(0, (vpW() - left) / z - 10 - sarPx / z + DOCK_AIR / z);
    return Math.min(need, midCap);
  };
  let zTop = zPaint();
  let dockRW = insetFor(dockLeftOf(), zTop);
  setDockRW(root, dockRW);
  if (els.hudSectors) void els.hudSectors.offsetHeight;
  if (_dockR) void _dockR.offsetHeight;
  if (!placedSectors && !document.body.classList.contains("desktop") && els.hudSectors && !els.hudSectors.hidden) {
    const secR = els.hudSectors.getBoundingClientRect();
    const brLeft = boostRightLeft();
    const left = Number.isFinite(brLeft) ? brLeft : dockLeftOf();
    if (secR.width && Number.isFinite(left) && secR.right > left - DOCK_AIR + 0.5) {
      zTop = zPaint();
      if (zTop > 0) {
        dockRW = insetFor(left, zTop);
        setDockRW(root, dockRW);
        void els.hudSectors.offsetHeight;
        if (_dockR) void _dockR.offsetHeight;
      }
    }
  }
  if (typeof HudLayout !== "undefined") HudLayout.fit();
  if (!document.body.classList.contains("desktop") && els.hudSectors && _dockR && !placedSectors) {
    const margin = DOCK_AIR;
    const mapR = els.minimap && !els.minimap.hidden ? els.minimap.getBoundingClientRect() : null;
    const mapClear = mapR && mapR.width ? mapR.right + margin : 0;
    const secEl = els.hudSectors;
    const rowHit = (a, b) => a.top < b.bottom && b.top < a.bottom;
    const intrudes = (a, b) => rowHit(a, b) && a.left < b.left && a.right > b.left - margin;
    for (let pass = 0; pass < 4; pass++) {
      const secR = secEl.getBoundingClientRect();
      if (!secR.width) break;
      let worst = 0;
      for (const g of _dockR.children) {
        const r = g.getBoundingClientRect();
        if (!(r.width && r.height)) continue;
        if (intrudes(secR, r)) worst = Math.max(worst, secR.right - (r.left - margin));
      }
      if (!(worst > 0.5)) break;
      const zSec = zPaint() || 1;
      secEl.style.maxWidth = Math.max(48, (secR.width - worst) / zSec).toFixed(1) + "px";
    }
    let secR = secEl.getBoundingClientRect();
    let worst = 0;
    for (const g of _dockR.children) {
      const r = g.getBoundingClientRect();
      if (!(r.width && r.height)) continue;
      if (intrudes(secR, r)) worst = Math.max(worst, secR.right - (r.left - margin));
    }
    if (worst > 0.5) {
      const brLeft = boostRightLeft();
      const left = Number.isFinite(brLeft) ? brLeft : dockLeftOf();
      if (Number.isFinite(left) && !(mapClear && secR.left - worst < mapClear)) {
        zTop = zPaint();
        if (zTop > 0) {
          dockRW = insetFor(left, zTop);
          setDockRW(root, dockRW);
        }
      }
    }
    secR = secEl.getBoundingClientRect();
    let onDock = false;
    for (const g of _dockR.children) {
      const r = g.getBoundingClientRect();
      if (r.width && r.height && rowHit(secR, r) && secR.right > r.left - margin && secR.left < r.right - margin) { onDock = true; break; }
    }
    if (!onDock && secEl.style && secEl.style.removeProperty) secEl.style.removeProperty("max-width");
  }
  if (els.hudSectors) void els.hudSectors.offsetHeight;
  {
    const sc = els.hudSectors && !els.hudSectors.hidden ? els.hudSectors.getBoundingClientRect() : null;
    const fl = els.flag ? els.flag.getBoundingClientRect() : null;
    const flagRight = fl && fl.width ? fl.right : vpW() / 2 + 80;
    const low = !!(sc && sc.width && (sc.left < flagRight + 8 || portraitPhone));
    if (low !== ("flagLow" in root.dataset)) { if (low) root.dataset.flagLow = "1"; else delete root.dataset.flagLow; }
    hStyle(root, "--hud-sec-bottom", (portraitPhone && sc && sc.height ? sc.bottom : 0).toFixed(1) + "px");
  }
  dropLaneRects();
  radioTopSlot(root, bcast);
  announceLane(root);
  {
    const bot = document.querySelector(".hud-bottom");
    const br = bot && !bot.hidden ? bot.getBoundingClientRect() : null;
    hStyle(root, "--hud-cluster-y", (br && br.height ? br.top : vpH()).toFixed(1) + "px");
  }
  radioPaintedCollapse(root);
  mirrorClear(root);
  if (typeof HudLayout !== "undefined" && HudLayout.clearReadouts) HudLayout.clearReadouts();
  if (els.minimap) void els.minimap.offsetHeight;
  if (Log.enabled("ui", Log.DEBUG)) {
    const rc = (el) => { const r = el && !el.hidden ? el.getBoundingClientRect() : null; return r && r.width ? [r.left, r.top, r.width, r.height].map(Math.round).join(",") : "-"; };
    const pv = (n) => root.style.getPropertyValue(n) || "-";
    const line = `hudfit top=${pv("--hud-z-top")} dock=${pv("--hud-z-dock")} drw=${pv("--dock-r-w")} sec=${rc(els.hudSectors)} pause=${rc(els.pausebtn)} cam=${rc(els.btnCam)}`;
    if (line !== _fitTrace) { _fitTrace = line; Log.debug("ui", line); }
  }
}

let _rpmPct = -1;
let _speedUnitEl = null;
function speedUnitEl() {
  if (_speedUnitEl) return _speedUnitEl;
  if (els.speed && els.speed.parentElement) _speedUnitEl = els.speed.parentElement.querySelector(".hud-unit");
  return _speedUnitEl;
}
function paintInstruments(player) {
  _redline = player.rpm > MAX_RPM * (_redline ? 0.89 : 0.92);
  if ((typeof HudElements === "undefined" || HudElements.isOn("gear")) && !document.body.classList.contains("cockpit-cam")) {
    const rpmFrac = clamp((player.rpm - IDLE_RPM) / (MAX_RPM - IDLE_RPM), 0, 1);
    hText(els.gear, "" + player.gear);
    const pct = Math.round(rpmFrac * 100);
    if (pct !== _rpmPct || !(pct >= 0)) { _rpmPct = pct; hStyle(els.rpmFill, "--rpm", (pct / 100).toFixed(2)); }
    hToggle(els.tach, "redline", _redline);
  }
  if (typeof HudElements !== "undefined" && !HudElements.isOn("speed")) return;
  const kph = Math.max(0, G.dashKph(player.speed));
  if (_ro && typeof _ro.spdPlate === "function") {
    const plate = _ro.spdPlate(kph);
    hText(els.speed, "" + plate.n);
    hText(speedUnitEl(), plate.unit);
  } else {
    hText(els.speed, "" + (typeof AppearanceOpts !== "undefined" ? AppearanceOpts.speed(kph) : Math.round(kph)));
  }
}

const ALONG = [null, "l", "r", "l r"];
function syncAlong() {
  const rr = G.raceRadio, side = rr && rr.trafficSide ? rr.trafficSide() : 0;
  hData(els.hud, "along", ALONG[side] || null);
}

let _paintSuspended = false;
function hudPaintHidden() {
  return document.hidden === true || document.visibilityState === "hidden"
    || !!(els.hud && els.hud.hidden) || document.body.classList.contains("hud-hidden");
}
function speakHud(player, cars, timeTrial) {
  if (_speak && G.state === "race" && sessionOf(timeTrial) === "race") {
    _speak.tick(typeof performance !== "undefined" ? performance.now() : Date.now(),
      { rank: player.retired ? 0 : player.rank, of: cars.length, best: player.best }, G.fmtTime);
  }
  if (!els.flag) return;
  const cn = G.cautionInfo ? G.cautionInfo() : null;
  const caution = !!(cn && (cn.level > 0 || cn.owed > 0));
  const txt = !caution ? "" : cn.level === 1 ? "YELLOW" + (cn.sector >= 0 ? " S" + (cn.sector + 1) : "")
    : cn.level === 2 ? "VSC" : cn.level === 4 ? "RED FLAG" : cn.level === 3 ? "SAFETY CAR" : "";
  if (caution) {
    if (txt !== _flagSaid) { _flagSaid = txt; if (txt) sayFlag(cn); }
  } else _flagSaid = "";
  const blueCar = _blueHeld = !caution && !timeTrial && _ro && G.track && G.state === "race"
    ? _ro.blueFlag(player, cars, G.track.total, G.vTop() * 0.26, _blueHeld) : null;
  if (blueCar) {
    const lapsUp = Math.round(((blueCar.prog || 0) - (player.prog || 0)) / G.track.total);
    if (blueCar !== _blueSaid || lapsUp !== _blueLaps) {
      _blueSaid = blueCar; _blueLaps = lapsUp;
      sayFlag(null, "BLUE FLAG, LET " + (blueCar.code || "THE LEADER") + " THROUGH");
    }
  }
  return { cn, caution, blueCar, txt };
}

function updateHud(force, dtMs) {
  if (!(Number.isFinite(dtMs) && dtMs > 0)) dtMs = 16.7;
  const player = G.player, cars = G.cars, timeTrial = G.timeTrial;
  if (!player) return;
  if (G.frozen && !force) return;
  const paint = !hudPaintHidden();
  if (_trace && G.track) _trace.sample(player, G.track.total);
  if (_ro && _ro.gaps) _ro.gaps.sample(G.cars, G.raceT || 0);
  if (!paint) {
    const modes = typeof CamModes !== "undefined" ? CamModes.CAM_MODES : null;
    const modeId = modes && modes[G.camMode] ? modes[G.camMode].id : "chase";
    if (typeof HudInputs !== "undefined") HudInputs.frame(G, player, dtMs, false,
      G.hudProfile === "minimal" || !!BCAM_IDS[modeId] || document.body.classList.contains("bc-on"));
    _paintSuspended = true;
    hudT -= dtMs;
    if (force || hudT <= 0) { hudT = HUD_TICK_MS; speakHud(player, cars, timeTrial); }
    return;
  }
  if (_paintSuspended) {
    _paintSuspended = false;
    invalidateFit(); _minimap.invalidate();
    force = true;
  }
  syncHudCamClasses();
  const skinRev = G.store ? G.store.rev : 0;
  if (player.team && (player.team.id !== _teamSkin || skinRev !== _teamSkinRev)) {
    _teamSkin = player.team.id; _teamSkinRev = skinRev;
    document.documentElement.dataset.team = _teamSkin;
    if (_skin) _skin.skinAccent(player.team, G);
  }
  const tick = force || !(hudT - dtMs > 0);
  if (!tick) paintInstruments(player);
  if (typeof HudInputs !== "undefined") HudInputs.frame(G, player, dtMs);
  hudT -= dtMs;
  if (!force && hudT > 0) return;
  hudT = HUD_TICK_MS;
  syncHudLayoutClasses();
  fitHud();
  syncAlong();
  const sess = sessionOf(timeTrial);
  hText(els.pos, sess === "tt" ? "TT" : player.retired ? "DNF" : sess === "quali" ? "Q"
    : sess === "practice" ? "PRAC" : (player.rank || player.gridPos || "-") + "/" + cars.length);
  const rank = sess !== "race" || player.retired ? 0 : (player.rank || 0);
  if (rank && _lastRank && rank !== _lastRank) { els.pos.dataset.delta = rank < _lastRank ? "up" : "down"; _posFlashT = 600; }
  else if (_posFlashT > 0 && (_posFlashT -= HUD_TICK_MS) <= 0) { _posFlashT = 0; delete els.pos.dataset.delta; }
  if (rank) _lastRank = rank;
  paintInstruments(player);
  hText(els.lap, Math.min(player.lap || 1, G.lapsTarget) + "/" + G.lapsTarget);
  if (typeof HudDamage !== "undefined") HudDamage.sync(player);
  const lapN = player.lap | 0;
  if (lapN !== _holdLap) {
    _holdOn = sess === "race" && lapN > _holdLap && lapN > 1 && player.lastLap > 0 && player.lastLap !== _holdPrev;
    _holdLap = lapN;
  }
  _holdPrev = player.lastLap;
  if (_holdOn && !(player.lapTime < 3)) _holdOn = false;
  hText(els.time, G.fmtTime(_holdOn ? player.lastLap : player.lapTime));
  hData(els.time, "hold", _holdOn ? (player.lastLap <= player.best ? "pb" : "lap") : null);
  hText(els.best, isFinite(player.best) ? G.fmtTime(player.best) : "-");
  hStyle(els.energy, "width", (player.energy * 100).toFixed(0) + "%");
  if (_ro) {
    const st = _ro.ersState(!!player.deploying, player.energy, _ePrev);
    _ePrev = player.energy;
    const en = _ro.energy(player.energy, st);
    hText(_rx.energyN, en.text);
    hData(_rx.energyBox, "ers", st === "idle" ? null : st);
    hAttr(_rx.energyBox, "aria-label", en.label);
    if (_rx.bb) {
      const bb = _ro.bbText(player.brakeBias, typeof SetupTune !== "undefined" ? SetupTune.BB_REF : 0.56);
      hText(_rx.bb, bb);
      hAttr(_rx.bb, "aria-label", hT("hud.brakeBias", { pct: bb.slice(3) }, "Brake bias {pct} front"));
    }
  }
  const spokenFlag = speakHud(player, cars, timeTrial);
  const tyres = G.tyres;
  const tyreOn = !!(tyres && tyres.on());
  hHidden(els.tyre, !tyreOn);
  let pitReadouts;
  if (tyreOn) {
    const spent = tyres.spent(player);
    hText(els.tyreCode, (player.tyre && player.tyre.code) || "-");
    hStyle(els.tyreFill, "width", (clamp(1 - spent, 0, 1) * 100).toFixed(0) + "%");
    hData(els.tyre, "wear", spent >= 1 ? "gone" : spent >= TYRE_WARN ? "warn" : "ok");
    const left = tyres.lapsLeft ? tyres.lapsLeft(player) : null;
    if (typeof HudStrategy !== "undefined" && (typeof HudElements === "undefined" || HudElements.isOn("strat"))) pitReadouts = { player, spent, left };
    const bar = els.tyreFill && els.tyreFill.parentNode;
    if (bar && bar.dataset) {
      const txt = left == null || spent >= 1 ? "" : left < 0.5 ? "<1L" : Math.min(99, Math.round(left)) + "L";
      if (bar.dataset.laps !== txt) bar.dataset.laps = txt;
    }
    const pit = G.pits;
    const state = pit ? (player.pitState === "lane" || player.pitState === "box" ? player.pitState
                         : pit.commitFrac(player) > 0 ? "commit" : "") : "";
    hData(els.tyre, "pit", state || null);
    if (state === "commit") hStyle(els.tyre, "--pit-commit", pit.commitFrac(player).toFixed(2));
    const c = pit && pit.cue(player);
    if (els.pitCue) {
      hHidden(els.pitCue, !c);
      if (c) {
        hText(els.pitCueText, c.text);
        hData(els.pitCue, "phase", c.phase);
        hStyle(els.pitCue, "--pit-dist", clamp(c.frac || 0, 0, 1).toFixed(2));
        if (_pitSideTrack !== G.track) { _pitSideTrack = G.track; _pitSide = (pit.info(player) || {}).side === -1 ? -1 : 1; }
        const exitPh = c.phase === "merge" || c.phase === "out" || c.phase === "served";
        hText(els.pitCueArrow, c.phase === "missed" ? "" : (exitPh ? -_pitSide : _pitSide) === -1 ? "\u25C0" : "\u25B6");
      }
    }
    if (els.workBtn) hHidden(els.workBtn, !(pit && pit.canWork && pit.canWork(player)) || !!(G.netPlay && G.netPlay.active && G.netPlay.active()));
    const practice = sessionOf(timeTrial) !== "race";
    const pl = (!practice && pit && pit.planInfo) ? pit.planInfo(player, pitReadouts) : null;
    if (pitReadouts) pitReadouts.plan = pl;
    if (els.plan) hText(els.plan, pl ? pl.text : "");
    hData(els.tyre, "plan", pl && pl.state || null);
    if (typeof HudTyres !== "undefined") {
      HudTyres.paint(els.tyre, tyres.info ? tyres.info(player) : null,
        { code: player.tyre && player.tyre.code, lapsLeft: spent >= 1 ? null : left, spent, plan: pl && pl.text });
    }
  } else {
    hHidden(els.pitCue, true);
    hHidden(els.workBtn, true);
  }
  hToggle(els.btnBoost, "on", player.boostOn);
  hStyle(els.btnBoost, "--e", (Math.round((player.energy || 0) * 20) / 20).toFixed(2));
  hToggle(els.btnOT, "on", player.otT > 0);
  hToggle(els.btnOT, "armed", player.otArmed && player.otT <= 0);
  const otMJ = typeof OvertakeMode !== "undefined" ? OvertakeMode.mj(player) : 0;
  const otHeld = otMJ > 0 && !player.otArmed && !(player.otT > 0);
  const caution = G.cautionInfo ? G.cautionInfo() : null;
  const gateOpen = typeof G.otEnabled === "function" ? !!G.otEnabled() : true;
  const otOff = G.state === "race" && !gateOpen && !(player.otT > 0);
  const ot = player.otT > 0 ? "ot-active" : otOff ? "ot-off" : player.otArmed || otHeld ? "ot-armed" : player.otEarned ? "ot-cool" : "ot-off";
  hClass(els.ot, ot);
  const leader = G.ranked && G.ranked[0];
  let otReason = "";
  if (otOff) {
    otReason = caution && caution.level >= 3 ? "caution"
      : caution && caution.lowGrip ? "low-grip"
      : leader && leader.lap > 1 ? "race-control"
      : leader ? "opening-lap" : "waiting-for-leader";
  }
  const mjTxt = otMJ.toFixed(2) + " MJ";
  const otReady = !!player.otArmed || otHeld;
  const otUnavailable = (!(player.otT > 0) && !otReady) || otOff;
  const otText = player.otT > 0 ? "OVERTAKE " + mjTxt
                : otOff ? (otReason === "caution" ? "OT · CAUTION"
                  : otReason === "low-grip" ? "OT · LOW GRIP"
                  : otReason === "opening-lap" ? "OT · LAP 1"
                  : otReason === "waiting-for-leader" ? "OT · GRID"
                  : "NO OVERTAKE")
                : otReady ? "OT READY " + mjTxt
                : player.otEarned ? "OT · NEXT LAP" : "OT · CLOSE IN";
  hText(els.ot, otText);
  hAttr(els.ot, "aria-label", player.otT > 0 ? hT("hud.overtake.active", { time: mjTxt }, "Overtake active, {time} left")
    : otOff ? (otReason === "caution" ? hT("hud.overtake.caution", null, "Overtake unavailable under caution")
      : otReason === "low-grip" ? hT("hud.overtake.lowGrip", null, "Overtake off in low grip conditions")
      : otReason === "opening-lap" ? hT("hud.overtake.openingLap", null, "Overtake unavailable on lap 1")
      : otReason === "waiting-for-leader" ? hT("hud.overtake.waitingLeader", null, "Overtake waiting for the leader")
      : hT("hud.overtake.unavailable", null, "Overtake unavailable"))
    : otReady ? hT("hud.overtake.ready", { time: mjTxt }, "Overtake ready, {time} — press to deploy")
    : player.otEarned ? hT("hud.overtake.earned", null, "Overtake earned — available from the start line")
    : hT("hud.overtake.pending", null, "Overtake unavailable — be within one second at the detection line"));
  hAttr(els.btnOT, "aria-disabled", otUnavailable ? "true" : "false");
  hAttr(els.btnOT, "data-state", otOff ? otReason : player.otT > 0 ? "active"
    : otReady ? "ready" : player.otEarned ? "earned" : "pending");
  hToggle(els.btnOT, "dead", otOff);
  const xOpen = (player.aeroX || 0) > 0.05;
  const dz = G.aeroZoneAhead ? G.aeroZoneAhead(player.s || 0) : Infinity;
  const noZones = !(G.aeroZones && G.aeroZones.length);
  const autoAero = G.raceAeroMode === "auto";
  hToggle(els.btnAero, "on", xOpen);
  hToggle(els.btnAero, "armed", !!player.xArmed && !xOpen);
  hToggle(els.btnAero, "dead", noZones);
  hAttr(els.btnAero, "aria-disabled", autoAero || noZones ? "true" : "false");
  hAttr(els.btnAero, "data-state", autoAero ? "automatic" : noZones ? "unavailable" : xOpen ? "active" : player.xArmed ? "armed" : "available");
  const aeroClass = noZones ? "ax-none" : xOpen ? "ax-open"
    : player.xArmed ? "ax-armed" : "ax-off";
  hClass(els.aero, aeroClass);
  const aeroText = autoAero ? (xOpen ? "AUTO STRAIGHT" : "AERO AUTO")
    : noZones ? "NO AERO ZONE"
    : xOpen ? "STRAIGHT MODE"
    : dz === 0 ? "AERO ZONE"
    : dz < 900 ? "AERO " + Math.round(dz) + "m"
    : "CORNER MODE";
  hText(els.aero, aeroText);
  hAttr(els.aero, "aria-label", autoAero ? (xOpen ? hT("hud.aero.autoStraight", null, "Automatic Straight Mode active") : hT("hud.aero.auto", null, "Active aero automatic"))
    : noZones ? hT("hud.aero.none", null, "No aero zone") : xOpen ? hT("hud.aero.straight", null, "Straight Mode active") : hT("hud.aero.manual", null, "Active aero manual"));
  if (timeTrial) {
    gapForm();
    const ghost = replayGhost();
    if (GhostShare.hasGuest() || Ghost.hasGhost()) {
      const ghostT = (player.lap | 0) >= 1 ? ghost.timeAt(player.s) : null;
      if (ghostT !== null) {
        const delta = player.lapTime - ghostT;
        hText(els.gapA, (GhostShare.hasGuest() ? "RIVAL GHOST " : "GHOST ") + signedFixed(delta) + "s");
        hStyle(els.gapA, "color", delta <= 0 ? "var(--faster)" : "var(--slower-ink)");
      } else {
        hText(els.gapA, player.lastLap ? "LAST " + G.fmtTime(player.lastLap) : "");
        hStyle(els.gapA, "color", "");
      }
    } else {
      hText(els.gapA, player.lastLap ? "LAST " + G.fmtTime(player.lastLap) : "");
      hStyle(els.gapA, "color", "");
    }
    hText(els.gapB, isFinite(G.ttRecord) ? "REC " + G.fmtTime(G.ttRecord) : "REC —");
  } else {
    const ranked = G.ranked;
    let i = (player.rank || 0) - 1;
    if (ranked[i] !== player) i = ranked.indexOf(player);
    const a = i > 0 ? ranked[i - 1] : null, b = i >= 0 ? ranked[i + 1] : null;
    const gap = gapForm();
    const vFloor = Math.max(player.speed, G.vTop() * 0.26);
    hText(els.gapA, a ? gapText(0, gap, "▲", a, a.prog - player.prog, vFloor) : "");
    hText(els.gapB, b ? gapText(1, gap, "▼", b, player.prog - b.prog, vFloor) : "");
    hStyle(els.gapA, "--gap-team", a ? teamCss(a) : "");
    hData(els.gapA, "tow", a && (player.towing || 0) > 0.5 ? "1" : null);
    hStyle(els.gapB, "--gap-team", b ? teamCss(b) : "");
    const win = (el, o) => {
      const w = o && G.pits && G.pits.windowOf ? G.pits.windowOf(o) : "";
      if (w) { if (el.dataset.pit !== w) el.dataset.pit = w; } else if (el.dataset.pit != null) delete el.dataset.pit;
    };
    win(els.gapA, a); win(els.gapB, b);
  }
  gapsEmptySync();
  announceLaneTick(document.documentElement, force);
  radioPaintedCollapseTick(document.documentElement, force);
  paintHudDelta(player, timeTrial);
  if (typeof HudRelative !== "undefined") HudRelative.tick(G, player);
  if (typeof HudStrategy !== "undefined") HudStrategy.tick(G, player, pitReadouts);
  if (els.hudSectors) {
    if (!_secRows) buildSecRows();
    const bests = G.sectorBests, field = G.fieldSectorBests;
    for (let i = 0; i < 3; i++) {
      const t = G.sectorLast[i];
      const pb = t != null && bests && t <= bests[i];
      const sb = pb && field && t <= field[i];
      const dHeld = _secDeltaT[i] > 0 && t != null;
      if (_secDeltaT[i] > 0) _secDeltaT[i] -= HUD_TICK_MS;
      const num = dHeld ? signedFixed(_secDelta[i]) : t == null ? "" : t >= 60 && G.fmtTime ? G.fmtTime(t) : t.toFixed(3);
      hText(_secRows[i], t == null ? "--" : (sb ? "★" : pb ? "▼" : "▲") + num);
      _secPrevBest[i] = bests ? bests[i] : Infinity;
      hStyle(_secRows[i], "color", t == null ? "" : sb ? "var(--sec-best)" : pb ? "var(--faster)" : "var(--sec-slow)");
      if (_ro && _ro.paintSectorRow) _ro.paintSectorRow(_secRows[i].parentElement, t, sb, pb);
      if (_secFlash[i] > 0) {
        _secFlash[i] = Math.max(0, _secFlash[i] - 0.1);
        hToggle(_secRows[i].parentElement, "sec-flash", _secFlash[i] > 0);
        hToggle(_secRows[i].parentElement, "sec-flash-pb", _secFlash[i] > 0 && pb);
        hToggle(_secRows[i].parentElement, "sec-flash-slow", _secFlash[i] > 0 && !pb && t != null);
      } else {
        hToggle(_secRows[i].parentElement, "sec-flash", false);
        hToggle(_secRows[i].parentElement, "sec-flash-pb", false);
        hToggle(_secRows[i].parentElement, "sec-flash-slow", false);
      }
    }
  }
  if (els.hudLimits) {
    const player = G.player;
    const cw = player ? (player.cutWarn | 0) : 0;
    const pen = player ? Math.round(player.penalty || 0) : 0;
    if (_limitsDots == null) _limitsDots = els.hudLimits.querySelector("span");
    if (cw > 0 || pen > 0) {
      if (els.hudLimits.hidden) els.hudLimits.hidden = false;
      const shown = Math.min(cw, 4);
      hText(_limitsDots, "\u25cf".repeat(shown) + "\u25cb".repeat(4 - shown) + (pen > 0 ? " +" + pen + "s" : ""));
      hToggle(els.hudLimits, "limits-warn", (cw >= 2 || pen > 0) && cw < 3);
      hToggle(els.hudLimits, "limits-hot", cw >= 3);
    } else if (!els.hudLimits.hidden && !document.body.hasAttribute("data-hud-arrange")) {
      els.hudLimits.hidden = true;
      hToggle(els.hudLimits, "limits-warn", false);
      hToggle(els.hudLimits, "limits-hot", false);
    }
  }
  if (els.flag) {
    const { cn, caution, blueCar, txt } = spokenFlag;
    const owed = !!(cn && cn.owed > 0);
    const show = caution || !!blueCar;
    if (caution) {
      const owe = owed ? "LET " + (cn.owedCode || "THE CAR") + (cn.owed > 1 ? " +" + (cn.owed - 1) : "") + " BY " + Math.ceil(cn.owedT) + "s" : "";
      hText(els.flag, owe ? (txt === "SAFETY CAR" ? "SC" : txt) + (txt ? " \u00b7 " : "") + owe : txt);
      hClass(els.flag, cn.level === 4 ? "flag-red" : cn.level === 3 ? "flag-sc" : cn.level === 2 ? "flag-vsc" : "flag-yellow");
    }
    if (blueCar) {
      hText(els.flag, "BLUE FLAG " + (blueCar.code || ""));
      hClass(els.flag, "");
    }
    if (_blue !== !!blueCar) { _blue = !!blueCar; hData(els.flag, "flag", _blue ? "blue" : null); }
    if (_ro && _ro.paintFlag) _ro.paintFlag(els.flag, show ? (caution ? { caution: cn } : blueCar ? { blue: true } : null) : null);
    if (_flagShown !== show) { _flagShown = show; els.flag.hidden = !show; if (_invalidateFit) _invalidateFit(); }
  }
  syncComputedRootVars();
  phoneFitStampSync(+document.documentElement.style.getPropertyValue("--hud-scale") || _cssScale);
  _minimap.draw();
}

function sayFlag(cn, words) {
  const said = "RACE CONTROL: " + (words ? words : cn.level === 1 ? "YELLOW FLAG" + (cn.sector >= 0 ? ", SECTOR " + (cn.sector + 1) : "")
    : cn.level === 2 ? "VIRTUAL SAFETY CAR" : cn.level === 4 ? "RED FLAG" : "SAFETY CAR");
  if (typeof LiveRegion !== "undefined") LiveRegion.say(said, "flag");
  else if (els.announceLive) els.announceLive.textContent = said;
}

function invalidateMap() { _minimap.invalidate(); }

let _pitSideTrack = null, _pitSide = 1;
function resetRace() {
  _pitSideTrack = null; _pitSide = 1;
  if (typeof HudInputs !== "undefined" && HudInputs.reset) HudInputs.reset();
  if (typeof Captions !== "undefined") Captions.clear();
  _lastRank = 0; _posFlashT = 0; if (els.pos) delete els.pos.dataset.delta;
  _holdLap = 0; _holdPrev = 0; _holdOn = false; _secPrevBest = [Infinity, Infinity, Infinity]; _secDeltaT = [0, 0, 0];
  _ePrev = NaN; _blueSaid = null; _blueLaps = 0;
  for (const el of [els.gapA, els.gapB]) {
    if (!el) continue;
    hStyle(el, "color", ""); hStyle(el, "--gap-team", ""); hData(el, "tow", null);
    if (el.dataset && el.dataset.pit != null) delete el.dataset.pit;
  }
  if (_trace) _trace.reset();
  if (_speak) _speak.reset();
  if (typeof LiveRegion !== "undefined") LiveRegion.reset();
}
function invalidateFit() {
  _fitKey = ""; _fitRetry = 0; _dockBtns = null;
  _fitPending = true;
  invalidateLaneRects();
  if (!_hudTop || hudPaintHidden()) return;
  const root = document.documentElement;
  hStyle(root, "--hud-fit-stamp", "");
  _fitStamped = false;
  radioTopSlot(root, document.body.classList.contains("hud-prof-broadcast"));
  radioPaintedCollapse(root);
  mirrorClear(root);
  if (typeof HudLayout !== "undefined" && HudLayout.clearReadouts) HudLayout.clearReadouts();
}
_invalidateFit = invalidateFit;
if (typeof document !== "undefined" && document.fonts && document.fonts.ready && typeof document.fonts.ready.then === "function") {
  const fontsChanged = () => { _gapW[0] = _gapW[1] = 0; invalidateFit(); };
  document.fonts.ready.then(fontsChanged, () => {});
  if (document.fonts.addEventListener) document.fonts.addEventListener("loadingdone", fontsChanged);
}
function syncPhoneFit() {
  if (hudPaintHidden()) return false;
  syncComputedRootVars();
  phoneFitStampSync(+document.documentElement.style.getPropertyValue("--hud-scale") || _cssScale, true);
  const stamp = document.documentElement.style.getPropertyValue("--hud-fit-stamp");
  return !phonePaintedClash() && /^\d+$/.test(stamp);
}
_syncPhoneFit = syncPhoneFit;
return {
  updateHud, invalidateMap, flashSector, resetRace, invalidateFit, syncPhoneFit,
  laneRectMisses, resetLaneRectMisses,
};
}

return {
  create,
  invalidateFit: () => { if (_invalidateFit) _invalidateFit(); },
  syncPhoneFit: () => (_syncPhoneFit ? _syncPhoneFit() : false),
  vp: () => [vpW(), vpH()],
  vpKey: () => vpW() + "x" + vpH(),
};
})();
Object.freeze(GameHud);
