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
  // Blender 5.2.3 LTS (bpy module); tools/gen/blender/garage-camera-rigs.py; 49 samples over u: eye, aim (cm), fov (0.1 deg), two base64url chars each (+2048).
  // Source SHA256: 01dd82bea5ab83cac0790997226192b2f09affebded7283cf9d613a76e50d33f
  const RIGS = {"crane":{"label":"CRANE","n":49,"in":"kEgtlUgAhupspYkEgtlUgAhupspYkEgtlUgAhupspYkEgtlUgAhupspYkFgtlUgAhupspYkFgtlUgAhupspYkFgtlUf5htpxpYkGgtlTfZhnqGpYkGgtlTeshfqkpYkHgtlTd0hVrKpYkHgtlSc1hKrzpYkIgtlSb2g_sdpYkIgtlRa-g0tEpYkJgulRaGgrtkpYkJgulQZxglt7pYkKgulPamgjuEpYkKgulOcxgjuEpYkLgulMfLgjuEpYkMgvlLhDgjuEpYkMgvlJisgjuEpYkMgvlHkDgjuEpYkNgvlFlHgjuEpYkNgwlDl6gjuEpYkNgwlBmdgjuEpYkOgxk-mkgjuEpYkOgxk7mkgjuEpYkOgyk4mkgjuEpYkOgyk1mjgjuEpYkOg2kvmUgjuEpWkNg9kolugjuEpTkMhGkfk6gjuEpOkLhTkUj9gjuEpJkJhhkIi6gjuEpCkIhxj7h4gjuEo6kGiDjsg_gjt2oykEiWjegVgjs0oqkCiqjOgCgjrLohkAi-i_gAgjpmoZj-jSiwgAgjoCoQj8jmihgAgjmgoIj5j5iSgAgjlFoBj4kMiFgAgjjwn6j2kdh4gAgjiln0j0kshtgAgjhmnujzk6hjgAgjg0npjylFhbgAgjgRnljxlNhVgAgjgCnijwlShRgAgjgAnhjwlUhQgAgjgAng","out":"jSlKhagAhupsn0jSlKhagAhupsn0jSlKhZgAhupsn0jSlKhYgAhupsn0jSlKhWgAhupsn0jSlKhUgAhspfn0jSlKhSgAhloin0jSlKhQgAhanIn0jSlKhNgAhNlcn0jSlKhLgAg_jrn0jSlKhKgAgziDn0jSlKhIgAgpgyn0jSlKhHgAgkgGn0jSlKhGgAgjgAn0jSlJhHgAgjgEn0jQk_hUgAgjgUn3jMkshvgAgjgxn9jGkRiTgAgjhaoGi_jwi_gAgjiPoQi4jNjvgAgjjQociwiokhgAgjkUopioiFlSgAgjlXo2iihll_gAgjmapCichKmlgAgjnepMiYg3nDgAgjohpUiWgunUgAgjpkpYiWgtnagAgjqopYiWgtnegFgjrrpYiXgtnjgVgjsqpYiYgtnngvgjtxpYiZgunqhTgjuEpYibgunth-gjuEpYicgunwiygjuEpYiegunyjsgjuEpYiggvn1kqgjuEpYiigvn2ltgjuEpYikgvn4mfgjuEpYimgwn5mkgjuEpYiogwn7mkgjuEpYiqgwn8mkgjuEpYirgxn8mkgjuEpYitgxn9mkgjuEpYivgxn9mkgjuEpYiwgxn-mkgjuEpYiygyn-mkgjuEpYizgyn-mkgjuEpYizgyn-mkgjuEpYi0gyn-mkgjuEpYi0gyn-mkgjuEpY","home":"kEgtlUgAhupspYkEgtlUgAhupspYkEgtlUgAhupspYkEgtlUgAhupspYkFgtlUf8htpupYkFgtlUfShmqLpYkFgtlUeKhZq7pYkGgtlUcxhJr2pYkGgtlTbYg5sxpYkHgtlTaOgstjpYkHgtlTZigkuApYkIgtlSZggjuEpYkIgtlSbLgjuEpYkJgulRd7gjuEpYkJgulQgFgjuEpYkKgulPh_gjuEpYkKgulOjkgjuEpYkLgulNk0gjuEpYkLgulMlvgjuEpYkMgvlKmWgjuEpYkMgvlImkgjuEpYkNgvlHmkgjuEpYkNgwlFmkgjuEpYkNgwlCmkgjuEpYkOgwlAmkgjuEpYkOgxk9mkgjuEpYkOgxk7mkgjuEpYkOgyk4mkgjuEpYkOgzk0mhgjuEpYkOg6kulvgjuEpUkNhHknkjgjuEpNkNhYkdjFgjuEpFkMhtkShogjuEo6kLiFkGgggjtYovkKifj4gBgjq5ojkJi7jqgAgjosoXkIjWjbgAgjmeoLkGjxjLgAgjkdoAkEkKi8gAgjisn3kCkgisgAgjhUnukAkzidgAgjgYnoj-lCiOgAgjgBnjj8lMiAgAgjgAngj5lQhzgAgjgAngj2lShogAgjgAngj0lThegAgjgAngjylUhXgAgjgAngjxlUhSgAgjgAngjwlUhQgAgjgAng"},"orbit":{"label":"ORBIT","n":49,"in":"j8iMmagAhupsowj8iMmagAhupsowj8iMmagAhupsowj8iMmagAhupsowj8iMmagAhupsowj8iMmagAhupsowj8iMmaf5htpxowj8iMmafZhpqGowj8iMmaeshkqkowj8iMmad0hdrKowj8iMmac1hWrzowj8iMmab2hOsdowj8iMmaa-hHtEowj8iMmaaGhCtkowj8iMmaZxg-t7owj8iMmaamg8uEowj8iMmacxg8uEowj8iMmafLg8uEowj8iMmahDg8uEowj8iMmaisg8uEowj8iMmakDg8uEowj8iMmalHg8uEowj8iMmal6g8uEowj8iMmamdg8uEowj8iMmamkg8uEowj8iMmamkg8uEowj8iMmamkg8uEowj9iMmamjg8uEowkDiNmWmUg8uEowkPiOmMlug8uEovkhiQl-k6g8uEotk3iSlpj9g8uEorlPiVlQi6g8uEoplniYkwh4g8uEonl_ibkLg_g8t2olmTifjigVg8s0oimkiii0gCg8rLofmwimiDgAg8pmocm3iqhSgAg8oCoZm4iugggAg8mgoXmziyfwgAg8lFoUmqi1fEgAg8jwoSmdi4ebgAg8iloPmPi7d4gAg8hmoNl_i-dagAg8g0oLlxjAdCgAg8gRoKlljCcxgAg8gCoJlejDcngAg8gAoIlbjDcjgAg8gAoI","out":"loi-c2gAhupsoIloi-c2gAhupsoIloi-c2gAhupsoIloi-c2gAhupsoIloi-c2gAhupsoIloi-c2gAhtpfoIloi-c2gAhooioIloi-c2gAhhnIoIloi-c2gAhYlcoIloi-c2gAhPjroIloi-c2gAhHiDoIloi-c2gAhAgyoIloi-c2gAg8gGoIloi-c2gAg8gAoIlpi-c3gAg8gEoIl2i8dJgAg8gUoJmLi5dwgAg8gxoMmii1eogAg8haoPmzivfugAg8iPoTm4ipg_gAg8jQoYmtijiTgAg8kUodmTidjigAg8lXoiluiXkmgAg8maomlFiTlbgAg8neoqkfiPmAgAg8ohoukEiNmVgAg8pkowj8iMmbgAg8qoowj5iMmdgFg8rrowj3iMmegVg8sqowj1iMmfgvg8txowjziMmhhTg8uEowjyiMmih-g8uEowjwiMmjiyg8uEowjviMmjjsg8uEowjuiMmkkqg8uEowjtiMmlltg8uEowjsiMmlmfg8uEowjsiMmmmkg8uEowjriMmmmkg8uEowjqiMmmmkg8uEowjqiMmnmkg8uEowjqiMmnmkg8uEowjqiMmnmkg8uEowjpiMmnmkg8uEowjpiMmnmkg8uEowjpiMmnmkg8uEowjpiMmnmkg8uEowjpiMmnmkg8uEowjpiMmnmkg8uEow","home":"j8iMmagAhupsowj8iMmagAhupsowj8iMmagAhupsowj8iMmagAhupsowj8iMmaf8hupuowj8iMmafShoqLowj8iMmaeKhgq7owj8iMmacxhVr2owj8iMmabYhLsxowj8iMmaaOhCtjowj8iMmaZig9uAowj8iMmaZgg8uEowj8iMmabLg8uEowj8iMmad7g8uEowj8iMmagFg8uEowj8iMmah_g8uEowj8iMmajkg8uEowj8iMmak0g8uEowj8iMmalvg8uEowj8iMmamWg8uEowj8iMmamkg8uEowj8iMmamkg8uEowj8iMmamkg8uEowj8iMmamkg8uEowj8iMmamkg8uEowj8iMmamkg8uEowj8iMmamkg8uEowj8iMmamkg8uEowj-iMmZmhg8uEowkLiNmQlvg8uEovkjiPl8kjg8uEotlBiSlfjFg8uEoqliiVk3hog8uEonmCiZkGggg8tYojmcidjMgBg8q5ofmvihiLgAg8osobm3imhJgAg8meoXm2iqgHgAg8kdoTmsivfLgAg8isoQmbizeWgAg8hUoNmIi3drgAg8gYoKl3i7dMgAg8gBoJlqi9c4gAg8gAoIlkjAcvgAg8gAoIlfjBcpgAg8gAoIldjCcmgAg8gAoIlbjDckgAg8gAoIlbjDcjgAg8gAoIlbjDcjgAg8gAoI"},"dolly":{"label":"DOLLY","n":49,"in":"iqh9oSgAhupspEiqh9oSgAhupspEiqh9oSgAhupspEiqh9oSgAhupspEiqh9oSgAhupspEiqh9oSgAhupspEiqh9oSf5htpxpEirh9oRfZhqqGpEirh9oReshmqkpEirh9oQd0hhrKpEish9oQc1hbrzpEish9oPb2hVsdpEith9oOa-hPtEpEith9oNaGhLtkpEiuh9oMZxhHt7pEivh9oLamhGuEpEiwh9oJcxhGuEpEiyh9oIfLhGuEpEizh9oGhDhGuEpEi1h9oEishGuEpEi3h9oBkDhGuEpEi5h9n-lHhGuEpEi7h9n8l6hGuEpEi9h9n4mdhGuEpEjAh9n1mkhGuEpEjDh9nxmkhGuEpEjGh9ntmkhGuEpEjJh9nomjhGuEpEjNh9nhmUhGuEpDjSh9nYluhGuEpCjXh9nLk6hGuEpBjch8m8j9hGuEo_jih8mri6hGuEo8joh8mYh4hGuEo6juh7mDg_hGt2o3j0h7lsgVhGs0o0j6h7lUgChGrLoxkAh6k6gAhGpmoukGh6kfgAhGoCorkLh6kDgAhGmgookQh5jngAhGlFolkVh5jKgAhGjwojkZh5isgAhGilohkch4iOgAhGhmofkfh4hwgAhGg0oekhh4hSgAhGgRodkih4g1gAhGgCockih4gYgAhGgAockih4gKgAhGgAoc","out":"kih4eIgAhupsockih4eIgAhupsockih4eIgAhupsockih4eIgAhupsockih4eJgAhupsockih4eJgAhtpfockih4eKgAhpoiockih4eLgAhjnIockih4eMgAhclcockih4eOgAhVjrockih4eQgAhOiDockih4eSgAhJgyockih4eWgAhGgGockih4eZgAhGgAockih4efgAhGgEockih4e2gAhGgUodkih4ffgAhGgxofkih5gXgAhGhaojkih5hagAhGiPonkih6ikgAhGjQorkih7jwgAhGkUowkih7k9gAhGlXo0kih8mFgAhGmao5kih8nFgAhGneo9kih9n5gAhGohpBkih9oegAhGpkpDkih9ovgAhGqopEkih9oxgFhGrrpEkih9oygVhGsqpEkih9ozgvhGtxpEkhh9o0hThGuEpEkhh9o1h-hGuEpEkgh9o2iyhGuEpEkgh9o3jshGuEpEkfh9o3kqhGuEpEkeh9o4lthGuEpEkeh9o4mfhGuEpEkdh9o5mkhGuEpEkch9o5mkhGuEpEkch9o5mkhGuEpEkbh9o6mkhGuEpEkah9o6mkhGuEpEkah9o6mkhGuEpEkZh9o6mkhGuEpEkZh9o6mkhGuEpEkZh9o6mkhGuEpEkYh9o6mkhGuEpEkYh9o6mkhGuEpEkYh9o6mkhGuEpE","home":"iqh9oSgAhupspEiqh9oSgAhupspEiqh9oSgAhupspEiqh9oSgAhupspEiqh9oSf8hupupEiqh9oSfShqqLpEiqh9oSeKhjq7pEiqh9oRcxhar2pEirh9oRbYhSsxpEirh9oRaOhLtjpEirh9oQZihHuApEish9oPZghGuEpEish9oPbLhGuEpEith9oOd7hGuEpEiuh9oNgFhGuEpEivh9oMh_hGuEpEiwh9oKjkhGuEpEixh9oJk0hGuEpEiyh9oHlvhGuEpEi0h9oFmWhGuEpEi2h9oDmkhGuEpEi3h9oAmkhGuEpEi5h9n-mkhGuEpEi8h9n7mkhGuEpEi-h9n3mkhGuEpEjBh9n0mkhGuEpEjDh9nwmkhGuEpEjGh9nsmkhGuEpEjKh9nmmhhGuEpEjPh9nXlvhGuEpDjVh9nAkjhGuEpAjdh8mgjFhGuEo9jmh8l7hohGuEo5jvh7lRgghGtYo1j4h7klgBhGq5oxkBh6j4gAhGososkKh6jLgAhGmeookRh5iggAhGkdokkYh5h5gAhGisohkdh4hXgAhGhUoekhh4g8gAhGgYodkih4gpgAhGgBockih4gegAhGgAockih4gVgAhGgAockih4gQgAhGgAockih4gMgAhGgAockih4gLgAhGgAockih4gKgAhGgAockih4gKgAhGgAoc"},"rear":{"label":"REAR TRACK","n":49,"in":"fEiCY0gAhupsoIfEiCY0gAhupsoIfEiCY0gAhupsoIfEiCY0gAhupsoIfEiCY0gAhupsoIfEiCY0gAhupsoIfEiCY0f5htpxoIfEiCY0fZhrqGoIfEiCY0eshnqkoIfEiCY0d0hirKoIfEiCY0c1hdrzoIfEiCY0b2hYsdoIfEiCY0a-hTtEoIfEiCY0aGhPtkoIfEiCY0ZxhMt7oIfEiCY0amhLuEoIfEiCY0cxhLuEoIfEiCY0fLhLuEoIfEiCY0hDhLuEoIfEiCY0ishLuEoIfEiCY0kDhLuEoIfEiCY0lHhLuEoIfEiCY0l6hLuEoIfEiCY0mdhLuEoIfEiCY0mkhLuEoIfEiCY0mkhLuEoIfEiCY0mkhLuEoIfEiCY0mjhLuEoIfEiCYzmUhLuEoHfDiDYxluhLuEoEfCiEYuk6hLuEoBfAiGYqj9hLuEn9e_iIYmi6hLuEn4e9iKYgh4hLuEnye7iMYag_hLt2nse5iPYUgVhLs0nme2iSYNgChLrLnge0iWYGgAhLpmnaeyiZX_gAhLoCnUewidX4gAhLmgnPetihXwgAhLlFnKesilXpgAhLjwnFeqiqXigAhLilnBeoiuXbgAhLhmm-enizXUgAhLg0m7emi3XOgAhLgRm5emi8XIgAhLgCm4emjBXDgAhLgAm4emjDXBgAhLgAm4","out":"ewi0XQgAhupsnMewi0XQgAhupsnMewi0XQgAhupsnMewi0XQgAhupsnMewi0XQgAhupsnMewi0XQgAhtpfnMewi0XRgAhqoinMewi0XRgAhlnInMewi0XSgAhflcnMewi0XTgAhYjrnMewi0XUgAhSiDnMewi0XVgAhOgynMewi0XXgAhLgGnMewi0XZgAhLgAnMewi0XdgAhLgEnMeyixX0gAhLgUnPe0isYggAhLgxnUe4ilZcgAhLhance9icalgAhLiPnmfDiTb1gAhLjQnxfJiJdJgAhLkUn9fPh_edgAhLlXoKfUh2fsgAhLmaoWfZhvgygAhLneohfdhphqgAhLohopfhhliRgAhLpkovfihkijgAhLqoowfkhkitgFhLrrowflhki2gVhLsqowfmhli-gvhLtxowfnhljGhThLuEowfohljMh-hLuEowfohmjSiyhLuEowfphmjXjshLuEowfqhnjckqhLuEowfqhojglthLuEowfqhojjmfhLuEowfrhpjmmkhLuEowfrhqjpmkhLuEowfrhqjrmkhLuEowfshrjsmkhLuEowfshsjumkhLuEowfshsjumkhLuEowfshtjvmkhLuEowfshtjwmkhLuEowfshujwmkhLuEowfshujwmkhLuEowfshujwmkhLuEowfshujwmkhLuEow","home":"fEiCY0gAhupsoIfEiCY0gAhupsoIfEiCY0gAhupsoIfEiCY0gAhupsoIfEiCY0f8hupuoIfEiCY0fShqqLoIfEiCY0eKhkq7oIfEiCY0cxhdr2oIfEiCY0bYhVsxoIfEiCY0aOhPtjoIfEiCY0ZihMuAoIfEiCY0ZghLuEoIfEiCY0bLhLuEoIfEiCY0d7hLuEoIfEiCY0gFhLuEoIfEiCY0h_hLuEoIfEiCY0jkhLuEoIfEiCY0k0hLuEoIfEiCY0lvhLuEoIfEiCY0mWhLuEoIfEiCY0mkhLuEoIfEiCY0mkhLuEoIfEiCY0mkhLuEoIfEiCY0mkhLuEoIfEiCY0mkhLuEoIfEiCY0mkhLuEoIfEiCY0mkhLuEoIfEiCY0mkhLuEoIfEiCY0mhhLuEoIfDiEYxlvhLuEoFfBiHYrkjhLuEoAe_iKYjjFhLuEn5e8iPYahohLuEnxe5iVYPgghLtYnoe2ibYEgBhLq5nfezihX4gAhLosnXevinXtgAhLmenPetitXigAhLkdnHeqiyXYgAhLisnBeoi3XQgAhLhUm8eni7XKgAhLgYm5emi-XGgAhLgBm4emjAXEgAhLgAm4emjBXDgAhLgAm4emjCXCgAhLgAm4emjDXBgAhLgAm4emjDXBgAhLgAm4emjDXBgAhLgAm4emjDXBgAhLgAm4"}};
  // @blender-rigs:end
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  for (const rig of Object.values(RIGS)) for (const d of ["in", "out", "home"]) {
    const s = rig[d];
    if (typeof s !== "string") continue;
    const a = rig[d] = new Array(s.length / 2);
    for (let i = 0; i < a.length; i++) a[i] = B64.indexOf(s[2 * i]) * 64 + B64.indexOf(s[2 * i + 1]) - 2048;
  }
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
  const entranceSources = new WeakMap();
  function poseIn(seconds, config, calm, dir) {
    const t = Math.max(0, Number.isFinite(seconds) ? seconds : 0), T = timeline(config, dir), end = duration(config, dir), r = T.result;
    const rig = RIGS[config.angle] ? config.angle : null;
    const cams = shotsFor(config, "in"), side = rig ? 1 : sideFor(cams[2]), s2 = T.door + T.lane + T.pause;
    const n = t < T.door ? 0 : t < s2 ? 1 : 2, cam = cams[n];
    const look = { config, last: n === 2, k: n === 0 ? t / T.door : n === 1 ? (t - T.door) / (s2 - T.door) : (t - s2) / Math.max(1e-6, end - s2) };
    const u = Math.max(0, Math.min(1, (t - T.door) / T.lane));
    const lane = IN_LANE_M * (r && r.pushed ? ease(u) : 1 - (1 - u) * (1 - u));
    const back = ease((t - T.door - T.lane - T.pause) / T.back);
    if (dir === "in" && !entranceSources.has(config)) entranceSources.set(config,
      config._entranceAuthored !== false && typeof GarageEntranceMotion !== "undefined" && GarageEntranceMotion.available());
    const authored = dir === "in" && entranceSources.get(config)
      ? GarageEntranceMotion.pose(t, T, side) : null;
    const p = authored || (back > 0 ? pathAt(OUT_PATH * (1 - back), side)
      : { x: side * (OUT_R + lane - IN_LANE_M), z: OUT_STRAIGHT + OUT_R, yaw: side * OUT_TURN });
    const label = t < T.door ? "OPENING GARAGE"
      : r ? (t < T.door + T.lane + T.pause ? r.arrive : t < T.park ? r.park
        : (Number.isFinite(config.pos) && config.pos > 0 && dir === "home" && config.result !== "dnf" ? "P" + (config.pos | 0) + " · " : "") + r.title)
      : t < T.park ? "BRINGING CAR IN" : end > T.base && t < end - .5 ? "CREW SERVICING CAR" : "READY FOR WORK";
    // The shipped LEFT / RIGHT eyes keep their own framing; the new ones aim by aimAt.
    const aim = cam === "left" || cam === "right"
      ? [Math.max(-3.5, Math.min(3.5, p.x * 0.7)), 0.8, t < T.door ? 6.2 : Math.min(9, p.z * 0.48 + 0.8)] : aimAt(cam, p, t < T.door);
    const rs = rig ? rigOn(rig, dir, t, end, T.door, p, config, side) : null;
    return shot(Object.assign({ active: t < end, serviceTime: t - T.park, seconds: t, direction: "in", sequence: dir, result: r ? config.result : null,
      engine: !(r && r.pushed), side, calm, camera: rig || cam, shot: n + 1, mood: lightFor(config, dir), cue: cueFor(config, dir), swell: lookNum(config, "swell", 1),
      bars: !!config.bars, captions: config.captions !== false, rearLight: config.rearLight || "auto", sound: config.sound !== false, crewClear: 1 - ease((t - (T.park - .3)) / .3), crew: crewFor(config, dir), fov: rs ? rs.fov : config.fov,
      door: ease(t / T.door), x: p.x, z: p.z, yaw: p.yaw, label }, authored ? {
        // Channels describe authored motion, not renderer readiness. The ground root
        // remains y=0; body pitch/heave belong on a separate body-only transform.
        articulated: true, wheelDistance: authored.wheelDistance, steer: authored.steer,
        bodyPitch: authored.pitch, bodyHeave: authored.heave } : null),
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
      // Freeze source ownership for this run: an idle fetch must never swap paths mid-doorway.
      config._entranceAuthored = typeof GarageEntranceMotion !== "undefined" && GarageEntranceMotion.available();
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
