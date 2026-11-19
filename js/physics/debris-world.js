const DebrisWorld = (function () {
  "use strict";

  const FIXED_DT = (typeof PhysicsConsts !== "undefined" && PhysicsConsts.FIXED_DT) || 1 / 60;

const RAPIER_URL = (() => {
  const src = (document.currentScript && document.currentScript.src) || location.href;
  return new URL("../../vendor/rapier-0.19.3/rapier.mjs", src).href;
})();

let G = null;
let RAPIER = null;
let _enabled = false;
let _active = false;
let _loadState = 0;
let _loadErr = null;
let _loadPromise = null;
let _loadTries = 0;
const READY_CAP_MS = 4000;

let world = null;
let _worldTrack = null;
let _floorY = -Infinity;
const FLOOR_MARGIN_M = 25;
let _mirrors = [];
let _worldGen = 0;
let _drawPoseGen = 0;
let _dynCars = new Set();
let _slots = [];
let _cap = 0;
let _queue = [];

let _tick = 0;
let _stepSkips = 0;
let _seq = 0;
let _spawnedTotal = 0;
let _lastImpact = null;

let _events = null;
let _colliderCar = null;
let _furnHandles = null;
let _carForce = [];
let _spallCool = [];
const _forceBuf = [];
const _forcePool = [];
let _lastForce = 0;

let _marbles = [];
let _marbleCap = 0;
let _marbleSeq = 0;

let _furnList = null;
let _furnTrack = null;
let _furn = [];
let _furnBuilt = false;

let _breakBarriers = true;
let _marbleGripOn = true;

let _panels = [];
let _panelHandles = null;
let _panelSeq = 0;
let _panelsBroken = 0;

const CAP_DESKTOP = 48, CAP_MOBILE = 16;
const WALL_SEV_MIN = 3;
const CAR_SEV_MIN = 3;
const REST_DESPAWN_S = 4;
const FAR_DESPAWN_M = 250;
const MIRROR_HX = 0.75, MIRROR_HY = 0.4, MIRROR_HZ = 2.0;
const FORCE_MIN = 40;
const FORCE_SEV_SCALE = 500;
const SPALL_MIN = 600;
const SPALL_COOL_S = 0.4;
const MARBLE_CAP_DESKTOP = 16, MARBLE_CAP_MOBILE = 6;
const MARBLE_REST_DESPAWN_S = 6;
const MARBLE_MIN_SPEED = 8;
const MARBLE_LOCK_GATE = 0.90;
const MARBLE_SLIP_GATE = 0.09;
const MARBLE_REF_SCALE = 0.025;
const MARBLE_FAR_DESPAWN_M = 180;
const FURN_CAP_DESKTOP = 24, FURN_CAP_MOBILE = 12;
const FURN_WAKE_M = 14;
const CONE_HX = 0.13, CONE_HY = 0.22, CONE_HZ = 0.13;
const HAZARD_Y_TOL = 1.6;
const FURN_DISTURB_M = 1.2;
const PANEL_CAP = 10;
const PANEL_LAT = 0.12, PANEL_HY = 0.5, PANEL_LEN = 0.75;
const PANEL_MASS = 12;
const PANEL_BREAK = 1400;
const PANEL_REST_DESPAWN_S = 6;
const PANEL_IDLE_DESPAWN_S = 20;
const PANEL_SEV_MIN = 8;
const MARBLE_GRIP_R = 2.6;
const MARBLE_GRIP_PER = 0.010;
const MARBLE_GRIP_MIN = 0.93;

function rng32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _smp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
const _bankScratch = { dy: 0, roll: 0 };
const _v = { x: 0, y: 0, z: 0 };
const _q = { x: 0, y: 0, z: 0, w: 1 };
const _hinted = new Set();

function _load(retry) {
  if (_loadState === 1 || _loadState === 2 || (_loadState === -1 && !retry)) return _loadPromise;
  _loadState = 1;
  const url = _loadTries++ ? RAPIER_URL + "?retry=" + _loadTries : RAPIER_URL;
  _loadPromise = import(url)
    .then((m) => m.default.init().then(() => {
      RAPIER = m.default;
      _loadState = 2; _loadErr = null;
      _active = _enabled;
      return _active;
    }))
    .catch((e) => {
      _loadState = -1; _loadErr = String(e); _active = false;
      Log.warn("game", "DebrisWorld load failed: " + ((e && e.message) || e));
      return false;
    });
  return _loadPromise;
}

function ready() {
  if (!_enabled) return Promise.resolve(false);
  const load = _load(true);
  if (_loadState !== 1) return load;
  let timer = null;
  const cap = new Promise((resolve) => { timer = setTimeout(() => resolve(false), READY_CAP_MS); });
  return Promise.race([load, cap]).then((ok) => { clearTimeout(timer); return ok; });
}

function setEnabled(on) {
  _enabled = !!on;
  if (_enabled) _load(true);
  _active = _enabled && _loadState === 2;
  if (!_enabled) destroyWorld();
  return status();
}

function create(ctx) {
  Log.info("game", "DebrisWorld.create");
  G = ctx;
  const opt = GameStore.store.raw("debris");
  try { _breakBarriers = (localStorage.getItem("apex26.breakBarriers") || "1") !== "0"; } catch (e) {  }
  try { _marbleGripOn = (localStorage.getItem("apex26.marbleGrip") || "1") !== "0"; } catch (e) {  }
  if (opt === "1") {
    _enabled = true;
    const kick = () => { if (_enabled) _load(); };
    if (typeof requestIdleCallback === "function") requestIdleCallback(kick, { timeout: 5000 });
    else setTimeout(kick, 2500);
  }
}

function rapierReady() { return _loadState === 2 && !!world; }
function worldGen() { return _worldGen; }

let _mpS = new Float64Array(0), _mpX = new Float64Array(0), _mpH = new Float64Array(0);
let _mpOk = new Uint8Array(0), _mpHum = new Uint8Array(0);
function _mirrorPoseReset(n) {
  if (n != null && _mpOk.length !== n) {
    _mpS = new Float64Array(n); _mpX = new Float64Array(n); _mpH = new Float64Array(n);
    _mpOk = new Uint8Array(n); _mpHum = new Uint8Array(n);
  } else _mpOk.fill(0);
}
function _poseMirror(track, i, c, m) {
  const hum = (c.human && c.head != null) ? 1 : 0;
  if (_mpOk[i] && Object.is(_mpS[i], c.s) && Object.is(_mpX[i], c.x) && _mpHum[i] === hum
      && (!hum || Object.is(_mpH[i], +c.head))) return;
  mirrorPose(track, c);
  m.setNextKinematicTranslation(_v);
  m.setNextKinematicRotation(_q);
  _mpS[i] = c.s; _mpX[i] = c.x; _mpHum[i] = hum; _mpH[i] = hum ? +c.head : 0; _mpOk[i] = 1;
}
function mirrorPose(track, c) {
  Tracks.sample(track, c.s, _smp);
  const rl = Math.hypot(_smp.r[0], _smp.r[2]) || 1;
  _v.x = _smp.p[0] + _smp.r[0] / rl * c.x;
  _v.y = _smp.p[1] + 0.45;
  _v.z = _smp.p[2] + _smp.r[2] / rl * c.x;
  const yaw = (c.human && c.head != null) ? c.head : Math.atan2(_smp.t[0], _smp.t[2]);
  _q.x = 0; _q.y = Math.sin(yaw / 2); _q.z = 0; _q.w = Math.cos(yaw / 2);
}

function promoteCarDynamic(i, lin, ang) {
  if (!world || !RAPIER || i < 0 || i >= _mirrors.length) return false;
  const b = _mirrors[i], c = G.cars && G.cars[i];
  if (!b || !c || !G.track || _dynCars.has(i)) return false;
  try {
    mirrorPose(G.track, c);
    if (c.human && Number.isFinite(c.px) && Number.isFinite(c.pz)) {
      _v.x = c.px; _v.z = c.pz;
    }
    b.setTranslation(_v, true);
    b.setRotation(_q, true);
    b.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    if (i < _mpOk.length) _mpOk[i] = 0;
    if (lin) b.setLinvel({ x: lin.x || 0, y: lin.y || 0, z: lin.z || 0 }, true);
    if (ang) b.setAngvel({ x: ang.x || 0, y: ang.y || 0, z: ang.z || 0 }, true);
    _dynCars.add(i);
    return true;
  } catch (e) {
    try { b.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true); } catch (_e) {  }
    _dynCars.delete(i);
    return false;
  }
}

function demoteCarKinematic(i) {
  _dynCars.delete(i);
  if (!world || !RAPIER || i < 0 || i >= _mirrors.length) return false;
  const b = _mirrors[i];
  if (!b) return false;
  if (i < _mpOk.length) _mpOk[i] = 0;
  try { b.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true); } catch (e) { return false; }
  return true;
}

