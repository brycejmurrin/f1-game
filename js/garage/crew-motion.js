/* Blender-authored guide motion. Regenerate with tools/garage/author-crew-motion.py.
 * Rigid articulated meshes share the garage's livery materials; no skinning,
 * asynchronous asset load, or per-frame mesh generation is needed. */
const GarageCrewMotion = (function () {
  "use strict";
  const { block, tube, scale } = GaragePrims;
  // @blender-motion:start
  // Blender 4.3; tools/garage/author-crew-motion.py; 24 fps, sampled every 2 frames.
  // Source SHA256: 707304cdd745495a24e34779c03e9e3c0c0140e724cd7f38fbf2677ab075eccf
  const KEYS = [[0.08,0.03,0.08,0.03,0.42,1.35,0.0],[0.08,0.036836,0.08,0.036836,0.425185,1.358889,0.000593],[0.08,0.056562,0.08,0.056562,0.438148,1.381111,0.002074],[0.117091,0.042771,0.08,0.088008,0.455,1.41,0.004],[0.163615,-0.059329,0.08,0.13,0.471852,1.438889,0.005926],[0.085099,-0.150182,0.08,0.181367,0.484815,1.461111,0.007407],[0.08,-0.096563,0.125835,0.183379,0.49,1.47,0.008],[0.08,-0.029961,0.12094,0.020572,0.484815,1.46441,0.00765],[0.08,0.0425,0.08,0.0425,0.471852,1.449444,0.006704],[0.163921,-0.03094,0.08,0.119648,0.455,1.427813,0.005313],[0.08,-0.137187,0.08,0.200312,0.438148,1.402222,0.00363],[0.08,-0.05418,0.160191,0.076171,0.425185,1.375382,0.001808],[0.08,0.03,0.08,0.03,0.42,1.35,0.0],[0.160191,-0.016171,0.08,0.11418,0.422963,1.328322,-0.00166],[0.08,-0.140313,0.08,0.197188,0.43037,1.310741,-0.003111],[0.08,-0.059648,0.163921,0.09094,0.44,1.297187,-0.004313],[0.08,0.0175,0.08,0.0175,0.44963,1.287593,-0.005222],[0.12094,0.039428,0.08,0.089961,0.457037,1.281887,-0.005799],[0.125835,-0.123379,0.08,0.156562,0.46,1.28,-0.006],[0.08,-0.121367,0.085099,0.210182,0.457037,1.285185,-0.005556],[0.08,-0.07,0.163615,0.119329,0.44963,1.298148,-0.004444],[0.08,-0.028008,0.117091,0.017229,0.44,1.315,-0.003],[0.08,0.003437,0.08,0.003437,0.43037,1.331852,-0.001556],[0.08,0.023164,0.08,0.023164,0.422963,1.344815,-0.000444],[0.08,0.03,0.08,0.03,0.42,1.35,0.0]];
  // @blender-motion:end
  const acc = () => ({ pos: [], nrm: [], col: [], mat: [], idx: [] });
  const DARK = [0.06, 0.06, 0.07], THIGH = 0.43, SHIN = 0.44, ARM = 0.30;
  function sample(u, out) {
    const p = Math.max(0, Math.min(1, Number.isFinite(u) ? u : 1)) * (KEYS.length - 1), a = Math.floor(p), b = Math.min(a + 1, KEYS.length - 1), f = p - a;
    for (let i = 0; i < 7; i++) out[i] = KEYS[a][i] + (KEYS[b][i] - KEYS[a][i]) * f;
    return out;
  }
  function create(gfx, c1, c2, helmet) {
    const mesh = {}, add = (name, data) => { mesh[name] = gfx.createMesh(data); };
    let a = acc();
    tube(a, [0, .95, 0], [0, 1.32, 0], .16, c1, 10);
    tube(a, [0, 1.32, 0], [0, 1.46, 0], .13, c1, 10);
    tube(a, [-.22, 1.38, 0], [.22, 1.38, 0], .08, c1, 10);
    tube(a, [0, 1.17, 0], [0, 1.23, 0], .166, c2, 10);
    tube(a, [0, .93, 0], [0, .99, 0], .165, DARK, 10); add("torso", a);
    a = acc(); helmet(a, [0, 0, 0], c1, c2); add("head", a);
    a = acc(); tube(a, [0, 0, 0], [0, ARM, 0], .058, c1, 8); block(a, 0, .025, 0, .07, .03, .07, c2); add("upper", a);
    a = acc(); tube(a, [0, 0, 0], [0, ARM, 0], .05, c1, 8); block(a, 0, ARM, 0, .045, .045, .05, DARK); add("fore", a);
    a = acc(); tube(a, [0, 0, 0], [0, THIGH, 0], .082, c1, 8); block(a, 0, THIGH, -.06, .06, .06, .02, DARK); add("thigh", a);
    a = acc(); tube(a, [0, 0, 0], [0, SHIN, 0], .062, scale(c1, .72), 8); add("shin", a);
    a = acc(); block(a, 0, -.03, .04, .065, .05, .12, DARK); add("boot", a);
    return { mesh, m: new Float32Array(16), walk: new Float32Array(7), signal: new Float32Array(7), joint: new Float32Array(2), x: 0, z: 0, cy: 1, sy: 0 };
  }
  function free(rig, gfx) {
    if (!rig) return 0;
    const names = Object.keys(rig.mesh); for (const name of names) gfx.freeMesh(rig.mesh[name]);
    return names.length;
  }
  // Two-bone IK in the figure's YZ plane. Feet remain at Blender's authored
  // ground targets while knees bend; the same solver keeps arm lengths fixed.
  function joint(y, z, ty, tz, a, b, bend, out) {
    const dy = ty - y, dz = tz - z, raw = Math.hypot(dy, dz), d = Math.max(.001, Math.min(a + b - .0001, raw));
    const uy = raw > .001 ? dy / raw : -1, uz = raw > .001 ? dz / raw : 0;
    const along = (a * a - b * b + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a * a - along * along));
    out[0] = y + uy * along + uz * h * bend; out[1] = z + uz * along - uy * h * bend;
    return out;
  }
  function part(rig, gfx, name, x, y, z, dy, dz, length, opts) {
    const m = rig.m, cy = rig.cy, sy = rig.sy, d = Math.hypot(dy, dz), ny = dy / d, nz = dz / d;
    m[0] = cy; m[1] = 0; m[2] = -sy; m[3] = 0;
    m[4] = sy * dz / length; m[5] = dy / length; m[6] = cy * dz / length; m[7] = 0;
    m[8] = sy * ny; m[9] = -nz; m[10] = cy * ny; m[11] = 0;
    m[12] = rig.x + cy * x + sy * z; m[13] = y; m[14] = rig.z - sy * x + cy * z; m[15] = 1;
    gfx.draw(rig.mesh[name], m, opts);
  }
  function draw(rig, gfx, x, z, yaw, pose, side, opts) {
    rig.x = x; rig.z = z; rig.cy = Math.cos(yaw); rig.sy = Math.sin(yaw);
    const walk = sample(pose.door, rig.walk), time = Number.isFinite(pose.seconds) ? pose.seconds : 0;
    const signal = sample(pose.calm ? 0 : (time / 2 + side * .17) % 1, rig.signal);
    const ready = Math.max(0, Math.min(1, (pose.door - .8) * 5)), bob = pose.calm ? 0 : signal[6] * ready;
    part(rig, gfx, "torso", 0, bob, 0, 1, 0, 1, opts);
    part(rig, gfx, "head", 0, 1.62 + bob, 0, 1, 0, 1, opts);
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1, lx = s * .10, fy = walk[i * 2], fz = walk[i * 2 + 1];
      const knee = joint(.91 + bob, 0, fy, fz, THIGH, SHIN, 1, rig.joint), ky = knee[0], kz = knee[1];
      part(rig, gfx, "thigh", lx, .91 + bob, 0, ky - .91 - bob, kz, THIGH, opts);
      part(rig, gfx, "shin", lx, ky, kz, fy - ky, fz - kz, SHIN, opts);
      part(rig, gfx, "boot", lx, fy, fz, 1, 0, 1, opts);
      const sy = 1.38 + bob, hy = .85 + (signal[5] - .85) * ready + bob, hz = .03 + (signal[4] - .03) * ready;
      const elbow = joint(sy, 0, hy, hz, ARM, ARM, -1, rig.joint), ey = elbow[0], ez = elbow[1];
      part(rig, gfx, "upper", s * .22, sy, 0, ey - sy, ez, ARM, opts);
      part(rig, gfx, "fore", s * .22, ey, ez, hy - ey, hz - ez, ARM, opts);
    }
  }
  return Object.freeze({ create, free, draw, sample, joint, sampleCount: KEYS.length });
})();
