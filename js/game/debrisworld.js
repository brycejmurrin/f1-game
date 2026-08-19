/* Apex 26 — Rapier side-world for render-only debris (adoption phases R0+R1, see spike/ADOPTION-PLAN.md Part 2). A physics side-world that NEVER moves a car: the … */
const DebrisWorld = (function () {
  "use strict";

const RAPIER_URL = (() => {
  const src = (document.currentScript && document.currentScript.src) || location.href;
  return new URL("../../vendor/rapier-0.19.3/rapier.mjs", src).href;
})();

let G = null;            // game.js ctx façade (live getters: track, cars, player, gfx)
let RAPIER = null;       // module namespace once loaded
let _enabled = false;    // user opt-in flag
let _active = false;     // _enabled && rapier ready — the ONE boolean game.js reads
let _loadState = 0;      // 0 idle | 1 loading | 2 ready | -1 failed
let _loadErr = null;

// ── side-world state ────────────────────────────────────────────────────────
let world = null;        // RAPIER.World
let _worldTrack = null;  // track identity the trimesh was built for
let _mirrors = [];       // one kinematicPositionBased body per car (cars[] order)
let _worldGen = 0;       // bumped every buildWorld — the incident sim aborts a takeover if this changes under it
// Incident-sim takeover (R2/R3/C1, js/game/incidentsim.js): indices whose mirror
// has been promoted kinematic→DYNAMIC and is owned by IncidentSim. step()'s
// mirror-sync loop SKIPS these (a dynamic body must not be pose-driven), so the
// bespoke->Rapier handover keeps a single authority for the duration.
let _dynCars = new Set();
let _slots = [];         // fixed debris pool: { body, live, scale, restT, spawnTick }
let _cap = 0;            // pool size for the CURRENT world (48 desktop / 16 mobile tier)
let _queue = [];         // impacts queued by the game-side hooks, consumed next step

// ── deterministic counters (reset() zeroes them for repeatable episodes) ────
let _tick = 0;           // side-world ticks stepped (WASM path only)
let _stepSkips = 0;      // JS-only ticks: live bodies asleep, no car in wake radius
let _seq = 0;            // debris spawn sequence number
let _spawnedTotal = 0;
let _lastImpact = null;  // { kind, carIdx, sev, tick, spawned } — for tests

let _events = null;      // reusable RAPIER.EventQueue(true)
let _colliderCar = null; // Map: mirror collider handle → car idx (cars[] order)
let _furnHandles = null; // Set: A3 furniture collider handles
let _carForce = [];      // per-car real force accumulated this tick (mirror↔dynamic)
let _spallCool = [];     // per-car spall-burst cooldown (s), decremented each tick
const _forceBuf = [];    // scratch: drained contact-force events, sorted deterministically
const _forcePool = [];   // pooled {h1,h2,f} entries — drainForces never allocs per event
let _lastForce = 0;      // max real force magnitude seen last tick (status)

// ── A2: marbles (separate seeded sub-pool, cosmetic only — never touches grip) ─
let _marbles = [];       // fixed pool: { body, live, restT, spawnTick, scale }
let _marbleCap = 0;
let _marbleSeq = 0;      // deterministic marble spawn sequence

// ── A3: clippable near-apex cones (dynamic, punted one-way by kinematic mirrors) ─
let _furnList = null;    // per-track placement list [{s,x}] (survives reset())
let _furnTrack = null;   // track identity _furnList was derived for
let _furn = [];          // dynamic cone bodies for the CURRENT world: { body, s, x, home }
let _furnBuilt = false;  // furniture built into the current world?

// ── Group B gameplay-adjacent flags (all DEFAULT ON, each its own disable flag) ─
// These READ the deterministic side-world and influence race logic (flags/grip)
// but NEVER write px/pz/head/(s,x)/speed. The caution machine lives in
// js/game/racecontrol.js and reads
// hazards() from here; B2 promotes barrier panels here; B3 returns a grip scalar.
let _breakBarriers = true;   // B2 — apex26.breakBarriers ("0" disables)
let _marbleGripOn = true;    // B3 — apex26.marbleGrip ("0" disables)

// ── B2: breakable / knocked-back barrier panels ─────────────────────────────
// A hard wall impact promotes a few BARRIER panels near the hit to Rapier
// DYNAMIC bodies, each held to a FIXED backbone anchor by a fixed ImpulseJoint.
// The kinematic car mirror shoves them (one-way punt); when the SOLVED contact
// force on a panel exceeds a threshold the joint is removed (removeImpulseJoint)
// and the panel scatters. COSMETIC-PLUS: the player still gets the SAME bespoke
// xPinned clamp at the ORIGINAL barrier line — broken panels are never fed back
// as a collision surface (that would be R3). Determinism: promotion is driven by
// the deterministic wallImpact site; kicks are seeded from game state.
let _panels = [];        // promoted panels: { body, anchor, joint, home, live, broken, force, restT, s, side }
let _panelHandles = null;// Map: panel collider handle → index into _panels (force attribution)
let _panelSeq = 0;       // deterministic promotion sequence
let _panelsBroken = 0;   // cumulative panels that broke free (status/tests)

// ── tuning ──────────────────────────────────────────────────────────────────
const CAP_DESKTOP = 48, CAP_MOBILE = 16;
const WALL_SEV_MIN = 3;      // severity gate for wall scrapes (see wallImpact)
const CAR_SEV_MIN = 3;       // closing speed (m/s) gate for car-car contacts
const REST_DESPAWN_S = 4;    // seconds asleep before a shard returns to the pool
const FAR_DESPAWN_M = 250;   // despawn beyond this distance from the player
const MIRROR_HX = 0.75, MIRROR_HY = 0.4, MIRROR_HZ = 2.0;  // car half-extents (spike shape)
// A1 real-force tuning
const FORCE_MIN = 40;        // N — contact-force event threshold; gentle rubbing ignored
const FORCE_SEV_SCALE = 500; // N per +1 severity when a real hit overrides a hint
const SPALL_MIN = 600;       // N — a mirror ploughing a dynamic body this hard spalls
const SPALL_COOL_S = 0.4;    // min seconds between spall bursts per car
// A2 marble tuning
const MARBLE_CAP_DESKTOP = 16, MARBLE_CAP_MOBILE = 6;
const MARBLE_REST_DESPAWN_S = 6;   // was 12 — shorter rest so idle step() fires more often
const MARBLE_MIN_SPEED = 8;        // m/s — no marbles when crawling
const MARBLE_LOCK_GATE = 0.90;     // axFrac ≥ this = braking lock-up
const MARBLE_SLIP_GATE = 0.09;     // rad — |slip| ≥ this = a real slide
const MARBLE_REF_SCALE = 0.025;    // marble mesh reference half-extent (draw scaling)
const MARBLE_FAR_DESPAWN_M = 180;  // tighter than FAR_DESPAWN_M — cosmetic grit only
// A3 furniture tuning
const FURN_CAP_DESKTOP = 24, FURN_CAP_MOBILE = 12;
const FURN_WAKE_M = 14;      // wake radius (m): arc for cones, XZ for live debris/marbles/panels
const CONE_HX = 0.13, CONE_HY = 0.22, CONE_HZ = 0.13;  // cone body half-extents
// B1 hazard-query tuning (settled bodies ON the racing surface)
const HAZARD_Y_TOL = 1.6;      // m — ignore bodies this far above/below the road (airborne / sunk)
const FURN_DISTURB_M = 1.2;    // m — a cone counts as a hazard only once knocked this far from home
// B2 breakable-barrier tuning
const PANEL_CAP = 10;          // max concurrent promoted panels (bounded body budget)
const PANEL_LAT = 0.12, PANEL_HY = 0.5, PANEL_LEN = 0.75;
const PANEL_MASS = 12;         // kg-ish — heavy enough to look solid, light enough to scatter
const PANEL_BREAK = 1400;      // N — solved contact force on a panel that snaps its joint
const PANEL_REST_DESPAWN_S = 6;// broken panel asleep this long → freed back
// An UNBROKEN panel is untouched for this long → freed back. It has to exist,
// because a promoted panel that never breaks used to be freed by NOTHING: the
// only `live = false` sat inside `if (p.broken)`, so every hard hit that failed
// to clear PANEL_BREAK leaked a body pair permanently, and ten of those retired
// breakable barriers for the rest of the session. Longer than the broken timer
// because this one is armed and waiting for a second hit, not litter — but it
// still has to expire, since `far` alone never fires for a car that stays put.
// Freeing one is invisible: it is joint-pinned at its home, geometrically the
// static barrier it replaced, and never a collision surface for the car.
const PANEL_IDLE_DESPAWN_S = 20;
const PANEL_SEV_MIN = 8;       // only genuinely hard wall hits promote panels (gentle scrapes don't)
// B3 marble-grip tuning (subtle — a few % over a settled marble cluster)
const MARBLE_GRIP_R = 2.6;     // m — radius around the player that counts settled marbles
const MARBLE_GRIP_PER = 0.010; // grip loss per settled marble in range (1%)
const MARBLE_GRIP_MIN = 0.93;  // floor: never more than a 7% cornering-grip cut

// Deterministic PRNG (mulberry32) — every stream is seeded from game state.
function rng32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _smp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };  // sample scratch
const _mat = new Float32Array(16);   // reused draw matrix
_mat[15] = 1;
const _v = { x: 0, y: 0, z: 0 };     // reused vector for pose writes
const _q = { x: 0, y: 0, z: 0, w: 1 };
const _hinted = new Set();           // mirror indices hinted this tick (A1 spall dedup)

// ── enable / load ───────────────────────────────────────────────────────────
function _load() {
  if (_loadState !== 0) return;
  _loadState = 1;
  import(RAPIER_URL)
    .then((m) => m.default.init({}).then(() => {
      RAPIER = m.default;
      _loadState = 2;
      _active = _enabled;
    }))
    .catch((e) => {
      _loadState = -1; _loadErr = String(e); _active = false;
      Log.warn("game", "DebrisWorld load failed: " + ((e && e.message) || e));
    });
}

function setEnabled(on) {
  _enabled = !!on;
  if (_enabled) _load();
  _active = _enabled && _loadState === 2;
  if (!_enabled) destroyWorld();
  return status();
}

function create(ctx) {
  Log.info("game", "DebrisWorld.create");
  G = ctx;
  // Default ON, as originally intended — and worth recording why it spent
  // builds 897-902 off.
  //
  // Until build 893 this module had never run on the deployed site at all: the
  // Pages workflow staged an allow-list of directories and vendor/ was not on
  // it, so rapier.mjs 404'd, _loadState stuck at -1, and active() was false for
  // every player. Staging vendor/ switched a Rapier WASM side-world on for
  // everybody in one build, the next report was "fast before, slow and
  // struggling after", and the timing made this the obvious culprit. It was
  // turned off on that reasoning.
  //
  // The reasoning was wrong. The slowness was Car3D.aeroFlaps() — a hinge
  // SEARCH costing 64 ms per wing, run once per car per frame, measured at
  // ~180 ms of solver time in a single real frame and fixed by memoising it in
  // build 900. Turning this off never moved that number; the two changes only
  // happened to land together.
  //
  // So it comes back. What remains true is that it has still never run on a
  // phone, so the escape hatch stays one call wide: apex26.debris = "0", or
  // __apex.debris(false).
  let opt = "1";
  try { opt = localStorage.getItem("apex26.debris") || opt; } catch (e) {}
  // Group B disable flags — default ON, read once at boot (any value but "0" is on).
  try { _breakBarriers = (localStorage.getItem("apex26.breakBarriers") || "1") !== "0"; } catch (e) {}
  try { _marbleGripOn = (localStorage.getItem("apex26.marbleGrip") || "1") !== "0"; } catch (e) {}
  if (opt === "1") setEnabled(true);   // async load, never blocks boot (set "0" to disable)
  return { active, step, draw, wallImpact, carImpact, status, setEnabled, reset, burst, positions,
           registerFurniture, tyreMarble, hazards, promoteBarrier, marbleGrip, groupBFlags,
           rapierReady, worldGen, promoteCarDynamic, demoteCarKinematic, carBodyPose, isCarDynamic };
}

// ── Incident-sim takeover interface (consumed by js/game/incidentsim.js) ─────
// These promote/read/restore a car MIRROR as a Rapier 6-DoF dynamic body for a
// bounded, flagged, fallback-guarded incident window. They NEVER write a car —
// IncidentSim reads carBodyPose() back and does all the guarded writeback. When
// no takeover is active (_dynCars empty) these are never called and the debris
// side-world is bit-identical to before.
function rapierReady() { return _loadState === 2 && !!world; }
function worldGen() { return _worldGen; }
function isCarDynamic(i) { return _dynCars.has(i); }

function promoteCarDynamic(i, lin, ang) {
  if (!world || !RAPIER || i < 0 || i >= _mirrors.length) return false;
  const b = _mirrors[i];
  if (!b) return false;
  try {
    b.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    if (lin) b.setLinvel({ x: lin.x || 0, y: lin.y || 0, z: lin.z || 0 }, true);
    if (ang) b.setAngvel({ x: ang.x || 0, y: ang.y || 0, z: ang.z || 0 }, true);
    _dynCars.add(i);
    return true;
  } catch (e) {
    try { b.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true); } catch (_e) {}
    _dynCars.delete(i);
    return false;
  }
}

