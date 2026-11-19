const CarFx = (function () {
  "use strict";

  const SPARK_V0 = 35;
  const SPARK_V1 = 60;
  const SPARK_RATE = 110;
  const PITCH_END = 0.004;
  const LOCK_MIN = 0.3;
  const LOCK_V = 8;
  const HAZE_RANGE = 40;
  const HAZE_TAU = 0.1;
  const HAZE_V = 8;
  const HAZE_MIN = 0.02;

  function heatHaze(vStd) {
    const world = [0, 0, 0], out = { u: 0, v: 0, str: 0 };
    let anchor = null, str = 0, marked = false;
    function heat(c) {
      if (!c || !c.wasOnThrottle || c.retired || !(vStd(c.speed || 0) > HAZE_V)) return 0;
      const K = PhysicsConsts, rev = Math.min(1, Math.max(0, ((c.rpm || 0) - K.IDLE_RPM) / (K.MAX_RPM - K.IDLE_RPM)));
      return (c.deploying ? 1 : 0.45) * (0.5 + 0.5 * rev);
    }
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
          if (ds < 0) ds += total;
          if (ds > 0 && ds <= best) { best = ds; want = c; }
        }
      }
      if (want !== anchor && (!anchor || str < HAZE_MIN)) anchor = want;
      const target = anchor && anchor === want ? heat(anchor) : 0;
      if (dt > 0) str += (target - str) * (1 - Math.exp(-dt / HAZE_TAU));
      if (target === 0 && str < HAZE_MIN) str = 0;
      return anchor;
    }
    function mark(c, m) {
      if (c !== anchor || !(str > HAZE_MIN)) return;
      for (let i = 0; i < 3; i++) world[i] = m[12 + i] + m[4 + i] * 0.85 - m[8 + i] * 3.5;
      marked = true;
    }
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
    const timers = new WeakMap();
    const stats = { sparks: 0, marks: 0 };
    const vStd = (v) => v * PhysicsConsts.VMAX / G.vTop();
    const haze = heatHaze(vStd);

    function plank(c, g, dt) {
      const scrape = c.baScrape || 0;
      if (!(scrape > 0) || !P || !P.scrape) return;
      const v = vStd(c.speed || 0);
      if (!(v > SPARK_V0)) return;
      const k = scrape * Math.min(1, (v - SPARK_V0) / (SPARK_V1 - SPARK_V0));
      const p = c.baPitch || 0;
      const z = p > PITCH_END ? 1.0 : p < -PITCH_END ? -1.6 : -0.3;
      const sp = c.speed;
      P.scrape(g[12] + g[8] * z, g[13] + g[9] * z + 0.02, g[14] + g[10] * z,
        g[8] * sp, g[10] * sp, dt * SPARK_RATE * k);
      stats.sparks++;
    }

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

    function emit(c, g, dt, state) {
      if (!c || !g || !(dt > 0)) return;
      plank(c, g, dt);
    }

    function marks(c, g, dt, state) {
      if (!c || !g || !(dt > 0)) return;
      if (state === "race" && !c.isPlayer && skids && skids.stampFor) aiMarks(c, g, dt);
    }

    function status() { return { sparks: stats.sparks, marks: stats.marks }; }

    return { emit, marks, status, haze };
  }

  return { create, SPARK_V0, SPARK_V1, SPARK_RATE, HAZE_RANGE };
})();
Object.freeze(CarFx);
