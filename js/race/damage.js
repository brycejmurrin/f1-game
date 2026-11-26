/* Apex 26 — DAMAGE: a per-car damage READOUT derived from the impacts the game
 * already resolves (car-to-car contact through game.js collideFx, barrier
 * strikes through WallClamp's first-frame pin).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DISPLAY ONLY. NOTHING IN PHYSICS, AI OR RACE CONTROL MAY READ THIS.      │
 * │                                                                          │
 * │ This module records what a hit WOULD have broken so the HUD can draw it  │
 * │ (js/ui/hud-damage.js) and __apex.damage() can report it. It never        │
 * │ writes a car field and no driving, AI, pit-strategy or race-control      │
 * │ module reads it: a car with a "broken" front wing drives exactly like    │
 * │ one without. tests/unit/damage.test.mjs greps js/physics/, the AI and    │
 * │ race-control files and fails on any reference to `Damage`.               │
 * │                                                                          │
 * │ The one exception is the explicit, setting-gated DAMAGE → HANDLING       │
 * │ option (#1578, default OFF): js/race/damage-handling.js reads the record │
 * │ and hands PlayerForces axle factors as ctx.damage (null when OFF).       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Parts, each 0..1: fwL / fwR (front wing halves), rw (rear wing), floor; and
 * knock (0|1), a suspension knock from one hard side/front hit.
 *
 * Location: the other car's offset in TRACK coordinates (prog along, x
 * lateral, +right) rotated into the car's own frame by its visual nose yaw
 * (yawVis, + = nose right), then classified front / rear / side against the
 * car's box. A wall strike is a side scrape, or a front-corner hit on the wall
 * side when the nose went in steeply.
 *
 * Deterministic and allocation-free per frame: one record per car, made the
 * first time the car is seen, held in a WeakMap (no field on the car object).
 * Reset by game.js gridUp (a new race) and on a completed pit stop (PitLane's
 * release() sets pitOutT; observe() repairs on that edge).
 */
