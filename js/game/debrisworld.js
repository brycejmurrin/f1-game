/* Apex 26 — Rapier side-world for render-only debris (adoption phases R0+R1,
   see spike/ADOPTION-PLAN.md Part 2). A physics side-world that NEVER moves a
   car: the game's cars are mirrored in as kinematic bodies each fixed tick,
   Rapier owns only its own small dynamic debris cuboids (endplate shards /
   impact chunks), and results flow back purely as render transforms.

   Contract with the bespoke physics (sacred, do not renegotiate here):
     - zero writeback: nothing in this module writes to any car, to (s, x),
       or to px/pz/head. Debris is a visual garnish.
     - inert when disabled: game.js guards every call with DebrisWorld.active(),
       which is a plain boolean read. Non-users never fetch rapier.mjs.
     - deterministic: no Date.now/Math.random anywhere — spawn variation is
       seeded from game state (tick counter, spawn sequence, car index), and
       Rapier itself is bitwise deterministic per platform for a fixed body
       insertion order (measured in spike/physics/README.md §c).

   Loading: ON by default; disable via localStorage apex26.debris = "0" or
   __apex.debris(false). On enable the vendored @dimforge/rapier3d-compat 0.19.3 module
   (vendor/rapier-0.19.3/rapier.mjs, WASM inlined) is dynamic-import()ed — a
   ~90 ms one-time init measured in spike/physics/DEEP-DIVE.md §2, off the
   boot path by construction. The world (road trimesh with FIX_INTERNAL_EDGES
   + car mirrors + a fixed pool of debris bodies) is built lazily on the first
   step and rebuilt when the track or the field size changes.

   Budget (measured in-browser, DEEP-DIVE §2): 22 mirrors + 100 debris ≈
   0.36 ms mean / 1.1 ms p95 per tick all-in. This module caps live debris at
   48 (16 on the mobile tier) — well inside that envelope.

   Created with the G ctx façade from game.js (DebrisWorld.create(G));
   must load BEFORE js/game.js (see index.html / tools/manifest.cjs). */