function carBodyPose(i) {
  if (!world || i < 0 || i >= _mirrors.length || !_dynCars.has(i)) return null;
  const b = _mirrors[i];
  if (!b) return null;
  try {
    const t = b.translation(), q = b.rotation(), lv = b.linvel(), av = b.angvel();
    return { x: t.x, y: t.y, z: t.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w,
             vx: lv.x, vy: lv.y, vz: lv.z, wx: av.x, wy: av.y, wz: av.z,
             sleeping: b.isSleeping() };
  } catch (e) { return null; }
}

function groupBFlags(o) {
  if (o && typeof o === "object") {
    if ("breakBarriers" in o) _breakBarriers = !!o.breakBarriers;
    if ("marbleGrip" in o) _marbleGripOn = !!o.marbleGrip;
  }
  return { breakBarriers: _breakBarriers, marbleGrip: _marbleGripOn };
}

function active() { return _active; }

function prime() {
  const track = G.track, cars = G.cars;
  if (_enabled && _loadState === 0) _load();
  if (!_active || !track || !cars || !cars.length) return false;
  if (world && (_worldTrack !== track || _mirrors.length !== cars.length)) destroyWorld();
  if (!world && !_buildWorldSafe(track, cars)) return false;
  return !!world;
}

function destroyWorld() {
  if (_events) { try { _events.free(); } catch (e) {  } }
  if (world) { try { world.free(); } catch (e) {  } }
  world = null; _worldTrack = null; _mirrors = []; _slots = []; _queue.length = 0;
  _dynCars.clear();
  _events = null; _colliderCar = null; _furnHandles = null;
  _marbles = []; _marbleCap = 0; _furn = []; _furnBuilt = false;
  _carForce = []; _spallCool = []; _forceBuf.length = 0; _forcePool.length = 0; _lastForce = 0;
  _panels = []; _panelHandles = null;
}

let _capOverride = null, _capRev = -1;
function capOverride() {
  const rev = (G.store && G.store.rev) != null ? G.store.rev : 0;
  if (_capRev === rev) return _capOverride;
  _capRev = rev;
  let o = 0;
  try { o = parseInt(localStorage.getItem("apex26.debrisCap") || "", 10); } catch (e) {  }
  _capOverride = (Number.isFinite(o) && o > 0) ? Math.min(o, 256) : null;
  return _capOverride;
}
function capFor() {
  const o = capOverride();
  if (o != null) return o;
  return (G.gfx && G.gfx.mobileTier) ? CAP_MOBILE : CAP_DESKTOP;
}
function marbleCapFor() { return (G.gfx && G.gfx.mobileTier) ? MARBLE_CAP_MOBILE : MARBLE_CAP_DESKTOP; }
function furnCapFor() { return (G.gfx && G.gfx.mobileTier) ? FURN_CAP_MOBILE : FURN_CAP_DESKTOP; }

