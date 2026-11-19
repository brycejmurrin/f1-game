const ApexApi = (function () {
  "use strict";

function create(G) {
const raceOrder = (cars) => AgentView.raceOrder(cars);
const finiteOrNil = (v) => v === undefined || v === null || (typeof v === "number" && isFinite(v));
const stepArgs = (dt, n) => [Number.isFinite(dt) && dt >= 0 ? dt : 1 / 60, Number.isFinite(n) && n >= 0 ? Math.floor(n) : 1];
function badPct(name, v) {
  if (v === undefined || v === null) return null;
  if (typeof v === "number" && isFinite(v) && v > 3) return null;
  return { ok: false, error: "bad_argument",
           message: name + "() takes a percent; got " + JSON.stringify(v),
           fix: "pass e.g. " + name + "(130) for 130 %, or null to reset" };
}
function settled(promise, out) {
  const value = Object.assign({}, out);
  return Object.assign({}, out, {
    then: (res, rej) => Promise.resolve(promise).then((result) => {
      if (result && result.kind === "canceled") return rej(new Error("Race start " + result.reason));
      if (result === false) return rej(new Error("Race start did not reach the grid"));
      return res(value);
    }, rej),
  });
}
const EPISODE_TRANSIENTS = ["rank", "kCur", "wasArmed", "_vmaxNow", "accSm", "onKerb",
  "wheelLock", "brakeTF", "brakeTR", "brakeFade", "_absF", "_tcR", "exhaustPop", "contactT", "_pushD", "_secIdx", "_secT0", "_secValid",
  "_lapTimeAtLine", "_recross", "incidentInvalidLap", "passSide", "passBest", "offroad", "queueT", "_qOf", "trailT", "_trOf", "_trYT", "_trYS",
  "towing", "wake", "axFrac", "axFracF", "axFracR", "_dirtyAirMul", "_coachAssisted", "brakeStab", "uslipDwell", "slipFactor", "flatSpot", "_aeroGrip", "_bandNow", "skidIntensity",
  "kerbSndT", "kerbHapT", "_cueConditionGrip", "_cueCornering", "_cueBraking", "stallT",
  "vwF", "vwR", "kappaF", "kappaR", "_wsV",
  "_lk",
  "kTurn", "_alPrev", "_alPrevDp",
  "_preColS", "_preColX", "collideT", "uslipHapT", "fxSparkI",
  "_preColSpd", "_tyreLoad", "brakeDemand", "throttleDemand", "steerCommand",
  "steerAngle", "gripFront", "gripRear", "forceFront", "forceRear",
  "frontUtil", "rearUtil", "slipFront", "slipRear", "lateralAccel", "inPitLane",
  "errCount", "pitWorked", "aiHeadV",
  "passPlan",
  "_coastHeld", "lastLap",
  "_snapProg", "_snapX", "_snapSpeed"];
function apiHook(base, path, fix) {
  if (typeof path !== "string" || path.charAt(0) !== "/")
    return Promise.resolve({ ok: false, error: "missing_path", message: "needs a path starting with /", fix });
  if (typeof F1API === "undefined")
    return Promise.resolve({ ok: false, error: "no_api", message: "js/data/api.js is not loaded yet (open the DATA HUB once)", fix });
  return F1API.request(base + path, 0, { cache: false });
}

const noAudio = () => (typeof GameAudio === "undefined"
  ? { ok: false, error: "no_audio", message: "GameAudio is not loaded", fix: "reload the page" }
  : null);
const { els, smp, smp2, gfx, canvas, GAME_LAPS, TT_LAPS, LONG_GRIP,
        applyRaceSettings, camVantage, endRace, gridUp, gripMult, isErsDeploying,
        copyLightTune, loadCarModel, loadTrack, persistLightTune, refreshLightTunePanel,
        restoreLightTune,
        rescuePlayer, setCamMode, setLightTune, setWeatherLive, snapGameCam,
        startRace, startWeatherArc, update, wrapS } = G;
const openCareer = (...a) => G.openCareer(...a);
const { CAM_MODES } = CamModes;
const { TUNE_DEFS, LT } = LightTune;

const agentView = AgentView.create(G);



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
    car.gridPos = i + 1; delete car.classified; delete car.dsq;
    if (car.dnfAt != null) { car.retired = true; car.dnf = car.dnfWhy; car.dnfAt = null; }
    const rt = DriverRatings.get(car.code, car.tier, Career.devFor(car.team && car.team.id, car.seat));
    const swing = (Career.rnd(round, "race", car.driverId) - 0.5) * 10 * (1 - rt.craft / 200);
    car.cuts = Career.rnd(round, "cuts", car.driverId) * 100 < (100 - rt.awareness) ? 2 : 0;
    car.penalty = 0;
    const scruffy = Career.rnd(round, "hits", car.driverId) * 100 < (100 - rt.awareness);
    car.hits = scruffy ? 1 : 0;
    car.hitSev = scruffy ? 0.5 : 0;
    car.wallHits = Career.rnd(round, "wall", car.driverId) * 100 < (100 - rt.awareness) / 2 ? 1 : 0;
    grid.push({ car, key: car.retired ? 1000 + i : i + swing });
  }
  if (grid.length !== live.length) return null;
  grid.sort((a, b) => a.key - b.key);
  const order = grid.map((g) => g.car);

  order.forEach((car, i) => { car.finPos = i + 1; });
  const settled = Career.scoreRound(order, G.player, null, null);
  if (!settled) return null;
  return Object.assign({ round: round + 1, podium: order.slice(0, 3).map((c) => c.code) }, settled);
}

function lazyTrackEnsure(o) {
  for (const k of Object.keys(o)) {
    const fn = o[k];
    if (typeof fn !== "function") continue;
    const entering = () => { const l = typeof document !== "undefined" && document.getElementById("loading"); return !!(l && !l.hidden && l.dataset && l.dataset.phase); };
    const payloadReady = (def) => !!(Tracks.circuitPayloadResident
      ? Tracks.circuitPayloadResident(def)
      : (def && def.path && def.path.pts && def.path.pts.length && !def._metaOnly));
    o[k] = function (...a) {
      if (k !== "race" && k !== "tt" && !G.track && !entering() && !Tracks.building()
          && !(typeof TrackBuildClient !== "undefined" && TrackBuildClient.busy())) {
        const def = Tracks.LIST[G.trackIdx];
        const toolkitReady = typeof TrackBuildProps !== "undefined" && !!TrackBuildProps;
        if (payloadReady(def) && toolkitReady) loadTrack(G.trackIdx);
      }
      return fn.apply(this, a);
    };
  }
  return o;
}

function resetStartLights(hidden) {
  els.lights.hidden = hidden;
  for (const l of els.lights.children) l.classList.remove("on");
}

function placeFromTrack(car, sampled) {
  const rl = Math.hypot(sampled.r[0], sampled.r[2]) || 1;
  car.px = sampled.p[0] + sampled.r[0] / rl * car.x;
  car.pz = sampled.p[2] + sampled.r[2] / rl * car.x;
  car.head = Math.atan2(sampled.t[0], sampled.t[2]);
}

const api = {
  jump(frac, speed, lateral) {
    if (!G.player || !G.track) return false;
    if (!finiteOrNil(frac) || !finiteOrNil(speed) || !finiteOrNil(lateral)) return false;
    IncidentSim.release(G.player);
    const f01 = (((frac || 0) % 1) + 1) % 1;
    const sNew = wrapS(f01 * G.track.total);
    G.player.prog += sNew - G.player.s;
    G.player.s = sNew; G.player._prevS = sNew;
    if (lateral != null) G.player.x = lateral;
    if (speed != null) G.player.speed = speed;
    Tracks.sample(G.track, G.player.s, smp);
    placeFromTrack(G.player, smp);
    G.player.vLat = 0; G.player.yawRateCur = 0;
    G.player.rescueT = 0; G.player.wallT = 0; G.player.wasOnWall = false;
    G.player.wrongT = 0; G.player.wrongWay = false; G.player.offT = 0;
    AgentView.syncRenderAnchors(G.player);
    if ((G.state === "race" || G.state === "count") && G.refreshHud) G.refreshHud(true);
    return { s: G.player.s, total: G.track.total };
  },
  park(frac, lateral) {
    if (!G.player || !G.track) return false;
    G.skyViewOverride = null;
    G.state = "race"; G.raceT = Math.max(G.raceT, 1);
    if (G.loadingScreen && G.loadingScreen.lowerWaitPlate) G.loadingScreen.lowerWaitPlate();
    resetStartLights(true);
    G.lightsLit = 0;
    G.cars.forEach((c) => { if (!c.isPlayer) { c.prog -= 600; c.s = wrapS(c.s - 600); c.speed = 0; } });
    const r = this.jump(frac, 0, lateral !== undefined ? lateral : 0);
    G.frozen = true;
    return r;
  },
  sky(frac, lateral) {
    const r = this.park(frac, lateral);
    if (!r) return false;
    G.dbgCam = null;
    Tracks.sample(G.track, G.player.s, smp);
    const e = [smp.p[0], smp.p[1] + 3.5, smp.p[2]];
    const t = [
      smp.p[0] + smp.t[0] * 20,
      smp.p[1] + 34,
      smp.p[2] + smp.t[2] * 20,
    ];
    G.skyViewOverride = { eye: e, tgt: t, fov: 78 };
    G.camEye[0] = e[0]; G.camEye[1] = e[1]; G.camEye[2] = e[2];
    G.camTgt[0] = t[0]; G.camTgt[1] = t[1]; G.camTgt[2] = t[2];
    G.camFov = 75;
    return r;
  },
  repro(o) {
    if (o === undefined) {
      const cam = this.camera();
      const meta = document.querySelector('meta[name="apex-build"]');
      return {
        v: 1,
        build: meta ? meta.content : null,
        track: this.info().track,
        tod: G.setTimeOfDay(), wx: G.weather(),
        teamIdx: (() => { try { return +localStorage.getItem("apex26.team"); } catch (_) { return null; } })(),
        teamId: (() => { const p = G.cars && G.cars.find((c) => c.isPlayer); return p && p.team && p.team.id; })(),
        halo: typeof CockpitOpts !== "undefined" ? CockpitOpts.halo() : null,
        cam: { mode: cam.mode, tune: CamTune.values(cam.mode) },
        cars: (G.cars || []).map((c, i) => ({
          i, me: !!c.isPlayer, team: c.team && c.team.id,
          s: +(c.s || 0).toFixed(3), x: +(c.x || 0).toFixed(3),
          prog: +(c.prog || 0).toFixed(3), speed: +(c.speed || 0).toFixed(3),
        })),
      };
    }
    if (!o || typeof o !== "object" || !G.track) {
      return { ok: false, error: "invalid_repro", message: "repro(obj) needs a captured blob and a loaded track.", fix: "Call repro() with no args to capture, then repro(that) after race()." };
    }
    if (o.cam && o.cam.mode) { this.camera(o.cam.mode); if (o.cam.tune) this.camTune(o.cam.mode, o.cam.tune); }
    if (o.tod) G.setTimeOfDay(o.tod);
    if (o.wx) G.weather(o.wx);
    let placed = 0, skipped = 0;
    if (Array.isArray(o.cars)) for (const rec of o.cars) {
      const c = (rec.me && (G.cars || []).find((k) => k.isPlayer)) || G.cars[rec.i];
      if (!c || (rec.team && c.team && c.team.id !== rec.team)) { skipped++; continue; }
      c.s = wrapS(rec.s); c.x = rec.x; c.prog = rec.prog; c.speed = rec.speed;
      placed++;
    }
    const me = (o.cars || []).find((r) => r.me);
    if (me && G.track.total) this.jump(me.s / G.track.total, me.speed, me.x);
    if (G.player) { G.frozen = true; snapGameCam(); }
    return { restored: true, cars: placed, skipped, cam: o.cam && o.cam.mode,
             teamMatches: (() => { const p = G.cars && G.cars.find((c) => c.isPlayer);
               return !o.teamId || (p && p.team && p.team.id === o.teamId); })() };
  },
  info: () => ({
    state: G.state, track: (G.state === "race" || G.state === "count") ? (G.track && G.track.def.id) : null,
    n: G.track && G.track.n, total: G.track && G.track.total, timeTrial: G.timeTrial, seasonMode: G.seasonMode,
    flow: G.flow, session: G.session, career: !!G.career,
    practice: G.practice, duel: G.duel,
    raceQuali: !!G.raceQuali, raceGrid: G.raceGrid, lapsTarget: G.lapsTarget,
    sectors: G.track && G.track.def && G.track.def.sectors ? G.track.def.sectors.slice() : null,
    turns: G.track && G.track.def && G.track.def.turns ? G.track.def.turns.length : null,
    ...(({ warming, liveTicks }) => ({ warming, liveTicks }))(G.cameraDampingState()),
  }),
  garageCam: () => ({
    exterior: typeof GaragePrebuild !== "undefined" && GaragePrebuild.instance() ? GaragePrebuild.instance().state().exterior : null,
    on: G.setupPreviewOn, spin: G.setupPreviewSpin,
    az: G.setupPreviewAz, el: G.setupPreviewEl, dist: G.setupPreviewDist,
    effDist: G.spEffDist, fitD: G.spEffFit, panelFrac: G.spEffPanel,
    pan: G.setupPreviewPan.slice(),
    xOn: G.setupPreviewXOn, aeroX: G.setupPreviewAeroX,
  }),
  garagePrebuild: () => (typeof GaragePrebuild !== "undefined" && GaragePrebuild.instance() ? GaragePrebuild.instance().state() : null),
  menuPrep: () => (G.menuPrep ? G.menuPrep() : null),
  garagePrewarm: (on) => (typeof GaragePrebuild !== "undefined" && GaragePrebuild.instance() ? GaragePrebuild.instance().setEnabled(on) : null),
  garageAero(on, opts) {
    if (!G.setupPreviewOn) return { ok: false, error: "garage_closed" };
    if (on !== undefined) G.setSetupAero(!!on, opts);
    return { xOn: G.setupPreviewXOn, aeroX: +G.setupPreviewAeroX.toFixed(4),
             mode: G.setupPreviewAeroX > 0.05 ? "X" : "Z" };
  },
  aeroEdge(on) {
    const KEY = "apex26.aeroEdge";
    if (on !== undefined) {
      try { if (on) localStorage.setItem(KEY, "1"); else localStorage.removeItem(KEY); }
      catch (e) {  }
    }
    try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; }
  },
  garageStep(dt, n) {
    if (!G.setupPreviewOn) return { ok: false, error: "garage_closed" };
    const [step, count] = stepArgs(dt, n);
    for (let i = 0; i < count; i++) G.stepSetupAero(step);
    return this.garageAero();
  },
  garageTeam(id, seatWanted) {
    if (!G.setupPreviewOn) return { ok: false, error: "garage_closed" };
    const i = Teams.LIST.findIndex((t) => t.id === id);
    if (i < 0) return { ok: false, error: "unknown_team", id };
    const t = Teams.LIST[i];
    const label = t.name.toUpperCase();
    const wantSeat = Number.isInteger(seatWanted) && seatWanted >= 0 && seatWanted < t.drivers.length ? seatWanted : null;
    if (G.teamIdx === i && (wantSeat == null || wantSeat === G.driverIdx)) return { ok: true, switched: false, label, seat: G.driverIdx };
    const taken = G.peerSeats ? G.peerSeats() : [];
    const isTaken = (si) => taken.some((s) => s.team === t.id && s.driver === si);
    let seat = wantSeat != null ? wantSeat : 0;
    if (wantSeat == null) while (seat < t.drivers.length - 1 && isTaken(seat)) seat++;
    G.teamIdx = i;
    G.driverIdx = seat;
    G.store.set("team", i);
    G.store.set("driver", seat);
    try { document.documentElement.dataset.team = t.id; } catch (_) {  }
    if (typeof GarageScene !== "undefined" && GarageScene.dropPreviewMeshes) { GarageScene.dropPreviewMeshes(); G._spMeshKey = ""; }
    G.buildSetup();
    G.tickUi();
    return { ok: true, switched: true, label, seat };
  },
  garageFrame(view, opts) {
    if (!G.setupPreviewOn) return { ok: false, error: "garage_closed" };
    if (!view) return { ok: false, error: "no_view" };
    if (view !== "free") G.setSetupView(view);
    let o = opts || {};
    const num = (v) => (Number.isFinite(v) ? v : null);
    const xyz = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(+n));
    if (xyz(o.eye) && xyz(o.look)) {
      const dx = +o.eye[0] - +o.look[0], dy = +o.eye[1] - +o.look[1], dz = +o.eye[2] - +o.look[2];
      const d = Math.hypot(dx, dy, dz) || 1e-6;
      o = Object.assign({}, o, { target: o.look.map(Number), az: Math.atan2(dx, dz),
        el: Math.asin(Math.max(-1, Math.min(1, dy / d))), dist: d, clamp: false });
    }
    const lens = num(o.fov) > 0 || o.centre ? { fov: num(o.fov) > 0 ? Math.max(5, Math.min(90, o.fov)) : null, centre: !!o.centre } : null;
    G.setSetupFree(o.clamp === false);
    if (lens) G.setSetupFree( (lens));
    if (Array.isArray(o.target) && o.target.length === 3) G.setSetupAim(o.target.map(Number));
    if (o.lamp !== undefined && typeof GarageScene !== "undefined" && GarageScene.spot) GarageScene.spot(o.lamp || null);
    if (num(o.az) != null) G.nudgeSetupCam(o.az - G.setupPreviewAz, 0, 0);
    if (num(o.el) != null) G.nudgeSetupCam(0, o.el - G.setupPreviewEl, 0);
    if (num(o.dist) > 0) G.nudgeSetupZoom(o.dist / G.setupPreviewDist);
    const steps = (n, fn) => { for (let i = 0; i < Math.abs(n | 0); i++) fn(n > 0 ? 1 : -1); };
    steps(o.azNudge != null ? o.azNudge : o.nudgeAz, (s) => G.nudgeSetupCam(0.18 * s, 0, 0));
    steps(o.elNudge != null ? o.elNudge : o.nudgeEl, (s) => G.nudgeSetupCam(0, 0.12 * s, 0));
    steps(o.zoom, (s) => G.nudgeSetupZoom(s > 0 ? 1 / 1.12 : 1.12));
    steps(o.strafe, (s) => G.setupPan(0.15 * s, 0));
    steps(o.dolly, (s) => G.setupPan(0, 0.15 * s));
    if (Array.isArray(o.pan)) G.setupPan(+o.pan[0] || 0, +o.pan[1] || 0);
    const c = this.garageCam();
    return { ok: true, view, az: c.az, el: c.el, dist: c.effDist, pan: c.pan };
  },
  garageParts(parts) {
    const team = Teams.LIST[G.teamIdx];
    if (!team || !parts || typeof parts !== "object") return { ok: false, error: "bad_parts" };
    const cur = Object.assign({}, G.getTeamParts(team.id));
    for (const [cat, id] of Object.entries(parts)) {
      if (typeof id === "string" && id !== "") cur[cat] = id;
    }
    G.saveTeamParts(team.id, cur);
    if (!G.setupPreviewOn) G.recomputePlayerMods();
    else { if (typeof GarageScene !== "undefined" && GarageScene.dropPreviewMeshes) { GarageScene.dropPreviewMeshes(); G._spMeshKey = ""; } G.buildSetup(); }
    return { ok: true, team: team.id, parts: cur, live: !G.setupPreviewOn };
  },
  meshToggle(o) { G.hideMeshes = Object.assign({}, G.hideMeshes, o || {}); return G.hideMeshes; },
  probe() {
    if (!G.player || !G.track) return null;
    const lineAt = (s) => TrackLine.at(G.track, wrapS(s)).x;
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
      lineAhead: G.track.line ? lineAt(G.player.s + Math.min(90, Math.max(25, Math.abs(G.player.speed) * 0.9))) : null,
    };
  },
  scan(distAhead) {
    if (!G.player || !G.track) return null;
    const one = (d) => {
      const s = wrapS(G.player.s + (d || 0));
      Tracks.sample(G.track, s, smp);
      return { s, k: Tracks.curvature(G.track, s), hw: smp.hw, slope: smp.t[1] || 0 };
    };
    return Array.isArray(distAhead) ? distAhead.map(one) : one(distAhead);
  },
  tuning() {
    return {
      wheelbase: G.WHEELBASE,
      expo: G.STEER_EXPO,
      maxSlip: G.STEER_MAX_SLIP,
      speedRef: G.STEER_SPEED_REF,
      drift: G.DRIFT,
      roadFollow: G.ROAD_FOLLOW,
      playerGrip: G.PLAYER_GRIP,
      frontGrip: G.FRONT_GRIP,
      yawDamp: G.YAW_DAMP,
      yawInertia: G.YAW_INERTIA,
      pace: G.PACE,
      raceLineAssist: G.raceLineAssist,
      maxTilt: Input.maxTilt,
      deadzone: Input.deadzone,
      tiltCutoff: Input.minCutoff,
      wheelState: typeof WheelState !== "undefined" && WheelState.enabled(), brakeThermal: typeof WheelState !== "undefined" && WheelState.thermalEnabled(),
    };
  },
  physState(o) {
    if (!G.player || G.player.px == null) return null;
    if (!G.track) return { error: "no track" };
    const dAx = typeof DamageHandling !== "undefined" ? DamageHandling.axles() : null;
    const slip = Math.atan2(G.player.vLat || 0, Math.max(1, G.player.speed));
    Tracks.sample(G.track, G.player.s, smp);
    const { axFrac, slipFactor } = AgentView.slipBudget(G.player, LONG_GRIP, gripMult());
    return {
      s: G.player.s, x: G.player.x, speed: G.player.speed, prog: G.player.prog,
      px: G.player.px, pz: G.player.pz,
      head: G.player.head, vLat: G.player.vLat || 0,
      yawRate: G.player.yawRateCur || 0,
      slipDeg: slip * 180 / Math.PI, slope: smp.t[1] || 0,
      wrongWay: !!G.player.wrongWay, rescueT: G.player.rescueT || 0, lap: G.player.lap,
      axEstSm: +(G.player.axEstSm ?? 0).toFixed(2),
      axFrac: +axFrac.toFixed(3),
      slipFactor: +slipFactor.toFixed(3), driving: o && o.lite ? undefined : G.coach.status(),
      drivenSlip: G.player.slipFactor != null ? +G.player.slipFactor.toFixed(3) : null,
      brakeBias: G.player.brakeBias != null ? +G.player.brakeBias.toFixed(3) : null,
      aeroX: +(G.player.aeroX || 0).toFixed(3), brakeFade: G.player.brakeFade != null ? +G.player.brakeFade.toFixed(3) : null, brakeTemp: G.player.brakeTF != null ? { f: Math.round(G.player.brakeTF), r: Math.round(G.player.brakeTR) } : null,
      xOn: !!G.player.xOn, xArmed: !!G.player.xArmed,
      vmaxNow: +(G.player._vmaxNow || 0).toFixed(3),
      towing: +(G.player.towing || 0).toFixed(3),
      wake: +(G.player.wake || 0).toFixed(3),
      aeroGrip: +(G.player._aeroGrip || 0).toFixed(4),
      damageAxF: dAx ? +dAx.f.toFixed(4) : 1,
      damageAxR: dAx ? +dAx.r.toFixed(4) : 1,
      damageHandling: typeof DamageHandling !== "undefined" && DamageHandling.isEnabled(),
      aeroDf: +G.aeroDfMult(G.player).toFixed(3),
      aeroLoad: +(G.player.aeroLoad != null ? G.player.aeroLoad : 0.5).toFixed(3),
      xVmaxGain: +G.xVmaxGain(G.player).toFixed(4),
      xDfLoss: +G.xDfLoss(G.player).toFixed(4),
      ersDeploy: +(G.player.ersDeploy != null ? G.player.ersDeploy : 0.5).toFixed(3),
      ersRegen: +(G.player.ersRegen != null ? G.player.ersRegen : 0.5).toFixed(3),
      drain: +G.drainFor(G.player).toFixed(4),
      regen: +G.regenFor(G.player).toFixed(4),
      otTime: +G.otTimeFor(G.player).toFixed(2),
      otMJ: +OvertakeMode.mj(G.player).toFixed(3),
      tyreCompound: G.player.tyre ? G.player.tyre.id : null,
      tyreWear: +G.tyres.spent(G.player).toFixed(4),
      tyreGrip: +G.tyres.gripMul(G.player).toFixed(4),
      tyreLoad: +(G.player._tyreLoad || 0).toFixed(3),
    };
  },
  pit(arg) {
    if (!G.pits) return null;
    const o = arg && typeof arg === "object" ? arg : {};
    const c = o.car != null ? (G.cars || [])[o.car] : G.player;
    if (o.arm != null) G.pits.arm(c, !!o.arm);
    const out = G.pits.info(c);
    if (out && c) { out.plan = c.pitPlan || null; out.why = c.pitWhy || ""; }
    if (out) {
      const col = (c && c.team && c.team.color) || [0.30, 0.32, 0.36];
      const mesh = (typeof CarMesh !== "undefined" && CarMesh.getCrewMesh)
        ? CarMesh.getCrewMesh(col) : null;
      out.crew = mesh
        ? { people: mesh._crewPeople || 0, verts: mesh._crewVerts || mesh.count || 0 }
        : null;
      out.crewDrawn = typeof G.pitCrewDrawn === "function" ? G.pitCrewDrawn() : 0;
    }
    return out;
  },
  pitSigns() {
    const t = G.track, q = t && t.pitSigns, m = t && t.meshes;
    const s = typeof PitSigns !== "undefined" ? PitSigns.stats() : { drawn: 0, calls: 0 };
    return { cells: q ? q.cells.length : 0, mesh: !!(m && m.pitSigns), tex: !!(m && m.pitSignTex), drawn: s.drawn, calls: s.calls };
  },
  tyres(arg) {
    if (!G.tyres) return null;
    const o = arg && typeof arg === "object" ? arg : {};
    if (o.level != null && TyreModel.isLevel(o.level)) { G.raceTyreWear = o.level; G.tyres.setLevel(o.level); }
    if (o.fit && !o.field) {
      const fc = o.car != null ? (G.cars || [])[o.car] : G.player;
      if (fc) G.tyres.fit(fc, G.tyres.classRecord(o.fit));
    }
    if (o.field) {
      return (G.cars || []).map((c) => Object.assign({ driver: c.driverId, code: c.code }, G.tyres.info(c)));
    }
    const c = o.car != null ? (G.cars || [])[o.car] : G.player;
    return G.tyres.info(c);
  },
  damage(i, hit) {
    const c = i != null ? (G.cars || [])[i] : G.player;
    if (!c || typeof Damage === "undefined") return null;
    if (hit === "reset") Damage.reset(c);
    else if (hit && typeof hit === "object") Damage.apply(Damage.get(c), +hit.long || 0, +hit.lat || 0, +hit.sev || 0);
    return Damage.state(c);
  },
  ersPlan(p) { const ok = p === undefined ? true : EnergyPlan.setPlan(p); return { plan: EnergyPlan.plan(), ok, neutral: EnergyPlan.isNeutral() }; },
  ersForecast(o) { return EnergyPlan.report(G.player, o); },
  setPhysics(o) {
    o = o || {};
    for (const key of ["drift", "pace", "speedRef", "wheelbase", "expo", "maxSlip", "roadFollow", "playerGrip", "frontGrip", "yawDamp", "yawInertia", "maxTilt", "deadzone", "tiltCutoff"]) {
      if (o[key] != null && !Number.isFinite(o[key])) throw new TypeError("setPhysics: " + key + " must be finite");
    }
    for (const key of ["drift", "maxSlip", "roadFollow", "playerGrip", "frontGrip", "yawDamp"]) {
      if (o[key] != null && o[key] < 0) throw new RangeError("setPhysics: " + key + " must be nonnegative");
    }
    if (G.records && Object.keys(o).length) G.records.invalidate();
    const fl = (v, lo) => (Number.isFinite(v) ? Math.max(lo, v) : null);
    if (o.drift != null) G.DRIFT = o.drift;
    if (o.pace != null && fl(o.pace, 0.05) != null) G.PACE = fl(o.pace, 0.05);
    if (o.speedRef != null && fl(o.speedRef, 1) != null) { G.STEER_SPEED_REF = fl(o.speedRef, 1); Input.setSteerSpeedRef(G.STEER_SPEED_REF); }
    if (o.wheelbase != null && fl(o.wheelbase, 0.5) != null) G.WHEELBASE = fl(o.wheelbase, 0.5);
    if (o.expo != null && fl(o.expo, 0.2) != null) G.STEER_EXPO = fl(o.expo, 0.2);
    if (o.maxSlip != null) G.STEER_MAX_SLIP = o.maxSlip;
    if (o.roadFollow != null) G.ROAD_FOLLOW = o.roadFollow;
    if (o.playerGrip != null) G.PLAYER_GRIP = o.playerGrip;
    if (o.frontGrip != null) G.FRONT_GRIP = o.frontGrip;
    if (o.yawDamp != null) G.YAW_DAMP = o.yawDamp;
    if (o.yawInertia != null && fl(o.yawInertia, 0.05) != null) G.YAW_INERTIA = fl(o.yawInertia, 0.05);
    if (o.maxTilt != null) Input.setTiltSensitivity(o.maxTilt);
    if (o.deadzone != null) Input.setTiltDeadzone(o.deadzone);
    if (o.tiltCutoff != null) Input.setTiltSmoothing(o.tiltCutoff);
    if (o.wheelState != null && typeof WheelState !== "undefined") WheelState.setEnabled(o.wheelState === true, false);
    if (o.brakeThermal != null && typeof WheelState !== "undefined") WheelState.setThermal(o.brakeThermal === true, false);
    return this.tuning();
  },

  setSpeed(v) {
    if (!G.player || G.player.px == null || !Number.isFinite(v)) return false;
    G.player.speed = Math.max(0, Math.min(200, v));
    return { speed: G.player.speed };
  },

  spin(deg) {
    if (!G.player || G.player.px == null || !Number.isFinite(deg)) return false;
    G.player.head = G.player.head + deg * Math.PI / 180;
    G.player.vLat = 0;
    G.player.yawRateCur = 0;
    return { head: +(G.player.head * 180 / Math.PI).toFixed(1) + "°" };
  },

  nudge(dLat = 0, dSpeed = 0) {
    if (!G.player || G.player.px == null || !Number.isFinite(dLat) || !Number.isFinite(dSpeed)) return false;
    if (dLat)   G.player.vLat  = (G.player.vLat || 0) + dLat;
    if (dSpeed) G.player.speed = Math.max(0, (G.player.speed || 0) + dSpeed);
    return { speed: +(G.player.speed || 0).toFixed(2), vLat: +(G.player.vLat || 0).toFixed(2) };
  },

  cinematic(frac, opts = {}) {
    if (!G.track) return false;
    const fr = ((frac % 1) + 1) % 1;
    const k = Tracks.curvature(G.track, fr * G.track.total);
    const kAbs = Math.min(Math.abs(k), 0.05);
    const baseAz = k === 0 ? 35 : Math.sign(k) * (70 + 40 * kAbs / 0.05);
    const az = baseAz + (opts.azOff || 0);
    const dist = opts.dist != null ? opts.dist : 60;
    const el   = opts.el   != null ? opts.el   : 18;
    const h    = opts.h    != null ? opts.h    : 1.5;
    const fov  = opts.fov  != null ? opts.fov  : 52;
    const res  = this.orbit(fr, az, el, dist, h, { fov, far: opts.far, fog: opts.fog, clear: opts.clear });
    return res ? Object.assign(res, { az: +az.toFixed(1), k: +k.toFixed(5) }) : false;
  },

  tourShots(n = 12, opts = {}) {
    if (!G.track) return [];
    const dist    = opts.dist     != null ? opts.dist     : 80;
    const el      = opts.el       != null ? opts.el       : 20;
    const azOff   = opts.azOffset != null ? opts.azOffset : 35;
    const shots   = [];
    if (opts.atCorners) {
      const tn = G.track.n, total = G.track.total, kv = [];
      for (let k = 0; k < tn; k++) kv.push(Tracks.curvature(G.track, k / tn * total));
      let apex = [];
      for (let k = 0; k < tn; k++) {
        const a = (k - 1 + tn) % tn, b = (k + 1) % tn, ak = Math.abs(kv[k]);
        if (ak > 0.006 && ak >= Math.abs(kv[a]) && ak > Math.abs(kv[b])) apex.push({ k, ak });
      }
      apex.sort((p, q) => q.ak - p.ak);
      if (n && apex.length > n) apex = apex.slice(0, n);
      apex.sort((p, q) => p.k - q.k);
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
  pair(frac, speed) {
    if (!G.track) return false;
    G.state = "race"; G.raceT = Math.max(G.raceT, 1);
    resetStartLights(true);
    G.lightsLit = 0;
    const f = frac == null ? 0.3 : frac, v = speed == null ? 55 : speed;
    const prog = f * G.track.total, s = wrapS(prog);
    const ai = G.cars.filter((c) => !c.isPlayer);
    if (ai.length < 2) return false;
    const a = ai[0], b = ai[1];
    [a, b].forEach((c, i) => {
      c.prog = prog; c.s = s; c.speed = v;
      c.x = i === 0 ? 0.6 : -0.6;
      c.xVis = c.x; c.lap = 0; c.finished = false;
    });
    G.cars.forEach((c) => { if (c !== a && c !== b) { c.prog -= 800; c.s = wrapS(c.s - 800); } });
    return { a: G.cars.indexOf(a), b: G.cars.indexOf(b) };
  },
  jam(n) {
    if (!G.track) return false;
    G.state = "race"; G.raceT = Math.max(G.raceT, 1);
    resetStartLights(true);
    G.lightsLit = 0;
    const ai = G.cars.filter((c) => !c.isPlayer), m = Math.min(n || 5, ai.length);
    const prog = 0.5 * G.track.total;
    const ids = [];
    ai.forEach((c, i) => {
      if (i < m) {
        c.prog = prog + (i - m / 2) * 0.4;
        c.s = wrapS(c.prog); c.speed = 2; c.x = (i - m / 2) * 0.3;
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
    if (!ai || !finiteOrNil(dProg) || !finiteOrNil(dx)) return false;
    ai.prog = G.player.prog + (dProg || 0);
    ai.s = wrapS(G.player.s + (dProg || 0));
    ai.x = G.player.x + (dx || 0);
    ai.xVis = ai.x; ai.speed = G.player.speed; ai.finished = false; ai.lap = G.player.lap;
    ai.launchOn = false;
    G.cars.forEach((c) => { if (c !== ai && !c.isPlayer) { c.prog -= 800; c.s = wrapS(c.s - 800); } });
    return { rival: G.cars.indexOf(ai) };
  },
  rivals(list) {
    if (!G.player || !G.track) return false;
    const ai = G.cars.filter((c) => !c.isPlayer);
    const used = []; list = Array.isArray(list) ? list : []; if (!list.every((q) => q && finiteOrNil(q.dProg) && finiteOrNil(q.dx) && finiteOrNil(q.speed))) return false;
    list.forEach((spec, i) => {
      const c = ai[i];
      if (!c) return;
      c.prog = G.player.prog + (spec.dProg || 0);
      c.s = wrapS(G.player.s + (spec.dProg || 0));
      c.x = G.player.x + (spec.dx || 0);
      c.xVis = c.x; c.speed = spec.speed != null ? spec.speed : G.player.speed;
      c.finished = false; c.lap = G.player.lap; c.launchOn = false;
      used.push(c);
    });
    ai.forEach((c) => { if (!used.includes(c)) { c.prog -= 800; c.s = wrapS(c.s - 800); } });
    return used.map((c) => G.cars.indexOf(c));
  },
  aim(relDeg) {
    if (!G.player || !G.track || G.player.px == null || !finiteOrNil(relDeg)) return false;
    Tracks.sample(G.track, G.player.s, smp);
    G.player.head = Math.atan2(smp.t[0], smp.t[2]) + (relDeg || 0) * Math.PI / 180;
    G.player.vLat = 0;
    return { head: G.player.head };
  },
  go() {
    if (G.flyingStart) G.flyingStart.stop();
    if (!G.player || !G.cars.length) return false;
    G.state = "race"; G.raceT = Math.max(G.raceT, 0.5);
    if (G.loadingScreen && G.loadingScreen.lowerWaitPlate) G.loadingScreen.lowerWaitPlate();
    resetStartLights(true);
    G.lightsLit = 0;
    return G.state;
  },
  carState: () => G.cars.map((c) => {
    const o = {};
    for (const k in c) { const v = c[k]; if (typeof v === "number" || typeof v === "boolean") o[k] = v; }
    return o;
  }),
  cars: () => G.cars.map((c, i) => ({
    id: i, x: +c.x.toFixed(3), xv: +((c.xVis !== undefined ? c.xVis : c.x)).toFixed(3),
    yaw: +(c.yawVis || 0).toFixed(4),
    prog: +c.prog.toFixed(2), speed: +c.speed.toFixed(2), lap: c.lap,
    ct: +(c.contactT || 0).toFixed(2), kerb: !!c.onKerb, p: !!c.isPlayer,
    ax: +(c.aeroX || 0).toFixed(2), err: c.errCount | 0,
  })),
  buildProfile: () => (G.track && G.track.buildProfile) || null,
  raceProfile: () => (G.raceProfile && G.raceProfile()) || null,
  raceEntryProfile: () => (typeof RaceEntryProfile !== "undefined" && RaceEntryProfile.snapshot()) || null,
  frametimeBench(cmd) {
    if (typeof GameMetrics === "undefined") return null;
    if (cmd === "reset") { GameMetrics.frametimeBenchReset(); return true; }
    if (cmd === "snapshot") return GameMetrics.frametimeBenchSnapshot();
    return { cmds: ["reset", "snapshot"] };
  },
  raceEntryStages: () => (typeof RaceEntryProfile !== "undefined" && RaceEntryProfile.stageTable()) || null,
  raceEntryStageDiff: (raceSnap, practiceSnap) => (
    typeof RaceEntryProfile !== "undefined" && RaceEntryProfile.diffStages
      ? RaceEntryProfile.diffStages(raceSnap, practiceSnap)
      : null),
  multiDraw: (on) => {
    if (!gfx || !gfx.multiDraw) return { supported: false, on: false };
    if (on !== undefined) gfx.multiDraw(!!on);
    return gfx.multiDrawStats ? gfx.multiDrawStats() : { supported: false, on: !!on };
  },
  occlusionCull: (on) => {
    if (!gfx || !gfx.occlusionCull) return { supported: false, on: false };
    if (on !== undefined) gfx.occlusionCull(!!on);
    return gfx.occlusionStats ? gfx.occlusionStats() : { supported: false, on: !!on };
  },
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
  race(trackRef, timeOfDay, weather, opts) {
    const i = typeof trackRef === "number"
      ? trackRef
      : Tracks.LIST.findIndex((t) => t.id === trackRef);
    if (i == null || i < 0 || i >= Tracks.LIST.length) return false;
    G.trackIdx = i;
    G.seasonMode = false;
    G.timeTrial = false;
    G.raceLaps = (opts && opts.laps > 0) ? (opts.laps | 0) : GAME_LAPS;
    if (G.endWeatherSession) G.endWeatherSession();
    G.raceWeather = (weather === "wet" || weather === "rain" || weather === "overcast" || weather === "fog" || weather === "storm") ? weather : "dry";
    G.raceTimeOfDay = timeOfDay || "default";
    if (opts && opts.grid != null) G.raceGrid = opts.grid;
    if (opts && opts.duel != null) {
      G.duel = !!opts.duel;
      G.duelLegend = typeof opts.duel === "string" ? opts.duel : "";
    }
    return settled(startRace(),
      { track: Tracks.LIST[i].id, timeOfDay: G.raceTimeOfDay, weather: G.raceWeather });
  },
  ensureCircuit: (idx) => (G.ensureCircuit ? G.ensureCircuit(idx) : Promise.resolve()),
  tt(trackRef, timeOfDay) {
    const i = typeof trackRef === "number"
      ? trackRef
      : Tracks.LIST.findIndex((t) => t.id === trackRef);
    if (i == null || i < 0 || i >= Tracks.LIST.length) return false;
    G.trackIdx = i;
    G.seasonMode = false;
    G.timeTrial = true;
    G.raceLaps = TT_LAPS;
    if (G.endWeatherSession) G.endWeatherSession();
    G.raceWeather = "dry";
    G.raceTimeOfDay = timeOfDay || "default";
    return settled(startRace(), { track: Tracks.LIST[i].id, timeTrial: true });
  },
  career(opts) {
    if (opts === undefined) return Career.data();
    if (opts === true) { openCareer(); return Career.data(); }
    Career.start(opts || {});
    openCareer();
    return Career.data();
  },
  careerState: () => Career.state(),
  careerMoney(n) {
    const c = Career.data();
    if (!c) return null;
    if (n != null) { c.money = Math.max(0, n | 0); Career.save(); }
    return c.money;
  },
  careerReset() { const result = Career.clear(); if (result.ok) G.refreshCareerButton(); return result; },
  careerFreeMoney(on) { return Career.freeMoney(on); },
  careerGrant(n) { return Career.grant(Number.isFinite(n) ? n : undefined); },
  careerFacility(up) {
    if (up) Career.upgradeFacility();
    return { level: Career.facility(), max: Career.FACILITY_MAX,
             cost: Career.facilityCost(), discount: Career.facilityDiscount() };
  },
  careerAmbition(i) {
    if (i !== undefined) Career.setAmbition(i);
    const c = Career.data();
    return { pick: Career.ambition(), signed: c && c.deal ? Career.ambitionOf(c.deal) : null,
             target: c && c.deal ? c.deal.goal.value : null,
             rungs: Career.AMBITION.map((a) => a.key) };
  },
  careerEra() {
    const e = Career.era();
    if (!e) return null;
    return { id: e.id, name: e.name, cats: e.cats.slice(),
             left: Career.eraSeasonsLeft(), seasons: Career.seasonsElapsed(),
             banned: [...Regulations.bannedIds(e.id)], cap: Career.budgetCap() };
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
    const result = Career.deleteSlot(flavour, i);
    if (!result.ok) return result;
    Career.load();
    G.refreshCareerButton();
    return Object.assign({}, result, { slots: Career.slots() });
  },
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
  drivingLine(mode) {
    if (mode !== undefined) DrivingLine.setMode(String(mode).toLowerCase());
    const c = DrivingLine._cache();
    return { mode: DrivingLine.mode(), built: c.id, samples: c.n, verts: c.count,
             speedAt: (s) => DrivingLine.speedAt(s), zoneAt: (s) => DrivingLine.zoneAt(s) };
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
  assets: () => (typeof Assets === "undefined" ? { supported: false, pack: false, error: "no-module" }
                                               : Assets.state()),
  async assetLoad(tier) {
    if (typeof Assets === "undefined") return { supported: false, pack: false, error: "no-module" };
    if (tier === false) { Assets.unload(); return Assets.state(); }
    Assets.unload();
    await Assets.load(tier ? { tier } : {});
    return Assets.state();
  },
  texCensus: () => (gfx && gfx.texCensus
    ? gfx.texCensus()
    : { supported: false, bytes: null, count: null,
        error: "the active backend has no texture census (GLX only)" }),
  matTex(v) {
    if (v !== undefined) {
      setLightTune("matTexMix", Math.max(0, Math.min(1, +v || 0)));
      persistLightTune();
      if (typeof refreshLightTunePanel === "function") refreshLightTunePanel();
      if (LT.matTexMix > 0 && typeof Assets !== "undefined") Assets.load();
    }
    return LT.matTexMix;
  },
  envProbe(on) {
    const KEY = "apex26.envProbeOff";
    const read = () => { try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; } };
    const was = read();
    if (on !== undefined) {
      try { if (on) localStorage.removeItem(KEY); else localStorage.setItem(KEY, "1"); }
      catch (e) {  }
    }
    const off = read();
    return { on: !off, off, changed: off !== was, needsReload: off !== was };
  },
  credits: () => (typeof Assets === "undefined" ? [] : Assets.credits()),
  setInput(v) {
    const next = v || null;
    if (G.player && G._testInput && G._testInput.throttle && next && !next.throttle && G.player.speed > 8)
      G.player.exhaustPop = 1;
    G._testInput = next;
  },
  clearInput() { G._testInput = null; },
  step(dt, n) {
    const [d, count] = stepArgs(dt, n);
    for (let i = 0; i < count; i++) {
      AgentView.syncRenderAnchors(G.cars);
      update(d);
    }
  },
  tiltSim: {
    step: (deg, dt) => Input.simTilt(deg, dt),
    reset: () => Input.simTiltReset(),
    steerToAngle: (cmd) => Input.steerToTilt(cmd),
  },


  redFlag() {
    const ok = !!(G.redFlagRestart && G.redFlagRestart());
    return ok ? { state: G.state } : false;
  },
  finishRace(opts) {
    if (!G.track || G.state === "results" || G.state === "menu") return false;
    return RaceCeremony.finishThrough(G, endRace, raceOrder, opts);
  },
  ceremony(arg) { return RaceCeremony.apexCall(arg); },

  freeze(v) {
    if (v === undefined) return G.frozen;
    G.frozen = !!v;
    return G.frozen;
  },

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
                            dur: G.weatherArc.dur, weather: G.raceWeather, wetness: (G.trackWetness ? G.trackWetness() : (G.frame.wetness || 0)), rainfall: G.viewRainfall() } : null;
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
      finPos: c.finPos || 0,
      retired: !!c.retired, dnf: c.dnf || null,
      dnfAt: c.dnfAt != null ? +c.dnfAt.toFixed(4) : null,
      contactT: +(c.contactT || 0).toFixed(3),
      wrongWay: !!c.wrongWay, rescueT: +(c.rescueT || 0).toFixed(2),
      energy: +(c.energy || 0).toFixed(3), boostOn: !!c.boostOn,
      otArmed: !!c.otArmed, otT: +(c.otT || 0).toFixed(2), otEarned: !!c.otEarned,
      otMJ: +OvertakeMode.mj(c).toFixed(3), otEnabled: !!G.otEnabled(),
      aeroX: +(c.aeroX || 0).toFixed(3), xOn: !!c.xOn, xArmed: !!c.xArmed,
      brakeHeat: +(c.brakeHeat || 0).toFixed(2), gear: c.gear || 1,
    };
  },

  renderClock(t, hold) { if (t !== undefined) { G.skyT = t; G.skyHold = !!hold; } return G.skyT; },
  trackGraph: () => (G.track && G.track.graph) || null,
  tracks: () => Tracks.LIST.map((t, i) => ({ id: t.id, name: t.name, i })),

  teams: () => Teams.LIST.map((t, i) => ({ id: t.id, name: t.name, engine: t.engine, i })),

  clearMeshes() { G.hideMeshes = {}; return G.hideMeshes; },
  clearCarMeshCaches() {
    if (typeof G.invalidateFactoryMeshCaches === "function") G.invalidateFactoryMeshCaches();
    return true;
  },

  mirror: (mode, pip) => {
    const mp = typeof MirrorPass !== "undefined" ? MirrorPass.instance() : null;
    if (!mp) return null;
    if (mode !== undefined) mp.setMode(mode);
    if (pip) {
      if (pip.mode) mp.setPipMode(pip.mode);
      if ("car" in pip) mp.setSubject(pip.car == null ? null : G.cars[pip.car | 0] || null, pip.cam || "tcam");
    }
    return mp.state();
  },
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
      meanPerChunkRGB: (() => {
        const A = G.frame.allLights;
        if (!A || A.length < 15) return null;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < A.length; i += 15) { r += A[i+3]; g += A[i+4]; b += A[i+5]; n++; }
        return n ? [r / n, g / n, b / n] : null;
      })(),
      bakedLights: ((G.track && (G.track._lights && G.track._lights.length ? G.track._lights : G.track._alwaysLights)) || []).length / 15,
      lampPosts: G.track && G.track.lampPosts ? G.track.lampPosts.length : 0,
      perChunkLights: G.frame.perChunkLights || 0,
      tlxLampGrid: (gfx && typeof gfx.lampGridState === "function") ? gfx.lampGridState() : null,
      roadChunkLamps: G.frame.roadChunkLamps || 0,
      perChunkHeld: (() => {
        if (!(+LT.perChunkLights > 0)) return null;
        if (G.frame.perChunkLights > 0) return null;
        if (gfx && gfx.hasPerChunkLights === false) return "backend";
        try { if (localStorage.getItem("apex26.perChunkOff") === "1") return "latch"; } catch (_) {  }
        if (typeof PerfGov !== "undefined" && PerfGov.autoShed && PerfGov.autoShed() >= 2) return "tier";
        return "day";
      })(),
      sunY: G.frame.sunDir ? G.frame.sunDir[1] : null,
      builtNight: G.builtTrackNight, trackNight: G.track && G.track._night,
      floodEmit: G._lastFloodEmit,
      envProbe: (gfx && gfx.envProbeReady) ? gfx.envProbeReady() : null,
      fogDensity: G.frame.fogDensity,
      fogColor: G.frame.fogColor && G.frame.fogColor.slice(),
      skyHorizon: G.frame.skyHorizon && G.frame.skyHorizon.slice(),
      frameSkyHorizon: G.frameSky.horizon && G.frameSky.horizon.slice(),
      skySunColor: G.frameSky.sunColor && G.frameSky.sunColor.slice(),
      skySunDir: G.frameSky.sunDir && G.frameSky.sunDir.slice(),
      skyStars: G.frameSky.stars, skyMoon: G.frameSky.moon,
      cullDist: G.frame.cullDist, cullFog: G.frame.cullFog && G.frame.cullFog.slice(),
      moonK: G.frame.moonK,
      moonGate: G.frame.moonGate,
      lampCull: LT.lampCull,
    };
  },
  gpuTimer: (on) => {
    if (!gfx || !gfx.gpuTimer) return { supported: false, on: false, ms: -1, software: null };
    const st = gfx.gpuTimer(on);
    const ms = gfx.gpuMs ? gfx.gpuMs() : -1, b = gfx.backendState ? gfx.backendState() : null;
    return { supported: st.supported, on: st.on, ms, software: b ? !!(b.softAdapter || b.softwareGL) : null };
  },
  inspector: (on) => typeof ThreeInspector === "undefined"
    ? { on: false, supported: false, reason: "three-inspector.js not loaded", loading: false }
    : ThreeInspector.set(gfx, on),
  gpuCapture: (a) => typeof ApexGpuCapture === "undefined" ? { on: false, supported: false, reason: "apex-gpu-capture.js not loaded" } : ApexGpuCapture.api(a),
  lifecycle: (o) => typeof ApexLifecycle === "undefined" ? { error: "apex-lifecycle.js not loaded" } : ApexLifecycle.api(G, () => gfx, o),
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

  caution(arg) {
    if (typeof arg === "boolean") G.setCautionEnabled(arg);
    else if (arg && typeof arg === "object" && arg.enabled !== undefined)
      G.setCautionEnabled(!!arg.enabled);
    const st = G.cautionInfo ? G.cautionInfo() : { level: 0, label: "GREEN", enabled: false };
    if (arg && typeof arg === "object" && arg.hazards)
      return Object.assign(st, { hazards: DebrisWorld.hazards() });
    return st;
  },

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

  renderRate(m) {
    if (m !== undefined) {
      const v = String(m);
      if (!RenderRate.setMode(v)) return { ok: false, modes: ["auto", "off", "half", "45", "30"] };
      try { localStorage.setItem("apex26.renderRate", v); } catch (_) {  }
    }
    return RenderRate.state();
  },
  thermalDrift(on) {
    if (on !== undefined) {
      PerfGov.setThermalDrift(!!on);
      try { localStorage.setItem("apex26.thermalDrift", on ? "1" : "0"); } catch (_) {  }
    }
    return PerfGov.thermalDrift();
  },

  renderScale(v) {
    const lite = !!(v && v.lite === true);
    if (v === undefined || lite) return { scale: gfx.getRenderScale(), fps: +(1000 / Math.max(1, PerfGov.fpsEMA())).toFixed(1), floorMs: +PerfGov.floorMs().toFixed(1), auto: PerfGov.autoRes(), tier: PerfGov.tier(), autoTier: PerfGov.autoTier(), lookPostShed: !!(PerfGov.lookPostShed && PerfGov.lookPostShed()), phoneSlowLatch: !!(PerfGov.phoneSlowLatch && PerfGov.phoneSlowLatch()), autoShed: PerfGov.autoShed(), open: PerfGov.openWindow(), frameTimes: lite ? undefined : PerfGov.frameStats(), userTier: PerfGov.userTier(), tierFloor: PerfGov.tierFloor(), crashStrikes: PerfGov.strikes(), scaleFutile: PerfGov.scaleFutile(), tierFutile: PerfGov.tierFutile(), tierHold: PerfGov.tierHold(), effective: typeof ApexLifecycle === "undefined" ? null : ApexLifecycle.effectiveRes(gfx, canvas) };
    if (v === true) { PerfGov.setAutoRes(true); return this.renderScale(); }
    if (typeof v !== "number" || !isFinite(v) || v < 0.5 || v > 1) {
      return { ok: false, error: "bad_argument",
               message: "renderScale() takes a fraction 0.5..1 or true; got " + JSON.stringify(v),
               fix: "renderScale(0.75), or renderScale(true) for the adaptive governor" };
    }
    PerfGov.setAutoRes(false); gfx.setRenderScale(v); return this.renderScale();
  },

  govHold(on) {
    if (on !== undefined) PerfGov.setTierHold(!!on);
    return { tierHold: PerfGov.tierHold(), tier: PerfGov.tier(), autoTier: PerfGov.autoTier(), autoShed: PerfGov.autoShed() };
  },

  spatialUpscale(v) {
    const has = !!(gfx && typeof gfx.setSpatialUpscale === "function" && typeof gfx.getSpatialUpscale === "function");
    if (!has) return { on: false, active: false, scale: gfx && gfx.getRenderScale ? gfx.getRenderScale() : null, available: false };
    if (v !== undefined) {
      const on = !!(+v || v === true || v === "1");
      GameStore.store.rawSet("spatialUpscale", on ? "1" : "0");
      gfx.setSpatialUpscale(on);
    }
    const on = !!gfx.getSpatialUpscale();
    const scale = gfx.getRenderScale();
    const out = { on, active: !!(on && scale < 0.98), scale, available: true };
    if (typeof gfx.getSpatialUpscaleGather === "function") out.gather = !!gfx.getSpatialUpscaleGather();
    return out;
  },

  perf(o) {
    if (typeof PerfSpans !== "undefined") {
      if (o && o.reset) PerfSpans.reset();
      if (o && o.measure !== undefined) PerfSpans.measure(o.measure);
      if (o && o.on !== undefined) PerfSpans.on(o.on);
    }
    if (o && o.lite) return this.renderScale(o);
    const base = this.renderScale();
    if (typeof PerfSpans === "undefined" || !(PerfSpans.isOn() || o)) return base;
    return Object.assign(base, PerfSpans.report(), { gpu: this.gpuTimer() });
  },

  uiScale(v) { return badPct("uiScale", v) || G.setScale("uiScale", "--ui-scale", v); },
  hudScale(v) { return badPct("hudScale", v) || G.setScale("hudScale", "--hud-scale", v); },
  btnScale(v) { return badPct("btnScale", v) || G.setScale("hudBtnScale", "--hud-btn-scale", v); },

  sheetFit(sel) {
    if (typeof SheetShape === "undefined" || !SheetShape.layoutProbe) return null;
    let el = sel && typeof sel === "object" ? sel : null;
    if (typeof sel === "string") el = document.querySelector(sel);
    else if (sel == null) {
      for (const c of document.querySelectorAll(".sheet, .fit-managed")) {
        const r = c.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) { el = c; break; }
      }
    }
    return el ? SheetShape.layoutProbe(el) : null;
  },

  safeMode(v) {
    if (v === undefined) return { strikes: PerfGov.strikes(), tierFloor: PerfGov.tierFloor(), tier: PerfGov.tier() };
    if (v === false) PerfGov.clearStrikes();
    return this.safeMode();
  },

  obs() {
    if (!G.player || G.player.px == null || !G.track) return null;
    Tracks.sample(G.track, G.player.s, smp);
    const { axFrac, slipFactor } = AgentView.slipBudget(G.player, LONG_GRIP, gripMult());
    const slip = Math.atan2(G.player.vLat || 0, Math.max(1, G.player.speed));
    const kNow = Tracks.curvature(G.track, G.player.s);
    const hwNow = smp.hw, slopeNow = smp.t[1] || 0;

    const wallRAbs = Tracks.wallAt(G.track, G.player.s, 1);
    const wallLAbs = Tracks.wallAt(G.track, G.player.s, -1);
    const wallR =  wallRAbs;
    const wallL = -wallLAbs;

    const scanDists = [10, 30, 60];
    const scanAhead = scanDists.map((d) => {
      const ss = wrapS(G.player.s + d);
      Tracks.sample(G.track, ss, smp);
      const sR = Tracks.wallAt(G.track, ss, 1), sLA = Tracks.wallAt(G.track, ss, -1);
      return { d, k: +Tracks.curvature(G.track, ss).toFixed(5), hw: +smp.hw.toFixed(2),
               wallR: +sR.toFixed(2), wallL: +(-sLA).toFixed(2),
               width: +(sR + sLA).toFixed(2) };
    });
    Tracks.sample(G.track, G.player.s, smp);

    const sorted = raceOrder(G.cars);
    const pi = sorted.findIndex((c) => c.isPlayer);
    const rivalAhead  = pi > 0 ? sorted[pi - 1] : null;
    const rivalBehind = pi < sorted.length - 1 ? sorted[pi + 1] : null;

    const inp = G._testInput || {};
    const done = !!G.player.wrongWay ||
      (G.player.rescueLastT != null && (G.raceT - G.player.rescueLastT) < 0.5);

    return {
      s:       +G.player.s.toFixed(3),
      x:       +G.player.x.toFixed(3),
      prog:    +(G.player.prog || 0).toFixed(4),
      lap:      G.player.lap || 0,
      raceT:   +G.raceT.toFixed(3),

      speed:     +(G.player.speed || 0).toFixed(2),
      speedKph:  +((G.player.speed || 0) * 3.6).toFixed(1),
      dashKph:   +G.dashKph(G.player.speed || 0).toFixed(1),
      head:      +(G.player.head || 0).toFixed(4),
      vLat:      +(G.player.vLat || 0).toFixed(3),

      axEstSm:    +(G.player.axEstSm ?? 0).toFixed(2),
      axFrac:     +axFrac.toFixed(3),
      slipFactor: +slipFactor.toFixed(3), driving: G.coach.status(),
      slipDeg:    +(slip * 180 / Math.PI).toFixed(2),

      k:     +kNow.toFixed(5),
      hw:    +hwNow.toFixed(2),
      slope: +slopeNow.toFixed(4),
      gripMult: gripMult(),
      weather: G.raceWeather,

      wallR:  +wallR.toFixed(2),
      wallL:  +wallL.toFixed(2),
      clearR: +(wallR - G.player.x).toFixed(2),
      clearL: +(G.player.x - wallL).toFixed(2),

      energy: +(G.player.energy || 0).toFixed(3),
      gear: G.player.gear || 1,

      aeroX:  +(G.player.aeroX || 0).toFixed(3),
      xOn:    !!G.player.xOn,
      xArmed: !!G.player.xArmed,

      wrongWay: !!G.player.wrongWay,
      offT:     +(G.player.offT || 0).toFixed(2),
      rescueT:  +(G.player.rescueT || 0).toFixed(2),
      done,

      input: {
        steer:    inp.steer    !== undefined ? inp.steer    : null,
        throttle: inp.throttle !== undefined ? !!inp.throttle : null,
        brake:    inp.brake    !== undefined ? !!inp.brake    : null,
      },

      posInField: pi + 1,
      gapAhead:  rivalAhead  ? +(rivalAhead.prog  - (G.player.prog || 0)).toFixed(2) : null,
      gapBehind: rivalBehind ? +((G.player.prog || 0) - rivalBehind.prog).toFixed(2) : null,

      scan: scanAhead,

      reward: {
        speed:    +(G.player.speed || 0).toFixed(2),
        offTrack: +(G.player.offT  || 0).toFixed(2),
        wallDist: +Math.min(wallR - G.player.x, G.player.x - wallL).toFixed(2),
        wrongWay: !!G.player.wrongWay,
      },
    };
  },

  act(input, dt, n) {
    if (!G.track || !G.player) return null;
    if (G.flyingStart && G.flyingStart.active()) G.flyingStart.stop();
    if (G.state === "count") {
      G.state = "race"; G.raceT = 0;
      resetStartLights(true);
      G.lightsLit = 0;
    }
    if (input !== undefined) G._testInput = input || null;
    const [d, count] = stepArgs(dt, n);
    for (let i = 0; i < count; i++) {
      AgentView.syncRenderAnchors(G.cars);
      update(d);
    }
    return this.obs();
  },

    ...ApexCam.hooks(G, { smp, smp2, camVantage, setCamMode, snapGameCam }),
  ...ApexTrack.hooks(G, { smp, wrapS }),
  ...ApexLobby.hooks(G, { raceOrder }),
  ...ApexNet.hooks(G, { resetStartLights }),

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
        pc.createOffer().then((o) => pc && pc.setLocalDescription(o)).catch((e) => { Log.warn("apex", "turnProbe: createOffer/setLocalDescription failed:", e && e.message); });
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

  aiPlace(idx, frac, speed, x) {
    if (!G.track || !G.cars[idx]) return false;
    const c = G.cars[idx];
    if (c.isPlayer) return false;
    if (!finiteOrNil(frac) || !finiteOrNil(speed) || !finiteOrNil(x)) return false;
    const f01 = ((((frac != null ? frac : 0)) % 1) + 1) % 1;
    c.s = c._prevS = wrapS(f01 * G.track.total);
    c.prog = ((c.lap || 0) - 1) * G.track.total + c.s;
    if (x     != null) { c.x = x; c.xVis = x; }
    if (speed != null) c.speed = speed;
    c.vLat = 0; c.yawRateCur = 0;
    Tracks.sample(G.track, c.s, smp2);
    placeFromTrack(c, smp2);
    c.rescueT = 0; c.wallT = 0; c.wasOnWall = false;
    c.wrongT = 0; c.wrongWay = false; c.offT = 0;
    AgentView.syncRenderAnchors(c);
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
      gridLights: G.state === "count", gridStrobe: G.state === "count" && CarMesh.gridStrobe(G.countT),
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
    if (!G.player || !Number.isFinite(+n || 0)) return false;
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

  seed(n, stream) { if (stream === true) return G.simSeed(undefined, true); if (n !== undefined && Number.isFinite(n)) G.seed = n; return G.seed; },

  reset(frac, speed, x, seed) {
    if (!G.track || !G.player) return false;
    if (![frac, speed, x, seed].every(finiteOrNil)) return false;
    G.resetEpisodeOwners();
    if (seed !== undefined) G.seed = seed;
    gridUp();
    if (G.session === "race") G.armReliability(G.cars);
    if (G.flyingStart) G.flyingStart.stop();
    G.state = "race"; G.raceT = 0;
    resetStartLights(true);
    G.lightsLit = 0;
    const f01 = ((((frac != null ? frac : 0)) % 1) + 1) % 1;
    G.player.s     = wrapS(f01 * G.track.total);
    G.player.prog  = f01 * G.track.total;
    G.player.speed = speed != null ? speed : 0;
    G.player.x     = x     != null ? x     : 0;
    G.player.xVis  = G.player.x;
    G.player.vLat  = 0; G.player.yawRateCur = 0;
    G.player.lap   = 0; G.player.axEstSm = 0; G.player.corridorAccel = 0;
    Tracks.sample(G.track, G.player.s, smp);
    placeFromTrack(G.player, smp);
    AgentView.syncRenderAnchors(G.cars);
    for (const c of G.cars) {
      c.gear = 1; c.rpm = PhysicsConsts.IDLE_RPM; c.shiftT = 0;
      c.steerSm = 0; c.brakeHeat = 0; c.axEstSm = 0; c.corridorAccel = 0; c.slipDeg = 0;
      c.aiHead = 0; c.aiBias = null; c.aiFam = 0;
      c.stuckT = 0; c.letPassT = 0; c.passOf = null; c.passT = 0; c.passCool = 0; c.holdOff = null; c.defendSide = 0; c.passFailOf = null; c.passFailT = 0; c.errT = 0; c.pressT = 0; c.zoneKey = -1; c.deploying = false; c.boostOn = false; OvertakeMode.reset(c);
      c.xOn = false; c.aeroX = 0; c.xArmed = false;
      c.wasOnThrottle = false;
      if ("vertLoad" in c) c.vertLoad = undefined;
      c.lane = c.lanePref != null ? c.lanePref : 0;
      c._prevS = c.s;
      for (const k of EPISODE_TRANSIENTS) if (k in c) c[k] = undefined;
    }
    BodyAttitude.reset();
    agentView.beginEpisode();
    G._testInput = null;
    return this.obs();
  },

  world(opts) { return agentView.world(opts); },

  field(opts) { return agentView.field(opts); },

  objective() { return agentView.objective(); },

  trackInfo(opts) { return agentView.trackInfo(opts); },

  render(opts) { return agentView.render(opts); },

  async awaitPresent(timeoutMs) {
    if (typeof GLX === "undefined" || !GLX.awaitSoftPresent) return null;
    return GLX.awaitSoftPresent(timeoutMs);
  },

  carView(opts) { return agentView.carView(opts); },

  survey(opts) { return agentView.survey(opts); },

  rollout(opts) { return agentView.rollout(opts); },

  agentHelp() { return agentView.agentHelp(); },

  scene(opts) { return agentView.scene(opts); },

  describe(id) { return agentView.describe(id); },

  atmosphere() { return agentView.atmosphere(); },

  query(opts) { return agentView.query(opts); },

  terminal() { return agentView.terminal(); },

  openf1(path) { return apiHook("https://api.openf1.org/v1", path, 'await __apex.openf1("/sessions?circuit_short_name=Monaco&year=2024")'); },

  jolpica(path) { return apiHook("https://api.jolpi.ca/ergast/f1", path, 'await __apex.jolpica("/circuits/monaco.json")'); },

  logs(filter) {
    if (typeof Log === "undefined") return [];
    return Log.records(filter);
  },

  audio() {
    return noAudio() || { ok: true, profile: GameAudio.profile(), profiles: GameAudio.profiles(),
      voice: GameAudio.voiceName(), voices: GameAudio.voices(),
      tune: GameAudio.tune(), range: GameAudio.tuneRange(), defaults: GameAudio.tuneDefaults(),
      layers: GameAudio.layers(), rate: GameAudio.rate(), limiterDepth: GameAudio.limiterDepth(), windLevel: GameAudio.windLevel(),
      gravelDepth: GameAudio.gravelDepth(), brakeLevel: GameAudio.brakeLevel(), wastegate: GameAudio.wastegateState(), debug: GameAudio.debug() };
  },
  audioTune(patch) {
    return noAudio() || GameAudio.setTune(patch);
  },
  audioProfile(name) {
    return noAudio() || GameAudio.setProfile(name);
  },
  audioLayer(name, on) {
    return noAudio() || GameAudio.setLayer(name, on);
  },

  logLevel(spec, persist) {
    if (typeof Log === "undefined") return { ok: false, error: "no_log_module" };
    if (persist) Log.persist(spec === undefined ? null : spec);
    else if (spec !== undefined) Log.level(spec);
    return Log.level();
  },

  flags() {
    if (typeof DevFlags === "undefined") return {};
    return DevFlags.flags();
  },

  persistState() {
    const s = GameStore.store;
    const m = s.mirror || {};
    return { ok: !s.broken, broken: s.broken || null, keys: s._cache.size, rev: s.rev, foreign: s.foreign | 0, mirror: { supported: !!m.supported, restored: m.restored | 0, flushed: m.flushed | 0, failed: m.failed | 0, pending: m.pending | 0, inFlight: m.inFlight | 0 } };
  },

  settingsFile(mode) { return SettingsExport.collect(mode === "all" ? "all" : "changes", G); },

  garageFile() { return SettingsExport.collectGarage(); },

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
      return { ok: true, bytes: blob.size };
    } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  },

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
          const r = this.renderScale({ lite: true });
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

  diag(opts) {
    const o = opts || {};
    const safe = (fn, fallback) => { try { return fn(); } catch (e) { return fallback !== undefined ? fallback : { error: String((e && e.message) || e) }; } };
    let glInfo = { error: "no canvas" }, glProbe = null;
    safe(() => {
      const api = safe(() => GLX.backendState().api, null);
      const cv = api === "webgl2" ? document.querySelector("canvas") : document.createElement("canvas");
      const gl = glProbe = cv && (cv.getContext("webgl2") || cv.getContext("webgl"));
      if (!gl) return;
      if (api !== "webgl2") safe(() => { const lose = gl.getExtension("WEBGL_lose_context"); setTimeout(() => lose && lose.loseContext(), 0); });
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
        backend: safe(() => {
          const raw = localStorage.getItem("apex26.gfxBackend");
          const p = raw === "webgl2" || raw === "three" || raw === "webgpu"
            ? raw : (raw == null ? "three" : "webgl2");
          let live = null;
          try {
            if (typeof RendererPicker !== "undefined" && RendererPicker.liveBackend) {
              live = RendererPicker.liveBackend();
            }
          } catch (_) {  }
          if (!live) {
            try { live = sessionStorage.getItem("apex26.gfxBound"); } catch (_) {  }
          }
          live = live || p;
          return live !== p ? live + " (pick: " + p + ")" : live;
        }, "?"),
        backendFallback: safe(() => sessionStorage.getItem("apex26.gfxFallbackWhy"), null),
        mobile: safe(() => !!(gfx && gfx.isMobile), null),
        mobileTier: safe(() => !!(gfx && gfx.mobileTier), null),
        hdr: safe(() => !!(gfx && gfx.hdrMode && gfx.hdrMode()), null),
        msaa: safe(() => gfx && gfx.msaa && gfx.msaa(), null),
        renderScale: safe(() => gfx && gfx.getRenderScale && gfx.getRenderScale(), null),
        gpuErrors: safe(() => (gfx && typeof gfx.gpuErrors === "function") ? gfx.gpuErrors() : null, null),
        backendState: safe(() => (gfx && typeof gfx.backendState === "function") ? gfx.backendState() : null, null),
      },
      canvas: safe(() => {
        const c = document.getElementById("game");
        return c ? { css: [c.clientWidth, c.clientHeight], buffer: [c.width, c.height],
                     dpr: window.devicePixelRatio } : null;
      }, null),
      perf: safe(() => {
        const p = this.renderScale();
        return { scale: p.scale, fps: p.fps, auto: p.auto, tier: p.tier, tierFloor: p.tierFloor,
                 crashStrikes: p.crashStrikes, floorMs: p.floorMs, autoShed: p.autoShed, scaleFutile: p.scaleFutile, tierFutile: p.tierFutile };
      }),
      gl: glInfo,
      glCaps: safe(() => {
        const gl = glProbe;
        if (!gl) return null;
        return {
          maxFragUnif: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
          colorFloat: !!gl.getExtension("EXT_color_buffer_float"),
          colorHalf: !!gl.getExtension("EXT_color_buffer_half_float"),
          lost: gl.isContextLost(),
        };
      }, null),
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
      errors: safe(() => (window.__apexErrors || []).slice(-40), []),
      roLoops: safe(() => window.__apexROLoops || 0, 0),
      crashSeen: safe(() => PerfGov.crashSeen(), null),
    };
    try { Log.info("apex", d); } catch (_) {}
    if (o.download !== false) {
      const saved = this.save(d, o.filename || "apex-diag.json");
      const bytes = saved && saved.bytes;
      try { Log.info("apex", "downloaded apex-diag.json (" + bytes + " bytes)"); } catch (_) {}
    }
    return d;
  },
};
try { if (typeof ThreeInspector !== "undefined") ThreeInspector.boot(gfx); } catch (_) {  }
lazyTrackEnsure(api);
return api;
}

return { create };
})();
