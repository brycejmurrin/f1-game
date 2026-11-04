/* Blender-authored guide motion. Regenerate with tools/garage/author-crew-motion.py.
 * Rigid articulated meshes share the garage's livery materials; no skinning,
 * asynchronous asset load, or per-frame mesh generation is needed. */
const GarageCrewMotion = (function () {
  "use strict";
  // @blender-motion:start
  // Blender 4.2; tools/garage/author-crew-motion.py; 24 fps / 2; footLY,footLZ,footRY,footRZ,handLZ,handRZ,lean,sway
  // Source SHA256: 35aa912190d9d127cd38bf901ed594913b6525dbed6aea510aa572cb277bddbb
  const KEYS = [[0.08,0.03,0.08,0.03,0.1,0.1,0.028,0.0],[0.08,0.0368,0.08,0.0368,0.0994,0.0931,0.029,0.0],[0.08,0.0566,0.08,0.0566,0.0976,0.0732,0.032,0.0],[0.1185,0.0509,0.08,0.088,0.1135,0.0431,0.0363,-0.0161],[0.1431,-0.0171,0.08,0.13,0.1626,0.0083,0.0404,-0.0206],[0.08,-0.0386,0.0804,0.181,0.177,-0.0223,0.0418,0.0017],[0.08,0.0209,0.1515,0.1225,0.42,0.42,0.0384,0.0219],[0.1067,0.0561,0.08,0.0875,0.0821,0.0719,0.0306,-0.0134],[0.1094,-0.0851,0.08,0.16,0.1312,0.0606,0.023,-0.0141],[0.08,-0.0429,0.1486,0.1264,0.1014,0.0856,0.0221,0.0215],[0.101,0.0169,0.08,0.0378,0.0925,0.1103,0.0304,-0.0119],[0.1056,-0.0934,0.08,0.1208,0.1902,0.0278,0.0426,-0.0131],[0.08,-0.035,0.1517,0.0778,0.42,0.42,0.049,0.022],[0.127,-0.0176,0.08,0.0492,0.1485,0.0672,0.0448,-0.0178],[0.08,-0.1778,0.08,0.1322,0.1997,0.0584,0.0348,-0.0001],[0.08,-0.0971,0.1363,-0.0117,0.1313,0.1616,0.0287,0.0195],[0.1467,-0.1309,0.08,-0.02,0.1564,0.1596,0.0317,-0.0212],[0.0802,-0.2473,0.0805,0.0519,0.249,0.0915,0.0412,0.0006],[0.08,-0.1809,0.1502,-0.0536,0.372,0.372,0.0508,0.0217],[0.08,-0.1214,0.08,-0.1214,0.2225,0.144,0.0558,0.0],[0.08,-0.07,0.08,-0.07,0.1917,0.1183,0.0557,0.0],[0.08,-0.028,0.08,-0.028,0.1569,0.1069,0.0527,0.0],[0.08,0.0034,0.08,0.0034,0.1268,0.1024,0.0493,0.0],[0.08,0.0232,0.08,0.0232,0.1069,0.1006,0.0469,0.0],[0.08,0.03,0.08,0.03,0.372,0.372,0.046,0.0]];
  // @blender-motion:end
  const acc = GarageCrewDraw.acc;
  const THIGH = 0.43, SHIN = 0.44, ARM = 0.30;
  function sample(u, out) {
    const p = Math.max(0, Math.min(1, Number.isFinite(u) ? u : 1)) * (KEYS.length - 1), a = Math.floor(p), b = Math.min(a + 1, KEYS.length - 1), f = p - a;
    for (let i = 0; i < 8; i++) out[i] = KEYS[a][i] + (KEYS[b][i] - KEYS[a][i]) * f;
    return out;
  }
  // Replay the authored planted gait over arbitrary travel, in 1.35 m cycles.
  // Positive distance retreats along local -z; negative distance walks forward.
  // The authored root travels 1.35 * smoothstep(u) over the clip, so the clip
  // time for travel fraction v is the inverse smoothstep (16-step bisection).
  function walking(distance, out) {
    const v = ((distance / 1.35) % 1 + 1) % 1;
    let lo = 0, hi = 1;
    for (let i = 0; i < 16; i++) {
      const u = (lo + hi) / 2;
      if (u * u * (3 - 2 * u) < v) lo = u; else hi = u;
    }
    return sample((lo + hi) / 2, out);
  }
  // The parts are GarageCrewDraw.body's lofts (tools/gen/blender/crew-body.py), in
  // the frames part() places: the fore carries the glove and fist past the wrist.
  function create(gfx, c1, c2, helmet) {
    const mesh = {}, add = (name, data) => { mesh[name] = gfx.createMesh(data); };
    for (const name of ["torso", "upper", "fore", "thigh", "shin", "boot"]) add(name, GarageCrewDraw.body.build(acc(), name, c1, c2));
    const a = acc(); helmet(a, [0, 0, 0], c1, c2); add("head", a);
    return { mesh, m: new Float32Array(16), pm: new Float32Array(16), parent: null, walk: new Float32Array(8), signal: new Float32Array(8), joint: new Float32Array(2), knee: new Float32Array(3), x: 0, z: 0, cy: 1, sy: 0 };
  }
  function free(rig, gfx) {
    if (!rig) return 0;
    const names = Object.keys(rig.mesh);
    for (const name of names) gfx.freeMesh(rig.mesh[name]);
    return names.length;
  }
  // Two-bone IK in the figure's YZ plane: the elbow that keeps both arm
  // segments at length a and b while the hand reaches (ty, tz).
  function joint(y, z, ty, tz, a, b, bend, out) {
    const dy = ty - y, dz = tz - z, raw = Math.hypot(dy, dz), d = Math.max(.001, Math.min(a + b - .0001, raw));
    const uy = raw > .001 ? dy / raw : -1, uz = raw > .001 ? dz / raw : 0;
    const along = (a * a - b * b + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a * a - along * along));
    out[0] = y + uy * along + uz * h * bend; out[1] = z + uz * along - uy * h * bend;
    return out;
  }
  // Three-dimensional knee solve keeps an ankle planted as the torso turns.
  function leg(x, y, z, tx, ty, tz, out) {
    const dx = tx - x, dy = ty - y, dz = tz - z, raw = Math.hypot(dx, dy, dz), d = Math.max(.001, Math.min(THIGH + SHIN - .0001, raw));
    const ux = dx / raw, uy = dy / raw, uz = dz / raw;
    const along = (THIGH * THIGH - SHIN * SHIN + d * d) / (2 * d), h = Math.sqrt(Math.max(0, THIGH * THIGH - along * along)), n = Math.sqrt(1 - uz * uz);
    out[0] = x + ux * along - uz * ux * h / n;
    out[1] = y + uy * along - uz * uy * h / n;
    out[2] = z + uz * along + n * h;
    return out;
  }
  // One rigid part from joint (x, y, z) along (dx, dy, dz), scaled to `length`,
  // in the rig's yaw frame. A footYaw replaces the rotation (a turning boot).
  function part(rig, gfx, name, x, y, z, dy, dz, length, opts, dx = 0, footYaw = null) {
    const m = rig.m, cy = rig.cy, sy = rig.sy, d = Math.hypot(dx, dy, dz), nx = dx / d, ny = dy / d, nz = dz / d;
    const h = Math.hypot(dx, dy), xx = h > .00001 ? Math.abs(dy) / h : 1, xy = h > .00001 ? -(dy < 0 ? -1 : 1) * dx / h : 0;
    const zx = xy * nz, zy = -xx * nz, zz = xx * ny - xy * nx;
    m[0] = cy * xx; m[1] = xy; m[2] = -sy * xx; m[3] = 0;
    m[4] = (cy * dx + sy * dz) / length; m[5] = dy / length; m[6] = (-sy * dx + cy * dz) / length; m[7] = 0;
    m[8] = cy * zx + sy * zz; m[9] = zy; m[10] = -sy * zx + cy * zz; m[11] = 0;
    m[12] = rig.x + cy * x + sy * z; m[13] = y; m[14] = rig.z - sy * x + cy * z; m[15] = 1;
    if (footYaw !== null) {
      const c = Math.cos(footYaw), s = Math.sin(footYaw);
      m[0] = c; m[1] = 0; m[2] = -s; m[4] = 0; m[5] = 1; m[6] = 0; m[8] = s; m[9] = 0; m[10] = c;
    }
    // rig.parent (GarageCrewChoreo.draw): the in-race stop places the crew in the car's grounded basis.
    gfx.draw(rig.mesh[name], rig.parent ? GarageCrewDraw.mul(rig.pm, rig.parent, m) : m, opts);
  }
  function draw(rig, gfx, x, z, yaw, pose, side, opts) {
    rig.x = x; rig.z = z; rig.cy = Math.cos(yaw); rig.sy = Math.sin(yaw);
    const walk = Number.isFinite(pose.walkDistance) ? walking(pose.walkDistance, rig.walk) : sample(pose.door, rig.walk), time = Number.isFinite(pose.seconds) ? pose.seconds : 0;
    const cue = sample(pose.calm ? 0 : (time / 2 + side * .17) % 1, rig.signal);
    const ready = Math.max(0, Math.min(1, (pose.door - .8) * 5)), custom = Number.isFinite(pose.handY);
    // walk[6]=lean, walk[7]=sway. Sway shifts hips only so planted feet stay put.
    // pose.lean 0 from choreo still takes gait lean; crouch/custom keep pose lean.
    const drop = Number.isFinite(pose.crouch) ? pose.crouch : 0;
    const leanLock = custom || drop > 0 || (Number.isFinite(pose.lean) && pose.lean !== 0);
    const sway = leanLock ? 0 : walk[7], bob = pose.calm || custom ? 0 : Math.abs(cue[7]) * .12 * ready;
    const lean = leanLock ? (Number.isFinite(pose.lean) ? pose.lean : 0) : walk[6], hipLean = Number.isFinite(pose.hipLean) ? pose.hipLean : lean;
    const bend = Math.asin(Math.max(-.9, Math.min(.9, (lean - hipLean) / .43))), bc = Math.cos(bend), bs = Math.sin(bend);
    part(rig, gfx, "torso", sway, bob - drop + .95 * (1 - bc), hipLean - .95 * bs, bc, bs, 1, opts);
    part(rig, gfx, "head", sway, .95 + .67 * bc + bob - drop, hipLean + .67 * bs, bc, bs, 1, opts);
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1, footX = s * .10, hipX = footX + sway;
      const fx = pose.feet ? pose.feet[i * 3] : footX, fy = pose.feet ? pose.feet[i * 3 + 1] : walk[i * 2], fz = pose.feet ? pose.feet[i * 3 + 2] : walk[i * 2 + 1];
      const knee = leg(hipX, .91 + bob - drop, hipLean, fx, fy, fz, rig.knee), kx = knee[0], ky = knee[1], kz = knee[2];
      part(rig, gfx, "thigh", hipX, .91 + bob - drop, hipLean, ky - .91 - bob + drop, kz - hipLean, THIGH, opts, kx - hipX);
      part(rig, gfx, "shin", kx, ky, kz, fy - ky, fz - kz, SHIN, opts, fx - kx);
      part(rig, gfx, "boot", fx, fy, fz, 1, 0, 1, opts, 0, pose.footYaw ? pose.footYaw[i] : null);
      const sy = .95 + .43 * bc + bob - drop, hzG = walk[4 + i], hzC = (cue[4] + cue[5]) * .5;
      const hy = custom ? pose.handY : .85 + bob, hz = custom ? pose.reach : hzG + (hzC - hzG) * ready;
      const ax = s * .22 + (custom ? 0 : sway);
      const elbow = joint(sy, lean, hy, hz, ARM, ARM, -1, rig.joint), ey = elbow[0], ez = elbow[1];
      part(rig, gfx, "upper", ax, sy, lean, ey - sy, ez - lean, ARM, opts);
      part(rig, gfx, "fore", ax, ey, ez, hy - ey, hz - ez, ARM, opts);
    }
  }
  return Object.freeze({ create, free, draw, sample, joint, sampleCount: KEYS.length });
})();