function _buildWorldSafe(track, cars) {
  try { buildWorld(track, cars); return true; }
  catch (e) {
    try { Log.warn("game", "[debris] world build failed — debris disabled", e); } catch (_e) {  }
    _active = false;
    try { destroyWorld(); } catch (_e) {  }
    return false;
  }
}
function buildWorld(track, cars) {
  world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = FIXED_DT;
  _events = new RAPIER.EventQueue(true);
  _colliderCar = new Map();
  _furnHandles = new Set();
  _panelHandles = new Map();
  _panels = [];
  _carForce = new Array(cars.length).fill(0);
  _spallCool = new Array(cars.length).fill(0);
  const geo = track.roadGeo;
  _floorY = -Infinity;
  if (geo && geo.pos && geo.idx) {
    let lo = Infinity;
    for (let i = 1; i < geo.pos.length; i += 3) if (geo.pos[i] < lo) lo = geo.pos[i];
    if (lo < Infinity) _floorY = lo - FLOOR_MARGIN_M;
    const roadBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(
      RAPIER.ColliderDesc.trimesh(
        new Float32Array(geo.pos), new Uint32Array(geo.idx),
        RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES).setFriction(1.0),
      roadBody);
  }
  _mirrors = [];
  for (let i = 0; i < cars.length; i++) {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    const col = world.createCollider(
      RAPIER.ColliderDesc.cuboid(MIRROR_HX, MIRROR_HY, MIRROR_HZ).setFriction(0.8), body);
    col.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS);
    col.setContactForceEventThreshold(FORCE_MIN);
    _colliderCar.set(col.handle, i);
    _mirrors.push(body);
  }
  _mirrorPoseReset(cars.length);
  _cap = capFor();
  _slots = [];
  for (let i = 0; i < _cap; i++) {
    const r = rng32(0x5EED + i * 7919);
    const hx = 0.03 + r() * 0.095, hy = 0.015 + r() * 0.045, hz = 0.03 + r() * 0.095;
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic());
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz)
        .setMass(0.4 + r() * 1.6).setFriction(0.7).setRestitution(0.3),
      body);
    body.setEnabled(false);
    _slots.push({ body, live: false, scale: (hx + hz) * 5.0, restT: 0, spawnTick: 0, s: 0, sourceCars: null });
  }
  _marbleCap = marbleCapFor();
  _marbles = [];
  for (let i = 0; i < _marbleCap; i++) {
    const r = rng32(0x3A7B + i * 104729);
    const h = 0.018 + r() * 0.028;
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic());
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(h, h * 0.7, h)
        .setMass(0.05 + r() * 0.08).setFriction(1.1).setRestitution(0.05),
      body);
    body.setEnabled(false);
    _marbles.push({ body, live: false, restT: 0, spawnTick: 0, scale: h / MARBLE_REF_SCALE });
  }
  _furn = [];
  _furnBuilt = false;
  if (_furnList && _furnTrack === ((track && track.def && track.def.id) || null)) {
    for (let i = 0; i < _furnList.length; i++) {
      const f = _furnList[i];
      Tracks.sample(track, f.s, _smp);
      const rl = Math.hypot(_smp.r[0], _smp.r[2]) || 1;
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic());
      const col = world.createCollider(
        RAPIER.ColliderDesc.cuboid(CONE_HX, CONE_HY, CONE_HZ)
          .setMass(1.2).setFriction(0.9).setRestitution(0.1),
        body);
      col.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS);
      col.setContactForceEventThreshold(FORCE_MIN);
      _furnHandles.add(col.handle);
      _v.x = _smp.p[0] + _smp.r[0] / rl * f.x;
      _v.y = _smp.p[1] + CONE_HY + 0.02;
      _v.z = _smp.p[2] + _smp.r[2] / rl * f.x;
      body.setTranslation(_v, true);
      _furn.push({ body, s: f.s, x: f.x, home: { x: _v.x, y: _v.y, z: _v.z } });
    }
    _furnBuilt = _furn.length > 0;
  }
  _worldTrack = track;
  _worldGen++;
  _drawPoseGen++;
  Log.info("game", "DebrisWorld.buildWorld cars=" + cars.length);
}

function registerFurniture(track) {
  if (!track || !track.def || !track.def.turns || !track.def.turns.length) {
    _furnList = null; _furnTrack = null; return;
  }
  const turns = track.def.turns, total = track.total || 0;
  const cap = furnCapFor();
  const stride = Math.max(1, Math.ceil(turns.length / cap));
  const list = [];
  for (let i = 0; i < turns.length && list.length < cap; i += stride) {
    const frac = (((turns[i] % 1) + 1) % 1);
    const s = frac * total;
    Tracks.sample(track, s, _smp);
    const hw = _smp.hw || 6;
    const inside = (Math.sign(Tracks.curvature(track, s)) > 0) ? -1 : 1;
    const x = Math.max(-(hw - 0.3), Math.min(hw - 0.3, inside * (hw - 0.9)));
    list.push({ s, x });
  }
  _furnList = list; _furnTrack = (track && track.def && track.def.id) || null;
  if (world && _worldTrack === track && !_furnBuilt) destroyWorld();
}

function reset() {
  destroyWorld();
  _active = _enabled && _loadState === 2;
  _tick = 0; _stepSkips = 0; _seq = 0; _spawnedTotal = 0; _lastImpact = null;
  _marbleSeq = 0; _furnBuilt = false; _lastForce = 0;
  _panelSeq = 0; _panelsBroken = 0;
  return status();
}


function wallImpact(c, side, xOver) {
  const sev = (xOver || 0) * 60 + Math.abs(c.speed || 0) * 0.15;
  if (sev < WALL_SEV_MIN) return;
  const mi = G.cars ? G.cars.indexOf(c) : -1;
  _queue.push({ kind: "wall", s: c.s, x: c.x, side, sev,
                speed: Math.abs(c.speed || 0), carIdx: c.num | 0, mi,
                sourceCars: mi >= 0 ? [mi] : null });
}

function carImpact(a, b, relV) {
  if (relV < CAR_SEV_MIN) return;
  const ai = G.cars ? G.cars.indexOf(a) : -1;
  const bi = G.cars ? G.cars.indexOf(b) : -1;
  const sourceCars = [];
  if (ai >= 0) sourceCars.push(ai);
  if (bi >= 0 && bi !== ai) sourceCars.push(bi);
  _queue.push({ kind: "car", s: b.s, x: (a.x + b.x) * 0.5, side: a.x >= b.x ? 1 : -1,
                sev: relV, speed: Math.abs(b.speed || 0), carIdx: (a.num | 0) + (b.num | 0),
                sourceCars: sourceCars.length ? sourceCars : null });
}

