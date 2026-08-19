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

/* Metrics panel safe-area: 100svh + env insets (house unit is svh, not dvh).
   Re-applies on mount, style mutations, and resize so metrics.js's first
   PANEL_STYLE paint cannot win the race permanently. */
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
  var _applying = false;
  function apply(el) {
    if (!el || el.id !== "game-metrics") return;
    if (_applying) return;
    var cur = el.style.cssText || "";
    if (cur.indexOf("var(--sar") >= 0 && cur.indexOf("100svh") >= 0) return;
    _applying = true;
    try { el.style.cssText = STYLE; } finally { _applying = false; }
  }
  function scan() { apply(document.getElementById("game-metrics")); }
  if (typeof document === "undefined") return;
  scan();
  try {
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === "attributes" && m.target && m.target.id === "game-metrics") {
          apply(m.target);
          continue;
        }
        var nodes = m.addedNodes;
        for (var j = 0; j < nodes.length; j++) {
          var n = nodes[j];
          if (n && n.id === "game-metrics") apply(n);
        }
      }
    });
    mo.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style"],
    });
  } catch (_) { /* no MO */ }
  try {
    window.addEventListener("resize", scan, { passive: true });
    window.visualViewport && window.visualViewport.addEventListener("resize", scan, { passive: true });
  } catch (_) { /* SSR */ }
  var n = 0;
  var t = setInterval(function () {
    scan();
    if (++n >= 10) clearInterval(t);
  }, 400);
})();

/* METRICS submenu under DISPLAY — compact on short/high-scale viewports. */
(function metricsSettingsSubmenu() {
  "use strict";
  function injectCss() {
    if (document.getElementById("pm-metrics-sub-css")) return;
    var s = document.createElement("style");
    s.id = "pm-metrics-sub-css";
    s.textContent = [
      "#pm-metrics-details.pm-metrics-sub { margin: 6px 0 0; }",
      "#pm-metrics-details.pm-metrics-sub > summary.adv-more-btn { cursor: pointer; }",
      "#pm-metrics-details .pm-metrics-sub-body {",
      "  display: flex; flex-direction: column; gap: 4px;",
      "  padding: 6px 0 2px;",
      "  max-height: min(280px, calc(100svh - 9rem));",
      "  overflow-y: auto;",
      "}",
      "#pm-metrics-details .pm-metrics-sub-body > button {",
      "  width: 100%; margin: 0;",
      "}",
      "#pm-metrics-details .pm-metrics-hint {",
      "  margin: 4px 0 0; opacity: .7; font-size: 11px; line-height: 1.3;",
      "}",
      "@media (max-height: 420px) {",
      "  #pm-metrics-details .pm-metrics-sub-body {",
      "    display: grid; grid-template-columns: 1fr 1fr; gap: 4px 6px;",
      "    max-height: min(160px, calc(100svh - 7rem));",
      "  }",
      "  #pm-metrics-details .pm-metrics-sub-body > button { width: auto; }",
      "  #pm-metrics-details .pm-metrics-hint {",
      "    grid-column: 1 / -1; font-size: 10px; margin: 2px 0 0;",
      "  }",
      "}",
      "@media (max-height: 480px) {",
      "  html[style*='--ui-scale: 1.1'] #pm-metrics-details .pm-metrics-sub-body,",
      "  html[style*='--ui-scale:1.1'] #pm-metrics-details .pm-metrics-sub-body,",
      "  html[style*='--ui-scale: 1.15'] #pm-metrics-details .pm-metrics-sub-body,",
      "  html[style*='--ui-scale:1.15'] #pm-metrics-details .pm-metrics-sub-body,",
      "  html[style*='--ui-scale: 1.3'] #pm-metrics-details .pm-metrics-sub-body,",
      "  html[style*='--ui-scale:1.3'] #pm-metrics-details .pm-metrics-sub-body {",
      "    max-height: min(140px, calc(100svh - 8rem));",
      "  }",
      "}",
    ].join("\n");
    (document.head || document.documentElement).appendChild(s);
  }

  function build() {
    if (typeof document === "undefined") return;
    injectCss();
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
    hint.className = "pm-metrics-hint as-note";
    hint.textContent = "Live ~4×/sec while ON. ` / F9 toggle · [ ] page · 1–4 jump";
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
    } catch (_) { /* not ready */ }

    on.addEventListener("click", function () {
      try {
        if (typeof GameMetrics !== "undefined" && GameMetrics.on && GameMetrics.on()) det.open = true;
      } catch (_) { /* ignore */ }
    });
  }

  function schedule() {
    if (typeof document === "undefined") return;
    var run = function () { setTimeout(build, 0); };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true });
    else run();
    setTimeout(build, 250);
    setTimeout(build, 1000);
  }
  schedule();
})();