var Damage = (function () {
  "use strict";

  const LCAR = 4.8, WCAR = 2.0;    // car box (same numbers as js/physics/collide.js; copied, not read)
  const GAIN = 0.7;                // share of a hit's severity that lands on a weight-1 part
  const COOL_S = 0.35;             // one shunt = one hit (collideFx fires once per step while in contact)
  const RUB_PER_S = 0.1;           // a contact that goes on books its severity at this rate per second (#6546 P2: it re-booked every COOL_S)
  const KNOCK_SEV = 0.55;          // a single side/front hit this hard knocks the suspension
  const WALL_MIN = 0.08;           // a wall touch below this severity is a kiss, not damage
  const SHOW = 0.15;               // the HUD chip appears when any part passes this
  const ZONE_FRONT = 0, ZONE_REAR = 1, ZONE_SIDE = 2;
  // [near front-wing half, far half, rear wing, floor] per zone.
  const W = [
    [1.0, 0.35, 0.0, 0.2],   // front
    [0.0, 0.0, 1.0, 0.45],   // rear
    [0.45, 0.0, 0.15, 0.6],  // side
  ];

  const recs = new WeakMap();

  function blank() {
    const r = { fwL: 0, fwR: 0, rw: 0, floor: 0, knock: 0, hits: 0, cool: 0, last: 0, onWall: false, served: false, spd: 0, yaw: 0 };
    // Born Double, values kept: the 0s are Smi fields, and the first hit split every record's map (PERF-HUNT-5).
    r.fwL = r.fwR = r.rw = r.floor = r.cool = r.last = r.spd = r.yaw = 0.5; r.fwL = r.fwR = r.rw = r.floor = r.cool = r.last = r.spd = r.yaw = 0;
    return r;
  }
  function rec(c) {
    let r = recs.get(c);
    if (!r) { r = blank(); recs.set(c, r); }
    return r;
  }

  /** Which part of the car a point at (long, lat) — car frame, metres, +long
   *  forward, +lat right — touches. Returns ZONE_* (side sign: lat). */
  function zoneOf(long, lat) {
    if (Math.abs(long) / LCAR >= Math.abs(lat) / WCAR) return long >= 0 ? ZONE_FRONT : ZONE_REAR;
    return ZONE_SIDE;
  }

  /** Book one hit of severity `sev` (0..1) at car-frame (long, lat). Pure in
   *  `r`; exported for the unit test. `knockSev` is the whole hit's severity
   *  when `sev` is only part of it (default `sev`); `count` false books damage
   *  without a new hit (a continuing rub). */
  function apply(r, long, lat, sev, knockSev, count) {
    if (!(sev > 0)) return r;
    sev = Math.min(1, sev);
    if (knockSev === undefined) knockSev = sev;
    const z = zoneOf(long, lat), w = W[z], right = lat > 0;
    const near = sev * w[0] * GAIN, far = sev * w[1] * GAIN;
    r.fwL = Math.min(1, r.fwL + (right ? far : near));
    r.fwR = Math.min(1, r.fwR + (right ? near : far));
    r.rw = Math.min(1, r.rw + sev * w[2] * GAIN);
    r.floor = Math.min(1, r.floor + sev * w[3] * GAIN);
    if (z !== ZONE_REAR && knockSev >= KNOCK_SEV) r.knock = 1;
    if (count !== false) r.hits++;
    return r;
  }

  // Rotate a track-frame offset into the car frame by its nose yaw ψ (+ right).
  // Inside the cool-down a contact is the same shunt going on (#6546 P2): a
  // harder one books only its excess over the last booked severity, so a rub
  // no longer swallows the shunt after it; a softer or equal one is a rub and
  // books at RUB_PER_S for the time since the last contact, so a long rub no
  // longer re-books a whole hit every COOL_S. Each contact re-arms the cool.
  function hitAt(c, dLong, dLat, sev) {
    if (!(sev > 0)) return;
    sev = Math.min(1, sev);
    const r = rec(c);
    const y = c.yawVis || 0, cs = Math.cos(y), sn = Math.sin(y);
    const long = dLong * cs + dLat * sn, lat = -dLong * sn + dLat * cs;
    if (r.cool <= 0) { apply(r, long, lat, sev); r.last = sev; }
    else if (sev > r.last) { apply(r, long, lat, sev - r.last, sev); r.last = sev; }
    else apply(r, long, lat, sev * RUB_PER_S * (COOL_S - r.cool), 0, false);
    r.cool = COOL_S;
  }

  /** Car-to-car contact: game.js collideFx(a, b, impact, lapLen), every pair,
   *  before its player-only early-out. `prog` is race distance, so a car
   *  lapping a backmarker is ~a lap apart: wrap to the nearest lap. */
  function contact(a, b, impact, lapLen) {
    if (!a || !b) return;
    const pa = Number.isFinite(a.prog) ? a.prog : a.s || 0;
    const pb = Number.isFinite(b.prog) ? b.prog : b.s || 0;
    let dl = pb - pa;
    if (lapLen > 0) dl -= Math.round(dl / lapLen) * lapLen;
    const dx = (b.x || 0) - (a.x || 0);
    hitAt(a, dl, dx, impact);
    hitAt(b, -dl, -dx, impact);
  }

  /** Once per car per step, after WallClamp.apply (game.js updateCar). Decays
   *  the debounce, books a barrier strike on the pin's rising edge, repairs on
   *  a completed stop. `vTop` is the car's top speed for this pace (vTop()). */
  function observe(c, dt, vTop) {
    const r = rec(c);
    if (r.cool > 0) r.cool = Math.max(0, r.cool - dt);
    const served = (c.pitOutT || 0) > 0;
    if (served && !r.served) reset(c);
    r.served = served;
    const on = !!c.wasOnWall;
    // Severity from THIS frame's speed/yaw — the pin's rising edge is the
    // impact. Reading the prior-frame cache booked accel-into-wall as a kiss
    // (sev 0) and a decel-to-touch as a hard hit.
    const spd = c.speed || 0;
    const yaw = c.yawVis || 0;
    if (on && !r.onWall) {
      const side = (c.x || 0) >= 0 ? 1 : -1;
      const inc = Math.min(1, Math.abs(Math.sin(yaw)));
      const sev = Math.min(1, Math.abs(spd) / Math.max(1, vTop || 1) * (0.25 + 0.75 * inc) * 1.6);
      // Inside a cool-down (a car contact or an earlier strike) the same rule
      // as hitAt (#6715): a harder strike books its excess over the last
      // booked severity (knock reads the whole strike); a softer one books
      // nothing and, as before, leaves the cool alone. A booked one re-arms it.
      if (sev >= WALL_MIN && (r.cool <= 0 || sev > r.last)) {
        const part = r.cool <= 0 ? sev : sev - r.last;
        // Steep nose-in: the front corner on the wall side; else a side scrape.
        if (inc > 0.3) apply(r, LCAR, side * WCAR * 0.4, part, sev);
        else apply(r, 0, side * WCAR, part, sev);
        r.cool = COOL_S; r.last = sev;
      }
    }
    r.onWall = on;
    r.spd = spd;
    r.yaw = yaw;
  }

  function reset(c) {
    const r = rec(c);
    r.fwL = r.fwR = r.rw = r.floor = 0; r.knock = 0; r.hits = 0; r.cool = 0; r.last = 0;
  }

  /** The live record (do not mutate): the HUD reads this every frame. */
  function get(c) { return c ? rec(c) : null; }
  function worst(r) { return r ? Math.max(r.fwL, r.fwR, r.rw, r.floor, r.knock ? 0.5 : 0) : 0; }
  /** A copy for __apex / tests. */
  function state(c) {
    if (!c) return null;
    const r = rec(c);
    return { fwL: r.fwL, fwR: r.fwR, rw: r.rw, floor: r.floor, knock: r.knock, hits: r.hits, worst: worst(r), shown: worst(r) > SHOW };
  }

  /** The whole record as plain data, or null for a car never seen: what a
   *  practice rewind or retry must put back (#6862 P2). The record lives in
   *  this module's WeakMap, not on the car, so the car sweep cannot see it. */
  function snapshot(c) {
    const r = c ? recs.get(c) : null;
    return r ? Object.assign({}, r) : null;
  }
  /** Put a snapshot() back; null restores the car to undamaged. */
  function restore(c, s) {
    if (!c) return;
    const r = rec(c);
    Object.assign(r, blank(), s || {});
  }
  // Registered with the SimState registry (js/core/sim-state.js, #6860), which
  // loads before this file in LAZY_RACE_SESSION. Index-keyed like the car part,
  // and ordered after it. A restore is not a game read: nothing in physics
  // gains a reference to this module.
  if (typeof SimState !== "undefined") SimState.register("damage", {
    order: 10,
    capture: (G) => (G.cars || []).map(snapshot),
    restore: (d, G) => { const cars = G.cars || []; for (let i = 0; i < cars.length && i < d.length; i++) restore(cars[i], d[i]); },
    clear: (G) => { for (const c of G.cars || []) if (recs.has(c)) restore(c, null); },
  });

  return Object.freeze({ contact, observe, reset, get, state, worst, zoneOf, apply, blank, snapshot, restore, SHOW, ZONE_FRONT, ZONE_REAR, ZONE_SIDE });
})();