function promoteBarrier(c, side, sev) {
  if (!_breakBarriers || !world || !c) return 0;
  if ((sev || 0) < PANEL_SEV_MIN) return 0;
  const track = G.track;
  if (!track) return 0;
  if (_panels.length >= PANEL_CAP) return 0;
  const room = PANEL_CAP - _panels.length;
  const n = Math.max(1, Math.min(room, 2 + Math.floor((sev || 0) * 0.12)));
  const s0 = c.s;
  let made = 0;
  for (let i = 0; i < n; i++) {
    const so = s0 + (i - (n - 1) / 2) * (PANEL_LEN * 2.1);
    Tracks.sample(track, so, _smp);
    const rl = Math.hypot(_smp.r[0], _smp.r[2]) || 1;
    const rx = _smp.r[0] / rl, rz = _smp.r[2] / rl;
    const lat = Tracks.wallAt(track, so, side) * side;
    const wx = _smp.p[0] + rx * lat;
    const wy = _smp.p[1] + PANEL_HY;
    const wz = _smp.p[2] + rz * lat;
    const yaw = Math.atan2(_smp.t[0], _smp.t[2]);
    const rq = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
    const anchor = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(wx, wy, wz).setRotation(rq));
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(wx, wy, wz).setRotation(rq));
    const col = world.createCollider(
      RAPIER.ColliderDesc.cuboid(PANEL_LAT, PANEL_HY, PANEL_LEN)
        .setMass(PANEL_MASS).setFriction(0.7).setRestitution(0.1), body);
    col.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS);
    col.setContactForceEventThreshold(FORCE_MIN);
    const jd = RAPIER.JointData.fixed(
      { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 },
      { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
    const joint = world.createImpulseJoint(jd, anchor, body, true);
    _panelHandles.set(col.handle, _panels.length);
    _panels.push({ body, anchor, joint, home: { x: wx, y: wy, z: wz },
                   live: true, broken: false, force: 0, restT: 0, s: so, side });
    made++;
  }
  if (made) _panelSeq++;
  return made;
}

function burst(n, sev) {
  const p = G.player;
  if (!p) return 0;
  const k = Math.max(1, n | 0);
  for (let i = 0; i < k; i++) {
    _queue.push({ kind: "burst", s: p.s, x: p.x, side: (i & 1) ? 1 : -1,
                  sev: sev || 8, speed: Math.abs(p.speed || 0), carIdx: i });
  }
  return k;
}

function tyreMarble(c, m) {
  if (!world || !_marbles.length || !c || !m) return;
  if ((m.speed || 0) < MARBLE_MIN_SPEED) return;
  const hot = (m.lock || 0) >= MARBLE_LOCK_GATE || (m.slip || 0) >= MARBLE_SLIP_GATE;
  if (!hot) return;
  const ci = G.cars ? G.cars.indexOf(c) : 0;
  const seed = (Math.imul(_tick + 1, 0x9E3779B1) ^ Math.imul(ci + 1, 0x85EBCA6B)
              ^ (Math.floor((m.slip || 0) * 997) | 0)) | 0;
  const r = rng32(seed);
  if (r() > 0.25) return;
  spawnMarble(c, m, r);
}

function acquirePoolSlot(pool) {
  let oldest = null;
  for (const s of pool) {
    if (!s.live) return s;
    if (!oldest || s.spawnTick < oldest.spawnTick) oldest = s;
  }
  return oldest;
}

function spawnMarble(c, m, r) {
  const track = G.track;
  if (!track) return;
  Tracks.sample(track, c.s, _smp);
  const rl = Math.hypot(_smp.r[0], _smp.r[2]) || 1;
  const rx = _smp.r[0] / rl, rz = _smp.r[2] / rl;
  const tl = Math.hypot(_smp.t[0], _smp.t[2]) || 1;
  const fx = _smp.t[0] / tl, fz = _smp.t[2] / tl;
  const side = (r() < 0.5) ? 1 : -1;
  const lat = c.x + side * (0.5 + r() * 0.4);
  const back = -(1.0 + r() * 2.0);
  const slot = acquirePoolSlot(_marbles);
  if (!slot) return;
  const b = slot.body;
  b.setEnabled(true);
  _v.x = _smp.p[0] + rx * lat + fx * back;
  _v.y = _smp.p[1] + 0.12;
  _v.z = _smp.p[2] + rz * lat + fz * back;
  b.setTranslation(_v, true);
  const vf = (m.speed || 0) * (0.02 + r() * 0.05);
  const vs = side * (0.3 + r() * 0.6);
  _v.x = fx * vf + rx * vs; _v.y = 0.4 + r() * 0.6; _v.z = fz * vf + rz * vs;
  b.setLinvel(_v, true);
  _v.x = (r() - 0.5) * 12; _v.y = (r() - 0.5) * 12; _v.z = (r() - 0.5) * 12;
  b.setAngvel(_v, true);
  _q.x = 0; _q.y = 0; _q.z = 0; _q.w = 1;
  b.setRotation(_q, true);
  slot.live = true; slot.restT = 0; slot.spawnTick = _tick; slot.restPose = null;
  _drawPoseGen++;
  _marbleSeq++;
}

