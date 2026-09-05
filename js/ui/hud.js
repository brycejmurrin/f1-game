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
// Keyed on the store revision, exactly as _livResolveCache is (js/game.js):
// a CUSTOM team's colours are editable in the garage, and an unkeyed memo on
// the shared Teams.LIST entry kept painting the old rail for the page's life.
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
let _hudCamKey = "";
const BCAM_IDS = { heli: 1, side: 1, cinematic: 1, low: 1, overhead: 1 };
const ONBOARD_IDS = { cockpit: 1, hood: 1, tcam: 1 };
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
let _hudVisKey = "";
function syncHudVisClasses(modeId) {
  const onboard = !!ONBOARD_IDS[modeId];
  const prof = G.hudProfile || "standard";
  // MAP AUTO: hide onboard (cockpit/hood/tcam) or MINIMAL so the view stays clear.
  const hideMap = resolveHudVis(G.hudMapVis, onboard || prof === "minimal");
  // GAPS do not AUTO-hide onboard — from a cockpit you cannot see the car
  // behind you. GAPS: OFF still hides it. MINIMAL still auto-hides chrome.
  const hideGaps = resolveHudVis(G.hudGapsVis, prof === "minimal");
  const mapLow = !hideMap && prof === "broadcast";
  const gapsLow = !hideGaps && prof === "broadcast";
  const key = (G.hudMapVis || "auto") + "|" + (G.hudGapsVis || "auto") + "|" + modeId + "|" + prof + "|" + hideMap + "|" + hideGaps + "|" + mapLow;
  if (key === _hudVisKey) return;
  _hudVisKey = key;
  _fitKey = "";
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
  _fitKey = "";
  const body = document.body;
  for (let i = 0; i < MET_LAYOUTS.length; i++) {
    body.classList.toggle("hud-met-" + MET_LAYOUTS[i], resolved === MET_LAYOUTS[i]);
  }
}
function syncHudCamClasses() {
  const modes = typeof CamModes !== "undefined" ? CamModes.CAM_MODES : null;
  const modeId = (modes && modes[G.camMode]) ? modes[G.camMode].id : "chase";
  const prof = G.hudProfile || "standard";
  const key = modeId + "|" + prof;
  if (key !== _hudCamKey) {
    _hudCamKey = key;
    const body = document.body;
    body.classList.toggle("hud-onboard", !!ONBOARD_IDS[modeId]);
    body.classList.toggle("hud-bcam", !!BCAM_IDS[modeId]);
    body.classList.toggle("hud-prof-minimal", prof === "minimal");
    body.classList.toggle("hud-prof-broadcast", prof === "broadcast");
  }
  // MAP/GAPS (and broadcast park) must re-run when only the setting
  // changes — camera+profile stay put, so the key above does not.
  syncHudVisClasses(modeId);
}
function flashSector(i) { if (i >= 0 && i < 3) _secFlash[i] = 0.35; }
function buildSecRows() {
  // S2 is NOT the brand #e10600: at 14px bold on the 72% plate that red measures
  // ~4.2:1 on pure black and less over a bright scene (css/tokens.css records
  // ~2.6:1 on the page) — under the 4.5:1 AA floor for text this size. The
  // lighter red keeps the hue and clears ~5.9:1; the minimap stroke matches.
  // The sector-identity array that used to sit here was DEAD: nothing applied
  // it to a label, and .sec-lbl sets no colour, so the labels have always
  // inherited the row's ink. Removed rather than left to imply otherwise —
  // and it matters now, because two of its three colours are byte-identical to
  // the value palette beside them (--sec-best #c084fc, --faster #a3e635).
  // Should the labels ever be coloured, they must NOT use those two, or purple
  // would mean both "sector 1" and "session best". The minimap keeps its own
  // copy (drawMinimap), where identity is the only thing distinguishing arcs.
  const labels = ["S1", "S2", "S3"];
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
function gapDecimals() {
  // F1 2026 dropped to one decimal on TV and fans pushed back hard — broadcast
  // profile keeps two so 0.95 vs 1.04 stays readable; standard stays at one.
  return (G.hudProfile || "standard") === "broadcast" ? 2 : 1;
}
function gapSec(slot, who, raw) {
  if (who !== _gapWho[slot] || !isFinite(_gapSm[slot])) { _gapWho[slot] = who; _gapSm[slot] = raw; }
  else _gapSm[slot] += (raw - _gapSm[slot]) * 0.3;
  return _gapSm[slot].toFixed(gapDecimals());
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
  return short ? _gapFormShort : _gapFormLong;
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
  // Cinematic HUD: OFF and "any open .screen" hide #hud via display:none.
  // Measuring then is a forced reflow on a 0×0 box (~10 Hz) that cannot
  // change a cap — skip until the HUD is visible again (className is in
  // the fit key, so the next tick re-fits).
  if (document.body.classList.contains("hud-hidden")) return;
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
  // The sector box grows from bare padding to three rows the first time
  // buildSecRows runs, and --hud-sec-h (the offset the track-limits chip hangs
  // off) is measured from it. Nothing else in this key moves at that moment, so
  // without the row count the published height stayed at the empty box's for
  // the whole 3 s same-key backoff. childElementCount costs no layout.
  const secRows = els.hudSectors ? els.hudSectors.childElementCount : 0;
  // BUTTON SIZE is a second slider on the same layer, so it belongs in the key:
  // moving it changes the dock's intrinsic height and nothing else here does.
  const btnScale = +root.style.getPropertyValue("--hud-btn-scale") || scale;
  const key = window.innerWidth + "x" + window.innerHeight + "@" + scale + "+" + btnScale + "|" + gapLen + "." + secRows + "|" + document.body.className;
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
  // whose notch is symmetric in landscape and never worse than the 0 this
  // used to fall back to on the left.
  const mmR = els.minimap ? els.minimap.getBoundingClientRect() : null;
  const scR = els.hudSectors ? els.hudSectors.getBoundingClientRect() : null;
  const mz = (els.minimap && els.minimap.currentCSSZoom) || 1;
  const sz = (els.hudSectors && els.hudSectors.currentCSSZoom) || 1;
  const salM = mmR && mmR.width ? Math.max(0, mmR.left - 10 * mz) : null;
  const sarM = scR && scR.width ? Math.max(0, window.innerWidth - scR.right - 10 * sz) : null;
  const sal = salM != null ? salM : (sarM != null ? sarM : 0);
  const sar = sarM != null ? sarM : (salM != null ? salM : 0);
  // WITH the gap strip and WITHOUT it. When the band fits at the player's own
  // HUD SIZE once the strip steps out of the row, that is the cheaper trade:
  // move one chip rather than shrink the map and all four timing tiles on
  // every notched phone. Only when it does not fit even without the strip
  // does the cap actually bite.
  const leftN = (map ? 10 + map : 0) + FIT_AIR;
  const right = wide(els.hudSectors) + 10 + FIT_AIR;
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
  const capFor = (l) => (bcast
    ? (window.innerWidth - sal - sar) / Math.max(Math.max(top, l) + right, 1)
    : Math.min((half - sal) / Math.max(l + top / 2, 1),
               (half - sar) / Math.max(right + top / 2, 1)));
  // EACH RUNG IS JUDGED AGAINST THE SPELLING IT DECIDES, NOT THE ONE ON SCREEN.
  //
  // Both used to read the RENDERED width, and that is a feedback loop with no
  // fixed point wherever the true fit lands between the two spellings: long
  // does not fit -> shorten -> the short strip DOES fit -> lengthen -> it does
  // not fit -> ... every 10 Hz tick, with `drop` (which is gated on the short
  // state) flickering along with it. A strip that alternates between beside the
  // band and below it is a candidate for the "sometimes the gap doesn't slide
  // all the way up" report, though the loop was found by reading this code
  // rather than by catching it in the act — what IS measured is the state
  // after: 40 consecutive ticks at 640x360, both rungs held (2026-09-04).
  //
  // Fixed by asking each question about a FIXED width: shorten iff the LONG
  // spelling does not fit, drop iff the SHORT one does not fit inline either.
  // Neither answer depends on the current state, so there is nothing to
  // oscillate. Only the rendered spelling can be measured, so each is
  // remembered as it is seen; until both have been, they share one number and
  // this behaves exactly as it did before — one tick, then it converges.
  if (gaps) _gapW["gapShort" in root.dataset ? 0 : 1] = gaps;
  const wShort = _gapW[0] || gaps, wLong = _gapW[1] || gaps;
  const leftFor = (w) => (map ? 10 + map + 8 + w : 0) + FIT_AIR;
  const capLong = capFor(leftFor(wLong)), capShort = capFor(leftFor(wShort));
  const capNo = capFor(leftN);
  _gapTight = capLong < scale;
  _gapDrop = _gapTight && capShort < scale;
  const capTop = Math.max(_gapDrop ? 0 : (_gapTight ? capShort : capLong), Math.min(scale, capNo));
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
  // THE TOWER'S HEIGHT, for the broadcast stack. `.hud-top` and `#minimap`
  // share --hud-z-top, so dividing the rect by that same zoom gives a length
  // the map's own `top: calc(...)` can add without double-counting the zoom.
  // Written unconditionally: the CSS only consumes it under .hud-prof-broadcast,
  // and a var that is only sometimes present is a var that is sometimes 0.
  root.style.setProperty("--hud-top-h", tall(_hudTop).toFixed(1) + "px");
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
  const secH = tall(els.hudSectors);
  root.style.setProperty("--hud-sec-h", secH.toFixed(1) + "px");
  const chromeZ = +root.style.getPropertyValue("--hud-z-top") || scale || 1;
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
  const gapsR = gapsEl ? gapsEl.getBoundingClientRect() : null;
  let leftBot = bcast && _hudTop ? _hudTop.getBoundingClientRect().bottom : 0;
  if (mmR && mmR.width) leftBot = Math.max(leftBot, mmR.bottom);
  if (gapsR && gapsR.width) leftBot = Math.max(leftBot, gapsR.bottom);
  root.style.setProperty("--hud-left-h", (leftBot / chromeZ).toFixed(1) + "px");
  // THE SAME EDGE IN SCREEN PIXELS. #hud-limits reads --hud-left-h from INSIDE
  // the chrome zoom, so it wants the divided value. #game-metrics is OUTSIDE it
  // — nothing zooms that subtree (see its own note in css/hud.css) — so handing
  // it the zoomed number would misplace the panel at every HUD SIZE but 100%.
  // Two vars for one edge is cheaper than one var and a unit bug.
  root.style.setProperty("--hud-left-px", leftBot.toFixed(1) + "px");
  // …and the panel's OWN bottom, so the track-limits chip can stack BELOW it in
  // left mode instead of under it. One direction only: the map decides where the
  // panel goes, the panel decides where the chip goes. Feeding the panel's own
  // bottom back into --hud-left-px would be a latch — a decision reading its own
  // output — which is the defect shape this file has been bitten by before.
  const gmEl = typeof document !== "undefined" ? document.getElementById("game-metrics") : null;
  const gmR = gmEl && !gmEl.hidden ? gmEl.getBoundingClientRect() : null;
  const gmBot = gmR && gmR.width ? gmR.bottom : 0;
  root.style.setProperty("--hud-metrics-b", (gmBot / chromeZ).toFixed(1) + "px");
  const dockL = _dockL ? _dockL.getBoundingClientRect() : null;
  // The metrics panel is part of what fills this column now, so the room test
  // measures from whichever is lower — the map/strip edge or the panel's bottom.
  const leftFilled = Math.max(leftBot, gmBot);
  const leftRoom = !(dockL && dockL.width && leftFilled + (8 + CHIP_H) * chromeZ > dockL.top);
  const limLeft = hitsRight && leftRoom;
  if (limLeft !== ("limitsLeft" in root.dataset)) {
    if (limLeft) root.dataset.limitsLeft = "1";
    else delete root.dataset.limitsLeft;
  }
  const dockRW = hitsRight && !limLeft ? dockR.width / chromeZ : 0;
  root.style.setProperty("--dock-r-w", (dockRW > 0 ? dockRW + 8 : 0).toFixed(1) + "px");
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
  set("--hud-z-dock", capDock, btnScale);
}

function updateHud(force) {
  const player = G.player, cars = G.cars, timeTrial = G.timeTrial;
  if (!player) return;
  syncHudCamClasses();
  if (player.team && player.team.id !== _teamSkin) {
    _teamSkin = player.team.id;
    document.documentElement.dataset.team = _teamSkin;
  }
  hudT -= 1;
  if (!force && hudT > 0) return;
  hudT = 6; // ~10Hz at 60fps
  syncHudLayoutClasses();      // before fitHud: show/hide/park changes what gets measured
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
      if (els.hudLimits.hidden) els.hudLimits.hidden = false;
      hText(_limitsDots, "\u25cf".repeat(cw) + "\u25cb".repeat(4 - cw));
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
    const show = !!(cn && cn.level > 0);
    if (show) {
      const txt = cn.level === 1 ? "YELLOW" + (cn.sector >= 0 ? " S" + (cn.sector + 1) : "")
                : cn.level === 2 ? "VSC" : cn.level === 4 ? "RED FLAG" : "SAFETY CAR";
      hText(els.flag, txt);
      hClass(els.flag, cn.level === 4 ? "flag-red" : cn.level === 3 ? "flag-sc" : cn.level === 2 ? "flag-vsc" : "flag-yellow");
    }
    if (_flagShown !== show) { _flagShown = show; els.flag.hidden = !show; }
  }
  drawMinimap();
}

function drawMinimap() {
  const player = G.player, cars = G.cars, track = G.track, timeTrial = G.timeTrial;
  if (!player || !track || !track.map) return;
  if (document.body.classList.contains("hud-hidden")) return;
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
      const gp = at(gh.s);   // a persisted ghost is stored input: never trust its s
      if (!gp) return;
      mm.fillStyle = "rgba(120, 220, 255, 0.95)";
      mm.beginPath();
      mm.arc(8 + gp[0] * (cssW - 16), 8 + gp[1] * (cssH - 16), 3.4, 0, 7);
      mm.fill();
    }
  }
  const p = at(player.s);
  if (!p) return;
  mm.fillStyle = "#fff";
  mm.beginPath();
  mm.arc(8 + p[0] * (cssW - 16), 8 + p[1] * (cssH - 16), 4, 0, 7);
  mm.fill();
}

// loadTrack() calls this so the outline re-renders for the new circuit.
function invalidateMap() { minimapBg = null; }

return { updateHud, invalidateMap, flashSector };
}

return { create };
})();
