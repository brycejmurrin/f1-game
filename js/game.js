/* Apex 26 — main game: state machine, physics, AI, race logic, HUD.
   Contract: docs/ARCHITECTURE.md. Depends on globals M4,V3,GLX,Teams,Tracks,
   Car3D,Input,GameAudio,F1API,DataHub. */
(function () {
"use strict";

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const canvas = $("game");
const els = {
  hud: $("hud"), pos: $("hud-pos"), lap: $("hud-lap"), time: $("hud-time"),
  best: $("hud-best"), speed: $("hud-speed-n"), energy: $("hud-energy-fill"),
  ot: $("hud-ot"), gapA: $("hud-gap-ahead"), gapB: $("hud-gap-behind"),
  flag: $("hud-flag"), minimap: $("minimap"),
  lights: $("lights"), announce: $("announce"),
  overlay: $("overlay"), subtitle: $("subtitle"), audiostate: $("audiostate"),
  select: $("select"), selTitle: $("select-title"), selTeams: $("sel-teams"),
  selDriver: $("sel-driver"), selTracks: $("sel-tracks"),
  selTrackSection: $("sel-track-section"), selDiff: $("sel-diff"),
  selBack: $("sel-back"), selGo: $("sel-go"),
  results: $("results"), resultsTitle: $("results-title"),
  resultsTable: $("results-table"), resMenu: $("res-menu"), resNext: $("res-next"),
  pausebtn: $("pausebtn"), pausemenu: $("pausemenu"),
  howtoplay: $("howtoplay"), datahub: $("datahub"), soundbtn: $("soundbtn"),
  btnBoost: $("btn-boost"), btnOT: $("btn-ot"), btnBrake: $("btn-brake"),
  btnThrottle: $("btn-throttle"),
  shiftUp: $("shift-up"), shiftDown: $("shift-down"),
  gear: $("hud-gear"), rpmFill: $("hud-rpm-fill"), tach: $("hud-tach"),
};

if (!GLX.init(canvas)) { $("nogl").hidden = false; return; }

// ---------- settings ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem("apex26." + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("apex26." + k, JSON.stringify(v)); } catch (e) {} },
};
let teamIdx = store.get("team", 2);          // default McLaren
let driverIdx = store.get("driver", 0);
let trackIdx = store.get("track", 0);
let difficulty = store.get("difficulty", "normal");
let soundOn = store.get("sound", true);
let manualMode = store.get("manual", false);   // manual gearbox (player shifts)
let season = store.get("season", null);      // {round, pts:{code:n}, teamPts:{id:n}}

// ---------- physics constants ----------
const VMAX = 75;            // m/s base (~270 km/h)
const ACCEL = 13;           // m/s^2 at low speed
const BRAKE = 27;
const COAST_DRAG = 6;       // m/s^2 deceleration when off the throttle
const LAT_MAX = 22;         // m/s^2 cornering grip
const STEER_VMAX = 15;      // lateral m/s at full lock, full speed
const GRASS_V = 24;         // crawl speed on grass
const DEPLOY_A = 5.0;       // extra accel from electric deploy
const TAPER_LO = 54, TAPER_HI = 70;  // deploy tapers to 0 across this speed band
const DRAIN = 0.20, REGEN = 0.115;   // energy per second
const OT_TIME = 4, OT_COOL = 12, OT_GAP = 1.0;
const TIER_V = [1.0, 0.988, 0.973, 0.958, 0.942];
// 8-speed gearbox: each gear's top speed as a fraction of VMAX
const GEARS = 8;
const GEAR_TOP = [0.16, 0.28, 0.42, 0.56, 0.69, 0.81, 0.91, 1.0];
const IDLE_RPM = 4000, MAX_RPM = 15000;
function gearLo(g) { return g > 1 ? VMAX * GEAR_TOP[g - 2] : 0; }
function gearHi(g) { return VMAX * GEAR_TOP[g - 1]; }
function naturalGear(speed) {
  for (let g = 1; g <= GEARS; g++) if (speed <= gearHi(g) + 0.01) return g;
  return GEARS;
}
function rpmFor(gear, speed) {
  const lo = gearLo(gear), hi = gearHi(gear);
  const frac = clamp((speed - lo) / Math.max(hi - lo, 1), 0, 1.12);
  return IDLE_RPM + frac * (MAX_RPM - IDLE_RPM);
}
const DIFF = {
  easy:   { ai: 0.86, band: 0.18 },
  normal: { ai: 0.92, band: 0.08 },
  hard:   { ai: 0.99, band: 0.03 },
};
const GAME_LAPS = 3;

// ---------- state ----------
let state = "menu";
let track = null, builtTrackId = null;
let cars = [], player = null;
let raceT = 0, countT = 0, lightsLit = 0, resultT = 0;
let camEye = [0, 6, -10], camTgt = [0, 0, 0], camFov = 62;
let seasonMode = false;
let frameSky = {}, frame = {};
const teamMeshes = {};   // teamId -> GLX mesh
let shake = 0;          // 0..1 trauma; camera offset scales with shake²
let hitStop = 0;        // seconds of remaining sim slow-mo after a hard hit
let startHold = 0;      // randomised lights-out delay after the 5th light (F1-style)
let paused = false;
let lastFrame = 0;
let announceT = 0;
let hudT = 0;
let minimapBg = null;         // offscreen canvas with pre-rendered track shape
const MAX_SKID = 120;
const skidMarks = [];         // ring buffer of Float32Array(16) model matrices
let skidIdx = 0;
let skidFrameT = 0;           // frame countdown between stamp placements
const mm = els.minimap.getContext("2d");
const smp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };  // reusable sample
const smp2 = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
const smpC = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };  // camera anchor