function spawnImpact(imp, track) {
  Tracks.sample(track, imp.s, _smp);
  const rl = Math.hypot(_smp.r[0], _smp.r[2]) || 1;
  const rx = _smp.r[0] / rl, rz = _smp.r[2] / rl;
  const tl = Math.hypot(_smp.t[0], _smp.t[2]) || 1;
  const fx = _smp.t[0] / tl, fz = _smp.t[2] / tl;
  const cx = _smp.p[0] + rx * imp.x, cz = _smp.p[2] + rz * imp.x;
  const cy = _smp.p[1] + 0.35;
  if (imp.kind !== "burst" && imp.mi != null && imp.mi >= 0 &&
      imp.mi < _carForce.length && _carForce[imp.mi] > 0) {
    const fsev = _carForce[imp.mi] / FORCE_SEV_SCALE;
    if (fsev > imp.sev) imp.sev = fsev;
  }
  const n = Math.max(2, Math.min(8, 2 + Math.floor(imp.sev * 0.5)));
  const r = rng32((Math.imul(_tick, 0x9E3779B1) ^ Math.imul(_seq + 1, 0x85EBCA6B) ^ Math.imul(imp.carIdx + 1, 0xC2B2AE35)) | 0);
  for (let i = 0; i < n; i++) {
    const slot = acquirePoolSlot(_slots);
    if (!slot) break;
    const b = slot.body;
    b.setEnabled(true);
    const along = (r() - 0.5) * 3.0;
    _v.x = cx + fx * along + rx * imp.side * (0.4 + r() * 0.5);
    _v.y = cy + r() * 0.5;
    _v.z = cz + fz * along + rz * imp.side * (0.4 + r() * 0.5);
    b.setTranslation(_v, true);
    const vf = imp.speed * (0.25 + r() * 0.3);
    const vs = -imp.side * (1.5 + r() * 2.5) * Math.min(1, imp.sev / 10);
    _v.x = fx * vf + rx * vs; _v.y = 1.5 + r() * 2.5; _v.z = fz * vf + rz * vs;
    b.setLinvel(_v, true);
    _v.x = (r() - 0.5) * 20; _v.y = (r() - 0.5) * 20; _v.z = (r() - 0.5) * 20;
    b.setAngvel(_v, true);
    _q.x = 0; _q.y = 0; _q.z = 0; _q.w = 1;
    b.setRotation(_q, true);
    slot.live = true; slot.restT = 0; slot.spawnTick = _tick; slot.restPose = null;
    slot.s = imp.s;
    slot.sourceCars = imp.sourceCars ? imp.sourceCars.slice() : null;
    _seq++; _spawnedTotal++;
  }
  _lastImpact = { kind: imp.kind, carIdx: imp.carIdx, sev: +imp.sev.toFixed(2), tick: _tick, spawned: n };
}

