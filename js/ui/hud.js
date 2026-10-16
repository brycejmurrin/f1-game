/* Apex 26 — in-race HUD + minimap for js/game.js. Write-cached DOM setters (the panel ticks ~10 Hz but most fields hold steady), cached sector-row nodes, and the … */
const GameHud = (function () {
  "use strict";

const { IDLE_RPM, MAX_RPM } = PhysicsConsts;   // eval-time read: HARD_EDGES pins js/physics/consts.js first
const clamp = M4.clamp;                       // shared scalar helper (js/core/mat4.js)
// REDUCED MOTION for the one HUD motion no stylesheet reaches — the canvas
// minimap's armed pit-marker pulse. The same pair js/game.js motionReduced
// reads: the OS flag, OR SETTINGS › APPEARANCE › MOTION: REDUCED
// (html[data-motion], js/ui/title-fx.js), both live.
const _rmq = (typeof window !== "undefined" && window.matchMedia)
  ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
const motionReduced = () => !!(_rmq && _rmq.matches)
  || (typeof document !== "undefined" && !!document.documentElement && document.documentElement.dataset.motion === "reduce");
// F-01: browsers without Element.currentCSSZoom (iOS Safari < 26.4, Firefox < 126)
// still paint CSS zoom into getBoundingClientRect — divide by the published zoom.
// DOM-less mini-dom harnesses (no Element) keep the layout-px fallback of 1.
const _noCssZoom = typeof Element === "function" && !("currentCSSZoom" in Element.prototype);
// THE VIEWPORT, CACHED. innerWidth/innerHeight are not free on a phone: Blink's
// LocalDOMWindow::GetViewportSize() runs UpdateStyleAndLayout first whenever the
// mobile viewport is enabled (Android Chrome), so each read after a DOM write is
// a forced layout, and the 10 Hz tick read them after this frame's writes in
// the fit key, gapForm and the minimap key. Re-read once after resize,
// orientationchange or a visualViewport resize (pinch zoom changes innerWidth
// with no window resize). iOS fires resize/orientationchange while the sizes
// still hold the portrait numbers and may fire nothing once they land
// (js/ui/sheet-shape.js SETTLE_MS, webkit 170595), so reads stay live for
// VP_SETTLE_MS after each event — a rotation is re-laying the page anyway. With
// no event source (the node VM harnesses set `innerWidth` directly) every read
// stays live, as before.
const VP_SETTLE_MS = 2000;   // > sheet-shape's last 1500 ms re-ask
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
function vpSync() { if (_vp.stale) { _vp.w = window.innerWidth; _vp.h = window.innerHeight; _vp.stale = _vp.live || _vpNow() < _vp.until; } }
const vpW = () => { vpSync(); return _vp.w; };
const vpH = () => { vpSync(); return _vp.h; };

// GameHud.invalidateFit(): the live instance's re-fit trigger (null until create).
let _invalidateFit = null, _syncPhoneFit = null;
function create(G) {
Log.info("ui", "GameHud.create");

const els = G.els;
const mm = els.minimap.getContext("2d");
let hudT = 0;                 // ms until the next throttled HUD tick
const HUD_TICK_MS = 100;      // ~10 Hz in WALL time, whatever the display refresh
let minimapBg = null;         // offscreen canvas with pre-rendered track shape
let minimapBgKey = "";        // cssW|cssH|ratio it was rendered for — NOT the
                              // derived (W,H): 140css@2x and 280css@1x share a
                              // bitmap size but need different path transforms
let _mmKey = null, _mmCssW = 140, _mmCssH = 140, _mmRatio = 1;  // measure cache
let _mmBgKey = "140|140|1";   // cssW|cssH|ratio of that cache, rebuilt only when it re-measures
let _mmPitP = null, _mmYou = "#aeea00";   // the "P"'s local px + map node, and the resolved --you; set with the bg
let _flagShown = false;       // B1 caution-flag visibility cache (avoid layout thrash)
let _flagSaid = "";   // the caution text last sent to #announce-live
let _teamSkin = null;         // last team id pushed to <html data-team> (skins the HUD accent)
let _teamSkinRev = -1;        // …and the store rev it was written at (a CUSTOM team's colour is editable)
let _redline = false;         // tach redline latch: on above 92% of MAX_RPM, off again below 89%
// Where the tyre bar turns amber. 70% of the set's life is the point a stop
// stops being hypothetical — F1 games teach "pit before 65-75% wear" and it is
// far enough out that a player still has a lap or two to act on it.
const TYRE_WARN = 0.70;

const _hudTxt = new WeakMap();   // el -> last textContent
const _hudSty = new WeakMap();   // el -> { prop: lastVal }; remove through hUnstyle, or an equal rewrite is skipped
const _hudCls = new WeakMap();   // el -> last className
const _hudTog = new WeakMap();   // el -> { cls: lastBool }
function hText(el, v) { if (!el) return; if (_hudTxt.get(el) !== v) { _hudTxt.set(el, v); el.textContent = v; } }
function hStyle(el, prop, v) { if (!el) return; let m = _hudSty.get(el); if (!m) { m = {}; _hudSty.set(el, m); }
  if (m[prop] !== v) { m[prop] = v; if (prop.charCodeAt(0) === 45) el.style.setProperty(prop, v); else el.style[prop] = v; } }
function hUnstyle(el, prop) { if (!el) return; const m = _hudSty.get(el); if (m) delete m[prop]; if (el.style && el.style.removeProperty) el.style.removeProperty(prop); }
function hClass(el, v) { if (!el) return; if (_hudCls.get(el) !== v) { _hudCls.set(el, v); el.className = v; } }
function hToggle(el, cls, on) { if (!el) return; let m = _hudTog.get(el); if (!m) { m = {}; _hudTog.set(el, m); } if (m[cls] !== on) { m[cls] = on; el.classList.toggle(cls, on); } }
function hAttr(el, name, value) { if (!el) return; const v = String(value); if (el.getAttribute(name) !== v) el.setAttribute(name, v); }
// Compare the actual DOM so an external edit is repaired on the next tick.
// Avoid repeated attribute mutations; hidden writes feed the visibility observer.
function hHidden(el, on) { if (el && el.hidden !== !!on) el.hidden = !!on; }
function hData(el, name, value) {
  if (!el || !el.dataset) return;
  if (value === null) { if (name in el.dataset) delete el.dataset[name]; }
  else { const v = String(value); if (el.dataset[name] !== v) el.dataset[name] = v; }
}
function replayGhost() { return GhostShare.hasGuest() ? GhostShare : Ghost; }
let _lastRank = 0, _posFlashT = 0;   // POS box flash state, ms left (see the tick)
// Team colours are static — compute once per team, the minimap's idiom.
// Keyed on the store revision, exactly as _livResolveCache is (js/game.js):
// a CUSTOM team's colours are editable in the garage, and an unkeyed memo on
// the shared Teams.LIST entry would paint a stale rail for the page's life.
const teamCss = (c) => {
  const t = c.team;
  if (!t) return "";
  const rev = G.store ? G.store.rev : 0;
  if (t._cssColor == null || t._cssRev !== rev) { t._cssColor = G.cssCol(t.color); t._cssRev = rev; }
  return t._cssColor;
};
let _secRows = null;
let _secFlash = [0, 0, 0];
// THE GAIN, not only the split: each sector row shows the split's delta to the
// best it was chasing for SPLIT_DELTA_MS, then the absolute time again.
// _secPrevBest is sectorBests as the last tick saw it — game.js writes the new
// best in the same crossing that writes sectorLast, so only the copy taken
// BEFORE the crossing still holds the time this split was measured against.
const SPLIT_DELTA_MS = 3000;
let _secPrevBest = [Infinity, Infinity, Infinity], _secDelta = [0, 0, 0], _secDeltaT = [0, 0, 0];
// The lap clock's hold on the lap just driven (see the tick): the lap count and
// lastLap as the last tick saw them, and whether this lap's hold is armed.
let _holdLap = 0, _holdPrev = 0, _holdOn = false;
let _limitsDots = null;
let _hudCamMode = null, _hudCamProf = null;   // compared field by field: no key string per frame
// The readouts js/ui/hud-readouts.js derives (gap laps, ERS, BB, blue flag, the
// race DELTA's best-lap trace, the spoken HUD). Optional: the node HUD harness
// boots hud.js without it, and every use below is guarded on _ro.
const _ro = typeof HudReadouts !== "undefined" ? HudReadouts : null;
// The runtime team accent (js/ui/hud-skin.js); absent in a bare node harness, where the accent is left to the cascade.
const _skin = typeof HudSkin !== "undefined" ? HudSkin : null;
const _trace = _ro ? _ro.lapTrace() : null;
const _speak = _ro ? _ro.speaker(els.announceLive) : null;
const _doc = typeof document !== "undefined" ? document : null;
const _rx = _doc ? { delta: _doc.getElementById("hud-delta"), deltaN: _doc.getElementById("hud-delta-n"),
  energyBox: _doc.getElementById("hud-energy"), energyN: _doc.getElementById("hud-energy-n"),
  bb: _doc.getElementById("hud-bb") } : {};
let _ePrev = NaN, _blue = false, _blueSaid = null, _blueLaps = 0;
const BCAM_IDS = { heli: 1, side: 1, cinematic: 1, low: 1, overhead: 1, rival: 1, pitwall: 1, drone: 1 };
const ONBOARD_IDS = typeof CamGroups !== "undefined" ? CamGroups.ONBOARD : {};   // js/camera/cam-groups.js
const MET_LAYOUTS = ["full", "timing", "driver", "compact"];
// Body classes toggled: hud-met-full, hud-met-timing, hud-met-driver, hud-met-compact.
// AUTO is always the full set: fitHud() scales / stacks / drops the gap strip
// when a band is tight, so nothing has to be hidden to make room. The old
// resolver hid a cluster from the PROFILE or from those caps too, which made
// MAP+GAPS+timing+driver mutually exclusive and let a layout overrule the
// player's own MAP toggle.
// A FORCED NAME STILL STRIPS CHROME, because that is the only thing the LAYOUT
// control means — and with the hide rules gone from AUTO it can no longer fire
// behind the player's back. css/hud.css keys those rules on hud-met-timing /
// -driver / -compact, which this resolver emits ONLY for a forced name.
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
// The last inputs and outcomes, compared field by field — the same test the
// 7-part key string made, without building that string every frame.
const _hudVis = { map: null, gaps: null, mode: null, prof: null, hideMap: null, hideGaps: null, mapLow: null };
function syncHudVisClasses(modeId) {
  const onboard = !!ONBOARD_IDS[modeId];
  const prof = G.hudProfile || "standard";
  // MAP AUTO: hide onboard (cockpit/hood/tcam/visor/helmet) or MINIMAL so the view stays clear.
  const hideMap = resolveHudVis(G.hudMapVis, onboard || prof === "minimal");
  // GAPS do not AUTO-hide onboard — from a cockpit you cannot see the car
  // behind you. GAPS: OFF still hides it. MINIMAL still auto-hides chrome.
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
    // No hud-onboard class here: the per-widget MAP/GAPS settings own that.
    // ONBOARD_IDS is still live — syncHudVisClasses() reads it for MAP-AUTO.
    body.classList.toggle("hud-bcam", !!BCAM_IDS[modeId]);
    body.classList.toggle("hud-prof-minimal", prof === "minimal");
    body.classList.toggle("hud-prof-broadcast", prof === "broadcast");
    // MOVE & SIZE keeps one layout for the cockpit cameras, one for the rest.
    if (typeof HudLayout !== "undefined") HudLayout.setCam(modeId);
  }
  // MAP/GAPS (and broadcast park) must re-run when only the setting
  // changes — camera+profile stay put, so the key above does not.
  syncHudVisClasses(modeId);
}
// game.js calls this at the crossing, after writing sectorLast[i] and the new
// best — so the delta is taken against the pre-crossing copy (_secPrevBest).
// A first-ever split has nothing to beat and keeps the absolute time.
function flashSector(i) {
  if (!(i >= 0 && i < 3)) return;
  _secFlash[i] = 0.35;
  const t = G.sectorLast && G.sectorLast[i];
  const ok = t != null && isFinite(_secPrevBest[i]);
  _secDelta[i] = ok ? t - _secPrevBest[i] : 0;
  _secDeltaT[i] = ok ? SPLIT_DELTA_MS : 0;
}
// "tt" | "quali" | "practice" | "race". PRACTICE is G.practice (armed on a race
// session from the pause menu), never a G.session value.
function sessionOf(timeTrial) {
  return timeTrial ? "tt" : G.session === "quali" ? "quali" : G.practice ? "practice" : "race";
}

function paintHudDelta(player, timeTrial) {
  const box = _rx.delta;   // static in index.html (.hud-top) — no injected markup
  if (!box) return;
  const n = _rx.deltaN || box;
  // Prefer a ghost reference (PB or rival). Without one, the player's own best
  // lap THIS RACE (HudReadouts.lapTrace, sampled per frame in updateHud); with
  // neither — the opening lap of a race — nothing.
  const ghost = typeof GhostShare !== "undefined" && GhostShare.hasGuest()
    ? GhostShare
    : (typeof Ghost !== "undefined" && Ghost.hasGhost() ? Ghost : null);
  const ref = ghost || (_trace && _trace.has() && (player.lap | 0) >= 1 ? _trace : null);
  hData(box, "ref", ghost ? "ghost" : ref ? "best" : null);
  // THE SLOT IS RESERVED ON DESKTOP, NOT REMOVED: a hidden DELTA that unhid
  // after lap 1 widened the centred tower by half a box mid-race, so every
  // other readout jumped sideways. With no number yet the plate keeps its
  // place with only its value invisible (data-pending, css/hud.css), so the
  // four live boxes read centred too. ON TOUCH the pending plate leaves the
  // layout instead: its ~95px of top-band width capped the band at ~0.95 and
  // dropped the gap chip under the tower on every phone (hud-mock
  // 2026-10-14); the one re-centre at the first lap line costs less, and the
  // paint below asks for a refit the moment the number lands (the fit key
  // must not carry it: hud-fit-idempotent pins two fits as one).
  hHidden(box, false);
  // S4: before the first line crossing lapTime is the run-up clock (about 5.5 s
  // of it on a flying start), not the lap the ghost was recorded on.
  const ghostT = ref && (!ghost || (player.lap | 0) >= 1) ? ref.timeAt(player.s) : null;
  if (ghostT == null || !(player.lapTime >= 0)) {
    hData(box, "pending", "");
    if (_deltaShown && _invalidateFit && !document.body.classList.contains("desktop")) _invalidateFit();   // the touch tower just lost a box (TT restart, lap 0, lost ghost)
    _deltaShown = false;
    return;
  }
  _deltaShown = true;
  const wasPending = box.dataset ? box.dataset.pending != null : box.hasAttribute && box.hasAttribute("data-pending");
  hData(box, "pending", null);
  if (wasPending && _invalidateFit && !document.body.classList.contains("desktop")) _invalidateFit();   // the touch tower just grew a box
  const delta = player.lapTime - ghostT;
  const deltaTxt = signedFixed(delta);
  hText(n, deltaTxt);
  hData(box, "sign", deltaTxt[0] === "-" || +deltaTxt === 0 ? "fast" : "slow");   // the ROUNDED sign, like the text
  // Practice / TT: the gaps strip already says GHOST — keep DELTA as the
  // glanceable centre-top number. Race: same chip, quieter label stays DELTA.
  void timeTrial;
}
// The sign comes from the ROUNDED value: -0.0003 painted "-0.000" (R2-06).
function signedFixed(v) {
  const t = v.toFixed(3);
  return +t === 0 ? "+0.000" : (v > 0 ? "+" : "") + t;
}
function buildSecRows() {
  // Sector labels carry no identity colour: .sec-lbl inherits the row's ink.
  // (S2 once wore the brand #e10600, ~4.2:1 on black at 14px — under the
  // 4.5:1 AA floor; no HUD text uses the brand red.)
  // Should they ever be coloured, they must NOT use the value palette's
  // --sec-best or --faster, or purple would mean both "sector 1" and
  // "session best". The minimap colours its arcs by sector (drawMinimap:
  // the podium metals, TrackMaps.sectorColors), where identity is the only
  // thing distinguishing them.
  const labels = ["S1", "S2", "S3"];
  els.hudSectors.textContent = "";
  _secRows = [];
  for (let i = 0; i < 3; i++) {
    const row = document.createElement("div"); row.className = "sec-row";
    // The label keeps the row's dim ink: sector identity colours only the
    // minimap's arcs, so a label can never collide with a timing colour.
    const lbl = document.createElement("span"); lbl.className = "sec-lbl"; lbl.textContent = labels[i];
    const val = document.createElement("span"); val.className = "sec-val"; val.textContent = "--";
    row.appendChild(lbl); row.appendChild(val); els.hudSectors.appendChild(row);
    _secRows.push(val);
  }
  if (els.hudLimits) _limitsDots = els.hudLimits.querySelector("span");
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
// Every read here is cheap. Both custom properties are
// INLINE declarations this file's own passes write (applyScale writes
// --hud-scale; the fit pass writes --hud-z-top when its cap binds) — string
// reads, not getComputedStyle, so they force no style or layout pass — and
// the width is the cached vpW() (innerWidth itself lays out on Android). The
// gaps strip PAINTS at the capped --hud-z-top, so that is the divisor when present; the raw slider is only the fallback
// before the first fit. Nothing here asks the layout engine anything, so it
// can simply run every tick and follow a window resize for free.
const GAP_SHORT_AT = { narrow: 640, wide: 800 };
const GAP_DROP_AT  = { narrow: 550, wide: 800 };
// Set by fitHud() from the real measured fit; null until it has run against a
// laid-out page (the VM harness never lays out, so the ratio table below stays
// the fallback there and off-screen). A ratio of viewport to zoom cannot see
// the notch, the live gap string or the chip's own padding — all three of
// which decide whether the strip actually fits — so the measurement wins
// wherever there is one.
let _gapTight = null, _gapDrop = null;
// [short, long] intrinsic width of `.hud-gaps`, each learned the tick it is on
// screen. fitHud needs BOTH to answer its two questions without feeding its own
// output back in — see the rung comment there.
const _gapW = [0, 0];
// The gap is distance ÷ the PLAYER'S OWN speed, so under braking the divisor
// halves within a second and the tenths jumped 2x between ticks (10 Hz) with
// the rival not having moved relative to the car. Smooth the displayed
// seconds (EMA, ~0.3 s at 10 Hz) per slot; a neighbour change resets the
// slot so a new rival never inherits the old one's lag.
const _gapSm = [NaN, NaN], _gapWho = [null, null];
function gapDecimals(sec) {
  // Shared with REL / tower via HudReadouts: two decimals under ~10 s on every
  // profile (Overtake unlock ~1.0 s); see HudReadouts.gapDecimals.
  if (_ro && typeof _ro.gapDecimals === "function") return _ro.gapDecimals(G.hudProfile, sec);
  return (G.hudProfile || "standard") === "broadcast" ? 2 : (Number.isFinite(sec) && Math.abs(sec) < 9.95 ? 2 : 1);
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
  // SHORTEN FIRST, DROP SECOND — they were wired to different signals, so the
  // widget fell to its own line while still painting the WIDEST spelling
  // ("▲ STR +6.3s" below the map, reported from a phone). `drop` read the
  // measured fit; `short` still read the ratio table below, which on a roomy
  // ratio says "no need", and the two never agreed.
  //
  // Both are measured now, and the rungs are ordered by what they cost:
  // shorten (loses the driver code) before drop (loses the alignment with the
  // top of the minimap). fitHud settles it in at most two passes without any
  // width model — `gapLen` is part of its re-run key, so changing the spelling
  // re-measures on the next tick, and `_gapDrop` only latches once the strip
  // is ALREADY short and still does not fit.
  const short = _gapTight != null ? _gapTight : ratio <= GAP_SHORT_AT[k];
  const drop = _gapDrop != null ? _gapDrop : ratio <= GAP_DROP_AT[k];
  if (short !== ("gapShort" in root.dataset)) {
    if (short) root.dataset.gapShort = "1";
    else delete root.dataset.gapShort;
  }
  // Compared against the DOM rather than a remembered value: a module-level cache
  // desyncs the moment anything else touches the attribute (a dev tool, a probe,
  // a future panel) and then never repairs itself. Reading an attribute is as
  // cheap as reading a field and cannot go stale.
  if (drop !== ("gapDrop" in root.dataset)) {
    if (drop) root.dataset.gapDrop = "1";
    else delete root.dataset.gapDrop;
  }
  // The radio card's caution step follows the chip through `:root[data-gap-drop] #announce { --flag-slot-top }`
  // (css/hud.css, #1345): no body mirror needed.
  return short ? _gapFormShort : _gapFormLong;
}
// A LAP OR MORE IS LAPS, NOT SECONDS. distance ÷ the player's speed is a fair
// stand-in for a few hundred metres; for a car a lap up it read "+76.2s" — a
// number no timing screen would show, and one that moved with the player's
// throttle. A whole lap apart spells "+1L" / "-1L" (HudReadouts.lapsApart), and the
// slot's EMA restarts so the seconds do not glide in from a lap's worth.
function gapText(slot, gap, arrow, o, dist, vFloor) {
  const n = _ro && G.track ? _ro.lapsApart(dist, G.track.total) : 0;
  if (n) { _gapWho[slot] = null; return _ro.lapGapText(arrow, o.code, slot ? -n : n, gap === _gapFormShort); }
  return gap(arrow, o.code, gapSec(slot, o, dist / vFloor));
}
// Hoisted: gapForm runs every HUD tick — returning fresh arrows was 2 closures
// per call for two constant formats.
const _gapFormShort = (arrow, code, t) => arrow + " " + t;
// NO SIGN: the arrow IS the direction. A "+" on the AHEAD chip contradicted
// RELATIVE (js/ui/hud-relative.js), where ahead is "-" — the same car read
// "+1.2s" in one box and "-1.2" in the other. Whole laps keep RELATIVE's own
// spelling (slot 0 "+nL" = a lap up, slot 1 "-nL" = a lap down), so the two
// never disagree.
const _gapFormLong = (arrow, code, t) => arrow + " " + code + " " + t + (/\d/.test(t) ? "s" : "");   // "--" is not a number of seconds

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
const ROW_AIR = 2;               // px between the tower's bottom and the sector plate's top (touch)
let _fitKey = "", _fitWait = 0, _fitRetry = 0, _fitClearSeq = 0, _hlEls = [];
let _fitPending = false;   // invalidateFit mid-tick: do not publish --hud-fit-stamp until the next fitHud
// _fitStamped: a stamp is published and no clash has voided it since.
// _fitClashRun: consecutive same-key ticks that re-opened the fit for a clash.
let _fitStamped = false, _fitClashRun = 0;
const FIT_CLASH_TRIES = 5;
// Per moved piece: hidden, or visible + the LENGTH of its words. A moved piece's
// width is part of what HudLayout.fit clamps, and the AERO chip's words change
// all lap ("AERO 523m" counting down, AERO ZONE, STRAIGHT MODE, CORNER MODE):
// keyed on `hidden` alone it widened past the screen edge after the fit and
// stayed there until the 3 s same-key re-measure (hud-survey 1280x720 cockpit:
// aero right edge 1297 of 1280). textContent costs no layout; a length that
// changes re-fits once, and the countdown only does so when a digit rolls over.
function hlKey() { let k = ""; for (let i = 0; i < _hlEls.length; i++) { const el = _hlEls[i]; k += el.hidden ? "h" : "v" + (el.textContent || "").length + ","; } return k; }
// THE TWO READS THE FIT MEMO NEVER COVERED. Both getComputedStyle(root) calls
// in fitHud sat ABOVE its `_fitWait` early return, so the 3 s same-key backoff
// paced the getBoundingClientRect pass and nothing else: these ran at the full
// ~10 Hz HUD tick, in every race, for every player. And the computed read is
// the DEFAULT path rather than the exceptional one — root.style is empty until
// the player touches HUD SIZE, so an untouched slider means both reads every
// tick forever.
//
// getComputedStyle itself is cheap; getPropertyValue against a dirty tree is
// not, and the tree is dirty by construction — syncHudLayoutClasses() runs
// immediately before fitHud(), and the end-of-tick call follows the tick's writes.
//
// What they read are STYLESHEET defaults, from `@media (pointer: coarse)` and
// the viewport, so they can only change when the viewport or the body classes
// change. That is the same layout-free pair already in the fit key, so cache on
// it: one flush per real change instead of twenty a second. Measured on this
// project's own instrument before and after at 0.1 ms/s of accessor time in a
// container whose tree stays clean — so this is a structural fix, not a
// measured win, and the honest claim is that it removes a per-tick flush whose
// cost depends on a tree this box does not reproduce.
let _cssRootKey = "", _cssScale = 1, _cssMult = 1;
function syncComputedRootVars() {
  const k = vpW() + "x" + vpH() + "|" + document.body.className;
  if (k === _cssRootKey) return;
  _cssRootKey = k;
  // typeof-guarded: this module is exercised in a VM on tests/helpers/mini-dom,
  // which has no getComputedStyle — the same guard the reads below carried.
  if (typeof getComputedStyle !== "function") { _cssScale = 1; _cssMult = 1; return; }
  // ONE CSSStyleDeclaration for both: the flush happens on first access, so two
  // getComputedStyle calls were two chances to pay for it.
  const cs = getComputedStyle(document.documentElement);
  _cssScale = +cs.getPropertyValue("--hud-scale") || 1;
  // calc() in a custom property is not reduced at computed-value time — the
  // token reads back as a literal string and coerces to NaN — so --hud-btn-mult
  // is resolved from its own factor rather than parsed out of the calc.
  _cssMult = +cs.getPropertyValue("--hud-btn-mult") || 1;
}
let _hudTop = null, _hudBottom = null, _dockL = null, _dockR = null;   // the four fit handles never change identity
// LEFT-HANDED (body.mirror-controls) flips #hud-dock (row-reverse), so #dock-right paints on the LEFT. The fit
// reasons in screen sides, so pick each handle by the side it is painted on (re-picked at every fit).
let _dockMir = null, _deltaShown = false;   // _deltaShown: DELTA has painted a number since it last went pending
function pickDocks() { const m = document.body.classList.contains("mirror-controls"); if (_dockL && m === _dockMir) return; _dockMir = m; const a = document.getElementById("dock-left"), b = document.getElementById("dock-right"); _dockL = m ? b : a; _dockR = m ? a : b; }
// THE BUDGET IS THE UN-MOVED LAYOUT. MOVE & SIZE (js/ui/hud-layout.js) paints a
// player offset on top of each element with `translate` / `scale` (data-hl,
// --hl-x/-y in screen %, --hl-s, origin --hl-o), and getBoundingClientRect
// includes both. Budgeting fitHud's bands from those rects made a moved map or
// a SIZE-200 gearbox shrink the WHOLE band, the pedals and the safe-area
// insets, so fitHud asks every rect it budgets of the layout the offset sits on.
// Undone in arithmetic rather than by stripping data-hl for a measuring pass:
// no style churn, no MutationObserver traffic, nothing a transition could catch
// mid-way. The screen translate is exactly --hl-x% of innerWidth (the CSS divides
// by the band zoom for that; HudLayout.fit corrects in the same units). A scale
// about origin O maps the un-moved box U to O + t + s*(U - O); O sits in the box
// BEFORE the element's own `transform` (the centred pieces' translateX(-50%)),
// whose shift d is read as a share of the layout box, so
// U.left = moved.left - t + (fx*w - d)*(s - 1).
const _HL_O = { left: 0, right: 1, top: 0, bottom: 1 };
function layoutRect(el) {
  const r = el.getBoundingClientRect();
  const clearX = parseFloat(el.style.getPropertyValue("--hud-clear-x")) || 0;
  const clearY = parseFloat(el.style.getPropertyValue("--hud-clear-y")) || 0;
  if (!r.width || !el.hasAttribute || !el.hasAttribute("data-hl")) return clearX || clearY
    ? { ...r, left: r.left - clearX, right: r.right - clearX, top: r.top - clearY, bottom: r.bottom - clearY, width: r.width, height: r.height } : r;
  const st = el.style, s = +st.getPropertyValue("--hl-s") || 1;
  const w = r.width / s, h = r.height / s;
  let left = r.left - clearX - (+st.getPropertyValue("--hl-x") || 0) * window.innerWidth / 100;
  let top = r.top - clearY - (+st.getPropertyValue("--hl-y") || 0) * window.innerHeight / 100;
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
  const t = _hudTop ? laneRect(_hudTop) : null;
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
  for (const d of [_dockL, _dockR]) if (d) for (const g of d.children) clip(laneRect(g), true);
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
  const on = any && w > 0;
  const collapsed = !on && any && secR && secR.width;
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
  let k = vpW() + "x" + vpH() + "|" + _fitKey + "|" + document.body.className + "|"
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
  for (const d of [_dockL, _dockR]) if (d) for (const g of d.children) k += g.hidden ? "h" : "v";
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
  const t = _hudTop ? _hudTop.getBoundingClientRect() : null;
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
    for (const d of [_dockL, _dockR]) if (d) for (const g of d.children) bound(g.getBoundingClientRect(), false, wrapBot);
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
  for (const d of [_dockL, _dockR]) if (d) for (const g of d.children) obst.push(g);
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
    const tower = _hudTop || (typeof document !== "undefined" ? document.querySelector(".hud-top") : null);
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
  return _fitKey + "|" + _laneKey + "|" + v("--announce-lane-w") + v("--announce-lane-x") + v("--announce-lane-shift")
    + "|" + a.className + (a.hasAttribute("data-lane-collapsed") ? "c" : "") + "|" + a.textContent + "|" + document.body.className;
}
function radioPaintedCollapseTick(root, force) {
  const k = radioPaintedKey(root);
  if (!force && k && k === _rpcKey && --_rpcWait > 0) return;
  radioPaintedCollapse(root);
  _rpcKey = radioPaintedKey(root); _rpcWait = 30;
}
// THE MIRROR AS PAINTED, for the centre column under it. The flag and the
// radio card clear the mirror through --mir-bot (css/hud.css), which is built
// from the mirror's SHIPPED box — so a mirror MOVE & SIZE grew (s150) or moved
// down (y+10) sat over the caution flag (survey 2026-10-04, 1280x720: #hud-flag
// under #hud-mirror by 185x25 / 185x36). Published in SCREEN px, and only while
// the painted frame actually crosses the centre column the two hang in (a
// mirror moved aside frees it); css/hud.css folds it into --mir-bot with a
// max(), so it can only ever push them further down. Nothing the mirror's own
// box depends on reads it, so it cannot feed back. Run inside the fit: a move
// re-fits through HudLayout.apply, and hud-mirror-on is in the fit key.
const MIR_COL = 230;   // half-width of the centre column, px: the widest card at 440 plus its air
let _mirEl;
function mirrorClear(root) {
  if (_mirEl === undefined) _mirEl = document.getElementById("hud-mirror");
  const on = _mirEl && !_mirEl.hidden && document.body.classList.contains("hud-mirror-on");
  const r = on ? _mirEl.getBoundingClientRect() : null, cx = window.innerWidth / 2;
  const b = r && r.width && r.left < cx + MIR_COL && r.right > cx - MIR_COL ? r.bottom : 0;
  hStyle(root, "--mir-paint-b", b.toFixed(1) + "px");
}
/** Conservative rect overlap — same 0.5 px slack as hud-layout.spec.js probes. */
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
  if ((br.left + br.right) / 2 < window.innerWidth / 2) return null;
  return boost;
}
let _hudGaps = null;
/** True when the gap plate is painted beside the map and still rects onto the tower. */
function towerGapsPaintedClash() {
  if (document.body.classList.contains("desktop")) return false;
  if (document.documentElement.dataset.gapDrop) return false;
  const tower = _hudTop || (typeof document !== "undefined" ? document.querySelector(".hud-top") : null);
  if (!_hudGaps || !_hudGaps.isConnected) _hudGaps = document.querySelector(".hud-gaps");
  const gaps = _hudGaps, bc = document.body.classList;
  // css/hud.css hides the strip outright under these: no computed-style read needed.
  if (!tower || !gaps || gaps.hidden || bc.contains("hud-hide-gaps") || bc.contains("bc-on")) return false;
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
/** Drop the gap strip under the tower when the painted boxes still overlap (hud-layout: .hud-top+.hud-gaps). */
function gapPaintedDrop() {
  if (!towerGapsPaintedClash()) return false;
  _gapDrop = true;
  document.documentElement.dataset.gapDrop = "1";
  const gaps = document.querySelector(".hud-gaps");
  if (gaps) void gaps.offsetHeight;
  return true;
}
/** Painted phone readout-on-control clashes the spec measures (not budget math). */
function phonePaintedClash(boostIn) {
  if (document.body.classList.contains("desktop")) return false;
  if (towerGapsPaintedClash()) return true;
  const sectors = els.hudSectors;
  const boost = boostIn !== undefined ? boostIn : _boostOnRightHalf();   // a caller that already measured it this tick passes it
  if (sectors && !sectors.hidden && boost && _hudRectsHit(sectors.getBoundingClientRect(), boost.getBoundingClientRect())) return true;
  const rel = typeof document !== "undefined" ? document.getElementById("hud-rel") : null;
  if (rel && !rel.hidden) {
    const rr = rel.getBoundingClientRect();
    // Pedals are #btn-* siblings, not #dock-left children (index.html).
    if (_dockL) {
      for (const g of _dockL.children) {
        if (g.hidden) continue;
        const box = g.getBoundingClientRect();
        if (box.width && box.height && _hudRectsHit(rr, box)) return true;
      }
    }
    const pedalSteer = [els.btnBrake, els.btnThrottle, els.btnSteerLeft, els.btnSteerRight];
    for (let i = 0; i < pedalSteer.length; i++) {
      const el = pedalSteer[i];
      if (!el || el.hidden) continue;
      const box = el.getBoundingClientRect();
      if (box.width && box.height && _hudRectsHit(rr, box)) return true;
    }
  }
  return false;
}
/** Phone-only: after REL/sectors/announce land, re-fit rows and publish stamp. */
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
    try { sarPx = parseFloat(getComputedStyle(root).getPropertyValue("--sar")) || 0; } catch (_) { /* */ }
    const midCap = Math.max(0, (window.innerWidth / 2) / z - 10 - sarPx / z);
    const need = Math.min(
      Math.max(0, (window.innerWidth - br.left) / z - 10 - sarPx / z + DOCK_AIR / z),
      midCap
    );
    hStyle(root, "--dock-r-w", (need > 0 ? need : 0).toFixed(1) + "px");
    if (els.hudSectors) void els.hudSectors.offsetHeight;
    if (_dockR) void _dockR.offsetHeight;
    return true;
  };
  const shrinkSectors = () => {
    const secEl = els.hudSectors;
    const boost = _boostOnRightHalf();
    if (!secEl || secEl.hidden || !boost) return false;
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
  // REL's own tick already re-fit it if its key moved; fitRows writes then reads,
  // so an unconditional call here forced a layout every phone tick (#2151).
  if (typeof HudRelative !== "undefined") { if (HudRelative.refit) HudRelative.refit(force); else if (HudRelative.fitRows) HudRelative.fitRows(); }
  // One probe per pass: the verdict after the last pass feeds the stamp below.
  let clash = phonePaintedClash();
  for (let pass = 0; pass < 8 && clash; pass++, clash = phonePaintedClash()) {
    if (gapPaintedDrop()) continue;
    if (typeof HudRelative !== "undefined" && HudRelative.fitRows) HudRelative.fitRows();
    bumpDock();
    shrinkSectors();
  }
  // A custom property written on <html> invalidates style for the whole tree and
  // wakes sheet-shape's watchScale observer, so the 10 Hz tick must not rewrite
  // it while nothing changed. A new stamp means "a clash cleared" (or a probe
  // asked via syncPhoneFit, whose waiters need a fresh value each call).
  if (!clash && !_fitPending) {
    if (force || !_fitStamped) {
      _fitClearSeq = (_fitClearSeq + 1) | 0;
      hStyle(root, "--hud-fit-stamp", String(_fitClearSeq));
      _fitStamped = true;
    }
  } else { hStyle(root, "--hud-fit-stamp", ""); _fitStamped = false; }
}
function fitHud() {
  // Cinematic HUD: OFF and "any open .screen" hide #hud via display:none.
  // Measuring then is a forced reflow on a 0×0 box (~10 Hz) that cannot
  // change a cap — skip until the HUD is visible again (className is in
  // the fit key, so the next tick re-fits).
  if (document.body.classList.contains("hud-hidden")) return;
  const root = document.documentElement;
  // INLINE first (the player moved HUD SIZE), else the COMPUTED value — not a
  // bare `|| 1`. The coarse-pointer default lives in the stylesheet, not in
  // root.style, so the inline read is empty until the slider is touched: a bare
  // fallback reports 1 while the HUD renders at whatever `@media (pointer:
  // coarse)` says, and every `cap < scale` comparison below is then judged
  // against the wrong number. Harmless while that default IS 1 (which
  // tests/unit/scale-defaults.test.mjs pins), and exactly the defect that sized
  // the dock cap 25% small when --hud-btn-scale grew a ratio — same shape, same
  // fix. typeof-guarded for the mini-dom VM, as the btnScale read is.
  // Both computed-root reads, once, behind a layout-free key — see
  // _cssRootKey above for why they could not stay where they were.
  syncComputedRootVars();
  const scale = +root.style.getPropertyValue("--hud-scale") || _cssScale;
  // body.className is part of the key: cycling STEERING MODE re-parents the
  // dock groups (layoutDocks), so the tallest column's height changes while
  // viewport and scale do not — without it the key holds the stale dock cap for
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
  // The sector box grows from bare padding to three rows the first time
  // buildSecRows runs, and --hud-sec-h (the offset the track-limits chip hangs
  // off) is measured from it. Nothing else in this key moves at that moment, so
  // without the row count the published height stayed at the empty box's for
  // the whole 3 s same-key backoff. childElementCount costs no layout.
  const secRows = els.hudSectors ? els.hudSectors.childElementCount : 0;
  // BUTTON SIZE is independent, including its unset CSS default.
  const mult = _cssMult;
  const btnScale = +root.style.getPropertyValue("--hud-btn-scale") || mult;
  // DELTA unhides inside the centred tower mid-race (first valid best lap, or a
  // ghost in TT): it widens the tower, so it is part of the key, not left to the
  // 3 s same-key re-measure with the tower painted over the gap strip.
  // A MOVED piece that unhides is the same case for HudLayout.fit's on-screen
  // clamp, which skips whatever has no box: with CORNERS (energy/tyre x-34) at
  // 1280x720 TYRES unhid after the fit and ended at x -92 for good (survey
  // 2026-10-04). So each data-hl element's `hidden` is in the key — a list
  // re-read only on a full fit (HudLayout.apply invalidates it), a flag read
  // per tick, no layout.
  const head = vpW() + "x" + vpH() + "@" + scale + "+" + btnScale + "|" + gapLen + "." + secRows + (_rx.delta && !_rx.delta.hidden ? "d" : "") + "|";
  const tail = "|" + document.body.className;
  if (head + hlKey() + tail === _fitKey && --_fitWait > 0) {
    // Same-key backoff must not lock a short --dock-r-w while wrap-reverse
    // still crawls BOOST left under load (CI oversize APEX_WORKERS=2:
    // #hud-sectors+btn-boost after the wait already saw clearance).
    let clash = false, boost;
    if (!document.body.classList.contains("desktop") && els.hudSectors && !els.hudSectors.hidden) {
      const s = els.hudSectors.getBoundingClientRect();
      boost = _boostOnRightHalf();
      const b = boost ? boost.getBoundingClientRect() : null;
      // Only a RIGHT-half BOOST can clash with the sectors plate's dock inset.
      if (b && b.width && s.width && s.right > b.left - 8) clash = true;
      else {
        const ann = typeof document !== "undefined" ? document.getElementById("announce") : null;
        if (ann && !ann.hidden && !ann.hasAttribute("data-lane-collapsed")) {
          const a = ann.getBoundingClientRect();
          if (a.width > 0 && s.width && s.left < a.right - 0.5 && a.left < s.right - 0.5
              && s.top < a.bottom - 0.5 && a.top < s.bottom - 0.5) clash = true;
        }
      }
    }
    if (!clash && phonePaintedClash(boost)) clash = true;
    if (!clash) { _fitClashRun = 0; return; }
    // A clash the fit cannot resolve (REL x BRAKE when hud-relative's cap guard
    // refuses, S3 x BOOST at high HUD SIZE) re-opened the full fit, up to 8
    // passes of layout reads, on every 10 Hz tick. A few tries per key, then the
    // 3 s cadence; a changed key (below) starts over.
    if (++_fitClashRun > FIT_CLASH_TRIES) return;
    _fitWait = 0;
  }
  _hlEls = document.querySelectorAll ? document.querySelectorAll("[data-hl]") : [];
  const key = head + hlKey() + tail;
  // A CHANGED key (resize / hud-scale) re-fits at the next tick; the counter
  // only paces the same-key safety re-measure: 30 ticks at the ~10 Hz HUD
  // tick ≈ 3 s between forced layout reads while nothing changed.
  if (key !== _fitKey) _fitClashRun = 0;
  _fitKey = key; _fitWait = 30;
  _fitPending = false;
  // The dock paints at max(--hud-btn-floor, BUTTON SIZE) (css/touch-controls.css:
  // 0.82, 0.92 on the narrow tier), so the base the cap is judged against and
  // the divisor for its measured widths are that floor, not 1 — a flat 1 here
  // would read a 0.82 dock as 18 % wider than it paints. Read AFTER the
  // same-key return above: a steady tick must not pay a computed-style pass.
  let btnFloor = 1;
  // SINGLE SOURCE: the published band zooms, not el.currentCSSZoom.
  // Under load currentCSSZoom lags --hud-z-top by a frame (Pages
  // 37714419183: rect 87.11 = 110×zTop 0.792 while #minimap zoom read 0.704;
  // 142 = 110×0.862/0.666). Dividing getBoundingClientRect by that stale live
  // zoom over/under-estimates intrinsics and the next pass flips between
  // ~--hud-scale (uncapped) and the 0.4 floor. Measure with what we published.
  // No currentCSSZoom on a real DOM (iOS Safari < 26.4) still paints zoom into rects:
  // divide by pub (hud-pins F-01). Only DOM-less mini-dom harnesses fall back to 1.
  const zTopPub = +root.style.getPropertyValue("--hud-z-top") || scale;
  const zBotPub = +root.style.getPropertyValue("--hud-z-bot") || scale;
  let zDockPub = +root.style.getPropertyValue("--hud-z-dock") || Math.max(btnFloor, btnScale);
  const zoomDiv = (el, pub) => (el && (el.currentCSSZoom > 0 || _noCssZoom) ? (pub || 1) : 1);
  const wide = (el, pub) => {
    if (!el) return 0;
    const r = layoutRect(el);
    if (!r.width) return 0;
    return r.width / zoomDiv(el, pub);
  };
  // A child positioned OUT of the flow is not part of the cluster: landscape
  // touch anchors #hud-tyre on the LEFT DOCK (css/hud.css @supports anchor), so
  // counting it made the "cluster" span from the steer arrows to AERO, the bar's
  // width budget read ~480px for a 244px cluster, and the dock cap fell to 0.70
  // at the SHIPPED settings on 844x390 chase: 50px pedals, 38px taps in tilt
  // (hud-mock 2026-10-14). The tyre keeps its own clearance pass below.
  const outOfFlow = (c) => { try { const p = getComputedStyle(c).position; return p === "absolute" || p === "fixed"; } catch (_) { return false; } };
  const span = (el, pub) => {
    if (!el) return 0;
    let lo = Infinity, hi = -Infinity;
    for (const c of el.children) {
      if (c.id === "hud-tyre" && outOfFlow(c)) continue;
      const r = layoutRect(c);
      if (!r.width) continue;
      if (r.left < lo) lo = r.left;
      if (r.right > hi) hi = r.right;
    }
    return hi > lo ? (hi - lo) / zoomDiv(el, pub) : wide(el, pub);
  };
  if (!_hudTop) { _hudTop = document.querySelector(".hud-top"); _hudBottom = document.querySelector(".hud-bottom"); }
  pickDocks();
  const top = wide(_hudTop, zTopPub);
  // menu layer: nothing laid out, measure again next tick — but BOUNDED: an
  // unlatched key re-ran this whole rect pass (and drawMinimap's layout reads)
  // 10×/s for as long as the layout stayed empty, i.e. the entire countdown.
  // AN EMPTY TOWER IS NOT AN EMPTY HUD: with POS/LAP/TIME/BEST all switched off
  // (HUD ELEMENTS) `.hud-top` has no width for the whole race, and returning
  // here latched with no cap written at all — the dock's included. Only a HUD
  // with NOTHING laid out returns; an empty tower budgets as zero and falls
  // through, still retrying (bounded) in case it is merely not populated yet.
  let retry = !top;
  if (!top && !wide(els.minimap, zTopPub) && !wide(els.hudSectors, zTopPub) && !span(_hudBottom, zBotPub) && !wide(_dockL, zDockPub) && !wide(_dockR, zDockPub)) {
    if (++_fitRetry <= 30) _fitKey = "";
    return;
  }
  // The dock's painted floor (declared above): read past the nothing-laid-out retry, which a
  // harness without rects takes every tick, so the bail stays free of computed-style passes.
  try { const v = parseFloat(getComputedStyle(root).getPropertyValue("--hud-btn-floor")); if (Number.isFinite(v) && v > 0 && v <= 1) btnFloor = v; } catch (_) { /* mini-dom */ }
  zDockPub = +root.style.getPropertyValue("--hud-z-dock") || Math.max(btnFloor, btnScale);
  const half = window.innerWidth / 2;
  const map = wide(els.minimap, zTopPub), gaps = wide(els.gapA && els.gapA.parentNode, zTopPub);
  // THE SAFE-AREA INSET IS PART OF THE BUDGET. `.hud-gaps` and `#minimap` are
  // pushed right by `--sal` (and `#hud-sectors` left by `--sar`) in UNSCALED
  // screen px — `calc(10px + var(--sal) / var(--hud-z))` — while `.hud-top` is
  // centred on the raw viewport and compensates for neither. Budgeting the
  // left cluster from a literal 10 therefore under-counted its real span by
  // the whole inset: 59 px on a notched landscape iPhone, against FIT_AIR's
  // 10 px of designed daylight. The cap came out ≈ 1.0, never fired, and the
  // chips painted over the POS tile — reported from a phone, and invisible to
  // hud-layout.spec.js, which only ever compared HUD boxes against CONTROLS.
  // Measured off the elements themselves rather than read from env(), which is
  // not resolvable from script: the map's own left edge is `sal + z·10`.
  //
  // AND A HIDDEN ANCHOR HAS NO INSET TO READ. `display:none` gives an all-zero
  // rect, so `innerWidth - 0 - 10*sz` made `sar` the WHOLE VIEWPORT — and then
  // `(half - sar)` is negative, `capFor` returns a negative cap, and set()'s
  // 0.4 floor painted the entire HUD at 40 % zoom. Both profiles that hide the
  // sector box do it: `hud-prof-minimal` and every broadcast CAMERA outside the
  // broadcast profile (css/hud.css). That is the "the simple HUD just makes
  // everything tiny" report — the profile removed one box and the fit maths
  // read the removal as a viewport-wide inset. hud-layout.spec.js pins the
  // invariant it broke: in MINIMAL, the band's zoom with the sector box hidden
  // must not be SMALLER than with it forced back — removing a widget can only
  // ever need less room. Guarded on the rect having a WIDTH (laid out)
  // rather than on the class, so any future hide rule is covered too; the
  // fallback is the other side's measurement, which is right on every phone
  // whose notch is symmetric in landscape and never worse than 0.
  const mmR = els.minimap ? layoutRect(els.minimap) : null;
  const scR = els.hudSectors ? layoutRect(els.hudSectors) : null;
  const mz = zoomDiv(els.minimap, zTopPub), sz = zoomDiv(els.hudSectors, zTopPub);
  const salM = mmR && mmR.width ? Math.max(0, mmR.left - 10 * mz) : null;
  // THE RIGHT INSET IS THE TOKEN WHEN IT IS READABLE. On touch #hud-sectors is pushed inboard by
  // --dock-r-w (css/hud.css), so its right edge is the notch inset PLUS the dock stand-off: reading
  // that as the inset charged the right half ~210 px it does not owe and fit the tower to 0.575 on a
  // 844x390 phone (8 px POS/LAP/TIME text), and hiding the plate (SECTORS off) jumped the band back to
  // ~1.0. --sar is a registered length on a device (announceLane reads it the same way); where it is
  // not readable (a bare engine, the unit fixtures: "env(...)") the plate's own edge is still measured.
  let sarTok = null;
  try { const v = parseFloat(getComputedStyle(root).getPropertyValue("--sar")); if (Number.isFinite(v) && v >= 0) sarTok = v; } catch (_) { /* mini-dom / detached root */ }
  const sarM = sarTok != null ? sarTok : (scR && scR.width ? Math.max(0, window.innerWidth - scR.right - 10 * sz) : null);
  const sal = salM != null ? salM : (sarM != null ? sarM : 0);
  const sar = sarM != null ? sarM : (salM != null ? salM : 0);
  // WITH the gap strip and WITHOUT it. When the band fits at the player's own
  // HUD SIZE once the strip steps out of the row, that is the cheaper trade:
  // move one chip rather than shrink the map and all four timing tiles on
  // every notched phone. Only when it does not fit even without the strip
  // does the cap actually bite.
  const leftN = (map ? 10 + map : 0) + FIT_AIR;
  const right = wide(els.hudSectors, zTopPub) + 10 + FIT_AIR;
  // WHERE IS THE TOWER? The model below splits the viewport at the centre and
  // charges each half its own cluster plus HALF the band — which is only true
  // while `.hud-top` is `left: 50%; translateX(-50%)`. The BROADCAST profile
  // re-anchors it to `left: calc(10px + var(--sal) ...)` (css/hud.css), i.e.
  // into the very slot `#minimap` already occupies, and then this maths cannot
  // even see the collision: it keeps budgeting a centred band, returns a cap
  // near 1, never fires, and the tower paints straight over the map. Reported
  // from a phone in broadcast + COCKPIT, and invisible to hud-layout.spec.js,
  // which only ever exercised the DEFAULT profile on a chase camera.
  //
  // In broadcast the left cluster is STACKED under the tower rather than beside
  // it, so the horizontal budget is the WIDER of the two, once, against the
  // whole viewport less both insets — not a sum across a centre line.
  const bcast = document.body.classList.contains("hud-prof-broadcast");
  // PORTRAIT PHONE (max-width 500): css/hud.css stacks #minimap / .hud-gaps
  // UNDER .hud-top, so charging the map beside the tower against half of 390 px
  // wrote --hud-z-top ~0.65 and painted 14 px sector/tower type at 9.1 CSS px
  // (HUD Desk 2026-10-14). Landscape / tablet portrait keep the side-by-side
  // model. Broadcast already stacks; this is the same idea for the default
  // centred tower.
  const portraitPhone = !document.body.classList.contains("desktop")
    && typeof window !== "undefined" && window.matchMedia
    && window.matchMedia("(orientation: portrait) and (max-width: 500px)").matches;
  const capFor = (l) => (bcast
    ? (window.innerWidth - sal - sar) / Math.max(Math.max(top, l) + right, 1)
    : portraitPhone
      ? Math.min((window.innerWidth - sal - sar - 2 * FIT_AIR) / Math.max(top, 1),
                 (window.innerWidth - sar - FIT_AIR) / Math.max(right, 1))
      : Math.min((half - sal) / Math.max(l + top / 2, 1),
                 (half - sar) / Math.max(right + top / 2, 1)));
  // EACH RUNG IS JUDGED AGAINST THE SPELLING IT DECIDES, NOT THE ONE ON SCREEN.
  //
  // Reading the RENDERED width is a feedback loop with no fixed point wherever
  // the true fit lands between the two spellings: long does not fit -> shorten
  // -> the short strip DOES fit -> lengthen -> ... every 10 Hz tick, with
  // `drop` flickering along. Measured stable: 40 consecutive ticks at 640x360,
  // both rungs held (2026-09-04).
  //
  // So each question is asked about a FIXED width: shorten iff the LONG
  // spelling does not fit, drop iff the SHORT one does not fit inline either.
  // Neither answer depends on the current state, so there is nothing to
  // oscillate. Only the rendered spelling can be measured, so each is
  // remembered as it is seen; until both have been, they share one number —
  // one tick, then it converges.
  if (gaps) _gapW["gapShort" in root.dataset ? 0 : 1] = gaps;
  const wShort = _gapW[0] || gaps, wLong = _gapW[1] || gaps;
  const leftFor = (w) => (map ? 10 + map + 8 + w : 0) + FIT_AIR;
  const capLong = capFor(leftFor(wLong)), capShort = capFor(leftFor(wShort));
  const capNo = capFor(leftN);
  _gapTight = capLong < scale;
  _gapDrop = _gapTight && capShort < scale;
  // HUD chrome fits around independently sized camera/pause controls.
  let capChrome = Infinity;
  if (!bcast && top) {
    const tR = layoutRect(_hudTop);
    for (const el of [els.btnCam, els.pausebtn]) {
      const r = el && !el.hidden ? layoutRect(el) : null;
      if (!(r && r.width && r.left > half && r.top < tR.bottom + FIT_AIR)) continue;
      capChrome = Math.min(capChrome, (r.left - FIT_AIR - half) / (top / 2));
    }

  }
  // THE TOWER MUST CLEAR THE SECTOR PLATE'S ROW ON TOUCH. There #hud-sectors sits at a fixed SCREEN
  // y (8 + tap-hud + 4 + sat, below the pause button — its zoom cancels), while the tower's bottom
  // scales with the band zoom: sat + z * (top offset + height). The right-half budget above only
  // models the two side by side at the screen edge; once it stopped over-shrinking the band (the
  // plate's dock stand-off is no longer read as a safe-area inset) the full-size tower hung 2.2 px
  // below the plate's top and clipped its BEST tile (844x390 cockpit). Solved from the invariants
  // (the tower's unzoomed top offset and height, the plate's screen top) so it cannot hunt.
  let capRow = Infinity;
  if (!bcast && top && scR && scR.width && !document.body.classList.contains("desktop")) {
    const tR = layoutRect(_hudTop), zd = zoomDiv(_hudTop, zTopPub);
    let satPx = 0;
    try { satPx = parseFloat(getComputedStyle(root).getPropertyValue("--sat")) || 0; } catch (_) { /* mini-dom / detached root */ }
    const y0 = (tR.top - satPx) / zd, hInt = tR.height / zd;
    // Only a plate that STARTS BELOW the tower's top is a row to clear; one level with it shares the
    // tower's row and is the right-half budget's business (a vertical limit there only drives the band to the floor).
    if (hInt > 0 && y0 + hInt > 0 && scR.top > tR.top + ROW_AIR) capRow = (scR.top - ROW_AIR - satPx) / (y0 + hInt);
  }
  let capTop = Math.min(capChrome, capRow, Math.max(_gapDrop ? 0 : (_gapTight ? capShort : capLong), Math.min(scale, capNo)));
  // THE BOTTOM BAND IS MEASURED BY ITS CHILDREN, not by its own box. `.hud-bottom`
  // is a flex ITEM inside #hud-dock carrying `min-width: 0` ("may shrink before it
  // pushes a dock", css/overlays.css), so its rect is the COMPRESSED width and its
  // children overflow it. Measuring the container read ~200px narrower than the
  // content and the cap came out permissive enough to leave #hud-gearbox and
  // #hud-aero off-screen at 1280x800 @175% — with the cap in place and no overlap
  // reported anywhere, which is how a wrong measurement hides.
  const bottom = span(_hudBottom, zBotPub);
  let capBot = bottom ? (window.innerWidth - 2 * FIT_AIR) / bottom : Infinity;
  // THE DOCKS GET THE SAME TREATMENT — they were the one cluster outside the
  // fit budget (this comment block's own "bottom: one centred row" never
  // counted them), and the dock zooms by the RAW slider, so at HUD SIZE 150%
  // on a 390px-tall landscape phone the 2-high pedal column outgrew the
  // viewport and BRAKE sat entirely off the top edge (measured 2026-08, the
  // first sweep after the in-race audit cells were un-blinded: #btn-brake at
  // y=-216, GAS 96px into the notch). Height, not width, is the binding
  // axis: cap = the viewport height less top air over the tallest column's
  // intrinsic (zoom-invariant) height.
  const tall = (el, pub) => {
    if (!el) return 0;
    const r = layoutRect(el);
    if (!r.height) return 0;
    return r.height / zoomDiv(el, pub);
  };
  // THE TOWER'S HEIGHT, for the broadcast stack. `.hud-top` and `#minimap`
  // share --hud-z-top, so dividing the rect by that same zoom gives a length
  // the map's own `top: calc(...)` can add without double-counting the zoom.
  // Written unconditionally: the CSS only consumes it under .hud-prof-broadcast,
  // and a var that is only sometimes present is a var that is sometimes 0.
  // Same published divisor as wide() — do not re-read currentCSSZoom here.
  const topHPub = tall(_hudTop, zTopPub);
  hStyle(root, "--hud-top-h", topHPub.toFixed(1) + "px");
  // THE RIGHT DOCK'S WIDTH, so right-anchored HUD chrome can stand off it.
  // #hud-limits is `right: 10px` and sits BELOW #hud-sectors — which is exactly
  // where the BOOST pedal is on a touch phone, so a track-limits warning painted
  // over a tap target. Published in the chrome's own zoom space (the dock zooms
  // by the RAW slider, the chrome by --hud-z-top) so the CSS can add it directly.
  // The dock's SCREEN width over the CHROME's zoom: #hud-limits is inside the
  // --hud-z-top group, so its `right:` needs the stand-off in that space, and
  // the dock's own zoom (the raw slider) never enters it.
  // THE SECTOR BOX'S HEIGHT, for the chip that hangs off its bottom edge.
  // #hud-limits derived that offset from a hand-computed `4.8em` (three rows at
  // line-height 1.6) — which is only the box's height while the box EXISTS. Every
  // profile that hides it (MINIMAL, and a broadcast camera outside the broadcast
  // profile) left the chip hanging in mid-air below an empty corner, reported
  // from a phone as "LIMITS floats in the middle of the screen". Measured, in
  // the chip's own zoom units, it is 0 exactly when the box is gone.
  const secH = tall(els.hudSectors, zTopPub);
  hStyle(root, "--hud-sec-h", secH.toFixed(1) + "px");
  const chromeZ = zoomDiv(_hudTop || els.minimap, zTopPub) || scale || 1;
  // THE RIGHT DOCK'S WIDTH — BUT ONLY WHEN THE CHIP ACTUALLY REACHES IT.
  // Standing off unconditionally dragged a top-right chip halfway across the
  // screen on any viewport tall enough for the two never to meet (the second
  // half of the same phone report). #hud-dock is bottom-anchored and only as
  // tall as its tallest column, so the test is one rect comparison: does the
  // chip's bottom edge reach the dock's top edge? The chip's own box cannot be
  // measured — it is `hidden` until the player takes a strike — so its top is
  // reconstructed from the column it hangs in: #pausebtn's bottom edge plus the
  // same 4 px of air css/hud.css puts between them, then the sector box, then
  // the 15 px offset. CHIP_H is its one line plus padding at --fs-micro.
  const CHIP_H = 26, CHIP_DROP = 15;
  const pauseR = els.pausebtn ? els.pausebtn.getBoundingClientRect() : null;
  const colTop = scR && scR.height ? scR.top : (pauseR && pauseR.height ? pauseR.bottom + 4 : 0);
  const limBot = colTop + (secH + CHIP_DROP + CHIP_H) * chromeZ;
  const dockR = _dockR ? _dockR.getBoundingClientRect() : null;
  const hitsRight = !!(dockR && dockR.width && limBot > dockR.top);
  // WHEN THE RIGHT COLUMN IS FULL, GO LEFT — DO NOT WALK INTO THE MIDDLE.
  // Standing off the dock's width is the only way to stay right-anchored, and
  // on a phone that dock is ~150px: the chip landed a third of the way across
  // the screen, over the track, which is the second half of the same report.
  // The LEFT column has room the right one does not — the map ends well above
  // the steering arrows — so the chip moves there instead, and only falls back
  // to the horizontal stand-off when the left is full too.
  //
  // --hud-left-h is that column's occupied BOTTOM EDGE, measured off whatever
  // is actually in it: the map, the gap strip, either, or neither (both have
  // their own OFF switches, and the strip drops into that column on its own).
  // It is a screen y over the shared --hud-z-top, which is the chip's own
  // coordinate space, so the CSS adds its air and nothing else. The BROADCAST
  // tower lives in this column too, so it is a floor on the same measurement.
  const gapsEl = els.gapA ? els.gapA.parentNode : null;
  const gapsR = gapsEl ? layoutRect(gapsEl) : null;
  let leftBot = bcast && _hudTop ? layoutRect(_hudTop).bottom : 0;
  if (mmR && mmR.width) leftBot = Math.max(leftBot, mmR.bottom);
  if (gapsR && gapsR.width) leftBot = Math.max(leftBot, gapsR.bottom);
  // Gaps strip alone (centre flag clears it; TYRES must not lift the flag).
  hStyle(root, "--hud-gaps-b", ((gapsR && gapsR.width ? gapsR.bottom : 0) / chromeZ).toFixed(1) + "px");
  const dockL = _dockL ? _dockL.getBoundingClientRect() : null;
  // Phone landscape: when the dock-top TYRES anchor would cover the map (HUD
  // 150% broadcast survey), stack TYRES under the left column and extend
  // --hud-left-h so REL / STRATEGY follow. MOVE & SIZE (data-hl-user) wins.
  const phone = !document.body.classList.contains("desktop");
  const tyreEl = els.tyre;
  // colBot: map/gaps edge only (leftBot+tyre latched into the safe area).
  const colBot = leftBot;
  const tyreZ = zBotPub || scale || 1;
  let tyreStack = false;
  if (phone && tyreEl && !tyreEl.hidden && !(tyreEl.hasAttribute && tyreEl.hasAttribute("data-hl-user"))) {
    const tBox = tyreEl.getBoundingClientRect();
    const tHpx = Math.max(tBox.height, 36);
    const dockTopPx = dockL && dockL.height ? dockL.top : vpH();
    const naturalTopPx = dockTopPx - tHpx - 8;
    const minTopPx = colBot + 2;
    const roomPx = Math.max(0, dockTopPx - minTopPx - 2);
    if (naturalTopPx < minTopPx - 0.5 && roomPx >= 12) {
      // Divide by .hud-bottom zoom so painted screen y == minTopPx.
      hStyle(root, "--hud-tyre-top", (minTopPx / tyreZ).toFixed(1) + "px");
      if (roomPx < tHpx - 0.5) hStyle(root, "--hud-tyre-max-h", (roomPx / tyreZ).toFixed(1) + "px");
      else hUnstyle(root, "--hud-tyre-max-h");
      if (tyreEl.dataset) {
        if (roomPx < 48) tyreEl.dataset.tyreCompact = "1";
        else delete tyreEl.dataset.tyreCompact;
      }
      leftBot = Math.max(leftBot, minTopPx + Math.min(tHpx, roomPx));
      tyreStack = true;
    } else {
      hUnstyle(root, "--hud-tyre-top"); hUnstyle(root, "--hud-tyre-max-h");
      if (tyreEl.dataset) delete tyreEl.dataset.tyreCompact;
    }
  } else {
    hUnstyle(root, "--hud-tyre-top"); hUnstyle(root, "--hud-tyre-max-h");
    if (tyreEl && tyreEl.dataset) delete tyreEl.dataset.tyreCompact;
  }
  if (document.body.classList) document.body.classList.toggle("hud-tyre-stack", tyreStack);
  hStyle(root, "--hud-left-h", (leftBot / chromeZ).toFixed(1) + "px");
  // THE SAME EDGE IN SCREEN PIXELS. #hud-limits reads --hud-left-h from INSIDE
  // the chrome zoom, so it wants the divided value. #game-metrics is OUTSIDE it
  // — nothing zooms that subtree (see its own note in css/hud.css) — so handing
  // it the zoomed number would misplace the panel at every HUD SIZE but 100%.
  // Two vars for one edge is cheaper than one var and a unit bug.
  hStyle(root, "--hud-left-px", leftBot.toFixed(1) + "px");
  // …and the panel's OWN bottom, so the track-limits chip can stack BELOW it in
  // left mode instead of under it. One direction only: the map decides where the
  // panel goes, the panel decides where the chip goes. Feeding the panel's own
  // bottom back into --hud-left-px would be a latch — a decision reading its own
  // output — which is the defect shape this file has been bitten by before.
  const gmEl = typeof document !== "undefined" ? document.getElementById("game-metrics") : null;
  const gmR = gmEl && !gmEl.hidden ? gmEl.getBoundingClientRect() : null;
  const gmBot = gmR && gmR.width ? gmR.bottom : 0;
  hStyle(root, "--hud-metrics-b", (gmBot / chromeZ).toFixed(1) + "px");
  // The metrics panel is part of what fills this column now, so the room test
  // measures from whichever is lower — the map/strip edge or the panel's bottom.
  const leftFilled = Math.max(leftBot, gmBot);
  const leftRoom = !(dockL && dockL.width && leftFilled + (8 + CHIP_H) * chromeZ > dockL.top);
  const limLeft = hitsRight && leftRoom;
  // LIMITS on the left lands under --hud-left-h; a dock-top TYRES still sits
  // in that slot at HUD ≤125% (phoneL survey: limits×tyre). Stack TYRES under
  // the map/gaps edge and re-publish so the chip hangs below it.
  if (limLeft && phone && tyreEl && !tyreEl.hidden
      && !(tyreEl.hasAttribute && tyreEl.hasAttribute("data-hl-user")) && !tyreStack) {
    const tBox = tyreEl.getBoundingClientRect();
    const tHpx = Math.max(tBox.height, 36);
    const minTopPx = colBot + 2;
    const dockTopPx = dockL && dockL.height ? dockL.top : vpH();
    const roomPx = Math.max(0, dockTopPx - minTopPx - 2);
    if (roomPx >= 12) {
      hStyle(root, "--hud-tyre-top", (minTopPx / tyreZ).toFixed(1) + "px");
      if (roomPx < tHpx - 0.5) hStyle(root, "--hud-tyre-max-h", (roomPx / tyreZ).toFixed(1) + "px");
      else hUnstyle(root, "--hud-tyre-max-h");
      if (tyreEl.dataset) {
        if (roomPx < 48) tyreEl.dataset.tyreCompact = "1";
        else delete tyreEl.dataset.tyreCompact;
      }
      leftBot = Math.max(leftBot, minTopPx + Math.min(tHpx, roomPx));
      tyreStack = true;
      if (document.body.classList) document.body.classList.toggle("hud-tyre-stack", true);
      hStyle(root, "--hud-left-h", (leftBot / chromeZ).toFixed(1) + "px");
      hStyle(root, "--hud-left-px", leftBot.toFixed(1) + "px");
    }
  }
  if (limLeft !== ("limitsLeft" in root.dataset)) {
    if (limLeft) root.dataset.limitsLeft = "1";
    else delete root.dataset.limitsLeft;
  }
  // --dock-r-w is published AFTER the zoom caps below: publishing it here
  // with the pre-cap chromeZ left the inset in z=1 space while #hud-sectors
  // painted at the capped --hud-z-top (notched-landscape buttons: S3 on
  // BOOST). #1191's max(anchor(left)) papered over that and then overshot
  // into #announce.
  // Fixed control groups are measured independently of readout content.
  const hudDockEl = _dockL ? _dockL.parentNode : null;
  const groups = (d) => {
    if (!d) return { h: 0, w: 0, stack: 0 };
    const z = zoomDiv(d, zDockPub);
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
  let capDock = Infinity;
  if (dockH) {
    // Controls own their space: race text, panels and HUD zoom never change this budget.
    const barR = hudDockEl ? hudDockEl.getBoundingClientRect() : null;
    let sat = 0, sab = 0;
    try { const cs = getComputedStyle(root); sat = parseFloat(cs.getPropertyValue("--sat")) || 0; sab = parseFloat(cs.getPropertyValue("--sab")) || 0; } catch (_) { /* mini-dom */ }
    const controlsRoom = window.innerHeight - sat - sab - 4 * FIT_AIR;
    // Dock and CAM/PAUSE share one effective size. Solve their joint height
    // budget so increasing BUTTON SIZE can plateau, never shrink the pedals.
    // CAM tops out at 150%; PAUSE above the right dock can reach 200%.
    const heightCap = (height, topMax = 1.5) => {
      if (!height) return Infinity;
      if (controlsRoom <= height + 44) return (controlsRoom - 44) / height;
      if (controlsRoom <= topMax * (height + 44)) return controlsRoom / (height + 44);
      return (controlsRoom - 44 * topMax) / height;
    };
    // PLAN vs THE CLUSTER at HUD 200%. #hud-tyre is anchored on the left dock,
    // outside the centred cluster, so the viewport budget above never sees them
    // meet (852×393 @200%: the gearbox plate sat on PLAN). The tyre's left edge
    // is the dock anchor (it grows right); the cluster grows about its centre.
    // Widths are divided back out of the zoom painted now, so the answer does
    // not chase itself. Hidden TYRES (TIMING, COMPACT, cockpit) leave the cap.
    // The unit harness has no visible #hud-tyre, so this stays a no-op there.
    if (!document.body.classList.contains("desktop") && _hudBottom && _hudBottom.children) {
      const zNow = zoomDiv(_hudBottom, zBotPub);
      let lo = Infinity, hi = -Infinity;
      const kids = _hudBottom.children;
      for (let i = 0; i < kids.length; i++) {
        const c = kids[i];
        if (!c || c.id === "hud-tyre") continue;
        const r = layoutRect(c);
        if (!r.width) continue;
        if (r.left < lo) lo = r.left;
        if (r.right > hi) hi = r.right;
      }
      const tyreEl = document.getElementById("hud-tyre");
      const tyreR = tyreEl && !tyreEl.hidden ? layoutRect(tyreEl) : null;
      if (hi > lo && tyreR && tyreR.width && zNow) {
        const cW = (hi - lo) / zNow, tW = tyreR.width / zNow, cMid = (lo + hi) / 2;
        const denom = cW / 2 + tW;
        if (denom > 0 && cMid > tyreR.left) {
          const zClear = (cMid - tyreR.left - FIT_AIR) / denom;
          if (zClear > 0) capBot = Math.min(capBot, zClear);
        }
      }
      // PORTRAIT PHONE: the ladder buttons are position:fixed, so #hud-dock's
      // flex width never budgets the cluster. Cap --hud-z-bot so GEAR clears
      // the AERO/OT column (390×844 @150%: gearbox×btn-aero, HUD Desk 2026-10-07).
      // Landscape keeps the dock flex bar; this path is a no-op there.
      // Read discs via the dock trees (no dynamic getElementById — ratchet).
      if (typeof window !== "undefined" && window.matchMedia
          && window.matchMedia("(orientation: portrait)").matches && bottom > 0) {
        let leftEdge = 0, rightEdge = window.innerWidth;
        const mid = window.innerWidth / 2;
        for (const dock of [_dockL, _dockR]) {
          if (!dock) continue;
          const nodes = dock.querySelectorAll(".touchbtn, .shiftbtn, .steerbtn");
          for (let i = 0; i < nodes.length; i++) {
            const el = nodes[i];
            if (!el || el.hidden) continue;
            const r = el.getBoundingClientRect();
            if (!(r.width && r.height)) continue;
            const cx = (r.left + r.right) / 2;
            if (cx >= mid) rightEdge = Math.min(rightEdge, r.left);
            else leftEdge = Math.max(leftEdge, r.right);
          }
        }
        // `bottom` is zoom-invariant (span / currentCSSZoom); room is screen px.
        const room = rightEdge - leftEdge - 2 * FIT_AIR;
        if (room > 0) capBot = Math.min(capBot, room / bottom);
      }
    }
    const barW = barR && barR.width ? barR.width : window.innerWidth;
    const barGap = hudDockEl ? parseFloat(getComputedStyle(hudDockEl).columnGap) || 0 : 0;
    const controlsW = gL.w + gR.w;
    capDock = Math.min(heightCap(gL.h), heightCap(gR.h, 2),
      controlsW ? (barW - 2 * barGap - 2 * FIT_AIR) / controlsW : Infinity);
    const dockZ = Math.min(Math.max(btnFloor, btnScale), Math.max(0.4, capDock));
    const roomL = controlsRoom - 44 * Math.min(1.5, Math.max(1, dockZ));
    // Readouts adapt to the stable controls, never the reverse.
    const roomW = barW - controlsW * dockZ - 2 * barGap - 2 * FIT_AIR;
    if (bottom && roomW > 0) capBot = Math.min(capBot, roomW / bottom);
    // Broadcast stacks its tower/map/messages above the left controls. Fit
    // that readout column to the remaining height without resizing controls.
    if (bcast && phone && window.innerWidth > window.innerHeight) {
      const stack = [_hudTop, els.minimap, gapsEl, els.flag, els.announce, els.tyre];
      const height = stack.reduce((sum, el) => {
        if (!el || el.hidden) return sum;
        const r = layoutRect(el);
        return sum + r.height / zoomDiv(el, el === els.tyre ? zBotPub : zTopPub);
      }, 6 * FIT_AIR);
      const cap = Math.max(1 / 1.4, (roomL - gL.h * dockZ) / Math.max(1, height));
      capTop = Math.min(capTop, cap); capBot = Math.min(capBot, cap);
    }

  }
  // An empty dock on a TOUCH body is "not populated yet", not "no dock" —
  // showTouchControls lands a tick or two after the race starts, and latching
  // the key here left the cap unwritten for the whole 3 s same-key backoff
  // (measured: the un-blinded audit probes at ~0.6 s and saw the uncapped
  // dock every time). Same retry-next-tick treatment as the !top guard
  // above; a desktop body keeps the backoff, since its docks stay empty
  // forever and re-measuring them every tick is the cost the backoff exists
  // to avoid.
  if (!dockH && !document.body.classList.contains("desktop")) retry = true;
  // PORTRAIT height cap, OUTSIDE the dock block: the ladder buttons are
  // position:fixed, so dockH is 0 and the block above never runs. The tyre
  // rides one box above the column and the column's bottom:112px is zoomed,
  // so HUD 200% put the tyre through CAM and ERS through AERO (393×852).
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
      try { sabPx = parseFloat(getComputedStyle(root).getPropertyValue("--sab")) || 0; } catch (_) { /* */ }
      const avail = window.innerHeight - sabPx - ceilY;
      const denom = 112 + stackR.height / zNowP + 48;
      if (avail > 0 && denom > 0) capBot = Math.min(capBot, avail / denom);
    }
  }
  if (retry) { if (++_fitRetry <= 30) _fitKey = ""; } else _fitRetry = 0;
  // EACH CAP IS COMPARED AGAINST THE SLIDER THAT DRIVES IT. The readout bands
  // ride --hud-scale; the touch dock rides --hud-btn-scale (BUTTON SIZE, its
  // own slider — css/overlays.css), which defaults to --hud-scale and is only
  // inline once the player has moved it. Comparing the dock's cap against the
  // wrong slider would either pin a cap that fits or drop one that does not.
  // 10 CSS px over --fs-micro 14: same painted floor as the gap-chip clamp
  // and PR #1734's touch labels. Portrait only — landscape keeps the 0.4
  // band floor (short phones still drop the gap strip instead).
  const READABLE_Z = 10 / 14;
  const set = (prop, cap, base) => {
    if (cap >= base) root.style.removeProperty(prop);   // fits: the player's number, untouched
    else {
      const floor = (portraitPhone && prop === "--hud-z-top") ? READABLE_Z : 0.4;
      root.style.setProperty(prop, String(Math.max(floor, Math.round(cap * 1000) / 1000)));
    }
  };
  set("--hud-z-top", capTop, scale);
  set("--hud-z-bot", capBot, scale);
  // --hud-top-h is consumed in the tower's own zoom space. Re-publish AFTER
  // the cap write so CSS sees --hud-z-top and --hud-top-h in the same pass.
  // The length itself was measured with zTopPub (pre-cap published zoom that
  // matches the rects this pass read) — never re-divide by a lagging
  // currentCSSZoom (ui-redesign: mmCss 142 = 110×staleZoom/zTop).
  if (_hudTop) void _hudTop.offsetHeight;
  if (els.minimap) void els.minimap.offsetHeight;
  hStyle(root, "--hud-top-h", topHPub.toFixed(1) + "px");
  // The dock paints at max(--hud-btn-floor, BUTTON SIZE) (css/touch-controls.css),
  // so a cap between BUTTON SIZE and that floor still has to be written.
  set("--hud-z-dock", capDock, Math.max(btnFloor, btnScale));
  // Earlier tower/sector budgets saw the old CAM/PAUSE footprint. Refit on
  // the next HUD tick only when their clamped, published zoom changed.
  const dockAfter = +root.style.getPropertyValue("--hud-z-dock") || Math.max(btnFloor, btnScale);
  if (Math.abs(Math.min(2, Math.max(1, zDockPub)) - Math.min(2, Math.max(1, dockAfter))) > 1e-6) {
    _fitKey = ""; _fitWait = 0; _fitPending = true;
  }
  // Publish --dock-r-w in the FINAL chrome zoom, after dock/top caps land.
  // CSS: right = 10px + sar/--hud-z + --dock-r-w (dock-r-w is NOT re-divided).
  // Use the LEFTMOST painted right-dock control / BOOST — wrap-reverse
  // #dock-right width can under-measure content left (Pages
  // #hud-sectors+#announce when #1191's anchor max compensated). Flush dock +
  // sectors so dockLeft matches the post-cap paint.
  if (_dockR) void _dockR.offsetHeight;
  if (els.hudSectors) void els.hudSectors.offsetHeight;
  // Painted dock / max-width clearance only. Caps still measure with zTopPub
  // (published). When live currentCSSZoom lags BELOW the just-written
  // --hud-z-top, published-only inset under-clears BOOST (tilt @150%:
  // sectors r 724 vs BOOST l 704). Prefer min(pub, live) so a low live
  // widens --dock-r-w / shrink; never prefer live ABOVE pub (that half of
  // the compact-minimap flip).
  const zPaint = () => {
    const pub = +root.style.getPropertyValue("--hud-z-top") || scale || 1;
    const probe = _hudTop || els.minimap || els.hudSectors;
    const live = probe && probe.currentCSSZoom > 0 ? probe.currentCSSZoom : pub;
    return Math.min(pub, live);
  };
  // BOOST only anchors --dock-r-w when it sits in the RIGHT half. Tilt parks
  // BOOST on the left column; using that left as the inset target blew midCap
  // (CI: dockRW 907, #hud-sectors unsafe under --sal).
  const boostRightLeft = () => {
    const boost = typeof document !== "undefined" ? document.getElementById("btn-boost") : null;
    if (!boost || boost.hidden) return NaN;
    const br = boost.getBoundingClientRect();
    if (!(br.width && br.height)) return NaN;
    if ((br.left + br.right) / 2 < window.innerWidth / 2) return NaN;
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
    // Prefer the RIGHT-dock BOOST disc — grp-taps can still be mid-wrap while
    // the button's box has already landed (CI: dockLeft 597 vs BOOST 587).
    const brLeft = boostRightLeft();
    if (Number.isFinite(brLeft)) left = Math.min(left, brLeft);
    if (!Number.isFinite(left) && _dockR) {
      const dr = _dockR.getBoundingClientRect();
      if (dr.width) left = dr.left;
    }
    return left;
  };
  let sarPx = 0;
  try { sarPx = parseFloat(getComputedStyle(root).getPropertyValue("--sar")) || 0; } catch (_) { /* */ }
  // Air is SCREEN px converted into the plate's zoom space (+AIR/z). Subtracting
  // AIR before dividing shrank the inset (tilt @150% S3×BOOST). Zoomed +8 was
  // only ~4px at z≈0.5 and failed CI workers=2. Keep 8px — more shoved S3 into
  // #announce before announceLane could clip the card.
  // 8px under-cleared BOOST by ~2px at HUD 140% on CI (sectors r 590.7 vs
  // BOOST l 588.8). 12px screen air is still well below the midCap.
  const DOCK_AIR = 12;
  const insetFor = (left, z) => {
    if (!Number.isFinite(left) || !(z > 0)) return 0;
    const midCap = Math.max(0, (window.innerWidth / 2) / z - 10 - sarPx / z);
    const need = Math.max(0, (window.innerWidth - left) / z - 10 - sarPx / z + DOCK_AIR / z);
    // Cap so S3 cannot walk past mid into #minimap / #announce.
    return Math.min(need, midCap);
  };
  // Publish from the current leftmost right-dock / BOOST edge, then at most
  // one painted correction against a RIGHT-side BOOST only.
  let zTop = zPaint();
  let dockRW = insetFor(dockLeftOf(), zTop);
  hStyle(root, "--dock-r-w", (dockRW > 0 ? dockRW : 0).toFixed(1) + "px");
  if (els.hudSectors) void els.hudSectors.offsetHeight;
  if (_dockR) void _dockR.offsetHeight;
  if (!document.body.classList.contains("desktop") && els.hudSectors && !els.hudSectors.hidden) {
    const secR = els.hudSectors.getBoundingClientRect();
    const brLeft = boostRightLeft();
    const left = Number.isFinite(brLeft) ? brLeft : dockLeftOf();
    if (secR.width && Number.isFinite(left) && secR.right > left - DOCK_AIR + 0.5) {
      zTop = zPaint();
      if (zTop > 0) {
        // Absolute clear from the right-dock edge — never stack += grow on a
        // stale plate, and never aim at a left-column BOOST (tilt).
        dockRW = insetFor(left, zTop);
        hStyle(root, "--dock-r-w", (dockRW > 0 ? dockRW : 0).toFixed(1) + "px");
        void els.hudSectors.offsetHeight;
        if (_dockR) void _dockR.offsetHeight;
      }
    }
  }
  mirrorClear(root);
  // MOVE & SIZE: re-clamp moved pieces against the bands as now laid out.
  if (typeof HudLayout !== "undefined") HudLayout.fit();
  // fit() can undo the dock inset; shrink the sector plate before any extra
  // inset widen (widening slides the plate left into #minimap).
  if (!document.body.classList.contains("desktop") && els.hudSectors && _dockR) {
    const margin = DOCK_AIR;
    const mapR = els.minimap && !els.minimap.hidden ? els.minimap.getBoundingClientRect() : null;
    const mapClear = mapR && mapR.width ? mapR.right + margin : 0;
    const secEl = els.hudSectors;
    if (secEl.style && secEl.style.removeProperty) secEl.style.removeProperty("max-width");
    for (let pass = 0; pass < 4; pass++) {
      const secR = secEl.getBoundingClientRect();
      if (!secR.width) break;
      let worst = 0;
      for (const g of _dockR.children) {
        const r = g.getBoundingClientRect();
        if (!(r.width && r.height)) continue;
        if (secR.right > r.left - margin) worst = Math.max(worst, secR.right - (r.left - margin));
      }
      if (!(worst > 0.5)) break;
      const zSec = zPaint() || 1;
      const curW = secR.width / zSec;
      secEl.style.maxWidth = Math.max(48, curW - worst / zSec).toFixed(1) + "px";
      void secEl.offsetHeight;
    }
    let secR = secEl.getBoundingClientRect();
    let worst = 0;
    for (const g of _dockR.children) {
      const r = g.getBoundingClientRect();
      if (!(r.width && r.height)) continue;
      if (secR.right > r.left - margin) worst = Math.max(worst, secR.right - (r.left - margin));
    }
    if (worst > 0.5) {
      const brLeft = boostRightLeft();
      const left = Number.isFinite(brLeft) ? brLeft : dockLeftOf();
      if (Number.isFinite(left) && !(mapClear && secR.left - worst < mapClear)) {
        zTop = zPaint();
        if (zTop > 0) {
          dockRW = insetFor(left, zTop);
          hStyle(root, "--dock-r-w", (dockRW > 0 ? dockRW : 0).toFixed(1) + "px");
          void secEl.offsetHeight;
        }
      }
    }
    secR = secEl.getBoundingClientRect();
    let onDock = false;
    for (const g of _dockR.children) {
      const r = g.getBoundingClientRect();
      if (r.width && r.height && secR.right > r.left - margin && secR.left < r.right - margin) { onDock = true; break; }
    }
    if (!onDock && secEl.style && secEl.style.removeProperty) secEl.style.removeProperty("max-width");
  }
  // Radio top slot AFTER HudLayout.fit — a pre-fit slot used the shipped tower
  // edge, then MOVE & SIZE grew/shifted .hud-top into the card (CI oversize:
  // .hud-top+#announce with hud-radio-top on notched-landscape buttons).
  if (els.hudSectors) void els.hudSectors.offsetHeight;
  // THE CAUTION FLAG STEPS UNDER THE SECTOR PLATE ONLY WHEN THE PLATE REACHES ITS
  // COLUMNS. The flag is centred and the plate right-anchored; a wide dock
  // (BUTTON SIZE 200% on a 667px phone) pushes the plate past the flag's right
  // edge. :root[data-flag-low] (css/hud.css) then takes the plate's bottom;
  // otherwise the flag sits 44px under the tower, where a dropped gap strip
  // ends — the old 74px literal paid for the plate on every phone (2026-10-14).
  {
    const sc = els.hudSectors && !els.hudSectors.hidden ? els.hudSectors.getBoundingClientRect() : null;
    const fl = els.flag ? els.flag.getBoundingClientRect() : null;
    const flagRight = fl && fl.width ? fl.right : vpW() / 2 + 80;
    const low = !!(sc && sc.width && (sc.left < flagRight + 8 || portraitPhone));
    if (low !== ("flagLow" in root.dataset)) { if (low) root.dataset.flagLow = "1"; else delete root.dataset.flagLow; }
    hStyle(root, "--hud-sec-bottom", (portraitPhone && sc && sc.height ? sc.bottom : 0).toFixed(1) + "px");
  }
  // Fit just rewrote bands/docks — clipper boxes may have moved. Drop the lane
  // rect cache so radioTopSlot / announceLane re-measure once, then warm it.
  _laneRects = null; _laneSafe = null;
  radioTopSlot(root, bcast);
  announceLane(root);
  // Bottom cluster top (SPEED / GEAR / ERS). CSS caps #announce with
  // cluster/z − flag-slot − 40px so a caution step cannot cover the gearbox
  // (JS-measured room went stale when the flag was forced on after fitHud).
  {
    const bot = document.querySelector(".hud-bottom");
    const br = bot && !bot.hidden ? bot.getBoundingClientRect() : null;
    hStyle(root, "--hud-cluster-y", (br && br.height ? br.top : vpH()).toFixed(1) + "px");
  }
  radioPaintedCollapse(root);   // terminal: nothing after it may re-run radioTopSlot (hud-metrics-layout.test)
  mirrorClear(root);
  if (typeof HudLayout !== "undefined" && HudLayout.clearReadouts) HudLayout.clearReadouts();
  if (els.minimap) void els.minimap.offsetHeight;
}

// Gear, tachometer and speed — every frame (updateHud, above its 10 Hz gate).
// The gearbox chip (gear + tach) is display:none under body.cockpit-cam
// (css/track-detail.css — no breakpoint brings it back): its writes wait,
// and the cockpit-cam toggle's own refreshHud(true) repaints it on the way out.
// The bar width is compared as a whole percent: Math.round IS toFixed(0) for
// 0..100 (both round half up), so the string is built only when it moves.
let _rpmPct = -1;
// #hud-speed's .hud-unit sibling — resolved once. AppearanceOpts.applyReadability
// still writes "KM/H" for settings copy; paintInstruments re-asserts the short
// plate (KPH/MPH) every frame so phone-cockpit float matches the wheel LCD.
let _speedUnitEl = null;
function speedUnitEl() {
  if (_speedUnitEl) return _speedUnitEl;
  if (els.speed && els.speed.parentElement) _speedUnitEl = els.speed.parentElement.querySelector(".hud-unit");
  return _speedUnitEl;
}
function paintInstruments(player) {
  const rpmFrac = clamp((player.rpm - IDLE_RPM) / (MAX_RPM - IDLE_RPM), 0, 1);
  // HYSTERESIS: a single 0.92 threshold flickered the class (and restarted its
  // pulse animation) every tick the needle hovered on the line, which is
  // exactly where a driver holding a gear sits. Enter at 92%, leave at 89%.
  _redline = player.rpm > MAX_RPM * (_redline ? 0.89 : 0.92);
  if (!document.body.classList.contains("cockpit-cam")) {
    hText(els.gear, "" + player.gear);
    const pct = Math.round(rpmFrac * 100);
    // --rpm (0..1, 1 % steps), not width: the fill spans the whole tach and is
    // clipped, so its colour stops sit on fixed RPM (css/hud.css #hud-rpm-fill).
    if (pct !== _rpmPct || !(pct >= 0)) { _rpmPct = pct; hStyle(els.rpmFill, "--rpm", (pct / 100).toFixed(2)); }
    hToggle(els.tach, "redline", _redline);
  }
  const kph = Math.max(0, G.dashKph(player.speed));   // SPEED UNITS is display-only (js/ui/appearance-opts.js); >= 0 like the wheel LCD (reverse read "-26")
  // One SPD plate (HudReadouts.spdPlate): same n + MPH|KPH as the wheel LCD.
  if (_ro && typeof _ro.spdPlate === "function") {
    const plate = _ro.spdPlate(kph);
    hText(els.speed, "" + plate.n);
    hText(speedUnitEl(), plate.unit);
  } else {
    hText(els.speed, "" + (typeof AppearanceOpts !== "undefined" ? AppearanceOpts.speed(kph) : Math.round(kph)));
  }
}

// VISUAL SPOTTER: #hud[data-along] ("l" / "r" / "l r") lights the matching
// screen edge (css/hud.css) while a car is alongside. The occupancy is the
// spotter's (js/race/spotter.js side(), via RaceRadio.trafficSide), measured
// before its setting/sound gates, so the glow works with the voice off.
const ALONG = [null, "l", "r", "l r"];
function syncAlong() {
  const rr = G.raceRadio, side = rr && rr.trafficSide ? rr.trafficSide() : 0;
  hData(els.hud, "along", ALONG[side] || null);
}

function updateHud(force, dtMs) {
  if (!(Number.isFinite(dtMs) && dtMs > 0)) dtMs = 16.7;   // forced refreshes and the first frame: one nominal frame
  const player = G.player, cars = G.cars, timeTrial = G.timeTrial;
  if (!player) return;
  // Headless layout probes freeze after a painted-clear frame; rAF still runs
  // updateHud(false) and was moving REL/S3 before Playwright's probe (CI:
  // stamp/wait green, identical S3×BOOST + REL×BRAKE on probe). jump/camera
  // use refreshHud(true) to re-fit while frozen.
  if (G.frozen && !force) return;
  syncHudCamClasses();
  const skinRev = G.store ? G.store.rev : 0;
  if (player.team && (player.team.id !== _teamSkin || skinRev !== _teamSkinRev)) {
    _teamSkin = player.team.id; _teamSkinRev = skinRev;
    document.documentElement.dataset.team = _teamSkin;
    if (_skin) _skin.skinAccent(player.team, G);
  }
  // WALL-CLOCK throttle. This was a 6-FRAME countdown, which is 10 Hz only at
  // 60 fps: a 120/144 Hz display ticked it 2x as often, so the gap EMA below
  // (tuned "0.3 s at 10 Hz") chattered again and the flashes ran short, while
  // a throttled 30 fps device dropped to 5 Hz. The forced refreshes pass no dt
  // and are charged one nominal frame.
  // THE INSTRUMENTS RUN AT FRAME RATE. Gear, revs and speed are what a driver
  // reads to shift and to brake, and at 10 Hz the tach visibly stepped and a
  // shift showed up to 100 ms late. All three go through the write cache, so a
  // frame that changes nothing writes nothing; everything else stays at 10 Hz.
  // ON A TICK FRAME THEY PAINT AFTER fitHud's READS, not before: written first,
  // they dirtied the tree and the fit's first rect / viewport read forced a
  // synchronous layout on every tick on a phone. Same writes, same frame.
  const tick = force || !(hudT - dtMs > 0);   // exactly the throttle test below
  if (!tick) paintInstruments(player);
  if (typeof HudInputs !== "undefined") HudInputs.frame(G, player, dtMs);   // opt-in INPUTS trace: samples per frame, draws at 10 Hz itself
  if (_trace && G.track) _trace.sample(player, G.track.total);   // the race DELTA's best-lap reference
  hudT -= dtMs;
  if (!force && hudT > 0) return;
  hudT = HUD_TICK_MS;
  syncHudLayoutClasses();      // before fitHud: show/hide/park changes what gets measured
  fitHud();                    // below the throttle: this reads layout, per TICK not per frame
  syncAlong();
  // A retirement has no race position left to hold — `rank` is whatever it was
  // when the car stopped, and the field it was measured against no longer
  // contains it (see the ranked build in game.js).
  // POS IS A RACE READOUT. In qualifying `cars` is the player alone (game.js
  // trims the field to one flying lap, and the model grids the rest only when
  // it ends), so it read "1/1"; in PRACTICE the rank is road order with
  // nothing at stake. Both say what the session is instead, like TT.
  const sess = sessionOf(timeTrial);
  hText(els.pos, sess === "tt" ? "TT" : player.retired ? "DNF" : sess === "quali" ? "Q"
    : sess === "practice" ? "PRAC" : (player.rank || "-") + "/" + cars.length);
  // Position change: acknowledge an overtake (either way) for ~0.6 s.
  const rank = sess !== "race" || player.retired ? 0 : (player.rank || 0);
  if (rank && _lastRank && rank !== _lastRank) { els.pos.dataset.delta = rank < _lastRank ? "up" : "down"; _posFlashT = 600; }
  else if (_posFlashT > 0 && (_posFlashT -= HUD_TICK_MS) <= 0) { _posFlashT = 0; delete els.pos.dataset.delta; }
  if (rank) _lastRank = rank;
  paintInstruments(player);   // this tick frame's instruments, after fitHud's reads (see the top)
  hText(els.lap, Math.min(player.lap || 1, G.lapsTarget) + "/" + G.lapsTarget);
  if (typeof HudDamage !== "undefined") HudDamage.sync(player);   // DAMAGE chip (js/ui/hud-damage.js) — display only
  // THE LAP JUST DRIVEN. A race showed only the running clock, which snaps to
  // zero at the line, so unless the lap was a best the driver never saw it.
  // Hold it for the first 3 s of the next lap, green when it is a personal best
  // (game.js writes best in the same crossing). Armed only when lastLap CHANGED
  // with the lap count: game.js writes it for a valid lap alone, so an invalid
  // lap keeps the running clock rather than re-showing the lap before it.
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
  // ENERGY as a number and a state, not only a bar length: MJ (the 2026 rule's
  // unit, the OVERTAKE chip's too) and deploy/harvest (js/ui/hud-readouts.js).
  if (_ro) {
    const st = _ro.ersState(!!player.deploying, player.energy, _ePrev);
    _ePrev = player.energy;
    const en = _ro.energy(player.energy, st);
    hText(_rx.energyN, en.text);
    hData(_rx.energyBox, "ers", st === "idle" ? null : st);
    hAttr(_rx.energyBox, "aria-label", en.label);
    // BRAKE BIAS — the set-up sheet's split, fixed for the race (game.js applySetup).
    if (_rx.bb) {
      const bb = _ro.bbText(player.brakeBias, typeof SetupTune !== "undefined" ? SetupTune.BB_REF : 0.56);
      hText(_rx.bb, bb);
      hAttr(_rx.bb, "aria-label", "Brake bias " + bb.slice(3) + " front");
    }
    // Positions mean nothing in practice or qualifying (rank is road order there).
    // G.practice, not G.session: PRACTICE is a flag on a race session, so the
    // old `session !== "practice"` test was always true and practice spoke.
    if (_speak && G.state === "race" && sessionOf(timeTrial) === "race") {
      _speak.tick(typeof performance !== "undefined" ? performance.now() : Date.now(),
        { rank: player.retired ? 0 : player.rank, of: cars.length, best: player.best }, G.fmtTime);
    }
  }
  // TYRES (js/physics/tyre-model.js). The widget is hidden entirely while the
  // setting is off — the shipped default — so a player who never turns it on
  // pays nothing for it, not even a greyed-out bar. `spent` is wear as a
  // fraction of the compound's life, so the bar reads LIFE REMAINING and the
  // three colour states are the three things the engineer would say on the
  // radio: fine, think about a stop, you are past it.
  const tyres = G.tyres;
  const tyreOn = !!(tyres && tyres.on());
  hHidden(els.tyre, !tyreOn);
  if (tyreOn) {
    const spent = tyres.spent(player);
    hText(els.tyreCode, (player.tyre && player.tyre.code) || "-");
    hStyle(els.tyreFill, "width", (clamp(1 - spent, 0, 1) * 100).toFixed(0) + "%");
    hData(els.tyre, "wear", spent >= 1 ? "gone" : spent >= TYRE_WARN ? "warn" : "ok");
    // …and how many LAPS that is, at the rate this driver has been using it:
    // a percentage says how worn, only laps say whether it reaches the flag.
    // An attribute read by the bar's ::after (css/hud.css), not a new node.
    const left = tyres.lapsLeft ? tyres.lapsLeft(player) : null;
    const bar = els.tyreFill && els.tyreFill.parentNode;
    if (bar && bar.dataset) {
      const txt = left == null || spent >= 1 ? "" : left < 0.5 ? "<1L" : "~" + Math.min(99, Math.round(left)) + "L";
      if (bar.dataset.laps !== txt) bar.dataset.laps = txt;
    }
    // THE PIT CUE, and it replaces a button rather than decorating one. A stop
    // is called by holding the car on the pit side at the entry, so the dwell
    // has to be visible: without it a driver cannot tell the gesture is
    // registering and will give up on it half a second in. The compound chip
    // fills as the commitment runs, then stays lit through the lane and the box.
    const pit = G.pits;
    const state = pit ? (player.pitState === "lane" || player.pitState === "box" ? player.pitState
                         : pit.commitFrac(player) > 0 ? "commit" : "") : "";
    hData(els.tyre, "pit", state || null);
    if (state === "commit") hStyle(els.tyre, "--pit-commit", pit.commitFrac(player).toFixed(2));
    // THE PIT CUE. The chip above says the gesture is REGISTERING; this says
    // where and which way — without it the steer-in control is undiscoverable,
    // because the lane it asks you to aim at is 450 m of arc with nothing drawn
    // on it. PitLane.cue owns the rules (including when to stay quiet); this
    // only paints what it returns.
    const c = pit && pit.cue(player);
    if (els.pitCue) {
      hHidden(els.pitCue, !c);
      if (c) {
        hText(els.pitCueText, c.text);
        hData(els.pitCue, "phase", c.phase);
        // The distance BAR under the words: a driver at 300 km/h reads a bar
        // faster than a number. `frac` is the cue's own fill, 0 → 1.
        hStyle(els.pitCue, "--pit-dist", clamp(c.frac || 0, 0, 1).toFixed(2));
        // The arrow points where the car must GO: to the pit side on the way in,
        // AWAY from the wall on the exit phases (merge / out / served pointed at
        // the pit wall), nowhere for a missed box. The side is a property of the
        // circuit, read once per track: pit.info() builds the whole cue object.
        if (_pitSideTrack !== G.track) { _pitSideTrack = G.track; _pitSide = (pit.info(player) || {}).side === -1 ? -1 : 1; }
        const exitPh = c.phase === "merge" || c.phase === "out" || c.phase === "served";
        hText(els.pitCueArrow, c.phase === "missed" ? "" : (exitPh ? -_pitSide : _pitSide) === -1 ? "\u25C0" : "\u25B6");
      }
    }
    // WORK ON CAR: up for exactly as long as the car is stopped on the jacks
    // (PitLane.canWork), and never a frame longer \u2014 it opens a menu, so a
    // button that outlived the stop would be a menu you could open while
    // driving.
    // Never in a friend race: the garage "pauses" the race, and a networked race
    // does not stop — the box timer ran out behind it and the work was free.
    if (els.workBtn) hHidden(els.workBtn, !(pit && pit.canWork && pit.canWork(player)) || !!(G.netPlay && G.netPlay.active && G.netPlay.active()));
    // THE PLAN LINE: the reference plan the pit wall would run (PitLane.planInfo),
    // under the tyre bar \u2014 the stops, the next box lap, the compound; amber the
    // lap before, --you on the lap, and CHEAPER STOP under a caution that fits it.
    // Practice / TT / quali: hide the race strategy line.
    const practice = sessionOf(timeTrial) !== "race";
    const pl = (!practice && pit && pit.planInfo) ? pit.planInfo(player) : null;
    if (els.plan) hText(els.plan, pl ? pl.text : "");
    hData(els.tyre, "plan", pl && pl.state || null);
    // TYRE TEMPERATURE (js/ui/hud-tyres.js): the compound letter turns blue
    // when the set is below its window and red above it, with ❄/▲ after it for
    // anyone the hue does not reach — and the chip's aria-label (role="img")
    // says compound, heat, laps left and the plan in words.
    if (typeof HudTyres !== "undefined") {
      HudTyres.paint(els.tyre, tyres.info ? tyres.info(player) : null,
        { code: player.tyre && player.tyre.code, lapsLeft: spent >= 1 ? null : left, spent, plan: pl && pl.text });
    }
  } else {
    // Both are written only above: a pit cue or WORK ON CAR up when a wear race was quit stayed up through a no-wear session.
    hHidden(els.pitCue, true);
    hHidden(els.workBtn, true);
  }
  // toggle-button states
  hToggle(els.btnBoost, "on", player.boostOn);
  hStyle(els.btnBoost, "--e", (Math.round((player.energy || 0) * 20) / 20).toFixed(2));
  hToggle(els.btnOT, "on", player.otT > 0);
  hToggle(els.btnOT, "armed", player.otArmed && player.otT <= 0);
  // OVERTAKE (FIA 2026 B7.2.3(c), js/race/overtake-mode.js): EARNED under 1 s at
  // the detection line, granted at the timing line as a 0.5 MJ allowance for
  // that lap. The chip reads the allowance in MJ, the rule's own unit.
  const otMJ = typeof OvertakeMode !== "undefined" ? OvertakeMode.mj(player) : 0;
  const otHeld = otMJ > 0 && !player.otArmed && !(player.otT > 0);   // granted, paused (below OT_MIN_SPEED)
  const caution = G.cautionInfo ? G.cautionInfo() : null;
  const gateOpen = typeof G.otEnabled === "function" ? !!G.otEnabled() : true;
  const otOff = G.state === "race" && !gateOpen && !(player.otT > 0);
  // The class follows the GATE like the text does: a held lap-0 grant (or one
  // under a safety car) used to pulse the yellow "ready" plate while the text
  // read OT · CAUTION and the button was disabled (bug hunt 2026-10-14 N2).
  const ot = player.otT > 0 ? "ot-active" : otOff ? "ot-off" : player.otArmed || otHeld ? "ot-armed" : player.otEarned ? "ot-cool" : "ot-off";
  hClass(els.ot, ot);
  const leader = G.ranked && G.ranked[0];
  let otReason = "";
  if (otOff) {
    // RaceControl has independent gates. Keep the reason in the HUD so a
    // player knows whether to wait for green, a dry track or the opening lap
    // to pass; the input path still checks c.otArmed in game.js. Only the
    // Safety Car / red flag (B7.2.2c) and LOW GRIP (B7.2.2d) close it; a
    // yellow or VSC flying on lap 1 must not be named as the reason.
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
  hAttr(els.ot, "aria-label", player.otT > 0 ? "Overtake active, " + mjTxt + " left"
    : otOff ? (otReason === "caution" ? "Overtake unavailable under caution"
      : otReason === "low-grip" ? "Overtake off in low grip conditions"
      : otReason === "opening-lap" ? "Overtake unavailable on lap 1"
      : otReason === "waiting-for-leader" ? "Overtake waiting for the leader"
      : "Overtake unavailable")
    : otReady ? "Overtake ready, " + mjTxt + " — press to deploy"
    : player.otEarned ? "Overtake earned — available from the start line"
    : "Overtake unavailable — be within one second at the detection line");
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
  // The TEXT answers "where is the zone", so it keys off position, not arming.
  // Keying it off xArmed showed "AERO 0m" to a car standing INSIDE a zone but
  // too slow to arm — a distance readout of zero, which reads as "the zone is
  // right here" rather than "you are in it". Whether the mode is available is
  // the CLASS's job (ax-armed lights the chip), so the two never contradict.
  const aeroText = autoAero ? (xOpen ? "AUTO STRAIGHT" : "AERO AUTO")
    : noZones ? "NO AERO ZONE"
    : xOpen ? "STRAIGHT MODE"
    : dz === 0 ? "AERO ZONE"
    : dz < 900 ? "AERO " + Math.round(dz) + "m"
    : "CORNER MODE";
  hText(els.aero, aeroText);
  hAttr(els.aero, "aria-label", autoAero ? (xOpen ? "Automatic Straight Mode active" : "Active aero automatic")
    : noZones ? "No aero zone" : xOpen ? "Straight Mode active" : "Active aero manual");
  if (timeTrial) {
    // The DROP rule (gapForm) runs here too. The attribute it maintains lives
    // on <html> and outlives the session, so a race on a narrow phone left the
    // widget dropped for the time trial that followed, and a time trial on its
    // own never dropped it — although GHOST +0.123s is the LONGEST spelling the
    // slot ever holds. The format it returns is a race concern (no gaps here).
    gapForm();
    // no field rivals — show the shared rival (or personal best) delta
    const ghost = replayGhost();
    if (GhostShare.hasGuest() || Ghost.hasGhost()) {
      const ghostT = (player.lap | 0) >= 1 ? ghost.timeAt(player.s) : null;   // S4: not off the run-up clock
      if (ghostT !== null) {
        const delta = player.lapTime - ghostT;
        hText(els.gapA, (GhostShare.hasGuest() ? "RIVAL GHOST " : "GHOST ") + signedFixed(delta) + "s");
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
    // 0.26 × vTop ≈ 25 m/s at default pace.
    const vFloor = Math.max(player.speed, G.vTop() * 0.26);
    hText(els.gapA, a ? gapText(0, gap, "▲", a, a.prog - player.prog, vFloor) : "");
    hText(els.gapB, b ? gapText(1, gap, "▼", b, player.prog - b.prog, vFloor) : "");
    // WHO: the neighbour's team colour as the chip's left bar (css/hud.css).
    hStyle(els.gapA, "--gap-team", a ? teamCss(a) : "");
    hData(els.gapA, "tow", a && (player.towing || 0) > 0.5 ? "1" : null);   // in the tow
    hStyle(els.gapB, "--gap-team", b ? teamCss(b) : "");
    // THE RIVALS' WINDOWS: "P12" when the neighbour's planned stop is within
    // three laps, "IN" while it is stopping (PitLane.windowOf) — a suffix the
    // sheet paints as ::after, so gapForm's learned spellings stay whole.
    const win = (el, o) => {
      const w = o && G.pits && G.pits.windowOf ? G.pits.windowOf(o) : "";
      if (w) { if (el.dataset.pit !== w) el.dataset.pit = w; } else if (el.dataset.pit != null) delete el.dataset.pit;
    };
    win(els.gapA, a); win(els.gapB, b);
  }
  // THE LANE IS STALE UNTIL THE STRINGS LAND. fitHud (above) clips #announce
  // from the gaps box as it was at the start of this tick — empty, or the
  // previous spelling. gapForm then drops the strip into the hanging band and
  // hText writes the live gap, so the card that hud-layout.spec.js measures
  // on the SAME tick (jump → wait --hud-top-h → probe, no 10 Hz wait) sat on
  // .hud-gaps on notched-landscape tilt/touch. Re-clip from the box as painted.
  announceLaneTick(document.documentElement, force);
  // Lane re-pick can clear data-lane-collapsed; re-assert painted clearance
  // over SPEED/GEAR (phoneL broadcast @150%).
  radioPaintedCollapseTick(document.documentElement, force);
  paintHudDelta(player, timeTrial);
  if (typeof HudRelative !== "undefined") HudRelative.tick(G, player);   // opt-in RELATIVE box (js/ui/hud-relative.js)
  if (typeof HudStrategy !== "undefined") HudStrategy.tick(G, player);   // opt-in STRATEGY panel (js/ui/hud-strategy.js)
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
      // THREE STATES, THREE GLYPHS. The arrows already carried pb-vs-slower on a
      // non-colour channel, but SESSION best and PERSONAL best both read "▼" and
      // separated only as purple vs green — which is the textbook deuteranopia
      // pair, on the one row where the distinction is the whole point. A player
      // who cannot split those hues saw "▼" twice and had no way to tell a
      // session-topping sector from an ordinary personal best.
      // ★ is the session best, ▼ a personal best, ▲ slower than your own. Same
      // single-glyph width as before, so the fixed row geometry is untouched,
      // and the colours stay exactly as they were for everyone reading them.
      // For SPLIT_DELTA_MS after the crossing the number is the GAIN on the best
      // it was chasing ("▼-0.142", "▲+0.310"), then the split itself again: the
      // same glyph and colour states, and the same character count for any
      // split or delta under 10 s, so the row geometry does not move.
      const dHeld = _secDeltaT[i] > 0 && t != null;
      if (_secDeltaT[i] > 0) _secDeltaT[i] -= HUD_TICK_MS;
      // signedFixed: the sign from the ROUNDED delta (-0.0004 read "-0.000"); a split
      // of a minute or more spells m:ss.mmm like the lap clock, not "75.123".
      const num = dHeld ? signedFixed(_secDelta[i]) : t == null ? "" : t >= 60 && G.fmtTime ? G.fmtTime(t) : t.toFixed(3);
      hText(_secRows[i], t == null ? "--" : (sb ? "★" : pb ? "▼" : "▲") + num);
      _secPrevBest[i] = bests ? bests[i] : Infinity;   // the reference the NEXT crossing's delta is taken against
      // Timing-screen colours: purple session best, green personal best,
      // yellow slower than your own best; no split yet keeps the row's ink.
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
    // ANY time penalty the player carries (track limits, a caution pass): live
    // position already prices it, so the chip shows it rather than a 3 s banner.
    const pen = player ? Math.round(player.penalty || 0) : 0;
    if (_limitsDots == null) _limitsDots = els.hudLimits.querySelector("span");
    if (cw > 0 || pen > 0) {
      if (els.hudLimits.hidden) els.hudLimits.hidden = false;
      // Strikes no longer reset (4th and each additional = +5 s), so four dots
      // are a cap: repeat() of a negative count throws.
      const shown = Math.min(cw, 4);
      hText(_limitsDots, "\u25cf".repeat(shown) + "\u25cb".repeat(4 - shown) + (pen > 0 ? " +" + pen + "s" : ""));
      hToggle(els.hudLimits, "limits-warn", (cw >= 2 || pen > 0) && cw < 3);
      hToggle(els.hudLimits, "limits-hot", cw >= 3);
    } else if (!els.hudLimits.hidden) {
      els.hudLimits.hidden = true;
      hToggle(els.hudLimits, "limits-warn", false);
      hToggle(els.hudLimits, "limits-hot", false);
    }
  }
  // B1 caution flag (local yellow / VSC / safety car) — driven by the caution
  // state machine in js/race/race-control.js, read via G.cautionInfo (READ-ONLY
  // w.r.t. the cars; the debris side-world never moves one). Hidden when green.
  if (els.flag) {
    const cn = G.cautionInfo ? G.cautionInfo() : null;
    // A place gained under a caution owes a give-back inside a 5 s window
    // (js/race/sporting-regs.js), which can outlast the caution itself.
    const owed = !!(cn && cn.owed > 0);
    const caution = !!(cn && (cn.level > 0 || owed));
    // BLUE FLAG: a caution outranks it (the chip holds one flag); no field, no flag.
    const blueCar = !caution && !timeTrial && _ro && G.track && G.state === "race"
      ? _ro.blueFlag(player, cars, G.track.total, G.vTop() * 0.26) : null;
    const show = caution || !!blueCar;
    if (caution) {
      const txt = cn.level === 1 ? "YELLOW" + (cn.sector >= 0 ? " S" + (cn.sector + 1) : "")
                : cn.level === 2 ? "VSC" : cn.level === 4 ? "RED FLAG" : cn.level === 3 ? "SAFETY CAR" : "";
      // The window counts down on the chip at this 10 Hz tick ("SC · LET VER BY
      // 4s"): the banner can be queued behind the caution's own radio card.
      // "SC" keeps the chip short on a phone; the spoken flag below keys on the
      // level text only, so the countdown never re-reads the flag.
      const owe = owed ? "LET " + (cn.owedCode || "THE CAR") + (cn.owed > 1 ? " +" + (cn.owed - 1) : "") + " BY " + Math.ceil(cn.owedT) + "s" : "";
      hText(els.flag, owe ? (txt === "SAFETY CAR" ? "SC" : txt) + (txt ? " \u00b7 " : "") + owe : txt);
      hClass(els.flag, cn.level === 4 ? "flag-red" : cn.level === 3 ? "flag-sc" : cn.level === 2 ? "flag-vsc" : "flag-yellow");
      if (txt !== _flagSaid) { _flagSaid = txt; if (txt) sayFlag(cn); }
    } else _flagSaid = "";
    if (blueCar) {
      hText(els.flag, "BLUE FLAG " + (blueCar.code || ""));
      hClass(els.flag, "");
      // Once per lapping car PER LAP IT GAINS: a gap breathing across the 1.2 s
      // window must not re-speak it, but the same car coming round to lap the
      // player AGAIN is a new flag (it used to stay silent: _blueSaid held the
      // car for the rest of the race). Laps up is stable inside one encounter.
      const lapsUp = Math.round(((blueCar.prog || 0) - (player.prog || 0)) / G.track.total);
      if (blueCar !== _blueSaid || lapsUp !== _blueLaps) {
        _blueSaid = blueCar; _blueLaps = lapsUp;
        sayFlag(null, "BLUE FLAG, LET " + (blueCar.code || "THE LEADER") + " THROUGH");
      }
    }
    if (_blue !== !!blueCar) { _blue = !!blueCar; hData(els.flag, "flag", _blue ? "blue" : null); }
    if (_ro && _ro.paintFlag) _ro.paintFlag(els.flag, show ? (caution ? { caution: cn } : blueCar ? { blue: true } : null) : null);
    // A flag chip appearing or going re-picks the radio slot (radioUnderRight steps right of it).
    if (_flagShown !== show) { _flagShown = show; els.flag.hidden = !show; if (_invalidateFit) _invalidateFit(); }
  }
  // Stamp only after REL, sector rows and announce lane for this tick — fitHud
  // runs at tick start and must not publish early (CI: stamp green, S3×BOOST).
  syncComputedRootVars();
  phoneFitStampSync(+document.documentElement.style.getPropertyValue("--hud-scale") || _cssScale);
  drawMinimap();
}

// THE FLAG IS SPOKEN through #announce-live, the radio card's always-present
// polite region (js/game.js showAnnounce), and ONLY there: #hud-flag carries no
// live role. It used to be a role="alert" filled and unhidden in the same step
// — the pattern NVDA, JAWS and macOS VoiceOver miss (index.html, above
// #announce-live) — so a safety car reached a screen-reader user as nothing.
// Through LiveRegion (js/ui/live-region.js), the region's one writer, at FLAG
// priority: a radio call or a HUD line in the same tick waits behind it instead
// of overwriting it. Once per change of the chip's text, never per HUD tick;
// spelled out in full words because "VSC" and "S2" are glyphs to the eye and
// noise to a voice.
function sayFlag(cn, words) {
  const said = "RACE CONTROL: " + (words ? words : cn.level === 1 ? "YELLOW FLAG" + (cn.sector >= 0 ? ", SECTOR " + (cn.sector + 1) : "")
    : cn.level === 2 ? "VIRTUAL SAFETY CAR" : cn.level === 4 ? "RED FLAG" : "SAFETY CAR");
  if (typeof LiveRegion !== "undefined") LiveRegion.say(said, "flag");
  else if (els.announceLive) els.announceLive.textContent = said;
}

function drawMinimap() {
  const player = G.player, cars = G.cars, track = G.track, timeTrial = G.timeTrial;
  if (!player || !track || !track.map) return;
  // hud-hide-map is display:none (cockpit/onboard cams, MINIMAL, map OFF): a
  // map nobody can see was sized, cached, blitted and dotted every HUD tick.
  // Forget its measurement key so the next visible draw measures afresh.
  if (document.body.classList.contains("hud-hidden") || document.body.classList.contains("hud-hide-map")) { _mmKey = null; return; }
  // Logical space = the element's LOCAL CSS box (clientWidth is pre-zoom px,
  // the same convention js/ui/sheet-shape.js relies on). Bitmap = local x effective
  // zoom x DPR so one drawn pixel is one physical pixel — mirroring the menu
  // track preview (js/ui/select-screen.js), which solved this exact blur first.
  // currentCSSZoom, not the raw --hud-scale: the element rides the CAPPED
  // --hud-z, and the raw slider would over-allocate on a capped band. Ratio
  // capped at 3 to bound fill/memory on a DPR-3 phone at HUD SIZE 200%.
  // The fit key includes changing gap spelling/sector rows. Those cannot
  // resize this explicit CSS box unless fitHud changes the band's scale, so
  // keep a separate layout-free key rather than measuring after HUD writes.
  // Density selects the 96/140px CSS box; DPR can change without a resize.
  // Keep the bounded retry while the fit has no laid-out box, and the track
  // invalidation path (minimapBg null) so a newly visible map measures afresh.
  const root = document.documentElement, body = document.body;
  const measureKey = vpW() + "x" + vpH() + "|" + body.className
    + "|" + (body.dataset.density || "") + "|" + root.style.getPropertyValue("--hud-scale")
    + "|" + root.style.getPropertyValue("--hud-z-top") + "|" + (window.devicePixelRatio || 1)
    + "|" + els.minimap.style.getPropertyValue("--hl-s");   // MOVE & SIZE (js/ui/hud-layout.js)
  if (_mmKey !== measureKey || _fitKey === "" || !minimapBg) {
    _mmKey = measureKey;
    _mmCssW = els.minimap.clientWidth || 140;
    _mmCssH = els.minimap.clientHeight || 140;
    _mmRatio = Math.min(3, Math.max(1,
      (els.minimap.currentCSSZoom || 1) * (window.devicePixelRatio || 1)
      * (parseFloat(els.minimap.style.getPropertyValue("--hl-s")) || 1)));
    _mmBgKey = _mmCssW + "|" + _mmCssH + "|" + _mmRatio;
  }
  const cssW = _mmCssW, cssH = _mmCssH, ratio = _mmRatio;
  const W = Math.round(cssW * ratio), H = Math.round(cssH * ratio);
  // Every CSS tier gives #minimap an explicit width/height, so the attribute
  // change never moves the layout box (fitHud reads the same numbers).
  if (els.minimap.width !== W || els.minimap.height !== H) {
    els.minimap.width = W; els.minimap.height = H;
  }
  // pre-render the static track outline once; reuse as a cheap blit every HUD frame
  const bgKey = _mmBgKey;   // no string built per HUD tick
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
    // SECTOR IDENTITY: the podium metals in rank order (S1 gold, S2 silver,
    // S3 bronze), from css/tokens.css via TrackMaps.sectorColors — the CIRCUIT
    // DETAIL diagram draws the same three, so the menu and the map agree. It
    // was purple / red / lime: purple is the timing screen's SESSION BEST
    // (--sec-best) and red against lime is the red-green colour-blind pair.
    // The metals separate on lightness and chroma, which every colour-vision
    // type keeps, and none is the AERO blue, the ghost cyan or --you. The
    // HUD's S1/S2/S3 labels carry no colour (buildSecRows), so this is the
    // only place sector identity is a colour at all. 0.8 alpha, as before.
    const SC = TrackMaps.sectorColors();
    mc.globalAlpha = 0.8;
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
    mc.globalAlpha = 1;
    // Activation-zone highlight, slightly thicker, in the AERO chip's own blue
    // (#hud-aero.ax-armed / #btn-aero.armed), so the map and the chip name the
    // zone in one colour.
    const zones = TrackMaps.drsZones(track.def);
    if (zones && zones.length) {
      mc.strokeStyle = "rgba(38,165,245,0.9)"; mc.lineWidth = 3;
      for (const z of zones) {
        // z.b > 1 for a zone across the line: walk on past n and wrap.
        const from2 = Math.floor(z.a * n), to2 = Math.floor(z.b * n);
        mc.beginPath();
        for (let i = from2; i <= to2; i++) {
          const p = map[i % n];
          mc.lineTo(8 + p[0] * (cssW - 16), 8 + p[1] * (cssH - 16));
        }
        mc.stroke();
      }
    }
    // THE PIT LANE: a light dashed run from where the entry road peels off
    // to where the exit road rejoins, a "P" where it PEELS OFF and a tick
    // across the run at the entry line. The "P" marks the peel-off, not the
    // line 70 m past it, where a driver steering at it is already on the road
    // the boards named 100 m earlier.
    const pit = track.pit;
    _mmPitP = null;
    if (pit && pit.entryRoadM != null) {
      const L = track.total, fOf = (s) => (((s % L) + L) % L) / L;
      const fa = fOf(pit.sA), fb = fOf(pit.sB);
      const i0 = Math.floor(fa * n), steps = Math.max(2, Math.round((((fb - fa) % 1) + 1) % 1 * n));
      mc.strokeStyle = "rgba(236,236,246,0.85)"; mc.lineWidth = 3; mc.setLineDash([3, 3]);
      mmRun(mc, map, n, i0, steps, cssW, cssH);
      mc.stroke(); mc.setLineDash([]);
      // The entry line: a tick across the run, normal to the lane there.
      const il = Math.floor(fOf(pit.sIn) * n) % n, pe = map[il], pn = map[(il + 1) % n];
      const ex = 8 + pe[0] * (cssW - 16), ey = 8 + pe[1] * (cssH - 16);
      let tx = (pn[0] - pe[0]) * (cssW - 16), ty = (pn[1] - pe[1]) * (cssH - 16);
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      mc.strokeStyle = "rgba(255,255,255,0.95)"; mc.lineWidth = 2;
      mc.beginPath(); mc.moveTo(ex - ty * 4, ey + tx * 4); mc.lineTo(ex + ty * 4, ey - tx * 4); mc.stroke();
      const pa = map[i0 % n];
      _mmPitP = [8 + pa[0] * (cssW - 16), 8 + pa[1] * (cssH - 16), i0 % n];
      mmPitMark(mc, _mmPitP[0], _mmPitP[1], 5, "rgba(255,255,255,0.95)");
      // The map's own "--you" (the token the cue and the tyre chip carry the
      // stop in), read once per rebuild: a resolved colour is not a hot read.
      _mmYou = (typeof getComputedStyle === "function"
        && getComputedStyle(document.documentElement).getPropertyValue("--you").trim()) || "#aeea00";
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
  // THE NaN AMPLIFIER. `Math.floor(NaN) % n` is NaN, `map[NaN]` is undefined,
  // and `p[0]` then throws — so ANY car whose `s` goes non-finite turns a
  // silent physics NaN into a hard TypeError here. It is the only consumer of a
  // bad `s` that throws; every other one (Tracks.sample and friends) degrades
  // quietly. A negative `s` is the same trap: JS `%` keeps the sign.
  //
  // The throw lands AFTER render() in tickBody, so the world keeps moving and
  // only the HUD freezes; js/perf/loop-health.js then swallows it, and because
  // this path is throttled to ~10 Hz it never trips the 8-consecutive-fault
  // rail — it grinds to the 240 lifetime cap and paints the error overlay
  // ~24 s later at 60 fps. "HUD froze, then it died half a minute afterwards"
  // is the signature, and it is a miserable one to trace back to a NaN.
  const at = (v) => {
    const i = Math.floor(v / track.total * n) % n;
    return Number.isFinite(i) ? map[(i + n) % n] : null;
  };
  for (const c of cars) {
    if (c === player) continue;
    const p = at(c.s);
    if (!p) continue;
    const x = 6 + p[0] * (cssW - 16), y = 6 + p[1] * (cssH - 16);
    mm.fillStyle = teamCss(c);   // keyed on store.rev: a livery edit repaints the dot
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
  // ghost replay marker (time trial): shared rival first, otherwise your PB
  const ghost = replayGhost();
  if (timeTrial && (player.lap | 0) >= 1 && (GhostShare.hasGuest() || Ghost.hasGhost())) {   // S4
    const gh = ghost.at(player.lapTime);
    if (gh) {
      const gp = at(gh.s);   // a persisted ghost is stored input: never trust its s
      // Skip only the GHOST dot on a bad s — returning here would take the
      // player's own white marker (drawn below) down with it for the session.
      if (gp) {
        mm.fillStyle = "rgba(120, 220, 255, 0.95)";
        mm.beginPath();
        mm.arc(8 + gp[0] * (cssW - 16), 8 + gp[1] * (cssH - 16), 3.4, 0, 7);
        mm.fill();
      }
    }
  }
  const p = at(player.s);
  if (!p) return;
  // THE PIT MARKER CARRIES STATE. The static "P" is the map's "there are pits";
  // over it, from the same three facts the cue reads (PitLane.worthStopping —
  // ONE gate, so the map and the words can never disagree): a stop worth
  // making grows it and gives it --you, an armed stop pulses it, and from
  // CUE_M in an arc from the car to the peel-off says HOW FAR, the way the
  // cue's metres do. The lane and the box turn the player's own disc --you.
  const pits = G.pits, inPit = !!player.pitState && player.pitState !== "none";
  if (_mmPitP && pits && pits.worthStopping && !inPit && pits.worthStopping(player)) {
    const d = pits.toEntry(player), ip = Math.floor(player.s / track.total * n) % n;
    if (d > 0 && d < pits.cueM && Number.isFinite(ip)) {
      mm.strokeStyle = _mmYou; mm.lineWidth = 2;
      mmRun(mm, map, n, (ip + n) % n, ((_mmPitP[2] - ip) % n + n) % n, cssW, cssH);
      mm.stroke();
    }
    if (player.pitArmed && !motionReduced()) mm.globalAlpha = 0.55 + 0.45 * Math.sin(performance.now() / 160);
    mmPitMark(mm, _mmPitP[0], _mmPitP[1], 7, _mmYou);
    mm.globalAlpha = 1;
  }
  mm.fillStyle = inPit ? _mmYou : "#fff";
  mm.beginPath();
  mm.arc(8 + p[0] * (cssW - 16), 8 + p[1] * (cssH - 16), 4, 0, 7);
  mm.fill();
}

/** A polyline along `steps` map nodes forward from node `i0`, in the map's
 *  local px; the caller strokes it (the lane run and the distance arc). */
function mmRun(ctx, map, n, i0, steps, cssW, cssH) {
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const p = map[(i0 + i) % n];
    const x = 8 + p[0] * (cssW - 16), y = 8 + p[1] * (cssH - 16);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
}
/** The "P" disc at the peel-off, radius `r` in local px. */
function mmPitMark(ctx, x, y, r, fill) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#14161c"; ctx.font = "700 " + (r + 2) + "px system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("P", x, y + 0.5);
}

// loadTrack() calls this so the outline re-renders for the new circuit.
function invalidateMap() { minimapBg = null; }

// Per-race HUD memory: the POS box compared its first ranked tick of a new race
// against the LAST race's finishing position and flashed "down" at lights-out.
// The race DELTA's best lap and the spoken HUD's baselines are per race too.
let _pitSideTrack = null, _pitSide = 1;
function resetRace() {
  if (typeof HudInputs !== "undefined" && HudInputs.reset) HudInputs.reset();
  _lastRank = 0; _posFlashT = 0; if (els.pos) delete els.pos.dataset.delta;
  _holdLap = 0; _holdPrev = 0; _holdOn = false; _secPrevBest = [Infinity, Infinity, Infinity]; _secDeltaT = [0, 0, 0];
  _ePrev = NaN; _blueSaid = null; _blueLaps = 0;
  // THE GAP CHIPS CARRY STATE ACROSS SESSIONS: a time trial paints the ghost
  // delta's colour inline, a race the neighbour's team bar, the tow halo and
  // the pit-window suffix — and neither branch clears the other's. The write
  // cache then kept the stale tint/bar until something rewrote it.
  for (const el of [els.gapA, els.gapB]) {
    if (!el) continue;
    hStyle(el, "color", ""); hStyle(el, "--gap-team", ""); hData(el, "tow", null);
    if (el.dataset && el.dataset.pit != null) delete el.dataset.pit;
  }
  if (_trace) _trace.reset();
  if (_speak) _speak.reset();
  if (typeof LiveRegion !== "undefined") LiveRegion.reset();   // nothing from the last session is read into this one
}
// RE-FIT ON THE NEXT TICK. The fit key reads body.className, but MOVE & SIZE
// (data-hl on the element) and HUD ELEMENTS (body[data-hud-hide]) change
// attributes it cannot see, so either waited out the 3 s same-key backoff.
// HudLayout.apply and HudElements.apply call GameHud.invalidateFit().
// THE PIECES THAT FOLLOW ANOTHER PIECE'S PAINTED BOX re-derive AT ONCE: the radio
// card's top-row slot hangs off the tower as drawn, --mir-paint-b off the mirror
// as drawn, and the next HUD tick can be a long way off (a frozen headless page
// draws one frame per capture). Saved survey reports had the card at the PREVIOUS
// layout's tower edge + 8 (BIG: x 829 against a tower ending at 866). Two rect
// reads per apply, only once the fit has found the tower; the caps still wait
// for the tick.
function invalidateFit() {
  _fitKey = ""; _fitRetry = 0;
  _fitPending = true;
  invalidateLaneRects();   // MOVE & SIZE / HUD ELEMENTS / scale — clippers moved
  if (!_hudTop || document.body.classList.contains("hud-hidden")) return;
  const root = document.documentElement;
  hStyle(root, "--hud-fit-stamp", "");
  _fitStamped = false;
  radioTopSlot(root, document.body.classList.contains("hud-prof-broadcast"));
  radioPaintedCollapse(root);   // a collapse the fit just made must survive this re-pick
  mirrorClear(root);
  if (typeof HudLayout !== "undefined" && HudLayout.clearReadouts) HudLayout.clearReadouts();
}
_invalidateFit = invalidateFit;
// fonts-hud.css loads late (media="print" swap, index.html), so the first fit
// measured the gap spellings in the fallback face and kept those widths: the
// fit key carries no font signal, so the wrong rung held until the 3 s backoff
// (F-16). Forget the measured widths and refit once the faces are in.
if (typeof document !== "undefined" && document.fonts && document.fonts.ready && typeof document.fonts.ready.then === "function") {
  document.fonts.ready.then(() => { _gapW[0] = _gapW[1] = 0; invalidateFit(); }, () => {});
}
function syncPhoneFit() {
  syncComputedRootVars();
  phoneFitStampSync(+document.documentElement.style.getPropertyValue("--hud-scale") || _cssScale, true);
  const stamp = document.documentElement.style.getPropertyValue("--hud-fit-stamp");
  return !phonePaintedClash() && /^\d+$/.test(stamp);
}
_syncPhoneFit = syncPhoneFit;
return {
  updateHud, invalidateMap, flashSector, resetRace, invalidateFit, syncPhoneFit,
  // PERF probe: announceLane cache-miss count (tests/unit/hud-announce-lane-cache.test.mjs).
  laneRectMisses: () => _laneRectMisses,
  resetLaneRectMisses: () => { _laneRectMisses = 0; },
};
}

return {
  create,
  invalidateFit: () => { if (_invalidateFit) _invalidateFit(); },
  syncPhoneFit: () => (_syncPhoneFit ? _syncPhoneFit() : false),
  vpKey: () => vpW() + "x" + vpH(),   // the cached viewport, for 10 Hz keys that must not force a layout (#2151)
};
})();
Object.freeze(GameHud);
