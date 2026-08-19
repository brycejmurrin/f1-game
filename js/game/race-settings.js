"use strict";
/* Apex 26 — RACE SETTINGS chips + open/cancel.
   RaceSettings.create(G). Extracted from game.js: laps / weather / time /
   difficulty / quali / cautions / reliability, plus the return-path for
   #race-settings. G already owned those lets (timeTrial / seasonMode /
   raceLaps / raceWeather / raceTimeOfDay / difficulty / raceQuali /
   raceReliability / trackIdx / netRoom / setCautionEnabled / cautionInfo /
   store / $ / soundOn / TT_LAPS / GAME_LAPS). rsReturn lives here so cancel
   and open share one binding — 0 new G.

   Must load BEFORE js/game.js (see index.html / tools/manifest.cjs). */
const RaceSettings = (() => {
  function create(G) {
    Log.info("ui", "RaceSettings.create");
    const { $ } = G;

    // RACE SETTINGS is reachable from #select and (in career) from #career, so it
    // records which screen to restore on cancel — the same return-path pattern
    // openGarage(from)/garageReturn uses, and for the same reason: unhiding #select
    // unconditionally used to drop the player on the wrong screen.
    let rsReturn = "select";

    function buildRaceSettings() {
      // In the room this screen confirms the host's choice and hands it to the
      // other player — it does not drop the lights. A button saying RACE! there is
      // a lie about what the next tap does.
      $("rs-go").textContent = G.netRoom ? "CONFIRM" : "RACE!";
      // TT list includes 4 because TT_LAPS = 4 is the openRaceSettings default —
      // without it the screen opened with no LAPS chip highlighted.
      // FULL is this CIRCUIT's grand prix distance (def.gpLaps — the real
      // regulation, derived in js/track/tracks.js), not a flat 57 offered on all
      // forty. Monaco is 78 laps and Spa is 44; one number could only ever be right
      // for one of them, and 57 was not right for either. Filtered so the ladder
      // stays strictly increasing on a short circuit-free layout.
      const full = (Tracks.LIST[G.trackIdx] && Tracks.LIST[G.trackIdx].gpLaps) || 57;
      const lapOpts = G.timeTrial ? [3, 4, 5, 8]
                                  : [3, 5, 10, 25].filter((n) => n < full).concat(full);
      // FULL now MOVES with the circuit, so a selection made at Monaco (78) is off
      // the ladder at Spa (44) and would leave no chip lit — the same defect the
      // TT comment above records. Clamp instead of silently deselecting.
      if (!G.timeTrial && G.raceLaps > full) G.raceLaps = full;
      const lapsEl = $("rs-laps");
      lapsEl.innerHTML = "";
      for (const n of lapOpts) {
        const b = document.createElement("button");
        b.className = "sel-chip" + (G.raceLaps === n ? " active" : "");
        b.textContent = !G.timeTrial && n === full ? full + " (FULL)" : String(n);
        b.onclick = () => { G.raceLaps = n; buildRaceSettings(); if (G.soundOn) GameAudio.uiTick(); };
        lapsEl.appendChild(b);
      }
      const weatherEl = $("rs-weather");
      weatherEl.innerHTML = "";
      for (const [id, label, icon] of [["dry", "DRY", "☀"], ["wet", "WET", "💧"], ["rain", "RAIN", "🌧"], ["overcast", "CLOUDY", "☁"], ["fog", "FOG", "🌫"]]) {
        const b = document.createElement("button");
        b.className = "sel-chip" + (G.raceWeather === id ? " active" : "");
        b.textContent = icon + " " + label;
        b.onclick = () => { G.raceWeather = id; buildRaceSettings(); if (G.soundOn) GameAudio.uiTick(); };
        weatherEl.appendChild(b);
      }
      const timeEl = $("rs-time");
      timeEl.innerHTML = "";
      for (const [id, label] of [["default", "DEFAULT"], ["dawn", "DAWN"], ["day", "DAY"], ["dusk", "DUSK"], ["night", "NIGHT"]]) {
        const b = document.createElement("button");
        b.className = "sel-chip" + (G.raceTimeOfDay === id ? " active" : "");
        b.textContent = label;
        b.onclick = () => { G.raceTimeOfDay = id; buildRaceSettings(); if (G.soundOn) GameAudio.uiTick(); };
        timeEl.appendChild(b);
      }
      // DIFFICULTY — a race setting like the rest, so it is built here rather than
      // on the select screen. Unlike laps/weather/time it PERSISTS (store), because
      // it is a standing preference rather than a per-race choice.
      $("rs-diff-section").hidden = G.timeTrial;  // no AI to rate in a time trial
      const diffEl = $("rs-diff");
      diffEl.innerHTML = "";
      for (const d of ["easy", "normal", "hard"]) {
        const b = document.createElement("button");
        b.className = "sel-chip" + (G.difficulty === d ? " active" : "");
        b.setAttribute("aria-pressed", G.difficulty === d ? "true" : "false");
        b.textContent = d.toUpperCase();
        b.onclick = () => { G.difficulty = d; G.store.set("difficulty", d); buildRaceSettings(); if (G.soundOn) GameAudio.uiTick(); };
        diffEl.appendChild(b);
      }
      // RELIABILITY — same idiom, same persistence, and hidden alongside DIFFICULTY
      // in a time trial for the same reason: neither has anything to act on there.
      // (ACTIVE AERO used to sit here. It is a CONTROL preference, not a property of
      // the event, so it lives in pause > SETTINGS > DRIVING next to GEARS — where
      // it can also be changed mid-race, which is when a player discovers they want
      // it. See refreshAeroBtn.)
      // Hidden in a time trial (no grid). A championship weekend decides the grid,
      // so the chips go away and the label carries ON/OFF — dead chips looked live
      // enough to tap and did nothing. Qualifying IS offered in a friend race.
      const champ = G.seasonMode;
      $("rs-quali-section").hidden = G.timeTrial;
      const qEl = $("rs-quali");
      qEl.innerHTML = "";
      const qForced = champ ? SeasonCal.quali() : null;
      $("rs-quali-label").textContent = "QUALIFYING LAP" + (qForced == null ? "" : " · " + (qForced ? "ON" : "OFF"));
      qEl.hidden = qForced != null;
      if (qForced == null) for (const [on, label] of [[false, "OFF"], [true, "ON"]]) {
        const b = document.createElement("button");
        b.className = "sel-chip" + (G.raceQuali === on ? " active" : "");
        b.setAttribute("aria-pressed", G.raceQuali === on ? "true" : "false");
        b.textContent = label;
        b.onclick = () => {
          G.raceQuali = on; G.store.set("raceQuali", on);
          buildRaceSettings(); if (G.soundOn) GameAudio.uiTick();
        };
        qEl.appendChild(b);
      }
      // CAUTIONS — the flag layer. Hidden in a time trial for the same reason
      // RELIABILITY is: alone on an empty track there is nothing to caution.
      $("rs-caution-section").hidden = G.timeTrial;
      const cauEl = $("rs-caution");
      cauEl.innerHTML = "";
      const cautionOn = G.cautionInfo().enabled;
      for (const [on, label] of [[false, "OFF"], [true, "ON"]]) {
        const b = document.createElement("button");
        b.className = "sel-chip" + (cautionOn === on ? " active" : "");
        b.setAttribute("aria-pressed", cautionOn === on ? "true" : "false");
        b.textContent = label;
        b.onclick = () => {
          G.setCautionEnabled(on);
          buildRaceSettings(); if (G.soundOn) GameAudio.uiTick();
        };
        cauEl.appendChild(b);
      }
      $("rs-reliab-section").hidden = G.timeTrial;
      const relEl = $("rs-reliab");
      relEl.innerHTML = "";
      for (const [id, label] of [["off", "OFF"], ["low", "LOW"], ["real", "REAL"]]) {
        const b = document.createElement("button");
        b.className = "sel-chip" + (G.raceReliability === id ? " active" : "");
        b.setAttribute("aria-pressed", G.raceReliability === id ? "true" : "false");
        b.textContent = label;
        b.onclick = () => {
          G.raceReliability = id;
          buildRaceSettings(); if (G.soundOn) GameAudio.uiTick();
        };
        relEl.appendChild(b);
      }
    }

    function openRaceSettings(from) {
      rsReturn = from || "select";
      // Defaults on every visit is right when this screen is the last step before
      // a race. In the VS FRIEND room the host may come back to change one thing,
      // and resetting the other three would silently undo choices the guest has
      // already been shown.
      if (!G.netRoom) {
        // A season's DISTANCE PRESELECTS the chip rather than overriding it: the
        // player can still change this weekend's race from here.
        G.raceLaps = G.timeTrial ? G.TT_LAPS : SeasonCal.formatLaps(G.GAME_LAPS);
        G.raceWeather = "dry";
        G.raceTimeOfDay = "default";
      }
      buildRaceSettings();
      $(rsReturn).hidden = true;
      $("race-settings").hidden = false;
    }

    $("rs-cancel").onclick = () => {
      $("race-settings").hidden = true;
      $(rsReturn).hidden = false;
    };

    return { buildRaceSettings, openRaceSettings };
  }
  return { create };
})();
