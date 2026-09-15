/* Read-only driving feedback and explicitly unscored solo practice. */
"use strict";
const DrivingCoach = (function () {
  function create(G) {
    const insights = RaceInsights.create(G);
    let enabled = G.store.get("drivingCoach", false), elapsed = 0, quiet = 0;
    let trace = [], checkpoint = null, practice = false, drillMode = "free";
    function status() {
      const c = G.player;
      if (!c) return null;
      const ghostSpeed = Ghost.speedAt ? Ghost.speedAt(c.lapTime) : null;
      return { time: G.raceT, speed: c.speed, steer: c.steerAngle || 0, brake: c.brakeDemand || 0,
        throttle: c.throttleDemand || 0, command: c.steerCommand || 0,
        slipFront: c.slipFront || 0, slipRear: c.slipRear || 0, frontUtil: c.frontUtil || 0, rearUtil: c.rearUtil || 0,
        forceFront: c.forceFront || 0, forceRear: c.forceRear || 0, lateralAccel: c.lateralAccel || 0,
        longitudinalUse: c.axFrac || 0, yawRate: c.yawRateCur || 0, energy: c.energy,
        wetness: G.roadWetness(), practice, enabled, insights: insights.summary(),
        ghostSpeedDelta: ghostSpeed == null ? null : c.speed - ghostSpeed };
    }
    function advice(c) {
      if (!c || c.offroad || Math.abs(c.speed) < G.vTop() * 0.2) return "";
      if (c.brakeDemand > 0 && (c.axFrac || 0) > 0.8 && Math.abs(c.steerAngle || 0) > 0.025) return "EASE THE BRAKE AS YOU TURN";
      if ((c.rearUtil || 0) > 0.9 && (c.rearUtil || 0) > (c.frontUtil || 0) + 0.08) return "REAR SLIDING — EASE THE THROTTLE";
      if ((c.frontUtil || 0) > 0.9) return "FRONTS SLIDING — UNWIND SOME STEERING";
      return "";
    }
    function update(dt) {
      elapsed += dt; quiet = Math.max(0, quiet - dt);
      if (elapsed < 0.1) return;
      elapsed %= 0.1;
      insights.update(G.player);
      if (!enabled && !practice) return;
      const s = status();
      if (s) { trace.push(s); if (trace.length > 600) trace.shift(); }
      if (!enabled || quiet || G.announceBusy || G.cautionInfo().level > 0) return;
      const text = advice(G.player);
      if (text) { G.announce(text, 1.8, "coach"); quiet = 7; }
    }
    function canPractice() { return !!(G.timeTrial && !G.daily.isActive() && !G.netPlay.active() && G.player && G.state === "race"); }
    function mark() {
      if (!canPractice()) return false;
      if (!insights.startDrill(drillMode)) return false;
      // Single-car practice checkpoint, not a whole-world rewind. Never restore
      // a career, a remote car, or a queued race settlement.
      const c = G.player, fields = {};
      for (const k of Object.keys(c)) if (c[k] == null || ["number", "boolean", "string"].includes(typeof c[k])) fields[k] = c[k];
      const objects = {};
      for (const k of ["tyre", "tyreLog", "pitNext"]) objects[k] = c[k] == null ? c[k] : JSON.parse(JSON.stringify(c[k]));
      checkpoint = { fields, objects, mode: drillMode };
      practice = true; G.records.invalidate();
      G.announce("PRACTICE CHECKPOINT — LAPS WILL NOT BE SAVED", 3, "info");
      return true;
    }
    function retry() {
      if (!checkpoint || !canPractice()) return false;
      IncidentSim.reset(); DebrisWorld.reset();
      for (const k of Object.keys(G.player)) {
        const v = G.player[k];
        if ((v == null || ["number", "boolean", "string"].includes(typeof v)) && !Object.hasOwn(checkpoint.fields, k)) delete G.player[k];
      }
      Object.assign(G.player, checkpoint.fields);
      for (const [k, v] of Object.entries(checkpoint.objects)) G.player[k] = v == null ? v : JSON.parse(JSON.stringify(v));
      G.player.incidentInvalidLap = true; G.player._prevS = G.player.s;
      G.player.rPrevPx = G.player.px; G.player.rPrevPz = G.player.pz;
      G.player.rPrevHead = G.player.head; G.player.rPrevS = G.player.s; G.player.rPrevX = G.player.x;
      G.records.invalidate(); trace = []; quiet = 2;
      insights.startDrill(checkpoint.mode);
      G.announce("CHECKPOINT RESTORED — PRACTICE", 2, "info");
      return true;
    }
    function reset() { checkpoint = null; practice = false; trace = []; elapsed = 0; quiet = 0; insights.reset(); }
    function downloadTrace() {
      const blob = new Blob([JSON.stringify({ physics: PhysicsConsts.REVISION, configuration: G.records.config(), rows: trace,
        aiDecisions: (G.cars || []).filter(c => !c.human && c.passPlan).map(c => ({ driver: c.code, ...c.passPlan })),
        journal: insights.journal(), forecast: insights.forecast(), practice: insights.summary() }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = "apex26-driving-trace.json"; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function toggle() { enabled = !enabled; G.store.set("drivingCoach", enabled); paint(); return enabled; }
    const $ = G.$;
    function paint() {
      SettingRow.paint($("pm-coach"), enabled ? "on" : "off");
      const download = $("pm-driving-trace"); if (download) download.disabled = trace.length === 0 && insights.journal().length === 0;
      const markBtn = $("pm-practice-set"), retryBtn = $("pm-practice-retry");
      if (markBtn) markBtn.disabled = !canPractice();
      if (retryBtn) retryBtn.disabled = !canPractice() || !checkpoint;
      SettingRow.paint($("pm-drill"), drillMode);
      SettingRow.disable($("pm-drill"), !canPractice());
      const practiceState = $("pm-practice-state");
      if (practiceState) practiceState.textContent = !canPractice()
        ? "Checkpoints are available in solo Time Trial. Start one from the main menu; races, daily challenges and multiplayer do not support checkpoints."
        : practice ? "Practice active: laps and ghosts will not be saved. TRY AGAIN restores your saved car state. Restart the session to set records again."
          : "Saving a starting point makes this session unscored: laps and ghosts will not be saved. Restart the session to set records again.";
      const drillInfo = $("pm-drill-status"), summary = insights.summary();
      if (drillInfo) drillInfo.textContent = summary.lastDrill
        ? (summary.lastDrill.clean ? "Completed" : "Retry suggested") + " · " + summary.lastDrill.seconds.toFixed(1) + "s · " + RaceInsights.DRILLS[summary.lastDrill.mode]
        : ({ free: "Repeat any section at your own pace.", sector: "Finish the next sector without contact or leaving the track.",
          braking: "Build speed before saving, then brake firmly to a stop.", trail: "Build speed before saving. Brake firmly, ease the brake while turning, then release it.",
          slalom: "Make six direction changes while moving. Stay on the track and avoid contact." })[drillMode];
      const f = insights.forecast(), strategy = $("pm-stint-forecast");
      if (strategy) strategy.textContent = !G.tyres.on() ? "Enable tyre wear for stint forecasts." : !f || f.remainingLaps == null ? "Drive at least half a lap on this set for a tyre-life estimate."
        : "Tyre life ≈ " + f.remainingLaps.toFixed(1) + " laps · " + (f.reachesFinish ? "projected to reach the finish" : "another stop may be needed")
          + (f.paybackLaps == null ? "" : " · estimated stop payback " + f.paybackLaps.toFixed(1) + " laps") + " · " + f.confidence + " confidence";
      const energy = $("pm-energy-forecast");
      if (energy) energy.textContent = !f || f.energyPerLap == null ? "Complete clean sectors to learn your energy use."
        : "Net energy per lap: " + (f.energyPerLap * 100).toFixed(1) + "%" + (f.energyLaps == null ? " · current pattern sustains charge" : " · charge lasts ≈ " + f.energyLaps.toFixed(1) + " laps") + " · estimated from recent sectors";
      const net = insights.network(), connection = $("pm-connection");
      if (connection) { connection.hidden = !net; connection.textContent = net ? net.text : ""; }
      const journal = $("pm-incident-log");
      if (journal) {
        journal.textContent = "";
        for (const e of insights.journal().slice(-20)) { const li = document.createElement("li"); li.textContent = e.time.toFixed(1) + "s · " + e.text; journal.appendChild(li); }
      }
      const decisions = $("pm-ai-decisions");
      if (decisions) {
        decisions.textContent = "";
        for (const c of G.cars || []) if (!c.human && c.passPlan) {
          const li = document.createElement("li"), p = c.passPlan;
          li.textContent = c.code + " · " + p.reason + " · left: " + p.left.reason + " · right: " + p.right.reason;
          decisions.appendChild(li);
        }
      }
      const note = $("pm-pit-estimate");
      SettingRow.paint($("pm-pit-choice"), G.player && G.player.pitNext ? G.player.pitNext.id : "auto",
        [["auto", "AUTO"], ...G.pits.choices(G.player).map(r => [r.id, r.code + " · " + r.id.replace(/_/g, " ")])]);
      SettingRow.disable($("pm-pit-choice"), !(G.player && G.tyres.on() && G.state === "race") || G.player.pitState === "box");
      if (note) {
        const e = G.player && G.tyres.on() && G.pits.estimate(G.player);
        note.textContent = e ? "Estimated pit loss: " + e.lossS.toFixed(1) + "s" + (e.gapS == null ? "" : " · gap behind: " + e.gapS.toFixed(1) + "s") : "Pit strategy is available with tyre wear enabled.";
      }
    }
    const bind = (id, fn) => { const b = $(id); if (b) b.onclick = () => { fn(); paint(); }; };
    bind("pm-driving-trace", downloadTrace);
    bind("pm-practice-set", mark); bind("pm-practice-retry", retry);
    SettingRow.wire($("pm-coach"), { values: [["off", "OFF"], ["on", "ON"]],
      read: () => enabled ? "on" : "off", write: v => { if ((v === "on") !== !!enabled) toggle(); } });
    SettingRow.wire($("pm-drill"), { values: [["free", "FREE PRACTICE"], ["sector", "SECTOR"], ["braking", "BRAKING"], ["trail", "TRAIL BRAKING"], ["slalom", "SLALOM"]],
      read: () => drillMode, write: v => { if (Object.hasOwn(RaceInsights.DRILLS, v)) drillMode = v; paint(); } });
    SettingRow.wire($("pm-pit-choice"), { read: () => G.player && G.player.pitNext ? G.player.pitNext.id : "auto",
      write: v => { G.pits.selectNext(G.player, v); paint(); } });
    bind("pm-driving", () => { $("pm-settings").click(); SettingsNav.show("driving", false); });
    const menu = $("pmsettings"), panel = $("pm-panel-driving");
    if (menu && panel && typeof MutationObserver === "function") {
      const observer = new MutationObserver(() => { if (!menu.hidden && !panel.hidden) paint(); });
      observer.observe(menu, { attributes: true, attributeFilter: ["hidden"] });
      observer.observe(panel, { attributes: true, attributeFilter: ["hidden"] });
    }
    return { update, status, advice, mark, retry, reset, toggle, paint, practiceActive: () => practice,
      trace: () => trace.map(row => ({ ...row })), insights };
  }
  return { create };
})();
Object.freeze(DrivingCoach);