// ---------- helpers ----------
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (c, t, l, dt) => lerp(c, t, 1 - Math.exp(-l * dt));
function fmtTime(t) {
  if (!isFinite(t) || t <= 0) return "-";
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ":" + (s < 10 ? "0" : "") + s.toFixed(2);
}
function announce(msg, dur) {
  els.announce.textContent = msg;
  els.announce.hidden = false;
  announceT = dur || 1.6;
}
function wrapS(s) { const L = track.total; s %= L; return s < 0 ? s + L : s; }
function basisMat(r, u, f, p, out) {
  out[0] = r[0]; out[1] = r[1]; out[2] = r[2]; out[3] = 0;
  out[4] = u[0]; out[5] = u[1]; out[6] = u[2]; out[7] = 0;
  out[8] = f[0]; out[9] = f[1]; out[10] = f[2]; out[11] = 0;
  out[12] = p[0]; out[13] = p[1]; out[14] = p[2]; out[15] = 1;
  return out;
}
const tmpMat = new Float32Array(16);
const tmpR = [0, 0, 0], tmpF = [0, 0, 0], tmpU = [0, 1, 0], tmpP = [0, 0, 0];

// ---------- car setup ----------
function makeCars() {
  cars = [];
  Teams.LIST.forEach((team, ti) => {
    team.drivers.forEach((d, di) => {
      const isP = ti === teamIdx && di === driverIdx;
      cars.push({
        team, name: d.name, code: d.code, num: d.num, isPlayer: isP,
        color: team.color, tier: team.tier,
        s: 0, x: 0, speed: 0, prog: 0, lap: 0,
        gear: 1, rpm: IDLE_RPM, shiftT: 0, boostOn: false,
        energy: 1, otT: 0, otCool: 0, deploying: false,
        lapStart: 0, lapTime: 0, best: Infinity, totalT: 0,
        finished: false, finishT: 0, finPos: 0,
        offroad: false, offT: 0, cuts: 0, penalty: 0,
        yawVis: 0, steerVis: 0, collideT: 0,
        skill: 0.92 + Math.random() * 0.1,
        aiBrakeT: 0, aiOffset: (Math.random() - 0.5) * 1.6,
      });
    });
  });
  player = cars.find((c) => c.isPlayer);
}

function gridUp() {
  // grid order: by tier then random-ish; player at P12 for a fun climb
  const order = cars.slice().sort((a, b) => (a.tier - b.tier) || (Math.random() - 0.5));
  const pi = order.indexOf(player);
  order.splice(pi, 1);
  order.splice(11, 0, player);
  order.forEach((c, i) => {
    c.s = wrapS(track.total - 14 - i * 8);
    c.x = (i % 2 === 0 ? -1 : 1) * Math.min(smpHw(c.s) * 0.4, 3);
    c.speed = 0; c.prog = -(14 + i * 8); c.lap = 0; c.energy = 1;
    c.otT = 0; c.otCool = 0; c.lapTime = 0; c.best = Infinity; c.totalT = 0;
    c.finished = false; c.finishT = 0; c.cuts = 0; c.penalty = 0; c.offT = 0;
  });
}
function smpHw(s) { Tracks.sample(track, s, smp); return smp.hw; }

function teamMesh(team) {
  if (!teamMeshes[team.id]) teamMeshes[team.id] = GLX.createMesh(Car3D.build(team.color, team.color2));
  return teamMeshes[team.id];
}

// ---------- track loading ----------
function loadTrack(idx) {
  const def = Tracks.LIST[idx];
  if (builtTrackId === def.id) return;
  track = Tracks.build(def);
  builtTrackId = def.id;
  minimapBg = null;           // force minimap redraw for new track
  const pal = def.palette;
  frame = {
    viewProj: M4.ident(), eye: camEye,
    sunDir: V3.norm(pal.sunDir), sunColor: pal.sunColor,
    ambientGround: pal.ambientGround, ambientSky: pal.ambientSky,
    fogColor: pal.fog, fogDensity: pal.fogDensity,
  };
  frameSky = {
    invViewProj: M4.ident(), zenith: pal.zenith, horizon: pal.horizon,
    sunDir: frame.sunDir, sunColor: pal.sun, stars: def.night ? 1 : 0,
  };
}

// ---------- race flow ----------
function startRace() {
  loadTrack(trackIdx);
  makeCars();
  gridUp();
  state = "count"; countT = 0; lightsLit = 0; raceT = 0; startHold = 0; paused = false;
  skidMarks.length = 0; skidIdx = 0; skidFrameT = 0;
  els.overlay.hidden = true; els.select.hidden = true; els.results.hidden = true;
  els.hud.hidden = false; els.lights.hidden = false; els.pausebtn.hidden = false;
  els.soundbtn.hidden = true;   // sound is toggled from the pause menu during a race
  for (const l of els.lights.children) l.classList.remove("on");
  showTouchControls(true);
  Input.calibrate();
  if (soundOn) { GameAudio.startEngine(); GameAudio.startMusic(trackIdx); }
  updateHud(true);
}

function showTouchControls(show) {
  const t = show && Input.touchControlsNeeded();
  els.btnThrottle.hidden = !t; els.btnBrake.hidden = !t;
  els.btnBoost.hidden = !t; els.btnOT.hidden = !t;
  els.shiftUp.hidden = !(t && manualMode);
  els.shiftDown.hidden = !(t && manualMode);
  // manual mode => shifts take the right column, boost/OT move to centre (CSS)
  document.body.classList.toggle("manual", manualMode);
}

function endRace() {
  state = "results";
  els.pausebtn.hidden = true;
  showTouchControls(false);
  GameAudio.stopEngine(); GameAudio.setSkid(0);
  if (soundOn) GameAudio.finish();
  // classification: finished by time(+penalty), rest by progress
  const fin = cars.filter((c) => c.finished).sort((a, b) => (a.finishT + a.penalty) - (b.finishT + b.penalty));
  const run = cars.filter((c) => !c.finished).sort((a, b) => b.prog - a.prog);
  const order = fin.concat(run);
  order.forEach((c, i) => { c.finPos = i + 1; });
  buildResults(order);
  if (seasonMode) {
    order.forEach((c, i) => {
      const pts = Teams.POINTS[i] || 0;
      season.pts[c.code] = (season.pts[c.code] || 0) + pts;
      season.teamPts[c.team.id] = (season.teamPts[c.team.id] || 0) + pts;
    });
    season.round++;
    store.set("season", season);
  }
  els.results.hidden = false;
}

