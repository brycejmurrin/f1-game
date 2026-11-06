/* Shared pit-crew draw helpers and the crew body. Motion, service, choreography,
 * the bay crew (scene-crew.js) and the arrival clock call these. */
const GarageCrewDraw = (function () {
  "use strict";
  const acc = () => ({ pos: [], nrm: [], col: [], mat: [], idx: [] });
  // Smoothstep, clamped. The arrival shutter and the service phases share it.
  const ease = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  // Yaw about Y, then an optional local X tilt. rx 0 is a prop on the bay;
  // the service jack's pump is the tilt. Column-major, written into m.
  function place(m, x, y, z, yaw, rx = 0) {
    const c = Math.cos(yaw), s = Math.sin(yaw), cx = Math.cos(rx), sx = Math.sin(rx);
    m[0] = c; m[1] = 0; m[2] = -s; m[3] = 0;
    m[4] = s * sx; m[5] = cx; m[6] = c * sx; m[7] = 0;
    m[8] = s * cx; m[9] = -sx; m[10] = c * cx; m[11] = 0;
    m[12] = x; m[13] = y; m[14] = z; m[15] = 1;
    return m;
  }
  // Parent * local. M4.mulTo, so the in-race stop does not keep a second product.
  function mul(out, a, b) { return M4.mulTo(out, a, b); }
  /* THE BODY (GarageCrewDraw.body): the pit crew's body, Blender-authored
   * (tools/gen/blender/crew-body.py). Each part is a loft of superellipse rings
   * sized from the ANSUR II male medians plus overall bulk: a one-piece team
   * overall with shoulder epaulettes, side stripes and a chest patch, a full-face
   * helmet with a chin bar and visor (F1 Sporting Regulations art. 34.13: helmet
   * and eye protection for everyone working on a car at a stop), gauntlet gloves
   * and low-cut pit shoes. Paint is by slot, so one table dresses every team.
   *
   * Part frames match GarageCrewMotion's rigid parts: the torso in standing
   * figure metres (+z forward), limbs along +y from their proximal joint (leg
   * and arm fronts are local -z), the boot about the foot target with its sole
   * 0.08 m below it, the helmet about the head centre. segment() bakes a part
   * between two joints for the posed looks (scene-crew.js). */
  // @blender-body:start
  // Blender 4.2.23 LTS; tools/gen/blender/crew-body.py; superellipse ring lofts.
  // Source SHA256: 4962e7abeec8bbcdd2c3be2c91037db06bc94184608fbb48acf19d5e07c8aef1
  const PARTS = {"torso":{"axis":"y","sides":14,"p":2.3,"rings":[[0.83,0,0,0,-0.01,0],[0.86,0.15,0.11,0,-0.012,0],[0.92,0.185,0.135,0,-0.012,0],[0.985,0.178,0.128,0,-0.006,2],[1.035,0.17,0.122,0,0,0],[1.17,0.172,0.128,0,0.012,0],[1.3,0.178,0.135,0,0.016,0],[1.375,0.19,0.12,0,0.006,0],[1.435,0.155,0.098,0,-0.004,0],[1.47,0.078,0.072,0,0.004,2],[1.515,0.068,0.064,0,0.008,2],[1.525,0,0,0,0.008,2]],"panels":[[1,4,7,340,20],[1,4,7,160,200],[1,7,8,330,30],[1,7,8,150,210],[1,5,6,62,118]]},"head":{"axis":"y","sides":16,"p":2.1,"rings":[[0.168,0,0,0,-0.012,0],[0.158,0.07,0.085,0,-0.012,0],[0.132,0.11,0.13,0,-0.008,0],[0.09,0.13,0.152,0,-0.004,0],[0.038,0.136,0.158,0,0,0],[-0.004,0.134,0.158,0,0.006,0],[-0.042,0.128,0.155,0,0.012,0],[-0.085,0.118,0.146,0,0.026,0],[-0.125,0.102,0.128,0,0.03,0],[-0.148,0.084,0.104,0,0.012,2],[-0.152,0,0,0,0.012,2]],"panels":[[4,4,6,48,132],[1,1,4,70,110],[1,1,4,250,290]]},"upper":{"axis":"y","sides":10,"p":2,"rings":[[-0.035,0,0,0,0,0],[-0.02,0.05,0.05,0,0,1],[0.02,0.064,0.062,0,0,0],[0.1,0.06,0.058,0,-0.004,0],[0.19,0.054,0.056,0,-0.006,0],[0.28,0.046,0.046,0,0,0],[0.315,0.04,0.04,0,0,0],[0.33,0,0,0,0,0]]},"fore":{"axis":"y","sides":10,"p":2,"rings":[[-0.03,0,0,0,0,0],[-0.015,0.042,0.042,0,0,0],[0.04,0.052,0.05,0,0,0],[0.17,0.043,0.04,0,0,0],[0.245,0.036,0.034,0,0,2],[0.262,0.037,0.035,0,0,5],[0.29,0.034,0.032,0,0,5],[0.315,0.028,0.046,0,-0.004,5],[0.355,0.031,0.05,0,-0.006,5],[0.39,0.03,0.044,0,-0.004,5],[0.405,0.022,0.03,0,0,5],[0.412,0,0,0,0,5]]},"thigh":{"axis":"y","sides":10,"p":2,"rings":[[-0.06,0,0,0,0,0],[-0.045,0.07,0.075,0,0,0],[0,0.094,0.098,0,0.004,0],[0.09,0.096,0.098,0,0.002,0],[0.24,0.082,0.084,0,-0.002,0],[0.36,0.066,0.068,0,-0.004,0],[0.43,0.06,0.064,0,-0.008,0],[0.465,0.04,0.045,0,-0.006,0],[0.475,0,0,0,-0.006,0]],"panels":[[2,5,7,225,315]]},"shin":{"axis":"y","sides":10,"p":2,"rings":[[-0.035,0,0,0,0,3],[-0.02,0.05,0.052,0,0,3],[0.03,0.062,0.064,0,0.004,3],[0.12,0.064,0.068,0,0.01,3],[0.26,0.052,0.054,0,0.006,3],[0.38,0.044,0.044,0,0,3],[0.44,0.042,0.042,0,0,3],[0.46,0,0,0,0,3]]},"boot":{"axis":"z","sides":12,"p":3,"rings":[[-0.078,0,0,0,-0.035,2],[-0.072,0.042,0.045,0,-0.035,2],[-0.05,0.052,0.06,0,-0.02,2],[0,0.056,0.065,0,-0.015,2],[0.06,0.058,0.05,0,-0.03,2],[0.13,0.058,0.035,0,-0.045,2],[0.18,0.048,0.025,0,-0.055,2],[0.198,0.03,0.018,0,-0.062,2],[0.204,0,0,0,-0.07,2]],"panels":[[6,0,8,215,325],[1,3,5,345,15],[1,3,5,165,195]]}};
  // @blender-body:end
  // Slot → colour: 0 overall, 1 accent, 2 trim (collar, cuffs, waist), 3 lower
  // leg, 4 visor, 5 glove, 6 sole. VISOR stays GarageCrew's dark visor.
  const TRIM = [0.06, 0.06, 0.07], VISOR = [0.05, 0.06, 0.08], GLOVE = [0.07, 0.07, 0.08], SOLE = [0.035, 0.035, 0.04];
  function palette(c1, c2) {
    return [c1, c2, TRIM, [c1[0] * 0.72, c1[1] * 0.72, c1[2] * 0.72], VISOR, GLOVE, SOLE];
  }
  const se = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
  // The ring grid of one part: [ring][side] → [x, y, z] in part space.
  function grid(spec) {
    const n = spec.sides, e = 2 / spec.p, g = [];
    for (const r of spec.rings) {
      const row = [];
      for (let j = 0; j <= n; j++) {
        const a = j / n * Math.PI * 2, u = r[3] + r[1] * se(Math.cos(a), e), v = r[4] + r[2] * se(Math.sin(a), e);
        row.push(spec.axis === "z" ? [u, v, r[0]] : [u, r[0], v]);
      }
      g.push(row);
    }
    return g;
  }
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  function slotOf(spec, i, j) {
    const a = (j + 0.5) / spec.sides * 360;
    let s = spec.rings[i][5];
    for (const [slot, r0, r1, a0, a1] of spec.panels || []) {
      if (i < r0 || i >= r1) continue;
      if (a0 <= a1 ? a >= a0 && a <= a1 : a >= a0 || a <= a1) s = slot;
    }
    return s;
  }
  /** Loft part `name` into acc `out` with livery c1/c2. `T` (optional) maps
   *  part-space points and normals: { p(v) → v, n(v) → v }. */
  function build(out, name, c1, c2, T) {
    const spec = PARTS[name], g = grid(spec), n = spec.sides, cols = palette(c1, c2);
    const R = g.length, raw = [];
    // Which way is out depends on the axis and on whether the rings climb or
    // descend (the helmet's run crown-down): measure it against the axis.
    let out_ = 0;
    for (let i = 0; i < R - 1; i++) {
      const row = [], r = spec.rings[i], o = spec.axis === "z" ? [r[3], r[4], r[0]] : [r[3], r[0], r[4]];
      for (let j = 0; j < n; j++) {
        const c = cross(sub(g[i + 1][j + 1], g[i][j]), sub(g[i][j + 1], g[i + 1][j])), m = sub(g[i + 1][j + 1], o);
        out_ += c[0] * m[0] + c[1] * m[1] + c[2] * m[2];
        row.push(c);
      }
      raw.push(row);
    }
    const flip = out_ >= 0 ? 1 : -1;
    // Smooth normals: each grid vertex averages its quads' diagonal normals.
    const qn = raw.map((row) => row.map((c) => [c[0] * flip, c[1] * flip, c[2] * flip]));
    const nrm = (i, j) => {
      const s = [0, 0, 0];
      for (const di of [-1, 0]) for (const dj of [-1, 0]) {
        const qi = i + di, qj = ((j + dj) % n + n) % n;
        if (qi < 0 || qi >= R - 1) continue;
        const q = qn[qi][qj]; s[0] += q[0]; s[1] += q[1]; s[2] += q[2];
      }
      const l = Math.hypot(s[0], s[1], s[2]) || 1;
      return [s[0] / l, s[1] / l, s[2] / l];
    };
    const seen = new Map();
    const vert = (i, j, slot) => {
      const k = (i * (n + 1) + j) * 8 + slot;
      let at = seen.get(k);
      if (at !== undefined) return at;
      let p = g[i][j], q = nrm(i, j % n);
      if (T) { p = T.p(p); q = T.n(q); }
      at = out.pos.length / 3;
      out.pos.push(p[0], p[1], p[2]); out.nrm.push(q[0], q[1], q[2]); out.col.push(...cols[slot]); out.mat.push(0);
      seen.set(k, at);
      return at;
    };
    for (let i = 0; i < R - 1; i++) for (let j = 0; j < n; j++) {
      const s = slotOf(spec, i, j), a = vert(i, j, s), b = vert(i + 1, j, s), c = vert(i + 1, j + 1, s), d = vert(i, j + 1, s);
      // Skip the zero-area half of a quad on a closed (collapsed) ring.
      const closedLo = spec.rings[i][1] === 0 && spec.rings[i][2] === 0, closedHi = spec.rings[i + 1][1] === 0 && spec.rings[i + 1][2] === 0;
      if (flip > 0) { if (!closedHi) out.idx.push(a, b, c); if (!closedLo) out.idx.push(a, c, d); }
      else { if (!closedHi) out.idx.push(a, c, b); if (!closedLo) out.idx.push(a, d, c); }
    }
    return out;
  }
  /** The full-face helmet about head centre H (GarageCrew.helmet's contract). */
  function helmet(out, H, c1, c2) {
    return build(out, "head", c1, c2, { p: (v) => [v[0] + H[0], v[1] + H[1], v[2] + H[2]], n: (v) => v });
  }
  /** Part `name` baked between joints a → b (its +y along a→b, scaled to the
   *  span over the part's rest length `len`), x kept as near world x as the
   *  span allows, so leg and arm fronts face the figure's front like the rig. */
  function segment(out, name, a, b, c1, c2, len, y0 = 0) {
    const d = sub(b, a), L = Math.hypot(d[0], d[1], d[2]) || 1, Y = [d[0] / L, d[1] / L, d[2] / L];
    let X = [1 - Y[0] * Y[0], -Y[0] * Y[1], -Y[0] * Y[2]], lx = Math.hypot(X[0], X[1], X[2]);
    if (lx < 1e-4) { X = [-Y[1] * Y[0], 1 - Y[1] * Y[1], -Y[1] * Y[2]]; lx = Math.hypot(X[0], X[1], X[2]); }
    X = [X[0] / lx, X[1] / lx, X[2] / lx];
    const Z = cross(X, Y), k = L / len;
    // Rest-down limbs (Y ≈ -y) keep the rig's frame: local -z faces the front.
    const map = (v, s) => [X[0] * v[0] + Y[0] * v[1] * s + Z[0] * v[2], X[1] * v[0] + Y[1] * v[1] * s + Z[1] * v[2], X[2] * v[0] + Y[2] * v[1] * s + Z[2] * v[2]];
    return build(out, name, c1, c2, {
      p: (v) => { const w = map([v[0], v[1] - y0, v[2]], k); return [a[0] + w[0], a[1] + w[1], a[2] + w[2]]; },
      n: (v) => { const w = map(v, 1); const l = Math.hypot(w[0], w[1], w[2]) || 1; return [w[0] / l, w[1] / l, w[2] / l]; },
    });
  }
  /** A boot about foot point f, facing +z, its sole at f.y + lift - 0.08. */
  function boot(out, f, c1, c2, lift = 0) {
    return build(out, "boot", c1, c2, { p: (v) => [v[0] + f[0], v[1] + f[1] + lift, v[2] + f[2]], n: (v) => v });
  }
  const body = Object.freeze({ PARTS, build, helmet, segment, boot, palette });
  return Object.freeze({ acc, ease, place, mul, body });
})();
