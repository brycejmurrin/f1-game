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

  function create(G, deps) {
    Log.info("game", "CarFx.create");
    const skids = (deps && deps.skids) || null;
    const P = (deps && deps.Particles) || (typeof Particles !== "undefined" ? Particles : null);
    const timers = new WeakMap();   // car → { t } stamp cadence (SkidMarks.stampFor)
    const stats = { sparks: 0, marks: 0 };
    const vStd = (v) => v * PhysicsConsts.VMAX / G.vTop();

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

    return { emit, status };
  }

  return { create, SPARK_V0, SPARK_V1, LOCK_MIN };
})();
Object.freeze(CarFx);