function _anyLive(pool) {
  for (let i = 0; i < pool.length; i++) if (pool[i].live) return true;
  return false;
}
function _anyAwake(pool) {
  for (let i = 0; i < pool.length; i++) {
    const s = pool[i];
    if (s.live && s.body && !s.body.isSleeping()) return true;
  }
  return false;
}
let _furnSortedFor = null, _furnSortedN = -1, _furnS = new Float64Array(0);
function _furnArcs() {
  if (_furnSortedFor !== _furn || _furnSortedN !== _furn.length) {
    _furnS = Float64Array.from(_furn.map((f) => +f.s).filter((v) => v === v)).sort();
    _furnSortedFor = _furn; _furnSortedN = _furn.length;
  }
  return _furnS;
}
function _nearArc(cs, fs, L) {
  let d = Math.abs(cs - fs);
  if (L) d = Math.min(d, L - d);
  return d < FURN_WAKE_M;
}
function _carNearFurn(track, cars) {
  if (!_furn.length) return false;
  const L = (track && track.total) || 0;
  const arcs = _furnArcs(), n = arcs.length;
  if (!n) return false;
  for (let i = 0; i < cars.length; i++) {
    const cs = cars[i].s || 0;
    let lo = 0, hi = n;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (arcs[mid] < cs) lo = mid + 1; else hi = mid; }
    if ((lo < n && _nearArc(cs, arcs[lo], L)) || (lo > 0 && _nearArc(cs, arcs[lo - 1], L))) return true;
    if (L && (_nearArc(cs, arcs[0], L) || _nearArc(cs, arcs[n - 1], L))) return true;
  }
  return false;
}
const _psOut = { have: false, px: 0, pz: 0 };
function _playerSample(track) {
  const p = G.player;
  if (!p) { _psOut.have = false; _psOut.px = 0; _psOut.pz = 0; return _psOut; }
  _psOut.have = true;
  if (p.px != null) { _psOut.px = p.px; _psOut.pz = p.pz; return _psOut; }
  Tracks.sample(track, p.s, _smp);
  _psOut.px = _smp.p[0]; _psOut.pz = _smp.p[2];
  return _psOut;
}
function _restPose(s) {
  if (!s.restPose) { const t = s.body.translation(); s.restPose = { x: t.x, y: t.y, z: t.z }; }
  return s.restPose;
}
function _ageAndCullPool(pool, dt, px, pz, havePlayer, restLimit, farM) {
  const far2 = farM * farM;
  for (let i = 0; i < pool.length; i++) {
    const s = pool[i];
    if (!s.live) continue;
    const b = s.body;
    const asleep = b.isSleeping();
    if (asleep) { s.restT += dt; } else { s.restT = 0; }
    const t = asleep ? _restPose(s) : b.translation();
    if (!asleep) s.restPose = null;
    let far = t.y < _floorY;
    if (havePlayer) {
      const dx = t.x - px, dz = t.z - pz;
      far = far || dx * dx + dz * dz > far2;
    }
    if (s.restT > restLimit || far) { b.setEnabled(false); s.live = false; }
  }
}
let _cnx = new Float64Array(0), _cnz = new Float64Array(0);
function _carNearLiveDebris(track, cars) {
  const r2 = FURN_WAKE_M * FURN_WAKE_M;
  const n = cars.length;
  if (_cnx.length < n) { _cnx = new Float64Array(n); _cnz = new Float64Array(n); }
  for (let k = 0; k < n; k++) {
    const c = cars[k];
    if (c.px == null) { Tracks.sample(track, c.s, _smp); _cnx[k] = _smp.p[0]; _cnz[k] = _smp.p[2]; }
    else { _cnx[k] = c.px; _cnz[k] = c.pz; }
  }
  return _poolNearCars(_slots, n, r2) || _poolNearCars(_marbles, n, r2) ||
         _poolNearCars(_panels, n, r2);
}
function _poolNearCars(pool, n, r2) {
  for (let i = 0; i < pool.length; i++) {
    const s = pool[i];
    if (!s.live || !s.body) continue;
    const t = s.restPose || s.body.translation();
    for (let k = 0; k < n; k++) {
      const dx = t.x - _cnx[k], dz = t.z - _cnz[k];
      if (dx * dx + dz * dz < r2) return true;
    }
  }
  return false;
}
function _needSolve(track, cars, live, furnNear) {
  if (_queue.length || _dynCars.size) return true;
  if (_anyAwake(_slots) || _anyAwake(_marbles) || _anyAwake(_panels)) return true;
  if (live == null) live = _anyLive(_slots) || _anyLive(_marbles) || _anyLive(_panels);
  if (live && _carNearLiveDebris(track, cars)) return true;
  if (furnNear == null) furnNear = _furn.length > 0 && _carNearFurn(track, cars);
  return !!furnNear;
}
function step(dt) {
  const track = G.track, cars = G.cars;
  if (!track || !cars || !cars.length) { _queue.length = 0; return; }
  if (world && (_worldTrack !== track || _mirrors.length !== cars.length)) destroyWorld();
  if (!world && !_buildWorldSafe(track, cars)) return;
  if (world.timestep !== dt) world.timestep = dt;
  if (_queue.length === 0 && _dynCars.size === 0) {
    const live = _anyLive(_panels) || _anyLive(_slots) || _anyLive(_marbles);
    const furnNear = _furn.length > 0 && _carNearFurn(track, cars);
    if (!live && !furnNear) return;
    if (!_needSolve(track, cars, live, furnNear)) {
      _stepSkips++;
      for (let i = 0; i < _spallCool.length; i++)
        if (_spallCool[i] > 0) _spallCool[i] = Math.max(0, _spallCool[i] - dt);
      const pos = _playerSample(track);
      _ageAndCullPool(_slots, dt, pos.px, pos.pz, pos.have, REST_DESPAWN_S, FAR_DESPAWN_M);
      _ageAndCullPool(_marbles, dt, pos.px, pos.pz, pos.have, MARBLE_REST_DESPAWN_S, MARBLE_FAR_DESPAWN_M);
      for (let i = 0; i < _panels.length; i++) _panels[i].force = 0;
      if (_panels.length) updatePanels(dt, pos.px, pos.pz);
      return;
    }
  }
  _tick++;
  for (let i = 0; i < _spallCool.length; i++)
    if (_spallCool[i] > 0) _spallCool[i] = Math.max(0, _spallCool[i] - dt);

  for (let i = 0; i < cars.length; i++) {
    if (_dynCars.has(i)) continue;
    const c = cars[i], m = _mirrors[i];
    if (!Number.isFinite(c.s) || !Number.isFinite(c.x)) continue;
    _poseMirror(track, i, c, m);
  }

  _hinted.clear();
  if (_queue.length) {
    for (const imp of _queue) {
      spawnImpact(imp, track);
      if (imp.mi != null && imp.mi >= 0) _hinted.add(imp.mi);
    }
    _queue.length = 0;
  }

  try {
    world.step(_events);
    _drawPoseGen++;
  } catch (e) {
    try { Log.warn("game", "[debris] rapier step trapped — debris disabled", e); } catch (_e) {  }
    _active = false;
    try { destroyWorld(); } catch (_e) {  }
    return;
  }

  const pos = _playerSample(track);
  const px = pos.px, pz = pos.pz;
  _ageAndCullPool(_slots, dt, px, pz, pos.have, REST_DESPAWN_S, FAR_DESPAWN_M);
  _ageAndCullPool(_marbles, dt, px, pz, pos.have, MARBLE_REST_DESPAWN_S, MARBLE_FAR_DESPAWN_M);

  drainForces(cars);

  for (let i = 0; i < _carForce.length; i++) {
    if (_carForce[i] > SPALL_MIN && _spallCool[i] <= 0 && !_hinted.has(i)) {
      const c = cars[i];
      if (!c) continue;
      _queue.push({ kind: "spall", s: c.s, x: c.x, side: (i & 1) ? 1 : -1,
                    sev: Math.min(4, _carForce[i] / 400), speed: Math.abs(c.speed || 0),
                    carIdx: i, mi: i });
      _spallCool[i] = SPALL_COOL_S;
    }
  }

  if (_panels.length) updatePanels(dt, px, pz);
}

function updatePanels(dt, px, pz) {
  let changed = false;
  for (const p of _panels) {
    if (!p.live) continue;
    if (!p.broken && p.joint && p.force > PANEL_BREAK) {
      try { world.removeImpulseJoint(p.joint, true); } catch (e) {  }
      p.joint = null; p.broken = true; p.restT = 0; _panelsBroken++;
      const r = rng32((Math.imul(_tick + 1, 0x27D4EB2F) ^ Math.imul((p.s | 0) + 1, 0x9E3779B1)
                     ^ Math.imul(_panelSeq + 1, 0x85EBCA6B)) | 0);
      Tracks.sample(G.track, p.s, _smp);
      const rl = Math.hypot(_smp.r[0], _smp.r[2]) || 1;
      const rx = _smp.r[0] / rl, rz = _smp.r[2] / rl;
      _v.x = rx * p.side * (2 + r() * 3); _v.y = 1.5 + r() * 2; _v.z = rz * p.side * (2 + r() * 3);
      p.body.setLinvel(_v, true);
      _v.x = (r() - 0.5) * 8; _v.y = (r() - 0.5) * 8; _v.z = (r() - 0.5) * 8;
      p.body.setAngvel(_v, true);
    }
    if (p.broken) {
      if (p.body.isSleeping()) p.restT += dt; else p.restT = 0;
    } else {
      if (p.force > 0) p.restT = 0; else p.restT += dt;
    }
    const t = p.body.translation();
    const dx = t.x - px, dz = t.z - pz;
    const far = dx * dx + dz * dz > FAR_DESPAWN_M * FAR_DESPAWN_M;
    if (far || p.restT > (p.broken ? PANEL_REST_DESPAWN_S : PANEL_IDLE_DESPAWN_S)) {
      if (p.joint) {
        try { world.removeImpulseJoint(p.joint, true); } catch (e) {
 }
        p.joint = null;
      }
      try { world.removeRigidBody(p.body); } catch (e) {  }
      try { world.removeRigidBody(p.anchor); } catch (e) {  }
      p.live = false; p.body = null; p.anchor = null; changed = true;
    }
  }
  if (changed) {
    _panels = _panels.filter((p) => p.live);
    _panelHandles.clear();
    for (let i = 0; i < _panels.length; i++) {
      const b = _panels[i].body;
      if (b && b.numColliders && b.numColliders() > 0) {
        const col = b.collider(0);
        if (col) _panelHandles.set(col.handle, i);
      }
    }
  }
}

