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

// GameHud.invalidateFit(): the live instance's re-fit trigger (null until create).
let _invalidateFit = null, _syncPhoneFit = null, _obstacles = null;
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
const _hudSty = new WeakMap();   // el -> { prop: lastVal }
const _hudCls = new WeakMap();   // el -> last className
const _hudTog = new WeakMap();   // el -> { cls: lastBool }
function hText(el, v) { if (!el) return; if (_hudTxt.get(el) !== v) { _hudTxt.set(el, v); el.textContent = v; } }
function hStyle(el, prop, v) { if (!el) return; let m = _hudSty.get(el); if (!m) { m = {}; _hudSty.set(el, m); }
  if (m[prop] !== v) { m[prop] = v; if (prop.charCodeAt(0) === 45) el.style.setProperty(prop, v); else el.style[prop] = v; } }
// Remove an inline custom property AND forget it in the write cache, so the next hStyle of the same
// value writes again (a bare removeProperty left hStyle believing the old value was still there).
function hUnset(el, prop) { if (!el || !el.style) return; const m = _hudSty.get(el); if (m) delete m[prop]; if (el.style.removeProperty) el.style.removeProperty(prop); }
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
let _limitsDots = null;
let _hudCamMode = null, _hudCamProf = null;   // compared field by field: no key string per frame
// The readouts js/ui/hud-readouts.js derives (gap laps, ERS, BB, blue flag, the
// race DELTA's best-lap trace, the spoken HUD). Optional: the node HUD harness
// boots hud.js without it, and every use below is guarded on _ro.
const _ro = typeof HudReadouts !== "undefined" ? HudReadouts : null;
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
function flashSector(i) { if (i >= 0 && i < 3) _secFlash[i] = 0.35; }
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
  // THE SLOT IS RESERVED, NOT REMOVED. A hidden DELTA that unhid after lap 1
  // widened the centred tower by half a box mid-race, so every other readout
  // jumped sideways. With no number yet the box keeps its place, invisible
  // (data-pending -> visibility: hidden, css/hud.css).
  hHidden(box, false);
  const ghostT = ref ? ref.timeAt(player.s) : null;
  if (ghostT == null || !(player.lapTime >= 0)) {
    hData(box, "pending", "");
    return;
  }
  hData(box, "pending", null);
  const delta = player.lapTime - ghostT;
  const sign = delta >= 0 ? "+" : "";
  hText(n, sign + delta.toFixed(3));
  hData(box, "sign", delta <= 0 ? "fast" : "slow");
  // Practice / TT: the gaps strip already says GHOST — keep DELTA as the
  // glanceable centre-top number. Race: same chip, quieter label stays DELTA.
  void timeTrial;
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
  const ratio = window.innerWidth / s;
  const k = window.innerWidth >= 1200 ? "wide" : "narrow";
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
// throttle. A whole lap apart spells "+1L" (HudReadouts.lapsApart), and the
// slot's EMA restarts so the seconds do not glide in from a lap's worth.
function gapText(slot, gap, arrow, o, dist, vFloor) {
  const n = _ro && G.track ? _ro.lapsApart(dist, G.track.total) : 0;
  if (n) { _gapWho[slot] = null; return _ro.lapGapText(arrow, o.code, n, gap === _gapFormShort); }
  return gap(arrow, o.code, gapSec(slot, o, dist / vFloor));
}
// Hoisted: gapForm runs every HUD tick — returning fresh arrows was 2 closures
// per call for two constant formats.
const _gapFormShort = (arrow, code, t) => arrow + " " + t;
// NO SIGN: the arrow IS the direction. A "+" on the AHEAD chip contradicted
// RELATIVE (js/ui/hud-relative.js), where ahead is "-" — the same car read
// "+1.2s" in one box and "-1.2" in the other. Whole laps keep RELATIVE's own
// spelling ("+1L" = a lap up), so the two never disagree.
const _gapFormLong = (arrow, code, t) => arrow + " " + code + " " + t + "s";

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
// The COLUMN pieces' visibility (the hidden attribute: layout-free). DAMAGE unhides from its own module,
// LIMITS on a strike, the opt-in readouts from HUD ELEMENTS: each re-stacks its column on the next tick
// (placeRightColumn / placeLeftColumn), not after the 3 s same-key re-measure.
function colVisKey() {
  let k = "";
  for (const el of [els.hudLimits || document.getElementById("hud-limits"), document.getElementById("hud-damage"), document.getElementById("hud-inputs"),
    document.getElementById("hud-rel"), document.getElementById("hud-strat"), document.getElementById("game-metrics")]) k += el && !el.hidden ? "1" : "0";
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
// immediately before fitHud() and updateHud writes DOM either side of it.
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
  const k = window.innerWidth + "x" + window.innerHeight + "|" + document.body.className;
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
  if (!r.width || !el.hasAttribute || !el.hasAttribute("data-hl")) return r;
  const st = el.style, s = +st.getPropertyValue("--hl-s") || 1;
  const w = r.width / s, h = r.height / s;
  let left = r.left - (+st.getPropertyValue("--hl-x") || 0) * window.innerWidth / 100;
  let top = r.top - (+st.getPropertyValue("--hl-y") || 0) * window.innerHeight / 100;
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
// THE OBSTACLE LIST: every visible HUD piece as painted, { id, el, rect, kind: control | readout |
// chrome, column: left | right | centre | top | bottom, group?/dock?/tap? }, collected after the dock
// caps and again after any write that moves a piece. The radio slot, the mirror's centre edge, the
// phone-clash check, the dock inset, the column allocators and HudLayout.clearControls all read it.
// A hidden, unlaid-out or dropped piece is not in it. Budgets keep measuring layoutRect, not this.
let _obs = [], _obsBy = Object.create(null);
function obsCollect() {
  const list = [], by = Object.create(null);
  const W = window.innerWidth || 0, mid = W / 2;
  const doc = typeof document !== "undefined" ? document : null;
  if (!doc) { _obs = list; _obsBy = by; return list; }
  if (!_hudTop) {
    _hudTop = doc.querySelector(".hud-top"); _hudBottom = doc.querySelector(".hud-bottom");
    _dockL = doc.getElementById("dock-left"); _dockR = doc.getElementById("dock-right");
  }
  const add = (id, el, kind, column, extra) => {
    if (!el || el.hidden || !el.getBoundingClientRect) return;
    if (el.hasAttribute && el.hasAttribute("data-col-drop")) return;   // dropped by a column allocator: painted invisible
    const r = el.getBoundingClientRect();
    if (!(r && r.width && r.height)) return;
    const o = { id, el, rect: r, kind, column: column || ((r.left + r.right) / 2 >= mid ? "right" : "left") };
    if (extra) for (const k in extra) o[k] = extra[k];
    list.push(o);
    if (!by[id]) by[id] = o;
  };
  const root = doc.documentElement;
  add("tower", _hudTop, "chrome", "top");
  add("map", els.minimap, "readout", "left");
  add("gaps", doc.querySelector(".hud-gaps"), "readout", "left");
  add("metrics", doc.getElementById("game-metrics"), "readout", null);
  add("sectors", els.hudSectors, "readout", root && root.dataset && "sectorsLeft" in root.dataset ? "left" : "right");
  add("limits", els.hudLimits || doc.getElementById("hud-limits"), "readout", root && root.dataset && "limitsLeft" in root.dataset ? "left" : "right");
  add("damage", doc.getElementById("hud-damage"), "readout", null);
  add("rel", doc.getElementById("hud-rel"), "readout", null);
  add("strat", doc.getElementById("hud-strat"), "readout", null);
  add("inputs", doc.getElementById("hud-inputs"), "readout", null);
  add("mirror", doc.getElementById("hud-mirror"), "chrome", "centre");
  add("mirrorChip", doc.getElementById("hud-mirror-chip"), "control", "centre");
  add("flag", els.flag || doc.getElementById("hud-flag"), "chrome", "centre");
  // The start lights: transient chrome (they show for the start only), so the sector plate stays clear of
  // them but neither column allocator treats them as a lasting obstacle.
  add("lights", els.lights || doc.getElementById("lights"), "chrome", "centre", { transient: true });
  add("pause", els.pausebtn || doc.getElementById("pausebtn"), "control", "top");
  add("cam", els.btnCam || doc.getElementById("btn-cam"), "control", "top");
  add("gearbox", doc.getElementById("hud-gearbox"), "readout", "bottom");
  add("speed", doc.getElementById("hud-speed"), "readout", "bottom");
  // The rest of the bottom cluster (ENERGY, TYRES — which a touch landscape parks on top of the left
  // dock, in the left column's way — OVERTAKE, AERO, BRAKE BIAS, the plan line).
  if (_hudBottom && _hudBottom.children) {
    let i = 0;
    for (const c of _hudBottom.children) { const id = c.id || "bottom" + i; i++; if (!by[id]) add(id, c, "readout", "bottom"); }
  }
  for (const [d, side] of [[_dockL, "L"], [_dockR, "R"]]) {
    if (!d || !d.children) continue;
    let i = 0;
    for (const g of d.children) add("dock" + side + (i++), g, "control", side === "L" ? "left" : "right", { group: true, dock: side });
  }
  // The individual tap targets (BOOST / OT / AERO, the pedals, the steer arrows): the dock groups above
  // carry most of them, but TILT parks BRAKE beside the map and the pedals are #btn-* siblings.
  // BOOST and the pedals by id first (the phone-clash check names them; a page may not class them).
  add("btn-boost", els.btnBoost || doc.getElementById("btn-boost"), "control", null, { tap: true });
  add("btn-brake", els.btnBrake || doc.getElementById("btn-brake"), "control", null, { tap: true });
  add("btn-throttle", els.btnThrottle || doc.getElementById("btn-throttle"), "control", null, { tap: true });
  add("btn-steer-left", els.btnSteerLeft || doc.getElementById("btn-steer-left"), "control", null, { tap: true });
  add("btn-steer-right", els.btnSteerRight || doc.getElementById("btn-steer-right"), "control", null, { tap: true });
  const taps = doc.querySelectorAll ? doc.querySelectorAll(".touchbtn") : [];
  for (let i = 0; i < taps.length; i++) { const id = taps[i].id || "tap" + i; if (!by[id]) add(id, taps[i], "control", null, { tap: true }); }
  _obs = list; _obsBy = by;
  return list;
}
/** The latest collected entry for `id`, or null (hidden / unlaid-out / not collected yet). */
function obs(id) { return _obsBy[id] || null; }
// THE TOP-ROW SLOT: right of the timing tower, in its own row, ending at the cam / pause button, the
// sector plate or a dock group that shares those rows (BOOST at y 72 on an 844x390 cockpit; never in
// BROADCAST). THE LANE: else the card hangs between the touch docks — only chrome in the card's own rows
// (LANE_ROWS) bounds it; a dock lit anywhere publishes it (desktop's empty docks never do).
const RADIO_TOP_MIN = 96, RADIO_TOP_GAP = 8;
const LANE_ROWS = 96;
function towerRect() {
  const o = obs("tower");
  return o ? o.rect : (_hudTop && _hudTop.getBoundingClientRect ? _hudTop.getBoundingClientRect() : null);
}
function cssPx(root, name) {
  if (typeof getComputedStyle !== "function" || !root) return 0;
  try { return parseFloat(getComputedStyle(root).getPropertyValue(name)) || 0; } catch (_) { return 0; }   // mini-dom / detached root
}
// The hanging lane as a DECISION (placeRadio writes it): { on, collapsed, x, y, w } in screen px.
function radioLane(root, list) {
  const t = towerRect();
  const W = window.innerWidth, H = window.innerHeight || 0;
  const y0 = t ? t.bottom : 0, mid = W / 2;
  // The rows start under the centre band (tower, mirror, chip, a caution flag) AND the map's bottom: a
  // band from the tower's bottom let the map clip it only from the side, and the card painted over the
  // bottom of the minimap (HUD audit 2026-10-10). Its top is published as --announce-lane-y.
  const mapO = obs("map");
  const bandTop = Math.max(centreBandTop(true, true), mapO ? mapO.rect.bottom : 0) + RADIO_TOP_GAP, bandBot = bandTop + LANE_ROWS;
  const sal = cssPx(root, "--sal"), sar = cssPx(root, "--sar");
  let left = sal, right = W - sar, any = false;
  const clip = (r, counts) => {
    if (!r || !r.width || !r.height) return;
    if (counts && r.top < H && r.bottom > y0) any = true;   // a lit dock publishes the lane from anywhere below the tower
    if (r.top >= bandBot || r.bottom <= bandTop) return;    // but only the card's rows bound it
    if ((r.left + r.right) / 2 >= mid) right = Math.min(right, r.left);
    else left = Math.max(left, r.right);
  };
  for (const o of list) if (o.group) clip(o.rect, true);
  // SECTORS always end the RIGHT of the lane. After #1191 the plate takes
  // --dock-r-w on buttons (and #1212 on every phone steer); a wide wrap-reverse
  // dock can push its centre left of mid, so the mid-based clip() above would
  // treat it as LEFT chrome and leave --announce-lane-w spanning into S1–S3
  // (Pages gate: #hud-sectors+#announce on notched-landscape buttons).
  // Clip the RIGHT to sectors without setting `any` — desktop empty docks must
  // still clear the lane vars (CSS falls back to centred). Phone docks set
  // `any` via the group loop above.
  // (Only a RIGHT-column plate: in the left column — data-sectors-left — it bounds the lane's left like the map, below.)
  const sec = obs("sectors"), secR = sec ? sec.rect : null;
  if (secR && sec.column === "right") right = Math.min(right, secR.left);
  else if (secR) clip(secR, false);
  // The map, the gaps chip, the opt-in readouts (MOVE & SIZE places them) and the
  // track-limits chip: a STRATEGY box in the left column and the INPUTS trace under
  // the sector box share the card's rows on a phone.
  for (const id of ["map", "gaps", "rel", "strat", "inputs", "damage", "limits"]) { const o = obs(id); if (o) clip(o.rect, false); }
  // …and the bottom cluster where it reaches the card's rows (a touch landscape parks TYRES on top of
  // the left dock — under the map, where the lane now hangs).
  for (const o of list) if (o.column === "bottom") clip(o.rect, false);
  const x = left + RADIO_TOP_GAP, w = right - RADIO_TOP_GAP - x;
  const on = any && w > 0;
  // Collapsed: phone docks lit but S3 ate the gap (large --dock-r-w). The left pin + zero width
  // collapse the card; clearing the vars instead restored left:50% and dropped the radio onto the
  // sector plate (oversize CI: #hud-sectors+#announce).
  return { on, collapsed: !on && any && !!secR, x, y: bandTop, w };
}
// The top-row strip as a decision: { x, y, w, h } in screen px, or null where no card fits.
function radioTop(bcast, list) {
  const t = !bcast ? towerRect() : null;
  if (!(t && t.width && t.height)) return null;
  let right = window.innerWidth - 10;
  const x = t.right + RADIO_TOP_GAP;
  // Pause / cam share the tower's rows. Dock groups bound a wrapping card
  // (min-height is the tower; a long line grows about that far). Remaining
  // viewport height would also catch TILT's bottom taps and kill the slot,
  // parking the card in the lane over the map (hud-layout: .hud-gaps+#announce).
  // Sectors share the wrapping band — they sit in the tower's rows on a phone.
  const bound = (r, needPast, bot) => {
    if (!r || !r.width || !r.height || !(r.top < bot && r.bottom > t.top)) return;
    if (needPast ? r.left > t.right : r.right > x) right = Math.min(right, r.left);
  };
  for (const id of ["cam", "pause"]) { const o = obs(id); if (o) bound(o.rect, true, t.bottom); }
  const wrapBot = t.bottom + t.height;
  for (const o of list) if (o.group) bound(o.rect, false, wrapBot);
  const sec = obs("sectors");
  if (sec) bound(sec.rect, true, wrapBot);
  const w = right - RADIO_TOP_GAP - x;
  return w >= RADIO_TOP_MIN ? { x, y: t.top, w, h: t.height } : null;
}
// BESIDE THE MIRROR: right of the frame (the widest free strip at that height in landscape) up to the
// pause column, the sector plate past the frame, the cam button in the card's rows, and any tap target,
// dock group or readout in those rows (the mirror's top down by max(frame, SIDE_ROWS, the card)) that
// reaches past the slot's start. The row is the mirror's own CSS top (--mir-top).
const SIDE_MIN = 190, SIDE_GAP = 8, SIDE_ROWS = 96;
function radioSide(list) {
  if (!document.body.classList.contains("hud-mirror-on")) return null;
  const m = obs("mirror");
  if (!m) return null;
  const er = m.rect;
  let right = window.innerWidth - 10;
  // Only what is RIGHT of the frame: the sector box can cross to the left column.
  const past = (o) => !!(o && o.rect.left > er.right);
  const p = obs("pause"), c = obs("cam"), s = obs("sectors");
  if (past(p)) right = Math.min(right, p.rect.left - 12);
  if (past(s)) right = Math.min(right, s.rect.left);
  if (past(c) && c.rect.bottom > er.top) right = Math.min(right, c.rect.left);
  const x = er.right + SIDE_GAP;
  const annEl = els.announce || document.getElementById("announce");
  const ann = annEl && !annEl.hidden && annEl.getBoundingClientRect ? annEl.getBoundingClientRect() : null;
  const rowsB = er.top + Math.max(er.height, SIDE_ROWS, ann ? ann.height : 0);
  for (const o of list) {
    if (!(o.group || o.tap || o.kind === "readout")) continue;
    const r = o.rect;
    if (r.top < rowsB && r.bottom > er.top && r.right > x) right = Math.min(right, r.left);
  }
  const w = right - SIDE_GAP - x;
  return w >= SIDE_MIN ? { x, w } : null;
}
// THE RADIO CARD'S SLOT, ONE RESOLVER (it replaced three pickers that never saw each other's answer,
// with the winner encoded in :not() chains): top strip -> beside the mirror -> lane -> collapsed ->
// centre, against the obstacle list. It writes body[data-radio-slot] and ONLY that slot's vars, plus the
// aliases the specs assert (hud-radio-top, hud-mirror-side); screen px, divided by the card's --hud-z.
// Its last step is the PAINTED GUARANTEE: a card that still meets S3, the tower or the map collapses.
const RADIO_VARS = {
  top: ["--radio-top-x", "--radio-top-y", "--radio-top-w", "--radio-top-h"],
  side: ["--mir-side-x", "--mir-side-w"],
  lane: ["--announce-lane-x", "--announce-lane-y", "--announce-lane-shift", "--announce-lane-w"],
};
let _radioSlot = "", _radioPaintSeq = -1, _radioPlaceSeq = -1, _fitSeq = 0;
function writeRadio(root, slot, top, side, lane) {
  const body = document.body;
  hAttr(body, "data-radio-slot", slot);
  hToggle(body, "hud-radio-top", slot === "top");      // aliases of data-radio-slot, kept for the specs / survey
  hToggle(body, "hud-mirror-side", slot === "side");
  if (slot === "top") {
    // MOVE & SIZE then scales the card itself (#announce, origin top left), so
    // the slot is published at 1/SIZE: the PAINTED card fills it, not s times it.
    const a = els.announce, as = a && a.style && a.hasAttribute && a.hasAttribute("data-hl") ? +a.style.getPropertyValue("--hl-s") || 1 : 1;
    hStyle(root, "--radio-top-x", top.x.toFixed(1) + "px");
    hStyle(root, "--radio-top-y", top.y.toFixed(1) + "px");
    hStyle(root, "--radio-top-w", (top.w / as).toFixed(1) + "px");
    hStyle(root, "--radio-top-h", (top.h / as).toFixed(1) + "px");
  } else for (const p of RADIO_VARS.top) hUnset(root, p);
  if (slot === "side") {
    hStyle(root, "--mir-side-x", side.x.toFixed(1) + "px");
    hStyle(root, "--mir-side-w", side.w.toFixed(1) + "px");
  } else for (const p of RADIO_VARS.side) hUnset(root, p);
  if (slot === "lane" || slot === "collapsed") {
    hStyle(root, "--announce-lane-x", lane.x.toFixed(1) + "px");
    hStyle(root, "--announce-lane-y", lane.y.toFixed(1) + "px");
    hStyle(root, "--announce-lane-shift", "0%");
    hStyle(root, "--announce-lane-w", slot === "lane" ? lane.w.toFixed(1) + "px" : "0px");
  } else for (const p of RADIO_VARS.lane) hUnset(root, p);
  // data-lane-collapsed hard-collapses the flex plate (min-content from #announce-num otherwise keeps a box).
  const annEl = els.announce || document.getElementById("announce");
  if (annEl && annEl.toggleAttribute) annEl.toggleAttribute("data-lane-collapsed", slot === "collapsed");
  _radioSlot = slot;
}
/** Place the radio card — the slot's ONE owner. `tick`: the per-tick re-place after this tick's gap
 *  strings (updateHud): only a lane / centred card can move then (the gap strip bounds the lane); a
 *  top-row or beside-the-mirror card holds, and so does ANY collapse this fit made — the post-gap-strings
 *  call used to re-open in the same tick the lane fitHud had just collapsed (HUD audit F-06). A tick may
 *  narrow or collapse a lane, never reopen one; the next full fit (key change — the gap text length is
 *  in it — or the 3 s re-measure) judges afresh. */
function placeRadio(root, bcast, list, tick) {
  if (!list) list = obsCollect();
  if (tick && (_radioSlot === "top" || _radioSlot === "side" || (_radioSlot === "collapsed" && (_radioPlaceSeq === _fitSeq || _radioPaintSeq === _fitSeq)))) return _radioSlot;
  const top = tick ? null : radioTop(bcast, list);
  const side = top || tick ? null : radioSide(list);
  const lane = top || side ? null : radioLane(root, list);
  const slot = top ? "top" : side ? "side" : lane.on ? "lane" : lane.collapsed ? "collapsed" : "centre";
  writeRadio(root, slot, top, side, lane);
  if (tick) return slot;
  _radioPlaceSeq = _fitSeq;
  // The painted guarantee (above): the tower, the plate and the MAP (its whole box, bottom edge
  // included, in every slot) do not move when the card does, so the list collected for this placement
  // still holds them. A collapse pins the card in the lane's own cleared rows, never at sal + 8.
  const annPaint = els.announce || document.getElementById("announce");
  if (annPaint && !annPaint.hidden && annPaint.getBoundingClientRect) {
    const a = annPaint.getBoundingClientRect();
    const hit = (id) => { const o = obs(id); return !!(o && _hudRectsHit(a, o.rect)); };
    if (hit("sectors") || hit("tower") || hit("map")) {
      const at = lane || radioLane(root, list);
      writeRadio(root, "collapsed", null, null, { x: at.x, y: at.y, w: 0 });
      _radioPaintSeq = _fitSeq;
      void annPaint.offsetHeight;
    }
  }
  return _radioSlot;
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
function mirrorClear(root) {
  const m = document.body.classList.contains("hud-mirror-on") ? obs("mirror") : null;
  const r = m ? m.rect : null, cx = window.innerWidth / 2;
  const b = r && r.left < cx + MIR_COL && r.right > cx - MIR_COL ? r.bottom : 0;
  hStyle(root, "--mir-paint-b", b.toFixed(1) + "px");
  hStyle(root, "--centre-band-top", centreBandTop(false, false).toFixed(1) + "px");
}
// ONE MEASURED CENTRE-BAND TOP: the tower, the mirror frame or its chip as painted (`withFlag` adds the
// flag for the radio card; `span` counts pieces anywhere, for the full-width lane, instead of only those
// crossing the centre column). Published as --centre-band-top (no flag): --mir-bot's floor in css/hud.css.
function centreBandTop(withFlag, span) {
  const cx = window.innerWidth / 2;
  const crosses = (r) => span || (r.left < cx + MIR_COL && r.right > cx - MIR_COL);
  const t = towerRect();
  let b = t && (span || (t.width && crosses(t))) ? t.bottom : 0;
  for (const id of withFlag ? ["mirror", "mirrorChip", "flag"] : ["mirror", "mirrorChip"]) {
    const o = obs(id);
    if (o && crosses(o.rect)) b = Math.max(b, o.rect.bottom);
  }
  return b;
}
/** Conservative rect overlap — same 0.5 px slack as hud-layout.spec.js probes. */
function _hudRectsHit(a, b) {
  return !!(a && b && a.width > 0 && b.width > 0
    && a.left < b.right - 0.5 && b.left < a.right - 0.5
    && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5);
}
function _boostOnRightHalf() {
  const o = obs("btn-boost");
  return o && (o.rect.left + o.rect.right) / 2 >= window.innerWidth / 2 ? o.el : null;
}
/** Painted phone readout-on-control clashes the spec measures (not budget math). Collects the list
 *  afresh: every caller runs it right after a write that can move a piece (the dock inset, a shrink). */
function phonePaintedClash(list) {
  if (document.body.classList.contains("desktop")) return false;
  if (!list) obsCollect();
  const sectors = obs("sectors"), boost = _boostOnRightHalf() ? obs("btn-boost") : null;
  if (sectors && boost && _hudRectsHit(sectors.rect, boost.rect)) return true;
  const rel = obs("rel");
  if (rel) {
    // Pedals are #btn-* siblings, not #dock-left children (index.html).
    for (const o of _obs) if (o.group && o.dock === "L" && _hudRectsHit(rel.rect, o.rect)) return true;
    for (const id of ["btn-brake", "btn-throttle", "btn-steer-left", "btn-steer-right"]) {
      const o = obs(id);
      if (o && _hudRectsHit(rel.rect, o.rect)) return true;
    }
  }
  return false;
}
// THE RIGHT COLUMN'S X, IN ONE FUNCTION: --dock-r-w, in the chrome's zoom (--hud-z-top), is the stand-off
// every right-anchored readout adds to `right: 10px + sar/z`. Air is SCREEN px over the zoom (+AIR/z;
// 8 px under-cleared BOOST by ~2 px at HUD 140% on CI), capped at the centre line so S3 cannot walk past
// mid into #minimap / #announce.
const RIGHT_DOCK_AIR = 12;
function rightDockInset(left, z, sarPx) {
  if (!Number.isFinite(left) || !(z > 0)) return 0;
  const DOCK_AIR = RIGHT_DOCK_AIR, sar = sarPx || 0;
  const midCap = Math.max(0, (window.innerWidth / 2) / z - 10 - sar / z);
  const need = Math.max(0, (window.innerWidth - left) / z - 10 - sar / z + DOCK_AIR / z);
  return Math.min(need, midCap);
}
// THE COLUMNS ARE SIZED, NOT ONLY PLACED. A side column whose stack does not fit scales its readouts
// together (--rcol-z / --lcol-z, a factor on each piece's band zoom, absent when 1) down to a floor that
// keeps --fs-micro text >= COL_TEXT_MIN px, and only then drops. PRIORITY is the stacking order (right:
// LIMITS > DAMAGE > INPUTS > desktop RELATIVE; left: LIMITS > RELATIVE > STRATEGY), weighted so a
// dropped piece outweighs every piece below it. Invariant-solved: sizes at factor 1 are the box over the
// published factor (only where the engine paints zoom), the factor is the largest whose drop cost
// matches the floor's (bisection), and the left column never obstructs the right (placed after it).
const COL_TEXT_MIN = 10;
/** The smallest column factor that keeps --fs-micro text >= COL_TEXT_MIN px in every band `zs` lists. */
function colZoomFloor(root, zs) {
  const fs = cssPx(root, "--fs-micro") || 14;
  let k = 0;
  for (const z of zs) k = Math.max(k, COL_TEXT_MIN / (fs * (z || 1)));
  return Math.min(1, k);
}
/** The largest factor in [kMin, 1] whose layout's drop cost is no more than kMin's; 1 when nothing drops
 *  or shrinking would not help (the player's size is kept). */
function bestColZoom(solve, kMin) {
  const full = solve(1);
  if (!full.drops || !(kMin < 1)) return { k: 1, sol: full };
  const low = solve(kMin);
  if (low.drops >= full.drops) return { k: 1, sol: full };
  let lo = kMin, hi = 1;
  for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (solve(mid).drops <= low.drops) lo = mid; else hi = mid; }
  const k = Math.max(kMin, Math.floor(lo * 1000) / 1000);
  return { k, sol: solve(k) };
}
function publishColZoom(root, name, k) {
  if (k >= 1) hUnset(root, name); else hStyle(root, name, String(k));
}
// One column piece, described at factor 1: { id, el, skip | hidden | w, h, r }. `kPub` is the factor
// it is painted at (only divided out where the engine paints zoom: mini-dom rects never scale).
function colPiece(id, el, kPub, skip) {
  if (skip || !el) return { id, el, skip: true };
  // Measured off the element, not the list: a DROPPED piece is not an obstacle (obsCollect skips it),
  // but its box still measures here, so the next fit asks the same question of the same size.
  const box = !el.hidden && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
  if (!(box && box.width && box.height)) return { id, el, hidden: true };
  const r = layoutRect(el), d = el.currentCSSZoom > 0 ? kPub : 1;
  return { id, el, w: r.width / d, h: r.height / d, r, d };
}
function colWrite(root, prefix, p, slot) {
  const ny = prefix + "y-" + p.id, nx = prefix + "x-" + p.id;
  if (p.skip || !slot) { hUnset(root, ny); hUnset(root, nx); if (p.el && p.el.removeAttribute) p.el.removeAttribute("data-col-drop"); return; }
  hStyle(root, ny, slot.y.toFixed(1) + "px");
  if (slot.x != null) hStyle(root, nx, slot.x.toFixed(1) + "px"); else hUnset(root, nx);
  if (p.el && p.el.toggleAttribute) p.el.toggleAttribute("data-col-drop", !!slot.drop);
}
const colUser = (el) => !!(el && el.hasAttribute && el.hasAttribute("data-hl-user"));
const colRect = (x, y, w, h) => ({ left: x, top: y, right: x + w, bottom: y + h, width: w, height: h });
// THE RIGHT COLUMN, STACKED BY MEASUREMENT: under the plate, LIMITS -> DAMAGE -> INPUTS (-> desktop
// RELATIVE, floor 38svh), each at the bottom of what is visible above it + RCOL_AIR, as --rcol-y-<id>
// in screen px (each rule divides by its own zoom: no INPUTS zoom mix). Fixed offsets made a strike
// paint LIMITS over INPUTS and DAMAGE share INPUTS' slot. x is --dock-r-w for all. A hidden piece keeps
// its slot without taking room; a placed one (data-hl-user) keeps its shipped anchor (var removed) and
// the rest step below it; one that would land on a control or off screen shrinks the column, then drops.
const RCOL_AIR = 10;   // unzoomed px between stacked pieces (screen px = air * the piece's zoom)
function placeRightColumn(root, scale) {
  const doc = document, body = doc.body, desk = body.classList.contains("desktop");
  const W = window.innerWidth || 0, H = window.innerHeight || 0;
  const zTop = +root.style.getPropertyValue("--hud-z-top") || scale || 1;
  const zBot = +root.style.getPropertyValue("--hud-z-bot") || scale || 1;
  const kPub = +root.style.getPropertyValue("--rcol-z") || 1;
  // The column starts under the plate's UN-MOVED box (layoutRect), or where the plate would start.
  const sec = obs("sectors"), pause = obs("pause");
  const secR = sec ? layoutRect(sec.el) : null;
  const secLeft = !!(root.dataset && "sectorsLeft" in root.dataset);   // the plate leads the left column instead
  const start = !secLeft && secR && secR.height ? secR.bottom : pause ? pause.rect.bottom + 4 : NaN;
  const limLeft = !!(root.dataset && "limitsLeft" in root.dataset);
  const none = !Number.isFinite(start);
  const spec = [
    ["limits", els.hudLimits || doc.getElementById("hud-limits"), zTop, 0, limLeft],
    ["damage", doc.getElementById("hud-damage"), zTop, 0, secLeft],   // beside LIMITS in the left column then
    ["inputs", doc.getElementById("hud-inputs"), zBot, 0, false],
  ];
  // Desktop RELATIVE lives in this column at 38svh: that stays its floor, the stack only pushes it down.
  if (desk) spec.push(["rel", doc.getElementById("hud-rel"), zTop, 0.38 * H, false]);
  const P = spec.map(([id, el, zb, floor, out], i) => {
    const p = colPiece(id, el, kPub, none || out || colUser(el));
    p.zb = zb; p.floor = floor; p.cost = 1 << (spec.length - i);   // dropping a higher piece costs more than every lower one
    // Right-anchored: the 10px edge air scales with the piece's zoom, the dock stand-off does not.
    if (p.r) p.c = W - p.r.right - 10 * zb * p.d;
    return p;
  });
  const mine = { limits: !limLeft, damage: !secLeft, inputs: true, rel: desk };
  const theirs = { limits: limLeft, damage: secLeft, rel: !desk, strat: true };   // the left column's: placed after this one
  const steps = [], blocks = [];
  for (const o of _obs) {
    if (colUser(o.el) && (mine[o.id] || o.id === "sectors")) { if (o.column === "right") steps.push(o.rect); continue; }
    if (o.transient || mine[o.id] || (theirs[o.id] && !colUser(o.el))) continue;
    blocks.push(o.rect);
  }
  steps.sort((a, b) => a.top - b.top);
  const solve = (k) => {
    const out = {};
    let cursor = start, drops = 0;
    for (const p of P) {
      if (p.skip) continue;
      const air = RCOL_AIR * p.zb * k;
      let y = Math.max(cursor + air, p.floor);
      if (p.hidden) { out[p.id] = { y }; continue; }
      const w = p.w * k, h = p.h * k, right = W - (p.c + 10 * p.zb * k);
      for (const b of steps) if (b.left < right && b.right > right - w && b.top < y + h && b.bottom > y) y = b.bottom + air;
      const r = colRect(right - w, y, w, h);
      let ok = r.bottom <= H - 4;
      for (let i = 0; ok && i < blocks.length; i++) if (_hudRectsHit(r, blocks[i])) ok = false;
      if (!ok) { out[p.id] = { y, drop: true }; drops += p.cost; continue; }
      out[p.id] = { y };
      cursor = r.bottom;
    }
    return { out, drops };
  };
  const { k, sol } = none ? { k: 1, sol: { out: {} } } : bestColZoom(solve, colZoomFloor(root, [zTop, zBot]));
  publishColZoom(root, "--rcol-z", k);
  for (const p of P) colWrite(root, "--rcol-", p, sol.out[p.id]);
}
// THE LEFT COLUMN, THE SAME WAY: LIMITS (crossed left) -> RELATIVE (touch) -> STRATEGY under the map /
// gaps / broadcast tower / a left metrics panel. Each takes the first free candidate against the list —
// the main column, else beside a placed piece at its top — else the column shrinks, else it is DROPPED
// (data-col-drop: still laid out, so the next fit asks the same question). This replaced one shared
// anchor with literal steps (a 168 px STRATEGY sidestep narrower than RELATIVE at tilt's zoom, a
// reserved 2.6em for a hidden LIMITS chip). RELATIVE self-sizes (HudRelative.fitRows), so it always
// takes the main column. --lcol-y-* / --lcol-x-* in screen px; desktop STRATEGY's floor is 40svh.
const LCOL_AIR = 8;
function placeLeftColumn(root, scale) {
  const doc = document, body = doc.body, desk = body.classList.contains("desktop");
  const W = window.innerWidth || 0, H = window.innerHeight || 0;
  const zTop = +root.style.getPropertyValue("--hud-z-top") || scale || 1;
  const kPub = +root.style.getPropertyValue("--lcol-z") || 1;
  const sal = cssPx(root, "--sal");
  const limLeft = !!(root.dataset && "limitsLeft" in root.dataset);
  const secLeft = !!(root.dataset && "sectorsLeft" in root.dataset);
  // S1-S3 lead it and DAMAGE joins the warnings beside LIMITS only in the left-column mode
  // (data-sectors-left: both are status chips, and on a cockpit camera BOOST fills the right column under
  // the pause button, where DAMAGE was dropped or painted over the flag). Listed only then: a skipped
  // piece's write clears its data-col-drop, which would undo the right-hand pass's decision.
  const spec = [
    ...(secLeft ? [["sectors", els.hudSectors, 0, false]] : []),
    ["limits", els.hudLimits || doc.getElementById("hud-limits"), 0, !limLeft],
    ...(secLeft ? [["damage", doc.getElementById("hud-damage"), 0, false]] : []),
    ["rel", doc.getElementById("hud-rel"), 0, desk],
    ["strat", doc.getElementById("hud-strat"), desk ? 0.40 * H : 0, false],
  ];
  const P = spec.map(([id, el, floor, out], i) => { const p = colPiece(id, el, kPub, out || colUser(el)); p.floor = floor; p.cost = 1 << (spec.length - i); return p; });
  const mine = { sectors: secLeft, limits: limLeft, damage: secLeft, rel: !desk, strat: true };
  // The column starts under the map / gap strip (un-moved boxes), the broadcast tower, and the metrics panel when it is left.
  let start = 0;
  for (const id of ["map", "gaps"]) { const o = obs(id); if (o) start = Math.max(start, layoutRect(o.el).bottom); }
  if (body.classList.contains("hud-prof-broadcast")) { const t = obs("tower"); if (t) start = Math.max(start, layoutRect(t.el).bottom); }
  const gm = obs("metrics");
  if (gm && gm.column === "left") start = Math.max(start, gm.rect.bottom);
  // Obstacles: everything on screen but the pieces this pass places (a placed-by-the-player one stays).
  // A left-dock control is "soft" for RELATIVE alone: HudRelative.fitRows trims its rows above the left dock.
  const blocks = [];
  for (const o of _obs) if (!o.transient && !(mine[o.id] && !colUser(o.el))) blocks.push({ r: o.rect, soft: !!(o.group || (o.kind === "control" && o.rect.left + o.rect.right < W)) });
  // THE COLUMN STAYS A COLUMN: a sub-column may not reach past 40% of the width. Beyond it a piece floats
  // in the middle of the track and takes the radio card's lane (667x375, everything on: RELATIVE and
  // STRATEGY beside the stack at x 218-420 collapsed the card). Past it a piece is dropped instead.
  const colMax = W * 0.4;
  const solve = (k) => {
    const out = {}, placed = [];
    const air = LCOL_AIR * zTop * k, x0 = sal + 10 * zTop * k;
    const free = (r, softOk) => {
      if (r.left < 0 || r.top < 0 || r.right > W - 4 || r.bottom > H - 4) return false;
      for (const b of blocks) if (!(softOk && b.soft) && _hudRectsHit(r, b.r)) return false;
      for (const q of placed) if (_hudRectsHit(r, q)) return false;
      return true;
    };
    let cursor = start, drops = 0;
    for (const p of P) {
      if (p.skip) continue;
      const y1 = Math.max(cursor + air, p.floor);
      if (p.hidden) { out[p.id] = { y: y1 }; continue; }   // its slot is ready; it takes no room
      const w = p.w * k, h = p.h * k;
      let at = null;
      // HudRelative.fitRows may have slid RELATIVE right past a TILT pedal in the map column (an inline
      // `left` in its own zoom units): the column judges it where it is painted, scaled to this factor.
      const slid = p.id === "rel" && p.el.style && p.el.style.left ? p.r.left / p.d * k : null;
      const main = colRect(slid != null ? slid : x0, y1, w, h);
      const beside = () => {
        for (let i = placed.length - 1; i >= 0; i--) {
          const q = placed[i], r = colRect(q.right + air, q.top, w, h);
          if ((r.right <= colMax || desk) && free(r)) return { y: q.top, x: q.right + air, r };
        }
        return null;
      };
      // DAMAGE rides beside the chip above it first (one warnings row); everything else takes the main column first.
      // RELATIVE trims its own rows above the left dock (HudRelative.fitRows): for it the left-dock
      // controls do not count, anything else does (the tyre chip sends it beside the stack instead).
      if (p.id === "damage") at = beside();
      if (!at && free(main, p.id === "rel")) at = { y: y1, x: null, r: main };
      if (!at) at = beside();
      if (!at) { out[p.id] = { y: y1, drop: true }; drops += p.cost; continue; }
      out[p.id] = { y: at.y, x: at.x };
      placed.push(at.r);
      // A piece beside a shorter one (DAMAGE's car outline beside LIMITS) hangs below that row: the next
      // main-column piece starts under the lower of the two.
      cursor = at.x == null ? at.r.bottom : Math.max(cursor, at.r.bottom);
    }
    return { out, drops };
  };
  const { k, sol } = bestColZoom(solve, colZoomFloor(root, [zTop]));
  publishColZoom(root, "--lcol-z", k);
  for (const p of P) colWrite(root, "--lcol-", p, sol.out[p.id]);
}
/** Phone-only: after REL/sectors/announce land, re-fit rows and publish stamp. */
function phoneFitStampSync(scale, force) {
  if (document.body.classList.contains("desktop")) return;
  const root = document.documentElement;
  const DOCK_AIR = RIGHT_DOCK_AIR;
  if (!_hudTop) {
    _hudTop = document.querySelector(".hud-top");
    _hudBottom = document.querySelector(".hud-bottom");
    _dockL = document.getElementById("dock-left");
    _dockR = document.getElementById("dock-right");
  }
  const bumpDock = () => {
    const boost = _boostOnRightHalf();
    if (!boost) return false;
    const br = boost.getBoundingClientRect();
    if (!(br.width && br.height)) return false;
    // Only a plate that really meets BOOST (x AND y) is moved: the clash that woke this pass may be
    // RELATIVE on the left dock, and a dock dragged clear of the column must not shove S1-S3 inboard.
    const sr = els.hudSectors && !els.hudSectors.hidden ? els.hudSectors.getBoundingClientRect() : null;
    if (!sr || !_hudRectsHit(sr, br)) return false;
    const probe = els.hudSectors || _hudTop || els.minimap;
    const zTop = (+root.style.getPropertyValue("--hud-z-top") || scale || 1);
    const live = probe && probe.currentCSSZoom > 0 ? probe.currentCSSZoom : zTop;
    const z = Math.min(zTop, live) || 1;
    hStyle(root, "--dock-r-w", rightDockInset(br.left, z, cssPx(root, "--sar")).toFixed(1) + "px");
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
  if (typeof HudRelative !== "undefined" && HudRelative.fitRows) HudRelative.fitRows();
  for (let pass = 0; pass < 8 && phonePaintedClash(); pass++) {
    if (typeof HudRelative !== "undefined" && HudRelative.fitRows) HudRelative.fitRows();
    bumpDock();
    shrinkSectors();
  }
  // A custom property written on <html> invalidates style for the whole tree and
  // wakes sheet-shape's watchScale observer, so the 10 Hz tick must not rewrite
  // it while nothing changed. A new stamp means "a clash cleared" (or a probe
  // asked via syncPhoneFit, whose waiters need a fresh value each call).
  if (!phonePaintedClash()) {
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
  // TOUCH LANDSCAPE: S1-S3 AND TRACK LIMITS LEAD THE LEFT COLUMN, on every camera. Under the pause /
  // cam buttons the plate sat beside BOOST (the dock stand-off narrowed or dropped it), LIMITS crossed
  // sides by camera (left in cockpit, right in chase), and DAMAGE / INPUTS stacked under them over the
  // pedals (hud-mock sheets, 2026-10-10). The left column under the map has the room: the plate reads
  // as one row there (css/hud.css :root[data-sectors-left]) and placeLeftColumn stacks it first. The
  // right column keeps DAMAGE and INPUTS. Not on desktop (no dock), portrait (its own ladder), the
  // broadcast profile (its tower owns that column) or a plate the player placed (data-hl-user: its
  // stored offset is relative to the shipped right-hand anchor). The viewport and body classes that
  // decide it are in the fit key; the attribute is read by every pass below.
  // apex26.hudSectorsSide "right" keeps the shipped plate beside BOOST (no SETTINGS row yet).
  const secSide = G.store && typeof G.store.get === "function" ? G.store.get("hudSectorsSide", "left") : "left";
  const secLeft = secSide !== "right" && !document.body.classList.contains("desktop") && window.innerWidth > window.innerHeight
    && !document.body.classList.contains("hud-prof-broadcast") && !colUser(els.hudSectors);
  if (secLeft !== ("sectorsLeft" in root.dataset)) {
    if (secLeft) root.dataset.sectorsLeft = "1";
    else delete root.dataset.sectorsLeft;
  }
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
  // BUTTON SIZE is a second slider on the same layer, so it belongs in the key:
  // moving it changes the dock's intrinsic height and nothing else here does.
  // INLINE first (the player set BUTTON SIZE), else the inherited default. That
  // default is `calc(var(--hud-scale) * var(--hud-btn-mult))` on a coarse
  // pointer, and calc() in a custom property is not reduced at computed-value
  // time — the token reads back as the literal string and coerces to NaN — so
  // resolve it from its factors instead of parsing it. Falling through to
  // `scale` alone (`|| scale`) silently sizes the dock cap 25% small on every
  // touch device the moment the ratio stops being 1.
  // typeof-guarded: this module is exercised in a VM on tests/helpers/mini-dom,
  // which has no getComputedStyle — the same guard metrics-overlay.js carries.
  const mult = _cssMult;
  const btnScale = +root.style.getPropertyValue("--hud-btn-scale") || scale * mult;
  // DELTA unhides inside the centred tower mid-race (first valid best lap, or a
  // ghost in TT): it widens the tower, so it is part of the key, not left to the
  // 3 s same-key re-measure with the tower painted over the gap strip.
  // A MOVED piece that unhides is the same case for HudLayout.fit's on-screen
  // clamp, which skips whatever has no box: with CORNERS (energy/tyre x-34) at
  // 1280x720 TYRES unhid after the fit and ended at x -92 for good (survey
  // 2026-10-04). So each data-hl element's `hidden` is in the key — a list
  // re-read only on a full fit (HudLayout.apply invalidates it), a flag read
  // per tick, no layout.
  const head = window.innerWidth + "x" + window.innerHeight + "@" + scale + "+" + btnScale + "|" + gapLen + "." + secRows + (_rx.delta && !_rx.delta.hidden ? "d" : "") + "|" + colVisKey() + "|";
  const tail = "|" + document.body.className;
  if (head + hlKey() + tail === _fitKey && --_fitWait > 0) {
    // Same-key backoff must not lock a short --dock-r-w while wrap-reverse
    // still crawls BOOST left under load (CI oversize APEX_WORKERS=2:
    // #hud-sectors+btn-boost after the wait already saw clearance).
    let clash = false;
    const list = document.body.classList.contains("desktop") ? null : obsCollect();
    const sec = list ? obs("sectors") : null;
    if (sec) {
      const s = sec.rect, b = _boostOnRightHalf() ? obs("btn-boost").rect : null;
      // Only a RIGHT-half BOOST can clash with the sectors plate's dock inset — and only one that really
      // meets the plate (x AND y, 8 px of air): a dock dragged clear of the column is no clash.
      if (b && _hudRectsHit({ left: s.left - 8, top: s.top - 8, right: s.right + 8, bottom: s.bottom + 8, width: s.width + 16, height: s.height + 16 }, b)) clash = true;
      else {
        const ann = typeof document !== "undefined" ? document.getElementById("announce") : null;
        if (ann && !ann.hidden && !ann.hasAttribute("data-lane-collapsed") && _hudRectsHit(ann.getBoundingClientRect(), s)) clash = true;
      }
    }
    if (!clash && list && phonePaintedClash(list)) clash = true;
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
  _fitKey = key; _fitWait = 30; _fitSeq = (_fitSeq + 1) | 0;   // a full fit: placeRadio judges a collapse afresh
  // SINGLE SOURCE: the published band zooms, not el.currentCSSZoom.
  // Under load currentCSSZoom lags --hud-z-top by a frame (Pages
  // 37714419183: rect 87.11 = 110×zTop 0.792 while #minimap zoom read 0.704;
  // 142 = 110×0.862/0.666). Dividing getBoundingClientRect by that stale live
  // zoom over/under-estimates intrinsics and the next pass flips between
  // ~--hud-scale (uncapped) and the 0.4 floor. Measure with what we published.
  // When currentCSSZoom is absent (mini-dom fixtures paint unscaled rects),
  // fall back to 1 so those harnesses keep measuring in layout px.
  const zTopPub = +root.style.getPropertyValue("--hud-z-top") || scale;
  const zBotPub = +root.style.getPropertyValue("--hud-z-bot") || scale;
  const zDockPub = +root.style.getPropertyValue("--hud-z-dock") || Math.max(1, btnScale);
  const zoomDiv = (el, pub) => (el && el.currentCSSZoom > 0 ? (pub || 1) : 1);
  const wide = (el, pub) => {
    if (!el) return 0;
    const r = layoutRect(el);
    if (!r.width) return 0;
    return r.width / zoomDiv(el, pub);
  };
  const span = (el, pub) => {
    if (!el) return 0;
    let lo = Infinity, hi = -Infinity;
    for (const c of el.children) {
      const r = layoutRect(c);
      if (!r.width) continue;
      if (r.left < lo) lo = r.left;
      if (r.right > hi) hi = r.right;
    }
    return hi > lo ? (hi - lo) / zoomDiv(el, pub) : wide(el, pub);
  };
  if (!_hudTop) { _hudTop = document.querySelector(".hud-top"); _hudBottom = document.querySelector(".hud-bottom"); _dockL = document.getElementById("dock-left"); _dockR = document.getElementById("dock-right"); }
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
  // ~1.0. --sar is a registered length on a device (the radio lane reads it the same way); where it is
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
  // With S1-S3 in the left column the top-right cluster beside the tower is PAUSE + CAM, not the plate.
  // They are --tap-hud = --tap x max(1, z) wide, so the right half needs t*z + c*max(1, z) <= room
  // (t = half the tower, c = the cluster's width at z <= 1): solved in closed form, it cannot hunt.
  let capRightSec = null;
  if (secLeft && !bcast) {
    let cl = Infinity;
    for (const el of [els.btnCam, els.pausebtn]) {
      const b = el && !el.hidden && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      if (b && b.width) cl = Math.min(cl, b.left);
    }
    if (Number.isFinite(cl)) {
      const zNow = zTopPub || scale || 1;
      const c = (window.innerWidth - cl) / Math.max(1, zNow), t = Math.max(top / 2, 1), room = half - FIT_AIR;
      capRightSec = t + c <= room ? room / (t + c) : (room - c) / t;
    }
  }
  const capFor = (l) => (bcast
    ? (window.innerWidth - sal - sar) / Math.max(Math.max(top, l) + right, 1)
    : Math.min((half - sal) / Math.max(l + top / 2, 1),
               capRightSec != null ? capRightSec : (half - sar) / Math.max(right + top / 2, 1)));
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
  // THE TOP-RIGHT BUTTONS SHARE THE TOWER'S ROW. `right` above budgets the
  // sector box, but on touch CHASE and PAUSE sit at the top edge further in
  // than it (640x360 @130: CHASE at x 489.6, sectors at 577.6), so the centred
  // tower grew under the camera button — BEST over a tap target (hud-survey,
  // 2026-10-04). They size by BUTTON SIZE in screen px, not by this zoom, so
  // the limit is their left edge. But that edge MOVES WITH THE CAP: the buttons
  // ride --hud-btn-z = max(1, --hud-z-top) (css/hud.css), so capping from where
  // they stand now shrank both and overshot (z 0.979 where 1.09 fits, the gap
  // 39 px). Their span is taken back to zoom 1 (k) and solved WITH the tower:
  // the answer does not depend on the zoom painted now, so it cannot hunt.
  // The centred layout only: broadcast anchors the tower left, far from them.
  let capChrome = Infinity;
  if (!bcast && top) {
    const tR = layoutRect(_hudTop), room = window.innerWidth - FIT_AIR - half;
    const bzNow = Math.max(1, +root.style.getPropertyValue("--hud-z-top") || scale);
    for (const el of [els.btnCam, els.pausebtn]) {
      const r = el && !el.hidden ? layoutRect(el) : null;
      if (!(r && r.width && r.left > half && r.top < tR.bottom + FIT_AIR)) continue;
      const k = (window.innerWidth - r.left) / bzNow;
      const z = room / (top / 2 + k);
      capChrome = Math.min(capChrome, z >= 1 ? z : (room - k) / (top / 2));
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
  if (!bcast && !secLeft && top && scR && scR.width && !document.body.classList.contains("desktop")) {
    const tR = layoutRect(_hudTop), zd = zoomDiv(_hudTop, zTopPub);
    let satPx = 0;
    try { satPx = parseFloat(getComputedStyle(root).getPropertyValue("--sat")) || 0; } catch (_) { /* mini-dom / detached root */ }
    const y0 = (tR.top - satPx) / zd, hInt = tR.height / zd;
    // Only a plate that STARTS BELOW the tower's top is a row to clear; one level with it shares the
    // tower's row and is the right-half budget's business (a vertical limit there only drives the band to the floor).
    if (hInt > 0 && y0 + hInt > 0 && scR.top > tR.top + ROW_AIR) capRow = (scR.top - ROW_AIR - satPx) / (y0 + hInt);
  }
  const capTop = Math.min(capChrome, capRow, Math.max(_gapDrop ? 0 : (_gapTight ? capShort : capLong), Math.min(scale, capNo)));
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
  // THE SECTOR BOX'S HEIGHT, for the chip that hangs off its bottom edge (the first paint's fallback;
  // placeRightColumn stacks the column by measurement). 0 exactly when the box is gone (MINIMAL, a
  // broadcast camera outside the broadcast profile): a hand-computed 4.8em left LIMITS mid-air.
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
  const dockL = _dockL ? _dockL.getBoundingClientRect() : null;
  // The metrics panel is part of what fills this column now, so the room test
  // measures from whichever is lower — the map/strip edge or the panel's bottom.
  const leftFilled = Math.max(leftBot, gmBot);
  const leftRoom = !(dockL && dockL.width && leftFilled + (8 + CHIP_H) * chromeZ > dockL.top);
  const limLeft = secLeft || (hitsRight && leftRoom);   // with S1-S3 on the left, LIMITS hangs under them
  if (limLeft !== ("limitsLeft" in root.dataset)) {
    if (limLeft) root.dataset.limitsLeft = "1";
    else delete root.dataset.limitsLeft;
  }
  // (--dock-r-w is published after the zoom caps below, in the capped chrome zoom.)
  // THE DOCK CAP IS ASKED OF FIXED LAYOUTS, NOT OF THE ONE ON SCREEN. A dock is
  // a wrap-reverse row, so its height depends on the zoom: at HUD 150% on a
  // 734x343 phone BUTTONS mode's right dock (pedals + BOOST/OT/AERO) wrapped
  // into two rows, 530px tall, BRAKE at y=-218. Capping by that rendered height
  // shrank the zoom until the row UNwrapped, the next measure found the short
  // row and lifted the cap, and it wrapped again — and between the 3 s
  // same-key re-measures BRAKE sat off the top of the screen (survey-ui-matrix,
  // 2026-09-24). Same shape as the gap strip's rungs above, same cure: judge
  // each layout by sizes the zoom cannot change. ROW = every group side by
  // side (needs the width AND the tallest group's height); STACK = every group
  // on its own line (needs only height). The cap is whichever allows more.
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
    // Room is measured from the bar's REAL bottom edge, which the safe-area
    // inset lifts: budgeting from the viewport's foot put BOOST 1px off the
    // top on the Safari landscape shape (a 21px inset). Two FIT_AIRs of sky.
    const barR = hudDockEl ? hudDockEl.getBoundingClientRect() : null;
    const floorY = (barR && barR.height ? barR.bottom : window.innerHeight - FIT_AIR) - FIT_AIR;
    // …and each dock's CEILING is the top CONTROL it would climb into, not the
    // screen edge: at HUD 150% BOOST sat on PAUSE and COCKPIT in landscape.
    // Controls only — counting the S1-S3 readout as well shrank a landscape
    // phone's pedals to 44px, under the touch floor, to keep three small
    // numbers clear; a readout is the thing to lose. Only chrome that overlaps
    // the dock SIDEWAYS counts.
    const ceil = (dock, list) => {
      const d = dock ? dock.getBoundingClientRect() : null;
      let y = FIT_AIR;
      if (!d || !d.width) return y;
      for (const r of list) {
        if (r && r.width && r.height && r.left < d.right && r.right > d.left) y = Math.max(y, r.bottom + FIT_AIR);
      }
      return y;
    };
    const rectOf = (el) => (el && !el.hidden ? el.getBoundingClientRect() : null);
    const roomL = floorY - ceil(_dockL, [mmR, gapsR]);
    const roomR = floorY - ceil(_dockR, [rectOf(els.pausebtn), rectOf(els.btnCam)]);
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
    const zBot = Math.min(scale, capBot);
    const barW = barR ? barR.width : window.innerWidth;
    const barGap = hudDockEl ? parseFloat(getComputedStyle(hudDockEl).columnGap) || 0 : 0;
    const roomW = barW - (bottom ? bottom * zBot : 0) - 2 * barGap - 2 * FIT_AIR;
    const capRow = Math.min(gL.h ? roomL / gL.h : Infinity, gR.h ? roomR / gR.h : Infinity,
      gL.w + gR.w ? roomW / (gL.w + gR.w) : Infinity);
    const capStack = Math.min(gL.stack ? roomL / gL.stack : Infinity, gR.stack ? roomR / gR.stack : Infinity);
    capDock = Math.max(capRow, capStack);
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
  if (retry) { if (++_fitRetry <= 30) _fitKey = ""; } else _fitRetry = 0;
  // EACH CAP IS COMPARED AGAINST THE SLIDER THAT DRIVES IT. The readout bands
  // ride --hud-scale; the touch dock rides --hud-btn-scale (BUTTON SIZE, its
  // own slider — css/overlays.css), which defaults to --hud-scale and is only
  // inline once the player has moved it. Comparing the dock's cap against the
  // wrong slider would either pin a cap that fits or drop one that does not.
  const set = (prop, cap, base) => {
    if (cap >= base) root.style.removeProperty(prop);   // fits: the player's number, untouched
    else root.style.setProperty(prop, String(Math.max(0.4, Math.round(cap * 1000) / 1000)));
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
  // The dock paints at max(1, BUTTON SIZE) (css/overlays.css tap floor), so a
  // cap between BUTTON SIZE and 1 still has to be written.
  set("--hud-z-dock", capDock, Math.max(1, btnScale));
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
  // THE DOCK COUNTS ONLY WHERE IT MEETS THE COLUMN, in x AND y: a right-dock group / right-half BOOST
  // sets the stand-off only if it intersects the column's HOME box (the plate with no stand-off, its top
  // to the screen's foot, plus DOCK_AIR), so docks dragged inboard leave S1-S3 home (shots/1360: x-only
  // tests shoved the plate under the start lights). The plate also stops at the centre chrome in its
  // rows: it narrows to fit (max-width), and under 48 px it is dropped (data-col-drop).
  const W = window.innerWidth || 0, Hh = window.innerHeight || 0;
  const sarPx = cssPx(root, "--sar");
  const DOCK_AIR = RIGHT_DOCK_AIR;
  const touch = !document.body.classList.contains("desktop");
  const secEl = els.hudSectors;
  // The plate as laid out, measured off the element (a dropped plate is not in the obstacle list).
  // A plate in the LEFT column (data-sectors-left) is none of this pass's business: the right column's
  // home box is then the pieces under the pause button, and nothing below narrows or drops the plate
  // (secLeft: decided at the top of this fit).
  const plateBox = () => {
    const r = !secLeft && secEl && !secEl.hidden && secEl.getBoundingClientRect ? secEl.getBoundingClientRect() : null;
    return r && r.width && r.height ? r : null;
  };
  const homeBox = (z) => {
    const s = plateBox(), p = obs("pause");
    let w = s ? s.width : 0;
    for (const id of ["limits", "damage", "inputs"]) { const o = obs(id); if (o && o.column === "right") w = Math.max(w, o.rect.width); }
    const right = W - sarPx - 10 * z, top = s ? s.top : p ? p.rect.bottom + 4 : 0;
    return colRect(right - w - DOCK_AIR, top - DOCK_AIR, w + 2 * DOCK_AIR, Math.max(0, Hh - top) + DOCK_AIR);
  };
  const grow = (r, a) => colRect(r.left - a, r.top - a, r.width + 2 * a, r.height + 2 * a);
  // The leftmost right-dock group / right-half BOOST that meets `box`; Infinity when none does. BOOST
  // is preferred where it lands first — grp-taps can still be mid-wrap while the button's box has
  // already landed (CI: dockLeft 597 vs BOOST 587). Tilt parks BOOST on the left column: never a target.
  const dockLeftIn = (list, box) => {
    let left = Infinity;
    for (const o of list) if (o.group && o.dock === "R" && _hudRectsHit(o.rect, box)) left = Math.min(left, o.rect.left);
    const b = _boostOnRightHalf() ? obs("btn-boost") : null;
    if (b && _hudRectsHit(b.rect, box)) left = Math.min(left, b.rect.left);
    return left;
  };
  // The right edge of the centre chrome sharing the plate's rows (-Infinity: none).
  const chromeEdge = (s) => {
    let edge = -Infinity;
    for (const id of ["tower", "lights", "mirror", "mirrorChip", "flag"]) {
      const o = obs(id);
      if (o && o.rect.top < s.bottom - 0.5 && o.rect.bottom > s.top + 0.5 && o.rect.left < s.right) edge = Math.max(edge, o.rect.right);
    }
    return edge;
  };
  let plateMax = null;   // SCREEN px the plate may be wide between the chrome and the dock (null: its own width)
  const publish = (left, z) => {
    const rw = Number.isFinite(left) ? rightDockInset(left, z, sarPx) : 0;
    hStyle(root, "--dock-r-w", rw.toFixed(1) + "px");
    plateMax = null;
    const s = plateBox();
    if (s && rw > 0) {
      const edge = chromeEdge(s), rightEdge = W - sarPx - (10 + rw) * z;
      if (Number.isFinite(edge) && rightEdge - s.width < edge + DOCK_AIR) plateMax = rightEdge - edge - DOCK_AIR;
    }
    return rw;
  };
  // Start from the plate's own width: a max-width left by the last fit would read as its size.
  if (secEl && secEl.style && secEl.style.removeProperty) secEl.style.removeProperty("max-width");
  let list = obsCollect();
  let zTop = zPaint();
  let dockRW = publish(touch ? dockLeftIn(list, homeBox(zTop)) : Infinity, zTop);
  if (els.hudSectors) void els.hudSectors.offsetHeight;
  if (_dockR) void _dockR.offsetHeight;
  // One painted correction: the plate as it now lands, against the dock it actually meets.
  if (touch) {
    list = obsCollect();
    const s = plateBox();
    const left = s ? dockLeftIn(list, grow(s, DOCK_AIR - 0.5)) : Infinity;
    if (Number.isFinite(left)) {
      zTop = zPaint();
      // Absolute clear from that dock edge — never stack += grow on a stale plate.
      if (zTop > 0) { dockRW = publish(left, zTop); void els.hudSectors.offsetHeight; if (_dockR) void _dockR.offsetHeight; }
    }
  }
  list = obsCollect();
  mirrorClear(root);
  // MOVE & SIZE: re-clamp moved pieces against the bands as now laid out.
  if (typeof HudLayout !== "undefined") HudLayout.fit();
  // fit() can undo the dock inset; shrink the sector plate before any extra
  // inset widen (widening slides the plate left into #minimap).
  if (touch && secEl && _dockR) {
    const margin = DOCK_AIR;
    // How far the painted plate reaches into a right-dock group it really meets (list collected afresh).
    const overDock = () => {
      list = obsCollect();
      const s = plateBox();
      let worst = 0;
      if (s) for (const o of list) if (o.group && o.dock === "R" && _hudRectsHit(grow(s, margin), o.rect)) worst = Math.max(worst, s.right - (o.rect.left - margin));
      return { s, worst };
    };
    for (let pass = 0; pass < 4; pass++) {
      const { s, worst } = overDock();
      if (!s || !(worst > 0.5)) break;
      const zSec = zPaint() || 1;
      secEl.style.maxWidth = Math.max(48, s.width / zSec - worst / zSec).toFixed(1) + "px";
      void secEl.offsetHeight;
    }
    const after = overDock();
    if (after.s && after.worst > 0.5) {
      const mapR = obs("map") ? obs("map").rect : null;
      const mapClear = mapR ? mapR.right + margin : 0;
      const left = dockLeftIn(list, grow(after.s, margin));
      if (Number.isFinite(left) && !(mapClear && after.s.left - after.worst < mapClear)) {
        zTop = zPaint();
        if (zTop > 0) { dockRW = publish(left, zTop); void secEl.offsetHeight; }
      }
    }
    list = obsCollect();
    const s = plateBox();
    let onDock = false;
    if (s) for (const o of list) if (o.group && o.dock === "R" && _hudRectsHit(grow(s, margin - 0.5), o.rect)) { onDock = true; break; }
    if (!onDock && secEl.style && secEl.style.removeProperty) secEl.style.removeProperty("max-width");
  }
  // The centre chrome bounds the plate last: narrowed to fit between it and the dock, or dropped.
  if (secEl && secEl.style && !secLeft) {
    const zSec = zPaint() || 1;
    const drop = plateMax != null && plateMax < 48 * zSec;
    if (plateMax != null && !drop) secEl.style.maxWidth = (plateMax / zSec).toFixed(1) + "px";
    if (secEl.toggleAttribute) secEl.toggleAttribute("data-col-drop", drop);
    void secEl.offsetHeight;
  }
  // Radio top slot AFTER HudLayout.fit — a pre-fit slot used the shipped tower
  // edge, then MOVE & SIZE grew/shifted .hud-top into the card (CI oversize:
  // .hud-top+#announce with hud-radio-top on notched-landscape buttons).
  if (els.hudSectors) void els.hudSectors.offsetHeight;
  // The right column stacks under the plate as it now stands (after the inset and any shrink); the
  // radio card is then placed against the column as painted.
  list = obsCollect();
  placeRightColumn(root, scale);
  if (els.hudSectors) void els.hudSectors.offsetHeight;
  list = obsCollect();   // the left column judges its candidates against the right column as now stacked
  placeLeftColumn(root, scale);
  if (els.hudSectors) void els.hudSectors.offsetHeight;
  list = obsCollect();
  placeRadio(root, bcast, list);   // the one radio-slot resolver; its painted check is its own last step
  mirrorClear(root);
  if (els.minimap) void els.minimap.offsetHeight;
}

/* THE TEAM ACCENT for a team css/tokens.css has no row for.
 *
 * `:root[data-team="…"]` carries --accent and --accent-ink for the eleven
 * constructors, and a selector cannot match a team that does not exist until
 * runtime: MY TEAM and the LEGENDS entry are appended to Teams.LIST at boot
 * (js/career/custom-team.js) and MY TEAM's colours are edited in the garage.
 * So `data-team="custom"` matched nothing, --accent stayed at whatever team was
 * skinned last — or the shipped --red — and the radio card's number plate, the
 * one surface painted --accent, carried another constructor's colour for the
 * whole session while the car on screen was the player's own.
 *
 * The rule is the sheet's, applied at runtime rather than duplicated: the plate
 * is the TEAM's colour and the ink is whichever of --text and --bg stands
 * FURTHER from it, which is exactly what nontext-contrast.test.mjs proves of
 * every hand-written row. Both tokens are read off the live root, so
 * re-pointing --text in the sheet moves this with it.
 *
 * Only for a team with no row. A real constructor gets its inline props CLEARED
 * so the cascade hands it back to tokens.css, where the ink was chosen by hand
 * and measured. */
// WCAG relative luminance and contrast ratio, the four lines of it. js/car/
// liverytex.js exports the same pair, and this is deliberately NOT that one: a
// HUD that must reach into the livery TEXTURE builder to decide a text colour
// is a dependency nobody would choose, and the tuner-slider doc generator reads
// any `.contrast` member call as a consumer of the CONTRAST lighting slider, so
// borrowing it also published three false rows in a generated table. Channels
// are linearised first — the Rec.709 coefficients on gamma-encoded sRGB
// overstate mid-tones badly (0.5 grey reads as 0.5 when it is really 0.21).
const _lin = (u) => (u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4));
const _lum = (c) => 0.2126 * _lin(c[0]) + 0.7152 * _lin(c[1]) + 0.0722 * _lin(c[2]);
const _wcag = (a, b) => {
  const la = _lum(a), lb = _lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
const _hexRgb = (v) => {
  const h = String(v || "").trim();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(h);
  if (!m) return null;
  const d = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return [parseInt(d.slice(0, 2), 16) / 255, parseInt(d.slice(2, 4), 16) / 255, parseInt(d.slice(4, 6), 16) / 255];
};
function skinAccent(t) {
  const root = document.documentElement;
  // Teams.isReal is the same predicate the career grid filters on: false for
  // exactly the two appended entries, and for the next one appended after them.
  // UNKNOWABLE COUNTS AS REAL. Without Teams there is no way to tell an
  // appended entry from a constructor, and the safe answer is to leave the
  // cascade alone: tokens.css is right for every team it has a row for, and
  // writing an inline accent on a guess would override a hand-measured one.
  // (It is also what keeps this callable from the node HUD harnesses, which
  // boot hud.js with neither Teams nor getComputedStyle.)
  const canTell = typeof Teams !== "undefined" && Teams && typeof Teams.isReal === "function";
  // APPEARANCE › HUD ACCENT owns --accent when not TEAM (js/ui/appearance-opts.js).
  if (typeof AppearanceOpts !== "undefined" && AppearanceOpts && !AppearanceOpts.hudUsesTeam()) {
    if (AppearanceOpts.menuAccent() === "team") AppearanceOpts.applyMenuAccent();
    AppearanceOpts.applyHudAccent();
    return;
  }
  if (!t || !t.color || !canTell || Teams.isReal(t) || typeof getComputedStyle !== "function") {
    root.style.removeProperty("--accent");
    root.style.removeProperty("--accent-ink");
    if (typeof AppearanceOpts !== "undefined" && AppearanceOpts && AppearanceOpts.menuAccent() === "team") {
      AppearanceOpts.applyMenuAccent();
    }
    return;
  }
  const cs = getComputedStyle(root);
  const text = _hexRgb(cs.getPropertyValue("--text")), bg = _hexRgb(cs.getPropertyValue("--bg"));
  root.style.setProperty("--accent", G.cssCol(t.color));
  if (!text || !bg) return;
  const ink = _wcag(t.color, text) >= _wcag(t.color, bg) ? "var(--text)" : "var(--bg)";
  root.style.setProperty("--accent-ink", ink);
  // Menu accent TEAM resolves a concrete --red from the constructor colour.
  if (typeof AppearanceOpts !== "undefined" && AppearanceOpts && AppearanceOpts.menuAccent() === "team") {
    AppearanceOpts.applyMenuAccent();
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
  const kph = G.dashKph(player.speed);   // SPEED UNITS is display-only (js/ui/appearance-opts.js)
  // One SPD plate (HudReadouts.spdPlate): same n + MPH|KPH as the wheel LCD.
  if (_ro && typeof _ro.spdPlate === "function") {
    const plate = _ro.spdPlate(kph);
    hText(els.speed, "" + plate.n);
    hText(speedUnitEl(), plate.unit);
  } else {
    hText(els.speed, "" + (typeof AppearanceOpts !== "undefined" ? AppearanceOpts.speed(kph) : Math.round(kph)));
  }
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
    skinAccent(player.team);
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
  paintInstruments(player);
  if (typeof HudInputs !== "undefined") HudInputs.frame(G, player, dtMs);   // opt-in INPUTS trace: samples per frame, draws at 10 Hz itself
  if (_trace && G.track) _trace.sample(player, G.track.total);   // the race DELTA's best-lap reference
  hudT -= dtMs;
  if (!force && hudT > 0) return;
  hudT = HUD_TICK_MS;
  syncHudLayoutClasses();      // before fitHud: show/hide/park changes what gets measured
  fitHud();                    // below the throttle: this reads layout, per TICK not per frame
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
  hText(els.lap, Math.min(player.lap || 1, G.lapsTarget) + "/" + G.lapsTarget);
  if (typeof HudDamage !== "undefined") HudDamage.sync(player);   // DAMAGE chip (js/ui/hud-damage.js) — display only
  hText(els.time, G.fmtTime(player.lapTime));
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
      const txt = left == null || spent >= 1 ? "" : "~" + Math.min(99, Math.round(left)) + "L";
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
        // The arrow points to the PIT SIDE, which is the whole instruction.
        hText(els.pitCueArrow, (pit.info(player) || {}).side === -1 ? "\u25C0" : "\u25B6");
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
  const ot = player.otT > 0 ? "ot-active" : player.otArmed || otHeld ? "ot-armed" : player.otEarned ? "ot-cool" : "ot-off";
  hClass(els.ot, ot);
  const caution = G.cautionInfo ? G.cautionInfo() : null;
  const gateOpen = typeof G.otEnabled === "function" ? !!G.otEnabled() : true;
  const otOff = G.state === "race" && !gateOpen && !(player.otT > 0);
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
      const ghostT = ghost.timeAt(player.s);
      if (ghostT !== null) {
        const delta = player.lapTime - ghostT;
        const sign = delta >= 0 ? "+" : "";
        hText(els.gapA, (GhostShare.hasGuest() ? "RIVAL GHOST " : "GHOST ") + sign + delta.toFixed(3) + "s");
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
  placeRadio(document.documentElement, document.body.classList.contains("hud-prof-broadcast"), null, true);
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
      hText(_secRows[i], t == null ? "--" : (sb ? "★" : pb ? "▼" : "▲") + t.toFixed(3));
      // Timing-screen colours: purple session best, green personal best,
      // yellow slower than your own best; no split yet keeps the row's ink.
      hStyle(_secRows[i], "color", t == null ? "" : sb ? "var(--sec-best)" : pb ? "var(--faster)" : "var(--sec-slow)");
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
    if (_limitsDots == null) _limitsDots = els.hudLimits.querySelector("span");
    if (cw > 0) {
      if (els.hudLimits.hidden) {
        els.hudLimits.hidden = false;
        // The strike's own tick: re-stack the right column so DAMAGE / INPUTS step below the chip now
        // (fitHud re-stacks on the next tick too — the chip's visibility is in its key).
        if (_fitKey) { obsCollect(); placeRightColumn(document.documentElement, +document.documentElement.style.getPropertyValue("--hud-scale") || _cssScale); }
      }
      // Strikes no longer reset (4th and each additional = +5 s), so four dots
      // are a cap: repeat() of a negative count throws.
      const shown = Math.min(cw, 4);
      hText(_limitsDots, "\u25cf".repeat(shown) + "\u25cb".repeat(4 - shown));
      hToggle(els.hudLimits, "limits-warn", cw >= 2 && cw < 3);
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
    const caution = !!(cn && cn.level > 0);
    // BLUE FLAG: a caution outranks it (the chip holds one flag); no field, no flag.
    const blueCar = !caution && !timeTrial && _ro && G.track && G.state === "race"
      ? _ro.blueFlag(player, cars, G.track.total, G.vTop() * 0.26) : null;
    const show = caution || !!blueCar;
    if (caution) {
      const txt = cn.level === 1 ? "YELLOW" + (cn.sector >= 0 ? " S" + (cn.sector + 1) : "")
                : cn.level === 2 ? "VSC" : cn.level === 4 ? "RED FLAG" : "SAFETY CAR";
      hText(els.flag, txt);
      hClass(els.flag, cn.level === 4 ? "flag-red" : cn.level === 3 ? "flag-sc" : cn.level === 2 ? "flag-vsc" : "flag-yellow");
      if (txt !== _flagSaid) { _flagSaid = txt; sayFlag(cn); }
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
    if (_flagShown !== show) { _flagShown = show; els.flag.hidden = !show; }
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
  const measureKey = window.innerWidth + "x" + window.innerHeight + "|" + body.className
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
  if (timeTrial && (GhostShare.hasGuest() || Ghost.hasGhost())) {
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
function resetRace() {
  _lastRank = 0; _posFlashT = 0; if (els.pos) delete els.pos.dataset.delta;
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
  if (!_hudTop || document.body.classList.contains("hud-hidden")) return;
  const root = document.documentElement;
  hStyle(root, "--hud-fit-stamp", "");
  _fitStamped = false;
  // A full placement: the resolver's own painted check runs last, so a collapse it finds holds.
  placeRadio(root, document.body.classList.contains("hud-prof-broadcast"));
  mirrorClear(root);
}
_invalidateFit = invalidateFit;
function syncPhoneFit() {
  syncComputedRootVars();
  phoneFitStampSync(+document.documentElement.style.getPropertyValue("--hud-scale") || _cssScale, true);
  const stamp = document.documentElement.style.getPropertyValue("--hud-fit-stamp");
  return !phonePaintedClash() && /^\d+$/.test(stamp);
}
_syncPhoneFit = syncPhoneFit;
_obstacles = () => _obs;
return { updateHud, invalidateMap, flashSector, resetRace, invalidateFit, syncPhoneFit };
}

return {
  create,
  invalidateFit: () => { if (_invalidateFit) _invalidateFit(); },
  syncPhoneFit: () => (_syncPhoneFit ? _syncPhoneFit() : false),
  // The last collected obstacle list (fitHud): HudLayout.clearControls reads its tap targets from it.
  obstacles: () => (_obstacles ? _obstacles() : null),
};
})();
Object.freeze(GameHud);
