/* Apex 26 — THUMB TRAINER, a LEARN lesson: time both thumbs through every Las Vegas corner on the player's own race
   buttons. The real touch dock is shown in its preview mode (the same path REPOSITION TOUCH CONTROLS uses), so every
   button sits at its race size, shape and saved position, and the levels come from the game's own hold-button and
   PedalTravel code with the saved touch-button profiles (Input.touchLevels). Nothing here drives a car or writes a
   setting: the drill reads the buttons, scores the timing and keeps its own best scores. Targets are the headless
   driver's measured timing (about 0.6 s of brake and arrow together before the apex, gas on just before the slowest
   point). LAZY_LEARN; opened by LearnDoor's lesson door or the `?go=thumbs` deep link (js/ui/deep-link.js). */
const ThumbTrainer = (function () {
  "use strict";

  const ramp = (t, a, b, from, to) => from + (to - from) * Math.max(0, Math.min(1, (t - a) / (b - a)));
  // Each shape is a script at real time (s): brake(t) 0..1, arrow(t) 0/1, gas(t) 0/1, v(t) a speed share for the
  // sketch, apex = the slowest point. steer(t) overrides the arrow sign for the flick (-1 the last turn, +1 this one).
  const SHAPES = Object.freeze({
    big: { dur: 3.0, apex: 1.65, tIn: 0.9, tOut: 2.25, label: "big stop",
      cues: [[0, "Straight: BRAKE 100 %, wheels straight"], [0.9, "Turn-in: arrow ON, slide BRAKE down"], [1.55, "Slide onto GAS"], [2.25, "Exit: let the arrow go"]],
      brake: t => t < 0.9 ? 1 : t < 1.55 ? ramp(t, 0.9, 1.5, 1, 0.2) : 0, arrow: t => t >= 0.9 && t < 2.25 ? 1 : 0, gas: t => t >= 1.6 ? 1 : 0,
      v: t => t < 0.9 ? ramp(t, 0, 0.9, 1, 0.55) : t < 1.65 ? ramp(t, 0.9, 1.65, 0.55, 0.35) : ramp(t, 1.65, 3.0, 0.35, 0.75) },
    short: { dur: 2.2, apex: 0.72, tIn: 0.35, tOut: 1.4, label: "short stop",
      cues: [[0, "Straight: quick stamp on BRAKE"], [0.35, "Turn-in: arrow ON, slide down"], [0.68, "Onto GAS"], [1.4, "Exit: let the arrow go"]],
      brake: t => t < 0.35 ? 1 : t < 0.68 ? ramp(t, 0.35, 0.65, 1, 0.4) : 0, arrow: t => t >= 0.35 && t < 1.4 ? 1 : 0, gas: t => t >= 0.7 ? 1 : 0,
      v: t => t < 0.72 ? ramp(t, 0, 0.72, 1, 0.7) : ramp(t, 0.72, 2.2, 0.7, 0.9) },
    lift: { dur: 2.6, apex: 1.2, tIn: 0.5, tOut: 2.2, label: "lift",
      cues: [[0, "Straight: GAS on"], [0.5, "Turn-in: arrow ON"], [0.6, "Lift: thumb OFF, coast"], [1.2, "GAS back on"], [2.2, "Exit: let the arrow go"]],
      brake: () => 0, arrow: t => t >= 0.5 && t < 2.2 ? 1 : 0, gas: t => (t < 0.6 || t >= 1.2) ? 1 : 0,
      v: t => t < 0.6 ? 1 : t < 1.2 ? ramp(t, 0.6, 1.2, 1, 0.88) : ramp(t, 1.2, 2.6, 0.88, 0.95) },
    carry: { dur: 2.0, apex: 1.0, tIn: 0.2, tOut: 1.6, label: "carry on",
      cues: [[0, "Still turning from the last corner: GAS on"], [0.2, "Keep the arrow held through"], [1.6, "Exit: let the arrow go"]],
      brake: () => 0, arrow: t => t >= 0.2 && t < 1.6 ? 1 : 0, gas: () => 1, v: () => 0.9 },
    flick: { dur: 2.2, apex: 1.2, tIn: 0.75, tOut: 1.7, label: "flick",
      cues: [[0, "Still in the last corner: hold that arrow, GAS on"], [0.55, "Let it go: the wheel unwinds fast"], [0.75, "Press the OTHER arrow"], [1.7, "Exit: let the arrow go"]],
      brake: () => 0, steer: t => t < 0.55 ? -1 : t < 0.75 ? 0 : t < 1.7 ? 1 : 0, arrow: t => t >= 0.75 && t < 1.7 ? 1 : 0, gas: t => t >= 0.25 ? 1 : 0,
      v: t => ramp(t, 0, 2.2, 0.5, 0.8) },
    flat: { dur: 2.4, apex: 1.2, tIn: 0.5, tOut: 1.9, label: "flat",
      cues: [[0, "Straight: GAS on and hold it"], [0.5, "Turn-in: arrow ON early and hold"], [1.9, "Exit: let the arrow go"]],
      brake: () => 0, arrow: t => t >= 0.5 && t < 1.9 ? 1 : 0, gas: () => 1, v: () => 1 },
  });
  // The 17 Vegas turns, in js/circuits/vegas.js `turns` order. dir is the turn's sense on the built centreline
  // (+k = LEFT is -1 here, the left arrow; tests/unit/thumb-trainer.test.mjs checks every sign against the real
  // track). angle is how far the sketch turns, in degrees: a drawing, not survey data.
  const CORNERS = Object.freeze([
    ["T1", 1, "big", -1, 124, "T1 turns LEFT at the end of the start straight. Brake 100 % straight, trail it in."],
    ["T2", 1, "carry", -1, 68, "T2 keeps turning LEFT straight out of T1. No brake: GAS on, hold ◀ through."],
    ["T3", 1, "short", 1, 57, "T3 turns RIGHT: a quick stamp, then GAS."],
    ["T4", 1, "carry", 1, 74, "T4 keeps going RIGHT after T3. GAS on, hold ▶."],
    ["T5", 1, "short", 1, 58, "T5 turns RIGHT again: the second short tap of the T3–5 sequence."],
    ["T6", 1, "big", 1, 86, "T6 turns RIGHT after a long straight. The biggest stop in sector 1."],
    ["T7", 2, "lift", -1, 50, "T7 is a long LEFT sweeper: lift, don't brake."],
    ["T8", 2, "carry", -1, 40, "T8 finishes the LEFT sweep. GAS on, then line up for T9. Watch the exit wall."],
    ["T9", 2, "big", 1, 60, "T9 turns RIGHT straight after T8. Brake 100 % with the wheels straight first."],
    ["T10", 2, "short", -1, 113, "T10 turns LEFT: a short stop, then straight back to GAS."],
    ["T11", 2, "flat", 1, 44, "T11 is a fast RIGHT kink: flat, arrow early."],
    ["T12", 2, "flat", -1, 38, "T12 is a fast LEFT bend on the way to T13: flat, then set up the brake."],
    ["T13", 2, "big", -1, 77, "T13 turns LEFT hard. Brake 100 % straight, trail it in."],
    ["T14", 3, "big", -1, 50, "T14 turns LEFT at the end of the Strip. The biggest stop of the lap."],
    ["T15", 3, "flick", 1, 57, "T15 flicks RIGHT straight out of T14 (left). Let go of ◀, then press ▶."],
    ["T16", 3, "flat", -1, 28, "T16 is a LEFT kink onto the back straight: flat."],
    ["T17", 3, "flat", -1, 36, "T17, the last corner, turns LEFT. The stock AI brakes here; on your car try flat, and lift if the nose pushes."],
  ].map(([name, sec, shape, dir, angle, note]) => Object.freeze({ name, sec, shape, dir, angle, note, angle2: shape === "flick" ? 30 : 0 })));

  /** One corner's full script: the shape's timing with the corner's direction. target(t) is the signed arrow. */
  function script(name) {
    const corner = CORNERS.find(c => c.name === name) || CORNERS[5];
    const shape = SHAPES[corner.shape];
    const rel = shape.steer || (t => shape.arrow(t) ? 1 : 0);
    return Object.assign({}, shape, corner, { target: t => rel(t) * corner.dir });
  }
  // The first time f switches on. skipStart: a script already on at t=0 has no rise (null unless it later re-rises).
  function firstOn(f, dur, skipStart = false) {
    let prev = skipStart && f(0) > 0 ? 1 : 0;
    for (let i = 0; i <= 600; i++) {
      const t = dur * i / 600, v = f(t) > 0 ? 1 : 0;
      if (v && !prev) return t;
      prev = v;
    }
    return null;
  }
  function onsets(rec, key, thr) {
    const out = [];
    let prev = 0;
    for (const r of rec) {
      const v = r[key] > thr ? 1 : 0;
      if (v && !prev) out.push({ on: r.t });
      prev = v;
    }
    return out;
  }
  const ms = d => Math.round(Math.abs(d) * 100) * 10 + " ms";

  /** Pure: score one run. rec = [{t, s (signed arrow -1..1), b (brake 0..1), g (gas 0..1)}]. */
  function score(name, rec) {
    const C = script(name), TOL = 0.1;
    const near = (t, f) => [t - TOL, t, t + TOL].map(u => f(Math.max(0, Math.min(C.dur, u))));
    let a = 0, b = 0, g = 0;
    for (const r of rec) {
      if (near(r.t, C.target).includes(Math.sign(r.s))) a++;
      if (near(r.t, C.gas).includes(r.g > 0.5 ? 1 : 0)) g++;
      if (near(r.t, C.brake).some(v => (v === 0 && r.b === 0) || (v > 0 && Math.abs(v - r.b) <= 0.2))) b++;
    }
    const n = Math.max(1, rec.length), arrow = a / n, brake = b / n, gas = g / n, all = (arrow + brake + gas) / 3;
    const tips = [];
    const wrong = rec.filter(r => r.s !== 0 && C.target(r.t) === -Math.sign(r.s)).length;
    if (wrong > 3) tips.push(C.shape === "flick" ? "Wrong arrow for part of it. Hold ◀ for the end of T14, let go, then ▶ for T15."
      : `You pressed the ${C.dir < 0 ? "RIGHT" : "LEFT"} arrow. ${C.name} turns ${C.dir < 0 ? "LEFT" : "RIGHT"}.`);
    const aOn = firstOn(C.arrow, C.dur);
    const mine = onsets(rec.map(r => ({ t: r.t, a: Math.sign(r.s) === C.dir ? 1 : 0 })), "a", 0.5);
    if (aOn != null) {
      if (!mine.length) tips.push("You never pressed the arrow.");
      else {
        const d = mine[0].on - aOn;
        tips.push(Math.abs(d) < 0.1 ? "Arrow on time." : `Arrow ${d > 0 ? "late" : "early"} by ${ms(d)}. ` +
          (d > 0 ? "Start it while you're still braking." : "Wait for the end of the straight-line brake."));
      }
    }
    if (rec.some(r => r.b > 0 && r.g > 0)) tips.push("BRAKE and GAS were on together. The game would only brake.");
    if (C.brake(0) > 0 && rec.length) {
      const overlap = rec.filter(r => r.b > 0.05 && r.s * C.dir > 0).length / rec.length * C.dur;
      let want = 0;
      for (let i = 0; i < 600; i++) { const t = C.dur * i / 600; if (C.brake(t) > 0 && C.arrow(t)) want += C.dur / 600; }
      tips.push(`Brake and arrow together for ${overlap.toFixed(2)} s, target ${want.toFixed(2)} s. ` +
        (overlap < want - 0.15 ? "Keep a little brake on as the arrow winds on." : overlap > want + 0.2 ? "Let the brake off sooner; be at GAS by the apex." : "Good trail."));
      const lastB = [...rec].reverse().find(r => r.b > 0.01), firstB = rec.find(r => r.b > 0.01);
      const firstG = lastB && rec.find(r => r.g > 0 && r.t > (firstB ? firstB.t : 0));
      if (lastB && firstG && firstG.t - lastB.t > 0.15) tips.push(`A ${(firstG.t - lastB.t).toFixed(2)} s gap between brake off and gas on. Slide straight through onto GAS.`);
    }
    const gOn = firstOn(C.gas, C.dur, true);
    const myGas = onsets(rec, "g", 0.5).find(o => o.on > 0.05);
    if (gOn && myGas && Math.abs(myGas.on - gOn) >= 0.12) tips.push(`GAS ${myGas.on > gOn ? "late" : "early"} by ${ms(myGas.on - gOn)}.`);
    if (C.shape === "lift" && rec.some(r => r.t > 0.7 && r.t < 1.1 && r.g > 0)) tips.push("In the lift zone your thumb stayed on GAS. Take it right off; part gas doesn't slow the car.");
    if (all >= 0.9) tips.push("Clean. Try the next speed up.");
    return { all, arrow, brake, gas, tips };
  }

  // PEDAL EXPLORER presets: profile shapes the touch-button editor can save (PedalTravel.overrides). The curves are
  // drawn with PedalTravel.level / sliderLevel, the code the race buttons run; "yours" is the saved profile.
  const PRESETS = Object.freeze({
    rec: { label: "Relative", short: "Relative", brake: { press: "instant", direction: "down", start: 100, end: 20, travel: 75, slideCurve: "quick" },
      note: "BRAKE: touch = 100 %, slide DOWN 75 px to 20 %, QUICK curve. GAS: your saved gas." },
    catch: { label: "Relative + gas catch", short: "+ Gas catch", brake: { press: "instant", direction: "down", start: 100, end: 20, travel: 75, slideCurve: "quick" },
      gas: { press: "instant", direction: "left", start: 100, end: 70, travel: 40 },
      note: "BRAKE as Relative. GAS: touch = 100 %, slide LEFT 40 px to 70 %. Only to catch the rear on an exit." },
    edge: { label: "Edge to edge", short: "Edge", brake: { press: "instant", sliderEdge: "top", sliderStart: 20, sliderEnd: 100, sliderCurve: "fine" },
      gas: { press: "instant", sliderEdge: "bottom", sliderStart: 90, sliderEnd: 100 },
      note: "BRAKE is where your thumb is: top 100 %, bottom 20 %, FINE curve. GAS: bottom 100 %, top 90 %. Land at the top for a full stop." },
  });
  const BRAKE_MAX = 35.1, COAST = 6.0;   // MEASURED on the player's car: full brake and a coast, m/s²
  /** Pure: a profile's level over its axis, 0..1 for `u` in 0..1 (slide: u of `span` px; slider: thumb height). */
  function curve(PT, profile, u, span) {
    if (profile.sliderEdge) {
      const horizontal = profile.sliderEdge === "left" || profile.sliderEdge === "right";
      const toward = profile.sliderEdge === "top" || profile.sliderEdge === "left";
      const p = { ...profile, sliderBounds: { left: 0, top: 0, width: 100, height: 100 } };
      const at = (toward ? 1 - u : u) * 100;
      return PT.sliderLevel(p, horizontal ? { clientX: at, clientY: 50 } : { clientX: 50, clientY: at });
    }
    return PT.level({ travel: PT.TRAVEL_PX, ...profile }, u * span);
  }

  let root = null, session = null;
  const nodes = {};   // the trainer's own elements by id, kept as build() makes them
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const bestKey = "apex26.thumbTrainer.best";
  function readBest() { try { return JSON.parse(localStorage.getItem(bestKey) || "{}") || {}; } catch (_) { return {}; } }
  function writeBest(v) { try { localStorage.setItem(bestKey, JSON.stringify(v)); } catch (_) { /* private mode: this session only */ } }

  function el(tag, attrs, text) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
    if (attrs?.id) nodes[attrs.id] = node;
    if (text != null) node.textContent = text;
    return node;
  }
  function button(id, text, label) {
    const b = el("button", { id, type: "button" }, text);
    if (label) b.setAttribute("aria-label", label);
    return b;
  }

  function build() {
    root = el("div", { id: "thumb-trainer", role: "region", "aria-label": "Thumb trainer", "data-esc-close": "tt-back" });
    root.hidden = true;
    const panel = el("div", { id: "tt-panel" });
    const bar = el("div", { id: "tt-bar", role: "toolbar", "aria-label": "Drill" });
    const pick = el("select", { id: "tt-turn", "aria-label": "Vegas corner" });
    for (const c of CORNERS) pick.appendChild(el("option", { value: c.name }, `S${c.sec} ${c.name} ${c.dir < 0 ? "◀" : "▶"} ${SHAPES[c.shape].label}`));
    bar.append(button("tt-back", "BACK"), button("tt-prev", "◀", "Previous corner"), pick, button("tt-next", "▶", "Next corner"),
      button("tt-speed", "½×"), button("tt-go", "START"), button("tt-view", "PEDALS", "Pedal explorer"));
    const cue = el("p", { id: "tt-cue", "aria-live": "polite" });
    const drill = el("div", { id: "tt-drill" });
    drill.append(el("canvas", { id: "tt-sketch", "aria-label": "Top-down sketch of the corner: brake point, turn-in, apex, gas on and arrow off" }),
      el("canvas", { id: "tt-time", "aria-label": "Timeline: target brake, arrow and gas bands with your inputs drawn over them" }),
      el("p", { id: "tt-score" }));
    const explore = el("div", { id: "tt-explore" });
    explore.hidden = true;
    const chips = el("div", { id: "tt-presets", role: "group", "aria-label": "Brake presets" });
    for (const [k, p] of [["yours", { label: "Yours now", short: "Yours" }], ...Object.entries(PRESETS)]) {
      const b = button("tt-p-" + k, p.short, p.label);
      b.dataset.preset = k;
      chips.appendChild(b);
    }
    explore.append(chips, el("div", { id: "tt-chart", role: "img" }), el("p", { id: "tt-note" }));
    panel.append(bar, cue, drill, explore);
    root.appendChild(panel);
    document.body.appendChild(root);
    if (typeof TopModal !== "undefined" && TopModal.wireLayer) TopModal.wireLayer(root);
  }

  /** Open the drill over the player's real touch dock. preview(on) shows/hides the race buttons (game.js). */
  function open(G, { preview, onClose, corner } = {}) {
    if (session) return session;
    if (!root) build();
    const overlay = document.getElementById("overlay"), hud = document.getElementById("hud");
    const was = { overlay: overlay ? overlay.hidden : true, hud: hud ? hud.hidden : true };
    const best = readBest();
    const pick = nodes["tt-turn"], speedBtn = nodes["tt-speed"], sketch = nodes["tt-sketch"], time = nodes["tt-time"], cue = nodes["tt-cue"], scoreEl = nodes["tt-score"];
    const sx = sketch.getContext("2d"), tx = time.getContext("2d");
    let name = corner && CORNERS.some(c => c.name === corner) ? corner : (best.last && CORNERS.some(c => c.name === best.last) ? best.last : "T6");
    let running = false, countdown = 0, t0 = 0, raf = 0, timer = 0, rec = [], colors = {}, preset = "yours";
    const keys = { left: false, right: false, brake: false, gas: false };
    pick.value = name;
    const SPEEDS = [[0.5, "½×"], [0.75, "¾×"], [1, "1×"]];
    let speed = SPEEDS.some(s => s[0] === best.speed) ? best.speed : 0.5;
    function paintSpeed() {
      const label = SPEEDS.find(s => s[0] === speed)[1];
      speedBtn.textContent = label;
      speedBtn.setAttribute("aria-label", "Drill speed " + (speed === 1 ? "real time" : label) + ", tap to change");
    }
    paintSpeed();

    function readColors() {
      colors = { bg: css("--surf-1") || css("--bg"), text: css("--text"), dim: css("--dim"), line: css("--card-line"), target: css("--surf-3"),
        brake: css("--red"), gas: css("--faster"), right: css("--zone"), left: css("--spark"), font: css("--font-ui") || "system-ui" };
    }
    // The drill reads the buttons the race reads. Keys are the desktop fallback (← → steer, ↓ brake, ↑ gas).
    function sample() {
      const lv = typeof Input !== "undefined" && Input.touchLevels ? Input.touchLevels() : { brake: 0, gas: 0, left: 0, right: 0 };
      const left = Math.max(lv.left, keys.left ? 1 : 0), right = Math.max(lv.right, keys.right ? 1 : 0);
      return { s: left && !right ? -left : right && !left ? right : 0, b: Math.max(lv.brake, keys.brake ? 1 : 0), g: Math.max(lv.gas, keys.gas ? 1 : 0) };
    }

    // Size the panel to the free screen between the real buttons: the column between the two docks, or the band above
    // them when a dock layout leaves the middle too narrow. The sketch takes what the bar and timeline leave.
    function place() {
      const panel = nodes["tt-panel"], de = document.documentElement, cs = getComputedStyle(de);
      const inset = k => parseFloat(cs.getPropertyValue(k)) || 0;
      const vw = de.clientWidth || innerWidth, vh = de.clientHeight || innerHeight, gap = parseFloat(css("--gap")) || 8;
      const sal = inset("--sal"), sar = inset("--sar"), sat = inset("--sat"), sab = inset("--sab");
      const boxes = Array.from(document.querySelectorAll("#hud-dock .touchbtn")).filter(b => !b.hidden)
        .map(b => b.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0);
      const lefts = boxes.filter(r => r.left + r.width / 2 < vw / 2), rights = boxes.filter(r => r.left + r.width / 2 >= vw / 2);
      const x0 = Math.max(sal, ...lefts.map(r => r.right)) + gap, x1 = Math.min(vw - sar, ...rights.map(r => r.left)) - gap;
      const top = sat + gap, bottom = vh - sab - gap, dockTop = Math.min(bottom + gap, ...boxes.map(r => r.top));
      const column = { x: x0, y: top, w: x1 - x0, h: bottom - top };
      const band = { x: sal + gap, y: top, w: vw - sal - sar - 2 * gap, h: dockTop - 2 * gap - top };
      const use = column.w >= 300 || column.w * column.h >= band.w * band.h ? column : band;
      Object.assign(panel.style, { left: use.x + "px", top: use.y + "px", width: Math.max(160, use.w) + "px", height: Math.max(160, use.h) + "px" });
      // The sketch takes the bigger free corner above a dock when one is roomy (above the arrows on a phone), so the
      // drill column keeps its height for the bar, cue and timeline. Otherwise it stays in the column.
      const corner = (side, x, w) => ({ x, y: top, w, h: Math.min(bottom + gap, ...side.map(r => r.top)) - gap - top });
      const lt = corner(lefts, sal + gap, use === column ? x0 - 2 * gap - sal : 0), rt = corner(rights, x1 + gap, use === column ? vw - sar - gap - x1 - gap : 0);
      const inline = use.w * Math.max(0, use.h - 160) * 0.55;   // about what the sketch gets in the column
      const side = [lt, rt].filter(r => Math.min(r.w, r.h) >= 140 && r.w * r.h >= inline * 0.6).sort((a, b) => b.w * b.h - a.w * a.h)[0];
      if (side) {
        if (sketch.parentElement !== root) root.appendChild(sketch);
        Object.assign(sketch.style, { position: "absolute", left: side.x + "px", top: side.y + "px", width: side.w + "px", height: side.h + "px" });
      } else {
        if (sketch.parentElement !== nodes["tt-drill"]) nodes["tt-drill"].prepend(sketch);
        for (const k of ["position", "left", "top", "width", "height"]) sketch.style.removeProperty(k);
      }
      root.dataset.fit = (use === column ? "column" : "band") + (side ? " side-sketch" : "");
      for (const c of [sketch, time]) {
        const r = c.getBoundingClientRect(), d = devicePixelRatio || 1;
        c.width = Math.max(1, Math.round(r.width * d));
        c.height = Math.max(1, Math.round(r.height * d));
        c.getContext("2d").setTransform(d, 0, 0, d, 0, 0);
      }
      readColors();
      drawAll(running ? last() : null);
      if (!nodes["tt-explore"].hidden) drawChart();
    }
    const last = () => rec.length ? rec[rec.length - 1].t : 0;

    function geometry(C) {
      const N = 400, dt = C.dur / N, th = C.angle * Math.PI / 180, th2 = C.angle2 * Math.PI / 180;
      const ds = [], sg = [];
      let dMain = 0, dOpp = 0;
      for (let i = 0; i < N; i++) {
        const t = (i + 0.5) * dt, d = C.v(t) * dt, g = C.target(t) * C.dir;
        ds.push(d); sg.push(g);
        if (g > 0) dMain += d; else if (g < 0) dOpp += d;
      }
      const wMain = th / Math.max(dMain, 1e-6), wOpp = th2 / Math.max(dOpp, 1e-6);
      let hd = C.shape === "carry" ? -C.dir * 0.35 : 0, px = 0, py = 0, dist = 0;
      const P = [[0, 0, 0, hd]];
      for (let i = 0; i < N; i++) {
        const w = sg[i] > 0 ? wMain : sg[i] < 0 ? -wOpp : 0;
        hd += C.dir * w * ds[i];
        px += Math.sin(hd) * ds[i]; py -= Math.cos(hd) * ds[i]; dist += ds[i];
        P.push([dist, px, py, hd]);
      }
      const dAt = t => P[Math.max(0, Math.min(N, Math.round(t / dt)))][0];
      const pt = s => {
        let lo = 0, hi = N;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m][0] < s) lo = m; else hi = m; }
        return [P[hi][1], P[hi][2], P[hi][3] * C.dir];
      };
      return { dAt, pt, total: dist };
    }
    function font(px, weight = 700) { return weight + " " + px + "px " + colors.font; }
    function drawSketch(tNow) {
      const C = script(name), g = geometry(C), W = sketch.clientWidth, H = sketch.clientHeight;
      if (!W || !H) return;
      const pts = [];
      for (let i = 0; i <= 120; i++) pts.push(g.pt(g.total * i / 120));
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const pad = 22, padX = Math.min(72, W * 0.27), k = Math.min((W - 2 * padX) / Math.max(1e-6, maxX - minX), (H - 2 * pad) / Math.max(1e-6, maxY - minY));
      const ox = ((W - 2 * padX) - (maxX - minX) * k) / 2, oy = ((H - 2 * pad) - (maxY - minY) * k) / 2;
      const X = p => padX + ox + (p[0] - minX) * k, Y = p => pad + oy + (p[1] - minY) * k;
      sx.clearRect(0, 0, W, H);
      sx.fillStyle = colors.bg; sx.fillRect(0, 0, W, H);
      const seg = (a, b, col, w) => {
        sx.strokeStyle = col; sx.lineWidth = w; sx.lineCap = "round"; sx.lineJoin = "round"; sx.beginPath();
        for (let i = 0; i <= 60; i++) { const p = g.pt(a + (b - a) * i / 60); if (i) sx.lineTo(X(p), Y(p)); else sx.moveTo(X(p), Y(p)); }
        sx.stroke();
      };
      const road = Math.max(10, Math.min(20, H / 9));
      seg(0, g.total, colors.line, road);
      for (let i = 0; i < 80; i++) {
        const a = C.dur * i / 80, b = C.dur * (i + 1) / 80, d = C.target((a + b) / 2);
        seg(g.dAt(a), g.dAt(b), d ? (d < 0 ? colors.left : colors.right) : colors.target, road * 0.4);
      }
      // Labels go to whichever side of the road has more of the canvas, so a narrow sketch never clips them.
      const mark = (t, col, label, dy = 0) => {
        const p = g.pt(g.dAt(t)), nx = Math.cos(p[2]), ny = Math.sin(p[2]) * C.dir, sd = X(p) > W / 2 ? -1 : 1;
        sx.strokeStyle = col; sx.lineWidth = 4; sx.beginPath();
        sx.moveTo(X(p) - nx * road * 0.7, Y(p) - ny * road * 0.7); sx.lineTo(X(p) + nx * road * 0.7, Y(p) + ny * road * 0.7); sx.stroke();
        sx.fillStyle = col; sx.font = font(12); sx.textAlign = sd > 0 ? "left" : "right";
        sx.fillText(label, X(p) + sd * (road + 4), Y(p) + 4 + dy); sx.textAlign = "start";
      };
      if (C.brake(0) > 0) mark(0.02, colors.brake, "brake");
      if (C.shape === "lift") mark(0.6, colors.left, "lift");
      mark(C.tIn, colors.right, "turn-in");
      const gOn = firstOn(C.gas, C.dur, true);
      const together = gOn != null && Math.abs(gOn - C.apex) < 0.2;
      const ap = g.pt(g.dAt(C.apex));
      sx.fillStyle = colors.text; sx.beginPath(); sx.arc(X(ap), Y(ap), 5, 0, 7); sx.fill();
      const apSide = X(ap) > W / 2 ? -1 : 1;
      sx.font = font(12); sx.textAlign = apSide > 0 ? "left" : "right"; sx.fillStyle = together ? colors.gas : colors.text;
      sx.fillText(together ? "apex · gas on" : "apex", X(ap) + apSide * 10, Y(ap) + 4); sx.textAlign = "start";
      if (gOn != null && !together && gOn > 0.05) mark(gOn, colors.gas, "gas on", 14);
      mark(C.tOut, colors.dim, "arrow off", -14);
      sx.fillStyle = colors.text; sx.font = font(13);
      sx.fillText(C.name + " · " + (C.dir < 0 ? "LEFT" : "RIGHT"), 6, 15);
      if (tNow != null) {
        const p = g.pt(g.dAt(tNow));
        sx.fillStyle = colors.brake; sx.strokeStyle = colors.bg; sx.lineWidth = 2;
        sx.beginPath(); sx.arc(X(p), Y(p), 7, 0, 7); sx.fill(); sx.stroke();
      }
    }
    function drawTime() {
      const C = script(name), W = time.clientWidth, H = time.clientHeight;
      if (!W || !H) return;
      const L = 52, R = W - 6, strip = 13, lane = (H - strip - 16) / 3;
      const lanes = [["BRAKE", strip + 2], ["ARROWS", strip + 2 + lane], ["GAS", strip + 2 + 2 * lane]];
      const x = t => L + (R - L) * t / C.dur, inner = lane - 6;
      tx.clearRect(0, 0, W, H);
      tx.fillStyle = colors.bg; tx.fillRect(0, 0, W, H);
      tx.textBaseline = "middle"; tx.font = font(11, 600);
      for (const [n, top] of lanes) {
        tx.fillStyle = colors.dim; tx.fillText(n, 4, top + lane / 2);
        tx.strokeStyle = colors.line; tx.beginPath(); tx.moveTo(L, top + lane - 0.5); tx.lineTo(R, top + lane - 0.5); tx.stroke();
      }
      const yB = lanes[0][1] + lane - 3, yA = lanes[1][1] + 3, yG = lanes[2][1] + 3;
      tx.fillStyle = colors.target;
      for (let i = 0; i < 240; i++) {
        const t = C.dur * i / 240, w = (R - L) / 240 + 0.6, xx = x(t), br = C.brake(t);
        if (br > 0) tx.fillRect(xx, yB - inner * br, w, inner * br);
        if (C.target(t)) tx.fillRect(xx, yA, w, inner);
        if (C.gas(t)) tx.fillRect(xx, yG, w, inner);
      }
      tx.fillStyle = colors.text; tx.font = font(12); tx.textAlign = "center";
      for (let t = 0.1; t < C.dur; t += 0.25) { const d = C.target(t); if (d) tx.fillText(d < 0 ? "◀" : "▶", x(t), yA + inner / 2); }
      // Phase strip: where the straight ends and the turn begins.
      tx.fillStyle = colors.target; tx.fillRect(L, 1, x(C.tIn) - L, strip);
      tx.fillStyle = C.dir < 0 ? colors.left : colors.right; tx.globalAlpha = 0.35;
      tx.fillRect(x(C.tIn), 1, x(C.tOut) - x(C.tIn), strip); tx.globalAlpha = 1;
      tx.fillStyle = colors.target; tx.fillRect(x(C.tOut), 1, R - x(C.tOut), strip);
      tx.fillStyle = colors.text; tx.font = font(10); tx.textAlign = "start";
      const before = C.shape === "flick" ? "STILL IN THE LAST TURN" : C.shape === "carry" ? "FROM THE LAST TURN" : C.brake(0) > 0 ? "STRAIGHT · BRAKE ZONE" : "STRAIGHT";
      const room = x(C.tIn) - L - 6;
      tx.fillText(tx.measureText(before).width <= room ? before : tx.measureText("STRAIGHT").width <= room ? "STRAIGHT" : "", L + 3, 1 + strip / 2);
      tx.fillText("TURN " + (C.dir < 0 ? "LEFT" : "RIGHT"), x(C.tIn) + 3, 1 + strip / 2);
      if (R - x(C.tOut) > 36) tx.fillText("EXIT", x(C.tOut) + 3, 1 + strip / 2);
      tx.strokeStyle = colors.text; tx.setLineDash([3, 4]); tx.beginPath(); tx.moveTo(x(C.apex), strip + 2); tx.lineTo(x(C.apex), H - 12); tx.stroke(); tx.setLineDash([]);
      tx.fillStyle = colors.text; tx.textAlign = "center"; tx.font = font(10, 600); tx.fillText("apex", x(C.apex), H - 6); tx.textAlign = "start";
      if (rec.length > 1) {
        tx.lineWidth = 3;
        tx.strokeStyle = colors.brake; tx.beginPath();
        rec.forEach((r, i) => { const y = yB - inner * r.b; if (i) tx.lineTo(x(r.t), y); else tx.moveTo(x(r.t), y); });
        tx.stroke();
        for (let i = 1; i < rec.length; i++) {
          const p = rec[i - 1], r = rec[i];
          tx.strokeStyle = (r.s || p.s) < 0 ? colors.left : colors.right; tx.beginPath();
          tx.moveTo(x(p.t), yA + inner - inner * Math.abs(p.s)); tx.lineTo(x(r.t), yA + inner - inner * Math.abs(r.s)); tx.stroke();
        }
        tx.strokeStyle = colors.gas; tx.beginPath();
        rec.forEach((r, i) => { const y = yG + inner - inner * r.g; if (i) tx.lineTo(x(r.t), y); else tx.moveTo(x(r.t), y); });
        tx.stroke();
        tx.lineWidth = 1;
      }
      if (running) { tx.strokeStyle = colors.text; tx.lineWidth = 2; tx.beginPath(); tx.moveTo(x(last()), 1); tx.lineTo(x(last()), H - 12); tx.stroke(); tx.lineWidth = 1; }
      if (countdown > 0) { tx.fillStyle = colors.text; tx.font = font(Math.min(48, H / 2)); tx.textAlign = "center"; tx.fillText(String(countdown), (L + R) / 2, H / 2); tx.textAlign = "start"; }
    }
    function drawAll(tNow) { drawSketch(tNow); drawTime(); }

    function cueFor(t) {
      const C = script(name);
      let text = C.cues[0][1];
      for (const [at, line] of C.cues) if (t >= at - 0.15) text = line;
      return text;
    }
    function idle() {
      cue.textContent = script(name).note + " Press START.";
      const b = best[name];
      scoreEl.textContent = b ? "Your best here: " + Math.round(b * 100) + "%" : "";
    }
    function stop() {
      running = false; countdown = 0;
      cancelAnimationFrame(raf); clearTimeout(timer);
      nodes["tt-go"].textContent = "START";
    }
    function tick(now) {
      if (!running) return;
      const C = script(name), t = (now - t0) / 1000 * speed;
      if (t >= C.dur) { finish(); return; }
      rec.push({ t, ...sample() });
      cue.textContent = cueFor(t + 0.12 * speed);
      drawAll(t);
      raf = requestAnimationFrame(tick);
    }
    function start() {
      if (running || countdown) { stop(); idle(); drawAll(null); return; }
      readColors();
      rec = []; countdown = 3; scoreEl.textContent = "";
      nodes["tt-go"].textContent = "STOP";
      cue.textContent = "Get ready: " + script(name).cues[0][1];
      drawAll(null);
      const step = () => {
        countdown--;
        if (countdown > 0) { drawTime(); timer = setTimeout(step, 600); return; }
        running = true; t0 = performance.now(); drawTime(); raf = requestAnimationFrame(tick);
      };
      timer = setTimeout(step, 600);
    }
    function finish() {
      stop();
      const s = score(name, rec), pct = v => Math.round(v * 100) + "%";
      best[name] = Math.max(best[name] || 0, s.all);
      best.last = name; best.speed = speed;
      writeBest(best);
      scoreEl.textContent = `Match ${pct(s.all)} · arrow ${pct(s.arrow)} · brake ${pct(s.brake)} · gas ${pct(s.gas)} · best ${pct(best[name])}`;
      cue.textContent = s.tips.slice(0, 2).join(" ") || "Done. START to go again.";
      drawAll(null);
    }
    function choose(next) {
      stop();
      name = next; pick.value = next; rec = [];
      idle(); drawAll(null);
    }

    // PEDAL EXPLORER: the selected preset's curves beside the saved profile, from PedalTravel itself.
    function drawChart() {
      const host = nodes["tt-chart"], note = nodes["tt-note"], PT = typeof PedalTravel !== "undefined" ? PedalTravel : null;
      for (const b of document.querySelectorAll("#tt-presets button")) b.setAttribute("aria-pressed", String(b.dataset.preset === preset));
      if (!PT) { host.textContent = ""; note.textContent = "The pedal code did not load."; return; }
      const mine = { brake: PT.buttonProfile("brake"), gas: PT.buttonProfile("gas") };
      const chosen = preset === "yours" ? mine : { brake: PRESETS[preset].brake, gas: PRESETS[preset].gas || mine.gas };
      // Drawn at the box's own size so its labels stay at their real 11 px.
      const W = Math.max(220, host.clientWidth), H = Math.max(90, host.clientHeight), L = 36, R = W - 6, T = 6, B = H - 18;
      const span = p => p.sliderEdge ? 100 : Math.max(100, (p.travel || PT.TRAVEL_PX) + 30);
      const x = u => L + (R - L) * u, y = v => B - (B - T) * v;
      const NS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(NS, "svg");
      const add = (tag, attrs, text) => {
        const node = document.createElementNS(NS, tag);
        for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
        if (text != null) node.textContent = text;
        svg.appendChild(node);
      };
      for (const [k, v] of Object.entries({ viewBox: `0 0 ${W} ${H}`, width: "100%", height: "100%", preserveAspectRatio: "xMidYMid meet", "aria-hidden": "true" })) svg.setAttribute(k, v);
      const label = { fill: colors.dim, "font-size": 11, "text-anchor": "end" };
      for (const v of [0, 0.25, 0.5, 0.75, 1]) {
        add("line", { x1: L, x2: R, y1: y(v), y2: y(v), stroke: colors.line });
        add("text", { x: L - 4, y: y(v) + 4, ...label }, v * 100 + "%");
      }
      add("line", { x1: L, x2: R, y1: y(COAST / BRAKE_MAX), y2: y(COAST / BRAKE_MAX), stroke: colors.left, "stroke-dasharray": "3 3" });
      const path = (p, col, dash) => {
        let d = "";
        for (let i = 0; i <= 100; i++) d += (i ? "L" : "M") + x(i / 100).toFixed(1) + "," + y(curve(PT, p, i / 100, span(p))).toFixed(1);
        add("path", { d, fill: "none", stroke: col, "stroke-width": 2.5, ...(dash ? { "stroke-dasharray": "6 5" } : {}) });
      };
      if (preset !== "yours" && !!mine.brake.sliderEdge === !!chosen.brake.sliderEdge) path(mine.brake, colors.dim, true);   // your saved brake, for comparison
      path(chosen.gas, colors.gas, true);
      path(chosen.brake, colors.brake, false);
      add("text", { x: R, y: H - 4, ...label }, chosen.brake.sliderEdge ? "thumb position on the button, from the low end"
        : "px slid from where the thumb landed (0–" + span(chosen.brake) + ")");
      host.replaceChildren(svg);
      host.setAttribute("aria-label", "Brake (red) and gas (green, dashed) level against thumb travel" + (preset !== "yours" ? "; dashed: your saved brake" : ""));
      const full = Math.round(curve(PT, chosen.brake, chosen.brake.sliderEdge ? 1 : 0, span(chosen.brake)) * 100);
      note.textContent = (preset === "yours" ? "Your saved brake starts at " + full + " %" +
        (mine.brake.sliderEdge ? ", set by where your thumb is." : ", easing to " + (mine.brake.end ?? Math.round(PT.MIN * 100)) + " % as you slide " +
          (mine.brake.direction || "up").toUpperCase() + " " + mine.brake.travel + " px.")
        : PRESETS[preset].note + " Set it in SETTINGS › CONTROLS › the button's editor.") +
        ` Red brake, green gas; amber is a coast (${COAST} of ${BRAKE_MAX} m/s² full brake), and a live brake never slows less.`;
    }

    function onKey(e) {
      const on = e.type === "keydown", k = e.key;
      const map = { ArrowLeft: "left", ArrowRight: "right", ArrowDown: "brake", ArrowUp: "gas" };
      if (!map[k] || e.target?.tagName === "SELECT") return;
      keys[map[k]] = on;
      e.preventDefault();
      e.stopPropagation();
    }
    const handlers = [
      ["tt-back", () => close()],
      ["tt-go", start],
      ["tt-speed", () => { speed = SPEEDS[(SPEEDS.findIndex(s => s[0] === speed) + 1) % SPEEDS.length][0]; paintSpeed(); }],
      ["tt-prev", () => choose(CORNERS[(CORNERS.findIndex(c => c.name === name) + CORNERS.length - 1) % CORNERS.length].name)],
      ["tt-next", () => choose(CORNERS[(CORNERS.findIndex(c => c.name === name) + 1) % CORNERS.length].name)],
      ["tt-view", () => {
        const exploring = nodes["tt-explore"].hidden;
        stop();
        nodes["tt-explore"].hidden = !exploring; nodes["tt-drill"].hidden = exploring;
        nodes["tt-view"].textContent = exploring ? "DRILL" : "PEDALS";
        nodes["tt-view"].setAttribute("aria-label", exploring ? "Timing drill" : "Pedal explorer");
        cue.hidden = exploring;
        if (exploring) requestAnimationFrame(drawChart); else { idle(); place(); }
      }],
    ];
    for (const [id, fn] of handlers) nodes[id].onclick = fn;
    pick.onchange = () => choose(pick.value);
    for (const b of document.querySelectorAll("#tt-presets button")) b.onclick = () => { preset = b.dataset.preset; drawChart(); };

    function close() {
      stop();
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
      window.removeEventListener("resize", queue);
      cue.hidden = false; nodes["tt-explore"].hidden = true; nodes["tt-drill"].hidden = false; nodes["tt-view"].textContent = "PEDALS";
      observer?.disconnect();
      cancelAnimationFrame(pending);
      root.hidden = true;
      document.body.removeAttribute("data-thumb-trainer");
      preview?.(false);
      // A thumb still down on a button that just hid may never send its lift (WebKit): release every hold here,
      // as a blur does, so nothing pressed in the drill is held into the next race.
      if (typeof Input !== "undefined" && Input.reset) Input.reset();
      if (hud) hud.hidden = was.hud;
      if (overlay) overlay.hidden = was.overlay;
      session = null;
      Log.info("ui", "ThumbTrainer closed");
      onClose?.();
    }
    let pending = 0;
    function queue() { cancelAnimationFrame(pending); pending = requestAnimationFrame(() => requestAnimationFrame(place)); }

    Log.info("ui", "ThumbTrainer open " + name);
    document.body.setAttribute("data-thumb-trainer", "");
    if (overlay) overlay.hidden = true;
    if (hud) hud.hidden = false;
    preview?.(true);
    if (G?.getSteerMode && G.getSteerMode() !== "buttons") {
      cue.textContent = "Your STEERING INPUT is not BUTTONS, so no arrows show. Use ← → on a keyboard, or set BUTTONS in SETTINGS › CONTROLS.";
    } else idle();
    root.hidden = false;
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    window.addEventListener("resize", queue);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(queue) : null;
    for (const box of [document.getElementById("dock-left"), document.getElementById("dock-right"), nodes["tt-chart"]]) if (box) observer?.observe(box);
    readColors();
    queue();
    session = { close, choose, place, state: () => ({ name, running, rec: rec.length, fit: root.dataset.fit }) };
    return session;
  }

  return Object.freeze({ open, close: () => session?.close(), SHAPES, CORNERS, PRESETS, script, score, curve });
})();
Object.freeze(ThumbTrainer);
