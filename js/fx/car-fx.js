/* Apex 26 — CarFx: per-car motion effects js/game.js's render loop asks for once a car's grounded basis is built — the PLANK SPARKS a car throws when its floor bottoms out, and an AI car's LOCK-UP MARKS.
 *
 * Visual only: it READS car state and writes none of it. The plank's input is
 * c.baScrape — js/physics/body-attitude.js's measure of how far dive, heave
 * compression and the aero ride-height drop pushed the floor past the point
 * where the skid blocks rub — gated on the car's speed as a fraction of its
 * envelope (vStd: PACE scales ground speed, so "fast enough to spark" is a
 * share of top speed, not a raw m/s). The embers come out where the floor is
 * lowest: the nose on a brake dive, the tail on a squat, the middle in a
 * compression (Particles.scrape, which refuses past 60 % of the pool).
 *
 * The lock-up marks: until 2026-10-02 only the player stamped tyre marks, so an
 * AI's lock-up (c.wheelLock, AiDrive's mistake phase) smoked and froze its
 * fronts but left the road clean. Each AI car gets its own stamp cadence
 * (SkidMarks.stampFor, the player's 5/60 s), and other cars may hold at most
 * SkidMarks.AI_CAP slots of the shared ring.
 *
 * The EXHAUST HEAT HAZE (heatHaze, below): the composite post's ONE plume
 * anchor, {u, v, str}, picked here so the GLX / TLX / WGX post shaders take
 * the same opts.haze they always did.
 *
 * The embers scatter on Math.random (inside Particles): fine, no physics path
 * reads it (the sim is seeded). Pitch sign: c.baPitch > 0 is a dive.
 * One CarFx.create(G, { skids }) at game.js eval; emit() per car per frame. */