function demoteCarKinematic(i) {
  _dynCars.delete(i);
  if (!world || !RAPIER || i < 0 || i >= _mirrors.length) return false;
  const b = _mirrors[i];
  if (!b) return false;
  try { b.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true); } catch (e) { return false; }
  return true;
}

// Read mirror i's 6-DoF pose + velocities (only while it is dynamic/owned).
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

// Build the side-world at race SETUP instead of on the lights-out frame.
// step() below builds lazily on its first call, and game.js's update() returns
// at `if (state !== "race") return;` all through the countdown — so that first
// call has always landed on the very first RACE step, i.e. the lights-out
// frame. Measured with tools/profile-gameloop.mjs (vegas, physics), reading the
// profile's positionTicks so this is line-attributed rather than estimated:
// buildWorld is 467 of 2575 samples INCLUSIVE — ~216 ms on this box, of which
// createCollider is 410 —
// almost all of it ColliderDesc.trimesh copying the road mesh and building its
// BVH in wasm. That is ~13 dropped frames at 60 fps, at the one instant the
// player is reacting to. (docs/PERF-FINDINGS.md recorded buildWorld at 0.6%
// and called it "traced, not a defect" — that was its SELF time; the inclusive
// cost is 30x larger.)
// SIM-IDENTICAL, not merely equivalent-looking: construction order is the
// determinism contract and depends only on `track` and `cars.length`, both
// fixed before the countdown starts. step()'s own prologue re-checks both and
// rebuilds if either moved, so priming can only ever move WHEN the same world
// is built, never WHICH. If the wasm has not landed yet (_active false) this
// is a no-op and step() lazy-builds exactly as before — a pure optimisation
// with the old path intact as its fallback.
function prime() {
  const track = G.track, cars = G.cars;
  if (!_active || !track || !cars || !cars.length) return false;
  if (world && (_worldTrack !== track || _mirrors.length !== cars.length)) destroyWorld();
  if (!world) buildWorld(track, cars);
  return !!world;
}

