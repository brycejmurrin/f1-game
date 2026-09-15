/* Oriented boxes in the local (along-road, right) plane. No car mutation. */
"use strict";
const ContactGeometry = (function () {
  const HALF_LONG = 2.4, HALF_WIDE = 1;
  const INERTIA = (4.8 * 4.8 + 2 * 2) / 12;
  function radius(angle, nx, ny) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return HALF_LONG * Math.abs(nx * c + ny * s) + HALF_WIDE * Math.abs(-nx * s + ny * c);
  }
  // Normal points from B to A. Four SAT axes give the exact rectangle test.
  function overlap(dx, dy, angleA, angleB, out = {}) {
    let depth = Infinity, nx = 0, ny = 0;
    for (let i = 0; i < 4; i++) {
      const a = (i < 2 ? angleA : angleB) + (i % 2) * Math.PI / 2;
      const x = Math.cos(a), y = Math.sin(a), d = dx * x + dy * y;
      const p = radius(angleA, x, y) + radius(angleB, x, y) - Math.abs(d);
      if (!(p > 1e-9)) return null;
      if (p < depth) { depth = p; const sign = d < 0 ? -1 : 1; nx = x * sign; ny = y * sign; }
    }
    out.depth = depth; out.nx = nx; out.ny = ny;
    return out;
  }
  // Linear time-of-impact for fixed orientations. Angular sweeps need a
  // separate solver; callers reject a rapidly changing heading.
  function sweep(x0, y0, x1, y1, angleA, angleB, out = {}) {
    let enter = 0, leave = 1, nx = 0, ny = 0;
    for (let i = 0; i < 4; i++) {
      const a = (i < 2 ? angleA : angleB) + (i % 2) * Math.PI / 2;
      const x = Math.cos(a), y = Math.sin(a);
      const r = radius(angleA, x, y) + radius(angleB, x, y);
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
    // Face midpoint when parallel, rather than an arbitrary corner torque.
    const a = Math.abs(l) < 1e-8 ? 0 : Math.sign(l) * HALF_LONG;
    const b = Math.abs(w) < 1e-8 ? 0 : Math.sign(w) * HALF_WIDE;
    out.x = a * c - b * s; out.y = a * s + b * c;
  }
  const pa = {}, pb = {};
  function impulse(a, b, dx, dy, contact, out = {}) {
    const { nx, ny } = contact;
    support(a.angle, -nx, -ny, pa); support(b.angle, nx, ny, pb);
    const px = (dx + pa.x + pb.x) / 2, py = (dy + pa.y + pb.y) / 2;
    const ax = px - dx, ay = py - dy, bx = px, by = py;
    const ca = ax * ny - ay * nx, cb = bx * ny - by * nx;
    const relative = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny + a.omega * ca - b.omega * cb;
    const denom = a.invMass + b.invMass + ca * ca * a.invInertia + cb * cb * b.invInertia;
    const j = relative < 0 && denom > 0 ? -relative / denom : 0; // inelastic: no bounce energy
    out.ax = j * a.invMass * nx; out.ay = j * a.invMass * ny; out.aw = j * ca * a.invInertia;
    out.bx = -j * b.invMass * nx; out.by = -j * b.invMass * ny; out.bw = -j * cb * b.invInertia;
    out.closing = Math.max(0, -relative); out.magnitude = j;
    return out;
  }
  return Object.freeze({ overlap, sweep, impulse, radius, INERTIA });
})();
Object.freeze(ContactGeometry);
