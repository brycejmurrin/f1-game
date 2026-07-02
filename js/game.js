/* Apex 26 — main game: state machine, physics, AI, race logic, HUD.
   Contract: docs/ARCHITECTURE.md. Depends on globals M4,V3,GLX,Teams,Tracks,
   Car3D,Input,GameAudio,F1API,DataHub. */
(function () {
"use strict";


// ---------- shared namespaces (see game-config.js / game-state.js) ----------
const {
  VMAX, ACCEL, BRAKE, REVERSE_MAX, REVERSE_ACCEL, COAST_DRAG, GRAVITY_SLOPE,
  LAT_MAX, STEER_VMAX, FRONT_WEIGHT, CS_FRONT, CS_REAR, WT_LONG, ASSIST_KUS,
  LONG_GRIP, BODY_ROLL_MAX, WHEEL_R, WHEEL_STEER_VIS, GRASS_V, DEPLOY_A,
  TAPER_LO, TAPER_HI, DRAIN, REGEN, OT_TIME, OT_COOL, OT_GAP, TIER_V, GEARS,
  GEAR_TOP, IDLE_RPM, MAX_RPM, DIFF, GAME_LAPS, TT_LAPS, CAM_MODES,
  gearLo, gearHi, naturalGear, rpmFor
} = AXC;
const { store, ttBoard, ttBoardAdd } = AX;
const { updateHud, drawMinimap } = AXHud;
const { applyRaceSettings, initRainDrops, drawRain } = AXWeather;
const { makeCars, gridUp, loadTrack, scheduleFlybyTrack } = AXTrack;
const { setPaused, setSound, setMusic, setCamMode, cycleCam, refreshGearsBtn,
        steerLabel, buildSelect, tickUi, openSetup, buildRaceSettings,
        enableTilt, setSteerMode } = AXUi;
const { render, camVantage, buildTrackLights, loadCarModel,
        LT, TUNE_DEFS, _ltStore, ltKey, setLightTune, persistLightTune, applyLightTune } = AXRender;
const { update, rescuePlayer } = AXPhysics;


// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const canvas = $("game");
const els = {
  hud: $("hud"), pos: $("hud-pos"), lap: $("hud-lap"), time: $("hud-time"),
  best: $("hud-best"), speed: $("hud-speed-n"), energy: $("hud-energy-fill"),
  ot: $("hud-ot"), gapA: $("hud-gap-ahead"), gapB: $("hud-gap-behind"),
  hudSectors: $("hud-sectors"),
  flag: $("hud-flag"), minimap: $("minimap"),
  lights: $("lights"), announce: $("announce"),
  overlay: $("overlay"), subtitle: $("subtitle"), audiostate: $("audiostate"),
  select: $("select"), selTitle: $("select-title"), selTeams: $("sel-teams"),
  selDriver: $("sel-driver"), selTracks: $("sel-tracks"),
  selPreviewMap: $("sel-preview-map"), selPreviewName: $("sel-preview-name"),
  selPreviewGp: $("sel-preview-gp"), selPreviewMeta: $("sel-preview-meta"),
  selPreviewRec: $("sel-preview-rec"),
  selTrackSection: $("sel-track-section"), selCircuitLabel: $("sel-circuit-label"), selDiff: $("sel-diff"),
  selDiffSection: $("sel-diff-section"), selCustomize: $("sel-customize"),
  selBack: $("sel-back"), selGo: $("sel-go"),
  customize: $("customize"),
  results: $("results"), resultsTitle: $("results-title"),
  resultsTable: $("results-table"), resMenu: $("res-menu"), resNext: $("res-next"),
  pmStandings: $("pm-standings"),
  pausebtn: $("pausebtn"), pausemenu: $("pausemenu"), btnCam: $("btn-cam"),
  howtoplay: $("howtoplay"), datahub: $("datahub"), soundbtn: $("soundbtn"),
  btnBoost: $("btn-boost"), btnOT: $("btn-ot"), btnBrake: $("btn-brake"),
  btnThrottle: $("btn-throttle"),
  btnSteerLeft: $("btn-steer-left"), btnSteerRight: $("btn-steer-right"),
  shiftUp: $("shift-up"), shiftDown: $("shift-down"),
  gear: $("hud-gear"), rpmFill: $("hud-rpm-fill"), tach: $("hud-tach"),
};

if (!GLX.init(canvas)) { $("nogl").hidden = false; return; }


// Custom "MY TEAM": a player-defined team injected into Teams.LIST. It only
// joins the grid when the player actually selects it (see makeCars).
const DEFAULT_CUSTOM = {
  id: "custom", name: "My Team", short: "YOU", engine: "Custom", tier: 2, custom: true,
  color: [0.13, 0.79, 0.85], color2: [0.96, 0.86, 0.0],
  stats: { speed: 84, accel: 82, cornering: 83, braking: 81 },
  drivers: [{ name: "Your Name", code: "YOU", num: 99 }],
};
function loadCustomTeam() { return store.get("customTeam", DEFAULT_CUSTOM); }
function syncCustomTeam() {
  const i = Teams.LIST.findIndex((t) => t.id === "custom");
  if (i >= 0) Teams.LIST.splice(i, 1);
  Teams.LIST.push(loadCustomTeam());
  delete AXRender.teamMeshes.custom;   // force the mesh to rebuild with the latest colours
  delete AXRender.playerBodies.custom; // and the body-only (animated-wheel) variant
}
function hexToRgb(h) {
  return [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
}
function rgbToHex(c) {
  const f = (v) => ("0" + Math.round(clamp(v, 0, 1) * 255).toString(16)).slice(-2);
  return "#" + f(c[0]) + f(c[1]) + f(c[2]);
}

// Manual gears: available in tilt mode (thumbs free) or on desktop keyboard
// (no thumbs involved). Touch/button modes on mobile force auto to free thumbs.
function gearsManual() {
  return AX.manualMode && (AX.steerMode === "tilt" || !Input.touchControlsNeeded());
}
// Auto-throttle: enabled only in touch steering mode (screen-half taps occupy
// the thumb). Button mode now exposes an explicit GAS button so the thumb is free.
function autoThrottle() { return Input.touchControlsNeeded() && AX.steerMode === "touch"; }

// Weather predicates. "wet" = damp/wet track (wet road, no falling rain);
// "rain" = active storm (wet road + falling rain + lightning). Both wet the road.
function isWetRoad() { return AX.raceWeather === "wet" || AX.raceWeather === "rain"; }
function isRaining() { return AX.raceWeather === "rain"; }
// A streaming-wet track is slightly more slippery than a merely damp one.
function gripMult() { return AX.raceWeather === "rain" ? 0.72 : AX.raceWeather === "wet" ? 0.82 : 1; }

// Studio light rig (__apex.studio): a ring of test lamps that follows the player
// car — inspect paint/reflection response on any track at any time of day,
// independent of the session's real lamps. null = off.
let _studioRig = null;
const _studioBuf = [];
function buildStudioRig() {
  const R = _studioRig;
  if (!AX.player || AX.player.px == null || !AX.track) return null;
  const cx = AX.player.px, cz = AX.player.pz;
  Tracks.sample(AX.track, ((AX.player.s % AX.track.total) + AX.track.total) % AX.track.total, smp);
  const cy = smp.p[1];
  _studioBuf.length = 0;
  for (let i = 0; i < R.n; i++) {
    const a = (i / R.n) * Math.PI * 2 + (R.spin || 0);
    const lx = cx + Math.cos(a) * R.dist, lz = cz + Math.sin(a) * R.dist, ly = cy + R.h;
    let ax = cx - lx, ay = (cy + 0.5) - ly, az = cz - lz;
    const al = Math.hypot(ax, ay, az) || 1;
    ax /= al; ay /= al; az /= al;
    const e = R.intensity * 0.55;   // same physical energy factor as track lamps
    _studioBuf.push(lx, ly, lz,
      R.color[0] * e, R.color[1] * e, R.color[2] * e,
      R.radius, ax, ay, az, 0.88, 0.60, 0.12, 0);
  }
  // Overhead key: straight-down softbox above the car.
  const ek = R.intensity * 0.55 * 1.4;
  _studioBuf.push(cx, cy + R.h + 3, cz,
    R.color[0] * ek, R.color[1] * ek, R.color[2] * ek,
    R.radius, 0, -1, 0, 0.80, 0.45, 0.15, 0);
  return _studioBuf;
}
// ---------- sky / weather animation state ----------
// Continuously increasing render clock (seconds) fed to the sky shader each
// frame so clouds drift and stars twinkle even when the physics are frozen.
AX._skyT = 0;
// Lightning state: base ambient colours saved from applyRaceSettings(), current
// flash intensity, remaining flash bright time, and next-flash countdown.
AX._ltBase = null;           // { ambientSky, ambientGround } saved at race start
AX._ltFlash = 0;             // 0..1 current flash intensity (decays each frame)
AX._ltNextT = 0;             // seconds until the next lightning strike
AX._thunderT = -1;          // seconds until queued thunder fires (<0 = none)
// Cloud cover target for the current session: set once in applyRaceSettings()
// and held constant so the sky doesn't shift mid-race (only the shader animates).
AX._cloudBase = 0.4;
AX.shake = 0;          // 0..1 trauma; camera offset scales with shake²
AX.camRoll = 0;        // radians; lean into corners (decays back to 0)
AX.camCutT = 0;        // s; >0 just after a camera-mode cut → eased glide to the new vantage
AX.hitStop = 0;        // seconds of remaining sim slow-mo after a hard hit
AX.startHold = 0;      // randomised lights-out delay after the 5th light (F1-style)
AX.paused = false;
// Player racing-line assist, set by the pause-menu slider. -1..1: 0 = pure
// manual (default), >0 gently pulls toward the racing line through corners,
// <0 pushes the car wide. Always an added bias the driver can steer against.
AX.raceLineAssist = 0;
// Fixed tilt-authority gain, applied after Input.steer() when tilt is active so
// tilt steering is a touch gentler than keys/pad (it trims on top of the road-
// follow assist rather than throwing full lock). Sensitivity proper — how far you
// tilt for a given steer — is the single MAX_TILT knob in the Input module.
const TILT_OUTPUT_SCALE = 0.7;
// Debug/screenshot freeze: skip the simulation (physics + AI) but keep rendering,
// so the camera still settles to a parked view yet nothing moves — giving the
// visual-regression harness a deterministic frame. Only set by __apex.park().
AX.frozen = false;
// When set by __apex.sky(), overrides the normal chase-cam with a horizon-facing
// view so clouds and the sky gradient are visible in screenshots.
AX.skyViewOverride = null;
// Test-only steer/throttle/brake overrides (null = use real Input). Set via
// __apex.setInput() so Playwright tests can pump physics at deterministic dt.
AX._testInput = null;
AX.playerMods = { speed: 1, accel: 1, cornering: 1, braking: 1 };
AX.lastFrame = 0;
AX.announceT = 0;
AX.hudT = 0;
AX.minimapBg = null;         // offscreen canvas with pre-rendered track shape
AX.skidActive = 0;           // how many marks are live (grows to MAX_SKID then stays)
AX.skidIdx = 0;
AX.skidFrameT = 0;           // frame countdown between stamp placements

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
  AX.announceT = dur || 1.6;
}
function wrapS(s) { const L = AX.track.total; s %= L; return s < 0 ? s + L : s; }
// Render interpolation: blend a car's arc position between its previous and
// current fixed-physics-step values by the leftover-accumulator fraction, so
// motion stays smooth between steps (no judder on 120/144 Hz or uneven frames).
// Wrap-safe: takes the short way around the start/finish line.
function lerpS(prev, cur, a) {
  if (prev === undefined || a >= 1) return cur;
  const L = AX.track.total;
  let d = cur - prev;
  if (d > L * 0.5) d -= L; else if (d < -L * 0.5) d += L;
  return wrapS(prev + d * a);
}
AX._shadowSnapX = null; AX._shadowSnapZ = null;

// ---------- parts / player mods ----------
function getTeamParts(teamId) { return store.get("parts." + teamId, {}); }
function saveTeamParts(teamId, parts) { store.set("parts." + teamId, parts); }

function recomputePlayerMods() {
  const team = AX.player ? AX.player.team : Teams.LIST[AX.teamIdx];
  const stats = team.stats || { speed: 85, accel: 85, cornering: 85, braking: 85 };
  const mods = Parts.getMods(getTeamParts(team.id), team.engine);
  AX.playerMods = {
    speed:     Parts.statMult(stats.speed)     * mods.speed,
    accel:     Parts.statMult(stats.accel)     * mods.accel,
    cornering: Parts.statMult(stats.cornering) * mods.cornering,
    braking:   Parts.statMult(stats.braking)   * mods.braking,
  };
}

function smpHw(s) { Tracks.sample(AX.track, s, smp); return smp.hw; }


// ---------- race flow ----------

function startRace() {
  loadTrack(AX.trackIdx);
  makeCars();
  if (AX.timeTrial) {
    AX.cars = [AX.player];          // solo against the clock — no AI on track
    AX.lapsTarget = AX.raceLaps;
    const board = ttBoard(AX.track.def.id);
    AX.ttRecord = board.length ? board[0].t : Infinity;
    AX.ttNewRecord = false;
    AX.ttLaps = [];
    AX.ttSessionTs = Date.now();
  } else {
    AX.lapsTarget = AX.raceLaps;
  }
  applyRaceSettings();
  if (AX.raceWeather === "rain") {
    initRainDrops();
    AXWeather.setRainVisible(true);
  } else {
    AXWeather.setRainVisible(false);
  }
  gridUp();
  recomputePlayerMods();
  AX.resultT = 0;
  AX.camRoll = 0;
  AX.sectorIdx = 0; AX.sectorStartT = 0;
  AX.state = "count"; AX.countT = 0; AX.lightsLit = 0; AX.raceT = 0; AX.startHold = 0; AX.paused = false; AX.frozen = false; AX.skyViewOverride = null;
  AX.skidActive = 0; AX.skidIdx = 0; AX.skidFrameT = 0;
  els.overlay.hidden = true; els.select.hidden = true; els.results.hidden = true;
  els.hud.hidden = false; els.lights.hidden = false; els.pausebtn.hidden = false;
  if (els.btnCam) els.btnCam.hidden = false;
  els.soundbtn.hidden = true;   // sound is toggled from the pause menu during a race
  document.body.classList.add("in-race");
  for (const l of els.lights.children) l.classList.remove("on");
  showTouchControls(true);
  Input.calibrate();
  if (AX.soundOn) { GameAudio.startEngine(); GameAudio.startMusic(AX.trackIdx); }
  if (AX.soundOn && AX.raceWeather === "rain") GameAudio.startRain();
  updateHud(true);
}

function showTouchControls(show) {
  const t = show && Input.touchControlsNeeded();
  const manual = gearsManual();   // only ever true in tilt mode
  // GAS pedal whenever throttle is manual (tilt); auto-throttle (touch/button) hides it
  els.btnThrottle.hidden = !(t && !autoThrottle());
  els.btnBrake.hidden = !t;
  els.btnBoost.hidden = !t; els.btnOT.hidden = !t;
  els.shiftUp.hidden = !(t && manual);
  els.shiftDown.hidden = !(t && manual);
  const steerBtns = t && AX.steerMode === "buttons";
  els.btnSteerLeft.hidden = !steerBtns;
  els.btnSteerRight.hidden = !steerBtns;
  // manual mode => shifts take the right column, boost/OT move to centre (CSS).
  // button/touch modes => boost/OT pull in next to the steering thumb (CSS).
  document.body.classList.toggle("manual", manual);
  document.body.classList.toggle("steer-buttons", steerBtns);
  document.body.classList.toggle("steer-touch", t && AX.steerMode === "touch");
}

function endRace() {
  AX.state = "results";
  document.body.classList.remove("in-race");
  els.pausebtn.hidden = true;
  if (els.btnCam) els.btnCam.hidden = true;
  showTouchControls(false);
  GameAudio.stopEngine(); GameAudio.setSkid(0); GameAudio.stopRain();
  if (AX.soundOn) GameAudio.finish();
  if (AX.timeTrial) { buildTTResults(); els.results.hidden = false; return; }
  // classification: finished by time(+penalty), rest by progress
  const fin = AX.cars.filter((c) => c.finished).sort((a, b) => (a.finishT + a.penalty) - (b.finishT + b.penalty));
  const run = AX.cars.filter((c) => !c.finished).sort((a, b) => b.prog - a.prog);
  const order = fin.concat(run);
  order.forEach((c, i) => { c.finPos = i + 1; });
  if (AX.seasonMode) {
    order.forEach((c, i) => {
      const pts = Teams.POINTS[i] || 0;
      AX.season.pts[c.code] = (AX.season.pts[c.code] || 0) + pts;
      AX.season.teamPts[c.team.id] = (AX.season.teamPts[c.team.id] || 0) + pts;
    });
    AX.season.round++;
    store.set("season", AX.season);
  }
  AX.dbgCam = null;
  buildResults(order);
  els.results.hidden = false;
}

function buildResults(order) {
  els.resultsTable.textContent = "";
  els.resultsTitle.textContent = AX.seasonMode
    ? "ROUND " + AX.season.round + (AX.season.round > 1 ? "" : "") + " — " + AX.track.def.name
    : AX.track.def.name + " RESULT";
  order.forEach((c, i) => {
    const row = document.createElement("div");
    const podium = i === 0 ? " p1" : i === 1 ? " p2" : i === 2 ? " p3" : "";
    row.className = "res-row" + podium + (c.isPlayer ? " you" : "");
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
  if (AX.seasonMode) {
    // Driver championship (top 10)
    const head = document.createElement("div");
    head.style.cssText = "margin-top:14px;color:#e10600;font-weight:800;font-style:italic";
    head.textContent = "DRIVERS — AFTER ROUND " + AX.season.round;
    els.resultsTable.appendChild(head);
    const all = AX.cars.slice().sort((a, b) => (AX.season.pts[b.code] || 0) - (AX.season.pts[a.code] || 0)).slice(0, 10);
    all.forEach((c, i) => {
      const row = document.createElement("div");
      row.className = "res-row" + (c.isPlayer ? " you" : "");
      const pos = document.createElement("span"); pos.className = "res-pos"; pos.textContent = i + 1;
      const sw = document.createElement("span"); sw.className = "res-swatch"; sw.style.background = cssCol(c.team.color);
      const nm = document.createElement("span"); nm.className = "res-name"; nm.textContent = c.code + "  " + c.name;
      const pt = document.createElement("span"); pt.className = "res-pts"; pt.textContent = (AX.season.pts[c.code] || 0) + " pts";
      row.append(pos, sw, nm, pt);
      els.resultsTable.appendChild(row);
    });
    // Team championship (top 5)
    const tmHead = document.createElement("div");
    tmHead.style.cssText = "margin-top:10px;color:#e10600;font-weight:800;font-style:italic";
    tmHead.textContent = "CONSTRUCTORS";
    els.resultsTable.appendChild(tmHead);
    const tmList = Object.entries(AX.season.teamPts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    tmList.forEach(([teamId, pts], i) => {
      const team = Teams.LIST.find((t) => t.id === teamId) || { color: [0.5, 0.5, 0.5], name: teamId };
      const row = document.createElement("div");
      row.className = "res-row";
      const pos = document.createElement("span"); pos.className = "res-pos"; pos.textContent = i + 1;
      const sw = document.createElement("span"); sw.className = "res-swatch"; sw.style.background = cssCol(team.color);
      const nm = document.createElement("span"); nm.className = "res-name"; nm.textContent = team.name || teamId;
      const pt = document.createElement("span"); pt.className = "res-pts"; pt.textContent = pts + " pts";
      row.append(pos, sw, nm, pt);
      els.resultsTable.appendChild(row);
    });
    els.resNext.textContent = AX.season.round >= Tracks.LIST.length ? "FINISH SEASON" : "NEXT ROUND";
  } else {
    els.resNext.textContent = "RACE AGAIN";
  }
}

function buildTTResults() {
  els.resultsTable.textContent = "";
  els.resultsTitle.textContent = AX.track.def.name + " — TIME TRIAL";
  const best = AX.player.best;

  // headline: your best lap this session (green if it set a new track record)
  const head = document.createElement("div");
  head.className = "res-row you";
  head.style.fontSize = "18px";
  const hl = document.createElement("span"); hl.className = "res-name";
  hl.textContent = AX.ttNewRecord ? "★ NEW RECORD" : "YOUR BEST";
  const hv = document.createElement("span"); hv.className = "res-pts"; hv.style.width = "auto";
  hv.textContent = isFinite(best) ? fmtTime(best) : "-";
  head.append(hl, hv);
  els.resultsTable.appendChild(head);

  // Ghost delta row (shows gap to ghost best)
  if (Ghost.hasGhost() && isFinite(best)) {
    const ghostBest = Ghost.bestTime();
    if (isFinite(ghostBest)) {
      const delta = best - ghostBest;
      const gr = document.createElement("div");
      gr.className = "res-row";
      const gl = document.createElement("span"); gl.className = "res-name"; gl.textContent = "vs Ghost";
      const gv = document.createElement("span"); gv.className = "res-pts"; gv.style.width = "auto";
      gv.style.color = delta <= 0 ? "#a3e635" : "#e10600";
      gv.textContent = (delta >= 0 ? "+" : "") + delta.toFixed(3) + "s";
      gr.append(gl, gv);
      els.resultsTable.appendChild(gr);
    }
  }

  // leaderboard header
  const lbHead = document.createElement("div");
  lbHead.style.cssText = "margin-top:12px;color:#e10600;font-weight:800;font-style:italic";
  lbHead.textContent = "LEADERBOARD — " + AX.track.def.name;
  els.resultsTable.appendChild(lbHead);

  // top laps ever on this track, each tagged with the team + driver that set it.
  // Entries from this session (ts >= session start) are highlighted.
  const board = ttBoard(AX.track.def.id);
  board.forEach((e, i) => {
    const team = teamById(e.teamId);
    const row = document.createElement("div");
    row.className = "res-row" + (e.ts >= AX.ttSessionTs ? " you" : "");
    const pos = document.createElement("span"); pos.className = "res-pos"; pos.textContent = i + 1;
    const sw = document.createElement("span"); sw.className = "res-swatch";
    sw.style.background = cssCol(team ? team.color : [0.5, 0.5, 0.5]);
    const nm = document.createElement("span"); nm.className = "res-name";
    nm.textContent = e.code + "  " + e.name + (team ? "  · " + team.short : "");
    const pt = document.createElement("span"); pt.className = "res-pts"; pt.style.width = "auto";
    pt.textContent = fmtTime(e.t);
    row.append(pos, sw, nm, pt);
    els.resultsTable.appendChild(row);
  });

  // Ghost clear link
  if (Ghost.hasGhost()) {
    const clrRow = document.createElement("div");
    clrRow.style.cssText = "margin-top:10px;text-align:center";
    const clrBtn = document.createElement("button");
    clrBtn.style.cssText = "font-size:11px;padding:4px 10px;opacity:0.6";
    clrBtn.textContent = "✕ CLEAR GHOST";
    clrBtn.onclick = () => { Ghost.clear(AX.track.def.id); AX.ttRecord = Infinity; buildTTResults(); };
    clrRow.appendChild(clrBtn);
    els.resultsTable.appendChild(clrRow);
  }

  els.resNext.textContent = "TRY AGAIN";
}
function teamById(id) { return Teams.LIST.find((t) => t.id === id); }
function cssCol(c) { return "rgb(" + (c[0] * 255 | 0) + "," + (c[1] * 255 | 0) + "," + (c[2] * 255 | 0) + ")"; }

function quitToMenu() {
  AX.state = "menu"; AX.paused = false;
  document.body.classList.remove("in-race");
  els.hud.hidden = true; els.lights.hidden = true; els.pausebtn.hidden = true;
  if (els.btnCam) els.btnCam.hidden = true;
  els.pausemenu.hidden = true; els.results.hidden = true; els.announce.hidden = true;
  $("advanced").hidden = true; $("lighting").hidden = true;
  els.overlay.hidden = false;
  $("race-settings").hidden = true;
  AXWeather.setRainVisible(false);
  els.soundbtn.hidden = false;
  showTouchControls(false);
  GameAudio.stopEngine(); GameAudio.setSkid(0); GameAudio.stopRain();
  if (AX.soundOn) GameAudio.startMusic(-1);
  // Show standings button when an active season is in progress
  const hasSeason = AX.season && AX.season.round > 0 && AX.season.round < Tracks.LIST.length;
  $("mb-standings").hidden = !hasSeason;
}

function buildStandings() {
  const body = $("standings-body");
  body.textContent = "";
  if (!AX.season) return;
  const round = AX.season.round;
  $("standings-title").textContent = round >= Tracks.LIST.length
    ? "FINAL CHAMPIONSHIP" : "CHAMPIONSHIP — AFTER ROUND " + round + " / " + Tracks.LIST.length;

  // Driver standings — all cars sorted by pts
  const drHead = document.createElement("div");
  drHead.style.cssText = "color:#e10600;font-weight:800;font-style:italic;margin-bottom:6px";
  drHead.textContent = "DRIVERS";
  body.appendChild(drHead);

  const drList = Object.entries(AX.season.pts)
    .sort((a, b) => b[1] - a[1]);
  drList.forEach(([code, pts], i) => {
    const c = AX.cars.find((x) => x.code === code);
    const row = document.createElement("div");
    row.className = "res-row" + (c && c.isPlayer ? " you" : "");
    const pos = document.createElement("span"); pos.className = "res-pos"; pos.textContent = i + 1;
    const sw = document.createElement("span"); sw.className = "res-swatch";
    sw.style.background = c ? cssCol(c.team.color) : "#555";
    const nm = document.createElement("span"); nm.className = "res-name";
    nm.textContent = code + (c ? "  " + c.name : "");
    const pt = document.createElement("span"); pt.className = "res-pts"; pt.textContent = pts + " pts";
    row.append(pos, sw, nm, pt);
    body.appendChild(row);
  });

  // Team standings
  const tmHead = document.createElement("div");
  tmHead.style.cssText = "color:#e10600;font-weight:800;font-style:italic;margin:14px 0 6px";
  tmHead.textContent = "CONSTRUCTORS";
  body.appendChild(tmHead);

  const tmList = Object.entries(AX.season.teamPts)
    .sort((a, b) => b[1] - a[1]);
  tmList.forEach(([teamId, pts], i) => {
    const team = Teams.LIST.find((t) => t.id === teamId) || { color: [0.5, 0.5, 0.5], name: teamId };
    const row = document.createElement("div");
    row.className = "res-row";
    const pos = document.createElement("span"); pos.className = "res-pos"; pos.textContent = i + 1;
    const sw = document.createElement("span"); sw.className = "res-swatch";
    sw.style.background = cssCol(team.color);
    const nm = document.createElement("span"); nm.className = "res-name"; nm.textContent = team.name || teamId;
    const pt = document.createElement("span"); pt.className = "res-pts"; pt.textContent = pts + " pts";
    row.append(pos, sw, nm, pt);
    body.appendChild(row);
  });

  // Next round info
  if (round < Tracks.LIST.length) {
    const nextTrack = Tracks.LIST[round];
    const info = document.createElement("div");
    info.style.cssText = "margin-top:12px;font-size:12px;color:#9a9aa5;text-align:center";
    info.textContent = "NEXT: ROUND " + (round + 1) + " — " + nextTrack.name + " (" + nextTrack.gp + ")";
    body.appendChild(info);
  }
}

// ---------- main loop ----------
AX.physAcc = 0;                 // leftover sim time carried between frames
AX.renderAlpha = 1;             // leftover-step fraction (0..1) for render interpolation
// ── Adaptive-resolution governor ─────────────────────────────────────────────
// Holds framerate by scaling the 3D render resolution (GLX.setRenderScale) when
// frames run slow, restoring sharpness when there's headroom. Conservative:
// only downscales when clearly missing 60 fps (>19 ms EMA) so a healthy
// vsync-capped display never degrades; upscales slowly to avoid oscillation.
let _frameEMA = 16.7, _govT = 0, _govCool = 0, _autoRes = true;
function perfGovernor(dtMs) {
  if (!_autoRes) return;
  // Ignore huge spikes (tab resume, GC): they'd yank the scale.
  if (dtMs < 100) _frameEMA += (dtMs - _frameEMA) * 0.1;
  if (_govCool > 0) { _govCool--; return; }
  if (++_govT < 45) return;   // evaluate ~every 45 frames
  _govT = 0;
  const cur = GLX.getRenderScale ? GLX.getRenderScale() : 1;
  if (_frameEMA > 19 && cur > 0.5) {          // <~53 fps: drop resolution
    if (GLX.setRenderScale(cur - 0.1)) _govCool = 30;
  } else if (_frameEMA < 14 && cur < 1) {     // >~71 fps headroom: restore
    if (GLX.setRenderScale(Math.min(1, cur + 0.06))) _govCool = 30;
  }
}
const PHYS_DT = 1 / 60;          // fixed physics step
function tick(now) {
  requestAnimationFrame(tick);
  let dt = Math.min((now - AX.lastFrame) / 1000, 1 / 4);   // clamp big gaps (tab resume)
  const _dtMs = now - AX.lastFrame;
  AX.lastFrame = now;
  // Adaptive resolution: only govern while actively rendering a race.
  if (!AX.paused && (AX.state === "race" || AX.state === "count")) perfGovernor(_dtMs);
  Input.poll();   // refresh gamepad state once per frame (before the paused gate
                  // so the Start/Menu button can also un-pause)
  if (AX.paused) {
    // LIGHTING TUNER live preview: keep RENDERING (physics stays paused) while
    // the panel is open so every slider change shows on the held frame.
    if ((AX.state === "race" || AX.state === "count") && !$("lighting").hidden) render(Math.min(dt, 1 / 20));
    return;
  }
  if (AX.announceT > 0) { AX.announceT -= dt; if (AX.announceT <= 0) els.announce.hidden = true; }
  // hit-stop: slow the simulation to a crawl for a few frames after a hard
  // crash so the impact reads, but keep the camera (render) at full dt so the
  // shake still plays out.
  let simTime = dt;
  if (AX.hitStop > 0) { AX.hitStop = Math.max(0, AX.hitStop - dt); simTime = dt * 0.15; }
  // Fixed-step physics: advance the sim in constant 1/60 s chunks regardless of
  // the display framerate, so handling is identical on a 30 fps phone, a 120 fps
  // desktop, and a janky frame — a long frame can never enlarge the integration
  // step (which would change the slip/grip behaviour). Leftover time carries to
  // the next frame; cap the substeps so a stall can't trigger a spiral of death.
  if (!AX.frozen) {
    AX.physAcc += simTime;
    let steps = 0;
    while (AX.physAcc >= PHYS_DT && steps < 5) {
      // snapshot each car's pre-step arc/lateral position so render can interpolate
      // between the last two physics steps (snapshotting every step leaves rPrev*
      // holding the state just before the final step taken this frame).
      for (let i = 0; i < AX.cars.length; i++) { const c = AX.cars[i]; c.rPrevS = c.s; c.rPrevX = c.x; }
      update(PHYS_DT); AX.physAcc -= PHYS_DT; steps++;
    }
    if (steps === 5) AX.physAcc = 0;             // fell badly behind — drop the backlog
  }
  AX.renderAlpha = clamp(AX.physAcc / PHYS_DT, 0, 1);   // 0..1 leftover fraction for render interp
  render(Math.min(dt, 1 / 20));               // camera/visual damping at (clamped) frame dt
  if (AX.state === "race" || AX.state === "count") updateHud(false);
}

// ---------- boot ----------
// Inert in production; only attaches when a test harness pre-sets the flag.
if (typeof window !== "undefined" && window.__APEX_DEBUG) {
  window.__APEX = { cars: () => AX.cars, player: () => AX.player, state: () => AX.state, track: () => AX.track };
}

AXHud.init({ els, mm, fmtTime, cssCol });   // hand the HUD its DOM cache + helpers
AXWeather.init({ els, isWetRoad, isRaining, buildTrackLights, applyLightTune });
AXTrack.init({ smpHw, wrapS });
AXRender.init({ buildStudioRig, isStudioActive: () => !!_studioRig });
AXPhysics.init({ els, announce, endRace });
AXUi.init({ els, announce, buildStandings, cssCol, fmtTime, gearsManual,
  getTeamParts, hexToRgb, loadCustomTeam, quitToMenu, recomputePlayerMods,
  rgbToHex, saveTeamParts, showTouchControls, startRace, syncCustomTeam,
  LT, TUNE_DEFS, _ltStore, ltKey, setLightTune, persistLightTune, applyLightTune });
syncCustomTeam();   // inject "MY TEAM" so saved selections and chips resolve
if (AX.teamIdx < 0 || AX.teamIdx >= Teams.LIST.length) AX.teamIdx = 2;
if (AX.driverIdx < 0 || AX.driverIdx >= Teams.LIST[AX.teamIdx].drivers.length) AX.driverIdx = 0;
{ const hasSeason = AX.season && AX.season.round > 0 && AX.season.round < Tracks.LIST.length;
  $("mb-standings").hidden = !hasSeason; }
Input.init(canvas, { onPause: () => setPaused(!AX.paused) });
if (!Input.touchControlsNeeded()) { document.body.classList.add("desktop"); els.subtitle.textContent = "2026 grid · 24 real circuits"; }
Input.setSteerMode(AX.steerMode);
DataHub.init(els.datahub);
$("pm-steer").textContent = steerLabel();
$("pm-calib").hidden = AX.steerMode !== "tilt";
refreshGearsBtn();
setSound(AX.soundOn);
setMusic(AX.musicEnabled);
loadTrack(AX.trackIdx);
window.addEventListener("resize", () => GLX.resize());
AX.lastFrame = performance.now();
requestAnimationFrame(tick);

// --- debug / test hook (no effect unless explicitly called) ---
// Lets a test harness stage the camera anywhere on the track without having to
// drive there in real time (the software renderer used for screenshots is far
// too slow to reach distant corners). Examples, from page.evaluate:
//   __apex.park(0.25)              -> jump to 25% of the lap, field cleared, still
//   __apex.jump(0.5, 60, 2)        -> 50% of lap, 60 m/s, 2 m right of centre
window.__apex = {
  // place the player at fraction [0,1) of the lap; optional speed (m/s), x (m)
  jump(frac, speed, lateral) {
    if (!AX.player || !AX.track) return false;
    AX.player.s = wrapS(frac * AX.track.total);
    AX.player.prog = frac * AX.track.total;
    AX.player.angle = 0;   // teleport aligns the car with the track (deterministic)
    if (lateral !== undefined) AX.player.x = lateral;
    if (speed !== undefined) AX.player.speed = speed;
    // Reset the world-space physics state to the new (s, x), heading aligned with
    // the track tangent. Done immediately (not lazily) so the car is deterministic
    // and probe() reads a correct heading offset right after a teleport.
    Tracks.sample(AX.track, AX.player.s, smp);
    AX.player.px = smp.p[0] + smp.r[0] * AX.player.x;
    AX.player.pz = smp.p[2] + smp.r[2] * AX.player.x;
    AX.player.head = Math.atan2(smp.t[0], smp.t[2]);
    AX.player.vLat = 0; AX.player.yawRateCur = 0;
    // Sync render-interpolation anchors so lerpS(rPrevS, s, alpha) == s regardless
    // of renderAlpha — ensures the hood/cockpit camera is at exactly this position.
    AX.player.rPrevS = AX.player.s; AX.player.rPrevX = AX.player.x;
    return { s: AX.player.s, total: AX.track.total };
  },
  // skip the countdown straight into racing, shove the AI pack out of frame,
  // and park the (stationary) player at a fraction of the lap for a clean shot.
  park(frac, lateral) {
    if (!AX.player || !AX.track) return false;
    AX.skyViewOverride = null;   // clear any sky override so normal chase cam resumes
    AX.state = "race"; AX.raceT = Math.max(AX.raceT, 1);
    els.lights.hidden = true;
    for (const l of els.lights.children) l.classList.remove("on");
    AX.cars.forEach((c) => { if (!c.isPlayer) { c.prog -= 600; c.s = wrapS(c.s - 600); c.speed = 0; } });
    const r = this.jump(frac, 0, lateral !== undefined ? lateral : 0);
    AX.frozen = true;   // hold the scene still for a deterministic screenshot
    return r;
  },
  // Like park(), but orients the camera toward the horizon so clouds and sky
  // gradient are clearly visible. Eye sits 7 m above track; target is 25 m ahead
  // and 14 m higher — giving ~24° upward tilt, centred in the FOV-75 frustum.
  // Returns the same value as park(), or false when the track isn't loaded yet.
  sky(frac, lateral) {
    const r = this.park(frac, lateral);
    if (!r) return false;
    AX.dbgCam = null;   // sky uses skyViewOverride, which a live view()/orbit() free-cam would otherwise mask
    Tracks.sample(AX.track, AX.player.s, smp);
    // Stand low and aim STEEPLY up the road so the horizon drops to the lower third
    // and the frame fills with sky/clouds (was only ~15° up — barely any sky).
    const e = [smp.p[0], smp.p[1] + 3.5, smp.p[2]];
    const t = [
      smp.p[0] + smp.t[0] * 20,
      smp.p[1] + 34,            // ~58° up over 20 m → horizon low, sky dominant
      smp.p[2] + smp.t[2] * 20,
    ];
    AX.skyViewOverride = { eye: e, tgt: t, fov: 78 };
    // snap immediately so the very first rendered frame is correct
    AX.camEye[0] = e[0]; AX.camEye[1] = e[1]; AX.camEye[2] = e[2];
    AX.camTgt[0] = t[0]; AX.camTgt[1] = t[1]; AX.camTgt[2] = t[2];
    AX.camFov = 75;
    return r;
  },
  // Get or set the player camera mode (CHASE / FAR / COCKPIT / HOOD). Called with
  // no argument it returns the current mode; with a mode id ("cockpit"), label, or
  // index it switches and persists. Mirrors the in-game CAM button / C key.
  camera(m) {
    if (m == null) return { mode: CAM_MODES[AX.camMode].id, index: AX.camMode, modes: CAM_MODES.map((c) => c.id) };
    let i = typeof m === "number" ? m : CAM_MODES.findIndex((c) => c.id === String(m).toLowerCase());
    if (i < 0 || i >= CAM_MODES.length) return false;
    AX.dbgCam = null;   // switching to a game camera mode leaves any view() free-cam
    setCamMode(i);
    return { mode: CAM_MODES[AX.camMode].id, index: AX.camMode };
  },
  // Instantly snap the camera to the correct position for the current camera mode,
  // bypassing exponential damping. Call after park()/jump() so the very first
  // rendered frame shows a clean view. Handles every mode (cockpit/chase/heli/…)
  // via the shared camVantage() solver.
  snapCam() {
    if (!AX.player || !AX.track) return;
    AX.dbgCam = null;   // snapping the game camera leaves any view() free-cam override
    const bankCam = Tracks.banking(AX.track, AX.player.s, AX.player.x);
    const v = camVantage(CAM_MODES[AX.camMode].id, AX.player.s, AX.player.x, AX.player.speed, 0, {
      bankDy: bankCam ? bankCam.dy : 0, deploy: AX.player.deploying, slipLat: AX.player.vLat || 0,
    });
    AX.camEye[0] = v.eye[0]; AX.camEye[1] = v.eye[1]; AX.camEye[2] = v.eye[2];
    AX.camTgt[0] = v.tgt[0]; AX.camTgt[1] = v.tgt[1]; AX.camTgt[2] = v.tgt[2];
    AX.camFov = v.fov;
  },
  // previewCam(mode, frac, speed, lat) — set the debug free-cam to EXACTLY how the
  // in-game camera `mode` (any of camera().modes: chase/heli/drift/cinematic/…)
  // would frame the car at lap-fraction `frac`, doing `speed` m/s (default 60),
  // `lat` m off centre (default 0). Non-destructive: it only positions the debug
  // cam — the car isn't moved — so you can preview or screenshot any mode's framing
  // anywhere without driving there. Cleared by camera()/snapCam() like other debug
  // cams. Returns { eye, target, fov, mode }. e.g. previewCam("drift", 0.21, 65).
  previewCam(mode, frac = 0, speed = 60, lat = 0) {
    if (!AX.track) return false;
    const m = String(mode).toLowerCase();
    if (!CAM_MODES.some((c) => c.id === m)) return false;
    const s = (((frac % 1) + 1) % 1) * AX.track.total;
    const v = camVantage(m, s, lat, speed, 0, {});
    AX.dbgCam = { eye: v.eye.slice(), target: v.tgt.slice(), fov: v.fov, far: 6000 };
    return { eye: v.eye, target: v.tgt, fov: +v.fov.toFixed(1), mode: m };
  },
  // track reflects the ACTIVE race track — null at the menu/select even though a
  // track is loaded for the background flyby (matches the documented contract).
  info: () => ({ state: AX.state, track: (AX.state === "race" || AX.state === "count") ? (AX.track && AX.track.def.id) : null, n: AX.track && AX.track.n, total: AX.track && AX.track.total, timeTrial: AX.timeTrial, seasonMode: AX.seasonMode }),
  // Reports the camera ACTUALLY being rendered: the view() debug free-cam when
  // one is active, otherwise the game camera. `debug` flags which. (Previously
  // this always returned the game cam, masking an active view() override.)
  camState: () => AX.dbgCam
    ? { eye: Array.from(AX.dbgCam.eye), tgt: Array.from(AX.dbgCam.target), fov: AX.dbgCam.fov, debug: true }
    : { eye: Array.from(AX.camEye), tgt: Array.from(AX.camTgt), fov: AX.camFov, debug: false },
  // Debug: hide/show individual track meshes. e.g. meshToggle({props:true}) hides props.
  meshToggle(o) { AX.hideMeshes = Object.assign({}, AX.hideMeshes, o || {}); return AX.hideMeshes; },
  // Return all track nodes within radius r of world position (wx, wz).
  // Useful for finding self-intersecting sections and locating nearby geometry.
  nodesNear(wx, wz, r) {
    if (!AX.track) return [];
    const r2 = r * r, out = [];
    for (let i = 0; i < AX.track.n; i++) {
      const dx = AX.track.px[i] - wx, dz = AX.track.pz[i] - wz;
      if (dx * dx + dz * dz < r2)
        out.push({ i, frac: +(i / AX.track.n).toFixed(4), x: +AX.track.px[i].toFixed(2), y: +AX.track.py[i].toFixed(2), z: +AX.track.pz[i].toFixed(2) });
    }
    return out;
  },
  // World position and orientation of a track node by fraction (0-1).
  nodeAt(frac) {
    if (!AX.track) return null;
    const k = Math.round(frac * AX.track.n) % AX.track.n;
    return { k, frac: +(k / AX.track.n).toFixed(4), x: +AX.track.px[k].toFixed(3), y: +AX.track.py[k].toFixed(3), z: +AX.track.pz[k].toFixed(3), tx: +AX.track.tx[k].toFixed(3), tz: +AX.track.tz[k].toFixed(3), rx: +AX.track.rx[k].toFixed(3), rz: +AX.track.rz[k].toFixed(3) };
  },
  // Player telemetry for steering tests: lateral offset x (m, +=right of centre),
  // heading offset angle (rad, relative to track tangent), local curvature k
  // (rad/m, +=right turn), half-width hw (m), speed (m/s) and arc position s.
  probe() {
    if (!AX.player || !AX.track) return null;
    Tracks.sample(AX.track, AX.player.s, smp);
    // Heading offset = how far the car points off the track tangent, + = turned
    // right (toward +x). In world space head is subtracted from the tangent, so
    // (tangentAngle - head) recovers the same +right convention as the old model.
    let angle = 0;
    if (AX.player.head != null) {
      const tAng = Math.atan2(smp.t[0], smp.t[2]);
      angle = tAng - AX.player.head;
      while (angle > Math.PI) angle -= 2 * Math.PI;
      while (angle < -Math.PI) angle += 2 * Math.PI;
    }
    return {
      x: AX.player.x, angle,
      k: Tracks.curvature(AX.track, AX.player.s),
      hw: smp.hw,
      speed: AX.player.speed, s: AX.player.s,
    };
  },
  // Look-ahead road sampler for closed-loop driving (the autopilot harness):
  // curvature k (rad/m, +=right) and half-width hw at distAhead metres in front of
  // the player. Pass an array of distances to get one reading each, e.g. for
  // picking the sharpest corner inside a braking window. Pure read — no state change.
  scan(distAhead) {
    if (!AX.player || !AX.track) return null;
    const one = (d) => {
      const s = wrapS(AX.player.s + (d || 0));
      Tracks.sample(AX.track, s, smp);
      return { s, k: Tracks.curvature(AX.track, s), hw: smp.hw, slope: smp.t[1] || 0 };
    };
    return Array.isArray(distAhead) ? distAhead.map(one) : one(distAhead);
  },
  // Phase-1 migration check: take a track point (s, lateral), build its world
  // position the same way the renderer/physics do (centre + right*lateral), then
  // project that world point back with Tracks.project and report both, so a test
  // can verify the world<->(s,x) round-trip before we move physics to world space.
  projTest(frac, lateral) {
    if (!AX.track) return null;
    const s = wrapS((frac || 0) * AX.track.total);
    const lat = lateral || 0;
    Tracks.sample(AX.track, s, smp);
    const wx = smp.p[0] + smp.r[0] * lat;
    const wz = smp.p[2] + smp.r[2] * lat;
    const p = Tracks.project(AX.track, wx, wz, s);
    let ds = p.s - s; const L = AX.track.total;
    while (ds > L / 2) ds -= L; while (ds < -L / 2) ds += L;
    return { s, lat, world: [wx, wz], got: { s: p.s, lat: p.lat, dist: p.dist },
             err: { s: ds, lat: p.lat - lat } };
  },
  // Console health-check for the world-space migration.
  // Run window.__apex.wsInfo() while driving to see live position/heading.
  wsInfo() {
    if (!AX.player || AX.player.px == null) return "world-space not yet initialized";
    return { pos: [+AX.player.px.toFixed(1), +AX.player.pz.toFixed(1)],
             head: +(AX.player.head * 180 / Math.PI).toFixed(1) + "°",
             s: +AX.player.s.toFixed(1), x: +AX.player.x.toFixed(2) };
  },
  // Live values the steering sliders map to — for tests/diagnostics. Each slider
  // moving should move its value here (and the car's behaviour).
  tuning() {
    return {
      wheelbase: AXC.WHEELBASE,            // RESPONSE (shorter = snappier)
      expo: AXC.STEER_EXPO,                // LINEARITY
      maxSlip: AXC.STEER_MAX_SLIP,         // STEER LOCK
      speedRef: AXC.STEER_SPEED_REF,       // SPEED STEER (higher = sharper at speed)
      drift: AXC.DRIFT,                    // SLIDE (rear looseness)
      roadFollow: AXC.ROAD_FOLLOW,         // DRIVING HELP steer-assist gain
      playerGrip: AXC.PLAYER_GRIP,         // forgiveness headroom over AI grip
      frontGrip: AXC.FRONT_GRIP,           // front friction bias (understeer-safety)
      yawDamp: AXC.YAW_DAMP,               // yaw damping
      yawInertia: AXC.YAW_INERTIA,         // rotational-inertia scale (turn-in speed)
      pace: AXC.PACE,                      // OVERALL SPEED (player + AI)
      raceLineAssist: AX.raceLineAssist,                  // RACING LINE
      maxTilt: Input.maxTilt,          // TILT SENSITIVITY (deg for full lock)
      deadzone: Input.deadzone,        // fixed dead zone (deg) — no longer a slider
      tiltCutoff: Input.minCutoff,     // STEER SMOOTHING (One-Euro min-cutoff, Hz)
    };
  },
  // Richer player physics readout for drift/grip tests: world heading + the
  // lateral slip velocity and slip angle the tier-b model produces.
  physState() {
    if (!AX.player || AX.player.px == null) return null;
    const slip = Math.atan2(AX.player.vLat || 0, Math.max(1, AX.player.speed));
    Tracks.sample(AX.track, AX.player.s, smp);
    const axFrac = Math.min(1, Math.abs(AX.player.axEstSm ?? 0) / (LONG_GRIP * gripMult()));
    return {
      s: AX.player.s, x: AX.player.x, speed: AX.player.speed, prog: AX.player.prog,
      head: AX.player.head, vLat: AX.player.vLat || 0,
      slipDeg: slip * 180 / Math.PI, slope: smp.t[1] || 0,
      wrongWay: !!AX.player.wrongWay, rescueT: AX.player.rescueT || 0, lap: AX.player.lap,
      axEstSm: +(AX.player.axEstSm ?? 0).toFixed(2),
      axFrac: +axFrac.toFixed(3),
      slipFactor: +Math.sqrt(Math.max(0, 1 - axFrac * axFrac)).toFixed(3),
    };
  },
  // Driving-boundary stats for the current track (both sides, all nodes): the
  // tightest/widest lateral limit and the closest-to-the-edge any barrier sits.
  // For verifying every track keeps the car off the models and is recoverable.
  wallStats() {
    if (!AX.track || !AX.track.barR) return null;
    let minB = Infinity, maxB = -Infinity, minOverHw = Infinity, anyNaN = false;
    for (let k = 0; k < AX.track.n; k++) {
      const r = AX.track.barR[k], l = AX.track.barL[k];
      if (!Number.isFinite(r) || !Number.isFinite(l)) anyNaN = true;
      minB = Math.min(minB, r, l); maxB = Math.max(maxB, r, l);
      minOverHw = Math.min(minOverHw, r - AX.track.hw[k], l - AX.track.hw[k]);
    }
    return { minB, maxB, minOverHw, anyNaN, street: !!AX.track.street, n: AX.track.n };
  },
  // Largest amount any (non-finished) car is currently OUTSIDE its per-side
  // barrier — should stay ~0, proving nothing (player or AI) clips through a wall.
  maxWallOvershoot() {
    if (!AX.track || !AX.track.barR) return null;
    let m = 0;
    for (const c of AX.cars) {
      if (c.finished) continue;
      const wr = Tracks.wallAt(AX.track, c.s, 1), wl = Tracks.wallAt(AX.track, c.s, -1);
      m = Math.max(m, c.x - wr, -wl - c.x, 0);
    }
    return m;
  },
  // Set physics params directly (bypassing the sliders) for deterministic A/B
  // tests and on-device tuning. Any omitted field is left unchanged.
  setPhysics(o) {
    o = o || {};
    if (o.drift != null) AXC.DRIFT = o.drift;
    if (o.pace != null) AXC.PACE = o.pace;
    if (o.speedRef != null) AXC.STEER_SPEED_REF = o.speedRef;
    if (o.wheelbase != null) AXC.WHEELBASE = o.wheelbase;
    if (o.expo != null) AXC.STEER_EXPO = o.expo;
    if (o.maxSlip != null) AXC.STEER_MAX_SLIP = o.maxSlip;
    if (o.roadFollow != null) AXC.ROAD_FOLLOW = o.roadFollow;
    // core dynamic-model feel levers (swept by the emulation/tuning harness)
    if (o.playerGrip != null) AXC.PLAYER_GRIP = o.playerGrip;
    if (o.frontGrip != null) AXC.FRONT_GRIP = o.frontGrip;
    if (o.yawDamp != null) AXC.YAW_DAMP = o.yawDamp;
    if (o.yawInertia != null) AXC.YAW_INERTIA = o.yawInertia;
    // Tilt sliders (routed to the Input module): sensitivity (MAX_TILT, deg for
    // full lock), dead zone (deg) and smoothing (slew, units/s). Lets the tilt
    // tuner sweep them the same way as the handling params.
    if (o.maxTilt != null) Input.setTiltSensitivity(o.maxTilt);
    if (o.deadzone != null) Input.setTiltDeadzone(o.deadzone);
    if (o.tiltCutoff != null) Input.setTiltSmoothing(o.tiltCutoff);
    return this.tuning();
  },

  // setSpeed(v) — instantly set the player's forward speed (m/s, clamped 0–200).
  // Handy for scripted scenarios: drive into a corner at a specific entry speed,
  // test overspeed physics, or freeze the car for a screenshot without cutting
  // the throttle (which would coast). Does not affect heading or yaw rate.
  setSpeed(v) {
    if (!AX.player || AX.player.px == null) return false;
    AX.player.speed = Math.max(0, Math.min(200, v));
    return { speed: AX.player.speed };
  },

  // spin(deg) — add a heading offset to the player (degrees, +CW viewed from above).
  // Simulates a snap-oversteer or a scripted orientation change. Zeroes lateral
  // velocity and yaw rate after rotating so the car doesn't immediately un-spin.
  // Use spin(180) to face the wrong way, spin(-45) for a 45° drift setup.
  spin(deg) {
    if (!AX.player || AX.player.px == null) return false;
    AX.player.head = AX.player.head + deg * Math.PI / 180;
    AX.player.vLat = 0;
    AX.player.yawRateCur = 0;
    return { head: +(AX.player.head * 180 / Math.PI).toFixed(1) + "°" };
  },

  // nudge(dLat, dSpeed) — add an instantaneous lateral impulse (m/s, +right of
  // travel) and/or a forward speed delta (m/s).  Good for scripted track
  // position tests: push the car toward a barrier, simulate a kerb hop, or give
  // a standing-start bump without calling jump().  Both args default to 0.
  nudge(dLat = 0, dSpeed = 0) {
    if (!AX.player || AX.player.px == null) return false;
    if (dLat)   AX.player.vLat  = (AX.player.vLat || 0) + dLat;
    if (dSpeed) AX.player.speed = Math.max(0, (AX.player.speed || 0) + dSpeed);
    return { speed: +(AX.player.speed || 0).toFixed(2), vLat: +(AX.player.vLat || 0).toFixed(2) };
  },

  // Debug free camera for surveying track layouts/scenery — look at anything.
  // Call with no args (or "chase") to restore the chase cam. Option forms:
  //   {}                                       aerial of the whole track
  //   { s, radius }                            focus a lap-fraction s
  //   { azimuth, elevation, zoom, fov, fog }   aerial/focus framing (degrees)
  //   { s, side, dist, height, look }          stand TRACKSIDE at s, look outward
  //                                            (side "L"/"R"/±1; look:"in" faces track)
  //   { eye:[x,y,z], yaw, pitch, fov }         free-look from a point (degrees)
  //   { eye:[x,y,z], target:[x,y,z], fov }     fully explicit
  // Returns the resolved {eye, target, ...}.
  view(opts) {
    if (!AX.track) return false;
    // Only an explicit "chase" restores the game camera. view() with NO args is the
    // documented whole-track aerial — fall through to the bbox branch below (it was
    // wrongly short-circuiting to chase, so view() framed the road instead).
    if (opts === "chase" || (opts && opts.mode === "chase")) { AX.dbgCam = null; return { mode: "chase" }; }
    opts = opts || {};
    // free-look: explicit eye, aimed by yaw (0 = -Z, +90 = +X) and pitch (deg)
    if (opts.eye && (opts.yaw != null || opts.pitch != null)) {
      const yaw = (opts.yaw || 0) * Math.PI / 180, pit = Math.min(80, Math.max(-80, opts.pitch || 0)) * Math.PI / 180;
      const d = [Math.sin(yaw) * Math.cos(pit), Math.sin(pit), -Math.cos(yaw) * Math.cos(pit)];
      const e = opts.eye;
      AX.dbgCam = { eye: e.slice(), target: [e[0] + d[0] * 100, e[1] + d[1] * 100, e[2] + d[2] * 100], fov: Math.min(170, Math.max(1, opts.fov || 60)), far: opts.far || 6000, fog: opts.fog };
      return { eye: e.slice(), yaw: opts.yaw || 0, pitch: opts.pitch || 0 };
    }
    if (opts.eye && opts.target) {
      AX.dbgCam = { eye: opts.eye.slice(), target: opts.target.slice(), fov: Math.min(170, Math.max(1, opts.fov || 60)), far: opts.far || 6000, fog: opts.fog };
      return AX.dbgCam;
    }
    // trackside survey: stand beside the track at fraction s, look out at the
    // scenery on `side` (or back at the track with look:"in")
    if (opts.s != null && opts.side != null) {
      Tracks.sample(AX.track, opts.s * AX.track.total, smp);
      const side = opts.side === "L" ? -1 : opts.side === "R" ? 1 : (opts.side || 1);
      const dist = opts.dist != null ? opts.dist : 14, height = opts.height != null ? opts.height : 9;
      const p = smp.p, r = smp.r;
      const eye = [p[0] + r[0] * side * dist, p[1] + height, p[2] + r[2] * side * dist];
      const target = opts.look === "in"
        ? [p[0], p[1] + 1, p[2]]
        : [p[0] + r[0] * side * (dist + 80), p[1] + height * 0.4, p[2] + r[2] * side * (dist + 80)];
      AX.dbgCam = { eye, target, fov: Math.min(170, Math.max(1, opts.fov || 62)), far: opts.far || 6000, fog: opts.fog };
      return { eye, target };
    }
    // centre + span: a focus point at lap-fraction s, or the whole-track bbox
    let cx, cy, cz, span;
    if (opts.s != null) {
      Tracks.sample(AX.track, opts.s * AX.track.total, smp);
      cx = smp.p[0]; cy = smp.p[1]; cz = smp.p[2];
      span = Math.max(10, opts.radius || 180);
    } else {
      let nx = Infinity, xx = -Infinity, nz = Infinity, xz = -Infinity, ny = Infinity, xy = -Infinity;
      for (let i = 0; i < AX.track.n; i++) {
        const x = AX.track.px[i], z = AX.track.pz[i], y = AX.track.py[i];
        if (x < nx) nx = x; if (x > xx) xx = x; if (z < nz) nz = z; if (z > xz) xz = z;
        if (y < ny) ny = y; if (y > xy) xy = y;
      }
      cx = (nx + xx) / 2; cy = (ny + xy) / 2; cz = (nz + xz) / 2;
      span = Math.max(xx - nx, xz - nz);
    }
    const az = (opts.azimuth != null ? opts.azimuth : 35) * Math.PI / 180;
    const el = Math.min(85, Math.max(5, opts.elevation != null ? opts.elevation : 55)) * Math.PI / 180;
    const dist = span * (opts.zoom != null ? opts.zoom : 1.0) * 0.95 + 60;
    const eye = [
      cx + Math.cos(el) * Math.sin(az) * dist,
      cy + Math.sin(el) * dist,
      cz + Math.cos(el) * Math.cos(az) * dist,
    ];
    AX.dbgCam = { eye, target: [cx, cy, cz], fov: Math.min(170, Math.max(1, opts.fov || 55)), far: Math.max(6000, dist * 4), fog: opts.fog };
    return { eye, target: [cx, cy, cz], span: Math.round(span) };
  },
  // Place the debug free-cam at a track-relative point and aim it at another —
  // far easier than hand-computing world coords for view({eye,target}). The eye
  // sits at lap-fraction `f`, `lat` m off the centreline (+right), `h` m up; it
  // looks at lap-fraction `lookF` (default f+0.01), `lookLat` off centre, `lookH`
  // up (default 1). Ideal for inspecting roadside geometry — verges, barriers,
  // berms — at eye level. e.g. eyeAt(0.116, 0, 2.5) ≈ a driver's-eye look ahead;
  // eyeAt(0.116, 40, 3, 0.116, 0) stands out in the scenery looking back at the
  // track edge.
  eyeAt(f, lat = 0, h = 2.5, lookF, lookLat = 0, lookH = 1) {
    if (!AX.track) return false;
    Tracks.sample(AX.track, ((f % 1) + 1) % 1 * AX.track.total, smp);
    const eye = [smp.p[0] + smp.r[0] * lat, smp.p[1] + h, smp.p[2] + smp.r[2] * lat];
    const lf = lookF == null ? f + 0.01 : lookF;
    Tracks.sample(AX.track, ((lf % 1) + 1) % 1 * AX.track.total, smp2);
    const tgt = [smp2.p[0] + smp2.r[0] * lookLat, smp2.p[1] + lookH, smp2.p[2] + smp2.r[2] * lookLat];
    AX.dbgCam = { eye, target: tgt, fov: 60, far: 6000 };
    return { eye, target: tgt };
  },
  // Orbit the debug free-cam around a track point at lap-fraction `f`: `az`
  // degrees around (0 = looking from +s/ahead), `el` degrees elevation, `dist` m
  // out, aimed `h` m above the point. Sweep `az` to inspect a spot (a prop, a
  // berm, a suspected gap) from every side without per-shot coord math.
  orbit(f, az = 35, el = 18, dist = 30, h = 1.5, opts = {}) {
    if (!AX.track) return false;
    Tracks.sample(AX.track, ((f % 1) + 1) % 1 * AX.track.total, smp);
    const cx = smp.p[0], cy = smp.p[1] + h, cz = smp.p[2];
    const a = az * Math.PI / 180, e = Math.min(85, Math.max(-30, el)) * Math.PI / 180;
    // basis: track tangent = "ahead", right = smp.r
    const fwd = [smp.t[0], 0, smp.t[2]], rt = [smp.r[0], 0, smp.r[2]];
    const dir = [Math.cos(a) * fwd[0] + Math.sin(a) * rt[0], 0, Math.cos(a) * fwd[2] + Math.sin(a) * rt[2]];
    const eye = [cx + dir[0] * Math.cos(e) * dist, cy + Math.sin(e) * dist, cz + dir[2] * Math.cos(e) * dist];
    // Never let a low/negative elevation sink the eye under the ground (which
    // renders the track's underside through the terrain). Floor it just above road.
    eye[1] = Math.max(eye[1], smp.p[1] + 1.2);
    const fov = Math.min(170, Math.max(1, opts.fov != null ? opts.fov : 55));
    AX.dbgCam = { eye, target: [cx, cy, cz], fov, far: opts.far || 6000, fog: opts.fog };
    return { eye, target: [cx, cy, cz], fov };
  },

  // cinematic(frac, opts) — auto outside-of-corner camera.  Reads the local track
  // curvature to put the camera on the outside of the bend so the car fills the
  // frame naturally.  Straight sections use a three-quarter chase angle.
  //   opts.dist  (default 60)   orbit radius
  //   opts.el    (default 18)   elevation degrees
  //   opts.h     (default 1.5)  look-at height above road
  //   opts.fov   (default 52)   field of view degrees
  //   opts.azOff (default 0)    extra azimuth twist on top of auto angle
  // Returns the same {eye, target, fov, az} object as orbit() plus the curvature k.
  cinematic(frac, opts = {}) {
    if (!AX.track) return false;
    const fr = ((frac % 1) + 1) % 1;
    const k = Tracks.curvature(AX.track, fr * AX.track.total);
    // Outside of a right-hand (k>0) corner is the left side → az negative (cam left)
    // Outside of a left-hand (k<0) corner is the right side → az positive (cam right)
    // Strength scales with |k| up to a tight-hairpin cap so the angle doesn't over-rotate.
    const kAbs = Math.min(Math.abs(k), 0.05);
    const baseAz = k === 0 ? 35 : -(Math.sign(k)) * (70 + 40 * kAbs / 0.05);
    const az = baseAz + (opts.azOff || 0);
    const dist = opts.dist != null ? opts.dist : 60;
    const el   = opts.el   != null ? opts.el   : 18;
    const h    = opts.h    != null ? opts.h    : 1.5;
    const fov  = opts.fov  != null ? opts.fov  : 52;
    const res  = this.orbit(fr, az, el, dist, h, { fov, far: opts.far, fog: opts.fog });
    return res ? Object.assign(res, { az: +az.toFixed(1), k: +k.toFixed(5) }) : false;
  },

  // carOrbit(idx, az, el, dist, h, opts) — orbit the debug free-cam around any
  // car on the grid (0 = player).  `idx` indexes the same array as __apex.cars().
  // az/el/dist/h/opts are identical to orbit() but the basis is the car's own
  // heading rather than the track tangent, so az=0 is always behind the car,
  // az=180 is head-on.  Returns {eye, target, fov, carIdx, speed}.
  // studio(opts?) — summon a studio light rig around the player car for paint /
  // reflection inspection on any track at any time of day. Follows the car.
  //   studio()                         → default 6-lamp ring + overhead key
  //   studio({ n, dist, h, intensity, color: [r,g,b], radius, spin })
  //   studio(false)                    → off (session lamps restored)
  // Pair with carOrbit(0, az, el, 4) to walk around the lit car.
  studio(arg = true) {
    if (arg === false || arg === 0) {
      if (_studioRig && _studioRig._ambStash) {   // restore the session ambient
        AX.frame.ambientSky = _studioRig._ambStash[0];
        AX.frame.ambientGround = _studioRig._ambStash[1];
      }
      _studioRig = null;
      return false;
    }
    const o = typeof arg === "object" && arg ? arg : {};
    if (_studioRig && _studioRig._ambStash) {     // re-config: restore before re-stash
      AX.frame.ambientSky = _studioRig._ambStash[0];
      AX.frame.ambientGround = _studioRig._ambStash[1];
    }
    _studioRig = {
      n: o.n || 6, dist: o.dist || 7, h: o.h != null ? o.h : 4.5,
      intensity: o.intensity != null ? o.intensity : 1.6,
      color: o.color || [1, 1, 1], radius: o.radius || 18, spin: o.spin || 0,
      fill: o.fill != null ? o.fill : 0.5,
    };
    // FILL: lift the scene ambient toward a neutral studio level while the rig
    // is up — at night the ambient is near-black and an unlit car body reads as
    // a silhouette no matter how many rig lamps hit it. Stashed + restored by
    // studio(false). (setTimeOfDay() while active rebuilds ambient — call
    // studio() again after switching time of day.)
    const f = _studioRig.fill;
    if (f > 0) {
      _studioRig._ambStash = [AX.frame.ambientSky, AX.frame.ambientGround];
      const mixv = (a, b) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
      AX.frame.ambientSky = mixv(AX.frame.ambientSky || [0, 0, 0], [0.30, 0.31, 0.35]);
      AX.frame.ambientGround = mixv(AX.frame.ambientGround || [0, 0, 0], [0.20, 0.19, 0.18]);
    }
    return _studioRig;
  },
  carOrbit(idx = 0, az = 180, el = 14, dist = 25, h = 1.0, opts = {}) {
    // idx 0 (or negative) = THE PLAYER, as documented — cars[] is built in
    // team-list order, so raw index 0 is actually a Mercedes AI; orbiting it
    // while the player parks elsewhere framed the wrong car entirely.
    if (!AX.track || !AX.cars || !AX.cars.length) return false;
    const c = (idx <= 0 || !AX.cars[idx]) ? (AX.player || AX.cars[0]) : AX.cars[idx];
    if (!c) return false;
    // Derive world position from Frenet coords (s, x) — AI cars don't carry px/pz,
    // only the player does. This works for all cars.
    const s = ((c.s % AX.track.total) + AX.track.total) % AX.track.total;
    Tracks.sample(AX.track, s, smp);
    const cx = (c.isPlayer && c.px != null) ? c.px : smp.p[0] + smp.r[0] * (c.x || 0);
    const cz = (c.isPlayer && c.pz != null) ? c.pz : smp.p[2] + smp.r[2] * (c.x || 0);
    const cyf = smp.p[1] + h;
    // Heading basis: player has a real yaw (c.head); AI cars use the track tangent.
    const hd = (c.isPlayer && c.head != null) ? c.head : Math.atan2(smp.t[0], smp.t[2]);
    const fwdX = Math.sin(hd), fwdZ = Math.cos(hd);
    const rtX  = Math.cos(hd), rtZ  = -Math.sin(hd);
    const a = az * Math.PI / 180, e = Math.min(85, Math.max(-30, el)) * Math.PI / 180;
    // az 0 = camera BEHIND the car (eye along -forward), az 180 = head-on,
    // az 90 = off the car's right side — matches the documented convention
    // (the pre-fix implementation had az 0 ahead of the car).
    const dir = [-Math.cos(a) * fwdX + Math.sin(a) * rtX, 0, -Math.cos(a) * fwdZ + Math.sin(a) * rtZ];
    const eye = [cx + dir[0] * Math.cos(e) * dist, cyf + Math.sin(e) * dist, cz + dir[2] * Math.cos(e) * dist];
    eye[1] = Math.max(eye[1], smp.p[1] + 1.2);   // keep the eye above ground (see orbit)
    const fov = Math.min(170, Math.max(1, opts.fov != null ? opts.fov : 55));
    AX.dbgCam = { eye, target: [cx, cyf, cz], fov, far: opts.far || 4000, fog: opts.fog };
    return { eye, target: [cx, cyf, cz], fov, carIdx: idx, speed: +(c.speed || 0).toFixed(1) };
  },
  // dolly(f, fwd, right, up, opts) — place the debug free-cam at a track-relative
  // offset from the centreline at fraction f: `fwd` m along the track tangent
  // (negative = behind), `right` m across (+right of travel), `up` m above the road
  // surface. Looks toward opts.lookF (default f+0.015) at opts.lookLat m off centre
  // (default 0) and opts.lookH m up (default 1.5). opts.fov (default 58).
  // Example: dolly(0.22, -25, 18, 4) — 25 m behind Casino entry, 18 m to the right,
  // 4 m up, looking forward toward the corner apex.
  dolly(f, fwd = 0, right = 0, up = 5, opts = {}) {
    if (!AX.track) return false;
    const fr = ((f % 1) + 1) % 1;
    Tracks.sample(AX.track, fr * AX.track.total, smp);
    const p = smp.p, t = smp.t, r = smp.r;
    const eye = [
      p[0] + t[0] * fwd + r[0] * right,
      p[1] + up,
      p[2] + t[2] * fwd + r[2] * right,
    ];
    const lf = ((((opts.lookF != null ? opts.lookF : f + 0.015) % 1) + 1) % 1);
    Tracks.sample(AX.track, lf * AX.track.total, smp2);
    const lr = opts.lookLat || 0, lh = opts.lookH != null ? opts.lookH : 1.5;
    const tgt = [smp2.p[0] + smp2.r[0] * lr, smp2.p[1] + lh, smp2.p[2] + smp2.r[2] * lr];
    AX.dbgCam = { eye, target: tgt, fov: Math.min(170, Math.max(1, opts.fov || 58)), far: opts.far || 6000, fog: opts.fog };
    return { eye, target: tgt };
  },

  // roadside(f, side, dist, h, opts) — camera standing beside the track at
  // fraction f, `dist` m from the centreline on `side` (+1 = right of travel,
  // -1 = left), `h` m above the road surface. opts.look controls aim:
  //   "fwd"  (default) — look forward in direction of travel
  //   "back"           — face oncoming traffic
  //   "in"             — look inward across the track
  //   "out"            — look outward into the scenery
  // opts.lookAhead: m ahead (or behind for "back") of the eye position that the
  //   camera aims at along the track (default 30). opts.fov (default 58).
  // Example: roadside(0.33, -1, 6, 2, { look:"in" }) — stand 6 m left of the
  // hairpin entry, 2 m up, looking across at the Armco.
  roadside(f, side = 1, dist = 10, h = 2.5, opts = {}) {
    if (!AX.track) return false;
    const fr = ((f % 1) + 1) % 1;
    Tracks.sample(AX.track, fr * AX.track.total, smp);
    const p = smp.p, t = smp.t, r = smp.r;
    const eye = [p[0] + r[0] * side * dist, p[1] + h, p[2] + r[2] * side * dist];
    const la = opts.lookAhead != null ? opts.lookAhead : 30;
    const look = opts.look || "fwd";
    let tgt;
    if (look === "in") {
      tgt = [p[0] - r[0] * side * dist * 0.5, p[1] + 1, p[2] - r[2] * side * dist * 0.5];
    } else if (look === "out") {
      tgt = [p[0] + r[0] * side * (dist + 60), p[1] + h * 0.6, p[2] + r[2] * side * (dist + 60)];
    } else {
      const sign = look === "back" ? -1 : 1;
      const lf = ((fr + sign * la / AX.track.total % 1) + 1) % 1;
      Tracks.sample(AX.track, lf * AX.track.total, smp2);
      tgt = [smp2.p[0], smp2.p[1] + 1, smp2.p[2]];
    }
    AX.dbgCam = { eye, target: tgt, fov: Math.min(170, Math.max(1, opts.fov || 58)), far: opts.far || 6000, fog: opts.fog };
    return { eye, target: tgt, look };
  },

  // tourShots(n, opts) — returns n orbit shot descriptors covering the circuit,
  // ready to pass straight to orbit(). Each entry: { frac, az, el, dist, label }.
  // opts.dist (default 80), opts.el (default 20), opts.azOffset (default 35)
  // rotates all azimuths by a fixed angle — useful to swing every shot to one side
  // to face a specific stand or feature.
  // opts.atCorners: true → place the shots ON the detected corner apexes (not even
  //   spacing) and frame each from the OUTSIDE of the bend, so a tour reads like a
  //   broadcast corner-by-corner rather than arbitrary slices. `n` then caps how
  //   many corners (sharpest first, replayed in lap order); omit n for all of them.
  // Example: for (const s of __apex.tourShots(16)) __apex.orbit(s.frac, s.az, s.el, s.dist)
  tourShots(n = 12, opts = {}) {
    if (!AX.track) return [];
    const dist    = opts.dist     != null ? opts.dist     : 80;
    const el      = opts.el       != null ? opts.el       : 20;
    const azOff   = opts.azOffset != null ? opts.azOffset : 35;
    const shots   = [];
    if (opts.atCorners) {
      // Detect apexes (local curvature maxima) and frame each from the outside.
      const tn = AX.track.n, total = AX.track.total, kv = [];
      for (let k = 0; k < tn; k++) kv.push(Tracks.curvature(AX.track, k / tn * total));
      let apex = [];
      for (let k = 0; k < tn; k++) {
        const a = (k - 1 + tn) % tn, b = (k + 1) % tn, ak = Math.abs(kv[k]);
        if (ak > 0.006 && ak >= Math.abs(kv[a]) && ak > Math.abs(kv[b])) apex.push({ k, ak });
      }
      apex.sort((p, q) => q.ak - p.ak);               // sharpest first
      if (n && apex.length > n) apex = apex.slice(0, n);
      apex.sort((p, q) => p.k - q.k);                 // then back into lap order
      apex.forEach((c, i) => {
        const k = kv[c.k];
        // Outside of a right-hander (k>0) is camera-left (az<0); left-hander → az>0.
        // Auto-angle ignores azOffset (the corner geometry dictates the side).
        const az = -(Math.sign(k)) * (70 + 40 * Math.min(Math.abs(k), 0.05) / 0.05);
        shots.push({ frac: +(c.k / tn).toFixed(4), az: +az.toFixed(1), el, dist, label: `corner-${String(i + 1).padStart(2, "0")}` });
      });
      return shots;
    }
    for (let i = 0; i < n; i++) {
      const frac = i / n;
      // Alternate azimuth side each shot so consecutive frames show the track
      // from opposite sides — avoids monotonous single-angle tours.
      const side  = i % 2 === 0 ? 1 : -1;
      const az    = azOff * side;
      shots.push({ frac: +frac.toFixed(4), az, el, dist, label: `shot-${String(i).padStart(2, "0")}` });
    }
    return shots;
  },

  // Ground/gap probe: the rendered terrain height at a track-relative point
  // (lap-fraction `f`, `lat` m off centre), plus the road surface height and the
  // gap between them. `terrainY` is null if no terrain covers the point. Use it
  // to find where the carved terrain leaves a prop floating: compare a barrier's
  // base height (≈ road grade + groundYAt) against terrainY just under it.
  groundY(f, lat = 0) {
    if (!AX.track) return false;
    Tracks.sample(AX.track, ((f % 1) + 1) % 1 * AX.track.total, smp);
    const x = smp.p[0] + smp.r[0] * lat, z = smp.p[2] + smp.r[2] * lat;
    const ty = Tracks.terrainY(AX.track, x, z);
    return { x: +x.toFixed(2), z: +z.toFixed(2), roadY: +smp.p[1].toFixed(3), terrainY: ty == null ? null : +ty.toFixed(3), gap: ty == null ? null : +(ty - smp.p[1]).toFixed(3) };
  },
  // Controlled side-by-side test: race state, two AI cars placed dead-even at a
  // mid-track straight with overlapping lateral positions and equal speed; every
  // other car (incl. the player) is shoved far away. Returns the two test ids.
  // Lets a harness measure pure side-by-side jitter without pack chaos.
  pair(frac, speed) {
    if (!AX.track) return false;
    AX.state = "race"; AX.raceT = Math.max(AX.raceT, 1);
    els.lights.hidden = true;
    for (const l of els.lights.children) l.classList.remove("on");
    const f = frac == null ? 0.3 : frac, v = speed == null ? 55 : speed;
    const prog = f * AX.track.total, s = wrapS(prog);
    const ai = AX.cars.filter((c) => !c.isPlayer);
    const a = ai[0], b = ai[1];
    [a, b].forEach((c, i) => {
      c.prog = prog; c.s = s; c.speed = v;
      c.x = i === 0 ? 0.6 : -0.6;   // overlap within the ~2 m car width
      c.xVis = c.x; c.lap = 0; c.finished = false;
    });
    AX.cars.forEach((c) => { if (c !== a && c !== b) { c.prog -= 800; c.s = wrapS(c.s - 800); } });
    return { a: AX.cars.indexOf(a), b: AX.cars.indexOf(b) };
  },
  // Deliberate jam: pile N AI cars on top of each other at near-zero speed at a
  // mid-track point, rest of field shoved away. Used to test stuck-recovery —
  // a healthy AI should dig out and resume speed within a couple of seconds.
  jam(n) {
    if (!AX.track) return false;
    AX.state = "race"; AX.raceT = Math.max(AX.raceT, 1);
    els.lights.hidden = true;
    for (const l of els.lights.children) l.classList.remove("on");
    const ai = AX.cars.filter((c) => !c.isPlayer), m = Math.min(n || 5, ai.length);
    const prog = 0.5 * AX.track.total;
    const ids = [];
    ai.forEach((c, i) => {
      if (i < m) {
        c.prog = prog + (i - m / 2) * 0.4;     // tightly stacked longitudinally
        c.s = wrapS(c.prog); c.speed = 2; c.x = (i - m / 2) * 0.3;  // and laterally
        c.xVis = c.x; c.lap = 0; c.finished = false; c.stuckT = 0;
        ids.push(AX.cars.indexOf(c));
      } else { c.prog -= 800; c.s = wrapS(c.s - 800); }
    });
    AX.cars.forEach((c) => { if (c.isPlayer) { c.prog -= 800; c.s = wrapS(c.s - 800); } });
    return ids;
  },
  // Place ONE AI rival relative to the player for driver-vs-AI collision tests:
  // dProg metres ahead(+)/behind(−), dx metres to the right(+), matching the
  // player's speed. All other AI are shoved away so only this pair interacts.
  rival(dProg, dx) {
    if (!AX.player || !AX.track) return false;
    const ai = AX.cars.find((c) => !c.isPlayer);
    if (!ai) return false;
    ai.prog = AX.player.prog + (dProg || 0);
    ai.s = wrapS(AX.player.s + (dProg || 0));
    ai.x = AX.player.x + (dx || 0);
    ai.xVis = ai.x; ai.speed = AX.player.speed; ai.finished = false; ai.lap = AX.player.lap;
    AX.cars.forEach((c) => { if (c !== ai && !c.isPlayer) { c.prog -= 800; c.s = wrapS(c.s - 800); } });
    return { rival: AX.cars.indexOf(ai) };
  },
  // Place several AI rivals relative to the player for multi-car collision tests:
  // list = [{ dProg, dx, speed }]. Unused AI are shoved far away. Returns indices.
  rivals(list) {
    if (!AX.player || !AX.track) return false;
    const ai = AX.cars.filter((c) => !c.isPlayer);
    const used = [];
    (list || []).forEach((spec, i) => {
      const c = ai[i];
      if (!c) return;
      c.prog = AX.player.prog + (spec.dProg || 0);
      c.s = wrapS(AX.player.s + (spec.dProg || 0));
      c.x = AX.player.x + (spec.dx || 0);
      c.xVis = c.x; c.speed = spec.speed != null ? spec.speed : AX.player.speed;
      c.finished = false; c.lap = AX.player.lap;
      used.push(c);
    });
    ai.forEach((c) => { if (!used.includes(c)) { c.prog -= 800; c.s = wrapS(c.s - 800); } });
    return used.map((c) => AX.cars.indexOf(c));
  },
  // Point the player relDeg degrees off the track tangent (180 = backwards) for
  // wrong-way / spin / rescue tests. Position/progress unchanged.
  aim(relDeg) {
    if (!AX.player || !AX.track || AX.player.px == null) return false;
    Tracks.sample(AX.track, AX.player.s, smp);
    AX.player.head = Math.atan2(smp.t[0], smp.t[2]) + (relDeg || 0) * Math.PI / 180;
    AX.player.vLat = 0;
    return { head: AX.player.head };
  },
  // skip the countdown but keep the grid intact, so the field races and packs
  // up normally — for observing pack behaviour (e.g. collision vibration).
  go() {
    AX.state = "race"; AX.raceT = Math.max(AX.raceT, 0.5);
    els.lights.hidden = true;
    for (const l of els.lights.children) l.classList.remove("on");
    return AX.state;
  },
  // telemetry snapshot of every car, sorted by prog (leader first): lateral x,
  // arc-progress, speed and the in-contact timer. For measuring jitter.
  cars: () => AX.cars.map((c, i) => ({
    id: i, x: +c.x.toFixed(3), xv: +((c.xVis !== undefined ? c.xVis : c.x)).toFixed(3),
    yaw: +(c.yawVis || 0).toFixed(4),
    prog: +c.prog.toFixed(2), speed: +c.speed.toFixed(2), lap: c.lap,
    ct: +(c.contactT || 0).toFixed(2), kerb: !!c.onKerb, p: !!c.isPlayer,
  })),
  // lap fractions of corner apexes (local maxima of |curvature|), for parking
  corners() {
    if (!AX.track) return [];
    const n = AX.track.n, total = AX.track.total, kv = [];
    for (let k = 0; k < n; k++) kv.push(Math.abs(Tracks.curvature(AX.track, k / n * total)));
    const res = [];
    for (let k = 0; k < n; k++) {
      const a = (k - 1 + n) % n, b = (k + 1) % n;
      if (kv[k] > 0.006 && kv[k] >= kv[a] && kv[k] > kv[b]) res.push(+(k / n).toFixed(4));
    }
    return res;
  },
  // Load any circuit (by index or id, e.g. "monza") and start a normal race,
  // optionally forcing time of day ("day" | "night" | "default") and weather
  // ("dry" | "wet" | "rain" | "overcast" | "fog"). "wet" = damp road, no rain;
  // "rain" = wet road + falling rain. Skips menus so a harness can render any track.
  race(trackRef, timeOfDay, weather) {
    const i = typeof trackRef === "number"
      ? trackRef
      : Tracks.LIST.findIndex((t) => t.id === trackRef);
    if (i == null || i < 0 || i >= Tracks.LIST.length) return false;
    AX.trackIdx = i;
    AX.seasonMode = false;
    AX.timeTrial = false;
    AX.raceLaps = GAME_LAPS;
    AX.raceWeather = (weather === "wet" || weather === "rain" || weather === "overcast" || weather === "fog") ? weather : "dry";
    AX.raceTimeOfDay = timeOfDay || "default";
    startRace();
    return { track: Tracks.LIST[i].id, timeOfDay: AX.raceTimeOfDay, weather: AX.raceWeather };
  },
  tt(trackRef, timeOfDay) {
    const i = typeof trackRef === "number"
      ? trackRef
      : Tracks.LIST.findIndex((t) => t.id === trackRef);
    if (i == null || i < 0 || i >= Tracks.LIST.length) return false;
    AX.trackIdx = i;
    AX.seasonMode = false;
    AX.timeTrial = true;
    AX.raceLaps = TT_LAPS;
    AX.raceWeather = "dry";
    AX.raceTimeOfDay = timeOfDay || "default";
    startRace();
    return { track: Tracks.LIST[i].id, timeTrial: true };
  },
  // Load an optional .glb car model at runtime (team meshes rebuild from it,
  // tinted per livery); resolves false and keeps the procedural car on failure.
  loadCarModel: (url) => loadCarModel(url),
  // Test helpers: override Input and pump physics at fixed dt.
  // setInput({ steer, throttle, brake }) — values held until clearInput().
  // step(dt, n) — run n physics ticks of dt seconds each (default 1 tick, 1/60 s).
  setInput(v) { AX._testInput = v || null; },
  clearInput() { AX._testInput = null; },
  step(dt, n) {
    const d = dt != null ? dt : 1 / 60, count = n != null ? n : 1;
    for (let i = 0; i < count; i++) {
      // Keep the render-interpolation anchors in sync (the render-driven loop
      // snapshots these before each step; a manual pump must too, or a frozen
      // render afterwards lerps toward a stale pre-teleport position).
      for (let j = 0; j < AX.cars.length; j++) { const c = AX.cars[j]; c.rPrevS = c.s; c.rPrevX = c.x; }
      update(d);
    }
  },
  // Deterministic tilt emulation for the autopilot harness. `step(deg, dt)` runs a
  // raw tilt angle (deg) through the real tilt pipeline (One-Euro filter + dead
  // zone + MAX_TILT map + slew limiter) at an explicit timestep and returns the
  // resulting steer (-1..1); `steerToAngle(cmd)` inverts the map (steer→tilt deg)
  // so a controller can convert its steer command into a tilt; `reset()` clears the
  // filter/slew state between runs. Tilt params come from the sliders (tuning()).
  tiltSim: {
    step: (deg, dt) => Input.simTilt(deg, dt),
    reset: () => Input.simTiltReset(),
    steerToAngle: (cmd) => Input.steerToTilt(cmd),
  },

  // ── New dev / test helpers ─────────────────────────────────────────────────

  // Trigger the race-results screen cleanly, as if all cars crossed the line.
  // Fixes the fallback-DOM-hack in ui-audit.spec.js (finishRace was missing).
  finishRace() {
    if (!AX.track || AX.state === "results" || AX.state === "menu") return false;
    AX.cars.forEach((c) => { if (!c.finished) { c.finished = true; c.finishT = AX.raceT; } });
    endRace();
    return { state: AX.state };
  },

  // Get or set the frozen flag (true = physics paused, scene held still).
  // park() sets this automatically; expose it so tests can freeze/unfreeze.
  freeze(v) {
    if (v === undefined) return AX.frozen;
    AX.frozen = !!v;
    return AX.frozen;
  },

  // Get or set HUD visibility. Returns current visible state.
  hud(show) {
    if (show === undefined) return !els.hud.hidden;
    els.hud.hidden = !show;
    if (show) { els.pausebtn.hidden = (AX.state !== "race"); } else { els.pausebtn.hidden = true; }
    return !els.hud.hidden;
  },

  // Get or set race weather ("dry" | "wet" | "rain" | "overcast" | "fog").
  // "wet" = damp track (wet road, no falling rain); "rain" = wet road + falling
  // rain + lightning. Toggles the rain layer + audio live for mid-race changes.
  weather(w) {
    if (w === undefined) return AX.raceWeather;
    AX.raceWeather = (w === "wet" || w === "rain" || w === "overcast" || w === "fog") ? w : "dry";
    if (AX.raceWeather === "rain") {
      if (!AX.rainDrops.length) initRainDrops();
      AXWeather.setRainVisible(true);
    } else {
      AXWeather.setRainVisible(false);
    }
    if (AX.soundOn) { if (AX.raceWeather === "rain") GameAudio.startRain(); else GameAudio.stopRain(); }
    // Re-apply the frame lighting NOW: without this a live weather change only
    // moved the wetness ramp / rain overlay — the cloud cover, muted sun,
    // ambient lift, fog density and exposure branches in applyRaceSettings
    // silently kept the previous weather (fog looked like a clear day).
    if (AX.track) applyRaceSettings();
    return AX.raceWeather;
  },

  // Live time-of-day change without reloading assets. Sets the session time and
  // re-applies lighting; loadTrack() only rebuilds geometry when the night/day
  // state actually flips (dawn/dusk/night share one build; day is the other), so
  // switching among the three dark times is near-instant. Fast path for sweeps.
  setTimeOfDay(tod) {
    if (tod === undefined) return AX.raceTimeOfDay;
    const valid = ["default", "dawn", "day", "dusk", "night"];
    AX.raceTimeOfDay = valid.indexOf(tod) >= 0 ? tod : "default";
    loadTrack(AX.trackIdx);
    applyRaceSettings();
    return AX.raceTimeOfDay;
  },

  // Force-rescue the player immediately (same as auto-rescue after 3 s stuck).
  // Returns updated physState so the test can confirm repositioning.
  resetPlayer() {
    if (!AX.player) return false;
    rescuePlayer(AX.player);
    return this.physState();
  },

  // Detailed telemetry for a single car by index (from cars() list).
  carAt(idx) {
    const c = typeof idx === "number" ? AX.cars[idx] : AX.cars.find((x) => x.isPlayer);
    if (!c) return null;
    return {
      id: AX.cars.indexOf(c), isPlayer: !!c.isPlayer, team: c.team && c.team.id,
      x: +c.x.toFixed(3), speed: +c.speed.toFixed(2),
      prog: +c.prog.toFixed(2), s: +c.s.toFixed(2), lap: c.lap,
      finished: !!c.finished, finishT: c.finishT != null ? +c.finishT.toFixed(2) : null,
      contactT: +(c.contactT || 0).toFixed(3),
      wrongWay: !!c.wrongWay, rescueT: +(c.rescueT || 0).toFixed(2),
      energy: +(c.energy || 0).toFixed(3), boostOn: !!c.boostOn,
      brakeHeat: +(c.brakeHeat || 0).toFixed(2), gear: c.gear || 1,
    };
  },

  // List all available circuit IDs and names (for iterating in test harnesses).
  tracks: () => Tracks.LIST.map((t, i) => ({ id: t.id, name: t.name, i })),

  // List all teams with engine supplier (for factory-parts and setup tests).
  teams: () => Teams.LIST.map((t, i) => ({ id: t.id, name: t.name, engine: t.engine, i })),

  // Reset mesh-visibility overrides (companion to meshToggle).
  clearMeshes() { AX.hideMeshes = {}; return AX.hideMeshes; },

  // Combined debug snapshot: camera mode, frozen, dbgCam active, weather.
  // Lighting snapshot — ambient (sky/ground), the scene sun colour, exposure, and
  // how many point lights (floodlights) are active this frame. Handy for checking
  // whether a night scene is correctly dark + lit by floodlights vs washed out.
  lightState: () => ({
    ambientSky: AX.frame.ambientSky && AX.frame.ambientSky.slice(),
    ambientGround: AX.frame.ambientGround && AX.frame.ambientGround.slice(),
    sunColor: AX.frame.sunColor && AX.frame.sunColor.slice(),
    exposure: AX.frame.exposure != null ? AX.frame.exposure : 1,
    numLights: AX.frame.lights ? AX.frame.lights.length / 15 : 0,
    sunY: AX.frame.sunDir ? AX.frame.sunDir[1] : null,
    builtNight: AX.builtTrackNight, trackNight: AX.track && AX.track._night,
    floodEmit: AXRender.getFloodEmit(),   // actual prop-emissive ramp value this frame
  }),
  // lightTune(o?) — get or set the live lighting-tuner values (same registry as
  // the pause-menu LIGHTING TUNER panel). No args: returns {id: value} for every
  // tunable. With an object: merges valid entries (clamped to each slider's
  // range), persists, invalidates baked light records where needed, and returns
  // the updated set. lightTune({wetness: 0.8}) pins road wetness instantly;
  // lightTune({wetness: -0.05}) returns it to the weather-driven ramp.
  lightTune(o) {
    if (o && typeof o === "object") {
      for (const k of Object.keys(o)) setLightTune(k, o[k]);
      persistLightTune();
      if (typeof AXUi.refreshLightTunePanel === "function") AXUi.refreshLightTunePanel();
    }
    const out = {};
    for (const d of TUNE_DEFS) out[d.id] = LT[d.id];
    return out;
  },
  viewState() {
    return {
      camMode: CAM_MODES[AX.camMode].id, camIndex: AX.camMode,
      frozen: AX.frozen, dbgCamActive: AX.dbgCam !== null, skyOverride: AX.skyViewOverride !== null,
      weather: AX.raceWeather, state: AX.state,
      ...this.camState(),
    };
  },

  // ── Headless / RL control loop ─────────────────────────────────────────────

  // headless(on?) — get or set headless mode. When on, render() exits immediately
  // so physics can be stepped at uncapped speed via act() without GPU overhead.
  headless(on) {
    if (on === undefined) return AX.headlessMode;
    AX.headlessMode = !!on;
    return AX.headlessMode;
  },

  // renderScale(v?) — adaptive-resolution control. No arg: report current state
  // { scale, fps, auto }. Number: pin the 3D render scale (0.5–1) and disable
  // the auto-governor. true: re-enable the governor. Lower scale = big fill-rate
  // win (softer 3D view; HUD stays crisp).
  renderScale(v) {
    if (v === undefined) return { scale: GLX.getRenderScale(), fps: +(1000 / Math.max(1, _frameEMA)).toFixed(1), auto: _autoRes };
    if (v === true) { _autoRes = true; return this.renderScale(); }
    _autoRes = false; GLX.setRenderScale(+v); return this.renderScale();
  },

  // obs() — full debug observation of the current game state. Superset of
  // physState() and probe() with track context, barrier clearances, lookahead
  // scan, nearest rivals, reward components, and episode terminal flag.
  obs() {
    if (!AX.player || AX.player.px == null || !AX.track) return null;
    Tracks.sample(AX.track, AX.player.s, smp);
    const axFrac = Math.min(1, Math.abs(AX.player.axEstSm ?? 0) / (LONG_GRIP * gripMult()));
    const slipFactor = Math.sqrt(Math.max(0, 1 - axFrac * axFrac));
    const slip = Math.atan2(AX.player.vLat || 0, Math.max(1, AX.player.speed));
    const kNow = Tracks.curvature(AX.track, AX.player.s);
    const hwNow = smp.hw, slopeNow = smp.t[1] || 0;

    // barrier distances: wallAt() always returns a positive absolute distance from
    // centreline; the left wall sits at x = -wallLAbs (negative), right at +wallRAbs.
    const wallRAbs = Tracks.wallAt(AX.track, AX.player.s, 1);
    const wallLAbs = Tracks.wallAt(AX.track, AX.player.s, -1);
    const wallR =  wallRAbs;   // signed: right wall is at +wallR
    const wallL = -wallLAbs;   // signed: left  wall is at  wallL (negative)

    // lookahead scan at [10, 30, 60] m ahead
    const scanDists = [10, 30, 60];
    const scanAhead = scanDists.map((d) => {
      const ss = wrapS(AX.player.s + d);
      Tracks.sample(AX.track, ss, smp);
      const sR = Tracks.wallAt(AX.track, ss, 1), sLA = Tracks.wallAt(AX.track, ss, -1);
      return { d, k: +Tracks.curvature(AX.track, ss).toFixed(5), hw: +smp.hw.toFixed(2),
               wallR: +sR.toFixed(2), wallL: +(-sLA).toFixed(2),
               width: +(sR + sLA).toFixed(2) };
    });
    // restore smp to player position
    Tracks.sample(AX.track, AX.player.s, smp);

    // nearest rivals by progress (leader-first order)
    const sorted = AX.cars.slice().sort((a, b) => b.prog - a.prog);
    const pi = sorted.findIndex((c) => c.isPlayer);
    const rivalAhead  = pi > 0 ? sorted[pi - 1] : null;
    const rivalBehind = pi < sorted.length - 1 ? sorted[pi + 1] : null;

    const inp = AX._testInput || {};
    const done = !!AX.player.wrongWay || (AX.player.rescueT || 0) > 8;

    return {
      // ── position & progress ──
      s:       +AX.player.s.toFixed(3),
      x:       +AX.player.x.toFixed(3),
      prog:    +(AX.player.prog || 0).toFixed(4),
      lap:      AX.player.lap || 0,
      raceT:   +AX.raceT.toFixed(3),

      // ── motion ──
      speed:     +(AX.player.speed || 0).toFixed(2),
      speedKph:  +((AX.player.speed || 0) * 3.6).toFixed(1),
      head:      +(AX.player.head || 0).toFixed(4),
      vLat:      +(AX.player.vLat || 0).toFixed(3),

      // ── combined-slip physics ──
      axEstSm:    +(AX.player.axEstSm ?? 0).toFixed(2),
      axFrac:     +axFrac.toFixed(3),
      slipFactor: +slipFactor.toFixed(3),
      slipDeg:    +(slip * 180 / Math.PI).toFixed(2),

      // ── track context at player position ──
      k:     +kNow.toFixed(5),
      hw:    +hwNow.toFixed(2),
      slope: +slopeNow.toFixed(4),
      gripMult: gripMult(),
      weather: AX.raceWeather,

      // ── barrier clearances (both in metres, positive = clear) ──
      wallR:  +wallR.toFixed(2),
      wallL:  +wallL.toFixed(2),
      clearR: +(wallR - AX.player.x).toFixed(2),
      clearL: +(AX.player.x - wallL).toFixed(2),

      // ── energy / ERS ──
      energy: +(AX.player.energy || 0).toFixed(3),
      gear: AX.player.gear || 1,

      // ── episode state flags ──
      wrongWay: !!AX.player.wrongWay,
      offT:     +(AX.player.offT || 0).toFixed(2),
      rescueT:  +(AX.player.rescueT || 0).toFixed(2),
      done,

      // ── currently applied input (null fields = real device input) ──
      input: {
        steer:    inp.steer    !== undefined ? inp.steer    : null,
        throttle: inp.throttle !== undefined ? !!inp.throttle : null,
        brake:    inp.brake    !== undefined ? !!inp.brake    : null,
      },

      // ── rival proximity ──
      posInField: pi + 1,
      gapAhead:  rivalAhead  ? +(rivalAhead.prog  - (AX.player.prog || 0)).toFixed(2) : null,
      gapBehind: rivalBehind ? +((AX.player.prog || 0) - rivalBehind.prog).toFixed(2) : null,

      // ── lookahead ──
      scan: scanAhead,

      // ── reward components (combine as you see fit) ──
      reward: {
        speed:    +(AX.player.speed || 0).toFixed(2),          // m/s forward — maximise
        offTrack: +(AX.player.offT  || 0).toFixed(2),          // seconds off-track
        wallDist: +Math.min(wallR - AX.player.x, AX.player.x - wallL).toFixed(2), // m to nearer wall
        wrongWay: !!AX.player.wrongWay,
      },
    };
  },

  // act(input, dt, n) — set input, step n ticks of dt seconds, return obs().
  // Single round-trip replaces three separate evaluate() calls in a control loop.
  // input: { steer: -1..1, throttle: bool, brake: bool }; pass null to keep current.
  act(input, dt, n) {
    if (!AX.track || !AX.player) return null;
    // auto-enter race state so physics advances even if called during countdown
    if (AX.state === "count") {
      AX.state = "race"; AX.raceT = 0;
      els.lights.hidden = true;
      for (const l of els.lights.children) l.classList.remove("on");
    }
    if (input !== undefined) AX._testInput = input || null;
    const d = dt != null ? dt : 1 / 60, count = n != null ? n : 1;
    for (let i = 0; i < count; i++) {
      for (let j = 0; j < AX.cars.length; j++) { const c = AX.cars[j]; c.rPrevS = c.s; c.rPrevX = c.x; }
      update(d);
    }
    return this.obs();
  },

  // ── Timing & field hooks ──────────────────────────────────────────────────

  // sectorState() — live S1/S2/S3 timing.
  // idx: current sector (0=S1, 1=S2, 2=S3). elapsed: seconds into it.
  // bests: personal-best times per sector (null until first completed lap).
  // last: sector times from the most recently completed lap.
  sectorState() {
    if (!AX.player || !AX.track) return null;
    const elapsed = (AX.player.lapTime || 0) - AX.sectorStartT;
    return {
      idx: AX.sectorIdx,
      elapsed: +elapsed.toFixed(3),
      bests: AX.sectorBests.map((v) => v === Infinity ? null : +v.toFixed(3)),
      last:  AX.sectorLast.map((v) => v == null     ? null : +v.toFixed(3)),
    };
  },

  // lapHistory() — completed lap times for this session.
  // TT mode returns a full array via ttLaps[]; race mode returns only lastLap.
  lapHistory() {
    if (!AX.player) return null;
    return {
      mode: AX.timeTrial ? "tt" : "race",
      laps: AX.timeTrial
        ? AX.ttLaps.map((t, i) => ({ lap: i + 1, time: +t.toFixed(3) }))
        : [],
      best:    isFinite(AX.player.best)  ? +AX.player.best.toFixed(3)    : null,
      lastLap: AX.player.lastLap != null ? +AX.player.lastLap.toFixed(3) : null,
    };
  },

  // timing() — compact race-clock + ERS snapshot.
  // One call replaces physState() + obs() for lightweight telemetry consumers.
  timing() {
    if (!AX.player || !AX.track) return null;
    const sorted = AX.cars.slice().sort((a, b) => b.prog - a.prog);
    const pi = sorted.findIndex((c) => c.isPlayer);
    const ahead  = pi > 0               ? sorted[pi - 1] : null;
    const behind = pi < sorted.length - 1 ? sorted[pi + 1] : null;
    return {
      raceT:         +AX.raceT.toFixed(3),
      lapTime:       +(AX.player.lapTime  || 0).toFixed(3),
      best:          isFinite(AX.player.best) ? +AX.player.best.toFixed(3) : null,
      lastLap:       AX.player.lastLap != null ? +AX.player.lastLap.toFixed(3) : null,
      lap:            AX.player.lap || 0,
      pos:            pi + 1,
      total:          AX.cars.length,
      gapAhead:      ahead  ? +(ahead.prog  - (AX.player.prog || 0)).toFixed(2) : null,
      gapBehind:     behind ? +((AX.player.prog || 0) - behind.prog).toFixed(2) : null,
      energy:        +(AX.player.energy || 0).toFixed(3),
      gear:           AX.player.gear || 1,
      sector:         AX.sectorIdx + 1,
      sectorElapsed: +((AX.player.lapTime || 0) - AX.sectorStartT).toFixed(3),
    };
  },

  // fieldState() — full field sorted by race position (leader first).
  // gap: metres of track-arc behind the leader (0 for leader).
  fieldState() {
    if (!AX.track || !AX.cars.length) return null;
    const sorted = AX.cars.slice().sort((a, b) => b.prog - a.prog);
    const leader = sorted[0];
    return sorted.map((c, pos) => ({
      pos:      pos + 1,
      id:       AX.cars.indexOf(c),
      name:     c.name,
      code:     c.code,
      team:     c.team && c.team.id,
      isPlayer: !!c.isPlayer,
      lap:      c.lap || 0,
      frac:     +(c.s / AX.track.total).toFixed(4),
      speed:    +c.speed.toFixed(2),
      gap:      +(leader.prog - c.prog).toFixed(2),
      finished: !!c.finished,
      finishT:  c.finishT != null ? +c.finishT.toFixed(2) : null,
    }));
  },

  // aiPlace(idx, frac, speed?, x?) — teleport an AI car (by cars[] index) to
  // the given lap fraction. Cannot move the player car; use jump() for that.
  // Returns the car's new state, or false on invalid input.
  aiPlace(idx, frac, speed, x) {
    if (!AX.track || !AX.cars[idx]) return false;
    const c = AX.cars[idx];
    if (c.isPlayer) return false;
    c.s    = wrapS((frac != null ? frac : 0) * AX.track.total);
    c.prog = (c.lap || 0) * AX.track.total + (frac != null ? frac : 0) * AX.track.total;
    if (x     !== undefined) { c.x = x; c.xVis = x; }
    if (speed !== undefined) c.speed = speed;
    c.vLat = 0; c.yawRateCur = 0;
    Tracks.sample(AX.track, c.s, smp2);
    c.head = Math.atan2(smp2.t[0], smp2.t[2]);
    return { id: idx, frac: +(c.s / AX.track.total).toFixed(4), speed: +c.speed.toFixed(2), x: +c.x.toFixed(3) };
  },

  // setEnergy(v) — set player ERS charge (0..1). Clamps silently.
  // setBoost(on) — toggle the player's ERS boost (for tests/screenshots).
  setBoost(on) { if (AX.player) AX.player.boostOn = !!on; return AX.player ? AX.player.boostOn : false; },
  setEnergy(v) {
    if (!AX.player) return false;
    AX.player.energy = Math.max(0, Math.min(1, +v || 0));
    return { energy: +AX.player.energy.toFixed(3) };
  },

  // setLap(n) — override the player's lap counter (for testing end-of-race
  // logic and results screen). Does not reset lapTime or sector state.
  setLap(n) {
    if (!AX.player) return false;
    AX.player.lap = Math.max(0, Math.floor(+n || 0));
    return { lap: AX.player.lap };
  },

  // trackShape(n?) — returns n evenly-spaced 2D centerline points {frac,x,z,k}
  // normalised so the bounding box fits in [-1,1]×[-1,1]. Useful for comparing
  // the rendered track outline against a real-world circuit map.
  // Positive k = left curve, negative k = right curve (matches physics sign).
  trackShape(n) {
    if (!AX.track) return null;
    const steps = Math.max(4, Math.min(2000, n != null ? Math.floor(+n) : 200));
    const xs = [], zs = [], ks = [], fracs = [];
    for (let i = 0; i < steps; i++) {
      const frac = i / steps;
      const s = frac * AX.track.total;
      Tracks.sample(AX.track, s, smp2);
      xs.push(smp2.p[0]);
      zs.push(smp2.p[2]);
      ks.push(Tracks.curvature(AX.track, s));
      fracs.push(frac);
    }
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const scaleX = maxX - minX || 1, scaleZ = maxZ - minZ || 1;
    const scale = Math.max(scaleX, scaleZ);
    const ox = (scale - scaleX) / scale / 2, oz = (scale - scaleZ) / scale / 2;
    return fracs.map((f, i) => ({
      frac: +f.toFixed(4),
      x: +(ox + (xs[i] - minX) / scale).toFixed(4),
      z: +(oz + (zs[i] - minZ) / scale).toFixed(4),
      k: +ks[i].toFixed(5),
    }));
  },

  // trackProfile(n?) — sample the circuit at n evenly-spaced points (default 100,
  // max 1 000). Returns {frac, y, k, hw, slope} per point — useful for
  // elevation visualisation and curvature analysis without a live race.
  trackProfile(n) {
    if (!AX.track) return null;
    const steps = Math.max(2, Math.min(1000, n != null ? Math.floor(+n) : 100));
    const out = [];
    for (let i = 0; i < steps; i++) {
      const frac = i / steps;
      const s = frac * AX.track.total;
      Tracks.sample(AX.track, s, smp2);
      out.push({
        frac:  +frac.toFixed(4),
        y:     +smp2.p[1].toFixed(3),
        k:     +Tracks.curvature(AX.track, s).toFixed(5),
        hw:    +smp2.hw.toFixed(2),
        slope: +(smp2.t[1] || 0).toFixed(4),
      });
    }
    return out;
  },

  // mapPts() — returns the normalised [0,1] centerline pts stored in track.map
  // (the same array used by the minimap and track-selector canvas). Each entry
  // is [x, y] where x=0..1 east and y=0..1 with 0=north (top of map).
  // Useful for asserting minimap orientation without relying on screenshots.
  mapPts() {
    return AX.track ? AX.track.map.slice() : null;
  },

  // trackBounds() — bounding box of the loaded circuit in world metres plus the
  // frac closest to the geographic centre. Handy for framing top-down orbit()
  // shots: __apex.orbit(__apex.trackBounds().centerFrac, 0, 85, dist).
  trackBounds() {
    if (!AX.track) return null;
    const px = AX.track.px, pz = AX.track.pz, n = AX.track.n;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < n; i++) {
      if (px[i] < minX) minX = px[i]; if (px[i] > maxX) maxX = px[i];
      if (pz[i] < minZ) minZ = pz[i]; if (pz[i] > maxZ) maxZ = pz[i];
    }
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    let bestD = Infinity, bestI = 0;
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(px[i] - cx, pz[i] - cz);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    return {
      minX: +minX.toFixed(1), maxX: +maxX.toFixed(1),
      minZ: +minZ.toFixed(1), maxZ: +maxZ.toFixed(1),
      spanX: +(maxX - minX).toFixed(1), spanZ: +(maxZ - minZ).toFixed(1),
      centerFrac: +(bestI / n).toFixed(4),
    };
  },

  // reset(frac, speed, x) — fast episode reset reusing the loaded track.
  // Reinitialises the grid, repositions the player at lap-fraction frac (0..1),
  // sets state="race" and raceT=0 without reloading assets. Returns initial obs().
  // Call __apex.race() first to load the desired track.
  reset(frac, speed, x) {
    if (!AX.track || !AX.player) return false;
    gridUp();
    AX.state = "race"; AX.raceT = 0;
    els.lights.hidden = true;
    for (const l of els.lights.children) l.classList.remove("on");
    AX.player.s     = wrapS((frac  != null ? frac  : 0) * AX.track.total);
    AX.player.prog  = (frac != null ? frac : 0) * AX.track.total;
    AX.player.speed = speed != null ? speed : 0;
    AX.player.x     = x     != null ? x     : 0;
    AX.player.xVis  = AX.player.x;
    AX.player.vLat  = 0; AX.player.yawRateCur = 0;
    AX.player.lap   = 0; AX.player.axEstSm = 0;
    // seed world-space position + heading from (s, x) immediately, same as jump()
    Tracks.sample(AX.track, AX.player.s, smp);
    AX.player.px   = smp.p[0] + smp.r[0] * AX.player.x;
    AX.player.pz   = smp.p[2] + smp.r[2] * AX.player.x;
    AX.player.head = Math.atan2(smp.t[0], smp.t[2]);
    AX.player.rPrevS = AX.player.s; AX.player.rPrevX = AX.player.x;   // sync render anchors (see jump)
    AX._testInput = null;
    return this.obs();
  },

  // f1api — raw access to the F1API module (Jolpica + OpenF1) used by the
  // data hub. Call e.g. __apex.f1api.schedule() or __apex.f1api.lastRace()
  // from the console; all methods return Promises.
  f1api: typeof F1API !== "undefined" ? F1API : null,

  // openf1(path) — direct OpenF1 fetch, returns parsed JSON.
  // Example: __apex.openf1("/sessions?circuit_short_name=Monaco&year=2024")
  //          __apex.openf1("/location?session_key=9149&driver_number=1")
  openf1(path) {
    return fetch("https://api.openf1.org/v1" + path).then(r => r.json());
  },

  // jolpica(path) — direct Jolpica (Ergast-compatible) fetch, returns parsed JSON.
  // Example: __apex.jolpica("/circuits/monaco.json")
  //          __apex.jolpica("/2024/5/results.json")  (round 5 = Monaco 2024)
  jolpica(path) {
    return fetch("https://api.jolpi.ca/ergast/f1" + path).then(r => r.json());
  },

  // fetchTrackOutline(sessionKey, driverNumber?) — fetches OpenF1 location data
  // for a session and returns normalised {x,z}[] track outline points (≤400 pts).
  // Find sessionKey via: __apex.openf1("/sessions?circuit_short_name=Monaco&year=2024")
  async fetchTrackOutline(sessionKey, driverNumber) {
    const drv = driverNumber || 1;
    const rows = await fetch(
      "https://api.openf1.org/v1/location?session_key=" + sessionKey + "&driver_number=" + drv
    ).then(r => r.json());
    if (!Array.isArray(rows) || !rows.length) return null;
    const xs = rows.map(r => r.x), zs = rows.map(r => r.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const scale = Math.max(maxX - minX, maxZ - minZ) || 1;
    // Downsample to ≤400 points for readability
    const step = Math.max(1, Math.floor(rows.length / 400));
    return rows
      .filter((_, i) => i % step === 0)
      .map(r => ({
        x: +((r.x - minX) / scale).toFixed(4),
        z: +((r.y - minZ) / scale).toFixed(4),
      }));
  },
};

})();
