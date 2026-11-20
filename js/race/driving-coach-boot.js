const DrivingCoach = (function () {
  "use strict";

  const GOALS = Object.freeze([["free", "FREE PRACTICE"], ["sector", "SECTOR"], ["corner", "CORNER"], ["lap", "FULL LAP"], ["cooling", "COOLING LAP"],
    ["braking", "BRAKING"], ["trail", "TRAIL BRAKING"], ["slalom", "SLALOM"], ["launch", "LAUNCH"],
    ["start", "RACE START"], ["slipstream", "SLIPSTREAM"], ["overtake", "OVERTAKE"], ["defend", "DEFEND"],
    ["backmarkers", "TRAFFIC"]].map((g) => Object.freeze(g)));
  const PANELS = ["driving", "practice", "strategy", "review"];

  function create(G) {
    let mine = null, goal = "free", asked = false;
    const $ = G.$;
    const body = () => {
      if (mine || typeof DrivingCoachBody === "undefined") return mine;
      mine = DrivingCoachBody.create(G);
      if (goal !== "free") mine.setPracticeGoal(goal);
      return mine;
    };
    const enabled = () => { const b = body(); return b ? b.isEnabled() : !!G.store.get("drivingCoach", false); };
    function paint() {
      const b = body();
      if (b) { b.paint(); return; }
      SettingRow.paint($("pm-coach"), enabled() ? "on" : "off");
      SettingRow.paint($("pm-drill"), goal);
      SettingRow.disable($("pm-drill"), true);
      if (asked) return;
      const lb = typeof LazyBundles !== "undefined" && LazyBundles.live ? LazyBundles.live() : null;
      if (!lb || !lb.ensureRaceSession) return;
      asked = true;
      Promise.resolve(lb.ensureRaceSession()).then((ok) => { if (ok && body()) mine.paint(); else asked = false; }, () => { asked = false; });
    }
    function toggle() {
      const b = body();
      if (b) return b.toggle();
      const on = !enabled();
      G.store.set("drivingCoach", on);
      paint();
      return on;
    }
    function setPracticeGoal(mode) {
      const b = body();
      if (b) return b.setPracticeGoal(mode);
      if (!(typeof RaceInsights !== "undefined" && Object.hasOwn(RaceInsights.DRILLS, mode))) return false;
      goal = mode; paint(); return true;
    }
    const call = (name, none) => (...args) => { const b = body(); return b ? b[name](...args) : none; };

    const bind = (id, fn) => { const el = $(id); if (el) el.onclick = () => { fn(); paint(); }; };
    bind("pm-driving-trace", call("downloadTrace"));
    bind("pm-practice-set", call("mark", false)); bind("pm-practice-retry", call("retry", false));
    bind("pm-practice-rewind", call("rewind", false)); bind("pm-practice-arm", call("armPractice", false));
    SettingRow.wire($("pm-coach"), { values: [["off", "OFF"], ["on", "ON"]],
      read: () => enabled() ? "on" : "off", write: (v) => { if ((v === "on") !== enabled()) toggle(); } });
    SettingRow.wire($("pm-drill"), { values: GOALS.map((g) => g.slice()),
      read: () => (body() ? mine.practiceGoal() : goal), write: setPracticeGoal });
    SettingRow.wire($("pm-pit-choice"), { read: () => G.player && G.player.pitNext ? G.player.pitNext.id : "auto",
      write: (v) => { if (typeof RealRace !== "undefined" && RealRace.status().watch) return; G.pits.selectNext(G.player, v); paint(); } });
    const menu = $("pmsettings"), panel = $("pm-panel-driving");
    if (menu && panel && typeof MutationObserver === "function") {
      const observer = new MutationObserver(() => { if (!menu.hidden && !panel.hidden) paint(); });
      observer.observe(menu, { attributes: true, attributeFilter: ["hidden"] });
      observer.observe(panel, { attributes: true, attributeFilter: ["hidden"] });
    }
    if (typeof SettingsNav !== "undefined") SettingsNav.onEnter((id) => { if (PANELS.includes(id)) paint(); });
    body();

    return {
      update: (dt) => { const b = mine || body(); if (b) b.update(dt); },
      status: call("status", null),
      feedback: () => {
        const b = body();
        return b ? b.feedback() : { enabled: enabled(), state: enabled() ? "ready" : "off", reminders: 0, latest: null,
          counts: [], total: 0, turns: [], suggest: null };
      },
      advice: call("advice", ""),
      beginSetupTrial: call("beginSetupTrial", false),
      mark: call("mark", false), retry: call("retry", false), rewind: call("rewind", false),
      reset: () => { if (body()) mine.reset(); },
      toggle, paint,
      armPractice: call("armPractice", false), canArm: call("canArm", false),
      practiceGoal: () => (body() ? mine.practiceGoal() : goal), setPracticeGoal,
      canPractice: call("canPractice", false), rewindReady: call("rewindReady", false),
      practiceActive: () => !!mine && mine.practiceActive(),
      isEnabled: enabled,
      trace: () => (body() ? mine.trace() : []),
      get insights() { const b = body(); return b ? b.insights : null; },
    };
  }

  const loaded = () => typeof DrivingCoachBody !== "undefined";
  return { create, GOALS, loaded };
})();
Object.freeze(DrivingCoach);
