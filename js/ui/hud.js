/* Apex 26 — in-race HUD + minimap for js/game.js. Write-cached DOM setters (the panel ticks ~10 Hz but most fields hold steady), cached sector-row nodes, and the … */
const GameHud = (function () {
  "use strict";

const { IDLE_RPM, MAX_RPM } = PhysicsConsts;   // eval-time read: HARD_EDGES pins physics-consts.js first
const clamp = M4.clamp;                       // shared scalar helper (js/core/mat4.js)

function create(G) {
Log.info("ui", "GameHud.create");

const els = G.els;
const mm = els.minimap.getContext("2d");
let hudT = 0;
let minimapBg = null;         // offscreen canvas with pre-rendered track shape
let minimapBgKey = "";        // cssW|cssH|ratio it was rendered for — NOT the
                              // derived (W,H): 140css@2x and 280css@1x share a
                              // bitmap size but need different path transforms
let _mmKey = null, _mmCssW = 140, _mmCssH = 140, _mmRatio = 1;  // measure cache
let _flagShown = false;       // B1 caution-flag visibility cache (avoid layout thrash)
let _teamSkin = null;         // last team id pushed to <html data-team> (skins the HUD accent)
let _redline = false;         // tach redline latch: on above 92% of MAX_RPM, off again below 89%

const _hudTxt = new WeakMap();   // el -> last textContent
const _hudSty = new WeakMap();   // el -> { prop: lastVal }
const _hudCls = new WeakMap();   // el -> last className
const _hudTog = new WeakMap();   // el -> { cls: lastBool }
function hText(el, v) { if (!el) return; if (_hudTxt.get(el) !== v) { _hudTxt.set(el, v); el.textContent = v; } }
function hStyle(el, prop, v) { if (!el) return; let m = _hudSty.get(el); if (!m) { m = {}; _hudSty.set(el, m); }
  if (m[prop] !== v) { m[prop] = v; if (prop.charCodeAt(0) === 45) el.style.setProperty(prop, v); else el.style[prop] = v; } }
function hClass(el, v) { if (!el) return; if (_hudCls.get(el) !== v) { _hudCls.set(el, v); el.className = v; } }
function hToggle(el, cls, on) { if (!el) return; let m = _hudTog.get(el); if (!m) { m = {}; _hudTog.set(el, m); } if (m[cls] !== on) { m[cls] = on; el.classList.toggle(cls, on); } }

let _lastRank = 0, _posFlashT = 0;   // POS box flash state (see the tick)
// Team colours are static — compute once per team, the minimap's idiom.
const teamCss = (c) => (c.team ? (c.team._cssColor || (c.team._cssColor = G.cssCol(c.team.color))) : "");
let _secRows = null;
function buildSecRows() {
  // S2 is NOT the brand #e10600: at 14px bold on the 72% plate that red measures
  // ~4.2:1 on pure black and less over a bright scene (css/tokens.css records
  // ~2.6:1 on the page) — under the 4.5:1 AA floor for text this size. The
  // lighter red keeps the hue and clears ~5.9:1; the minimap stroke matches.
  const SC = ["#c084fc", "#ff3b30", "#a3e635"], labels = ["S1", "S2", "S3"];
  els.hudSectors.textContent = "";
  _secRows = [];
  for (let i = 0; i < 3; i++) {
    const row = document.createElement("div"); row.className = "sec-row";
    // The label keeps the row's dim ink: SC (sector identity) still colours
    // the minimap, but a purple S1 label beside a purple "session best" value
    // would read as two of the same thing.
    const lbl = document.createElement("span"); lbl.className = "sec-lbl"; lbl.textContent = labels[i];
    const val = document.createElement("span"); val.className = "sec-val"; val.textContent = "--";
    row.appendChild(lbl); row.appendChild(val); els.hudSectors.appendChild(row);
    _secRows.push(val);
  }
}

// THE AHEAD/BEHIND GAP READOUT SPELLS ITSELF TO FIT ITS SLOT.
//
// `.hud-gaps` sits between the minimap and the CENTRED POS/LAP row, and that slot
// CLOSES as HUD SIZE grows — the map pushes the widget right while `.hud-top`
// grows left. Measured at 1000px wide: 266px of slot at 100%, 151 at 150%, 33 at
// 200%, against a 117px readout in the full spelling.
//
// `innerWidth / scale` is the slot's proxy: halving the window and doubling the
// HUD are the same squeeze, and the whole left cluster is in one `zoom` group so
// the relationship is linear. Two responses, in order of what they cost:
//
//   1. SHORTEN. Drop the driver code and the "s" — the ARROW already says which
//      side and the number is what a driver reads mid-corner. Full spelling is
//      ~111px, short is ~70px.
//   2. DROP. Below `.hud-top`'s bottom edge, still beside the map, where the
//      strip runs clear to the far side of the screen. Costs the widget its
//      alignment with the top of the minimap and nothing else.
//
// The thresholds are per BREAKPOINT because the >=1200px ladder makes both walls
// of the slot worse at once: a 140px minimap (vs 96) starts the widget further
// right, and fatter `.hud-box` padding starts `.hud-top` further left. MEASURED
// slack, full spelling: 1000@150% (ratio 667) +27, 1000@175% (571) -38 but short
// fits at +13, 1000@200% (500) short still -50; 1280@150% (853) +25, 1280@175%
// (731) -64 and short would be -16 too, 1280@200% (640) -105. So narrow gets a
// shorten band between 550 and 640 and drops below it; wide has no useful
// shorten band at all and drops straight away at 800.
//
// Every read here is cheap and needs no cache. Both custom properties are
// INLINE declarations this file's own passes write (applyScale writes
// --hud-scale; the fit pass writes --hud-z-top when its cap binds) — string
// reads, not getComputedStyle, so they force no style or layout pass — and
// innerWidth is free. The gaps strip PAINTS at the capped --hud-z-top, so
// that is the divisor when present; the raw slider is only the fallback
// before the first fit. Nothing here asks the layout engine anything, so it
// can simply run every tick and follow a window resize for free.
const GAP_SHORT_AT = { narrow: 640, wide: 800 };
const GAP_DROP_AT  = { narrow: 550, wide: 800 };
// The gap is distance ÷ the PLAYER'S OWN speed, so under braking the divisor
// halves within a second and the tenths jumped 2x between ticks (10 Hz) with
// the rival not having moved relative to the car. Smooth the displayed
// seconds (EMA, ~0.3 s at 10 Hz) per slot; a neighbour change resets the
// slot so a new rival never inherits the old one's lag.
const _gapSm = [NaN, NaN], _gapWho = [null, null];
function gapSec(slot, who, raw) {
  if (who !== _gapWho[slot] || !isFinite(_gapSm[slot])) { _gapWho[slot] = who; _gapSm[slot] = raw; }
  else _gapSm[slot] += (raw - _gapSm[slot]) * 0.3;
  return _gapSm[slot].toFixed(1);
}
function gapForm() {
  const root = document.documentElement;
  const s = +root.style.getPropertyValue("--hud-z-top") ||
            +root.style.getPropertyValue("--hud-scale") || 1;
  const ratio = window.innerWidth / s;
  const k = window.innerWidth >= 1200 ? "wide" : "narrow";
  const drop = ratio <= GAP_DROP_AT[k];
  // Compared against the DOM rather than a remembered value: a module-level cache
  // desyncs the moment anything else touches the attribute (a dev tool, a probe,
  // a future panel) and then never repairs itself. Reading an attribute is as
  // cheap as reading a field and cannot go stale.
  if (drop !== ("gapDrop" in root.dataset)) {
    if (drop) root.dataset.gapDrop = "1";
    else delete root.dataset.gapDrop;
  }
  return ratio <= GAP_SHORT_AT[k] ? _gapFormShort : _gapFormLong;
}
// Hoisted: gapForm runs every HUD tick — returning fresh arrows was 2 closures
// per call for two constant formats.
const _gapFormShort = (arrow, code, t) => arrow + " " + t;
const _gapFormLong = (arrow, code, t) => arrow + " " + code + " +" + t + "s";

// THE HUD FITS ITSELF TO THE VIEWPORT.
//
// Every cluster is anchored in its own corner and multiplied by HUD SIZE, and
// nothing in the CSS relates a cluster's size to the SCREEN's — so past ~150% on
// a small screen the clusters simply exceed it. Surveyed across 5 shapes x 5
// sizes: `#minimap` runs into `.hud-top` on 667x375 from 150% and on 1280x800 at
// 200%; `#hud-gearbox`/`#hud-aero` run OFF-SCREEN on 1280x800 from 175%. 1920x1080
// is clean at every size — which is the tell. The defect is a RATIO, not a size.
//
// So each band renders at min(player's HUD SIZE, what fits). Two bands, because
// they run out of room at different points; the top band caps as ONE unit so the
// map, the gap readout and the centred POS row keep their relationship.
//
//   top band   the map and the sector box grow from the edges while the centred
//              POS row grows from the middle, so the binding constraint is
//              half the screen against (corner cluster + half the POS row).
//   bottom     one centred row; it just has to fit the width.
//
// INTRINSIC WIDTHS ARE MEASURED, NOT GUESSED: `rect.width / currentCSSZoom` is
// the cluster's width at zoom 1, which is invariant under the cap. That is what
// makes this stable rather than a feedback loop — capping changes the rect and
// the zoom by the same factor, so the next measurement returns the same number.
const FIT_AIR = 10;              // px of daylight required between two clusters
let _fitKey = "", _fitWait = 0, _fitRetry = 0;   // _fitRetry: ticks spent re-measuring while nothing is laid out
let _hudTop = null, _hudBottom = null, _dockL = null, _dockR = null;   // the four fit handles never change identity
function fitHud() {
  const root = document.documentElement;
  const scale = +root.style.getPropertyValue("--hud-scale") || 1;
  // body.className is part of the key: cycling STEERING MODE re-parents the
  // dock groups (layoutDocks), so the tallest column's height changes while
  // viewport and scale do not — and the old key held the stale dock cap for
  // the whole 3 s backoff (measured: the steer-cycling audit cells clipped at
  // 150% while the plain hud cell, same everything, was clean). Every mode
  // flip toggles a body class (manual / steer-buttons / steer-touch), so the
  // class string is exactly the re-fit trigger needed, read without layout.
  // The gap chip's TEXT is part of the key: its width follows the live gap
  // string ("+2.1s" -> "+14.6s" is ~15px at 150%), and with only the 3 s
  // same-key re-measure a mid-window growth overlapped the POS tile until
  // the next forced read (seen on a phone at HUD 152%). textContent.length
  // is layout-free; a length change re-fits on the next tick.
  const gapLen = (els.gapA ? els.gapA.textContent.length : 0) * 100 +
    (els.gapB ? els.gapB.textContent.length : 0);
  const key = window.innerWidth + "x" + window.innerHeight + "@" + scale + "|" + gapLen + "|" + document.body.className;
  if (key === _fitKey && --_fitWait > 0) return;
  // A CHANGED key (resize / hud-scale) re-fits at the next tick; the counter
  // only paces the same-key safety re-measure: 30 ticks at the ~10 Hz HUD
  // tick ≈ 3 s between forced layout reads while nothing changed.
  _fitKey = key; _fitWait = 30;
  const wide = (el) => {
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    if (!r.width) return 0;
    return r.width / (el.currentCSSZoom || 1);
  };
  const span = (el) => {
    if (!el) return 0;
    let lo = Infinity, hi = -Infinity;
    for (const c of el.children) {
      const r = c.getBoundingClientRect();
      if (!r.width) continue;
      if (r.left < lo) lo = r.left;
      if (r.right > hi) hi = r.right;
    }
    return hi > lo ? (hi - lo) / (el.currentCSSZoom || 1) : wide(el);
  };
  if (!_hudTop) { _hudTop = document.querySelector(".hud-top"); _hudBottom = document.querySelector(".hud-bottom"); _dockL = document.getElementById("dock-left"); _dockR = document.getElementById("dock-right"); }
  const top = wide(_hudTop);
  // menu layer: nothing laid out, measure again next tick — but BOUNDED: an
  // unlatched key re-ran this whole rect pass (and drawMinimap's layout reads)
  // 10×/s for as long as the layout stayed empty, i.e. the entire countdown.
  if (!top) { if (++_fitRetry <= 30) _fitKey = ""; return; }
  const half = window.innerWidth / 2;
  const map = wide(els.minimap), gaps = wide(els.gapA && els.gapA.parentNode);
  const left = (map ? 10 + map + 8 + gaps : 0) + FIT_AIR;
  const right = wide(els.hudSectors) + 10 + FIT_AIR;
  const capTop = half / Math.max(left + top / 2, right + top / 2, 1);
  // THE BOTTOM BAND IS MEASURED BY ITS CHILDREN, not by its own box. `.hud-bottom`
  // is a flex ITEM inside #hud-dock carrying `min-width: 0` ("may shrink before it
  // pushes a dock", css/overlays.css), so its rect is the COMPRESSED width and its
  // children overflow it. Measuring the container read ~200px narrower than the
  // content and the cap came out permissive enough to leave #hud-gearbox and
  // #hud-aero off-screen at 1280x800 @175% — with the cap in place and no overlap
  // reported anywhere, which is how a wrong measurement hides.
  const bottom = span(_hudBottom);
  const capBot = bottom ? (window.innerWidth - 2 * FIT_AIR) / bottom : Infinity;
  // THE DOCKS GET THE SAME TREATMENT — they were the one cluster outside the
  // fit budget (this comment block's own "bottom: one centred row" never
  // counted them), and the dock zooms by the RAW slider, so at HUD SIZE 150%
  // on a 390px-tall landscape phone the 2-high pedal column outgrew the
  // viewport and BRAKE sat entirely off the top edge (measured 2026-08, the
  // first sweep after the in-race audit cells were un-blinded: #btn-brake at
  // y=-216, GAS 96px into the notch). Height, not width, is the binding
  // axis: cap = the viewport height less top air over the tallest column's
  // intrinsic (zoom-invariant) height.
  const tall = (el) => {
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    if (!r.height) return 0;
    return r.height / (el.currentCSSZoom || 1);
  };
  const dockH = Math.max(tall(_dockL), tall(_dockR));
  const capDock = dockH ? (window.innerHeight - 3 * FIT_AIR) / dockH : Infinity;
  // An empty dock on a TOUCH body is "not populated yet", not "no dock" —
  // showTouchControls lands a tick or two after the race starts, and latching
  // the key here left the cap unwritten for the whole 3 s same-key backoff
  // (measured: the un-blinded audit probes at ~0.6 s and saw the uncapped
  // dock every time). Same retry-next-tick treatment as the !top guard
  // above; a desktop body keeps the backoff, since its docks stay empty
  // forever and re-measuring them every tick is the cost the backoff exists
  // to avoid.
  if (!dockH && !document.body.classList.contains("desktop")) { if (++_fitRetry <= 30) _fitKey = ""; } else _fitRetry = 0;
  const set = (prop, cap) => {
    if (cap >= scale) root.style.removeProperty(prop);   // fits: the player's number, untouched
    else root.style.setProperty(prop, String(Math.max(0.4, Math.round(cap * 1000) / 1000)));
  };
  set("--hud-z-top", capTop);
  set("--hud-z-bot", capBot);
  set("--hud-z-dock", capDock);
}

function updateHud(force) {
  const player = G.player, cars = G.cars, timeTrial = G.timeTrial;
  if (!player) return;
  if (player.team && player.team.id !== _teamSkin) {
    _teamSkin = player.team.id;
    document.documentElement.dataset.team = _teamSkin;
  }
  hudT -= 1;
  if (!force && hudT > 0) return;
  hudT = 6; // ~10Hz at 60fps
  fitHud();                    // below the throttle: this reads layout, per TICK not per frame
  // A retirement has no race position left to hold — `rank` is whatever it was
  // when the car stopped, and the field it was measured against no longer
  // contains it (see the ranked build in game.js).
  hText(els.pos, timeTrial ? "TT" : player.retired ? "DNF" : (player.rank || "-") + "/" + cars.length);
  // Position change: acknowledge an overtake (either way) for ~6 ticks.
  const rank = timeTrial || player.retired ? 0 : (player.rank || 0);
  if (rank && _lastRank && rank !== _lastRank) { els.pos.dataset.delta = rank < _lastRank ? "up" : "down"; _posFlashT = 6; }
  else if (_posFlashT > 0 && --_posFlashT === 0) delete els.pos.dataset.delta;
  if (rank) _lastRank = rank;
  hText(els.lap, Math.min(player.lap || 1, G.lapsTarget) + "/" + G.lapsTarget);
  hText(els.time, G.fmtTime(player.lapTime));
  hText(els.best, isFinite(player.best) ? G.fmtTime(player.best) : "-");
  hText(els.speed, "" + Math.round(G.dashKph(player.speed)));
  hStyle(els.energy, "width", (player.energy * 100).toFixed(0) + "%");
  // gear + tachometer
  hText(els.gear, "" + player.gear);
  const rpmFrac = clamp((player.rpm - IDLE_RPM) / (MAX_RPM - IDLE_RPM), 0, 1);
  hStyle(els.rpmFill, "width", (rpmFrac * 100).toFixed(0) + "%");
  // HYSTERESIS: a single 0.92 threshold flickered the class (and restarted its
  // pulse animation) every tick the needle hovered on the line, which is
  // exactly where a driver holding a gear sits. Enter at 92%, leave at 89%.
  _redline = player.rpm > MAX_RPM * (_redline ? 0.89 : 0.92);
  hToggle(els.tach, "redline", _redline);
  // toggle-button states
  hToggle(els.btnBoost, "on", player.boostOn);
  hStyle(els.btnBoost, "--e", (Math.round((player.energy || 0) * 20) / 20).toFixed(2));
  hToggle(els.btnOT, "on", player.otT > 0);
  hToggle(els.btnOT, "armed", player.otArmed && player.otT <= 0);
  const ot = player.otT > 0 ? "ot-active" : player.otArmed ? "ot-armed" : player.otCool > 0 ? "ot-cool" : "ot-off";
  hClass(els.ot, ot);
  const otOff = G.state === "race" && !G.otEnabled() && player.otT <= 0;
  // Four states, four spellings. ot-off and ot-cool both read "OVERTAKE" and
  // differed by a 50% opacity alone — "closing on the car ahead will arm it"
  // and "nothing arms it for another 12 s" are different messages, so the
  // lockout counts itself down (whole seconds: a 9..14 s wait, not a 0.1 s push).
  hText(els.ot, player.otT > 0 ? "OVERTAKE " + player.otT.toFixed(1)
                : otOff ? "NO OVERTAKE"
                : player.otCool > 0 && !player.otArmed ? "COOLDOWN " + Math.ceil(player.otCool)
                : "OVERTAKE");
  hToggle(els.btnOT, "dead", otOff);
  const xOpen = (player.aeroX || 0) > 0.05;
  const dz = G.aeroZoneAhead ? G.aeroZoneAhead(player.s || 0) : Infinity;
  const noZones = !(G.aeroZones && G.aeroZones.length);
  hToggle(els.btnAero, "on", xOpen);
  hToggle(els.btnAero, "armed", !!player.xArmed && !xOpen);
  hToggle(els.btnAero, "dead", noZones);
  hClass(els.aero, noZones ? "ax-none" : xOpen ? "ax-open"
    : player.xArmed ? "ax-armed" : "ax-off");
  // The TEXT answers "where is the zone", so it keys off position, not arming.
  // Keying it off xArmed showed "AERO 0m" to a car standing INSIDE a zone but
  // too slow to arm — a distance readout of zero, which reads as "the zone is
  // right here" rather than "you are in it". Whether the mode is available is
  // the CLASS's job (ax-armed lights the chip), so the two never contradict.
  hText(els.aero, noZones ? "NO AERO ZONE"
    : xOpen ? "X-MODE"
    : dz === 0 ? "AERO ZONE"
    : dz < 900 ? "AERO " + Math.round(dz) + "m"
    : "Z-MODE");
  if (timeTrial) {
    // The DROP rule (gapForm) runs here too. The attribute it maintains lives
    // on <html> and outlives the session, so a race on a narrow phone left the
    // widget dropped for the time trial that followed, and a time trial on its
    // own never dropped it — although GHOST +0.123s is the LONGEST spelling the
    // slot ever holds. The format it returns is a race concern (no gaps here).
    gapForm();
    // no rivals — show ghost delta (or last lap) and the record to chase instead of gaps
    if (Ghost.hasGhost()) {
      const ghostT = Ghost.timeAt(player.s);
      if (ghostT !== null) {
        const delta = player.lapTime - ghostT;
        const sign = delta >= 0 ? "+" : "";
        hText(els.gapA, "GHOST " + sign + delta.toFixed(3) + "s");
        hStyle(els.gapA, "color", delta <= 0 ? "var(--faster)" : "var(--slower)");
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
    // gaps — reuse the module-scope prog-sorted field from the update loop.
    // rank is that array's 1-based position, refreshed every step; the identity
    // check catches the stale case (e.g. player retired) and falls back.
    const ranked = G.ranked;
    let i = (player.rank || 0) - 1;
    if (ranked[i] !== player) i = ranked.indexOf(player);
    const a = i > 0 ? ranked[i - 1] : null, b = i >= 0 ? ranked[i + 1] : null;
    const gap = gapForm();
    // Divisor floor as a fraction of the speed envelope, not a raw m/s
    // literal: PACE scales real speeds, so an absolute floor swallowed most
    // of the envelope at low OVERALL SPEED and understated slow-corner gaps.
    // 0.26 × vTop ≈ the old 25 m/s at default pace.
    const vFloor = Math.max(player.speed, G.vTop() * 0.26);
    hText(els.gapA, a ? gap("▲", a.code, gapSec(0, a, (a.prog - player.prog) / vFloor)) : "");
    hText(els.gapB, b ? gap("▼", b.code, gapSec(1, b, (player.prog - b.prog) / vFloor)) : "");
    // WHO: the neighbour's team colour as the chip's left bar (css/hud.css).
    hStyle(els.gapA, "--gap-team", a ? teamCss(a) : "");
    if (a && (player.towing || 0) > 0.5) els.gapA.dataset.tow = "1"; else delete els.gapA.dataset.tow;   // in the tow
    hStyle(els.gapB, "--gap-team", b ? teamCss(b) : "");
  }
  // Sector split display (top-right) — cached span nodes, textContent per tick
  if (els.hudSectors) {
    if (!_secRows) buildSecRows();
    // A bare split makes the driver remember last lap's to read it. The arrow
    // is the announce banner's own glyph (▼ personal best, ▲ slower) held
    // for the whole lap, and lime is the HUD's existing "faster" colour (the
    // ghost delta). sectorBests is updated in the same crossing, so a fresh
    // PB reads t == best; a first-ever lap is every sector's best, correctly.
    const bests = G.sectorBests, field = G.fieldSectorBests;
    for (let i = 0; i < 3; i++) {
      const t = G.sectorLast[i];
      const pb = t != null && bests && t <= bests[i];
      const sb = pb && field && t <= field[i];   // the FIELD's best — the timing screen's purple
      hText(_secRows[i], t == null ? "--" : (pb ? "▼" : "▲") + t.toFixed(3));
      // Timing-screen colours: purple session best, green personal best,
      // yellow slower than your own best; no split yet keeps the row's ink.
      hStyle(_secRows[i], "color", t == null ? "" : sb ? "var(--sec-best)" : pb ? "var(--faster)" : "var(--sec-slow)");
    }
  }
  // B1 caution flag (local yellow / VSC / safety car) — driven by the caution
  // state machine in js/race/race-control.js, read via G.cautionInfo (READ-ONLY
  // w.r.t. the cars; the debris side-world never moves one). Hidden when green.
  if (els.flag) {
    const cn = G.cautionInfo ? G.cautionInfo() : null;
    const show = !!(cn && cn.level > 0);
    if (show) {
      const txt = cn.level === 1 ? "YELLOW" + (cn.sector >= 0 ? " S" + (cn.sector + 1) : "")
                : cn.level === 2 ? "VSC" : "SAFETY CAR";
      hText(els.flag, txt);
      hClass(els.flag, cn.level === 3 ? "flag-sc" : cn.level === 2 ? "flag-vsc" : "flag-yellow");
    }
    if (_flagShown !== show) { _flagShown = show; els.flag.hidden = !show; }
  }
  drawMinimap();
}

function drawMinimap() {
  const player = G.player, cars = G.cars, track = G.track, timeTrial = G.timeTrial;
  // Logical space = the element's LOCAL CSS box (clientWidth is pre-zoom px,
  // the same convention sheetshape.js relies on). Bitmap = local x effective
  // zoom x DPR so one drawn pixel is one physical pixel — mirroring the menu
  // track preview (js/ui/select-screen.js), which solved this exact blur first.
  // currentCSSZoom, not the raw --hud-scale: the element rides the CAPPED
  // --hud-z, and the raw slider would over-allocate on a capped band. Ratio
  // capped at 3 to bound fill/memory on a DPR-3 phone at HUD SIZE 200%.
  // Measure only when layout could have moved — same key discipline as
  // fitHud (resize / HUD-scale), plus a track change (minimapBg null). A
  // clientWidth read here lands right after the HUD's own DOM writes, so per
  // frame it was a forced reflow ~10×/s for numbers that never change mid-race.
  if (_mmKey !== _fitKey || _fitKey === "" || !minimapBg) {
    _mmKey = _fitKey;
    _mmCssW = els.minimap.clientWidth || 140;
    _mmCssH = els.minimap.clientHeight || 140;
    _mmRatio = Math.min(3, Math.max(1,
      (els.minimap.currentCSSZoom || 1) * (window.devicePixelRatio || 1)));
  }
  const cssW = _mmCssW, cssH = _mmCssH, ratio = _mmRatio;
  const W = Math.round(cssW * ratio), H = Math.round(cssH * ratio);
  // Every CSS tier gives #minimap an explicit width/height, so the attribute
  // change never moves the layout box (fitHud reads the same numbers).
  if (els.minimap.width !== W || els.minimap.height !== H) {
    els.minimap.width = W; els.minimap.height = H;
  }
  // pre-render the static track outline once; reuse as a cheap blit every HUD frame
  const bgKey = cssW + "|" + cssH + "|" + ratio;
  if (!minimapBg || minimapBgKey !== bgKey) {
    minimapBgKey = bgKey;
    minimapBg = document.createElement("canvas");
    minimapBg.width = W; minimapBg.height = H;
    const mc = minimapBg.getContext("2d");
    // Path math below stays in the local px it was tuned in; the transform
    // carries it to physical px.
    mc.setTransform(ratio, 0, 0, ratio, 0, 0);
    const map = track.map, n = map.length;
    mc.lineWidth = 2; mc.lineJoin = "round"; mc.lineCap = "round";
    const SC = ["rgba(192,132,252,0.8)", "rgba(255,59,48,0.8)", "rgba(163,230,53,0.8)"];   // = the sector labels
    // Same def.sectors splits as TrackMaps.draw / sectorAt (thirds if missing).
    const sec = track.def && track.def.sectors;
    const splits = (sec && sec.length === 2) ? [0, sec[0], sec[1], 1] : [0, 1 / 3, 2 / 3, 1];
    for (let s = 0; s < 3; s++) {
      const from = Math.floor(splits[s] * n);
      const to = s === 2 ? n - 1 : Math.max(from, Math.floor(splits[s + 1] * n));
      mc.strokeStyle = SC[s];
      mc.beginPath();
      for (let i = from; i <= to; i++) {
        const p = map[i % n];
        const x = 8 + p[0] * (cssW - 16), y = 8 + p[1] * (cssH - 16);
        i === from ? mc.moveTo(x, y) : mc.lineTo(x, y);
      }
      if (s === 2) {
        const p0 = map[0];
        mc.lineTo(8 + p0[0] * (cssW - 16), 8 + p0[1] * (cssH - 16));
      }
      mc.stroke();
    }
    // Activation-zone highlight, slightly thicker, in the AERO chip's own blue
    // (#hud-aero.ax-armed / #btn-aero.armed): it used to be cyan, so the map
    // and the chip named the same zone in two colours.
    const zones = TrackMaps.drsZones(track.def);
    if (zones && zones.length) {
      mc.strokeStyle = "rgba(38,165,245,0.9)"; mc.lineWidth = 3;
      for (const z of zones) {
        const from2 = Math.floor(z.a * n), to2 = Math.min(n - 1, Math.floor(z.b * n));
        mc.beginPath();
        for (let i = from2; i <= to2; i++) {
          const p = map[i % n];
          mc.lineTo(8 + p[0] * (cssW - 16), 8 + p[1] * (cssH - 16));
        }
        mc.stroke();
      }
    }
  }
  // Canvas resize resets 2D context state, so the transform is set every
  // draw, not once. The blit destination is in local px: under the ratio
  // transform the W-physical-px cache lands on cssW·ratio physical px — a 1:1
  // copy when that product is whole, and a sub-pixel resample of the rounding
  // remainder when it is not. Either way one cheap blit per HUD frame.
  mm.setTransform(ratio, 0, 0, ratio, 0, 0);
  mm.clearRect(0, 0, cssW, cssH);
  mm.drawImage(minimapBg, 0, 0, cssW, cssH);
  const map = track.map, n = map.length;
  for (const c of cars) {
    if (c === player) continue;
    const p = map[Math.floor(c.s / track.total * n) % n];
    const x = 6 + p[0] * (cssW - 16), y = 6 + p[1] * (cssH - 16);
    mm.fillStyle = c.team._cssColor || (c.team._cssColor = G.cssCol(c.team.color));   // team colours are static — compute once
    if (c.human && !c.local) {
      mm.fillRect(x - 1, y - 1, 6, 6);
      // A white ring, because the team colour is the one thing it cannot use to
      // stand out — the car it must be told apart from may share it.
      mm.strokeStyle = "#fff";
      mm.lineWidth = 1;
      mm.strokeRect(x - 1.5, y - 1.5, 7, 7);
    } else {
      mm.fillRect(x, y, 4, 4);
    }
  }
  // ghost replay marker (time trial): where your best lap is right now
  if (timeTrial && Ghost.hasGhost()) {
    const gh = Ghost.at(player.lapTime);
    if (gh) {
      const gp = map[Math.floor((gh.s / track.total) * n) % n];
      mm.fillStyle = "rgba(120, 220, 255, 0.95)";
      mm.beginPath();
      mm.arc(8 + gp[0] * (cssW - 16), 8 + gp[1] * (cssH - 16), 3.4, 0, 7);
      mm.fill();
    }
  }
  const p = map[Math.floor(player.s / track.total * n) % n];
  mm.fillStyle = "#fff";
  mm.beginPath();
  mm.arc(8 + p[0] * (cssW - 16), 8 + p[1] * (cssH - 16), 4, 0, 7);
  mm.fill();
}

// loadTrack() calls this so the outline re-renders for the new circuit.
function invalidateMap() { minimapBg = null; }

return { updateHud, invalidateMap };
}

return { create };
})();
