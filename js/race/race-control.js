/* Apex 26 — RACE CONTROL (RaceControl.create(G)) The flag state: green / local yellow / VSC / safety car, and the one rule that reads off it (whether OVERTAKE is … */
"use strict";
const RaceControl = (() => {
  // Result countdown policy. A winner crossing the line is not permission to
  // remove a human who is still racing: single-player AI can finish first, and
  // multiplayer humans can be separated by much more than 3.5 seconds. The
  // hard cap remains the bounded escape hatch for an unfinished/stale human.
  // AI-only harnesses retain the old "shortly after the winner" behaviour.
  function finishDelay(cars, raceT, lapsTarget) {
    let anyHuman = false, allHumansDone = true, anyFinished = false, running = false, pend = 0;
    for (const c of cars || []) {
      if (!c) continue;
      if (c.finished) { anyFinished = true; if (!c.retired) pend = Math.max(pend, (c.finishT || 0) + (c.penalty || 0)); }
      else if (!c.retired) running = true;
      if (!c.human) continue;
      anyHuman = true;
      if (!c.finished && !c.retired) allHumansDone = false;
    }
    // A time penalty is served on the CLOCK (classification sorts finishers by
    // finishT + penalty, game.js endRace), so a finisher carrying one is not
    // settled until every car still on track has had that long to cross.
    // Without this the 2.2 s countdown ran from the player's crossing, and a
    // rival 3 s back with a +5 s penalty against it was filed as "still
    // running" — behind, on a result it had won. Bounded by the penalty
    // itself; the hard cap below still wins.
    if (running && raceT < pend && raceT <= 360 * lapsTarget) return 0;
    if (anyHuman && allHumansDone) return 2.2;
    if (!anyHuman && anyFinished) return 3.5;
    if (raceT > 360 * lapsTarget) return 0.1;
    return 0;
  }

  const LABEL = ["GREEN", "YELLOW", "VSC", "SAFETY CAR", "RED FLAG"];
  const YELLOW_MIN = 3;    // settled hazards in ONE sector -> local yellow
  const VSC_MIN = 6;       // total settled hazards on the surface -> VSC
  const SC_MIN = 10;       // a big pile -> full safety car
  // RED FLAG: a pile the marshals cannot clear under a safety car. The
  // procedure runs on its own clock — STOPPING (the field halts), HELD, then
  // one restart request game.js consumes (redFlagRestart: surface cleared,
  // field re-gridded in race order, standing restart — the 2026 procedure
  // once the track is clear). Exempt from the SC cap; solo only in v1.
  const RED_MIN = 16;
  const RED_STOP = 8;      // s for the field to come to a halt once red is shown
  const RED_HOLD = 6;      // s the flag holds before the restart is called
  const MIN_HOLD = 6;      // s a caution holds once raised (anti-flicker)
  const YELLOW_MAX = 30;   // s hard cap on a local yellow
  const SC_MAX = 90;       // s hard cap on VSC/SC — bounded, ~a lap or two
  const CAP_REARM_HOLD = 45;  // s of green after a cap-forced drop before the
                              // same stale hazard picture may re-raise a flag
  const QUERY_EVERY = 0.25;   // s — hazards() at ~4 Hz, not per frame

  function blank() {
    return { level: 0, sector: -1, frac: 0, total: 0, sectors: [0, 0, 0], sinceT: 0, cause: "", phase: "" };
  }

  function logFlag(prev, next) {
    if (prev === next) return;
    Log.info("game", "RaceControl flag " + LABEL[prev] + " -> " + LABEL[next]);
  }

  function create(G) {
    Log.info("game", "RaceControl.create");
    const { store } = G;
    let caution = blank();
    let queryT = 0;
    let capHoldT = 0;       // remaining re-arm suppression after a cap-forced drop
    let capHoldLevel = 0;   // the level that capped; escalations ABOVE it still fly
    let restartWanted = false;   // one-shot: the red procedure has run its course
    // Last state broadcast to a guest, so only CHANGES are sent.
    let sent = "";
    const savedCaution = store.get("caution", true);
    let enabled = !(savedCaution === false || savedCaution === 0 || savedCaution === "0");

    function reset() {
      caution = blank();
      queryT = 0;
      capHoldT = 0; capHoldLevel = 0;
      restartWanted = false;
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
      // total/sectors ride in the payload, so they must be in the change key —
      // an evolving hazard picture at a constant level went un-republished and
      // froze the guest's counts.
      const key = caution.level + "|" + caution.sector + "|" + caution.cause + "|" + caution.phase +
        "|" + caution.total + "|" + (caution.sectors ? caution.sectors.join(",") : "");
      if (key === sent) return;
      sent = key;
      netPlay.reportCaution({
        level: caution.level, sector: caution.sector, frac: caution.frac,
        cause: caution.cause, total: caution.total, sectors: caution.sectors,
        sinceT: caution.sinceT, phase: caution.phase,
      });
    }

    // The hard-cap drop, shared by the live-query path and the debris-inactive
    // freeze path. Returns true when the flag just dropped to GREEN.
    function capDropIfExpired() {
      if (caution.level === 0 || caution.level === 4) return false;   // red runs its own procedure
      const cap = caution.level >= 2 ? SC_MAX : YELLOW_MAX;
      if (caution.sinceT < cap) return false;
      capHoldLevel = caution.level;   // what capped — see the re-raise gate below
      const prev = caution.level;
      caution.level = 0; caution.sector = -1; caution.frac = 0;
      caution.cause = ""; caution.sinceT = 0;
      capHoldT = CAP_REARM_HOLD;
      logFlag(prev, 0);
      publish();
      return true;
    }

    function update(dt) {
      // State reset BEFORE the ownership gate: a guest's caution mirror comes
      // from host apply(), and returning early here left the last flag flown
      // on its HUD after the race ended (reset() is local-only, safe for all).
      if (G.state !== "race") {
        if (caution.level !== 0 || capHoldT) reset();
        return;
      }
      if (!G.netPlay.ownsRaceControl()) return;
      if (!enabled) return;
      if (caution.level !== 0) caution.sinceT += dt;
      if (caution.level === 4) {
        // The red procedure: no hazard query, no cap — it ends in exactly ONE
        // restart request. The re-arm hold then keeps the same (not yet
        // cleared) picture from raising a second flag before game.js clears
        // the surface on the restart.
        caution.phase = caution.sinceT < RED_STOP ? "stopping" : "held";
        if (caution.sinceT >= RED_STOP + RED_HOLD) {
          restartWanted = true;
          capHoldLevel = 4; capHoldT = CAP_REARM_HOLD;
          const prev = caution.level;
          caution.level = 0; caution.sector = -1; caution.frac = 0;
          caution.cause = ""; caution.sinceT = 0; caution.phase = "";
          logFlag(prev, 0);
        }
        publish();
        return;
      }
      if (!DebrisWorld.active()) {
        // Debris inactive mid-flag: the LEVEL freezes (test-asserted — see
        // "debris going inactive mid-race freezes a flying flag") but it keeps
        // AGEING, so the hard cap still fires. Before this, a trapped Rapier
        // world (debrisworld sets _active=false permanently) pinned a safety
        // car — and disabled OVERTAKE — for the rest of the race.
        capDropIfExpired();
        return;
      }
      queryT += dt;
      if (queryT < QUERY_EVERY) return;
      // Subtract, don't zero: resetting to 0 made the real cadence
      // ceil(0.25/dt)·dt and the capHold debit ~6% short at 60/30 fps.
      queryT -= QUERY_EVERY;

      const hz = DebrisWorld.hazards();
      let desired = 0, dsector = -1, dfrac = 0, dcause = "";
      if (hz.total >= RED_MIN) { desired = 4; dcause = "RED FLAG"; }
      else if (hz.total >= SC_MIN) { desired = 3; dcause = "SAFETY CAR"; }
      else if (hz.total >= VSC_MIN) { desired = 2; dcause = "VSC"; }
      else if (hz.worst.count >= YELLOW_MIN) {
        desired = 1; dsector = hz.worst.sector; dfrac = hz.worst.frac; dcause = "YELLOW";
      }
      caution.total = hz.total;
      caution.sectors = hz.sectors.slice();
      // v1: a networked race never goes red — the standing restart needs the
      // host to name the moment (netplay hostStart) — it holds a SAFETY CAR.
      if (desired === 4 && G.netPlay.active()) { desired = 3; dcause = "SAFETY CAR"; }

      // The HARD CAP the constants always promised ("a stuck hazard cannot
      // neutralise the race forever"): a flag flown for its full cap drops to
      // GREEN even while the hazard picture persists — marshals have had their
      // window; racing resumes. Without this the cap clause below was dead code
      // (MIN_HOLD < cap made the disjunct unreachable, and lowering only ever
      // ran when the picture had ALREADY cleared), so one never-despawning
      // piece of debris held a safety car for the rest of the race.
      // capHold suppresses an instant re-raise from the SAME stale picture;
      // genuinely new hazards re-arm after it expires.
      if (capDropIfExpired()) return;
      if (capHoldT > 0) {
        capHoldT = Math.max(0, capHoldT - QUERY_EVERY);
        if (capHoldT === 0) capHoldLevel = 0;
      }

      if (desired > caution.level) {
        // The hold suppresses a re-raise from the SAME stale picture, but must
        // never mask an ESCALATION: debris growing from a local yellow into a
        // safety-car pile has to fly, or the race runs green through a real
        // SC-worthy event for the length of the hold.
        if (capHoldT > 0 && desired <= capHoldLevel) { publish(); return; }
        const prev = caution.level;
        caution.level = desired; caution.sector = dsector; caution.frac = dfrac;
        caution.cause = dcause; caution.sinceT = 0;
        caution.phase = desired === 4 ? "stopping" : "";
        logFlag(prev, desired);
      } else if (desired < caution.level) {
        if (caution.sinceT >= MIN_HOLD) {
          const prev = caution.level;
          caution.level = desired;
          caution.sector = desired === 1 ? (dsector >= 0 ? dsector : (hz.worst && hz.worst.sector >= 0 ? hz.worst.sector : 0)) : -1;
          caution.frac = dfrac; caution.cause = dcause; caution.sinceT = 0;
          logFlag(prev, desired);
        }
      } else if (desired === 1 && dsector >= 0) {
        caution.sector = dsector; caution.frac = dfrac;   // track the worst sector
      }
      publish();
    }

    function apply(d) {
      if (!d) return false;
      const prev = caution.level;
      caution.level = d.level | 0;
      caution.sector = d.sector != null ? d.sector : -1;
      caution.frac = d.frac || 0;
      caution.cause = d.cause || "";
      caution.total = d.total || 0;
      if (Array.isArray(d.sectors)) caution.sectors = d.sectors.slice();
      caution.sinceT = d.sinceT || 0;
      caution.phase = typeof d.phase === "string" ? d.phase : "";
      logFlag(prev, caution.level);
      return true;
    }

    // The one-shot restart request at the end of a red-flag procedure.
    function takeRestart() { const r = restartWanted; restartWanted = false; return r; }

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
        cause: caution.cause, phase: caution.phase, enabled,
      };
    }

    return {
      update, apply, reset, setEnabled, otEnabled, info,
      get level() { return caution.level; },
      takeRestart,
      get enabled() { return enabled; },
    };
  }
  return { create, finishDelay };
})();
