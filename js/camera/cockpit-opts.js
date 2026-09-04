/* Apex 26 — CockpitOpts: player-facing options for the first-person view.
   HALO is a switch. TURN CHASING is how far the cockpit aim leaves the car's
   nose for a point 30 m down the road (0 = locked, 1 = full look-ahead).
   These live here, not in graphics quality or steer-tuning.

   WHY ITS OWN FILE. Same reason as GameMetrics: inject SETTINGS controls without
   growing index.html or inventing CSS classes. */
const CockpitOpts = (function () {
  "use strict";

const KEY = "apex26.cockpitHalo";
const KEY_TC = "apex26.cockpitTurnChase";         // legacy "1" / "0"
const KEY_LEAD = "apex26.cockpitTurnChaseLead";   // 0..1, the live value
const LEAD_DEFAULT = 0.35;   // what the old ON switch blended (js/camera/vantage.js)
const LEAD_MAX = 1;

let _halo = null, _lead = null;

function clampLead(n) {
  n = +n;
  if (!isFinite(n)) return LEAD_DEFAULT;
  if (n > LEAD_MAX) n = n / 100;
  return Math.max(0, Math.min(LEAD_MAX, n));
}

function parseLead(raw, urlVal) {
  if (urlVal != null && urlVal !== "") {
    if (/^(on|true)$/i.test(urlVal)) return LEAD_DEFAULT;
    if (/^(off|false)$/i.test(urlVal)) return 0;
    // Bare "1" on the URL is the old ON flag, not 100 %. Use 100 or 0.8 for an amount.
    if (urlVal === "1") return LEAD_DEFAULT;
    if (urlVal === "0") return 0;
    return clampLead(urlVal);
  }
  if (raw == null || raw === "") return null;
  return clampLead(raw);
}

function urlTurnChase() {
  try {
    const q = /[?&]turnchase=([^&]*)/i.exec(location.search);
    return q ? decodeURIComponent(q[1]) : null;
  } catch (_) { return null; }
}

function readLead() {
  const fromUrl = parseLead(null, urlTurnChase());
  if (fromUrl != null) return fromUrl;
  const stored = parseLead(GameStore.store.raw(KEY_LEAD), null);
  if (stored != null) return stored;
  const legacy = GameStore.store.raw(KEY_TC);
  if (legacy === "0") return 0;
  if (legacy === "1") return LEAD_DEFAULT;
  return LEAD_DEFAULT;
}

function read(key, urlName, defaultOn) {
  let v = GameStore.store.raw(key);
  try {
    const q = new RegExp("[?&]" + urlName + "=(1|0|on|off|true|false)", "i").exec(location.search);
    if (q) v = /^(1|on|true)$/i.test(q[1]) ? "1" : "0";
  } catch (_) { }
  if (v == null || v === "") return !!defaultOn;
  return v === "1";
}

function halo() { if (_halo === null) _halo = read(KEY, "halo", false); return _halo; }

function setHalo(on) {
  _halo = !!on;
  GameStore.store.rawSet(KEY, _halo ? "1" : "0");
  return _halo;
}

function turnChaseLead() { if (_lead === null) _lead = readLead(); return _lead; }

function setTurnChaseLead(v) {
  _lead = clampLead(v);
  GameStore.store.rawSet(KEY_LEAD, String(Math.round(_lead * 100) / 100));
  return _lead;
}

function turnChase() { return turnChaseLead() > 0; }

function setTurnChase(on) {
  return setTurnChaseLead(on ? LEAD_DEFAULT : 0);
}

function paintHalo(btn) {
  btn.textContent = "HALO: " + (halo() ? "ON" : "OFF");
  btn.setAttribute("aria-pressed", halo() ? "true" : "false");
}

function paintLead(inp, out) {
  const pct = Math.round(turnChaseLead() * 100);
  if (inp) inp.value = String(pct);
  if (out) out.textContent = pct + "%";
}

function initUI() {
  Log.info("game", "CockpitOpts.initUI");
  if (typeof document === "undefined") return;
  const panel = document.getElementById("pm-panel-display");
  const host = panel || (document.getElementById("pm-res") && document.getElementById("pm-res").parentNode);
  if (!host || document.getElementById("pm-halo")) return;

  const head = document.createElement("h3");
  head.className = "pm-group-h";
  head.textContent = "COCKPIT";
  // Player cockpit controls sit after the RENDERER fold, not inside it.
  const adv = document.getElementById("pm-display-adv");
  let ins = (adv && adv.parentNode === host) ? adv : null;
  function place(el) {
    if (ins && ins.parentNode === host && typeof host.insertBefore === "function") {
      host.insertBefore(el, ins.nextSibling);
      ins = el;
    } else host.appendChild(el);
  }
  place(head);

  const haloBtn = document.createElement("button");
  haloBtn.id = "pm-halo";
  haloBtn.title = "Draw the halo (secondary roll structure) in the cockpit view.";
  paintHalo(haloBtn);
  haloBtn.onclick = () => {
    setHalo(!halo());
    paintHalo(haloBtn);
    try { if (typeof GameAudio !== "undefined" && GameAudio.uiSelect) GameAudio.uiSelect(); } catch (_) { }
  };
  place(haloBtn);

  const lab = document.createElement("label");
  lab.className = "tune-row";
  lab.title = "How far the cockpit view glances into the corner ahead. 0% stays locked to the car's nose; 100% aims 30 m down the road.";
  const span = document.createElement("span");
  span.className = "tune-label";
  span.appendChild(document.createTextNode("TURN CHASING "));
  const out = document.createElement("b");
  out.id = "pm-turnchase-v";
  span.appendChild(out);
  const inp = document.createElement("input");
  inp.type = "range";
  inp.min = "0";
  inp.max = "100";
  inp.step = "5";
  inp.id = "pm-turnchase";
  inp.setAttribute("aria-label", "Turn chasing");
  inp.oninput = () => {
    setTurnChaseLead(parseFloat(inp.value) / 100);
    paintLead(inp, out);
  };
  lab.appendChild(span);
  lab.appendChild(inp);
  place(lab);
  paintLead(inp, out);
}

if (typeof document !== "undefined") {
  if (document.readyState !== "complete") document.addEventListener("DOMContentLoaded", initUI, { once: true });
  else initUI();
}

return {
  KEY, KEY_TC, KEY_LEAD, LEAD_DEFAULT,
  halo, setHalo, turnChase, setTurnChase, turnChaseLead, setTurnChaseLead, parseLead,
};
})();
