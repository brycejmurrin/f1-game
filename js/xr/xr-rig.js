/* Apex 26 — XR seated-rig math (pure).
 *
 * Composes a cockpit world anchor with a WebXR view pose into the same
 * column-major frame matrices game.js / TLX already consume (view, proj,
 * viewProj, invProj, invViewProj, eye). No DOM, no THREE, no session —
 * unit-tested in isolation; js/xr/xr-session.js feeds live XRView data here.
 *
 * WebXR matrices are column-major Float32Array(16), same layout as M4.
 * A view's transform.matrix is the VIEWER pose in the reference space
 * (eye → reference); the view matrix is its inverse (reference → eye).
 * We then fold in the seated cockpit anchor so identity HMD pose looks
 * straight out of the car.
 */
"use strict";

const XrRig = (function () {
  // Scratch — composeEye is called up to twice per frame (L/R); no alloc.
  const _view = M4.ident();
  const _refFromWorld = M4.ident();
  const _worldFromRef = M4.ident();
  const _tmp = M4.ident();
  const _invProj = M4.ident();
  const _invVP = M4.ident();
  const _vp = M4.ident();
  const _eye = [0, 0, 0];

  /** Invert a rigid (rotation+translation) column-major 4×4 into `out`. */
  function invertRigidTo(out, m) {
    // R^T
    out[0] = m[0]; out[1] = m[4]; out[2] = m[8];  out[3] = 0;
    out[4] = m[1]; out[5] = m[5]; out[6] = m[9];  out[7] = 0;
    out[8] = m[2]; out[9] = m[6]; out[10] = m[10]; out[11] = 0;
    // t' = -R^T * t
    const tx = m[12], ty = m[13], tz = m[14];
    out[12] = -(out[0] * tx + out[4] * ty + out[8] * tz);
    out[13] = -(out[1] * tx + out[5] * ty + out[9] * tz);
    out[14] = -(out[2] * tx + out[6] * ty + out[10] * tz);
    out[15] = 1;
    return out;
  }

  /**
   * Build a world←reference basis from a seated cockpit anchor.
   * `fwd` points where the driver looks (car heading); `up` is world-ish up
   * (banked with the car when available). Columns of worldFromRef are
   * right, up, -fwd (OpenGL camera convention: view looks down −Z).
   */
  function worldFromAnchorTo(out, eye, fwd, up) {
    let fx = fwd[0], fy = fwd[1], fz = fwd[2];
    let fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
    let ux = up[0], uy = up[1], uz = up[2];
    let ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
    // right = fwd × up? No — right = up × (−fwd wait): OpenGL −Z is look dir,
    // so camera forward in world is +fwd for the driver, which is −Z in view.
    // right = normalize(cross(fwd, up))? Standard lookAt: right = cross(up, z)
    // where z = normalize(eye-target) = −fwd.
    const zx = -fx, zy = -fy, zz = -fz;
    let rx = uy * zz - uz * zy, ry = uz * zx - ux * zz, rz = ux * zy - uy * zx;
    let rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
    // re-orthogonalise up
    ux = zy * rz - zz * ry; uy = zz * rx - zx * rz; uz = zx * ry - zy * rx;
    out[0] = rx; out[1] = ry; out[2] = rz; out[3] = 0;
    out[4] = ux; out[5] = uy; out[6] = uz; out[7] = 0;
    out[8] = zx; out[9] = zy; out[10] = zz; out[11] = 0;
    out[12] = eye[0]; out[13] = eye[1]; out[14] = eye[2]; out[15] = 1;
    return out;
  }

  /**
   * Compose one eye into the caller's out-bags (all Float32Array length ≥ 16
   * except eyeOut length ≥ 3). `viewMat` / `projMat` are the XRView matrices
   * (view = inverse of transform.matrix when only the pose is available).
   *
   * Returns the same `out` object for chaining.
   */
  function composeEye(anchor, viewMat, projMat, out) {
    const eyeA = anchor.eye;
    const fwd = anchor.fwd;
    const up = anchor.up || [0, 1, 0];
    worldFromAnchorTo(_worldFromRef, eyeA, fwd, up);
    invertRigidTo(_refFromWorld, _worldFromRef);

    // view_from_world = view_from_ref * ref_from_world
    if (viewMat && viewMat.length >= 16) {
      M4.mulTo(_view, viewMat, _refFromWorld);
    } else {
      // No HMD pose yet — mannequin at the cockpit, looking along fwd.
      for (let i = 0; i < 16; i++) _view[i] = _refFromWorld[i];
    }

    const proj = projMat && projMat.length >= 16 ? projMat : null;
    const oView = out.view || _view;
    const oProj = out.proj;
    const oVP = out.viewProj || _vp;
    const oInvP = out.invProj || _invProj;
    const oInvVP = out.invViewProj || _invVP;
    const oEye = out.eye || _eye;

    for (let i = 0; i < 16; i++) oView[i] = _view[i];
    if (proj && oProj) {
      for (let i = 0; i < 16; i++) oProj[i] = proj[i];
      M4.mulTo(oVP, oProj, oView);
      M4.invertTo(oInvP, oProj);
      M4.invertTo(oInvVP, oVP);
    } else if (oProj) {
      // Identity-ish fallback so callers that always read proj don't NaN.
      for (let i = 0; i < 16; i++) oProj[i] = i % 5 === 0 ? 1 : 0;
      M4.mulTo(oVP, oProj, oView);
      M4.invertTo(oInvP, oProj);
      M4.invertTo(oInvVP, oVP);
    }

    // Eye position = world translation of the inverse view (third column of
    // inv(view) / or −R^T * t of view).
    invertRigidTo(_tmp, oView);
    oEye[0] = _tmp[12]; oEye[1] = _tmp[13]; oEye[2] = _tmp[14];

    out.view = oView;
    out.proj = oProj;
    out.viewProj = oVP;
    out.invProj = oInvP;
    out.invViewProj = oInvVP;
    out.eye = oEye;
    return out;
  }

  /**
   * Offset used for recenter: given the current viewer pose matrix in the
   * reference space, return a rigid transform that maps that pose back to
   * the seated origin (identity). Applied via XRReferenceSpace.getOffsetReferenceSpace.
   * Returns a plain { position: {x,y,z}, orientation: {x,y,z,w} } for XRRigidTransform.
   */
  function recenterOffsetFromPose(poseMatrix) {
    // Want offset O such that O * pose ≈ I at the seated origin for yaw/pos.
    // Keep Y (floor) from the pose so standing height is preserved; zero XZ
    // translation and yaw about Y.
    const m = poseMatrix;
    const x = m[12], z = m[14];
    // Yaw from the rotation's forward (−Z column of the pose = where the HMD looks in ref).
    // pose columns: right=0.., up=4.., -fwd=8.., t=12..
    const fx = -m[8], fz = -m[10];
    const yaw = Math.atan2(fx, fz);
    const hy = yaw * 0.5;
    const sy = Math.sin(-hy), cy = Math.cos(-hy);   // inverse yaw
    // Inverse translation in XZ after inverse yaw: R(-yaw) * (-x, 0, -z)
    const cos = Math.cos(-yaw), sin = Math.sin(-yaw);
    const ox = cos * (-x) + sin * (-z);
    const oz = -sin * (-x) + cos * (-z);
    return {
      position: { x: ox, y: 0, z: oz },
      orientation: { x: 0, y: sy, z: 0, w: cy },
    };
  }

  /** Thumbstick X ∈ [-1,1] → tilt-roll degrees for Input.steerToTilt. */
  function stickToSteer(x, deadzone) {
    const dz = deadzone == null ? 0.12 : deadzone;
    const v = +x || 0;
    if (Math.abs(v) < dz) return 0;
    const s = Math.sign(v);
    const mag = (Math.abs(v) - dz) / (1 - dz);
    return s * mag;   // −1..1 steer command; caller maps through Input.steerToTilt
  }

  return {
    composeEye,
    worldFromAnchorTo,
    invertRigidTo,
    recenterOffsetFromPose,
    stickToSteer,
  };
})();