function projectHazard(track, x, y, z, hint) {
  if (hint != null) {
    const pr = Tracks.project(track, x, z, hint);
    Tracks.sample(track, pr.s, _smp);
    if (pr.dist <= (_smp.hw || 6) && Math.abs(y - _smp.p[1]) <= HAZARD_Y_TOL) return pr;
  }
  const pr = Tracks.project(track, x, z, null, y);
  Tracks.sample(track, pr.s, _smp);
  return pr;
}

function redHazardTotal(sourceCount, sourcedTotal) {
  return sourceCount >= 2 ? sourcedTotal : 0;
}
function hazards() {
  const out = { sectors: [0, 0, 0], total: 0, redTotal: 0, worst: { sector: -1, count: 0, frac: 0 } };
  if (!world || !G.track) return out;
  const track = G.track, total = track.total || 1;
  const sec = track.def && track.def.sectors;
  const splits = (sec && sec.length === 2) ? [sec[0], sec[1]] : [1 / 3, 2 / 3];
  const secFrac = [0, 0, 0];
  const redSources = new Set();
  let sourcedTotal = 0;
  const consider = (body, hint, sourceCars) => {
    if (!body || !body.isSleeping()) return;
    const t = body.translation();
    const pr = projectHazard(track, t.x, t.y, t.z, hint);
    const hw = _smp.hw || 6;
    if (Math.abs(t.y - _smp.p[1]) > HAZARD_Y_TOL) return;
    if ((pr.dist != null ? pr.dist : Math.abs(pr.lat)) > hw) return;
    const frac = (((pr.s / total) % 1) + 1) % 1;
    const si = frac < splits[0] ? 0 : frac < splits[1] ? 1 : 2;
    if (out.sectors[si] === 0) secFrac[si] = +frac.toFixed(4);
    out.sectors[si]++; out.total++;
    if (sourceCars && sourceCars.length) {
      sourcedTotal++;
      for (const i of sourceCars) redSources.add(i);
    }
  };
  for (const s of _slots) if (s.live) consider(s.body, s.s, s.sourceCars);
  for (const f of _furn) {
    const t = f.body.translation();
    const dx = t.x - f.home.x, dz = t.z - f.home.z;
    if (dx * dx + dz * dz < FURN_DISTURB_M * FURN_DISTURB_M) continue;
    consider(f.body, f.s);
  }
  for (const p of _panels) if (p.live && p.broken) consider(p.body, p.s);
  for (let i = 0; i < 3; i++)
    if (out.sectors[i] > out.worst.count)
      out.worst = { sector: i, count: out.sectors[i], frac: secFrac[i] };
  out.redTotal = redHazardTotal(redSources.size, sourcedTotal);
  return out;
}

function marbleGrip(c) {
  if (!_marbleGripOn || !world || !c || !_anyLive(_marbles)) return 1;
  const track = G.track;
  if (!track) return 1;
  Tracks.sample(track, c.s, _smp);
  const rl = Math.hypot(_smp.r[0], _smp.r[2]) || 1;
  const cx = _smp.p[0] + _smp.r[0] / rl * (c.x || 0);
  const bank = Tracks.banking ? Tracks.banking(track, c.s, c.x || 0, _bankScratch) : null;
  const cy = _smp.p[1] + (bank ? bank.dy : 0);
  const cz = _smp.p[2] + _smp.r[2] / rl * (c.x || 0);
  const R2 = MARBLE_GRIP_R * MARBLE_GRIP_R;
  let n = 0;
  for (const s of _marbles) {
    if (!s.live || !s.body.isSleeping()) continue;
    const t = s.body.translation();
    if (Math.abs(t.y - cy) > HAZARD_Y_TOL) continue;
    const dx = t.x - cx, dz = t.z - cz;
    if (dx * dx + dz * dz <= R2) n++;
  }
  return n ? Math.max(MARBLE_GRIP_MIN, 1 - n * MARBLE_GRIP_PER) : 1;
}

function drainForces(cars) {
  for (let i = 0; i < _carForce.length; i++) _carForce[i] = 0;
  if (_carForce.length !== cars.length) {
    _carForce = new Array(cars.length).fill(0);
    _spallCool = new Array(cars.length).fill(0);
  }
  for (const p of _panels) p.force = 0;
  if (!_events) { _forceBuf.length = 0; _lastForce = 0; return; }
  let n = 0;
  _events.drainContactForceEvents((e) => {
    let ent = _forcePool[n];
    if (!ent) ent = _forcePool[n] = { h1: 0, h2: 0, f: 0 };
    ent.h1 = e.collider1();
    ent.h2 = e.collider2();
    ent.f = e.totalForceMagnitude();
    n++;
  });
  _forceBuf.length = n;
  for (let i = 0; i < n; i++) _forceBuf[i] = _forcePool[i];
  _forceBuf.sort((a, b) => {
    const a1 = Math.min(a.h1, a.h2), a2 = Math.max(a.h1, a.h2);
    const b1 = Math.min(b.h1, b.h2), b2 = Math.max(b.h1, b.h2);
    if (a1 !== b1) return a1 - b1;
    if (a2 !== b2) return a2 - b2;
    return Math.round(a.f) - Math.round(b.f);
  });
  let lf = 0;
  for (const ev of _forceBuf) {
    const ci = _colliderCar.has(ev.h1) ? _colliderCar.get(ev.h1)
             : (_colliderCar.has(ev.h2) ? _colliderCar.get(ev.h2) : -1);
    if (ci >= 0 && ci < _carForce.length) _carForce[ci] += ev.f;
    if (_panelHandles) {
      const pi = _panelHandles.has(ev.h1) ? _panelHandles.get(ev.h1)
               : (_panelHandles.has(ev.h2) ? _panelHandles.get(ev.h2) : -1);
      if (pi >= 0 && pi < _panels.length && _panels[pi]) _panels[pi].force += ev.f;
    }
    if (ev.f > lf) lf = ev.f;
  }
  _lastForce = +lf.toFixed(2);
}