function buildResults(order) {
  els.resultsTable.textContent = "";
  els.resultsTitle.textContent = seasonMode
    ? "ROUND " + season.round + (season.round > 1 ? "" : "") + " — " + track.def.name
    : track.def.name + " RESULT";
  order.forEach((c, i) => {
    const row = document.createElement("div");
    row.className = "res-row" + (c.isPlayer ? " you" : "");
    const pos = document.createElement("span"); pos.className = "res-pos"; pos.textContent = i + 1;
    const sw = document.createElement("span"); sw.className = "res-swatch";
    sw.style.background = cssCol(c.team.color);
    const nm = document.createElement("span"); nm.className = "res-name";
    nm.textContent = c.code + "  " + c.name + (c.penalty ? "  (+" + c.penalty + "s)" : "");
    const pt = document.createElement("span"); pt.className = "res-pts";
    pt.textContent = (Teams.POINTS[i] || 0) + " pts";
    row.append(pos, sw, nm, pt);
    els.resultsTable.appendChild(row);
  });
  if (seasonMode) {
    const head = document.createElement("div");
    head.style.cssText = "margin-top:14px;color:#e10600;font-weight:800;font-style:italic";
    head.textContent = "CHAMPIONSHIP — AFTER ROUND " + season.round;
    els.resultsTable.appendChild(head);
    const all = cars.slice().sort((a, b) => (season.pts[b.code] || 0) - (season.pts[a.code] || 0)).slice(0, 8);
    all.forEach((c, i) => {
      const row = document.createElement("div");
      row.className = "res-row" + (c.isPlayer ? " you" : "");
      const pos = document.createElement("span"); pos.className = "res-pos"; pos.textContent = i + 1;
      const nm = document.createElement("span"); nm.className = "res-name"; nm.textContent = c.code;
      const pt = document.createElement("span"); pt.className = "res-pts"; pt.textContent = (season.pts[c.code] || 0) + " pts";
      row.append(pos, nm, pt);
      els.resultsTable.appendChild(row);
    });
    els.resNext.textContent = season.round >= Tracks.LIST.length ? "FINISH SEASON" : "NEXT ROUND";
  } else {
    els.resNext.textContent = "RACE AGAIN";
  }
}
function cssCol(c) { return "rgb(" + (c[0] * 255 | 0) + "," + (c[1] * 255 | 0) + "," + (c[2] * 255 | 0) + ")"; }

function quitToMenu() {
  state = "menu"; paused = false;
  els.hud.hidden = true; els.lights.hidden = true; els.pausebtn.hidden = true;
  els.pausemenu.hidden = true; els.results.hidden = true; els.announce.hidden = true;
  els.overlay.hidden = false;
  els.soundbtn.hidden = false;
  showTouchControls(false);
  GameAudio.stopEngine(); GameAudio.setSkid(0);
  if (soundOn) GameAudio.startMusic(-1);
}

// ---------- per-frame update ----------
function update(dt) {
  if (state === "count") {
    countT += dt;
    const lit = Math.min(5, Math.floor(countT));
    if (lit > lightsLit) {
      lightsLit = lit;
      els.lights.children[lit - 1].classList.add("on");
      if (soundOn) GameAudio.lightOn(lit - 1);
      if (lit === 1) Input.calibrate();
      // all five lit — hold for a randomised beat, as in real F1, so the
      // start can't be timed and lights-out is a genuine reaction moment.
      if (lit === 5) startHold = 0.2 + Math.random() * 1.8;
    }
    if (lightsLit === 5 && countT > 5 + startHold) {
      state = "race"; raceT = 0;
      els.lights.hidden = true;
      for (const l of els.lights.children) l.classList.remove("on");
      announce("LIGHTS OUT!", 1.4);
      if (soundOn) GameAudio.lightsOut();
      cars.forEach((c) => { c.lapStart = 0; });
    }
    return;
  }
  if (state !== "race") return;
  raceT += dt;
  // ranks by progress
  const ranked = cars.slice().sort((a, b) => b.prog - a.prog);
  ranked.forEach((c, i) => { c.rank = i + 1; });

  for (const c of cars) updateCar(c, dt, ranked);

  // collisions — cars are sorted by prog in `ranked` (highest first)
  // Car footprint: ~2.4 m wide, ~5.5 m long (half-extents 1.2 m, 2.75 m)
  for (let i = 0; i < ranked.length; i++) {
    for (let j = i + 1; j < ranked.length && j <= i + 5; j++) {
      const a = ranked[i], b = ranked[j];   // a is ahead
      const ds = a.prog - b.prog;
      if (ds > 7) break;                    // sorted, so further j are even farther back
      const dx = a.x - b.x;
      const overlapX = 2.5 - Math.abs(dx);  // combined half-widths
      const overlapS = 5.8 - ds;            // combined half-lengths
      if (overlapX <= 0 || overlapS <= 0) continue;
      // Lateral push: rear car deflects more than front car
      const pushX = overlapX * 0.65 * (dx >= 0 ? 1 : -1);
      a.x += pushX * 0.3;
      b.x -= pushX * 0.7;
      // Speed: rear car (b) can't drive faster than front car (a) when same lane
      if (Math.abs(dx) < 1.8 && b.speed > a.speed + 1) {
        b.speed = b.speed * 0.88 + (a.speed + 1) * 0.12;
      }
      a.speed *= 0.9995; b.speed *= 0.999;
      if (a.isPlayer || b.isPlayer) {
        const pc = a.isPlayer ? a : b;
        if (pc.collideT <= 0) {
          // scale feedback by how hard the hit is: closing-speed difference
          // plus how deep the overlap is. A graze barely registers; a
          // T-bone shakes hard, briefly freezes the sim, and buzzes the phone.
          const impact = clamp(Math.abs(a.speed - b.speed) * 0.04 + overlapS * 0.06, 0.15, 1);
          if (soundOn) GameAudio.collision();
          shake = Math.min(1, shake + impact * 0.7);
          hitStop = Math.max(hitStop, impact * 0.06);
          pc.collideT = 0.4;
          if (navigator.vibrate) { try { navigator.vibrate(Math.round(20 + impact * 50)); } catch (e) {} }
        }
      }
    }
  }

  // race ends when the player finishes, or shortly after the winner does, or
  // at a hard time cap so it can never hang
  if (resultT === 0) {
    if (player.finished) resultT = 2.2;
    else if (cars.some((c) => c.finished)) resultT = 3.5;
    else if (raceT > 360) resultT = 0.1;
  }
  if (resultT > 0) { resultT -= dt; if (resultT <= 0) { resultT = 0; endRace(); } }

  if (soundOn) {
    const revFrac = clamp((player.rpm - IDLE_RPM) / (MAX_RPM - IDLE_RPM), 0, 1);
    GameAudio.setEngine(revFrac, player.deploying ? 1 : 0, player.offroad, clamp(player.speed / VMAX, 0, 1));
    GameAudio.setSkid(player.offroad ? 0.4 : clamp(Math.abs(Tracks.curvature(track, player.s)) * player.speed * 0.05 - 0.35, 0, 1));
  }
}

