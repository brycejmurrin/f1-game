/* Garage-only articulated wheels: one cached fitted set, transform-only playback. */
const GarageDepartureWheels = (function () {
  "use strict";
  function create(gfx) {
    let key = "", meshes = null;
    const local = new Float32Array(16), world = new Float32Array(16);
    function release() {
      if (meshes && gfx.freeMesh) for (const mesh of meshes) gfx.freeMesh(mesh);
      meshes = null; key = "";
    }
    function prepare(next, liv, tiers) {
      if (meshes && key === next) return;
      release();
      const v = tiers._visual || {}, t = v.tyres, b = v.brakes, w = v.wheels, tint = CarWheels.tints(liv);
      const band = t && t.band || Car3D.TYRE_BAND[tiers.tyres] || Car3D.TYRE_BAND[1];
      const cal = tint.cal || (b && b.cal) || Car3D.BRAKE_CALIPER[tiers.brakes];
      const rim = tint.rim || (b && b.rim);
      const f = Car3D.buildWheelLayers(.32, band, cal, rim, false, t, b, w, tint.ink, tint.surf);
      const r = Car3D.buildWheelLayers(.38, band, cal, rim, false, t, b, w, tint.ink, tint.surf);
      meshes = [f.rotating, f.fixed, r.rotating, r.fixed].map(data => gfx.createMesh(data));
      key = next;
    }
    const opts = { doubleSided: true };
    function draw(base, distance, steer, material) {
      if (!meshes) return;
      Object.setPrototypeOf(opts, material);
      const spin = distance / .34, cp = Math.cos(spin), sp = Math.sin(spin);
      for (let axle = 0; axle < 2; axle++) for (let side = -1; side <= 1; side += 2) {
        const a = axle ? 0 : steer, ca = Math.cos(a), sa = Math.sin(a);
        for (let fixed = 0; fixed < 2; fixed++) {
          const c = fixed ? 1 : cp, s = fixed ? 0 : sp;
          local.fill(0); local[0] = ca; local[2] = -sa;
          local[4] = sa * s; local[5] = c; local[6] = ca * s;
          local[8] = sa * c; local[9] = -s; local[10] = ca * c;
          local[12] = side * (axle ? .76 : .79); local[13] = .34;
          local[14] = axle ? -1.6 : 1.7; local[15] = 1;
          M4.mulTo(world, base, local);
          gfx.draw(meshes[axle * 2 + fixed], world, opts);
        }
      }
    }
    return { prepare, draw, release };
  }
  return Object.freeze({ create });
})();
