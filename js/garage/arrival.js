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
  // Blender 5.2.3 LTS (bpy module); tools/gen/blender/garage-camera-rigs.py; 49 samples over u: eye, aim (cm), fov (0.1 deg).
  // Source SHA256: f1696d83018a983b2d11ebd7976ad4aac618a2137c2fca44ff70f03ff7e8828d
  const RIGS = {"crane":{"label":"CRANE","n":49,"in":[260,45,340,0,110,620,600,260,45,340,0,110,620,600,260,45,340,0,110,620,600,260,45,340,0,110,620,600,261,45,340,0,110,620,600,261,45,340,0,110,620,600,261,45,340,-7,109,625,600,262,45,339,-39,103,646,600,262,45,339,-84,95,676,600,263,45,339,-140,85,714,600,263,45,338,-203,74,755,600,264,45,338,-266,63,797,600,264,45,337,-322,52,836,600,265,46,337,-378,43,868,600,265,46,336,-399,37,891,600,266,46,335,-346,35,900,600,266,46,334,-207,35,900,600,267,46,332,-53,35,900,600,268,47,331,67,35,900,600,268,47,329,172,35,900,600,268,47,327,259,35,900,600,269,47,325,327,35,900,600,269,48,323,378,35,900,600,269,48,321,413,35,900,600,270,49,318,420,35,900,600,270,49,315,420,35,900,600,270,50,312,420,35,900,600,270,50,309,419,35,900,600,270,54,303,404,35,900,598,269,61,296,366,35,900,595,268,70,287,314,35,900,590,267,83,276,253,35,900,585,265,97,264,186,35,900,578,264,113,251,120,35,900,570,262,131,236,63,35,886,562,260,150,222,21,35,820,554,258,170,206,2,35,715,545,256,190,191,0,35,614,537,254,210,176,0,35,514,528,252,230,161,0,35,416,520,249,249,146,0,35,325,513,248,268,133,0,35,240,506,246,285,120,0,35,165,500,244,300,109,0,35,102,494,243,314,99,0,35,52,489,242,325,91,0,35,17,485,241,333,85,0,35,2,482,240,338,81,0,35,0,481,240,340,80,0,35,0,480],"out":[210,330,90,0,110,620,500,210,330,90,0,110,620,500,210,330,89,0,110,620,500,210,330,88,0,110,620,500,210,330,86,0,110,620,500,210,330,84,0,108,607,500,210,330,82,0,101,546,500,210,330,80,0,90,456,500,210,330,77,0,77,348,500,210,330,75,0,63,235,500,210,330,74,0,51,131,500,210,330,72,0,41,50,500,210,330,71,0,36,6,500,210,330,70,0,35,0,500,210,329,71,0,35,4,500,208,319,84,0,35,20,503,204,300,111,0,35,49,509,198,273,147,0,35,90,518,191,240,191,0,35,143,528,184,205,239,0,35,208,540,176,168,289,0,35,276,553,168,133,338,0,35,343,566,162,101,383,0,35,410,578,156,74,421,0,35,478,588,152,55,451,0,35,545,596,150,46,468,0,35,612,600,150,45,474,0,35,680,600,150,45,478,5,35,747,600,151,45,483,21,35,810,600,152,45,487,47,35,881,600,153,46,490,83,35,900,600,155,46,493,126,35,900,600,156,46,496,178,35,900,600,158,46,498,236,35,900,600,160,47,501,298,35,900,600,162,47,502,365,35,900,600,164,47,504,415,35,900,600,166,48,505,420,35,900,600,168,48,507,420,35,900,600,170,48,508,420,35,900,600,171,49,508,420,35,900,600,173,49,509,420,35,900,600,175,49,509,420,35,900,600,176,49,510,420,35,900,600,178,50,510,420,35,900,600,179,50,510,420,35,900,600,179,50,510,420,35,900,600,180,50,510,420,35,900,600,180,50,510,420,35,900,600],"home":[260,45,340,0,110,620,600,260,45,340,0,110,620,600,260,45,340,0,110,620,600,260,45,340,0,110,620,600,261,45,340,-4,109,622,600,261,45,340,-46,102,651,600,261,45,340,-118,89,699,600,262,45,340,-207,73,758,600,262,45,339,-296,57,817,600,263,45,339,-370,44,867,600,263,45,339,-414,36,896,600,264,45,338,-416,35,900,600,264,45,338,-309,35,900,600,265,46,337,-133,35,900,600,265,46,336,5,35,900,600,266,46,335,127,35,900,600,266,46,334,228,35,900,600,267,46,333,308,35,900,600,267,46,332,367,35,900,600,268,47,330,406,35,900,600,268,47,328,420,35,900,600,269,47,327,420,35,900,600,269,48,325,420,35,900,600,269,48,322,420,35,900,600,270,48,320,420,35,900,600,270,49,317,420,35,900,600,270,49,315,420,35,900,600,270,50,312,420,35,900,600,270,51,308,417,35,900,600,270,58,302,367,35,900,596,269,71,295,291,35,900,589,269,88,285,197,35,900,581,268,109,274,104,35,900,570,267,133,262,32,35,856,559,266,159,248,1,35,697,547,265,187,234,0,35,556,535,264,214,219,0,35,414,523,262,241,203,0,35,285,512,260,266,188,0,35,172,503,258,288,172,0,35,84,494,256,307,157,0,35,24,488,254,322,142,0,35,1,483,252,332,128,0,35,0,480,249,336,115,0,35,0,480,246,338,104,0,35,0,480,244,339,94,0,35,0,480,242,340,87,0,35,0,480,241,340,82,0,35,0,480,240,340,80,0,35,0,480]},"orbit":{"label":"ORBIT","n":49,"in":[252,140,410,0,110,620,560,252,140,410,0,110,620,560,252,140,410,0,110,620,560,252,140,410,0,110,620,560,252,140,410,0,110,620,560,252,140,410,0,110,620,560,252,140,410,-7,109,625,560,252,140,410,-39,105,646,560,252,140,410,-84,100,676,560,252,140,410,-140,93,714,560,252,140,410,-203,86,755,560,252,140,410,-266,78,797,560,252,140,410,-322,71,836,560,252,140,410,-378,66,868,560,252,140,410,-399,62,891,560,252,140,410,-346,60,900,560,252,140,410,-207,60,900,560,252,140,410,-53,60,900,560,252,140,410,67,60,900,560,252,140,410,172,60,900,560,252,140,410,259,60,900,560,252,140,410,327,60,900,560,252,140,410,378,60,900,560,252,140,410,413,60,900,560,252,140,410,420,60,900,560,252,140,410,420,60,900,560,252,140,410,420,60,900,560,253,140,410,419,60,900,560,259,141,406,404,60,900,560,271,142,396,366,60,900,559,289,144,382,314,60,900,557,311,146,361,253,60,900,555,335,149,336,186,60,900,553,359,152,304,120,60,900,551,383,155,267,63,60,886,549,403,159,226,21,60,820,546,420,162,180,2,60,715,543,432,166,131,0,60,614,540,439,170,82,0,60,514,537,440,174,32,0,60,416,535,435,178,-16,0,60,325,532,426,181,-60,0,60,240,530,413,184,-101,0,60,165,527,399,187,-136,0,60,102,525,383,190,-166,0,60,52,523,369,192,-190,0,60,17,522,357,194,-207,0,60,2,521,350,195,-217,0,60,0,520,347,195,-221,0,60,0,520],"out":[360,190,-202,0,110,620,520,360,190,-202,0,110,620,520,360,190,-202,0,110,620,520,360,190,-202,0,110,620,520,360,190,-202,0,110,620,520,360,190,-202,0,109,607,520,360,190,-202,0,104,546,520,360,190,-202,0,97,456,520,360,190,-202,0,88,348,520,360,190,-202,0,79,235,520,360,190,-202,0,71,131,520,360,190,-202,0,64,50,520,360,190,-202,0,60,6,520,360,190,-202,0,60,0,520,361,190,-201,0,60,4,520,374,188,-183,0,60,20,521,395,185,-144,0,60,49,524,418,181,-88,0,60,90,527,435,175,-18,0,60,143,531,440,169,63,0,60,208,536,429,163,147,0,60,276,541,403,157,226,0,60,343,546,366,151,294,0,60,410,550,325,147,347,0,60,478,554,287,143,384,0,60,545,558,260,141,405,0,60,612,560,252,140,411,0,60,680,560,249,140,413,5,60,747,560,247,140,414,21,60,810,560,245,140,415,47,60,881,560,243,140,417,83,60,900,560,242,140,418,126,60,900,560,240,140,419,178,60,900,560,239,140,419,236,60,900,560,238,140,420,298,60,900,560,237,140,421,365,60,900,560,236,140,421,415,60,900,560,236,140,422,420,60,900,560,235,140,422,420,60,900,560,234,140,422,420,60,900,560,234,140,423,420,60,900,560,234,140,423,420,60,900,560,234,140,423,420,60,900,560,233,140,423,420,60,900,560,233,140,423,420,60,900,560,233,140,423,420,60,900,560,233,140,423,420,60,900,560,233,140,423,420,60,900,560,233,140,423,420,60,900,560],"home":[252,140,410,0,110,620,560,252,140,410,0,110,620,560,252,140,410,0,110,620,560,252,140,410,0,110,620,560,252,140,410,-4,110,622,560,252,140,410,-46,104,651,560,252,140,410,-118,96,699,560,252,140,410,-207,85,758,560,252,140,410,-296,75,817,560,252,140,410,-370,66,867,560,252,140,410,-414,61,896,560,252,140,410,-416,60,900,560,252,140,410,-309,60,900,560,252,140,410,-133,60,900,560,252,140,410,5,60,900,560,252,140,410,127,60,900,560,252,140,410,228,60,900,560,252,140,410,308,60,900,560,252,140,410,367,60,900,560,252,140,410,406,60,900,560,252,140,410,420,60,900,560,252,140,410,420,60,900,560,252,140,410,420,60,900,560,252,140,410,420,60,900,560,252,140,410,420,60,900,560,252,140,410,420,60,900,560,252,140,410,420,60,900,560,252,140,410,420,60,900,560,254,140,409,417,60,900,560,267,141,400,367,60,900,559,291,143,380,291,60,900,557,321,146,351,197,60,900,554,354,149,311,104,60,900,551,386,153,262,32,60,856,547,412,157,204,1,60,697,543,431,161,139,0,60,556,539,439,166,73,0,60,414,535,438,170,7,0,60,285,531,428,175,-53,0,60,172,528,411,179,-106,0,60,84,525,392,183,-149,0,60,24,522,375,187,-180,0,60,1,521,362,189,-200,0,60,0,520,356,192,-209,0,60,0,520,351,193,-215,0,60,0,520,349,194,-218,0,60,0,520,347,195,-220,0,60,0,520,347,195,-221,0,60,0,520,347,195,-221,0,60,0,520]},"dolly":{"label":"DOLLY","n":49,"in":[170,125,530,0,110,620,580,170,125,530,0,110,620,580,170,125,530,0,110,620,580,170,125,530,0,110,620,580,170,125,530,0,110,620,580,170,125,530,0,110,620,580,170,125,530,-7,109,625,580,171,125,529,-39,106,646,580,171,125,529,-84,102,676,580,171,125,528,-140,97,714,580,172,125,528,-203,91,755,580,172,125,527,-266,85,797,580,173,125,526,-322,79,836,580,173,125,525,-378,75,868,580,174,125,524,-399,71,891,580,175,125,523,-346,70,900,580,176,125,521,-207,70,900,580,178,125,520,-53,70,900,580,179,125,518,67,70,900,580,181,125,516,172,70,900,580,183,125,513,259,70,900,580,185,125,510,327,70,900,580,187,125,508,378,70,900,580,189,125,504,413,70,900,580,192,125,501,420,70,900,580,195,125,497,420,70,900,580,198,125,493,420,70,900,580,201,125,488,419,70,900,580,205,125,481,404,70,900,579,210,125,472,366,70,900,578,215,125,459,314,70,900,577,220,124,444,253,70,900,575,226,124,427,186,70,900,572,232,124,408,120,70,900,570,238,123,387,63,70,886,567,244,123,364,21,70,820,564,250,123,340,2,70,715,561,256,122,314,0,70,614,558,262,122,287,0,70,514,555,267,122,259,0,70,416,552,272,121,231,0,70,325,549,277,121,202,0,70,240,547,281,121,172,0,70,165,545,284,120,142,0,70,102,543,287,120,112,0,70,52,542,289,120,82,0,70,17,541,290,120,53,0,70,2,540,290,120,24,0,70,0,540,290,120,10,0,70,0,540],"out":[290,120,-120,0,110,620,540,290,120,-120,0,110,620,540,290,120,-120,0,110,620,540,290,120,-120,0,110,620,540,290,120,-119,0,110,620,540,290,120,-119,0,109,607,540,290,120,-118,0,105,546,540,290,120,-117,0,99,456,540,290,120,-116,0,92,348,540,290,120,-114,0,85,235,540,290,120,-112,0,78,131,540,290,120,-110,0,73,50,540,290,120,-106,0,70,6,540,290,120,-103,0,70,0,540,290,120,-97,0,70,4,540,290,120,-74,0,70,20,541,290,120,-33,0,70,49,543,290,121,23,0,70,90,547,290,121,90,0,70,143,551,290,122,164,0,70,208,555,290,123,240,0,70,276,560,290,123,317,0,70,343,564,290,124,389,0,70,410,569,290,124,453,0,70,478,573,290,125,505,0,70,545,577,290,125,542,0,70,612,579,290,125,559,0,70,680,580,290,125,561,5,70,747,580,290,125,562,21,70,810,580,290,125,563,47,70,881,580,289,125,564,83,70,900,580,289,125,565,126,70,900,580,288,125,566,178,70,900,580,288,125,567,236,70,900,580,287,125,567,298,70,900,580,286,125,568,365,70,900,580,286,125,568,415,70,900,580,285,125,569,420,70,900,580,284,125,569,420,70,900,580,284,125,569,420,70,900,580,283,125,570,420,70,900,580,282,125,570,420,70,900,580,282,125,570,420,70,900,580,281,125,570,420,70,900,580,281,125,570,420,70,900,580,281,125,570,420,70,900,580,280,125,570,420,70,900,580,280,125,570,420,70,900,580,280,125,570,420,70,900,580],"home":[170,125,530,0,110,620,580,170,125,530,0,110,620,580,170,125,530,0,110,620,580,170,125,530,0,110,620,580,170,125,530,-4,110,622,580,170,125,530,-46,106,651,580,170,125,530,-118,99,699,580,170,125,529,-207,90,758,580,171,125,529,-296,82,817,580,171,125,529,-370,75,867,580,171,125,528,-414,71,896,580,172,125,527,-416,70,900,580,172,125,527,-309,70,900,580,173,125,526,-133,70,900,580,174,125,525,5,70,900,580,175,125,524,127,70,900,580,176,125,522,228,70,900,580,177,125,521,308,70,900,580,178,125,519,367,70,900,580,180,125,517,406,70,900,580,182,125,515,420,70,900,580,183,125,512,420,70,900,580,185,125,510,420,70,900,580,188,125,507,420,70,900,580,190,125,503,420,70,900,580,193,125,500,420,70,900,580,195,125,496,420,70,900,580,198,125,492,420,70,900,580,202,125,486,417,70,900,580,207,125,471,367,70,900,579,213,125,448,291,70,900,576,221,124,416,197,70,900,573,230,124,379,104,70,900,569,239,123,337,32,70,856,565,248,123,293,1,70,697,561,257,122,248,0,70,556,556,266,122,203,0,70,414,552,273,121,160,0,70,285,548,280,121,121,0,70,172,545,285,120,87,0,70,84,542,289,120,60,0,70,24,541,290,120,41,0,70,1,540,290,120,30,0,70,0,540,290,120,21,0,70,0,540,290,120,16,0,70,0,540,290,120,12,0,70,0,540,290,120,11,0,70,0,540,290,120,10,0,70,0,540,290,120,10,0,70,0,540]},"rear":{"label":"REAR TRACK","n":49,"in":[-60,130,-460,0,110,620,520,-60,130,-460,0,110,620,520,-60,130,-460,0,110,620,520,-60,130,-460,0,110,620,520,-60,130,-460,0,110,620,520,-60,130,-460,0,110,620,520,-60,130,-460,-7,109,625,520,-60,130,-460,-39,107,646,520,-60,130,-460,-84,103,676,520,-60,130,-460,-140,98,714,520,-60,130,-460,-203,93,755,520,-60,130,-460,-266,88,797,520,-60,130,-460,-322,83,836,520,-60,130,-460,-378,79,868,520,-60,130,-460,-399,76,891,520,-60,130,-460,-346,75,900,520,-60,130,-460,-207,75,900,520,-60,130,-460,-53,75,900,520,-60,130,-460,67,75,900,520,-60,130,-460,172,75,900,520,-60,130,-460,259,75,900,520,-60,130,-460,327,75,900,520,-60,130,-460,378,75,900,520,-60,130,-460,413,75,900,520,-60,130,-460,420,75,900,520,-60,130,-460,420,75,900,520,-60,130,-460,420,75,900,520,-60,130,-460,419,75,900,520,-60,130,-461,404,75,900,519,-61,131,-463,366,75,900,516,-62,132,-466,314,75,900,513,-64,134,-470,253,75,900,509,-65,136,-474,186,75,900,504,-67,138,-480,120,75,900,498,-69,140,-486,63,75,886,492,-71,143,-492,21,75,820,486,-74,146,-499,2,75,715,480,-76,150,-506,0,75,614,474,-78,153,-513,0,75,514,468,-80,157,-520,0,75,416,463,-83,161,-528,0,75,325,458,-84,165,-535,0,75,240,453,-86,170,-542,0,75,165,449,-88,174,-549,0,75,102,446,-89,179,-556,0,75,52,443,-90,183,-562,0,75,17,441,-90,188,-568,0,75,2,440,-90,193,-573,0,75,0,440,-90,195,-575,0,75,0,440],"out":[-80,180,-560,0,110,620,460,-80,180,-560,0,110,620,460,-80,180,-560,0,110,620,460,-80,180,-560,0,110,620,460,-80,180,-560,0,110,620,460,-80,180,-560,0,109,607,460,-80,180,-559,0,106,546,460,-80,180,-559,0,101,456,460,-80,180,-558,0,95,348,460,-80,180,-557,0,88,235,460,-80,180,-556,0,82,131,460,-80,180,-555,0,78,50,460,-80,180,-553,0,75,6,460,-80,180,-551,0,75,0,460,-80,180,-547,0,75,4,460,-78,177,-524,0,75,20,463,-76,172,-480,0,75,49,468,-72,165,-420,0,75,90,476,-67,156,-347,0,75,143,486,-61,147,-267,0,75,208,497,-55,137,-183,0,75,276,509,-49,127,-99,0,75,343,522,-44,118,-20,0,75,410,534,-39,111,50,0,75,478,545,-35,105,106,0,75,545,553,-31,101,145,0,75,612,559,-30,100,163,0,75,680,560,-28,100,173,5,75,747,560,-27,100,182,21,75,810,560,-26,101,190,47,75,881,560,-25,101,198,83,75,900,560,-24,101,204,126,75,900,560,-24,102,210,178,75,900,560,-23,102,215,236,75,900,560,-22,103,220,298,75,900,560,-22,104,224,365,75,900,560,-22,104,227,415,75,900,560,-21,105,230,420,75,900,560,-21,106,233,420,75,900,560,-21,106,235,420,75,900,560,-20,107,236,420,75,900,560,-20,108,238,420,75,900,560,-20,108,238,420,75,900,560,-20,109,239,420,75,900,560,-20,109,240,420,75,900,560,-20,110,240,420,75,900,560,-20,110,240,420,75,900,560,-20,110,240,420,75,900,560,-20,110,240,420,75,900,560],"home":[-60,130,-460,0,110,620,520,-60,130,-460,0,110,620,520,-60,130,-460,0,110,620,520,-60,130,-460,0,110,620,520,-60,130,-460,-4,110,622,520,-60,130,-460,-46,106,651,520,-60,130,-460,-118,100,699,520,-60,130,-460,-207,93,758,520,-60,130,-460,-296,85,817,520,-60,130,-460,-370,79,867,520,-60,130,-460,-414,76,896,520,-60,130,-460,-416,75,900,520,-60,130,-460,-309,75,900,520,-60,130,-460,-133,75,900,520,-60,130,-460,5,75,900,520,-60,130,-460,127,75,900,520,-60,130,-460,228,75,900,520,-60,130,-460,308,75,900,520,-60,130,-460,367,75,900,520,-60,130,-460,406,75,900,520,-60,130,-460,420,75,900,520,-60,130,-460,420,75,900,520,-60,130,-460,420,75,900,520,-60,130,-460,420,75,900,520,-60,130,-460,420,75,900,520,-60,130,-460,420,75,900,520,-60,130,-460,420,75,900,520,-60,130,-460,420,75,900,520,-60,130,-460,417,75,900,520,-61,132,-463,367,75,900,517,-63,135,-469,291,75,900,512,-65,138,-477,197,75,900,505,-68,143,-486,104,75,900,497,-71,149,-497,32,75,856,488,-74,155,-508,1,75,697,479,-77,161,-520,0,75,556,471,-81,167,-531,0,75,414,463,-83,173,-542,0,75,285,455,-86,178,-552,0,75,172,449,-88,183,-560,0,75,84,444,-89,187,-566,0,75,24,441,-90,190,-570,0,75,1,440,-90,192,-572,0,75,0,440,-90,193,-573,0,75,0,440,-90,194,-574,0,75,0,440,-90,195,-575,0,75,0,440,-90,195,-575,0,75,0,440,-90,195,-575,0,75,0,440,-90,195,-575,0,75,0,440]}};
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
