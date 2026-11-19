const GarageArrival = (function () {
  "use strict";
  const DOOR_S = 1.8;
  const ease = GarageCrewDraw.ease;
  function hypot(a, b, c) {
    const three = c !== undefined;
    a = Math.abs(a); b = Math.abs(b); c = three ? Math.abs(c) : 0;
    if (a === Infinity || b === Infinity || c === Infinity) return Infinity;
    if (a !== a || b !== b || c !== c) return NaN;
    const max = Math.max(a, b, c);
    if (max === 0) return 0;
    let n = a / max, sum = n * n, comp = 0, s, p;
    n = b / max; s = n * n - comp; p = sum + s; comp = (p - sum) - s; sum = p;
    if (three) { n = c / max; s = n * n - comp; sum += s; }
    return Math.sqrt(sum) * max;
  }
  const DEFAULT = Object.freeze({ enabled: true, speed: 1, angle: "cut", fov: 54, enterCrew: "mix", leaveCrew: "mix",
    shots: Object.freeze(["left", "right", "right"]), height: 0, door: DOOR_S, hold: null, carSpeed: 1, endBeat: 0,
    raceStart: true, pitIn: true, pitOut: true, afterRace: true, homeCrew: "auto", result: "win",
    move: "still", sway: 1, zoom: 0, light: "asset", homeLight: "auto", swell: 1, captions: true, bars: false, rearLight: "auto", slowmo: 0, sound: true, cue: "none", homeCue: "auto",
    race: "dry" });
  const CAMS = Object.freeze({ left: [-3.8, 2.1, -4.8], right: [4.1, 2.25, -4.9], high: [-4.6, 3.5, -5.7], low: [2.7, 0.45, -3.9], door: [-0.9, 2.2, 5.9] });
  const CAM_IDS = Object.freeze(Object.keys(CAMS));
  const CAM_SHOTS = Object.freeze(Object.fromEntries(CAM_IDS.map((id) => [id, Object.freeze([id, id, id])])));
  const PRESETS = Object.freeze({
    cut: { in: ["left", "right", "right"], out: ["left", "left", "left"] },
    director: { in: ["door", "left", "high"], out: ["high", "low", "door"] },
  });
  const ANGLES = Object.freeze(["cut"].concat(CAM_IDS, ["director", "custom"]));
  function shotsFor(config, dir) {
    const a = config && config.angle;
    if (a === "custom") return config.shots && config.shots.length === 3 ? config.shots : DEFAULT.shots;
    if (CAMS[a]) return CAM_SHOTS[a];
    return (PRESETS[a] || PRESETS.cut)[dir === "out" ? "out" : "in"];
  }
  const RESULTS = Object.freeze({
    win: { lane: 1.35, back: 1, pause: 1.4, end: 1.5, crew: "celebrate", crewAlt: "welcome", light: "showroom", cue: "flashes", arrive: "RACE WINNER · COMING HOME", park: "WELCOME BACK, WINNER", title: "RACE WINNER" },
    podium: { lane: 1.2, back: 1, pause: 0.9, end: 1, crew: "applause", crewAlt: "welcome", light: "broadcast", cue: "pulse", arrive: "PODIUM FINISH · COMING HOME", park: "WELCOME BACK", title: "PODIUM FINISH" },
    points: { lane: 1, back: 1, pause: 0.4, end: 0.5, crew: "current", arrive: "IN THE POINTS · COMING HOME", park: "BRINGING CAR IN", title: "POINTS FINISH" },
    finish: { lane: 1, back: 1, pause: 0, end: 0, crew: "console", crewAlt: "current", arrive: "RACE COMPLETE · COMING HOME", park: "BRINGING CAR IN", title: "RACE COMPLETE" },
    dnf: { lane: 2.2, back: 1.4, pause: 0.3, end: 0.5, crew: "recover", crewAlt: "guides", light: "inspection", cue: "beacon", pushed: true, arrive: "RETIRED · CREW RECOVERING CAR", park: "PUSHING CAR IN", title: "RETIRED" },
  });
  const MOVES = Object.freeze(["still", "push", "pull", "drift"]), MOVE_M = 1.2;
  const REAR = Object.freeze(["auto", "on", "off", "flash"]);
  const moodIds = () => typeof GarageScene !== "undefined" && GarageScene.MOODS ? Object.keys(GarageScene.MOODS) : [];
  const hasMood = (id) => typeof GarageScene !== "undefined" && !!GarageScene.MOODS && Object.prototype.propertyIsEnumerable.call(GarageScene.MOODS, id);
  const cueIds = () => typeof GarageScene !== "undefined" && GarageScene.CUES ? GarageScene.CUES.slice() : [];
  function cueFor(config, dir) {
    const c = config || DEFAULT;
    let v = dir === "home" ? c.homeCue : c.cue;
    if (dir === "home" && (!v || v === "auto")) v = (RESULTS[c.result] || RESULTS.finish).cue || "none";
    return v && v !== "none" && v !== "auto" ? v : null;
  }
  const RACES = Object.freeze(["dry", "wet", "night"]);
  const RACE_LIGHT = Object.freeze({ wet: "rain", night: "neon" });
  function lightFor(config, dir) {
    const c = config || DEFAULT;
    let v = dir === "home" ? c.homeLight : c.light;
    const raced = RACE_LIGHT[c.race];
    if (dir === "home" && (!v || v === "auto")) v = raced && hasMood(raced) ? raced : (RESULTS[c.result] || RESULTS.finish).light || "asset";
    return v && v !== "asset" && v !== "auto" ? v : null;
  }
  function resultKind(pos, out, sprint) {
    if (out) return "dnf";
    const p = Number(pos) | 0;
    return p === 1 ? "win" : p > 1 && p <= 3 ? "podium" : p > 3 && p <= (sprint ? 8 : 10) ? "points" : "finish";
  }
  function homeTitle(config, r) {
    const parts = [], out = config.result === "dnf";
    if (Number.isFinite(config.pos) && config.pos > 0 && !out) parts.push("P" + (config.pos | 0));
    if (config.driver) parts.push(String(config.driver).toUpperCase());
    parts.push(config.sprint ? r.title.replace(/^RACE /, "SPRINT ") : r.title);
    if (!out && config.grid === 1 && config.result === "win") parts.push("FROM POLE");
    else if (!out && Number.isFinite(config.grid) && config.pos > 0 && config.grid - config.pos >= 3) parts.push("+" + (config.grid - config.pos) + " PLACES");
    if (config.fastest && !out) parts.push("FASTEST LAP");
    return parts.join(" · ");
  }
  const STYLES = Object.freeze({
    broadcast: Object.freeze({ label: "BROADCAST", look: { angle: "director", move: "still", sway: 0, zoom: 0, fov: 54, light: "broadcast", cue: "lightsup", captions: true, bars: false, slowmo: 0 } }),
    cinema: Object.freeze({ label: "CINEMA", look: { angle: "crane", move: "still", sway: 0.5, zoom: 6, fov: 48, light: "goldenhour", cue: "none", captions: false, bars: true, slowmo: 0.5 } }),
    documentary: Object.freeze({ label: "DOCUMENTARY", look: { angle: "custom", shots: ["door", "low", "left"], move: "drift", sway: 2, zoom: 6, fov: 58, light: "asset", cue: "none", captions: true, bars: false, slowmo: 0 } }),
    showcase: Object.freeze({ label: "SHOWCASE", look: { angle: "orbit", move: "still", sway: 0, zoom: 8, fov: 50, light: "asset", cue: "spotsweep", captions: false, bars: true, slowmo: 0 } }),
    nightshift: Object.freeze({ label: "NIGHT SHIFT", look: { angle: "high", move: "drift", sway: 0.5, zoom: 0, fov: 56, light: "endurance", cue: "none", captions: true, bars: false, slowmo: 0 } }),
    rainready: Object.freeze({ label: "RAIN READY", look: { angle: "door", move: "drift", sway: 0.5, zoom: 4, fov: 56, light: "rain", cue: "none", captions: true, bars: false, slowmo: 0 } }),
    heritage: Object.freeze({ label: "HERITAGE", look: { angle: "low", move: "still", sway: 0, zoom: 6, fov: 50, light: "goldenhour", cue: "none", captions: false, bars: true, slowmo: 0.25 } }),
    qualify: Object.freeze({ label: "QUALIFYING", look: { angle: "high", move: "still", sway: 0, zoom: 4, fov: 52, light: "night", cue: "lightsup", captions: true, bars: false, slowmo: 0 } }),
  });
  function applyStyle(value, id) {
    const s = STYLES[id];
    return settings(s ? Object.assign({}, settings(value), s.look, s.look.shots ? { shots: s.look.shots.slice() } : null) : value);
  }
  function styleOf(value) {
    const v = settings(value);
    for (const id of Object.keys(STYLES)) {
      const want = applyStyle(v, id);
      if (Object.keys(STYLES[id].look).every((k) => k === "shots" ? want.shots.every((c, i) => v.shots[i] === c) : v[k] === want[k])) return id;
    }
    return null;
  }
  const SHARED = ["mix", "current", "guides", "service", "welcome", "none"];
  const resultClip = (id) => typeof GarageCrewChoreo !== "undefined" && !!(GarageCrewChoreo.CLIPS[id] && GarageCrewChoreo.CLIPS[id].result);
  const crewIds = (dir, results = false) => SHARED.concat(typeof GarageCrewChoreo !== "undefined"
    ? GarageCrewChoreo.IDS[dir].filter((id) => results || !resultClip(id)) : []);
  const _picked = new WeakMap();
  let _visit = null;
  function nextVisit() {
    if (_visit === null) {
      _visit = 0;
      try { const v = typeof localStorage !== "undefined" && Number(localStorage.getItem("apex26.crewVisit")); if (v > 0) _visit = v | 0; } catch (_) {  }
    }
    const n = _visit++;
    try { if (typeof localStorage !== "undefined") localStorage.setItem("apex26.crewVisit", String(_visit)); } catch (_) {  }
    return n;
  }
  const playable = (v) => typeof GarageCrewChoreo !== "undefined" && GarageCrewChoreo.known(v) && !GarageCrewChoreo.has(v) ? "current" : v;
  const _pinned = new WeakMap();
  const PIN_CREW = Object.freeze({ __proto__: null, in: "crew:in", out: "crew:out", home: "crew:home" });
  function pinMap(config) { let m = _pinned.get(config); if (!m) { m = {}; _pinned.set(config, m); } return m; }
  function rigFor(config) {
    if (!config || typeof config !== "object") return rigData(config.angle) ? config.angle : null;
    const m = pinMap(config);
    if (!("rig" in m)) m.rig = rigData(config.angle) ? config.angle : null;
    return m.rig;
  }
  function crewFor(config, dir) {
    if (!config || typeof config !== "object") return crewNow(config, dir);
    const m = pinMap(config), key = PIN_CREW[dir] || "crew:" + dir;
    if (!(key in m)) m[key] = crewNow(config, dir);
    return m[key];
  }
  const CREW_KEY = { in: "enterCrew", out: "leaveCrew", home: "homeCrew" };
  function carryPlayback(prev, next) {
    if (!prev || !next || typeof prev !== "object" || typeof next !== "object" || prev === next) return next;
    const from = _pinned.get(prev), deal = _picked.get(prev);
    const to = {}, dealTo = {};
    if (from && "rig" in from && prev.angle === next.angle) to.rig = from.rig;
    for (const dir of Object.keys(CREW_KEY)) {
      const k = CREW_KEY[dir];
      if (prev[k] !== next[k] || (dir === "home" && prev.result !== next.result)) continue;
      if (from && ("crew:" + dir) in from) to["crew:" + dir] = from["crew:" + dir];
      if (deal && deal[k]) dealTo[k] = deal[k];
    }
    if (Object.keys(to).length) _pinned.set(next, Object.assign(_pinned.get(next) || {}, to));
    if (Object.keys(dealTo).length) _picked.set(next, Object.assign(_picked.get(next) || {}, dealTo));
    return next;
  }
  function crewNow(config, dir) {
    const key = dir === "out" ? "leaveCrew" : dir === "home" ? "homeCrew" : "enterCrew";
    let v = config && config[key];
    if (dir === "home" && (!v || v === "auto")) {
      const r = RESULTS[config && config.result] || RESULTS.finish;
      v = typeof GarageCrewChoreo !== "undefined" && GarageCrewChoreo.has(r.crew) ? r.crew : r.crewAlt;
    }
    if (v !== "mix") return playable(v || "current");
    if (typeof GarageCrewChoreo === "undefined") return "current";
    let memo = _picked.get(config);
    if (!memo) { memo = {}; _picked.set(config, memo); }
    if (!memo[key]) memo[key] = GarageCrewChoreo.pick(dir === "out" ? "out" : "in", nextVisit());
    return playable(memo[key]);
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
      hold: typeof v.hold === "number" && Number.isFinite(v.hold) ? Math.max(0, Math.min(3, v.hold)) : null,
      carSpeed: number("carSpeed", 0.5, 2), endBeat: number("endBeat", 0, 3),
      raceStart: v.raceStart !== false, pitIn: v.pitIn !== false, pitOut: v.pitOut !== false, afterRace: v.afterRace !== false,
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
      homeCue: v.homeCue === "auto" || v.homeCue === "none" || cueIds().includes(v.homeCue) ? v.homeCue : DEFAULT.homeCue,
      race: RACES.includes(v.race) ? v.race : DEFAULT.race };
  }
  const MOMENT = Object.freeze({ in: "pitIn", out: "pitOut", home: "afterRace" });
  const plays = (config, moment) => !!config && config.enabled !== false && config[moment] !== false;
  function angleMap(angle, shots) {
    const X = (x) => (60 + x * 100 / 10.8).toFixed(1), Z = (z) => (50 + z * 84 / 12.8).toFixed(1);
    const used = shotsFor({ angle, shots: Array.isArray(shots) ? shots : DEFAULT.shots }, "in");
    const cuts = new Set(used).size > 1;
    const eye = (id) => {
      const e = CAMS[id], lit = used.includes(id), x = X(e[0]), z = Z(e[2]);
      const n = used.indexOf(id) + 1;
      return `<path d="M${x} ${z}L${X(-2.7)} ${Z(6.4)}L${X(2.7)} ${Z(6.4)}Z" fill="currentColor" opacity="${lit ? 0.22 : 0.04}"/>`
        + `<circle cx="${x}" cy="${z}" r="5" fill="${lit ? "#e10600" : "none"}" stroke="currentColor" stroke-width="${lit ? 1.5 : 0.8}"/>`
        + (cuts && lit ? `<text x="${x}" y="${(+z + 3.5).toFixed(1)}" font-size="8" text-anchor="middle" fill="#fff">${n}</text>` : "");
    };
    const room = `<rect x="10" y="8" width="100" height="84" fill="none" stroke="currentColor" stroke-width="2"/>`
      + `<line x1="${X(-2.7)}" y1="${Z(6.4)}" x2="${X(2.7)}" y2="${Z(6.4)}" stroke="#2a2a2e" stroke-width="4"/>`
      + `<rect x="4" y="96" width="112" height="16" fill="currentColor" opacity="0.12"/>`
      + `<rect x="${X(-0.9)}" y="${Z(-2.8)}" width="${(1.8 * 100 / 10.8).toFixed(1)}" height="${(5.6 * 84 / 12.8).toFixed(1)}" rx="3" fill="currentColor" opacity="0.5"/>`;
    if (rigData(angle)) {
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
  function bindSettings($, store, opts = {}) {
    const preview = typeof opts.preview === "function" ? opts.preview : null;
    const changed = typeof opts.changed === "function" ? opts.changed : null;
    const read = () => settings(store.get("garageArrival", null));
    const rowsReady = () => { const a = $("ga-angle"); return !!(a && a.children && Array.from(a.children).some((o) => o.value === "custom")); };
    const buildRows = () => { if (!rowsReady() && typeof GarageArrivalRows !== "undefined") GarageArrivalRows.build($, { CAM_IDS, STYLES, RIG_IDS, RIG_LABEL, moodIds, cueIds }); };
    buildRows();
    let fields, shotEls;
    const NUM = ["speed", "fov", "height", "door", "carSpeed", "endBeat", "sway", "zoom", "swell", "slowmo"], CHECK = ["enabled", "raceStart", "pitIn", "pitOut", "afterRace", "captions", "bars", "sound"];
    const bindFields = () => {
      fields = { enabled: $("ga-enabled"), speed: $("ga-speed"), angle: $("ga-angle"), fov: $("ga-fov"),
        enterCrew: $("ga-crew-in"), leaveCrew: $("ga-crew-out"), height: $("ga-height"), door: $("ga-door"), hold: $("ga-hold"),
        carSpeed: $("ga-carspeed"), endBeat: $("ga-endbeat"), raceStart: $("ga-start"), pitIn: $("ga-pit-in"), pitOut: $("ga-pit-out"), afterRace: $("ga-after"), homeCrew: $("ga-crew-home"), result: $("ga-result"),
        move: $("ga-move"), sway: $("ga-sway"), zoom: $("ga-zoom"), light: $("ga-light"), swell: $("ga-swell"),
        captions: $("ga-captions"), bars: $("ga-bars"), homeLight: $("ga-light-home"), rearLight: $("ga-rear"), slowmo: $("ga-slowmo"), sound: $("ga-sound"), cue: $("ga-cue"), homeCue: $("ga-cue-home"),
        race: $("ga-race") };
      shotEls = [$("ga-shot1"), $("ga-shot2"), $("ga-shot3")];
      for (const id of Object.keys(STYLES)) { const b = $("ga-style-" + id); if (b) b.onclick = () => save(applyStyle(read(), id)); }
      const option = (value, text) => { const o = document.createElement("option"); o.value = value; o.textContent = text; return o; };
      for (const [key, dir] of [["enterCrew", "in"], ["leaveCrew", "out"], ["homeCrew", "in"]]) {
        const el = fields[key], ids = typeof GarageCrewChoreo !== "undefined" ? GarageCrewChoreo.IDS[dir].filter((id) => key === "homeCrew" || !resultClip(id)) : [];
        if (!el || !el.add || !el.options || typeof document === "undefined" || Array.from(el.options).some((o) => o.value === "mix")) continue;
        el.add(option("mix", "MIX: NEW CREW EACH VISIT"), 0);
        const none = Array.from(el.options).find((o) => o.value === "none") || null;
        for (const id of ids) el.add(option(id, GarageCrewChoreo.label(id)), none);
      }
      for (const key of Object.keys(fields)) if (fields[key]) fields[key].onchange = () => {
        const el = fields[key], value = read();
        value[key] = CHECK.includes(key) ? el.checked : NUM.includes(key) ? Number(el.value)
          : key === "hold" ? (el.value === "auto" ? null : Number(el.value)) : el.value;
        save(value);
      };
      shotEls.forEach((el, i) => { if (el) el.onchange = () => { const value = read(); value.shots[i] = el.value; save(value); }; });
      for (const [b, dir] of [[$("ga-preview-in"), "in"], [$("ga-preview-out"), "out"], [$("ga-preview-home"), "home"]]) {
        if (b) b.onclick = () => { if (preview) preview(dir, b); };
      }
    };
    bindFields();
    function refresh() {
      const value = read();
      for (const key of Object.keys(fields)) {
        const el = fields[key];
        if (!el) continue;
        if (CHECK.includes(key)) el.checked = value[key];
        else el.value = key === "hold" && value.hold === null ? "auto" : String(value[key]);
      }
      shotEls.forEach((el, i) => { if (el) el.value = value.shots[i]; });
      const style = styleOf(value);
      for (const id of Object.keys(STYLES)) { const b = $("ga-style-" + id); if (b && b.setAttribute) b.setAttribute("aria-pressed", String(id === style)); }
      const row = $("ga-shots-row");
      if (row) row.hidden = value.angle !== "custom";
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
    const save = (value) => { store.set("garageArrival", settings(value)); refresh(); if (changed) changed(); };
    $("ga-reset").onclick = () => { store.set("garageArrival", null); refresh(); if (changed) changed(); };
    const page = (on) => {
      const ps = $("pmsettings"), dp = $("pm-panel-visual");
      if (ps) ps.hidden = !on;
      if (dp) dp.hidden = !on;
    };
    const panel = $("garrival"), openBtn = $("pm-garrival"), done = $("ga-close");
    const open = () => {
      if (!rowsReady()) { buildRows(); if (rowsReady()) bindFields(); }
      refresh(); page(false); panel.hidden = false;
      if (typeof document !== "undefined" && document.body) document.body.classList.add("lt-open");
      if (done && done.focus) done.focus();
    };
    const live = typeof LazyBundles !== "undefined" && LazyBundles.live ? LazyBundles.live() : null;
    if (panel && openBtn) openBtn.onclick = () => {
      if (rowsReady() || typeof GarageArrivalRows !== "undefined" || !live || !live.ensureGarageData) { open(); return; }
      live.ensureGarageData().then(open, open);
    };
    if (panel && done) done.onclick = () => {
      if (preview && preview(null)) return;
      panel.hidden = true; page(true);
      if (typeof document !== "undefined" && document.body) document.body.classList.remove("lt-open");
      if (openBtn && openBtn.focus) { if (typeof setTimeout === "function") setTimeout(() => openBtn.focus(), 0); else openBtn.focus(); }
    };
    refresh();
    return read;
  }
  const OUT_STRAIGHT = 8, OUT_R = 5, OUT_TURN = Math.PI / 2, OUT_PATH = OUT_STRAIGHT + OUT_R * OUT_TURN;
  function pathAt(s, side, o = {}) {
    const th = Math.min(OUT_TURN, Math.max(0, s - OUT_STRAIGHT) / OUT_R), past = Math.max(0, s - OUT_PATH);
    const z = (s < OUT_STRAIGHT ? Math.max(0, s) : OUT_STRAIGHT + OUT_R * Math.sin(th)) + past * Math.cos(th);
    o.x = side * (OUT_R * (1 - Math.cos(th)) + past * Math.sin(th)); o.z = z; o.yaw = side * th;
    return o;
  }
  const EYE_L = CAMS.left, EYE_R = CAMS.right;
  const RIGS = {"crane":{"label":"CRANE","n":49},"orbit":{"label":"ORBIT","n":49},"dolly":{"label":"DOLLY","n":49},"rear":{"label":"REAR TRACK","n":49},"drone":{"label":"DRONE","n":49},"steadicam":{"label":"STEADICAM","n":49}};
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const _rigs = {};
  function rigData(id) {
    if (typeof id !== "string" || !Object.prototype.hasOwnProperty.call(RIGS, id)) return null;
    if (_rigs[id]) return _rigs[id];
    const src = typeof GarageData !== "undefined" && GarageData.RIGS ? GarageData.RIGS[id] : null;
    if (!src) return null;
    const rig = { label: src.label, n: src.n };
    for (const d of ["in", "out", "home"]) {
      const s = src[d];
      if (typeof s !== "string") continue;
      const a = rig[d] = new Array(s.length / 2);
      for (let i = 0; i < a.length; i++) a[i] = B64.indexOf(s[2 * i]) * 64 + B64.indexOf(s[2 * i + 1]) - 2048;
    }
    return (_rigs[id] = rig);
  }
  const RIG_IDS = Object.freeze(Object.keys(RIGS));
  const RIG_LABEL = Object.freeze(Object.fromEntries(RIG_IDS.map((id) => [id, RIGS[id].label])));
  const ALL_ANGLES = Object.freeze(ANGLES.concat(RIG_IDS));
  const RIG_V = new Float64Array(7);
  function rigSample(id, dir, u, side = 1, o = null) {
    const rig = rigData(id);
    if (!rig) return null;
    const s = rig[dir] || rig.in, n = rig.n, f = Math.max(0, Math.min(1, Number.isFinite(u) ? u : 0)) * (n - 1);
    const i = Math.min(n - 2, Math.floor(f)), k = f - i, m = side < 0 ? -1 : 1, v = RIG_V;
    const j0 = Math.max(0, i - 1) * 7, j1 = i * 7, j2 = (i + 1) * 7, j3 = Math.min(n - 1, i + 2) * 7;
    for (let c = 0; c < 7; c++) {
      const p0 = s[j0 + c], p1 = s[j1 + c], p2 = s[j2 + c], p3 = s[j3 + c];
      v[c] = p1 + 0.5 * k * (p2 - p0 + k * (2 * p0 - 5 * p1 + 4 * p2 - p3 + k * (3 * (p1 - p2) + p3 - p0)));
    }
    if (!o) o = { eye: [0, 0, 0], aim: [0, 0, 0], fov: 0 };
    const e = o.eye, a = o.aim;
    e[0] = m * Math.max(-5.2, Math.min(5.2, v[0] / 100)); e[1] = Math.max(0.3, Math.min(3.6, v[1] / 100)); e[2] = Math.max(-6.2, Math.min(6.05, v[2] / 100));
    a[0] = m * v[3] / 100; a[1] = v[4] / 100; a[2] = v[5] / 100; o.fov = v[6] / 10;
    return o;
  }
  const _pairs = new WeakMap();
  function posePair(pose) { let p = _pairs.get(pose); if (!p) { p = { eye: [0, 0, 0], aim: [0, 0, 0] }; _pairs.set(pose, p); } return p; }
  function shot(out, eye, aim, t, calm, lift = 0, look = null, pair = null) {
    const e = out.eye = pair ? pair.eye : [0, 0, 0];
    e[0] = eye[0]; e[1] = eye[1]; e[2] = eye[2];
    out.aim = pair ? pair.aim : [0, 0, 0];
    out.aim[0] = aim[0]; out.aim[1] = aim[1]; out.aim[2] = aim[2]; aim = out.aim;
    if (lift) out.eye[1] = Math.max(0.3, Math.min(3.6, out.eye[1] + lift));
    const c = look && look.config, k = look ? Math.max(0, Math.min(1, look.k)) : 0;
    const move = c && c.move !== "still" && !calm ? c.move : null;
    if (move) {
      const dx = aim[0] - out.eye[0], dy = aim[1] - out.eye[1], dz = aim[2] - out.eye[2], n = hypot(dx, dy, dz) || 1;
      if (move === "drift") {
        const h = hypot(dx, dz) || 1, s = MOVE_M * (ease(k) - 0.5);
        out.eye[0] += -dz / h * s; out.eye[2] += dx / h * s;
      } else {
        const s = MOVE_M * (move === "push" ? ease(k) : 1 - ease(k));
        out.eye[0] += dx / n * s; out.eye[1] += dy / n * s; out.eye[2] += dz / n * s;
      }
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
  const set3 = (o, x, y, z) => { o[0] = x; o[1] = y; o[2] = z; return o; };
  function aimAt(cam, p, opening, o = [0, 0, 0]) {
    if (cam === "door") return opening ? set3(o, 0.6, 1.0, -1.5) : set3(o, Math.max(-8, Math.min(8, p.x)), 0.55, Math.max(-2, p.z));
    if (opening) return set3(o, 0, cam === "high" ? 1.4 : 1.0, 6.2);
    return set3(o, Math.max(-4, Math.min(4, p.x * 0.85)), cam === "high" ? 0.3 : 0.7, Math.max(-2, Math.min(10, p.z * 0.85)));
  }
  const sideFor = (cam) => CAMS[cam][0] < 0 ? 1 : -1;
  const IN_LANE = 2.6, IN_LANE_M = 22, IN_PAUSE = 0.4, IN_BACK = 3.6;
  const DURATION = DOOR_S + IN_LANE + IN_PAUSE + IN_BACK + 0.3;
  const holdOf = (c, dflt) => typeof c.hold === "number" ? c.hold : dflt;
  function timelineInto(o, config, dir) {
    const c = config || DEFAULT, door = Number.isFinite(c.door) ? c.door : DOOR_S;
    const car = Number.isFinite(c.carSpeed) && c.carSpeed > 0 ? c.carSpeed : 1, tail = Number.isFinite(c.endBeat) ? c.endBeat : 0;
    o.dir = dir; o.door = door;
    if (dir === "out") {
      const run = OUT_RUN / car, accel = OUT_ACCEL / car, v = OUT_PATH / (run - accel / 2);
      const settle = door + holdOf(c, OUT_HOLD) + run + OUT_EXIT_M / v;
      o.hold = holdOf(c, OUT_HOLD); o.run = run; o.accel = accel; o.v = v; o.settle = settle; o.base = settle + 0.3 + tail;
      return o;
    }
    const r = dir === "home" ? RESULTS[c.result] || RESULTS.finish : null;
    const lane = IN_LANE * (r ? r.lane : 1) / car, pause = holdOf(c, IN_PAUSE) + (r ? r.pause : 0), back = IN_BACK * (r ? r.back : 1) / car;
    const park = door + lane + pause + back;
    o.lane = lane; o.pause = pause; o.back = back; o.park = park; o.base = park + 0.3 + tail + (r ? r.end : 0); o.result = r;
    return o;
  }
  function timeline(config = DEFAULT, dir = "in") { return timelineInto({}, config, dir); }
  const T_POSE = { in: {}, out: {} }, T_CLOCK = { in: {}, out: {} };
  const scratchT = (pair, config, dir) => timelineInto(dir === "out" ? pair.out : pair.in, config, dir);
  function crewExtra(config, dir) {
    const crew = crewFor(config, dir), service = crew === "service";
    return service ? (dir === "out" ? 3 : 6) : typeof GarageCrewChoreo !== "undefined" ? GarageCrewChoreo.extra(crew) : 0;
  }
  function duration(config = DEFAULT, dir = "in") {
    const extra = crewExtra(config, dir);
    return scratchT(T_CLOCK, config, dir).base + extra;
  }
  const entranceSources = new WeakMap();
  const CONSUMER_KEYS = Object.freeze(["distance", "exteriorUnsupported", "groundY", "groundForward", "groundRight"]);
  const AUTHORED_KEYS = Object.freeze(["articulated", "wheelDistance", "steer", "bodyPitch", "bodyHeave"]);
  function clearKeys(o, keys) { for (let i = 0; i < keys.length; i++) if (o[keys[i]] !== undefined) o[keys[i]] = undefined; }
  const P_IN = {}, P_ENTRANCE = {}, AIM = [0, 0, 0], EYE = [0, 0, 0], LOOK = { config: null, last: false, k: 0 };
  const SPRINT_ARRIVE = {};
  const sprintArrive = (r) => SPRINT_ARRIVE[r.arrive] || (SPRINT_ARRIVE[r.arrive] = r.arrive.replace(/^RACE /, "SPRINT "));
  function lookOf(o, config, dir) {
    o.mood = lightFor(config, dir); o.cue = cueFor(config, dir); o.swell = lookNum(config, "swell", 1); o.bars = !!config.bars;
    o.captions = config.captions !== false; o.rearLight = config.rearLight || "auto"; o.sound = config.sound !== false;
  }
  function carOf(o, config, dir, rs, t, T, p) {
    o.crew = crewFor(config, dir); o.fov = rs ? rs.fov : config.fov; o.door = ease(t / T.door); o.x = p.x; o.z = p.z; o.yaw = p.yaw;
  }
  const TITLE_IN = ["result", "pos", "driver", "sprint", "grid", "fastest"], TITLE = { r: null, text: "" };
  function titleNow(config, r) {
    let same = TITLE.r === r;
    for (let i = 0; same && i < 6; i++) same = TITLE[TITLE_IN[i]] === config[TITLE_IN[i]];
    if (same) return TITLE.text;
    TITLE.r = r;
    for (let i = 0; i < 6; i++) TITLE[TITLE_IN[i]] = config[TITLE_IN[i]];
    return (TITLE.text = homeTitle(config, r));
  }
  function poseIn(seconds, config, calm, dir, o) {
    const pair = o ? posePair(o) : null;
    if (o) clearKeys(o, CONSUMER_KEYS); else o = {};
    const t = Math.max(0, Number.isFinite(seconds) ? seconds : 0), T = scratchT(T_POSE, config, dir), end = T.base + crewExtra(config, dir), r = T.result;
    const rig = rigFor(config);
    const cams = shotsFor(config, "in"), side = rig ? 1 : sideFor(cams[2]), s2 = T.door + T.lane + T.pause;
    const n = t < T.door ? 0 : t < s2 ? 1 : 2, cam = cams[n];
    const look = LOOK;
    look.config = config; look.last = n === 2; look.k = n === 0 ? t / T.door : n === 1 ? (t - T.door) / (s2 - T.door) : (t - s2) / Math.max(1e-6, end - s2);
    const u = Math.max(0, Math.min(1, (t - T.door) / T.lane));
    const lane = IN_LANE_M * (r && r.pushed ? ease(u) : 1 - (1 - u) * (1 - u));
    const back = ease((t - T.door - T.lane - T.pause) / T.back);
    if (dir === "in" && !entranceSources.has(config)) entranceSources.set(config,
      config._entranceAuthored !== false && typeof GarageEntranceMotion !== "undefined" && GarageEntranceMotion.available());
    const authored = dir === "in" && entranceSources.get(config)
      ? GarageEntranceMotion.pose(t, T, side, P_ENTRANCE) : null;
    let p = authored;
    if (!p && back > 0) p = pathAt(OUT_PATH * (1 - back), side, P_IN);
    else if (!p) { p = P_IN; p.x = side * (OUT_R + lane - IN_LANE_M); p.z = OUT_STRAIGHT + OUT_R; p.yaw = side * OUT_TURN; }
    const label = t < T.door ? "OPENING GARAGE"
      : r ? (t < T.door + T.lane + T.pause ? (config.sprint ? sprintArrive(r) : r.arrive) : t < T.park ? r.park
        : dir === "home" ? titleNow(config, r) : r.title)
      : t < T.park ? "BRINGING CAR IN" : end > T.base && t < end - .5 ? "CREW SERVICING CAR" : "READY FOR WORK";
    const aim = cam === "left" || cam === "right"
      ? set3(AIM, Math.max(-3.5, Math.min(3.5, p.x * 0.7)), 0.8, t < T.door ? 6.2 : Math.min(9, p.z * 0.48 + 0.8)) : aimAt(cam, p, t < T.door, AIM);
    const rs = rig ? rigOn(rig, dir, t, end, T.door, p, config, side) : null;
    o.active = t < end; o.serviceTime = t - T.park; o.seconds = t; o.direction = "in"; o.sequence = dir; o.result = r ? config.result : null;
    o.engine = !(r && r.pushed); o.side = side; o.calm = calm; o.camera = rig || cam; o.shot = n + 1; lookOf(o, config, dir);
    o.crewClear = 1 - ease((t - (T.park - .3)) / .3); carOf(o, config, dir, rs, t, T, p); o.label = label;
    if (authored) {
      o.articulated = true; o.wheelDistance = authored.wheelDistance; o.steer = authored.steer;
      o.bodyPitch = authored.pitch; o.bodyHeave = authored.heave;
    } else clearKeys(o, AUTHORED_KEYS);
    shot(o, rs ? rs.eye : CAMS[cam], rs ? rs.aim : aim, t, calm, config.height || 0, look, pair);
    look.config = null;
    return o;
  }
  const RIG_S = { eye: [0, 0, 0], aim: [0, 0, 0], fov: 0 };
  function rigOn(id, dir, t, end, door, p, config, side) {
    const s = rigSample(id, dir, rigU(config, dir, t, end), side, RIG_S);
    if (!s) return null;
    clearOfCrew(s.eye, crewFor(config, dir), t, side);
    const w = ease((t - door) / 0.8), a = s.aim;
    a[0] += (Math.max(-8, Math.min(8, p.x)) - a[0]) * w; a[1] += (0.6 - a[1]) * w; a[2] += (Math.max(-3, Math.min(14, p.z)) - a[2]) * w;
    s.fov = Math.max(30, Math.min(80, s.fov + (Number.isFinite(config.fov) ? config.fov - 54 : 0)));
    return s;
  }
  const KEYED = {};
  function beatKnots(T, end, o = new Array(6)) {
    o[0] = 0; o[1] = T.door; o[2] = T.door + T.lane; o[3] = T.door + T.lane + T.pause; o[4] = T.park; o[5] = end;
    return o;
  }
  const KNOTS = new Array(6);
  function keyedKnots(dir) {
    const c = settings({ angle: "left", enterCrew: "current", homeCrew: "current", result: "win" });
    return beatKnots(timeline(c, dir), duration(c, dir));
  }
  function rigU(config, dir, t, end = duration(config, dir)) {
    if (dir === "out") return end > 0 ? t / end : 0;
    const A = KEYED[dir] || (KEYED[dir] = keyedKnots(dir));
    const K = beatKnots(scratchT(T_CLOCK, config, dir), end, KNOTS);
    let i = 1;
    while (i < K.length - 1 && t > K[i]) i++;
    const span = K[i] - K[i - 1], k = span > 1e-6 ? Math.max(0, Math.min(1, (t - K[i - 1]) / span)) : 1;
    return (A[i - 1] + (A[i] - A[i - 1]) * k) / A[A.length - 1];
  }
  const CREW_R = 1.2, CREW_RAMP = 2.4;
  let _crewOut = null;
  function clearOfCrew(eye, crew, t, side) {
    if (typeof GarageCrewChoreo === "undefined" || !GarageCrewChoreo.has(crew)) return eye;
    if (!_crewOut) _crewOut = GarageCrewChoreo.actors(12);
    const n = GarageCrewChoreo.sample(crew, t, side, _crewOut, t, true);
    const y0 = eye[1];
    for (let i = 0; i < n; i++) {
      const d = hypot(eye[0] - _crewOut[i].x, eye[2] - _crewOut[i].z);
      if (d >= CREW_RAMP) continue;
      const target = Math.min(3.6, 1.8 + (d < CREW_R ? 1.3 * ease(1 - d / CREW_R) : 0));
      const w = ease((CREW_RAMP - d) / (CREW_RAMP - CREW_R));
      if (target > y0) eye[1] = Math.max(eye[1], y0 + (target - y0) * w);
    }
    return eye;
  }
  const lookNum = (c, key, dflt) => c && Number.isFinite(c[key]) ? c[key] : dflt;
  const pose = (seconds, config = DEFAULT, calm = false, o = null) => poseIn(seconds, config, calm, "in", o);
  const poseHome = (seconds, config = DEFAULT, calm = false, o = null) => poseIn(seconds, config, calm, "home", o);
  const OUT_HOLD = 1.1, OUT_RUN = 5.0, OUT_ACCEL = 1.2, OUT_EXIT_M = 8.5;
  const OUT_V = OUT_PATH / (OUT_RUN - OUT_ACCEL / 2), OUT_EXIT = OUT_EXIT_M / OUT_V;
  const OUT_SETTLE = DOOR_S + OUT_HOLD + OUT_RUN + OUT_EXIT;
  const OUT_DURATION = OUT_SETTLE + 0.3;
  const HOLD_PUSH = 2.2, HOLD_TAU = 4;
  function outDistance(tm, accel, v, settle) {
    if (tm <= 0) return 0;
    if (tm < accel) return v * tm * tm / (2 * accel);
    return v * (Math.min(tm, settle) - accel / 2);
  }
  const P_OUT = {};
  function poseOut(seconds, config = DEFAULT, calm = false, o = null) {
    const pair = o ? posePair(o) : null;
    if (o) clearKeys(o, CONSUMER_KEYS); else o = {};
    const t = Math.max(0, Number.isFinite(seconds) ? seconds : 0), T = scratchT(T_POSE, config, "out"), end = T.base + crewExtra(config, "out");
    const delay = end - T.base, settle = T.settle + delay, go = T.door + T.hold + delay;
    const rig = rigFor(config);
    const cams = shotsFor(config, "out"), side = rig ? 1 : sideFor(cams[1]);
    const opening = t < T.door;
    const d = outDistance(Math.min(t, settle) - go, T.accel, T.v, T.run + OUT_EXIT_M / T.v);
    const p = pathAt(d, side, P_OUT);
    const n = t < go ? 0 : d < 6 ? 1 : 2, cam = cams[n], eye = CAMS[cam];
    const atDoor = go + (6 <= T.v * T.accel / 2 ? Math.sqrt(2 * T.accel * 6 / T.v) : 6 / T.v + T.accel / 2);
    const look = LOOK;
    look.config = config; look.last = n === 2; look.k = n === 0 ? t / go : n === 1 ? (t - go) / (atDoor - go) : (t - atDoor) / Math.max(1e-6, end - atDoor);
    const legacy = cam === "left" || cam === "right", cs = legacy ? sideFor(cam) : side;
    const aim = legacy ? set3(AIM, cs * Math.min(cs * p.x * 0.7, 3.5), 0.8, opening ? 6.2 : Math.min(9, 1.2 + p.z * 0.62)) : aimAt(cam, p, opening, AIM);
    const rs = rig ? rigOn(rig, "out", t, end, go, p, config, side) : null;
    let e = rs ? rs.eye : eye;
    if (rs) for (let i = 0; i < 3; i++) aim[i] = rs.aim[i];
    else if (!calm && t > settle) {
      const k = 1 - Math.exp(-(t - settle) / HOLD_TAU);
      e = set3(EYE, eye[0] * (1 - 0.25 * k), eye[1] - 0.25 * k, Math.min(5.9, eye[2] + HOLD_PUSH * k));
      aim[0] -= cs * 2.2 * k;
    }
    o.active = t < end; o.serviceTime = t; o.seconds = t; o.direction = "out"; o.sequence = "out"; o.engine = true; o.side = side; o.calm = calm; o.camera = rig || cam;
    o.shot = n + 1; lookOf(o, config, "out");
    o.crewClear = ease((t - (go - .3)) / .3); carOf(o, config, "out", rs, t, T, p);
    o.label = delay && t < 5.2 ? "CREW CLEARING CAR" : opening ? "OPENING GARAGE" : "LEAVING THE GARAGE";
    shot(o, e, aim, t, calm, config.height || 0, look, pair);
    look.config = null;
    return o;
  }
  const poseFor = (dir) => dir === "out" ? poseOut : dir === "home" ? poseHome : pose;
  const MAX_GAP_S = 2.5;
  function wallNow() { try { return performance.now() / 1000; } catch (_) { return 0; } }
  function create($, reducedMotion, readSettings = () => DEFAULT, clock = wallNow) {
    let state = null, time = 0, config = DEFAULT, last = 0, dir = "in", posed = pose;
    const own = { in: {}, home: {}, out: {} }, into = () => own[dir] || own.in;
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
      time = duration(config, dir); state = posed(time, config, false, into());
      chrome(false);
      $("cs-done").focus({ preventScroll: true });
    }
    function start(opts) {
      const home = opts && opts.home;
      dir = home ? "home" : opts && opts.out ? "out" : "in"; posed = poseFor(dir);
      config = settings(readSettings());
      if (opts && opts.rate > 0) config.speed = Math.min(4, config.speed * opts.rate);
      config._entranceAuthored = (!opts || opts.authored !== false) && typeof GarageEntranceMotion !== "undefined" && GarageEntranceMotion.available();
      if (home) Object.assign(config, { result: RESULTS[home.result] ? home.result : "finish", pos: home.pos,
        driver: typeof home.driver === "string" ? home.driver : "", fastest: !!home.fastest, race: home.wet ? "wet" : home.night ? "night" : "dry",
        grid: Number.isFinite(home.grid) && home.grid > 0 ? home.grid | 0 : null, sprint: !!home.sprint });
      time = 0; last = 0; state = posed(0, config, false, into());
      if (!plays(config, MOMENT[dir]) || reducedMotion()) { finish(); return; }
      label.textContent = state.label;
      skip.textContent = dir === "out" ? "SKIP TO RACE" : "SKIP TO WORK";
      label.hidden = !config.captions;
      chrome(true); skip.focus({ preventScroll: true });
    }
    function step(dt, hold) {
      if (state && state.active && hold) { last = clock(); return state; }
      if (state && state.active) {
        const now = clock(), gap = last ? now - last : 0;
        last = now;
        const capped = Math.min(0.1, Math.max(0, Number.isFinite(dt) ? dt : 0));
        time += Math.max(capped, gap > 0 && gap <= wallSeconds(config, dir) / config.speed ? Math.min(gap, MAX_GAP_S) : 0) * config.speed * rate(config, dir, time);
        state = posed(time, config, false, into());
        if (label.textContent !== state.label) label.textContent = state.label;
        if (!state.active) finish();
      }
      return state;
    }
    function cancel() { state = null; time = 0; chrome(false); }
    skip.onclick = finish;
    return { start, step, cancel, finish, get state() { return state; } };
  }
  const SLOW_S = 1.2;
  const T_WIN = { in: {}, out: {} }, WIN = [0, 0, 0];
  function slowWindow(config, dir, o = null) {
    const f = config && config.slowmo;
    if (!(f > 0 && f < 1)) return null;
    let mid;
    if (dir === "out") {
      const T = scratchT(T_WIN, config, "out"), go = T.door + T.hold + ((T.base + crewExtra(config, "out")) - T.base);
      mid = go + (6 <= T.v * T.accel / 2 ? Math.sqrt(2 * T.accel * 6 / T.v) : 6 / T.v + T.accel / 2) + 0.2;
    } else {
      const T = scratchT(T_WIN, config, dir), target = 1 - 6.4 / OUT_PATH;
      let lo = 0, hi = 1;
      for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (ease(m) < target) lo = m; else hi = m; }
      mid = T.door + T.lane + T.pause + lo * T.back;
    }
    return set3(o || [0, 0, 0], mid - SLOW_S / 2, mid + SLOW_S / 2, f);
  }
  function rate(config, dir, t) {
    const w = slowWindow(config, dir, WIN);
    return w && t >= w[0] && t < w[1] ? w[2] : 1;
  }
  function wallLeft(config, dir, t = 0) {
    const w = slowWindow(config, dir, WIN), d = duration(config, dir), from = Math.max(0, Math.min(d, t));
    if (!w) return d - from;
    const slow = Math.max(0, Math.min(d, w[1]) - Math.max(from, w[0]));
    return d - from + slow * (1 / w[2] - 1);
  }
  const wallSeconds = (config, dir) => wallLeft(config, dir, 0);
  function rearLightOn(p, wet) {
    const m = p && p.rearLight || "auto";
    if (m === "on") return true;
    if (m === "flash") return Math.floor((p.seconds || 0) * 8) % 2 === 0;
    return m === "auto" && !!wet;
  }
  return Object.freeze({ create, pose, poseOut, poseHome, poseFor, duration, timeline, rate, wallSeconds, wallLeft, slowWindow, crewFor, carryPlayback, lightFor, cueFor, rearLightOn, angleMap, shotsFor, resultKind, MOVES, REAR,
    CAMS, CAM_IDS, ANGLES: ALL_ANGLES, RIG_IDS, RIG_LABEL, rigSample, rigU, RESULTS, RACES, STYLES, applyStyle, styleOf, homeTitle, DURATION, OUT_DURATION, OUT_SETTLE, DEFAULT, settings, plays, bindSettings });
})();
