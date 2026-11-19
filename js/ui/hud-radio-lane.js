const HudRadioLane = (function () {
  "use strict";

function create(G, deps) {
const { vpW, vpH, hStyle, hUnstyle, hToggle, fitKey, top, docks } = deps;
const els = G.els;
const RADIO_TOP_MIN = 160, RADIO_TOP_GAP = 8;
const LANE_ROWS = 96;
let _laneKey = "", _laneWait = 0, _laneRects = null, _laneSafe = null, _laneRectMisses = 0;
function invalidateLaneRects() {
  _laneRects = null;
  _laneSafe = null;
  _laneKey = "";
  _laneWait = 0;
}
function dropLaneRects() { _laneRects = null; _laneSafe = null; }
function laneRect(el) {
  if (!el || typeof el.getBoundingClientRect !== "function") return null;
  if (!_laneRects) _laneRects = new Map();
  else if (_laneRects.has(el)) return _laneRects.get(el);
  _laneRectMisses++;
  const r = el.getBoundingClientRect();
  _laneRects.set(el, r);
  return r;
}
function laneSafeInsets(root) {
  if (_laneSafe) return _laneSafe;
  let sal = 0, sar = 0;
  if (typeof getComputedStyle === "function" && root) {
    try {
      const cs = getComputedStyle(root);
      sal = parseFloat(cs.getPropertyValue("--sal")) || 0;
      sar = parseFloat(cs.getPropertyValue("--sar")) || 0;
    } catch (_) {  }
  }
  return (_laneSafe = { sal, sar });
}
const radioPlaced = () => { const b = document.body; return !!(b && b.hasAttribute && b.hasAttribute("data-radio-placed")); };
function announceLane(root, paintedBand) {
  if (radioPlaced()) { const a = document.getElementById("announce"); if (a && a.toggleAttribute) a.toggleAttribute("data-lane-collapsed", false); return; }
  const t = top() ? laneRect(top()) : null;
  const W = vpW(), H = vpH() || 0;
  const y0 = t ? t.bottom : 0, mid = W / 2;
  const under = (el) => { if (!el || el.hidden) return 0; const r = laneRect(el); return r && r.width && r.height ? r.bottom : 0; };
  const bandTop = paintedBand ? paintedBand.top : Math.max(y0, under(document.getElementById("hud-mirror")), under(document.getElementById("hud-mirror-chip")), under(els.flag)) + RADIO_TOP_GAP, bandBot = paintedBand ? paintedBand.bottom : bandTop + LANE_ROWS;
  const { sal, sar } = laneSafeInsets(root);
  let left = sal, right = W - sar, any = false;
  const clip = (r, counts) => {
    if (!r || !r.width || !r.height) return;
    if (counts && r.top < H && r.bottom > y0) any = true;
    if (r.top >= bandBot || r.bottom <= bandTop) return;
    if ((r.left + r.right) / 2 >= mid) right = Math.min(right, r.left);
    else left = Math.max(left, r.right);
  };
  for (const d of docks()) if (d) for (const g of d.children) clip(laneRect(g), true);
  const sec = els.hudSectors;
  const secR = sec && !sec.hidden ? laneRect(sec) : null;
  if (secR && secR.width && secR.height && (!paintedBand || (secR.top < bandBot && secR.bottom > bandTop))) right = Math.min(right, secR.left);
  clip(els.minimap && !els.minimap.hidden ? laneRect(els.minimap) : null, false);
  const gaps = document.querySelector(".hud-gaps");
  clip(gaps && !gaps.hidden ? laneRect(gaps) : null, false);
  if (els.tyre && !els.tyre.hidden && els.tyre.getBoundingClientRect) clip(laneRect(els.tyre), false);
  if (!document.body.classList.contains("desktop") && W > H) {
    const leftEnd = Math.min(right, W * 0.4), rightStart = Math.max(left, W * 0.6);
    const leftW = leftEnd - left, rightW = right - rightStart;
    if (Math.max(leftW, rightW) >= RADIO_TOP_MIN + RADIO_TOP_GAP * 2) {
      if (leftW >= rightW) right = leftEnd; else left = rightStart;
    }
  }
  const x = left + RADIO_TOP_GAP, w = right - RADIO_TOP_GAP - x;
  const on = any && w >= RADIO_UNDER_MIN;
  const collapsed = !on && any && ((secR && secR.width) || w > 0);
  if (on) {
    hStyle(root, "--announce-lane-x", x.toFixed(1) + "px");
    hStyle(root, "--announce-lane-shift", "0%");
    hStyle(root, "--announce-lane-w", w.toFixed(1) + "px");
  } else if (collapsed) {
    hStyle(root, "--announce-lane-x", x.toFixed(1) + "px");
    hStyle(root, "--announce-lane-shift", "0%");
    hStyle(root, "--announce-lane-w", "0px");
  } else for (const k of ["--announce-lane-x", "--announce-lane-shift", "--announce-lane-w"]) hUnstyle(root, k);
  const annEl = typeof document !== "undefined" ? document.getElementById("announce") : null;
  if (annEl && annEl.toggleAttribute) annEl.toggleAttribute("data-lane-collapsed", !!collapsed);
}
function announceLaneLayoutKey() {
  const ann = typeof document !== "undefined" ? document.getElementById("announce") : null;
  const gapBit = (el) => (el && (el.textContent || "").length ? "1" : "0");
  const hid = (el) => (el && !el.hidden ? "1" : "0");
  let k = vpW() + "x" + vpH() + "|" + fitKey() + "|" + document.body.className + "|"
    + (els.hudSectors && els.hudSectors.hidden ? "s" : "S")
    + (els.minimap && els.minimap.hidden ? "m" : "M")
    + gapBit(els.gapA) + gapBit(els.gapB)
    + (ann && !ann.hidden ? "A" : "a")
    + hid(els.flag) + hid(els.hudLimits) + hid(els.tyre);
  if (els.tyre && els.tyre.style) k += "|" + els.tyre.style.getPropertyValue("margin-left") + "," + els.tyre.style.getPropertyValue("margin-top");
  for (const id of ["hud-rel", "hud-strat", "hud-inputs", "hud-damage", "hud-mirror", "hud-mirror-chip"]) {
    const el = typeof document !== "undefined" ? document.getElementById(id) : null;
    k += hid(el);
  }
  for (const d of docks()) if (d) for (const g of d.children) k += g.hidden ? "h" : "v";
  return k;
}
function announceLaneTick(root, force) {
  const k = announceLaneLayoutKey();
  if (!force && k === _laneKey && --_laneWait > 0) return;
  if (force || k !== _laneKey) { _laneRects = null; _laneSafe = null; }
  _laneKey = k; _laneWait = 30;
  announceLane(root);
}
function radioTopSlot(root, bcast) {
  const ann = document.getElementById("announce");
  hUnstyle(ann, "--hud-clear-x"); hUnstyle(ann, "--hud-clear-y");
  hUnstyle(ann, "--announce-lane-w");
  const t = top() ? top().getBoundingClientRect() : null;
  void bcast;
  announceLane(root);
  if (radioPlaced()) { hToggle(document.body, "hud-radio-top", false); document.body.removeAttribute("data-radio-corner"); return; }
  let right = vpW() - laneSafeInsets(root).sar - 10;
  const x = t ? t.right + RADIO_TOP_GAP : 0;
  const bound = (r, needPast, bot) => {
    if (!r || !r.width || !r.height || !(r.top < bot && r.bottom > t.top)) return;
    if (needPast ? r.left > t.right : r.right > x) right = Math.min(right, r.left);
  };
  for (const el of [els.btnCam, els.pausebtn]) bound(t && el && !el.hidden ? el.getBoundingClientRect() : null, true, t ? t.bottom : 0);
  if (t) {
    const wrapBot = t.bottom + t.height;
    for (const d of docks()) if (d) for (const g of d.children) bound(g.getBoundingClientRect(), false, wrapBot);
    const sec = els.hudSectors;
    bound(sec && !sec.hidden ? sec.getBoundingClientRect() : null, true, wrapBot);
  }
  const lit = !!(t && t.width && t.height);
  let slot = lit && right - RADIO_TOP_GAP - x >= RADIO_TOP_MIN
    ? { x, y: t.top, w: right - RADIO_TOP_GAP - x, h: t.height } : null;
  if (!slot && lit) slot = radioUnderRight(t);
  const corner = !!(slot && slot.corner), b = document.body;
  hToggle(b, "hud-radio-top", !!slot && !corner);
  if (b.toggleAttribute && b.hasAttribute("data-radio-corner") !== corner) b.toggleAttribute("data-radio-corner", corner);
  if (!slot) return;
  if (ann && ann.toggleAttribute) ann.toggleAttribute("data-lane-collapsed", false);
  if (slot.corner) hStyle(root, "--radio-top-r", (vpW() - slot.x - slot.w).toFixed(1) + "px");
  const a = els.announce, as = a && a.style && a.hasAttribute && a.hasAttribute("data-hl") ? +a.style.getPropertyValue("--hl-s") || 1 : 1;
  hStyle(root, "--radio-top-x", slot.x.toFixed(1) + "px");
  hStyle(root, "--radio-top-y", slot.y.toFixed(1) + "px");
  hStyle(root, "--radio-top-w", (slot.w / as).toFixed(1) + "px");
  hStyle(root, "--radio-top-h", (slot.h / as).toFixed(1) + "px");
}
const RADIO_UNDER_H = 36, RADIO_UNDER_MAXW = 260, RADIO_UNDER_GAP = 4, RADIO_UNDER_MIN = 96;
function radioUnderRight(t) {
  let R = vpW() - laneSafeInsets(document.documentElement).sar - 10, L = Math.max(t.left, vpW() / 2 + RADIO_TOP_GAP);
  for (const el of [els.btnCam, els.pausebtn, els.hudSectors]) { if (!el || el.hidden) continue;
    const r = el.getBoundingClientRect(); if (r.width && r.left > t.left + t.width / 2) R = Math.min(R, r.left); }
  R -= RADIO_TOP_GAP;
  const y = t.bottom + RADIO_UNDER_GAP, bot = y + RADIO_UNDER_H;
  const obst = [document.getElementById("hud-mirror"), document.getElementById("hud-mirror-chip"),
    els.gapA ? els.gapA.parentNode : null, els.flag, els.hudLimits, els.tyre];
  for (const d of docks()) if (d) for (const g of d.children) obst.push(g);
  for (const el of obst) {
    if (!el || el.hidden || !el.getBoundingClientRect) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.top >= bot || r.bottom <= y) continue;
    if ((r.left + r.right) / 2 >= R) R = Math.min(R, r.left - RADIO_TOP_GAP);
    else L = Math.max(L, r.right + RADIO_TOP_GAP);
  }
  const w = Math.min(R - L, RADIO_UNDER_MAXW);
  return w >= RADIO_UNDER_MIN ? { x: R - w, y, w, h: RADIO_UNDER_H, corner: true } : null;
}
function radioPaintedCollapse(root) {
  if (radioPlaced()) return;
  const annPaint = typeof document !== "undefined" ? document.getElementById("announce") : null;
  if (annPaint && annPaint.hasAttribute("data-lane-collapsed") && !document.body.classList.contains("hud-radio-top")
    && root.style.getPropertyValue("--announce-lane-w") === "0px" && root.style.getPropertyValue("--announce-lane-shift") === "0%") return;
  if (annPaint && !annPaint.hidden) {
    let a = annPaint.getBoundingClientRect();
    const hit = (el) => {
      if (!el || el.hidden) return false;
      const r = el.getBoundingClientRect();
      return !!(a.width > 0 && r.width > 0
        && r.left < a.right - 0.5 && a.left < r.right - 0.5
        && r.top < a.bottom - 0.5 && a.top < r.bottom - 0.5);
    };
    const tower = top() || (typeof document !== "undefined" ? document.querySelector(".hud-top") : null);
    const gear = typeof document !== "undefined" ? document.getElementById("hud-gearbox") : null;
    const speed = typeof document !== "undefined" ? document.getElementById("hud-speed") : null;
    const controls = [els.btnCam, els.pausebtn];
    for (const dock of docks()) if (dock) controls.push(...dock.children);
    if (controls.some(hit)) {
      hToggle(document.body, "hud-radio-top", false); document.body.removeAttribute("data-radio-corner");
      for (const prop of ["--announce-lane-w", "--hud-clear-x", "--hud-clear-y"]) hUnstyle(annPaint, prop);
      dropLaneRects(); announceLane(root, a);
      a = annPaint.getBoundingClientRect();
    }
    if (controls.some(hit) || hit(els.hudSectors) || hit(tower) || hit(gear) || hit(speed) || hit(els.flag) || hit(els.hudLimits) || hit(els.tyre)) {
      hToggle(document.body, "hud-radio-top", false);
      if (document.body.removeAttribute) document.body.removeAttribute("data-radio-corner");
      const salPx = (() => { try { return parseFloat(getComputedStyle(root).getPropertyValue("--sal")) || 0; } catch (_) { return 0; } })();
      hStyle(root, "--announce-lane-x", (salPx + RADIO_TOP_GAP).toFixed(1) + "px");
      hStyle(root, "--announce-lane-shift", "0%");
      hStyle(root, "--announce-lane-w", "0px");
      if (annPaint.toggleAttribute) annPaint.toggleAttribute("data-lane-collapsed", true);
      void annPaint.offsetHeight;
    }
  }
}
let _rpcKey = "", _rpcWait = 0;
function radioPaintedKey(root) {
  const a = document.getElementById("announce");
  if (!a || a.hidden) return "";
  const v = (n) => root.style.getPropertyValue(n);
  return fitKey() + "|" + _laneKey + "|" + v("--announce-lane-w") + v("--announce-lane-x") + v("--announce-lane-shift")
    + "|" + a.className + (a.hasAttribute("data-lane-collapsed") ? "c" : "") + "|" + a.textContent + "|" + document.body.className;
}
function radioPaintedCollapseTick(root, force) {
  const k = radioPaintedKey(root);
  if (!force && k && k === _rpcKey && --_rpcWait > 0) return;
  radioPaintedCollapse(root);
  _rpcKey = radioPaintedKey(root); _rpcWait = 30;
}
return {
  invalidateLaneRects, dropLaneRects, announceLane, announceLaneTick, radioTopSlot, radioPaintedCollapse, radioPaintedKey, radioPaintedCollapseTick,
  laneRectMisses: () => _laneRectMisses,
  resetLaneRectMisses: () => { _laneRectMisses = 0; },
};
}

return { create };
})();
Object.freeze(HudRadioLane);
