/* Pit-work arrival: a render-clock sequence, independent of race simulation. */
const GarageArrival = (function () {
  "use strict";
  const DOOR_S = 1.8;
  const ease = GarageCrewDraw.ease;
  const DEFAULT = Object.freeze({ enabled: true, speed: 1, angle: "cut", fov: 54, enterCrew: "mix", leaveCrew: "mix" });
  // THE CREWS each way: the shipped five, MIX (a different one every visit) and
  // the Blender-authored variants (GarageCrewChoreo.IDS, js/garage/crew-choreo.js).
  const SHARED = ["mix", "current", "guides", "service", "welcome", "none"];
  const crewIds = (dir) => SHARED.concat(typeof GarageCrewChoreo !== "undefined" ? GarageCrewChoreo.IDS[dir] : []);
  /* MIX, resolved once per playback: the first read of a config object picks
   * the visit's crew and every later read of the same object (pose, poseOut,
   * duration, finish) gets the same one. Each playback reads a fresh object
   * (settings() / Object.assign), so the next visit takes the next crew. The
   * count persists, so a reload does not restart the rotation. */
  const _picked = new WeakMap();
  let _visit = null;
  function nextVisit() {
    if (_visit === null) {
      _visit = 0;
      try { const v = typeof localStorage !== "undefined" && Number(localStorage.getItem("apex26.crewVisit")); if (v > 0) _visit = v | 0; } catch (_) { /* no storage */ }
    }
    const n = _visit++;
    try { if (typeof localStorage !== "undefined") localStorage.setItem("apex26.crewVisit", String(_visit)); } catch (_) { /* private mode */ }
    return n;
  }
  function crewFor(config, dir) {
    const key = dir === "out" ? "leaveCrew" : "enterCrew", v = config && config[key];
    if (v !== "mix") return v || "current";
    if (typeof GarageCrewChoreo === "undefined") return "current";
    let memo = _picked.get(config);
    if (!memo) { memo = {}; _picked.set(config, memo); }
    if (!memo[key]) memo[key] = GarageCrewChoreo.pick(dir, nextVisit());
    return memo[key];
  }
  function settings(value) {
    const v = value && typeof value === "object" ? value : {};
    const number = (key, lo, hi) => typeof v[key] === "number" && Number.isFinite(v[key])
      ? Math.max(lo, Math.min(hi, v[key])) : DEFAULT[key];
    const crew = (key) => crewIds(key === "leaveCrew" ? "out" : "in").includes(v[key]) ? v[key] : DEFAULT[key];
    return { enabled: v.enabled !== false, speed: number("speed", 0.5, 2),
      angle: ["cut", "left", "right"].includes(v.angle) ? v.angle : "cut", fov: number("fov", 40, 75),
      enterCrew: crew("enterCrew"), leaveCrew: crew("leaveCrew") };
  }
  /** opts.preview(dir, btn): PREVIEW IN / OUT ("in" | "out") start one playback
   *  and return whether it started; preview(null) stops one and returns whether
   *  one was playing (js/garage/setup-camera.js startArrivalPreview).
   *  opts.changed(): after every saved edit, so a running preview re-poses. */
  /* THE ANGLE MAP: a plan of the bay under GARAGE ANGLE — walls, the door, the
   * pit lane, the parked car and the two interior eyes (EYE_L / EYE_R) with a
   * cone toward the door — the chosen one(s) lit, so LEFT / RIGHT / CUT are a
   * picture rather than a word. Pure: the inner SVG for an angle. Bay x maps to
   * 10..110, z (back -6.4 .. door 6.4) to 8..92, the lane below the door. */
  function angleMap(angle) {
    const X = (x) => (60 + x * 100 / 10.8).toFixed(1), Z = (z) => (50 + z * 84 / 12.8).toFixed(1);
    const on = (left) => angle === "cut" || angle === (left ? "left" : "right");
    const eye = (e, left, n) => {
      const lit = on(left), x = X(e[0]), z = Z(e[2]);
      return `<path d="M${x} ${z}L${X(-2.7)} ${Z(6.4)}L${X(2.7)} ${Z(6.4)}Z" fill="currentColor" opacity="${lit ? 0.22 : 0.06}"/>`
        + `<circle cx="${x}" cy="${z}" r="5" fill="${lit ? "#e10600" : "none"}" stroke="currentColor" stroke-width="1.5"/>`
        + (angle === "cut" ? `<text x="${x}" y="${(+z + 3.5).toFixed(1)}" font-size="8" text-anchor="middle" fill="#fff">${n}</text>` : "");
    };
    return `<rect x="10" y="8" width="100" height="84" fill="none" stroke="currentColor" stroke-width="2"/>`
      + `<line x1="${X(-2.7)}" y1="${Z(6.4)}" x2="${X(2.7)}" y2="${Z(6.4)}" stroke="#2a2a2e" stroke-width="4"/>`
      + `<rect x="4" y="96" width="112" height="16" fill="currentColor" opacity="0.12"/>`
      + `<rect x="${X(-0.9)}" y="${Z(-2.8)}" width="${(1.8 * 100 / 10.8).toFixed(1)}" height="${(5.6 * 84 / 12.8).toFixed(1)}" rx="3" fill="currentColor" opacity="0.5"/>`
      + eye(EYE_L, true, angle === "cut" ? 1 : "") + eye(EYE_R, false, 2);
  }
  function bindSettings($, store, opts = {}) {
    const preview = typeof opts.preview === "function" ? opts.preview : null;
    const changed = typeof opts.changed === "function" ? opts.changed : null;   // a running preview re-poses
    const read = () => settings(store.get("garageArrival", null));
    const fields = { enabled: $("ga-enabled"), speed: $("ga-speed"), angle: $("ga-angle"), fov: $("ga-fov"),
      enterCrew: $("ga-crew-in"), leaveCrew: $("ga-crew-out") };
    // MIX and the Blender crews (GarageCrewChoreo) join each crew picker from
    // their own table, once: the static five stay index.html's.
    const option = (value, text) => { const o = document.createElement("option"); o.value = value; o.textContent = text; return o; };
    for (const [key, dir] of [["enterCrew", "in"], ["leaveCrew", "out"]]) {
      const el = fields[key], ids = typeof GarageCrewChoreo !== "undefined" ? GarageCrewChoreo.IDS[dir] : [];
      if (!el || !el.add || !el.options || typeof document === "undefined" || Array.from(el.options).some((o) => o.value === "mix")) continue;
      el.add(option("mix", "MIX: NEW CREW EACH VISIT"), 0);
      const none = Array.from(el.options).find((o) => o.value === "none") || null;
      for (const id of ids) el.add(option(id, GarageCrewChoreo.label(id)), none);
    }
    function refresh() {
      const value = read();
      for (const key of Object.keys(fields)) {
        const el = fields[key];
        if (key === "enabled") el.checked = value[key];
        else el.value = String(value[key]);
      }
      // The angle map lives next to the selector it explains (made once, here:
      // the panel's markup is index.html's, this picture is the setting's).
      const sel = $("ga-angle");
      let map = $("ga-angle-map");
      if (!map && sel && sel.insertAdjacentHTML) {
        sel.insertAdjacentHTML("afterend", '<svg id="ga-angle-map" viewBox="0 0 120 116" role="img"></svg>');
        map = $("ga-angle-map");
      }
      if (map) {
        map.innerHTML = angleMap(value.angle);
        if (map.setAttribute) map.setAttribute("aria-label", value.angle === "cut" ? "Two camera cut: left of the bay, then right"
          : (value.angle === "left" ? "Left" : "Right") + " of the bay, looking out of the door");
      }
    }
    for (const key of Object.keys(fields)) fields[key].onchange = () => {
      const el = fields[key], value = read();
      value[key] = key === "enabled" ? el.checked : key === "speed" || key === "fov" ? Number(el.value) : el.value;
      store.set("garageArrival", settings(value)); refresh();
      if (changed) changed();
    };
    $("ga-reset").onclick = () => { store.set("garageArrival", null); refresh(); if (changed) changed(); };
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
  /* ONE PATH, BOTH WAYS. The drive-out leaves the box along it (straight out of
   * the door to OUT_STRAIGHT, a quarter arc of OUT_R metres into the lane, then
   * down the lane); the arrival runs the lane the other way, stops just past the
   * box, and backs in along the same arc, the way a crew pushes a car back into
   * its garage. side +1 / -1 is the lane direction away from the camera's eye
   * (x and yaw ride the pose; setup-camera.js builds the car matrix from them). */
  const OUT_STRAIGHT = 8, OUT_R = 5, OUT_TURN = Math.PI / 2, OUT_PATH = OUT_STRAIGHT + OUT_R * OUT_TURN;
  function pathAt(s, side) {
    const th = Math.min(OUT_TURN, Math.max(0, s - OUT_STRAIGHT) / OUT_R), past = Math.max(0, s - OUT_PATH);
    const z = (s < OUT_STRAIGHT ? Math.max(0, s) : OUT_STRAIGHT + OUT_R * Math.sin(th)) + past * Math.cos(th);
    return { x: side * (OUT_R * (1 - Math.cos(th)) + past * Math.sin(th)), z, yaw: side * th };
  }
  const EYE_L = [-3.8, 2.1, -4.8], EYE_R = [4.1, 2.25, -4.9];
  // HANDHELD: a slow, small sway on both shots, as if someone were filming from
  // the back of the bay. Off when `calm` (reduce motion); timing never changes.
  function shot(out, eye, aim, t, calm) {
    out.eye = eye.slice(); out.aim = aim;
    if (calm) return out;
    out.eye[0] += 0.022 * Math.sin(1.3 * t) + 0.010 * Math.sin(3.1 * t + 1);
    out.eye[1] += 0.014 * Math.sin(1.7 * t + 2);
    aim[0] += 0.028 * Math.sin(0.9 * t + 0.5); aim[1] += 0.018 * Math.sin(1.2 * t + 1.3);
    return out;
  }
  // THE ARRIVAL (WORK ON CAR): the shutter opens (DOOR_S) on an empty lane, the
  // car comes up the lane past the box (IN_LANE s, braking to a stop IN_LANE_M
  // metres along, just past the door and in view), sits a beat, then backs in
  // along the drive-out's own arc (IN_BACK s) and parks, nose to the pit lane.
  const IN_LANE = 2.6, IN_LANE_M = 22, IN_PAUSE = 0.4, IN_BACK = 3.6;
  const DURATION = DOOR_S + IN_LANE + IN_PAUSE + IN_BACK + 0.3;
  function duration(config = DEFAULT, dir = "in") {
    const crew = crewFor(config, dir), service = crew === "service";
    const extra = service ? (dir === "out" ? 3 : 6) : typeof GarageCrewChoreo !== "undefined" ? GarageCrewChoreo.extra(crew) : 0;
    return (dir === "out" ? OUT_DURATION : DURATION) + extra;
  }
  function pose(seconds, config = DEFAULT, calm = false) {
    const t = Math.max(0, Number.isFinite(seconds) ? seconds : 0), end = duration(config);
    const left = config.angle === "left" || (config.angle !== "right" && t < DOOR_S);
    const side = config.angle === "left" ? 1 : -1;   // away from the eye that watches it in (after the door)
    const u = Math.max(0, Math.min(1, (t - DOOR_S) / IN_LANE)), lane = IN_LANE_M * (1 - (1 - u) * (1 - u));
    const back = ease((t - DOOR_S - IN_LANE - IN_PAUSE) / IN_BACK);
    const p = back > 0 ? pathAt(OUT_PATH * (1 - back), side)
      : { x: side * (OUT_R + lane - IN_LANE_M), z: OUT_STRAIGHT + OUT_R, yaw: side * OUT_TURN };
    return shot({ active: t < end, serviceTime: t - (DURATION - .3), seconds: t, direction: "in", side, calm, crewClear: 1 - ease((t - (DURATION - .6)) / .3), crew: crewFor(config, "in"), fov: config.fov, door: ease(t / DOOR_S), x: p.x, z: p.z, yaw: p.yaw,
      label: t < DOOR_S ? "OPENING GARAGE" : t < DURATION - 0.3 ? "BRINGING CAR IN" : end > DURATION && t < end - .5 ? "CREW SERVICING CAR" : "READY FOR WORK" },
      // Interior versions of garage-angles' bay/rear three-quarter framings.
      // A cut after the shutter opens keeps both eyes behind the threshold.
      left ? EYE_L : EYE_R,
      [Math.max(-3.5, Math.min(3.5, p.x * 0.7)), 0.8, t < DOOR_S ? 6.2 : Math.min(9, p.z * 0.48 + 0.8)], t, calm);
  }
  /* THE DRIVE-OUT: the arrival in reverse, opening every RACE! while the circuit
   * builds (js/game.js studioOpen). The shutter opens first (DOOR_S), the car sits
   * a beat, then rolls out nose first, sweeps across the doorway into the lane
   * and goes on down it at the PIT LIMITER — the speed it turned in at, no
   * launch — so it is seen leaving (~1.4 s in the doorway's view, 2026-10-14)
   * before the garage's front wall hides it. No circuit is needed — this is the
   * setup screen's own room — so it plays the moment START is pressed.
   * Reduce-motion Start Race plays it too, AT THE TUNER'S PACE: the 4x short cut
   * (~1.9 s) read as a glitch, not a leave (2026-10-09), and the card, the flyby
   * and the announcer always follow it (js/ui/loading-screen.js run). */
  const OUT_HOLD = 1.1, OUT_RUN = 5.0, OUT_ACCEL = 1.2, OUT_EXIT_M = 8.5;
  const OUT_V = OUT_PATH / (OUT_RUN - OUT_ACCEL / 2), OUT_EXIT = OUT_EXIT_M / OUT_V;
  const OUT_SETTLE = DOOR_S + OUT_HOLD + OUT_RUN + OUT_EXIT;   // gone behind the wall: the car holds from here
  const OUT_DURATION = OUT_SETTLE + 0.3;                         // a beat on the empty lane
  // THE EMPTY-LANE HOLD: studioDone keeps this shot up past OUT_DURATION until
  // RACE!'s load is done (seconds on a slow phone). A slow push toward the
  // doorway (HOLD_PUSH m, easing out over ~HOLD_TAU s) keeps it a shot, not a
  // stalled frame; the aim drifts from the jamb back to the lane. Not when calm.
  const HOLD_PUSH = 2.2, HOLD_TAU = 4;
  function outDistance(tm) {
    if (tm <= 0) return 0;
    if (tm < OUT_ACCEL) return OUT_V * tm * tm / (2 * OUT_ACCEL);
    return OUT_V * (Math.min(tm, OUT_RUN + OUT_EXIT) - OUT_ACCEL / 2);
  }
  function poseOut(seconds, config = DEFAULT, calm = false) {
    const t = Math.max(0, Number.isFinite(seconds) ? seconds : 0), end = duration(config,"out"), delay = end - OUT_DURATION, settle = OUT_SETTLE + delay;
    const right = config.angle === "right", side = right ? -1 : 1;   // turn away from the eye
    const opening = t < DOOR_S;
    const p = pathAt(outDistance(Math.min(t, settle) - DOOR_S - OUT_HOLD - delay), side);
    const eye = right ? EYE_R : EYE_L;
    // The aim follows it round to the jamb and holds on the doorway as it goes.
    const aim = [side * Math.min(side * p.x * 0.7, 3.5), 0.8, opening ? 6.2 : Math.min(9, 1.2 + p.z * 0.62)];
    let e = eye;
    if (!calm && t > settle) {
      const k = 1 - Math.exp(-(t - settle) / HOLD_TAU);
      e = [eye[0] * (1 - 0.25 * k), eye[1] - 0.25 * k, eye[2] + HOLD_PUSH * k];
      aim[0] -= side * 2.2 * k;
    }
    return shot({ active: t < end, serviceTime: t, seconds: t, direction: "out", side, calm, crewClear: ease((t - (DOOR_S + OUT_HOLD + delay - .3)) / .3), crew: crewFor(config, "out"), fov: config.fov, door: ease(t / DOOR_S), x: p.x, z: p.z, yaw: p.yaw,
      label: delay && t < 5.2 ? "CREW CLEARING CAR" : opening ? "OPENING GARAGE" : "LEAVING THE GARAGE" }, e, aim, t, calm);
  }
  // The most one frame gap may credit: a slow GPU's 1–2 s frames play in real
  // time, while one hitch (a pack upload, a short app switch) cannot skip the show
  const MAX_GAP_S = 2.5;
  function wallNow() { try { return performance.now() / 1000; } catch (_) { return 0; } }
  function create($, reducedMotion, readSettings = () => DEFAULT, clock = wallNow) {
    let state = null, time = 0, config = DEFAULT, last = 0;
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
      time = duration(config); state = pose(time, config);
      chrome(false);
      $("cs-done").focus({ preventScroll: true });
    }
    function start() {
      config = settings(readSettings());
      time = 0; last = 0; state = pose(0, config);   // seeded at the first step: the entry frame's own cost is not show time
      if (!config.enabled || reducedMotion()) { finish(); return; }
      label.textContent = state.label;
      chrome(true); skip.focus({ preventScroll: true });
    }
    function step(dt) {
      if (state && state.active) {
        // WALL clock, not only the render dt (capped at 0.1 s per frame): on a
        // GPU drawing a frame every 2 s that cap played the arrival — and kept
        // the setup sheet inert — at a twentieth of real time (#3511), the
        // drive-out's slow-motion bug (setup-camera.js stepDriveOut) again.
        // One gap longer than the whole arrival is a suspended or hidden tab,
        // not a frame of the show (bound after Merlin's #3546): it keeps the
        // 0.1 s bound, so a background tab still cannot swallow the arrival;
        // a shorter one credits at most MAX_GAP_S.
        const now = clock(), gap = last ? now - last : 0;
        last = now;
        const capped = Math.min(0.1, Math.max(0, Number.isFinite(dt) ? dt : 0));
        time += Math.max(capped, gap > 0 && gap <= duration(config) / config.speed ? Math.min(gap, MAX_GAP_S) : 0) * config.speed;
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
  return Object.freeze({ create, pose, poseOut, duration, crewFor, angleMap, DURATION, OUT_DURATION, OUT_SETTLE, DEFAULT, settings, bindSettings });
})();
