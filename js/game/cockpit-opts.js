/* Apex 26 — CockpitOpts: player-facing options for the first-person view.

   Today that is one switch, the HALO, but the shape is deliberate: cockpit
   look-and-feel choices are NOT perf experiments (js/game/perf-try.js) and NOT
   quality tiers (js/game/gfx-quality.js), so they get their own owner rather
   than being smuggled into a panel whose heading would then be lying.

   THE HALO. The secondary roll structure is real and mandatory on the car
   (FIA 2026 C12.4.2 — front fixing axis at Z=660, rear faces on Z=695), and a
   modern onboard is unmistakably framed by it. It was cut from the ckpt build
   because at the eye height of the time the hoop projected 47.7 deg above the
   sightline as a dark bar across the middle of the frame (see car3d.js). The
   eye has since moved to a measured seating position, so the hoop can sit where
   a real one does — above the head, with the front pillar in the sightline,
   which is exactly what a driver sees and some players want and others cannot
   stand. That is the definition of a setting, not a default.

   DEFAULT OFF, so nobody's view changes without them asking. Flip it in
   SETTINGS > COCKPIT, or:
     CockpitOpts.setHalo(true)      console, applies on the next frame
     ?halo=1  /  ?halo=0            URL form, session only, overrides storage

   No reload needed: js/game.js keys the cockpit body cache on halo(), so
   flipping the switch mints a different cache key and the next frame rebuilds.

   Self-initialising (no create(G)) — every read is at call time, so this file
   has no eval-time dependencies and its load-order position is free. */
const CockpitOpts = (function () {
  "use strict";

const KEY = "apex26.cockpitHalo";
const KEY_TC = "apex26.cockpitTurnChase";

// TURN CHASING lead, as a fraction of the way from "down the car's nose" to
// "at the point 30 m up the racing line". 0.35 is enough to read as the driver
// glancing into the corner without the nose sliding across the frame.
const TURN_CHASE = 0.35;

let _halo = null, _tc = null;   // resolved lazily: localStorage may be absent at eval

function read(key, urlName) {
  let v = null;
  try { v = localStorage.getItem(key); } catch (_) { /* private mode / no storage */ }
  // URL form wins for the session without touching saved state, so a link can
  // demo a switch on someone else's machine and leave their setting alone.
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

// The blend weight js/game/cameras.js actually consumes — 0 when off, so an
// untuned install aims exactly down the nose.
function turnChaseLead() { return turnChase() ? TURN_CHASE : 0; }

/* SETTINGS > COCKPIT. Injected at runtime rather than written into
   index.html, for the same two reasons PerfTry documents: the DOM-node ratchet
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
  if (typeof document === "undefined") return;
  // Anchor on #pm-res's own section: the DISPLAY group carries no id, and
  // finding it by heading text would break the first time it is renamed.
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
      // Nothing to invalidate: the cockpit body cache is keyed on halo(), so a
      // halo flip rebuilds itself next frame, and turnChase is read per frame
      // by js/game/cameras.js. No reload for either.
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
