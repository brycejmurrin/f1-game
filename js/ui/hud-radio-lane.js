/* Apex 26 — HUD RADIO LANE: where the radio card (#announce) sits during a race —
   the top-row slot right of the tower, the top-right corner by CAM, or the dock
   lane hanging under the tower — and the painted guarantee that collapses it
   off the sector plate, the tower and SPEED/GEAR. Moved out of hud.js whole
   (#3261); GameHud owns the tick and the fit and calls these from both.
   Writes CSS custom properties and body classes only; reads nothing back into
   the game. */
const HudRadioLane = (function () {
  "use strict";

/** G = game.js's façade; deps = hud.js helpers it shares: vpW, vpH, hStyle,
 *  hUnstyle, hToggle, and three getters for what the fit moves — fitKey (the
 *  live fit key), top (.hud-top) and docks ([left, right], mirror-aware). */
function create(G, deps) {
const { vpW, vpH, hStyle, hUnstyle, hToggle, fitKey, top, docks } = deps;
const els = G.els;
// THE RADIO CARD'S TOP-ROW SLOT: right of the timing tower, left of the cam /
// pause buttons, in the tower's own row — off the road and clear of the mirror
// under the tower (a phone report: the card beside the mirror still sat on the
// view). The strip ends at whichever button shares the tower's rows. Published
// in SCREEN px with body.hud-radio-top — css/hud.css divides by the card's own
// zoom — and only where a shrunk card fits; otherwise the card keeps its slot
// under the tower (beside the mirror, js/render/shared/mirror-pass.js, or
// below it). Never in BROADCAST, whose tower is top-left and whose mirror
// owns the top-centre.
// THE TOUCH DOCKS BOUND IT TOO. A dock column reaches the tower's rows on a
// landscape phone (the cockpit's right dock put BOOST at y 72 on 844x390), and
// the card was published straight across it (survey 2026-10-04: #announce
// [500,66 223x65] over #btn-boost [603,72]). Every dock group that shares the
// card's rows and reaches past the slot's start ends the strip at its left
// edge; one that already covers the start leaves no slot at all. Run after the
// dock cap is written, so the groups are measured at the zoom they paint at.
// Narrow top slots wrap radio calls over too many lines; use the wider lane.
const RADIO_TOP_MIN = 160, RADIO_TOP_GAP = 8;
// THE DOCK LANE: where the top-row slot does not fit, the card hangs under the
// tower. A long message at a centred max-width reached whichever dock sat
// closer to the middle (tilt auto, 852×393: pedals on the left, BOOST on the
// right — a symmetric half from the pedals still covered BOOST). --announce-lane-x
// (screen px) / -shift / -w are that gap; css/hud.css divides x by this
// element's --hud-z (a calc embedding var(--hud-z) on :root is invalid there
// and left fell back to 50% with transform none — card left-edge at centre,
// hud-layout CI: #announce+btn-boost at x426 on 852). #hud-sectors sits in
// that same hanging band on touch (small-landscape: #hud-sectors+#announce)
// so it ends the strip too; the map and the gaps chip start it when a dropped
// or low strip shares the hanging card's rows (hud-layout: .hud-gaps+#announce).
// They do not count as a dock, so empty docks (desktop) still unpublish the
// lane. Run again after this tick's gap strings (updateHud): fitHud
// saw the previous spelling, and hud-layout probes on that same tick.
// ONLY CHROME IN THE CARD'S OWN ROWS CLIPS IT. The hanging card starts under
// the mirror (its chip, or the tower when neither shows) and is a few lines
// tall (LANE_ROWS). Clipping the lane to every dock group wherever it sat —
// the steer buttons and TILT's pedals on the bottom edge — and to the map and
// gaps even when they ended above the card pinned the card at the steer
// column's right edge, mid-view over the cars ahead (phone report 2026-10-10,
// cockpit 932x430: #announce at x≈227 under the halo, 160px above the buttons
// it was clearing). A dock group still PUBLISHES the lane from anywhere in the
// viewport (desktop's empty docks never do); it bounds the lane only from the
// card's rows, as the map, the gaps chip and the opt-in readouts do.
const LANE_ROWS = 96;
// PERF (#1723 / ledger PERF-GAMEPLAY-HITCHES-2026-10-14): announceLane's
// getBoundingClientRect reads were ~21% of spike CPU at 4× throttle. Cache the
// clipper rects; invalidate only on a real layout change (resize / orientation,
// HUD scale / style / camera set, HudLayout / MOVE&SIZE → invalidateFit, fitHud
// full pass, announce show/hide or content, clipper hide flags, gaps empty↔on).
// Gap DIGIT rolloff must not re-key the memo — that was the periodic hitch.
let _laneKey = "", _laneWait = 0, _laneRects = null, _laneSafe = null, _laneRectMisses = 0;
function invalidateLaneRects() {
  _laneRects = null;
  _laneSafe = null;
  _laneKey = "";
  _laneWait = 0;
}
// fitHud's full pass: the boxes moved, the lane key did not.
function dropLaneRects() { _laneRects = null; _laneSafe = null; }
function laneRect(el) {
  if (!el || typeof el.getBoundingClientRect !== "function") return null;
  if (!_laneRects) _laneRects = new Map();
  else if (_laneRects.has(el)) return _laneRects.get(el);
  _laneRectMisses++;   // cache miss → real getBoundingClientRect (test/probe surface)
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
    } catch (_) { /* mini-dom / detached root */ }
  }
  return (_laneSafe = { sal, sar });
}
// A card the player MOVED (MOVE & SIZE / ARRANGE HUD x or y) is out of the slots and the lane:
// css/hud.css anchors it at a fixed point so the offset is where it sits (body[data-radio-placed]).
const radioPlaced = () => { const b = document.body; return !!(b && b.hasAttribute && b.hasAttribute("data-radio-placed")); };
function announceLane(root) {
  if (radioPlaced()) { const a = document.getElementById("announce"); if (a && a.toggleAttribute) a.toggleAttribute("data-lane-collapsed", false); return; }
  const t = top() ? laneRect(top()) : null;
  const W = vpW(), H = vpH() || 0;
  const y0 = t ? t.bottom : 0, mid = W / 2;
  const under = (el) => { if (!el || el.hidden) return 0; const r = laneRect(el); return r && r.width && r.height ? r.bottom : 0; };
  // Under a caution the card steps below the flag chip too (css/hud.css: the caution rules).
  const bandTop = Math.max(y0, under(document.getElementById("hud-mirror")), under(document.getElementById("hud-mirror-chip")), under(els.flag)) + RADIO_TOP_GAP, bandBot = bandTop + LANE_ROWS;
  const { sal, sar } = laneSafeInsets(root);
  let left = sal, right = W - sar, any = false;
  const clip = (r, counts) => {
    if (!r || !r.width || !r.height) return;
    if (counts && r.top < H && r.bottom > y0) any = true;   // a lit dock publishes the lane from anywhere below the tower
    if (r.top >= bandBot || r.bottom <= bandTop) return;    // but only the card's rows bound it
    if ((r.left + r.right) / 2 >= mid) right = Math.min(right, r.left);
    else left = Math.max(left, r.right);
  };
  for (const d of docks()) if (d) for (const g of d.children) clip(laneRect(g), true);
  // SECTORS always end the RIGHT of the lane. After #1191 the plate takes
  // --dock-r-w on buttons (and #1212 on every phone steer); a wide wrap-reverse
  // dock can push its centre left of mid, so the mid-based clip() above would
  // treat it as LEFT chrome and leave --announce-lane-w spanning into S1–S3
  // (Pages gate: #hud-sectors+#announce on notched-landscape buttons).
  const sec = els.hudSectors;
  const secR = sec && !sec.hidden ? laneRect(sec) : null;
  // Clip the RIGHT to sectors without setting `any` — desktop empty docks must
  // still clear the lane vars (CSS falls back to centred). Phone docks set
  // `any` via the group loop above.
  if (secR && secR.width && secR.height) right = Math.min(right, secR.left);
  clip(els.minimap && !els.minimap.hidden ? laneRect(els.minimap) : null, false);
  const gaps = document.querySelector(".hud-gaps");
  clip(gaps && !gaps.hidden ? laneRect(gaps) : null, false);
  // Primary tyre state bounds this lane. Optional panels are placed after the
  // radio card; letting them clip it first can hide an urgent pit call.
  if (els.tyre && !els.tyre.hidden && els.tyre.getBoundingClientRect) clip(laneRect(els.tyre), false);
  const x = left + RADIO_TOP_GAP, w = right - RADIO_TOP_GAP - x;
  // A lane under one short word pair wraps the card into a sliver with its text cut
  // (UI-HUNT-2-HUD: ~105 px): collapse it, and HudLayout.clearReadouts reopens the
  // card at full width in a free slot (or radioTopSlot's corner takes it).
  const on = any && w >= RADIO_UNDER_MIN;
  const collapsed = !on && any && ((secR && secR.width) || w > 0);
  if (on) {
    hStyle(root, "--announce-lane-x", x.toFixed(1) + "px");
    hStyle(root, "--announce-lane-shift", "0%");
    hStyle(root, "--announce-lane-w", w.toFixed(1) + "px");
  } else if (collapsed) {
    // Phone docks lit but S3 ate the gap (large --dock-r-w): keep the left pin
    // + zero width so max-width:0 collapses the card. Clearing the vars
    // restores left:50% and drops the radio onto the sector plate (oversize
    // CI: #hud-sectors+#announce). data-lane-collapsed hard-collapses the flex
    // plate (min-content from #announce-num otherwise keeps a box).
    hStyle(root, "--announce-lane-x", x.toFixed(1) + "px");
    hStyle(root, "--announce-lane-shift", "0%");
    hStyle(root, "--announce-lane-w", "0px");
  } else for (const k of ["--announce-lane-x", "--announce-lane-shift", "--announce-lane-w"]) hUnstyle(root, k);
  const annEl = typeof document !== "undefined" ? document.getElementById("announce") : null;
  if (annEl && annEl.toggleAttribute) annEl.toggleAttribute("data-lane-collapsed", !!collapsed);
}
// Layout-free key for the lane memo. Gaps are empty/non-empty only — digit
// rolloff used to re-key every tick and force a full rect pass (#1723).
function announceLaneLayoutKey() {
  const ann = typeof document !== "undefined" ? document.getElementById("announce") : null;
  const gapBit = (el) => (el && (el.textContent || "").length ? "1" : "0");
  const hid = (el) => (el && !el.hidden ? "1" : "0");
  // Announce: show/hide only. Content length does not move the clippers the
  // lane reads (radioPaintedCollapse owns painted size); putting length in the
  // key re-measured every radio line and defeated the cache.
  let k = vpW() + "x" + vpH() + "|" + fitKey() + "|" + document.body.className + "|"
    + (els.hudSectors && els.hudSectors.hidden ? "s" : "S")
    + (els.minimap && els.minimap.hidden ? "m" : "M")
    + gapBit(els.gapA) + gapBit(els.gapB)
    + (ann && !ann.hidden ? "A" : "a")
    + hid(els.flag) + hid(els.hudLimits) + hid(els.tyre);
  // Delayed primary packing moves TYRES without a setting or visibility change.
  if (els.tyre && els.tyre.style) k += "|" + els.tyre.style.getPropertyValue("margin-left") + "," + els.tyre.style.getPropertyValue("margin-top");
  for (const id of ["hud-rel", "hud-strat", "hud-inputs", "hud-damage", "hud-mirror", "hud-mirror-chip"]) {
    const el = typeof document !== "undefined" ? document.getElementById(id) : null;
    k += hid(el);
  }
  for (const d of docks()) if (d) for (const g of d.children) k += g.hidden ? "h" : "v";
  return k;
}
function announceLaneTick(root, force) {
  // Use the cached viewport (vpW/vpH), not window.innerWidth — a per-tick live
  // read defeats 5-perf F2 and forces layout on Android (#1395).
  const k = announceLaneLayoutKey();
  // A forced refresh (jump / camera / probes) re-clips: it measures on the same tick.
  if (!force && k === _laneKey && --_laneWait > 0) return;
  // Key change or force → drop the rect cache. Same-key 3 s backstop keeps it
  // (re-apply CSS vars from cached rects; 0 getBoundingClientRect).
  if (force || k !== _laneKey) { _laneRects = null; _laneSafe = null; }
  _laneKey = k; _laneWait = 30;
  announceLane(root);
}
function radioTopSlot(root, bcast) {
  // Clearance belongs to the previous lane. Measure this lane before applying
  // its new correction, or a stale translated card can falsely collapse it.
  const ann = document.getElementById("announce");
  hUnstyle(ann, "--hud-clear-x"); hUnstyle(ann, "--hud-clear-y");
  hUnstyle(ann, "--announce-lane-w");
  // Every profile, including BROADCAST, can use the tower's free radio slots.
  const t = top() ? top().getBoundingClientRect() : null;
  void bcast;
  announceLane(root);
  if (radioPlaced()) { hToggle(document.body, "hud-radio-top", false); document.body.removeAttribute("data-radio-corner"); return; }
  let right = window.innerWidth - 10;
  const x = t ? t.right + RADIO_TOP_GAP : 0;
  // Pause / cam share the tower's rows. Dock groups bound a wrapping card
  // (min-height is the tower; a long line grows about that far). Remaining
  // viewport height would also catch TILT's bottom taps and kill the slot,
  // parking the card in the lane over the map (hud-layout: .hud-gaps+#announce).
  // Sectors share the wrapping band — they sit in the tower's rows on a phone.
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
  // The corner is an ATTRIBUTE, not hud-radio-top: body.className keys the fit/lane/root-var
  // memos, and a class flipping between passes broke hud-fit-idempotent (--dock-r-w).
  const corner = !!(slot && slot.corner), b = document.body;
  hToggle(b, "hud-radio-top", !!slot && !corner);
  if (b.toggleAttribute && b.hasAttribute("data-radio-corner") !== corner) b.toggleAttribute("data-radio-corner", corner);
  if (!slot) return;
  // The lane may have collapsed the card; a slot it fits in reopens it (the corner rule skips collapsed cards).
  if (ann && ann.toggleAttribute) ann.toggleAttribute("data-lane-collapsed", false);
  if (slot.corner) hStyle(root, "--radio-top-r", (vpW() - slot.x - slot.w).toFixed(1) + "px");
  // MOVE & SIZE then scales the card itself (#announce, origin top left), so
  // the slot is published at 1/SIZE: the PAINTED card fills it, not s times it.
  const a = els.announce, as = a && a.style && a.hasAttribute && a.hasAttribute("data-hl") ? +a.style.getPropertyValue("--hl-s") || 1 : 1;
  hStyle(root, "--radio-top-x", slot.x.toFixed(1) + "px");
  hStyle(root, "--radio-top-y", slot.y.toFixed(1) + "px");
  hStyle(root, "--radio-top-w", (slot.w / as).toFixed(1) + "px");
  hStyle(root, "--radio-top-h", (slot.h / as).toFixed(1) + "px");
}
// THE TOP-RIGHT CORNER, SECOND CHOICE ("top right by the camera selector", 2026-10-14): on 844x390 the
// strip right of the tower is ~70px. Hangs from the tower's bottom, right of centre (clears the centred
// flag chip), right-aligned against CAM / PAUSE / the sector plate; anything lit in those rows (HUD mirror
// or chip, gaps chip, dock groups, the flag) bounds it from its side. Anchored by its RIGHT edge
// (--radio-top-r) so a short message sits beside CAM; null under RADIO_TOP_MIN.
const RADIO_UNDER_H = 36, RADIO_UNDER_MAXW = 260, RADIO_UNDER_GAP = 4, RADIO_UNDER_MIN = 96;
function radioUnderRight(t) {
  let R = vpW() - 10, L = Math.max(t.left, vpW() / 2 + RADIO_TOP_GAP);
  for (const el of [els.btnCam, els.pausebtn, els.hudSectors]) { if (!el || el.hidden) continue;
    const r = el.getBoundingClientRect(); if (r.width && r.left > t.left + t.width / 2) R = Math.min(R, r.left); }
  R -= RADIO_TOP_GAP;
  const y = t.bottom + RADIO_UNDER_GAP, bot = y + RADIO_UNDER_H;
  const obst = [document.getElementById("hud-mirror"), document.getElementById("hud-mirror-chip"),
    els.gapA ? els.gapA.parentNode : null, els.flag];
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
// THE PAINTED GUARANTEE, one function for every caller: fitHud runs it last, invalidateFit right
// after its own radioTopSlot (which alone could relight hud-radio-top over the tower until the next
// fit tick repaired it).
function radioPaintedCollapse(root) {
  if (radioPlaced()) return;   // the player put it there
  // Painted guarantee: if the card still rects onto S3 or the tower, collapse
  // the hanging lane and drop the top slot. Do NOT call radioTopSlot again —
  // that re-ran announceLane, cleared data-lane-collapsed when a gap reopened,
  // and re-lit hud-radio-top, so the same-key clash path forced a full fit
  // every tick. Under selected-2 load that left #minimap.currentCSSZoom on a
  // stale cap while --hud-z-top moved (compact mmCss 142 ≠ 110).
  // Also collapse when the card still paints over SPEED/GEAR: the CSS 1.8em
  // floor wins over a ~7px cluster budget at phoneL broadcast @150%, and
  // announceLaneTick after fitHud can re-open a collapsed lane.
  const annPaint = typeof document !== "undefined" ? document.getElementById("announce") : null;
  // Already collapsed: the writes below would repeat verbatim, so skip the
  // rect reads (each forced a reflow after announceLane's style writes).
  if (annPaint && annPaint.hasAttribute("data-lane-collapsed") && !document.body.classList.contains("hud-radio-top")
    && root.style.getPropertyValue("--announce-lane-w") === "0px" && root.style.getPropertyValue("--announce-lane-shift") === "0%") return;
  if (annPaint && !annPaint.hidden) {
    const a = annPaint.getBoundingClientRect();
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
    if (hit(els.hudSectors) || hit(tower) || hit(gear) || hit(speed)) {
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
// PERF #2151: the 10 Hz call runs AFTER the tick's text writes, so its rect
// reads forced a layout every tick a card was up. Re-measure only when what
// places the card changes (fit key, lane key and vars, card text/class) or on
// the 3 s backstop; a forced update always measures.
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
  // PERF probe: announceLane cache-miss count (tests/unit/hud-announce-lane-cache.test.mjs).
  laneRectMisses: () => _laneRectMisses,
  resetLaneRectMisses: () => { _laneRectMisses = 0; },
};
}

return { create };
})();
Object.freeze(HudRadioLane);
