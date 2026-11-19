const GarageCrewChoreo = (function () {
  "use strict";
  const { block, tube } = GaragePrims;
  const CLIPS = {"marshal":{"dir":"in","extra":1.6,"len":10.3,"label":"MARSHAL CREW"},"inspect":{"dir":"in","extra":4.2,"len":12.9,"label":"INSPECTION CREW"},"debrief":{"dir":"in","extra":3.4,"len":12.1,"label":"DEBRIEF CREW"},"sendoff":{"dir":"out","extra":0.6,"len":11.159,"label":"SEND-OFF CREW"},"pushout":{"dir":"out","extra":0,"len":10.559,"label":"PUSH-OUT CREW"},"check":{"dir":"out","extra":3.0,"len":13.559,"label":"FINAL CHECK CREW"},"pit":{"dir":"pit","extra":0,"len":2.2,"label":"PIT STOP CREW"},"celebrate":{"dir":"in","extra":2.6,"len":15.11,"label":"CELEBRATION CREW","result":"win","mix":false},"applause":{"dir":"in","extra":2.4,"len":13.52,"label":"PODIUM CREW","result":"podium","mix":false},"recover":{"dir":"in","extra":3.0,"len":17.06,"label":"RECOVERY CREW","result":"dnf","mix":false},"console":{"dir":"in","extra":3.6,"len":12.3,"label":"CONSOLATION CREW","result":"finish","mix":false}};
  const acc = GarageCrewDraw.acc;
  const place = GarageCrewDraw.place;
  const mul = GarageCrewDraw.mul;
  const CHANNELS = ["x", "z", "yaw", "walk", "crouch", "lean", "handY", "reach", "wave", "hold"];
  const IDS = { in: [], out: [], pit: [] };
  for (const id of Object.keys(CLIPS)) IDS[CLIPS[id].dir].push(id);
  const dealt = (ids) => ids.filter((id) => CLIPS[id].mix !== false);
  const MIX = { in: ["current"].concat(dealt(IDS.in), ["service"]), out: ["current"].concat(dealt(IDS.out), ["service"]) };
  function pick(dir, visit) {
    const list = MIX[dir === "out" ? "out" : "in"], n = Number.isFinite(visit) ? Math.floor(visit) : 0;
    return list[((n % list.length) + list.length) % list.length];
  }
  const known = (id) => typeof id === "string" && Object.prototype.hasOwnProperty.call(CLIPS, id);
  const keys = (id) => known(id) && typeof GarageData !== "undefined" && GarageData.CLIPS ? GarageData.CLIPS[id] || null : null;
  const has = (id) => !!keys(id);
  const extra = (id) => has(id) ? CLIPS[id].extra : 0;
  const label = (id) => known(id) ? CLIPS[id].label : "";
  function value(k, t, lin) {
    const n = k.length;
    if (!(t > k[0])) return k[1];
    if (t >= k[n - 2]) return k[n - 1];
    let i = 2;
    while (k[i] < t) i += 2;
    const f = (t - k[i - 2]) / (k[i] - k[i - 2]), e = lin ? f : (1 - Math.cos(Math.PI * f)) / 2;
    return k[i - 1] + (k[i + 1] - k[i - 1]) * e;
  }
  function actors(n = 10) {
    return Array.from({ length: n }, () => ({ x: 0, z: 0, yaw: 0, door: 1, seconds: 0, calm: false, crouch: 0, lean: 0, hipLean: 0,
      handY: .85, reach: .03, walkDistance: 0, feet: null, footYaw: null, wave: 0, hold: 0, prop: "none" }));
  }
  function sample(id, t, side = 1, out = actors(), seconds = t, calm = false) {
    const clip = keys(id);
    if (!clip) return 0;
    const s = side < 0 ? -1 : 1, list = clip.actors;
    for (let i = 0; i < list.length && i < out.length; i++) {
      const a = list[i], c = a.ch, o = out[i];
      o.x = s * value(c.x, t, a.lin); o.z = value(c.z, t, a.lin); o.yaw = s * value(c.yaw, t, a.lin);
      o.walkDistance = value(c.walk, t, a.lin);
      o.crouch = value(c.crouch, t, 0); o.lean = value(c.lean, t, 0); o.hipLean = 0;
      o.wave = calm ? 0 : value(c.wave, t, 0); o.hold = value(c.hold, t, 0);
      const w = o.wave * Math.sin(Math.PI * 2 * 1.7 * seconds + i * 1.9);
      o.handY = value(c.handY, t, 0) + 0.10 * w; o.reach = value(c.reach, t, 0) + 0.05 * w;
      o.seconds = seconds; o.calm = calm; o.prop = a.prop; o.door = 1;
    }
    return Math.min(list.length, out.length);
  }
  function createProps(gfx, stripe) {
    const GUN = [0.10, 0.10, 0.11], ALLOY = [0.62, 0.63, 0.66], RED = [0.72, 0.12, 0.08], RUBBER = [0.035, 0.035, 0.04];
    const mesh = (build) => { const a = acc(); build(a); return gfx.createMesh(a); };
    const gun = mesh((a) => {
      block(a, 0, 0, .02, .055, .07, .10, GUN);
      block(a, 0, -.09, -.03, .028, .055, .03, GUN);
      tube(a, [0, 0, .11], [0, 0, .30], .04, ALLOY, 8);
      block(a, 0, .075, 0, .03, .008, .06, stripe);
    });
    const tablet = mesh((a) => {
      block(a, 0, 0, .02, .13, .085, .012, [0.05, 0.06, 0.08]);
      block(a, 0, 0, .033, .11, .07, .002, [0.25, 0.45, 0.7]);
    });
    const base = mesh((a) => {
      for (const x of [-.17, .17]) tube(a, [x - .04, .07, 1.12], [x + .04, .07, 1.12], .07, RUBBER, 10);
      tube(a, [-.17, .07, 1.12], [.17, .07, 1.12], .02, ALLOY, 6);
      block(a, 0, .12, 1.12, .06, .06, .05, RED);
    });
    const saddle = mesh((a) => {
      block(a, 0, 0, 0, .2, .04, .09, RED);
      tube(a, [0, -.04, -.06], [0, -.14, -.16], .028, RED, 6);
    });
    const span = mesh((a) => tube(a, [0, 0, 0], [0, 1, 0], .026, ALLOY, 8));
    return { gun, tablet, base, saddle, span, m: new Float32Array(16), w: new Float32Array(16) };
  }
  function freeProps(p, gfx) {
    if (!p) return 0;
    for (const k of ["gun", "tablet", "base", "saddle", "span"]) gfx.freeMesh(p[k]);
    return 5;
  }
  function put(p, gfx, mesh, x, y, z, yaw, parent, opts) {
    const m = place(p.m, x, y, z, yaw);
    gfx.draw(mesh, parent ? mul(p.w, parent, m) : m, opts);
  }
  function spanTo(p, gfx, ox, oz, yaw, ax, ay, az, bx, by, bz, parent, opts) {
    const c = Math.cos(yaw), s = Math.sin(yaw), m = p.m;
    const x0 = ox + c * ax + s * az, z0 = oz - s * ax + c * az, x1 = ox + c * bx + s * bz, z1 = oz - s * bx + c * bz;
    const dx = x1 - x0, dy = by - ay, dz = z1 - z0, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6, h = Math.sqrt(dx * dx + dz * dz);
    const ux = h > 1e-6 ? -dz / h : 1, uz = h > 1e-6 ? dx / h : 0;
    m[0] = ux; m[1] = 0; m[2] = uz; m[3] = 0; m[4] = dx; m[5] = dy; m[6] = dz; m[7] = 0;
    m[8] = (-uz * dy) / d; m[9] = (uz * dx - ux * dz) / d; m[10] = (ux * dy) / d; m[11] = 0;
    m[12] = x0; m[13] = ay; m[14] = z0; m[15] = 1;
    gfx.draw(p.span, parent ? mul(p.w, parent, m) : m, opts);
  }
  function draw(body, props, gfx, id, t, side, seconds, calm, opts, parent = null, lift = 0) {
    const out = body.choreo || (body.choreo = actors(12)), n = sample(id, t, side, out, seconds, calm);
    body.parent = parent;
    for (let i = 0; i < n; i++) {
      const a = out[i];
      GarageCrewMotion.draw(body, gfx, a.x, a.z, a.yaw, a, i, opts);
      if (!props || a.hold < 0.5) continue;
      const c = Math.cos(a.yaw), s = Math.sin(a.yaw), hx = a.x + s * a.reach, hz = a.z + c * a.reach;
      if (a.prop === "gun") put(props, gfx, props.gun, hx, a.handY, hz, a.yaw, parent, opts);
      else if (a.prop === "jack") {
        put(props, gfx, props.base, a.x, 0, a.z, a.yaw, parent, opts);
        put(props, gfx, props.saddle, a.x + s * 1.34, 0.21 + lift, a.z + c * 1.34, a.yaw, parent, opts);
        spanTo(props, gfx, a.x, a.z, a.yaw, 0, a.handY, a.reach, 0, 0.14, 1.12, parent, opts);
      } else if (a.prop === "tablet") put(props, gfx, props.tablet, hx, a.handY, hz, a.yaw, parent, opts);
    }
    body.parent = null;
    return n;
  }
  return Object.freeze({ CLIPS, IDS, MIX, pick, known, has, extra, label, value, actors, sample, createProps, freeProps, draw, mul });
})();