const DebrisWorld = (function () {
  "use strict";

// Resolve the vendored module against THIS script's URL at eval time, so the
// dynamic import works both at site root and under a GitHub-Pages subpath.
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
let _slots = [];         // fixed debris pool: { body, live, scale, restT, spawnTick }
let _cap = 0;            // pool size for the CURRENT world (48 desktop / 16 mobile tier)
let _queue = [];         // impacts queued by the game-side hooks, consumed next step

// ── deterministic counters (reset() zeroes them for repeatable episodes) ────
let _tick = 0;           // side-world ticks stepped
let _seq = 0;            // debris spawn sequence number
let _spawnedTotal = 0;
let _lastImpact = null;  // { kind, carIdx, sev, tick, spawned } — for tests

// ── A1: real solved contact-force severity ──────────────────────────────────
// The Rapier world has NO barrier colliders and cars are kinematic mirrors, so
// real solved contact force exists ONLY for mirror(kin)↔dynamic(debris / A3
// furniture) contacts. Car-car and car-wall keep the synthesised wallImpact /
// carImpact severity as the fallback. Passing an EventQueue to world.step does
// not alter the simulation, so debris determinism is preserved.
let _events = null;      // reusable RAPIER.EventQueue(true)
let _colliderCar = null; // Map: mirror collider handle → car idx (cars[] order)
let _furnHandles = null; // Set: A3 furniture collider handles
let _carForce = [];      // per-car real force accumulated this tick (mirror↔dynamic)
let _spallCool = [];     // per-car spall-burst cooldown (s), decremented each tick
const _forceBuf = [];    // scratch: drained contact-force events, sorted deterministically
let _lastForce = 0;      // max real force magnitude seen last tick (status)

// ── A2: marbles (separate seeded sub-pool, cosmetic only — never touches grip) ─
let _marbles = [];       // fixed pool: { body, live, restT, spawnTick, scale }
let _marbleCap = 0;
let _marbleSeq = 0;      // deterministic marble spawn sequence

// ── A3: clippable near-apex cones (dynamic, punted one-way by kinematic mirrors) ─
let _furnList = null;    // per-track placement list [{s,x}] (survives reset())
let _furnTrack = null;   // track identity _furnList was derived for
let _furn = [];          // dynamic cone bodies for the CURRENT world: { body, s, x }
let _furnBuilt = false;  // furniture built into the current world?

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
const MARBLE_CAP_DESKTOP = 24, MARBLE_CAP_MOBILE = 8;
const MARBLE_REST_DESPAWN_S = 12;  // marbles linger far longer than impact shards
const MARBLE_MIN_SPEED = 8;        // m/s — no marbles when crawling
const MARBLE_LOCK_GATE = 0.90;     // axFrac ≥ this = braking lock-up
const MARBLE_SLIP_GATE = 0.09;     // rad — |slip| ≥ this = a real slide
const MARBLE_REF_SCALE = 0.025;    // marble mesh reference half-extent (draw scaling)
// A3 furniture tuning
const FURN_CAP_DESKTOP = 24, FURN_CAP_MOBILE = 12;
const CONE_HX = 0.13, CONE_HY = 0.22, CONE_HZ = 0.13;  // cone body half-extents

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
    .catch((e) => { _loadState = -1; _loadErr = String(e); _active = false; });
}

function setEnabled(on) {
  _enabled = !!on;
  if (_enabled) _load();
  _active = _enabled && _loadState === 2;
  if (!_enabled) destroyWorld();
  return status();
}

function create(ctx) {
  G = ctx;
  let opt = "1";
  try { opt = localStorage.getItem("apex26.debris") || "1"; } catch (e) {}
  if (opt === "1") setEnabled(true);   // default ON; async load, never blocks boot (set "0" to disable)
  return { active, step, draw, wallImpact, carImpact, status, setEnabled, reset, burst, positions, registerFurniture, tyreMarble };
}

// The one call game.js guards everything with. Plain boolean read — the whole
// module costs exactly this when disabled.
function active() { return _active; }

// ── world lifecycle ─────────────────────────────────────────────────────────
function destroyWorld() {
  if (_events) { try { _events.free(); } catch (e) {} }
  if (world) { try { world.free(); } catch (e) {} }
  world = null; _worldTrack = null; _mirrors = []; _slots = []; _queue.length = 0;
  _events = null; _colliderCar = null; _furnHandles = null;
  _marbles = []; _marbleCap = 0; _furn = []; _furnBuilt = false;
  _carForce = []; _spallCool = []; _forceBuf.length = 0; _lastForce = 0;
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
  // A1: one reusable event queue (autoDrain). Passing it to world.step does not
  // change the sim, so determinism holds. Per-car force accumulators + spall
  // cooldowns are sized to the field and zeroed here.
  _events = new RAPIER.EventQueue(true);
  _colliderCar = new Map();
  _furnHandles = new Set();
  _carForce = new Array(cars.length).fill(0);
  _spallCool = new Array(cars.length).fill(0);
  // Road trimesh — the raw {pos,nrm,idx} geometry tracks.js keeps on the track
  // object. FIX_INTERNAL_EDGES suppresses ghost bumps on the tessellated road
  // (the spike's collider setup, spike/physics/rapier-eval.mjs).
  const geo = track.roadGeo;
  if (geo && geo.pos && geo.idx) {
    const roadBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(
      RAPIER.ColliderDesc.trimesh(
        new Float32Array(geo.pos), new Uint32Array(geo.idx),
        RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES).setFriction(1.0),
      roadBody);
  }
  // Kinematic car mirrors, one per car in cars[] order (order IS the
  // determinism contract — fixed insertion order, fixed handles).
  _mirrors = [];
  for (let i = 0; i < cars.length; i++) {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    const col = world.createCollider(
      RAPIER.ColliderDesc.cuboid(MIRROR_HX, MIRROR_HY, MIRROR_HZ).setFriction(0.8), body);
    // A1: solved contact force reported for this mirror's contacts with dynamic
    // bodies (debris / A3 cones). Gate out gentle rubbing with a force threshold.
    col.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS);
    col.setContactForceEventThreshold(FORCE_MIN);
    _colliderCar.set(col.handle, i);   // handle → cars[] index (stable order)
    _mirrors.push(body);
  }
  // Fixed debris pool: bodies are created ONCE (deterministic construction),
  // disabled while pooled, re-posed + re-enabled on spawn. Per-slot shard size
  // is seeded by slot index: 0.06–0.25 m cuboids (endplate shard scale).
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
    // scale maps the shared ~0.2 m shard mesh onto this slot's collider size
    _slots.push({ body, live: false, scale: (hx + hz) * 5.0, restT: 0, spawnTick: 0 });
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
      _furn.push({ body, s: f.s, x: f.x });
    }
    _furnBuilt = _furn.length > 0;
  }
  _worldTrack = track;
}

