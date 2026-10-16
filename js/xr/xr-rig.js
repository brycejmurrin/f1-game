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

  // Scratch for unionViewProjTo (per frame: no alloc).
  const _uM = M4.ident(), _uW = M4.ident(), _uP = M4.ident();
  const _uC = [];   // [x, y, z] per frustum corner, eye 0 view space

  /**
   * ONE cull frustum containing every eye's — three.js WebXRManager's
   * setProjectionFromUnion, fitted to corners. WebXR eye projections are
   * asymmetric (outer half-angle ~10 deg wider than inner), so culling with eye
   * 0's planes dropped the wedge only the right eye sees (R3-RENDER-3: 11 % of
   * its prop triangles at Monaco). In eye 0's view basis the apex sits behind
   * the eyes where the outer side planes meet; every eye's near/far corners
   * then bound the tangents, so the result is conservative for canted views
   * too. Writes the union viewProj into `out`; false (out untouched) when an
   * eye is not a finite-near perspective.
   */
  function unionViewProjTo(out, eyes) {
    const v0 = eyes[0].view;
    let nC = 0, lt = Infinity, rt = -Infinity, xl = Infinity, xr = -Infinity, ys = 0, zs = -Infinity;
    for (let i = 0; i < eyes.length; i++) {
      const P = eyes[i].proj;
      if (!P || !(P[0] > 0) || !(P[5] > 0) || Math.abs(P[11] + 1) > 1e-6) return false;
      const n = P[14] / (P[10] - 1), fr = P[14] / (P[10] + 1);
      if (!(n > 0)) return false;
      const f = fr > n && Number.isFinite(fr) ? fr : 1e5;   // infinite far: past any world
      const tl = (P[8] - 1) / P[0], tr = (P[8] + 1) / P[0], tb = (P[9] - 1) / P[5], tt = (P[9] + 1) / P[5];
      if (tl < lt) lt = tl;
      if (tr > rt) rt = tr;
      M4.mulTo(_uM, v0, invertRigidTo(_uW, eyes[i].view));   // eye i view -> eye 0 view
      const ex = _uM[12];
      if (ex < xl) xl = ex;
      if (ex > xr) xr = ex;
      ys += _uM[13]; if (_uM[14] > zs) zs = _uM[14];
      for (let k = 0; k < 8; k++) {
        const d = k < 4 ? n : f, x = (k & 1 ? tr : tl) * d, y = (k & 2 ? tt : tb) * d;
        const c = _uC[nC] || (_uC[nC] = [0, 0, 0]);
        c[0] = _uM[0] * x + _uM[4] * y - _uM[8] * d + _uM[12];
        c[1] = _uM[1] * x + _uM[5] * y - _uM[9] * d + _uM[13];
        c[2] = _uM[2] * x + _uM[6] * y - _uM[10] * d + _uM[14];
        nC++;
      }
    }
    if (!(rt > lt)) return false;
    const zOff = (xr - xl) / (rt - lt);
    const ax = xl - lt * zOff, ay = ys / eyes.length, az = zs + zOff;
    let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity, near = Infinity, far = 0;
    for (let k = 0; k < nC; k++) {
      const c = _uC[k], d = az - c[2];
      if (!(d > 1e-6)) return false;
      const tx = (c[0] - ax) / d, ty = (c[1] - ay) / d;
      if (tx < mnx) mnx = tx;
      if (tx > mxx) mxx = tx;
      if (ty < mny) mny = ty;
      if (ty > mxy) mxy = ty;
      if (d < near) near = d;
      if (d > far) far = d;
    }
    for (let i = 0; i < 16; i++) _uP[i] = 0;
    _uP[0] = 2 / (mxx - mnx); _uP[8] = (mxx + mnx) / (mxx - mnx);
    _uP[5] = 2 / (mxy - mny); _uP[9] = (mxy + mny) / (mxy - mny);
    _uP[10] = -(far + near) / (far - near); _uP[11] = -1; _uP[14] = -2 * far * near / (far - near);
    for (let i = 0; i < 16; i++) _uW[i] = v0[i];
    _uW[12] -= ax; _uW[13] -= ay; _uW[14] -= az;   // T(-apex) * view0
    M4.mulTo(out, _uP, _uW);
    return true;
  }

  /**
   * Origin of the seated space expressed in the BASE reference space.
   * getOffsetReferenceSpace applies this transform's inverse to viewer poses:
   * use the head's position and yaw, not their inverse. All three position
   * components become zero at center; later head movement and pitch/roll remain.
   */
  function recenterOffsetFromPose(poseMatrix) {
    const m = poseMatrix;
    // +Z column gives yaw relative to WebXR's identity (which looks down -Z).
    // worldFromAnchorTo already maps that -Z gaze onto the car's forward.
    const yaw = Math.atan2(m[8], m[10]);
    return {
      position: { x: m[12], y: m[13], z: m[14] },
      orientation: { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
    };
  }

  /** Thumbstick X ∈ [-1,1] → a −1..1 steer command past a dead zone (Input's stick source). */
  function stickToSteer(x, deadzone) {
    const dz = deadzone == null ? 0.12 : deadzone;
    const v = +x || 0;
    if (Math.abs(v) < dz) return 0;
    const s = Math.sign(v);
    const mag = (Math.abs(v) - dz) / (1 - dz);
    return s * mag;   // −1..1 steer command; XrInput.inject sends it as remoteSample({ steer })
  }

  return {
    composeEye,
    unionViewProjTo,
    worldFromAnchorTo,
    invertRigidTo,
    recenterOffsetFromPose,
    stickToSteer,
  };
})();
Object.freeze(XrRig);
