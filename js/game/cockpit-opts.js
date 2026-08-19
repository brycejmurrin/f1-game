/* Apex 26 — CockpitOpts: player-facing options for the first-person view. Today that is one switch, the HALO, but the shape is deliberate: cockpit look-and-feel choices live here, not in graphics quality or steer-tuning.

   WHY ITS OWN FILE. Same reason as GameMetrics: inject SETTINGS buttons without growing index.html or inventing CSS classes. */
const CockpitOpts = (function () {
  "use strict";

const KEY = "apex26.cockpitHalo";
const KEY_TC = "apex26.cockpitTurnChase";

const TURN_CHASE = 0.35;

let _halo = null, _tc = null;

function read(key, urlName) {
  let v = null;
  try { v = localStorage.getItem(key); } catch (_) { }
  try {
    const q = new RegExp("[?&]" + urlName + "=(1|0|on|off|true|false)", "i").exec(location.search);
    if (q) v = /^(1|on|true)$/i.test(q[1]) ? "1" : "0";
  } catch (_) { }
  return v === "1";
}

function halo() { if (_halo === null) _halo = read(KEY, "halo"); return _halo; }

function setHalo(on) {
  _halo = !!on;
  try { localStorage.setItem(KEY, _halo ? "1" : "0"); } catch (_) { }
  return _halo;
}

function turnChase() { if (_tc === null) _tc = read(KEY_TC, "turnchase"); return _tc; }

function setTurnChase(on) {
  _tc = !!on;
  try { localStorage.setItem(KEY_TC, _tc ? "1" : "0"); } catch (_) { }
  return _tc;
}

function turnChaseLead() { return turnChase() ? TURN_CHASE : 0; }

const SWITCHES = [
  { id: "pm-halo", label: "HALO", get: halo, set: setHalo,
    title: "Draw the halo (secondary roll structure) in the cockpit view." },
  { id: "pm-turnchase", label: "TURN CHASING", get: turnChase, set: setTurnChase,
    title: "Let the view glance into the corner ahead instead of staying locked to the car's nose." },
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
  head.className = "pm-group-h";
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
      try { if (typeof GameAudio !== "undefined" && GameAudio.uiSelect) GameAudio.uiSelect(); } catch (_) { }
    };
    host.appendChild(b);
  }
}

if (typeof document !== "undefined") {
  if (document.readyState !== "complete") document.addEventListener("DOMContentLoaded", initUI, { once: true });
  else initUI();
}

return { KEY, KEY_TC, halo, setHalo, turnChase, setTurnChase, turnChaseLead };
})();

/* Metrics panel safe-area: 100svh + env insets (house unit is svh, not dvh). */
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
  function scan() { apply(document.getElementById("game-metrics")); }
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

/* Fold four DISPLAY metrics buttons into a METRICS submenu. Overlay paints ~4 Hz while ON. */
(function metricsSettingsSubmenu() {
  "use strict";
  function build() {
    if (typeof document === "undefined") return;
    var on = document.getElementById("pm-metrics");
    var page = document.getElementById("pm-metrics-page");
    var ns = document.getElementById("pm-metrics-logns");
    var lvl = document.getElementById("pm-metrics-loglvl");
    if (!on || document.getElementById("pm-metrics-details")) return;
    var host = on.parentNode;
    if (!host) return;

    var det = document.createElement("details");
    det.id = "pm-metrics-details";
    det.className = "pm-metrics-sub";

    var sum = document.createElement("summary");
    sum.className = "adv-more-btn";
    sum.textContent = "METRICS";
    sum.title = "Live FPS / car / phys / log overlay controls";
    det.appendChild(sum);

    var body = document.createElement("div");
    body.className = "pm-metrics-sub-body";
    body.setAttribute("role", "group");
    body.setAttribute("aria-label", "Metrics controls");

    [on, page, ns, lvl].forEach(function (btn) {
      if (!btn) return;
      btn.addEventListener("click", function (e) { e.stopPropagation(); });
      body.appendChild(btn);
    });

    var hint = document.createElement("p");
    hint.className = "as-note";
    hint.style.cssText = "margin:6px 0 0;opacity:.75;font-size:11px;line-height:1.35";
    hint.textContent = "While ON the overlay updates ~4×/sec as you play. ` or F9 toggles. [ ] cycle page; 1–4 jump.";
    body.appendChild(hint);
    det.appendChild(body);

    var hide = document.getElementById("pm-hidehud");
    if (hide && hide.parentNode === host) {
      if (hide.nextSibling) host.insertBefore(det, hide.nextSibling);
      else host.appendChild(det);
    } else {
      host.appendChild(det);
    }

    try {
      if (typeof GameMetrics !== "undefined" && GameMetrics.on && GameMetrics.on()) det.open = true;
    } catch (_) { }

    on.addEventListener("click", function () {
      try {
        if (typeof GameMetrics !== "undefined" && GameMetrics.on && GameMetrics.on()) det.open = true;
      } catch (_) { }
    });
  }

  function schedule() {
    if (typeof document === "undefined") return;
    var run = function () { setTimeout(build, 0); };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true });
    else run();
    setTimeout(build, 250);
  }
  schedule();
})();