// ── world lifecycle ─────────────────────────────────────────────────────────
function destroyWorld() {
  if (_events) { try { _events.free(); } catch (e) {} }
  if (world) { try { world.free(); } catch (e) {} }
  world = null; _worldTrack = null; _mirrors = []; _slots = []; _queue.length = 0;
  _dynCars.clear();   // any in-flight takeover's bodies die with the world — IncidentSim aborts via worldGen()
  _events = null; _colliderCar = null; _furnHandles = null;
  _marbles = []; _marbleCap = 0; _furn = []; _furnBuilt = false;
  _carForce = []; _spallCool = []; _forceBuf.length = 0; _forcePool.length = 0; _lastForce = 0;
  _panels = []; _panelHandles = null;   // B2 — bodies die with the world
}

function capFor() {
  let o = 0;
  try { o = parseInt(localStorage.getItem("apex26.debrisCap") || "", 10); } catch (e) {}
  if (Number.isFinite(o) && o > 0) return Math.min(o, 256);
  return (G.gfx && G.gfx.mobileTier) ? CAP_MOBILE : CAP_DESKTOP;
}
function marbleCapFor() { return (G.gfx && G.gfx.mobileTier) ? MARBLE_CAP_MOBILE : MARBLE_CAP_DESKTOP; }
function furnCapFor() { return (G.gfx && G.gfx.mobileTier) ? FURN_CAP_MOBILE : FURN_CAP_DESKTOP; }

function buildWorld(track, cars) {
  world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  _events = new RAPIER.EventQueue(true);
  _colliderCar = new Map();
  _furnHandles = new Set();
  _panelHandles = new Map();   // B2 — panel collider handle → _panels index
  _panels = [];                // promoted panels are per-world (rebuilt on track/field change)
  _carForce = new Array(cars.length).fill(0);
  _spallCool = new Array(cars.length).fill(0);
  const geo = track.roadGeo;
  if (geo && geo.pos && geo.idx) {
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
    _colliderCar.set(col.handle, i);   // handle → cars[] index (stable order)
    _mirrors.push(body);
  }
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
    // scale maps the shared ~0.2 m shard mesh onto this slot's collider size.
    // `s` is the arc the shard was thrown from, stamped on spawn — the hazard
    // query's projection hint (see projectHazard). Nothing else reads it, so it
    // is safe to be approximate; it is a search seed, never a position.
    _slots.push({ body, live: false, scale: (hx + hz) * 5.0, restT: 0, spawnTick: 0, s: 0 });
  }
  // A2: marble sub-pool — created AFTER the debris pool (fixed insertion order →
  // determinism). Tiny high-friction, low-restitution cuboids: they settle and
  // linger off-line. Cosmetic only; the sim never reads them back into grip.
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
  // A3: near-apex cones — created AFTER the marble pool (fixed order). Dynamic
  // bodies that settle on the road trimesh from t=0 (deterministic, no RNG) and
  // sleep; a kinematic mirror punts them one-way (never pushes the car back).
  _furn = [];
  _furnBuilt = false;
  if (_furnList && _furnTrack === track) {
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
  _worldGen++;   // a rebuilt world invalidates any incident-sim takeover (checked via worldGen())
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
    // Inside of the corner (apex kerb): k>0 curves screen-left → inside is -x
    // (matches the race-line assist convention in game.js). Clamp inside the
    // road so the cone rests on the trimesh instead of falling through an edge.
    const inside = (Math.sign(Tracks.curvature(track, s)) > 0) ? -1 : 1;
    const x = Math.max(-(hw - 0.3), Math.min(hw - 0.3, inside * (hw - 0.9)));
    list.push({ s, x });
  }
  _furnList = list; _furnTrack = track;
  if (world && _worldTrack === track && !_furnBuilt) destroyWorld();
}

