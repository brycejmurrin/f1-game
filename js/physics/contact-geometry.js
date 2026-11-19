"use strict";
const ContactGeometry = (function () {
  const HALF_LONG = 2.4, HALF_WIDE = 1;
  const INERTIA = (4.8 * 4.8 + 2 * 2) / 12;
  function radius(c, s, nx, ny) {
    return HALF_LONG * Math.abs(nx * c + ny * s) + HALF_WIDE * Math.abs(-nx * s + ny * c);
  }
  function overlap(dx, dy, angleA, angleB, out = {}) {
    const ca = Math.cos(angleA), sa = Math.sin(angleA), cb = Math.cos(angleB), sb = Math.sin(angleB);
    let depth = Infinity, nx = 0, ny = 0;
    for (let i = 0; i < 4; i++) {
      const a = (i < 2 ? angleA : angleB) + (i % 2) * Math.PI / 2;
      const x = Math.cos(a), y = Math.sin(a), d = dx * x + dy * y;
      const p = radius(ca, sa, x, y) + radius(cb, sb, x, y) - Math.abs(d);
      if (!(p > 1e-9)) return null;
      if (p < depth) { depth = p; const sign = d < 0 ? -1 : 1; nx = x * sign; ny = y * sign; }
    }
    out.depth = depth; out.nx = nx; out.ny = ny;
    return out;
  }
  function sweep(x0, y0, x1, y1, angleA, angleB, out = {}) {
    const ca = Math.cos(angleA), sa = Math.sin(angleA), cb = Math.cos(angleB), sb = Math.sin(angleB);
    let enter = 0, leave = 1, nx = 0, ny = 0;
    for (let i = 0; i < 4; i++) {
      const a = (i < 2 ? angleA : angleB) + (i % 2) * Math.PI / 2;
      const x = Math.cos(a), y = Math.sin(a);
      const r = radius(ca, sa, x, y) + radius(cb, sb, x, y);
      const start = x0 * x + y0 * y, delta = (x1 - x0) * x + (y1 - y0) * y;
      if (Math.abs(delta) < 1e-9) { if (Math.abs(start) >= r) return null; continue; }
      let lo = (-r - start) / delta, hi = (r - start) / delta;
      if (lo > hi) [lo, hi] = [hi, lo];
      if (lo > enter) { enter = lo; const sign = delta > 0 ? -1 : 1; nx = x * sign; ny = y * sign; }
      leave = Math.min(leave, hi);
      if (enter > leave) return null;
    }
    if (!(enter > 0 && enter <= 1) || leave < 0) return null;
    out.time = enter; out.nx = nx; out.ny = ny; out.depth = 0;
    return out;
  }
  function support(angle, nx, ny, out) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const l = nx * c + ny * s, w = -nx * s + ny * c;
    const a = Math.abs(l) < 1e-8 ? 0 : Math.sign(l) * HALF_LONG;
    const b = Math.abs(w) < 1e-8 ? 0 : Math.sign(w) * HALF_WIDE;
    out.x = a * c - b * s; out.y = a * s + b * c;
  }
  const FRICTION = 0.5;
  const pa = {}, pb = {};
  function impulse(a, b, dx, dy, contact, out = {}) {
    const { nx, ny } = contact;
    support(a.angle, -nx, -ny, pa); support(b.angle, nx, ny, pb);
    const px = (dx + pa.x + pb.x) / 2, py = (dy + pa.y + pb.y) / 2;
    const ax = px - dx, ay = py - dy, bx = px, by = py;
    const ca = ax * ny - ay * nx, cb = bx * ny - by * nx;
    const relative = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny + a.omega * ca - b.omega * cb;
    const denom = a.invMass + b.invMass + ca * ca * a.invInertia + cb * cb * b.invInertia;
    const oriented = a.angle !== 0 || b.angle !== 0;
    const closing = relative < 0 ? -relative : 0;
    const e = oriented ? AiDrive.bumpRestitution(closing) : 0;
    const j = relative < 0 && denom > 0 ? -(1 + e) * relative / denom : 0;
    let jax = j * a.invMass * nx, jay = j * a.invMass * ny, jaw = j * ca * a.invInertia;
    let jbx = -j * b.invMass * nx, jby = -j * b.invMass * ny, jbw = -j * cb * b.invInertia;
    if (oriented && j > 0) {
      const tx = -ny, ty = nx;
      const ta = ax * ty - ay * tx, tb = bx * ty - by * tx;
      const denomT = a.invMass + b.invMass + ta * ta * a.invInertia + tb * tb * b.invInertia;
      if (denomT > 0) {
        const slide = (a.vx + jax - b.vx - jbx) * tx + (a.vy + jay - b.vy - jby) * ty
          + (a.omega + jaw) * ta - (b.omega + jbw) * tb;
        const lim = FRICTION * j, want = -slide / denomT;
        const jt = want > lim ? lim : want < -lim ? -lim : want;
        jax += jt * a.invMass * tx; jay += jt * a.invMass * ty; jaw += jt * ta * a.invInertia;
        jbx -= jt * b.invMass * tx; jby -= jt * b.invMass * ty; jbw -= jt * tb * b.invInertia;
        out.slide = jt;
      } else out.slide = 0;
    } else out.slide = 0;
    out.ax = jax; out.ay = jay; out.aw = jaw;
    out.bx = jbx; out.by = jby; out.bw = jbw;
    out.closing = closing; out.magnitude = j;
    return out;
  }
  function wallLimits(track, s, x, out, postLim, previous) {
    let wallR = Tracks.wallAt(track, s, 1), wallL = Tracks.wallAt(track, s, -1);
    let laneMin = 0, pitSd = 0;
    const p = track.pit;
    let pitX = previous ? previous.x : x, previousFace = null;
    if (previous && p && !p.painted) {
      const pk = ((Math.round(previous.s / track.total * track.n) % track.n) + track.n) % track.n;
      if (p.v[pk] >= 0.98) previousFace = track.hw[pk] + p.bands.verge;
      else if (p.w[pk] >= TrackPit.EXIT_WALL_W && ((previous.s - p.sOut) % track.total + track.total) % track.total < p.exitRoadM)
        previousFace = track.hw[pk] + p.bands.verge * p.v[pk];
    }
    if (p && !p.painted) {
      const k = ((Math.round(s / track.total * track.n) % track.n) + track.n) % track.n;
      if (p.v[k] >= 0.98) {
        pitSd = p.side;
        const face = track.hw[k] + p.bands.verge;
        if ((previousFace === null ? pitX * pitSd < face + 0.125 : pitX * pitSd < previousFace + 0.125)) { if (pitSd > 0) wallR = Math.min(wallR, face - 1.1); else wallL = Math.min(wallL, face - 1.1); }
        else laneMin = track.hw[k] + p.off.fastIn + 1.0;
      } else if (p.w[k] >= TrackPit.EXIT_WALL_W && ((s - p.sOut) % track.total + track.total) % track.total < p.exitRoadM) {
        pitSd = p.side;
        const wallLat = track.hw[k] + p.bands.verge * p.v[k];
        if ((previousFace === null ? pitX * pitSd < wallLat + 0.125 : pitX * pitSd < previousFace + 0.125)) { if (pitSd > 0) wallR = Math.min(wallR, wallLat - 1.15); else wallL = Math.min(wallL, wallLat - 1.15); }
        else laneMin = wallLat + 0.30 + 1.0;
      }
    }
    if (track.posts && track.posts.length) {
      Tracks.postLimits(track, s, previous ? previous.x : x, postLim);
      if (postLim.r < wallR) wallR = postLim.r;
      if (postLim.l < wallL) wallL = postLim.l;
      if (postLim.minOut > laneMin) { laneMin = postLim.minOut; pitSd = postLim.side; }
    }
    out.r = wallR; out.l = wallL; out.laneMin = laneMin; out.side = pitSd;
    return out;
  }

  return Object.freeze({ overlap, sweep, impulse, wallLimits, INERTIA, FRICTION });
})();
Object.freeze(ContactGeometry);
