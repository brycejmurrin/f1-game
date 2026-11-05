/* Apex 26 — the SETUP tab: tune sliders, reversible symptom experiments and the
 * active-aero bench. Values live in SetupTune; no physics model or stored key. */
const SetupExperiments = (function () {
  "use strict";
  const SYMPTOMS = [
    { id: "wide", label: "Pushes wide mid-corner", trade: "Soften the front bar one step to shift load transfer away from the front. Tradeoff: softer turn-in and relatively more rear load transfer." },
    { id: "traction", label: "Poor exit traction", trade: "Soften both bars one step together, keeping axle balance. Tradeoff: less sharp turn-in." },
    { id: "entry", label: "Unstable braking entry", trade: "Move brake bias 0.5% forward to leave more rear lateral budget under braking. Tradeoff: more entry understeer and front demand." },
  ];
  const SETUP_HELP = "Bars: stiffer overall sharpens turn-in and costs traction; a stiffer front shifts load transfer forward and reduces front grip in sustained turns; a stiffer rear helps rotation. "
    + "Rake sizes the ACTIVE AERO trade, not the car's standing downforce: more rake means more top speed to gain and more grip to lose when the flaps open, and with them shut the car drives exactly the same (measured: identical grip across the whole rake range in Corner Mode). A max-wing car is already at full load. "
    + "Brake bias splits the friction budget between the axles under braking — forward understeers on entry, rearward rotates. "
    + "The works sheet is exactly the car it always was.";
  const sameTune = (a, b) => SetupTune.FIELDS.every((k) => a[k] === b[k]);
  const changeList = (fields, from, to) => fields.map((k) => SetupTune.RANGE[k].label + ": " + from[k] + " → " + to[k]).join(" · ");
  function el(tag, className, text) {
    const n = document.createElement(tag); n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function plainButton(text) { const b = el("button", "cs-liv-ed-cancel", text); b.type = "button"; return b; }
  function chipButton(text, onclick) { const b = el("button", "sel-chip", text); b.type = "button"; b.onclick = onclick; return b; }
  function chipGroup(ariaLabel) { const g = el("div", "chip-row"); g.setAttribute("role", "group"); g.setAttribute("aria-label", ariaLabel); return g; }
  function liveHelp() { const p = el("p", "adv-help"); p.setAttribute("data-help", "keep"); return p; }

  function create(G, refreshStats) {
    const { $, getTeamParts } = G;
    if (typeof SetupTrials !== "undefined") SetupTrials.mountPause(G);
    let trialUi = null;
    const visitBaselines = new Map();   // team id → tune at visit start (RESTORE PREVIOUS)
    const experiments = new Map();      // team id → { before, after, symptom }
    function capture(team) {
      if (team && !visitBaselines.has(team.id)) visitBaselines.set(team.id, SetupTune.get(team.id));
    }
    function disposeTrials() { if (trialUi) { trialUi.dispose(); trialUi = null; } }

    // A slider drag fires `input` per pixel; each SetupTune.set is a JSON write to
    // localStorage plus a store revision bump that re-keys the garage preview. Commit
    // 75 ms after the last input (the livery pickers' cadence, setup-sheet.js
    // scheduleLivPreview) and at once on `change`; every other write path flushes
    // first, so it lands in the same order as before.
    let tunePend = null;   // { team, patch, timer, after }
    function flushTune() {
      const p = tunePend;
      if (!p) return;
      tunePend = null;
      clearTimeout(p.timer);
      SetupTune.set(p.team, p.patch);
      p.after();
    }
    function queueTune(teamId, k, v, after, now) {
      if (tunePend && tunePend.team !== teamId) flushTune();
      if (!tunePend) tunePend = { team: teamId, patch: {}, timer: null, after };
      tunePend.patch[k] = v; tunePend.after = after;
      clearTimeout(tunePend.timer);
      if (now) flushTune(); else tunePend.timer = setTimeout(flushTune, 75);
    }

    function visit(team) { flushTune(); visitBaselines.clear(); experiments.clear(); capture(team); }
    function close() { flushTune(); experiments.clear(); disposeTrials(); }

    const pickedTrackId = () => (typeof Tracks !== "undefined" && Tracks.LIST[G.trackIdx]?.id) || null;

    function renderTuneTab(team) {
      const tab = $("cs-tab-tune"), works = SetupTune.isDefault(team.id);
      if (!tab) return;
      tab.classList.toggle("upgraded", !works);
      const c = tab.querySelector(".cs-tab-cur"); if (c) c.textContent = works ? "WORKS" : "TUNED";
    }

    function tuneSlider(team, k, value, onEdit, refresh) {
      const r = SetupTune.RANGE[k];
      const lab = el("label", "tune-row");
      const span = el("span", "tune-label", r.label + " ");
      const b = document.createElement("b"); span.appendChild(b);
      const inp = document.createElement("input");
      inp.type = "range"; inp.min = r.min; inp.max = r.max; inp.step = r.step; inp.value = value;
      inp.dataset.csTune = k;
      inp.setAttribute("aria-label", r.label);
      const edit = (now) => {
        experiments.delete(team.id);
        const v = parseFloat(inp.value);
        b.textContent = v + r.unit;   // the readout follows the thumb; the store follows the debounce
        onEdit();                     // a manual edit ends an applied experiment at once
        queueTune(team.id, k, v, refresh, now);
      };
      inp.oninput = () => edit(false);
      inp.onchange = () => edit(true);
      lab.appendChild(span); lab.appendChild(inp);
      return { lab, b, inp };
    }

    function mountPresets(wrap, team, refresh) {
      if (typeof SetupPresets === "undefined") return;
      SetupPresets.mount(wrap, {
        teamId: team.id, store: G.store,
        trackId: pickedTrackId() || G.track?.def?.id || null,
        context: () => ({ v: 1, physics: typeof PhysicsConsts !== "undefined" ? String(PhysicsConsts.REVISION || "") : null,
          track: pickedTrackId(), parts: getTeamParts(team.id) }),
        refresh,
      });
    }

    function mountTrials(wrap, team, baseline, refresh) {
      if (typeof SetupTrials === "undefined" || !G.setupTrialRestart) return;
      trialUi = SetupTrials.mount(wrap, {
        teamId: team.id, store: G.store, baseline, candidateNow: () => { flushTune(); return SetupTune.get(team.id); },
        launch: options => G.setupTrialRestart(options), cancelRuntime: () => { if (G.setupTrialCancel) G.setupTrialCancel(); }, refresh,
      });
    }

    function adviceText(symptom, experiment, patch, t) {
      const detail = !symptom ? "Choose a symptom to preview one change." : symptom.trade + " " + (experiment
        ? changeList(SetupTune.FIELDS.filter((k) => experiment.before[k] !== experiment.after[k]), experiment.before, experiment.after)
        : patch ? changeList(Object.keys(patch), t, patch) : "Already at a range limit; this experiment is unavailable.");
      return "Model-based starting points; test the feel on track. " + detail
        + (experiment ? " Experiment applied. Undo restores the setup before it; a manual edit starts a new experiment." : "");
    }

    function buildCoach(wrap, team, refresh) {
      const group = chipGroup("Setup symptoms");
      const advice = liveHelp(); advice.setAttribute("role", "status");
      const apply = plainButton("APPLY EXPERIMENT"), undo = plainButton("UNDO EXPERIMENT");
      const active = experiments.get(team.id);
      let symptom = active ? SYMPTOMS.find((item) => item.id === active.symptom) || null : null;
      const chips = [];
      const coachRefresh = () => {
        const t = SetupTune.get(team.id), saved = experiments.get(team.id);
        if (saved && !sameTune(t, saved.after)) experiments.delete(team.id);
        const experiment = experiments.get(team.id);
        const patch = symptom && SetupTune.experiment(symptom.id, t);
        apply.disabled = !patch || !!experiment; undo.disabled = !experiment;
        for (let i = 0; i < chips.length; i++) { chips[i].disabled = !!experiment; chips[i].setAttribute("aria-pressed", String(symptom === SYMPTOMS[i])); }
        advice.textContent = adviceText(symptom, experiment, patch, t);
      };
      for (const item of SYMPTOMS) {
        const b = chipButton(item.label, () => { symptom = item; coachRefresh(); });
        group.appendChild(b); chips.push(b);
      }
      apply.onclick = () => {
        flushTune();
        if (!symptom || experiments.has(team.id)) return;
        const before = SetupTune.get(team.id), patch = SetupTune.experiment(symptom.id, before);
        if (!patch) return;
        const after = SetupTune.set(team.id, patch);
        experiments.set(team.id, { before, after, symptom: symptom.id }); refresh();
      };
      undo.onclick = () => {
        flushTune();
        const saved = experiments.get(team.id);
        if (!saved) return;
        if (sameTune(SetupTune.get(team.id), saved.after)) SetupTune.set(team.id, saved.before);
        experiments.delete(team.id); refresh();
      };
      wrap.append(group, advice, apply, undo);
      return coachRefresh;
    }

    function buildBench(wrap, team, refresh) {
      const bench = liveHelp();
      const group = chipGroup("Active aero bench mode");
      let straight = false;
      const modes = [];
      const benchRefresh = (baseLoad, effective) => {
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
        const b = chipButton(label, () => { straight = !!i; refresh(); });
        group.appendChild(b); modes.push(b);
      }
      wrap.append(group, bench);
      return benchRefresh;
    }

    function build(container, team) {
      flushTune();
      disposeTrials();
      const wrap = document.createElement("div");
      // Not cs-liv-editor: that class widens the car reserve and translucents the
      // sheet for the PAINT editor. SETUP only needs the compact-density help hide.
      wrap.className = "cs-tune-editor";
      wrap.appendChild(el("h3", "sel-label", "SETUP SHEET — " + team.short));
      const cur = SetupTune.get(team.id);
      if (!visitBaselines.has(team.id)) visitBaselines.set(team.id, Object.assign({}, cur));
      const previous = visitBaselines.get(team.id);
      let restore = null, coachRefresh = null, benchRefresh = null;
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
        renderTuneTab(team);
      };
      for (const k of SetupTune.FIELDS) {
        rows[k] = tuneSlider(team, k, cur[k], () => { if (coachRefresh) coachRefresh(); }, refresh);
        wrap.appendChild(rows[k].lab);
      }
      wrap.appendChild(rakeOut);
      mountPresets(wrap, team, refresh);
      wrap.appendChild(el("p", "adv-help", SETUP_HELP));
      const reset = plainButton("RESET TO WORKS");
      reset.onclick = () => { flushTune(); experiments.delete(team.id); SetupTune.reset(team.id); if (G.soundOn) GameAudio.uiTick(); refresh(); };
      wrap.appendChild(reset);
      restore = plainButton("RESTORE PREVIOUS SETUP");
      restore.onclick = () => { flushTune(); experiments.delete(team.id); SetupTune.set(team.id, previous); refresh(); };
      wrap.appendChild(restore);
      coachRefresh = buildCoach(wrap, team, refresh);
      mountTrials(wrap, team, previous, refresh);
      benchRefresh = buildBench(wrap, team, refresh);
      container.appendChild(wrap);
      refresh();
    }

    return { capture, visit, close, build };
  }
  return { create };
})();
Object.freeze(SetupExperiments);
