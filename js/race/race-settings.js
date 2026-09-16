/* Apex 26 — RACE SETTINGS sheet: lap ladder, weather, grid rule, GO/cancel.
 * RaceSettings.create(hooks) — game.js passes mutable session state and the
 * select-screen plumbing; netRoom changes what GO means in a VS FRIEND room. */
const RaceSettings = (function () {
  "use strict";

  const RS_WEATHER = [["dry", "☀ DRY"], ["wet", "💧 WET"], ["rain", "🌧 RAIN"], ["overcast", "☁ CLOUDY"], ["fog", "🌫 FOG"]];
  const RS_CONDITIONS = [["stable", "STABLE"], ["mixed", "MIXED"]];
  const RS_TIME = [["default", "DEFAULT"], ["dawn", "DAWN"], ["day", "DAY"], ["dusk", "DUSK"], ["night", "NIGHT"]];
  const RS_DIFF = [["easy", "EASY"], ["normal", "NORMAL"], ["hard", "HARD"]];
  const RS_ONOFF = [["off", "OFF"], ["on", "ON"]];
  const RS_RELIAB = [["off", "OFF"], ["low", "LOW"], ["real", "REAL"]];
  // TYRE WEAR (js/physics/tyre-model.js). Same three-rung shape as RELIABILITY
  // and for the same reason — OFF is the shipped default, and the middle rung
  // exists so a player can have the mechanic without it deciding the race.
  const RS_TYRES = [["off", "OFF"], ["light", "LIGHT"], ["real", "REAL"]];
  const RS_LINE = [["off", "OFF"], ["corner", "CORNERS"], ["full", "FULL"]];

  function create(hooks) {
    const {
      $, store, GameAudio, getSoundOn, Tracks, SettingRow, DrivingLine,
      GAME_LAPS, TT_LAPS, scheduleFlybyTrack,
      isTimeTrial, isChampionship, SeasonCal, setCautionEnabled,
      getTrackIdx, getRaceLaps, setRaceLaps, getRaceWeather, setRaceWeather,
      getRaceTimeOfDay, setRaceTimeOfDay, getRaceChangeable, setRaceChangeable,
      setWxArcPlan, getDifficulty, setDifficulty,
      getRaceGrid, setRaceGrid, getRaceReliability, setRaceReliability,
      getRaceTyreWear, setRaceTyreWear, getDuel, setDuel,
      getRaceCtl, gridFromQuali, getSeason, qualiResults, openQuali, startRace,
      enableTilt, getSteerMode, getNetLobby, buildSelect, els, openGarage,
    } = hooks;

    let rsReturn = "select";
    let netRoom = false;

    function setDrivingLine(v) { store.set("drivingLine", DrivingLine.setMode(v)); }

    function buildRaceSettings() {
      $("rs-go").textContent = netRoom ? "CONFIRM" : "RACE!";
      wireRaceSettings();
      const tt = isTimeTrial();
      const trackIdx = getTrackIdx();
      let raceLaps = getRaceLaps();
      const full = (Tracks.LIST[trackIdx] && Tracks.LIST[trackIdx].gpLaps) || 57;
      const lapOpts = tt ? [3, 4, 5, 8] : [3, 5, 10, 25].filter((n) => n < full).concat(full);
      if (!tt && !lapOpts.includes(raceLaps)) {
        raceLaps = full;
        setRaceLaps(full);
      }
      SettingRow.paint("rs-laps", raceLaps, lapOpts.map((n) => [n, !tt && n === full ? full + " (FULL)" : String(n)]));
      SettingRow.paint("rs-weather", getRaceWeather(), RS_WEATHER);
      $("rs-mixed").hidden = tt;
      SettingRow.paint("rs-mixed", getRaceChangeable() ? "mixed" : "stable", RS_CONDITIONS);
      SettingRow.paint("rs-time", getRaceTimeOfDay(), RS_TIME);
      $("rs-diff").hidden = tt;
      SettingRow.paint("rs-diff", getDifficulty(), RS_DIFF);
      const champ = isChampionship();
      // DUEL is a one-off practice format: a 2-car race against the field's
      // quickest driver with his stats lifted. Hidden in a Time Trial (which
      // has no field at all) and in a championship, where the classification
      // feeds points and standings — a 2-car GP would score a season.
      $("rs-duel").hidden = tt || champ;
      SettingRow.paint("rs-duel", getDuel() ? "on" : "off", RS_ONOFF);
      $("rs-quali").hidden = tt;
      const qForced = champ ? SeasonCal.quali() : null;
      const rules = qForced ? [["quali", "QUALIFYING"]]
        : champ ? [["tier", "PACE ORDER"], ["revchamp", "REVERSED"], ["random", "RANDOM"]]
        : [["tier", "PACE ORDER"], ["quali", "QUALIFYING"], ["rev10", "REVERSE 10"], ["random", "RANDOM"]];
      const raceGrid = getRaceGrid();
      const cur = qForced ? "quali" : rules.some(([r]) => r === raceGrid) ? raceGrid : "tier";
      SettingRow.paint("rs-quali", cur, rules);
      SettingRow.disable("rs-quali", !!qForced);
      $("rs-caution").hidden = tt;
      SettingRow.paint("rs-caution", getRaceCtl().enabled ? "on" : "off", RS_ONOFF);
      $("rs-reliab").hidden = tt;
      SettingRow.paint("rs-reliab", getRaceReliability(), RS_RELIAB);
      // Hidden in a time trial for the same reason the model forces it off
      // there: a lap against the clock is not a set anybody is asked to manage.
      $("rs-tyres").hidden = tt;
      SettingRow.paint("rs-tyres", getRaceTyreWear(), RS_TYRES);
      SettingRow.paint("rs-line", DrivingLine.mode(), RS_LINE);
    }

    function wireRaceSettings() {
      const body = $("rs-body");
      if (body.dataset.wired) return;
      body.dataset.wired = "1";
      const soundOn = () => getSoundOn();
      const after = () => { buildRaceSettings(); if (soundOn()) GameAudio.uiTick(); };
      const wire = (id, read, write) => SettingRow.wire(id, { read, write: (v) => { write(v); after(); } });
      wire("rs-laps", getRaceLaps, (v) => setRaceLaps(+v));
      wire("rs-weather", getRaceWeather, (v) => { setRaceWeather(v); scheduleFlybyTrack(); });
      wire("rs-mixed", () => (getRaceChangeable() ? "mixed" : "stable"), (v) => {
        setRaceChangeable(v === "mixed");
        setWxArcPlan(null);
      });
      wire("rs-time", getRaceTimeOfDay, (v) => { setRaceTimeOfDay(v); scheduleFlybyTrack(); });
      wire("rs-diff", getDifficulty, (v) => { setDifficulty(v); store.set("difficulty", v); });
      wire("rs-quali", getRaceGrid, (v) => { setRaceGrid(v); store.set("raceGrid", v); });
      wire("rs-caution", () => (getRaceCtl().enabled ? "on" : "off"), (v) => setCautionEnabled(v === "on"));
      wire("rs-reliab", getRaceReliability, (v) => { setRaceReliability(v); store.set("reliability", v); });
      wire("rs-tyres", getRaceTyreWear, (v) => setRaceTyreWear(v));
      wire("rs-line", () => DrivingLine.mode(), setDrivingLine);
      wire("rs-duel", () => (getDuel() ? "on" : "off"), (v) => setDuel(v === "on"));
    }

    function setNetRoom(on) { netRoom = !!on; }

    function openRaceSetup() {
      $("vsfriend").hidden = true;
      buildSelect();
      els.select.hidden = false;
      if (getSoundOn()) GameAudio.uiSelect();
    }

    function openRaceSettings(from) {
      rsReturn = from || "select";
      if (!netRoom) {
        setRaceLaps(isTimeTrial() ? TT_LAPS : SeasonCal.formatLaps(GAME_LAPS));
        setRaceWeather("dry");
        setRaceTimeOfDay("default");
      }
      buildRaceSettings();
      $(rsReturn).hidden = true;
      $("race-settings").hidden = false;
      scheduleFlybyTrack();
    }

    function wireButtons() {
      els.selGo.onclick = () => {
        if (getSoundOn()) GameAudio.uiSelect();
        if (els.selGo.dataset.seasonComplete === "1") {
          hooks.buildStandings();
          $("standings").hidden = false;
          return;
        }
        openRaceSettings("select");
      };
      $("sel-car").onclick = () => openGarage("select");
      $("rs-cancel").onclick = () => {
        $("race-settings").hidden = true;
        $(rsReturn).hidden = false;
      };
      $("rs-go").onclick = () => {
        if (getSoundOn()) GameAudio.uiSelect();
        $("race-settings").hidden = true;
        const netLobby = getNetLobby();
        if (netRoom) {
          $("vsfriend").hidden = false;
          netLobby.roomChanged("race");
          return;
        }
        if (getSteerMode() === "tilt") enableTilt();
        // Same gesture, same reason: Chromium needs user activation before
        // navigator.vibrate will fire and no longer accepts touchstart as one,
        // so arm it from this click or the first in-race brake cue is dropped.
        if (window.Input && Input.primeHaptics) Input.primeHaptics();
        const season = getSeason();
        if ((isChampionship() && SeasonCal.qualiNext(season) && !qualiResults()) ||
            (!isChampionship() && gridFromQuali() && !qualiResults())) openQuali();
        else startRace();
      };
    }

    return {
      buildRaceSettings,
      wireRaceSettings,
      openRaceSettings,
      openRaceSetup,
      setNetRoom,
      wireButtons,
      get netRoom() { return netRoom; },
      get rsReturn() { return rsReturn; },
    };
  }

  return { create };
})();
Object.freeze(RaceSettings);
