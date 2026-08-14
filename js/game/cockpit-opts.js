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

let _halo = null;   // resolved lazily: localStorage may be unavailable at eval

function halo() {
  if (_halo === null) {
    let v = null;
    try { v = localStorage.getItem(KEY); } catch (_) { /* private mode / no storage */ }
    // URL form wins for the session without touching saved state, so a link can
    // demo the halo on someone else's machine and leave their setting alone.
    try {
      const q = /[?&]halo=(1|0|on|off|true|false)/i.exec(location.search);
      if (q) v = /^(1|on|true)$/i.test(q[1]) ? "1" : "0";
    } catch (_) { /* no location (node/test) */ }
    _halo = v === "1";
  }
  return _halo;
}

function setHalo(on) {
  _halo = !!on;
  try { localStorage.setItem(KEY, _halo ? "1" : "0"); } catch (_) { /* nothing to persist to */ }
  return _halo;
}

/* SETTINGS > COCKPIT. Injected at runtime rather than written into
   index.html, for the same two reasons PerfTry documents: the DOM-node ratchet
   (tests/unit/css-class-ratchet.test.mjs) counts index.html's nodes, and this
   button mints NO new CSS class — it carries none, exactly like its neighbours
   #pm-res / #pm-renderer / #pm-gfx. */
function paint(btn) {
  btn.textContent = "HALO: " + (halo() ? "ON" : "OFF");
  btn.setAttribute("aria-pressed", halo() ? "true" : "false");
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

  const b = document.createElement("button");
  b.id = "pm-halo";
  b.title = "Draw the halo (secondary roll structure) in the cockpit view. " +
            "Real cars and real onboards have one; it also puts a pillar in the " +
            "middle of your sightline, which is what makes it a preference.";
  paint(b);
  b.onclick = () => {
    setHalo(!halo());
    paint(b);
    // The cockpit body cache is keyed on halo(), so the next frame rebuilds
    // the mesh on its own — nothing to invalidate and no reload.
    try { if (typeof GameAudio !== "undefined" && GameAudio.uiSelect) GameAudio.uiSelect(); } catch (_) { /* audio not up yet; the toggle still applies */ }
  };
  host.appendChild(b);
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initUI, { once: true });
  else initUI();
}

return { KEY, halo, setHalo };
})();