function updateCar(c, dt, ranked) {
  if (c.finished) { coast(c, dt); return; }
  Tracks.sample(track, c.s, smp);
  const hw = smp.hw;
  const k = Tracks.curvature(track, c.s);
  const dd = DIFF[difficulty];

  // --- speed targets ---
  let vmax = VMAX * (c.isPlayer ? 1.0 : TIER_V[c.tier] * c.skill * dd.ai);
  // rubber band for AI
  if (!c.isPlayer) {
    const gap = player.prog - c.prog;
    vmax *= 1 + clamp(gap / 700, -1, 1) * dd.band;
  }

  // --- electric deploy ---
  let deploy = 0;
  c.otCool = Math.max(0, c.otCool - dt);
  if (c.otT > 0) c.otT -= dt;
  if (c.isPlayer && Input.consumeBoostToggle()) c.boostOn = !c.boostOn;   // BOOST is a toggle
  const wantBoost = c.isPlayer ? c.boostOn
    : (Math.abs(Tracks.curvature(track, wrapS(c.s + 60))) < 0.006 && c.energy > 0.25);
  if (wantBoost && c.energy > 0) {
    const taper = c.otT > 0 ? 1 : clamp(1 - (c.speed - TAPER_LO) / (TAPER_HI - TAPER_LO), 0, 1);
    deploy = DEPLOY_A * taper;
    c.energy = Math.max(0, c.energy - DRAIN * dt);
    c.deploying = deploy > 0.4;
    if (c.energy <= 0) c.boostOn = false;   // auto-release the toggle when drained
  } else c.deploying = false;

  // --- overtake mode ---
  const ahead = ranked[(c.rank || 1) - 2];
  const gapAhead = ahead ? (ahead.prog - c.prog) / Math.max(c.speed, 20) : Infinity;
  c.otArmed = gapAhead < OT_GAP && c.otCool <= 0 && c.otT <= 0 && !c.finished;
  const fire = c.isPlayer ? Input.consumeOvertake() : (c.otArmed && Math.random() < dt * 0.7);
  if (fire && c.otArmed) {
    c.otT = OT_TIME; c.otCool = OT_COOL + OT_TIME;
    if (c.isPlayer && soundOn) GameAudio.deployBoost();
  }
  if (c.isPlayer && c.otArmed && !c.wasArmed && soundOn) GameAudio.overtakeReady();
  c.wasArmed = c.otArmed;

  // --- braking / target speed ---
  let braking = false;
  if (c.isPlayer) {
    braking = Input.braking();
  } else {
    // AI: brake for upcoming curvature
    const look = clamp(c.speed * 1.7, 30, 160);
    let kMax = 0;
    for (let d = 12; d < look; d += 14) kMax = Math.max(kMax, Math.abs(Tracks.curvature(track, wrapS(c.s + d))));
    const vCorner = Math.sqrt(LAT_MAX / Math.max(kMax, 1e-5)) * c.skill;
    braking = c.speed > vCorner + 2;
    // also brake for any car directly ahead in the same lane
    const carAhead = ranked[(c.rank || 1) - 2];
    if (!braking && carAhead) {
      const followDist = carAhead.prog - c.prog;
      if (followDist > 0 && followDist < 10 && Math.abs(carAhead.x - c.x) < 2.2) {
        if (c.speed > carAhead.speed + 3) braking = true;
      }
    }
  }

  // --- gearbox (player) ---
  let gearMult = 1, speedCap = vmax + 14;
  if (c.isPlayer) {
    c.shiftT = Math.max(0, c.shiftT - dt);
    const up = Input.consumeShiftUp(), down = Input.consumeShiftDown();
    if (manualMode) {
      if (up && c.gear < GEARS && c.shiftT <= 0) { c.gear++; c.shiftT = 0.1; if (soundOn) GameAudio.uiTick(); }
      if (down && c.gear > 1 && c.shiftT <= 0) { c.gear--; c.shiftT = 0.1; if (soundOn) GameAudio.uiTick(); }
      const hi = gearHi(c.gear), lo = gearLo(c.gear);
      const frac = (c.speed - lo) / Math.max(hi - lo, 1);
      if (c.speed >= hi) { gearMult = 0.08; speedCap = Math.min(speedCap, hi + 1.5); }  // limiter: upshift to go faster
      else if (frac < 0.25) gearMult = clamp(0.7 + frac * 1.2, 0, 1);   // mild bog at low revs: downshift for best punch
    }
  }

  // --- integrate speed ---
  // throttle is manual for the player (a held button); AI always drives
  const onThrottle = c.isPlayer ? Input.throttle() : true;
  if (braking) {
    c.speed = Math.max(0, c.speed - BRAKE * dt);
    c.energy = Math.min(1, c.energy + REGEN * 1.6 * dt);
  } else if (!onThrottle) {
    // coasting: gentle engine-braking/drag, plus a little energy recovery
    c.speed = Math.max(0, c.speed - COAST_DRAG * dt);
    c.energy = Math.min(1, c.energy + REGEN * dt);
  } else {
    const a = (ACCEL * clamp(1 - c.speed / vmax, 0, 1) * gearMult + deploy) * (state === "race" ? 1 : 0);
    c.speed = Math.min(speedCap, c.speed + a * dt);
    if (c.speed < vmax * 0.5) c.energy = Math.min(1, c.energy + REGEN * dt);
  }
  if (c.isPlayer) {
    if (!manualMode) c.gear = naturalGear(c.speed);
    c.rpm = rpmFor(c.gear, c.speed);
  }

  // --- offroad ---
  c.offroad = Math.abs(c.x) > hw;
  if (c.offroad) {
    const offDepth = clamp((Math.abs(c.x) - hw) / 5, 0, 1);
    c.speed = Math.max(GRASS_V * 0.6, c.speed - (20 + offDepth * 28) * dt);
    c.offT += dt;
    if (c.offT > 1.2) {
      c.offT = -2;   // grace before next count
      c.cuts++;
      if (c.isPlayer) {
        if (c.cuts >= 4 && c.penalty === 0) {
          c.penalty = 5;
          announce("+5s TRACK LIMITS PENALTY", 2);
          if (soundOn) GameAudio.penalty();
        } else if (c.cuts < 4) {
          announce("TRACK LIMITS " + c.cuts + "/4", 1.2);
          if (soundOn) GameAudio.offtrack();
        }
      }
    }
  } else if (c.offT > 0) c.offT = Math.max(0, c.offT - dt);

  // --- lateral ---
  let steer;
  if (c.isPlayer) steer = Input.steer();
  else {
    const kA = Tracks.curvature(track, wrapS(c.s + clamp(c.speed * 0.7, 18, 70)));
    const targetX = clamp(kA * 130, -0.62, 0.62) * hw + c.aiOffset;
    // avoid cars directly ahead (up to 2 cars checked)
    let avoid = 0;
    for (let look = 1; look <= 2; look++) {
      const af = ranked[(c.rank || 1) - 1 - look];
      if (!af) break;
      const gap = af.prog - c.prog;
      if (gap > 16 || gap < 0) break;
      const adx = af.x - c.x;
      if (Math.abs(adx) < 2.6) {
        const urgency = lerp(1.6, 2.4, clamp(1 - gap / 16, 0, 1));
        avoid = adx > 0 ? -urgency : urgency;
        break;  // react to the closest blocker only
      }
    }
    steer = clamp((targetX + avoid - c.x) * 0.9, -1, 1);
  }
  // Lateral authority scales with speed and is ZERO at a standstill: a car
  // that isn't moving can't be steered sideways, so tilting while stopped no
  // longer slides you around. Full authority by ~65 km/h.
  // At high speed, grip tapers off slightly to model understeer.
  const latFac = clamp(c.speed / 18, 0, 1);
  const gripScale = 1 - clamp((c.speed - 20) / (VMAX - 20), 0, 1) * 0.38;
  c.x += steer * STEER_VMAX * latFac * gripScale * dt;
  // set skid intensity once per frame (used by audio and by visual marks)
  if (c.isPlayer) {
    c.skidIntensity = c.offroad ? 0.5
      : clamp(Math.abs(k) * c.speed * 0.05 - 0.35, 0, 1);
  }
  // wall
  const wall = hw + 9;
  if (c.x > wall) { c.x = wall; c.speed *= 0.96; }
  if (c.x < -wall) { c.x = -wall; c.speed *= 0.96; }
  c.steerVis = damp(c.steerVis, steer, 10, dt);
  c.yawVis = damp(c.yawVis, steer * 0.35 + clamp(k * c.speed * 0.14, -0.28, 0.28), 6, dt);
  c.collideT = Math.max(0, c.collideT - dt);

  // --- advance along track ---
  const oldS = c.s;
  c.s = wrapS(c.s + c.speed * dt);
  c.prog += c.speed * dt;
  c.totalT += dt;
  c.lapTime += dt;
  // line crossing
  if (oldS > track.total * 0.5 && c.s < track.total * 0.5 && oldS > c.s) {
    c.lap++;
    if (c.lap > 1) {
      if (c.lapTime < c.best) c.best = c.lapTime;
      if (c.isPlayer && soundOn) GameAudio.lap();
    }
    c.lapTime = 0;
    if (c.isPlayer && c.lap === GAME_LAPS) announce("FINAL LAP", 1.6);
    if (c.lap > GAME_LAPS) {
      c.finished = true;
      c.finishT = raceT;
      if (c.isPlayer) announce("FINISH!", 2);
    }
  }
}

