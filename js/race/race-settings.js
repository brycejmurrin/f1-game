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
  const DUEL_BASE = [["off", "OFF"], ["on", "FASTEST RIVAL"]];
  /* DUEL is OFF / ON / a named legend — one control rather than a second row.
   * ON keeps the original meaning (the fastest car on the grid, bumped); a
   * legend replaces that rival's driver with his own five axes
   * (js/race/duel.js asLegend). Built lazily because js/data/legends.js is a
   * roster file this module must not hard-require: with it absent the row
   * degrades to the OFF/ON it always was. */
  function duelOpts() {
    if (typeof Legends === "undefined" || !Legends.LIST) return DUEL_BASE.slice();
    return DUEL_BASE.concat(Legends.LIST.map((l) => [l.id, l.name.toUpperCase()]));
  }
  const duelValue = (getDuel, getDuelLegend) =>
    !getDuel() ? "off" : ((getDuelLegend && getDuelLegend()) || "on");
  const RS_RELIAB = [["off", "OFF"], ["low", "LOW"], ["real", "REAL"]];
  // TYRE WEAR (js/physics/tyre-model.js). Same three-rung shape as RELIABILITY
  // and for the same reason — OFF is the shipped default, and the middle rung
  // exists so a player can have the mechanic without it deciding the race.
  const RS_TYRES = [["off", "OFF"], ["light", "LIGHT"], ["real", "REAL"]];
  const RS_LINE = [["off", "OFF"], ["corner", "CORNERS"], ["full", "FULL"]];
  // STRATEGY (js/race/pit-lane.js planFor): the player's reference plan for
  // this circuit — the planner's own choice, or a pinned stop count. The pin
  // is persisted per circuit (apex26.pitPlan.<id>) by PitLane.setPinnedStops.
  const RS_PLAN = [["auto", "AUTO"], ["0", "NO STOP"], ["1", "1 STOP"], ["2", "2 STOPS"]];

  function presetValues(id, full) {
    if (id === "quick") return {
      laps: Math.min(5, full), weather: "dry", mixed: false, time: "day",
      difficulty: "normal", grid: "tier", reliability: "off", tyres: "off",
    };
    if (id === "weekend") return {
      laps: full, weather: "dry", mixed: false, time: "default",
      difficulty: "normal", grid: "quali", reliability: "real", tyres: "real",
    };
    if (id === "endurance") return {
      laps: Math.min(25, full), weather: "overcast", mixed: true, time: "dusk",
      difficulty: "hard", grid: "tier", reliability: "real", tyres: "real",
    };
    return null;
  }

  function create(hooks) {
    const {
      $, store, GameAudio, getSoundOn, Tracks, SettingRow, DrivingLine,
      GAME_LAPS, TT_LAPS, scheduleFlybyTrack,
      isTimeTrial, isChampionship, SeasonCal, setCautionEnabled,
      getTrackIdx, getRaceLaps, setRaceLaps, getRaceWeather, setRaceWeather,
      getRaceTimeOfDay, setRaceTimeOfDay, getRaceChangeable, setRaceChangeable,
      setWxArcPlan, getDifficulty, setDifficulty,
      getRaceGrid, setRaceGrid, getRaceReliability, setRaceReliability,
      getRaceTyreWear, setRaceTyreWear, getDuel, setDuel, getDuelLegend, setDuelLegend, getPits,
      getRaceCtl, gridFromQuali, getSeason, qualiResults, openQuali, startRace, raceIntro,
      enableTilt, getSteerMode, getNetLobby, getDaily, buildSelect, els, openGarage,
    } = hooks;

    let rsReturn = "select";
    let netRoom = false;

    function setDrivingLine(v) { store.set("drivingLine", DrivingLine.setMode(v)); }

    function buildRaceSettings() {
      $("rs-go").textContent = netRoom ? "CONFIRM" : "RACE!";
      wireRaceSettings();
      const tt = isTimeTrial();
      const daily = tt && getDaily ? getDaily() : null;
      const trackIdx = getTrackIdx();
      let raceLaps = getRaceLaps();
      const full = (Tracks.LIST[trackIdx] && Tracks.LIST[trackIdx].gpLaps) || 57;
      const presets = $("rs-presets");
      if (presets) presets.hidden = tt || isChampionship() || netRoom;
      const lapOpts = tt ? [3, 4, 5, 8] : [3, 5, 10, 25].filter((n) => n < full).concat(full);
      if (!tt && !lapOpts.includes(raceLaps)) {
        raceLaps = full;
        setRaceLaps(full);
      }
      SettingRow.paint("rs-laps", raceLaps, lapOpts.map((n) => [n, !tt && n === full ? full + " (FULL)" : String(n)]));
      SettingRow.paint("rs-weather", getRaceWeather(), RS_WEATHER);
      SettingRow.disable("rs-laps", !!daily);
      SettingRow.disable("rs-weather", !!daily);
      $("rs-mixed").hidden = tt;
      SettingRow.paint("rs-mixed", getRaceChangeable() ? "mixed" : "stable", RS_CONDITIONS);
      SettingRow.paint("rs-time", getRaceTimeOfDay(), RS_TIME);
      SettingRow.disable("rs-time", !!daily);
      $("rs-diff").hidden = tt;
      SettingRow.paint("rs-diff", getDifficulty(), RS_DIFF);
      const champ = isChampionship();
      // DUEL is a one-off practice format: a 2-car race against the field's
      // quickest driver with his stats lifted. Hidden in a Time Trial (which
      // has no field at all) and in a championship, where the classification
      // feeds points and standings — a 2-car GP would score a season.
      $("rs-duel").hidden = tt || champ;
      $("rs-duel-help").hidden = tt || champ;
      paintDuel();
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
      paintPlan(tt, raceLaps);
      paintPresetState(full);
      paintFolds();
    }

    /** ONE ROW'S LIVE VALUE, read off the control rather than recomputed.
     *  Every row above already paints its own select; asking the select what it
     *  says cannot drift from what the player sees, whereas a second lookup
     *  table for the summaries would be a copy to keep in step. DUEL is the one
     *  row whose control is a button, and it keeps its value in a span. */
    function foldValue(row) {
      const sel = row.querySelector("select");
      if (sel) return sel.selectedOptions[0] ? sel.selectedOptions[0].textContent.trim() : "";
      const v = row.querySelector("#rs-duel-value");
      return v ? v.textContent.trim() : "";
    }

    /** A fold's summary carries the live choice — "FIELD · HARD · RANDOM" — the
     *  shape docs/research/PAUSE-SETTINGS-IA.md locked for the settings folds,
     *  so a closed fold still says what is inside it.
     *  AND A FOLD WITH NOTHING VISIBLE HIDES ITSELF. This is not defensive: in a
     *  time trial every row of FIELD is hidden (difficulty, grid, duel, cautions
     *  and reliability are all race-only), so without this the player gets a
     *  summary that opens onto nothing. */
    function paintFold(fold, sum, name) {
      if (!fold || !sum) return;
      const rows = Array.prototype.filter.call(fold.querySelectorAll(".set-row"), (r) => !r.hidden);
      fold.hidden = rows.length === 0;
      // THREE VALUES, not all of them. FIELD holds five rows and four of them
      // read OFF on the shipped defaults, so the whole state was "HARD · RANDOM
      // · OFF · OFF · OFF" — a summary that is mostly padding stops being read.
      // The locked examples are the same length: "FEEL · NORMAL · TILT 6",
      // "MUSIC · ON · ALL". Opening the fold is what shows the rest.
      const vals = rows.map(foldValue).filter(Boolean).slice(0, 3);
      // ONE STRING, like every other summary in the shell ("HUD · ON · STANDARD",
      // "FEEL · NORMAL"). Not a name span plus a value span: the component is
      // .adv-more-btn and it already reads and announces as one line.
      sum.textContent = name + (vals.length ? " · " + vals.join(" · ") : "");
    }

    /** Literal ids only — getElementById never takes a computed argument here
     *  (the dynamicIdReads ratchet). */
    function paintFolds() {
      paintFold($("rs-fold-field"), $("rs-fold-field-sum"), "FIELD");
      paintFold($("rs-fold-assists"), $("rs-fold-assists-sum"), "ASSISTS & WEAR");
    }

    /** The STRATEGY row and its stint bar. Hidden with TYRE WEAR (a plan is a
     *  consequence of wear existing) and in a time trial; degrades to the row
     *  alone where no complex is built yet (no zone: no plan to draw). */
    function paintPlan(tt, laps) {
      const pits = typeof getPits === "function" ? getPits() : null;
      const on = !tt && getRaceTyreWear() !== "off" && !!pits;
      $("rs-plan").hidden = !on;
      const bar = $("rs-plan-bar");
      if (!on) { bar.hidden = true; return; }
      const pin = pits.pinnedStops();
      SettingRow.paint("rs-plan", pin == null ? "auto" : String(pin), RS_PLAN);
      const plan = pits.zoneOf() ? pits.planFor(0.5, true, laps) : null;
      bar.hidden = !plan;
      if (!plan) return;
      const stints = $("rs-plan-stints");
      if (typeof stints.replaceChildren === "function") stints.replaceChildren(); else stints.innerHTML = "";
      const total = plan.stints.reduce((a, v) => a + v, 0) || 1;
      for (let i = 0; i < plan.stints.length; i++) {
        const cls = plan.seq[i], rec = TyreModel.AI_CLASS[cls] || TyreModel.AI_CLASS.medium;
        const seg = document.createElement("span");
        seg.style.flexBasis = (plan.stints[i] / total * 100).toFixed(1) + "%";
        seg.style.background = "rgb(" + rec.colour.map((v) => Math.round(Math.min(1, v) * 255)).join(",") + ")";
        seg.textContent = rec.code + " " + plan.stints[i];
        seg.title = cls + ", " + plan.stints[i] + " laps";
        stints.appendChild(seg);
      }
      const stops = plan.stops || 0;
      $("rs-plan-loss").textContent = (stops ? stops + (stops === 1 ? " STOP · BOX L" : " STOPS · BOX L") + plan.lapsAt.join(", L") : "NO STOP")
        + " · PIT LOSS ≈ " + Math.round(pits.lossS()) + " s";
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
      wire("rs-plan", () => { const p = getPits && getPits(); const v = p ? p.pinnedStops() : null; return v == null ? "auto" : String(v); },
           (v) => { const p = getPits && getPits(); if (p) p.setPinnedStops(v === "auto" ? null : +v); });
      for (const b of body.querySelectorAll ? body.querySelectorAll("[data-rs-preset]") : []) {
        b.onclick = () => {
          applyPreset(b.getAttribute("data-rs-preset"));
          after();
        };
      }
      $("rs-duel-open").onclick = openDuelPicker;
      $("duel-close").onclick = closeDuelPicker;
    }

    function paintDuel() {
      const value = duelValue(getDuel, getDuelLegend);
      const opt = duelOpts().find(([id]) => id === value);
      const label = opt ? opt[1] : "FASTEST RIVAL";
      $("rs-duel-value").textContent = label;
      $("rs-duel-open").setAttribute("aria-label", "Duel rival: " + label);
    }

    function chooseDuel(value) {
      setDuel(value !== "off");
      if (setDuelLegend) setDuelLegend(value === "off" || value === "on" ? "" : value);
      paintDuel();
      closeDuelPicker();
      if (getSoundOn()) GameAudio.uiSelect();
    }

    function buildDuelPicker() {
      const list = $("duel-list");
      if (typeof list.replaceChildren === "function") list.replaceChildren(); else list.innerHTML = "";
      const current = duelValue(getDuel, getDuelLegend);
      for (const [id, label] of duelOpts()) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "duel-option" + (id === current ? " active" : "");
        b.setAttribute("role", "option");
        b.setAttribute("aria-selected", id === current ? "true" : "false");
        const name = document.createElement("span");
        name.className = "duel-option-name";
        name.textContent = label;
        const meta = document.createElement("span");
        meta.className = "duel-option-meta";
        if (id === "off") meta.textContent = "FULL GRID";
        else if (id === "on") meta.textContent = "CURRENT FIELD · FASTEST CAR";
        else {
          const l = typeof Legends !== "undefined" && Legends.byId ? Legends.byId(id) : null;
          const titles = l && l.record ? l.record.titles : 0;
          meta.textContent = l ? [l.code, l.years, titles ? titles + "× CHAMPION" : "NO TITLES"].filter(Boolean).join(" · ") : "";
        }
        b.setAttribute("aria-label", meta.textContent ? label + " — " + meta.textContent : label);
        b.append(name, meta);
        b.onclick = () => chooseDuel(id);
        list.appendChild(b);
      }
    }

    function openDuelPicker() {
      buildDuelPicker();
      $("duel-picker").hidden = false;
      // FOCUS THE CURRENT PICK, which is what the search field used to take.
      // Fourteen options is a list you read, not one you filter, and landing on
      // the active row means the keyboard starts where the player already is.
      queueMicrotask(() => {
        const list = $("duel-list");
        const target = list.querySelector(".duel-option.active") || list.firstElementChild;
        if (target) target.focus();
      });
      if (getSoundOn()) GameAudio.uiSelect();
    }

    function closeDuelPicker() {
      $("duel-picker").hidden = true;
      const open = $("rs-duel-open");
      if (open) open.focus();
    }

    function currentPresetValues() {
      return {
        laps: getRaceLaps(), weather: getRaceWeather(), mixed: getRaceChangeable(),
        time: getRaceTimeOfDay(), difficulty: getDifficulty(), grid: getRaceGrid(),
        reliability: getRaceReliability(), tyres: getRaceTyreWear(),
      };
    }

    function paintPresetState(full) {
      const now = currentPresetValues();
      const row = $("rs-presets");
      for (const b of row && row.querySelectorAll ? row.querySelectorAll("[data-rs-preset]") : []) {
        const p = presetValues(b.getAttribute("data-rs-preset"), full);
        const on = p && Object.keys(p).every((k) => now[k] === p[k]);
        b.classList.toggle("active", !!on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      }
    }

    function applyPreset(id) {
      const track = Tracks.LIST[getTrackIdx()];
      const p = presetValues(id, (track && track.gpLaps) || 57);
      if (!p || isTimeTrial() || isChampionship() || netRoom) return false;
      setRaceLaps(p.laps);
      setRaceWeather(p.weather);
      setRaceChangeable(p.mixed);
      setWxArcPlan(null);
      setRaceTimeOfDay(p.time);
      setDifficulty(p.difficulty); store.set("difficulty", p.difficulty);
      setRaceGrid(p.grid); store.set("raceGrid", p.grid);
      setRaceReliability(p.reliability); store.set("reliability", p.reliability);
      setRaceTyreWear(p.tyres);
      scheduleFlybyTrack();
      return true;
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
        const daily = isTimeTrial() && getDaily ? getDaily() : null;
        setRaceLaps(isTimeTrial() ? TT_LAPS : SeasonCal.formatLaps(GAME_LAPS));
        setRaceWeather(daily ? daily.weather : "dry");
        setRaceTimeOfDay(daily ? daily.tod : "default");
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
        if ((typeof Input !== "undefined") && Input.primeHaptics) Input.primeHaptics();
        const season = getSeason();
        // QUALIFYING goes straight through: that path opens another SHEET, and a
        // cinematic between two menus is a wait, not an arrival. Only the route
        // that ends on a grid earns the loading screen — and it is the route that
        // pays ~1.1 s of synchronous track build, which the screen covers.
        if ((isChampionship() && SeasonCal.qualiNext(season) && !qualiResults()) ||
            (!isChampionship() && gridFromQuali() && !qualiResults())) openQuali();
        else if (raceIntro) raceIntro(startRace);
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
      applyPreset,
      get netRoom() { return netRoom; },
      get rsReturn() { return rsReturn; },
    };
  }

  /* duelOpts/duelValue are EXPORTED, not private, so the DUEL row's rules can be
   * tested without a DOM: the inert VM DOM does not build SettingRow children,
   * so painting the row asserts nothing (tests/unit/duel-row.test.mjs). */
  return { create, duelOpts, duelValue, presetValues };
})();
Object.freeze(RaceSettings);