const _drawOpts = { roughness: 0.6, metalness: 0.2, specular: 0.35 };
const _marbleOpts = { roughness: 0.9, metalness: 0.0, specular: 0.1 };
const _coneOpts = { roughness: 0.55, metalness: 0.0, specular: 0.3, emissive: 0.08 };
const _panelOpts = { roughness: 0.7, metalness: 0.1, specular: 0.25 };

function shardGeom() {
  const out = { pos: [], nrm: [], col: [], idx: [] };
  TrackGeom.addBox(out, [0, 0, 0], [0.20, 0.02, 0.13], [0.05, 0.05, 0.06]);
  TrackGeom.addBox(out, [0.05, 0.02, -0.03], [0.07, 0.05, 0.08], [0.30, 0.31, 0.33]);
  TrackGeom.addBox(out, [-0.05, 0.01, 0.04], [0.13, 0.015, 0.03], [0.11, 0.11, 0.12]);
  return out;
}
function marbleGeom() {
  const out = { pos: [], nrm: [], col: [], idx: [] };
  TrackGeom.addBox(out, [0, 0, 0], [MARBLE_REF_SCALE, MARBLE_REF_SCALE * 0.7, MARBLE_REF_SCALE], [0.04, 0.04, 0.045]);
  return out;
}
function coneGeom() {
  const out = { pos: [], nrm: [], col: [], idx: [] };
  TrackGeom.addBox(out, [0, -CONE_HY + 0.02, 0], [0.13, 0.02, 0.13], [0.9, 0.35, 0.05]);
  TrackGeom.addCone(out, [0, -CONE_HY + 0.04, 0], 0.10, CONE_HY * 1.9, [0.95, 0.42, 0.08], 10);
  return out;
}
function panelGeom() {
  const out = { pos: [], nrm: [], col: [], idx: [] };
  TrackGeom.addBox(out, [0, 0, 0], [PANEL_LAT, PANEL_HY, PANEL_LEN], [0.90, 0.92, 0.94]);
  TrackGeom.addBox(out, [0, -PANEL_HY * 0.35, 0], [PANEL_LAT * 1.1, PANEL_HY * 0.25, PANEL_LEN], [0.86, 0.16, 0.15]);
  TrackGeom.addBox(out, [0, -PANEL_HY, 0], [PANEL_LAT * 1.3, PANEL_HY, PANEL_LEN * 0.12], [0.20, 0.20, 0.24]);
  return out;
}

function draw() {
  if (!world) return;
  if (_slots.length) DebrisDraw.drawPool(G.gfx, "shard", shardGeom, capFor(), _drawOpts, _slots, true, false, _drawPoseGen);
  if (_marbles.length) DebrisDraw.drawPool(G.gfx, "marble", marbleGeom, marbleCapFor(), _marbleOpts, _marbles, true, false, _drawPoseGen);
  if (_furn.length) DebrisDraw.drawPool(G.gfx, "cone", coneGeom, furnCapFor(), _coneOpts, _furn, false, true, _drawPoseGen);
  if (_panels.length) DebrisDraw.drawPool(G.gfx, "panel", panelGeom, PANEL_CAP, _panelOpts, _panels, true, true, _drawPoseGen);
}

function liveCount() { let n = 0; for (const s of _slots) if (s.live) n++; return n; }
function marbleCount() { let n = 0; for (const s of _marbles) if (s.live) n++; return n; }
function positions() {
  const out = [];
  for (const s of _slots) {
    if (!s.live) continue;
    const t = s.body.translation(), q = s.body.rotation();
    out.push(t.x, t.y, t.z, q.x, q.y, q.z, q.w);
  }
  for (const s of _marbles) {
    if (!s.live) continue;
    const t = s.body.translation(), q = s.body.rotation();
    out.push(t.x, t.y, t.z, q.x, q.y, q.z, q.w);
  }
  for (const f of _furn) {
    const t = f.body.translation(), q = f.body.rotation();
    out.push(t.x, t.y, t.z, q.x, q.y, q.z, q.w);
  }
  for (const p of _panels) {
    if (!p.live) continue;
    const t = p.body.translation(), q = p.body.rotation();
    out.push(t.x, t.y, t.z, q.x, q.y, q.z, q.w);
  }
  return out;
}
function status() {
  return {
    enabled: _enabled,
    ready: _loadState === 2,
    loadState: _loadState,
    error: _loadErr,
    active: _active,
    live: liveCount(),
    queued: _queue.length,
    cap: _cap || capFor(),
    stepped: _tick,
    spawned: _spawnedTotal,
    stepSkips: _stepSkips,
    lastImpact: _lastImpact,
    marbles: marbleCount(),
    marbleCap: _marbleCap || marbleCapFor(),
    furniture: _furn.length,
    furnCount: _furnList ? _furnList.length : 0,
    lastForce: _lastForce,
    panels: _panelLive(),
    panelsBroken: _panelsBroken,
    breakBarriers: _breakBarriers,
    marbleGrip: _marbleGripOn,
  };
}
function _panelLive() { let n = 0; for (const p of _panels) if (p.live) n++; return n; }

return { create, active, ready, prime, step, draw, wallImpact, carImpact, status, setEnabled, reset, burst, positions,
         registerFurniture, tyreMarble, hazards, promoteBarrier, marbleGrip, groupBFlags,
         rapierReady, worldGen, promoteCarDynamic, demoteCarKinematic, carBodyPose };
})();
