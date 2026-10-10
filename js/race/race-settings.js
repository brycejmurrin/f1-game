/* Apex 26 — RACE SETTINGS sheet: lap ladder, weather, grid rule, GO/cancel.
 * RaceSettings.create(G, deps) — live session state comes from the checked G
 * façade; stable modules and callbacks come through deps. netRoom changes what
 * GO means in a VS FRIEND room. */
const RaceSettings = (function () {
  "use strict";

  const RS_WEATHER = [["dry", "☀ DRY"], ["wet", "💧 WET"], ["rain", "🌧 RAIN"], ["overcast", "☁ CLOUDY"], ["fog", "🌫 FOG"]];
  const RS_CONDITIONS = [["stable", "STABLE"], ["mixed", "MIXED"]];
  const RS_TIME = [["default", "DEFAULT"], ["dawn", "DAWN"], ["day", "DAY"], ["dusk", "DUSK"], ["night", "NIGHT"]];
  const RS_DIFF = [["easy", "EASY"], ["normal", "NORMAL"], ["hard", "HARD"]];
  // AI PACE (js/physics/ai-band.js): SCRIPTED = fixed car/driver pace (default);
  // CATCH-UP = legacy gap-to-player rubber band. Opt-in so fair racing ships.
  const RS_AIPACE = [["scripted", "SCRIPTED"], ["catchup", "CATCH-UP"]];
  const RS_ONOFF = [["off", "OFF"], ["on", "ON"]];

  /** Inject AI PACE after DIFFICULTY — keeps shellNodes flat (same idea as
   *  SettingsExport.careerRow). Idempotent. */
  function ensureAiPaceRow($) {
    if ($("rs-aipace")) return;
    const diff = $("rs-diff");
    if (!diff || !diff.parentNode) return;
    const row = document.createElement("div");
    row.id = "rs-aipace";
    row.className = "set-row";
    row.setAttribute("role", "group");
    row.setAttribute("aria-labelledby", "rs-aipace-label");
    row.innerHTML =
      '<span class="tune-label" id="rs-aipace-label">AI PACE</span>' +
      "<div>" +
      '<button id="rs-aipace-prev" type="button" data-step="-1" aria-label="Previous AI pace mode">&lsaquo;</button>' +
      '<select id="rs-aipace-sel" aria-labelledby="rs-aipace-label" aria-describedby="rs-aipace-help"></select>' +
      '<button id="rs-aipace-next" type="button" data-step="1" aria-label="Next AI pace mode">&rsaquo;</button>' +
      "</div>" +
      '<p id="rs-aipace-help" class="adv-help">SCRIPTED keeps each rival on a fixed target pace from car and driver ratings. CATCH-UP is the old rubber band: cars behind you speed up toward your gap.</p>';
    diff.parentNode.insertBefore(row, diff.nextSibling);
  }
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
  const RS_DIRTY = [["off", "OFF"], ["classic", "CLASSIC"], ["cfd", "CFD"]];
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

  /** Which named preset (if any) matches the live sheet values — null is CUSTOM. */
  function matchPreset(now, full) {
    if (!now || full == null) return null;
    for (const id of ["quick", "weekend", "endurance"]) {
      const p = presetValues(id, full);
      if (p && Object.keys(p).every((k) => now[k] === p[k])) return id;
    }
    return null;
  }

  /** Sheet H2 chrome for the race-settings dialog. FULL WEEKEND keeps
   *  START QUALIFYING on the CTA; the header must say the weekend is first. */
  function sheetTitle(opts) {
    const o = opts || {};
    if (o.netRoom) return "RACE SETTINGS";
    if (o.practice) return "PRACTICE SETTINGS";
    if (o.timeTrial) return "TIME TRIAL SETTINGS";
    if (o.matched === "weekend" && o.qualifies) return "WEEKEND · QUALIFYING FIRST";
    return "RACE SETTINGS";
  }

  /* REMEMBER LAST RACE SETUP (apex26.raceDraft). A solo one-off Grand Prix
   * remembers what it last STARTED with — laps as a ladder rung or "FULL",
   * weather, time of day, MIXED — so the next circuit opens on the same race
   * instead of 3 laps / dry / default. Pure halves, exported for the tests. The
   * laps are stored as a rung, not a number: FULL is 44 at Spa and 79 at Monaco,
   * so "the full race" is what carries between circuits, not its count. */
  const DRAFT_LAPS = ["3", "5", "10", "25"];
  function draftOf(laps, full, weather, tod, mixed) {
    const n = +laps;
    const out = { weather: String(weather), tod: String(tod), mixed: !!mixed };
    if (n >= full) out.laps = "FULL";
    else if (DRAFT_LAPS.includes(String(n))) out.laps = String(n);
    return out;
  }
  /** A stored draft read back for a circuit whose FULL is `full`: null when
   *  there is nothing usable; a field the sheet does not offer is left out. */
  function draftFor(d, full) {
    if (!d || typeof d !== "object" || Array.isArray(d)) return null;
    const out = {};
    if (d.laps === "FULL") out.laps = full;
    else if (DRAFT_LAPS.includes(d.laps)) out.laps = +d.laps < full ? +d.laps : full;
    if (RS_WEATHER.some(([id]) => id === d.weather)) out.weather = d.weather;
    if (RS_TIME.some(([id]) => id === d.tod)) out.tod = d.tod;
    if (typeof d.mixed === "boolean") out.mixed = d.mixed;
    return Object.keys(out).length ? out : null;
  }

  function create(G, deps) {
    const {
      $, store, GAME_LAPS, TT_LAPS, scheduleFlybyTrack, setCautionEnabled,
      startRace, buildSelect, els, openGarage,
    } = G;
    const {
      GameAudio, Tracks, SettingRow, DrivingLine, SeasonCal,
      qualiResults, openQuali, enableTilt, getSteerMode, buildStandings, raceIntro,
    } = deps;
    const isTimeTrial = () => G.session === "tt";
    const isChampionship = () => G.flow === "season" || G.flow === "career";
    const gridFromQuali = () => (isChampionship() ? SeasonCal.quali() : (G.raceQuali && !isTimeTrial()));
    // The one flow whose setup is remembered: a solo one-off GP. Time trial
    // (and the Daily inside it), championship rounds and a VS FRIEND room all
    // stage laps/weather/time of their own, and a REAL RACE never reaches here.
    const soloGp = () => G.flow === "gp" && !isTimeTrial() && !isChampionship() && !netRoom;
    const fullLaps = () => (Tracks.LIST[G.trackIdx] && Tracks.LIST[G.trackIdx].gpLaps) || 57;

    let rsReturn = "select";
    let draftKey = "";
    let netRoom = false;

    function setDrivingLine(v) { store.set("drivingLine", DrivingLine.setMode(v)); }

    function buildRaceSettings() {
      ensureAiPaceRow($);
      const qualifies = !isTimeTrial() && !qualiResults() &&
        (isChampionship() ? SeasonCal.qualiNext(G.season) : gridFromQuali());
      const qName = isChampionship() && SeasonCal.qualiLabel ? SeasonCal.qualiLabel(G.season) : "QUALIFYING";
      const practice = typeof UiExperience !== "undefined" && UiExperience.isPracticePick && UiExperience.isPracticePick();
      wireRaceSettings();
      const tt = isTimeTrial();
      const daily = tt && G.daily ? G.daily.current() : null;
      const trackIdx = G.trackIdx;
      let raceLaps = G.raceLaps;
      const full = (Tracks.LIST[trackIdx] && Tracks.LIST[trackIdx].gpLaps) || 57;
      const presets = $("rs-presets");
      if (presets) presets.hidden = tt || isChampionship() || netRoom;
      $("rs-go").textContent = netRoom ? "CONFIRM FOR LOBBY"
        : qualifies ? "START " + qName
        : practice ? "START PRACTICE"
        : isTimeTrial() ? "START TIME TRIAL"
        : "START RACE";
      const lapOpts = tt ? [3, 4, 5, 8] : [3, 5, 10, 25].filter((n) => n < full).concat(full);
      // Off the ladder snaps to FULL (a room host's FULL stays FULL on the next
      // circuit) — EXCEPT a championship's format distance, which is clamped,
      // never raised: SEASON SETUP's 57 LAPS became FULL (79 at Monaco) on
      // every circuit shorter than ~5.35 km. That value keeps its own chip.
      if (!tt && !lapOpts.includes(raceLaps)) {
        if (isChampionship() && raceLaps > 0 && raceLaps < full) { lapOpts.push(raceLaps); lapOpts.sort((a, b) => a - b); }
        else { raceLaps = full; G.raceLaps = full; }
      }
      SettingRow.paint("rs-laps", raceLaps, lapOpts.map((n) => [n, !tt && n === full ? full + " (FULL)" : String(n)]));
      SettingRow.paint("rs-weather", G.raceWeather, RS_WEATHER);
      SettingRow.disable("rs-laps", !!daily);
      SettingRow.disable("rs-weather", !!daily);
      $("rs-mixed").hidden = tt;
      SettingRow.paint("rs-mixed", G.raceChangeable ? "mixed" : "stable", RS_CONDITIONS);
      SettingRow.paint("rs-time", G.raceTimeOfDay, RS_TIME);
      SettingRow.disable("rs-time", !!daily);
      $("rs-diff").hidden = tt;
      SettingRow.paint("rs-diff", G.difficulty, RS_DIFF);
      if ($("rs-aipace")) {
        $("rs-aipace").hidden = tt;
        SettingRow.paint("rs-aipace", G.aiPace || "scripted", RS_AIPACE);
      }
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
        : champ ? [["champ", "STANDINGS"], ["tier", "PACE ORDER"], ["revchamp", "REVERSED"], ["random", "RANDOM"]]
        : [["tier", "PACE ORDER"], ["quali", "QUALIFYING"], ["rev10", "REVERSE 10"], ["random", "RANDOM"]];
      // A championship keeps its own rule (G.champGrid, default STANDINGS: FIA 2026
      // SR B2.5.4(a)); the one-off's choice is left alone.
      const raceGrid = champ ? G.champGrid : G.raceGrid;
      const cur = qForced ? "quali" : rules.some(([r]) => r === raceGrid) ? raceGrid : rules[0][0];
      SettingRow.paint("rs-quali", cur, rules);
      SettingRow.disable("rs-quali", !!qForced);
      $("rs-caution").hidden = tt;
      SettingRow.paint("rs-caution", G.cautionInfo().enabled ? "on" : "off", RS_ONOFF);
      $("rs-reliab").hidden = tt;
      SettingRow.paint("rs-reliab", G.raceReliability, RS_RELIAB);
      // Hidden in a time trial for the same reason the model forces it off
      // there: a lap against the clock is not a set anybody is asked to manage.
      $("rs-tyres").hidden = tt;
      SettingRow.paint("rs-tyres", G.raceTyreWear, RS_TYRES);
      $("rs-dirty").hidden = tt;
      SettingRow.paint("rs-dirty", G.raceDirtyAir, RS_DIRTY);
      SettingRow.paint("rs-line", DrivingLine.mode(), RS_LINE);
      paintPlan(tt, raceLaps);
      const matched = paintPresetState(full);
      paintFolds();
      // Title after preset match: FULL WEEKEND + START QUALIFYING → header
      // names the weekend (CTA already says START QUALIFYING above).
      const rsTitle = $("dlg-racesettings");
      if (rsTitle) {
        rsTitle.textContent = sheetTitle({
          netRoom, practice, timeTrial: tt, matched, qualifies,
        });
      }
      const summary = $("rs-summary");
      if (summary) {
        const track = Tracks.LIST[trackIdx];
        const team = typeof Teams !== "undefined" && Teams.LIST[G.teamIdx];
        summary.textContent = [track && track.name, team && team.name,
          G.raceLaps + " LAPS", String(G.raceWeather).toUpperCase()].filter(Boolean).join(" · ");
      }
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
      const priority = name === "FIELD" ? ["rs-quali", "rs-diff", "rs-aipace", "rs-duel"]
        : ["rs-tyres", "rs-line", "rs-plan"];
      const vals = priority.map((id) => rows.find((r) => r.id === id))
        .filter(Boolean).map((r) => {
          const label = r.querySelector(".tune-label");
          return (label ? label.textContent.trim() + ": " : "") + foldValue(r);
        }).filter(Boolean).slice(0, 2);
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
      const pits = G.pits;
      // Store AND live model must agree wear is on. The store alone used to
      // show STRATEGY while TyreModel still sat at create()'s initial "off"
      // (planLaps → whole-race life → "NO STOP").
      const on = !tt && G.raceTyreWear !== "off" && !!(G.tyres && G.tyres.on()) && !!pits;
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
        + (pin === 0 && stops ? " · 2 DRY COMPOUNDS" : "")   // NO STOP pinned, the rule raised it (AiDrive.stintPlan)
        + " · PIT LOSS ≈ " + Math.round(pits.lossS()) + " s";
    }

    function wireRaceSettings() {
      const body = $("rs-body");
      if (body.dataset.wired) return;
      body.dataset.wired = "1";
      const after = () => { buildRaceSettings(); if (G.soundOn) GameAudio.uiTick(); };
      const wire = (id, read, write, extra) => SettingRow.wire(id, Object.assign({ read, write: (v) => { write(v); after(); } }, extra));
      wire("rs-laps", () => G.raceLaps, (v) => { G.raceLaps = +v; }, { wrap: false });
      wire("rs-weather", () => G.raceWeather, (v) => { G.raceWeather = v; scheduleFlybyTrack(); });
      wire("rs-mixed", () => (G.raceChangeable ? "mixed" : "stable"), (v) => {
        G.raceChangeable = v === "mixed";
        G.wxArcPlan = null;
      });
      wire("rs-time", () => G.raceTimeOfDay, (v) => { G.raceTimeOfDay = v; scheduleFlybyTrack(); });
      wire("rs-diff", () => G.difficulty, (v) => { G.difficulty = v; store.set("difficulty", v); });
      if ($("rs-aipace")) {
        wire("rs-aipace", () => G.aiPace || "scripted", (v) => { G.aiPace = v; });
      }
      wire("rs-quali", () => (isChampionship() ? G.champGrid : G.raceGrid), (v) => {
        if (isChampionship()) { G.champGrid = v; store.set("champGrid", v); } else { G.raceGrid = v; store.set("raceGrid", v); }
      });
      wire("rs-caution", () => (G.cautionInfo().enabled ? "on" : "off"), (v) => setCautionEnabled(v === "on"));
      wire("rs-reliab", () => G.raceReliability, (v) => { G.raceReliability = v; store.set("reliability", v); });
      wire("rs-tyres", () => G.raceTyreWear, (v) => { G.raceTyreWear = v; });
      wire("rs-dirty", () => G.raceDirtyAir, (v) => { G.raceDirtyAir = v; });
      wire("rs-line", () => DrivingLine.mode(), setDrivingLine);
      wire("rs-plan", () => { const p = G.pits; const v = p ? p.pinnedStops() : null; return v == null ? "auto" : String(v); },
           (v) => { const p = G.pits; if (p) p.setPinnedStops(v === "auto" ? null : +v); });
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
      const value = duelValue(() => G.duel, () => G.duelLegend);
      const opt = duelOpts().find(([id]) => id === value);
      const label = opt ? opt[1] : "FASTEST RIVAL";
      $("rs-duel-value").textContent = label;
      $("rs-duel-open").setAttribute("aria-label", "Duel rival: " + label);
    }

    function chooseDuel(value) {
      G.duel = value !== "off";
      G.duelLegend = value === "off" || value === "on" ? "" : value;
      paintDuel();
      closeDuelPicker();
      if (G.soundOn) GameAudio.uiSelect();
    }

    function buildDuelPicker() {
      const list = $("duel-list");
      if (typeof list.replaceChildren === "function") list.replaceChildren(); else list.innerHTML = "";
      const current = duelValue(() => G.duel, () => G.duelLegend);
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
      // FOCUS THE CURRENT PICK, not a search field. Fourteen options is a list you read, not one you filter, and landing on
      // the active row means the keyboard starts where the player already is.
      queueMicrotask(() => {
        const list = $("duel-list");
        const target = list.querySelector(".duel-option.active") || list.firstElementChild;
        if (target) target.focus();
      });
      if (G.soundOn) GameAudio.uiSelect();
    }

    function closeDuelPicker() {
      $("duel-picker").hidden = true;
      const open = $("rs-duel-open");
      if (open) open.focus();
    }

    function currentPresetValues() {
      return {
        laps: G.raceLaps, weather: G.raceWeather, mixed: G.raceChangeable,
        time: G.raceTimeOfDay, difficulty: G.difficulty, grid: G.raceGrid,
        reliability: G.raceReliability, tyres: G.raceTyreWear,
      };
    }

    /** Display-only CUSTOM chip on the preset row — lights when no named
     *  preset matches (e.g. the default 3-lap draft). No data-rs-preset, so
     *  the applyPreset click loop never treats it as a writable preset. */
    function ensureCustomPreset(row) {
      let b = row.querySelector ? row.querySelector("#rs-preset-custom") : null;
      if (b) return b;
      b = document.createElement("button");
      b.id = "rs-preset-custom";
      b.type = "button";
      b.className = "preset-btn";
      b.setAttribute("aria-disabled", "true");
      b.tabIndex = -1;
      b.textContent = "CUSTOM";
      // The hint says how to get here: the chip is display-only, so "your own
      // mix" on a button-shaped tile read as a preset to tap that did nothing
      // (Pages recheck 2026-10-08). It lights by itself once any row below
      // stops matching QUICK / WEEKEND / ENDURANCE.
      b.title = "Lights on its own when your settings match no preset";
      const cap = document.createElement("small");
      cap.textContent = "change any setting";
      b.appendChild(cap);
      row.appendChild(b);
      return b;
    }

    function paintPresetState(full) {
      const now = currentPresetValues();
      const row = $("rs-presets");
      if (!row) return null;
      const matched = matchPreset(now, full);
      for (const b of row.querySelectorAll ? row.querySelectorAll("[data-rs-preset]") : []) {
        const id = b.getAttribute("data-rs-preset");
        const on = matched === id;
        b.classList.toggle("active", !!on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      }
      // CUSTOM fills the empty highlight: 3 laps / mixed weather / any draft
      // that is not exactly quick, weekend or endurance.
      if (!row.hidden) {
        const custom = ensureCustomPreset(row);
        const on = !matched;
        custom.classList.toggle("active", on);
        custom.setAttribute("aria-pressed", on ? "true" : "false");
        row.setAttribute("data-rs-match", matched || "custom");
      }
      return matched;
    }

    function applyPreset(id) {
      const track = Tracks.LIST[G.trackIdx];
      const p = presetValues(id, (track && track.gpLaps) || 57);
      if (!p || isTimeTrial() || isChampionship() || netRoom) return false;
      G.raceLaps = p.laps;
      G.raceWeather = p.weather;
      G.raceChangeable = p.mixed;
      G.wxArcPlan = null;
      G.raceTimeOfDay = p.time;
      G.difficulty = p.difficulty; store.set("difficulty", p.difficulty);
      G.raceGrid = p.grid; store.set("raceGrid", p.grid);
      G.raceReliability = p.reliability; store.set("reliability", p.reliability);
      G.raceTyreWear = p.tyres;
      scheduleFlybyTrack();
      return true;
    }

    // Another writer staged laps/weather/time of day (a room's host, the Daily):
    // the next open re-stages rather than keep them as this track's draft.
    function resetDraft() { draftKey = ""; }
    function setNetRoom(on) { if (netRoom !== !!on) resetDraft(); netRoom = !!on; }

    function openRaceSetup() {
      $("vsfriend").hidden = true;
      buildSelect();
      els.select.hidden = false;
      if (G.soundOn) GameAudio.uiSelect();
    }

    function openRaceSettings(from) {
      rsReturn = from || "select";
      if (!netRoom) {
        const daily = isTimeTrial() && G.daily ? G.daily.current() : null;
        const key = [G.flow, G.session, G.trackIdx, daily && daily.day,
          G.season && G.season.round].join(":");
        if (key !== draftKey) {
          draftKey = key;
          G.raceLaps = isTimeTrial() ? TT_LAPS : SeasonCal.formatLaps(GAME_LAPS);
          G.raceWeather = daily ? daily.weather : "dry";
          G.raceTimeOfDay = daily ? daily.tod : "default";
          const d = soloGp() ? draftFor(store.get("raceDraft", null), fullLaps()) : null;
          if (d) {
            if (d.laps != null) G.raceLaps = d.laps;
            if (d.weather) G.raceWeather = d.weather;
            if (d.tod) G.raceTimeOfDay = d.tod;
            if (d.mixed != null) { G.raceChangeable = d.mixed; G.wxArcPlan = null; }
          }
        }
      }
      buildRaceSettings();
      $(rsReturn).hidden = true;
      $("race-settings").hidden = false;
      scheduleFlybyTrack();
    }

    function wireButtons() {
      els.selGo.onclick = () => {
        if (G.soundOn) GameAudio.uiSelect();
        if (els.selGo.dataset.seasonComplete === "1") {
          buildStandings();
          $("standings").hidden = false;
          return;
        }
        openRaceSettings("select");
      };
      $("sel-car").onclick = () => openGarage("select");
      $("rs-cancel").onclick = () => {
        $("race-settings").hidden = true;
        // Rebuilt, not just revealed: reached from results -> NEXT ROUND ->
        // qualifying -> BACK, the picker still titled the previous round.
        if (rsReturn === "select") buildSelect();
        $(rsReturn).hidden = false;
      };
      $("rs-go").onclick = () => {
        if (G.soundOn) GameAudio.uiSelect();
        // Every route closes the sheet now except the race intro's, which is handed
        // it: the sheet stays up while the renderer finishes a shader warm.
        const sheet = $("race-settings");
        const netLobby = G.netLobby;
        // Sync-dismiss :modal. TopModal's MutationObserver close is a later task;
        // without this, #loading stays under the dialog for the whole long task.
        const dismissSheet = () => {
          if (!sheet) return;
          sheet.hidden = true;
          try { if (sheet.open && typeof sheet.close === "function") sheet.close(); } catch (_) { /* already closed */ }
        };
        if (netRoom) {
          dismissSheet();
          $("vsfriend").hidden = false;
          netLobby.roomChanged("race");
          return;
        }
        if (soloGp()) store.set("raceDraft", draftOf(G.raceLaps, fullLaps(), G.raceWeather, G.raceTimeOfDay, G.raceChangeable));
        if (getSteerMode() === "tilt") enableTilt();
        // Same gesture, same reason: Chromium needs user activation before
        // navigator.vibrate will fire and no longer accepts touchstart as one,
        // so arm it from this click or the first in-race brake cue is dropped.
        if ((typeof Input !== "undefined") && Input.primeHaptics) Input.primeHaptics();
        const season = G.season;
        // QUALIFYING goes straight through: that path opens another SHEET, and a
        // cinematic between two menus is a wait, not an arrival. Only the route
        // that ends on a grid earns the loading screen — and it is the route that
        // pays ~1.1 s of synchronous track build, which the screen covers.
        if ((isChampionship() && SeasonCal.qualiNext(season) && !qualiResults()) ||
            (!isChampionship() && gridFromQuali() && !qualiResults())) { dismissSheet(); openQuali(); }
        else if (raceIntro) {
          // As every other raceIntro caller does: it hides the title first, so a throw here left no screen at all.
          try { raceIntro(startRace, sheet, $("rs-go")); } catch (e) { Log.warn("game", "pre-race screen failed — starting straight away", e); dismissSheet(); startRace(); }
        }
        else { dismissSheet(); startRace(); }
      };
    }

    return {
      buildRaceSettings,
      wireRaceSettings,
      openRaceSettings,
      openRaceSetup,
      setNetRoom,
      resetDraft,
      wireButtons,
      applyPreset,
      get netRoom() { return netRoom; },
      get rsReturn() { return rsReturn; },
    };
  }

  /* duelOpts/duelValue are EXPORTED, not private, so the DUEL row's rules can be
   * tested without a DOM: the inert VM DOM does not build SettingRow children,
   * so painting the row asserts nothing (tests/unit/duel-row.test.mjs). */
  return { create, duelOpts, duelValue, presetValues, matchPreset, sheetTitle, draftOf, draftFor };
})();
Object.freeze(RaceSettings);
