const GarageDepartureWheels = (function () {
  "use strict";
  const WHEEL_RADIUS = 0.34;
  function spinRadians(distance) {
    return (Number.isFinite(distance) ? distance : 0) / WHEEL_RADIUS;
  }
  function create(gfx) { return CarWheels.createGarage(gfx); }

  function samplePose(pose, t, cfg, buf, options) {
    if (!pose || !cfg) return null;
    if (typeof GarageDepartureMotion === "undefined" || typeof GarageArrival === "undefined") return null;
    const opt = options || {};
    const T = GarageArrival.timeline(cfg, "out");
    const delay = GarageArrival.duration(cfg, "out") - T.base;
    const go = T.door + T.hold + delay;
    const rolling = Math.max(1e-9, T.settle - T.door - T.hold);
    const u = Math.max(0, Math.min(1, (Number(t) - go) / rolling));
    const out = buf || { eye: [0, 0, 0], aim: [0, 0, 0] };
    const motion = GarageDepartureMotion.sample(u, pose.side, out);
    pose.x = motion.x; pose.z = motion.z; pose.yaw = motion.yaw;
    pose.distance = motion.distance;
    const authoredCam = opt.camera === true || (opt.camera !== false && (cfg.angle === "cut" || opt.calm));
    if (authoredCam) {
      if (opt.calm) {
        motion.eye[0] = -4 * pose.side; motion.eye[1] = 3.2; motion.eye[2] = 15.7;
        motion.aim[0] = 3.5 * pose.side; motion.aim[1] = .65; motion.aim[2] = 7;
        pose.eye = motion.eye; pose.aim = motion.aim; pose.fov = 75;
      } else {
        pose.eye = motion.eye; pose.aim = motion.aim;
        pose.fov = motion.fov + (cfg.fov || 54) - 54;
      }
    }
    return motion;
  }

  function accumulateTravel(owner, pose) {
    if (!owner || !pose) return 0;
    const tr = owner.travel || (owner.travel = { x: 0, z: 0, distance: 0, primed: false });
    if (!tr.primed) {
      tr.x = pose.x; tr.z = pose.z; tr.distance = 0; tr.primed = true;
    } else {
      tr.distance += Math.hypot(pose.x - tr.x, pose.z - tr.z);
      tr.x = pose.x; tr.z = pose.z;
    }
    return tr.distance;
  }
  function resetTravel(owner) {
    if (owner && owner.travel) owner.travel.primed = false;
  }

  return Object.freeze({ create, spinRadians, WHEEL_RADIUS, samplePose, accumulateTravel, resetTravel });
})();
