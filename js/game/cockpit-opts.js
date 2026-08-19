/* Apex 26 — CockpitOpts: player-facing options for the first-person view. Today that is one switch, the HALO, but the shape is deliberate: cockpit look-and-feel choices live here, not in graphics quality or steer-tuning.

   WHY ITS OWN FILE. Same reason as GameMetrics: inject SETTINGS buttons without growing index.html or inventing CSS classes. */
const CockpitOpts = (function () {
  "use strict";

const KEY = "apex26.cockpitHalo";
const KEY_TC = "apex26.cockpitTurnChase";

const TURN_CHASE = 0.35;

let _halo = null, _tc = null;   // resolved lazily: localStorage may be absent at eval

function read(key, urlName) {
  let v = null;
  try { v = localStorage.getItem(key); } catch (_) { /* private mode / no storage */ }
  try {
    const q = new RegExp("[?&]" + urlName + "=(1|0|on|off|true|false)", "i").exec(location.search);
    if (q) v = /^(1|on|true)$/i.test(q[1]) ? "1" : "0";
  } catch (_) { /* no location (node/test) */ }
  return v === "1";
}

function halo() { if (_halo === null) _halo = read(KEY, "halo"); return _halo; }

function setHalo(on) {
  _halo = !!on;
  try { localStorage.setItem(KEY, _halo ? "1" : "0"); } catch (_) { /* nothing to persist to */ }
  return _halo;
}

/* TURN CHASING — does the view glance into the corner, or stay bolted to the
   car's nose? DEFAULT OFF, and that default is the load-bearing part: AGENTS.md
   states that nothing derived from track curvature or the racing line may reach
   the player, and the cockpit camera is the most immersive surface in the game
   to leak it through. Off, the aim is the car's own heading and nothing else —
   what the driver's helmet points at. On, it is the player asking for it. */
function turnChase() { if (_tc === null) _tc = read(KEY_TC, "turnchase"); return _tc; }

function setTurnChase(on) {
  _tc = !!on;
  try { localStorage.setItem(KEY_TC, _tc ? "1" : "0"); } catch (_) { /* nothing to persist to */ }
  return _tc;
}

function turnChaseLead() { return turnChase() ? TURN_CHASE : 0; }

/* SETTINGS > COCKPIT. Injected at runtime rather than written into
   index.html, for the same two reasons gfx-quality documents: the DOM-node ratchet
   (tests/unit/css-class-ratchet.test.mjs) counts index.html's nodes, and this
   button mints NO new CSS class — it carries none, exactly like its neighbours
   #pm-res / #pm-renderer / #pm-gfx. */
const SWITCHES = [
  { id: "pm-halo", label: "HALO", get: halo, set: setHalo,
    title: "Draw the halo (secondary roll structure) in the cockpit view. Real cars " +
           "and real onboards have one; it also puts a pillar in the middle of your " +
           "sightline, which is what makes it a preference." },
  { id: "pm-turnchase", label: "TURN CHASING", get: turnChase, set: setTurnChase,
    title: "Let the view glance into the corner ahead instead of staying locked to " +
           "the car's nose. OFF (default) is what the driver's helmet actually points " +
           "at; ON reads the racing line for you, which is easier but is the track " +
           "telling you where to go." },
];

function paint(btn, sw) {
  btn.textContent = sw.label + ": " + (sw.get() ? "ON" : "OFF");
  btn.setAttribute("aria-pressed", sw.get() ? "true" : "false");
}

function initUI() {
  Log.info("game", "CockpitOpts.initUI");
  if (typeof document === "undefined") return;
  const anchor = document.getElementById("pm-res");
  const host = anchor && anchor.parentNode;
  if (!host || document.getElementById("pm-halo")) return;

  const head = document.createElement("h3");
  head.className = "pm-group-h";          // existing class, nothing new minted
  head.textContent = "COCKPIT";
  host.appendChild(head);

  for (const sw of SWITCHES) {
    const b = document.createElement("button");
    b.id = sw.id;
    b.title = sw.title;
    paint(b, sw);
    b.onclick = () => {
      sw.set(!sw.get());
      paint(b, sw);
      try { if (typeof GameAudio !== "undefined" && GameAudio.uiSelect) GameAudio.uiSelect(); } catch (_) { /* audio not up yet; the toggle still applies */ }
    };
    host.appendChild(b);
  }
}

if (typeof document !== "undefined") {
  // docs/PERF-FINDINGS.md defer trap: !== "complete" preserves today's wait and stays correct under defer.
  if (document.readyState !== "complete") document.addEventListener("DOMContentLoaded", initUI, { once: true });
  else initUI();
}

return { KEY, KEY_TC, halo, setHalo, turnChase, setTurnChase, turnChaseLead };
})();

/* Metrics panel safe-area: keep #game-metrics clear of notch / home indicator.
   Inline PANEL_STYLE in metrics.js is not zoom-aware for env insets; override
   when the panel mounts. House height unit is svh (not dvh) to avoid toolbar jitter. */
(function metricsSafeArea() {
  "use strict";
  var HUD_TOP = "min(120px, calc(80px * var(--hud-scale, 1)))";
  var STYLE =
    "position:fixed;" +
    "right:calc(8px + var(--sar, 0px));" +
    "top:calc(12px + var(--tap, 44px) + var(--sat, 0px) + " + HUD_TOP + ");" +
    "z-index:11;margin:0;padding:10px 12px;" +
    "font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;" +
    "color:#d8ffe0;background:rgba(4,8,6,.82);border:1px solid rgba(90,200,120,.4);" +
    "border-radius:8px;pointer-events:none;white-space:pre;text-align:left;" +
    "max-width:min(52ch,calc(100vw - 16px - var(--sal, 0px) - var(--sar, 0px)));" +
    "max-height:calc(100svh - 12px - var(--tap, 44px) - var(--sat, 0px) - " +
      HUD_TOP + " - max(80px, calc(72px + var(--sab, 0px))));" +
    "overflow-y:auto;pointer-events:auto;text-shadow:0 1px 2px rgba(0,0,0,.9);" +
    "letter-spacing:.01em";
  function apply(el) {
    if (!el || el.id !== "game-metrics") return;
    el.style.cssText = STYLE;
  }
  function scan() {
    apply(document.getElementById("game-metrics"));
  }
  if (typeof document === "undefined") return;
  scan();
  try {
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var nodes = muts[i].addedNodes;
        for (var j = 0; j < nodes.length; j++) {
          var n = nodes[j];
          if (n && n.id === "game-metrics") apply(n);
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {
    setInterval(scan, 1000);
  }
})();