function coast(c, dt) {
  c.speed = Math.max(24, c.speed - 20 * dt);
  c.s = wrapS(c.s + c.speed * dt);
  c.prog += c.speed * dt;
  Tracks.sample(track, c.s, smp);
  const kA = Tracks.curvature(track, wrapS(c.s + 30));
  c.x = damp(c.x, clamp(kA * 130, -0.5, 0.5) * smp.hw, 2, dt);
}

// ---------- render ----------
function render(dt) {
  GLX.resize();
  if (!track) { GLX.begin({ viewProj: M4.ident(), eye: [0,0,0], sunDir: [0,1,0], sunColor: [1,1,1], ambientGround: [0.2,0.2,0.2], ambientSky: [0.4,0.4,0.5], fogColor: [0.04,0.04,0.06], fogDensity: 0.002 }); return; }

  // camera
  let eyeT, tgtT, fovT;
  if (state === "menu" || state === "select") {
    // slow flyby
    const s = wrapS((performance.now() * 0.012) % track.total);
    Tracks.sample(track, s, smp);
    eyeT = [smp.p[0] + smp.r[0] * 26 , smp.p[1] + 17, smp.p[2] + smp.r[2] * 26];
    tgtT = [smp.p[0] + smp.t[0] * 40, smp.p[1] + 2, smp.p[2] + smp.t[2] * 40];
    fovT = 58;
  } else {
    Tracks.sample(track, player.s, smp);
    const px = player.x;
    const p = [smp.p[0] + smp.r[0] * px, smp.p[1], smp.p[2] + smp.r[2] * px];
    // Anchor the camera a FIXED distance behind the player along the track
    // (arc-length), not in world space — so it never lags at high speed and
    // the car stays a constant, readable size.
    Tracks.sample(track, wrapS(player.s - 7.5), smpC);
    const cx = px * 0.5;   // partly follow lateral offset; rest shows position
    eyeT = [
      smpC.p[0] + smpC.r[0] * cx, smpC.p[1] + 2.35, smpC.p[2] + smpC.r[2] * cx,
    ];
    tgtT = [p[0] + smp.t[0] * 4, p[1] + 0.75, p[2] + smp.t[2] * 4];
    // wider FOV at speed reads as faster; boost adds an extra transient kick
    // that the camFov damping eases in and out.
    fovT = lerp(56, 76, clamp(player.speed / VMAX, 0, 1)) + (player.deploying ? 7 : 0);
    if (shake > 0) {
      shake = Math.max(0, shake - dt * 1.6);
      const amt = shake * shake * 0.9;   // squared: grazes barely move, crashes slam
      eyeT[0] += (Math.random() - 0.5) * amt; eyeT[1] += (Math.random() - 0.5) * amt * 0.7;
      tgtT[0] += (Math.random() - 0.5) * amt * 0.6; tgtT[1] += (Math.random() - 0.5) * amt * 0.6;
    }
  }
  // High lambda in-race: the anchor already follows the car along the track,
  // so we only smooth bumps — no speed lag. Low lambda for the menu flyby.
  const racing = state === "race" || state === "count";
  const lE = racing ? 14 : 1.6;
  const lT = racing ? 16 : 10;
  for (let i = 0; i < 3; i++) {
    camEye[i] = damp(camEye[i], eyeT[i], lE, dt);
    camTgt[i] = damp(camTgt[i], tgtT[i], lT, dt);
  }
  camFov = damp(camFov, fovT, 4, dt);

  const proj = M4.perspective(camFov * Math.PI / 180, GLX.aspect, 0.1, 900);
  const view = M4.lookAt(camEye, camTgt, [0, 1, 0]);
  frame.viewProj = M4.mul(proj, view);
  frame.eye = camEye;
  GLX.begin(frame);
  frameSky.invViewProj = M4.invert(frame.viewProj);
  GLX.drawSky(frameSky);

  const night = track.def.night;
  GLX.draw(track.meshes.terrain, M4.ident());
  GLX.draw(track.meshes.road, M4.ident(), night ? { emissive: 0.25 } : undefined);
  GLX.draw(track.meshes.props, M4.ident(), night ? { emissive: 0.45 } : undefined);
  GLX.draw(track.meshes.gate, M4.ident());

  // skid marks drawn before cars so cars render on top
  for (const m of skidMarks) {
    GLX.drawMark(m, 0.6, 2.2);
  }

  // cars
  for (const c of cars) {
    Tracks.sample(track, c.s, smp2);
    tmpP[0] = smp2.p[0] + smp2.r[0] * c.x;
    tmpP[1] = smp2.p[1];
    tmpP[2] = smp2.p[2] + smp2.r[2] * c.x;
    // yaw the forward/right around up by yawVis
    const cy = Math.cos(c.yawVis || 0), sy = Math.sin(c.yawVis || 0);
    for (let i = 0; i < 3; i++) {
      tmpF[i] = smp2.t[i] * cy + smp2.r[i] * sy;
      tmpR[i] = smp2.r[i] * cy - smp2.t[i] * sy;
    }
    tmpU[0] = tmpR[1] * tmpF[2] - tmpR[2] * tmpF[1];
    tmpU[1] = tmpR[2] * tmpF[0] - tmpR[0] * tmpF[2];
    tmpU[2] = tmpR[0] * tmpF[1] - tmpR[1] * tmpF[0];
    basisMat(tmpR, tmpU, tmpF, tmpP, tmpMat);
    GLX.drawShadow(tmpMat, 2.4, 5.8);
    GLX.draw(teamMesh(c.team), tmpMat, night ? { emissive: 0.2 } : undefined);
    if (c.isPlayer && state === "race") {
      const skid = c.skidIntensity || 0;
      if ((skid > 0.25 || c.offroad) && c.speed > 10) {
        skidFrameT--;
        if (skidFrameT <= 0) {
          skidFrameT = 5;
          const m = new Float32Array(tmpMat);
          if (skidMarks.length < MAX_SKID) skidMarks.push(m);
          else { skidMarks[skidIdx] = m; skidIdx = (skidIdx + 1) % MAX_SKID; }
        }
      } else {
        skidFrameT = 0;
      }
    }
  }
}