const CarFx = (function () {
  "use strict";

  const SPARK_V0 = 35;        // vStd m/s: no sparks below ~49 % of top speed…
  const SPARK_V1 = 60;        // …full shower from ~83 %
  const SPARK_RATE = 110;     // embers per second at a full scrape
  const PITCH_END = 0.004;    // rad: past this the floor's END is its lowest point
  const LOCK_MIN = 0.3;       // c.wheelLock that reads as a locked front (game.js's smoke gate)
  const LOCK_V = 8;           // vStd m/s floor for a mark (the lock-up smoke's)
  const HAZE_RANGE = 40;      // m of track ahead an onboard eye looks for a car on power
  const HAZE_TAU = 0.1;       // s: attack and release, 95 % of the way in ~0.3 s
  const HAZE_V = 8;           // vStd m/s: slower is parked or crawling, not on power
  const HAZE_MIN = 0.02;      // below this the plume is off (and the anchor may move)

  // EXHAUST HEAT HAZE. It read c.exhaustPop, the ~0.2 s after-fire pulse on a
  // throttle LIFT, so it flickered at each lift-off and never showed under
  // power; and in an onboard camera (cockpit, the default) the player's
  // tailpipe is behind the eye. Now: a SUSTAINED on-power signal (wasOnThrottle
  // — every car's; an AI's is "not braking"), scaled by revs and ERS deploy,
  // eased in and out; from an onboard eye the anchor is the nearest car AHEAD
  // on power within HAZE_RANGE. One anchor, so the post shaders are unchanged,
  // and a new car takes it only once the old plume has faded (no jump).
  // Visual only: reads car state, writes none (no physics path reads this).
  function heatHaze(vStd) {
    const world = [0, 0, 0], out = { u: 0, v: 0, str: 0 };
    let anchor = null, str = 0, marked = false;
    // The plume this car would raise: 0 off power, 0.45 x revs on it, 1 x revs deploying.
    function heat(c) {
      if (!c || !c.wasOnThrottle || c.retired || !(vStd(c.speed || 0) > HAZE_V)) return 0;
      const K = PhysicsConsts, rev = Math.min(1, Math.max(0, ((c.rpm || 0) - K.IDLE_RPM) / (K.MAX_RPM - K.IDLE_RPM)));
      return (c.deploying ? 1 : 0.45) * (0.5 + 0.5 * rev);
    }
    // Before the draw loop, once a frame: choose the anchor and ease its strength.
    // `onboard`: the eye rides the player's car; `total`: the lap's arc length.
    function pick(cars, player, onboard, total, dt) {
      marked = false;
      let want = player || null;
      if (onboard && player) {
        want = null;
        let best = HAZE_RANGE;
        for (let i = 0; i < cars.length; i++) {
          const c = cars[i];
          if (c === player || !(heat(c) > 0)) continue;
          let ds = c.s - player.s;
          if (ds < 0) ds += total;   // the lap wraps: a car just past the line is still ahead
          if (ds > 0 && ds <= best) { best = ds; want = c; }
        }
      }
      if (want !== anchor && (!anchor || str < HAZE_MIN)) anchor = want;
      const target = anchor && anchor === want ? heat(anchor) : 0;
      if (dt > 0) str += (target - str) * (1 - Math.exp(-dt / HAZE_TAU));
      if (target === 0 && str < HAZE_MIN) str = 0;   // faded: at() draws nothing below it anyway
      return anchor;
    }
    // In the draw loop: the anchor's body matrix (column-major R, U, F, origin).
    // Up 0.85, back 3.5 m: the plume hangs in the wake, not on the rear wing.
    function mark(c, m) {
      if (c !== anchor || !(str > HAZE_MIN)) return;
      for (let i = 0; i < 3; i++) world[i] = m[12 + i] + m[4 + i] * 0.85 - m[8 + i] * 3.5;
      marked = true;
    }
    // Before present: the frame's view-proj -> {u, v, str} for opts.haze, or null.
    // Near-field only: fades out past ~45 m so TV/orbit long shots stay clean.
    function at(m) {
      if (!marked || !(str > HAZE_MIN)) return null;
      const hx = world[0], hy = world[1], hz = world[2];
      const cw = m[3] * hx + m[7] * hy + m[11] * hz + m[15];
      if (!(cw > 0.1)) return null;
      const u = (m[0] * hx + m[4] * hy + m[8] * hz + m[12]) / cw * 0.5 + 0.5;
      const v = (m[1] * hx + m[5] * hy + m[9] * hz + m[13]) / cw * 0.5 + 0.5;
      if (!(u > -0.2 && u < 1.2 && v > -0.2 && v < 1.2)) return null;
      out.u = u; out.v = v; out.str = str * Math.min(1, Math.max(0, 1.4 - cw / 40));
      return out.str > HAZE_MIN ? out : null;
    }
    return { pick, mark, at, heat, state: () => ({ anchor, str, marked }) };
  }

  function create(G, deps) {
    Log.info("game", "CarFx.create");
    const skids = (deps && deps.skids) || null;
    const P = (deps && deps.Particles) || (typeof Particles !== "undefined" ? Particles : null);
    const timers = new WeakMap();   // car → { t } stamp cadence (SkidMarks.stampFor)
    const stats = { sparks: 0, marks: 0 };
    const vStd = (v) => v * PhysicsConsts.VMAX / G.vTop();
    const haze = heatHaze(vStd);   // game.js: pick() before the car loop, mark() per car, at() before present

    // Embers from the plank: `g` is the car's grounded basis (column-major:
    // right 0-2, up 4-6, forward 8-10, origin 12-14 on the road).
    function plank(c, g, dt) {
      const scrape = c.baScrape || 0;
      if (!(scrape > 0) || !P || !P.scrape) return;
      const v = vStd(c.speed || 0);
      if (!(v > SPARK_V0)) return;
      const k = scrape * Math.min(1, (v - SPARK_V0) / (SPARK_V1 - SPARK_V0));
      const p = c.baPitch || 0;
      const z = p > PITCH_END ? 1.0 : p < -PITCH_END ? -1.6 : -0.3;   // c.baPitch > 0 is a dive
      const sp = c.speed;
      P.scrape(g[12] + g[8] * z, g[13] + g[9] * z + 0.02, g[14] + g[10] * z,
        g[8] * sp, g[10] * sp, dt * SPARK_RATE * k);
      stats.sparks++;
    }

    // An AI car's locked front lays marks on its own cadence.
    function aiMarks(c, g, dt) {
      const laying = !c.offroad && (c.wheelLock || 0) > LOCK_MIN && vStd(c.speed || 0) > LOCK_V;
      let t = timers.get(c);
      if (!t) {
        if (!laying) return;
        t = { t: 0 };
        timers.set(c, t);
      }
      if (skids.stampFor(t, g, laying, dt)) stats.marks++;
    }

    // Per car per frame, after its grounded basis exists and before the cockpit
    // view's `continue` (world state, not a draw). `state` is game.js's state.
    function emit(c, g, dt, state) {
      if (!c || !g || !(dt > 0)) return;
      plank(c, g, dt);
      if (state === "race" && !c.isPlayer && skids && skids.stampFor) aiMarks(c, g, dt);
    }

    function status() { return { sparks: stats.sparks, marks: stats.marks }; }

    return { emit, status, haze };
  }

  return { create, heatHaze, SPARK_V0, SPARK_V1, LOCK_MIN, HAZE_RANGE, HAZE_TAU };
})();
Object.freeze(CarFx);