function reset() {
  destroyWorld();
  _tick = 0; _stepSkips = 0; _seq = 0; _spawnedTotal = 0; _lastImpact = null;
  _marbleSeq = 0; _furnBuilt = false; _lastForce = 0;
  _panelSeq = 0; _panelsBroken = 0;   // B2 counters (bodies torn down in destroyWorld)
  return status();
}

// ── game-side hooks (called from game.js, both guarded by active()) ─────────

function wallImpact(c, side, xOver) {
  const sev = (xOver || 0) * 60 + Math.abs(c.speed || 0) * 0.15;
  if (sev < WALL_SEV_MIN) return;
  const mi = G.cars ? G.cars.indexOf(c) : -1;
  _queue.push({ kind: "wall", s: c.s, x: c.x, side, sev,
                speed: Math.abs(c.speed || 0), carIdx: c.num | 0, mi });
}

function carImpact(a, b, relV) {
  if (relV < CAR_SEV_MIN) return;
  _queue.push({ kind: "car", s: b.s, x: (a.x + b.x) * 0.5, side: a.x >= b.x ? 1 : -1,
                sev: relV, speed: Math.abs(b.speed || 0), carIdx: (a.num | 0) + (b.num | 0) });
}

// B2 game-side hook — called at the barrier clamp site (game.js wallImpact site)
// on the FIRST pinned frame of a HARD hit. Promotes a bounded set of BARRIER
// panels near the impact to Rapier DYNAMIC bodies, each pinned to a FIXED
// backbone anchor by a fixed ImpulseJoint. The kinematic car mirror punts them
// (one-way); the joint snaps in step() once the solved contact force clears
// PANEL_BREAK. READ-ONLY w.r.t. the car: this NEVER moves the player — the
// bespoke xPinned clamp at the ORIGINAL line is untouched, and broken panels are
// never a collision surface for the car. Deterministic (driven by the
// deterministic clamp site; kicks seeded from game state).
function promoteBarrier(c, side, sev) {
  if (!_breakBarriers || !world || !c) return 0;
  if ((sev || 0) < PANEL_SEV_MIN) return 0;   // only hard hits knock barriers loose
  const track = G.track;
  if (!track) return 0;
  if (_panels.length >= PANEL_CAP) return 0;
  const room = PANEL_CAP - _panels.length;
  const n = Math.max(1, Math.min(room, 2 + Math.floor((sev || 0) * 0.12)));
  const s0 = c.s;
  let made = 0;
  for (let i = 0; i < n; i++) {
    const so = s0 + (i - (n - 1) / 2) * (PANEL_LEN * 2.1);   // spaced along the wall line
    Tracks.sample(track, so, _smp);
    const rl = Math.hypot(_smp.r[0], _smp.r[2]) || 1;
    const rx = _smp.r[0] / rl, rz = _smp.r[2] / rl;
    const lat = Tracks.wallAt(track, so, side) * side;      // signed barrier-line offset
    const wx = _smp.p[0] + rx * lat;
    const wy = _smp.p[1] + PANEL_HY;
    const wz = _smp.p[2] + rz * lat;
    const yaw = Math.atan2(_smp.t[0], _smp.t[2]);            // face along the track
    const rq = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
    // Fixed backbone anchor + dynamic panel body, co-located at the panel home.
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

// A2 game-side hook (called near the combined-slip block for player + AI). m =
// { lock: axFrac 0..1, slip: max |slip angle| rad, speed: m/s }. Emits a marble
// only under real lock-up / slide, rate-limited by a seeded stream (NO
// Date.now/Math.random). COSMETIC ONLY — reads game state, spawns from the car's
// (s,x) READ-ONLY, never touches grip / px / pz / head / (s,x).
function tyreMarble(c, m) {
  if (!world || !_marbles.length || !c || !m) return;
  if ((m.speed || 0) < MARBLE_MIN_SPEED) return;
  const hot = (m.lock || 0) >= MARBLE_LOCK_GATE || (m.slip || 0) >= MARBLE_SLIP_GATE;
  if (!hot) return;
  const ci = G.cars ? G.cars.indexOf(c) : 0;
  const seed = (Math.imul(_tick + 1, 0x9E3779B1) ^ Math.imul(ci + 1, 0x85EBCA6B)
              ^ (Math.floor((m.slip || 0) * 997) | 0)) | 0;
  const r = rng32(seed);
  if (r() > 0.25) return;                 // rate-limit
  spawnMarble(c, m, r);
}

// ── spawn ───────────────────────────────────────────────────────────────────
function acquireSlot() {
  let oldest = null;
  for (const s of _slots) {
    if (!s.live) return s;
    if (!oldest || s.spawnTick < oldest.spawnTick) oldest = s;   // recycle oldest
  }
  return oldest;
}

function acquireMarble() {
  let oldest = null;
  for (const s of _marbles) {
    if (!s.live) return s;
    if (!oldest || s.spawnTick < oldest.spawnTick) oldest = s;   // recycle oldest
  }
  return oldest;
}

function spawnMarble(c, m, r) {
  const track = G.track;
  if (!track) return;
  Tracks.sample(track, c.s, _smp);
  const rl = Math.hypot(_smp.r[0], _smp.r[2]) || 1;
  const rx = _smp.r[0] / rl, rz = _smp.r[2] / rl;               // track right (planar)
  const tl = Math.hypot(_smp.t[0], _smp.t[2]) || 1;
  const fx = _smp.t[0] / tl, fz = _smp.t[2] / tl;               // track forward (planar)
  const side = (r() < 0.5) ? 1 : -1;
  const lat = c.x + side * (0.5 + r() * 0.4);                   // just off the tyre
  const back = -(1.0 + r() * 2.0);                             // shed behind the car
  const slot = acquireMarble();
  if (!slot) return;
  const b = slot.body;
  b.setEnabled(true);
  _v.x = _smp.p[0] + rx * lat + fx * back;
  _v.y = _smp.p[1] + 0.12;
  _v.z = _smp.p[2] + rz * lat + fz * back;
  b.setTranslation(_v, true);
  const vf = (m.speed || 0) * (0.02 + r() * 0.05);             // tiny forward carry
  const vs = side * (0.3 + r() * 0.6);                        // low outward flick
  _v.x = fx * vf + rx * vs; _v.y = 0.4 + r() * 0.6; _v.z = fz * vf + rz * vs;
  b.setLinvel(_v, true);
  _v.x = (r() - 0.5) * 12; _v.y = (r() - 0.5) * 12; _v.z = (r() - 0.5) * 12;
  b.setAngvel(_v, true);
  _q.x = 0; _q.y = 0; _q.z = 0; _q.w = 1;
  b.setRotation(_q, true);
  slot.live = true; slot.restT = 0; slot.spawnTick = _tick;
  _marbleSeq++;
}

function spawnImpact(imp, track) {
  Tracks.sample(track, imp.s, _smp);
  const rl = Math.hypot(_smp.r[0], _smp.r[2]) || 1;
  const rx = _smp.r[0] / rl, rz = _smp.r[2] / rl;              // track right (planar)
  const tl = Math.hypot(_smp.t[0], _smp.t[2]) || 1;
  const fx = _smp.t[0] / tl, fz = _smp.t[2] / tl;              // track forward (planar)
  const cx = _smp.p[0] + rx * imp.x, cz = _smp.p[2] + rz * imp.x;
  const cy = _smp.p[1] + 0.35;
  if (imp.kind !== "burst" && imp.mi != null && imp.mi >= 0 &&
      imp.mi < _carForce.length && _carForce[imp.mi] > 0) {
    const fsev = _carForce[imp.mi] / FORCE_SEV_SCALE;
    if (fsev > imp.sev) imp.sev = fsev;
  }
  const n = Math.max(2, Math.min(8, 2 + Math.floor(imp.sev * 0.5)));
  // Seed the shard scatter from game state only: tick counter, spawn sequence,
  // car index — never wall clock, never Math.random.
  const r = rng32((Math.imul(_tick, 0x9E3779B1) ^ Math.imul(_seq + 1, 0x85EBCA6B) ^ Math.imul(imp.carIdx + 1, 0xC2B2AE35)) | 0);
  for (let i = 0; i < n; i++) {
    const slot = acquireSlot();
    if (!slot) break;
    const b = slot.body;
    b.setEnabled(true);
    const along = (r() - 0.5) * 3.0;                            // scatter along the car
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
    slot.live = true; slot.restT = 0; slot.spawnTick = _tick;
    slot.s = imp.s;              // hazard-projection hint only (see projectHazard)
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
function _carNearFurn(track, cars) {
  if (!_furn.length) return false;
  const L = (track && track.total) || 0;
  for (let k = 0; k < _furn.length; k++) {
    const fs = _furn[k].s;
    for (let i = 0; i < cars.length; i++) {
      let d = Math.abs((cars[i].s || 0) - fs);
      if (L) d = Math.min(d, L - d);
      if (d < FURN_WAKE_M) return true;
    }
  }
  return false;
}
function _playerSample(track) {
  const p = G.player;
  if (!p) return { have: false, px: 0, pz: 0 };
  if (p.px != null) return { have: true, px: p.px, pz: p.pz };
  Tracks.sample(track, p.s, _smp);
  return { have: true, px: _smp.p[0], pz: _smp.p[2] };
}
// Shared by the WASM path and the asleep-skip path so despawn stays bit-identical.
function _ageAndCullPool(pool, dt, px, pz, havePlayer, restLimit, farM) {
  const far2 = farM * farM;
  for (let i = 0; i < pool.length; i++) {
    const s = pool[i];
    if (!s.live) continue;
    const b = s.body;
    if (b.isSleeping()) { s.restT += dt; } else { s.restT = 0; }
    let far = false;
    if (havePlayer) {
      const t = b.translation();
      const dx = t.x - px, dz = t.z - pz;
      far = dx * dx + dz * dz > far2;
    }
    if (s.restT > restLimit || far) { b.setEnabled(false); s.live = false; }
  }
}
function _carNearLiveDebris(track, cars) {
  // XZ, same metres as FURN_WAKE_M. A settled marble under the line must still
  // solve when a car is close enough to punt it — marbleGrip() reads those
  // sleeping live bodies, so a sleep-only gate without this wake is a grip bug.
  const r2 = FURN_WAKE_M * FURN_WAKE_M;
  const n = cars.length;
  for (const pool of [_slots, _marbles, _panels]) {
    for (let i = 0; i < pool.length; i++) {
      const s = pool[i];
      if (!s.live || !s.body) continue;
      const t = s.body.translation();
      for (let k = 0; k < n; k++) {
        const c = cars[k];
        let cx = c.px, cz = c.pz;
        if (cx == null) {
          Tracks.sample(track, c.s, _smp);
          cx = _smp.p[0]; cz = _smp.p[2];
        }
        const dx = t.x - cx, dz = t.z - cz;
        if (dx * dx + dz * dz < r2) return true;
      }
    }
  }
  return false;
}
function _needSolve(track, cars) {
  if (_queue.length || _dynCars.size) return true;
  if (_anyAwake(_slots) || _anyAwake(_marbles) || _anyAwake(_panels)) return true;
  if ((_anyLive(_slots) || _anyLive(_marbles) || _anyLive(_panels))
      && _carNearLiveDebris(track, cars)) return true;
  if (_furn.length && _carNearFurn(track, cars)) return true;
  return false;
}
function step(dt) {
  const track = G.track, cars = G.cars;
  if (!track || !cars || !cars.length) { _queue.length = 0; return; }
  // Track or field change → rebuild the whole world (deterministic order).
  if (world && (_worldTrack !== track || _mirrors.length !== cars.length)) destroyWorld();
  if (!world) buildWorld(track, cars);
  if (world.timestep !== dt) world.timestep = dt;
  if (_queue.length === 0 && _dynCars.size === 0 && !_anyLive(_panels)
      && !_anyLive(_slots) && !_anyLive(_marbles)
      && (!_furn.length || !_carNearFurn(track, cars))) {
    return;
  }
  if (!_needSolve(track, cars)) {
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
  _tick++;
  // A1: decay per-car spall cooldowns.
  for (let i = 0; i < _spallCool.length; i++)
    if (_spallCool[i] > 0) _spallCool[i] = Math.max(0, _spallCool[i] - dt);

  for (let i = 0; i < cars.length; i++) {
    // Incident sim owns this index as a DYNAMIC body — do NOT pose it (a dynamic
    // body has no setNextKinematic* semantics). IncidentSim reads it back instead.
    if (_dynCars.has(i)) continue;
    const c = cars[i], m = _mirrors[i];
    Tracks.sample(track, c.s, _smp);
    const rl = Math.hypot(_smp.r[0], _smp.r[2]) || 1;
    _v.x = _smp.p[0] + _smp.r[0] / rl * c.x;
    _v.y = _smp.p[1] + 0.45;
    _v.z = _smp.p[2] + _smp.r[2] / rl * c.x;
    m.setNextKinematicTranslation(_v);
    const yaw = (c.human && c.head != null) ? c.head : Math.atan2(_smp.t[0], _smp.t[2]);
    _q.x = 0; _q.y = Math.sin(yaw / 2); _q.z = 0; _q.w = Math.cos(yaw / 2);
    m.setNextKinematicRotation(_q);
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
  } catch (e) {
    try { Log.warn("game", "[debris] rapier step trapped — debris disabled", e); } catch (_e) {}
    _active = false;
    try { destroyWorld(); } catch (_e) {}
    return;
  }

  // bookkeeping: rest + distance despawn back into the pool (same helper as the skip path)
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

  // B2: snap over-loaded panels off their joints and free settled/far ones.
  if (_panels.length) updatePanels(dt, px, pz);
}

function updatePanels(dt, px, pz) {
  let changed = false;
  for (const p of _panels) {
    if (!p.live) continue;
    if (!p.broken && p.joint && p.force > PANEL_BREAK) {
      try { world.removeImpulseJoint(p.joint, true); } catch (e) {}
      p.joint = null; p.broken = true; p.restT = 0; _panelsBroken++;
      // Seeded scatter kick (game state only, no wall clock / Math.random).
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
    // Both states age out, on their own clock. Broken panels are litter and go
    // when they have settled; unbroken ones are still pinned at their home, so
    // "idle" is measured by nothing having touched them (force is zeroed every
    // tick in drainForces, so a non-zero value means a contact THIS tick).
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
        try { world.removeImpulseJoint(p.joint, true); } catch (e) { /* ignored:
          this throws only if Rapier already dropped the joint, which is the
          state the call is trying to reach. */ }
        p.joint = null;
      }
      try { world.removeRigidBody(p.body); } catch (e) {}
      try { world.removeRigidBody(p.anchor); } catch (e) {}
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

// Project ONE hazard candidate back to (s, lat), seeded by the arc the body was
// placed at — falling back to the full scan the moment that seed is not
// trustworthy. Leaves _smp holding the sample at the returned s, which
// consider() reads back for hw and road height.
//
// WHY A HINT. Tracks.project with no hint evaluates EVERY centreline segment,
// and n = round(total/4) (js/track/tracks.js): 824 segments on monaco, 1444 on
// monza, 1543 on vegas, 1737 on spa. With a hint it evaluates ±16 nodes = 33
// (js/track/spline.js). This ran unhinted for every live shard (cap 48), every
// disturbed cone and every broken panel at the caution machine's 4 Hz
// (QUERY_EVERY in js/game/racecontrol.js) — while every one of those records
// already carries the arc it was placed at.
//
// WHY A FALLBACK. The hint RESTRICTS the search to ±64 m of arc rather than
// seeding it, so a stale hint mis-projects SILENTLY instead of erroring, and a
// shard can outrun 64 m: spawnImpact throws it at up to 0.55x the car's speed
// along the track for the ~1 s it is airborne, before it starts sliding.
//
// WHY THIS TRUST TEST. It is consider()'s OWN pair of tests, applied to the
// hinted answer: within the road half-width, and at this road's height. Trusting
// less is always safe — the fallback IS the old code path — so the guard only has
// to be strict enough, never exact. Both halves are load-bearing:
//   · `dist`, not `lat`: `lat` is only the component along the local `right`, so
//     a body far past the window still reports a near-zero `lat` when the window
//     edge happens to point at it. Trusting `lat <= hw` flips the accept/reject
//     verdict on 131-309 of ~45k sampled placements per circuit and misplaces
//     accepted ones by up to 1931 m of arc. `dist` is the real perpendicular.
//   · the height test, because Tracks.project is XZ-ONLY and suzuka is a
//     figure-of-eight: at the crossover the two legs are 1.43 m apart in XZ and
//     8.07 m apart in Y (s=2529 over s=4893). Without it, a hint on one leg is
//     trusted for a body on the other and mis-attributes by 2364 m of arc.
//
// WHAT IT COSTS. Swept over all 40 circuits (1.75M placements, every staleness
// up to a 2 km wrong hint): on 39 of them, ZERO accept/reject verdicts change,
// and accepted answers land within 13 m of the unhinted arc. That drift is
// spline.js's CONT term dragging a hinted answer toward its hint by ~7% of the
// arc gap; 13 m is 0.2% of a lap, and only the per-sector SPLIT of hazards()
// reads it — `total`, which drives VSC_MIN, cannot move at all.
// tests/unit/debris-hazard-hint.test.mjs pins monza/monaco/spa/miami and suzuka.
//
// SUZUKA IS DELIBERATELY DIFFERENT, and it is the hint that is right. Under the
// bridge the unhinted XZ scan snaps a body resting on the upper deck onto the
// lower road, 8 m below, and consider() then discards it as airborne. The hint
// keeps it on the deck it is actually on. That is a behaviour change, on one
// circuit, at one place, in the direction of correctness — and hazards() is not
// a replicated surface (js/game/racecontrol.js: debris "is NOT replicated, so
// two peers genuinely see different hazards"; the guest adopts the host's flag).
function projectHazard(track, x, y, z, hint) {
  if (hint != null) {
    const pr = Tracks.project(track, x, z, hint);
    Tracks.sample(track, pr.s, _smp);
    if (pr.dist <= (_smp.hw || 6) && Math.abs(y - _smp.p[1]) <= HAZARD_Y_TOL) return pr;
  }
  // The fallback now passes the body's HEIGHT. Without it this search is purely
  // XZ, so on the one circuit that crosses itself it was a coin toss between the
  // legs — exactly the case the hint above exists to avoid, reappearing on the
  // path taken when the hint is NOT trusted. Measured on suzuka: a body on the
  // upper deck, displaced toward the lower road, projected onto the wrong leg at
  // every offset tried (5/5), landing ~2368 m away in arc; with the height it is
  // right at all of them.
  const pr = Tracks.project(track, x, z, null, y);
  Tracks.sample(track, pr.s, _smp);
  return pr;
}

// ── B1: hazard query — settled bodies resting ON the racing surface ─────────
// Deterministic read of the side-world consumed by the caution state machine
// (js/game/racecontrol.js). A body counts when it is (a) asleep (isSleeping), (b) roughly at road
// height, and (c) inside the road half-width once projected back to (s, lat).
// A3 cones count ONLY after being knocked FURN_DISTURB_M off their placed home —
// an untouched apex cone is scene dressing, not a yellow-flag hazard. Returns
// per-sector counts + the worst sector with a representative track fraction.
// READ-ONLY: never writes a car / (s,x) / px / pz / head.
function hazards() {
  const out = { sectors: [0, 0, 0], total: 0, worst: { sector: -1, count: 0, frac: 0 } };
  if (!world || !G.track) return out;
  const track = G.track, total = track.total || 1;
  const sec = track.def && track.def.sectors;
  const splits = (sec && sec.length === 2) ? [sec[0], sec[1]] : [1 / 3, 2 / 3];
  const secFrac = [0, 0, 0];
  // `hint` is the record's OWN placed arc — a slot's spawn s, a cone's placed s,
  // a panel's promoted s. Never the player's, never a shared value: the window is
  // only ±64 m wide, so one record's arc is meaningless for another's.
  const consider = (body, hint) => {
    if (!body || !body.isSleeping()) return;
    const t = body.translation();
    const pr = projectHazard(track, t.x, t.y, t.z, hint);
    const hw = _smp.hw || 6;
    if (Math.abs(t.y - _smp.p[1]) > HAZARD_Y_TOL) return;   // airborne / sunk
    if ((pr.dist != null ? pr.dist : Math.abs(pr.lat)) > hw) return;                      // off the racing surface
    const frac = (((pr.s / total) % 1) + 1) % 1;
    const si = frac < splits[0] ? 0 : frac < splits[1] ? 1 : 2;
    if (out.sectors[si] === 0) secFrac[si] = +frac.toFixed(4);
    out.sectors[si]++; out.total++;
  };
  for (const s of _slots) if (s.live) consider(s.body, s.s);
  for (const f of _furn) {
    const t = f.body.translation();
    const dx = t.x - f.home.x, dz = t.z - f.home.z;
    if (dx * dx + dz * dz < FURN_DISTURB_M * FURN_DISTURB_M) continue;   // undisturbed cone
    consider(f.body, f.s);
  }
  for (const p of _panels) if (p.live && p.broken) consider(p.body, p.s);
  for (let i = 0; i < 3; i++)
    if (out.sectors[i] > out.worst.count)
      out.worst = { sector: i, count: out.sectors[i], frac: secFrac[i] };
  return out;
}

// ── B3: marble-grip query — is the player over a settled marble cluster? ─────
// Returns a grip SCALAR in [MARBLE_GRIP_MIN, 1] that game.js multiplies into the
// EXISTING gripMult()/muBase composition. It NEVER touches LONG_GRIP/slipFactor
// and NEVER moves the car — it is a pure function of the deterministic settled-
// marble positions: sleeping marbles within MARBLE_GRIP_R of the car's world
// position each shave MARBLE_GRIP_PER off grip, floored at MARBLE_GRIP_MIN. Any
// off-path (flag off, cold world, no marbles near) returns 1.0 — a true no-op.
function marbleGrip(c) {
  if (!_marbleGripOn || !world || !c || !_anyLive(_marbles)) return 1;
  const track = G.track;
  if (!track) return 1;
  Tracks.sample(track, c.s, _smp);
  const rl = Math.hypot(_smp.r[0], _smp.r[2]) || 1;
  const cx = _smp.p[0] + _smp.r[0] / rl * (c.x || 0);
  const cz = _smp.p[2] + _smp.r[2] / rl * (c.x || 0);
  const R2 = MARBLE_GRIP_R * MARBLE_GRIP_R;
  let n = 0;
  for (const s of _marbles) {
    if (!s.live || !s.body.isSleeping()) continue;
    const t = s.body.translation();
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
  // B2: zero every panel's per-tick solved force before re-accumulating.
  for (const p of _panels) p.force = 0;
  if (!_events) { _forceBuf.length = 0; _lastForce = 0; return; }
  // Pool the {h1,h2,f} entries: contact storms used to alloc one object per
  // event every tick. Grow _forcePool to the high-water mark; never shrink it.
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
    // B2: the same solved contact force on a promoted panel drives its joint break.
    if (_panelHandles) {
      const pi = _panelHandles.has(ev.h1) ? _panelHandles.get(ev.h1)
               : (_panelHandles.has(ev.h2) ? _panelHandles.get(ev.h2) : -1);
      if (pi >= 0 && pi < _panels.length && _panels[pi]) _panels[pi].force += ev.f;
    }
    if (ev.f > lf) lf = ev.f;
  }
  _lastForce = +lf.toFixed(2);
}

// ── render (ONE guarded call in game.js's render loop, after the cars) ──────
let _shardMesh = null, _marbleMesh = null, _coneMesh = null, _panelMesh = null;
const _drawOpts = { roughness: 0.6, metalness: 0.2, specular: 0.35 };
const _marbleOpts = { roughness: 0.9, metalness: 0.0, specular: 0.1 };
const _coneOpts = { roughness: 0.55, metalness: 0.0, specular: 0.3, emissive: 0.08 };
const _panelOpts = { roughness: 0.7, metalness: 0.1, specular: 0.25 };  // B2 armco slab

function shardMesh() {
  if (_shardMesh) return _shardMesh;
  const out = { pos: [], nrm: [], col: [], idx: [] };
  TrackGeom.addBox(out, [0, 0, 0], [0.20, 0.02, 0.13], [0.05, 0.05, 0.06]);        // carbon plate
  TrackGeom.addBox(out, [0.05, 0.02, -0.03], [0.07, 0.05, 0.08], [0.30, 0.31, 0.33]); // metal chunk
  TrackGeom.addBox(out, [-0.05, 0.01, 0.04], [0.13, 0.015, 0.03], [0.11, 0.11, 0.12]); // sliver
  _shardMesh = G.gfx.createMesh(out);
  return _shardMesh;
}
function marbleMesh() {
  if (_marbleMesh) return _marbleMesh;
  const out = { pos: [], nrm: [], col: [], idx: [] };
  TrackGeom.addBox(out, [0, 0, 0], [MARBLE_REF_SCALE, MARBLE_REF_SCALE * 0.7, MARBLE_REF_SCALE], [0.04, 0.04, 0.045]);
  _marbleMesh = G.gfx.createMesh(out);
  return _marbleMesh;
}
function coneMesh() {
  if (_coneMesh) return _coneMesh;
  const out = { pos: [], nrm: [], col: [], idx: [] };
  TrackGeom.addBox(out, [0, -CONE_HY + 0.02, 0], [0.13, 0.02, 0.13], [0.9, 0.35, 0.05]); // base
  TrackGeom.addCone(out, [0, -CONE_HY + 0.04, 0], 0.10, CONE_HY * 1.9, [0.95, 0.42, 0.08], 10); // body
  _coneMesh = G.gfx.createMesh(out);
  return _coneMesh;
}

function panelMesh() {
  if (_panelMesh) return _panelMesh;
  const out = { pos: [], nrm: [], col: [], idx: [] };
  TrackGeom.addBox(out, [0, 0, 0], [PANEL_LAT, PANEL_HY, PANEL_LEN], [0.90, 0.92, 0.94]);        // rail face
  TrackGeom.addBox(out, [0, -PANEL_HY * 0.35, 0], [PANEL_LAT * 1.1, PANEL_HY * 0.25, PANEL_LEN], [0.86, 0.16, 0.15]); // red stripe
  TrackGeom.addBox(out, [0, -PANEL_HY, 0], [PANEL_LAT * 1.3, PANEL_HY, PANEL_LEN * 0.12], [0.20, 0.20, 0.24]);        // post foot
  _panelMesh = G.gfx.createMesh(out);
  return _panelMesh;
}

function drawBody(body, sc, mesh, opts, gfx) {
  const t = body.translation(), q = body.rotation();
  const x = q.x, y = q.y, z = q.z, w = q.w;
  const xx = x * x, yy = y * y, zz = z * z;
  const xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  _mat[0] = (1 - 2 * (yy + zz)) * sc; _mat[1] = 2 * (xy + wz) * sc; _mat[2] = 2 * (xz - wy) * sc; _mat[3] = 0;
  _mat[4] = 2 * (xy - wz) * sc; _mat[5] = (1 - 2 * (xx + zz)) * sc; _mat[6] = 2 * (yz + wx) * sc; _mat[7] = 0;
  _mat[8] = 2 * (xz + wy) * sc; _mat[9] = 2 * (yz - wx) * sc; _mat[10] = (1 - 2 * (xx + yy)) * sc; _mat[11] = 0;
  _mat[12] = t.x; _mat[13] = t.y; _mat[14] = t.z;
  gfx.draw(mesh, _mat, opts);
}

function draw() {
  if (!world) return;
  const gfx = G.gfx;
  if (_slots.length) {
    const mesh = shardMesh();
    for (const s of _slots) if (s.live) drawBody(s.body, s.scale, mesh, _drawOpts, gfx);
  }
  // A2 marbles — sibling loop, tiny cube mesh, per-body scale.
  if (_marbles.length) {
    const mesh = marbleMesh();
    for (const s of _marbles) if (s.live) drawBody(s.body, s.scale, mesh, _marbleOpts, gfx);
  }
  // A3 cones — sibling loop, shared cone mesh at scale 1.
  if (_furn.length) {
    const mesh = coneMesh();
    for (const f of _furn) drawBody(f.body, 1, mesh, _coneOpts, gfx);
  }
  // B2 promoted barrier panels — sibling loop, shared armco slab at scale 1.
  if (_panels.length) {
    const mesh = panelMesh();
    for (const p of _panels) if (p.live) drawBody(p.body, 1, mesh, _panelOpts, gfx);
  }
}

// ── status (for __apex.debris and tests) ────────────────────────────────────
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
  // B2 panels appended LAST — the debris/marble/furniture prefix above is
  // unchanged, so the debris determinism spec still matches element-for-element
  // (a seeded debris episode never promotes panels — that needs a hard wall hit).
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
    live: liveCount(),          // impact-debris ONLY (cap spec asserts live===16)
    cap: _cap || capFor(),
    stepped: _tick,
    spawned: _spawnedTotal,
    stepSkips: _stepSkips,
    lastImpact: _lastImpact,
    // ── Group A extras: SEPARATE fields (never folded into live/cap) ──
    marbles: marbleCount(),     // live A2 marbles
    marbleCap: _marbleCap || marbleCapFor(),
    furniture: _furn.length,    // A3 cone bodies in the current world
    furnCount: _furnList ? _furnList.length : 0,
    lastForce: _lastForce,      // max real solved contact force last tick (A1)
    // ── Group B extras ──
    panels: _panelLive(),       // B2 promoted panels currently in the world
    panelsBroken: _panelsBroken,// B2 cumulative panels that snapped free
    breakBarriers: _breakBarriers,
    marbleGrip: _marbleGripOn,
  };
}
function _panelLive() { let n = 0; for (const p of _panels) if (p.live) n++; return n; }

return { create, active, prime, step, draw, wallImpact, carImpact, status, setEnabled, reset, burst, positions,
         registerFurniture, tyreMarble, hazards, promoteBarrier, marbleGrip, groupBFlags,
         rapierReady, worldGen, promoteCarDynamic, demoteCarKinematic, carBodyPose, isCarDynamic };
})();