// ---------- HUD ----------
function updateHud(force) {
  if (!player) return;
  hudT -= 1;
  if (!force && hudT > 0) return;
  hudT = 6; // ~10Hz at 60fps
  els.pos.textContent = (player.rank || "-") + "/" + cars.length;
  els.lap.textContent = Math.min(player.lap || 1, GAME_LAPS) + "/" + GAME_LAPS;
  els.time.textContent = fmtTime(player.lapTime);
  els.best.textContent = isFinite(player.best) ? fmtTime(player.best) : "-";
  els.speed.textContent = Math.round(player.speed * 3.6);
  els.energy.style.width = (player.energy * 100).toFixed(0) + "%";
  // gear + tachometer
  els.gear.textContent = player.gear;
  const rpmFrac = clamp((player.rpm - IDLE_RPM) / (MAX_RPM - IDLE_RPM), 0, 1);
  els.rpmFill.style.width = (rpmFrac * 100).toFixed(0) + "%";
  els.tach.classList.toggle("redline", player.rpm > MAX_RPM * 0.92);
  // toggle-button states
  els.btnBoost.classList.toggle("on", player.boostOn);
  els.btnOT.classList.toggle("on", player.otT > 0);
  els.btnOT.classList.toggle("armed", player.otArmed && player.otT <= 0);
  const ot = player.otT > 0 ? "ot-active" : player.otArmed ? "ot-armed" : player.otCool > 0 ? "ot-cool" : "ot-off";
  els.ot.className = ot;
  els.ot.textContent = player.otT > 0 ? "OVERTAKE " + player.otT.toFixed(1) : "OVERTAKE";
  // gaps
  const ranked = cars.slice().sort((a, b) => b.prog - a.prog);
  const i = ranked.indexOf(player);
  const a = ranked[i - 1], b = ranked[i + 1];
  els.gapA.textContent = a ? "▲ " + a.code + " +" + ((a.prog - player.prog) / Math.max(player.speed, 25)).toFixed(1) + "s" : "";
  els.gapB.textContent = b ? "▼ " + b.code + " +" + ((player.prog - b.prog) / Math.max(player.speed, 25)).toFixed(1) + "s" : "";
  drawMinimap();
}

