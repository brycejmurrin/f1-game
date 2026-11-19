var Damage = (function () {
  "use strict";

  const LCAR = 4.8, WCAR = 2.0;
  const GAIN = 0.7;
  const COOL_S = 0.35;
  const KNOCK_SEV = 0.55;
  const WALL_MIN = 0.08;
  const SHOW = 0.15;
  const ZONE_FRONT = 0, ZONE_REAR = 1, ZONE_SIDE = 2;
  const W = [
    [1.0, 0.35, 0.0, 0.2],
    [0.0, 0.0, 1.0, 0.45],
    [0.45, 0.0, 0.15, 0.6],
  ];

  const recs = new WeakMap();

  function blank() {
    const r = { fwL: 0, fwR: 0, rw: 0, floor: 0, knock: 0, hits: 0, cool: 0, onWall: false, served: false, spd: 0, yaw: 0 };
    r.fwL = r.fwR = r.rw = r.floor = r.cool = r.spd = r.yaw = 0.5; r.fwL = r.fwR = r.rw = r.floor = r.cool = r.spd = r.yaw = 0;
    return r;
  }
  function rec(c) {
    let r = recs.get(c);
    if (!r) { r = blank(); recs.set(c, r); }
    return r;
  }

  function zoneOf(long, lat) {
    if (Math.abs(long) / LCAR >= Math.abs(lat) / WCAR) return long >= 0 ? ZONE_FRONT : ZONE_REAR;
    return ZONE_SIDE;
  }

  function apply(r, long, lat, sev) {
    if (!(sev > 0)) return r;
    sev = Math.min(1, sev);
    const z = zoneOf(long, lat), w = W[z], right = lat > 0;
    const near = sev * w[0] * GAIN, far = sev * w[1] * GAIN;
    r.fwL = Math.min(1, r.fwL + (right ? far : near));
    r.fwR = Math.min(1, r.fwR + (right ? near : far));
    r.rw = Math.min(1, r.rw + sev * w[2] * GAIN);
    r.floor = Math.min(1, r.floor + sev * w[3] * GAIN);
    if (z !== ZONE_REAR && sev >= KNOCK_SEV) r.knock = 1;
    r.hits++;
    return r;
  }

  function hitAt(c, dLong, dLat, sev) {
    const r = rec(c);
    if (r.cool > 0) return;
    const y = c.yawVis || 0, cs = Math.cos(y), sn = Math.sin(y);
    apply(r, dLong * cs + dLat * sn, -dLong * sn + dLat * cs, sev);
    r.cool = COOL_S;
  }

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

  function observe(c, dt, vTop) {
    const r = rec(c);
    if (r.cool > 0) r.cool = Math.max(0, r.cool - dt);
    const served = (c.pitOutT || 0) > 0;
    if (served && !r.served) reset(c);
    r.served = served;
    const on = !!c.wasOnWall;
    const spd = c.speed || 0;
    const yaw = c.yawVis || 0;
    if (on && !r.onWall) {
      const side = (c.x || 0) >= 0 ? 1 : -1;
      const inc = Math.min(1, Math.abs(Math.sin(yaw)));
      const sev = Math.min(1, Math.abs(spd) / Math.max(1, vTop || 1) * (0.25 + 0.75 * inc) * 1.6);
      if (sev >= WALL_MIN && r.cool <= 0) {
        if (inc > 0.3) apply(r, LCAR, side * WCAR * 0.4, sev);
        else apply(r, 0, side * WCAR, sev);
        r.cool = COOL_S;
      }
    }
    r.onWall = on;
    r.spd = spd;
    r.yaw = yaw;
  }

  function reset(c) {
    const r = rec(c);
    r.fwL = r.fwR = r.rw = r.floor = 0; r.knock = 0; r.hits = 0; r.cool = 0;
  }

  function get(c) { return c ? rec(c) : null; }
  function worst(r) { return r ? Math.max(r.fwL, r.fwR, r.rw, r.floor, r.knock ? 0.5 : 0) : 0; }
  function state(c) {
    if (!c) return null;
    const r = rec(c);
    return { fwL: r.fwL, fwR: r.fwR, rw: r.rw, floor: r.floor, knock: r.knock, hits: r.hits, worst: worst(r), shown: worst(r) > SHOW };
  }

  return Object.freeze({ contact, observe, reset, get, state, worst, zoneOf, apply, blank, SHOW, ZONE_FRONT, ZONE_REAR, ZONE_SIDE });
})();
