/* Apex 26 — RACE CONTROL (RaceControl.create(G))

   The flag state: green / local yellow / VSC / safety car, and the one rule that
   reads off it (whether OVERTAKE is available). Consumes DebrisWorld.hazards() —
   settled debris and broken panels resting ON the racing surface, bucketed per
   sector — at ~4 Hz and resolves a level with hysteresis.

   READ-ONLY WITH RESPECT TO THE CARS, AND THAT IS THE CONTRACT. Nothing in this
   file writes speed, px, pz, head or (s, x). It sets flag state and drives the
   HUD; js/game/incidentsim.js is the layer that may move a car, and it is
   separate precisely so that this one can be reasoned about without checking.

   HYSTERESIS, not a threshold. A caution RAISES immediately and only LOWERS
   after CAUTION_MIN_HOLD (or a hard per-level time cap), because debris despawns
   and a flag that tracked the raw count would flicker between GREEN and YELLOW
   several times a lap. The caps exist so a stuck hazard cannot neutralise a race
   forever.

   RACE CONTROL IS THE HOST'S. Debris is generated locally from each car's own
   behaviour and is NOT replicated, so two peers genuinely see different hazards;
   left to decide independently they would fly different flags for one race. The
   guest computes nothing and adopts what the host sends (apply()). Broadcasts go
   out on CHANGE only — the state is checked at 4 Hz and changes a handful of
   times a race, and the reliable channel is not the place for a steady drip of
   unchanged state.

   Extracted from game.js with no new G members: state, ranked and netPlay were
   already on the façade, and every symbol here was read and written inside these
   two blocks and nowhere else.
*/
"use strict";
const RaceControl = (() => {
  const LABEL = ["GREEN", "YELLOW", "VSC", "SAFETY CAR"];
  const YELLOW_MIN = 3;    // settled hazards in ONE sector -> local yellow
  const VSC_MIN = 6;       // total settled hazards on the surface -> VSC
  const SC_MIN = 10;       // a big pile -> full safety car
  const MIN_HOLD = 6;      // s a caution holds once raised (anti-flicker)
  const YELLOW_MAX = 30;   // s hard cap on a local yellow
  const SC_MAX = 90;       // s hard cap on VSC/SC — bounded, ~a lap or two
  const QUERY_EVERY = 0.25;   // s — hazards() at ~4 Hz, not per frame

  function blank() {
    return { level: 0, sector: -1, frac: 0, total: 0, sectors: [0, 0, 0], sinceT: 0, cause: "" };
  }

  function create(G) {
    const { store } = G;
    let caution = blank();
    let queryT = 0;
    // Last state broadcast to a guest, so only CHANGES are sent.
    let sent = "";
    // DEFAULT ON; the CAUTIONS race setting and __apex.caution({enabled}) write it.
    //
    // READ BOTH FORMATS. game.js wrote this key with a raw
    // localStorage.setItem("apex26.caution", "1" | "0"), which store.get()
    // JSON-parses to the NUMBERS 1 and 0 — so a plain `!== false` would read a
    // stored 0 as truthy and silently switch cautions back ON for every player
    // who had turned them off. Going through the store is what earns this the
    // quota-failure reporting in js/game/store.js; the cost is one migration,
    // and store.set() writes a real boolean from here on.
    const savedCaution = store.get("caution", true);
    let enabled = !(savedCaution === false || savedCaution === 0 || savedCaution === "0");

    function reset() {
      caution = blank();
      queryT = 0;
      // Clear the change-detector too, or the next race's first flag looks like
      // a repeat of the last one's and is never sent.
      sent = "";
    }

    // Turning it OFF must also DROP a flag already flying — otherwise the HUD
    // keeps showing a safety car that nothing is maintaining any more.
    function setEnabled(on) {
      enabled = !!on;
      store.set("caution", enabled);
      if (!enabled) reset();
      return enabled;
    }

    function publish() {
      const netPlay = G.netPlay;
      if (!netPlay.active() || !netPlay.ownsRaceControl()) return;
      const key = caution.level + "|" + caution.sector + "|" + caution.cause;
      if (key === sent) return;
      sent = key;
      netPlay.reportCaution({
        level: caution.level, sector: caution.sector, frac: caution.frac,
        cause: caution.cause, total: caution.total, sectors: caution.sectors,
        sinceT: caution.sinceT,
      });
    }

    function update(dt) {
      if (!G.netPlay.ownsRaceControl()) return;
      if (!enabled || !DebrisWorld.active() || G.state !== "race") {
        if (caution.level !== 0) reset();
        return;
      }
      if (caution.level !== 0) caution.sinceT += dt;
      queryT += dt;
      if (queryT < QUERY_EVERY) return;
      queryT = 0;

      const hz = DebrisWorld.hazards();
      let desired = 0, dsector = -1, dfrac = 0, dcause = "";
      if (hz.total >= SC_MIN) { desired = 3; dcause = "SAFETY CAR"; }
      else if (hz.total >= VSC_MIN) { desired = 2; dcause = "VSC"; }
      else if (hz.worst.count >= YELLOW_MIN) {
        desired = 1; dsector = hz.worst.sector; dfrac = hz.worst.frac; dcause = "YELLOW";
      }
      caution.total = hz.total;
      caution.sectors = hz.sectors.slice();

      if (desired > caution.level) {
        caution.level = desired; caution.sector = dsector; caution.frac = dfrac;
        caution.cause = dcause; caution.sinceT = 0;
      } else if (desired < caution.level) {
        const cap = caution.level >= 2 ? SC_MAX : YELLOW_MAX;
        if (caution.sinceT >= MIN_HOLD || caution.sinceT >= cap) {
          caution.level = desired;
          caution.sector = desired === 1 ? (dsector >= 0 ? dsector : caution.sector) : -1;
          caution.frac = dfrac; caution.cause = dcause; caution.sinceT = 0;
        }
      } else if (desired === 1 && dsector >= 0) {
        caution.sector = dsector; caution.frac = dfrac;   // track the worst sector
      }
      publish();
    }

    // Adopt race control from the host. Deliberately does not touch sinceT's
    // meaning — the guest holds whatever the host decided, for as long as the
    // host says, rather than running its own hold timers over someone else's flag.
    function apply(d) {
      if (!d) return false;
      caution.level = d.level | 0;
      caution.sector = d.sector != null ? d.sector : -1;
      caution.frac = d.frac || 0;
      caution.cause = d.cause || "";
      caution.total = d.total || 0;
      if (Array.isArray(d.sectors)) caution.sectors = d.sectors.slice();
      caution.sinceT = d.sinceT || 0;
      return true;
    }

    // OVERTAKE IS NOT AVAILABLE ON LAP 1, and not while the race is neutralised.
    // This is the real rule for 2026's overtake mode (the electrical push that
    // replaced DRS as the proximity-gated overtaking aid): enabled once the
    // LEADER completes the opening lap, gone under yellows and behind the safety
    // car. Same reasoning DRS always had — the field is at its most bunched
    // exactly when an overtaking aid is least safe.
    //
    // This deliberately does NOT gate ACTIVE AERO. X-mode is not the overtaking
    // aid in 2026 and carries none of its restrictions: every driver gets it on
    // every lap in every approved zone, leader and backmarker alike, with no
    // proximity requirement. Its only limits are the activation zones themselves
    // (js/game/aerozones.js) — which is why Monaco has none.
    //
    // The LEADER's lap, not each car's own: a field-wide switch is what race
    // control actually throws, and gating per-car would hand a lapped driver the
    // push while the leader still had none. `ranked` is already sorted by
    // progress every frame, so this stays O(1) — scanning all 22 cars from
    // inside the per-car update would have been 484 checks a frame for a fact
    // that changes once a race.
    function otEnabled() {
      if (caution.level !== 0) return false;
      const leader = G.ranked[0];
      return !!leader && leader.lap > 1;
    }

    function info() {
      return {
        level: caution.level, label: LABEL[caution.level] || "GREEN",
        sector: caution.sector, frac: caution.frac, total: caution.total,
        sectors: caution.sectors, sinceT: +caution.sinceT.toFixed(2),
        cause: caution.cause, enabled,
      };
    }

    return {
      update, apply, reset, setEnabled, otEnabled, info,
      get level() { return caution.level; },
      get enabled() { return enabled; },
    };
  }
  return { create };
})();