function drawMinimap() {
  const W = els.minimap.width, H = els.minimap.height;
  // pre-render the static track outline once; reuse as a cheap blit every HUD frame
  if (!minimapBg || minimapBg.width !== W || minimapBg.height !== H) {
    minimapBg = document.createElement("canvas");
    minimapBg.width = W; minimapBg.height = H;
    const mc = minimapBg.getContext("2d");
    const map = track.map, n = map.length;
    mc.strokeStyle = "rgba(255,255,255,0.75)";
    mc.lineWidth = 2;
    mc.beginPath();
    for (let i = 0; i <= n; i++) {
      const p = map[i % n];
      const x = 8 + p[0] * (W - 16), y = 8 + p[1] * (H - 16);
      i === 0 ? mc.moveTo(x, y) : mc.lineTo(x, y);
    }
    mc.stroke();
  }
  mm.clearRect(0, 0, W, H);
  mm.drawImage(minimapBg, 0, 0);
  const map = track.map, n = map.length;
  for (const c of cars) {
    if (c === player) continue;
    const p = map[Math.floor(c.s / track.total * n) % n];
    mm.fillStyle = cssCol(c.team.color);
    mm.fillRect(6 + p[0] * (W - 16), 6 + p[1] * (H - 16), 4, 4);
  }
  const p = map[Math.floor(player.s / track.total * n) % n];
  mm.fillStyle = "#fff";
  mm.beginPath();
  mm.arc(8 + p[0] * (W - 16), 8 + p[1] * (H - 16), 4, 0, 7);
  mm.fill();
}

// ---------- main loop ----------
function tick(now) {
  requestAnimationFrame(tick);
  let dt = Math.min((now - lastFrame) / 1000, 1 / 20);
  lastFrame = now;
  if (paused) return;
  if (announceT > 0) { announceT -= dt; if (announceT <= 0) els.announce.hidden = true; }
  // hit-stop: slow the simulation to a crawl for a few frames after a hard
  // crash so the impact reads, but keep the camera (render) at full dt so the
  // shake still plays out.
  let simDt = dt;
  if (hitStop > 0) { hitStop = Math.max(0, hitStop - dt); simDt = dt * 0.15; }
  update(simDt);
  render(dt);
  if (state === "race" || state === "count") updateHud(false);
}

// ---------- UI wiring ----------
function buildSelect(forSeason) {
  els.selTitle.textContent = forSeason ? "SEASON — ROUND " + ((season && season.round || 0) + 1) : "GRAND PRIX";
  els.selTrackSection.hidden = forSeason;
  els.selTeams.textContent = "";
  Teams.LIST.forEach((t, i) => {
    const b = document.createElement("button");
    b.className = "sel-chip" + (i === teamIdx ? " active" : "");
    const sw = document.createElement("span"); sw.className = "swatch"; sw.style.background = cssCol(t.color);
    b.append(sw, document.createTextNode(t.short));
    b.onclick = () => { teamIdx = i; driverIdx = 0; store.set("team", i); buildSelect(forSeason); tickUi(); };
    els.selTeams.appendChild(b);
  });
  const team = Teams.LIST[teamIdx];
  els.selDriver.textContent = "";
  team.drivers.forEach((d, i) => {
    const b = document.createElement("button");
    b.className = "sel-chip" + (i === driverIdx ? " active" : "");
    b.textContent = "#" + d.num + " " + d.name;
    b.onclick = () => { driverIdx = i; store.set("driver", i); buildSelect(forSeason); tickUi(); };
    els.selDriver.appendChild(b);
  });
  if (!forSeason) {
    els.selTracks.textContent = "";
    Tracks.LIST.forEach((t, i) => {
      const b = document.createElement("button");
      b.className = "sel-chip" + (i === trackIdx ? " active" : "");
      b.textContent = t.name + (t.night ? " ☾" : "");
      b.onclick = () => { trackIdx = i; store.set("track", i); buildSelect(forSeason); tickUi(); loadTrack(i); };
      els.selTracks.appendChild(b);
    });
  }
  els.selDiff.textContent = "";
  ["easy", "normal", "hard"].forEach((d) => {
    const b = document.createElement("button");
    b.className = "sel-chip" + (d === difficulty ? " active" : "");
    b.textContent = d.toUpperCase();
    b.onclick = () => { difficulty = d; store.set("difficulty", d); buildSelect(forSeason); tickUi(); };
    els.selDiff.appendChild(b);
  });
}
function tickUi() { if (soundOn) GameAudio.uiTick(); }

