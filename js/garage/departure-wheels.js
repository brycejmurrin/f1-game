/* Cached garage-departure wheel layers; spin is path distance / WHEEL_RADIUS. */
const GarageDepartureWheels = (function () {
  "use strict";
  // Matches CarWheels.createGarage and tools/garage/author-departure.py.
  const WHEEL_RADIUS = 0.34;
  function spinRadians(distance) {
    return (Number.isFinite(distance) ? distance : 0) / WHEEL_RADIUS;
  }
  // Same object CarWheels returns — garage-mesh asserts reference equality.
  function create(gfx) { return CarWheels.createGarage(gfx); }

  /**
   * Overlay the Blender departure onto a poseOut base for every tuner angle.
   * Sets pose.distance to the authored arc length so rims roll without skating.
   * The authored follow camera applies to CUT and to calm/reduced motion; other
   * angles keep poseOut's eye/aim/fov. Returns the motion buffer, or null when
   * the table is not loaded.
   */
  function samplePose(pose, t, cfg, buf, options) {
    if (!pose || !cfg) return null;
    if (typeof GarageDepartureMotion === "undefined" || typeof GarageArrival === "undefined") return null;
    const opt = options || {};
    const out = buf || { eye: [0, 0, 0], aim: [0, 0, 0] };
    const motion = GarageDepartureMotion.sample(rollProgress(t, cfg), pose.side, out);
    pose.x = motion.x; pose.z = motion.z; pose.yaw = motion.yaw;
    pose.distance = motion.distance;
    const authoredCam = opt.camera === true || (opt.camera !== false && (cfg.angle === "cut" || opt.calm));
    if (authoredCam) applyAuthoredCamera(pose, motion, cfg, opt.calm);
    return motion;
  }

  // 0..1 through the rolling window: after the door opens, the hold and any
  // departure delay, until the car settles outside.
  function rollProgress(t, cfg) {
    const T = GarageArrival.timeline(cfg, "out");
    const delay = GarageArrival.duration(cfg, "out") - T.base;
    const go = T.door + T.hold + delay;
    const rolling = Math.max(1e-9, T.settle - T.door - T.hold);
    return Math.max(0, Math.min(1, (Number(t) - go) / rolling));
  }

  // Calm (reduced motion) replaces the follow shot with a still exterior
  // establishing view; otherwise the authored lens is offset by the tuner fov.
  function applyAuthoredCamera(pose, motion, cfg, calm) {
    if (calm) {
      motion.eye[0] = -4 * pose.side; motion.eye[1] = 3.2; motion.eye[2] = 15.7;
      motion.aim[0] = 3.5 * pose.side; motion.aim[1] = .65; motion.aim[2] = 7;
      pose.eye = motion.eye; pose.aim = motion.aim; pose.fov = 75;
    } else {
      pose.eye = motion.eye; pose.aim = motion.aim;
      pose.fov = motion.fov + (cfg.fov || 54) - 54;
    }
  }

  /** Horizontal-only travel so ground heave cannot spin the rims. Seek-safe if reset(). */
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
