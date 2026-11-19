const RaceSettings = (function () {
  "use strict";

  const RS_WEATHER = [["dry", "☀ DRY"], ["wet", "💧 WET"], ["rain", "🌧 RAIN"], ["storm", "⛈ STORM"], ["overcast", "☁ CLOUDY"], ["fog", "🌫 FOG"]];
  const weatherOpts = () => RS_WEATHER;
  const RS_CONDITIONS = [["stable", "STABLE"], ["mixed", "MIXED"]];
  const RS_TIME = [["default", "DEFAULT"], ["dawn", "DAWN"], ["day", "DAY"], ["dusk", "DUSK"], ["night", "NIGHT"]];
  const RS_DIFF = [["easy", "EASY"], ["normal", "NORMAL"], ["hard", "HARD"]];
  const RS_AIPACE = [["scripted", "SCRIPTED"], ["catchup", "CATCH-UP"]];
  const RS_ONOFF = [["off", "OFF"], ["on", "ON"]];

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
  const RS_ERS = [["manual", "MANUAL"], ["deploy", "DEPLOY"], ["save", "SAVE"]];
  const ersRows = [];
  function ensureErsRows($) {
    if (ersRows.length || typeof EnergyPlan === "undefined") return;
    let after = $("rs-tyres");
    if (!after || !after.parentNode) return;
    for (let i = 1; i <= 3; i++) {
      const id = "rs-ers" + i, row = document.createElement("div");
      row.id = id;
      row.className = "set-row";
      row.setAttribute("role", "group");
      row.setAttribute("aria-labelledby", id + "-label");
      row.innerHTML = '<span class="tune-label"></span><div><button type="button" data-step="-1">&lsaquo;</button>' +
        '<select></select><button type="button" data-step="1">&rsaquo;</button></div>';
      const label = row.querySelector("span"), [prev, next] = row.querySelectorAll("button"), sel = row.querySelector("select");
      label.id = id + "-label"; label.textContent = "ERS SECTOR " + i;
      prev.id = id + "-prev"; prev.setAttribute("aria-label", "Previous sector " + i + " ERS policy");
      next.id = id + "-next"; next.setAttribute("aria-label", "Next sector " + i + " ERS policy");
      sel.id = id + "-sel"; sel.setAttribute("aria-labelledby", id + "-label");
      if (i === 3) {
        const help = document.createElement("p");
        help.id = "rs-ers-help"; help.className = "adv-help";
        help.textContent = "At each sector start, DEPLOY switches BOOST on and SAVE switches it off so the battery harvests. MANUAL leaves BOOST to you. You can still press BOOST to override.";
        sel.setAttribute("aria-describedby", help.id);
        row.append(help);
      }
      after.parentNode.insertBefore(row, after.nextSibling);
      after = row;
      ersRows.push(row);
    }
  }
  function ensureDamageRow($) {
    if ($("rs-damage") || typeof DamageHandling === "undefined") return;
    const reliab = $("rs-reliab");
    if (!reliab || !reliab.parentNode) return;
    const row = document.createElement("div");
    row.id = "rs-damage";
    row.className = "set-row";
    row.setAttribute("role", "group");
    row.setAttribute("aria-labelledby", "rs-damage-label");
    row.innerHTML =
      '<span class="tune-label" id="rs-damage-label">DAMAGE</span>' +
      "<div>" +
      '<button id="rs-damage-prev" type="button" data-step="-1" aria-label="Previous damage mode">&lsaquo;</button>' +
      '<select id="rs-damage-sel" aria-labelledby="rs-damage-label" aria-describedby="rs-damage-help"></select>' +
      '<button id="rs-damage-next" type="button" data-step="1" aria-label="Next damage mode">&rsaquo;</button>' +
      "</div>" +
      '<p id="rs-damage-help" class="adv-help">DISPLAY shows damage on the HUD only. HANDLING: a broken wing or floor costs your car grip in fast corners, until a pit stop repairs it.</p>';
    reliab.parentNode.insertBefore(row, reliab.nextSibling);
  }
  function ensureWindRow($) {
    if ($("rs-wind")) return;
    const dirty = $("rs-dirty");
    if (!dirty || !dirty.parentNode) return;
    const row = document.createElement("div");
    row.id = "rs-wind";
    row.className = "set-row";
    row.setAttribute("role", "group");
    row.setAttribute("aria-labelledby", "rs-wind-label");
    row.innerHTML =
      '<span class="tune-label" id="rs-wind-label">WIND</span>' +
      "<div>" +
      '<button id="rs-wind-prev" type="button" data-step="-1" aria-label="Previous wind">&lsaquo;</button>' +
      '<select id="rs-wind-sel" aria-labelledby="rs-wind-label" aria-describedby="rs-wind-help"></select>' +
      '<button id="rs-wind-next" type="button" data-step="1" aria-label="Next wind">&rsaquo;</button>' +
      "</div>" +
      '<p id="rs-wind-help" class="adv-help">Head and tail wind move top speed by a few km/h and gusts nudge the car sideways. OFF is still air.</p>';
    dirty.parentNode.insertBefore(row, dirty.nextSibling);
  }
  const RS_WIND = [["off", "OFF"], ["real", "REAL"]];
  const hasWind = () => typeof Wind !== "undefined";
  const DUEL_BASE = [["off", "OFF"], ["on", "FASTEST RIVAL"]];
  function duelOpts() {
    if (typeof Legends === "undefined" || !Legends.LIST) return DUEL_BASE.slice();
    return DUEL_BASE.concat(Legends.LIST.map((l) => [l.id, l.name.toUpperCase()]));
  }
  const duelValue = (getDuel, getDuelLegend) =>
    !getDuel() ? "off" : ((getDuelLegend && getDuelLegend()) || "on");
  const RS_RELIAB = [["off", "OFF"], ["low", "LOW"], ["real", "REAL"]];
  const RS_DAMAGE = [["off", "DISPLAY"], ["on", "HANDLING"]];
  const RS_TYRES = [["off", "OFF"], ["light", "LIGHT"], ["real", "REAL"]];
  const RS_DIRTY = [["off", "OFF"], ["classic", "CLASSIC"], ["cfd", "CFD"]];
  const RS_LINE = [["off", "OFF"], ["corner", "CORNERS"], ["full", "FULL"]];
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

  function matchPreset(now, full) {
    if (!now || full == null) return null;
    for (const id of ["quick", "weekend", "endurance"]) {
      const p = presetValues(id, full);
      if (p && Object.keys(p).every((k) => now[k] === p[k])) return id;
    }
    return null;
  }

  function sheetTitle(opts) {
    const o = opts || {};
    if (o.netRoom) return "RACE SETTINGS";
    if (o.practice) return "PRACTICE SETTINGS";
    if (o.timeTrial) return "TIME TRIAL SETTINGS";
    if (o.matched === "weekend" && o.qualifies) return "WEEKEND · QUALIFYING FIRST";
    return "RACE SETTINGS";
  }

  const DRAFT_LAPS = ["3", "5", "10", "25"];
  function draftOf(laps, full, weather, tod, mixed) {
    const n = +laps;
    const out = { weather: String(weather), tod: String(tod), mixed: !!mixed };
    if (n >= full) out.laps = "FULL";
    else if (DRAFT_LAPS.includes(String(n))) out.laps = String(n);
    return out;
  }
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
      $, store, GAME_LAPS, TT_LAPS, scheduleFlybyTrack: flybyTrack, setCautionEnabled,
      startRace, buildSelect, els, openGarage,
    } = G;
    const scheduleFlybyTrack = (settle) => {
      flybyTrack(settle);
      const pre = typeof GaragePrebuild !== "undefined" && GaragePrebuild.instance ? GaragePrebuild.instance() : null;
      if (pre && pre.prewarmExterior) pre.prewarmExterior();
    };
    const {
      GameAudio, Tracks, SettingRow, DrivingLine, SeasonCal,
      qualiResults, openQuali, enableTilt, getSteerMode, buildStandings, raceIntro, previewWxPlan,
    } = deps;
    if (typeof EnergyPlan !== "undefined") EnergyPlan.fromStore(store);
    if (typeof DamageHandling !== "undefined") DamageHandling.fromStore(store);
    const isTimeTrial = () => G.session === "tt";
    const isChampionship = () => G.flow === "season" || G.flow === "career";
    const gridFromQuali = () => (isChampionship() ? SeasonCal.quali() : (G.raceQuali && !isTimeTrial()));
    const soloGp = () => G.flow === "gp" && !isTimeTrial() && !isChampionship() && !netRoom;
    const fullLaps = () => (Tracks.LIST[G.trackIdx] && Tracks.LIST[G.trackIdx].gpLaps) || 57;

    let rsReturn = "select";
    let searchReturn = null;
    let draftKey = "";
    let netRoom = false;

    function setDrivingLine(v) { store.set("drivingLine", DrivingLine.setMode(v)); }

    function buildRaceSettings() {
      ensureAiPaceRow($);
      ensureWindRow($);
      ensureErsRows($);
      ensureDamageRow($);
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
      if (!tt && !lapOpts.includes(raceLaps)) {
        if (searchReturn || (isChampionship() && raceLaps > 0 && raceLaps < full)) { lapOpts.push(raceLaps); lapOpts.sort((a, b) => a - b); }
        else { raceLaps = full; G.raceLaps = full; }
      }
      SettingRow.paint("rs-laps", raceLaps, lapOpts.map((n) => [n, !tt && n === full ? full + " (FULL)" : String(n)]));
      SettingRow.paint("rs-weather", G.raceWeather, weatherOpts());
      SettingRow.disable("rs-laps", !!daily);
      SettingRow.disable("rs-weather", !!daily);
      $("rs-mixed").hidden = tt;
      SettingRow.paint("rs-mixed", G.raceChangeable ? "mixed" : "stable", RS_CONDITIONS);
      paintForecast(tt);
      SettingRow.paint("rs-time", G.raceTimeOfDay, RS_TIME);
      SettingRow.disable("rs-time", !!daily);
      $("rs-diff").hidden = tt;
      SettingRow.paint("rs-diff", G.difficulty, RS_DIFF);
      if ($("rs-aipace")) {
        $("rs-aipace").hidden = tt;
        SettingRow.paint("rs-aipace", G.aiPace || "scripted", RS_AIPACE);
      }
      const champ = isChampionship();
      $("rs-duel").hidden = tt || champ;
      $("rs-duel-help").hidden = tt || champ;
      paintDuel();
      $("rs-quali").hidden = tt;
      const qForced = champ ? SeasonCal.quali() : null;
      const rules = qForced ? [["quali", "QUALIFYING"]]
        : champ ? [["champ", "STANDINGS"], ["tier", "PACE ORDER"], ["revchamp", "REVERSED"], ["random", "RANDOM"]]
        : [["tier", "PACE ORDER"], ["quali", "QUALIFYING"], ["rev10", "REVERSE 10"], ["random", "RANDOM"]];
      const raceGrid = champ ? G.champGrid : G.raceGrid;
      const cur = qForced ? "quali" : rules.some(([r]) => r === raceGrid) ? raceGrid : rules[0][0];
      SettingRow.paint("rs-quali", cur, rules);
      SettingRow.disable("rs-quali", !!qForced);
      $("rs-caution").hidden = tt;
      SettingRow.paint("rs-caution", G.cautionInfo().enabled ? "on" : "off", RS_ONOFF);
      $("rs-reliab").hidden = tt;
      SettingRow.paint("rs-reliab", G.raceReliability, RS_RELIAB);
      if (typeof DamageHandling !== "undefined" && $("rs-damage")) { $("rs-damage").hidden = tt; SettingRow.paint("rs-damage", DamageHandling.isEnabled() ? "on" : "off", RS_DAMAGE); }
      $("rs-tyres").hidden = tt;
      SettingRow.paint("rs-tyres", G.raceTyreWear, RS_TYRES);
      ersRows.forEach((row, i) => { row.hidden = tt; SettingRow.paint(row.id, EnergyPlan.plan()[i], RS_ERS); });
      $("rs-dirty").hidden = tt;
      SettingRow.paint("rs-dirty", G.raceDirtyAir, RS_DIRTY);
      if ($("rs-wind")) { $("rs-wind").hidden = !hasWind(); if (hasWind()) SettingRow.paint("rs-wind", Wind.level(), RS_WIND); }
      SettingRow.paint("rs-line", DrivingLine.mode(), RS_LINE);
      paintPlan(tt, raceLaps);
      const matched = paintPresetState(full);
      paintFolds();
      paintHelpDisclosures();
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

    function foldValue(row) {
      const sel = row.querySelector("select");
      if (sel) return sel.selectedOptions[0] ? sel.selectedOptions[0].textContent.trim() : "";
      const v = row.querySelector("#rs-duel-value");
      return v ? v.textContent.trim() : "";
    }

    function paintFold(fold, sum, name) {
      if (!fold || !sum) return;
      const rows = Array.prototype.filter.call(fold.querySelectorAll(".set-row"), (r) => !r.hidden);
      fold.hidden = rows.length === 0;
      const priority = name === "FIELD" ? ["rs-quali", "rs-diff", "rs-aipace", "rs-duel"]
        : ["rs-tyres", "rs-line", "rs-plan"];
      const vals = priority.map((id) => rows.find((r) => r.id === id))
        .filter(Boolean).map((r) => {
          const label = r.querySelector(".tune-label");
          return (label ? label.textContent.trim() + ": " : "") + foldValue(r);
        }).filter(Boolean).slice(0, 2);
      sum.textContent = name + (vals.length ? " · " + vals.join(" · ") : "");
    }

    function paintFolds() {
      paintFold($("rs-fold-field"), $("rs-fold-field-sum"), "FIELD");
      paintFold($("rs-fold-assists"), $("rs-fold-assists-sum"), "ASSISTS & WEAR");
    }

    function planTrackId() { const t = Tracks.LIST[G.trackIdx]; return t ? t.id : null; }
    function paintPlan(tt, laps) {
      const pits = G.pits;
      const on = !tt && G.raceTyreWear !== "off" && !!(G.tyres && G.tyres.on()) && !!pits;
      $("rs-plan").hidden = !on;
      const bar = $("rs-plan-bar");
      if (!on) { bar.hidden = true; return; }
      const id = planTrackId(), pin = pits.pinnedStops(id);
      SettingRow.paint("rs-plan", pin == null ? "auto" : String(pin), RS_PLAN);
      const built = !!(G.track && G.track.def && G.track.def.id === id);
      const plan = built && pits.zoneOf() ? pits.planFor(0.5, true, laps) : null;
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
        + (pin === 0 && stops ? " · 2 DRY COMPOUNDS" : "")
        + " · PIT LOSS ≈ " + Math.round(pits.lossS()) + " s";
    }

    function paintForecast(tt) {
      let el = $("rs-forecast");
      if (!el) {
        const host = $("rs-mixed");
        if (!host || !host.parentNode) return;
        el = document.createElement("p");
        el.id = "rs-forecast"; el.className = "adv-help"; el.hidden = true; el.setAttribute("aria-live", "polite");
        host.parentNode.insertBefore(el, host.nextSibling);
      }
      let text = "";
      const def = Tracks.LIST[G.trackIdx];
      if (!tt && G.raceChangeable && typeof Forecast !== "undefined" && previewWxPlan && G.track && def && G.track.def && G.track.def.id === def.id) {
        const plan = previewWxPlan({ laps: G.raceLaps, from: G.raceWeather });
        const f = plan && Forecast.compute({ arc: plan, from: G.raceWeather, lapS: G.track.total / 45, seed: netRoom || !G.simSeed ? 0 : G.simSeed() });
        if (f) text = "FORECAST: " + f.text;
      }
      el.textContent = text;
      el.hidden = !text;
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
      if (typeof DamageHandling !== "undefined" && $("rs-damage")) wire("rs-damage", () => (DamageHandling.isEnabled() ? "on" : "off"), (v) => { DamageHandling.setEnabled(v === "on"); store.set("damageHandling", v === "on"); });
      wire("rs-tyres", () => G.raceTyreWear, (v) => { G.raceTyreWear = v; });
      ersRows.forEach((row, i) => wire(row.id, () => EnergyPlan.plan()[i], (v) => {
        const p = EnergyPlan.plan(); p[i] = v;
        if (EnergyPlan.setPlan(p)) store.set("ersPlan", p);
      }));
      wire("rs-dirty", () => G.raceDirtyAir, (v) => { G.raceDirtyAir = v; });
      if ($("rs-wind") && hasWind()) wire("rs-wind", () => Wind.level(), (v) => { store.set("wind", Wind.setLevel(v)); });
      wire("rs-line", () => DrivingLine.mode(), setDrivingLine);
      wire("rs-plan", () => { const p = G.pits; const v = p ? p.pinnedStops(planTrackId()) : null; return v == null ? "auto" : String(v); },
           (v) => { const p = G.pits; if (p) p.setPinnedStops(v === "auto" ? null : +v, planTrackId()); });
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
      b.title = "Lights on its own when your settings match no preset";
      const cap = document.createElement("small");
      cap.textContent = "change any setting";
      b.appendChild(cap);
      row.appendChild(b);
      return b;
    }

    function presetDisclosure(row, matched) {
      let fold = row.parentElement;
      if (!fold) return;
      if (fold.id !== "rs-preset-options") {
        const parent = fold;
        fold = document.createElement("details");
        fold.id = "rs-preset-options";
        const summary = document.createElement("summary");
        summary.className = "adv-more-btn";
        fold.appendChild(summary);
        parent.insertBefore(fold, row);
        parent.removeChild(row);
        fold.appendChild(row);
      }
      fold.hidden = row.hidden;
      const label = { quick: "QUICK RACE", weekend: "FULL WEEKEND", endurance: "ENDURANCE" };
      fold.querySelector("summary").textContent = "PRESET · " + (label[matched] || "CUSTOM");
    }

    function paintHelpDisclosures() {
      for (const row of $("rs-body").querySelectorAll(".set-row")) {
        const help = Array.from(row.children).find(el => el.classList.contains("adv-help"));
        if (!help || help.hasAttribute("role") || help.hasAttribute("aria-live")) continue;
        if (help.id === "rs-duel-help") continue;
        const label = row.querySelector(".tune-label");
        if (!label) continue;
        const fold = document.createElement("details");
        fold.setAttribute("data-rs-help", "");
        const summary = document.createElement("summary");
        summary.textContent = "About " + label.textContent.trim().toLowerCase();
        fold.appendChild(summary);
        row.insertBefore(fold, help);
        row.removeChild(help);
        fold.appendChild(help);
      }
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
      if (!row.hidden) {
        const custom = ensureCustomPreset(row);
        const on = !matched;
        custom.classList.toggle("active", on);
        custom.setAttribute("aria-pressed", on ? "true" : "false");
        row.setAttribute("data-rs-match", matched || "custom");
      }
      presetDisclosure(row, matched);
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

    function resetDraft() { draftKey = ""; }
    function setNetRoom(on) {
      if (netRoom !== !!on) resetDraft();
      netRoom = !!on;
    }

    function openRaceSetup() {
      $("vsfriend").hidden = true;
      buildSelect();
      els.select.hidden = false;
      if (G.soundOn) GameAudio.uiSelect();
    }

    function openRaceSettings(from) {
      searchReturn = null;
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

    function openSettingSearch(back, arrived) {
      if (G.state !== "menu" || netRoom || isTimeTrial() || isChampionship()) return false;
      searchReturn = back;
      rsReturn = "pmsettings";
      buildRaceSettings();
      $("pmsettings").hidden = true;
      $("race-settings").hidden = false;
      if (arrived) arrived();
      return true;
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
        if (searchReturn) { const back = searchReturn; searchReturn = null; $("pmsettings").hidden = false; back(); return; }
        if (rsReturn === "select") buildSelect();
        $(rsReturn).hidden = false;
      };
      $("rs-go").onclick = () => {
        if (G.soundOn) GameAudio.uiSelect();
        const sheet = $("race-settings");
        const netLobby = G.netLobby;
        const dismissSheet = () => {
          if (!sheet) return;
          sheet.hidden = true;
          try { if (sheet.open && typeof sheet.close === "function") sheet.close(); } catch (_) {  }
        };
        if (netRoom) {
          dismissSheet();
          $("vsfriend").hidden = false;
          netLobby.roomChanged("race");
          return;
        }
        if (soloGp()) store.set("raceDraft", draftOf(G.raceLaps, fullLaps(), G.raceWeather, G.raceTimeOfDay, G.raceChangeable));
        if (getSteerMode() === "tilt") enableTilt();
        if ((typeof Input !== "undefined") && Input.primeHaptics) Input.primeHaptics();
        const season = G.season;
        if ((isChampionship() && SeasonCal.qualiNext(season) && !qualiResults()) ||
            (!isChampionship() && gridFromQuali() && !qualiResults())) { dismissSheet(); openQuali(); }
        else if (raceIntro) {
          try { raceIntro(startRace, sheet, $("rs-go")); } catch (e) { Log.warn("game", "pre-race screen failed — starting straight away", e); dismissSheet(); startRace(); }
        }
        else { dismissSheet(); startRace(); }
      };
    }

    return {
      buildRaceSettings,
      wireRaceSettings,
      openRaceSettings,
      openSettingSearch,
      openRaceSetup,
      setNetRoom,
      resetDraft,
      wireButtons,
      applyPreset,
      repaintPlan: () => paintPlan(isTimeTrial(), G.raceLaps),
      get netRoom() { return netRoom; },
      get rsReturn() { return rsReturn; },
    };
  }

  return { create, duelOpts, duelValue, presetValues, matchPreset, sheetTitle, draftOf, draftFor, weatherOpts };
})();
Object.freeze(RaceSettings);
