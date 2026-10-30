/* Pit-work arrival: a render-clock sequence, independent of race simulation. */
const GarageArrival = (function () {
  "use strict";
  const DOOR_S = 1.8;
  const ease = GarageCrewDraw.ease;
  const DEFAULT = Object.freeze({ enabled: true, speed: 1, angle: "cut", fov: 54, enterCrew: "mix", leaveCrew: "mix",
    shots: Object.freeze(["left", "right", "right"]), height: 0, door: DOOR_S, hold: null, carSpeed: 1, endBeat: 0,
    afterRace: true, homeCrew: "auto", result: "win",
    move: "still", sway: 1, zoom: 0, light: "asset", homeLight: "auto", swell: 1, captions: true, bars: false, rearLight: "auto", slowmo: 0, sound: true, cue: "none", homeCue: "auto" });
  /* THE CAMERAS (bay metres, the car parked at the origin nose to the door at
   * z +6.4): LEFT / RIGHT are the two shipped interior eyes; HIGH a ceiling
   * corner over the back-left (under the ceiling truss, whose 4.6 m beam filled
   * half the frame from 4.3 m), LOW a floor-level eye off the right rear wheel,
   * DOOR just inside the shutter over the car's path (the car passes ~1.2 m under
   * it; at the left jamb it stood inside the WELCOME crew's line, x 2.0-3.2). All stay inside the walls (scene.js culls a
   * wall's furniture by the eye's side of it). A PRESET is one camera per SHOT:
   * shot 1 the shutter, shot 2 the car on the move (approach / roll-out), shot 3
   * the finish (back-in and park / leaving down the lane). CUT is the shipped
   * left-then-right in and left out; CUSTOM reads config.shots. */
  const CAMS = Object.freeze({ left: [-3.8, 2.1, -4.8], right: [4.1, 2.25, -4.9], high: [-4.6, 3.5, -5.7], low: [2.7, 0.45, -3.9], door: [-0.9, 2.2, 5.9] });
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
   * and light are AFTER-RACE CREW / LIGHTING's BY RESULT picks (crew: lane C's
   * Blender result clip in crew-choreo.js, crewAlt when that table is absent; light: a
   * GarageScene mood, absent = the garage's own). Captions: arriving, backing
   * in, the held title. */
  const RESULTS = Object.freeze({
    win: { lane: 1.35, back: 1, pause: 1.4, end: 1.5, crew: "celebrate", crewAlt: "welcome", light: "showroom", cue: "flashes", arrive: "RACE WINNER · COMING HOME", park: "WELCOME BACK, WINNER", title: "RACE WINNER" },
    podium: { lane: 1.2, back: 1, pause: 0.9, end: 1, crew: "applause", crewAlt: "welcome", light: "broadcast", cue: "pulse", arrive: "PODIUM FINISH · COMING HOME", park: "WELCOME BACK", title: "PODIUM FINISH" },
    points: { lane: 1, back: 1, pause: 0.4, end: 0.5, crew: "current", arrive: "IN THE POINTS · COMING HOME", park: "BRINGING CAR IN", title: "POINTS FINISH" },
    finish: { lane: 1, back: 1, pause: 0, end: 0, crew: "console", crewAlt: "current", arrive: "RACE COMPLETE · COMING HOME", park: "BRINGING CAR IN", title: "RACE COMPLETE" },
    dnf: { lane: 2.2, back: 1.4, pause: 0.3, end: 0.5, crew: "recover", crewAlt: "guides", light: "inspection", cue: "beacon", pushed: true, arrive: "RETIRED · CREW RECOVERING CAR", park: "PUSHING CAR IN", title: "RETIRED" },
  });
  /** The player's race, as a RESULTS key: retired or disqualified, P1, P2-3, a
   *  points place (top 10; a sprint's top 8), else finished. */
  /* THE LOOK: CAMERA MOVE (each shot pushes in, pulls out or drifts across, up
   * to MOVE_M metres; STILL is the shipped framing), HANDHELD (the sway's size),
   * FINAL SHOT ZOOM (degrees the last shot's lens closes by), SEQUENCE LIGHTING
   * (a GarageScene mood held while it plays; ASSET = the garage's own), DOOR
   * GLOW (the team-colour shutter swell's size), CAPTIONS and CINEMA BARS. */
  const MOVES = Object.freeze(["still", "push", "pull", "drift"]), MOVE_M = 1.2;
  // REAR LIGHT: the car's red rain light while it rolls. AUTO = at night or in
  // the wet (the shipped rule, setup-camera.js), FLASH = the FIA rain light's blink.
  const REAR = Object.freeze(["auto", "on", "off", "flash"]);
  const moodIds = () => typeof GarageScene !== "undefined" && GarageScene.MOODS ? Object.keys(GarageScene.MOODS) : [];
  /* LIGHT CUE: a Blender-keyframed GarageScene cue (scene.js CUES: lights up,
   * photo flashes, amber beacon, pulse, lights out) played over the sequence's
   * lighting from its first second; after the race, BY RESULT picks one. */
  const cueIds = () => typeof GarageScene !== "undefined" && GarageScene.CUES ? GarageScene.CUES.slice() : [];
  function cueFor(config, dir) {
    const c = config || DEFAULT;
    let v = dir === "home" ? c.homeCue : c.cue;
    if (dir === "home" && (!v || v === "auto")) v = (RESULTS[c.result] || RESULTS.finish).cue || "none";
    return v && v !== "none" && v !== "auto" ? v : null;
  }
  /** The mood a sequence plays under, or null for the garage's own. */
  function lightFor(config, dir) {
    const c = config || DEFAULT;
    let v = dir === "home" ? c.homeLight : c.light;
    if (dir === "home" && (!v || v === "auto")) v = (RESULTS[c.result] || RESULTS.finish).light || "asset";
    return v && v !== "asset" && v !== "auto" ? v : null;
  }
  function resultKind(pos, out, sprint) {
    if (out) return "dnf";
    const p = Number(pos) | 0;
    return p === 1 ? "win" : p > 1 && p <= 3 ? "podium" : p > 3 && p <= (sprint ? 8 : 10) ? "points" : "finish";
  }
  // THE CREWS each way: the shipped five, MIX (a different one every visit) and
  // the Blender-authored variants (GarageCrewChoreo.IDS, js/garage/crew-choreo.js).
  const SHARED = ["mix", "current", "guides", "service", "welcome", "none"];
  // A RESULT clip (CLIPS[id].result: celebrate, applause, recover, console) is timed
  // on poseHome's slower drive: AFTER-RACE CREW offers it, ENTER CREW does not.
  const resultClip = (id) => typeof GarageCrewChoreo !== "undefined" && !!(GarageCrewChoreo.CLIPS[id] && GarageCrewChoreo.CLIPS[id].result);
  const crewIds = (dir, results = false) => SHARED.concat(typeof GarageCrewChoreo !== "undefined"
    ? GarageCrewChoreo.IDS[dir].filter((id) => results || !resultClip(id)) : []);
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
    if (dir === "home" && (!v || v === "auto")) {
      const r = RESULTS[config && config.result] || RESULTS.finish;
      v = typeof GarageCrewChoreo !== "undefined" && GarageCrewChoreo.has(r.crew) ? r.crew : r.crewAlt;
    }
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
      angle: ALL_ANGLES.includes(v.angle) ? v.angle : "cut", fov: number("fov", 40, 75),
      enterCrew: crew("enterCrew"), leaveCrew: crew("leaveCrew"),
      shots, height: number("height", -1, 1.5), door: number("door", 0.6, 4),
      // HOLD BEAT: null keeps each sequence's own (0.4 s in, 1.1 s out).
      hold: typeof v.hold === "number" && Number.isFinite(v.hold) ? Math.max(0, Math.min(3, v.hold)) : null,
      carSpeed: number("carSpeed", 0.5, 2), endBeat: number("endBeat", 0, 3),
      afterRace: v.afterRace !== false,
      homeCrew: v.homeCrew === "auto" || crewIds("in", true).includes(v.homeCrew) ? v.homeCrew : DEFAULT.homeCrew,
      result: RESULTS[v.result] ? v.result : DEFAULT.result,
      move: MOVES.includes(v.move) ? v.move : DEFAULT.move, sway: number("sway", 0, 2), zoom: number("zoom", 0, 20),
      light: v.light === "asset" || moodIds().includes(v.light) ? v.light : DEFAULT.light,
      homeLight: v.homeLight === "auto" || v.homeLight === "asset" || moodIds().includes(v.homeLight) ? v.homeLight : DEFAULT.homeLight,
      swell: number("swell", 0, 2), captions: v.captions !== false, bars: v.bars === true,
      rearLight: REAR.includes(v.rearLight) ? v.rearLight : DEFAULT.rearLight,
      slowmo: typeof v.slowmo === "number" && v.slowmo > 0 && v.slowmo < 1 ? Math.max(0.1, v.slowmo) : 0,
      sound: v.sound !== false,
      cue: v.cue === "none" || cueIds().includes(v.cue) ? v.cue : DEFAULT.cue,
      homeCue: v.homeCue === "auto" || v.homeCue === "none" || cueIds().includes(v.homeCue) ? v.homeCue : DEFAULT.homeCue };
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
    const room = `<rect x="10" y="8" width="100" height="84" fill="none" stroke="currentColor" stroke-width="2"/>`
      + `<line x1="${X(-2.7)}" y1="${Z(6.4)}" x2="${X(2.7)}" y2="${Z(6.4)}" stroke="#2a2a2e" stroke-width="4"/>`
      + `<rect x="4" y="96" width="112" height="16" fill="currentColor" opacity="0.12"/>`
      + `<rect x="${X(-0.9)}" y="${Z(-2.8)}" width="${(1.8 * 100 / 10.8).toFixed(1)}" height="${(5.6 * 84 / 12.8).toFixed(1)}" rx="3" fill="currentColor" opacity="0.5"/>`;
    // A BLENDER RIG is a path, not a place: its eye's track over the arrival, start to finish.
    if (RIGS[angle]) {
      const pts = [];
      for (let i = 0; i <= 16; i++) { const e = rigSample(angle, "in", i / 16).eye; pts.push(X(e[0]) + " " + Z(e[2])); }
      const a = pts[0].split(" "), b = pts[16].split(" ");
      return room + `<polyline points="${pts.join(" ")}" fill="none" stroke="#e10600" stroke-width="2" stroke-dasharray="4 3"/>`
        + `<circle cx="${a[0]}" cy="${a[1]}" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/>`
        + `<circle cx="${b[0]}" cy="${b[1]}" r="5" fill="#e10600" stroke="currentColor" stroke-width="1.5"/>`;
    }
    return room + CAM_IDS.map(eye).join("");
  }
  const CAM_NAMES = Object.freeze({ left: "left of the bay", right: "right of the bay", high: "high corner", low: "floor level", door: "door jamb" });
  /* THE ROWS BEYOND THE SHIPPED FORM, built from these tables into #ga-rows once
   * (index.html's node budget is shrink-only: tests/data/ratchets.json shellNodes).
   * A row: [id, label, options as [value, text] (or a function making them: the
   * moods are GarageScene's) | "check"];
   * a string is a help line; { group, rows } a block CUSTOM shows and hides. The
   * extra GARAGE ANGLE presets join #ga-angle's shipped three the same way. */
  const CAM_TEXT = Object.freeze({ left: "LEFT BAY", right: "RIGHT BAY", high: "HIGH CORNER", low: "FLOOR LEVEL", door: "DOOR JAMB" });
  const camOpts = () => CAM_IDS.map((id) => [id, CAM_TEXT[id]]);
  const crewOpts = (first) => [first, ["current", "GARAGE CREW"], ["guides", "GUIDE CREW"], ["service", "SERVICE CREW"], ["welcome", "WELCOME CREW"], ["none", "NO CREW"]];
  const AFTER_ANGLE = [
    { group: "ga-shots-row", rows: ["Shot 1 is the shutter, shot 2 the car on the move, shot 3 the finish (backing in, or leaving down the lane).",
      ["ga-shot1", "SHOT 1 CAMERA", camOpts()], ["ga-shot2", "SHOT 2 CAMERA", camOpts()], ["ga-shot3", "SHOT 3 CAMERA", camOpts()]] },
    ["ga-height", "CAMERA HEIGHT", [["-1", "LOWER · −1 M"], ["-0.5", "LOWER · −0.5 M"], ["0", "AS SET"], ["0.5", "HIGHER · +0.5 M"], ["1", "HIGHER · +1 M"], ["1.5", "HIGHER · +1.5 M"]]],
    ["ga-move", "CAMERA MOVE", [["still", "STILL"], ["push", "PUSH IN"], ["pull", "PULL OUT"], ["drift", "DRIFT ACROSS"]]],
    ["ga-sway", "HANDHELD", [["0", "OFF · LOCKED OFF"], ["0.5", "LIGHT"], ["1", "NORMAL"], ["2", "HEAVY"]]],
    ["ga-zoom", "FINAL SHOT ZOOM", [["0", "NONE"], ["6", "SLIGHT · 6°"], ["12", "TIGHT · 12°"], ["20", "CLOSE · 20°"]]],
  ];
  const AFTER_FOV = [
    "SHOT LENGTHS. SHUTTER SHOT is how long the door takes to open, HOLD BEAT the pause before the car moves (coming in: once it stops in the lane), CAR SPEED how fast it drives or is pushed, END BEAT how long the last shot lingers. PLAYBACK SPEED scales all of it.",
    ["ga-door", "SHUTTER SHOT", [["1", "QUICK · 1 S"], ["1.8", "NORMAL · 1.8 S"], ["2.5", "SLOW · 2.5 S"], ["3.5", "LONG · 3.5 S"]]],
    ["ga-hold", "HOLD BEAT", [["auto", "AUTO"], ["0", "NONE"], ["0.5", "0.5 S"], ["1", "1 S"], ["2", "2 S"], ["3", "3 S"]]],
    ["ga-carspeed", "CAR SPEED", [["0.5", "CRAWL · 0.5×"], ["0.75", "EASY · 0.75×"], ["1", "PIT LIMITER · 1×"], ["1.5", "BRISK · 1.5×"], ["2", "QUICK · 2×"]]],
    ["ga-endbeat", "END BEAT", [["0", "NONE"], ["0.5", "0.5 S"], ["1", "1 S"], ["2", "2 S"], ["3", "3 S"]]],
    ["ga-slowmo", "SLOW-MO AT THE DOOR", [["0", "OFF"], ["0.5", "HALF SPEED"], ["0.25", "QUARTER SPEED"]]],
    "LIGHTING AND LOOK. SEQUENCE LIGHTING holds a garage lighting mood while a sequence plays (the garage's own comes back after); DOOR GLOW is the team-colour flood as the shutter lifts; CINEMA BARS letterbox the shot.",
    ["ga-light", "SEQUENCE LIGHTING", () => [["asset", "AS THE GARAGE"]].concat(moodOpts())],
    ["ga-cue", "LIGHT CUE", () => [["none", "NONE"]].concat(cueOpts())],
    ["ga-swell", "DOOR GLOW", [["0", "OFF"], ["0.5", "SOFT"], ["1", "NORMAL"], ["2", "BIG"]]],
    ["ga-rear", "REAR LIGHT", [["auto", "AUTO · NIGHT OR WET"], ["on", "ON"], ["flash", "FLASHING"], ["off", "OFF"]]],
    ["ga-sound", "ENGINE SOUND ON ARRIVAL", "check"],
    ["ga-captions", "CAPTIONS", "check"],
    ["ga-bars", "CINEMA BARS", "check"],
    "AFTER THE RACE: a winner idles up the lane to a welcome and a longer hold, a podium or points finish gets its own caption and beat, a retired car is pushed in by the crew with the engine off.",
    ["ga-after", "PLAY AFTER A RACE", "check"],
    ["ga-crew-home", "AFTER-RACE CREW", crewOpts(["auto", "BY RESULT"])],
    ["ga-light-home", "AFTER-RACE LIGHTING", () => [["auto", "BY RESULT"], ["asset", "AS THE GARAGE"]].concat(moodOpts())],
    ["ga-cue-home", "AFTER-RACE LIGHT CUE", () => [["auto", "BY RESULT"], ["none", "NONE"]].concat(cueOpts())],
    ["ga-result", "PREVIEW RESULT", [["win", "WIN"], ["podium", "PODIUM"], ["points", "POINTS"], ["finish", "FINISHED"], ["dnf", "RETIRED"]]],
  ];
  const MOOD_TEXT = Object.freeze({ shipped: "STANDARD", goldenhour: "GOLDEN HOUR", rain: "RAIN DAY", neon: "NEON NIGHT" });
  const moodOpts = () => moodIds().map((id) => [id, MOOD_TEXT[id] || id.toUpperCase()]);
  const cueOpts = () => cueIds().map((id) => [id, GarageScene.cueLabel ? GarageScene.cueLabel(id) : id.toUpperCase()]);
  const ANGLE_TEXT = Object.freeze({ high: "HIGH CORNER", low: "FLOOR LEVEL", door: "DOOR JAMB", director: "DIRECTOR · THREE CAMERAS", custom: "CUSTOM · PICK EACH SHOT" });
  function buildRows($) {
    const doc = typeof document !== "undefined" && document.createElement ? document : null, angle = $("ga-angle"), fov = $("ga-fov");
    // Once: the presets' options are the mark (a second bindSettings builds nothing).
    if (!doc || !angle || !fov || !angle.closest || !fov.closest || Array.from(angle.children || []).some((o) => o.value === "custom")) return;
    for (const id of Object.keys(ANGLE_TEXT)) { const o = doc.createElement("option"); o.value = id; o.textContent = ANGLE_TEXT[id]; angle.appendChild(o); }
    for (const id of RIG_IDS) { const o = doc.createElement("option"); o.value = id; o.textContent = "BLENDER · " + RIG_LABEL[id]; angle.appendChild(o); }
    const make = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
    const node = (r) => {
      if (typeof r === "string") return make("p", "adv-help", r);
      if (!Array.isArray(r)) { const g = make("div"); g.id = r.group; g.hidden = true; r.rows.forEach((x) => g.appendChild(node(x))); return g; }
      const [id, text, options] = r, row = make("div", "set-row"), label = make("label", "tune-label", text), cell = make("div");
      label.setAttribute("for", id);
      const input = make(options === "check" ? "input" : "select"); input.id = id;
      if (options === "check") input.type = "checkbox";
      else for (const [v, t] of typeof options === "function" ? options() : options) { const o = make("option", "", t); o.value = v; input.appendChild(o); }
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
      carSpeed: $("ga-carspeed"), endBeat: $("ga-endbeat"), afterRace: $("ga-after"), homeCrew: $("ga-crew-home"), result: $("ga-result"),
      move: $("ga-move"), sway: $("ga-sway"), zoom: $("ga-zoom"), light: $("ga-light"), swell: $("ga-swell"),
      captions: $("ga-captions"), bars: $("ga-bars"), homeLight: $("ga-light-home"), rearLight: $("ga-rear"), slowmo: $("ga-slowmo"), sound: $("ga-sound"), cue: $("ga-cue"), homeCue: $("ga-cue-home") };
    const shotEls = [$("ga-shot1"), $("ga-shot2"), $("ga-shot3")];
    const NUM = ["speed", "fov", "height", "door", "carSpeed", "endBeat", "sway", "zoom", "swell", "slowmo"], CHECK = ["enabled", "afterRace", "captions", "bars", "sound"];
    // MIX and the Blender crews (GarageCrewChoreo) join each crew picker from
    // their own table, once: the static five stay index.html's.
    const option = (value, text) => { const o = document.createElement("option"); o.value = value; o.textContent = text; return o; };
    for (const [key, dir] of [["enterCrew", "in"], ["leaveCrew", "out"], ["homeCrew", "in"]]) {
      const el = fields[key], ids = typeof GarageCrewChoreo !== "undefined" ? GarageCrewChoreo.IDS[dir].filter((id) => key === "homeCrew" || !resultClip(id)) : [];
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
        if (map.setAttribute) map.setAttribute("aria-label", RIGS[value.angle] ? "Blender camera rig, " + RIG_LABEL[value.angle].toLowerCase() + ": the eye's path through the arrival"
          : value.angle === "cut" ? "Two camera cut: left of the bay, then right"
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
  // @blender-rigs:start
  // Blender 5.2.3 LTS (bpy module); tools/gen/blender/garage-camera-rigs.py; 65 samples over u: eye, aim (cm), fov (0.1 deg).
  // Source SHA256: 068b797590b75fbde0a9241f39d9b80c333162d4239647ed5e09a35c89f08736
  const RIGS = {"crane":{"label":"CRANE","n":65,"in":[260,45,340,0,110,620,600,260,45,340,0,110,620,600,260,45,340,0,110,620,600,260,45,340,0,110,620,600,260,45,340,0,110,620,600,261,45,340,0,110,620,600,261,45,340,0,110,620,600,261,45,340,-1,110,621,600,261,45,340,-7,109,625,600,262,45,340,-29,105,639,600,262,45,339,-60,99,660,600,262,45,339,-97,93,685,600,263,45,339,-140,85,714,600,263,45,339,-187,77,745,600,263,45,338,-235,68,776,600,264,45,338,-280,60,807,600,264,45,337,-322,52,836,600,265,46,337,-365,45,861,600,265,46,336,-397,40,881,600,266,46,335,-394,37,894,600,266,46,335,-346,35,900,600,266,46,334,-247,35,900,600,267,46,333,-125,35,900,600,267,46,332,-21,35,900,600,268,47,331,67,35,900,600,268,47,330,147,35,900,600,268,47,328,218,35,900,600,269,47,327,278,35,900,600,269,47,325,327,35,900,600,269,48,324,366,35,900,600,269,48,322,398,35,900,600,270,48,320,417,35,900,600,270,49,318,420,35,900,600,270,49,316,420,35,900,600,270,49,314,420,35,900,600,270,50,311,420,35,900,600,270,50,309,419,35,900,600,270,53,305,410,35,900,599,269,57,300,387,35,900,597,269,63,294,354,35,900,594,268,70,287,314,35,900,590,267,79,279,269,35,900,586,266,90,270,220,35,900,581,265,101,261,169,35,900,576,264,113,251,120,35,900,570,262,126,240,76,35,893,564,261,140,229,40,35,861,558,259,155,218,13,35,795,552,258,170,206,2,35,715,545,256,185,195,0,35,639,539,255,200,183,0,35,564,532,253,215,172,0,35,489,526,252,230,161,0,35,416,520,250,245,150,0,35,347,515,249,259,140,0,35,281,509,247,272,130,0,35,221,504,246,285,120,0,35,165,500,245,297,112,0,35,116,495,243,307,104,0,35,75,491,242,317,97,0,35,42,488,242,325,91,0,35,17,485,241,331,86,0,35,4,483,240,336,83,0,35,0,481,240,339,81,0,35,0,480,240,340,80,0,35,0,480],"out":[210,330,90,0,110,620,500,210,330,90,0,110,620,500,210,330,89,0,110,620,500,210,330,89,0,110,620,500,210,330,88,0,110,620,500,210,330,86,0,110,620,500,210,330,85,0,110,618,500,210,330,83,0,107,595,500,210,330,82,0,101,546,500,210,330,80,0,93,481,500,210,330,79,0,84,403,500,210,330,77,0,74,319,500,210,330,75,0,63,235,500,210,330,74,0,54,155,500,210,330,73,0,45,87,500,210,330,72,0,39,35,500,210,330,71,0,36,6,500,210,330,70,0,35,0,500,210,330,70,0,35,1,500,210,328,73,0,35,7,501,208,319,84,0,35,20,503,205,305,103,0,35,41,507,201,287,128,0,35,68,513,196,265,157,0,35,102,520,191,240,191,0,35,143,528,186,214,226,0,35,191,537,180,186,264,0,35,242,546,174,159,301,0,35,292,556,168,133,338,0,35,343,566,163,108,372,0,35,393,575,159,87,403,0,35,444,583,155,68,430,0,35,495,590,152,55,451,0,35,545,596,150,47,465,0,35,596,599,150,45,471,0,35,646,600,150,45,475,0,35,697,600,150,45,478,5,35,747,600,151,45,482,16,35,794,600,152,45,485,33,35,845,600,152,45,487,55,35,894,600,153,46,490,83,35,900,600,154,46,492,115,35,900,600,155,46,495,151,35,900,600,157,46,497,192,35,900,600,158,46,498,236,35,900,600,159,47,500,282,35,900,600,161,47,502,332,35,900,600,162,47,503,380,35,900,600,164,47,504,415,35,900,600,165,48,505,420,35,900,600,167,48,506,420,35,900,600,168,48,507,420,35,900,600,170,48,508,420,35,900,600,171,48,508,420,35,900,600,172,49,509,420,35,900,600,174,49,509,420,35,900,600,175,49,509,420,35,900,600,176,49,510,420,35,900,600,177,49,510,420,35,900,600,178,50,510,420,35,900,600,179,50,510,420,35,900,600,179,50,510,420,35,900,600,180,50,510,420,35,900,600,180,50,510,420,35,900,600,180,50,510,420,35,900,600],"home":[260,45,340,0,110,620,600,260,45,340,0,110,620,600,260,45,340,0,110,620,600,260,45,340,0,110,620,600,260,45,340,0,110,620,600,261,45,340,-1,110,621,600,261,45,340,-20,107,633,600,261,45,340,-62,99,661,600,261,45,340,-118,89,699,600,262,45,340,-184,77,743,600,262,45,339,-252,65,788,600,262,45,339,-316,54,831,600,263,45,339,-370,44,867,600,263,45,339,-407,37,891,600,263,45,338,-420,35,900,600,264,45,338,-406,35,900,600,264,45,338,-309,35,900,600,264,45,337,-171,35,900,600,265,46,336,-62,35,900,600,265,46,336,38,35,900,600,266,46,335,127,35,900,600,266,46,334,205,35,900,600,266,46,334,270,35,900,600,267,46,333,324,35,900,600,267,46,332,367,35,900,600,268,47,330,398,35,900,600,268,47,329,416,35,900,600,268,47,328,420,35,900,600,269,47,327,420,35,900,600,269,47,325,420,35,900,600,269,48,324,420,35,900,600,269,48,322,420,35,900,600,270,48,320,420,35,900,600,270,49,318,420,35,900,600,270,49,316,420,35,900,600,270,49,314,420,35,900,600,270,50,312,420,35,900,600,270,50,309,419,35,900,600,270,54,306,397,35,900,598,270,61,301,350,35,900,595,269,71,295,291,35,900,589,269,83,288,221,35,900,583,269,98,280,149,35,900,575,268,115,271,83,35,898,567,267,133,262,32,35,856,559,266,153,252,4,35,735,550,266,173,241,0,35,628,540,265,193,230,0,35,520,532,264,214,219,0,35,414,523,262,234,207,0,35,316,515,261,253,195,0,35,226,507,260,272,184,0,35,148,501,258,288,172,0,35,84,494,257,303,161,0,35,36,489,255,316,149,0,35,8,485,253,325,138,0,35,0,482,252,332,128,0,35,0,480,250,335,118,0,35,0,480,248,337,109,0,35,0,480,246,338,101,0,35,0,480,244,339,94,0,35,0,480,242,340,88,0,35,0,480,241,340,84,0,35,0,480,240,340,81,0,35,0,480,240,340,80,0,35,0,480]},"orbit":{"label":"ORBIT","n":65,"in":[252,140,410,0,110,620,560,252,140,410,0,110,620,560,252,140,410,0,110,620,560,252,140,410,0,110,620,560,252,140,410,0,110,620,560,252,140,410,0,110,620,560,252,140,410,0,110,620,560,252,140,410,-1,110,621,560,252,140,410,-7,109,625,560,252,140,410,-29,107,639,560,252,140,410,-60,103,660,560,252,140,410,-97,98,685,560,252,140,410,-140,93,714,560,252,140,410,-187,88,745,560,252,140,410,-235,82,776,560,252,140,410,-280,77,807,560,252,140,410,-322,71,836,560,252,140,410,-365,67,861,560,252,140,410,-397,63,881,560,252,140,410,-394,61,894,560,252,140,410,-346,60,900,560,252,140,410,-247,60,900,560,252,140,410,-125,60,900,560,252,140,410,-21,60,900,560,252,140,410,67,60,900,560,252,140,410,147,60,900,560,252,140,410,218,60,900,560,252,140,410,278,60,900,560,252,140,410,327,60,900,560,252,140,410,366,60,900,560,252,140,410,398,60,900,560,252,140,410,417,60,900,560,252,140,410,420,60,900,560,252,140,410,420,60,900,560,252,140,410,420,60,900,560,252,140,410,420,60,900,560,253,140,410,419,60,900,560,257,140,407,410,60,900,560,264,141,402,387,60,900,559,275,142,393,354,60,900,558,289,144,382,314,60,900,557,305,145,367,269,60,900,556,323,147,349,220,60,900,554,341,149,328,169,60,900,553,359,152,304,120,60,900,551,377,154,277,76,60,893,549,393,157,247,40,60,861,547,408,160,214,13,60,795,545,420,162,180,2,60,715,543,430,165,144,0,60,639,541,436,168,107,0,60,564,539,440,171,69,0,60,489,537,440,174,32,0,60,416,535,437,177,-4,0,60,347,533,431,179,-38,0,60,281,531,423,182,-71,0,60,221,529,413,184,-101,0,60,165,527,402,187,-128,0,60,116,526,391,189,-152,0,60,75,524,380,190,-173,0,60,42,523,369,192,-190,0,60,17,522,360,193,-203,0,60,4,521,353,194,-213,0,60,0,521,348,195,-219,0,60,0,520,347,195,-221,0,60,0,520],"out":[360,190,-202,0,110,620,520,360,190,-202,0,110,620,520,360,190,-202,0,110,620,520,360,190,-202,0,110,620,520,360,190,-202,0,110,620,520,360,190,-202,0,110,620,520,360,190,-202,0,110,618,520,360,190,-202,0,108,595,520,360,190,-202,0,104,546,520,360,190,-202,0,99,481,520,360,190,-202,0,93,403,520,360,190,-202,0,86,319,520,360,190,-202,0,79,235,520,360,190,-202,0,73,155,520,360,190,-202,0,67,87,520,360,190,-202,0,63,35,520,360,190,-202,0,60,6,520,360,190,-202,0,60,0,520,360,190,-202,0,60,1,520,363,190,-198,0,60,7,520,374,188,-183,0,60,20,521,389,186,-156,0,60,41,523,406,183,-119,0,60,68,525,423,179,-72,0,60,102,528,435,175,-18,0,60,143,531,440,171,42,0,60,191,535,437,166,105,0,60,242,538,424,162,167,0,60,292,542,403,157,226,0,60,343,546,376,153,278,0,60,393,549,345,149,322,0,60,444,552,315,146,358,0,60,495,555,287,143,384,0,60,545,558,266,141,401,0,60,596,559,254,140,409,0,60,646,560,251,140,411,0,60,697,560,249,140,413,5,60,747,560,248,140,414,16,60,794,560,246,140,415,33,60,845,560,245,140,416,55,60,894,560,243,140,417,83,60,900,560,242,140,417,115,60,900,560,241,140,418,151,60,900,560,240,140,419,192,60,900,560,239,140,419,236,60,900,560,238,140,420,282,60,900,560,238,140,420,332,60,900,560,237,140,421,380,60,900,560,236,140,421,415,60,900,560,236,140,422,420,60,900,560,235,140,422,420,60,900,560,235,140,422,420,60,900,560,234,140,422,420,60,900,560,234,140,423,420,60,900,560,234,140,423,420,60,900,560,234,140,423,420,60,900,560,234,140,423,420,60,900,560,233,140,423,420,60,900,560,233,140,423,420,60,900,560,233,140,423,420,60,900,560,233,140,423,420,60,900,560,233,140,423,420,60,900,560,233,140,423,420,60,900,560,233,140,423,420,60,900,560,233,140,423,420,60,900,560],"home":[252,140,410,0,110,620,560,252,140,410,0,110,620,560,252,140,410,0,110,620,560,252,140,410,0,110,620,560,252,140,410,0,110,620,560,252,140,410,-1,110,621,560,252,140,410,-20,108,633,560,252,140,410,-62,103,661,560,252,140,410,-118,96,699,560,252,140,410,-184,88,743,560,252,140,410,-252,80,788,560,252,140,410,-316,72,831,560,252,140,410,-370,66,867,560,252,140,410,-407,62,891,560,252,140,410,-420,60,900,560,252,140,410,-406,60,900,560,252,140,410,-309,60,900,560,252,140,410,-171,60,900,560,252,140,410,-62,60,900,560,252,140,410,38,60,900,560,252,140,410,127,60,900,560,252,140,410,205,60,900,560,252,140,410,270,60,900,560,252,140,410,324,60,900,560,252,140,410,367,60,900,560,252,140,410,398,60,900,560,252,140,410,416,60,900,560,252,140,410,420,60,900,560,252,140,410,420,60,900,560,252,140,410,420,60,900,560,252,140,410,420,60,900,560,252,140,410,420,60,900,560,252,140,410,420,60,900,560,252,140,410,420,60,900,560,252,140,410,420,60,900,560,252,140,410,420,60,900,560,252,140,410,420,60,900,560,253,140,410,419,60,900,560,259,141,406,397,60,900,559,272,142,396,350,60,900,558,291,143,380,291,60,900,557,313,145,359,221,60,900,555,337,147,332,149,60,900,552,362,150,300,83,60,898,550,386,153,262,32,60,856,547,406,156,219,4,60,735,544,423,159,172,0,60,628,541,434,162,123,0,60,520,538,439,166,73,0,60,414,535,439,169,23,0,60,316,532,434,173,-24,0,60,226,529,424,176,-68,0,60,148,527,411,179,-106,0,60,84,525,397,182,-139,0,60,36,523,383,185,-166,0,60,8,521,371,187,-186,0,60,0,520,362,189,-200,0,60,0,520,357,191,-207,0,60,0,520,353,192,-212,0,60,0,520,351,193,-216,0,60,0,520,349,194,-218,0,60,0,520,348,195,-220,0,60,0,520,347,195,-221,0,60,0,520,347,195,-221,0,60,0,520,347,195,-221,0,60,0,520]},"dolly":{"label":"DOLLY","n":65,"in":[170,125,530,0,110,620,580,170,125,530,0,110,620,580,170,125,530,0,110,620,580,170,125,530,0,110,620,580,170,125,530,0,110,620,580,170,125,530,0,110,620,580,170,125,530,0,110,620,580,170,125,530,-1,110,621,580,170,125,530,-7,109,625,580,170,125,529,-29,107,639,580,171,125,529,-60,104,660,580,171,125,529,-97,101,685,580,171,125,528,-140,97,714,580,171,125,528,-187,92,745,580,172,125,528,-235,88,776,580,172,125,527,-280,83,807,580,173,125,526,-322,79,836,580,173,125,526,-365,76,861,580,174,125,525,-397,73,881,580,175,125,524,-394,71,894,580,175,125,523,-346,70,900,580,176,125,522,-247,70,900,580,177,125,521,-125,70,900,580,178,125,519,-21,70,900,580,179,125,518,67,70,900,580,180,125,516,147,70,900,580,182,125,514,218,70,900,580,183,125,512,278,70,900,580,185,125,510,327,70,900,580,186,125,508,366,70,900,580,188,125,506,398,70,900,580,190,125,503,417,70,900,580,192,125,501,420,70,900,580,194,125,498,420,70,900,580,196,125,495,420,70,900,580,199,125,492,420,70,900,580,201,125,488,419,70,900,580,204,125,483,410,70,900,580,207,125,477,387,70,900,579,211,125,469,354,70,900,578,215,125,459,314,70,900,577,219,124,448,269,70,900,575,223,124,436,220,70,900,574,227,124,423,169,70,900,572,232,124,408,120,70,900,570,236,124,392,76,70,893,568,241,123,376,40,70,861,566,245,123,358,13,70,795,563,250,123,340,2,70,715,561,255,122,321,0,70,639,559,259,122,301,0,70,564,556,263,122,280,0,70,489,554,267,122,259,0,70,416,552,271,121,238,0,70,347,550,275,121,216,0,70,281,548,278,121,194,0,70,221,546,281,121,172,0,70,165,545,284,120,150,0,70,116,543,286,120,127,0,70,75,542,288,120,105,0,70,42,541,289,120,82,0,70,17,541,290,120,60,0,70,4,540,290,120,38,0,70,0,540,290,120,19,0,70,0,540,290,120,10,0,70,0,540],"out":[290,120,-120,0,110,620,540,290,120,-120,0,110,620,540,290,120,-120,0,110,620,540,290,120,-120,0,110,620,540,290,120,-120,0,110,620,540,290,120,-120,0,110,620,540,290,120,-119,0,110,618,540,290,120,-119,0,108,595,540,290,120,-118,0,105,546,540,290,120,-118,0,101,481,540,290,120,-117,0,96,403,540,290,120,-116,0,91,319,540,290,120,-114,0,85,235,540,290,120,-113,0,80,155,540,290,120,-111,0,76,87,540,290,120,-109,0,72,35,540,290,120,-106,0,70,6,540,290,120,-104,0,70,0,540,290,120,-101,0,70,1,540,290,120,-93,0,70,7,540,290,120,-74,0,70,20,541,290,120,-44,0,70,41,543,290,121,-6,0,70,68,545,290,121,39,0,70,102,548,290,121,90,0,70,143,551,290,122,145,0,70,191,554,290,122,202,0,70,242,557,290,123,260,0,70,292,561,290,123,317,0,70,343,564,290,124,371,0,70,393,568,290,124,422,0,70,444,571,290,124,467,0,70,495,574,290,125,505,0,70,545,577,290,125,534,0,70,596,578,290,125,553,0,70,646,580,290,125,560,0,70,697,580,290,125,561,5,70,747,580,290,125,562,16,70,794,580,290,125,563,33,70,845,580,289,125,564,55,70,894,580,289,125,564,83,70,900,580,289,125,565,115,70,900,580,289,125,566,151,70,900,580,288,125,566,192,70,900,580,288,125,567,236,70,900,580,287,125,567,282,70,900,580,287,125,568,332,70,900,580,286,125,568,380,70,900,580,286,125,568,415,70,900,580,285,125,569,420,70,900,580,285,125,569,420,70,900,580,284,125,569,420,70,900,580,284,125,569,420,70,900,580,283,125,569,420,70,900,580,283,125,570,420,70,900,580,282,125,570,420,70,900,580,282,125,570,420,70,900,580,281,125,570,420,70,900,580,281,125,570,420,70,900,580,281,125,570,420,70,900,580,281,125,570,420,70,900,580,280,125,570,420,70,900,580,280,125,570,420,70,900,580,280,125,570,420,70,900,580,280,125,570,420,70,900,580],"home":[170,125,530,0,110,620,580,170,125,530,0,110,620,580,170,125,530,0,110,620,580,170,125,530,0,110,620,580,170,125,530,0,110,620,580,170,125,530,-1,110,621,580,170,125,530,-20,108,633,580,170,125,530,-62,104,661,580,170,125,530,-118,99,699,580,170,125,529,-184,92,743,580,171,125,529,-252,86,788,580,171,125,529,-316,80,831,580,171,125,529,-370,75,867,580,171,125,528,-407,71,891,580,172,125,528,-420,70,900,580,172,125,527,-406,70,900,580,172,125,527,-309,70,900,580,173,125,526,-171,70,900,580,174,125,525,-62,70,900,580,174,125,524,38,70,900,580,175,125,524,127,70,900,580,176,125,522,205,70,900,580,176,125,521,270,70,900,580,177,125,520,324,70,900,580,178,125,519,367,70,900,580,180,125,517,398,70,900,580,181,125,516,416,70,900,580,182,125,514,420,70,900,580,183,125,512,420,70,900,580,185,125,510,420,70,900,580,186,125,508,420,70,900,580,188,125,506,420,70,900,580,190,125,503,420,70,900,580,192,125,501,420,70,900,580,194,125,498,420,70,900,580,196,125,495,420,70,900,580,198,125,492,420,70,900,580,201,125,489,419,70,900,580,204,125,480,397,70,900,579,208,125,466,350,70,900,578,213,125,448,291,70,900,576,219,124,425,221,70,900,574,225,124,398,149,70,900,571,232,124,369,83,70,898,568,239,123,337,32,70,856,565,246,123,304,4,70,735,562,252,122,270,0,70,628,558,259,122,236,0,70,520,555,266,122,203,0,70,414,552,271,121,170,0,70,316,549,277,121,140,0,70,226,547,281,121,112,0,70,148,544,285,120,87,0,70,84,542,288,120,66,0,70,36,541,290,120,49,0,70,8,540,290,120,38,0,70,0,540,290,120,30,0,70,0,540,290,120,23,0,70,0,540,290,120,18,0,70,0,540,290,120,15,0,70,0,540,290,120,12,0,70,0,540,290,120,11,0,70,0,540,290,120,10,0,70,0,540,290,120,10,0,70,0,540,290,120,10,0,70,0,540]},"rear":{"label":"REAR TRACK","n":65,"in":[-60,130,-460,0,110,620,520,-60,130,-460,0,110,620,520,-60,130,-460,0,110,620,520,-60,130,-460,0,110,620,520,-60,130,-460,0,110,620,520,-60,130,-460,0,110,620,520,-60,130,-460,0,110,620,520,-60,130,-460,-1,110,621,520,-60,130,-460,-7,109,625,520,-60,130,-460,-29,108,639,520,-60,130,-460,-60,105,660,520,-60,130,-460,-97,102,685,520,-60,130,-460,-140,98,714,520,-60,130,-460,-187,94,745,520,-60,130,-460,-235,90,776,520,-60,130,-460,-280,87,807,520,-60,130,-460,-322,83,836,520,-60,130,-460,-365,80,861,520,-60,130,-460,-397,77,881,520,-60,130,-460,-394,76,894,520,-60,130,-460,-346,75,900,520,-60,130,-460,-247,75,900,520,-60,130,-460,-125,75,900,520,-60,130,-460,-21,75,900,520,-60,130,-460,67,75,900,520,-60,130,-460,147,75,900,520,-60,130,-460,218,75,900,520,-60,130,-460,278,75,900,520,-60,130,-460,327,75,900,520,-60,130,-460,366,75,900,520,-60,130,-460,398,75,900,520,-60,130,-460,417,75,900,520,-60,130,-460,420,75,900,520,-60,130,-460,420,75,900,520,-60,130,-460,420,75,900,520,-60,130,-460,420,75,900,520,-60,130,-460,419,75,900,520,-60,130,-461,410,75,900,519,-61,131,-462,387,75,900,518,-61,131,-464,354,75,900,516,-62,132,-466,314,75,900,513,-63,133,-469,269,75,900,510,-65,135,-472,220,75,900,506,-66,136,-476,169,75,900,502,-67,138,-480,120,75,900,498,-69,140,-484,76,75,893,494,-70,142,-489,40,75,861,489,-72,144,-494,13,75,795,485,-74,146,-499,2,75,715,480,-75,149,-504,0,75,639,476,-77,151,-509,0,75,564,471,-79,154,-515,0,75,489,467,-80,157,-520,0,75,416,463,-82,160,-526,0,75,347,459,-84,163,-531,0,75,281,455,-85,166,-537,0,75,221,452,-86,170,-542,0,75,165,449,-87,173,-548,0,75,116,446,-88,176,-553,0,75,75,444,-89,180,-557,0,75,42,442,-90,183,-562,0,75,17,441,-90,187,-566,0,75,4,440,-90,190,-570,0,75,0,440,-90,194,-574,0,75,0,440,-90,195,-575,0,75,0,440],"out":[-80,180,-560,0,110,620,460,-80,180,-560,0,110,620,460,-80,180,-560,0,110,620,460,-80,180,-560,0,110,620,460,-80,180,-560,0,110,620,460,-80,180,-560,0,110,620,460,-80,180,-560,0,110,618,460,-80,180,-559,0,109,595,460,-80,180,-559,0,106,546,460,-80,180,-559,0,102,481,460,-80,180,-558,0,98,403,460,-80,180,-558,0,93,319,460,-80,180,-557,0,88,235,460,-80,180,-556,0,84,155,460,-80,180,-555,0,80,87,460,-80,180,-554,0,77,35,460,-80,180,-553,0,75,6,460,-80,180,-552,0,75,0,460,-80,180,-550,0,75,1,460,-80,179,-544,0,75,7,461,-78,177,-524,0,75,20,463,-76,174,-493,0,75,41,467,-74,169,-452,0,75,68,472,-70,163,-403,0,75,102,478,-67,156,-347,0,75,143,486,-63,149,-287,0,75,191,494,-58,142,-225,0,75,242,503,-54,135,-161,0,75,292,512,-49,127,-99,0,75,343,522,-45,120,-39,0,75,393,531,-41,114,16,0,75,444,539,-38,109,65,0,75,495,547,-35,105,106,0,75,545,553,-32,102,137,0,75,596,558,-30,100,156,0,75,646,560,-29,100,165,0,75,697,560,-28,100,173,5,75,747,560,-28,100,180,16,75,794,560,-27,100,186,33,75,845,560,-26,101,192,55,75,894,560,-25,101,198,83,75,900,560,-25,101,203,115,75,900,560,-24,102,207,151,75,900,560,-24,102,212,192,75,900,560,-23,102,215,236,75,900,560,-23,103,219,282,75,900,560,-22,103,222,332,75,900,560,-22,104,225,380,75,900,560,-22,104,227,415,75,900,560,-21,105,230,420,75,900,560,-21,105,232,420,75,900,560,-21,106,233,420,75,900,560,-21,106,235,420,75,900,560,-21,107,236,420,75,900,560,-20,107,237,420,75,900,560,-20,108,238,420,75,900,560,-20,108,238,420,75,900,560,-20,109,239,420,75,900,560,-20,109,239,420,75,900,560,-20,109,240,420,75,900,560,-20,110,240,420,75,900,560,-20,110,240,420,75,900,560,-20,110,240,420,75,900,560,-20,110,240,420,75,900,560,-20,110,240,420,75,900,560],"home":[-60,130,-460,0,110,620,520,-60,130,-460,0,110,620,520,-60,130,-460,0,110,620,520,-60,130,-460,0,110,620,520,-60,130,-460,0,110,620,520,-60,130,-460,-1,110,621,520,-60,130,-460,-20,108,633,520,-60,130,-460,-62,105,661,520,-60,130,-460,-118,100,699,520,-60,130,-460,-184,95,743,520,-60,130,-460,-252,89,788,520,-60,130,-460,-316,84,831,520,-60,130,-460,-370,79,867,520,-60,130,-460,-407,76,891,520,-60,130,-460,-420,75,900,520,-60,130,-460,-406,75,900,520,-60,130,-460,-309,75,900,520,-60,130,-460,-171,75,900,520,-60,130,-460,-62,75,900,520,-60,130,-460,38,75,900,520,-60,130,-460,127,75,900,520,-60,130,-460,205,75,900,520,-60,130,-460,270,75,900,520,-60,130,-460,324,75,900,520,-60,130,-460,367,75,900,520,-60,130,-460,398,75,900,520,-60,130,-460,416,75,900,520,-60,130,-460,420,75,900,520,-60,130,-460,420,75,900,520,-60,130,-460,420,75,900,520,-60,130,-460,420,75,900,520,-60,130,-460,420,75,900,520,-60,130,-460,420,75,900,520,-60,130,-460,420,75,900,520,-60,130,-460,420,75,900,520,-60,130,-460,420,75,900,520,-60,130,-460,420,75,900,520,-60,130,-460,419,75,900,520,-60,131,-462,397,75,900,519,-61,132,-465,350,75,900,516,-63,135,-469,291,75,900,512,-64,137,-475,221,75,900,507,-66,141,-481,149,75,900,501,-68,145,-489,83,75,898,495,-71,149,-497,32,75,856,488,-73,153,-505,4,75,735,482,-76,158,-514,0,75,628,475,-78,162,-522,0,75,520,469,-81,167,-531,0,75,414,463,-83,171,-539,0,75,316,457,-85,175,-547,0,75,226,452,-87,179,-554,0,75,148,448,-88,183,-560,0,75,84,444,-89,186,-565,0,75,36,442,-90,189,-568,0,75,8,440,-90,190,-570,0,75,0,440,-90,192,-572,0,75,0,440,-90,193,-573,0,75,0,440,-90,194,-574,0,75,0,440,-90,194,-574,0,75,0,440,-90,195,-575,0,75,0,440,-90,195,-575,0,75,0,440,-90,195,-575,0,75,0,440,-90,195,-575,0,75,0,440,-90,195,-575,0,75,0,440]}};
  // @blender-rigs:end
  /* MOVING RIGS (tools/gen/blender/garage-camera-rigs.py): Blender cameras whose eye, aim and fov are
   * sampled at RIGS[id].n points of a sequence's progress u = t / duration (0..1; a missing dir falls
   * back to "in"), authored for lane side +1 (side -1 mirrors x). Catmull-Rom between samples keeps the
   * move as smooth as Blender's curves; the eye is clamped inside the bay, short of the door's plane. */
  const RIG_IDS = Object.freeze(Object.keys(RIGS));
  const RIG_LABEL = Object.freeze(Object.fromEntries(RIG_IDS.map((id) => [id, RIGS[id].label])));
  const ALL_ANGLES = Object.freeze(ANGLES.concat(RIG_IDS));   // GARAGE ANGLE: presets, then the Blender rigs
  function rigSample(id, dir, u, side = 1) {
    const rig = typeof id === "string" && Object.prototype.hasOwnProperty.call(RIGS, id) ? RIGS[id] : null;
    if (!rig) return null;
    const s = rig[dir] || rig.in, n = rig.n, f = Math.max(0, Math.min(1, Number.isFinite(u) ? u : 0)) * (n - 1);
    const i = Math.min(n - 2, Math.floor(f)), k = f - i, m = side < 0 ? -1 : 1, v = [0, 0, 0, 0, 0, 0, 0];
    const j0 = Math.max(0, i - 1) * 7, j1 = i * 7, j2 = (i + 1) * 7, j3 = Math.min(n - 1, i + 2) * 7;
    for (let c = 0; c < 7; c++) {
      const p0 = s[j0 + c], p1 = s[j1 + c], p2 = s[j2 + c], p3 = s[j3 + c];
      v[c] = p1 + 0.5 * k * (p2 - p0 + k * (2 * p0 - 5 * p1 + 4 * p2 - p3 + k * (3 * (p1 - p2) + p3 - p0)));
    }
    return { eye: [m * Math.max(-5.2, Math.min(5.2, v[0] / 100)), Math.max(0.3, Math.min(3.6, v[1] / 100)), Math.max(-6.2, Math.min(6.05, v[2] / 100))],
      aim: [m * v[3] / 100, v[4] / 100, v[5] / 100], fov: v[6] / 10 };
  }
  // HANDHELD: a slow, small sway on both shots, as if someone were filming from
  // the back of the bay. Off when `calm` (reduce motion); timing never changes.
  // CAMERA HEIGHT lifts or drops every eye, kept above the floor and at most
  // 3.6 m up: the overhead rig hangs from ~4 m and filled half the frame of an
  // eye at 4.0-4.3 m (2026-10-30 captures, HIGH CORNER +0.5 m).
  // look = { config, k (0..1 through the shot), last (the final shot) } carries
  // CAMERA MOVE, HANDHELD and FINAL SHOT ZOOM; defaults leave the shipped framing.
  function shot(out, eye, aim, t, calm, lift = 0, look = null) {
    out.eye = eye.slice(); out.aim = aim;
    if (lift) out.eye[1] = Math.max(0.3, Math.min(3.6, out.eye[1] + lift));
    const c = look && look.config, k = look ? Math.max(0, Math.min(1, look.k)) : 0;
    const move = c && c.move !== "still" && !calm ? c.move : null;
    if (move) {
      const dx = aim[0] - out.eye[0], dy = aim[1] - out.eye[1], dz = aim[2] - out.eye[2], n = Math.hypot(dx, dy, dz) || 1;
      if (move === "drift") {
        const h = Math.hypot(dx, dz) || 1, s = MOVE_M * (ease(k) - 0.5);
        out.eye[0] += -dz / h * s; out.eye[2] += dx / h * s;
      } else {
        const s = MOVE_M * (move === "push" ? ease(k) : 1 - ease(k));
        out.eye[0] += dx / n * s; out.eye[1] += dy / n * s; out.eye[2] += dz / n * s;
      }
      // Inside the walls, short of the door's plane (scene.js culls by the eye's side).
      out.eye[0] = Math.max(-5.2, Math.min(5.2, out.eye[0]));
      out.eye[1] = Math.max(0.3, Math.min(3.6, out.eye[1]));
      out.eye[2] = Math.max(-6.2, Math.min(6.1, out.eye[2]));
    }
    if (c && c.zoom > 0 && look.last && !calm) out.fov = Math.max(20, out.fov - c.zoom * ease(k));
    if (calm) return out;
    const a = c && Number.isFinite(c.sway) ? c.sway : 1;
    if (!a) return out;
    out.eye[0] += a * (0.022 * Math.sin(1.3 * t) + 0.010 * Math.sin(3.1 * t + 1));
    out.eye[1] += a * 0.014 * Math.sin(1.7 * t + 2);
    aim[0] += a * 0.028 * Math.sin(0.9 * t + 0.5); aim[1] += a * 0.018 * Math.sin(1.2 * t + 1.3);
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
    const rig = RIGS[config.angle] ? config.angle : null;
    const cams = shotsFor(config, "in"), side = rig ? 1 : sideFor(cams[2]), s2 = T.door + T.lane + T.pause;
    const n = t < T.door ? 0 : t < s2 ? 1 : 2, cam = cams[n];
    const look = { config, last: n === 2, k: n === 0 ? t / T.door : n === 1 ? (t - T.door) / (s2 - T.door) : (t - s2) / Math.max(1e-6, end - s2) };
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
    const rs = rig ? rigOn(rig, dir, t, end, T.door, p, config, side) : null;
    return shot({ active: t < end, serviceTime: t - T.park, seconds: t, direction: "in", sequence: dir, result: r ? config.result : null,
      engine: !(r && r.pushed), side, calm, camera: rig || cam, shot: n + 1, mood: lightFor(config, dir), cue: cueFor(config, dir), swell: lookNum(config, "swell", 1),
      bars: !!config.bars, captions: config.captions !== false, rearLight: config.rearLight || "auto", sound: config.sound !== false, crewClear: 1 - ease((t - (T.park - .3)) / .3), crew: crewFor(config, dir), fov: rs ? rs.fov : config.fov,
      door: ease(t / T.door), x: p.x, z: p.z, yaw: p.yaw, label },
      // Interior versions of garage-angles' bay/rear three-quarter framings.
      // A cut after the shutter opens keeps both eyes behind the threshold.
      rs ? rs.eye : CAMS[cam], rs ? rs.aim : aim, t, calm, config.height || 0, look);
  }
  /* A BLENDER RIG (crane, orbit, dolly, rear track; lane A's generated block)
   * gives the eye and lens over u (rigU: t warped onto the authored beats; the
   * drive-out keeps t / duration). Its baked aim was keyed on one
   * timing (crew "current", a win), so past the shutter shot the aim eases onto
   * the car's live position instead and frames it whatever crew or result
   * stretches the sequence. FIELD OF VIEW offsets the rig's lens from 54. */
  function rigOn(id, dir, t, end, door, p, config, side) {
    const s = rigSample(id, dir, rigU(config, dir, t, end), side);
    if (!s) return null;
    clearOfCrew(s.eye, crewFor(config, dir), t, side);
    const w = ease((t - door) / 0.8), car = [Math.max(-8, Math.min(8, p.x)), 0.6, Math.max(-3, Math.min(14, p.z))];
    for (let i = 0; i < 3; i++) s.aim[i] += (car[i] - s.aim[i]) * w;
    s.fov = Math.max(30, Math.min(80, s.fov + (Number.isFinite(config.fov) ? config.fov - 54 : 0)));
    return s;
  }
  /* The rigs' in / home keys sit on the beats of the timing they were authored on
   * (arrival-poses.mjs: crew "current", a win). Warp t piecewise across the
   * sequence's own beats (shutter, lane, pause, back-in, end) onto that timing,
   * so a slow RETIRED push or a long SHUTTER SHOT still meets each key on its
   * beat: by u = t / duration the DOLLY reached the bay while the pushed car was
   * still out in the lane (2026-10-30 capture). */
  const KEYED = {};
  function beatKnots(T, end) { return [0, T.door, T.door + T.lane, T.door + T.lane + T.pause, T.park, end]; }
  function rigU(config, dir, t, end = duration(config, dir)) {
    if (dir === "out") return end > 0 ? t / end : 0;
    const A = KEYED[dir] || (KEYED[dir] = (() => {
      const c = settings({ angle: "left", enterCrew: "current", homeCrew: "current", result: "win" });
      return beatKnots(timeline(c, dir), duration(c, dir));
    })());
    const K = beatKnots(timeline(config, dir), end);
    let i = 1;
    while (i < K.length - 1 && t > K[i]) i++;
    const span = K[i] - K[i - 1], k = span > 1e-6 ? Math.max(0, Math.min(1, (t - K[i - 1]) / span)) : 1;
    return (A[i - 1] + (A[i] - A[i - 1]) * k) / A[A.length - 1];
  }
  /* CREW-AWARE RIGS: a rig's path is authored once, but a Blender crew clip
   * (crew-choreo.js; the RESULT crews crowd the car at x ~ ±3) can stand on it:
   * 844x390 captures put a cheering head in the ORBIT lens. Within CREW_R metres
   * (horizontally) of a member, a body up to 1.8 m, the eye RISES over their head
   * (up to 1.3 m, eased), and from CREW_RAMP in it eases up to head height first.
   * Smooth in d (a square-root lift dropped 0.4 m in a frame at its edge),
   * so a member walking under the lens never snaps it (a sideways push flipped
   * when one crossed it: a 1.5 m jump). The fixed CAMS are proven >= 0.8 m clear. */
  const CREW_R = 1.2, CREW_RAMP = 2.4;
  let _crewOut = null;
  function clearOfCrew(eye, crew, t, side) {
    if (typeof GarageCrewChoreo === "undefined" || !GarageCrewChoreo.has(crew)) return eye;
    if (!_crewOut) _crewOut = GarageCrewChoreo.actors(12);
    const n = GarageCrewChoreo.sample(crew, t, side, _crewOut, t, true);
    // From CREW_RAMP out to CREW_R the eye eases up to head height (a low eye
    // must not jump to 1.8 m the moment someone steps within CREW_R).
    const y0 = eye[1];   // each member's need from the rig's own height; the eye takes the highest
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(eye[0] - _crewOut[i].x, eye[2] - _crewOut[i].z);
      if (d >= CREW_RAMP) continue;
      // 1.3 m eased over heads inside CREW_R (smooth both ends; keeps >= 0.8 m, the
      // tested floor, at every d: e.g. d 0.5 -> 0.81 m up, d 0.7 -> 0.49 m).
      const target = Math.min(3.6, 1.8 + (d < CREW_R ? 1.3 * ease(1 - d / CREW_R) : 0));
      const w = ease((CREW_RAMP - d) / (CREW_RAMP - CREW_R));
      if (target > y0) eye[1] = Math.max(eye[1], y0 + (target - y0) * w);
    }
    return eye;
  }
  const lookNum = (c, key, dflt) => c && Number.isFinite(c[key]) ? c[key] : dflt;
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
    const rig = RIGS[config.angle] ? config.angle : null;
    const cams = shotsFor(config, "out"), side = rig ? 1 : sideFor(cams[1]);
    const opening = t < T.door;
    const d = outDistance(Math.min(t, settle) - go, Object.assign({}, T, { settle: T.run + OUT_EXIT_M / T.v }));
    const p = pathAt(d, side);
    // Shot 2 runs from the roll to the doorway (z past 6 m), shot 3 from there.
    const n = t < go ? 0 : d < 6 ? 1 : 2, cam = cams[n], eye = CAMS[cam];
    const atDoor = go + (6 <= T.v * T.accel / 2 ? Math.sqrt(2 * T.accel * 6 / T.v) : 6 / T.v + T.accel / 2);
    const look = { config, last: n === 2, k: n === 0 ? t / go : n === 1 ? (t - go) / (atDoor - go) : (t - atDoor) / Math.max(1e-6, end - atDoor) };
    // The aim follows it round to the jamb and holds on the doorway as it goes.
    const legacy = cam === "left" || cam === "right", cs = legacy ? sideFor(cam) : side;
    const aim = legacy ? [cs * Math.min(cs * p.x * 0.7, 3.5), 0.8, opening ? 6.2 : Math.min(9, 1.2 + p.z * 0.62)] : aimAt(cam, p, opening);
    const rs = rig ? rigOn(rig, "out", t, end, go, p, config, side) : null;
    let e = rs ? rs.eye : eye;
    if (rs) for (let i = 0; i < 3; i++) aim[i] = rs.aim[i];
    else if (!calm && t > settle) {
      const k = 1 - Math.exp(-(t - settle) / HOLD_TAU);
      e = [eye[0] * (1 - 0.25 * k), eye[1] - 0.25 * k, Math.min(5.9, eye[2] + HOLD_PUSH * k)];
      aim[0] -= cs * 2.2 * k;
    }
    return shot({ active: t < end, serviceTime: t, seconds: t, direction: "out", sequence: "out", engine: true, side, calm, camera: rig || cam,
      shot: n + 1, mood: lightFor(config, "out"), cue: cueFor(config, "out"), swell: lookNum(config, "swell", 1), bars: !!config.bars, captions: config.captions !== false,
      rearLight: config.rearLight || "auto", sound: config.sound !== false,
      crewClear: ease((t - (go - .3)) / .3), crew: crewFor(config, "out"), fov: rs ? rs.fov : config.fov, door: ease(t / T.door), x: p.x, z: p.z, yaw: p.yaw,
      label: delay && t < 5.2 ? "CREW CLEARING CAR" : opening ? "OPENING GARAGE" : "LEAVING THE GARAGE" }, e, aim, t, calm, config.height || 0, look);
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
      label.hidden = !config.captions;   // CAPTIONS off: SKIP stays, the words go
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
        time += Math.max(capped, gap > 0 && gap <= wallSeconds(config, dir) / config.speed ? Math.min(gap, MAX_GAP_S) : 0) * config.speed * rate(config, dir, time);
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
  /* SLOW-MO AT THE DOOR: SLOW_S seconds of show time around the car crossing the
   * door plane play at config.slowmo of PLAYBACK SPEED (0 = off). Coming in, the
   * back-in arc meets z 6.4 at ease(k) = 1 - 6.4 / OUT_PATH (k ~ 0.565 of IN_BACK);
   * going out, just after the doorway (z 6 m). The steppers multiply their clock
   * by rate(); wallSeconds() is the playback's length at speed 1, for RACE!. */
  const SLOW_S = 1.2;
  function slowWindow(config, dir) {
    const f = config && config.slowmo;
    if (!(f > 0 && f < 1)) return null;
    let mid;
    if (dir === "out") {
      const T = timeline(config, "out"), go = T.door + T.hold + (duration(config, "out") - T.base);
      mid = go + (6 <= T.v * T.accel / 2 ? Math.sqrt(2 * T.accel * 6 / T.v) : 6 / T.v + T.accel / 2) + 0.2;
    } else {
      const T = timeline(config, dir), target = 1 - 6.4 / OUT_PATH;
      let lo = 0, hi = 1;
      for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (ease(m) < target) lo = m; else hi = m; }
      mid = T.door + T.lane + T.pause + lo * T.back;
    }
    return [mid - SLOW_S / 2, mid + SLOW_S / 2, f];
  }
  function rate(config, dir, t) {
    const w = slowWindow(config, dir);
    return w && t >= w[0] && t < w[1] ? w[2] : 1;
  }
  /** Wall seconds (at speed 1) from show time t to the end; wallSeconds = wallLeft(…, 0). */
  function wallLeft(config, dir, t = 0) {
    const w = slowWindow(config, dir), d = duration(config, dir), from = Math.max(0, Math.min(d, t));
    if (!w) return d - from;
    const slow = Math.max(0, Math.min(d, w[1]) - Math.max(from, w[0]));
    return d - from + slow * (1 / w[2] - 1);
  }
  const wallSeconds = (config, dir) => wallLeft(config, dir, 0);
  /** Whether the rain light shows on this pose: REAR LIGHT, else night / wet (`wet`). */
  function rearLightOn(p, wet) {
    const m = p && p.rearLight || "auto";
    if (m === "on") return true;
    if (m === "flash") return Math.floor((p.seconds || 0) * 8) % 2 === 0;   // ~4 Hz
    return m === "auto" && !!wet;
  }
  return Object.freeze({ create, pose, poseOut, poseHome, poseFor, duration, timeline, rate, wallSeconds, wallLeft, slowWindow, crewFor, lightFor, cueFor, rearLightOn, angleMap, shotsFor, resultKind, MOVES, REAR,
    CAMS, CAM_IDS, ANGLES: ALL_ANGLES, RIG_IDS, RIG_LABEL, rigSample, rigU, RESULTS, DURATION, OUT_DURATION, OUT_SETTLE, DEFAULT, settings, bindSettings });
})();
