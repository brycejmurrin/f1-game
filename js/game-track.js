/* Apex 26 — track loading & field setup: async loadTrack() (build + upload a
 * circuit, menu flyby rebuild), and makeCars()/gridUp() (assemble the 22-car
 * field and place it on the grid). game.js hands over its car-mesh builders
 * and helpers via AXTrack.init(deps) at boot. */
"use strict";

const AXTrack = (function () {
"use strict";

const { IDLE_RPM } = AXC;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
let smpHw = null, wrapS = null;
function init(d) { smpHw = d.smpHw; wrapS = d.wrapS; }

// ---------- car setup ----------
// ---------- car setup ----------
function makeCars() {
  AX.cars = [];
  // the custom team only enters the grid when the player has selected it
  const grid = Teams.LIST.filter((t, ti) => !t.custom || ti === AX.teamIdx);
  const total = grid.reduce((s, t) => s + t.drivers.length, 0);
  let idx = 0;
  grid.forEach((team) => {
    const ti = Teams.LIST.indexOf(team);
    team.drivers.forEach((d, di) => {
      const isP = ti === AX.teamIdx && di === AX.driverIdx;
      // Spread the field's preferred lanes evenly across the track width (with a
      // little jitter) so the AI fan out instead of all stacking on the racing
      // line. Used as a fraction of half-width in updateCar.
      const lane = clamp(((idx / Math.max(1, total - 1)) * 2 - 1) * 0.78
        + (Math.random() - 0.5) * 0.12, -0.85, 0.85);
      idx++;
      AX.cars.push({
        team, name: d.name, code: d.code, num: d.num, isPlayer: isP,
        color: team.color, tier: team.tier,
        s: 0, x: 0, speed: 0, prog: 0, lap: 0,
        gear: 1, rpm: IDLE_RPM, shiftT: 0, boostOn: false,
        energy: 1, otT: 0, otCool: 0, deploying: false,
        lapStart: 0, lapTime: 0, best: Infinity, totalT: 0,
        finished: false, finishT: 0, finPos: 0,
        offroad: false, offT: 0, cuts: 0, penalty: 0,
        yawVis: 0, steerVis: 0, collideT: 0,
        skill: Math.min(1.0, 0.92 + Math.random() * 0.1),
        aiBrakeT: 0, lane,
      });
    });
  });
  AX.player = AX.cars.find((c) => c.isPlayer);
}

function gridUp() {
  // grid order: by tier then random-ish; player at P12 for a fun climb
  const order = AX.cars.slice().sort((a, b) => (a.tier - b.tier) || (Math.random() - 0.5));
  const pi = order.indexOf(AX.player);
  order.splice(pi, 1);
  order.splice(Math.min(11, order.length), 0, AX.player);
  order.forEach((c, i) => {
    c.s = wrapS(AX.track.total - 14 - i * 8);
    c.x = (i % 2 === 0 ? -1 : 1) * Math.min(smpHw(c.s) * 0.4, 3);
    c.xVis = c.x;   // reset smoothed render position so the grid doesn't slide
    c.head = 0; c.yawVis = 0;   // straight ahead on the grid (heading model)
    c.speed = 0; c.prog = -(14 + i * 8); c.lap = 0; c.energy = 1;
    c.otT = 0; c.otCool = 0; c.lapTime = 0; c.best = Infinity; c.totalT = 0;
    c.finished = false; c.finishT = 0; c.cuts = 0; c.penalty = 0; c.offT = 0;
    c.wrongT = 0; c.wrongWay = false; c.rescueT = 0; c.rescueLastT = null; c.wallT = 0; c.wasOnWall = false;
    c.vLat = 0; c.yawRateCur = 0; c.steerVis = 0; c.yawVis = 0;
  });
}

// ---------- track loading ----------
// ---------- track loading ----------
function loadTrack(idx) {
  const def = Tracks.LIST[idx];
  // Buildings light up for the chosen SESSION time, not the track's default:
  // night/dusk/dawn (or a night-default track in "default") → lit windows. Props
  // are rebuilt when this flips so a day-default circuit raced at night gets a
  // glowing skyline, and a night-default circuit raced by day looks like daytime.
  const sessionDark = AX.raceTimeOfDay === "night" || AX.raceTimeOfDay === "dusk" ||
    AX.raceTimeOfDay === "dawn" || (AX.raceTimeOfDay === "default" && def.night);
  if (AX.builtTrackId !== def.id || AX.builtTrackNight !== sessionDark) {
    if (AX.track && AX.track.meshes) {
      GLX.freeMesh(AX.track.meshes.floor);
      GLX.freeMesh(AX.track.meshes.road);
      GLX.freeMesh(AX.track.meshes.terrain);
      if (GLX.freeChunkedMesh) GLX.freeChunkedMesh(AX.track.meshes.props); else GLX.freeMesh(AX.track.meshes.props);
      if (AX.track.meshes.glass) GLX.freeMesh(AX.track.meshes.glass);
      if (AX.track.meshes.water) GLX.freeMesh(AX.track.meshes.water);
      GLX.freeMesh(AX.track.meshes.gate);
      GLX.freeMesh(AX.track.meshes.startline);
    }
    AX.track = Tracks.build(def, { night: sessionDark });
    AX.builtTrackId = def.id;
    AX.builtTrackNight = sessionDark;
    Ghost.setTrack(def.id);
    AX.minimapBg = null;           // force minimap redraw for new track
    AX.sectorIdx = 0; AX.sectorStartT = 0;
    AX.sectorBests = [Infinity, Infinity, Infinity];
    AX.sectorLast = [null, null, null];
  }
  const pal = def.palette;
  AX.frame = {
    viewProj: M4.ident(), eye: AX.camEye,
    sunDir: V3.norm(pal.sunDir), sunColor: pal.sunColor,
    ambientGround: pal.ambientGround, ambientSky: pal.ambientSky,
    fogColor: pal.fog, fogDensity: pal.fogDensity,
    skyZenith:  pal.zenith,
    skyHorizon: pal.horizon,
    fogHeight:  pal.fogHeight != null ? pal.fogHeight : 0.018,
  };
  AX.frameSky = {
    invViewProj: M4.ident(), zenith: pal.zenith, horizon: pal.horizon,
    sunDir: AX.frame.sunDir, sunColor: pal.sun, stars: def.night ? 1 : 0,
    // procedural cloud coverage 0..1 (night skies stay clearer to show stars)
    cloud: pal.cloud !== undefined ? pal.cloud : (def.night ? 0.22 : 0.4),
  };
}

// The full 3D track build (loadTrack -> Tracks.build) is heavy. On the menu it's
// only needed for the background flyby, so don't run it synchronously inside a
// click handler — defer + debounce it to the final selection so browsing the
// grid (and entering the GP screen) stays instant. startRace() builds the real
// track when the race actually starts, so racing never depends on this.
AX.flybyBuildTimer = 0;
function scheduleFlybyTrack() {
  clearTimeout(AX.flybyBuildTimer);
  AX.flybyBuildTimer = setTimeout(() => {
    if (AX.state === "menu" || AX.state === "select") loadTrack(AX.trackIdx);
  }, 120);
}

return { init, makeCars, gridUp, loadTrack, scheduleFlybyTrack };
})();
