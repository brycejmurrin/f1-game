/* Explicit opt-in for cue targets that account for current driving conditions. */
const ConditionCueControls = (function () {
  "use strict";
  const KEY = "conditionCues";
  function create(store, host) {
    if (!host) return null;
    const row = document.createElement("label"); row.className = "player-tool-row";
    const input = document.createElement("input"); input.type = "checkbox"; input.id = "pm-condition-cues";
    const label = document.createElement("span"); label.textContent = "CONDITION-AWARE BRAKING CUES (ESTIMATE)";
    const note = document.createElement("p"); note.className = "adv-help"; note.id = "pm-condition-cues-help";
    note.textContent = "Adjust predictive cues for current tyre and road grip. Estimated timing; this does not enable disabled cues and never brakes or steers the car.";
    input.setAttribute("aria-describedby", "pm-condition-cues-help");
    let applied = null;
    function apply(on) {
      input.checked = on;
      if (applied === on) return;
      applied = on;
      if (typeof BrakeCue !== "undefined" && BrakeCue.setConditionAware) BrakeCue.setConditionAware(on);
      if (typeof DrivingCues !== "undefined" && DrivingCues.setConditionAware) DrivingCues.setConditionAware(on);
    }
    input.onchange = () => { const on = input.checked === true; store.set(KEY, on); apply(on); };
    apply(store.get(KEY, false) === true); row.append(input, label); host.append(row, note);
    const refresh = () => apply(store.get(KEY, false) === true);
    const unsubscribe = store.subscribe ? store.subscribe((c) => { if (c && (c.key === KEY || c.clear || (Array.isArray(c.keys) && c.keys.includes(KEY)))) refresh(); }) : null;
    return Object.freeze({ refresh, dispose() { unsubscribe?.(); row.remove(); note.remove(); } });
  }
  return Object.freeze({ KEY, create });
})();
Object.freeze(ConditionCueControls);