// Derive a ≤cap near-apex cone list from the loaded circuit's curated turn
// apexes (track.def.turns — the same source signBoard uses in tracks.js). Stored
// regardless of active state so it's ready when the async rapier load finishes;
// a cheap pure function (no Rapier), safe to call when disabled.
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
  // If a world is already live for this exact track but has no furniture yet,
  // rebuild it on the next step so the cones appear.
  if (world && _worldTrack === track && !_furnBuilt) destroyWorld();
}

// Full deterministic reset: tear the world down (it is rebuilt from scratch on
// the next step, with identical body insertion order) and zero every counter,
// so two identical input episodes produce identical debris. Used by tests via
// __apex.debris({reset:true}).
function reset() {
  destroyWorld();
  _tick = 0; _seq = 0; _spawnedTotal = 0; _lastImpact = null;
  _marbleSeq = 0; _furnBuilt = false; _lastForce = 0;
  // NOTE: _furnList / _furnTrack are track DATA (from registerFurniture), not
  // per-episode state — they survive reset() so the rebuilt world still gets its
  // cones. buildWorld re-creates the cone bodies deterministically.
  return status();
}

// ── game-side hooks (called from game.js, both guarded by active()) ─────────

// Barrier contact. Called at the barrier clamp site on the FIRST pinned frame
// (c.wasOnWall edge) with the pre-clamp lateral overshoot xOver (m/tick — the
// lateral speed into the wall times dt). side = ±1 (right/left wall).
function wallImpact(c, side, xOver) {
  const sev = (xOver || 0) * 60 + Math.abs(c.speed || 0) * 0.15;
  if (sev < WALL_SEV_MIN) return;
  // mi = cars[] mirror index (A1): if this car also ploughs a dynamic body the
  // same tick, the real solved force overrides the synthesised severity. carIdx
  // stays the driver number (stable shard-scatter seed — unchanged behaviour).
  const mi = G.cars ? G.cars.indexOf(c) : -1;
  _queue.push({ kind: "wall", s: c.s, x: c.x, side, sev,
                speed: Math.abs(c.speed || 0), carIdx: c.num | 0, mi });
}

// Car-car contact. Called from the (prog,x) rear-end resolution with the
// closing speed relV (m/s).
function carImpact(a, b, relV) {
  if (relV < CAR_SEV_MIN) return;
  _queue.push({ kind: "car", s: b.s, x: (a.x + b.x) * 0.5, side: a.x >= b.x ? 1 : -1,
                sev: relV, speed: Math.abs(b.speed || 0), carIdx: (a.num | 0) + (b.num | 0) });
}

// Test helper (__apex.debris({burst:n})): queue n synthetic impacts at the
// player. Deterministic (severity fixed, position from player state).
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
  // Seeded per-car throttle: ~1 marble every few hot ticks. Seed is pure game
  // state (tick, car idx, quantized slip) so two identical episodes match.
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

// Spawn ONE marble beside/behind the car, read-only from its (s,x). Seeded
// stream `r` continues from tyreMarble so the whole emission is deterministic.
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
  // A1: if this car had a REAL solved contact force this tick (a mirror
  // ploughing a dynamic body), fold it into the severity so count/energy scale
  // with the actual hit. Burst hints keep their fixed severity (the determinism
  // spec depends on it), so this only lifts wall/car/spall impacts.
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
    // velocity: mostly the car's forward motion, kicked away from the contact
    // side and up — scaled by severity, all from the seeded stream.
    const vf = imp.speed * (0.25 + r() * 0.3);
    const vs = -imp.side * (1.5 + r() * 2.5) * Math.min(1, imp.sev / 10);
    _v.x = fx * vf + rx * vs; _v.y = 1.5 + r() * 2.5; _v.z = fz * vf + rz * vs;
    b.setLinvel(_v, true);
    _v.x = (r() - 0.5) * 20; _v.y = (r() - 0.5) * 20; _v.z = (r() - 0.5) * 20;
    b.setAngvel(_v, true);
    _q.x = 0; _q.y = 0; _q.z = 0; _q.w = 1;
    b.setRotation(_q, true);
    slot.live = true; slot.restT = 0; slot.spawnTick = _tick;
    _seq++; _spawnedTotal++;
  }
  _lastImpact = { kind: imp.kind, carIdx: imp.carIdx, sev: +imp.sev.toFixed(2), tick: _tick, spawned: n };
}

