/* Apex 26 — the window.__apex dev/test API for js/game.js (~180 methods: staging, cameras, track geometry, telemetry, session control, lighting, input override, h… */
const ApexApi = (function () {
  "use strict";

function create(G) {
// Stable bindings (functions + consts) from the game.js closure.
const { els, smp, smp2, gfx, canvas, GAME_LAPS, TT_LAPS, LONG_GRIP,
        applyRaceSettings, camVantage, endRace, gridUp, gripMult, isErsDeploying,
        copyLightTune, loadCarModel, loadTrack, persistLightTune, refreshLightTunePanel,
        restoreLightTune,
        rescuePlayer, setCamMode, setLightTune, setWeatherLive, snapGameCam,
        startRace, startWeatherArc, update, wrapS } = G;
// Deferred: openCareer is declared below the G literal in game.js, so it arrives
// as an arrow and must be read through G rather than destructured here.
const openCareer = (...a) => G.openCareer(...a);
const { CAM_MODES } = GameTables;
const { TUNE_DEFS, LT } = LightTune;

// The agent-facing view (js/game/agentview.js). Composed here rather than
// bolted onto this file: __apex stays a flat dev console, world()/trackInfo()
// are the layer an LLM agent reads. See docs/AGENT-WORLD-API.md.
const agentView = AgentView.create(G);

let _netPeer = null;
// The far end of a faked lobby connection — see lobbyFake().
let _lobbyPeer = null;

function simCareerRound() {
  const rows = G.qualiSim(0);
  const live = G.cars;
  const season = G.season;
  if (!rows || !rows.length || !live.length || !G.player || !season) return null;
  const byId = new Map(live.map((c) => [c.driverId, c]));
  const round = Career.round();

  G.armReliability(live);

  const grid = [];
  for (let i = 0; i < rows.length; i++) {
    const car = byId.get(rows[i].driverId);
    if (!car) continue;
    car.gridPos = i + 1;
    if (car.dnfAt != null) { car.retired = true; car.dnf = car.dnfWhy; car.dnfAt = null; }
    const rt = DriverRatings.get(car.code, car.tier, Career.devFor(car.team && car.team.id, car.seat));
    // Race day is not qualifying. Pace order is a strong prior; craft is how much
    // of it survives first-lap contact and a long run, so a racer moves forward
    // and a qualifying specialist goes backwards.
    const swing = (Career.rnd(round, "race", car.driverId) - 0.5) * 10 * (1 - rt.craft / 200);
    car.cuts = Career.rnd(round, "cuts", car.driverId) * 100 < (100 - rt.awareness) ? 2 : 0;
    car.penalty = 0;
    grid.push({ car, key: car.retired ? 1000 + i : i + swing });
  }
  if (grid.length !== live.length) return null;   // a partial map is not a result
  grid.sort((a, b) => a.key - b.key);
  const order = grid.map((g) => g.car);

  // The championship award, exactly as endRace() does it — settleRound() reads
  // the standings it leaves behind, so a shortcut here would settle against a
  // season that never happened. settleRound() persists itself; do NOT save
  // beforehand or a crash mid-settle leaves a half-written championship on disk.
  order.forEach((car, i) => {
    const pts = car.retired ? 0 : (Teams.POINTS[i] || 0);   // a DNF scores nothing
    car.finPos = i + 1;
    season.pts[car.driverId] = (season.pts[car.driverId] || 0) + pts;
    season.driverCodes[car.driverId] = car.code;
    season.teamPts[car.team.id] = (season.teamPts[car.team.id] || 0) + pts;
  });
  season.round++;
  const settled = Career.settleRound(order, G.player);
  if (!settled) return null;
  return Object.assign({ round: round + 1, podium: order.slice(0, 3).map((c) => c.code) }, settled);
}

// LAZY TRACK ENSURE — the one place the deferred boot build is forced.
// js/game.js no longer builds the 3D track synchronously at boot (it schedules
// the menu flyby build instead), so window.__apex can exist for a beat with
// G.track === null — while every hook below, and every spec that stages a
// camera before racing (park/jump/snapCam/probe/world/…), was written against
// the synchronous world boot used to guarantee. Force the build ONCE here at
// the API boundary rather than guard ~180 call sites: the first __apex call
// pays exactly what boot used to pay, and a player who never opens the dev API
// never pays it at all. Placement is load-bearing in BOTH directions —
// tests/unit/hooks-documented.test.mjs slices this file at the first occurrence
// of the api literal's opening text and reads every 2-space-indented name after
// it as a hook, so the loop must sit above the literal AND this comment must
// not quote that text (it did, which moved the slice and invented a hook called
// `for` — measured, the guard went red).
function lazyTrackEnsure(o) {
  for (const k of Object.keys(o)) {
    const fn = o[k];
    if (typeof fn !== "function") continue;   // tiltSim (namespace), f1api (module)
    o[k] = function (...a) { if (!G.track) loadTrack(G.trackIdx); return fn.apply(this, a); };
  }
  return o;
}

const api = {
  // place the player at fraction [0,1) of the lap; optional speed (m/s), x (m)
  jump(frac, speed, lateral) {
    if (!G.player || !G.track) return false;
    IncidentSim.release(G.player);
    const f01 = (((frac || 0) % 1) + 1) % 1;
    const sNew = wrapS(f01 * G.track.total);
    // prog is CUMULATIVE (lap*total + s, negative on the grid) — shift it by the
    // arc delta rather than assigning the raw fraction, which erased whole laps
    // from the ranked order on a mid-race jump (measured: lap 1, 5930 → 2889).
    G.player.prog += sNew - G.player.s;
    G.player.s = sNew;
    if (lateral !== undefined) G.player.x = lateral;
    if (speed !== undefined) G.player.speed = speed;
    Tracks.sample(G.track, G.player.s, smp);
    { const rl = Math.hypot(smp.r[0], smp.r[2]) || 1;   // see worldFromTrack in game.js
      G.player.px = smp.p[0] + smp.r[0] / rl * G.player.x;
      G.player.pz = smp.p[2] + smp.r[2] / rl * G.player.x; }
    G.player.head = Math.atan2(smp.t[0], smp.t[2]);
    G.player.vLat = 0; G.player.yawRateCur = 0;
    // Teleport hygiene: the wall/rescue accumulators describe the OLD location.
    // Left alone, a wedge-then-jump sequence carried ~3 s of rescueT into the
    // new spot and fired a surprise auto-rescue mid-drive (measured).
    G.player.rescueT = 0; G.player.wallT = 0; G.player.wasOnWall = false;
    G.player.wrongT = 0; G.player.wrongWay = false; G.player.offT = 0;
    // Sync render-interpolation anchors so lerpS(rPrevS,s,alpha)==s regardless of renderAlpha.
    G.player.rPrevS = G.player.s; G.player.rPrevX = G.player.x;
    // playerAnchor()/renderPosOf() draw the HUMAN car from THESE (world), not the AI-only pair above — else it stays lerp'd toward the pre-teleport spot once park() freezes physics.
    G.player.rPrevPx = G.player.px; G.player.rPrevPz = G.player.pz;
    if ((G.state === "race" || G.state === "count") && G.refreshHud) G.refreshHud(true);
    return { s: G.player.s, total: G.track.total };
  },
  park(frac, lateral) {
    if (!G.player || !G.track) return false;
    G.skyViewOverride = null;   // clear any sky override so normal chase cam resumes
    G.state = "race"; G.raceT = Math.max(G.raceT, 1);
    els.lights.hidden = true;
    for (const l of els.lights.children) l.classList.remove("on");
    G.lightsLit = 0;   // the DOM alone leaves the counter at 5 — see the façade
    G.cars.forEach((c) => { if (!c.isPlayer) { c.prog -= 600; c.s = wrapS(c.s - 600); c.speed = 0; } });
    const r = this.jump(frac, 0, lateral !== undefined ? lateral : 0);
    G.frozen = true;   // hold the scene still for a deterministic screenshot
    return r;
  },
  sky(frac, lateral) {
    const r = this.park(frac, lateral);
    if (!r) return false;
    G.dbgCam = null;   // sky uses skyViewOverride, which a live view()/orbit() free-cam would otherwise mask
    Tracks.sample(G.track, G.player.s, smp);
    const e = [smp.p[0], smp.p[1] + 3.5, smp.p[2]];
    const t = [
      smp.p[0] + smp.t[0] * 20,
      smp.p[1] + 34,            // ~58° up over 20 m → horizon low, sky dominant
      smp.p[2] + smp.t[2] * 20,
    ];
    G.skyViewOverride = { eye: e, tgt: t, fov: 78 };
    // snap immediately so the very first rendered frame is correct
    G.camEye[0] = e[0]; G.camEye[1] = e[1]; G.camEye[2] = e[2];
    G.camTgt[0] = t[0]; G.camTgt[1] = t[1]; G.camTgt[2] = t[2];
    G.camFov = 75;
    return r;
  },
  camera(m) {
    if (m == null) return { mode: CAM_MODES[G.camMode].id, index: G.camMode, modes: CAM_MODES.map((c) => c.id) };
    let i = typeof m === "number" ? m : CAM_MODES.findIndex((c) => c.id === String(m).toLowerCase());
    if (i < 0 || i >= CAM_MODES.length) return false;
    G.dbgCam = null;   // switching to a game camera mode leaves any view() free-cam
    setCamMode(i);
    return { mode: CAM_MODES[G.camMode].id, index: G.camMode };
  },
  snapCam() {
    if (!G.player || !G.track) return;
    G.dbgCam = null;   // snapping the game camera clears any view() free-cam override
    snapGameCam();
  },
  previewCam(mode, frac = 0, speed = 60, lat = 0) {
    if (!G.track) return false;
    const m = String(mode).toLowerCase();
    if (!CAM_MODES.some((c) => c.id === m)) return false;
    const s = (((frac % 1) + 1) % 1) * G.track.total;
    // Pass a CAR POSE, exactly as render() and snapGameCam() do. Without one the
    // chase/onboard rigs silently fall back to their ROAD-FRAME branch — a
    // different rig from the one the game ever shows — so this hook previewed
    // framing no player sees, and a camera investigation that trusted it measured
    // the wrong code path for hours while reporting everything as clean. The pose
    // is synthesised from the requested (s, lat) since previewCam deliberately
    // does not move the car: centre + right*lat for the position, and the road
    // tangent's heading, which is what a car sitting at that point would have.
    Tracks.sample(G.track, s, smp);
    const px = smp.p[0] + smp.r[0] * lat, pz = smp.p[2] + smp.r[2] * lat;
    const head = Math.atan2(smp.t[0], smp.t[2]);
    const v = camVantage(m, s, lat, speed, 0, { carPos: [px, pz], carHead: head });
    G.dbgCam = { eye: v.eye.slice(), target: v.tgt.slice(), fov: v.fov, far: 6000 };
    return { eye: v.eye, target: v.tgt, fov: +v.fov.toFixed(1), mode: m };
  },
  // camTune(mode?, obj?) — the CAMERA TUNER's per-camera-mode framing offsets
  // (js/game/cam-tune.js), the camera counterpart of lightTune(). With no args
  // it reports every tuned mode plus the knob registry; with a mode id it
  // returns that mode's six resolved values; with a mode id + an object of
  // {height,dist,side,pitch,yaw,fov} it applies and persists them and re-snaps
  // the live camera. Pass null as the object to reset that mode.
  //   __apex.camTune("chase", { height: 0.6, dist: 2, fov: -4 })
  camTune(mode, obj) {
    if (mode == null) {
      const out = { defs: CamTune.defs().map((d) => ({ id: d.id, min: d.min, max: d.max, unit: d.unit })), tuned: {} };
      for (const m of CamTune.tunedModes()) out.tuned[m] = CamTune.values(m);
      return out;
    }
    const m = String(mode).toLowerCase();
    if (!CAM_MODES.some((c) => c.id === m)) return false;
    if (obj === undefined) return CamTune.values(m);
    if (obj === null) CamTune.reset(m);
    else if (typeof obj === "object") for (const k of Object.keys(obj)) CamTune.set(m, k, +obj[k]);
    else return false;
    CamTune.persist();
    if (G.player && G.track) snapGameCam();
    CamTunerPanel.refresh();
    return CamTune.values(m);
  },
  // track reflects the ACTIVE race track — null at the menu/select even though a
  // track is loaded for the background flyby (matches the documented contract).
  // sectors: [s1End, s2End] racing-lap fractions; turns: curated FIA turn count.
  // `flow`/`session` are the real mode state; timeTrial/seasonMode are the older
  // derived booleans, kept verbatim so existing harnesses do not have to change.
  info: () => ({
    state: G.state, track: (G.state === "race" || G.state === "count") ? (G.track && G.track.def.id) : null,
    n: G.track && G.track.n, total: G.track && G.track.total, timeTrial: G.timeTrial, seasonMode: G.seasonMode,
    flow: G.flow, session: G.session, career: !!G.career,
    raceQuali: !!G.raceQuali,
    lapsTarget: G.lapsTarget,
    sectors: G.track && G.track.def && G.track.def.sectors ? G.track.def.sectors.slice() : null,
    turns: G.track && G.track.def && G.track.def.turns ? G.track.def.turns.length : null,
  }),
  camState: () => G.dbgCam
    ? { eye: Array.from(G.dbgCam.eye), tgt: Array.from(G.dbgCam.target), fov: G.dbgCam.fov, roll: 0, debug: true }
    : { eye: Array.from(G.camEye), tgt: Array.from(G.camTgt), fov: G.camFov, roll: G.camRoll, debug: false },
  garageCam: () => ({
    on: G.setupPreviewOn, spin: G.setupPreviewSpin,
    az: G.setupPreviewAz, el: G.setupPreviewEl, dist: G.setupPreviewDist,
    pan: G.setupPreviewPan.slice(),
    // ACTIVE AERO in the garage: the switch and the FLAP TRAVEL it eases toward.
    // Separate fields on purpose — the button label follows the switch, so a
    // preview whose blend never moves still reads "X-MODE" while showing a car
    // that has not changed at all.
    xOn: G.setupPreviewXOn, aeroX: G.setupPreviewAeroX,
  }),
  // GARAGE ACTIVE AERO, drivable without a frame loop. The preview eases inside
  // the rAF render, and a headless page composites no frames at all, so the
  // whole garage animation was unobservable from a test — which is exactly how
  // "the wings do not move" reached a player instead of a spec. No argument
  // reads the state; garageStep(dt) advances the ease by dt seconds.
  garageAero(on) {
    if (!G.setupPreviewOn) return null;
    if (on !== undefined) G.setSetupAero(!!on);
    return { xOn: G.setupPreviewXOn, aeroX: +G.setupPreviewAeroX.toFixed(4),
             mode: G.setupPreviewAeroX > 0.05 ? "X" : "Z" };
  },
  // The resolved (level, style) the garage hands drawAeroFlaps, plus the pose
  // pair each element ends up with. An element whose closed and open angles are
  // EQUAL has been parked by the clearance solver and will never appear to move,
  // which is invisible from the outside unless something reports it.
  garageFlaps() {
    if (!G.setupPreviewOn) return null;
    const a = G.setupFlapArgs();
    const els = Car3D.aeroFlaps(a.aLvl, a.style);
    const deg = (r) => +(r * 180 / Math.PI).toFixed(2);
    return {
      aLvl: a.aLvl, style: a.style ? Object.keys(a.style).length : 0,
      elements: els.map((e) => ({
        id: e.id, wing: e.wing, hinge: +e.hinge.toFixed(2),
        closed: deg(e.zAngle), open: deg(e.xAngle), travel: deg(e.zAngle - e.xAngle),
        parked: Math.abs(e.zAngle - e.xAngle) < 1e-6,
      })),
    };
  },
  garageStep(dt, n) {
    if (!G.setupPreviewOn) return null;
    const step = dt == null ? 1 / 60 : dt;
    for (let i = 0; i < (n == null ? 1 : n); i++) G.stepSetupAero(step);
    return this.garageAero();
  },
  // Debug: hide/show individual track meshes. e.g. meshToggle({props:true}) hides props.
  meshToggle(o) { G.hideMeshes = Object.assign({}, G.hideMeshes, o || {}); return G.hideMeshes; },
  nodesNear(wx, wz, r) {
    if (!G.track) return [];
    const r2 = r * r, out = [];
    for (let i = 0; i < G.track.n; i++) {
      const dx = G.track.px[i] - wx, dz = G.track.pz[i] - wz;
      if (dx * dx + dz * dz < r2)
        out.push({ i, frac: +(i / G.track.n).toFixed(4), x: +G.track.px[i].toFixed(2), y: +G.track.py[i].toFixed(2), z: +G.track.pz[i].toFixed(2) });
    }
    return out;
  },
  // World position and orientation of a track node by fraction (0-1).
  nodeAt(frac) {
    if (!G.track) return null;
    const k = Math.round(frac * G.track.n) % G.track.n;
    return { k, frac: +(k / G.track.n).toFixed(4), x: +G.track.px[k].toFixed(3), y: +G.track.py[k].toFixed(3), z: +G.track.pz[k].toFixed(3), tx: +G.track.tx[k].toFixed(3), tz: +G.track.tz[k].toFixed(3), rx: +G.track.rx[k].toFixed(3), rz: +G.track.rz[k].toFixed(3) };
  },
  // Player telemetry for steering tests: lateral offset x (m, +=right of centre),
  // heading offset angle (rad, relative to track tangent), local curvature k
  // (rad/m, +=LEFT turn — measured in agentview.js's corner table; spline's old
  // "+ = right" comment was backwards), half-width hw (m), speed (m/s), arc s.
  probe() {
    if (!G.player || !G.track) return null;
    Tracks.sample(G.track, G.player.s, smp);
    let angle = 0;
    if (G.player.head != null) {
      const tAng = Math.atan2(smp.t[0], smp.t[2]);
      angle = tAng - G.player.head;
      while (angle > Math.PI) angle -= 2 * Math.PI;
      while (angle < -Math.PI) angle += 2 * Math.PI;
    }
    return {
      x: G.player.x, angle,
      k: Tracks.curvature(G.track, G.player.s),
      hw: smp.hw,
      speed: G.player.speed, s: G.player.s,
    };
  },
  // Look-ahead road sampler for closed-loop driving (the autopilot harness):
  // curvature k (rad/m, +=LEFT) and half-width hw at distAhead metres in front of
  // the player. Pass an array of distances to get one reading each, e.g. for
  // picking the sharpest corner inside a braking window. Pure read — no state change.
  scan(distAhead) {
    if (!G.player || !G.track) return null;
    const one = (d) => {
      const s = wrapS(G.player.s + (d || 0));
      Tracks.sample(G.track, s, smp);
      return { s, k: Tracks.curvature(G.track, s), hw: smp.hw, slope: smp.t[1] || 0 };
    };
    return Array.isArray(distAhead) ? distAhead.map(one) : one(distAhead);
  },
  projTest(frac, lateral) {
    if (!G.track) return null;
    const s = wrapS((frac || 0) * G.track.total);
    const lat = lateral || 0;
    Tracks.sample(G.track, s, smp);
    const wx = smp.p[0] + smp.r[0] * lat;
    const wz = smp.p[2] + smp.r[2] * lat;
    const p = Tracks.project(G.track, wx, wz, s);
    const ds = M4.wrapDelta(p.s - s, G.track.total);   // both in [0, L), so the while-loop copy this replaced could never fold twice either
    return { s, lat, world: [wx, wz], got: { s: p.s, lat: p.lat, dist: p.dist },
             err: { s: ds, lat: p.lat - lat } };
  },
  wsInfo() {
    if (!G.player || G.player.px == null) return "world-space not yet initialized";
    return { pos: [+G.player.px.toFixed(1), +G.player.pz.toFixed(1)],
             head: +(G.player.head * 180 / Math.PI).toFixed(1) + "°",
             s: +G.player.s.toFixed(1), x: +G.player.x.toFixed(2) };
  },
  tuning() {
    return {
      wheelbase: G.WHEELBASE,            // RESPONSE (shorter = snappier)
      expo: G.STEER_EXPO,                // LINEARITY
      maxSlip: G.STEER_MAX_SLIP,         // STEER LOCK
      speedRef: G.STEER_SPEED_REF,       // SPEED STEER (higher = sharper at speed)
      drift: G.DRIFT,                    // SLIDE (rear looseness)
      roadFollow: G.ROAD_FOLLOW,         // DRIVING HELP steer-assist gain
      playerGrip: G.PLAYER_GRIP,         // forgiveness headroom over AI grip
      frontGrip: G.FRONT_GRIP,           // front friction bias (understeer-safety)
      yawDamp: G.YAW_DAMP,               // yaw damping
      yawInertia: G.YAW_INERTIA,         // rotational-inertia scale (turn-in speed)
      pace: G.PACE,                      // OVERALL SPEED (player + AI)
      raceLineAssist: G.raceLineAssist,                  // RACING LINE
      maxTilt: Input.maxTilt,          // TILT SENSITIVITY (deg for full lock)
      deadzone: Input.deadzone,        // fixed dead zone (deg) — no longer a slider
      tiltCutoff: Input.minCutoff,     // STEER SMOOTHING (One-Euro min-cutoff, Hz)
    };
  },
  physState() {
    if (!G.player || G.player.px == null) return null;
    const slip = Math.atan2(G.player.vLat || 0, Math.max(1, G.player.speed));
    Tracks.sample(G.track, G.player.s, smp);
    const axFrac = Math.min(1, Math.abs(G.player.axEstSm ?? 0) / (LONG_GRIP * gripMult()));
    return {
      s: G.player.s, x: G.player.x, speed: G.player.speed, prog: G.player.prog,
      px: G.player.px, pz: G.player.pz,
      head: G.player.head, vLat: G.player.vLat || 0,
      yawRate: G.player.yawRateCur || 0,
      slipDeg: slip * 180 / Math.PI, slope: smp.t[1] || 0,
      wrongWay: !!G.player.wrongWay, rescueT: G.player.rescueT || 0, lap: G.player.lap,
      axEstSm: +(G.player.axEstSm ?? 0).toFixed(2),
      axFrac: +axFrac.toFixed(3),
      slipFactor: +Math.sqrt(Math.max(0, 1 - axFrac * axFrac)).toFixed(3),
      aeroX: +(G.player.aeroX || 0).toFixed(3),
      xOn: !!G.player.xOn, xArmed: !!G.player.xArmed,
      vmaxNow: +(G.player._vmaxNow || 0).toFixed(3),
      aeroGrip: +(G.player._aeroGrip || 0).toFixed(4),
      aeroDf: +G.aeroDfMult(G.player).toFixed(3),
      aeroLoad: +(G.player.aeroLoad != null ? G.player.aeroLoad : 0.5).toFixed(3),
      xVmaxGain: +G.xVmaxGain(G.player).toFixed(4),
      xDfLoss: +G.xDfLoss(G.player).toFixed(4),
      ersDeploy: +(G.player.ersDeploy != null ? G.player.ersDeploy : 0.5).toFixed(3),
      ersRegen: +(G.player.ersRegen != null ? G.player.ersRegen : 0.5).toFixed(3),
      drain: +G.drainFor(G.player).toFixed(4),
      regen: +G.regenFor(G.player).toFixed(4),
      otTime: +G.otTimeFor(G.player).toFixed(2),
      otCool: +G.otCoolFor(G.player).toFixed(2),
    };
  },
  wallStats() {
    if (!G.track || !G.track.barR) return null;
    let minB = Infinity, maxB = -Infinity, minOverHw = Infinity, anyNaN = false, tightSides = 0;
    for (let k = 0; k < G.track.n; k++) {
      const r = G.track.barR[k], l = G.track.barL[k];
      if (!Number.isFinite(r) || !Number.isFinite(l)) anyNaN = true;
      minB = Math.min(minB, r, l); maxB = Math.max(maxB, r, l);
      minOverHw = Math.min(minOverHw, r - G.track.hw[k], l - G.track.hw[k]);
      if (r < G.track.hw[k] + 8.99) tightSides++;
      if (l < G.track.hw[k] + 8.99) tightSides++;
    }
    return { minB, maxB, minOverHw, anyNaN, tightFrac: tightSides / (G.track.n * 2), street: !!G.track.street, n: G.track.n };
  },
  modelDiagnostics() {
    if (!G.track || !G.track.modelDiagnostics) return null;
    return JSON.parse(JSON.stringify(G.track.modelDiagnostics));
  },
  geometryDiagnostics() {
    if (!G.track || !G.track.geometryDiagnostics) return null;
    return JSON.parse(JSON.stringify(G.track.geometryDiagnostics));
  },
  trackGeometry(keep) {
    if (typeof keep === "boolean") Tracks.setKeepGeometry(keep);
    if (!G.track || !G.track.roadGeo || !G.track.terrainGeo) return null;
    return {
      road: G.track.roadGeo, terrain: G.track.terrainGeo,
      props: G.track.propsGeo, glass: G.track.glassGeo, water: G.track.waterGeo,
    };
  },
  maxWallOvershoot() {
    if (!G.track || !G.track.barR) return null;
    let m = 0;
    for (const c of G.cars) {
      if (c.finished) continue;
      const wr = Tracks.wallAt(G.track, c.s, 1), wl = Tracks.wallAt(G.track, c.s, -1);
      m = Math.max(m, c.x - wr, -wl - c.x, 0);
    }
    return m;
  },
  setPhysics(o) {
    o = o || {};
    if (o.drift != null) G.DRIFT = o.drift;
    if (o.pace != null) G.PACE = o.pace;
    if (o.speedRef != null) { G.STEER_SPEED_REF = o.speedRef; Input.setSteerSpeedRef(o.speedRef); }
    if (o.wheelbase != null) G.WHEELBASE = o.wheelbase;
    if (o.expo != null) G.STEER_EXPO = o.expo;
    if (o.maxSlip != null) G.STEER_MAX_SLIP = o.maxSlip;
    if (o.roadFollow != null) G.ROAD_FOLLOW = o.roadFollow;
    // core dynamic-model feel levers (swept by the emulation/tuning harness)
    if (o.playerGrip != null) G.PLAYER_GRIP = o.playerGrip;
    if (o.frontGrip != null) G.FRONT_GRIP = o.frontGrip;
    if (o.yawDamp != null) G.YAW_DAMP = o.yawDamp;
    if (o.yawInertia != null) G.YAW_INERTIA = o.yawInertia;
    if (o.maxTilt != null) Input.setTiltSensitivity(o.maxTilt);
    if (o.deadzone != null) Input.setTiltDeadzone(o.deadzone);
    if (o.tiltCutoff != null) Input.setTiltSmoothing(o.tiltCutoff);
    return this.tuning();
  },

  setSpeed(v) {
    if (!G.player || G.player.px == null) return false;
    G.player.speed = Math.max(0, Math.min(200, v));
    return { speed: G.player.speed };
  },

  // spin(deg) — add a heading offset to the player (degrees, +CW viewed from above).
  // Simulates a snap-oversteer or a scripted orientation change. Zeroes lateral
  // velocity and yaw rate after rotating so the car doesn't immediately un-spin.
  // Use spin(180) to face the wrong way, spin(-45) for a 45° drift setup.
  spin(deg) {
    if (!G.player || G.player.px == null) return false;
    G.player.head = G.player.head + deg * Math.PI / 180;
    G.player.vLat = 0;
    G.player.yawRateCur = 0;
    return { head: +(G.player.head * 180 / Math.PI).toFixed(1) + "°" };
  },

  nudge(dLat = 0, dSpeed = 0) {
    if (!G.player || G.player.px == null) return false;
    if (dLat)   G.player.vLat  = (G.player.vLat || 0) + dLat;
    if (dSpeed) G.player.speed = Math.max(0, (G.player.speed || 0) + dSpeed);
    return { speed: +(G.player.speed || 0).toFixed(2), vLat: +(G.player.vLat || 0).toFixed(2) };
  },

  view(opts) {
    if (!G.track) return false;
    if (opts === "chase" || (opts && opts.mode === "chase")) { G.dbgCam = null; return { mode: "chase" }; }
    opts = opts || {};
    // free-look: explicit eye, aimed by yaw (0 = -Z, +90 = +X) and pitch (deg)
    if (opts.eye && (opts.yaw != null || opts.pitch != null)) {
      const yaw = (opts.yaw || 0) * Math.PI / 180, pit = Math.min(80, Math.max(-80, opts.pitch || 0)) * Math.PI / 180;
      const d = [Math.sin(yaw) * Math.cos(pit), Math.sin(pit), -Math.cos(yaw) * Math.cos(pit)];
      const e = opts.eye;
      G.dbgCam = { eye: e.slice(), target: [e[0] + d[0] * 100, e[1] + d[1] * 100, e[2] + d[2] * 100], fov: Math.min(170, Math.max(1, opts.fov || 60)), far: opts.far || 6000, fog: opts.fog };
      return { eye: e.slice(), yaw: opts.yaw || 0, pitch: opts.pitch || 0 };
    }
    if (opts.eye && opts.target) {
      G.dbgCam = { eye: opts.eye.slice(), target: opts.target.slice(), fov: Math.min(170, Math.max(1, opts.fov || 60)), far: opts.far || 6000, fog: opts.fog };
      return G.dbgCam;
    }
    if (opts.s != null && opts.side != null) {
      Tracks.sample(G.track, opts.s * G.track.total, smp);
      const side = opts.side === "L" ? -1 : opts.side === "R" ? 1 : (opts.side || 1);
      const dist = opts.dist != null ? opts.dist : 14, height = opts.height != null ? opts.height : 9;
      const p = smp.p, r = smp.r;
      const eye = [p[0] + r[0] * side * dist, p[1] + height, p[2] + r[2] * side * dist];
      const target = opts.look === "in"
        ? [p[0], p[1] + 1, p[2]]
        : [p[0] + r[0] * side * (dist + 80), p[1] + height * 0.4, p[2] + r[2] * side * (dist + 80)];
      G.dbgCam = { eye, target, fov: Math.min(170, Math.max(1, opts.fov || 62)), far: opts.far || 6000, fog: opts.fog };
      return { eye, target };
    }
    // centre + span: a focus point at lap-fraction s, or the whole-track bbox
    let cx, cy, cz, span;
    if (opts.s != null) {
      Tracks.sample(G.track, opts.s * G.track.total, smp);
      cx = smp.p[0]; cy = smp.p[1]; cz = smp.p[2];
      span = Math.max(10, opts.radius || 180);
    } else {
      let nx = Infinity, xx = -Infinity, nz = Infinity, xz = -Infinity, ny = Infinity, xy = -Infinity;
      for (let i = 0; i < G.track.n; i++) {
        const x = G.track.px[i], z = G.track.pz[i], y = G.track.py[i];
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
    G.dbgCam = { eye, target: [cx, cy, cz], fov: Math.min(170, Math.max(1, opts.fov || 55)), far: Math.max(6000, dist * 4), fog: opts.fog };
    return { eye, target: [cx, cy, cz], span: Math.round(span) };
  },
  eyeAt(f, lat = 0, h = 2.5, lookF, lookLat = 0, lookH = 1) {
    if (!G.track) return false;
    const sPos = ((f % 1) + 1) % 1 * G.track.total;
    Tracks.sample(G.track, sPos, smp);
    const bk = Tracks.banking(G.track, sPos, lat);
    const eye = [smp.p[0] + smp.r[0] * lat, smp.p[1] + h + (bk ? bk.dy : 0), smp.p[2] + smp.r[2] * lat];
    const lf = lookF == null ? f + 0.01 : lookF;
    const lPos = ((lf % 1) + 1) % 1 * G.track.total;
    Tracks.sample(G.track, lPos, smp2);
    const lbk = Tracks.banking(G.track, lPos, lookLat);
    const tgt = [smp2.p[0] + smp2.r[0] * lookLat, smp2.p[1] + lookH + (lbk ? lbk.dy : 0), smp2.p[2] + smp2.r[2] * lookLat];
    G.dbgCam = { eye, target: tgt, fov: 60, far: 6000 };
    return { eye, target: tgt };
  },
  orbit(f, az = 35, el = 18, dist = 30, h = 1.5, opts = {}) {
    if (!G.track) return false;
    Tracks.sample(G.track, ((f % 1) + 1) % 1 * G.track.total, smp);
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
    G.dbgCam = { eye, target: [cx, cy, cz], fov, far: opts.far || 6000, fog: opts.fog };
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
    if (!G.track) return false;
    const fr = ((frac % 1) + 1) % 1;
    const k = Tracks.curvature(G.track, fr * G.track.total);
    // +k is a LEFT-hand bend (measured — agentview.js corner-table note), whose
    // outside is the RIGHT side of the road; orbit()'s az>0 is the right side.
    // So az = +sign(k)·mag puts the camera on the outside, shooting across the
    // apex. (This read -sign(k) for as long as the old "+k = right" comment
    // lived: the cinematic cam sat on the INSIDE of every corner.)
    // Strength scales with |k| up to a tight-hairpin cap so the angle doesn't over-rotate.
    const kAbs = Math.min(Math.abs(k), 0.05);
    const baseAz = k === 0 ? 35 : Math.sign(k) * (70 + 40 * kAbs / 0.05);
    const az = baseAz + (opts.azOff || 0);
    const dist = opts.dist != null ? opts.dist : 60;
    const el   = opts.el   != null ? opts.el   : 18;
    const h    = opts.h    != null ? opts.h    : 1.5;
    const fov  = opts.fov  != null ? opts.fov  : 52;
    const res  = this.orbit(fr, az, el, dist, h, { fov, far: opts.far, fog: opts.fog });
    return res ? Object.assign(res, { az: +az.toFixed(1), k: +k.toFixed(5) }) : false;
  },

  studio(arg = true) {
    if (arg === false || arg === 0) {
      if (G._studioRig && G._studioRig._ambStash) {   // restore the session ambient
        G.frame.ambientSky = G._studioRig._ambStash[0];
        G.frame.ambientGround = G._studioRig._ambStash[1];
      }
      G._studioRig = null;
      return false;
    }
    const o = typeof arg === "object" && arg ? arg : {};
    if (G._studioRig && G._studioRig._ambStash) {     // re-config: restore before re-stash
      G.frame.ambientSky = G._studioRig._ambStash[0];
      G.frame.ambientGround = G._studioRig._ambStash[1];
    }
    G._studioRig = {
      n: o.n || 6, dist: o.dist || 7, h: o.h != null ? o.h : 4.5,
      intensity: o.intensity != null ? o.intensity : 1.6,
      color: o.color || [1, 1, 1], radius: o.radius || 18, spin: o.spin || 0,
      fill: o.fill != null ? o.fill : 0.5,
    };
    const f = G._studioRig.fill;
    if (f > 0) {
      G._studioRig._ambStash = [G.frame.ambientSky, G.frame.ambientGround];
      const mixv = (a, b) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
      G.frame.ambientSky = mixv(G.frame.ambientSky || [0, 0, 0], [0.30, 0.31, 0.35]);
      G.frame.ambientGround = mixv(G.frame.ambientGround || [0, 0, 0], [0.20, 0.19, 0.18]);
    }
    return G._studioRig;
  },
  carOrbit(idx = 0, az = 180, el = 14, dist = 25, h = 1.0, opts = {}) {
    if (!G.track || !G.cars || !G.cars.length) return false;
    const c = (idx <= 0 || !G.cars[idx]) ? (G.player || G.cars[0]) : G.cars[idx];
    if (!c) return false;
    // World pose when mirrored (player + field); else Frenet (s, x).
    const s = ((c.s % G.track.total) + G.track.total) % G.track.total;
    Tracks.sample(G.track, s, smp);
    const cx = (c.px != null) ? c.px : smp.p[0] + smp.r[0] * (c.x || 0);
    const cz = (c.pz != null) ? c.pz : smp.p[2] + smp.r[2] * (c.x || 0);
    const cyf = smp.p[1] + h;
    // Heading basis: a human car has a real yaw (c.head); AI uses the tangent.
    const hd = (c.human && c.head != null) ? c.head : Math.atan2(smp.t[0], smp.t[2]);
    const fwdX = Math.sin(hd), fwdZ = Math.cos(hd);
    const rtX  = Math.cos(hd), rtZ  = -Math.sin(hd);
    const a = az * Math.PI / 180, e = Math.min(85, Math.max(-30, el)) * Math.PI / 180;
    const dir = [-Math.cos(a) * fwdX + Math.sin(a) * rtX, 0, -Math.cos(a) * fwdZ + Math.sin(a) * rtZ];
    const eye = [cx + dir[0] * Math.cos(e) * dist, cyf + Math.sin(e) * dist, cz + dir[2] * Math.cos(e) * dist];
    eye[1] = Math.max(eye[1], smp.p[1] + 1.2);   // keep the eye above ground (see orbit)
    const fov = Math.min(170, Math.max(1, opts.fov != null ? opts.fov : 55));
    G.dbgCam = { eye, target: [cx, cyf, cz], fov, far: opts.far || 4000, fog: opts.fog };
    return { eye, target: [cx, cyf, cz], fov, carIdx: idx, speed: +(c.speed || 0).toFixed(1) };
  },
  dolly(f, fwd = 0, right = 0, up = 5, opts = {}) {
    if (!G.track) return false;
    const fr = ((f % 1) + 1) % 1;
    Tracks.sample(G.track, fr * G.track.total, smp);
    const p = smp.p, t = smp.t, r = smp.r;
    const eye = [
      p[0] + t[0] * fwd + r[0] * right,
      p[1] + up,
      p[2] + t[2] * fwd + r[2] * right,
    ];
    const lf = ((((opts.lookF != null ? opts.lookF : f + 0.015) % 1) + 1) % 1);
    Tracks.sample(G.track, lf * G.track.total, smp2);
    const lr = opts.lookLat || 0, lh = opts.lookH != null ? opts.lookH : 1.5;
    const tgt = [smp2.p[0] + smp2.r[0] * lr, smp2.p[1] + lh, smp2.p[2] + smp2.r[2] * lr];
    G.dbgCam = { eye, target: tgt, fov: Math.min(170, Math.max(1, opts.fov || 58)), far: opts.far || 6000, fog: opts.fog };
    return { eye, target: tgt };
  },

  roadside(f, side = 1, dist = 10, h = 2.5, opts = {}) {
    if (!G.track) return false;
    const fr = ((f % 1) + 1) % 1;
    Tracks.sample(G.track, fr * G.track.total, smp);
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
      const lf = ((fr + sign * la / G.track.total % 1) + 1) % 1;
      Tracks.sample(G.track, lf * G.track.total, smp2);
      tgt = [smp2.p[0], smp2.p[1] + 1, smp2.p[2]];
    }
    G.dbgCam = { eye, target: tgt, fov: Math.min(170, Math.max(1, opts.fov || 58)), far: opts.far || 6000, fog: opts.fog };
    return { eye, target: tgt, look };
  },

  tourShots(n = 12, opts = {}) {
    if (!G.track) return [];
    const dist    = opts.dist     != null ? opts.dist     : 80;
    const el      = opts.el       != null ? opts.el       : 20;
    const azOff   = opts.azOffset != null ? opts.azOffset : 35;
    const shots   = [];
    if (opts.atCorners) {
      // Detect apexes (local curvature maxima) and frame each from the outside.
      const tn = G.track.n, total = G.track.total, kv = [];
      for (let k = 0; k < tn; k++) kv.push(Tracks.curvature(G.track, k / tn * total));
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
        const az = Math.sign(k) * (70 + 40 * Math.min(Math.abs(k), 0.05) / 0.05);
        shots.push({ frac: +(c.k / tn).toFixed(4), az: +az.toFixed(1), el, dist, label: `corner-${String(i + 1).padStart(2, "0")}` });
      });
      return shots;
    }
    for (let i = 0; i < n; i++) {
      const frac = i / n;
      const side  = i % 2 === 0 ? 1 : -1;
      const az    = azOff * side;
      shots.push({ frac: +frac.toFixed(4), az, el, dist, label: `shot-${String(i).padStart(2, "0")}` });
    }
    return shots;
  },

  groundY(f, lat = 0) {
    if (!G.track) return false;
    Tracks.sample(G.track, ((f % 1) + 1) % 1 * G.track.total, smp);
    const x = smp.p[0] + smp.r[0] * lat, z = smp.p[2] + smp.r[2] * lat;
    const ty = Tracks.terrainY(G.track, x, z);
    return { x: +x.toFixed(2), z: +z.toFixed(2), roadY: +smp.p[1].toFixed(3), terrainY: ty == null ? null : +ty.toFixed(3), gap: ty == null ? null : +(ty - smp.p[1]).toFixed(3) };
  },
  // Controlled side-by-side test: race state, two AI cars placed dead-even at a
  // mid-track straight with overlapping lateral positions and equal speed; every
  // other car (incl. the player) is shoved far away. Returns the two test ids.
  // Lets a harness measure pure side-by-side jitter without pack chaos.
  pair(frac, speed) {
    if (!G.track) return false;
    G.state = "race"; G.raceT = Math.max(G.raceT, 1);
    els.lights.hidden = true;
    for (const l of els.lights.children) l.classList.remove("on");
    G.lightsLit = 0;   // the DOM alone leaves the counter at 5 — see the façade
    const f = frac == null ? 0.3 : frac, v = speed == null ? 55 : speed;
    const prog = f * G.track.total, s = wrapS(prog);
    const ai = G.cars.filter((c) => !c.isPlayer);
    if (ai.length < 2) return false;   // needs ≥2 AI cars — unavailable in time trial
    const a = ai[0], b = ai[1];
    [a, b].forEach((c, i) => {
      c.prog = prog; c.s = s; c.speed = v;
      c.x = i === 0 ? 0.6 : -0.6;   // overlap within the ~2 m car width
      c.xVis = c.x; c.lap = 0; c.finished = false;
    });
    G.cars.forEach((c) => { if (c !== a && c !== b) { c.prog -= 800; c.s = wrapS(c.s - 800); } });
    return { a: G.cars.indexOf(a), b: G.cars.indexOf(b) };
  },
  jam(n) {
    if (!G.track) return false;
    G.state = "race"; G.raceT = Math.max(G.raceT, 1);
    els.lights.hidden = true;
    for (const l of els.lights.children) l.classList.remove("on");
    G.lightsLit = 0;   // the DOM alone leaves the counter at 5 — see the façade
    const ai = G.cars.filter((c) => !c.isPlayer), m = Math.min(n || 5, ai.length);
    const prog = 0.5 * G.track.total;
    const ids = [];
    ai.forEach((c, i) => {
      if (i < m) {
        c.prog = prog + (i - m / 2) * 0.4;     // tightly stacked longitudinally
        c.s = wrapS(c.prog); c.speed = 2; c.x = (i - m / 2) * 0.3;  // and laterally
        c.xVis = c.x; c.lap = 0; c.finished = false; c.stuckT = 0;
        ids.push(G.cars.indexOf(c));
      } else { c.prog -= 800; c.s = wrapS(c.s - 800); }
    });
    G.cars.forEach((c) => { if (c.isPlayer) { c.prog -= 800; c.s = wrapS(c.s - 800); } });
    return ids;
  },
  rival(dProg, dx) {
    if (!G.player || !G.track) return false;
    const ai = G.cars.find((c) => !c.isPlayer);
    if (!ai) return false;
    ai.prog = G.player.prog + (dProg || 0);
    ai.s = wrapS(G.player.s + (dProg || 0));
    ai.x = G.player.x + (dx || 0);
    ai.xVis = ai.x; ai.speed = G.player.speed; ai.finished = false; ai.lap = G.player.lap;
    G.cars.forEach((c) => { if (c !== ai && !c.isPlayer) { c.prog -= 800; c.s = wrapS(c.s - 800); } });
    return { rival: G.cars.indexOf(ai) };
  },
  rivals(list) {
    if (!G.player || !G.track) return false;
    const ai = G.cars.filter((c) => !c.isPlayer);
    const used = [];
    (list || []).forEach((spec, i) => {
      const c = ai[i];
      if (!c) return;
      c.prog = G.player.prog + (spec.dProg || 0);
      c.s = wrapS(G.player.s + (spec.dProg || 0));
      c.x = G.player.x + (spec.dx || 0);
      c.xVis = c.x; c.speed = spec.speed != null ? spec.speed : G.player.speed;
      c.finished = false; c.lap = G.player.lap;
      used.push(c);
    });
    ai.forEach((c) => { if (!used.includes(c)) { c.prog -= 800; c.s = wrapS(c.s - 800); } });
    return used.map((c) => G.cars.indexOf(c));
  },
  aim(relDeg) {
    if (!G.player || !G.track || G.player.px == null) return false;
    Tracks.sample(G.track, G.player.s, smp);
    G.player.head = Math.atan2(smp.t[0], smp.t[2]) + (relDeg || 0) * Math.PI / 180;
    G.player.vLat = 0;
    return { head: G.player.head };
  },
  go() {
    G.state = "race"; G.raceT = Math.max(G.raceT, 0.5);
    els.lights.hidden = true;
    for (const l of els.lights.children) l.classList.remove("on");
    G.lightsLit = 0;   // the DOM alone leaves the counter at 5 — see the façade
    return G.state;
  },
  cars: () => G.cars.map((c, i) => ({
    id: i, x: +c.x.toFixed(3), xv: +((c.xVis !== undefined ? c.xVis : c.x)).toFixed(3),
    yaw: +(c.yawVis || 0).toFixed(4),
    prog: +c.prog.toFixed(2), speed: +c.speed.toFixed(2), lap: c.lap,
    ct: +(c.contactT || 0).toFixed(2), kerb: !!c.onKerb, p: !!c.isPlayer,
    ax: +(c.aeroX || 0).toFixed(2),
  })),
  // Lap fractions of curvature-peak apexes (local maxima of |curvature|).
  // Distinct from curated FIA turns on track.def.turns / info().turns — use those
  // for official turn counts; this hook is for physics/parking at sharp bends.
  corners() {
    if (!G.track) return [];
    const n = G.track.n, total = G.track.total, kv = [];
    for (let k = 0; k < n; k++) kv.push(Math.abs(Tracks.curvature(G.track, k / n * total)));
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
    G.trackIdx = i;
    G.seasonMode = false;
    G.timeTrial = false;
    G.raceLaps = GAME_LAPS;
    G.raceWeather = (weather === "wet" || weather === "rain" || weather === "overcast" || weather === "fog") ? weather : "dry";
    G.raceTimeOfDay = timeOfDay || "default";
    startRace();
    return { track: Tracks.LIST[i].id, timeOfDay: G.raceTimeOfDay, weather: G.raceWeather };
  },
  tt(trackRef, timeOfDay) {
    const i = typeof trackRef === "number"
      ? trackRef
      : Tracks.LIST.findIndex((t) => t.id === trackRef);
    if (i == null || i < 0 || i >= Tracks.LIST.length) return false;
    G.trackIdx = i;
    G.seasonMode = false;
    G.timeTrial = true;
    G.raceLaps = TT_LAPS;
    G.raceWeather = "dry";
    G.raceTimeOfDay = timeOfDay || "default";
    startRace();
    return { track: Tracks.LIST[i].id, timeTrial: true };
  },
  career(opts) {
    if (opts === undefined) return Career.data();
    if (opts === true) { openCareer(); return Career.data(); }
    Career.start(opts || {});
    openCareer();
    return Career.data();
  },
  // Compact snapshot for assertions and HUDs — never the whole save.
  careerState: () => Career.state(),
  careerMoney(n) {
    const c = Career.data();
    if (!c) return null;
    if (n != null) { c.money = Math.max(0, n | 0); Career.save(); }
    return c.money;
  },
  careerReset() { Career.clear(); G.refreshCareerButton(); return true; },
  careerFreeMoney(on) { return Career.freeMoney(on); },
  // Hand the live career credits. No argument grants Career.GRANT.
  careerGrant(n) { return Career.grant(n); },
  careerFacility(up) {
    if (up) Career.upgradeFacility();
    return { level: Career.facility(), max: Career.FACILITY_MAX,
             cost: Career.facilityCost(), discount: Career.facilityDiscount() };
  },
  careerHire(what) {
    if (what === "renew") Career.renewHire(1);
    else if (typeof what === "string") Career.hireDriver(what, 1);
    return Career.hirePending();
  },
  careerSlots(flavour, i) {
    if (i === undefined) return Career.slots(flavour);
    const c = Career.useSlot(flavour, i);
    G.refreshCareerButton();
    return c;
  },
  careerSlotDelete(flavour, i) {
    Career.deleteSlot(flavour, i);
    Career.load();               // land on whatever is left, anywhere
    G.refreshCareerButton();
    return Career.slots();
  },
  // Settle `n` whole rounds WITHOUT driving them. The qualifying model supplies
  // the pace order, a ratings-weighted draw turns it into a race result, and the
  // result goes through the same championship award + Career.settleRound() the
  // driven path uses — so the economy, the objectives and the standings are
  // genuinely exercised rather than poked. A full season is 24 real races
  // otherwise, which is not a test anyone will run.
  //
  // Needs a track and a grid loaded, because the quali model reads both: stage
  // one weekend first (the hub -> race settings -> TO THE GRID path, or
  // tests/specs/career.spec.js's goRacing helper). Every round is simulated on THAT
  // circuit — the per-round variation comes from the seeded draw, not from
  // rebuilding twenty-four tracks headlessly.
  careerSim(n) {
    if (!Career.data()) return null;
    const out = [];
    for (let i = 0; i < Math.max(1, n | 0); i++) {
      if (Career.seasonDone()) break;
      const r = simCareerRound();
      if (!r) break;
      out.push(r);
    }
    return out;
  },
  careerRollover() {
    const out = Career.rollover();
    if (out) G.refreshCareerButton();
    return out;
  },
  reliability(level) {
    if (level !== undefined) G.raceReliability = String(level).toLowerCase();
    return G.raceReliability;
  },
  retirements: () => Reliability.plan(G.cars),
  retire(idx, reason) {
    const c = idx == null ? G.player : G.cars[idx | 0];
    if (!c || !G.track) return null;
    if (!c.retired) G.retireCar(c, reason || "engine");
    return { idx: G.cars.indexOf(c), code: c.code, retired: true, why: c.dnf };
  },
  qualiSim: (playerTime) => G.qualiSim(playerTime),
  ratings(code) {
    const one = (c, tier, teamId, seat) => {
      const r = DriverRatings.get(c, tier, Career.devFor(teamId, seat));
      return Object.assign({}, r, { overall: DriverRatings.overall(r) });
    };
    if (code) {
      const car = G.cars.find((x) => x.code === code);
      return car ? one(code, car.tier, car.team && car.team.id, car.seat) : one(code, 2, null, 0);
    }
    const out = {};
    Teams.LIST.forEach((t) => t.drivers.forEach((d, i) => { out[d.code] = one(d.code, t.tier, t.id, i); }));
    return out;
  },
  loadCarModel: (url) => loadCarModel(url),
  // Baked asset pack (js/render/assets.js, built by tools/assets.mjs)
  // assets() — {supported, pack, uploaded, tier, layers, normal, bytes, models,
  //   error}. `supported:false` means the active renderer has no texture-array
  //   path (WGX/WebGPU); `pack:false` means no pack is installed. Both are
  //   normal states in which the game renders its pure-procedural look.
  assets: () => (typeof Assets === "undefined" ? { supported: false, pack: false, error: "no-module" }
                                               : Assets.state()),
  async assetLoad(tier) {
    if (typeof Assets === "undefined") return { supported: false, pack: false, error: "no-module" };
    if (tier === false) { Assets.unload(); return Assets.state(); }
    Assets.unload();                                   // clear the memoised promise so a tier switch re-uploads
    await Assets.load(tier ? { tier } : {});
    return Assets.state();
  },
  matTex(v) {
    if (v !== undefined) {
      setLightTune("matTexMix", Math.max(0, Math.min(1, +v || 0)));
      persistLightTune();
      if (typeof refreshLightTunePanel === "function") refreshLightTunePanel();
      if (LT.matTexMix > 0 && typeof Assets !== "undefined") Assets.load();
    }
    return LT.matTexMix;
  },
  // envProbe(on?) — the clear path for the apex26.envProbeOff LATCH.
  //
  // GLX sets that key on a WebGL context loss that happened while the page was
  // VISIBLE (the memory-pressure signal, as opposed to iOS's benign loss on
  // backgrounding). Persisting it stops a lose→reload→lose loop on genuinely
  // memory-tight devices, which is right — but there was one setItem, one
  // getItem, and nothing anywhere that could clear it: no UI, no hook, no
  // mention in the docs. A device that lost its context once kept the live
  // env-probe reflections disabled forever, and it presents as "reflections
  // are just worse on my phone" rather than as a setting.
  //
  // No argument reads the state. `true` re-enables the probe, `false` disables
  // it. game.js latches the value at module init, so a change needs a reload —
  // reported rather than done silently.
  envProbe(on) {
    const KEY = "apex26.envProbeOff";
    const read = () => { try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; } };
    const was = read();
    if (on !== undefined) {
      try { if (on) localStorage.removeItem(KEY); else localStorage.setItem(KEY, "1"); }
      catch (e) { /* private mode / storage disabled — nothing to clear */ }
    }
    const off = read();
    return { on: !off, off, changed: off !== was, needsReload: off !== was };
  },
  // credits() — attribution roll for every baked asset in the pack.
  credits: () => (typeof Assets === "undefined" ? [] : Assets.credits()),
  setInput(v) {
    const next = v || null;
    if (G.player && G._testInput && G._testInput.throttle && next && !next.throttle && G.player.speed > 8)
      G.player.exhaustPop = 1;
    G._testInput = next;
  },
  clearInput() { G._testInput = null; },
  step(dt, n) {
    const d = dt != null ? dt : 1 / 60, count = n != null ? n : 1;
    for (let i = 0; i < count; i++) {
      // Keep the render-interpolation anchors in sync (the render-driven loop
      // snapshots these before each step; a manual pump must too, or a frozen
      // render afterwards lerps toward a stale pre-teleport position).
      // ALL FOUR, matching the loop: the player renders from WORLD space, so
      // rPrevPx/rPrevPz drive its drawn position and rPrevHead its drawn heading.
      // Snapshotting only (s, x) left those two holding whatever the grid or the
      // previous session put there, so a headless jump()+step()+frozen render put
      // the car — and with it the whole camera-anchored cockpit rig — somewhere
      // else entirely, with no error to show for it.
      for (let j = 0; j < G.cars.length; j++) {
        const c = G.cars[j];
        c.rPrevS = c.s; c.rPrevX = c.x;
        c.rPrevPx = c.px; c.rPrevPz = c.pz;
        c.rPrevYawVis = c.yawVis; c.rPrevHead = c.head;
      }
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

  // New dev / test helpers

  // Trigger the race-results screen cleanly, as if all cars crossed the line.
  finishRace() {
    if (!G.track || G.state === "results" || G.state === "menu") return false;
    // A retirement never crosses the line: it stays unfinished and classifies
    // behind everyone who did, which is the order endRace() builds for a real
    // flag. Waving one home here would hand a parked car a finish and points.
    G.cars.forEach((c) => { if (!c.finished && !c.retired) { c.finished = true; c.finishT = G.raceT; } });
    const home = G.cars.filter((c) => !c.retired).sort((a, b) => b.prog - a.prog);
    const out = G.cars.filter((c) => c.retired).sort((a, b) => b.prog - a.prog);
    endRace(home.concat(out));
    return { state: G.state };
  },

  freeze(v) {
    if (v === undefined) return G.frozen;
    G.frozen = !!v;
    return G.frozen;
  },

  // Get or set HUD visibility. Returns current visible state.
  hud(show) {
    if (show === undefined) return !els.hud.hidden;
    els.hud.hidden = !show;
    if (show) { els.pausebtn.hidden = (G.state !== "race"); } else { els.pausebtn.hidden = true; }
    return !els.hud.hidden;
  },

  weather(w) {
    return G.weather(w);
  },

  weatherArc(from, to, seconds) {
    if (from === undefined) {
      return G.weatherArc ? { from: G.weatherArc.from, to: G.weatherArc.to, t: G.weatherArc.t,
                            dur: G.weatherArc.dur, weather: G.raceWeather, wetness: G.frame.wetness || 0 } : null;
    }
    if (from === null || from === false) { G.weatherArc = null; return null; }
    const arc = startWeatherArc(from, to, seconds);
    return arc ? { from: arc.from, to: arc.to, t: arc.t, dur: arc.dur, weather: G.raceWeather } : null;
  },

  setTimeOfDay(tod) {
    return G.setTimeOfDay(tod);
  },

  resetPlayer() {
    if (!G.player) return false;
    rescuePlayer(G.player);
    return this.physState();
  },

  inputState() { return Input.debugState(); },

  // Detailed telemetry for a single car by index (from cars() list).
  carAt(idx) {
    const c = typeof idx === "number" ? G.cars[idx] : G.cars.find((x) => x.isPlayer);
    if (!c) return null;
    return {
      id: G.cars.indexOf(c), driverId: c.driverId,
      isPlayer: !!c.isPlayer, team: c.team && c.team.id,
      code: c.code, seat: c.seat,
      tierV: +(c.tierV || 0).toFixed(6), skill: +(c.skill || 0).toFixed(6), aeroLoad: +(c.aeroLoad != null ? c.aeroLoad : 0.5).toFixed(3), ersDeploy: +(c.ersDeploy != null ? c.ersDeploy : 0.5).toFixed(3),
      craft: +(c.craft != null ? c.craft : 0.75).toFixed(3),
      awareness: +(c.awareness != null ? c.awareness : 0.75).toFixed(3),
      experience: +(c.experience != null ? c.experience : 0.75).toFixed(3), consistency: +(c.consistency != null ? c.consistency : 0.75).toFixed(3),
      lane: +(c.lane != null ? c.lane : 0).toFixed(3),
      stuckT: c.human ? null : +(c.stuckT || 0).toFixed(2),
      deploying: c.human ? null : !!c.deploying,
      ratings: DriverRatings.get(c.code, c.tier, Career.devFor(c.team && c.team.id, c.seat)),
      x: +c.x.toFixed(3), speed: +c.speed.toFixed(2),
      prog: +c.prog.toFixed(2), s: +c.s.toFixed(2), lap: c.lap,
      finished: !!c.finished, finishT: c.finishT != null ? +c.finishT.toFixed(2) : null,
      finPos: c.finPos || 0,   // classified position, 0 until the flag
      retired: !!c.retired, dnf: c.dnf || null,
      dnfAt: c.dnfAt != null ? +c.dnfAt.toFixed(4) : null,
      contactT: +(c.contactT || 0).toFixed(3),
      wrongWay: !!c.wrongWay, rescueT: +(c.rescueT || 0).toFixed(2),
      energy: +(c.energy || 0).toFixed(3), boostOn: !!c.boostOn,
      // OVERTAKE, alongside the aero fields below. It was unobservable: xArmed
      // has been here since active aero landed but its older sibling never was,
      // so "can this car use overtake right now, and why not" could only be
      // answered by reading game.js. otEnabled is the RACE-WIDE gate (lap 1,
      // and any caution) and is the same for every car; otArmed folds that
      // together with this car's own proximity and cooldown.
      otArmed: !!c.otArmed, otT: +(c.otT || 0).toFixed(2),
      otCool: +(c.otCool || 0).toFixed(2), otEnabled: !!G.otEnabled(),
      aeroX: +(c.aeroX || 0).toFixed(3), xOn: !!c.xOn, xArmed: !!c.xArmed,
      brakeHeat: +(c.brakeHeat || 0).toFixed(2), gear: c.gear || 1,
    };
  },

  // List all available circuit IDs and names (for iterating in test harnesses).
  // The built track's scenery SCENE GRAPH (js/track/graph.js): the model library
  // + one node per placement, plus batches() — the backend-neutral instanced-draw
  // handoff. Returns null before a track is built. Live object, not a copy: read
  // it, do not mutate it.
  // Get or PIN the render clock (sky/cloud drift, FLAG cloth wave). It normally
  // accumulates real frame dt, so two runs of the same frozen scene render
  // different pixels — the reason tests/manual/tracks-visual.spec.js could never hold a
  // baseline. Setting it makes a capture reproducible; it keeps advancing from
  // the value you set unless the scene is also headless().
  renderClock(t) { if (t !== undefined) G.skyT = t; return G.skyT; },
  trackGraph: () => (G.track && G.track.graph) || null,
  tracks: () => Tracks.LIST.map((t, i) => ({ id: t.id, name: t.name, i })),

  // List all teams with engine supplier (for factory-parts and setup tests).
  teams: () => Teams.LIST.map((t, i) => ({ id: t.id, name: t.name, engine: t.engine, i })),

  // Reset mesh-visibility overrides (companion to meshToggle).
  clearMeshes() { G.hideMeshes = {}; return G.hideMeshes; },

  lightState: () => {
    const L = G.frame.lights;
    let meanLampRGB = null;
    if (L && L.length >= 15) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i + 5 < L.length; i += 15) {
        r += L[i + 3]; g += L[i + 4]; b += L[i + 5]; n++;
      }
      if (n) meanLampRGB = [r / n, g / n, b / n];
    }
    return {
      ambientSky: G.frame.ambientSky && G.frame.ambientSky.slice(),
      ambientGround: G.frame.ambientGround && G.frame.ambientGround.slice(),
      sunColor: G.frame.sunColor && G.frame.sunColor.slice(),
      exposure: G.frame.exposure != null ? G.frame.exposure : 1,
      numLights: L ? L.length / 15 : 0,
      meanLampRGB,
      // The per-chunk twin of meanLampRGB: the mean colour of the lamp set the
      // CHUNKED meshes are lit from. It used to be the raw baked list — no LAMP
      // LEVEL, TEMPERATURE, FLICKER, WARM-UP or twilight ramp — which is what
      // made those sliders look broken on everything chunked. Now it tracks
      // them, and the two means should move together.
      meanPerChunkRGB: (() => {
        const A = G.frame.allLights;
        if (!A || A.length < 15) return null;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < A.length; i += 15) { r += A[i+3]; g += A[i+4]; b += A[i+5]; n++; }
        return n ? [r / n, g / n, b / n] : null;
      })(),
      bakedLights: ((G.track && (G.track._lights && G.track._lights.length ? G.track._lights : G.track._alwaysLights)) || []).length / 15,
      lampPosts: G.track && G.track.lampPosts ? G.track.lampPosts.length : 0,
      // RESOLVED per-chunk lamp state, not the raw knobs. Three gates can zero
      // these independently (backend capability, the live graphics tier the
      // governor can shed mid-race, and the persisted post-context-loss latch),
      // and nothing used to report which one fired — so "per-chunk lamps do
      // nothing on my machine" was undiagnosable from outside. perChunkHeld
      // names the gate when the knob is up but the frame resolved to 0.
      perChunkLights: G.frame.perChunkLights || 0,
      roadChunkLamps: G.frame.roadChunkLamps || 0,
      perChunkHeld: (() => {
        if (!(+LT.perChunkLights > 0)) return null;          // player has it off
        if (G.frame.perChunkLights > 0) return null;         // actually running
        if (gfx && gfx.hasPerChunkLights === false) return "backend";
        try { if (localStorage.getItem("apex26.perChunkOff") === "1") return "latch"; } catch (_) { /* no storage */ }
        if (typeof PerfGov !== "undefined" && PerfGov.autoTier && PerfGov.autoTier() >= 1) return "tier";
        return "day";   // the flood branch never ran: daylight with no daytime lamps
      })(),
      sunY: G.frame.sunDir ? G.frame.sunDir[1] : null,
      builtNight: G.builtTrackNight, trackNight: G.track && G.track._night,
      floodEmit: G._lastFloodEmit,   // actual prop-emissive ramp value this frame
      envProbe: (gfx && gfx.envProbeReady) ? gfx.envProbeReady() : null,  // live env-cube captured?
      fogDensity: G.frame.fogDensity,
      fogColor: G.frame.fogColor && G.frame.fogColor.slice(),
      skyHorizon: G.frame.skyHorizon && G.frame.skyHorizon.slice(),
      frameSkyHorizon: G.frameSky.horizon && G.frameSky.horizon.slice(),
      skySunColor: G.frameSky.sunColor && G.frameSky.sunColor.slice(),
      skySunDir: G.frameSky.sunDir && G.frameSky.sunDir.slice(),
      skyStars: G.frameSky.stars, skyMoon: G.frameSky.moon,
      cullDist: G.frame.cullDist,   // metres; scenery beyond this is culled (0 = uncapped, only under the debug free-cam)
      moonK: G.frame.moonK,         // weather-gated clear-moon floor (0 under cloud/fog/wet)
      moonGate: G.frame.moonGate,   // max(moonK, the moonShadow>0.5 escape hatch) — what the prop/car shadow casts actually gate on
      lampCull: LT.lampCull,        // the nearest-lamp budget lampReach competes for
    };
  },
  // GPU frame-time probe (Chrome/Android only; iOS Safari lacks the timer
  // extension). gpuTimer(true) starts timing, gpuTimer(false) stops, gpuTimer()
  // reads the latest sample: { supported, on, ms, software }. ms is the GPU
  // cost of a recent frame (-1 until a result lands). software is `ms < 0`:
  // no sample yet, no extension, or a software rasterizer (SwiftShader).
  // Do not treat a negative ms as a GPU millisecond.
  gpuTimer: (on) => {
    if (!gfx || !gfx.gpuTimer) return { supported: false, on: false, ms: -1, software: true };
    const st = gfx.gpuTimer(on);
    const ms = gfx.gpuMs ? gfx.gpuMs() : -1;
    return { supported: st.supported, on: st.on, ms, software: ms < 0 };
  },
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
      if (typeof refreshLightTunePanel === "function") refreshLightTunePanel();
    }
    const out = {};
    for (const d of TUNE_DEFS) out[d.id] = LT[d.id];
    return out;
  },
  lightCopy(arg) {
    if (arg && typeof arg === "object") {
      const ok = restoreLightTune(arg.undo || arg);
      if (ok) persistLightTune();
      if (typeof refreshLightTunePanel === "function") refreshLightTunePanel();
      return { ok, mode: "undo" };
    }
    const r = copyLightTune(arg === "look" ? "look" : "edits");
    if (r.ok) persistLightTune();
    return r;
  },
  viewState() {
    return {
      camMode: CAM_MODES[G.camMode].id, camIndex: G.camMode,
      frozen: G.frozen, dbgCamActive: G.dbgCam !== null, skyOverride: G.skyViewOverride !== null,
      weather: G.raceWeather, state: G.state,
      ...this.camState(),
    };
  },

  // Headless / RL control loop

  headless(on) {
    if (on === undefined) return G.headlessMode;
    G.headlessMode = !!on;
    return G.headlessMode;
  },

  debris(arg) {
    if (arg === undefined) return DebrisWorld.status();
    if (typeof arg === "boolean") return DebrisWorld.setEnabled(arg);
    if (arg && typeof arg === "object") {
      if (arg.reset) return DebrisWorld.reset();
      if (arg.burst) { DebrisWorld.burst(arg.burst, arg.sev); return DebrisWorld.status(); }
      if (arg.marble && G.player) {
        // Seeded emission at the player under a forced lock-up + slide signal.
        DebrisWorld.tyreMarble(G.player, { lock: 1, slip: 0.5, speed: Math.max(12, Math.abs(G.player.speed || 0)) });
        return DebrisWorld.status();
      }
      if (arg.flags) return DebrisWorld.groupBFlags(arg.flags);
      if (arg.hazards) return Object.assign(DebrisWorld.status(), { hazards: DebrisWorld.hazards() });
      if (arg.marbleGrip) return Object.assign(DebrisWorld.status(), { marbleGripFactor: DebrisWorld.marbleGrip(G.player) });
      if (arg.positions) return Object.assign(DebrisWorld.status(), { positions: DebrisWorld.positions() });
    }
    return DebrisWorld.status();
  },

  incident(arg) {
    if (arg && typeof arg === "object") {
      if (arg.reset) return IncidentSim.reset();
      if (arg.launch) return IncidentSim.forceLaunch();
      if (arg.flags) return IncidentSim.setFlags(arg.flags);
    }
    return IncidentSim.status();
  },

  // caution(arg?) — the B1 debris caution state (local yellow / VSC / safety car),
  // a READ-ONLY race-logic layer over DebrisWorld.hazards() (see js/game.js). It
  // never slows or moves a car. No arg: current state
  //   { level (0 GREEN·1 YELLOW·2 VSC·3 SC), label, sector, frac, total,
  //     sectors[3], sinceT, cause, enabled }.
  //   caution({hazards:true}) → the same state plus the live DebrisWorld.hazards().
  //   caution(true|false) or caution({enabled}) → switch the whole layer, the
  //     SAME door the CAUTIONS race setting uses (so the chips cannot go stale
  //     against it). Turning it off drops any flag already flying.
  caution(arg) {
    if (typeof arg === "boolean") G.setCautionEnabled(arg);
    else if (arg && typeof arg === "object" && arg.enabled !== undefined)
      G.setCautionEnabled(!!arg.enabled);
    const st = G.cautionInfo ? G.cautionInfo() : { level: 0, label: "GREEN", enabled: false };
    if (arg && typeof arg === "object" && arg.hazards)
      return Object.assign(st, { hazards: DebrisWorld.hazards() });
    return st;
  },

  // bodyAttitude(arg?) — the C2 visual-suspension springs (js/game/bodyattitude.js).
  //   bodyAttitude()            → status { enabled, offsets:{pitch,roll,heave,enabled} }
  //                               (offsets are the player's current render offsets,
  //                               radians for pitch/roll, metres for heave)
  //   bodyAttitude(true|false)  → enable/disable (persists to apex26.bodyAttitude)
  //   bodyAttitude({reset:true})→ reset every car's springs to a settled chassis
  //   bodyAttitude({car:idx})   → status with offsets for cars[idx] (tests)
  // Render-only: never touches px/pz/head or (s, x); disabling forces all offsets 0.
  bodyAttitude(arg) {
    if (arg === undefined) return BodyAttitude.status();
    if (typeof arg === "boolean") return BodyAttitude.setEnabled(arg);
    if (arg && typeof arg === "object") {
      if (arg.reset) { BodyAttitude.reset(); return BodyAttitude.status(); }
      if (arg.car != null && G.cars && G.cars[arg.car])
        return { enabled: BodyAttitude.active(), offsets: BodyAttitude.offsets(G.cars[arg.car]) };
    }
    return BodyAttitude.status();
  },

  // renderScale(v?) — adaptive-resolution control. No arg: report current state
  // { scale, fps, auto }. Number: pin the 3D render scale (0.5–1) and disable
  // the auto-governor. true: re-enable the governor. Lower scale = big fill-rate
  // win (softer 3D view; HUD stays crisp). `floorMs` is the governor's derived
  // per-device budget (the observed floor of frame intervals — see
  // js/game/perf.js) rather than a hardcoded 16.7 ms; it rises to match an
  // external cap like iOS Low Power Mode's 30 fps throttle instead of forever
  // judging that device against a 60 fps target it cannot reach.
  renderScale(v) {
    if (v === undefined) return { scale: gfx.getRenderScale(), fps: +(1000 / Math.max(1, PerfGov.fpsEMA())).toFixed(1), floorMs: +PerfGov.floorMs().toFixed(1), auto: PerfGov.autoRes(), tier: PerfGov.tier(), autoTier: PerfGov.autoTier(), userTier: PerfGov.userTier(), tierFloor: PerfGov.tierFloor(), crashStrikes: PerfGov.strikes() };
    if (v === true) { PerfGov.setAutoRes(true); return this.renderScale(); }
    PerfGov.setAutoRes(false); gfx.setRenderScale(+v); return this.renderScale();
  },

  // perf() — thin governor snapshot (alias of renderScale report + tier parts).
  perf() { return this.renderScale(); },

  uiScale(v) { return G.setScale("uiScale", "--ui-scale", v); },
  hudScale(v) { return G.setScale("hudScale", "--hud-scale", v); },

  safeMode(v) {
    if (v === undefined) return { strikes: PerfGov.strikes(), tierFloor: PerfGov.tierFloor(), tier: PerfGov.tier() };
    if (v === false) PerfGov.clearStrikes();
    return this.safeMode();
  },

  obs() {
    if (!G.player || G.player.px == null || !G.track) return null;
    Tracks.sample(G.track, G.player.s, smp);
    const axFrac = Math.min(1, Math.abs(G.player.axEstSm ?? 0) / (LONG_GRIP * gripMult()));
    const slipFactor = Math.sqrt(Math.max(0, 1 - axFrac * axFrac));
    const slip = Math.atan2(G.player.vLat || 0, Math.max(1, G.player.speed));
    const kNow = Tracks.curvature(G.track, G.player.s);
    const hwNow = smp.hw, slopeNow = smp.t[1] || 0;

    const wallRAbs = Tracks.wallAt(G.track, G.player.s, 1);
    const wallLAbs = Tracks.wallAt(G.track, G.player.s, -1);
    const wallR =  wallRAbs;   // signed: right wall is at +wallR
    const wallL = -wallLAbs;   // signed: left  wall is at  wallL (negative)

    // lookahead scan at [10, 30, 60] m ahead
    const scanDists = [10, 30, 60];
    const scanAhead = scanDists.map((d) => {
      const ss = wrapS(G.player.s + d);
      Tracks.sample(G.track, ss, smp);
      const sR = Tracks.wallAt(G.track, ss, 1), sLA = Tracks.wallAt(G.track, ss, -1);
      return { d, k: +Tracks.curvature(G.track, ss).toFixed(5), hw: +smp.hw.toFixed(2),
               wallR: +sR.toFixed(2), wallL: +(-sLA).toFixed(2),
               width: +(sR + sLA).toFixed(2) };
    });
    // restore smp to player position
    Tracks.sample(G.track, G.player.s, smp);

    // nearest rivals by progress (leader-first order)
    const sorted = G.cars.slice().sort((a, b) => b.prog - a.prog);
    const pi = sorted.findIndex((c) => c.isPlayer);
    const rivalAhead  = pi > 0 ? sorted[pi - 1] : null;
    const rivalBehind = pi < sorted.length - 1 ? sorted[pi + 1] : null;

    const inp = G._testInput || {};
    // A rescue teleport resets rescueT to 0 the instant it fires (threshold >3), so
    // the old rescueT>8 test could never trip. Signal "done" briefly after a rescue.
    const done = !!G.player.wrongWay ||
      (G.player.rescueLastT != null && (G.raceT - G.player.rescueLastT) < 0.5);

    return {
      // position & progress
      s:       +G.player.s.toFixed(3),
      x:       +G.player.x.toFixed(3),
      prog:    +(G.player.prog || 0).toFixed(4),
      lap:      G.player.lap || 0,
      raceT:   +G.raceT.toFixed(3),

      speed:     +(G.player.speed || 0).toFixed(2),
      speedKph:  +((G.player.speed || 0) * 3.6).toFixed(1),   // TRUE ground speed
      // What the HUD/cockpit LCD actually shows: km/h on the pace-5 scale, so the
      // dial spans the same range at every OVERALL SPEED setting. speedKph above
      // (and every other speed in this API) stays raw — the hooks report physics.
      dashKph:   +G.dashKph(G.player.speed || 0).toFixed(1),
      head:      +(G.player.head || 0).toFixed(4),
      vLat:      +(G.player.vLat || 0).toFixed(3),

      // combined-slip physics
      axEstSm:    +(G.player.axEstSm ?? 0).toFixed(2),
      axFrac:     +axFrac.toFixed(3),
      slipFactor: +slipFactor.toFixed(3),
      slipDeg:    +(slip * 180 / Math.PI).toFixed(2),

      // track context at player position
      k:     +kNow.toFixed(5),
      hw:    +hwNow.toFixed(2),
      slope: +slopeNow.toFixed(4),
      gripMult: gripMult(),
      weather: G.raceWeather,

      // barrier clearances (both in metres, positive = clear)
      wallR:  +wallR.toFixed(2),
      wallL:  +wallL.toFixed(2),
      clearR: +(wallR - G.player.x).toFixed(2),
      clearL: +(G.player.x - wallL).toFixed(2),

      energy: +(G.player.energy || 0).toFixed(3),
      gear: G.player.gear || 1,

      aeroX:  +(G.player.aeroX || 0).toFixed(3),
      xOn:    !!G.player.xOn,
      xArmed: !!G.player.xArmed,

      // episode state flags
      wrongWay: !!G.player.wrongWay,
      offT:     +(G.player.offT || 0).toFixed(2),
      rescueT:  +(G.player.rescueT || 0).toFixed(2),
      done,

      // currently applied input (null fields = real device input)
      input: {
        steer:    inp.steer    !== undefined ? inp.steer    : null,
        throttle: inp.throttle !== undefined ? !!inp.throttle : null,
        brake:    inp.brake    !== undefined ? !!inp.brake    : null,
      },

      posInField: pi + 1,
      gapAhead:  rivalAhead  ? +(rivalAhead.prog  - (G.player.prog || 0)).toFixed(2) : null,
      gapBehind: rivalBehind ? +((G.player.prog || 0) - rivalBehind.prog).toFixed(2) : null,

      scan: scanAhead,

      // reward components (combine as you see fit)
      reward: {
        speed:    +(G.player.speed || 0).toFixed(2),          // m/s forward — maximise
        offTrack: +(G.player.offT  || 0).toFixed(2),          // seconds off-track
        wallDist: +Math.min(wallR - G.player.x, G.player.x - wallL).toFixed(2), // m to nearer wall
        wrongWay: !!G.player.wrongWay,
      },
    };
  },

  act(input, dt, n) {
    if (!G.track || !G.player) return null;
    // auto-enter race state so physics advances even if called during countdown
    if (G.state === "count") {
      G.state = "race"; G.raceT = 0;
      els.lights.hidden = true;
      for (const l of els.lights.children) l.classList.remove("on");
    }
    if (input !== undefined) G._testInput = input || null;
    const d = dt != null ? dt : 1 / 60, count = n != null ? n : 1;
    for (let i = 0; i < count; i++) {
      for (let j = 0; j < G.cars.length; j++) { const c = G.cars[j]; c.rPrevS = c.s; c.rPrevX = c.x; }
      update(d);
    }
    return this.obs();
  },

  // Timing & field hooks

  sectorState() {
    if (!G.player || !G.track) return null;
    const elapsed = (G.player.lapTime || 0) - G.sectorStartT;
    return {
      idx: G.sectorIdx,
      elapsed: +elapsed.toFixed(3),
      bests: G.sectorBests.map((v) => v === Infinity ? null : +v.toFixed(3)),
      last:  G.sectorLast.map((v) => v == null     ? null : +v.toFixed(3)),
    };
  },

  lapHistory() {
    if (!G.player) return null;
    return {
      mode: G.timeTrial ? "tt" : "race",
      laps: G.timeTrial
        ? G.ttLaps.map((t, i) => ({ lap: i + 1, time: +t.toFixed(3) }))
        : [],
      best:    isFinite(G.player.best)  ? +G.player.best.toFixed(3)    : null,
      lastLap: G.player.lastLap != null ? +G.player.lastLap.toFixed(3) : null,
    };
  },

  timing() {
    if (!G.player || !G.track) return null;
    const sorted = G.cars.slice().sort((a, b) => b.prog - a.prog);
    const pi = sorted.findIndex((c) => c.isPlayer);
    const ahead  = pi > 0               ? sorted[pi - 1] : null;
    const behind = pi < sorted.length - 1 ? sorted[pi + 1] : null;
    return {
      raceT:         +G.raceT.toFixed(3),
      lapTime:       +(G.player.lapTime  || 0).toFixed(3),
      best:          isFinite(G.player.best) ? +G.player.best.toFixed(3) : null,
      lastLap:       G.player.lastLap != null ? +G.player.lastLap.toFixed(3) : null,
      lap:            G.player.lap || 0,
      pos:            pi + 1,
      total:          G.cars.length,
      gapAhead:      ahead  ? +(ahead.prog  - (G.player.prog || 0)).toFixed(2) : null,
      gapBehind:     behind ? +((G.player.prog || 0) - behind.prog).toFixed(2) : null,
      energy:        +(G.player.energy || 0).toFixed(3),
      aeroX:         +(G.player.aeroX || 0).toFixed(3),
      gear:           G.player.gear || 1,
      sector:         G.sectorIdx + 1,
      sectorElapsed: +((G.player.lapTime || 0) - G.sectorStartT).toFixed(3),
    };
  },

  fieldState() {
    if (!G.track || !G.cars.length) return null;
    const sorted = G.cars.slice().sort((a, b) => b.prog - a.prog);
    const leader = sorted[0];
    return sorted.map((c, pos) => ({
      pos:      pos + 1,
      id:       G.cars.indexOf(c),
      name:     c.name,
      code:     c.code,
      team:     c.team && c.team.id,
      isPlayer: !!c.isPlayer,
      lap:      c.lap || 0,
      frac:     +(c.s / G.track.total).toFixed(4),
      speed:    +c.speed.toFixed(2),
      gap:      +(leader.prog - c.prog).toFixed(2),
      finished: !!c.finished,
      finishT:  c.finishT != null ? +c.finishT.toFixed(2) : null,
      retired:  !!c.retired,
      dnf:      c.dnf || null,
    }));
  },

  carRoles() {
    return G.cars.map((c, i) => ({
      id: i, code: c.code, team: c.team && c.team.id,
      human: !!c.human, local: !!c.local, isPlayer: !!c.isPlayer,
      hasPose: c.px != null && c.head != null,
      vLat: +(c.vLat || 0).toFixed(4),
      yawRateCur: +(c.yawRateCur || 0).toFixed(4),
      mods: c.mods ? Object.assign({}, c.mods) : null,
      netInput: c.netInput ? Object.assign({}, c.netInput) : null,
    }));
  },

  carRole(idx, o) {
    const c = G.cars[idx];
    if (!c) return false;
    o = o || {};
    G.setCarRole(c,
      o.human === undefined ? !!c.human : !!o.human,
      o.local === undefined ? !!c.local : !!o.local);
    if (o.mods !== undefined) {
      c.mods = o.mods
        ? Object.assign({ speed: 1, accel: 1, cornering: 1, braking: 1 }, o.mods)
        : null;
    }
    if (!c.human) c.netInput = null;   // an AI car drives itself
    return {
      id: idx, human: !!c.human, local: !!c.local, isPlayer: !!c.isPlayer,
      mods: c.mods ? Object.assign({}, c.mods) : null,
    };
  },

  // carInput(idx, {steer, throttle, brake, shiftUp?, shiftDown?, overtake?})
  // — the controls a NON-LOCAL human car drives on, same shape as setInput().
  // Pass null to clear (the car then coasts). Ignored by the local car, which
  // reads the real Input, and by AI cars, which drive themselves.
  carInput(idx, input) {
    const c = G.cars[idx];
    if (!c) return false;
    c.netInput = input || null;
    return c.netInput ? Object.assign({}, c.netInput) : null;
  },

  net() {
    return G.netPlay ? G.netPlay.status() : { active: false };
  },

  netLoopback(o) {
    o = o || {};
    if (!G.netPlay) return { ok: false, error: "no_netplay", message: "NetPlay is not available." };
    const pair = NetTransport.loopback({
      latencyMs: o.latencyMs != null ? o.latencyMs : 0,
      jitterMs: o.jitterMs || 0,
      loss: o.loss || 0,
      // `seed` makes loss and jitter REPRODUCIBLE. Without it a lossy spec is
      // a coin flip that re-runs differently, which is indistinguishable from
      // the defect it is meant to catch.
      rnd: o.seed != null ? NetTransport.seededRnd(o.seed) : undefined,
    });
    _netPeer = pair[1];
    // THE FAR END MUST ANSWER PINGS. A bare transport endpoint is not a peer:
    // in a real connection the other browser runs NetSession too, so the near
    // end reaches synced() inside one round trip and starts handing snapshots
    // to the game. Without a responder synced() is false for ever, every
    // packet lands in heldState, and net().buffered stays 0 while the session
    // reports itself alive — which is precisely what the multiplayer-session
    // specs were failing on (14 reds, six of them this).
    NetSession.autoPong(_netPeer);
    // Both endpoints must be pumped from the same moment for the loopback's
    // wire clock to line up (see js/net/transport.js). A test passes its own
    // t0 so the whole session runs on a virtual clock it controls.
    const t0 = o.nowMs != null ? o.nowMs : performance.now();
    pair[0].pump(t0); _netPeer.pump(t0);
    const res = G.netPlay.start({
      transport: pair[0],
      role: o.role === "guest" ? "guest" : "host",
      peerProfile: o.peer || null,
      interpDelayMs: o.interpDelayMs,
    });
    if (!res.ok) { _netPeer = null; return res; }
    // ...and the near end must PING at t0, not on the caller's first netTick.
    // start() does not pump, so without this the first PING and the first
    // snapshot ride the same pump: the snapshot arrives while synced() is
    // still false and is held, so the very first assertion after one packet
    // sees 0. A live session pumps every frame from the moment it connects
    // (transport.js says so in as many words); this is that first frame.
    G.netPlay.tick(t0);
    return res;
  },

  netPeerSend(st, atMs, wireId) {
    if (!_netPeer || !G.netPlay) return false;
    const status = G.netPlay.status();
    const cur = G.cars[status.remoteId] || {};
    const car = Object.assign({
      s: cur.s || 0, x: cur.x || 0, head: cur.head || 0, speed: cur.speed || 0,
      gear: cur.gear || 1, lap: cur.lap || 0,
      deploying: false, offroad: false, onKerb: false, braking: false,
    }, st || {});
    const now = atMs != null ? atMs : performance.now();
    _netPeer.pump(now);
    // The WIRE id, not the cars[] index. A real peer stamps its packets with
    // G.wireId — the same number on every screen, which an index is not — so
    // the fake peer must too, or onState has no slot to route it to.
    const wire = wireId != null ? wireId
      : (status.remotes && status.remotes.length ? status.remotes[0].wire : status.remoteId);
    const ok = _netPeer.send("state", NetSnapshot.encodeSnapshot(Math.round(now), [
      { id: wire, car },
    ]));
    return ok ? { sent: car, at: Math.round(now) } : false;
  },

  // netPeerClose() — the rival's connection drops. The game must hand their
  // car back to the AI rather than leave a driverless obstacle on track.
  netPeerClose() {
    if (!_netPeer) return false;
    try { _netPeer.close(); } catch (e) {}
    _netPeer = null;
    return true;
  },

  lobby(o) {
    if (!G.netLobby) return { available: false };
    if (o && o.open) G.netLobby.open();
    if (o && o.cancel) G.netLobby.cancel();
    return Object.assign({ available: true }, G.netLobby.status(), {
      profile: G.netLobby.localProfile(),
      shown: !!(document.getElementById("vsfriend") && !document.getElementById("vsfriend").hidden),
    });
  },

  // lobbyFake(on) — make the lobby build LOOPBACK endpoints instead of real
  // RTCPeerConnections. Necessary, not merely convenient: an RTCPeerConnection
  // whose ICE never completes (a sandboxed CI browser, a locked-down network)
  // spins indefinitely, so a test that builds one does not fail — it HANGS,
  // which is far worse. The far endpoint is kept here so the connection can be
  // completed on demand by lobbyWatch(), which drives it to onConnected().
  // (There is no lobbyFakeConnect(); the nearest name, lobbyFakeConnected(), is
  // a boolean reader.)
  lobbyFake(on) {
    if (!G.netLobby) return false;
    if (!on) { _lobbyPeer = null; G.netLobby.setTransportFactory(null); return false; }
    G.netLobby.setTransportFactory((o) => {
      const pair = NetTransport.loopback({ latencyMs: 0 });
      _lobbyPeer = pair[1];
      return Object.assign(pair[0], { role: o && o.role });
    });
    return true;
  },
  lobbyFakeConnected() { return !!_lobbyPeer; },

  lobbyWatch() {
    if (!G.netLobby) return false;
    G.netLobby.watchForOpen();
    return true;
  },

  lobbyPeerEvent(type, data) {
    if (!_lobbyPeer) return false;
    const now = performance.now();
    _lobbyPeer.pump(now);
    const ok = _lobbyPeer.send("event", JSON.stringify({ t: type, d: data }));
    _lobbyPeer.pump(now);
    return ok;
  },

  lobbyRoom() {
    return G.netLobby ? G.netLobby.roomState() : null;
  },

  lobbyHost() {
    if (!G.netLobby) return Promise.resolve({ ok: false, error: "no_lobby" });
    G.netLobby.open();
    return G.netLobby.host();
  },
  lobbyJoin(inviteCode) {
    if (!G.netLobby) return Promise.resolve({ ok: false, error: "no_lobby" });
    G.netLobby.open();
    G.netLobby.join();
    return G.netLobby.makeAnswer(inviteCode);
  },
  lobbyAccept(answerCode) {
    if (!G.netLobby) return Promise.resolve({ ok: false, error: "no_lobby" });
    return G.netLobby.acceptAnswer(answerCode);
  },

  lobbySdp() {
    if (!G.netLobby || !G.netLobby.sdp) return { ok: false, error: "no_lobby" };
    const s = G.netLobby.sdp();
    return s || { ok: false, error: "no_connection" };
  },

  async lobbyPairs() {
    if (!G.netLobby || !G.netLobby.sdp) return { ok: false, error: "no_lobby" };
    const s = G.netLobby.sdp();
    const pc = s && s._pc;
    if (!pc || !pc.getStats) return { ok: false, error: "no_connection" };
    const stats = await pc.getStats();
    const local = new Map(), remote = new Map(), pairs = [];
    stats.forEach((r) => {
      if (r.type === "local-candidate") local.set(r.id, r);
      else if (r.type === "remote-candidate") remote.set(r.id, r);
      else if (r.type === "candidate-pair") pairs.push(r);
    });
    const name = (c) => (c ? (c.candidateType || "?") + " " + (c.address || c.ip || "?")
                             + ":" + (c.port || "?") + "/" + (c.protocol || "?") : "?");
    return {
      ice: s.ice, conn: s.conn,
      pairs: pairs.map((p) => ({
        state: p.state, nominated: !!p.nominated,
        sent: p.requestsSent, recv: p.responsesReceived,
        bytes: p.bytesSent,
        local: name(local.get(p.localCandidateId)),
        remote: name(remote.get(p.remoteCandidateId)),
      })),
    };
  },

  lobbyCodeHost() {
    if (!G.netLobby) return Promise.resolve({ ok: false, error: "no_lobby" });
    G.netLobby.open();
    return G.netLobby.codeHost();
  },
  lobbyCodeJoin(code) {
    if (!G.netLobby) return Promise.resolve({ ok: false, error: "no_lobby" });
    G.netLobby.open();
    return G.netLobby.codeJoin(code);
  },

  // turnProbe() — is a relay actually there?
  //
  // "Both sides found an address but the direct link was blocked" is the one
  // failure a player cannot act on and we cannot reproduce: it needs two real
  // networks, and every free TURN operator this game has tried either retired
  // its embeddable credentials or answered a lookup with nothing. So the
  // aliveness of a relay is not a thing to reason about — it is a thing to
  // MEASURE, on the machine that has the problem.
  //
  // One throwaway RTCPeerConnection PER SERVER, each with
  // iceTransportPolicy "relay". Per-server is the whole point: a combined
  // gather says only "something worked", which is exactly the answer that
  // leaves you shipping a dead entry alongside a live one. Relay-only is the
  // other half — with host and srflx candidates discarded, a candidate can
  // only have come from TURN, so `relay > 0` is proof rather than inference.
  //
  // Reads NetTransport.iceServers({}) so it probes what the GAME would use,
  // including anything apex26.turn / apex26.turnApi added. A STUN-only entry
  // is reported with ok:false and stun:true rather than skipped — "you have
  // no relay configured" is a distinct diagnosis from "your relay is down",
  // and it is the one the lobby copy now depends on being distinguishable.
  turnProbe(ms) {
    const PC = (typeof RTCPeerConnection !== "undefined") ? RTCPeerConnection : null;
    if (!PC || typeof NetTransport === "undefined") {
      return Promise.resolve({ ok: false, error: "no_webrtc" });
    }
    const wait = Math.max(1000, Number(ms) || 8000);
    const flat = [];
    for (const e of NetTransport.iceServers({})) {
      const urls = Array.isArray(e.urls) ? e.urls : [e.urls];
      for (const u of urls) flat.push({ urls: u, username: e.username, credential: e.credential });
    }
    const one = (srv) => new Promise((done) => {
      const isTurn = /^turns?:/i.test(srv.urls);
      let pc = null;
      const out = { urls: srv.urls, relay: 0, ok: false, stun: !isTurn };
      if (!isTurn) { out.error = "not_a_relay"; done(out); return; }
      try {
        pc = new PC({ iceServers: [srv], iceTransportPolicy: "relay" });
      } catch (e) { out.error = "construct_failed"; done(out); return; }
      const finish = () => {
        if (!pc) return;
        out.ok = out.relay > 0;
        if (!out.ok && !out.error) out.error = "no_relay_candidates";
        try { pc.close(); } catch (e) {}
        pc = null;
        done(out);
      };
      const timer = setTimeout(finish, wait);
      pc.onicecandidate = (ev) => {
        if (!ev.candidate) { clearTimeout(timer); finish(); return; }
        if (/ typ relay /.test(ev.candidate.candidate)) out.relay++;
      };
      pc.onicecandidateerror = (ev) => {
        if (ev && ev.errorCode && !out.error) {
          out.error = "ice_" + ev.errorCode + (ev.errorText ? " " + ev.errorText : "");
        }
      };
      try {
        pc.createDataChannel("probe");
        pc.createOffer().then((o) => pc && pc.setLocalDescription(o)).catch(() => {});
      } catch (e) { clearTimeout(timer); out.error = "offer_failed"; finish(); }
    });
    return Promise.all(flat.map(one)).then((servers) => {
      const relays = servers.filter((s) => !s.stun);
      return {
        ok: relays.some((s) => s.ok),
        servers,
        relaysConfigured: relays.length,
        summary: !relays.length
          ? "No TURN relay is configured — only STUN. Cross-network play will fail whenever both sides are behind a strict NAT."
          : relays.some((s) => s.ok)
            ? "Relay reachable: " + relays.filter((s) => s.ok).map((s) => s.urls).join(", ")
            : "A relay is configured but none answered: "
              + relays.map((s) => s.urls + " (" + s.error + ")").join(", "),
      };
    });
  },

  lobbyInviteAnother() {
    if (!G.netLobby) return Promise.resolve({ ok: false, error: "no_lobby" });
    return G.netLobby.inviteAnother();
  },
  lobbyReady(v) {
    if (!G.netLobby) return false;
    G.netLobby.setReady(v !== false);
    return true;
  },
  lobbyStart() {
    if (!G.netLobby) return false;
    return G.netLobby.startFromRoom();
  },

  // lobbyMods(profile) — resolve a peer profile to multipliers, locally.
  lobbyMods(profile) {
    return G.netLobby ? G.netLobby.modsFromProfile(profile) : null;
  },

  // lobbyFailure(wireStats, secs) — the message a failed connection produces,
  // from a given wire state. Exposed because the real thing needs two devices
  // on two hostile networks, which no CI can arrange — but WHICH diagnosis we
  // draw from a given set of candidates is pure logic and must not regress.
  lobbyFailure(st, secs) {
    return G.netLobby ? G.netLobby.failureMsg(st, secs || 30) : null;
  },

  lobbyShare(which) {
    if (!G.netLobby) return false;
    return which === "answer" ? G.netLobby.shareAnswer() : G.netLobby.shareInvite();
  },

  netStartArm(nowMs, atMs, hold) {
    if (!G.netPlay || !G.netPlay.active()) return { ok: false, error: "no_session" };
    G.netNow = nowMs;
    G.netStart = atMs == null
      ? null
      : { at: atMs, hold: hold != null ? hold : 0.5, now: () => G.netNow };
    G.state = "count";
    G.countT = 0;
    G.lightsLit = 0;
    els.lights.hidden = false;
    for (const l of els.lights.children) l.classList.remove("on");
    return {
      ok: true,
      at: atMs != null ? atMs : null,
      hold: G.netStart ? G.netStart.hold : null,
      awaiting: G.netPlay.awaitingStart(),
    };
  },

  netHostStart() {
    if (!G.netPlay || !G.netPlay.active()) return { ok: false, error: "no_session" };
    return { ok: !!G.netPlay.hostStart(), startPending: !!G.netStart };
  },

  netPeerEvent(type, data, atMs) {
    if (!_netPeer) return false;
    const now = atMs != null ? atMs : performance.now();
    _netPeer.pump(now);
    return _netPeer.send("event", JSON.stringify({ t: type, d: data }));
  },

  netPeerLaps() { return G.netPlay ? G.netPlay.peerLaps() : []; },

  // netTick(nowMs?) — pump the session by hand. The game loop already calls
  // this every frame, but a test must not depend on rAF actually running at a
  // useful rate: driving it explicitly is what makes latency, loss and
  // interpolation reproducible here, the same way step() does for physics.
  netTick(nowMs) {
    if (!G.netPlay) return false;
    G.netPlay.tick(nowMs != null ? nowMs : performance.now());
    return G.netPlay.status();
  },

  netStop() {
    _netPeer = null;
    return G.netPlay ? G.netPlay.stop("local") : false;
  },

  aiPlace(idx, frac, speed, x) {
    if (!G.track || !G.cars[idx]) return false;
    const c = G.cars[idx];
    if (c.isPlayer) return false;
    const f01 = ((((frac != null ? frac : 0)) % 1) + 1) % 1;   // keep s and prog coupled
    c.s    = wrapS(f01 * G.track.total);
    c.prog = (c.lap || 0) * G.track.total + f01 * G.track.total;
    if (x     !== undefined) { c.x = x; c.xVis = x; }
    if (speed !== undefined) c.speed = speed;
    c.vLat = 0; c.yawRateCur = 0;
    Tracks.sample(G.track, c.s, smp2);
    c.head = Math.atan2(smp2.t[0], smp2.t[2]);
    { const rl = Math.hypot(smp2.r[0], smp2.r[2]) || 1;   // see worldFromTrack in game.js
      c.px = smp2.p[0] + smp2.r[0] / rl * c.x;
      c.pz = smp2.p[2] + smp2.r[2] / rl * c.x; }
    c.rPrevS = c.s; c.rPrevX = c.x; c.rPrevPx = c.px; c.rPrevPz = c.pz;
    return { id: idx, frac: +(c.s / G.track.total).toFixed(4), speed: +c.speed.toFixed(2), x: +c.x.toFixed(3) };
  },

  setBoost(on) { if (G.player) G.player.boostOn = !!on; return G.player ? G.player.boostOn : false; },

  aeroMode(v) {
    if (v !== undefined) {
      if (v !== "auto" && v !== "manual") {
        return { ok: false, error: "bad_mode", message: 'aeroMode must be "auto" or "manual"' };
      }
      G.raceAeroMode = v;
    }
    return G.raceAeroMode;
  },
  aero(on) {
    if (!G.player) return null;
    if (on !== undefined) G.player.xOn = !!on;
    return {
      xOn: !!G.player.xOn,
      xArmed: !!G.player.xArmed,
      aeroX: +(G.player.aeroX || 0).toFixed(3),
      mode: (G.player.aeroX || 0) > 0.05 ? "X" : "Z",
      inZone: !!G.aeroZoneAt(G.player.s || 0),
      zoneAhead: Math.round(G.aeroZoneAhead(G.player.s || 0)),
      zones: G.aeroZones.length,
      auto: G.raceAeroMode === "auto",
    };
  },
  aeroZones() {
    if (!G.track) return null;
    return G.aeroZones.map((z) => ({
      start: Math.round(z.start), end: Math.round(z.end), len: Math.round(z.len),
      startFrac: +(z.start / G.track.total).toFixed(4),
      endFrac: +((z.end % G.track.total) / G.track.total).toFixed(4),
      midFrac: +(((z.start + z.len * 0.5) % G.track.total) / G.track.total).toFixed(4),
    }));
  },
  carEffects() {
    if (!G.player) return null;
    const brakeGlowThreshold = 0.05;
    const brakeHeat = +(G.player.brakeHeat || 0);
    return {
      exhaustFlame: (G.player.exhaustPop || 0) > 0.05,
      brakeGlow: brakeHeat > brakeGlowThreshold,
      ersDeploy: isErsDeploying(G.player),
      boostFlame: false,
      brakeHeat,
      brakeGlowThreshold,
    };
  },
  setEnergy(v) {
    if (!G.player) return false;
    G.player.energy = Math.max(0, Math.min(1, +v || 0));
    return { energy: +G.player.energy.toFixed(3) };
  },

  setLap(n) {
    if (!G.player) return false;
    G.player.lap = Math.max(0, Math.floor(+n || 0));
    return { lap: G.player.lap };
  },

  trackShape(n) {
    if (!G.track) return null;
    const steps = Math.max(4, Math.min(2000, n != null ? Math.floor(+n) : 200));
    const xs = [], zs = [], ks = [], fracs = [];
    for (let i = 0; i < steps; i++) {
      const frac = i / steps;
      const s = frac * G.track.total;
      Tracks.sample(G.track, s, smp2);
      xs.push(smp2.p[0]);
      zs.push(smp2.p[2]);
      ks.push(Tracks.curvature(G.track, s));
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
    if (!G.track) return null;
    const steps = Math.max(2, Math.min(1000, n != null ? Math.floor(+n) : 100));
    const out = [];
    for (let i = 0; i < steps; i++) {
      const frac = i / steps;
      const s = frac * G.track.total;
      Tracks.sample(G.track, s, smp2);
      out.push({
        frac:  +frac.toFixed(4),
        y:     +smp2.p[1].toFixed(3),
        k:     +Tracks.curvature(G.track, s).toFixed(5),
        hw:    +smp2.hw.toFixed(2),
        slope: +(smp2.t[1] || 0).toFixed(4),
      });
    }
    return out;
  },

  mapPts() {
    return G.track ? G.track.map.slice() : null;
  },

  trackBounds() {
    if (!G.track) return null;
    const px = G.track.px, pz = G.track.pz, n = G.track.n;
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

  seed(n) { if (n !== undefined) G.seed = n; return G.seed; },

  reset(frac, speed, x, seed) {
    if (!G.track || !G.player) return false;
    IncidentSim.reset();   // else a live takeover re-imposes its crash pose over the teleport below, every tick
    if (seed !== undefined) G.seed = seed;
    gridUp();
    G.state = "race"; G.raceT = 0;
    els.lights.hidden = true;
    for (const l of els.lights.children) l.classList.remove("on");
    G.lightsLit = 0;   // the DOM alone leaves the counter at 5 — see the façade
    const f01 = ((((frac != null ? frac : 0)) % 1) + 1) % 1;   // keep s and prog coupled
    G.player.s     = wrapS(f01 * G.track.total);
    G.player.prog  = f01 * G.track.total;
    G.player.speed = speed != null ? speed : 0;
    G.player.x     = x     != null ? x     : 0;
    G.player.xVis  = G.player.x;
    G.player.vLat  = 0; G.player.yawRateCur = 0;
    G.player.lap   = 0; G.player.axEstSm = 0;
    // seed world-space position + heading from (s, x) immediately, same as jump()
    Tracks.sample(G.track, G.player.s, smp);
    { const rl = Math.hypot(smp.r[0], smp.r[2]) || 1;   // see worldFromTrack in game.js
      G.player.px   = smp.p[0] + smp.r[0] / rl * G.player.x;
      G.player.pz   = smp.p[2] + smp.r[2] / rl * G.player.x; }
    G.player.head = Math.atan2(smp.t[0], smp.t[2]);
    G.player.rPrevS = G.player.s; G.player.rPrevX = G.player.x;   // sync render anchors (see jump)
    // Per-episode DRIVETRAIN + smoothing state. gridUp() clears the race-level
    // fields (energy, cuts, penalty, wallT, vLat…) but not these, so without
    // this block the engine and smoothed inputs leak across episodes: the first
    // reset after load starts in gear 1 at idle, every later one inherits
    // whatever gear/rpm/steering the previous run ended in. Measured as ~1 m of
    // divergence over a 4 s rollout at identical seed and inputs — small, but it
    // is exactly the uncontrolled variable seeding is meant to remove.
    for (const c of G.cars) {
      c.gear = 1; c.rpm = GameTables.IDLE_RPM; c.shiftT = 0;
      c.steerSm = 0; c.brakeHeat = 0; c.axEstSm = 0; c.slipDeg = 0;
      c.stuckT = 0; c.deploying = false; c.boostOn = false; c.otArmed = false;
      c.xOn = false; c.aeroX = 0; c.xArmed = false;
      c.wasOnThrottle = false;
      delete c.vertLoad;
      c._prevS = c.s;
    }
    BodyAttitude.reset();   // settle the C2 visual-suspension springs (render-only, no transient)
    G._testInput = null;
    return this.obs();
  },

  // agent-facing view
  // world(opts) — one egocentric JSON snapshot per decision, with semantics
  // beside the numbers. opts: { detail: "brief"|"drive"|"full" (def "drive"),
  // horizonS: lookahead seconds (def 4), points: lookahead samples (def 5),
  // since: seq of the payload you already hold, to get a delta back }.
  // Unlike the hooks above this returns a typed error object, never null.
  world(opts) { return agentView.world(opts); },

  field(opts) { return agentView.field(opts); },

  objective() { return agentView.objective(); },

  // trackInfo({what}) — STATIC per-track data: "corners" (def) | "sectors" |
  // "profile" | "all". Constant for a session — fetch once, never per tick.
  trackInfo(opts) { return agentView.trackInfo(opts); },

  // render({what, ...})? — the ONE optional composition aid, demoted from four
  // peer rasters to a single call because character grids read worse than the
  // structured numbers they are drawn from. what: "view" (the camera view, any
  // of 13 modes, {edges}/{depth}), "map" (top-down, car-up, metric index),
  // "circuit" (the whole track as a document), "car" (measured elevations).
  // APPROXIMATE — for intuition and debugging; read geometry from world()/
  // scene()/trackInfo(). The result carries an `aid` note saying so.
  render(opts) { return agentView.render(opts); },

  // carView({team, parts}?) — the car as JSON: team identity, livery colours,
  // the full parts spec and its stat effects, the per-team chassis silhouette
  // knobs, and measured geometry from a real Car3D build. Replaces the car
  // viewer for everything except appearance itself.
  carView(opts) { return agentView.carView(opts); },

  survey(opts) { return agentView.survey(opts); },

  rollout(opts) { return agentView.rollout(opts); },

  agentHelp() { return agentView.agentHelp(); },

  scene(opts) { return agentView.scene(opts); },

  describe(id) { return agentView.describe(id); },

  atmosphere() { return agentView.atmosphere(); },

  query(opts) { return agentView.query(opts); },

  terminal() { return agentView.terminal(); },

  f1api: typeof F1API !== "undefined" ? F1API : null,

  openf1(path) {
    if (typeof path !== "string" || path.charAt(0) !== "/")
      return Promise.resolve({ ok: false, error: "missing_path",
        message: "openf1(path) needs a path starting with /",
        fix: 'await __apex.openf1("/sessions?circuit_short_name=Monaco&year=2024")' });
    return fetch("https://api.openf1.org/v1" + path).then(r => r.json());
  },

  jolpica(path) {
    if (typeof path !== "string" || path.charAt(0) !== "/")
      return Promise.resolve({ ok: false, error: "missing_path",
        message: "jolpica(path) needs a path starting with /",
        fix: 'await __apex.jolpica("/circuits/monaco.json")' });
    return fetch("https://api.jolpi.ca/ergast/f1" + path).then(r => r.json());
  },

  logs(filter) {
    if (typeof Log === "undefined") return [];
    return Log.records(filter);
  },

  // logLevel(spec?) — read or move the console/buffer thresholds.
  //
  // No arg reads the resolved state. A spec string applies it: `"debug"` for
  // everything, `"scenery:debug"` for one namespace, `"buffer:debug"` to retain
  // more without printing more. `persist` writes it to localStorage so it
  // survives the reload — the shape to hand a player reproducing a bug.
  //
  //   __apex.logLevel()                      // { console, buffer, consoleNs, … }
  //   __apex.logLevel("scenery:debug")
  //   __apex.logLevel("debug", true)         // and remember it
  //   __apex.logLevel(null, true)            // forget it
  logLevel(spec, persist) {
    if (typeof Log === "undefined") return { ok: false, error: "no_log_module" };
    if (persist) Log.persist(spec === undefined ? null : spec);
    else if (spec !== undefined) Log.level(spec);
    return Log.level();
  },

  // persistState() — is localStorage actually storing anything?
  //
  //   { ok, broken, keys, rev, foreign }
  //
  // `ok:false` means a read or write has thrown, and `broken` names it
  // ("QuotaExceededError", "SecurityError"). This is worth a hook of its own
  // because the failure is otherwise INVISIBLE from inside the session: the
  // store still caches the value it could not write, so every read for the rest
  // of the session returns the right answer and only a reload reveals that
  // nothing was ever saved. Safari on iOS puts the quota at 0 in Private
  // Browsing, which is the case that actually loses a player's career.
  persistState() {
    const s = GameStore.store;
    // `foreign` = cross-tab invalidations applied (store.js onForeignWrite): non-zero means a second tab is in play.
    return { ok: !s.broken, broken: s.broken || null, keys: s._cache.size, rev: s.rev, foreign: s.foreign | 0 };
  },

  // save(data, filename) — hand a file back out of the browser.
  //
  // Exists because the reverse direction is the hard one: reading state OUT of
  // a real browser session is how anything gets diagnosed on a device the test
  // suite cannot reach (a real GPU rather than SwiftShader, Safari/iOS, a phone).
  // The Blob-and-click dance had been hand-written from scratch every time it
  // was needed, slightly differently each time. Objects are JSON-stringified;
  // strings and Blobs pass through. Returns the byte count.
  save(data, filename) {
    try {
      const blob = data instanceof Blob ? data
        : new Blob([typeof data === "string" ? data : JSON.stringify(data, null, 1)],
                   { type: typeof data === "string" ? "text/plain" : "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename || "apex-" + Date.now() + ".json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      return blob.size;
    } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  },

  // stats(on?) — a live FPS / frame-time / GPU overlay, the stats.js role.
  //
  // stats.js itself is a three-oriented add-on with nothing to attach to on the
  // DEFAULT renderer (GLX is hand-written WebGL2, not three), so this reads the
  // numbers the game already keeps — PerfGov's frame-time EMA, the adaptive
  // render scale and its tier, and the optional GPU timer — and works
  // identically on GLX, TLX and WGX.
  //
  // The render SCALE and TIER matter as much as the fps here: the performance
  // governor holds 60 by quietly dropping resolution, so a screenshot that
  // "looks fine at 60 fps" may be rendering at 0.6x. That is invisible without
  // this readout, and it is a common source of "why is it blurry".
  //
  //   __apex.stats(true)   // show    __apex.stats(false)   // hide
  //   __apex.stats()       // toggle, returns whether it is now on
  stats(on) {
    const ID = "__apexStats";
    let el = document.getElementById(ID);
    const want = on === undefined ? !el : !!on;
    if (!want) {
      if (el) { clearInterval(el._t); el.remove(); }
      return false;
    }
    if (!el) {
      el = document.createElement("div");
      el.id = ID;
      el.style.cssText = "position:fixed;left:6px;top:6px;z-index:99999;padding:5px 8px;" +
        "font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;white-space:pre;" +
        "background:rgba(0,0,0,.72);color:#7fff9f;border-radius:5px;pointer-events:none;" +
        "text-shadow:0 1px 2px #000";
      document.body.appendChild(el);
      el._t = setInterval(() => {
        try {
          const r = this.renderScale();
          const g = this.gpuTimer();
          const a = (typeof Assets !== "undefined") ? Assets.state() : null;
          el.textContent =
            `fps   ${String(r.fps).padStart(5)}\n` +
            `scale ${r.scale.toFixed(2)}${r.auto ? " auto" : "    "}  tier ${r.tier}\n` +
            `gpu   ${g.supported ? (g.on ? g.ms.toFixed(1) + " ms" : "off") : "n/a"}\n` +
            `matTex ${this.matTex().toFixed(2)}  layers ${a ? a.layers : "-"}`;
        } catch (e) { el.textContent = "stats error: " + ((e && e.message) || e); }
      }, 250);
    }
    return true;
  },

  // diag(opts?) — ONE call that snapshots everything worth having in a bug
  // report, and (by default) downloads it as JSON.
  //
  // Every field here is something that had to be gathered by hand-written
  // one-liners during the asset work, a slightly different set each time. The
  // point is a single stable shape: paste one line, get one file, and the file
  // always contains the same things — including the environment facts
  // (renderer, GPU, backend, device pixel ratio) that decide whether a report
  // is even comparable to a headless run.
  //
  //   __apex.diag()                 // log + download apex-diag.json
  //   __apex.diag({download:false}) // log only
  diag(opts) {
    const o = opts || {};
    const safe = (fn, fallback) => { try { return fn(); } catch (e) { return fallback !== undefined ? fallback : { error: String((e && e.message) || e) }; } };
    let glInfo = { error: "no canvas" };
    safe(() => {
      const cv = document.querySelector("canvas");
      const gl = cv && (cv.getContext("webgl2") || cv.getContext("webgl"));
      if (!gl) return;
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      glInfo = {
        vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        version: gl.getParameter(gl.VERSION),
        maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        maxLayers: gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS || 0x88ff),
      };
    });
    const d = {
      when: new Date().toISOString(),
      build: safe(() => window.__APEX_BUILD, null),
      env: {
        ua: safe(() => navigator.userAgent, ""),
        dpr: safe(() => window.devicePixelRatio, 0),
        viewport: safe(() => [innerWidth, innerHeight], []),
        backend: safe(() => { let b = null; try { b = sessionStorage.getItem("apex26.gfxBound"); } catch (_) { /* no sessionStorage: the pick is the best available answer */ } const p = localStorage.getItem("apex26.gfxBackend") || "webgl2"; return b && b !== p ? b + " (pick: " + p + ")" : p; }, "?"),   // what BOUND, not the pick
        mobile: safe(() => !!(gfx && gfx.isMobile), null),
        mobileTier: safe(() => !!(gfx && gfx.mobileTier), null),
        hdr: safe(() => !!(gfx && gfx.hdrMode && gfx.hdrMode()), null),
        msaa: safe(() => gfx && gfx.msaa && gfx.msaa(), null),
        renderScale: safe(() => gfx && gfx.getRenderScale && gfx.getRenderScale(), null),
      },
      canvas: safe(() => {
        const c = document.getElementById("game");
        return c ? { css: [c.clientWidth, c.clientHeight], buffer: [c.width, c.height],
                     dpr: window.devicePixelRatio } : null;
      }, null),
      perf: safe(() => {
        const p = this.renderScale();
        return { scale: p.scale, fps: p.fps, auto: p.auto, tier: p.tier,
                 tierFloor: p.tierFloor, crashStrikes: p.crashStrikes };
      }),
      gl: glInfo,
      // Capability probes that decide which render path is even available —
      // a missing float colour buffer sheds the whole HDR post chain, and a
      // LOST context explains a black screen that looks like a shader bug.
      glCaps: safe(() => {
        const cv = document.querySelector("canvas");
        const gl = cv && (cv.getContext("webgl2") || cv.getContext("webgl"));
        if (!gl) return null;
        return {
          maxFragUnif: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
          colorFloat: !!gl.getExtension("EXT_color_buffer_float"),
          colorHalf: !!gl.getExtension("EXT_color_buffer_half_float"),
          lost: gl.isContextLost(),
        };
      }, null),
      // Stored overrides. Any of these beats every shipped default and lives
      // only on this device, which is the exact shape of a bug that reproduces
      // for one person and nobody else. `resMode`, `gfxHigh`, `forceMobileTier`
      // and `envProbeOff` are here because they decide the render path and were
      // the ones actually missing; `graphics` and `renderScale` are NOT, because
      // no such key is written anywhere in the repo — reporting them as null
      // every time was worse than not reporting them.
      stored: safe(() => {
        const ls = (k) => { try { return localStorage.getItem("apex26." + k); } catch (e) { return null; } };
        return {
          lightTune: !!ls("lightTune"), camTune: !!ls("camTune"),
          gfxBackend: ls("gfxBackend"), debris: ls("debris"),
          gfxHigh: ls("gfxHigh"), resMode: ls("resMode"),
          forceMobileTier: ls("forceMobileTier"), envProbeOff: ls("envProbeOff"),
        };
      }, null),
      debris: safe(() => this.debris(), null),
      info: safe(() => this.info()),
      assets: safe(() => this.assets()),
      lightTune: safe(() => this.lightTune()),
      lightState: safe(() => this.lightState()),
      viewState: safe(() => this.viewState()),
      physState: safe(() => this.physState()),
      timing: safe(() => this.timing()),
      gpuTimer: safe(() => this.gpuTimer()),
      // Console errors are not captured retroactively — see docs/CONSOLE-RECIPES.md
      // for the one-liner that installs a collector BEFORE reproducing a bug.
      errors: safe(() => (window.__apexErrors || []).slice(-40), []),
    };
    try { Log.info("apex", d); } catch (_) {}
    if (o.download !== false) {
      const bytes = this.save(d, o.filename || "apex-diag.json");
      try { Log.info("apex", "downloaded apex-diag.json (" + bytes + " bytes)"); } catch (_) {}
    }
    return d;
  },

  async fetchTrackOutline(sessionKey, driverNumber) {
    const drv = driverNumber || 1;
    const res = await fetch(
      "https://api.openf1.org/v1/location?session_key=" + sessionKey + "&driver_number=" + drv
    );
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) return null;
    // Loop, not Math.min(...spread): a full-session location dump is >65k rows
    // and spread blows the argument limit (RangeError).
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const r of rows) {
      if (r.x < minX) minX = r.x; if (r.x > maxX) maxX = r.x;
      if (r.y < minZ) minZ = r.y; if (r.y > maxZ) maxZ = r.y;
    }
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
lazyTrackEnsure(api);
return api;
}

return { create };
})();