function tiltLabel() {
  return "TILT: " + (Input.useTilt() ? (Input.gyroSeen ? "ON" : "ON (NO GYRO)") : "OFF");
}

function enableTilt() {
  // Must run inside a user gesture for the iOS permission prompt.
  Input.requestGyro().then((ok) => {
    if (ok) Input.calibrate();
    $("pm-tilt").textContent = tiltLabel();
    els.audiostate.textContent = ok && Input.tiltActive() ? "tilt steering ready"
      : (Input.gyroDenied ? "motion access denied — using touch" : "");
  });
}

function firstGesture() {
  GameAudio.init();
  GameAudio.setEnabled(soundOn);
  enableTilt();
  if (soundOn) GameAudio.startMusic(-1);
}
let gestured = false;
document.addEventListener("pointerdown", () => {
  if (gestured) return; gestured = true; firstGesture();
}, { once: false, capture: true });

els.soundbtn.hidden = false;
function setSound(b) {
  soundOn = b; store.set("sound", b);
  GameAudio.setEnabled(b);
  els.soundbtn.textContent = b ? "♪ ON" : "♪ OFF";
  $("pm-sound").textContent = "SOUND: " + (b ? "ON" : "OFF");
  if (!b) { GameAudio.stopMusic(); GameAudio.stopEngine(); }
  else if (state === "menu") GameAudio.startMusic(-1);
}
els.soundbtn.onclick = () => setSound(!soundOn);

$("mb-race").onclick = () => {
  seasonMode = false;
  buildSelect(false);
  els.overlay.hidden = true; els.select.hidden = false;
  if (soundOn) GameAudio.uiSelect();
  loadTrack(trackIdx);
};
$("mb-season").onclick = () => {
  seasonMode = true;
  if (!season || season.round >= Tracks.LIST.length) {
    season = { round: 0, pts: {}, teamPts: {} };
    store.set("season", season);
  }
  trackIdx = season.round;
  buildSelect(true);
  els.overlay.hidden = true; els.select.hidden = false;
  if (soundOn) GameAudio.uiSelect();
  loadTrack(trackIdx);
};
$("mb-data").onclick = () => { DataHub.open(); if (soundOn) GameAudio.uiSelect(); };
$("mb-help").onclick = () => { els.howtoplay.hidden = false; };
$("htp-close").onclick = () => { els.howtoplay.hidden = true; };
els.selBack.onclick = () => { els.select.hidden = true; els.overlay.hidden = false; };
els.selGo.onclick = () => { if (soundOn) GameAudio.uiSelect(); enableTilt(); startRace(); };
els.resMenu.onclick = () => quitToMenu();
els.resNext.onclick = () => {
  if (seasonMode) {
    if (season.round >= Tracks.LIST.length) {
      // season over: champion announce then reset
      const champ = cars.slice().sort((a, b) => (season.pts[b.code] || 0) - (season.pts[a.code] || 0))[0];
      announce(champ.code + " IS CHAMPION!", 3);
      season = null; store.set("season", null);
      quitToMenu();
      return;
    }
    trackIdx = season.round;
  }
  els.results.hidden = true;
  startRace();
};

function setPaused(p) {
  if (state !== "race" && state !== "count") return;
  paused = p;
  els.pausemenu.hidden = !p;
  if (p) { GameAudio.stopEngine(); GameAudio.setSkid(0); }
  else if (soundOn) GameAudio.startEngine();
  lastFrame = performance.now();
}
els.pausebtn.onclick = () => setPaused(true);
$("pm-resume").onclick = () => setPaused(false);
$("pm-restart").onclick = () => { els.pausemenu.hidden = false; setPaused(false); startRace(); };
$("pm-quit").onclick = () => quitToMenu();
$("pm-sound").onclick = () => setSound(!soundOn);
$("pm-tilt").onclick = () => {
  const on = !Input.useTilt();
  Input.setUseTilt(on);
  if (on) enableTilt();   // (re)request motion permission within this gesture
  $("pm-tilt").textContent = tiltLabel();
  showTouchControls(true);
};
$("pm-calib").onclick = () => { Input.calibrate(); setPaused(false); };
$("pm-gears").onclick = () => {
  manualMode = !manualMode;
  store.set("manual", manualMode);
  $("pm-gears").textContent = "GEARS: " + (manualMode ? "MANUAL" : "AUTO");
  if (player && !manualMode) player.gear = naturalGear(player.speed);
  showTouchControls(true);
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state === "race") setPaused(true);
});

// ---------- boot ----------
// Inert in production; only attaches when a test harness pre-sets the flag.
if (typeof window !== "undefined" && window.__APEX_DEBUG) {
  window.__APEX = { cars: () => cars, player: () => player, state: () => state, track: () => track };
}

Input.init(canvas, { onPause: () => setPaused(!paused) });
DataHub.init(els.datahub);
$("pm-tilt").textContent = tiltLabel();
$("pm-gears").textContent = "GEARS: " + (manualMode ? "MANUAL" : "AUTO");
setSound(soundOn);
loadTrack(trackIdx);
window.addEventListener("resize", () => GLX.resize());
lastFrame = performance.now();
requestAnimationFrame(tick);

})();
