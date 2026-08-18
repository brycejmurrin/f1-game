/* Apex 26 — in-race HUD + minimap for js/game.js. Write-cached DOM setters
   (the panel ticks ~10 Hz but most fields hold steady), cached sector-row
   nodes, and the minimap with its pre-rendered track-outline blit. Live game
   state comes through the ctx façade handed to GameHud.create(ctx) (the `G`
   object in game.js): els, player, cars, ranked, track, state, timeTrial,
   lapsTarget, sectorLast, ttRecord, fmtTime, cssCol, dashKph, otEnabled,
   aeroZoneAhead, aeroZones, cautionInfo. Consumes globals Ghost, TrackMaps,
   GameTables. Must load BEFORE js/game.js (see index.html). */
const GameHud = (function () {
  "use strict";

const { IDLE_RPM, MAX_RPM } = GameTables;
const clamp = M4.clamp;                       // shared scalar helper (js/mat4.js)

function create(G) {
Log.info("ui", "GameHud.create");

const els = G.els;
const mm = els.minimap.getContext("2d");
let hudT = 0;
let minimapBg = null;         // offscreen canvas with pre-rendered track shape
let _flagShown = false;       // B1 caution-flag visibility cache (avoid layout thrash)
let _teamSkin = null;         // last team id pushed to <html data-team> (skins the HUD accent)

// HUD write-caches: skip the DOM mutation when the value hasn't changed (the panel
// ticks ~10Hz but most fields hold steady between updates). Keyed per element.
const _hudTxt = new WeakMap();   // el -> last textContent
const _hudSty = new WeakMap();   // el -> { prop: lastVal }
const _hudCls = new WeakMap();   // el -> last className
const _hudTog = new WeakMap();   // el -> { cls: lastBool }
function hText(el, v) { if (!el) return; if (_hudTxt.get(el) !== v) { _hudTxt.set(el, v); el.textContent = v; } }
// Custom properties need setProperty — `el.style["--e"] = x` is silently a
// no-op, which is the kind of failure that looks like a broken stylesheet.
function hStyle(el, prop, v) { if (!el) return; let m = _hudSty.get(el); if (!m) { m = {}; _hudSty.set(el, m); }
  if (m[prop] !== v) { m[prop] = v; if (prop.charCodeAt(0) === 45) el.style.setProperty(prop, v); else el.style[prop] = v; } }
function hClass(el, v) { if (!el) return; if (_hudCls.get(el) !== v) { _hudCls.set(el, v); el.className = v; } }
function hToggle(el, cls, on) { if (!el) return; let m = _hudTog.get(el); if (!m) { m = {}; _hudTog.set(el, m); } if (m[cls] !== on) { m[cls] = on; el.classList.toggle(cls, on); } }

// Sector row: cached span nodes (built once), textContent-updated each tick — no
// per-tick innerHTML re-parse.
let _secRows = null;
function buildSecRows() {
  const SC = ["#c084fc", "#e10600", "#a3e635"], labels = ["S1", "S2", "S3"];
  els.hudSectors.textContent = "";
  _secRows = [];
  for (let i = 0; i < 3; i++) {
    const row = document.createElement("div"); row.className = "sec-row";
    const lbl = document.createElement("span"); lbl.className = "sec-lbl"; lbl.style.color = SC[i]; lbl.textContent = labels[i];
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
// Every read here is cheap and needs no cache. `documentElement.style` is the
// INLINE declaration this game writes in applyScale() — a string read, not
// getComputedStyle, so it forces no style or layout pass — and innerWidth is
// free. That is the whole reason this is a handful of lines and not a
// measure-and-hysteresis loop: nothing here asks the layout engine anything, so
// it can simply run every tick and follow a window resize for free.
const GAP_SHORT_AT = { narrow: 640, wide: 800 };
const GAP_DROP_AT  = { narrow: 550, wide: 800 };
function gapForm() {
  const root = document.documentElement;
  const s = +root.style.getPropertyValue("--hud-scale") || 1;
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
  return ratio <= GAP_SHORT_AT[k]
    ? (arrow, code, t) => arrow + " " + t
    : (arrow, code, t) => arrow + " " + code + " +" + t + "s";
}

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
let _fitKey = "", _fitWait = 0;
function fitHud() {
  const root = document.documentElement;
  const scale = +root.style.getPropertyValue("--hud-scale") || 1;
  const key = window.innerWidth + "x" + window.innerHeight + "@" + scale;
  // Resize and HUD SIZE are the obvious inputs and get an immediate re-measure.
  // The slow poll on top of them is for the ones a fingerprint cannot see: the
  // gap readout is EMPTY at the green light and ~110px wide once it has rivals
  // to report, and the POS row widens from "1/22" to "12/22". Four rect reads at
  // 2Hz — updateHud itself runs at ~10Hz — is nothing next to the frame.
  if (key === _fitKey && --_fitWait > 0) return;
  _fitKey = key; _fitWait = 30;   // ~0.5 s at 60 Hz tick — was 5 (~12 Hz layout thrash)
  const wide = (el) => {
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    if (!r.width) return 0;
    return r.width / (el.currentCSSZoom || 1);
  };
  // The CONTENT extent of a container, for the ones that can be compressed below
  // it. Union of the children's rects, in the container's own unzoomed units.
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
  const top = wide(document.querySelector(".hud-top"));
  if (!top) { _fitKey = ""; return; }   // menu layer: nothing laid out, measure again next tick
  const half = window.innerWidth / 2;
  // The left corner is the map plus the gap readout beside it, and the right is
  // the sector box; each competes with half the POS row for half the screen.
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
  const bottom = span(document.querySelector(".hud-bottom"));
  const capBot = bottom ? (window.innerWidth - 2 * FIT_AIR) / bottom : Infinity;
  const set = (prop, cap) => {
    if (cap >= scale) root.style.removeProperty(prop);   // fits: the player's number, untouched
    else root.style.setProperty(prop, String(Math.max(0.4, Math.round(cap * 1000) / 1000)));
  };
  set("--hud-z-top", capTop);
  set("--hud-z-bot", capBot);
}

function updateHud(force) {
  const player = G.player, cars = G.cars, timeTrial = G.timeTrial;
  if (!player) return;
  // Per-team HUD skin: mirror the player's team id onto <html data-team> so the
  // CSS --accent token resolves to the team colour (see css/tokens.css). Cached
  // — the attribute write only fires when the team actually changes. Purely
  // presentational; falls back to the default red accent if unset.
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
  hText(els.lap, Math.min(player.lap || 1, G.lapsTarget) + "/" + G.lapsTarget);
  hText(els.time, G.fmtTime(player.lapTime));
  hText(els.best, isFinite(player.best) ? G.fmtTime(player.best) : "-");
  hText(els.speed, "" + Math.round(G.dashKph(player.speed)));
  hStyle(els.energy, "width", (player.energy * 100).toFixed(0) + "%");
  // gear + tachometer
  hText(els.gear, "" + player.gear);
  const rpmFrac = clamp((player.rpm - IDLE_RPM) / (MAX_RPM - IDLE_RPM), 0, 1);
  hStyle(els.rpmFill, "width", (rpmFrac * 100).toFixed(0) + "%");
  hToggle(els.tach, "redline", player.rpm > MAX_RPM * 0.92);
  // toggle-button states
  hToggle(els.btnBoost, "on", player.boostOn);
  // THE BOOST BUTTON IS THE BATTERY. Its colour is mixed from the charge, so a
  // flat pack reads as a washed-out button and a full one as vivid green — you
  // can tell what pressing it will buy you without looking away at the bar.
  // Quantised to 20 steps because hStyle only writes on CHANGE, and a raw float
  // changes every single frame: that would be a style write per frame per
  // button, which is exactly what this HUD's write-caching exists to avoid.
  hStyle(els.btnBoost, "--e", (Math.round((player.energy || 0) * 20) / 20).toFixed(2));
  hToggle(els.btnOT, "on", player.otT > 0);
  hToggle(els.btnOT, "armed", player.otArmed && player.otT <= 0);
  const ot = player.otT > 0 ? "ot-active" : player.otArmed ? "ot-armed" : player.otCool > 0 ? "ot-cool" : "ot-off";
  hClass(els.ot, ot);
  // "NO OVERTAKE" says WHY the button is dead, and the difference matters: not
  // yet armed means keep closing on the car ahead, whereas lap 1 or a caution
  // means nothing you do will arm it. A control that looks merely unlucky when
  // it is actually switched off is one the player keeps stabbing at.
  const otOff = G.state === "race" && !G.otEnabled() && player.otT <= 0;
  hText(els.ot, player.otT > 0 ? "OVERTAKE " + player.otT.toFixed(1)
                : otOff ? "NO OVERTAKE" : "OVERTAKE");
  hToggle(els.btnOT, "dead", otOff);
  // ACTIVE AERO. Three states worth telling apart at a glance: the flap is OPEN
  // (X-MODE), the road ahead would allow it (armed, so the button is worth
  // pressing), or it is simply unavailable here. `aeroX` is the flap travel,
  // not the switch, so the readout follows the wing rather than the button.
  const xOpen = (player.aeroX || 0) > 0.05;
  // ACTIVATION ZONES are a PLACE, so the readout is a distance, not a mood. The
  // rolling look-ahead this replaced could only ever say yes/no about the here
  // and now; a fixed zone can be announced like a DRS board, which is the whole
  // reason the real system uses fixed zones. Four states: open, standing in a
  // zone (press it), a zone counting down ahead, and a circuit that has none —
  // Monaco has no qualifying straight, and there the button is simply not a
  // thing that exists.
  const dz = G.aeroZoneAhead ? G.aeroZoneAhead(player.s || 0) : Infinity;
  const noZones = !(G.aeroZones && G.aeroZones.length);
  hToggle(els.btnAero, "on", xOpen);
  hToggle(els.btnAero, "armed", !!player.xArmed && !xOpen);
  // Faded when the CIRCUIT has no zone: the control exists, this track just
  // cannot use it, and the struck-through NO AERO ZONE chip beside it says so.
  // AUTO is not handled here — there the button is removed from the dock
  // outright (showTouchControls), because the wing driving itself is a control
  // with no job rather than a control that is temporarily unavailable.
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
    // no rivals — show ghost delta (or last lap) and the record to chase instead of gaps
    if (Ghost.hasGhost()) {
      const ghostT = Ghost.timeAt(player.s);
      if (ghostT !== null) {
        const delta = player.lapTime - ghostT;
        const sign = delta >= 0 ? "+" : "";
        hText(els.gapA, "GHOST " + sign + delta.toFixed(3) + "s");
        hStyle(els.gapA, "color", delta <= 0 ? "#a3e635" : "#e10600");
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
    // gaps — reuse the module-scope prog-sorted field from the update loop
    const ranked = G.ranked;
    // -1 once the player has retired: it is no longer in `ranked`, and ranked[0]
    // would then read as "the car right behind you" — the leader.
    const i = ranked.indexOf(player);
    const a = i > 0 ? ranked[i - 1] : null, b = i >= 0 ? ranked[i + 1] : null;
    const gap = gapForm();
    hText(els.gapA, a ? gap("▲", a.code, ((a.prog - player.prog) / Math.max(player.speed, 25)).toFixed(1)) : "");
    hText(els.gapB, b ? gap("▼", b.code, ((player.prog - b.prog) / Math.max(player.speed, 25)).toFixed(1)) : "");
  }
  // Sector split display (top-right) — cached span nodes, textContent per tick
  if (els.hudSectors) {
    if (!_secRows) buildSecRows();
    for (let i = 0; i < 3; i++) {
      const t = G.sectorLast[i];
      hText(_secRows[i], t == null ? "--" : t.toFixed(3));
    }
  }
  // B1 caution flag (local yellow / VSC / safety car) — driven by the caution
  // state machine in js/game/racecontrol.js, read via G.cautionInfo (READ-ONLY
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
  const W = els.minimap.width, H = els.minimap.height;
  // pre-render the static track outline once; reuse as a cheap blit every HUD frame
  if (!minimapBg || minimapBg.width !== W || minimapBg.height !== H) {
    minimapBg = document.createElement("canvas");
    minimapBg.width = W; minimapBg.height = H;
    const mc = minimapBg.getContext("2d");
    const map = track.map, n = map.length;
    mc.lineWidth = 2; mc.lineJoin = "round"; mc.lineCap = "round";
    const SC = ["rgba(192,132,252,0.8)", "rgba(225,6,0,0.8)", "rgba(163,230,53,0.8)"];
    // Same CircuitMarkings splits as TrackMaps.draw / sectorAt (thirds if missing).
    const sec = track.def && track.def.sectors;
    const splits = (sec && sec.length === 2) ? [0, sec[0], sec[1], 1] : [0, 1 / 3, 2 / 3, 1];
    for (let s = 0; s < 3; s++) {
      const from = Math.floor(splits[s] * n);
      const to = s === 2 ? n - 1 : Math.max(from, Math.floor(splits[s + 1] * n));
      mc.strokeStyle = SC[s];
      mc.beginPath();
      for (let i = from; i <= to; i++) {
        const p = map[i % n];
        const x = 8 + p[0] * (W - 16), y = 8 + p[1] * (H - 16);
        i === from ? mc.moveTo(x, y) : mc.lineTo(x, y);
      }
      if (s === 2) {
        const p0 = map[0];
        mc.lineTo(8 + p0[0] * (W - 16), 8 + p0[1] * (H - 16));
      }
      mc.stroke();
    }
    // DRS zone highlight (cyan, slightly thicker)
    const zones = TrackMaps.drsZones(track.def);
    if (zones && zones.length) {
      mc.strokeStyle = "rgba(0,220,180,0.85)"; mc.lineWidth = 3;
      for (const z of zones) {
        const from2 = Math.floor(z.a * n), to2 = Math.min(n - 1, Math.floor(z.b * n));
        mc.beginPath();
        for (let i = from2; i <= to2; i++) {
          const p = map[i % n];
          mc.lineTo(8 + p[0] * (W - 16), 8 + p[1] * (H - 16));
        }
        mc.stroke();
      }
    }
  }
  mm.clearRect(0, 0, W, H);
  mm.drawImage(minimapBg, 0, 0);
  const map = track.map, n = map.length;
  for (const c of cars) {
    if (c === player) continue;
    const p = map[Math.floor(c.s / track.total * n) % n];
    const x = 6 + p[0] * (W - 16), y = 6 + p[1] * (H - 16);
    mm.fillStyle = c.team._cssColor || (c.team._cssColor = G.cssCol(c.team.color));   // team colours are static — compute once
    // ANOTHER PERSON, not an AI. Every rival used to be one 4px team-coloured
    // square, so the friend you are actually racing looked exactly like the
    // nineteen cars you are not — and because a friend can be your TEAM-MATE,
    // that could be two identical squares in the same colour. c.human without
    // c.local is precisely "a human who is not you" (see setCarRole).
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
    if (gh && !gh.done) {
      const gp = map[Math.floor((gh.s / track.total) * n) % n];
      mm.fillStyle = "rgba(120, 220, 255, 0.95)";
      mm.beginPath();
      mm.arc(8 + gp[0] * (W - 16), 8 + gp[1] * (H - 16), 3.4, 0, 7);
      mm.fill();
    }
  }
  const p = map[Math.floor(player.s / track.total * n) % n];
  mm.fillStyle = "#fff";
  mm.beginPath();
  mm.arc(8 + p[0] * (W - 16), 8 + p[1] * (H - 16), 4, 0, 7);
  mm.fill();
}

// loadTrack() calls this so the outline re-renders for the new circuit.
function invalidateMap() { minimapBg = null; }

return { updateHud, invalidateMap };
}

return { create };
})();
