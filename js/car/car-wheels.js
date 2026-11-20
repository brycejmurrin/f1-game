"use strict";

const CarWheels = (function () {
  const WHEEL_R = 0.34;
  const TWO_PI = Math.PI * 2;
  const _step = { rear: 0, front: 0 };
  function phaseStep(speed, dt, wheelR, lock) {
    const r = wheelR > 0 ? wheelR : WHEEL_R;
    const spin = (speed || 0) / r * (dt || 0);
    const L = lock == null ? 0 : lock;
    _step.rear = spin; _step.front = spin * (1 - L);
    return _step;
  }
  function wrapPhase(rad) {
    const x = (rad || 0) % TWO_PI;
    return x < 0 ? x + TWO_PI : x;
  }
  const _tintMemo = new WeakMap();
  const NO_TINTS = Object.freeze({ rim: null, cal: null, ink: null, surf: null, key: "" });
  function rimSurfOf(v) {
    const M = typeof CarMaterials !== "undefined" ? CarMaterials : null;
    if (!M || typeof v !== "string") return null;
    return v === "gloss" ? M.SURFACES.paint : Object.hasOwn(M.FINISH_SURFACE, v) ? M.FINISH_SURFACE[v] : null;
  }
  function tintColour(v) {
    if (!v) return null;
    if (Array.isArray(v)) return v.length >= 3 && v.slice(0, 3).every(Number.isFinite) ? [v[0], v[1], v[2]] : null;
    const m = typeof v === "string" && /^#?([0-9a-f]{6})$/i.exec(v);
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }
  const q255 = (c) => c ? c.map((x) => Math.round(x * 255)).join(",") : "";
  function tints(liv) {
    if (!liv || typeof liv !== "object") return NO_TINTS;
    let t = _tintMemo.get(liv);
    if (t) return t;
    const rim = tintColour(liv.rimTint), cal = tintColour(liv.caliperTint), ink = tintColour(liv.sidewallInk), surf = rimSurfOf(liv.rimFinish);
    t = !rim && !cal && !ink && !surf ? NO_TINTS : Object.freeze({ rim, cal, ink, surf,
      key: "|w" + q255(rim) + ";" + q255(cal) + (ink ? ";" + q255(ink) : "") + (surf ? ";f" + surf : "") });
    _tintMemo.set(liv, t);
    return t;
  }
  function createGarage(gfx) {
    let key = "", meshes = null, matRef = null;
    const local = new Float32Array(16), world = new Float32Array(16);
    function release() {
      if (meshes && gfx.freeMesh) for (const mesh of meshes) gfx.freeMesh(mesh);
      meshes = null; key = ""; matRef = null;
    }
    function prepare(next, liv, tiers) {
      if (meshes && key === next) return;
      release();
      const v = tiers._visual || {}, t = v.tyres, b = v.brakes, w = v.wheels, tint = tints(liv);
      const band = t && t.band || Car3D.TYRE_BAND[tiers.tyres] || Car3D.TYRE_BAND[1];
      const cal = tint.cal || (b && b.cal) || Car3D.BRAKE_CALIPER[tiers.brakes];
      const rim = tint.rim || (b && b.rim);
      const f = Car3D.buildWheelLayers(.32, band, cal, rim, false, t, b, w, tint.ink, tint.surf);
      const r = Car3D.buildWheelLayers(.38, band, cal, rim, false, t, b, w, tint.ink, tint.surf);
      const pending = [];
      try {
        for (const data of [f.rotating, f.fixed, r.rotating, r.fixed]) pending.push(gfx.createMesh(data));
      } catch (error) {
        if (gfx.freeMesh) for (const mesh of pending) gfx.freeMesh(mesh);
        throw error;
      }
      meshes = pending; key = next;
    }
    const opts = { doubleSided: true };
    function draw(base, distance, steer, material) {
      if (!meshes) return;
      if (material !== matRef) { Object.setPrototypeOf(opts, material || null); matRef = material; }
      const spin = (distance || 0) / WHEEL_R, cp = Math.cos(spin), sp = Math.sin(spin);
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
  function create(context) {
    const { SURFACES, TYRE, INTAKE } = context;
    const { addTri, addQuad, addBox, addSpan } = context.geometry;

    const LIP      = [0.40, 0.41, 0.44];
    const COVER    = [0.24, 0.245, 0.27];
    const COVER_IN = [0.14, 0.14, 0.16];
    const LIP_R  = 0.90;
    const DISH_R = 0.40;
    const DISH_D = 0.050;
    const OPEN_SPOKES = 3;

    function addWheel(out, cx, cy, cz, r, w, bandColor, caliperColor, rimColor,
                      grooved, tyreStyle, fixedOut, brakeStyle, wheelStyle, inkColor, rimSurf) {
      const RIM_DEF = [0.31, 0.31, 0.34];
      const RC = rimColor || RIM_DEF, RS = rimSurf || SURFACES.metal;
      const RC_DEEP = [RC[0] * 0.39, RC[1] * 0.39, RC[2] * 0.41];
      const SEG = 24, rw = typeof CarShade !== "undefined" && CarShade.any();
      const x0 = cx - w/2, x1 = cx + w/2;
      const rimR = r * 0.68;
      const coverOpen = brakeStyle && brakeStyle.coverOpen || 0;
      const useCover = !!(tyreStyle && tyreStyle.cover) || !!(wheelStyle && wheelStyle.cover);
      const deepCover = useCover && Math.round((wheelStyle && wheelStyle.dish) || 0) >= 2;
      const dishD = deepCover ? DISH_D * 0.35 : DISH_D;
      const faceCol = deepCover ? RC : COVER, faceSurf = deepCover ? RS : SURFACES.carbon;
      const floorCol = deepCover ? RC_DEEP : COVER_IN;
      const hubLift = deepCover ? dishD + 0.011 : 0;
      const rotorScale = brakeStyle && brakeStyle.rotorScale || 1;
      const tyreShoulder = Math.max(0, Math.min(2, Math.round((tyreStyle && tyreStyle.shoulder) || 0)));
      const TYRE_CROWN = 0.948, CROWN_W = 0.090;
      const SH1 = 0.920, SH1_W = 0.11, SH2 = 0.874, SH2_W = 0.15;
      const edgeRm = tyreShoulder === 2 ? SH2 : tyreShoulder === 1 ? SH1 : TYRE_CROWN;
      const grooveCount = tyreStyle && tyreStyle.grooves != null
        ? tyreStyle.grooves : grooved ? 3 : 0;
      const grooveDepth = tyreStyle && tyreStyle.grooveDepth || 0.045;
      const PROFILE = [];
      if (tyreShoulder === 1) {
        PROFILE.push([0, SH1], [SH1_W, 1]);
      } else if (tyreShoulder === 2) {
        PROFILE.push([0, SH2], [SH2_W, 1]);
      } else {
        PROFILE.push([0, TYRE_CROWN], [CROWN_W, 1]);
      }
      for (let g = 0; g < grooveCount; g++) {
        const mid = (g + 1) / (grooveCount + 1);
        PROFILE.push([mid - 0.025, 1], [mid, 1 - grooveDepth], [mid + 0.025, 1]);
      }
      if (tyreShoulder === 1) {
        PROFILE.push([1 - SH1_W, 1], [1, SH1]);
      } else if (tyreShoulder === 2) {
        PROFILE.push([1 - SH2_W, 1], [1, SH2]);
      } else {
        PROFILE.push([1 - CROWN_W, 1], [1, TYRE_CROWN]);
      }
      const i0 = out.pos.length / 3;
      for (const [xf, rm] of PROFILE) {
        const x = x0 + (x1 - x0) * xf, rr = r * rm;
        for (let i = 0; i < SEG; i++) {
          const a = (i / SEG) * Math.PI * 2;
          const c = Math.cos(a), s = Math.sin(a);
          out.pos.push(x, cy + rr * c, cz + rr * s);
          out.nrm.push(0, c, s);
          out.col.push(TYRE[0], TYRE[1], TYRE[2]);
          out.mat.push(SURFACES.rubber);
        }
      }
      for (let ri = 0; ri < PROFILE.length - 1; ri++) {
        for (let i = 0; i < SEG; i++) {
          const i2 = (i + 1) % SEG;
          const A = i0 + ri*SEG + i, B = i0 + ri*SEG + i2, C = i0 + (ri+1)*SEG + i2, D = i0 + (ri+1)*SEG + i;
          out.idx.push(A, B, C, A, C, D);
        }
      }
      if (rw) CarShade.vertexNormals(out, i0, out.pos.length / 3);
      const outerR = r * edgeRm;
      for (let i = 0; i < SEG; i++) {
        const a0 = (i / SEG) * Math.PI * 2, a1 = ((i+1) / SEG) * Math.PI * 2;
        const ya0 = cy + outerR*Math.cos(a0), za0 = cz + outerR*Math.sin(a0);
        const ya1 = cy + outerR*Math.cos(a1), za1 = cz + outerR*Math.sin(a1);
        const rya0 = cy + rimR*Math.cos(a0), rza0 = cz + rimR*Math.sin(a0);
        const rya1 = cy + rimR*Math.cos(a1), rza1 = cz + rimR*Math.sin(a1);
        const A0=[x0,ya0,za0], A1=[x0,ya1,za1], B0=[x1,ya0,za0], B1=[x1,ya1,za1];
        const R0=[x1,rya0,rza0], R1=[x1,rya1,rza1];
        addQuad(out, B0, B1, R1, R0, TYRE, SURFACES.rubber);
        const L0=[x0,rya0,rza0], L1=[x0,rya1,rza1];
        addQuad(out, A0, A1, L1, L0, TYRE, SURFACES.rubber);
        const aMid = (i + 0.5) / SEG * Math.PI * 2;
        const calClock = brakeStyle && brakeStyle.caliperPos || 0;
        const peekCal = useCover && coverOpen > 0
          && Math.abs(Math.atan2(Math.sin(aMid - calClock), Math.cos(aMid - calClock))) < 0.28;
        const coverSeg = useCover && (!coverOpen || i % (coverOpen >= 2 ? 2 : 3) !== 0) && !peekCal;
        if (coverSeg || !useCover) {
          for (const sd of [[x1, 1], [x0, -1]]) {
            const xw = sd[0], dir = sd[1];
            const P = (rad, a, dx) => [xw + dir * dx,
              cy + rad * Math.cos(a), cz + rad * Math.sin(a)];
            addQuad(out, P(rimR, a0, 0), P(rimR, a1, 0),
                         P(rimR * LIP_R, a1, 0), P(rimR * LIP_R, a0, 0), LIP, RS);
            if (!useCover) continue;
            addQuad(out, P(rimR * LIP_R, a0, 0), P(rimR * LIP_R, a1, 0),
                         P(rimR * DISH_R, a1, dishD), P(rimR * DISH_R, a0, dishD),
                         faceCol, faceSurf);
            addTri(out, [xw + dir * dishD, cy, cz],
                         P(rimR * DISH_R, a0, dishD), P(rimR * DISH_R, a1, dishD),
                         floorCol, SURFACES.carbon);
          }
        }
      }
      const coverRibs = useCover && Math.round((wheelStyle && wheelStyle.dish) || 0) < 2;
      if (coverRibs) for (const sd of [[x1, 1], [x0, -1]]) {
        const xw = sd[0], dir = sd[1];
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 + 0.31, hw = 0.13;
          const P = (rad, aa, dx) => [xw + dir * dx,
            cy + rad * Math.cos(aa), cz + rad * Math.sin(aa)];
          addQuad(out, P(rimR * DISH_R, a - hw, DISH_D * 0.22), P(rimR * DISH_R, a + hw, DISH_D * 0.22),
                       P(rimR * 0.28, a + hw * 1.8, DISH_D * 0.22), P(rimR * 0.28, a - hw * 1.8, DISH_D * 0.22),
                       LIP, RS);
        }
      }
      const rotorOuter = r * Math.min(0.52, 0.32 * rotorScale);
      const rotorInner = r * 0.17;
      const rotorDetail = brakeStyle && brakeStyle.rotor || 0;
      const discFaceRotor = Math.max(0, Math.min(2, Math.round((brakeStyle && brakeStyle.discFace) || 0)));
      const carbonDisc = rotorDetail >= 2 || discFaceRotor > 0;
      const rotorCol = carbonDisc ? [0.12, 0.12, 0.13] : [0.24, 0.24, 0.26];
      const rotorSurf = carbonDisc ? SURFACES.carbon : SURFACES.metal;
      for (let i = 0; i < SEG; i++) {
        const a0 = i / SEG * Math.PI * 2, a1 = (i + 1) / SEG * Math.PI * 2;
        const E = (a, xx) => [xx, cy + rotorOuter * Math.cos(a), cz + rotorOuter * Math.sin(a)];
        addQuad(out, E(a0, x0 + 0.008), E(a1, x0 + 0.008), E(a1, x1 - 0.008), E(a0, x1 - 0.008),
          rotorCol, rotorSurf);
      }
      for (const face of [[x0 + 0.008, -1], [x1 - 0.008, 1]]) {
        for (let i = 0; i < SEG; i++) {
          const a0 = i / SEG * Math.PI * 2, a1 = (i + 1) / SEG * Math.PI * 2;
          const P = (rad, a) => [face[0], cy + rad*Math.cos(a), cz + rad*Math.sin(a)];
          addQuad(out, P(rotorOuter,a0), P(rotorOuter,a1), P(rotorInner,a1), P(rotorInner,a0),
            rotorCol, rotorSurf);
        }
        for (let i = 0; i < rotorDetail * 3; i++) {
          const a = i / (rotorDetail * 3) * Math.PI * 2, rr = (rotorInner + rotorOuter) * 0.5;
          addBox(out, face[0], cy + rr*Math.cos(a), cz + rr*Math.sin(a),
            0.012, 0.018, 0.018, [0.07,0.07,0.08], SURFACES.carbon);
        }
        if (rotorDetail >= 2) {
          const hatOuter = rotorInner * 1.08, hatInner = rotorInner * 0.52;
          const HAT_SEG = 8;
          for (let i = 0; i < HAT_SEG; i++) {
            const a0 = i / HAT_SEG * Math.PI * 2, a1 = (i + 1) / HAT_SEG * Math.PI * 2;
            const P = (rad, a) => [face[0], cy + rad*Math.cos(a), cz + rad*Math.sin(a)];
            addQuad(out, P(hatOuter,a0), P(hatOuter,a1), P(hatInner,a1), P(hatInner,a0),
              [0.34, 0.34, 0.37], SURFACES.metal);
          }
        }
        if (discFaceRotor > 0) {
          const marks = discFaceRotor === 1 ? 6 : 4;
          const rad = (rotorInner + rotorOuter) * 0.55;
          const sz = discFaceRotor === 1 ? 0.012 : 0.022;
          const slot = discFaceRotor === 1 ? 1 : 0.40;
          for (let k = 0; k < marks; k++) {
            const a = (k / marks) * Math.PI * 2 + 0.14;
            const my = cy + rad * Math.cos(a), mz = cz + rad * Math.sin(a);
            const hy = sz * 0.5, hz = sz * slot * 0.5;
            addQuad(out,
              [face[0], my - hy, mz - hz], [face[0], my - hy, mz + hz],
              [face[0], my + hy, mz + hz], [face[0], my + hy, mz - hz],
              INTAKE, SURFACES.carbon);
          }
        }
      }
      const BAND = bandColor || [0.85, 0.10, 0.08];
      const bandWidth = tyreStyle && tyreStyle.bandWidth != null ? tyreStyle.bandWidth : 0.09;
      const bandArcs = tyreStyle && (tyreStyle.bandArcs === 2 || tyreStyle.bandArcs === 4) ? tyreStyle.bandArcs : 0;
      const letters = Math.max(0, Math.min(2, Math.round((tyreStyle && tyreStyle.letters) || 0)));
      const gapHalf = bandArcs === 2 ? 0.42 : 0.26;
      const inGap = (a) => {
        if (!bandArcs) return false;
        const step = (Math.PI * 2) / bandArcs;
        const d = ((a - Math.PI / 2) % step + step) % step;
        return d < gapHalf || d > step - gapHalf;
      };
      const outerB = 0.96 * edgeRm, innerB = Math.max(0.76 * edgeRm, outerB - bandWidth);
      const GLYPH = [0.95, 0.95, 0.96];
      const slab = (f, b, col, skipAD, skipBC) => {
        const ref = [0, 1, 2].map((k) => (f[0][k] + f[1][k] + f[2][k] + f[3][k] + b[0][k] + b[1][k] + b[2][k] + b[3][k]) / 8);
        const face = (q) => {
          const u = [0, 1, 2].map((k) => q[1][k] - q[0][k]), v = [0, 1, 2].map((k) => q[3][k] - q[0][k]);
          const m = [0, 1, 2].map((k) => (q[0][k] + q[2][k]) / 2 - ref[k]);
          const d = (u[1] * v[2] - u[2] * v[1]) * m[0] + (u[2] * v[0] - u[0] * v[2]) * m[1] + (u[0] * v[1] - u[1] * v[0]) * m[2];
          if (d > 0) addQuad(out, q[0], q[1], q[2], q[3], col, SURFACES.rubber);
          else addQuad(out, q[3], q[2], q[1], q[0], col, SURFACES.rubber);
        };
        face(f); face(b); face([f[0], f[1], b[1], b[0]]); face([f[2], f[3], b[3], b[2]]);
        if (!skipBC) face([f[1], f[2], b[2], b[1]]);
        if (!skipAD) face([f[3], f[0], b[0], b[3]]);
      };
      const sector = (xF, xB, r0, r1, a0, a1, col, skipAD, skipBC) => {
        const Q = (x) => [[x, cy + r1 * Math.cos(a0), cz + r1 * Math.sin(a0)], [x, cy + r1 * Math.cos(a1), cz + r1 * Math.sin(a1)],
          [x, cy + r0 * Math.cos(a1), cz + r0 * Math.sin(a1)], [x, cy + r0 * Math.cos(a0), cz + r0 * Math.sin(a0)]];
        slab(Q(xF), Q(xB), col, skipAD, skipBC);
      };
      const glyphRow = (xF, xB, aMid, span, r0, r1, n) => {
        for (let g = 0; g < n; g++) {
          const t0 = aMid - span / 2 + (g / n) * span, w = (span / n) * (g % 3 === 1 ? 0.45 : 0.72);
          sector(xF, xB, r * r0, r * r1, t0, t0 + w, GLYPH);
        }
      };
      for (const bs of [[x0, -1], [x1, 1]]) {
        const xb = bs[0] + bs[1] * 0.004;
        const xF = bs[0] + bs[1] * 0.0025, xB = bs[0] - bs[1] * 0.002;
        const letterXF = bs[0] + bs[1] * (letters === 2 ? 0.024 : 0.022);
        const letterXB = bs[0] - bs[1] * 0.002;
        const segIn = (i) => !inGap(((i + 0.5) / SEG) * Math.PI * 2);
        for (let i = 0; i < SEG; i++) {
          const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2;
          if (bandArcs) {
            if (segIn(i)) sector(xF, xB, r * innerB, r * outerB, a0, a1, BAND, segIn((i + SEG - 1) % SEG), segIn((i + 1) % SEG));
            continue;
          }
          const P = (rad, a) => [xb, cy + rad * Math.cos(a), cz + rad * Math.sin(a)];
          const A = P(r * outerB, a0), B = P(r * outerB, a1), C = P(r * innerB, a1), D = P(r * innerB, a0);
          addQuad(out, A, B, C, D, BAND, SURFACES.rubber);
        }
        if (letters === 1 && bandArcs) {
          const mid = (outerB + innerB) / 2;
          for (let k = 0; k < bandArcs; k++) {
            glyphRow(letterXF, letterXB, Math.PI / 2 + k * (Math.PI * 2) / bandArcs, gapHalf * 1.5,
                     mid - 0.055, mid + 0.055, 5);
          }
        } else if (letters === 2) {
          for (let k = 0; k < 4; k++) {
            glyphRow(letterXF, letterXB, k * Math.PI / 2 + Math.PI / 4, 1.05, innerB - 0.130, innerB - 0.010, 7);
          }
        }
      }
      if (tyreStyle && tyreStyle.rimGuard) {
        for (const bs of [[x0, -1], [x1, 1]]) {
          for (let i = 0; i < SEG; i++) {
            const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2;
            sector(bs[0] + bs[1] * 0.007, bs[0] + bs[1] * 0.002, r * 0.705, r * 0.735, a0, a1, BAND, true, true);
          }
        }
      }
      if (tyreStyle && tyreStyle.sipes) {
        const SIPE = [0.30, 0.30, 0.32], N = 18, xm = (x0 + x1) / 2;
        for (let k = 0; k < N; k++) {
          const a = (k / N) * Math.PI * 2, rr = r * 1.004, hw = 0.022;
          const P = (x, t, R) => [x, cy + R * Math.cos(t), cz + R * Math.sin(t)];
          const Q = (xa, xb2, R) => [P(xa, a, R), P(xb2, a + 0.12, R), P(xb2, a + 0.12 + hw * 3, R), P(xa, a + hw * 3, R)];
          for (const [xa, xb2] of [[x0 + (x1 - x0) * SH2_W, xm], [x1 - (x1 - x0) * SH2_W, xm]]) {
            slab(Q(xa, xb2, rr), Q(xa, xb2, r * 0.996), SIPE);
          }
        }
      }
      const sidewall = Math.max(0, Math.min(2, Math.round((tyreStyle && tyreStyle.sidewall) || 0))) || (inkColor ? 1 : 0);
      if (sidewall > 0) {
        const SW = inkColor || [0.16, 0.16, 0.17];
        const rings = sidewall === 2 ? [[0.700, 0.740], [0.775, 0.805]] : [[0.700, 0.740]];
        for (const bs of [[x0, -1], [x1, 1]]) {
          const xb = bs[0] + bs[1] * 0.006;
          for (const ring of rings) for (let i = 0; i < SEG; i++) {
            const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2;
            const P = (rad, a) => [xb, cy + rad * Math.cos(a), cz + rad * Math.sin(a)];
            addQuad(out, P(r * ring[1], a0), P(r * ring[1], a1),
                         P(r * ring[0], a1), P(r * ring[0], a0), SW, SURFACES.rubber);
          }
        }
      }

      const VANE = [0.26, 0.26, 0.30];
      const coverVanes = useCover
        ? (wheelStyle && wheelStyle.coverVanes != null ? wheelStyle.coverVanes
          : tyreStyle && tyreStyle.coverVanes != null ? tyreStyle.coverVanes
          : (deepCover ? 0 : 6))
        : 0;
      for (const ss of [[x0, -1], [x1, 1]]) {
        const xs = ss[0] + ss[1] * 0.014;
        for (let k = 0; k < coverVanes; k++) {
          const a = (k / coverVanes) * Math.PI * 2 + 0.25;
          const uy = Math.cos(a), uz = Math.sin(a), py = -Math.sin(a), pz = Math.cos(a);
          const hw = 0.010, ri = rimR * 0.46, ro = rimR * 0.98;
          const P = (rad, s) => [xs, cy + uy * rad + py * hw * s, cz + uz * rad + pz * hw * s];
          addQuad(out, P(ri, 1), P(ro, 1), P(ro, -1), P(ri, -1), VANE, SURFACES.metal);
        }
        const discFace = Math.max(0, Math.min(2, Math.round((brakeStyle && brakeStyle.discFace) || 0)));
        if (discFace > 0) {
          const marks = discFace === 1 ? 10 : 6;
          for (let k = 0; k < marks; k++) {
            const a = (k / marks) * Math.PI * 2 + 0.14;
            const rad = rimR * 0.74;
            const my = cy + rad * Math.cos(a), mz2 = cz + rad * Math.sin(a);
            const sz = discFace === 1 ? 0.016 : 0.030;
            addBox(out, xs, my, mz2, 0.004, sz, sz * (discFace === 1 ? 1 : 0.45),
                   [0.05, 0.05, 0.06], SURFACES.carbon);
          }
        }
      }
      if (!useCover && brakeStyle && brakeStyle.drum) {
        const dR = Math.max(rimR * 0.84, rotorOuter + 0.012), dIn = rimR * (wheelStyle && wheelStyle.blownAxle ? 0.46 : 0.25);
        const DRUM = [0.34, 0.34, 0.37], FOIL = [0.80, 0.64, 0.26], SLOT = [0.02, 0.02, 0.025];
        for (let i = 0; i < SEG; i++) {
          const a0 = i / SEG * Math.PI * 2, a1 = (i + 1) / SEG * Math.PI * 2;
          const E = (rad, a, xx) => [xx, cy + rad * Math.cos(a), cz + rad * Math.sin(a)];
          addQuad(out, E(dR, a0, x0 + 0.004), E(dR, a1, x0 + 0.004), E(dR, a1, x1 - 0.004), E(dR, a0, x1 - 0.004), FOIL, SURFACES.metal);
          addQuad(out, E(dIn, a1, x0 + 0.004), E(dIn, a0, x0 + 0.004), E(dIn, a0, x1 - 0.004), E(dIn, a1, x1 - 0.004), DRUM, SURFACES.carbon);
          for (const xf of [x0 + 0.004, x1 - 0.004]) {
            addQuad(out, E(dIn, a0, xf), E(dIn, a1, xf), E(dR * 0.80, a1, xf), E(dR * 0.80, a0, xf), DRUM, SURFACES.carbon);
            addQuad(out, E(dR * 0.80, a0, xf), E(dR * 0.80, a1, xf), E(dR, a1, xf), E(dR, a0, xf), FOIL, SURFACES.metal);
          }
        }
        const H = 0.0055;
        for (const xf of [x0 + 0.004 - 0.0035, x1 - 0.004 + 0.0035]) for (const [rf, n] of [[0.38, 12], [0.55, 18], [0.70, 24]]) for (let k = 0; k < n; k++) {
          const a = k / n * Math.PI * 2 + rf, rr = dR * rf, hy = cy + rr * Math.cos(a), hz = cz + rr * Math.sin(a);
          addQuad(out, [xf, hy - H, hz - H], [xf, hy - H, hz + H], [xf, hy + H, hz + H], [xf, hy + H, hz - H], SLOT, SURFACES.carbon);
        }
      }
      const HUBCAP = RC;
      const NUT = caliperColor || bandColor || [0.85, 0.72, 0.10];
      const hubFrac = useCover ? 0.46 : 0.22;
      const blownAxle = !useCover && !!(wheelStyle && wheelStyle.blownAxle);
      const spokeSplit = !!(wheelStyle && wheelStyle.spokeSplit);
      for (const ss of [[x0, -1], [x1, 1]]) {
        const dir = ss[1], hubX = ss[0] + dir * hubLift, xc0 = hubX - dir * 0.014, hcR = rimR * (blownAxle ? 0.44 : hubFrac), ctr = [xc0, cy, cz];
        if (blownAxle) {
          const boreR = hcR * 0.62, BORE = [0.02, 0.02, 0.025];
          const lipC = (wheelStyle && wheelStyle.nut) || LIP;
          for (let i = 0; i < SEG; i++) {
            const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2;
            const P = (rad, a, x) => [x, cy + rad * Math.cos(a), cz + rad * Math.sin(a)];
            addQuad(out, P(boreR, a0, xc0), P(boreR, a1, xc0), P(hcR, a1, xc0), P(hcR, a0, xc0), HUBCAP, RS);
            addQuad(out, P(boreR, a0, xc0 + dir * 0.012), P(boreR * 1.18, a0, xc0 + dir * 0.012),
                         P(boreR * 1.18, a1, xc0 + dir * 0.012), P(boreR, a1, xc0 + dir * 0.012), lipC, SURFACES.metal);
            addQuad(out, P(boreR, a0, xc0 + dir * 0.012), P(boreR, a1, xc0 + dir * 0.012),
                         P(boreR, a1, xc0 - dir * 0.06), P(boreR, a0, xc0 - dir * 0.06), BORE, SURFACES.carbon);
            addTri(out, [xc0 - dir * 0.06, cy, cz], P(boreR, a0, xc0 - dir * 0.06), P(boreR, a1, xc0 - dir * 0.06), BORE, SURFACES.carbon);
          }
          for (let k = 0; k < 6; k++) {
            const a = k / 6 * Math.PI * 2 + 0.4, pr = (boreR * 1.18 + hcR) / 2;
            addBox(out, xc0 + dir * 0.008, cy + pr * Math.cos(a), cz + pr * Math.sin(a), 0.016, 0.014, 0.014, lipC, SURFACES.metal);
          }
        } else for (let i = 0; i < SEG; i++) {
          const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2;
          addTri(out, ctr, [xc0, cy + hcR*Math.cos(a0), cz + hcR*Math.sin(a0)],
                           [xc0, cy + hcR*Math.cos(a1), cz + hcR*Math.sin(a1)], HUBCAP, RS);
        }
        const nutCol = (wheelStyle && wheelStyle.nut) || (tyreStyle && tyreStyle.nut) || NUT;
        const gunNut = (wheelStyle && wheelStyle.gunNut) || (tyreStyle && tyreStyle.gunNut) ? 1 : 0;
        if (blownAxle) {
        } else if (!gunNut) {
          addBox(out, hubX - dir * 0.002, cy, cz, 0.026, Math.max(hcR * 0.55, rimR * 0.12), Math.max(hcR * 0.55, rimR * 0.12), nutCol, SURFACES.metal);
        } else {
          const nx = hubX - dir * 0.001;
          const nR = Math.max(hcR * 0.55, rimR * 0.10);
          const nDeep = 0.018;
          const HEX = 6;
          for (let h = 0; h < HEX; h++) {
            const a0 = (h / HEX) * Math.PI * 2 + Math.PI / HEX;
            const a1 = ((h + 1) / HEX) * Math.PI * 2 + Math.PI / HEX;
            const y0 = cy + nR * Math.cos(a0), z0 = cz + nR * Math.sin(a0);
            const y1 = cy + nR * Math.cos(a1), z1 = cz + nR * Math.sin(a1);
            const xOut = nx + dir * nDeep * 0.5, xIn = nx - dir * nDeep * 0.5;
            addQuad(out,
              [xOut, y0, z0], [xOut, y1, z1], [xIn, y1, z1], [xIn, y0, z0],
              nutCol, SURFACES.metal);
            addTri(out, [xOut, cy, cz], [xOut, y0, z0], [xOut, y1, z1], nutCol, SURFACES.metal);
          }
          const cR0 = nR * 1.15, cR1 = nR * 1.55, cxCol = nx - dir * nDeep * 0.55;
          for (let h = 0; h < 12; h++) {
            const a0 = (h / 12) * Math.PI * 2, a1 = ((h + 1) / 12) * Math.PI * 2;
            const P = (rad, a) => [cxCol, cy + rad * Math.cos(a), cz + rad * Math.sin(a)];
            addQuad(out, P(cR0, a0), P(cR0, a1), P(cR1, a1), P(cR1, a0),
                    [nutCol[0] * 0.75, nutCol[1] * 0.75, nutCol[2] * 0.75], SURFACES.metal);
          }
        }
        const spokeWheel = Math.round((wheelStyle && wheelStyle.spokes) || 0);
        const spokeTyre = Math.round((tyreStyle && tyreStyle.spokes) || 0);
        const spokeReq = Math.max(0, Math.min(8, spokeWheel || spokeTyre));
        const spokeN = useCover ? spokeReq : (spokeReq > 0 ? spokeReq : OPEN_SPOKES);
        for (let k = 0; k < spokeN; k++) {
          const a = (k / spokeN) * Math.PI * 2 + 0.4;
          const uy = Math.cos(a), uz = Math.sin(a), py = -Math.sin(a), pz = Math.cos(a);
          const hw = 0.014, thick = 0.008;
          const ri = hcR * 1.08, ro = rimR * 0.90;
          const xsF = ss[0] + dir * 0.026, xsB = ss[0] + dir * 0.026 - dir * thick;
          const P = (xs, rad, sgn) => [xs, cy + uy * rad + py * hw * sgn, cz + uz * rad + pz * hw * sgn];
          if (spokeSplit) {
            const rm = ri + (ro - ri) * 0.55;
            spokeBlade(xsF, xsB, [rm, a], [ri, a], hw);
            for (const da of [-0.19, 0.19]) spokeBlade(xsF, xsB, [rm, a], [ro, a + da], hw * 0.70);
            continue;
          }
          addQuad(out, P(xsF, ri, 1), P(xsF, ro, 1), P(xsF, ro, -1), P(xsF, ri, -1), HUBCAP, RS);
          addQuad(out, P(xsB, ri, -1), P(xsB, ro, -1), P(xsB, ro, 1), P(xsB, ri, 1), HUBCAP, RS);
          addQuad(out, P(xsF, ri, 1), P(xsF, ro, 1), P(xsB, ro, 1), P(xsB, ri, 1), HUBCAP, RS);
          addQuad(out, P(xsF, ri, -1), P(xsB, ri, -1), P(xsB, ro, -1), P(xsF, ro, -1), HUBCAP, RS);
        }
        function spokeBlade(xsF, xsB, A, B, hw) {
          const ay = cy + A[0] * Math.cos(A[1]), az = cz + A[0] * Math.sin(A[1]);
          const by = cy + B[0] * Math.cos(B[1]), bz = cz + B[0] * Math.sin(B[1]);
          const L = Math.hypot(by - ay, bz - az) || 1, ny = -(bz - az) / L * hw, nz = (by - ay) / L * hw;
          const Q = (xs, py, pz, sg) => [xs, py + ny * sg, pz + nz * sg];
          addQuad(out, Q(xsF, ay, az, 1), Q(xsF, by, bz, 1), Q(xsF, by, bz, -1), Q(xsF, ay, az, -1), HUBCAP, RS);
          addQuad(out, Q(xsB, ay, az, -1), Q(xsB, by, bz, -1), Q(xsB, by, bz, 1), Q(xsB, ay, az, 1), HUBCAP, RS);
          addQuad(out, Q(xsF, ay, az, 1), Q(xsF, by, bz, 1), Q(xsB, by, bz, 1), Q(xsB, ay, az, 1), HUBCAP, RS);
          addQuad(out, Q(xsF, ay, az, -1), Q(xsB, ay, az, -1), Q(xsB, by, bz, -1), Q(xsF, by, bz, -1), HUBCAP, RS);
        }
        if (wheelStyle && wheelStyle.tape) {
          const tr = rimR * 1.02, tc = (wheelStyle.nut) || bandColor;
          for (let k = 0; k < 20; k++) {
            const a0 = (k / 20) * Math.PI * 2, a1 = ((k + 1) / 20) * Math.PI * 2;
            const A = (rad, a) => [ss[0] + dir * 0.010, cy + rad * Math.cos(a), cz + rad * Math.sin(a)];
            addQuad(out, A(tr, a0), A(tr + 0.022, a0), A(tr + 0.022, a1), A(tr, a1), tc, SURFACES.metal);
          }
          const beadR = rimR * 1.01;
          const bx0 = ss[0] + dir * 0.002, bx1 = ss[0] + dir * 0.016;
          for (let k = 0; k < 16; k++) {
            const a0 = (k / 16) * Math.PI * 2, a1 = ((k + 1) / 16) * Math.PI * 2;
            const y0 = cy + beadR * Math.cos(a0), z0 = cz + beadR * Math.sin(a0);
            const y1 = cy + beadR * Math.cos(a1), z1 = cz + beadR * Math.sin(a1);
            addQuad(out, [bx0, y0, z0], [bx1, y0, z0], [bx1, y1, z1], [bx0, y1, z1], tc, SURFACES.metal);
          }
        }
        const dishWheel = Math.round((wheelStyle && wheelStyle.dish) || 0);
        const dishTyre = Math.round((tyreStyle && tyreStyle.dish) || 0);
        const dish = Math.max(0, Math.min(2, dishWheel || dishTyre));
        if (dish > 0 && !(useCover && dish >= 2)) {
          const dr = rimR * (dish === 2 ? 0.80 : 0.88);
          const dxOut = ss[0] + dir * 0.014;
          const dishStep = useCover ? 0.012 * dish : 0.024 * dish;
          const dxIn = ss[0] + dir * (0.014 - dishStep);
          const DISH_SEG = 16;
          for (let k = 0; k < DISH_SEG; k++) {
            const a0 = (k / DISH_SEG) * Math.PI * 2, a1 = ((k + 1) / DISH_SEG) * Math.PI * 2;
            const oy0 = cy + rimR * 0.98 * Math.cos(a0), oz0 = cz + rimR * 0.98 * Math.sin(a0);
            const oy1 = cy + rimR * 0.98 * Math.cos(a1), oz1 = cz + rimR * 0.98 * Math.sin(a1);
            const iy0 = cy + dr * Math.cos(a0), iz0 = cz + dr * Math.sin(a0);
            const iy1 = cy + dr * Math.cos(a1), iz1 = cz + dr * Math.sin(a1);
            if (useCover) {
              addQuad(out,
                [dxOut, oy0, oz0], [dxOut, oy1, oz1], [dxOut, iy1, iz1], [dxOut, iy0, iz0],
                HUBCAP, RS);
              addQuad(out,
                [dxOut, iy0, iz0], [dxOut, iy1, iz1], [dxIn, iy1, iz1], [dxIn, iy0, iz0],
                RC_DEEP, RS);
              addTri(out, [dxIn, cy, cz],
                     [dxIn, iy0, iz0],
                     [dxIn, iy1, iz1], HUBCAP, RS);
            } else {
              const lipInner = rimR * (dish === 2 ? 0.86 : 0.90);
              const ly0 = cy + lipInner * Math.cos(a0), lz0 = cz + lipInner * Math.sin(a0);
              const ly1 = cy + lipInner * Math.cos(a1), lz1 = cz + lipInner * Math.sin(a1);
              addQuad(out,
                [dxOut, oy0, oz0], [dxOut, oy1, oz1], [dxOut, ly1, lz1], [dxOut, ly0, lz0],
                HUBCAP, RS);
              addQuad(out,
                [dxOut, ly0, lz0], [dxOut, ly1, lz1], [dxIn, ly1, lz1], [dxIn, ly0, lz0],
                RC_DEEP, RS);
            }
          }
        }
      }
      {
        const stemA = 0.55, stemR = rimR * 1.04, weightA = stemA + Math.PI;
        const STEM = [0.72, 0.74, 0.78], WEIGHT = [0.90, 0.86, 0.18], DASH = [0.94, 0.90, 0.55];
        for (const ss of [[x0, -1], [x1, 1]]) {
          const dir = ss[1];
          addBox(out, ss[0] + dir * 0.018, cy + stemR * Math.cos(stemA), cz + stemR * Math.sin(stemA),
                 0.014, 0.018, 0.018, STEM, SURFACES.metal);
          addBox(out, ss[0] + dir * 0.008, cy + rimR * 1.01 * Math.cos(weightA), cz + rimR * 1.01 * Math.sin(weightA),
                 0.010, 0.024, 0.016, WEIGHT, SURFACES.metal);
          const xb = ss[0] + dir * 0.007, a0 = 1.20, a1 = 1.55;
          const P = (rad, a) => [xb, cy + rad * Math.cos(a), cz + rad * Math.sin(a)];
          addQuad(out, P(r * 0.78, a0), P(r * 0.78, a1), P(r * 0.70, a1), P(r * 0.70, a0), DASH, SURFACES.rubber);
        }
      }
      const calOut = fixedOut || out;
      const cr = r * 0.78;
      const calA = brakeStyle && brakeStyle.caliperPos || 0;
      const ductMul = brakeStyle && brakeStyle.duct != null ? brakeStyle.duct : 1;
      addBox(calOut, cx, cy + 0.035, cz + r * 0.38,
             w * 0.42, 0.048 * Math.max(0.65, ductMul), 0.062 * Math.max(0.65, ductMul),
             INTAKE, SURFACES.carbon);
      if (caliperColor) {
        const padCol = [caliperColor[0]*0.30, caliperColor[1]*0.30, caliperColor[2]*0.30];
        const calLvl = Math.max(0, Math.min(2, Math.round((brakeStyle && brakeStyle.caliper) || 0)));
        if (calLvl === 0) {
          for (let i = 0; i < 3; i++) {
            const a = calA + (i - 1) * 0.17;
            addBox(calOut, cx, cy + Math.cos(a) * cr, cz + Math.sin(a) * cr,
                   w * 1.06, 0.052, 0.055, caliperColor, SURFACES.metal);
          }
          for (const sgn of [-1, 1])
            addBox(calOut, cx + sgn * (w * 0.52 + 0.006), cy + cr, cz, 0.02, 0.05, 0.11, padCol, SURFACES.metal);
          addBox(calOut, cx, cy + cr + 0.04, cz, w * 1.0, 0.02, 0.10, caliperColor, SURFACES.metal);
        } else {
          const cY = cy + Math.cos(calA) * cr, cZ = cz + Math.sin(calA) * cr;
          const pistons = calLvl === 2 ? 6 : 4;
          const bodyW = w * (calLvl === 2 ? 1.14 : 1.08);
          const bodyH = calLvl === 2 ? 0.078 : 0.068;
          const bodyD = calLvl === 2 ? 0.118 : 0.100;
          addBox(calOut, cx, cY, cZ, bodyW, bodyH, bodyD, caliperColor, SURFACES.metal);
          addBox(calOut, cx, cY, cZ, bodyW * 0.42, bodyH * 0.45, bodyD * 0.55,
                 [0.04, 0.04, 0.05], SURFACES.metal);
          const ty = -Math.sin(calA), tz = Math.cos(calA);
          const span = bodyD * 0.62;
          for (const sgn of [-1, 1]) {
            for (let p = 0; p < pistons; p++) {
              const t = (p / (pistons - 1) - 0.5) * span;
              addBox(calOut, cx + sgn * (w * 0.50 + 0.012), cY + ty * t, cZ + tz * t,
                     0.018, 0.028, 0.028, padCol, SURFACES.metal);
            }
          }
          for (const sgn of [-1, 1])
            addBox(calOut, cx + sgn * (w * 0.52 + 0.006), cY, cZ, 0.016, 0.042, 0.090, padCol, SURFACES.metal);
          const earR = cr - 0.055;
          addBox(calOut, cx, cy + Math.cos(calA) * earR, cz + Math.sin(calA) * earR,
                 w * 0.55, 0.024, 0.040, caliperColor, SURFACES.metal);
          addBox(calOut, cx, cY + 0.048, cZ, 0.014, 0.016, 0.016, [0.55, 0.55, 0.58], SURFACES.metal);
        }
      } else {
        const peek = [0.28, 0.18, 0.12];
        addBox(calOut, cx, cy + Math.cos(calA) * cr, cz + Math.sin(calA) * cr,
               w * 0.88, 0.040, 0.050, peek, SURFACES.metal);
      }
    }

    function buildWheel(w, bandColor, caliperColor, rimColor, grooved, tyreStyle, brakeStyle, wheelStyle, inkColor, rimSurf) {
      const out = { pos: [], nrm: [], col: [], mat: [], idx: [] };
      addWheel(out, 0, 0, 0, 0.34, w || 0.34, bandColor, caliperColor, rimColor,
        grooved, tyreStyle, null, brakeStyle, wheelStyle, inkColor, rimSurf);
      return CarGeometry.weld(out);
    }
    function buildWheelLayers(w, bandColor, caliperColor, rimColor, grooved, tyreStyle, brakeStyle, wheelStyle, inkColor, rimSurf) {
      const rotating = { pos: [], nrm: [], col: [], mat: [], idx: [] };
      const fixed = { pos: [], nrm: [], col: [], mat: [], idx: [] };
      const width = w || 0.34;
      addWheel(rotating, 0, 0, 0, 0.34, width, bandColor, caliperColor, rimColor,
        grooved, tyreStyle, fixed, brakeStyle, wheelStyle, inkColor, rimSurf);
      addSpan(fixed, { z: 0.06, x: 0, y: 0, w: width * 0.72, h: 0.125, t: 0.60 },
                     { z: -0.06, x: 0, y: 0, w: width * 0.66, h: 0.110, t: 0.70 },
              [0.18, 0.18, 0.20], null, SURFACES.metal);
      return { rotating: CarGeometry.weld(rotating), fixed: CarGeometry.weld(fixed) };
    }

    return { addWheel, buildWheel, buildWheelLayers };
  }

  return { create, tints, createGarage, phaseStep, wrapPhase, WHEEL_R };
})();
Object.freeze(CarWheels);
