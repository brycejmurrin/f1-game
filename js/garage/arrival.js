/* Pit-work arrival: a render-clock sequence, independent of race simulation. */
const GarageArrival = (function () {
  "use strict";
  const DURATION = 6.4, DOOR_S = 1.8;
  const ease = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  const DEFAULT = Object.freeze({ enabled: true, speed: 1, angle: "cut", fov: 54 });
  function settings(value) {
    const v = value && typeof value === "object" ? value : {};
    const number = (key, lo, hi) => typeof v[key] === "number" && Number.isFinite(v[key])
      ? Math.max(lo, Math.min(hi, v[key])) : DEFAULT[key];
    return { enabled: v.enabled !== false, speed: number("speed", 0.5, 2),
      angle: ["cut", "left", "right"].includes(v.angle) ? v.angle : "cut", fov: number("fov", 40, 75) };
  }
  function bindSettings($, store) {
    const read = () => settings(store.get("garageArrival", null));
    const fields = ["enabled", "speed", "angle", "fov"];
    function refresh() {
      const value = read();
      for (const key of fields) {
        const el = $("ga-" + key);
        if (key === "enabled") el.checked = value[key];
        else el.value = String(value[key]);
      }
    }
    for (const key of fields) $("ga-" + key).onchange = () => {
      const el = $("ga-" + key), value = read();
      value[key] = key === "enabled" ? el.checked : key === "angle" ? el.value : Number(el.value);
      store.set("garageArrival", settings(value)); refresh();
    };
    $("ga-reset").onclick = () => { store.set("garageArrival", null); refresh(); };
    $("ga-settings").ontoggle = refresh;
    refresh();
    return read;
  }
  function pose(seconds, config = DEFAULT) {
    const t = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    const travel = ease((t - DOOR_S) / 4.2);
    const left = config.angle === "left" || (config.angle !== "right" && t < DOOR_S);
    // Reverse into the bay, nose facing the pit lane, as the parked preview is.
    const z = 11.4 * (1 - travel);
    return { active: t < DURATION, fov: config.fov, door: ease(t / DOOR_S), z,
      label: t < DOOR_S ? "OPENING GARAGE" : t < 6 ? "BRINGING CAR IN" : "READY FOR WORK",
      // Interior versions of garage-angles' bay/rear three-quarter framings.
      // A cut after the shutter opens keeps both eyes behind the threshold.
      eye: left ? [-3.8, 2.1, -4.8] : [4.1, 2.25, -4.9],
      aim: [0, 0.8, t < DOOR_S ? 6.2 : z * 0.48 + 0.8] };
  }
  function create($, reducedMotion, readSettings = () => DEFAULT) {
    let state = null, time = 0, config = DEFAULT;
    const root = $("carsetup"), panel = $("cs-inner"), controls = $("cs-stack");
    const overlay = $("cs-arrival"), skip = $("cs-arrival-skip"), label = $("cs-arrival-label");
    function chrome(on) {
      root.classList.toggle("cs-arriving", on);
      panel.inert = controls.inert = on;
      overlay.hidden = !on;
      root.setAttribute("data-esc-close", on ? "cs-arrival-skip" : "cs-back");
    }
    function finish() {
      if (!state) return;
      state = pose(DURATION, config); time = DURATION;
      chrome(false);
      $("cs-done").focus({ preventScroll: true });
    }
    function start() {
      config = settings(readSettings());
      time = 0; state = pose(0, config);
      if (!config.enabled || reducedMotion()) { finish(); return; }
      label.textContent = state.label;
      chrome(true); skip.focus({ preventScroll: true });
    }
    function step(dt) {
      if (state && state.active) {
        // Background-tab gaps must not swallow the whole arrival.
        time += Math.min(0.1, Math.max(0, Number.isFinite(dt) ? dt : 0)) * config.speed;
        state = pose(time, config);
        if (label.textContent !== state.label) label.textContent = state.label;
        if (!state.active) finish();
      }
      return state;
    }
    function cancel() { state = null; time = 0; chrome(false); }
    skip.onclick = finish;
    return { start, step, cancel, finish, get state() { return state; } };
  }
  return Object.freeze({ create, pose, DURATION, DEFAULT, settings, bindSettings });
})();
