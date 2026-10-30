/* Pit-work arrival: a render-clock sequence, independent of race simulation. */
const GarageArrival = (function () {
  "use strict";
  const DOOR_S = 1.8;
  const ease = GarageCrewDraw.ease;
  const DEFAULT = Object.freeze({ enabled: true, speed: 1, angle: "cut", fov: 54, enterCrew: "mix", leaveCrew: "mix",
    shots: Object.freeze(["left", "right", "right"]), height: 0, door: DOOR_S, hold: null, carSpeed: 1, endBeat: 0,
    afterRace: true, homeCrew: "auto", result: "win" });
  /* THE CAMERAS (bay metres, the car parked at the origin nose to the door at
   * z +6.4): LEFT / RIGHT are the two shipped interior eyes; HIGH a ceiling
   * corner over the back-left (under the ceiling truss, whose 4.6 m beam filled
   * half the frame from 4.3 m), LOW a floor-level eye off the right rear wheel,
   * DOOR just inside the left jamb. All stay inside the walls (scene.js culls a
   * wall's furniture by the eye's side of it). A PRESET is one camera per SHOT:
   * shot 1 the shutter, shot 2 the car on the move (approach / roll-out), shot 3
   * the finish (back-in and park / leaving down the lane). CUT is the shipped
   * left-then-right in and left out; CUSTOM reads config.shots. */
  const CAMS = Object.freeze({ left: [-3.8, 2.1, -4.8], right: [4.1, 2.25, -4.9], high: [-4.6, 3.5, -5.7], low: [2.7, 0.45, -3.9], door: [-2.3, 1.35, 5.7] });
  const CAM_IDS = Object.freeze(Object.keys(CAMS));
  const PRESETS = Object.freeze({
    cut: { in: ["left", "right", "right"], out: ["left", "left", "left"] },
    director: { in: ["door", "left", "high"], out: ["high", "low", "door"] },
  });
  const ANGLES = Object.freeze(["cut"].concat(CAM_IDS, ["director", "custom"]));
  function shotsFor(config, dir) {
    const a = config && config.angle;
    if (a === "custom") return config.shots && config.shots.length === 3 ? config.shots : DEFAULT.shots;
    if (CAMS[a]) return [a, a, a];
    return (PRESETS[a] || PRESETS.cut)[dir === "out" ? "out" : "in"];
  }
  /* AFTER THE RACE (the "home" sequence): the arrival's shape, flavoured by how
   * the race ended. lane / back scale the drive (a winner idles up the lane, a
   * retired car is PUSHED, smoothstep, no engine), pause and end add beats, crew
   * is HOME CREW's AUTO pick. Captions: arriving, backing in, the held title. */
  const RESULTS = Object.freeze({
    win: { lane: 1.35, back: 1, pause: 1.4, end: 1.5, crew: "welcome", arrive: "RACE WINNER · COMING HOME", park: "WELCOME BACK, WINNER", title: "RACE WINNER" },
    podium: { lane: 1.2, back: 1, pause: 0.9, end: 1, crew: "welcome", arrive: "PODIUM FINISH · COMING HOME", park: "WELCOME BACK", title: "PODIUM FINISH" },
    points: { lane: 1, back: 1, pause: 0.4, end: 0.5, crew: "current", arrive: "IN THE POINTS · COMING HOME", park: "BRINGING CAR IN", title: "POINTS FINISH" },
    finish: { lane: 1, back: 1, pause: 0, end: 0, crew: "current", arrive: "RACE COMPLETE · COMING HOME", park: "BRINGING CAR IN", title: "RACE COMPLETE" },
    dnf: { lane: 2.2, back: 1.4, pause: 0.3, end: 0.5, crew: "guides", pushed: true, arrive: "RETIRED · CREW RECOVERING CAR", park: "PUSHING CAR IN", title: "RETIRED" },
  });
  /** The player's race, as a RESULTS key: retired or disqualified, P1, P2-3, a
   *  points place (top 10; a sprint's top 8), else finished. */
  function resultKind(pos, out, sprint) {
    if (out) return "dnf";
    const p = Number(pos) | 0;
    return p === 1 ? "win" : p > 1 && p <= 3 ? "podium" : p > 3 && p <= (sprint ? 8 : 10) ? "points" : "finish";
  }
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
    const key = dir === "out" ? "leaveCrew" : dir === "home" ? "homeCrew" : "enterCrew";
    let v = config && config[key];
    if (dir === "home" && (!v || v === "auto")) v = (RESULTS[config && config.result] || RESULTS.finish).crew;
    if (v !== "mix") return v || "current";
    if (typeof GarageCrewChoreo === "undefined") return "current";
    let memo = _picked.get(config);
    if (!memo) { memo = {}; _picked.set(config, memo); }
    if (!memo[key]) memo[key] = GarageCrewChoreo.pick(dir === "out" ? "out" : "in", nextVisit());
    return memo[key];
  }
  function settings(value) {
    const v = value && typeof value === "object" ? value : {};
    const number = (key, lo, hi) => typeof v[key] === "number" && Number.isFinite(v[key])
      ? Math.max(lo, Math.min(hi, v[key])) : DEFAULT[key];
    const crew = (key) => crewIds(key === "leaveCrew" ? "out" : "in").includes(v[key]) ? v[key] : DEFAULT[key];
    const shots = Array.isArray(v.shots) && v.shots.length === 3 ? v.shots.map((c, i) => CAMS[c] ? c : DEFAULT.shots[i]) : DEFAULT.shots.slice();
    return { enabled: v.enabled !== false, speed: number("speed", 0.5, 2),
      angle: ANGLES.includes(v.angle) ? v.angle : "cut", fov: number("fov", 40, 75),
      enterCrew: crew("enterCrew"), leaveCrew: crew("leaveCrew"),
      shots, height: number("height", -1, 1.5), door: number("door", 0.6, 4),
      // HOLD BEAT: null keeps each sequence's own (0.4 s in, 1.1 s out).
      hold: typeof v.hold === "number" && Number.isFinite(v.hold) ? Math.max(0, Math.min(3, v.hold)) : null,
      carSpeed: number("carSpeed", 0.5, 2), endBeat: number("endBeat", 0, 3),
      afterRace: v.afterRace !== false,
      homeCrew: v.homeCrew === "auto" || crewIds("in").includes(v.homeCrew) ? v.homeCrew : DEFAULT.homeCrew,
      result: RESULTS[v.result] ? v.result : DEFAULT.result };
  }
  /** opts.preview(dir, btn): PREVIEW IN / OUT ("in" | "out") start one playback
   *  and return whether it started; preview(null) stops one and returns whether
   *  one was playing (js/garage/setup-camera.js startArrivalPreview). */
  /* THE ANGLE MAP: a plan of the bay under GARAGE ANGLE — walls, the door, the
   * pit lane, the parked car and the five eyes (CAMS) with a cone toward the
   * door — the ones the arrival uses lit and, when it cuts, numbered by shot, so
   * the preset is a picture rather than a word. Pure: the inner SVG for an angle
   * (and CUSTOM's shots). Bay x maps to 10..110, z (back -6.4 .. door 6.4) to
   * 8..92, the lane below the door. */
  function angleMap(angle, shots) {
    const X = (x) => (60 + x * 100 / 10.8).toFixed(1), Z = (z) => (50 + z * 84 / 12.8).toFixed(1);
    const used = shotsFor({ angle, shots: Array.isArray(shots) ? shots : DEFAULT.shots }, "in");
    const cuts = new Set(used).size > 1;
    const eye = (id) => {
      const e = CAMS[id], lit = used.includes(id), x = X(e[0]), z = Z(e[2]);
      const n = used.indexOf(id) + 1;   // the first shot it films
      return `<path d="M${x} ${z}L${X(-2.7)} ${Z(6.4)}L${X(2.7)} ${Z(6.4)}Z" fill="currentColor" opacity="${lit ? 0.22 : 0.04}"/>`
        + `<circle cx="${x}" cy="${z}" r="5" fill="${lit ? "#e10600" : "none"}" stroke="currentColor" stroke-width="${lit ? 1.5 : 0.8}"/>`
        + (cuts && lit ? `<text x="${x}" y="${(+z + 3.5).toFixed(1)}" font-size="8" text-anchor="middle" fill="#fff">${n}</text>` : "");
    };
    return `<rect x="10" y="8" width="100" height="84" fill="none" stroke="currentColor" stroke-width="2"/>`
      + `<line x1="${X(-2.7)}" y1="${Z(6.4)}" x2="${X(2.7)}" y2="${Z(6.4)}" stroke="#2a2a2e" stroke-width="4"/>`
      + `<rect x="4" y="96" width="112" height="16" fill="currentColor" opacity="0.12"/>`
      + `<rect x="${X(-0.9)}" y="${Z(-2.8)}" width="${(1.8 * 100 / 10.8).toFixed(1)}" height="${(5.6 * 84 / 12.8).toFixed(1)}" rx="3" fill="currentColor" opacity="0.5"/>`
      + CAM_IDS.map(eye).join("");
  }
  const CAM_NAMES = Object.freeze({ left: "left of the bay", right: "right of the bay", high: "high corner", low: "floor level", door: "door jamb" });
  /* THE ROWS BEYOND THE SHIPPED FORM, built from these tables into #ga-rows once
   * (index.html's node budget is shrink-only: tests/data/ratchets.json shellNodes).
   * A row: [id, label, options as [value, text] | "check"];
   * a string is a help line; { group, rows } a block CUSTOM shows and hides. The
   * extra GARAGE ANGLE presets join #ga-angle's shipped three the same way. */
  const CAM_TEXT = Object.freeze({ left: "LEFT BAY", right: "RIGHT BAY", high: "HIGH CORNER", low: "FLOOR LEVEL", door: "DOOR JAMB" });
  const camOpts = () => CAM_IDS.map((id) => [id, CAM_TEXT[id]]);
  const crewOpts = (first) => [first, ["current", "GARAGE CREW"], ["guides", "GUIDE CREW"], ["service", "SERVICE CREW"], ["welcome", "WELCOME CREW"], ["none", "NO CREW"]];
  const AFTER_ANGLE = [
    { group: "ga-shots-row", rows: ["Shot 1 is the shutter, shot 2 the car on the move, shot 3 the finish (backing in, or leaving down the lane).",
      ["ga-shot1", "SHOT 1 CAMERA", camOpts()], ["ga-shot2", "SHOT 2 CAMERA", camOpts()], ["ga-shot3", "SHOT 3 CAMERA", camOpts()]] },
    ["ga-height", "CAMERA HEIGHT", [["-1", "LOWER · −1 M"], ["-0.5", "LOWER · −0.5 M"], ["0", "AS SET"], ["0.5", "HIGHER · +0.5 M"], ["1", "HIGHER · +1 M"], ["1.5", "HIGHER · +1.5 M"]]],
  ];
  const AFTER_FOV = [
    "SHOT LENGTHS. SHUTTER SHOT is how long the door takes to open, HOLD BEAT the pause before the car moves (coming in: once it stops in the lane), CAR SPEED how fast it drives or is pushed, END BEAT how long the last shot lingers. PLAYBACK SPEED scales all of it.",
    ["ga-door", "SHUTTER SHOT", [["1", "QUICK · 1 S"], ["1.8", "NORMAL · 1.8 S"], ["2.5", "SLOW · 2.5 S"], ["3.5", "LONG · 3.5 S"]]],
    ["ga-hold", "HOLD BEAT", [["auto", "AUTO"], ["0", "NONE"], ["0.5", "0.5 S"], ["1", "1 S"], ["2", "2 S"], ["3", "3 S"]]],
    ["ga-carspeed", "CAR SPEED", [["0.5", "CRAWL · 0.5×"], ["0.75", "EASY · 0.75×"], ["1", "PIT LIMITER · 1×"], ["1.5", "BRISK · 1.5×"], ["2", "QUICK · 2×"]]],
    ["ga-endbeat", "END BEAT", [["0", "NONE"], ["0.5", "0.5 S"], ["1", "1 S"], ["2", "2 S"], ["3", "3 S"]]],
    "AFTER THE RACE: a winner idles up the lane to a welcome and a longer hold, a podium or points finish gets its own caption and beat, a retired car is pushed in by the crew with the engine off.",
    ["ga-after", "PLAY AFTER A RACE", "check"],
    ["ga-crew-home", "AFTER-RACE CREW", crewOpts(["auto", "BY RESULT"])],
    ["ga-result", "PREVIEW RESULT", [["win", "WIN"], ["podium", "PODIUM"], ["points", "POINTS"], ["finish", "FINISHED"], ["dnf", "RETIRED"]]],
  ];
  const ANGLE_TEXT = Object.freeze({ high: "HIGH CORNER", low: "FLOOR LEVEL", door: "DOOR JAMB", director: "DIRECTOR · THREE CAMERAS", custom: "CUSTOM · PICK EACH SHOT" });
  function buildRows($) {
    const doc = typeof document !== "undefined" && document.createElement ? document : null, angle = $("ga-angle"), fov = $("ga-fov");
    // Once: the presets' options are the mark (a second bindSettings builds nothing).
    if (!doc || !angle || !fov || !angle.closest || !fov.closest || Array.from(angle.children || []).some((o) => o.value === "custom")) return;
    for (const id of Object.keys(ANGLE_TEXT)) { const o = doc.createElement("option"); o.value = id; o.textContent = ANGLE_TEXT[id]; angle.appendChild(o); }
    const make = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
    const node = (r) => {
      if (typeof r === "string") return make("p", "adv-help", r);
      if (!Array.isArray(r)) { const g = make("div"); g.id = r.group; g.hidden = true; r.rows.forEach((x) => g.appendChild(node(x))); return g; }
      const [id, text, options] = r, row = make("div", "set-row"), label = make("label", "tune-label", text), cell = make("div");
      label.setAttribute("for", id);
      const input = make(options === "check" ? "input" : "select"); input.id = id;
      if (options === "check") input.type = "checkbox";
      else for (const [v, t] of options) { const o = make("option", "", t); o.value = v; input.appendChild(o); }
      cell.appendChild(input);
      row.appendChild(label); row.appendChild(cell);
      return row;
    };
    const after = (anchorRow, rows) => {
      const parent = anchorRow && anchorRow.parentNode;
      if (!parent) return;
      const kids = Array.from(parent.children), next = kids[kids.indexOf(anchorRow) + 1] || null;
      for (const r of rows) parent.insertBefore(node(r), next);
    };
    after(angle.closest(".set-row"), AFTER_ANGLE);
    after(fov.closest(".set-row"), AFTER_FOV);
    // PREVIEW AFTER RACE joins PREVIEW PIT STOP / RACE START wherever they are
    // (EditorWorkspace moves the foot's actions into its tools fold).
    const out = $("ga-preview-out");
    if (out && out.parentNode) {
      const b = make("button", "", "PREVIEW AFTER RACE"), kids = Array.from(out.parentNode.children);
      b.id = "ga-preview-home"; b.type = "button";
      out.parentNode.insertBefore(b, kids[kids.indexOf(out) + 1] || null);
    }
  }
  function bindSettings($, store, opts = {}) {
    const preview = typeof opts.preview === "function" ? opts.preview : null;
    const read = () => settings(store.get("garageArrival", null));
    buildRows($);
    const fields = { enabled: $("ga-enabled"), speed: $("ga-speed"), angle: $("ga-angle"), fov: $("ga-fov"),
      enterCrew: $("ga-crew-in"), leaveCrew: $("ga-crew-out"), height: $("ga-height"), door: $("ga-door"), hold: $("ga-hold"),
      carSpeed: $("ga-carspeed"), endBeat: $("ga-endbeat"), afterRace: $("ga-after"), homeCrew: $("ga-crew-home"), result: $("ga-result") };
    const shotEls = [$("ga-shot1"), $("ga-shot2"), $("ga-shot3")];
    const NUM = ["speed", "fov", "height", "door", "carSpeed", "endBeat"], CHECK = ["enabled", "afterRace"];
    // MIX and the Blender crews (GarageCrewChoreo) join each crew picker from
    // their own table, once: the static five stay index.html's.
    const option = (value, text) => { const o = document.createElement("option"); o.value = value; o.textContent = text; return o; };
    for (const [key, dir] of [["enterCrew", "in"], ["leaveCrew", "out"], ["homeCrew", "in"]]) {
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
        if (!el) continue;
        if (CHECK.includes(key)) el.checked = value[key];
        else el.value = key === "hold" && value.hold === null ? "auto" : String(value[key]);
      }
      shotEls.forEach((el, i) => { if (el) el.value = value.shots[i]; });
      // CUSTOM's three per-shot pickers only show under CUSTOM.
      const row = $("ga-shots-row");
      if (row) row.hidden = value.angle !== "custom";
      // The angle map lives next to the selector it explains (made once, here:
      // the panel's markup is index.html's, this picture is the setting's).
      const sel = $("ga-angle");
      let map = $("ga-angle-map");
      if (!map && sel && sel.insertAdjacentHTML) {
        sel.insertAdjacentHTML("afterend", '<svg id="ga-angle-map" viewBox="0 0 120 116" role="img"></svg>');
        map = $("ga-angle-map");
      }
      if (map) {
        map.innerHTML = angleMap(value.angle, value.shots);
        const used = shotsFor(value, "in");
        if (map.setAttribute) map.setAttribute("aria-label", value.angle === "cut" ? "Two camera cut: left of the bay, then right"
          : new Set(used).size === 1 ? "One camera, " + CAM_NAMES[used[0]] + ", looking out of the door"
          : "Three shots: " + used.map((c) => CAM_NAMES[c]).join(", then "));
      }
    }
    const save = (value) => { store.set("garageArrival", settings(value)); refresh(); };
    for (const key of Object.keys(fields)) if (fields[key]) fields[key].onchange = () => {
      const el = fields[key], value = read();
      value[key] = CHECK.includes(key) ? el.checked : NUM.includes(key) ? Number(el.value)
        : key === "hold" ? (el.value === "auto" ? null : Number(el.value)) : el.value;
      save(value);
    };
    shotEls.forEach((el, i) => { if (el) el.onchange = () => { const value = read(); value.shots[i] = el.value; save(value); }; });
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
    for (const [b, dir] of [[$("ga-preview-in"), "in"], [$("ga-preview-out"), "out"], [$("ga-preview-home"), "home"]]) {
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
  const EYE_L = CAMS.left, EYE_R = CAMS.right;
  // HANDHELD: a slow, small sway on both shots, as if someone were filming from
  // the back of the bay. Off when `calm` (reduce motion); timing never changes.
  // CAMERA HEIGHT lifts or drops every eye, kept above the floor and at most
  // 3.6 m up: the overhead rig hangs from ~4 m and filled half the frame of an
  // eye at 4.0-4.3 m (2026-10-30 captures, HIGH CORNER +0.5 m).
  function shot(out, eye, aim, t, calm, lift = 0) {
    out.eye = eye.slice(); out.aim = aim;
    if (lift) out.eye[1] = Math.max(0.3, Math.min(3.6, out.eye[1] + lift));
    if (calm) return out;
    out.eye[0] += 0.022 * Math.sin(1.3 * t) + 0.010 * Math.sin(3.1 * t + 1);
    out.eye[1] += 0.014 * Math.sin(1.7 * t + 2);
    aim[0] += 0.028 * Math.sin(0.9 * t + 0.5); aim[1] += 0.018 * Math.sin(1.2 * t + 1.3);
    return out;
  }
  // Where a non-shipped camera looks: the shutter while it lifts, then the car
  // (the DOOR eye, a metre off the shutter, watches the crew instead of it).
  function aimAt(cam, p, opening) {
    if (cam === "door") return opening ? [0.6, 1.0, -1.5] : [Math.max(-8, Math.min(8, p.x)), 0.55, Math.max(-2, p.z)];
    if (opening) return [0, cam === "high" ? 1.4 : 1.0, 6.2];
    return [Math.max(-4, Math.min(4, p.x * 0.85)), cam === "high" ? 0.3 : 0.7, Math.max(-2, Math.min(10, p.z * 0.85))];
  }
  // The lane turn goes away from the eye that watches the car go (or come) by.
  const sideFor = (cam) => CAMS[cam][0] < 0 ? 1 : -1;
  // THE ARRIVAL (WORK ON CAR): the shutter opens (DOOR_S) on an empty lane, the
  // car comes up the lane past the box (IN_LANE s, braking to a stop IN_LANE_M
  // metres along, just past the door and in view), sits a beat, then backs in
  // along the drive-out's own arc (IN_BACK s) and parks, nose to the pit lane.
  const IN_LANE = 2.6, IN_LANE_M = 22, IN_PAUSE = 0.4, IN_BACK = 3.6;
  const DURATION = DOOR_S + IN_LANE + IN_PAUSE + IN_BACK + 0.3;
  /* THE TIMELINE, from the tuner: SHUTTER SHOT (door), HOLD BEAT (hold, null =
   * the sequence's own), CAR SPEED (the drive's pace, not playback's) and END
   * BEAT; "home" adds its result's flavour. Defaults reproduce the shipped
   * constants exactly (DURATION / OUT_DURATION / OUT_SETTLE). */
  function timeline(config = DEFAULT, dir = "in") {
    const c = config || DEFAULT, door = Number.isFinite(c.door) ? c.door : DOOR_S;
    const car = Number.isFinite(c.carSpeed) && c.carSpeed > 0 ? c.carSpeed : 1, tail = Number.isFinite(c.endBeat) ? c.endBeat : 0;
    const hold = (dflt) => typeof c.hold === "number" ? c.hold : dflt;
    if (dir === "out") {
      const run = OUT_RUN / car, accel = OUT_ACCEL / car, v = OUT_PATH / (run - accel / 2);
      const settle = door + hold(OUT_HOLD) + run + OUT_EXIT_M / v;
      return { dir, door, hold: hold(OUT_HOLD), run, accel, v, settle, base: settle + 0.3 + tail };
    }
    const r = dir === "home" ? RESULTS[c.result] || RESULTS.finish : null;
    const lane = IN_LANE * (r ? r.lane : 1) / car, pause = hold(IN_PAUSE) + (r ? r.pause : 0), back = IN_BACK * (r ? r.back : 1) / car;
    const park = door + lane + pause + back;
    return { dir, door, lane, pause, back, park, base: park + 0.3 + tail + (r ? r.end : 0), result: r };
  }
  function duration(config = DEFAULT, dir = "in") {
    const crew = crewFor(config, dir), service = crew === "service";
    const extra = service ? (dir === "out" ? 3 : 6) : typeof GarageCrewChoreo !== "undefined" ? GarageCrewChoreo.extra(crew) : 0;
    return timeline(config, dir).base + extra;
  }
  function poseIn(seconds, config, calm, dir) {
    const t = Math.max(0, Number.isFinite(seconds) ? seconds : 0), T = timeline(config, dir), end = duration(config, dir), r = T.result;
    const cams = shotsFor(config, "in"), side = sideFor(cams[2]);
    const cam = t < T.door ? cams[0] : t < T.door + T.lane + T.pause ? cams[1] : cams[2];
    const u = Math.max(0, Math.min(1, (t - T.door) / T.lane));
    const lane = IN_LANE_M * (r && r.pushed ? ease(u) : 1 - (1 - u) * (1 - u));
    const back = ease((t - T.door - T.lane - T.pause) / T.back);
    const p = back > 0 ? pathAt(OUT_PATH * (1 - back), side)
      : { x: side * (OUT_R + lane - IN_LANE_M), z: OUT_STRAIGHT + OUT_R, yaw: side * OUT_TURN };
    const label = t < T.door ? "OPENING GARAGE"
      : r ? (t < T.door + T.lane + T.pause ? r.arrive : t < T.park ? r.park
        : (Number.isFinite(config.pos) && config.pos > 0 && dir === "home" && config.result !== "dnf" ? "P" + (config.pos | 0) + " · " : "") + r.title)
      : t < T.park ? "BRINGING CAR IN" : end > T.base && t < end - .5 ? "CREW SERVICING CAR" : "READY FOR WORK";
    // The shipped LEFT / RIGHT eyes keep their own framing; the new ones aim by aimAt.
    const aim = cam === "left" || cam === "right"
      ? [Math.max(-3.5, Math.min(3.5, p.x * 0.7)), 0.8, t < T.door ? 6.2 : Math.min(9, p.z * 0.48 + 0.8)] : aimAt(cam, p, t < T.door);
    return shot({ active: t < end, serviceTime: t - T.park, seconds: t, direction: "in", sequence: dir, result: r ? config.result : null,
      engine: !(r && r.pushed), side, calm, camera: cam, crewClear: 1 - ease((t - (T.park - .3)) / .3), crew: crewFor(config, dir), fov: config.fov,
      door: ease(t / T.door), x: p.x, z: p.z, yaw: p.yaw, label },
      // Interior versions of garage-angles' bay/rear three-quarter framings.
      // A cut after the shutter opens keeps both eyes behind the threshold.
      CAMS[cam], aim, t, calm, config.height || 0);
  }
  const pose = (seconds, config = DEFAULT, calm = false) => poseIn(seconds, config, calm, "in");
  /** AFTER THE RACE: config.result (RESULTS key) and an optional config.pos. */
  const poseHome = (seconds, config = DEFAULT, calm = false) => poseIn(seconds, config, calm, "home");
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
  function outDistance(tm, T) {
    if (tm <= 0) return 0;
    if (tm < T.accel) return T.v * tm * tm / (2 * T.accel);
    return T.v * (Math.min(tm, T.settle) - T.accel / 2);
  }
  function poseOut(seconds, config = DEFAULT, calm = false) {
    const t = Math.max(0, Number.isFinite(seconds) ? seconds : 0), T = timeline(config, "out"), end = duration(config, "out");
    const delay = end - T.base, settle = T.settle + delay, go = T.door + T.hold + delay;
    const cams = shotsFor(config, "out"), side = sideFor(cams[1]);
    const opening = t < T.door;
    const d = outDistance(Math.min(t, settle) - go, Object.assign({}, T, { settle: T.run + OUT_EXIT_M / T.v }));
    const p = pathAt(d, side);
    // Shot 2 runs from the roll to the doorway (z past 6 m), shot 3 from there.
    const cam = t < go ? cams[0] : d < 6 ? cams[1] : cams[2], eye = CAMS[cam];
    // The aim follows it round to the jamb and holds on the doorway as it goes.
    const legacy = cam === "left" || cam === "right", cs = legacy ? sideFor(cam) : side;
    const aim = legacy ? [cs * Math.min(cs * p.x * 0.7, 3.5), 0.8, opening ? 6.2 : Math.min(9, 1.2 + p.z * 0.62)] : aimAt(cam, p, opening);
    let e = eye;
    if (!calm && t > settle) {
      const k = 1 - Math.exp(-(t - settle) / HOLD_TAU);
      e = [eye[0] * (1 - 0.25 * k), eye[1] - 0.25 * k, Math.min(5.9, eye[2] + HOLD_PUSH * k)];
      aim[0] -= cs * 2.2 * k;
    }
    return shot({ active: t < end, serviceTime: t, seconds: t, direction: "out", sequence: "out", engine: true, side, calm, camera: cam,
      crewClear: ease((t - (go - .3)) / .3), crew: crewFor(config, "out"), fov: config.fov, door: ease(t / T.door), x: p.x, z: p.z, yaw: p.yaw,
      label: delay && t < 5.2 ? "CREW CLEARING CAR" : opening ? "OPENING GARAGE" : "LEAVING THE GARAGE" }, e, aim, t, calm, config.height || 0);
  }
  /** The pose function of a sequence: "in" (pit stop), "out" (race start), "home" (after the race). */
  const poseFor = (dir) => dir === "out" ? poseOut : dir === "home" ? poseHome : pose;
  // The most one frame gap may credit: a slow GPU's 1–2 s frames play in real
  // time, while one hitch (a pack upload, a short app switch) cannot skip the show
  const MAX_GAP_S = 2.5;
  function wallNow() { try { return performance.now() / 1000; } catch (_) { return 0; } }
  function create($, reducedMotion, readSettings = () => DEFAULT, clock = wallNow) {
    let state = null, time = 0, config = DEFAULT, last = 0, dir = "in", posed = pose;
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
      time = duration(config, dir); state = posed(time, config);
      chrome(false);
      $("cs-done").focus({ preventScroll: true });
    }
    /** start() = the pit-stop arrival (WORK ON CAR); start({ home: { result, pos } })
     *  = AFTER THE RACE, the car brought home as the race ended (RESULTS). */
    function start(opts) {
      const home = opts && opts.home;
      dir = home ? "home" : "in"; posed = poseFor(dir);
      config = settings(readSettings());
      if (home) Object.assign(config, { result: RESULTS[home.result] ? home.result : "finish", pos: home.pos });
      time = 0; last = 0; state = posed(0, config);   // seeded at the first step: the entry frame's own cost is not show time
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
        time += Math.max(capped, gap > 0 && gap <= duration(config, dir) / config.speed ? Math.min(gap, MAX_GAP_S) : 0) * config.speed;
        state = posed(time, config);
        if (label.textContent !== state.label) label.textContent = state.label;
        if (!state.active) finish();
      }
      return state;
    }
    function cancel() { state = null; time = 0; chrome(false); }
    skip.onclick = finish;
    return { start, step, cancel, finish, get state() { return state; } };
  }
  return Object.freeze({ create, pose, poseOut, poseHome, poseFor, duration, timeline, crewFor, angleMap, shotsFor, resultKind,
    CAMS, CAM_IDS, ANGLES, RESULTS, DURATION, OUT_DURATION, OUT_SETTLE, DEFAULT, settings, bindSettings });
})();