// ── per-tick step (ONE call site in game.js's fixed-step update) ────────────
function step(dt) {
  const track = G.track, cars = G.cars;
  if (!track || !cars || !cars.length) { _queue.length = 0; return; }
  // Track or field change → rebuild the whole world (deterministic order).
  if (world && (_worldTrack !== track || _mirrors.length !== cars.length)) destroyWorld();
  if (!world) buildWorld(track, cars);
  if (world.timestep !== dt) world.timestep = dt;
  _tick++;
  // A1: decay per-car spall cooldowns.
  for (let i = 0; i < _spallCool.length; i++)
    if (_spallCool[i] > 0) _spallCool[i] = Math.max(0, _spallCool[i] - dt);

  // sync-in: mirror every car's pose (position from the road frame, yaw from
  // the world heading for the player / the track tangent for AI). ~0.01 ms
  // for 22 cars (DEEP-DIVE §2).
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i], m = _mirrors[i];
    Tracks.sample(track, c.s, _smp);
    const rl = Math.hypot(_smp.r[0], _smp.r[2]) || 1;
    _v.x = _smp.p[0] + _smp.r[0] / rl * c.x;
    _v.y = _smp.p[1] + 0.45;
    _v.z = _smp.p[2] + _smp.r[2] / rl * c.x;
    m.setNextKinematicTranslation(_v);
    const yaw = (c.isPlayer && c.head != null) ? c.head : Math.atan2(_smp.t[0], _smp.t[2]);
    _q.x = 0; _q.y = Math.sin(yaw / 2); _q.z = 0; _q.w = Math.cos(yaw / 2);
    m.setNextKinematicRotation(_q);
  }

  // consume queued impacts → spawn pooled shards. Remember which mirror indices
  // were hinted this tick so an A1 spall doesn't double-spawn for the same car.
  _hinted.clear();
  if (_queue.length) {
    for (const imp of _queue) {
      spawnImpact(imp, track);
      if (imp.mi != null && imp.mi >= 0) _hinted.add(imp.mi);
    }
    _queue.length = 0;
  }

  // A1: step WITH the event queue — this does NOT change the simulation, so
  // debris positions stay bit-identical (determinism preserved).
  world.step(_events);

  // bookkeeping: rest + distance despawn back into the pool
  const p = G.player;
  let px = 0, pz = 0;
  if (p && p.px != null) { px = p.px; pz = p.pz; }
  else if (p) { Tracks.sample(track, p.s, _smp); px = _smp.p[0]; pz = _smp.p[2]; }
  for (const s of _slots) {
    if (!s.live) continue;
    const b = s.body;
    if (b.isSleeping()) { s.restT += dt; } else { s.restT = 0; }
    let far = false;
    if (p) {
      const t = b.translation();
      const dx = t.x - px, dz = t.z - pz;
      far = dx * dx + dz * dz > FAR_DESPAWN_M * FAR_DESPAWN_M;
    }
    if (s.restT > REST_DESPAWN_S || far) { b.setEnabled(false); s.live = false; }
  }
  // A2: marbles despawn on a LONGER rest (they should linger as off-line
  // texture) or far distance — same pool discipline as debris.
  for (const s of _marbles) {
    if (!s.live) continue;
    const b = s.body;
    if (b.isSleeping()) { s.restT += dt; } else { s.restT = 0; }
    let far = false;
    if (p) {
      const t = b.translation();
      const dx = t.x - px, dz = t.z - pz;
      far = dx * dx + dz * dz > FAR_DESPAWN_M * FAR_DESPAWN_M;
    }
    if (s.restT > MARBLE_REST_DESPAWN_S || far) { b.setEnabled(false); s.live = false; }
  }

  // A1: drain the tick's contact-force events, canonicalise the order, and fold
  // real force per car (mirror↔dynamic contacts only).
  drainForces(cars);

  // A1: a mirror ploughing a dynamic body (e.g. clipping an A3 cone) hard with
  // NO queued hint still throws a bounded, seeded spall burst next tick.
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
}

// A1: drain contact-force events into a scratch buffer, SORT deterministically
// (Rapier's drain order is not guaranteed) by (min handle, max handle, quantized
// force), then fold each event's force into the car whose mirror was involved.
function drainForces(cars) {
  for (let i = 0; i < _carForce.length; i++) _carForce[i] = 0;
  if (_carForce.length !== cars.length) {
    _carForce = new Array(cars.length).fill(0);
    _spallCool = new Array(cars.length).fill(0);
  }
  _forceBuf.length = 0;
  if (!_events) { _lastForce = 0; return; }
  _events.drainContactForceEvents((e) => {
    _forceBuf.push({ h1: e.collider1(), h2: e.collider2(),
                     f: e.totalForceMagnitude() });
  });
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
    if (ev.f > lf) lf = ev.f;
  }
  _lastForce = +lf.toFixed(2);
}

