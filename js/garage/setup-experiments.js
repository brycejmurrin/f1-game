/* Apex 26 — reversible garage setup experiments and the active-aero bench.
 * Runtime-only API: create captures the existing game facade; build runs after
 * SetupTune/Parts are available. No physics model or stored key is added. */
const SetupExperiments = (function () {
  "use strict";
  function create(G, refreshStats) {
    const { $, getTeamParts } = G;
    let csVisitTunes = new Map();
    let csTuneExperiments = new Map();
    function capture(team) {
      if (team && !csVisitTunes.has(team.id)) csVisitTunes.set(team.id, SetupTune.get(team.id));
    }
    function visit(team) { csVisitTunes = new Map(); csTuneExperiments = new Map(); capture(team); }
    function close() { csTuneExperiments.clear(); }
    // RESET TO WORKS. Every slider writes the store on input; the stat bars and
    // the player's mods follow through recomputePlayerMods on the next race.
    function build(container, team) {
      const wrap = document.createElement("div");
      // Not cs-liv-editor: that class widens the car reserve and translucents the
      // sheet for the PAINT editor. SETUP only needs the compact-density help hide.
      wrap.className = "cs-tune-editor";
      const heading = document.createElement("h3"); heading.className = "sel-label";
      heading.textContent = "SETUP SHEET — " + team.short; wrap.appendChild(heading);
      const cur = SetupTune.get(team.id);
      if (!csVisitTunes.has(team.id)) csVisitTunes.set(team.id, Object.assign({}, cur));
      const previous = csVisitTunes.get(team.id);
      const sameTune = (a, b) => SetupTune.FIELDS.every((k) => a[k] === b[k]);
      let restore, coachRefresh, benchRefresh;
      const rows = {};
      const rakeOut = document.createElement("p"); rakeOut.id = "cs-rake-readout"; rakeOut.className = "adv-help"; rakeOut.setAttribute("data-help", "keep");   // a live readout: HELP TEXT: HIDE keeps it
      const refresh = () => {
        const t = SetupTune.get(team.id);
        for (const k of SetupTune.FIELDS) { rows[k].b.textContent = t[k] + SetupTune.RANGE[k].unit; rows[k].inp.value = t[k]; }
        const baseLoad = Parts.aeroLoad(getTeamParts(team.id), team);
        const effective = Parts.aeroLoad(getTeamParts(team.id), team, SetupTune.aero(team.id));
        rakeOut.textContent = "RAKE " + (t.rideR - t.rideF) + " mm · effective Straight Mode load change "
          + (effective - baseLoad >= 0 ? "+" : "") + ((effective - baseLoad) * 100).toFixed(1) + " pts"
          + " · brake bias " + t.brakeBias.toFixed(1) + " % front";
        if (restore) restore.disabled = sameTune(t, previous);
        if (coachRefresh) coachRefresh();
        if (benchRefresh) benchRefresh(baseLoad, effective);
        refreshStats(team);
        const tab = $("cs-tab-tune");
        if (tab) { tab.classList.toggle("upgraded", !SetupTune.isDefault(team.id)); const c = tab.querySelector(".cs-tab-cur"); if (c) c.textContent = SetupTune.isDefault(team.id) ? "WORKS" : "TUNED"; }
      };
      for (const k of SetupTune.FIELDS) {
        const r = SetupTune.RANGE[k];
        const lab = document.createElement("label"); lab.className = "tune-row";
        const span = document.createElement("span"); span.className = "tune-label";
        span.textContent = r.label + " ";
        const b = document.createElement("b"); span.appendChild(b);
        const inp = document.createElement("input");
        inp.type = "range"; inp.min = r.min; inp.max = r.max; inp.step = r.step; inp.value = cur[k];
        inp.dataset.csTune = k;
        inp.setAttribute("aria-label", r.label);
        inp.oninput = () => { csTuneExperiments.delete(team.id); SetupTune.set(team.id, { [k]: parseFloat(inp.value) }); refresh(); };
        lab.appendChild(span); lab.appendChild(inp);
        wrap.appendChild(lab);
        rows[k] = { b, inp };
      }
      wrap.appendChild(rakeOut);
      if (typeof SetupPresets !== "undefined") SetupPresets.mount(wrap, {
        teamId: team.id, store: G.store,
        trackId: (typeof Tracks !== "undefined" && Tracks.LIST[G.trackIdx]?.id) || G.track?.def?.id || null,
        refresh,
      });
      const note = document.createElement("p"); note.className = "adv-help";
      note.textContent = "Bars: stiffer overall sharpens turn-in and costs traction; a stiffer front shifts load transfer forward and reduces front grip in sustained turns; a stiffer rear helps rotation. "
        + "Rake sizes the ACTIVE AERO trade, not the car's standing downforce: more rake means more top speed to gain and more grip to lose when the flaps open, and with them shut the car drives exactly the same (measured: identical grip across the whole rake range in Corner Mode). A max-wing car is already at full load. "
        + "Brake bias splits the friction budget between the axles under braking — forward understeers on entry, rearward rotates. "
        + "The works sheet is exactly the car it always was.";
      wrap.appendChild(note);
      const reset = document.createElement("button"); reset.type = "button"; reset.className = "cs-liv-ed-cancel";
      reset.textContent = "RESET TO WORKS";
      reset.onclick = () => { csTuneExperiments.delete(team.id); SetupTune.reset(team.id); if (G.soundOn) GameAudio.uiTick(); refresh(); };
      wrap.appendChild(reset);
      restore = document.createElement("button"); restore.type = "button"; restore.className = "cs-liv-ed-cancel";
      restore.textContent = "RESTORE PREVIOUS SETUP";
      restore.onclick = () => { csTuneExperiments.delete(team.id); SetupTune.set(team.id, previous); refresh(); };
      wrap.appendChild(restore);

      const coach = document.createElement("div"); coach.className = "chip-row";
      coach.setAttribute("role", "group"); coach.setAttribute("aria-label", "Setup symptoms");
      const advice = document.createElement("p"); advice.className = "adv-help"; advice.setAttribute("data-help", "keep");
      advice.setAttribute("role", "status");
      const apply = document.createElement("button"), undo = document.createElement("button");
      apply.type = undo.type = "button"; apply.className = undo.className = "cs-liv-ed-cancel";
      apply.textContent = "APPLY EXPERIMENT"; undo.textContent = "UNDO EXPERIMENT";
      let symptom = null;
      const symptoms = [
        { id: "wide", label: "Pushes wide mid-corner", trade: "Soften the front bar one step to shift load transfer away from the front. Tradeoff: softer turn-in and relatively more rear load transfer." },
        { id: "traction", label: "Poor exit traction", trade: "Soften both bars one step together, keeping axle balance. Tradeoff: less sharp turn-in." },
        { id: "entry", label: "Unstable braking entry", trade: "Move brake bias 0.5% forward to leave more rear lateral budget under braking. Tradeoff: more entry understeer and front demand." },
      ];
      const activeExperiment = csTuneExperiments.get(team.id);
      if (activeExperiment) symptom = symptoms.find((item) => item.id === activeExperiment.symptom) || null;
      const chips = [];
      coachRefresh = () => {
        const saved = csTuneExperiments.get(team.id), t = SetupTune.get(team.id);
        if (saved && !sameTune(t, saved.after)) csTuneExperiments.delete(team.id);
        const experiment = csTuneExperiments.get(team.id);
        const pending = !!experiment;
        const patch = symptom && SetupTune.experiment(symptom.id, t);
        apply.disabled = !patch || pending; undo.disabled = !pending;
        for (let i = 0; i < chips.length; i++) { chips[i].disabled = pending; chips[i].setAttribute("aria-pressed", String(symptom === symptoms[i])); }
        advice.textContent = "Model-based starting points; test the feel on track. " + (symptom
          ? symptom.trade + " " + (pending ? SetupTune.FIELDS.filter((k) => experiment.before[k] !== experiment.after[k]).map((k) => SetupTune.RANGE[k].label + ": " + experiment.before[k] + " → " + experiment.after[k]).join(" · ")
            : patch ? Object.keys(patch).map((k) => SetupTune.RANGE[k].label + ": " + t[k] + " → " + patch[k]).join(" · ")
            : "Already at a range limit; this experiment is unavailable.")
          : "Choose a symptom to preview one change.") + (pending ? " Experiment applied. Undo restores the setup before it; a manual edit starts a new experiment." : "");
      };
      for (const item of symptoms) {
        const b = document.createElement("button"); b.type = "button"; b.className = "sel-chip"; b.textContent = item.label;
        b.onclick = () => { symptom = item; coachRefresh(); }; coach.appendChild(b); chips.push(b);
      }
      apply.onclick = () => {
        if (!symptom || csTuneExperiments.has(team.id)) return;
        const before = SetupTune.get(team.id), patch = SetupTune.experiment(symptom.id, before);
        if (!patch) return;
        const after = SetupTune.set(team.id, patch);
        csTuneExperiments.set(team.id, { before, after, symptom: symptom.id }); refresh();
      };
      undo.onclick = () => {
        const saved = csTuneExperiments.get(team.id);
        if (!saved) return;
        if (sameTune(SetupTune.get(team.id), saved.after)) SetupTune.set(team.id, saved.before);
        csTuneExperiments.delete(team.id); refresh();
      };
      wrap.append(coach, advice, apply, undo);

      const bench = document.createElement("p"); bench.className = "adv-help"; bench.setAttribute("data-help", "keep");
      const mode = document.createElement("div"); mode.className = "chip-row";
      mode.setAttribute("role", "group"); mode.setAttribute("aria-label", "Active aero bench mode");
      let straight = false;
      const modes = [];
      benchRefresh = (baseLoad, effective) => {
        for (let i = 0; i < modes.length; i++) modes[i].setAttribute("aria-pressed", String(!!i === straight));
        bench.textContent = "Wing load " + (baseLoad * 100).toFixed(1) + " · effective with rake " + (effective * 100).toFixed(1)
          + " · change from works " + ((effective - baseLoad) * 100).toFixed(1) + " pts. "
          + (effective === 1 && SetupTune.rake(team.id) > 0 ? "Capped — extra rake adds no further trade. " : "")
          + (straight ? "Straight Mode: more effective load sizes a larger speed/grip trade when the flaps open. " : "Corner Mode: flaps shut; rake adds no standing downforce or grip. ");
        if (straight && typeof G.xVmaxGain === "function" && typeof G.xDfLoss === "function") {
          const c = { aeroLoad: effective, aeroX: 1 };
          bench.textContent += "Full-open speed ceiling trade +" + (G.xVmaxGain(c) * 100).toFixed(1)
            + "% · downforce loss " + (G.xDfLoss(c) * 100).toFixed(1) + "% (current conditions).";
        }
      };
      for (const [i, label] of ["CORNER MODE", "STRAIGHT MODE"].entries()) {
        const b = document.createElement("button"); b.type = "button"; b.className = "sel-chip"; b.textContent = label;
        b.onclick = () => { straight = !!i; refresh(); }; mode.appendChild(b); modes.push(b);
      }
      wrap.append(mode, bench);
      container.appendChild(wrap);
      refresh();
    }

    return { capture, visit, close, build };
  }
  return { create };
})();
Object.freeze(SetupExperiments);
