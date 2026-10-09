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
  /** opts.preview(dir, btn): PREVIEW IN / OUT ("in" | "out") start one playback
   *  and return whether it started; preview(null) stops one and returns whether
   *  one was playing (js/garage/setup-camera.js startArrivalPreview). */
  function bindSettings($, store, opts = {}) {
    const preview = typeof opts.preview === "function" ? opts.preview : null;
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
    // An ADVANCED VISUALS tool (#garrival), docked right like the three tuners:
    // it takes the settings page's place while open and gives it back on DONE.
    const page = (on) => {
      const ps = $("pmsettings"), dp = $("pm-panel-display");
      if (ps) ps.hidden = !on;
      if (dp) dp.hidden = !on;
    };
    const panel = $("garrival"), openBtn = $("pm-garrival"), done = $("ga-close");
    if (panel && openBtn) openBtn.onclick = () => {
      refresh(); page(false); panel.hidden = false;
      if (typeof document !== "undefined" && document.body) document.body.classList.add("lt-open");
      if (done && done.focus) done.focus();
    };
    for (const [b, dir] of [[$("ga-preview-in"), "in"], [$("ga-preview-out"), "out"]]) {
      if (b) b.onclick = () => { if (preview) preview(dir, b); };
    }
    if (panel && done) done.onclick = () => {
      if (preview && preview(null)) return;   // DONE (or Escape) mid-playback stops it, back to the panel
      panel.hidden = true; page(true);
      if (typeof document !== "undefined" && document.body) document.body.classList.remove("lt-open");
      // After the settings dialog's own re-show handling, which focuses its
      // CLOSE door; a tool's DONE hands focus back to the tool's button.
      if (openBtn && openBtn.focus) { if (typeof setTimeout === "function") setTimeout(() => openBtn.focus(), 0); else openBtn.focus(); }
    };
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
  /* THE DRIVE-OUT: the arrival in reverse, opening every RACE! while the circuit
   * builds (js/game.js studioOpen). Mirror the pit-work IN beat: the shutter
   * opens first (DOOR_S), the car sits a beat, then rolls out nose first and
   * on out of the door while the camera, at the arrival's interior three-quarter,
   * follows it. No circuit is needed — this is the setup screen's own room —
   * so it plays the moment START is pressed, while the circuit builds behind it.
   * ONCE OUT IT TURNS INTO THE PIT LANE: straight to OUT_STRAIGHT (clear of the
   * door at z 6.4), then an arc of OUT_R metres through OUT_TURN radians, away
   * from the camera so the car sweeps across the doorway rather than out of it.
   * x and yaw ride the pose (setup-camera.js builds the car matrix from them). */
  const OUT_HOLD = 1.1, OUT_RUN = 4.4, OUT_DURATION = DOOR_S + OUT_HOLD + OUT_RUN + 0.3;
  // Reduce-motion Start Race: same path, ~4× wall speed (~1.9 s), never skipped.
  const OUT_REDUCE_SPEED = 4;
  const OUT_STRAIGHT = 8, OUT_R = 5, OUT_TURN = 1.3;   // ~75 degrees
  // PACE: it pulls away (OUT_ACCEL s), holds its speed through the turn, and leaves
  // it still rolling, then coasts OUT_COAST m on down the pit lane and eases to a
  // stop, so the shot is still moving while RACE!'s load finishes behind it
  // (studioDone holds the garage past OUT_DURATION).
  const OUT_PATH = OUT_STRAIGHT + OUT_R * OUT_TURN, OUT_ACCEL = 1.2, OUT_COAST = 2.5;
  const OUT_V = OUT_PATH / (OUT_RUN - OUT_ACCEL / 2), OUT_TAU = OUT_COAST / OUT_V;
  const OUT_SETTLE = DOOR_S + OUT_HOLD + OUT_RUN + 4 * OUT_TAU;   // the coast's end (98 %): the pose holds from here
  function outDistance(tm) {
    if (tm <= 0) return 0;
    if (tm < OUT_ACCEL) return OUT_V * tm * tm / (2 * OUT_ACCEL);
    if (tm < OUT_RUN) return OUT_V * (tm - OUT_ACCEL / 2);
    return OUT_PATH + OUT_COAST * (1 - Math.exp(-(tm - OUT_RUN) / OUT_TAU));
  }
  function poseOut(seconds, config = DEFAULT) {
    const t = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    const right = config.angle === "right", side = right ? -1 : 1;   // turn away from the eye
    const opening = t < DOOR_S;
    const door = ease(t / DOOR_S);
    const s = outDistance(Math.min(t, OUT_SETTLE) - DOOR_S - OUT_HOLD);   // path after the door + hold
    const th = Math.min(OUT_TURN, Math.max(0, s - OUT_STRAIGHT) / OUT_R), past = Math.max(0, s - OUT_PATH);
    const z = (s < OUT_STRAIGHT ? s : OUT_STRAIGHT + OUT_R * Math.sin(th)) + past * Math.cos(th);
    const x = side * (OUT_R * (1 - Math.cos(th)) + past * Math.sin(th)), yaw = side * th;
    return { active: t < OUT_DURATION, fov: config.fov, door, x, z, yaw,
      label: opening ? "OPENING GARAGE" : "LEAVING THE GARAGE",
      eye: right ? [4.1, 2.25, -4.9] : [-3.8, 2.1, -4.8],
      aim: [x * 0.7, 0.8, opening ? 6.2 : Math.min(9, 1.2 + z * 0.62)] };
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
  return Object.freeze({ create, pose, poseOut, DURATION, OUT_DURATION, OUT_SETTLE, OUT_REDUCE_SPEED, DEFAULT, settings, bindSettings });
})();