// ── render (ONE guarded call in game.js's render loop, after the cars) ──────
let _shardMesh = null, _marbleMesh = null, _coneMesh = null;
const _drawOpts = { roughness: 0.6, metalness: 0.2, specular: 0.35 };
const _marbleOpts = { roughness: 0.9, metalness: 0.0, specular: 0.1 };
const _coneOpts = { roughness: 0.55, metalness: 0.0, specular: 0.3, emissive: 0.08 };

function shardMesh() {
  if (_shardMesh) return _shardMesh;
  // A small carbon-shard cluster around the origin (~0.2 m across at scale 1);
  // one mesh shared by every debris body, drawn per-instance with its own
  // matrix. TrackGeom.addBox emits {pos,nrm,col,idx} — the createMesh contract
  // on both GLX and TLX.
  const out = { pos: [], nrm: [], col: [], idx: [] };
  TrackGeom.addBox(out, [0, 0, 0], [0.20, 0.02, 0.13], [0.05, 0.05, 0.06]);        // carbon plate
  TrackGeom.addBox(out, [0.05, 0.02, -0.03], [0.07, 0.05, 0.08], [0.30, 0.31, 0.33]); // metal chunk
  TrackGeom.addBox(out, [-0.05, 0.01, 0.04], [0.13, 0.015, 0.03], [0.11, 0.11, 0.12]); // sliver
  _shardMesh = G.gfx.createMesh(out);
  return _shardMesh;
}
function marbleMesh() {
  if (_marbleMesh) return _marbleMesh;
  // A single tiny dark-rubber cube (~MARBLE_REF_SCALE half-extent); per-body
  // scale maps it onto each marble's collider size.
  const out = { pos: [], nrm: [], col: [], idx: [] };
  TrackGeom.addBox(out, [0, 0, 0], [MARBLE_REF_SCALE, MARBLE_REF_SCALE * 0.7, MARBLE_REF_SCALE], [0.04, 0.04, 0.045]);
  _marbleMesh = G.gfx.createMesh(out);
  return _marbleMesh;
}
function coneMesh() {
  if (_coneMesh) return _coneMesh;
  // An orange marshalling cone centred on the origin (base at -CONE_HY so the
  // mesh centroid lines up with the cuboid collider's centre). Drawn per-body
  // with the Rapier transform, no per-body scale (scale 1).
  const out = { pos: [], nrm: [], col: [], idx: [] };
  TrackGeom.addBox(out, [0, -CONE_HY + 0.02, 0], [0.13, 0.02, 0.13], [0.9, 0.35, 0.05]); // base
  TrackGeom.addCone(out, [0, -CONE_HY + 0.04, 0], 0.10, CONE_HY * 1.9, [0.95, 0.42, 0.08], 10); // body
  _coneMesh = G.gfx.createMesh(out);
  return _coneMesh;
}

// Draw one Rapier body's mesh: quaternion → column-major rotation, uniformly
// scaled by `sc`, translated to the body position.
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
}

// ── status (for __apex.debris and tests) ────────────────────────────────────
function liveCount() { let n = 0; for (const s of _slots) if (s.live) n++; return n; }
function marbleCount() { let n = 0; for (const s of _marbles) if (s.live) n++; return n; }
// Flat [x,y,z,qx,qy,qz,qw] per body — impact debris FIRST (unchanged order, so
// the determinism spec still matches element-for-element), then marbles, then
// furniture. Every source is deterministic for a fixed seeded episode.
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
    lastImpact: _lastImpact,
    // ── Group A extras: SEPARATE fields (never folded into live/cap) ──
    marbles: marbleCount(),     // live A2 marbles
    marbleCap: _marbleCap || marbleCapFor(),
    furniture: _furn.length,    // A3 cone bodies in the current world
    furnCount: _furnList ? _furnList.length : 0,
    lastForce: _lastForce,      // max real solved contact force last tick (A1)
  };
}

return { create, active, step, draw, wallImpact, carImpact, status, setEnabled, reset, burst, positions, registerFurniture, tyreMarble };
})();
