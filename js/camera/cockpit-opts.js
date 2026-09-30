/* Apex 26 — CockpitOpts: player-facing options for the first-person view. WHEEL, SEAT, INTERIOR and HALO dress the cockpit view (all inside the same F1 car); TURN CHASING is how far the cockpit aim leaves the nose for a point 30 m down the road (0..1). Its own file, like GameMetrics, so the SETTINGS controls inject without growing index.html. */
const CockpitOpts = (function () {
  "use strict";

const KEY = "apex26.cockpitHalo";
const KEY_TC = "apex26.cockpitTurnChase";         // legacy "1" / "0"
const KEY_LEAD = "apex26.cockpitTurnChaseLead";   // 0..1, the live value
// The shipped amount and the legacy ON amount parted on 2026-09-08: a stored
// "1" from the old switch keeps the 0.35 it meant, an untouched install gets 0.4.
const LEAD_DEFAULT = 0.4;
const LEGACY_ON_LEAD = 0.35;
const LEAD_MAX = 1;
// COCKPIT CHOICES (owner, 2026-09-29: "a bunch of different options like options
// for wheel, options for interior design, halo size"). All inside the same F1
// car; each stored raw under its own apex26.* key and read once (URL overrides
// for shots: ?ckwheel= ?ckseat= ?ckint= ?halo=).
//   WHEEL     the steering wheel (car-mesh.js getCockpitWheel). A wheel with no
//             screen cannot carry gear and speed, so the HUD shows them instead
//             (mode-switch.js keeps body.cockpit-cam off for it).
//   SEAT      where the driver sits: eye offsets from STANDARD, car-local metres
//             (fwd, up). The wheel mount moves with the seat, so the rim keeps its
//             distance from the eye (the cockpit near plane is 0.30 m).
//   INTERIOR  the trim car-mesh.js builds inside the tub (getCockpitCabin).
//   HALO      OFF / SLIM / STANDARD / THICK: the hoop's tube (car3d.js, halo size).
const CHOICES = {
  wheel:    { key: "apex26.cockpitWheel", url: "ckwheel", values: ["f1", "retro", "round", "none"],
              labels: { f1: "F1 2026", retro: "2000s", round: "CLASSIC", none: "NONE" } },
  seat:     { key: "apex26.cockpitSeat", url: "ckseat", values: ["std", "low", "high", "fwd"],
              labels: { std: "STANDARD", low: "LOW", high: "HIGH", fwd: "FORWARD" } },
  interior: { key: "apex26.cockpitInterior", url: "ckint", values: ["carbon", "team", "classic"],
              labels: { carbon: "CARBON", team: "TEAM", classic: "CLASSIC" } },
};
const KEY_WHEEL = CHOICES.wheel.key, WHEELS = CHOICES.wheel.values;
const SCREEN_WHEELS = { f1: true };
// STANDARD's eye is vantage.js COCKPIT_EYE_FWD / COCKPIT_EYE_UP; a seat moves it.
const EYE_F = -0.20, EYE_U = 0.82;
const SEATS = { std: [0, 0], low: [0, -0.06], high: [0, 0.08], fwd: [0.12, -0.02] };
// The wheel mount at STANDARD: hub (y, z) and scale, car-local, per wheel.
const MOUNTS = { f1: [0.63, 0.26, 0.80], retro: [0.63, 0.26, 0.80], round: [0.66, 0.28, 0.92], none: [0.63, 0.26, 0.80] };
// Halo, stored "0" / "slim" / "1" / "thick" ("1" and "0" are the old ON/OFF switch).
const HALO_VALUES = ["0", "slim", "1", "thick"];
const HALO_LABELS = { "0": "OFF", slim: "SLIM", "1": "STANDARD", thick: "THICK" };

let haloVal = null;
let lead = null;
const picked = {};
const listeners = [];

function clampLead(raw) {
  let n = +raw;
  if (!isFinite(n)) return LEAD_DEFAULT;
  if (n > LEAD_MAX) n = n / 100;
  return Math.max(0, Math.min(LEAD_MAX, n));
}

function parseLead(raw, urlVal) {
  if (urlVal != null && urlVal !== "") {
    if (/^(on|true)$/i.test(urlVal)) return LEGACY_ON_LEAD;
    if (/^(off|false)$/i.test(urlVal)) return 0;
    // Bare "1" on the URL is the old ON flag, not 100 %. Use 100 or 0.8 for an amount.
    if (urlVal === "1") return LEGACY_ON_LEAD;
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
  } catch (_) { return null; /* no location, or a malformed escape */ }
}

function readLead() {
  const fromUrl = parseLead(null, urlTurnChase());
  if (fromUrl != null) return fromUrl;
  const stored = parseLead(GameStore.store.raw(KEY_LEAD), null);
  if (stored != null) return stored;
  const legacy = GameStore.store.raw(KEY_TC);
  if (legacy === "0") return 0;
  if (legacy === "1") return LEGACY_ON_LEAD;
  return LEAD_DEFAULT;
}

function haloSetting() {
  if (haloVal === null) {
    let v = GameStore.store.raw(KEY);
    try {
      const q = /[?&]halo=([a-z0-9]+)/i.exec(location.search);
      if (q) v = /^(1|on|true)$/i.test(q[1]) ? "1" : /^(0|off|false)$/i.test(q[1]) ? "0" : q[1].toLowerCase();
    } catch (_) { /* no location in a headless VM: the stored value stands */ }
    haloVal = HALO_VALUES.includes(v) ? v : "1";
  }
  return haloVal;
}

// 0 OFF, 1 SLIM, 2 STANDARD, 3 THICK.
function haloSize() { return HALO_VALUES.indexOf(haloSetting()); }

function halo() { return haloSize() > 0; }

// A boolean (the old switch) or a stored value.
function setHalo(v) {
  haloVal = v === true ? "1" : v === false ? "0" : HALO_VALUES.includes(v) ? v : "1";
  GameStore.store.rawSet(KEY, haloVal);
  for (const fn of listeners) fn("halo", haloVal);
  return halo();
}

function choice(name) {
  if (picked[name] === undefined) {
    const C = CHOICES[name];
    let v = GameStore.store.raw(C.key);
    try {
      const q = new RegExp("[?&]" + C.url + "=([a-z0-9]+)", "i").exec(location.search);
      if (q) v = q[1].toLowerCase();
    } catch (_) { /* no location in a headless VM: the stored value stands */ }
    picked[name] = C.values.includes(v) ? v : C.values[0];
  }
  return picked[name];
}

function setChoice(name, v) {
  const C = CHOICES[name];
  picked[name] = C.values.includes(v) ? v : C.values[0];
  GameStore.store.rawSet(C.key, picked[name]);
  for (const fn of listeners) fn(name, picked[name]);
  return picked[name];
}

function wheel() { return choice("wheel"); }
function setWheel(v) { return setChoice("wheel", v); }
function seat() { return choice("seat"); }
function setSeat(v) { return setChoice("seat", v); }
function interior() { return choice("interior"); }
function setInterior(v) { return setChoice("interior", v); }

// Does this wheel (default: the chosen one) carry the gear/speed LCD?
function wheelHasScreen(style) { return !!SCREEN_WHEELS[style || wheel()]; }

// The eye and the wheel mount for a wheel and a seat (default: the chosen ones).
// Frozen and cached per pair: vantage() and the rig draw read it every frame.
const _layouts = {};
function layout(w, s) {
  const wk = MOUNTS[w] ? w : wheel(), sk = SEATS[s] ? s : seat(), key = wk + "|" + sk;
  if (!_layouts[key]) {
    const st = SEATS[sk], m = MOUNTS[wk];
    _layouts[key] = Object.freeze({ eyeF: EYE_F + st[0], eyeU: EYE_U + st[1], wheelY: m[0] + st[1], wheelZ: m[1] + st[0], wheelS: m[2] });
  }
  return _layouts[key];
}

// A cockpit-view consumer that must follow a change made mid-race.
function onWheel(fn) { listeners.push(fn); }

function turnChaseLead() {
  if (lead === null) lead = readLead();
  return lead;
}

function setTurnChaseLead(v) {
  lead = clampLead(v);
  GameStore.store.rawSet(KEY_LEAD, String(Math.round(lead * 100) / 100));
  return lead;
}

function turnChase() { return turnChaseLead() > 0; }

function setTurnChase(on) {
  return setTurnChaseLead(on ? LEAD_DEFAULT : 0);
}

function paintLead(inp, out) {
  const pct = Math.round(turnChaseLead() * 100);
  if (inp) inp.value = String(pct);
  if (out) out.textContent = `${pct}%`;
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
  let insertAfter = (adv && adv.parentNode === host) ? adv : null;
  function place(el) {
    if (insertAfter && insertAfter.parentNode === host && typeof host.insertBefore === "function") {
      host.insertBefore(el, insertAfter.nextSibling);
      insertAfter = el;
    } else {
      host.appendChild(el);
    }
  }
  place(head);
  // The row titles are hover-only, which a phone never shows: each row also
  // gets the same sentence as a visible help line under it.
  const help = (text) => {
    const p = document.createElement("p");
    p.className = "adv-help";
    p.textContent = text;
    place(p);
  };

  function row(id, label, values, labels, title, read, write) {
    const r = SettingRow.build(id, label, values.map((v) => [v, labels[v]]));
    r.row.title = title;
    SettingRow.wire(r.row, { read, write: (v) => {
      write(v);
      try { if (typeof GameAudio !== "undefined" && GameAudio.uiSelect) GameAudio.uiSelect(); }
      catch (_) { /* audio is optional here */ }
    } });
    place(r.row);
    help(title);   // the visible help line under the row (a phone never shows a title)
  }
  const C = CHOICES;
  row("pm-ckwheel", "WHEEL", C.wheel.values, C.wheel.labels,
    "The steering wheel. CLASSIC, 2000s and NONE have no screen, so the HUD shows gear and speed.", wheel, setWheel);
  row("pm-ckseat", "SEAT", C.seat.values, C.seat.labels,
    "Where you sit in the car. The wheel moves with the seat.", seat, setSeat);
  row("pm-halo", "HALO", HALO_VALUES, HALO_LABELS,
    "The halo (secondary roll structure) over the cockpit, and how thick it is.", haloSetting, setHalo);
  row("pm-ckint", "INTERIOR", C.interior.values, C.interior.labels,
    "The cockpit trim: bare carbon, padding in your team's colours, or a 1960s cockpit with an aeroscreen and round gauges.", interior, setInterior);

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
  help(lab.title);
  paintLead(inp, out);
}

if (typeof document !== "undefined") {
  if (document.readyState !== "complete") document.addEventListener("DOMContentLoaded", initUI, { once: true });
  else initUI();
}

return {
  KEY, KEY_TC, KEY_LEAD, KEY_WHEEL, LEAD_DEFAULT, WHEELS, CHOICES, HALO_VALUES,
  halo, haloSize, setHalo, wheel, setWheel, seat, setSeat, interior, setInterior, wheelHasScreen, onWheel, layout, turnChase, setTurnChase, turnChaseLead, setTurnChaseLead, parseLead,
};
})();
Object.freeze(CockpitOpts);
