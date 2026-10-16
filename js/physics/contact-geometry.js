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
  // CONTACT MATERIAL — restitution and Coulomb friction, ORIENTED PAIRS ONLY.
  //
  // Why the gate. Two call sites reach impulse(), and one of them (collide.js
  // sweepContacts) reaches it for an UNYAWED pair too: a linear time-of-impact
  // catch does not care how the cars are pointing. The unyawed field's contact
  // behaviour is what the AI instruments, the pace ladder and
  // physics-characterization are all baselined against, and giving it bounce
  // and side grip is the re-baseline the collision plan defers
  // (docs/notes/COLLISION-CULLING-PLAN-2026-09-16.md §3). `angle` is
  // `psi * yawMix(psi)` in collide.js — exactly zero for every AI car and for a
  // player under 20 degrees of yaw — so `oriented` is false for precisely the
  // pairs that must not move, and those come out bit-identical: `-(1 + 0) * r`
  // is `-r` in IEEE754, and the friction block does not run.
  //
  // RESTITUTION is `AiDrive.bumpRestitution`, the SAME ramp the heuristic
  // rear-end path in collide.js has used since the bump was measured: zero
  // under 1 m/s of closing so a car resting on a bumper cannot jitter off it,
  // reaching 0.1 by 3 m/s (docs/PHYSICS.md, "Car-to-car contact"). One curve,
  // two paths — a second restitution constant here would be a second answer to
  // the same question, and the first one has measurements behind it.
  //
  // FRICTION is what lets leaning on a rival transfer lateral momentum and yaw
  // at all; without it the resolver can only ever push along the normal. 0.5
  // is a first value with no measurement behind it yet, chosen as a plausible
  // carbon-on-carbon coefficient — the clamp shape is the part that matters.
  //
  // THE TANGENTIAL IMPULSE IS SOLVED FROM THE POST-NORMAL VELOCITIES, and that
  // ordering is what keeps the pair's kinetic energy monotonically falling
  // (the assertion in tests/unit/contact-geometry.test.mjs, unchanged). Each
  // impulse then lies along a single direction d, so its energy change is
  // exactly `jd*vd + jd*jd*(d.K.d)/2` — a parabola through the origin whose
  // minimum is the unclamped solution, so clamping toward zero stays inside
  // it, and the normal step's own value is -(1-e*e)*vn*vn/(2*denom) <= 0.
  // Solving both at once from the same pre-velocities does NOT: the cross term
  // `j*jt*(n.K.t)` is then unaccounted for and can be positive.
  const FRICTION = 0.5;               // Coulomb clamp: |jt| <= FRICTION * j
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
  // `radius` is internal to overlap()/sweep(); nothing outside ever read it.
  return Object.freeze({ overlap, sweep, impulse, INERTIA, FRICTION });
})();
Object.freeze(ContactGeometry);
