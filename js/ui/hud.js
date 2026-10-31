/* Apex 26 — in-race HUD + minimap for js/game.js. Write-cached DOM setters (the panel ticks ~10 Hz but most fields hold steady), cached sector-row nodes, and the … */
const GameHud = (function () {
  "use strict";

const { IDLE_RPM, MAX_RPM } = PhysicsConsts;   // eval-time read: HARD_EDGES pins js/physics/consts.js first
const clamp = M4.clamp;                       // shared scalar helper (js/core/mat4.js)
// REDUCED MOTION for the one HUD motion no stylesheet reaches — the canvas
// minimap's armed pit-marker pulse. Share TitleFx's resolved accessibility
// choice with game-world motion, including OFF overriding the OS.
const _rmq = (typeof window !== "undefined" && window.matchMedia)
  ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
function motionReduced() { return typeof TitleFx !== "undefined" && typeof TitleFx.mode === "function" ? TitleFx.mode() === "reduce" : !!(_rmq && _rmq.matches)
  || (typeof document !== "undefined" && !!document.documentElement && document.documentElement.dataset.motion === "reduce"); }
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

// ONE BLINK CLOCK. Each HUD `pulse` (css/hud.css: OT armed, ERS, VSC, pit cue,
// limits, the 0.4 s redline) began its own phase when its class landed, so two
// warnings on screen together blinked out of step (DEFECT-LEDGER item H). Pinning
// every pulse's startTime to the document timeline's zero puts them on one
// clock: the 0.8 s pulses share a phase and the redline is their harmonic.
function syncPulse(e) {
  const el = e.target;
  if (e.animationName !== "pulse" || !el || typeof el.getAnimations !== "function") return;
  for (const a of el.getAnimations()) if (a.animationName === "pulse" && a.startTime !== 0) a.startTime = 0;
}
if (typeof document !== "undefined" && typeof document.addEventListener === "function") document.addEventListener("animationstart", syncPulse, true);

// GameHud.invalidateFit(): the live instance's re-fit trigger (null until create).
let _invalidateFit = null, _syncPhoneFit = null;
function create(G) {
Log.info("ui", "GameHud.create");

const els = G.els;
let hudT = 0;                 // ms until the next throttled HUD tick
const HUD_TICK_MS = 100;      // ~10 Hz in WALL time, whatever the display refresh
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
function hText(el, v) { if (!el) return; if (_hudTxt.get(el) !== v) { _hudTxt.set(el, v); const t = el.firstChild; if (t && t.nodeType === 3 && !t.nextSibling && typeof v === "string" && v !== "") t.data = v; else el.textContent = v; } }   // .data, not a node swap: no :empty / root :has() re-run (docs/notes/PERF-P2-HTEXT-2026-10-18.md)
function hStyle(el, prop, v) { if (!el) return; let m = _hudSty.get(el); if (!m) { m = {}; _hudSty.set(el, m); }
  if (m[prop] !== v) { m[prop] = v; if (prop.charCodeAt(0) === 45) el.style.setProperty(prop, v); else el.style[prop] = v; } }
function hUnstyle(el, prop) { if (!el) return; const m = _hudSty.get(el); if (m) delete m[prop]; if (el.style && el.style.removeProperty) el.style.removeProperty(prop); }
function hClass(el, v) { if (!el) return; if (_hudCls.get(el) !== v) { _hudCls.set(el, v); el.className = v; } }
function hToggle(el, cls, on) { if (!el) return; let m = _hudTog.get(el); if (!m) { m = {}; _hudTog.set(el, m); } if (m[cls] !== on) { m[cls] = on; el.classList.toggle(cls, on); } }
function hAttr(el, name, value) { if (!el) return; const v = String(value); if (el.getAttribute(name) !== v) el.setAttribute(name, v); }
/** Aria/prose through I18n when present; without it, fill {name} holes in the English default. */
function hT(key, vars, def) {
  if (typeof I18n !== "undefined") return I18n.t(key, vars, def);
  return String(def).replace(/\{(\w+)\}/g, (m, n) => (vars && vars[n] != null ? String(vars[n]) : m));
}
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
// The minimap (#minimap) lives in js/ui/hud-minimap.js; fitKey is a getter because _fitKey moves.
const _minimap = HudMinimap.create(G, { vpW, vpH, teamCss, replayGhost, motionReduced, fitKey: () => _fitKey });
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
  // "session best". The minimap colours its arcs by sector (js/ui/hud-minimap.js:
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
// BOTH LINES EMPTY collapses the plate (css/hud.css `.hud-gaps[data-empty]`). An
// attribute written only when emptiness flips: the `:has(> div:not(:empty))` rule it
// replaces re-ran root :has() invalidation on every gap text write (B·H11).
function gapsEmptySync() {
  const plate = els.gapA && els.gapA.parentNode;
  if (!plate || !plate.dataset) return;
  hData(plate, "empty", (els.gapA.textContent || (els.gapB && els.gapB.textContent)) ? null : "");
}
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
let _fitTrace = "", _fitKey = "", _fitWait = 0, _fitRetry = 0, _fitClearSeq = 0, _hlEls = [];
// THE 3 s BACKSTOP RE-FITS ONLY WHAT RESIZED, seen by a ResizeObserver (no layout read); why and the settle window: docs/notes/LIVE-INPUT-H11-2026-10-20.md.
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
let _fitPending = false;   // invalidateFit mid-tick: do not publish --hud-fit-stamp until the next fitHud
// _fitStamped: a stamp is published and no clash has voided it since.
// _fitClashRun: consecutive same-key ticks that re-opened the fit for a clash.
let _fitStamped = false, _fitClashRun = 0;
// The post-write clash probe's skip key (#2240): what decides a clash, read without layout.
let _stampKey = "", _stampWait = 0;
const FIT_CLASH_TRIES = 5;
// Per moved piece: hidden, or visible + the LENGTH of its words. A moved piece's
// width is part of what HudLayout.fit clamps, and the AERO chip's words change
// all lap ("AERO 523m" counting down, AERO ZONE, STRAIGHT MODE, CORNER MODE):
// keyed on `hidden` alone it widened past the screen edge after the fit and
// stayed there until the 3 s same-key re-measure (hud-survey 1280x720 cockpit:
// aero right edge 1297 of 1280). textContent costs no layout; a length that
// changes re-fits once, and the countdown only does so when a digit rolls over.
// A chip css/track-detail.css hides (touch cockpit strip: body[data-hl-set=cockpit]:not(.desktop),
// not player-placed) counts as hidden too: its ERS glyph / AERO countdown re-ran the full fit
// ~0.5/s for a box nobody sees (perf hunt 8). Mirrors that selector without a layout read.
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
  // The computed value includes an INLINE --hud-scale / --hud-btn-scale: a camera switch at HUD 150 %
  // cached 1.5 as the "stylesheet default", so reverting HUD SIZE kept the 150 % caps (UI-HUNT-2-HUD 10c).
  const rs = document.documentElement.style;
  const k = vpW() + "x" + vpH() + "|" + document.body.className + "|" + rs.getPropertyValue("--hud-scale") + "|" + rs.getPropertyValue("--hud-btn-scale");
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
// fitHud's dock buttons, queried once per dock layout, not per 10 Hz tick: layoutDocks (game.js) re-parents GROUPS and
// pickDocks swaps the handles, so the cache keys on [dockL, its children…, dockR, …]; invalidateFit drops it too.
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
// THE RADIO CARD'S SLOTS AND THE DOCK LANE live in js/ui/hud-radio-lane.js (#3261).
// top / docks / fitKey are getters: pickDocks and the fit move what they return.
const { invalidateLaneRects, dropLaneRects, announceLane, announceLaneTick, radioTopSlot, radioPaintedCollapse, radioPaintedKey,
  radioPaintedCollapseTick, laneRectMisses, resetLaneRectMisses } = HudRadioLane.create(G, {
  vpW, vpH, hStyle, hUnstyle, hToggle, fitKey: () => _fitKey, top: () => _hudTop, docks: () => [_dockL, _dockR],
});
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
/** Drop the gap strip under the tower when the painted boxes still overlap (hud-layout: .hud-top+.hud-gaps). */
function gapPaintedDrop() {
  if (!towerGapsPaintedClash()) return false;
  _gapDrop = true;
  document.documentElement.dataset.gapDrop = "1";
  const gaps = document.querySelector(".hud-gaps");
  if (gaps) void gaps.offsetHeight;
  return true;
}
/** Gap strip painted over the rear-view mirror frame (#3271: portrait cockpit, the dropped strip sits in the mirror's row). */
function gapsMirrorPaintedClash() {
  if (document.body.classList.contains("desktop") || !_mirEl || _mirEl.hidden || !document.body.classList.contains("hud-mirror-on")) return false;
  const gaps = document.querySelector(".hud-gaps");
  if (!gaps || gaps.hidden || manualHud(gaps) || manualHud(_mirEl) || document.body.classList.contains("hud-hide-gaps")) return false;
  return _hudRectsHit(gaps.getBoundingClientRect(), _mirEl.getBoundingClientRect());
}
/** Park the strip under the mirror frame; css/hud.css reads --mir-paint-b through [data-gap-mir]. */
function gapMirrorDrop() {
  if (document.documentElement.dataset.gapMir || !gapsMirrorPaintedClash()) return false;
  document.documentElement.dataset.gapMir = "1";
  void document.documentElement.offsetHeight;
  return true;
}
const _PEDAL_STEER = () => [els.btnBrake, els.btnThrottle, els.btnSteerLeft, els.btnSteerRight];
const _hitPedalSteer = (rr) => _PEDAL_STEER().some((el) => el && !el.hidden && _hudRectsHit(rr, el.getBoundingClientRect()));
/** Slide #hud-aero right past a steer/pedal button it paints over (#3272), never into the right dock. */
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
/** Painted phone readout-on-control clashes the spec measures (not budget math). */
function phonePaintedClash(boostIn) {
  if (document.body.classList.contains("desktop")) return false;
  if (towerGapsPaintedClash() || gapsMirrorPaintedClash()) return true;
  const sectors = els.hudSectors;
  const boost = boostIn !== undefined ? boostIn : _boostOnRightHalf();   // a caller that already measured it this tick passes it
  if (sectors && !manualHud(sectors) && !sectors.hidden && boost && _hudRectsHit(sectors.getBoundingClientRect(), boost.getBoundingClientRect())) return true;
  const rel = typeof document !== "undefined" ? document.getElementById("hud-rel") : null;
  if (rel && !manualHud(rel) && !rel.hidden) {
    const rr = rel.getBoundingClientRect();
    // Pedals are #btn-* siblings, not #dock-left children (index.html).
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
  // REL's own tick already re-fit it if its key moved; fitRows writes then reads,
  // so an unconditional call here forced a layout every phone tick (#2151).
  if (typeof HudRelative !== "undefined") { if (HudRelative.refit) HudRelative.refit(force); else if (HudRelative.fitRows) HudRelative.fitRows(); }
  // A steady tick (nothing that places a readout moved since the last clear verdict) skips the
  // probe: its rect reads were one forced layout per tick after this tick's writes (#2240). Any key
  // change, a forced sync, a voided stamp or the 3 s backstop probes as before.
  const sk = radioPaintedKey(root) + "|" + _fitKey + "|" + (typeof HudRelative !== "undefined" && HudRelative.fitKey ? HudRelative.fitKey() : "")
    + "|" + (els.hudSectors ? (els.hudSectors.hidden ? "h" : "v") : "-");
  if (!force && _fitStamped && !_fitPending && sk === _stampKey && --_stampWait > 0) return;
  if (els.aero && els.aero.style.left) { els.aero.style.left = ""; els.aero.style.position = ""; }   // a stale #3272 nudge: the probe re-applies it
  // One probe per pass: the verdict after the last pass feeds the stamp below.
  if (root.dataset && "gapMir" in root.dataset) delete root.dataset.gapMir;   // re-derived by the probe below
  let clash = phonePaintedClash();
  for (let pass = 0; pass < 8 && clash; pass++, clash = phonePaintedClash()) {
    if (gapPaintedDrop() || gapMirrorDrop()) continue;
    if (typeof HudRelative !== "undefined" && HudRelative.fitRows) HudRelative.fitRows();
    bumpDock();
    shrinkSectors();
    nudgeAero((els.aero && els.aero.currentCSSZoom) || scale || 1);
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
  _stampKey = clash ? "" : sk; _stampWait = 30;
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
  const placedSectors = manualHud(els.hudSectors);
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
  // Which dock buttons are showing is part of the key: showTouchControls hides/unhides BOOST, OT, AERO
  // and the shifts after the first fit, and a taller column under a stale cap overflowed the top.
  let dockSig = "";
  for (const b of dockButtons()) dockSig += b.hidden ? "0" : "1";   // the list is cached; per tick only `.hidden`
  const head = vpW() + "x" + vpH() + "@" + scale + "+" + btnScale + "|" + gapLen + "." + secRows + "." + dockSig + (_rx.delta && !_rx.delta.hidden ? "d" : "") + "|";
  const tail = "|" + document.body.className;
  const sameKey = head + hlKey() + tail === _fitKey;
  if (sameKey && _fitWait === 1 && fitBoxesSettled()) _fitWait = 31;   // backstop due, nothing resized: wait another 3 s
  if (sameKey && --_fitWait > 0) { if (_fitObs && !_fitObsDirty) { _fitClashRun = 0; return; } // settled: no gBCR / getComputedStyle this backoff
    // Same-key backoff must not lock a short --dock-r-w while wrap-reverse
    // still crawls BOOST left under load (CI oversize APEX_WORKERS=2:
    // #hud-sectors+btn-boost after the wait already saw clearance).
    let clash = false, boost;
    if (!placedSectors && !document.body.classList.contains("desktop") && els.hudSectors && !els.hudSectors.hidden) {
      const s = els.hudSectors.getBoundingClientRect();
      boost = _boostOnRightHalf();
      const b = boost ? boost.getBoundingClientRect() : null;
      // Only a RIGHT-half BOOST can clash with the sectors plate's dock inset.
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
  _fitKey = key; _fitWait = 30; _stampKey = "";   // a full fit ran: the next stamp tick probes
  _fitPending = false;
  fitWatch(); _fitObsDirty = false; _fitAt = _fitNow(); _fitSkips = 0;
  // CAPS AT A CANONICAL ZOOM, LENGTHS AT THE PAINTED ONE (#2882, #2941). Font metrics
  // quantize with zoom, so caps read at the zoom on screen were path-dependent (844x390:
  // 0.95 from HUD 100, 0.94 from 200). The cap pass reads both bands at zoom 1: one cap
  // per viewport, min(scale, cap) monotonic. The paint pass re-measures under it, so
  // --hud-top-h is the painted tower (667x375: 48 px painted vs 46.4 published).
  const zWas = [root.style.getPropertyValue("--hud-z-top"), root.style.getPropertyValue("--hud-z-bot")];
  _fitCanon = null;
  if (fitPass(true, scale, btnScale, placedSectors)) fitPass(false, scale, btnScale, placedSectors);
  else ["--hud-z-top", "--hud-z-bot"].forEach((p, i) => (zWas[i] ? root.style.setProperty(p, zWas[i]) : root.style.removeProperty(p)));   // nothing laid out
}
let _fitCanon = null;   // the cap pass's { top, bot }, consumed by the paint pass
let _tyreRestack = null;   // the paint pass's stored limits-left TYRES restack { key, leftBot, metricsB } (#2797)
function fitPass(canon, scale, btnScale, placedSectors) {
  const root = document.documentElement;
  // A band already at zoom 1 (HUD 100, uncapped) is measured as it stands: no "1" write and undo (#2797).
  if (canon) for (const p of ["--hud-z-top", "--hud-z-bot"]) if ((+root.style.getPropertyValue(p) || scale) !== 1) root.style.setProperty(p, "1");
  // Measure the natural plate, never the previous dock pass's wrapped output.
  // A saved MOVE & SIZE plate belongs to HudLayout's placement pass below.
  if (els.hudSectors && els.hudSectors.style) els.hudSectors.style.removeProperty("max-width");
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
  // The CSS paints min(cap, max(floor, slider)) (css/touch-controls.css): a cap a fit wrote at a larger
  // BUTTON SIZE never paints a smaller one bigger, so measure with the same min (UI-HUNT-2-HUD).
  let zDockPub = Math.min(+root.style.getPropertyValue("--hud-z-dock") || Infinity, Math.max(btnFloor, btnScale));
  let zDockPubS = Math.min(+root.style.getPropertyValue("--hud-z-dock-l") || zDockPub, Math.max(btnFloor, btnScale));   // #dock-left (steer) paints at its own cap
  const zoomDiv = (el, pub) => (el && (el.currentCSSZoom > 0 || _noCssZoom) ? (pub || 1) : 1);
  const wide = (el, pub) => {
    if (!el || manualHud(el)) return 0;
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
  // menu layer: nothing laid out, measure again next tick — but BOUNDED: an
  // unlatched key re-ran this whole rect pass (and the minimap's layout reads)
  // 10×/s for as long as the layout stayed empty, i.e. the entire countdown.
  // AN EMPTY TOWER IS NOT AN EMPTY HUD: with POS/LAP/TIME/BEST all switched off
  // (HUD ELEMENTS) `.hud-top` has no width for the whole race, and returning
  // here latched with no cap written at all — the dock's included. Only a HUD
  // with NOTHING laid out returns; an empty tower budgets as zero and falls
  // through, still retrying (bounded) in case it is merely not populated yet.
  let retry = !top;
  if (!top && !wide(els.minimap, zTopPub) && !wide(els.hudSectors, zTopPub) && !span(_hudBottom, zBotPub) && !wide(_dockL, zDockPub) && !wide(_dockR, zDockPub)) {
    if (++_fitRetry <= 30) { _fitKey = ""; _fitPending = true; }   // nothing fitted: no --hud-fit-stamp yet
    return false;
  }
  // The dock's painted floor (declared above): read past the nothing-laid-out retry, which a
  // harness without rects takes every tick, so the bail stays free of computed-style passes.
  try { const v = parseFloat(getComputedStyle(root).getPropertyValue("--hud-btn-floor")); if (Number.isFinite(v) && v > 0 && v <= 1) btnFloor = v; } catch (_) { /* mini-dom */ }
  zDockPub = Math.min(+root.style.getPropertyValue("--hud-z-dock") || Infinity, Math.max(btnFloor, btnScale));   // the CSS min()
  zDockPubS = Math.min(+root.style.getPropertyValue("--hud-z-dock-l") || zDockPub, Math.max(btnFloor, btnScale));
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
  const mmR = els.minimap && !manualHud(els.minimap) ? layoutRect(els.minimap) : null;
  const scR = els.hudSectors && !manualHud(els.hudSectors) ? layoutRect(els.hudSectors) : null;
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
  // Canonical widths only: the paint pass's quantized ones would seed the next cap pass.
  if (gaps && canon) _gapW["gapShort" in root.dataset ? 0 : 1] = gaps;
  const wShort = _gapW[0] || gaps, wLong = _gapW[1] || gaps;
  const leftFor = (w) => (map ? 10 + map + 8 + w : 0) + FIT_AIR;
  const capLong = capFor(leftFor(wLong)), capShort = capFor(leftFor(wShort));
  const capNo = capFor(leftN);
  if (canon) { _gapTight = capLong < scale; _gapDrop = _gapTight && capShort < scale; }
  let satPx = 0;
  try { satPx = parseFloat(getComputedStyle(root).getPropertyValue("--sat")) || 0; } catch (_) { /* mini-dom / detached root */ }
  // HUD chrome fits around independently sized camera/pause controls: the larger of the
  // zoom clearing one sideways and the zoom clearing it from above (not the measured zoom's row).
  let capChrome = Infinity;
  if (!bcast && top) {
    const tR = layoutRect(_hudTop), botInt = (tR.bottom - satPx) / zoomDiv(_hudTop, zTopPub);
    for (const el of [els.btnCam, els.pausebtn]) {
      const r = el && !el.hidden ? layoutRect(el) : null;
      if (!(r && r.width && r.left > half)) continue;
      const zSide = (r.left - FIT_AIR - half) / (top / 2);
      const zAbove = botInt > 0 ? (r.top - FIT_AIR - satPx) / botInt : -Infinity;
      capChrome = Math.min(capChrome, Math.max(zSide, zAbove));
    }
  }
  // THE TOWER MUST CLEAR THE SECTOR PLATE'S ROW ON TOUCH. There #hud-sectors sits at a fixed SCREEN
  // y (8 + tap-hud + 4 + sat, below the pause button — its zoom cancels), while the tower's bottom
  // scales with the band zoom: sat + z * (top offset + height). The right-half budget above only
  // models the two side by side at the screen edge; once it stopped over-shrinking the band (the
  // plate's dock stand-off is no longer read as a safe-area inset) the full-size tower hung 2.2 px
  // below the plate's top and clipped its BEST tile (844x390 cockpit). Solved from the invariants
  // (the tower's unzoomed top offset and height, the plate's screen top).
  // A placed plate has left this row; budgeting its old anchor made the whole band hunt.
  let capRow = Infinity;
  if (!placedSectors && !bcast && top && scR && scR.width && !document.body.classList.contains("desktop")) {
    const tR = layoutRect(_hudTop), zd = zoomDiv(_hudTop, zTopPub);
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
  const phone = !document.body.classList.contains("desktop");
  const gapsEl = els.gapA ? els.gapA.parentNode : null;
  // THE CAP PASS PUBLISHES ONLY ITS CAPS (#2797): the paint pass rewrites all of this at the painted zoom,
  // so a zoom-1 copy was an A->B swap of root vars (a whole-document restyle) on every full fit.
  if (!canon) {
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
    const tyreEl = els.tyre;
    // colBot: map/gaps edge only (leftBot+tyre latched into the safe area).
    const colBot = leftBot;
    const tyreZ = zBotPub || scale || 1;
    let tyreStack = false, limLeft = false, metricsB = "", restacked = false;
    // THE LIMITS-LEFT RESTACK IS DECIDED ONCE PER INPUT (#2797). Each full fit un-stacked TYRES (A), read
    // the panel and re-stacked it (B): root writes that restyled the whole document every ~3 s for a still
    // layout. The outcome is a function of what is read here in the stacked state, so the same read replays it.
    const tyreFree = phone && tyreEl && !tyreEl.hidden && !(tyreEl.hasAttribute && tyreEl.hasAttribute("data-hl-user"));
    const gmEl = typeof document !== "undefined" ? document.getElementById("game-metrics") : null;
    const readRestackKey = (tR = tyreEl.getBoundingClientRect(), gR = gmEl && !gmEl.hidden ? gmEl.getBoundingClientRect() : null) => [colBot, tR.left, tR.top, tR.height,
      dockL ? dockL.top + "," + dockL.width : "-", hitsRight, gR && gR.width ? gR.top + "," + gR.bottom + gmEl.dataset.pos : "-", chromeZ, tyreZ].join("|");
    const restackKey = tyreFree && _tyreRestack ? readRestackKey() : "";
    if (restackKey && restackKey === _tyreRestack.key) {
      ({ leftBot, metricsB } = _tyreRestack); tyreStack = limLeft = true;   // every write below is already in place
      document.body.classList.toggle("hud-tyre-stack", true); hStyle(root, "--hud-metrics-b", metricsB);
      hStyle(root, "--hud-left-h", (leftBot / chromeZ).toFixed(1) + "px"); hStyle(root, "--hud-left-px", leftBot.toFixed(1) + "px");
    } else {
      // Stack TYRES under the map/gaps edge: always when its dock-top anchor would reach that edge, and
      // (force) when LIMITS takes the slot below. Divide by .hud-bottom zoom so painted y == minTopPx.
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
      const gmR = gmEl && !gmEl.hidden ? gmEl.getBoundingClientRect() : null;
      const gmBot = gmR && gmR.width ? gmR.bottom : 0;
      hStyle(root, "--hud-metrics-b", metricsB = (gmBot / chromeZ).toFixed(1) + "px");
      // The metrics panel is part of what fills this column now, so the room test
      // measures from whichever is lower — the map/strip edge or the panel's bottom.
      const leftFilled = Math.max(leftBot, gmBot);
      const leftRoom = !(dockL && dockL.width && leftFilled + (8 + CHIP_H) * chromeZ > dockL.top);
      limLeft = hitsRight && leftRoom;
      // LIMITS on the left lands under --hud-left-h; a dock-top TYRES still sits
      // in that slot at HUD ≤125% (phoneL survey: limits×tyre): stack it and re-publish so the chip hangs below.
      if (limLeft && tyreFree && !tyreStack && stackTyre(true)) {
        tyreStack = restacked = true;
        document.body.classList.toggle("hud-tyre-stack", true);
        hStyle(root, "--hud-left-h", (leftBot / chromeZ).toFixed(1) + "px");
        hStyle(root, "--hud-left-px", leftBot.toFixed(1) + "px");
      }
      // Stored only when it ENDED re-stacked, keyed on that state (the next fit starts there): one read, on a miss.
      _tyreRestack = restacked ? { key: readRestackKey(), leftBot, metricsB } : null;
    }
    if (limLeft !== ("limitsLeft" in root.dataset)) {
      if (limLeft) root.dataset.limitsLeft = "1";
      else delete root.dataset.limitsLeft;
    }
  }
  // --dock-r-w is published AFTER the zoom caps below: publishing it here
  // with the pre-cap chromeZ left the inset in z=1 space while #hud-sectors
  // painted at the capped --hud-z-top (notched-landscape buttons: S3 on
  // BOOST). #1191's max(anchor(left)) papered over that and then overshot
  // into #announce.
  // Fixed control groups are measured independently of readout content.
  const hudDockEl = _dockL ? _dockL.parentNode : null;
  const steerDock = _dockMir ? _dockR : _dockL;   // #dock-left wherever MIRROR paints it
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
  let capDock = Infinity, capDockS = Infinity;
  const DOCK_MIN_Z = 24 / 48;   // emergency fit floor: narrow-tier taps must still paint 24 CSS px
  const READABLE_Z = 10 / 14;   // 10 CSS px over --fs-micro 14: the gap-chip clamp's and PR #1734's label floor
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
    const want = Math.max(btnFloor, btnScale), dockZ = Math.min(want, Math.max(DOCK_MIN_Z, capDock));
    // THE STEER DOCK (#dock-left) FOLLOWS BUTTON SIZE PAST THE PEDAL COLUMN'S CAP: budgeted against the other
    // dock and its top button at their CAPS (never the slider: monotonic), >= capDock, and the gear/speed
    // cluster keeps its SHIPPED size (or a smaller HUD SIZE): budgeting it at the 10 px floor let BUTTON 245
    // paint SPEED at 10.1 px whatever HUD SIZE said (UI hunt #3, owner's export). Portrait: the shared cap.
    if (window.innerWidth > window.innerHeight) {
      const left = steerDock === _dockL, gS = left ? gL : gR, gO = left ? gR : gL;
      const zO = Math.min(3, Math.max(DOCK_MIN_Z, capDock)), topZ = Math.min(left ? 1.5 : 2, Math.max(1, capDock));
      const roomS = barW - gO.w * zO - 2 * barGap - 2 * FIT_AIR - bottom * Math.ceil(Math.min(scale, 1) * 100) / 100;   // set() ceils --hud-z-bot
      capDockS = Math.max(capDock, Math.min(gS.h ? (controlsRoom - 44 * topZ) / gS.h : Infinity, gS.w ? roomS / gS.w : Infinity));
    } else capDockS = capDock;
    const zS = Math.min(want, Math.max(DOCK_MIN_Z, capDockS)), zDL = steerDock === _dockL ? zS : dockZ, zDR = zS + dockZ - zDL;
    const roomL = controlsRoom - 44 * Math.min(1.5, Math.max(1, dockZ));
    // Readouts adapt to the stable controls, never the reverse.
    const roomW = barW - gL.w * zDL - gR.w * zDR - 2 * barGap - 2 * FIT_AIR;
    if (bottom && roomW > 0) capBot = Math.min(capBot, roomW / bottom);
    // Broadcast stacks its tower/map/messages above the left controls. Fit
    // that readout column to the remaining height without resizing controls.
    if (bcast && phone && window.innerWidth > window.innerHeight) {
      const stack = [_hudTop, els.minimap, gapsEl, els.flag, els.announce, els.tyre];
      const height = stack.reduce((sum, el) => {
        if (!el || manualHud(el) || el.hidden) return sum;
        const r = layoutRect(el);
        return sum + r.height / zoomDiv(el, el === els.tyre ? zBotPub : zTopPub);
      }, 6 * FIT_AIR);
      // Floor at 11 painted px over --fs-micro 14 (Apple HIG's 11 pt minimum; the
      // 10 px READABLE_Z floor painted POS / LAP / TIME at 10.1 px, UI-HUNT-2-HUD).
      const cap = Math.max(11 / 14, (roomL - gL.h * zDL) / Math.max(1, height));
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
  // It reads the TOP band's painted bottoms, so the paint pass re-applies it at the painted zoom.
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
      try { sabPx = parseFloat(getComputedStyle(root).getPropertyValue("--sab")) || 0; } catch (_) { /* */ }
      const avail = window.innerHeight - sabPx - ceilY;
      const denom = 112 + stackR.height / zNowP + 48;
      if (avail > 0 && denom > 0) capPortrait = avail / denom;
    }
  }
  capBot = Math.min(capBot, capPortrait);
  // EACH CAP IS COMPARED AGAINST THE SLIDER THAT DRIVES IT. The readout bands
  // ride --hud-scale; the touch dock rides --hud-btn-scale (BUTTON SIZE, its
  // own slider — css/overlays.css), which defaults to --hud-scale and is only
  // inline once the player has moved it. Comparing the dock's cap against the
  // wrong slider would either pin a cap that fits or drop one that does not.
  // READABLE_Z (above) floors --hud-z-top in portrait only — landscape keeps the 0.4
  // band floor (short phones still drop the gap strip instead).
  const set = (prop, cap, base) => {
    if (cap >= base) root.style.removeProperty(prop);   // fits: the player's number, untouched
    else {
      const floor = prop === "--hud-z-dock" ? DOCK_MIN_Z : (portraitPhone && prop === "--hud-z-top") ? READABLE_Z : 0.4;
      // Readout bands: ceil onto a 0.01 grid (the cap pass's zoom-1 widths
      // already make the cap independent of HUD SIZE, #2882). The dock keeps
      // milli-rounding — heightCap already keeps BUTTON SIZE monotonic
      // (hud-control-clearance).
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
  if (retry) { if (++_fitRetry <= 30) { _fitKey = ""; _fitPending = true; } } else _fitRetry = 0;   // pending: the dock cap is not in yet
  set("--hud-z-top", capTop, scale);
  set("--hud-z-bot", capBot, scale);
  // --hud-top-h is consumed in the tower's own zoom space. Re-publish AFTER
  // the cap write so CSS sees --hud-z-top and --hud-top-h in the same pass.
  // The paint pass measured it under the zoom the cap pass published, so it is
  // the painted tower's length — never re-divide by a lagging currentCSSZoom
  // (ui-redesign: mmCss 142 = 110×staleZoom/zTop).
  if (_hudTop) void _hudTop.offsetHeight;
  if (els.minimap) void els.minimap.offsetHeight;
  hStyle(root, "--hud-top-h", topHPub.toFixed(1) + "px");
  // The steer cap rides WITH the shared one (set()'s test): absent together, else explicit (never a fall-back
  // to --hud-z-dock). A changed steer zoom refits once so TYRES / LIMITS read the new dock top.
  const wantDock = Math.max(btnFloor, btnScale), zSteer = Math.round(Math.min(wantDock, Math.max(DOCK_MIN_Z, capDockS)) * 1000) / 1000;
  if (capDock < wantDock) root.style.setProperty("--hud-z-dock-l", String(zSteer));
  else root.style.removeProperty("--hud-z-dock-l");
  if (Math.abs(zSteer - zDockPubS) > 1e-6 && capDock < wantDock) { _fitKey = ""; _fitWait = 0; _fitPending = true; }
  // The dock paints at max(--hud-btn-floor, BUTTON SIZE) (css/touch-controls.css),
  // so a cap between BUTTON SIZE and that floor still has to be written.
  set("--hud-z-dock", capDock, Math.max(btnFloor, btnScale));
  // Earlier tower/sector budgets saw the old CAM/PAUSE footprint. Refit on
  // the next HUD tick only when their clamped, published zoom changed.
  const dockAfter = Math.min(+root.style.getPropertyValue("--hud-z-dock") || Infinity, Math.max(btnFloor, btnScale));
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
  if (!placedSectors && !document.body.classList.contains("desktop") && els.hudSectors && !els.hudSectors.hidden) {
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
  // Refresh automatic pieces; manually owned geometry remains untouched.
  if (typeof HudLayout !== "undefined") HudLayout.fit();
  // fit() can undo the dock inset; shrink the sector plate before any extra
  // inset widen (widening slides the plate left into #minimap).
  if (!document.body.classList.contains("desktop") && els.hudSectors && _dockR && !placedSectors) {
    const margin = DOCK_AIR;
    const mapR = els.minimap && !els.minimap.hidden ? els.minimap.getBoundingClientRect() : null;
    const mapClear = mapR && mapR.width ? mapR.right + margin : 0;
    const secEl = els.hudSectors;
    // Only automatic plates intruding from the left on shared rows can be
    // squeezed clear. Saved plates belong to HudLayout; squeezing their split
    // times into tall wrapped rows made the two solvers fight on later ticks.
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
          hStyle(root, "--dock-r-w", (dockRW > 0 ? dockRW : 0).toFixed(1) + "px");
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
  dropLaneRects();
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
  // FIT TRACER, off unless `?log=ui:debug`: one line per CHANGE of the published fit, so a phone's
  // flicker reads off the metrics overlay as a timeline instead of a guess.
  if (Log.enabled("ui", Log.DEBUG)) {
    const rc = (el) => { const r = el && !el.hidden ? el.getBoundingClientRect() : null; return r && r.width ? [r.left, r.top, r.width, r.height].map(Math.round).join(",") : "-"; };
    const pv = (n) => root.style.getPropertyValue(n) || "-";
    const line = `hudfit top=${pv("--hud-z-top")} dock=${pv("--hud-z-dock")} drw=${pv("--dock-r-w")} sec=${rc(els.hudSectors)} pause=${rc(els.pausebtn)} cam=${rc(els.btnCam)}`;
    if (line !== _fitTrace) { _fitTrace = line; Log.debug("ui", line); }
  }
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
  // HYSTERESIS: a single 0.92 threshold flickered the class (and restarted its
  // pulse animation) every tick the needle hovered on the line, which is
  // exactly where a driver holding a gear sits. Enter at 92%, leave at 89%.
  _redline = player.rpm > MAX_RPM * (_redline ? 0.89 : 0.92);
  if ((typeof HudElements === "undefined" || HudElements.isOn("gear")) && !document.body.classList.contains("cockpit-cam")) {
    const rpmFrac = clamp((player.rpm - IDLE_RPM) / (MAX_RPM - IDLE_RPM), 0, 1);
    hText(els.gear, "" + player.gear);
    const pct = Math.round(rpmFrac * 100);
    // --rpm (0..1, 1 % steps), not width: the fill spans the whole tach and is
    // clipped, so its colour stops sit on fixed RPM (css/hud.css #hud-rpm-fill).
    if (pct !== _rpmPct || !(pct >= 0)) { _rpmPct = pct; hStyle(els.rpmFill, "--rpm", (pct / 100).toFixed(2)); }
    hToggle(els.tach, "redline", _redline);
  }
  if (typeof HudElements !== "undefined" && !HudElements.isOn("speed")) return;
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

// Visibility uses explicit state only: checking it must never flush layout.
let _paintSuspended = false;
function hudPaintHidden() {
  return document.hidden === true || document.visibilityState === "hidden"
    || !!(els.hud && els.hud.hidden) || document.body.classList.contains("hud-hidden");
}
// Spoken race information is independent of the visual HUD toggle.
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
  if (!(Number.isFinite(dtMs) && dtMs > 0)) dtMs = 16.7;   // forced refreshes and the first frame: one nominal frame
  const player = G.player, cars = G.cars, timeTrial = G.timeTrial;
  if (!player) return;
  // Headless layout probes freeze after a painted-clear frame; rAF still runs
  // updateHud(false) and was moving REL/S3 before Playwright's probe (CI:
  // stamp/wait green, identical S3×BOOST + REL×BRAKE on probe). jump/camera
  // use refreshHud(true) to re-fit while frozen.
  if (G.frozen && !force) return;
  const paint = !hudPaintHidden();
  if (_trace && G.track) _trace.sample(player, G.track.total);
  if (!paint) {
    // Camera/profile classes are intentionally not painted while hidden. Use
    // their source state so an invisible mode change still clears input history.
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
    force = true;   // repaint/refit immediately, even inside the 10 Hz throttle
  }
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
  if (typeof HudInputs !== "undefined") HudInputs.frame(G, player, dtMs);
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
      hAttr(_rx.bb, "aria-label", hT("hud.brakeBias", { pct: bb.slice(3) }, "Brake bias {pct} front"));
    }
  }
  const spokenFlag = speakHud(player, cars, timeTrial);
  // TYRES (js/physics/tyre-model.js). The widget is hidden entirely while the
  // setting is off — the shipped default — so a player who never turns it on
  // pays nothing for it, not even a greyed-out bar. `spent` is wear as a
  // fraction of the compound's life, so the bar reads LIFE REMAINING and the
  // three colour states are the three things the engineer would say on the
  // radio: fine, think about a stop, you are past it.
  const tyres = G.tyres;
  const tyreOn = !!(tyres && tyres.on());
  hHidden(els.tyre, !tyreOn);
  let pitReadouts;   // synchronous HUD tick only; never retained on a car
  if (tyreOn) {
    const spent = tyres.spent(player);
    hText(els.tyreCode, (player.tyre && player.tyre.code) || "-");
    hStyle(els.tyreFill, "width", (clamp(1 - spent, 0, 1) * 100).toFixed(0) + "%");
    hData(els.tyre, "wear", spent >= 1 ? "gone" : spent >= TYRE_WARN ? "warn" : "ok");
    // …and how many LAPS that is, at the rate this driver has been using it:
    // a percentage says how worn, only laps say whether it reaches the flag.
    // An attribute read by the bar's ::after (css/hud.css), not a new node.
    const left = tyres.lapsLeft ? tyres.lapsLeft(player) : null;
    if (typeof HudStrategy !== "undefined" && (typeof HudElements === "undefined" || HudElements.isOn("strat"))) pitReadouts = { player, spent, left };
    const bar = els.tyreFill && els.tyreFill.parentNode;
    if (bar && bar.dataset) {
      const txt = left == null || spent >= 1 ? "" : left < 0.5 ? "<1L" : Math.min(99, Math.round(left)) + "L";
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
    const pl = (!practice && pit && pit.planInfo) ? pit.planInfo(player, pitReadouts) : null;
    if (pitReadouts) pitReadouts.plan = pl;
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
  hAttr(els.aero, "aria-label", autoAero ? (xOpen ? hT("hud.aero.autoStraight", null, "Automatic Straight Mode active") : hT("hud.aero.auto", null, "Active aero automatic"))
    : noZones ? hT("hud.aero.none", null, "No aero zone") : xOpen ? hT("hud.aero.straight", null, "Straight Mode active") : hT("hud.aero.manual", null, "Active aero manual"));
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
  gapsEmptySync();
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
  if (typeof HudStrategy !== "undefined") HudStrategy.tick(G, player, pitReadouts);   // opt-in STRATEGY panel (js/ui/hud-strategy.js)
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
    const { cn, caution, blueCar, txt } = spokenFlag;
    // A give-back window can outlast the caution that created it.
    const owed = !!(cn && cn.owed > 0);
    const show = caution || !!blueCar;
    if (caution) {
      // The window counts down on the chip at this 10 Hz tick ("SC · LET VER BY
      // 4s"): the banner can be queued behind the caution's own radio card.
      // "SC" keeps the chip short on a phone; the spoken flag keys on the
      // level text only, so the countdown never re-reads the flag.
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
    // A flag chip appearing or going re-picks the radio slot (radioUnderRight steps right of it).
    if (_flagShown !== show) { _flagShown = show; els.flag.hidden = !show; if (_invalidateFit) _invalidateFit(); }
  }
  // Stamp only after REL, sector rows and announce lane for this tick — fitHud
  // runs at tick start and must not publish early (CI: stamp green, S3×BOOST).
  syncComputedRootVars();
  phoneFitStampSync(+document.documentElement.style.getPropertyValue("--hud-scale") || _cssScale);
  _minimap.draw();
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

// loadTrack() calls this so the outline re-renders for the new circuit.
function invalidateMap() { _minimap.invalidate(); }

// Per-race HUD memory: the POS box compared its first ranked tick of a new race
// against the LAST race's finishing position and flashed "down" at lights-out.
// The race DELTA's best lap and the spoken HUD's baselines are per race too.
let _pitSideTrack = null, _pitSide = 1;
function resetRace() {
  _pitSideTrack = null; _pitSide = 1;   // per race: left set, it pinned the last pit-cue circuit across races
  if (typeof HudInputs !== "undefined" && HudInputs.reset) HudInputs.reset();
  if (typeof Captions !== "undefined") Captions.clear();   // the last spotter call: #captions sits outside #hud
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
  _fitKey = ""; _fitRetry = 0; _dockBtns = null;
  _fitPending = true;
  invalidateLaneRects();   // MOVE & SIZE / HUD ELEMENTS / scale — clippers moved
  if (!_hudTop || hudPaintHidden()) return;
  const root = document.documentElement;
  hStyle(root, "--hud-fit-stamp", "");
  _fitStamped = false;
  radioTopSlot(root, document.body.classList.contains("hud-prof-broadcast"));
  radioPaintedCollapse(root);   // a collapse the fit just made must survive this re-pick
  mirrorClear(root);
  if (typeof HudLayout !== "undefined" && HudLayout.clearReadouts) HudLayout.clearReadouts();
}
_invalidateFit = invalidateFit;
// fonts-hud.css loads late (media="print" swap, index.html), so the first fit measured the gap spellings
// in the fallback face and kept those widths: the fit key carries no font signal, so the wrong rung held
// until the 3 s backoff (F-16). Forget the measured widths and refit once the faces are in, and on each
// later `loadingdone` (a face is fetched when first painted, often after `ready` resolved: #3064).
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
  laneRectMisses, resetLaneRectMisses,   // PERF probe (js/ui/hud-radio-lane.js)
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
