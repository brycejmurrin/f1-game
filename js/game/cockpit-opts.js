/* Apex 26 — CockpitOpts: player-facing options for the first-person view. Today that is one switch, the HALO, but the shape is deliberate: cockpit look-and-feel choices live here, not in graphics quality or steer-tuning.

   WHY ITS OWN FILE. Same reason as GameMetrics: inject SETTINGS buttons without growing index.html or inventing CSS classes. */
const CockpitOpts = (function () {
  "use strict";

const KEY = "apex26.cockpitHalo";
const KEY_TC = "apex26.cockpitTurnChase";

const TURN_CHASE = 0.35;

let _halo = null, _tc = null;

function read(key, urlName) {
  let v = GameStore.store.raw(key);
  try {
    const q = new RegExp("[?&]" + urlName + "=(1|0|on|off|true|false)", "i").exec(location.search);
    if (q) v = /^(1|on|true)$/i.test(q[1]) ? "1" : "0";
  } catch (_) { }
  return v === "1";
}

function halo() { if (_halo === null) _halo = read(KEY, "halo"); return _halo; }

function setHalo(on) {
  _halo = !!on;
  GameStore.store.rawSet(KEY, _halo ? "1" : "0");
  return _halo;
}

function turnChase() { if (_tc === null) _tc = read(KEY_TC, "turnchase"); return _tc; }

function setTurnChase(on) {
  _tc = !!on;
  GameStore.store.rawSet(KEY_TC, _tc ? "1" : "0");
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
      /* --svhz, not raw svh: this list lives inside the #pausemenu sheet's
         zoom, where 100svh of LOCAL px paints zoom× that on screen — at 130%
         the submenu took 324 of a 393px-tall phone. The zoom-compensated
         token collapses the per-scale html[style*=…] hack this block used to
         carry for exactly three slider values. */
      "  max-height: min(280px, calc(100 * var(--svhz, 1svh) - 9rem));",
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
      "    max-height: min(160px, calc(100 * var(--svhz, 1svh) - 7rem));",
      "  }",
      "  #pm-metrics-details .pm-metrics-sub-body > button { width: auto; }",
      "  #pm-metrics-details .pm-metrics-hint {",
      "    grid-column: 1 / -1; font-size: 10px; margin: 2px 0 0;",
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
